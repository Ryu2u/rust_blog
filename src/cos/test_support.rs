//! 测试用的进程内模拟：同一个端口上既是 STS（`POST /`），又是 COS（`PUT /{key}`）。
//!
//! 验签逻辑在这里**独立再写一遍**，不复用 sts.rs / presign.rs 里的函数——这样「链接签错了」
//! 「请求头和签名对不上」「STS 请求的 Content-Type 带了多余的 charset」这类问题才会被发现。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use hmac::{Hmac, Mac};
use percent_encoding::percent_decode_str;
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256};

use super::CosConfig;

pub const SECRET_ID: &str = "AKIDmockPermanentId";
pub const SECRET_KEY: &str = "mockPermanentSecretKey";
pub const BUCKET: &str = "ryu2u-1305537946";
pub const REGION: &str = "ap-nanjing";
const TMP_ID: &str = "AKIDmockTmpId0123";
const TMP_KEY: &str = "mockTmpSecretKey0123";
const TMP_TOKEN: &str = "MOCK+TOKEN/=0123";

#[derive(Default)]
pub struct MockState {
    /// 每次 STS 调用收到的策略（已 urldecode 的 JSON 文本）
    pub policies: Mutex<Vec<String>>,
    /// 为 true 时 STS 返回业务错误
    pub sts_fail: AtomicBool,
    /// COS 收到且验签通过的对象键
    pub stored: Mutex<Vec<String>>,
}

type Shared = Arc<MockState>;

/// 起一个模拟服务，返回 (状态, 根地址 `http://127.0.0.1:端口`)
pub async fn start_mock() -> (Shared, String) {
    let state: Shared = Arc::default();
    let data = web::Data::new(state.clone());
    let server = HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/", web::post().to(sts_handler))
            .route("/{key:.*}", web::put().to(cos_handler))
    })
    .workers(1)
    .bind(("127.0.0.1", 0))
    .expect("bind mock");
    let port = server.addrs()[0].port();
    actix_web::rt::spawn(server.run());
    (state, format!("http://127.0.0.1:{port}"))
}

/// STS 与 COS 都指向模拟服务的配置（公开地址仍是真实桶域名，方便断言 public_url）
pub fn test_config(base: &str) -> CosConfig {
    let vars: HashMap<&str, String> = HashMap::from([
        ("COS_SECRET_ID", SECRET_ID.to_string()),
        ("COS_SECRET_KEY", SECRET_KEY.to_string()),
        ("COS_BUCKET", BUCKET.to_string()),
        ("COS_REGION", REGION.to_string()),
        ("COS_STS_ENDPOINT", base.to_string()),
        ("COS_UPLOAD_BASE", base.to_string()),
    ]);
    CosConfig::from_lookup(&|name| vars.get(name).cloned()).expect("测试配置应当合法").0
}

// ---------- 独立的小工具 ----------

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hmac256(key: &[u8], msg: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).unwrap();
    mac.update(msg.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn hmac1_hex(key: &str, msg: &str) -> String {
    let mut mac = Hmac::<Sha1>::new_from_slice(key.as_bytes()).unwrap();
    mac.update(msg.as_bytes());
    hex(&mac.finalize().into_bytes())
}

/// 字母数字和 -_.~ 原样，其余字节 %XX（大写）
fn cos_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn header(req: &HttpRequest, name: &str) -> String {
    req.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("").to_string()
}

// ---------- 模拟 STS ----------

fn expected_authorization(host: &str, ts: i64, body: &str) -> String {
    let date = chrono::DateTime::<chrono::Utc>::from_timestamp(ts, 0).unwrap().format("%Y-%m-%d").to_string();
    let canonical = format!(
        "POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:{host}\nx-tc-action:getfederationtoken\n\n\
         content-type;host;x-tc-action\n{}",
        hex(&Sha256::digest(body.as_bytes()))
    );
    let scope = format!("{date}/sts/tc3_request");
    let string_to_sign = format!(
        "TC3-HMAC-SHA256\n{ts}\n{scope}\n{}",
        hex(&Sha256::digest(canonical.as_bytes()))
    );
    let k = hmac256(format!("TC3{SECRET_KEY}").as_bytes(), &date);
    let k = hmac256(&k, "sts");
    let k = hmac256(&k, "tc3_request");
    format!(
        "TC3-HMAC-SHA256 Credential={SECRET_ID}/{scope}, SignedHeaders=content-type;host;x-tc-action, Signature={}",
        hex(&hmac256(&k, &string_to_sign))
    )
}

fn sts_error(code: &str, message: &str) -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "Response": { "Error": { "Code": code, "Message": message }, "RequestId": "mock-request-id" }
    }))
}

async fn sts_handler(state: web::Data<Shared>, req: HttpRequest, body: web::Bytes) -> HttpResponse {
    if state.sts_fail.load(Ordering::SeqCst) {
        return sts_error("AuthFailure.SecretIdNotFound", "mock: 按要求失败");
    }
    let body = String::from_utf8(body.to_vec()).expect("utf8 body");
    let ts: i64 = header(&req, "x-tc-timestamp").parse().unwrap_or(0);
    let checks = [
        (header(&req, "content-type") == "application/json; charset=utf-8", "Content-Type 必须逐字等于签名时的值"),
        (header(&req, "x-tc-action") == "GetFederationToken", "X-TC-Action"),
        (header(&req, "x-tc-version") == "2018-08-13", "X-TC-Version"),
        (header(&req, "x-tc-region") == REGION, "X-TC-Region"),
        (
            header(&req, "authorization") == expected_authorization(&header(&req, "host"), ts, &body),
            "Authorization 签名不匹配",
        ),
    ];
    if let Some((_, what)) = checks.iter().find(|(good, _)| !good) {
        return sts_error("AuthFailure.SignatureFailure", &format!("mock: {what}"));
    }
    let parsed: Value = serde_json::from_str(&body).expect("json body");
    if parsed["Name"] != "momentupload" || parsed["DurationSeconds"] != 1800 {
        return sts_error("InvalidParameter", "mock: Name / DurationSeconds 不对");
    }
    let policy = percent_decode_str(parsed["Policy"].as_str().unwrap_or_default())
        .decode_utf8()
        .expect("policy utf8")
        .to_string();
    state.policies.lock().unwrap().push(policy);
    HttpResponse::Ok().json(json!({
        "Response": {
            "ExpiredTime": ts + 1800,
            "Credentials": { "Token": TMP_TOKEN, "TmpSecretId": TMP_ID, "TmpSecretKey": TMP_KEY },
            "RequestId": "mock-request-id"
        }
    }))
}

// ---------- 模拟 COS ----------

fn parse_query(raw: &str) -> HashMap<String, String> {
    raw.split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(k, v)| (k.to_string(), percent_decode_str(v).decode_utf8_lossy().to_string()))
        .collect()
}

/// 按 COS 文档重新验签：用同一把临时密钥，Content-Type 与 Host 取自**实际收到的请求头**
async fn cos_handler(
    state: web::Data<Shared>,
    req: HttpRequest,
    path: web::Path<String>,
    _body: web::Bytes,
) -> HttpResponse {
    let key = path.into_inner();
    let q = parse_query(req.query_string());
    let get = |name: &str| q.get(name).cloned().unwrap_or_default();

    let key_time = get("q-sign-time");
    let http_string = format!(
        "put\n/{key}\n\ncontent-type={}&host={}\n",
        cos_encode(&header(&req, "content-type")),
        cos_encode(&header(&req, "host"))
    );
    let sign_key = hmac1_hex(TMP_KEY, &key_time);
    let string_to_sign = format!("sha1\n{key_time}\n{}\n", hex(&sha1::Sha1::digest(http_string.as_bytes())));
    let expected = hmac1_hex(&sign_key, &string_to_sign);

    let good = get("q-sign-algorithm") == "sha1"
        && get("q-ak") == TMP_ID
        && get("q-key-time") == key_time
        && get("q-header-list") == "content-type;host"
        && q.get("q-url-param-list").map(String::as_str) == Some("")
        && get("x-cos-security-token") == TMP_TOKEN
        && get("q-signature") == expected;
    if !good {
        return HttpResponse::Forbidden().body("SignatureDoesNotMatch");
    }
    state.stored.lock().unwrap().push(key);
    HttpResponse::Ok().finish()
}
