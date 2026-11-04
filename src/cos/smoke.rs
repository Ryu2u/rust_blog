//! 真实腾讯云 STS / COS 联调冒烟测试。默认不跑，**没有用户明确同意不要跑**。
//!
//! 它会用 `.env` 里的真实 `COS_*` 密钥：向 STS 申请 3 份临时密钥，并在真实的桶里写入 **1 个**
//! 70 字节的 PNG（对象键会打印出来；子账号没有删除权限，需要时到控制台手动删。如果第 ③ 步的
//! 大小限制没有生效，会多写 1 个）。用来确认设计文档 §13 里标为「未核实」的几点：
//!
//! 1. `Policy` 在 JSON 请求体里单次 urlencode 能被 STS 接受；
//! 2. `cos:content-length` / `cos:content-type` 条件在服务端真的生效；
//! 3. 签进链接的 Content-Type 被篡改时 COS 拒绝；
//! 4. STS 失败响应的结构（本测试不制造失败，失败时看打印出来的错误）。
//!
//! 运行（在项目根目录，`.env` 里已配置 COS_*）。必须带 `COS_SMOKE_CONFIRM=yes`，否则测试直接拒绝；
//! 不要运行不带过滤条件的 `cargo test -- --ignored`，那会把它也带上：
//!
//! ```text
//! COS_SMOKE_CONFIRM=yes cargo test cos_real_smoke -- --ignored --nocapture
//! ```
//!
//! 桶的 CORS 只影响浏览器，这里的服务端请求测不到它，要靠后台页面真实上传一次来验证。

use super::{issue_upload, CosConfig};
use base64::Engine;

/// 1×1 像素的 PNG
const PNG_BASE64: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

#[actix_web::test]
#[ignore = "会调用真实的腾讯云 STS 并写入真实的桶：需要 .env 里的 COS_* 和用户的明确同意"]
async fn cos_real_smoke() {
    assert_eq!(
        std::env::var("COS_SMOKE_CONFIRM").as_deref(),
        Ok("yes"),
        "这个测试会写入真实的桶：确认要跑的话，加上 COS_SMOKE_CONFIRM=yes"
    );
    // 让 STS 失败时的腾讯云错误码 / RequestId（issue_upload 写在 error 日志里）出现在 --nocapture 的输出里
    let _ = tracing_subscriber::fmt().with_max_level(tracing::Level::WARN).with_test_writer().try_init();
    dotenv::dotenv().ok();
    let cfg = CosConfig::from_env().expect("需要在 .env 里配置完整的 COS_*");
    let png = base64::engine::general_purpose::STANDARD.decode(PNG_BASE64).expect("base64");
    let client = reqwest::Client::new();
    let put = |url: String, content_type: &'static str, body: Vec<u8>| {
        let client = client.clone();
        async move {
            client.put(url).header("Content-Type", content_type).body(body).send().await.expect("PUT").status()
        }
    };

    // ① 正常上传：STS 接受 Policy，COS 接受链接
    let grant = issue_upload(&cfg, "image/png", png.len() as i64).await.expect("向 STS 申请授权失败");
    println!("① 授权成功，对象键: {}", grant.public_url);
    let status = put(grant.upload_url.clone(), "image/png", png.clone()).await;
    assert_eq!(status, 200, "① 正常上传应当成功");

    // ② 对象已经能通过公开地址读到，内容一致
    let got = client.get(&grant.public_url).send().await.expect("GET");
    assert_eq!(got.status(), 200, "② 桶应当是公有读");
    assert_eq!(got.bytes().await.expect("body").as_ref(), png.as_slice(), "② 内容应当一致");
    println!("② 公开地址读取成功");

    // ③ 声明 10 字节、实际传更多 → 应当被策略里的 cos:content-length 条件拒绝
    let small = issue_upload(&cfg, "image/png", 10).await.expect("授权");
    let status = put(small.upload_url, "image/png", png.clone()).await;
    assert_eq!(status, 403, "③ 超出声明大小的上传应当被拒绝（content-length 条件）");
    println!("③ 超出声明大小被拒绝: {status}");

    // ④ 签的是 image/png，却以 image/jpeg 上传 → 签名不匹配被拒绝
    let typed = issue_upload(&cfg, "image/png", png.len() as i64).await.expect("授权");
    let status = put(typed.upload_url, "image/jpeg", png.clone()).await;
    assert_eq!(status, 403, "④ 篡改 Content-Type 应当被拒绝");
    println!("④ 篡改 Content-Type 被拒绝: {status}");

    println!("全部通过。留在桶里的测试对象: {}", grant.public_url);
}
