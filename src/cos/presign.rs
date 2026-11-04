//! COS 请求签名（HMAC-SHA1）：用 STS 临时密钥签出预签名 PUT 链接。
//!
//! 只把 `content-type` 与 `host` 两个头签进去：类型被绑定，签名头尽量少，减少与浏览器实际
//! 请求不一致的风险；文件大小由 STS 策略在服务端强制，不靠这里。
//! 参考：https://cloud.tencent.com/document/product/436/7778

use super::sts::TempCredentials;
use super::to_hex;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use sha1::{Digest, Sha1};

/// COS 的 UrlEncode：字母数字和 `-_.~` 之外的字节都编码成大写十六进制
const COS_ENCODE: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'_').remove(b'.').remove(b'~');

const HEADER_LIST: &str = "content-type;host";

fn enc(s: &str) -> String {
    utf8_percent_encode(s, COS_ENCODE).to_string()
}

fn sha1_hex(s: &str) -> String {
    to_hex(&Sha1::digest(s.as_bytes()))
}

fn hmac_sha1_hex(key: &str, msg: &str) -> String {
    // 注意：第二步 HMAC 的密钥是 SignKey 的十六进制**字符串**，不是原始二进制
    let mut mac = Hmac::<Sha1>::new_from_slice(key.as_bytes()).expect("HMAC 接受任意长度的密钥");
    mac.update(msg.as_bytes());
    to_hex(&mac.finalize().into_bytes())
}

/// `HttpMethod\nUriPathname\nHttpParameters\nHttpHeaders\n`，PUT 没有查询参数
pub fn http_string(key: &str, content_type: &str, host: &str) -> String {
    format!("put\n/{key}\n\ncontent-type={}&host={}\n", enc(content_type), enc(host))
}

/// 预签名 PUT 链接。`base` 形如 `https://桶.cos.地域.myqcloud.com`，`host` 是对应的 Host 头取值
pub fn presign_put(
    creds: &TempCredentials,
    base: &str,
    host: &str,
    key: &str,
    content_type: &str,
    now_secs: i64,
    expire_secs: u64,
) -> String {
    let key_time = format!("{now_secs};{}", now_secs + expire_secs as i64);
    let sign_key = hmac_sha1_hex(&creds.secret_key, &key_time);
    let string_to_sign = format!(
        "sha1\n{key_time}\n{}\n",
        sha1_hex(&http_string(key, content_type, host))
    );
    let signature = hmac_sha1_hex(&sign_key, &string_to_sign);
    // 各参数值按官方要求 URL 编码（`;` → `%3B`）；临时令牌附在链接上，不参与签名
    format!(
        "{base}/{key}?q-sign-algorithm=sha1&q-ak={}&q-sign-time={kt}&q-key-time={kt}\
         &q-header-list={}&q-url-param-list=&q-signature={signature}&x-cos-security-token={}",
        enc(&creds.secret_id),
        enc(HEADER_LIST),
        enc(&creds.token),
        kt = enc(&key_time),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "moment/2026/11/0123456789abcdef0123456789abcdef.jpg";
    const HOST: &str = "ryu2u-1305537946.cos.ap-nanjing.myqcloud.com";

    fn creds() -> TempCredentials {
        TempCredentials {
            secret_id: "AKIDtmpSecretId0123456789".into(),
            secret_key: "tmpSecretKey0123456789abcdef".into(),
            token: "TOKEN+/=abc.def-ghi_jkl".into(),
        }
    }

    #[test]
    fn sha1_matches_the_official_example() {
        // 官方「请求签名」文档示例里的 HttpString 与它的 SHA1
        let http_string = "get\n/exampleobject(腾讯云)\n\
            response-cache-control=max-age%3D600&response-content-type=application%2Foctet-stream\n\
            date=Thu%2C%2016%20May%202019%2006%3A55%3A53%20GMT&host=examplebucket-1250000000.cos.ap-beijing.myqcloud.com\n";
        assert_eq!(sha1_hex(http_string), "54ecfe22f59d3514fdc764b87a32d8133ea611e6");
    }

    #[test]
    fn url_encode_follows_the_cos_rules() {
        assert_eq!(enc("image/jpeg"), "image%2Fjpeg");
        assert_eq!(enc("content-type;host"), "content-type%3Bhost");
        assert_eq!(enc("127.0.0.1:18080"), "127.0.0.1%3A18080");
        assert_eq!(enc("a b,c~d_e-f.g"), "a%20b%2Cc~d_e-f.g");
        assert_eq!(enc("TOKEN+/="), "TOKEN%2B%2F%3D");
    }

    #[test]
    fn http_string_binds_content_type_and_host() {
        assert_eq!(
            http_string(KEY, "image/png", "127.0.0.1:18080"),
            "put\n/moment/2026/11/0123456789abcdef0123456789abcdef.jpg\n\ncontent-type=image%2Fpng&host=127.0.0.1%3A18080\n"
        );
    }

    #[test]
    fn matches_the_python_reference_implementation() {
        // 黄金值由 Python 标准库独立算出（假临时密钥，见计划文档附录）
        let url = presign_put(&creds(), &format!("https://{HOST}"), HOST, KEY, "image/jpeg", 1_793_700_000, 300);
        assert_eq!(
            url,
            format!(
                "https://{HOST}/{KEY}?q-sign-algorithm=sha1&q-ak=AKIDtmpSecretId0123456789\
                 &q-sign-time=1793700000%3B1793700300&q-key-time=1793700000%3B1793700300\
                 &q-header-list=content-type%3Bhost&q-url-param-list=\
                 &q-signature=ca86037b3507a4241128702b43796db9ffa263d5\
                 &x-cos-security-token=TOKEN%2B%2F%3Dabc.def-ghi_jkl"
            )
        );
        // 中间量也核对一遍，出错时更容易定位是哪一步
        assert_eq!(hmac_sha1_hex("tmpSecretKey0123456789abcdef", "1793700000;1793700300"), "6f5b692e43e20e9b2678bb6db01847fe462627c4");
        assert_eq!(sha1_hex(&http_string(KEY, "image/jpeg", HOST)), "e3592331c0bc05ce0d9cb5a5d87fe751b2cd227d");
    }

    #[test]
    fn loopback_host_with_port_matches_the_python_reference() {
        let url = presign_put(&creds(), "http://127.0.0.1:18080", "127.0.0.1:18080", KEY, "image/png", 1_793_700_000, 300);
        assert!(url.starts_with(&format!("http://127.0.0.1:18080/{KEY}?")), "{url}");
        assert!(url.contains("&q-signature=d3e8421fcc0e4be10bfc236b6f2f786f8b89febd&"), "{url}");
    }

    #[test]
    fn signature_depends_on_type_host_key_and_time() {
        let base = |ct: &str, host: &str, key: &str, now: i64| {
            presign_put(&creds(), "https://x", host, key, ct, now, 300)
                .split("q-signature=")
                .nth(1)
                .unwrap()
                .split('&')
                .next()
                .unwrap()
                .to_string()
        };
        let reference = base("image/jpeg", HOST, KEY, 1_793_700_000);
        assert_ne!(reference, base("image/png", HOST, KEY, 1_793_700_000));
        assert_ne!(reference, base("image/jpeg", "evil.example.com", KEY, 1_793_700_000));
        assert_ne!(reference, base("image/jpeg", HOST, "moment/other.jpg", 1_793_700_000));
        assert_ne!(reference, base("image/jpeg", HOST, KEY, 1_793_700_001));
        assert_eq!(reference, base("image/jpeg", HOST, KEY, 1_793_700_000));
    }

    #[test]
    fn expiry_window_follows_the_configured_seconds() {
        let url = presign_put(&creds(), "https://x", HOST, KEY, "image/jpeg", 1000, 120);
        assert!(url.contains("q-sign-time=1000%3B1120&q-key-time=1000%3B1120"), "{url}");
    }
}
