//! 提取并归一化客户端 IP，供登录限频使用。
use crate::utils::env_conf::env_flag;
use actix_web::HttpRequest;
use std::net::{IpAddr, Ipv6Addr};
use std::sync::OnceLock;

/// IPv4 原样；IPv4 映射的 IPv6 当作 IPv4；其余 IPv6 归并到 /64 前缀
/// （同一网段内换地址不能绕过限频）。
pub fn normalize_ip(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return v4.to_string();
            }
            let s = v6.segments();
            format!("{}/64", Ipv6Addr::new(s[0], s[1], s[2], s[3], 0, 0, 0, 0))
        }
    }
}

/// 纯函数版本，便于测试。
/// `trust_proxy_header` 为 false 时一律忽略 `X-Forwarded-For`（它可以被客户端伪造）；
/// 为 true 时取**最右一项**：那是我们自己的反向代理追加的、可信的真实客户端 IP。
pub fn resolve_client_ip(
    peer: Option<IpAddr>,
    forwarded_for: Option<&str>,
    trust_proxy_header: bool,
) -> String {
    if trust_proxy_header {
        let rightmost = forwarded_for
            .and_then(|raw| raw.split(',').map(str::trim).filter(|s| !s.is_empty()).last());
        if let Some(ip) = rightmost.and_then(|s| s.parse::<IpAddr>().ok()) {
            return normalize_ip(ip);
        }
    }
    peer.map(normalize_ip).unwrap_or_else(|| "unknown".to_string())
}

/// 从请求里取客户端 IP。`TRUST_PROXY_HEADER` 只在进程启动后读取一次。
pub fn client_ip(req: &HttpRequest) -> String {
    static TRUST: OnceLock<bool> = OnceLock::new();
    let trust = *TRUST.get_or_init(|| env_flag("TRUST_PROXY_HEADER"));
    // 可能有多行 X-Forwarded-For 头：全部拼起来，最右一项仍是最后追加的
    let joined = req
        .headers()
        .get_all("x-forwarded-for")
        .filter_map(|v| v.to_str().ok())
        .collect::<Vec<_>>()
        .join(",");
    let forwarded = if joined.is_empty() { None } else { Some(joined.as_str()) };
    resolve_client_ip(req.peer_addr().map(|a| a.ip()), forwarded, trust)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn untrusted_mode_ignores_forwarded_header() {
        let got = resolve_client_ip(Some(ip("203.0.113.9")), Some("1.2.3.4"), false);
        assert_eq!(got, "203.0.113.9");
    }

    #[test]
    fn trusted_mode_uses_rightmost_entry() {
        let got = resolve_client_ip(Some(ip("10.0.0.1")), Some("1.1.1.1, 2.2.2.2, 3.3.3.3"), true);
        assert_eq!(got, "3.3.3.3");
        // 客户端自己塞的假地址在最左边，代理追加的真实地址在最右边
        let spoofed = resolve_client_ip(Some(ip("10.0.0.1")), Some("9.9.9.9, 5.5.5.5"), true);
        assert_eq!(spoofed, "5.5.5.5");
    }

    #[test]
    fn trusted_mode_tolerates_whitespace_and_trailing_comma() {
        assert_eq!(resolve_client_ip(None, Some("  3.3.3.3  "), true), "3.3.3.3");
        assert_eq!(resolve_client_ip(None, Some("1.1.1.1,3.3.3.3,"), true), "3.3.3.3");
    }

    #[test]
    fn trusted_mode_falls_back_to_peer_when_header_missing_or_garbage() {
        assert_eq!(resolve_client_ip(Some(ip("10.0.0.7")), None, true), "10.0.0.7");
        assert_eq!(resolve_client_ip(Some(ip("10.0.0.7")), Some("not-an-ip"), true), "10.0.0.7");
        assert_eq!(resolve_client_ip(Some(ip("10.0.0.7")), Some(""), true), "10.0.0.7");
    }

    #[test]
    fn missing_peer_maps_to_unknown() {
        assert_eq!(resolve_client_ip(None, None, false), "unknown");
    }

    #[test]
    fn ipv6_is_bucketed_by_slash_64() {
        let a = resolve_client_ip(Some(ip("2001:db8:abcd:12::1")), None, false);
        let b = resolve_client_ip(Some(ip("2001:db8:abcd:12:ffff::99")), None, false);
        assert_eq!(a, "2001:db8:abcd:12::/64");
        assert_eq!(a, b, "同一 /64 内换地址必须落入同一个桶");
        let other = resolve_client_ip(Some(ip("2001:db8:abcd:13::1")), None, false);
        assert_ne!(a, other);
    }

    #[test]
    fn ipv4_mapped_ipv6_is_treated_as_ipv4() {
        assert_eq!(normalize_ip(ip("::ffff:1.2.3.4")), "1.2.3.4");
    }
}
