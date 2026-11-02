//! 环境变量解析的小工具。解析逻辑与「读环境」分开，便于单元测试。
use std::env;
use tracing::log::warn;

/// 解析正整数；非数字或为 0 返回 None。
pub fn parse_positive(raw: &str) -> Option<u64> {
    raw.trim().parse::<u64>().ok().filter(|n| *n > 0)
}

/// 解析布尔开关：`true` / `1` / `yes` / `on`（不分大小写）为真，其余为假。
pub fn parse_flag(raw: Option<&str>) -> bool {
    matches!(
        raw.map(|v| v.trim().to_ascii_lowercase()).as_deref(),
        Some("true" | "1" | "yes" | "on")
    )
}

/// 读取正整数环境变量：未设置或留空用默认值；设置了但非法则回退默认值并记一条 warn。
pub fn env_positive(name: &str, default: u64) -> u64 {
    match env::var(name) {
        Ok(raw) if !raw.trim().is_empty() => parse_positive(&raw).unwrap_or_else(|| {
            warn!("环境变量 {} 的值 {:?} 不是正整数，已回退默认值 {}", name, raw, default);
            default
        }),
        _ => default,
    }
}

/// 读取布尔开关环境变量。
pub fn env_flag(name: &str) -> bool {
    parse_flag(env::var(name).ok().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_positive_accepts_only_positive_integers() {
        assert_eq!(parse_positive("15"), Some(15));
        assert_eq!(parse_positive(" 7 "), Some(7));
        assert_eq!(parse_positive("0"), None);
        assert_eq!(parse_positive("-3"), None);
        assert_eq!(parse_positive("abc"), None);
        assert_eq!(parse_positive(""), None);
    }

    #[test]
    fn parse_flag_is_case_insensitive_and_defaults_to_false() {
        for v in ["true", "TRUE", " True ", "1", "yes", "on"] {
            assert!(parse_flag(Some(v)), "{v:?} 应为真");
        }
        for v in ["false", "0", "no", "off", "", "maybe"] {
            assert!(!parse_flag(Some(v)), "{v:?} 应为假");
        }
        assert!(!parse_flag(None));
    }
}
