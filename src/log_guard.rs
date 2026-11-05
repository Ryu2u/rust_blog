//! 源码扫描测试：防止 `#[instrument]` 把数据库连接（含密码）写进日志。
//!
//! `web::Data<RBatis>` 的 `Debug` 会输出完整的连接配置，包括数据库用户名和密码；而 `#[instrument]`
//! 默认用 `Debug` 记录所有参数。所以任何接收 `RBatis` 的函数，它的 `#[instrument]` 都必须跳过那个参数
//! （`skip(db)`、`skip(db, cos)` 或 `skip_all`）。新增接口时漏掉，这里的测试会失败，并指出文件和行号。
//!
//! 带密码的请求体类型（`User`、`LoginDto`、`Post`）不靠这里：它们的 `Debug` 是手写脱敏的。

use std::fs;
use std::path::{Path, PathBuf};

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("读取目录失败") {
        let path = entry.expect("读取目录项失败").path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// 取出 `fn` 之后第一对圆括号里的参数列表（按括号配对）。
/// 属性行（如 `#[get("/get/{id}")]`）里的花括号不影响：先定位 `fn `，再找括号。
fn param_list(text: &str) -> Option<&str> {
    let after_fn = &text[text.find("fn ")?..];
    let open = after_fn.find('(')?;
    let mut depth = 0i32;
    for (i, c) in after_fn[open..].char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&after_fn[open + 1..open + i]);
                }
            }
            _ => {}
        }
    }
    None
}

/// 按顶层逗号切分（忽略 `<>`、`()`、`[]` 里的逗号）
fn split_top_level(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let (mut depth, mut start) = (0i32, 0usize);
    for (i, c) in s.char_indices() {
        match c {
            '<' | '(' | '[' => depth += 1,
            '>' | ')' | ']' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    parts.push(&s[start..]);
    parts
}

/// `#[instrument(...)]` 是否跳过了名为 `name` 的参数（`skip_all` 也算）
fn skips(attr: &str, name: &str) -> bool {
    if attr.contains("skip_all") {
        return true;
    }
    let Some(start) = attr.find("skip(") else { return false };
    let inner = &attr[start + "skip(".len()..];
    let Some(end) = inner.find(')') else { return false };
    inner[..end].split(',').any(|n| n.trim() == name)
}

/// 扫一份源码文本，返回（`#[instrument` 的个数，违规描述列表）
fn scan(label: &str, text: &str) -> (usize, Vec<String>) {
    let lines: Vec<&str> = text.lines().collect();
    let (mut sites, mut violations) = (0usize, Vec::new());
    for (i, line) in lines.iter().enumerate() {
        let attr = line.trim_start();
        if !attr.starts_with("#[instrument") {
            continue;
        }
        sites += 1;
        // 签名：往下最多 20 行拼在一起，再取 `fn` 后的参数列表
        let following = lines[i + 1..].iter().take(20).map(|l| l.trim()).collect::<Vec<_>>().join(" ");
        let Some(params) = param_list(&following) else {
            violations.push(format!("{label}:{}: 找不到函数签名，无法检查 #[instrument]", i + 1));
            continue;
        };
        for param in split_top_level(params) {
            if !param.contains("RBatis") {
                continue;
            }
            let name = param.split(':').next().unwrap_or("").trim().trim_start_matches("mut ").trim();
            if !skips(attr, name) {
                violations.push(format!(
                    "{label}:{}: 参数 `{name}` 是 RBatis，#[instrument] 必须 skip 它（写成 skip({name})），否则数据库密码会进日志",
                    i + 1
                ));
            }
        }
    }
    (sites, violations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instrument_never_logs_the_database_handle() {
        let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let mut files = Vec::new();
        rust_files(&src, &mut files);
        let (mut sites, mut violations) = (0usize, Vec::new());
        for f in &files {
            let text = fs::read_to_string(f).expect("读取源码失败");
            let label = f.strip_prefix(&src).unwrap_or(f).display().to_string();
            let (n, v) = scan(&label, &text);
            sites += n;
            violations.extend(v);
        }
        // 扫描本身要真的扫到东西，否则路径写错了也会「通过」
        assert!(files.len() > 5, "只扫到 {} 个源文件，路径不对？", files.len());
        assert!(sites > 0, "没扫到任何 #[instrument]，扫描逻辑坏了？");
        assert!(violations.is_empty(), "发现会把数据库密码写进日志的 #[instrument]：\n{}", violations.join("\n"));
    }

    // ---- 扫描器自身 ----

    #[test]
    fn scanner_flags_unskipped_database_handle() {
        // 属性行里的 `{id}` 花括号不能影响签名解析
        let bad = "#[instrument]\n#[get(\"/get/{id}\")]\nasync fn f(id: web::Path<i32>, db: web::Data<RBatis>) -> R {}\n";
        let (sites, v) = scan("x.rs", bad);
        assert_eq!(sites, 1);
        assert_eq!(v.len(), 1, "{v:?}");
        assert!(v[0].contains("x.rs:1") && v[0].contains("`db`"), "{v:?}");
    }

    #[test]
    fn scanner_flags_skip_that_forgets_the_database_handle() {
        // 真实出过的漏洞：只 skip 了 cos，漏了 db
        let bad = "#[instrument(skip(cos))]\nasync fn f(db: web::Data<RBatis>, cos: web::Data<Option<CosConfig>>) -> R {}\n";
        assert_eq!(scan("x.rs", bad).1.len(), 1);
    }

    #[test]
    fn scanner_accepts_proper_skips() {
        for ok in [
            "#[instrument(skip(db))]\nasync fn f(db: web::Data<RBatis>) -> R {}\n",
            "#[instrument(skip(db, cos))]\nasync fn f(db: web::Data<RBatis>, cos: web::Data<Option<CosConfig>>) -> R {}\n",
            "#[instrument(skip(cos, db))]\nasync fn f(db: web::Data<RBatis>, cos: web::Data<Option<CosConfig>>) -> R {}\n",
            "#[instrument(skip_all)]\nasync fn f(db: web::Data<RBatis>) -> R {}\n",
            "#[instrument(skip(cos))]\nasync fn f(req: web::Json<Req>, cos: web::Data<Option<CosConfig>>) -> R {}\n",
            "#[instrument]\nasync fn f(id: web::Path<i32>) -> R {}\n",
            "#[instrument(skip(db))]\nasync fn f(\n    id: web::Path<i32>,\n    db: web::Data<RBatis>,\n) -> R {}\n",
            "#[instrument(skip(db))]\nasync fn f(mut db: web::Data<RBatis>) -> R {}\n",
        ] {
            let (sites, v) = scan("x.rs", ok);
            assert_eq!(sites, 1);
            assert!(v.is_empty(), "不该报：{ok:?} -> {v:?}");
        }
    }

    #[test]
    fn scanner_ignores_text_that_is_not_an_attribute() {
        let (sites, v) = scan("x.rs", "// #[instrument] 只是注释\nlet s = \"#[instrument]\";\n");
        assert_eq!((sites, v.len()), (0, 0));
    }
}
