//! 登录相关的纯辅助逻辑：入参校验、密码校验、日志净化、Cookie 构造。
use crate::config::Exception;
use crate::utils::env_conf::env_flag;
use crate::utils::jwt_utils::AUTH_COOKIE_NAME;
use actix_web::cookie::{time::Duration, Cookie, SameSite};
use std::sync::OnceLock;

pub const USERNAME_MAX_CHARS: usize = 64;
pub const PASSWORD_MAX_CHARS: usize = 128;

/// 登录入参校验：用户名非空且 ≤ 64 字符，密码非空且 ≤ 128 字符。
pub fn validate_login_input(username: &str, password: &str) -> Result<(), Exception> {
    if username.trim().is_empty() || password.is_empty() {
        return Err(Exception::BadRequest("请输入用户名和密码".to_string()));
    }
    if username.chars().count() > USERNAME_MAX_CHARS || password.chars().count() > PASSWORD_MAX_CHARS {
        return Err(Exception::BadRequest("用户名或密码过长".to_string()));
    }
    Ok(())
}

/// 常量时间比较：长度不同也走满较长一方的循环，只泄露「是否相等」。
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    let n = a.len().max(b.len());
    let mut diff = u8::from(a.len() != b.len());
    for i in 0..n {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        diff |= x ^ y;
    }
    std::hint::black_box(diff) == 0
}

/// 写进日志的用户名：去掉控制字符（防日志注入）并截断到 64 个字符。
pub fn sanitize_for_log(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(64).collect()
}

pub fn is_bcrypt_hash(s: &str) -> bool {
    s.starts_with("$2b$") || s.starts_with("$2a$") || s.starts_with("$2y$")
}

static DUMMY_HASH: OnceLock<String> = OnceLock::new();

/// 一个固定的假 bcrypt 哈希，首次使用时按 `DEFAULT_COST` 生成。
/// 用户名不存在时拿它做一次等价的 `bcrypt::verify`，使响应时间与「用户存在、密码错误」接近。
pub fn dummy_bcrypt_hash() -> &'static str {
    DUMMY_HASH
        .get_or_init(|| bcrypt::hash("dummy-password-for-timing", bcrypt::DEFAULT_COST).unwrap_or_default())
        .as_str()
}

/// 对假哈希做一次校验并丢弃结果（仅为消耗与真实校验相同的时间）。
pub fn burn_dummy_verify(password: &str) {
    let _ = bcrypt::verify(password, dummy_bcrypt_hash());
}

#[derive(Debug, PartialEq, Eq)]
pub enum PasswordCheck {
    /// `upgrade_needed`：库里还是旧明文密码，登录成功后应升级为 bcrypt
    Valid { upgrade_needed: bool },
    Invalid,
}

/// 校验密码：bcrypt 哈希走 `bcrypt::verify`；否则按旧明文密码做常量时间比较。
pub fn check_password(stored: &str, input: &str) -> PasswordCheck {
    if is_bcrypt_hash(stored) {
        if bcrypt::verify(input, stored).unwrap_or(false) {
            PasswordCheck::Valid { upgrade_needed: false }
        } else {
            PasswordCheck::Invalid
        }
    } else if ct_eq(stored.as_bytes(), input.as_bytes()) {
        PasswordCheck::Valid { upgrade_needed: true }
    } else {
        PasswordCheck::Invalid
    }
}

/// 登录 Cookie 是否加 `Secure`（上 HTTPS 时通过 `COOKIE_SECURE=true` 开启），进程内只读一次。
pub fn cookie_secure() -> bool {
    static SECURE: OnceLock<bool> = OnceLock::new();
    *SECURE.get_or_init(|| env_flag("COOKIE_SECURE"))
}

/// 登录 Cookie：HttpOnly + SameSite=Lax，`Max-Age` 与 JWT 有效期一致，使 Cookie 与令牌同时失效。
pub fn auth_cookie(token: &str, max_age_hours: i64, secure: bool) -> Cookie<'static> {
    Cookie::build(AUTH_COOKIE_NAME, token.to_owned())
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::hours(max_age_hours))
        .secure(secure)
        .finish()
}

/// 退出登录时清除 Cookie：属性必须与签发时一致，浏览器才会认作同一个 Cookie。
pub fn clear_auth_cookie(secure: bool) -> Cookie<'static> {
    Cookie::build(AUTH_COOKIE_NAME, "")
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(0))
        .secure(secure)
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_login_input_enforces_presence_and_length() {
        assert!(validate_login_input("alice", "pw").is_ok());
        for (u, p) in [("", "pw"), ("   ", "pw"), ("alice", "")] {
            assert!(
                matches!(validate_login_input(u, p), Err(Exception::BadRequest(_))),
                "{u:?}/{p:?} 应被拒绝"
            );
        }
        let max_name = "a".repeat(USERNAME_MAX_CHARS);
        let max_pwd = "p".repeat(PASSWORD_MAX_CHARS);
        assert!(validate_login_input(&max_name, &max_pwd).is_ok());
        assert!(validate_login_input(&format!("{max_name}x"), "pw").is_err());
        assert!(validate_login_input("alice", &format!("{max_pwd}x")).is_err());
    }

    #[test]
    fn length_limits_count_characters_not_bytes() {
        let cjk_pwd = "密".repeat(PASSWORD_MAX_CHARS);
        assert!(validate_login_input("alice", &cjk_pwd).is_ok(), "128 个汉字应该放行");
        assert!(validate_login_input("alice", &format!("{cjk_pwd}密")).is_err());
    }

    #[test]
    fn ct_eq_matches_plain_equality() {
        assert!(ct_eq(b"secret", b"secret"));
        assert!(ct_eq(b"", b""));
        assert!(!ct_eq(b"secret", b"secreT"));
        assert!(!ct_eq(b"secret", b"secret!"), "长度不同必须不相等");
        assert!(!ct_eq(b"secret!", b"secret"));
        assert!(!ct_eq(b"", b"x"));
    }

    #[test]
    fn sanitize_for_log_strips_control_chars_and_truncates() {
        assert_eq!(sanitize_for_log("ab\ncd\r\x1b[31mef"), "abcd[31mef");
        assert_eq!(sanitize_for_log(&"x".repeat(100)).chars().count(), 64);
        assert_eq!(sanitize_for_log("正常用户名"), "正常用户名");
    }

    #[test]
    fn bcrypt_hash_detection() {
        assert!(is_bcrypt_hash("$2b$12$abcdefghijklmnopqrstuv"));
        assert!(is_bcrypt_hash("$2a$10$x"));
        assert!(is_bcrypt_hash("$2y$10$x"));
        assert!(!is_bcrypt_hash("plain-password"));
        assert!(!is_bcrypt_hash(""));
    }

    #[test]
    fn bcrypt_password_is_verified_without_upgrade() {
        let stored = bcrypt::hash("s3cret", 4).unwrap();
        assert_eq!(check_password(&stored, "s3cret"), PasswordCheck::Valid { upgrade_needed: false });
        assert_eq!(check_password(&stored, "wrong"), PasswordCheck::Invalid);
    }

    #[test]
    fn legacy_plaintext_password_is_valid_and_flagged_for_upgrade() {
        assert_eq!(check_password("legacy-pw", "legacy-pw"), PasswordCheck::Valid { upgrade_needed: true });
        assert_eq!(check_password("legacy-pw", "legacy-px"), PasswordCheck::Invalid);
        assert_eq!(check_password("legacy-pw", ""), PasswordCheck::Invalid);
    }

    #[test]
    fn malformed_bcrypt_value_is_invalid_not_a_panic() {
        assert_eq!(check_password("$2b$garbage", "x"), PasswordCheck::Invalid);
    }

    #[test]
    fn dummy_hash_is_a_valid_stable_bcrypt_hash() {
        let first = dummy_bcrypt_hash();
        assert!(is_bcrypt_hash(first));
        assert!(std::ptr::eq(first, dummy_bcrypt_hash()), "只生成一次");
        burn_dummy_verify("anything"); // 不 panic 即可
    }

    #[test]
    fn auth_cookie_has_expected_attributes() {
        let c = auth_cookie("tok", 12, true);
        assert_eq!(c.name(), "auth_token");
        assert_eq!(c.value(), "tok");
        assert_eq!(c.path(), Some("/"));
        assert_eq!(c.http_only(), Some(true));
        assert_eq!(c.secure(), Some(true));
        assert_eq!(c.same_site(), Some(SameSite::Lax));
        assert_eq!(c.max_age(), Some(Duration::hours(12)));
        assert_ne!(auth_cookie("tok", 12, false).secure(), Some(true), "未开启时不能带 Secure");
    }

    #[test]
    fn clear_cookie_expires_immediately_with_same_scope() {
        let c = clear_auth_cookie(false);
        assert_eq!(c.value(), "");
        assert_eq!(c.path(), Some("/"));
        assert_eq!(c.max_age(), Some(Duration::seconds(0)));
        assert_eq!(c.http_only(), Some(true));
    }
}
