//! SQL 日志脱敏：替换 rbatis 默认的 `LogInterceptor`。
//!
//! rbatis 默认的日志拦截器会把每条 SQL 的**全部绑定参数**打印出来，其中包括写进 `tb_user.password` 的
//! bcrypt 哈希（新增 / 修改用户、旧账号登录后自动升级）、`post.password`（文章口令）、
//! `note_sync_config.ai_api_key`（密文）等。这里的拦截器打印格式与原来完全一致，只是对绑定到敏感列的参数打码，
//! 其余 SQL 日志不变。
//!
//! 识别敏感参数的两层规则（见 [`masked_flags`]）：
//! 1. 按列名：`col = ?` 形式的赋值 / 比较，以及 `insert into t (cols) values (...)` 里对应列的占位符，
//!    列名在 [`SENSITIVE_COLUMNS`] 里就打码；
//! 2. 兜底：任何形如 bcrypt 哈希的字符串参数，不管它绑定到哪一列。
//!
//! 查询结果只打印行数，**永远不打印行内容**：rbatis 原实现在 `debug_mode` 特性下会打印整行，
//! 而 `select * from tb_user` 会把密码列一起带出来。

use std::fmt::{self, Display, Formatter};

use rbatis::executor::Executor;
use rbatis::intercept::{Intercept, ResultType};
use rbatis::rbdc::db::ExecResult;
use rbatis::Error;
use rbs::Value;
use tracing::info;

/// 绑定到这些列的参数一律打码（不区分大小写、忽略表前缀和反引号）。新增敏感列时加在这里。
pub const SENSITIVE_COLUMNS: [&str; 3] = ["password", "salt", "ai_api_key"];

const MASK: &str = "***";

fn is_sensitive_column(name: &str) -> bool {
    let name = name.trim().trim_matches('`');
    let name = name.rsplit('.').next().unwrap_or(name).trim_matches('`');
    SENSITIVE_COLUMNS.iter().any(|c| name.eq_ignore_ascii_case(c))
}

/// bcrypt 哈希：60 个字符，`$2a$` / `$2b$` / `$2x$` / `$2y$` 开头
fn looks_like_bcrypt(v: &Value) -> bool {
    let Value::String(s) = v else { return false };
    let b = s.as_bytes();
    b.len() == 60 && b.starts_with(b"$2") && matches!(b[2], b'a' | b'b' | b'x' | b'y') && b[3] == b'$'
}

/// 逐字符扫描 `?` 占位符，跳过单引号、双引号、反引号里的内容。返回每个占位符的字节位置。
fn placeholders(sql: &str) -> Vec<usize> {
    let mut out = Vec::new();
    let mut quote: Option<char> = None;
    for (i, c) in sql.char_indices() {
        match quote {
            Some(q) => {
                if c == q {
                    quote = None;
                }
            }
            None => match c {
                '\'' | '"' | '`' => quote = Some(c),
                '?' => out.push(i),
                _ => {}
            },
        }
    }
    out
}

/// 占位符前面紧挨着 `col =` 时返回 `col`（可带表前缀 / 反引号）；`<=`、`>=`、`!=` 等不算
fn column_before(sql: &str, pos: usize) -> Option<&str> {
    let before = sql[..pos].trim_end().strip_suffix('=')?.trim_end();
    let mut start = before.len();
    for (i, c) in before.char_indices().rev() {
        if c.is_alphanumeric() || matches!(c, '_' | '`' | '.') {
            start = i;
        } else {
            break;
        }
    }
    let ident = &before[start..];
    (!ident.is_empty()).then_some(ident)
}

/// 按顶层逗号切分，忽略括号和引号里的逗号
fn split_top_level(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let (mut depth, mut start) = (0i32, 0usize);
    let mut quote: Option<char> = None;
    for (i, c) in s.char_indices() {
        match quote {
            Some(q) => {
                if c == q {
                    quote = None;
                }
            }
            None => match c {
                '\'' | '"' | '`' => quote = Some(c),
                '(' => depth += 1,
                ')' => depth -= 1,
                ',' if depth == 0 => {
                    parts.push(&s[start..i]);
                    start = i + 1;
                }
                _ => {}
            },
        }
    }
    parts.push(&s[start..]);
    parts
}

/// `insert into t (a,b) values (?,?),(?,?)`：返回敏感列对应的占位符序号（从 0 起，按出现顺序）。
/// VALUES 里可以混有字面量（`values (1,?,?)`），按「第几项对应第几列」来对齐。
fn insert_sensitive_positions(sql: &str) -> Vec<usize> {
    let lower = sql.to_ascii_lowercase(); // 只改 ASCII，字节位置不变
    if !lower.trim_start().starts_with("insert") {
        return Vec::new();
    }
    let Some(open) = sql.find('(') else { return Vec::new() };
    let Some(close) = sql[open..].find(')').map(|i| open + i) else { return Vec::new() };
    let cols: Vec<&str> = sql[open + 1..close].split(',').map(str::trim).collect();
    let Some(values_at) = lower[close..].find("values").map(|i| close + i + "values".len()) else {
        return Vec::new();
    };
    let rest = &sql[values_at..];

    let mut out = Vec::new();
    let mut n = 0usize; // 全局占位符序号
    let (mut depth, mut group_start) = (0i32, 0usize);
    let mut quote: Option<char> = None;
    for (i, c) in rest.char_indices() {
        match quote {
            Some(q) => {
                if c == q {
                    quote = None;
                }
            }
            None => match c {
                '\'' | '"' | '`' => quote = Some(c),
                '(' => {
                    if depth == 0 {
                        group_start = i + 1;
                    }
                    depth += 1;
                }
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        for (j, item) in split_top_level(&rest[group_start..i]).into_iter().enumerate() {
                            let count = placeholders(item).len();
                            if count > 0 && cols.get(j).is_some_and(|c| is_sensitive_column(c)) {
                                out.extend(n..n + count);
                            }
                            n += count;
                        }
                    }
                }
                _ => {}
            },
        }
    }
    out
}

/// 这条 SQL 里敏感列对应的占位符序号
fn sensitive_positions(sql: &str) -> Vec<usize> {
    let lower = sql.to_ascii_lowercase();
    if !SENSITIVE_COLUMNS.iter().any(|c| lower.contains(c)) {
        return Vec::new(); // 快速路径：绝大多数 SQL 不涉及敏感列
    }
    let mut out = insert_sensitive_positions(sql);
    for (n, pos) in placeholders(sql).into_iter().enumerate() {
        if column_before(sql, pos).is_some_and(is_sensitive_column) {
            out.push(n);
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// 每个绑定参数是否要打码（与 `args` 等长）
pub fn masked_flags(sql: &str, args: &[Value]) -> Vec<bool> {
    let positions = sensitive_positions(sql);
    args.iter()
        .enumerate()
        .map(|(i, v)| positions.contains(&i) || looks_like_bcrypt(v))
        .collect()
}

/// 与 rbatis 原来的 `RbsValueDisplay` 同样的格式：`[a,b,c]`，字符串带引号；打码的参数显示成 `"***"`
struct RedactedArgs<'a> {
    args: &'a [Value],
    masked: Vec<bool>,
}

impl<'a> RedactedArgs<'a> {
    fn new(sql: &str, args: &'a [Value]) -> Self {
        Self { args, masked: masked_flags(sql, args) }
    }
}

impl Display for RedactedArgs<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        f.write_str("[")?;
        for (i, v) in self.args.iter().enumerate() {
            if i > 0 {
                f.write_str(",")?;
            }
            if self.masked[i] {
                write!(f, "\"{MASK}\"")?;
            } else {
                Display::fmt(v, f)?;
            }
        }
        f.write_str("]")
    }
}

/// 替换 rbatis 默认 `LogInterceptor` 的日志拦截器：INFO 级，格式与原来一致，敏感参数打码，
/// 查询结果只打印行数。
#[derive(Debug, Default)]
pub struct RedactingLogInterceptor;

#[rbatis::async_trait]
impl Intercept for RedactingLogInterceptor {
    async fn before(
        &self,
        task_id: i64,
        _rb: &dyn Executor,
        sql: &mut String,
        args: &mut Vec<Value>,
        _result: ResultType<&mut Result<ExecResult, Error>, &mut Result<Vec<Value>, Error>>,
    ) -> Result<Option<bool>, Error> {
        info!("[rbatis] [{}] => `{}` {}", task_id, sql, RedactedArgs::new(sql, args));
        Ok(Some(true))
    }

    async fn after(
        &self,
        task_id: i64,
        _rb: &dyn Executor,
        _sql: &mut String,
        _args: &mut Vec<Value>,
        result: ResultType<&mut Result<ExecResult, Error>, &mut Result<Vec<Value>, Error>>,
    ) -> Result<Option<bool>, Error> {
        match result {
            ResultType::Exec(Ok(r)) => info!("[rbatis] [{}] <= rows_affected={}", task_id, r),
            ResultType::Query(Ok(rows)) => info!("[rbatis] [{}] <= len={}", task_id, rows.len()),
            ResultType::Exec(Err(e)) => info!("[rbatis] [{}] <= {}", task_id, e),
            ResultType::Query(Err(e)) => info!("[rbatis] [{}] <= {}", task_id, e),
        }
        Ok(Some(true))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &str) -> Value {
        Value::String(v.to_string())
    }

    /// 一个真实形状的 bcrypt 哈希（60 位）
    fn hash() -> String {
        format!("$2b$12${}", "a".repeat(53))
    }

    fn flags(sql: &str, args: Vec<Value>) -> Vec<bool> {
        masked_flags(sql, &args)
    }

    #[test]
    fn insert_masks_the_password_column() {
        let sql = "insert into tb_user (username,password,nick_name,gender,created_time,locked,role) VALUES (?,?,?,?,?,?,?)";
        let args = vec![s("alice"), s(&hash()), s("A"), Value::I32(1), Value::I64(0), Value::I32(0), s("user")];
        assert_eq!(flags(sql, args), vec![false, true, false, false, false, false, false]);
    }

    #[test]
    fn update_by_column_masks_the_password_column() {
        // rbatis 的 update_by_column 生成的形状
        let sql = "update tb_user set username=?,password=?,nick_name=?,gender=?,locked=?,role=? where id = ?";
        let args = vec![s("alice"), s("legacy-plain-password"), s("A"), Value::I32(1), Value::I32(0), s("user"), Value::I32(7)];
        assert_eq!(flags(sql, args), vec![false, true, false, false, false, false, false]);
    }

    #[test]
    fn legacy_login_upgrade_masks_the_new_hash() {
        let sql = "update tb_user set password = ? where id = ?";
        assert_eq!(flags(sql, vec![s(&hash()), Value::I32(7)]), vec![true, false]);
    }

    #[test]
    fn where_password_is_masked_too() {
        let sql = "select * from tb_user where username = ? and password = ?";
        assert_eq!(flags(sql, vec![s("alice"), s("plain")]), vec![false, true]);
    }

    #[test]
    fn unrelated_sql_is_untouched() {
        assert_eq!(flags("select * from tb_user where username = ?", vec![s("alice")]), vec![false]);
        assert_eq!(flags("select * from post where id = ?", vec![Value::I32(1)]), vec![false]);
        assert_eq!(flags("select count(*) from post", vec![]), Vec::<bool>::new());
    }

    #[test]
    fn post_password_and_ai_key_are_masked() {
        let sql = "insert into post (title,author,password,visits) VALUES (?,?,?,?)";
        assert_eq!(flags(sql, vec![s("t"), s("a"), s("post-pass"), Value::I32(0)]), vec![false, false, true, false]);
        let sql = "update note_sync_config set ai_enabled=?,ai_base_url=?,ai_model=?,ai_api_key=? where id = ?";
        let args = vec![Value::I32(1), s("https://x"), s("m"), s("ciphertext"), Value::I32(1)];
        assert_eq!(flags(sql, args), vec![false, false, false, true, false]);
    }

    #[test]
    fn batch_insert_masks_every_row() {
        let sql = "insert into tb_user (username,password) VALUES (?,?),(?,?)";
        assert_eq!(flags(sql, vec![s("a"), s("p1"), s("b"), s("p2")]), vec![false, true, false, true]);
    }

    #[test]
    fn insert_with_literals_keeps_columns_aligned() {
        // VALUES 里混有字面量：第 2 项才是 password，但它是第 1 个占位符
        let sql = "insert into t (a,password,b) VALUES (1,?,?)";
        assert_eq!(flags(sql, vec![s("secret"), s("x")]), vec![true, false]);
    }

    #[test]
    fn placeholders_inside_quotes_are_not_counted() {
        let sql = "update tb_user set nick_name = 'why?' , password = ? where id = ?";
        assert_eq!(flags(sql, vec![s("secret"), Value::I32(1)]), vec![true, false]);
    }

    #[test]
    fn table_prefix_case_and_backticks_are_handled() {
        assert_eq!(flags("UPDATE tb_user t SET t.PASSWORD = ? WHERE t.id = ?", vec![s("x"), Value::I32(1)]), vec![true, false]);
        assert_eq!(flags("update tb_user set `password` = ? where id = ?", vec![s("x"), Value::I32(1)]), vec![true, false]);
    }

    #[test]
    fn similar_column_names_are_not_masked() {
        let sql = "update t set password_hint = ?, my_password = ? where id = ?";
        assert_eq!(flags(sql, vec![s("a"), s("b"), Value::I32(1)]), vec![false, false, false]);
    }

    #[test]
    fn bcrypt_shaped_values_are_masked_whatever_the_column() {
        let sql = "update foo set pwd_digest = ? where id = ?";
        assert_eq!(flags(sql, vec![s(&hash()), Value::I32(1)]), vec![true, false]);
        // 只是长得像：长度不对 / 前缀不对 / 不是字符串，都不打码
        assert_eq!(flags(sql, vec![s("$2b$12$short"), Value::I32(1)]), vec![false, false]);
        assert_eq!(flags(sql, vec![s(&"a".repeat(60)), Value::I32(1)]), vec![false, false]);
        assert_eq!(flags(sql, vec![s(&format!("$3b$12${}", "a".repeat(53))), Value::I32(1)]), vec![false, false]);
    }

    #[test]
    fn display_matches_rbatis_format_with_masked_values() {
        let sql = "insert into tb_user (username,password,nick_name,gender) VALUES (?,?,?,?)";
        let args = vec![s("probe_user"), s(&hash()), s("p"), Value::I32(1)];
        let shown = RedactedArgs::new(sql, &args).to_string();
        assert_eq!(shown, r#"["probe_user","***","p",1]"#);
        assert!(!shown.contains("$2b$"));
        // 没有敏感参数时与原格式完全一致
        let args = vec![s("alice"), Value::I32(3)];
        assert_eq!(RedactedArgs::new("select * from tb_user where username = ? and id = ?", &args).to_string(), r#"["alice",3]"#);
        assert_eq!(RedactedArgs::new("select 1", &[]).to_string(), "[]");
    }

    /// 默认的 LogInterceptor 会把绑定参数原样打进日志，不能被换回去
    #[actix_web::test]
    async fn init_rbatis_installs_the_redacting_interceptor_only() {
        let rb = crate::config::init_rbatis("mysql://u:p@127.0.0.1:1/none?charset=utf8mb4".to_string()).await;
        assert!(rb.get_intercept::<RedactingLogInterceptor>().is_some(), "应安装脱敏日志拦截器");
        assert!(
            rb.get_intercept::<rbatis::intercept_log::LogInterceptor>().is_none(),
            "不能再有 rbatis 默认的 LogInterceptor"
        );
    }
}
