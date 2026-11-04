//! 腾讯云 COS 图片直传：后端只负责发「临时授权」，文件字节不经过后端。
//!
//! 一次授权的流程：校验类型与大小 → 生成随机对象键 → 用永久密钥调 STS，换一份「只能写这一个对象」
//! 的临时密钥 → 用临时密钥签出预签名 PUT 链接 → 把链接交给浏览器。
//! 设计与取舍见 docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md。

pub mod presign;
pub mod sts;
#[cfg(test)]
pub mod test_support;
pub mod validate;

use crate::config::Exception;
use crate::utils::env_conf::parse_positive;
use crate::utils::time_utils::get_sys_time;
use chrono::{Datelike, FixedOffset, TimeZone};
use serde::Serialize;
use std::fmt;
use std::time::Duration;
use tracing::{error, info, warn};

/// 允许上传的图片类型 → 对象键扩展名。扩展名只由这里映射，绝不使用客户端给的文件名。
pub const IMAGE_TYPES: [(&str, &str); 4] = [
    ("image/jpeg", "jpg"),
    ("image/png", "png"),
    ("image/gif", "gif"),
    ("image/webp", "webp"),
];

const DEFAULT_PREFIX: &str = "moment/";
const DEFAULT_MAX_MB: u64 = 5;
const DEFAULT_SIGN_EXPIRE_SECS: u64 = 300;
/// STS 临时密钥的有效期（官方允许的默认/最小值）；预签名链接不可能比它更长
pub const STS_DURATION_SECS: u64 = 1800;
const DEFAULT_STS_ENDPOINT: &str = "https://sts.tencentcloudapi.com";
/// 对象键里的年月按东八区取（与说说发布时间的惯例一致）
const TZ_OFFSET_SECS: i32 = 8 * 3600;
const STS_TIMEOUT_SECS: u64 = 15;

// ---------- 配置 ----------

#[derive(Clone)]
pub struct CosConfig {
    /// CAM 子账号的永久密钥，只用来调 STS
    pub secret_id: String,
    pub secret_key: String,
    pub bucket: String,
    pub region: String,
    /// 桶名最后一个 `-` 之后的数字
    pub appid: String,
    /// 返回给前端的公开地址前缀，不带末尾 `/`
    pub public_base: String,
    /// 对象键前缀：以 `/` 结尾、不以 `/` 开头、只含 `[A-Za-z0-9._/-]`
    pub upload_prefix: String,
    pub max_image_bytes: u64,
    pub sign_expire_secs: u64,
    /// STS 根地址（默认腾讯云；仅测试时指向本机模拟）
    pub sts_endpoint: String,
    pub sts_host: String,
    /// 浏览器 PUT 的根地址（默认桶域名；仅测试时指向本机模拟）
    pub upload_base: String,
    pub upload_host: String,
}

/// 手写 Debug：密钥一律输出 `***`，避免被 `#[instrument]` 或日志带出去
impl fmt::Debug for CosConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CosConfig")
            .field("secret_id", &"***")
            .field("secret_key", &"***")
            .field("bucket", &self.bucket)
            .field("region", &self.region)
            .field("public_base", &self.public_base)
            .field("upload_prefix", &self.upload_prefix)
            .field("max_image_bytes", &self.max_image_bytes)
            .finish_non_exhaustive()
    }
}

impl CosConfig {
    /// 读环境变量。未配置或配置不合法返回 None（功能关闭），并在日志里说明原因。
    pub fn from_env() -> Option<CosConfig> {
        match Self::from_lookup(&|name| std::env::var(name).ok()) {
            Ok((cfg, warnings)) => {
                for w in warnings {
                    warn!("{w}");
                }
                info!(
                    "COS 图片上传已启用：bucket={} region={} prefix={}",
                    cfg.bucket, cfg.region, cfg.upload_prefix
                );
                Some(cfg)
            }
            Err(reason) => {
                warn!("COS 图片上传未启用：{reason}（后台将无法上传说说图片，已有图片不受影响）");
                None
            }
        }
    }

    /// 从「名字 → 值」的查询函数解析配置，便于单元测试（不碰进程环境）。
    /// 成功时一并返回需要告警的回退说明；失败时返回功能关闭的原因。
    pub fn from_lookup(
        get: &dyn Fn(&str) -> Option<String>,
    ) -> Result<(CosConfig, Vec<String>), String> {
        let var = |name: &str| get(name).map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        let required = |name: &str| var(name).ok_or_else(|| format!("缺少 {name}"));
        let mut warnings = Vec::new();

        let secret_id = required("COS_SECRET_ID")?;
        let secret_key = required("COS_SECRET_KEY")?;
        let bucket = required("COS_BUCKET")?;
        let region = required("COS_REGION")?;
        let appid = parse_appid(&bucket)?;
        if !is_label(&region) {
            return Err(format!("COS_REGION={region} 不合法（只允许小写字母、数字和 -）"));
        }

        let default_base = format!("https://{bucket}.cos.{region}.myqcloud.com");
        let public_base = match var("COS_PUBLIC_BASE") {
            None => default_base.clone(),
            Some(raw) => normalize_public_base(&raw)?,
        };
        let upload_prefix = match var("COS_UPLOAD_PREFIX") {
            None => DEFAULT_PREFIX.to_string(),
            Some(raw) => normalize_prefix(&raw)?,
        };
        let max_mb = match var("COS_MAX_IMAGE_MB") {
            None => DEFAULT_MAX_MB,
            Some(raw) => parse_positive(&raw).unwrap_or_else(|| {
                warnings.push(format!("COS_MAX_IMAGE_MB={raw} 不是正整数，已回退默认 {DEFAULT_MAX_MB}"));
                DEFAULT_MAX_MB
            }),
        };
        let sign_expire_secs = match var("COS_SIGN_EXPIRE_SECS") {
            None => DEFAULT_SIGN_EXPIRE_SECS,
            Some(raw) => match parse_positive(&raw) {
                None => {
                    warnings.push(format!(
                        "COS_SIGN_EXPIRE_SECS={raw} 不是正整数，已回退默认 {DEFAULT_SIGN_EXPIRE_SECS}"
                    ));
                    DEFAULT_SIGN_EXPIRE_SECS
                }
                Some(n) if n > STS_DURATION_SECS => {
                    warnings.push(format!(
                        "COS_SIGN_EXPIRE_SECS={n} 超过临时密钥的有效期，已改为 {STS_DURATION_SECS}"
                    ));
                    STS_DURATION_SECS
                }
                Some(n) => n,
            },
        };

        let (sts_endpoint, warn_sts) =
            resolve_base("COS_STS_ENDPOINT", var("COS_STS_ENDPOINT"), DEFAULT_STS_ENDPOINT);
        let (upload_base, warn_upload) =
            resolve_base("COS_UPLOAD_BASE", var("COS_UPLOAD_BASE"), &default_base);
        warnings.extend(warn_sts);
        warnings.extend(warn_upload);
        let sts_host = host_header(&sts_endpoint).ok_or_else(|| format!("COS_STS_ENDPOINT={sts_endpoint} 没有主机名"))?;
        let upload_host = host_header(&upload_base).ok_or_else(|| format!("COS_UPLOAD_BASE={upload_base} 没有主机名"))?;

        let cfg = CosConfig {
            secret_id,
            secret_key,
            bucket,
            region,
            appid,
            public_base,
            upload_prefix,
            max_image_bytes: max_mb.saturating_mul(1024 * 1024),
            sign_expire_secs,
            sts_endpoint,
            sts_host,
            upload_base,
            upload_host,
        };
        Ok((cfg, warnings))
    }

    /// 新提交的图片 URL 必须以它开头（`{public_base}/{upload_prefix}`）
    pub fn allowed_url_prefix(&self) -> String {
        format!("{}/{}", self.public_base, self.upload_prefix)
    }

    pub fn public_url(&self, key: &str) -> String {
        format!("{}/{}", self.public_base, key)
    }

    /// STS 策略里的资源串，精确到单个对象
    pub fn resource_of(&self, key: &str) -> String {
        format!("qcs::cos:{}:uid/{}:{}/{}", self.region, self.appid, self.bucket, key)
    }
}

/// 桶名/地域：只允许小写字母、数字和 `-`
fn is_label(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// 桶名形如 `<名称>-<APPID>`，APPID 是最后一个 `-` 之后的数字
fn parse_appid(bucket: &str) -> Result<String, String> {
    match bucket.rsplit_once('-') {
        Some((name, appid))
            if is_label(bucket)
                && !name.is_empty()
                && !appid.is_empty()
                && appid.bytes().all(|b| b.is_ascii_digit()) =>
        {
            Ok(appid.to_string())
        }
        _ => Err(format!(
            "COS_BUCKET={bucket} 不是 <名称>-<APPID> 的形式（桶名只允许小写字母、数字和 -，APPID 为数字）"
        )),
    }
}

/// 对象键里允许出现的字符；也是 URL 校验里「前缀之后那一段」允许的字符
pub(crate) fn is_key_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/')
}

/// 规范成「以 `/` 结尾、不以 `/` 开头」；根目录、空段、`.` / `..` 段、其它字符都算非法
fn normalize_prefix(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().trim_start_matches('/');
    let mut prefix = trimmed.to_string();
    if !prefix.ends_with('/') {
        prefix.push('/');
    }
    let bad = trimmed.is_empty()
        || !prefix.chars().all(is_key_char)
        || prefix.trim_end_matches('/').split('/').any(|seg| seg.is_empty() || seg == "." || seg == "..");
    if bad {
        return Err(format!(
            "COS_UPLOAD_PREFIX={raw} 不合法（不能是根目录，只允许 [A-Za-z0-9._/-]，且不含空段或 . / .. 段）"
        ));
    }
    Ok(prefix)
}

fn is_plain(u: &url::Url) -> bool {
    u.host_str().is_some()
        && u.query().is_none()
        && u.fragment().is_none()
        && u.username().is_empty()
        && u.password().is_none()
}

/// COS_PUBLIC_BASE：http(s) 地址，可带路径，去掉末尾 `/`
fn normalize_public_base(raw: &str) -> Result<String, String> {
    let base = raw.trim_end_matches('/');
    match url::Url::parse(base) {
        Ok(u) if matches!(u.scheme(), "http" | "https") && is_plain(&u) => Ok(base.to_string()),
        _ => Err(format!("COS_PUBLIC_BASE={raw} 不是合法的 http(s) 地址")),
    }
}

/// 仅供本地模拟测试的根地址覆盖：空 → 默认；https 任意主机；http 只允许本机回环；其余回退默认
fn resolve_base(name: &str, raw: Option<String>, default: &str) -> (String, Option<String>) {
    let Some(raw) = raw else {
        return (default.to_string(), None);
    };
    let raw = raw.trim_end_matches('/').to_string();
    match url::Url::parse(&raw) {
        Ok(u) if u.scheme() == "https" && is_plain(&u) => (raw, None),
        Ok(u)
            if u.scheme() == "http"
                && is_plain(&u)
                && matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")) =>
        {
            (raw, None)
        }
        _ => (
            default.to_string(),
            Some(format!("{name}={raw} 不合法（非 https 只允许 localhost / 127.0.0.1 / [::1]），已回退默认")),
        ),
    }
}

/// 根地址对应的 `Host` 头取值（非默认端口要带上）
fn host_header(base: &str) -> Option<String> {
    let u = url::Url::parse(base).ok()?;
    let host = u.host_str()?;
    Some(match u.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    })
}

pub(crate) fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ---------- 一次上传授权 ----------

/// 返回给浏览器的授权。`upload_url` 带签名和临时令牌，Debug 里不输出
#[derive(Clone, Serialize)]
pub struct UploadGrant {
    pub upload_url: String,
    pub public_url: String,
    pub content_type: String,
    /// 链接过期时间，Unix 毫秒
    pub expires_at: i64,
}

impl fmt::Debug for UploadGrant {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UploadGrant")
            .field("upload_url", &"<已隐藏>")
            .field("public_url", &self.public_url)
            .field("content_type", &self.content_type)
            .field("expires_at", &self.expires_at)
            .finish()
    }
}

#[derive(Debug)]
pub enum CosError {
    /// 请求本身不合法：文案直接给管理员看
    Invalid(String),
    /// 向腾讯云申请授权失败：细节只写日志
    Upstream,
}

impl From<CosError> for Exception {
    fn from(e: CosError) -> Self {
        match e {
            CosError::Invalid(msg) => Exception::BadRequest(msg),
            CosError::Upstream => Exception::BadRequest("获取上传授权失败，请查看后端日志".to_string()),
        }
    }
}

/// 校验类型与大小，返回对象键扩展名
pub fn check_upload_request(cfg: &CosConfig, content_type: &str, size: i64) -> Result<&'static str, String> {
    let ext = IMAGE_TYPES
        .iter()
        .find(|(t, _)| *t == content_type)
        .map(|(_, ext)| *ext)
        .ok_or_else(|| "不支持的图片类型，仅支持 JPG / PNG / GIF / WebP".to_string())?;
    if size < 1 || size as u64 > cfg.max_image_bytes {
        return Err(format!("图片大小须在 1 B ~ {} MB 之间", cfg.max_image_bytes / 1024 / 1024));
    }
    Ok(ext)
}

/// `{prefix}{YYYY}/{MM}/{32 位十六进制}.{ext}`。随机部分来自调用方，便于测试
pub fn new_object_key(prefix: &str, now_ms: i64, random: [u8; 16], ext: &str) -> String {
    let tz = FixedOffset::east_opt(TZ_OFFSET_SECS).expect("valid offset");
    let dt = tz
        .timestamp_millis_opt(now_ms)
        .single()
        .unwrap_or_else(|| tz.timestamp_millis_opt(0).unwrap());
    format!("{prefix}{:04}/{:02}/{}.{ext}", dt.year(), dt.month(), to_hex(&random))
}

/// 每次上传一份的 STS 策略：只允许 PutObject 到这一个对象，带大小与类型条件
pub fn build_policy(cfg: &CosConfig, key: &str, content_type: &str, size: i64) -> String {
    serde_json::json!({
        "version": "2.0",
        "statement": [{
            "effect": "allow",
            "action": ["name/cos:PutObject"],
            "resource": [cfg.resource_of(key)],
            "condition": {
                "numeric_less_than_equal": { "cos:content-length": size },
                "string_equal": { "cos:content-type": content_type }
            }
        }]
    })
    .to_string()
}

/// 为一次上传发授权。失败细节（腾讯云错误码、RequestId）写日志，不含任何密钥
pub async fn issue_upload(cfg: &CosConfig, content_type: &str, size: i64) -> Result<UploadGrant, CosError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(STS_TIMEOUT_SECS))
        .build()
        .map_err(|e| {
            error!("创建 HTTP 客户端失败: {e}");
            CosError::Upstream
        })?;
    issue_upload_at(cfg, &client, content_type, size, get_sys_time(), rand::random()).await
}

/// `issue_upload` 的核心：时间与随机数由调用方给，便于测试
pub async fn issue_upload_at(
    cfg: &CosConfig,
    client: &reqwest::Client,
    content_type: &str,
    size: i64,
    now_ms: i64,
    random: [u8; 16],
) -> Result<UploadGrant, CosError> {
    let ext = check_upload_request(cfg, content_type, size).map_err(CosError::Invalid)?;
    let key = new_object_key(&cfg.upload_prefix, now_ms, random, ext);
    let policy = build_policy(cfg, &key, content_type, size);
    let now_secs = now_ms / 1000;

    let creds = sts::get_federation_token(client, cfg, &policy, now_secs)
        .await
        .map_err(|e| {
            error!("申请 COS 临时密钥失败: {e}");
            CosError::Upstream
        })?;
    let upload_url = presign::presign_put(
        &creds,
        &cfg.upload_base,
        &cfg.upload_host,
        &key,
        content_type,
        now_secs,
        cfg.sign_expire_secs,
    );
    Ok(UploadGrant {
        upload_url,
        public_url: cfg.public_url(&key),
        content_type: content_type.to_string(),
        expires_at: (now_secs + cfg.sign_expire_secs as i64) * 1000,
    })
}

#[cfg(test)]
mod tests {
    use super::test_support::{start_mock, test_config, BUCKET, REGION, SECRET_ID, SECRET_KEY};
    use super::*;
    use std::collections::HashMap;

    /// 2026-11-04 17:20:00 UTC = 2026-11-05 01:20 +08:00
    const NOW_MS: i64 = 1_793_812_800_000;

    fn lookup(extra: &[(&str, &str)]) -> Result<(CosConfig, Vec<String>), String> {
        let mut vars: HashMap<String, String> = HashMap::from([
            ("COS_SECRET_ID".into(), SECRET_ID.into()),
            ("COS_SECRET_KEY".into(), SECRET_KEY.into()),
            ("COS_BUCKET".into(), BUCKET.into()),
            ("COS_REGION".into(), REGION.into()),
        ]);
        for (k, v) in extra {
            vars.insert(k.to_string(), v.to_string());
        }
        CosConfig::from_lookup(&|name| vars.get(name).cloned())
    }

    fn ok_cfg(extra: &[(&str, &str)]) -> CosConfig {
        lookup(extra).expect("配置应当合法").0
    }

    // ---------- 配置解析 ----------

    #[test]
    fn defaults_when_only_required_vars_are_set() {
        let (cfg, warnings) = lookup(&[]).unwrap();
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(cfg.appid, "1305537946");
        assert_eq!(cfg.public_base, "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com");
        assert_eq!(cfg.upload_prefix, "moment/");
        assert_eq!(cfg.max_image_bytes, 5 * 1024 * 1024);
        assert_eq!(cfg.sign_expire_secs, 300);
        assert_eq!(cfg.sts_endpoint, "https://sts.tencentcloudapi.com");
        assert_eq!(cfg.sts_host, "sts.tencentcloudapi.com");
        assert_eq!(cfg.upload_base, "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com");
        assert_eq!(cfg.upload_host, "ryu2u-1305537946.cos.ap-nanjing.myqcloud.com");
        assert_eq!(
            cfg.allowed_url_prefix(),
            "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/moment/"
        );
    }

    #[test]
    fn each_required_var_is_required() {
        for missing in ["COS_SECRET_ID", "COS_SECRET_KEY", "COS_BUCKET", "COS_REGION"] {
            let vars: HashMap<&str, &str> = HashMap::from([
                ("COS_SECRET_ID", "id"),
                ("COS_SECRET_KEY", "key"),
                ("COS_BUCKET", "b-1250000000"),
                ("COS_REGION", "ap-nanjing"),
            ]);
            let err = CosConfig::from_lookup(&|n| {
                if n == missing { None } else { vars.get(n).map(|v| v.to_string()) }
            })
            .unwrap_err();
            assert!(err.contains(missing), "{err}");
        }
        // 只有空白也算缺失
        assert!(lookup(&[("COS_SECRET_KEY", "   ")]).unwrap_err().contains("COS_SECRET_KEY"));
    }

    #[test]
    fn bucket_must_end_with_numeric_appid() {
        for bad in ["nobucketid", "ryu2u-abc", "ryu2u-", "-1305537946", "Ryu2u-1305537946", "a b-123"] {
            assert!(lookup(&[("COS_BUCKET", bad)]).is_err(), "{bad:?} 应被拒绝");
        }
        assert_eq!(ok_cfg(&[("COS_BUCKET", "my-blog-img-1250000000")]).appid, "1250000000");
    }

    #[test]
    fn region_must_be_a_plain_label() {
        assert!(lookup(&[("COS_REGION", "ap/nanjing")]).is_err());
        assert!(lookup(&[("COS_REGION", "AP-NANJING")]).is_err());
    }

    #[test]
    fn public_base_strips_trailing_slash_and_rejects_junk() {
        assert_eq!(
            ok_cfg(&[("COS_PUBLIC_BASE", "https://img.example.com/")]).public_base,
            "https://img.example.com"
        );
        assert_eq!(
            ok_cfg(&[("COS_PUBLIC_BASE", "https://img.example.com/blog//")]).public_base,
            "https://img.example.com/blog"
        );
        for bad in ["img.example.com", "ftp://img.example.com", "https://img.example.com?x=1", "https://u:p@img.example.com"] {
            assert!(lookup(&[("COS_PUBLIC_BASE", bad)]).is_err(), "{bad:?} 应被拒绝");
        }
    }

    #[test]
    fn prefix_is_normalized_and_validated() {
        for (raw, want) in [("moment", "moment/"), ("/a/b", "a/b/"), ("img/2026/", "img/2026/"), ("x.y_z-1/", "x.y_z-1/")] {
            assert_eq!(ok_cfg(&[("COS_UPLOAD_PREFIX", raw)]).upload_prefix, want, "{raw:?}");
        }
        for bad in ["/", "//", "a b/", "中文/", "a/../b", "./x", "a//b", "a?b/", "a#b/", "a%2eb/"] {
            assert!(lookup(&[("COS_UPLOAD_PREFIX", bad)]).is_err(), "{bad:?} 应被拒绝");
        }
    }

    #[test]
    fn invalid_numbers_fall_back_with_a_warning() {
        let (cfg, warnings) = lookup(&[("COS_MAX_IMAGE_MB", "abc"), ("COS_SIGN_EXPIRE_SECS", "0")]).unwrap();
        assert_eq!(cfg.max_image_bytes, 5 * 1024 * 1024);
        assert_eq!(cfg.sign_expire_secs, 300);
        assert_eq!(warnings.len(), 2, "{warnings:?}");
        assert_eq!(ok_cfg(&[("COS_MAX_IMAGE_MB", "12")]).max_image_bytes, 12 * 1024 * 1024);
    }

    #[test]
    fn sign_expire_is_capped_by_sts_lifetime() {
        let (cfg, warnings) = lookup(&[("COS_SIGN_EXPIRE_SECS", "7200")]).unwrap();
        assert_eq!(cfg.sign_expire_secs, STS_DURATION_SECS);
        assert_eq!(warnings.len(), 1);
    }

    #[test]
    fn endpoint_overrides_follow_the_loopback_rule() {
        let cfg = ok_cfg(&[
            ("COS_STS_ENDPOINT", "http://127.0.0.1:18080/"),
            ("COS_UPLOAD_BASE", "http://localhost:18081"),
        ]);
        assert_eq!(cfg.sts_endpoint, "http://127.0.0.1:18080");
        assert_eq!(cfg.sts_host, "127.0.0.1:18080");
        assert_eq!(cfg.upload_host, "localhost:18081");

        let (cfg, warnings) = lookup(&[
            ("COS_STS_ENDPOINT", "http://evil.example.com"),
            ("COS_UPLOAD_BASE", "not a url"),
        ])
        .unwrap();
        assert_eq!(cfg.sts_endpoint, "https://sts.tencentcloudapi.com");
        assert_eq!(cfg.upload_base, "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com");
        assert_eq!(warnings.len(), 2, "{warnings:?}");
    }

    #[test]
    fn debug_output_hides_secrets() {
        let cfg = ok_cfg(&[]);
        let shown = format!("{cfg:?}");
        assert!(!shown.contains(SECRET_KEY) && !shown.contains(SECRET_ID), "{shown}");
        assert!(shown.contains("***"));
    }

    #[test]
    fn resource_is_scoped_to_a_single_object() {
        assert_eq!(
            ok_cfg(&[]).resource_of("moment/2026/11/ab.jpg"),
            "qcs::cos:ap-nanjing:uid/1305537946:ryu2u-1305537946/moment/2026/11/ab.jpg"
        );
    }

    // ---------- 请求校验、对象键、策略 ----------

    #[test]
    fn upload_request_checks_type_and_size() {
        let cfg = ok_cfg(&[]);
        for (ct, ext) in [("image/jpeg", "jpg"), ("image/png", "png"), ("image/gif", "gif"), ("image/webp", "webp")] {
            assert_eq!(check_upload_request(&cfg, ct, 1), Ok(ext));
        }
        for bad in ["image/svg+xml", "text/html", "IMAGE/JPEG", "image/jpeg; charset=x", "", "application/octet-stream"] {
            assert!(check_upload_request(&cfg, bad, 100).is_err(), "{bad:?} 应被拒绝");
        }
        let max = cfg.max_image_bytes as i64;
        assert_eq!(check_upload_request(&cfg, "image/png", max), Ok("png"));
        for size in [0, -1, max + 1, i64::MIN, i64::MAX] {
            let err = check_upload_request(&cfg, "image/png", size).unwrap_err();
            assert!(err.contains("1 B ~ 5 MB"), "{err}");
        }
    }

    #[test]
    fn object_key_has_the_documented_shape() {
        let key = new_object_key("moment/", NOW_MS, [0xab; 16], "jpg");
        assert_eq!(key, "moment/2026/11/abababababababababababababababab.jpg");
        assert!(key.chars().all(is_key_char), "{key}");
    }

    #[test]
    fn object_key_month_uses_east_8_not_utc() {
        // 2026-10-31 16:00:00.000 UTC 正好是北京时间 11 月 1 日 00:00；早一毫秒还是 10 月
        let at = 1_793_462_400_000;
        assert_eq!(new_object_key("p/", at, [0; 16], "png"), "p/2026/11/00000000000000000000000000000000.png");
        assert!(new_object_key("p/", at - 1, [0; 16], "png").starts_with("p/2026/10/"));
    }

    #[test]
    fn object_keys_are_unique_per_random_input() {
        let a = new_object_key("moment/", NOW_MS, rand::random(), "jpg");
        let b = new_object_key("moment/", NOW_MS, rand::random(), "jpg");
        assert_ne!(a, b);
    }

    #[test]
    fn policy_allows_exactly_one_put_with_limits() {
        let cfg = ok_cfg(&[]);
        let policy = build_policy(&cfg, "moment/2026/11/ab.jpg", "image/jpeg", 183204);
        let v: serde_json::Value = serde_json::from_str(&policy).unwrap();
        assert_eq!(v["version"], "2.0");
        let st = &v["statement"];
        assert_eq!(st.as_array().unwrap().len(), 1);
        assert_eq!(st[0]["effect"], "allow");
        assert_eq!(st[0]["action"], serde_json::json!(["name/cos:PutObject"]));
        assert_eq!(
            st[0]["resource"],
            serde_json::json!(["qcs::cos:ap-nanjing:uid/1305537946:ryu2u-1305537946/moment/2026/11/ab.jpg"])
        );
        assert_eq!(st[0]["condition"]["numeric_less_than_equal"]["cos:content-length"], 183204);
        assert_eq!(st[0]["condition"]["string_equal"]["cos:content-type"], "image/jpeg");
    }

    // ---------- 整条链路（模拟 STS 与 COS） ----------

    #[actix_web::test]
    async fn issued_link_is_accepted_by_cos_and_tampering_is_rejected() {
        let (mock, base) = start_mock().await;
        let cfg = test_config(&base);
        let client = reqwest::Client::new();

        let grant = issue_upload_at(&cfg, &client, "image/png", 2048, NOW_MS, [7; 16]).await.unwrap();
        let key = "moment/2026/11/07070707070707070707070707070707.png";
        assert_eq!(grant.public_url, format!("https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/{key}"));
        assert_eq!(grant.content_type, "image/png");
        assert_eq!(grant.expires_at, (NOW_MS / 1000 + 300) * 1000);
        assert!(grant.upload_url.starts_with(&format!("{base}/{key}?q-sign-algorithm=sha1&")), "{}", grant.upload_url);

        // STS 收到的策略：单对象资源 + 声明的大小与类型
        let policies = mock.policies.lock().unwrap().clone();
        assert_eq!(policies.len(), 1);
        let p: serde_json::Value = serde_json::from_str(&policies[0]).unwrap();
        assert_eq!(
            p["statement"][0]["resource"][0],
            format!("qcs::cos:ap-nanjing:uid/1305537946:ryu2u-1305537946/{key}")
        );
        assert_eq!(p["statement"][0]["condition"]["numeric_less_than_equal"]["cos:content-length"], 2048);
        assert_eq!(p["statement"][0]["condition"]["string_equal"]["cos:content-type"], "image/png");

        let put = |url: String, ct: &str| {
            let client = client.clone();
            let ct = ct.to_string();
            async move { client.put(url).header("Content-Type", ct).body(vec![1u8; 16]).send().await.unwrap().status() }
        };

        // 原样 PUT：模拟 COS 按文档重新验签，通过
        assert_eq!(put(grant.upload_url.clone(), "image/png").await, 200);
        assert_eq!(mock.stored.lock().unwrap().clone(), vec![key.to_string()]);

        // 换 Content-Type → 验签失败
        assert_eq!(put(grant.upload_url.clone(), "image/jpeg").await, 403);
        // 改签名（改最后一个十六进制字符之前的位置，避免被 token 参数干扰）
        let tampered = grant.upload_url.replacen("q-signature=", "q-signature=0", 1);
        assert_eq!(put(tampered, "image/png").await, 403);
        // 换对象键 → 验签失败
        let other_key = grant.upload_url.replacen("07070707", "08080808", 1);
        assert_eq!(put(other_key, "image/png").await, 403);
        // 去掉临时令牌 → 失败
        let no_token = grant.upload_url.split("&x-cos-security-token=").next().unwrap().to_string();
        assert_eq!(put(no_token, "image/png").await, 403);
        assert_eq!(mock.stored.lock().unwrap().len(), 1, "被篡改的请求不能落盘");
    }

    #[actix_web::test]
    async fn sts_failure_is_reported_as_upstream_error() {
        let (mock, base) = start_mock().await;
        mock.sts_fail.store(true, std::sync::atomic::Ordering::SeqCst);
        let cfg = test_config(&base);
        let err = issue_upload_at(&cfg, &reqwest::Client::new(), "image/png", 10, NOW_MS, [1; 16])
            .await
            .unwrap_err();
        assert!(matches!(err, CosError::Upstream), "{err:?}");
        let exception: Exception = err.into();
        assert_eq!(exception.to_string(), "获取上传授权失败，请查看后端日志");
    }

    #[actix_web::test]
    async fn invalid_requests_never_reach_sts() {
        let (mock, base) = start_mock().await;
        let cfg = test_config(&base);
        let client = reqwest::Client::new();
        let err = issue_upload_at(&cfg, &client, "text/html", 10, NOW_MS, [1; 16]).await.unwrap_err();
        assert!(matches!(err, CosError::Invalid(_)), "{err:?}");
        let err = issue_upload_at(&cfg, &client, "image/png", 0, NOW_MS, [1; 16]).await.unwrap_err();
        assert!(matches!(err, CosError::Invalid(_)), "{err:?}");
        assert!(mock.policies.lock().unwrap().is_empty());
    }

    #[test]
    fn grant_debug_hides_the_signed_url() {
        let grant = UploadGrant {
            upload_url: "https://x/y?q-signature=SECRET".into(),
            public_url: "https://x/y".into(),
            content_type: "image/png".into(),
            expires_at: 1,
        };
        assert!(!format!("{grant:?}").contains("SECRET"));
    }
}
