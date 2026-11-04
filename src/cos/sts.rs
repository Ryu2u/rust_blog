//! 腾讯云 STS `GetFederationToken`：用永久密钥换一份受策略限制的临时密钥。
//!
//! 请求按「API 3.0 签名方法 v3」（TC3-HMAC-SHA256）签名。几个容易踩的坑：
//! - 签名里的日期必须是时间戳换算出的 **UTC** 日期；
//! - `Content-Type` 必须和实际发送的逐字相同。`reqwest` 的 `.json()` 发的是不带 `charset` 的
//!   `application/json`，所以这里显式设置 `application/json; charset=utf-8` 并以字符串发送请求体；
//! - 服务器时钟与标准时间相差超过 5 分钟，腾讯云一定拒绝（签名过期）。

use super::{to_hex, CosConfig};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use sha2::{Digest, Sha256};
use std::fmt;

pub const CONTENT_TYPE: &str = "application/json; charset=utf-8";
const SERVICE: &str = "sts";
const ACTION: &str = "GetFederationToken";
const VERSION: &str = "2018-08-13";
/// 联合身份名称，官方要求只含字母
const POLICY_NAME: &str = "momentupload";

/// 一份临时密钥。只活在一次请求的内存里，Debug 不输出内容
#[derive(Clone)]
pub struct TempCredentials {
    pub secret_id: String,
    pub secret_key: String,
    pub token: String,
}

impl fmt::Debug for TempCredentials {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("TempCredentials").finish_non_exhaustive()
    }
}

#[derive(Debug)]
pub enum StsError {
    /// 网络层失败（连不上、超时）
    Transport(String),
    /// 腾讯云返回了业务错误
    Api { code: String, message: String, request_id: String },
    /// 响应不是预期的结构
    Malformed(String),
}

impl fmt::Display for StsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StsError::Transport(e) => write!(f, "STS 请求失败: {e}"),
            StsError::Api { code, message, request_id } => {
                write!(f, "STS 返回错误: code={code} message={message} request_id={request_id}")
            }
            StsError::Malformed(e) => write!(f, "STS 响应无法解析: {e}"),
        }
    }
}

// ---------- TC3-HMAC-SHA256 ----------

fn hmac_sha256(key: &[u8], msg: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC 接受任意长度的密钥");
    mac.update(msg.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

pub fn sha256_hex(s: &str) -> String {
    to_hex(&Sha256::digest(s.as_bytes()))
}

/// 时间戳（秒）换算成 UTC 日期 `YYYY-MM-DD`
pub fn utc_date(timestamp: i64) -> String {
    DateTime::<Utc>::from_timestamp(timestamp, 0)
        .unwrap_or_default()
        .format("%Y-%m-%d")
        .to_string()
}

/// 规范请求串。POST、路径固定 `/`、无查询串；签名头固定为 content-type / host / x-tc-action
pub fn canonical_request(host: &str, action: &str, body: &str) -> String {
    format!(
        "POST\n/\n\ncontent-type:{CONTENT_TYPE}\nhost:{host}\nx-tc-action:{}\n\ncontent-type;host;x-tc-action\n{}",
        action.to_lowercase(),
        sha256_hex(body)
    )
}

/// 完整的 `Authorization` 头
pub fn tc3_authorization(
    secret_id: &str,
    secret_key: &str,
    service: &str,
    host: &str,
    action: &str,
    timestamp: i64,
    body: &str,
) -> String {
    let date = utc_date(timestamp);
    let scope = format!("{date}/{service}/tc3_request");
    let string_to_sign = format!(
        "TC3-HMAC-SHA256\n{timestamp}\n{scope}\n{}",
        sha256_hex(&canonical_request(host, action, body))
    );
    let secret_date = hmac_sha256(format!("TC3{secret_key}").as_bytes(), &date);
    let secret_service = hmac_sha256(&secret_date, service);
    let secret_signing = hmac_sha256(&secret_service, "tc3_request");
    let signature = to_hex(&hmac_sha256(&secret_signing, &string_to_sign));
    format!(
        "TC3-HMAC-SHA256 Credential={secret_id}/{scope}, SignedHeaders=content-type;host;x-tc-action, Signature={signature}"
    )
}

// ---------- 请求与响应 ----------

/// 请求体。`Policy` 按官方要求做 urlencode（服务端会 urldecode）
pub fn request_body(policy: &str) -> String {
    serde_json::json!({
        "Name": POLICY_NAME,
        "Policy": utf8_percent_encode(policy, NON_ALPHANUMERIC).to_string(),
        "DurationSeconds": super::STS_DURATION_SECS,
    })
    .to_string()
}

/// 解析响应。腾讯云的业务错误也是 HTTP 200，错误在 `Response.Error` 里
pub fn parse_response(text: &str) -> Result<TempCredentials, StsError> {
    let v: serde_json::Value =
        serde_json::from_str(text).map_err(|e| StsError::Malformed(format!("不是合法的 JSON: {e}")))?;
    let resp = &v["Response"];
    if let Some(err) = resp.get("Error") {
        let text_of = |x: &serde_json::Value| x.as_str().unwrap_or_default().to_string();
        return Err(StsError::Api {
            code: text_of(&err["Code"]),
            message: text_of(&err["Message"]),
            request_id: text_of(&resp["RequestId"]),
        });
    }
    let creds = &resp["Credentials"];
    let field = |name: &str| {
        creds[name]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(String::from)
            .ok_or_else(|| StsError::Malformed(format!("缺少 Credentials.{name}")))
    };
    Ok(TempCredentials {
        secret_id: field("TmpSecretId")?,
        secret_key: field("TmpSecretKey")?,
        token: field("Token")?,
    })
}

/// 调 `GetFederationToken`。`now_secs` 由调用方给，便于测试
pub async fn get_federation_token(
    client: &reqwest::Client,
    cfg: &CosConfig,
    policy: &str,
    now_secs: i64,
) -> Result<TempCredentials, StsError> {
    let body = request_body(policy);
    let authorization = tc3_authorization(
        &cfg.secret_id,
        &cfg.secret_key,
        SERVICE,
        &cfg.sts_host,
        ACTION,
        now_secs,
        &body,
    );
    let resp = client
        .post(format!("{}/", cfg.sts_endpoint))
        .header("Authorization", authorization)
        .header("Content-Type", CONTENT_TYPE)
        .header("X-TC-Action", ACTION)
        .header("X-TC-Version", VERSION)
        .header("X-TC-Region", &cfg.region)
        .header("X-TC-Timestamp", now_secs.to_string())
        .body(body)
        .send()
        .await
        .map_err(|e| StsError::Transport(e.to_string()))?;
    let text = resp.text().await.map_err(|e| StsError::Transport(e.to_string()))?;
    parse_response(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 官方文档「签名方法 v3」里的 CVM 示例请求体（反斜杠 u 是字面量）
    const OFFICIAL_BODY: &str =
        r#"{"Limit": 1, "Filters": [{"Values": ["\u672a\u547d\u540d"], "Name": "instance-name"}]}"#;
    const OFFICIAL_TS: i64 = 1551113065;

    #[test]
    fn matches_the_official_key_free_intermediates() {
        // 官方文档给出的、不依赖密钥的两个中间值
        assert_eq!(
            sha256_hex(OFFICIAL_BODY),
            "35e9c5b0e3ae67532d3c9f17ead6c90222632e5b1ff7f6e89887f1398934f064"
        );
        let canonical = canonical_request("cvm.tencentcloudapi.com", "DescribeInstances", OFFICIAL_BODY);
        assert_eq!(
            canonical,
            "POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:cvm.tencentcloudapi.com\n\
             x-tc-action:describeinstances\n\ncontent-type;host;x-tc-action\n\
             35e9c5b0e3ae67532d3c9f17ead6c90222632e5b1ff7f6e89887f1398934f064"
        );
        assert_eq!(
            sha256_hex(&canonical),
            "7019a55be8395899b900fb5564e4200d984910f34794a27cb3fb7d10ff6a1e84"
        );
        assert_eq!(utc_date(OFFICIAL_TS), "2019-02-25");
    }

    #[test]
    fn authorization_matches_the_python_reference() {
        // 密钥相关的部分：用 Python 标准库独立实现算出的黄金值（假密钥，见计划文档附录）
        let auth = tc3_authorization(
            "AKIDtestSecretId0123456789",
            "testSecretKey0123456789abcdef",
            "cvm",
            "cvm.tencentcloudapi.com",
            "DescribeInstances",
            OFFICIAL_TS,
            OFFICIAL_BODY,
        );
        assert_eq!(
            auth,
            "TC3-HMAC-SHA256 Credential=AKIDtestSecretId0123456789/2019-02-25/cvm/tc3_request, \
             SignedHeaders=content-type;host;x-tc-action, \
             Signature=831a09f9d8940c7cca19f27b600d095dfbd507968f40338ad9ecd9a4b60ed8f9"
        );
    }

    #[test]
    fn credential_date_is_utc_not_local() {
        // 2026-11-04 17:00:00 UTC = 北京时间 2026-11-05 01:00，凭证日期必须仍是 11-04
        let ts = 1_793_811_600;
        assert_eq!(utc_date(ts), "2026-11-04");
        let auth = tc3_authorization(
            "AKIDtestSecretId0123456789",
            "testSecretKey0123456789abcdef",
            "sts",
            "sts.tencentcloudapi.com",
            "GetFederationToken",
            ts,
            r#"{"Name":"momentupload"}"#,
        );
        assert!(auth.contains("/2026-11-04/sts/tc3_request"), "{auth}");
        assert!(auth.ends_with("Signature=85c09b36d548b3e211c216402dab80aaf4a2a65adc4a4f09393568f0d2dab6b3"), "{auth}");
    }

    #[test]
    fn request_body_url_encodes_the_policy_once() {
        let policy = r#"{"version":"2.0","a":"x y/z"}"#;
        let body: serde_json::Value = serde_json::from_str(&request_body(policy)).unwrap();
        assert_eq!(body["Name"], "momentupload");
        assert_eq!(body["DurationSeconds"], 1800);
        let encoded = body["Policy"].as_str().unwrap();
        assert!(!encoded.contains('{') && !encoded.contains('"') && !encoded.contains(' '), "{encoded}");
        let decoded = percent_encoding::percent_decode_str(encoded).decode_utf8().unwrap();
        assert_eq!(decoded, policy);
    }

    #[test]
    fn parses_a_successful_response() {
        let text = r#"{"Response":{"ExpiredTime":1543914376,"Expiration":"2018-12-04T09:06:16Z",
            "Credentials":{"Token":"TOK","TmpSecretId":"TID","TmpSecretKey":"TKEY"},"RequestId":"r-1"}}"#;
        let c = parse_response(text).unwrap();
        assert_eq!((c.secret_id.as_str(), c.secret_key.as_str(), c.token.as_str()), ("TID", "TKEY", "TOK"));
        assert!(!format!("{c:?}").contains("TKEY"));
    }

    #[test]
    fn parses_an_api_error() {
        let text = r#"{"Response":{"Error":{"Code":"AuthFailure.SignatureExpire","Message":"expired"},"RequestId":"r-2"}}"#;
        match parse_response(text) {
            Err(StsError::Api { code, message, request_id }) => {
                assert_eq!((code.as_str(), message.as_str(), request_id.as_str()), ("AuthFailure.SignatureExpire", "expired", "r-2"));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn rejects_malformed_responses() {
        for text in [
            "not json",
            "{}",
            r#"{"Response":{}}"#,
            r#"{"Response":{"Credentials":{"Token":"T","TmpSecretId":"I"}}}"#,
            r#"{"Response":{"Credentials":{"Token":"","TmpSecretId":"I","TmpSecretKey":"K"}}}"#,
        ] {
            assert!(matches!(parse_response(text), Err(StsError::Malformed(_))), "{text}");
        }
    }

    #[test]
    fn error_display_has_no_credentials() {
        let e = StsError::Api { code: "C".into(), message: "M".into(), request_id: "R".into() };
        assert_eq!(e.to_string(), "STS 返回错误: code=C message=M request_id=R");
    }
}
