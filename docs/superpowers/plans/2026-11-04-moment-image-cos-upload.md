# 说说图片上传到腾讯云 COS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台编辑说说时，图片只能通过「选文件上传」进入：浏览器直传腾讯云 COS，后端只签发一条 5 分钟有效、只能写一个对象的预签名上传链接，并对新提交的图片 URL 做校验；库里仍存完整的公开 URL。

**Architecture:** 新增 `src/cos/` 模块：`CosConfig`（环境变量，未配置则功能关闭）→ 校验类型与大小 → 随机对象键 → 用 CAM 子账号的永久密钥调 STS `GetFederationToken`（TC3-HMAC-SHA256）换一份只能写这一个对象的临时密钥 → 用临时密钥按 COS sha1 算法签出预签名 PUT 链接。`POST /moment/admin/upload_sign` 返回链接；`/moment/admin/add|update` 用纯函数 `validate_image_urls` 校验新增的图片 URL。后台说说页把图片文本域换成 antd `Upload`，用 XHR 直传。博客前端、数据库表、说说与仓库的同步代码都不改。

**Tech Stack:** Rust / Actix-web 4 / reqwest 0.12 / chrono / sha2；**新增依赖 `hmac = "0.12"`、`sha1 = "0.10"`**（`sha1` 已在 `Cargo.lock` 里作为间接依赖）。前端 React 18 + antd 5（不加依赖）。

**Spec:** `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`（已通过评审）

## 关于这份计划里的代码

- 计划里所有「新建文件」「查找/替换」都是**逐字**的：它们先在仓库的一份临时副本里完整实现、编译，并逐任务验证过：每个任务结束时 `cargo test` 都是绿的（只有两个改动前就存在的失败，见下），数字写在各任务的步骤里；全部完成后在一份全新副本上按文档顺序重新应用一遍，与已验证的实现逐文件一致。照着做，应得到同样的结果。
- 已验证的内容：全部单元测试；带模拟 STS / COS 的整条授权链路（模拟端**独立重写**验签，不复用被测代码）；对接临时 MySQL 的端到端场景；10 条变异检查全部被测试抓住；前端 `tsc`、`npm run build` 通过，`npm run lint` 的问题总数与改动前一致（29，均为既有问题）。
- **没有验证的内容**：真实的腾讯云 STS / COS（需要子账号密钥与桶的 CORS 配置，必须先征得你同意，见 Task 5），以及后台页面在浏览器里的真实上传。设计文档 §13 里标为「未核实」的几点（`cos:content-type` 条件写法、`Policy` 的 urlencode 次数、STS 错误响应的结构）只能在 Task 5 里确认。
- 签名算法的测试向量：腾讯云官方文档里**不依赖密钥**的中间值（TC3 的 `HashedRequestPayload`、`HashedCanonicalRequest`，COS 的 `SHA1(HttpString)`）都被逐项复现；依赖密钥的部分用 Python 标准库**独立实现**算出「黄金值」（假密钥，脚本见附录 A）。
- 因为代码和测试是一起准备好的，所以每个任务不再单独走「先写失败测试」的红灯步骤，而是用**变异检查**（临时改坏关键规则，确认测试会失败，再还原）来证明测试真的在约束行为（附录 B）。
- 改动前就存在的两个测试失败：`post::apis::test::test_post_add`、`user::apis::test::test_greet`。不要去修它们，也不要把它们当成回归。

## 实现中发现的、对设计文档的补充

这些已经写进 Task 4 对设计文档的修订里：

1. **新增图片 URL 的校验改成白名单**：前缀之后的部分只允许 `[A-Za-z0-9._/-]`。设计文档原先写的黑名单（空白、`?`、`#`、`..`）挡不住 `%2e%2e`（浏览器会当成 `..`）和 `\`。
2. **修改说说时「删光图片」要存 `"[]"` 而不是 NULL**：rbatis 的 `update_by_column` 会跳过值为 `None` 的列，写 NULL 清不掉旧图片。这是在端到端测试里发现的——**改动前后台就无法把一条说说的图片全部删掉**，换成上传组件后这个问题会立刻暴露，所以在 `api_admin_moment_update` 里一并修掉。
3. `TempCredentials` 不再带 `expired_at`（用不上：预签名链接自己的有效期更短）。
4. 两个 `#[ignore]` 的端到端测试共用一个临时库，加了一把测试用的串行锁（`config::E2E_DB_LOCK`），所以可以用过滤条件 `e2e` 一起跑。
5. 真实 COS 冒烟测试额外要求环境变量 `COS_SMOKE_CONFIRM=yes`，避免被不带过滤条件的 `cargo test -- --ignored` 误带上。

**还发现了一个同类的旧问题，已经在执行本计划之前单独修掉（提交 `3791aa7`）**：说说与仓库的双向同步里，仓库文件删掉图片行（或位置）后，拉取路径同样因为 `update_by_column` 跳过 `None` 列而**清不掉库里的旧值**，下一轮写回还会把图片行加回仓库文件，即仓库里的这次删除会被还原。它在 `moment_sync.rs` 里，而本设计明确「同步代码一行不改」，所以没有放进本计划，而是单独一个提交：新增 `save_moment` 显式写 NULL，并加了端到端场景 ⑪（修复前该场景失败）。设计文档 §13 里只留一行记录。

## 关于提交

每个任务末尾有一个提交步骤。**你批准这份计划并选定执行方式时，请一并说明是否同意按任务逐个提交**（不含推送）。没有明确同意就不要提交，把改动留在工作树里。

## Global Constraints

- 浏览器**直传** COS；后端只发临时授权，文件字节不经过后端；后端不留文件、不持有长期状态（临时密钥只活在一次请求的内存里）
- 类型白名单与扩展名：`image/jpeg→jpg`、`image/png→png`、`image/gif→gif`、`image/webp→webp`；**不使用客户端文件名**
- 对象键 `{COS_UPLOAD_PREFIX}{YYYY}/{MM}/{32 位随机十六进制}.{ext}`，年月按 **+08:00**；键里只会出现 `[A-Za-z0-9/._-]`
- STS：`GetFederationToken`，端点 `https://sts.tencentcloudapi.com`，TC3-HMAC-SHA256，`Version: 2018-08-13`，必须带 `X-TC-Region`，`Name=momentupload`，`DurationSeconds=1800`；凭证日期取 **UTC**；`Content-Type` 恒为 `application/json; charset=utf-8` 且与签名逐字一致（不用 `reqwest` 的 `.json()`）
- STS 策略：`action` 只有 `name/cos:PutObject`；`resource` 精确到**单个对象**（`qcs::cos:{region}:uid/{appid}:{bucket}/{key}`）；条件 `numeric_less_than_equal: {"cos:content-length": 声明大小}` 与 `string_equal: {"cos:content-type": 类型}`
- 预签名链接：COS sha1 算法，只签 `content-type;host`，`x-cos-security-token` 附在链接上、不参与签名；有效期 `COS_SIGN_EXPIRE_SECS`
- 配置默认值：`COS_UPLOAD_PREFIX=moment/`、`COS_MAX_IMAGE_MB=5`、`COS_SIGN_EXPIRE_SECS=300`（上限 1800）；`COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` 必填；桶名必须是 `<名称>-<数字 APPID>`；缺任一必填项或配置非法 → 功能关闭（启动日志告警一次），而不是启动失败
- 图片 URL 校验规则（设计文档 §7.1）：新 URL 必须以 `{COS_PUBLIC_BASE}/{COS_UPLOAD_PREFIX}` 开头；库里已有的 URL 原样放行；总数 ≤ `max(9, 已有张数)`；未配置对象存储时任何新 URL 都不合法
- **不改**：博客前端、数据库表结构、`moment_sync.rs`（说说与仓库的同步）；**不删** COS 对象；不新增数据库表或字段
- 任何日志与错误信息不得包含 `SecretKey`、临时密钥、令牌或预签名链接的签名部分（`CosConfig` / `TempCredentials` / `UploadGrant` 的 `Debug` 手写脱敏）
- 注释用中文，风格与周围代码一致
- **执行期间不要用真实的 COS 密钥跑任何东西**。所有验证只用进程内模拟的 STS / COS 和临时库。唯一例外是文末的 Task 5，必须先得到你的明确同意
- 工作目录 `/Users/ryu2u/Developer/Project/rust_blog`，分支 `master`

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/cos/mod.rs` | 新建 | `CosConfig`（读环境变量、脱敏 `Debug`）、对象键、STS 策略、`issue_upload` |
| `src/cos/sts.rs` | 新建 | TC3-HMAC-SHA256 签名 + 调 `GetFederationToken` + 解析响应 |
| `src/cos/presign.rs` | 新建 | COS sha1 预签名 PUT 链接 |
| `src/cos/validate.rs` | 新建 | 纯函数 `validate_image_urls` |
| `src/cos/test_support.rs` | 新建 | 测试用的进程内模拟 STS / COS（独立重写验签） |
| `src/cos/smoke.rs` | 新建 | 真实 STS / COS 冒烟测试（`#[ignore]`，Task 5） |
| `src/moment/apis.rs` | 修改 | `upload_sign` 接口；add / update 接入 URL 校验；删光图片存 `"[]"` |
| `src/moment/upload_e2e.rs` | 新建 | add / update 校验的端到端测试（`#[ignore]`，需临时库） |
| `src/moment/mod.rs`、`src/main.rs`、`src/config.rs`、`src/note_sync/moment_e2e.rs` | 修改 | 注册模块与配置；端到端测试的串行锁 |
| `Cargo.toml`（及 `Cargo.lock`） | 修改 | 依赖 `hmac`、`sha1` |
| `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx` | 修改 | 图片文本域 → antd `Upload`（picture-card） |
| `front/ryu2u_blog_admin/src/admin/moments/cosUpload.ts` | 新建 | XHR 直传 COS、类型/大小常量 |
| `front/ryu2u_blog_admin/src/common/Structs.ts`、`src/service/MomentService.ts` | 修改 | `UploadSign` 类型、`moment_upload_sign` 方法 |
| `.env.example`、`CLAUDE.md`、设计文档 | 修改 | 配置与文档 |
| `docs/migrations/2026-11-04-moment-image-cos-upload.md` | 新建 | 上线迁移文档（CAM 子账号、CORS、`.env`、NTP） |

---

### Task 1: `cos` 模块（配置、授权、签名、URL 校验）

**Files:**
- Create: `src/cos/mod.rs`、`src/cos/sts.rs`、`src/cos/presign.rs`、`src/cos/validate.rs`、`src/cos/test_support.rs`
- Modify: `Cargo.toml`、`src/main.rs`（只加 `mod cos;`）

**Interfaces:**
- Produces（Task 2 使用）：
  - `crate::cos::CosConfig`：`from_env() -> Option<CosConfig>`；`from_lookup(&dyn Fn(&str) -> Option<String>) -> Result<(CosConfig, Vec<String>), String>`；`allowed_url_prefix(&self) -> String`
  - `crate::cos::issue_upload(&CosConfig, content_type: &str, size: i64) -> Result<UploadGrant, CosError>`；`UploadGrant { upload_url, public_url, content_type: String, expires_at: i64 }`（`Serialize`）；`CosError::{Invalid(String), Upstream}` 与 `impl From<CosError> for Exception`
  - `crate::cos::validate::validate_image_urls(new: &[String], existing: &[String], allowed_prefix: Option<&str>) -> Result<(), String>`
  - 仅测试：`crate::cos::test_support::{start_mock() -> (Arc<MockState>, String), test_config(&str) -> CosConfig}`、`MockState { policies, sts_fail, stored }`

- [ ] **Step 1: 加依赖、声明模块、新建 5 个文件**

此时 `cos` 里的函数还没有被接口调用，`cargo build` 可能对它们报 `never used` 警告，Task 2 接线后会消失。第一次编译需要联网下载 `hmac`。

**修改 `Cargo.toml`**（查找的片段必须恰好出现一次）：

查找：

````toml
percent-encoding = "2"
url = "2"
````

替换为：

````toml
percent-encoding = "2"
url = "2"

# cos: 腾讯云 COS 图片直传（STS 的 TC3-HMAC-SHA256 签名、COS 的 HMAC-SHA1 预签名）
hmac = "0.12"
sha1 = "0.10"
````

**修改 `src/main.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
mod config;
mod middleware;
````

替换为：

````rust
mod config;
mod cos;
mod middleware;
````

**新建 `src/cos/mod.rs`**，内容如下：

````rust
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
````

**新建 `src/cos/sts.rs`**，内容如下：

````rust
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
````

**新建 `src/cos/presign.rs`**，内容如下：

````rust
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
````

**新建 `src/cos/validate.rs`**，内容如下：

````rust
//! 后台提交说说时对图片 URL 的校验：新增的图片必须来自本功能的上传位置，杜绝手填外链。
//! 纯函数，不依赖数据库与网络。

use super::is_key_char;

/// 一条说说默认最多几张图
const MAX_IMAGES: usize = 9;
const MAX_URL_LEN: usize = 1024;

/// - `new`：这次提交的全部图片 URL
/// - `existing`：该说说库里已有的图片 URL（新增说说传空）
/// - `allowed_prefix`：`{public_base}/{upload_prefix}`；未配置对象存储时为 None
///
/// 规则（设计文档 §7.1）：
/// 1. 与 `existing` 中完全相同的 URL 放行（保留旧链接，含外链、仓库同步来的链接）；
/// 2. 其余视为「新」URL，必须以 `allowed_prefix` 开头，且前缀之后只能由 `[A-Za-z0-9._/-]` 组成，
///    不含 `.` / `..` 路径段，不以 `/` 结尾，整条不超过 1024 字符；
/// 3. 未配置对象存储时，任何新 URL 都不合法；
/// 4. 总数不超过 `max(9, existing.len())`：原本就超过 9 张的只许保持或减少，不许增加。
pub fn validate_image_urls(
    new: &[String],
    existing: &[String],
    allowed_prefix: Option<&str>,
) -> Result<(), String> {
    let limit = MAX_IMAGES.max(existing.len());
    if new.len() > limit {
        return Err(format!("图片最多 {limit} 张"));
    }
    for url in new {
        if existing.contains(url) {
            continue;
        }
        check_new_url(url, allowed_prefix)?;
    }
    Ok(())
}

fn check_new_url(url: &str, allowed_prefix: Option<&str>) -> Result<(), String> {
    let Some(prefix) = allowed_prefix else {
        return Err("未配置对象存储（COS_*），不能新增图片".to_string());
    };
    let not_uploaded = || format!("图片地址不是通过上传得到的：{}", shorten(url));

    if url.chars().count() > MAX_URL_LEN {
        return Err(not_uploaded());
    }
    let Some(rest) = url.strip_prefix(prefix) else {
        return Err(not_uploaded());
    };
    // 白名单而不是黑名单：空白、`?`、`#`、`%`（`%2e%2e` 会被浏览器当成 `..`）、`\`、非 ASCII 全部挡住
    let clean = !rest.is_empty()
        && !rest.ends_with('/')
        && rest.chars().all(is_key_char)
        && !rest.split('/').any(|seg| seg == "." || seg == "..");
    if clean {
        Ok(())
    } else {
        Err(not_uploaded())
    }
}

/// 出错提示里最多回显 80 个字符，避免把超长内容原样塞进响应
fn shorten(url: &str) -> String {
    let mut out: String = url.chars().take(80).collect();
    if url.chars().count() > 80 {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const PREFIX: &str = "https://img.example.com/moment/";

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }
    fn ok(new: &[&str], existing: &[&str], prefix: Option<&str>) {
        validate_image_urls(&v(new), &v(existing), prefix).expect("应当通过");
    }
    fn err(new: &[&str], existing: &[&str], prefix: Option<&str>) -> String {
        validate_image_urls(&v(new), &v(existing), prefix).expect_err("应当被拒绝")
    }

    #[test]
    fn accepts_urls_under_the_upload_prefix() {
        ok(&[], &[], Some(PREFIX));
        ok(&["https://img.example.com/moment/2026/11/0f.jpg"], &[], Some(PREFIX));
        ok(
            &["https://img.example.com/moment/a.png", "https://img.example.com/moment/b/c-d_e.f.webp"],
            &[],
            Some(PREFIX),
        );
    }

    #[test]
    fn rejects_external_urls() {
        let msg = err(&["https://evil.example.com/x.jpg"], &[], Some(PREFIX));
        assert!(msg.starts_with("图片地址不是通过上传得到的："), "{msg}");
        for bad in [
            "http://img.example.com/moment/a.jpg",            // 协议不同
            "https://img.example.com.evil.com/moment/a.jpg",  // 前缀只是主机名的开头
            "https://img.example.com/moment-evil/a.jpg",      // 前缀只是目录名的开头
            "https://img.example.com/other/a.jpg",
            "https://evil.example.com/r/https://img.example.com/moment/a.jpg", // 前缀出现在后面
            "//img.example.com/moment/a.jpg",
            "moment/a.jpg",
            "",
        ] {
            err(&[bad], &[], Some(PREFIX));
        }
    }

    #[test]
    fn rejects_everything_new_when_storage_is_not_configured() {
        let msg = err(&["https://img.example.com/moment/a.jpg"], &[], None);
        assert!(msg.contains("未配置对象存储"), "{msg}");
        ok(&[], &[], None);
    }

    #[test]
    fn keeps_existing_urls_even_when_external_or_unconfigured() {
        let old = "https://old.example.com/pic?id=1&x=2#frag";
        ok(&[old], &[old], Some(PREFIX));
        ok(&[old], &[old], None);
        // 旧的和合法的新的混在一起
        ok(&[old, "https://img.example.com/moment/a.jpg"], &[old], Some(PREFIX));
        // 但「长得像旧的」不算旧的
        err(&["https://old.example.com/pic?id=1&x=2"], &[old], Some(PREFIX));
    }

    #[test]
    fn blocks_tricks_that_escape_the_prefix() {
        for tail in [
            "a.jpg?x=1",
            "a.jpg#x",
            "../secret.jpg",
            "a/../../secret.jpg",
            "./a.jpg",
            "a/./b.jpg",
            "%2e%2e/secret.jpg",
            "a%2Fb.jpg",
            "a\\..\\b.jpg",
            "a b.jpg",
            "a\tb.jpg",
            "a\nb.jpg",
            "中文.jpg",
            "dir/",
            "",
        ] {
            let url = format!("{PREFIX}{tail}");
            err(&[url.as_str()], &[], Some(PREFIX));
        }
    }

    #[test]
    fn rejects_overlong_urls() {
        let long_ok = format!("{PREFIX}{}", "a".repeat(MAX_URL_LEN - PREFIX.len()));
        assert_eq!(long_ok.chars().count(), MAX_URL_LEN);
        ok(&[long_ok.as_str()], &[], Some(PREFIX));
        let too_long = format!("{long_ok}a");
        let msg = err(&[too_long.as_str()], &[], Some(PREFIX));
        assert!(msg.chars().count() < 200, "提示不应回显整条超长地址: {}", msg.len());
    }

    #[test]
    fn caps_the_count_at_nine_for_new_content() {
        let urls: Vec<String> = (0..10).map(|i| format!("{PREFIX}{i}.jpg")).collect();
        let refs: Vec<&str> = urls.iter().map(String::as_str).collect();
        ok(&refs[..9], &[], Some(PREFIX));
        assert_eq!(err(&refs, &[], Some(PREFIX)), "图片最多 9 张");
    }

    #[test]
    fn legacy_over_the_cap_may_stay_or_shrink_but_not_grow() {
        let legacy: Vec<String> = (0..12).map(|i| format!("https://old.example.com/{i}.jpg")).collect();
        let legacy_refs: Vec<&str> = legacy.iter().map(String::as_str).collect();
        ok(&legacy_refs, &legacy_refs, Some(PREFIX)); // 原样保存
        ok(&legacy_refs[..5], &legacy_refs, Some(PREFIX)); // 删减
        let mut grown = legacy_refs.clone();
        grown.push("https://img.example.com/moment/new.jpg");
        assert_eq!(err(&grown, &legacy_refs, Some(PREFIX)), "图片最多 12 张");
    }

    #[test]
    fn long_url_message_is_shortened() {
        let url = format!("https://evil.example.com/{}", "x".repeat(500));
        let msg = err(&[url.as_str()], &[], Some(PREFIX));
        assert!(msg.ends_with('…'), "{msg}");
    }
}
````

**新建 `src/cos/test_support.rs`**，内容如下：

````rust
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
````

- [ ] **Step 2: 跑 `cos` 的全部测试**

```bash
cargo test cos:: 2>&1 | tail -5
```

期望：`test result: ok. 44 passed; 0 failed`。这 44 个测试里：

- `cos::sts` / `cos::presign` 复现官方文档的不依赖密钥的中间值，并与 Python 黄金值逐字比对；
- `cos::tests::issued_link_is_accepted_by_cos_and_tampering_is_rejected` 走完整链路：模拟 STS 重新验 TC3 签名并检查 `Content-Type` 逐字一致，模拟 COS 按文档重新验预签名；换类型 / 改签名 / 换对象键 / 去掉令牌都得到 403；
- `cos::validate` 覆盖 URL 校验的每一条规则和各种绕前缀的写法。

- [ ] **Step 3: 全量测试**

```bash
cargo test 2>&1 | grep -E '^test .*FAILED|^test result'
```

期望：只有那两个既有失败，`test result: FAILED. 163 passed; 2 failed; 1 ignored`（改动前是 119 passed）。

- [ ] **Step 4: 变异检查（第 1～7 条）**

把附录 B 的脚本保存到仓库之外（例如 `$TMPDIR/mutate.py`），在项目根目录运行。它逐条把关键规则改坏、跑对应的测试、再还原文件：

```bash
python3 -I "$TMPDIR/mutate.py"
```

期望每条都以 `✓` 开头，最后一行 `全部变异都被测试抓住`（8～10 条需要临时库，加 `--all` 才跑，留到 Task 2）。每条应当失败的测试：

| # | 改坏了什么 | 应当失败的测试 |
|---|---|---|
| 1 | URL 前缀改成「包含」而不是「开头」 | `cos::validate::tests::rejects_external_urls` |
| 2 | 旧 URL 不再放行 | `cos::validate::tests::keeps_existing_urls_even_when_external_or_unconfigured`<br>`cos::validate::tests::legacy_over_the_cap_may_stay_or_shrink_but_not_grow` |
| 3 | STS 资源收窄被去掉（变成通配） | `cos::tests::issued_link_is_accepted_by_cos_and_tampering_is_rejected`<br>`cos::tests::policy_allows_exactly_one_put_with_limits`<br>`cos::tests::resource_is_scoped_to_a_single_object` |
| 4 | 图片类型白名单失效 | `cos::tests::upload_request_checks_type_and_size` |
| 5 | 规范请求串里的 content-type 少了 charset | `cos::sts::tests::authorization_matches_the_python_reference`<br>`cos::sts::tests::credential_date_is_utc_not_local`<br>`cos::sts::tests::matches_the_official_key_free_intermediates`<br>`cos::tests::issued_link_is_accepted_by_cos_and_tampering_is_rejected` |
| 6 | 凭证日期用了东八区而不是 UTC | `cos::sts::tests::authorization_matches_the_python_reference`<br>`cos::sts::tests::credential_date_is_utc_not_local`<br>`cos::sts::tests::matches_the_official_key_free_intermediates` |
| 7 | 预签名没有绑定 Content-Type | `cos::presign::tests::http_string_binds_content_type_and_host`<br>`cos::presign::tests::loopback_host_with_port_matches_the_python_reference`<br>`cos::presign::tests::signature_depends_on_type_host_key_and_time`<br>`cos::tests::issued_link_is_accepted_by_cos_and_tampering_is_rejected` |

跑完用 `git status --short` 确认只有本任务的改动，没有被改坏的残留。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add Cargo.toml \
  Cargo.lock \
  src/main.rs \
  src/cos/
git commit -F - <<'EOF'
feat(cos): 腾讯云 COS 直传授权模块（STS 临时密钥 + 预签名链接 + 图片 URL 校验）

新增 src/cos/：CosConfig 读 COS_* 环境变量（未配置则功能关闭，Debug 脱敏）；调 STS GetFederationToken
(TC3-HMAC-SHA256) 换只能写单个对象的临时密钥；用临时密钥按 COS sha1 算法签出预签名 PUT 链接；
validate_image_urls 校验新增图片必须来自上传位置。新增依赖 hmac、sha1。
带 44 个单元测试，签名算法对照官方文档的向量与 Python 独立实现的黄金值，授权链路用进程内
模拟的 STS / COS 验证。尚未接入接口。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


---

### Task 2: 接口与校验接线

**Files:**
- Create: `src/moment/upload_e2e.rs`
- Modify: `src/main.rs`、`src/config.rs`、`src/note_sync/moment_e2e.rs`、`src/moment/mod.rs`、`src/moment/apis.rs`

**Interfaces:**
- Consumes: Task 1 的 `CosConfig`、`issue_upload`、`UploadGrant`、`validate_image_urls`、`test_support`
- Produces:
  - `POST /moment/admin/upload_sign`：请求 `{ "content_type": "image/png", "size": 2048 }`，成功时 `R<UploadGrant>`（`{code, msg, obj: {upload_url, public_url, content_type, expires_at}}`）；失败是 400 + 管理员可读的 `msg`。路径在已有的 `/moment/admin` 前缀下，**自动要求管理员**，`main.rs` 的前缀列表与白名单都不用改
  - `/moment/admin/add|update` 对新增的图片 URL 做校验，失败返回 400
  - `web::Data<Option<CosConfig>>` 在 `main.rs` 注册；`crate::config::E2E_DB_LOCK`（仅测试）

- [ ] **Step 1: 应用修改并新建端到端测试**

**修改 `src/main.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    info!("config init success!");

    // GitHub 笔记同步后台任务
````

替换为：

````rust
    info!("config init success!");

    // 腾讯云 COS 图片直传配置：未配置或配置不合法时为 None（功能关闭，启动日志里会说明原因）
    let cos_config = web::Data::new(cos::CosConfig::from_env());

    // GitHub 笔记同步后台任务
````

**修改 `src/main.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
            .app_data(login_guard.clone())
````

替换为：

````rust
            .app_data(login_guard.clone())
            .app_data(cos_config.clone())
````

**修改 `src/config.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub async fn init_rbatis(db_url: String) -> RBatis {
````

替换为：

````rust
/// 端到端测试共用同一个临时库：串行化，避免两个 #[ignore] 测试同时 DROP / CREATE 同一张表
#[cfg(test)]
pub static E2E_DB_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub async fn init_rbatis(db_url: String) -> RBatis {
````

**修改 `src/note_sync/moment_e2e.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
async fn moment_e2e_scenarios() {
    let mut e = setup().await;
````

替换为：

````rust
async fn moment_e2e_scenarios() {
    let _guard = crate::config::E2E_DB_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut e = setup().await;
````

**修改 `src/moment/mod.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub mod apis;

use crate::utils::time_utils::get_sys_time;
````

替换为：

````rust
pub mod apis;
#[cfg(test)]
mod upload_e2e;

use crate::utils::time_utils::get_sys_time;
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
use crate::config::Exception;
use crate::moment::{parse_images, serialize_images, Moment};
````

替换为：

````rust
use crate::config::Exception;
use crate::cos::validate::validate_image_urls;
use crate::cos::{issue_upload, CosConfig, UploadGrant};
use crate::moment::{parse_images, serialize_images, Moment};
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
        .service(api_admin_moment_toggle_public)
}
````

替换为：

````rust
        .service(api_admin_moment_toggle_public)
        .service(api_admin_moment_upload_sign)
}
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
#[instrument]
#[post("/admin/add")]
async fn api_admin_moment_add(
    payload: web::Json<MomentPayload>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    if payload.content.trim().is_empty() {
        return Err(Exception::BadRequest("说说内容不能为空".to_string()));
    }
````

替换为：

````rust
#[instrument(skip(cos))]
#[post("/admin/add")]
async fn api_admin_moment_add(
    payload: web::Json<MomentPayload>,
    db: web::Data<RBatis>,
    cos: web::Data<Option<CosConfig>>,
) -> Result<impl Responder, Exception> {
    if payload.content.trim().is_empty() {
        return Err(Exception::BadRequest("说说内容不能为空".to_string()));
    }
    // 新增说说没有已有图片，每一张都必须来自上传位置
    check_images(&payload, &[], &cos)?;
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
#[instrument]
#[post("/admin/update")]
async fn api_admin_moment_update(
    payload: web::Json<MomentPayload>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
````

替换为：

````rust
#[instrument(skip(cos))]
#[post("/admin/update")]
async fn api_admin_moment_update(
    payload: web::Json<MomentPayload>,
    db: web::Data<RBatis>,
    cos: web::Data<Option<CosConfig>>,
) -> Result<impl Responder, Exception> {
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    let mut moment = rows.pop().unwrap();
    moment.content = payload.content.clone();
    moment.images = serialize_images(payload.images.clone());
````

替换为：

````rust
    let mut moment = rows.pop().unwrap();
    // 库里已有的图片（含外链、仓库同步来的）原样保留；只有新增的才要求来自上传位置
    check_images(&payload, &parse_images(moment.images.clone()), &cos)?;
    moment.content = payload.content.clone();
    // rbatis 的 update_by_column 会跳过值为 None 的列：写 NULL 清不掉旧图片，
    // 所以「删光全部图片」要存成 "[]"（parse_images 读出来就是空列表）
    moment.images = Some(serialize_images(payload.images.clone()).unwrap_or_else(|| "[]".to_string()));
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
fn to_payload(moment: Moment) -> MomentPayload {
````

替换为：

````rust
/// 图片 URL 校验（规则见 cos/validate.rs）。`existing` 是该说说库里已有的图片
fn check_images(
    payload: &MomentPayload,
    existing: &[String],
    cos: &web::Data<Option<CosConfig>>,
) -> Result<(), Exception> {
    let new = payload.images.as_deref().unwrap_or(&[]);
    let prefix = cos.get_ref().as_ref().map(CosConfig::allowed_url_prefix);
    validate_image_urls(new, existing, prefix.as_deref()).map_err(Exception::BadRequest)
}

fn to_payload(moment: Moment) -> MomentPayload {
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
        .map_err(|_| Exception::BadRequest("状态更新失败".to_string()))?;
    Ok(R::<()>::ok_msg("状态已更新"))
}
````

替换为：

````rust
        .map_err(|_| Exception::BadRequest("状态更新失败".to_string()))?;
    Ok(R::<()>::ok_msg("状态已更新"))
}

#[derive(Debug, Clone, Deserialize)]
pub struct UploadSignRequest {
    pub content_type: String,
    pub size: i64,
}

/// 为一张图片签发直传 COS 的预签名链接（只有管理员能调：路径在 `/moment/admin` 前缀下）。
/// skip(cos)：配置里有永久密钥，不进日志。
#[instrument(skip(cos))]
#[post("/admin/upload_sign")]
async fn api_admin_moment_upload_sign(
    req: web::Json<UploadSignRequest>,
    cos: web::Data<Option<CosConfig>>,
) -> Result<impl Responder, Exception> {
    let Some(cfg) = cos.get_ref().as_ref() else {
        return Err(Exception::BadRequest("未配置对象存储（COS_*），无法上传图片".to_string()));
    };
    let grant: UploadGrant = issue_upload(cfg, &req.content_type, req.size).await?;
    Ok(R::ok_obj(grant))
}
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    #[test]
    fn public_response_omits_internal_fields() {
````

替换为：

````rust
    // ---------- 上传签名接口（模拟 STS / COS，不需要数据库） ----------

    use crate::cos::test_support::{start_mock, test_config};
    use actix_web::test as actix_test;
    use actix_web::{http::StatusCode, App};
    use serde_json::{json, Value};

    macro_rules! sign_app {
        ($cos:expr) => {
            actix_test::init_service(
                App::new().app_data(web::Data::new($cos)).service(moment_scope()),
            )
            .await
        };
    }

    macro_rules! call_sign {
        ($app:expr, $body:expr) => {{
            let req = actix_test::TestRequest::post().uri("/moment/admin/upload_sign").set_json($body).to_request();
            let resp = actix_test::call_service(&$app, req).await;
            let status = resp.status();
            let body: Value = actix_test::read_body_json(resp).await;
            (status, body)
        }};
    }

    #[actix_web::test]
    async fn upload_sign_returns_a_grant_that_cos_accepts() {
        let (mock, base) = start_mock().await;
        let app = sign_app!(Some(test_config(&base)));
        let (status, body) = call_sign!(app, json!({ "content_type": "image/png", "size": 2048 }));
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["code"], 200);
        let obj = &body["obj"];
        assert_eq!(obj["content_type"], "image/png");
        let public_url = obj["public_url"].as_str().unwrap();
        assert!(public_url.starts_with("https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/moment/"), "{public_url}");
        assert!(public_url.ends_with(".png"), "{public_url}");

        // 用返回的链接真的 PUT 一次：模拟 COS 会重新验签
        let put = reqwest::Client::new()
            .put(obj["upload_url"].as_str().unwrap())
            .header("Content-Type", "image/png")
            .body(vec![0u8; 8])
            .send()
            .await
            .unwrap();
        assert_eq!(put.status(), 200);
        assert_eq!(mock.stored.lock().unwrap().len(), 1);
    }

    #[actix_web::test]
    async fn upload_sign_rejects_bad_requests_with_a_readable_message() {
        let (_mock, base) = start_mock().await;
        let app = sign_app!(Some(test_config(&base)));
        for (body, expect) in [
            (json!({ "content_type": "text/html", "size": 10 }), "不支持的图片类型"),
            (json!({ "content_type": "image/png", "size": 0 }), "图片大小须在"),
            (json!({ "content_type": "image/png", "size": 99_999_999 }), "图片大小须在"),
        ] {
            let (status, resp) = call_sign!(app, body);
            assert_eq!(status, StatusCode::BAD_REQUEST);
            assert!(resp["msg"].as_str().unwrap().contains(expect), "{resp}");
        }
    }

    #[actix_web::test]
    async fn upload_sign_without_cos_config_says_so() {
        let app = sign_app!(None::<CosConfig>);
        let (status, resp) = call_sign!(app, json!({ "content_type": "image/png", "size": 10 }));
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(resp["msg"], "未配置对象存储（COS_*），无法上传图片");
    }

    #[actix_web::test]
    async fn upload_sign_reports_sts_failure_without_leaking_details() {
        let (mock, base) = start_mock().await;
        mock.sts_fail.store(true, std::sync::atomic::Ordering::SeqCst);
        let app = sign_app!(Some(test_config(&base)));
        let (status, resp) = call_sign!(app, json!({ "content_type": "image/png", "size": 10 }));
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(resp["msg"], "获取上传授权失败，请查看后端日志");
    }

    #[test]
    fn image_check_helper_uses_the_configured_prefix() {
        let (cfg, _) = crate::cos::CosConfig::from_lookup(&|n| {
            [("COS_SECRET_ID", "i"), ("COS_SECRET_KEY", "k"), ("COS_BUCKET", "b-1250000000"), ("COS_REGION", "ap-nanjing")]
                .iter()
                .find(|(k, _)| *k == n)
                .map(|(_, v)| v.to_string())
        })
        .unwrap();
        let prefix = cfg.allowed_url_prefix();
        let data = web::Data::new(Some(cfg));
        let mut payload = MomentPayload {
            id: None,
            content: "x".into(),
            images: Some(vec![format!("{prefix}2026/11/a.jpg")]),
            is_public: 1,
            location: None,
            likes: None,
            comments: None,
            created_time: None,
            update_time: None,
        };
        assert!(check_images(&payload, &[], &data).is_ok());
        payload.images = Some(vec!["https://evil.example.com/a.jpg".into()]);
        assert!(matches!(check_images(&payload, &[], &data), Err(Exception::BadRequest(_))));
        // 同一个外链若是库里本来就有的，放行
        assert!(check_images(&payload, &["https://evil.example.com/a.jpg".to_string()], &data).is_ok());
        let unconfigured = web::Data::new(None::<CosConfig>);
        assert!(matches!(check_images(&payload, &[], &unconfigured), Err(Exception::BadRequest(_))));
    }

    #[test]
    fn public_response_omits_internal_fields() {
````

**新建 `src/moment/upload_e2e.rs`**，内容如下：

````rust
//! 说说图片 URL 校验的端到端测试：真实 MySQL（临时库）+ 真实的 `moment_scope()` 路由。
//!
//! 默认不跑。会 DROP / CREATE `moment` 表，所以库名必须含 "e2e"：
//!
//! ```text
//! mysql -uroot -p -e 'create database rust_blog_e2e default charset utf8mb4'
//! E2E_DATABASE_URL='mysql://root:密码@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
//!   cargo test upload_e2e -- --ignored --nocapture
//! mysql -uroot -p -e 'drop database rust_blog_e2e'
//! ```
//!
//! 这里没有登录态：测试直接挂 `moment_scope()`，不经过 `AuthFilter`（管理员鉴权由中间件负责，
//! 它对 `/moment/admin` 前缀的覆盖见 CLAUDE.md）。

use actix_web::http::StatusCode;
use actix_web::{test, web, App};
use rbatis::RBatis;
use serde_json::json;

use crate::cos::test_support::test_config;
use crate::cos::CosConfig;
use crate::moment::apis::moment_scope;
use crate::moment::{parse_images, Moment};
use crate::note_sync::sync_engine::value_to_i32;

const DDL: [&str; 2] = [
    "DROP TABLE IF EXISTS `moment`",
    "CREATE TABLE `moment` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `content` TEXT NOT NULL,
        `images` TEXT,
        `is_public` TINYINT NOT NULL DEFAULT 1,
        `location` VARCHAR(255),
        `likes` INT NOT NULL DEFAULT 0,
        `comments` INT NOT NULL DEFAULT 0,
        `created_time` BIGINT NOT NULL,
        `update_time` BIGINT,
        `is_deleted` TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

const LEGACY_1: &str = "https://legacy.example.com/a.jpg?token=1";
const LEGACY_2: &str = "https://legacy.example.com/b.png";

async fn setup() -> RBatis {
    let url = std::env::var("E2E_DATABASE_URL").expect("需要设置 E2E_DATABASE_URL");
    let dbname = url.rsplit('/').next().unwrap_or("").split('?').next().unwrap_or("");
    assert!(dbname.contains("e2e"), "拒绝在库名不含 e2e 的数据库上运行: {dbname}");
    let db = crate::config::init_rbatis(url).await;
    for ddl in DDL {
        db.exec(ddl, vec![]).await.expect("ddl");
    }
    db
}

macro_rules! app {
    ($db:expr, $cos:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($db.clone()))
                .app_data(web::Data::new($cos.clone()))
                .service(moment_scope()),
        )
        .await
    };
}

macro_rules! post_status {
    ($app:expr, $uri:expr, $body:expr) => {{
        let req = test::TestRequest::post().uri($uri).set_json($body).to_request();
        test::call_service(&$app, req).await.status()
    }};
}

async fn all_moments(db: &RBatis) -> Vec<Moment> {
    Moment::select_all(db).await.unwrap()
}

async fn images_of(db: &RBatis, id: i32) -> Vec<String> {
    let m = all_moments(db).await.into_iter().find(|m| m.id == Some(id)).expect("moment exists");
    parse_images(m.images)
}

async fn insert_legacy(db: &RBatis, images: &[&str]) -> i32 {
    let list: Vec<String> = images.iter().map(|s| s.to_string()).collect();
    let m = Moment::new("旧说说".to_string(), serde_json::to_string(&list).ok(), 1, None);
    value_to_i32(&Moment::insert(db, &m).await.expect("insert").last_insert_id)
}

#[actix_web::test]
#[ignore = "需要 E2E_DATABASE_URL 指向库名含 e2e 的临时库"]
async fn upload_e2e_scenarios() {
    // 与 moment_e2e 共用同一个临时库：串行化，避免两个测试同时 DROP / CREATE 同一张表
    let _guard = crate::config::E2E_DB_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let db = setup().await;
    let cfg: CosConfig = test_config("http://127.0.0.1:1"); // add / update 不会真的访问 COS
    let configured = Some(cfg.clone());
    let prefix = cfg.allowed_url_prefix();
    let good = |name: &str| format!("{prefix}2026/11/{name}.jpg");

    let app = app!(db, configured);

    // ① 新增：外链被拒，库里不落盘
    let status = post_status!(app, "/moment/admin/add", json!({
        "content": "带外链", "images": ["https://evil.example.com/x.jpg"], "is_public": 1
    }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "① 外链应被拒");
    assert!(all_moments(&db).await.is_empty(), "① 被拒的请求不能落盘");

    // ② 新增：上传位置下的地址通过，原样存进库
    let a = good("aaaa");
    let status = post_status!(app, "/moment/admin/add", json!({
        "content": "带图片", "images": [a], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "② 上传位置的地址应通过");
    let rows = all_moments(&db).await;
    assert_eq!(rows.len(), 1);
    let id_new = rows[0].id.unwrap();
    assert_eq!(images_of(&db, id_new).await, vec![a.clone()], "② 库里存完整 URL");

    // ③ 新增：试图借 `..` / `?` 逃出前缀被拒；超过 9 张被拒
    for bad in [format!("{prefix}../x.jpg"), format!("{prefix}a.jpg?x=1"), format!("{prefix}%2e%2e/x.jpg")] {
        let status = post_status!(app, "/moment/admin/add", json!({
            "content": "逃逸", "images": [bad], "is_public": 1
        }));
        assert_eq!(status, StatusCode::BAD_REQUEST, "③ {bad}");
    }
    let ten: Vec<String> = (0..10).map(|i| good(&format!("n{i}"))).collect();
    let status = post_status!(app, "/moment/admin/add", json!({ "content": "十张", "images": ten, "is_public": 1 }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "③ 超过 9 张");
    assert_eq!(all_moments(&db).await.len(), 1, "③ 被拒的请求不能落盘");

    // ④ 修改带旧外链的说说：保留旧链接并追加一张上传的 → 通过
    let legacy_id = insert_legacy(&db, &[LEGACY_1, LEGACY_2]).await;
    let b = good("bbbb");
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "改了正文", "images": [LEGACY_1, LEGACY_2, b], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "④");
    assert_eq!(images_of(&db, legacy_id).await, vec![LEGACY_1.to_string(), LEGACY_2.to_string(), b.clone()]);

    // ⑤ 修改时新增一个外链 → 被拒，库里保持原样
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "x", "images": [LEGACY_1, "https://evil.example.com/y.jpg"], "is_public": 1
    }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "⑤");
    assert_eq!(images_of(&db, legacy_id).await.len(), 3, "⑤ 被拒的更新不能改动图片");

    // ⑥ 只改正文、图片原样提交 → 通过（旧外链不受影响）
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "只改正文", "images": [LEGACY_1, LEGACY_2, b], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "⑥");

    // ⑦ 把图片全部删光 → 通过，旧图片真的从库里清掉。
    // rbatis 的 update_by_column 会跳过 None 列，所以这里存的是 "[]" 而不是 NULL
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "没图了", "images": [], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "⑦");
    let row = all_moments(&db).await.into_iter().find(|m| m.id == Some(legacy_id)).unwrap();
    assert_eq!(row.images.as_deref(), Some("[]"), "⑦ 删光图片后库里不能还留着旧图片");
    assert!(parse_images(row.images).is_empty());

    // ⑧ 没配对象存储：不带图片照常发；带新图片被拒；保留旧图片的修改仍然通过
    let unconfigured: Option<CosConfig> = None;
    let app = app!(db, unconfigured);
    let status = post_status!(app, "/moment/admin/add", json!({ "content": "纯文字", "is_public": 1 }));
    assert_eq!(status, StatusCode::OK, "⑧ 纯文字");
    let status = post_status!(app, "/moment/admin/add", json!({
        "content": "带图", "images": [a], "is_public": 1
    }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "⑧ 没配置时不能新增图片");
    let keep_id = insert_legacy(&db, &[LEGACY_1]).await;
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": keep_id, "content": "没配置也能改字", "images": [LEGACY_1], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "⑧ 保留旧图");
}
````

- [ ] **Step 2: 全量测试**

```bash
cargo test 2>&1 | grep -E '^test .*FAILED|^test result'
```

期望：只有那两个既有失败，`test result: FAILED. 168 passed; 2 failed; 2 ignored`。新增的 5 个测试：4 个走真实的 `moment_scope()` 路由 + 模拟 STS / COS 的 `upload_sign` 接口测试（成功并用返回的链接真的 PUT 一次、非法请求的提示、没配置 COS 的提示、STS 失败的提示），1 个 `check_images` 的单元测试。

- [ ] **Step 3: 端到端测试（临时库）**

这两个 `#[ignore]` 的端到端测试会 `DROP` / `CREATE` 库里的表，所以**库名必须含 `e2e`**，用一个临时库，跑完删掉。取 `.env` 里的库连接信息拼出连接串（不打印密码）：

```bash
# 取 .env 里的库连接信息，拼出临时库 rust_blog_e2e 的连接串（不打印密码）
eval "$(python3 -I - "$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" <<'PY'
import sys, shlex, urllib.parse as u
p = u.urlparse(sys.argv[1])
for k, v in [("DBUSER", p.username), ("DBPASS", u.unquote(p.password or "")),
             ("DBHOST", p.hostname), ("DBPORT", p.port or 3306), ("RAWPASS", p.password or "")]:
    print(f"{k}={shlex.quote(str(v))}")
PY
)"
export MYSQL_PWD="$DBPASS"
export E2E_DATABASE_URL="mysql://$DBUSER:$RAWPASS@$DBHOST:$DBPORT/rust_blog_e2e?charset=utf8mb4"
mysql -h"$DBHOST" -P"$DBPORT" -u"$DBUSER" -e 'create database if not exists rust_blog_e2e default charset utf8mb4'
```

```bash
# 过滤条件 e2e 会同时选中说说同步和图片校验两个端到端测试；不要跑不带过滤条件的 --ignored
cargo test e2e -- --ignored --nocapture 2>&1 | grep -E '^test |test result'
```

期望：`moment_e2e_scenarios ... ok`、`upload_e2e_scenarios ... ok`，`test result: ok. 2 passed`。`upload_e2e_scenarios` 的 8 个场景：外链被拒且不落盘；上传位置下的地址通过且原样存库；`..` / `?` / `%2e%2e` 逃逸与超过 9 张被拒；修改带旧外链的说说时保留旧链接并追加新图通过；修改时新增外链被拒且库里保持原样；只改正文通过；删光图片后库里真的清掉；没配对象存储时纯文字能发、带图被拒、保留旧图的修改仍通过。

- [ ] **Step 4: 变异检查（第 8～10 条）**

在上一步同一个终端（`E2E_DATABASE_URL` 已设置）里：

```bash
python3 -I "$TMPDIR/mutate.py" --all
```

期望 1～10 条全部 `✓`。第 8～10 条应当失败的测试：

| # | 改坏了什么 | 应当失败的测试 |
|---|---|---|
| 8 | 新增说说不再校验图片 | `moment::upload_e2e::upload_e2e_scenarios` |
| 9 | 修改说说不再校验图片 | `moment::upload_e2e::upload_e2e_scenarios` |
| 10 | 删光图片时存 NULL（旧图片清不掉） | `moment::upload_e2e::upload_e2e_scenarios` |

然后删掉临时库：

```bash
mysql -h"$DBHOST" -P"$DBPORT" -u"$DBUSER" -e 'drop database rust_blog_e2e'
```

- [ ] **Step 5: 重启后端，看启动日志**

用 `.claude/launch.json` 里的 `backend` 配置重启后端（它已带 `NOTE_SYNC_ENABLED=false`，不会碰真实的笔记仓库）。`.env` 里还没有 `COS_*`，所以日志里应当出现这样一行告警，后端照常启动：

```text
COS 图片上传未启用：缺少 COS_SECRET_ID（后台将无法上传说说图片，已有图片不受影响）
```

不带登录态直接调接口，应当被中间件挡住（上传接口只有管理员能调）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:9002/moment/admin/upload_sign \
  -H 'Content-Type: application/json' -d '{"content_type":"image/png","size":10}'
```

期望输出 `401`。（管理员权限靠 `/moment/admin` 前缀已在 `AppState.admin_route_prefixes` 里，与其它 `/moment/admin/*` 接口一致，没有新增前缀；已登录的管理员调用能否得到 400 +「未配置对象存储」的提示，留到 Task 3 的页面检查里看。）

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/main.rs \
  src/config.rs \
  src/note_sync/moment_e2e.rs \
  src/moment/mod.rs \
  src/moment/apis.rs \
  src/moment/upload_e2e.rs
git commit -F - <<'EOF'
feat(moment): 图片直传 COS 的签名接口，并校验新增的图片 URL

新增 POST /moment/admin/upload_sign（管理员），返回直传 COS 的预签名链接；/moment/admin/add|update
对新增的图片 URL 做校验，库里已有的旧 URL 原样放行。修改说说删光图片时存 "[]"：rbatis 的
update_by_column 会跳过 None 列，写 NULL 清不掉旧图片。新增端到端测试（临时库），两个端到端测试
共用一把串行锁。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


---

### Task 3: 后台前端

**Files:**
- Create: `front/ryu2u_blog_admin/src/admin/moments/cosUpload.ts`
- Modify: `front/ryu2u_blog_admin/src/common/Structs.ts`、`front/ryu2u_blog_admin/src/service/MomentService.ts`、`front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`

**Interfaces:**
- Consumes: Task 2 的 `POST /moment/admin/upload_sign`（经 `http_client`，响应拦截器返回 `Result`，`res.obj` 即 `UploadSign`）
- Produces: `MomentService.moment_upload_sign(content_type, size)`；`UploadSign` 类型；`cosUpload.putToCos(sign, file, onPercent)`；说说编辑弹窗里的图片上传组件

- [ ] **Step 1: 应用修改并新建文件**

几个要点（代码里已有注释）：

- 直传 COS 用 **XHR，不用 `http_client`**：`http_client` 的响应拦截器遇到「没有响应」的网络错误会跳转登录页，而 CORS 配置不对恰恰就是这种错误。XHR 也不带 cookie。
- 库里已有的图片（含旧的外链）转成「已完成」的文件项：能预览、能移除；提交时只取状态为 `done` 的。有图片上传失败时拦住保存并提示。
- 有文件在「上传中」时「确定」按钮置灰（`Form.useWatch` 盯着文件项状态）。
- 后端对 `upload_sign` 的 400 提示（类型不对、未配置 COS、授权失败……）由请求拦截器弹出，所以这里只在 PUT 失败时另外弹提示，避免重复。

**修改 `front/ryu2u_blog_admin/src/common/Structs.ts`**（查找的片段必须恰好出现一次）：

查找：

````ts
    likes!: number;
    comments!: number;
    created_time!: number;
    update_time?: number;
}
````

替换为：

````ts
    likes!: number;
    comments!: number;
    created_time!: number;
    update_time?: number;
}

// POST /moment/admin/upload_sign 的返回：浏览器 PUT upload_url 直传对象存储
export class UploadSign {
    upload_url!: string; // 预签名上传链接，5 分钟内有效
    public_url!: string; // 上传成功后图片的公开地址，存进说说
    content_type!: string; // PUT 时的 Content-Type 必须与它完全一致
    expires_at!: number; // 链接过期时间，Unix 毫秒
}
````

**修改 `front/ryu2u_blog_admin/src/service/MomentService.ts`**（查找的片段必须恰好出现一次）：

查找：

````ts
    moment_toggle_public(id: number): Promise<Result> {
        return http_client.post(`/moment/admin/toggle/public/${id}`);
    }
}
````

替换为：

````ts
    moment_toggle_public(id: number): Promise<Result> {
        return http_client.post(`/moment/admin/toggle/public/${id}`);
    },
    // 为一张图片申请直传对象存储的预签名链接，返回的 obj 是 UploadSign
    moment_upload_sign(content_type: string, size: number): Promise<Result> {
        return http_client.post(`/moment/admin/upload_sign`, { content_type, size });
    }
}
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
import {Badge, Button, Col, Form, Image, Input, Modal, Popconfirm, Row, Space, Switch, Table, TableProps, Tag, message} from "antd";
import {useEffect, useRef, useState} from "react";
import {Moment, PageInfo} from "../../common/Structs";
````

替换为：

````tsx
import {Badge, Button, Col, Form, Image, Input, Modal, Popconfirm, Row, Space, Switch, Table, TableProps, Tag, Upload, message} from "antd";
import type {UploadFile, UploadProps} from "antd";
import type {RcFile} from "antd/es/upload";
import {useEffect, useRef, useState} from "react";
import {Moment, PageInfo, UploadSign} from "../../common/Structs";
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
import MomentService from "../../service/MomentService";
````

替换为：

````tsx
import MomentService from "../../service/MomentService";
import {IMAGE_ACCEPT, IMAGE_TYPES, MAX_IMAGE_MB, MAX_IMAGES, putToCos} from "./cosUpload";
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
type MomentFormValues = {
    content: string;
    location?: string;
    images?: string;
    is_public: boolean;
};

function parseImageLines(value?: string): string[] {
    if (!value) {
        return [];
    }
    return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}
````

替换为：

````tsx
type MomentFormValues = {
    content: string;
    location?: string;
    images?: UploadFile[];
    is_public: boolean;
};

/** 库里已有的图片 URL → 上传组件里「已完成」的文件项（含旧的外链图片：可预览、可移除） */
function toUploadFiles(urls: string[] = []): UploadFile[] {
    return urls.map<UploadFile>((url, index) => ({
        uid: `existing-${index}`,
        name: url.split('?')[0].split('/').pop() || `image-${index + 1}`,
        status: 'done',
        url,
        type: 'image/*',
    }));
}

/** 上传组件的文件项 → 要提交的图片 URL：只取上传完成的 */
function toImageUrls(files: UploadFile[] = []): string[] {
    return files.filter((file) => file.status === 'done' && file.url).map((file) => file.url as string);
}

/** 上传成功的文件项：把后端给的 public_url 写进 url（Upload 默认只把 customRequest 的结果放在 response 里） */
function normalizeUploadEvent(event: UploadFile[] | { fileList: UploadFile[] }): UploadFile[] {
    const files = Array.isArray(event) ? event : event?.fileList ?? [];
    return files.map((file) =>
        file.status === 'done' && !file.url && file.response?.url ? { ...file, url: file.response.url } : file
    );
}
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
    const [form] = Form.useForm<MomentFormValues>();
````

替换为：

````tsx
    const [form] = Form.useForm<MomentFormValues>();
    const watchedImages = Form.useWatch('images', form);
    const uploading = (watchedImages ?? []).some((file) => file.status === 'uploading');
    const [previewUrl, setPreviewUrl] = useState('');
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
                images: (moment.images || []).join('\n'),
                is_public: moment.is_public === 1,
            });
        } else {
            setEditingMoment(null);
            form.resetFields();
            form.setFieldsValue({ is_public: true });
        }
````

替换为：

````tsx
                images: toUploadFiles(moment.images),
                is_public: moment.is_public === 1,
            });
        } else {
            setEditingMoment(null);
            form.resetFields();
            form.setFieldsValue({ is_public: true, images: [] });
        }
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
        form.validateFields().then((values) => {
            setLoading(true);
            const payload: Moment = {
                id: editingMoment?.id || 0,
                content: values.content,
                location: values.location || '',
                images: parseImageLines(values.images),
````

替换为：

````tsx
        form.validateFields().then((values) => {
            if ((values.images ?? []).some((file) => file.status === 'error')) {
                messageApi.warning('有图片上传失败，请重试或移除后再保存');
                return;
            }
            setLoading(true);
            const payload: Moment = {
                id: editingMoment?.id || 0,
                content: values.content,
                location: values.location || '',
                images: toImageUrls(values.images),
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
    const columns: TableProps<Moment>['columns'] = [
````

替换为：

````tsx
    const beforeUpload: UploadProps['beforeUpload'] = (file) => {
        if (!IMAGE_TYPES.includes(file.type)) {
            messageApi.error('仅支持 JPG / PNG / GIF / WebP 图片');
            return Upload.LIST_IGNORE;
        }
        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
            messageApi.error(`图片不能超过 ${MAX_IMAGE_MB} MB`);
            return Upload.LIST_IGNORE;
        }
        return true;
    };

    // 先向后端要预签名链接，再由浏览器直传对象存储（文件不经过后端）
    const uploadToCos: UploadProps['customRequest'] = async ({file, onSuccess, onError, onProgress}) => {
        const image = file as RcFile;
        let sign: UploadSign;
        try {
            const res = await MomentService.moment_upload_sign(image.type, image.size);
            sign = res.obj;
        } catch (error) {
            // 后端的提示（类型不对、未配置 COS、授权失败……）已经由请求拦截器弹出
            onError?.(error as Error);
            return;
        }
        try {
            await putToCos(sign, image, (percent) => onProgress?.({percent}));
            onSuccess?.({url: sign.public_url});
        } catch (error) {
            messageApi.error((error as Error).message);
            onError?.(error as Error);
        }
    };

    const columns: TableProps<Moment>['columns'] = [
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
                confirmLoading={loading}
                style={{ top: 20 }}
````

替换为：

````tsx
                confirmLoading={loading}
                okButtonProps={{ disabled: uploading }}
                style={{ top: 20 }}
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
                    <Form.Item
                        label="图片地址"
                        name="images"
                        extra="每行填写一个图片 URL，可为空"
                    >
                        <TextArea
                            rows={4}
                            placeholder={"https://example.com/1.jpg\nhttps://example.com/2.jpg"}
                        />
                    </Form.Item>
````

替换为：

````tsx
                    <Form.Item
                        label="图片"
                        name="images"
                        valuePropName="fileList"
                        getValueFromEvent={normalizeUploadEvent}
                        extra={`最多 ${MAX_IMAGES} 张，支持 JPG / PNG / GIF / WebP，单张不超过 ${MAX_IMAGE_MB} MB；图片直接上传到对象存储`}
                    >
                        <Upload
                            listType="picture-card"
                            accept={IMAGE_ACCEPT}
                            maxCount={MAX_IMAGES}
                            multiple
                            beforeUpload={beforeUpload}
                            customRequest={uploadToCos}
                            onPreview={(file) => setPreviewUrl(file.url || file.thumbUrl || '')}
                        >
                            <div>
                                <PlusOutlined />
                                <div style={{ marginTop: 8 }}>上传</div>
                            </div>
                        </Upload>
                    </Form.Item>
````

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
                </Form>
            </Modal>
````

替换为：

````tsx
                </Form>
                {previewUrl && (
                    <Image
                        wrapperStyle={{ display: 'none' }}
                        src={previewUrl}
                        preview={{
                            visible: true,
                            onVisibleChange: (visible) => {
                                if (!visible) {
                                    setPreviewUrl('');
                                }
                            },
                        }}
                    />
                )}
            </Modal>
````

**新建 `front/ryu2u_blog_admin/src/admin/moments/cosUpload.ts`**，内容如下：

````ts
import type {UploadSign} from "../../common/Structs";

/** 后台允许上传的图片类型。后端有同样的白名单，这里只是提前给出友好提示 */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');

/** 一条说说最多几张图 */
export const MAX_IMAGES = 9;

/** 单张上限（MB）。与后端 COS_MAX_IMAGE_MB 的默认值一致；后端配置不同时以后端的提示为准 */
export const MAX_IMAGE_MB = 5;

/**
 * 把文件直传到 COS（预签名链接），文件字节不经过后端。
 *
 * 注意：这里故意不用 axios 的 http_client——它的拦截器遇到「没有响应」的网络错误会跳转到登录页，
 * 而直传 COS 时 CORS 配置不对恰恰就是这种错误。XHR 默认也不带 cookie，不要设置 withCredentials。
 */
export function putToCos(sign: UploadSign, file: Blob, onPercent: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', sign.upload_url);
        // 必须与后端返回的 content_type 完全一致：它已经被签进链接
        xhr.setRequestHeader('Content-Type', sign.content_type);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onPercent(Math.round((event.loaded * 100) / event.total));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`上传失败（HTTP ${xhr.status}）`));
            }
        };
        // 浏览器不会暴露 CORS 失败的细节，只给一个没有响应的网络错误
        xhr.onerror = () => reject(new Error('上传失败，请检查桶的跨域（CORS）配置和网络'));
        xhr.ontimeout = () => reject(new Error('上传超时'));
        xhr.send(file);
    });
}
````

- [ ] **Step 2: 类型检查、构建、lint**

```bash
cd front/ryu2u_blog_admin
npx tsc --noEmit; echo "tsc exit: $?"
npm run build 2>&1 | tail -3
npm run lint 2>&1 | tail -4
cd ../..
```

期望：`tsc exit: 0`；构建以 `✓ built in …` 结束；`npm run lint` 末尾是 `✖ 29 problems (20 errors, 9 warnings)`——与改动前**完全一致**（既有问题，均不在本次新增的代码里；`npm run lint` 本来就带着这些错误退出码非 0）。构建会在 `front/ryu2u_blog_admin/dist/` 下生成产物，该目录已被 `.gitignore` 忽略。

- [ ] **Step 3: 在浏览器里看一遍（需要管理员登录态）**

后端已在 Task 2 重启过（新代码）；用 `.claude/launch.json` 的 `admin` 配置起后台前端（:8089），登录后进入「说说管理」。此时 `.env` 还没有 `COS_*`，所以能验证的是**页面行为**，真实上传留到 Task 5：

1. 点「发布说说」：弹窗里「图片」是一个「+ 上传」卡片，不再是文本域。
2. 编辑一条带图片的说说：旧图显示为缩略图；点放大镜能预览；点垃圾桶能移除。
3. 选一个非图片文件，或超过 5 MB 的图片：弹出提示，文件不进列表。
4. 选一张合法图片：缩略图变红（上传失败），页面弹出后端的提示「未配置对象存储（COS_*），无法上传图片」（来自请求拦截器），**不会跳转到登录页**；点「确定」被拦住，提示「有图片上传失败，请重试或移除后再保存」；移除这张图后可以正常保存。
5. 编辑一条带图片的说说，把图片全部移除再保存：重新打开应当没有图片了（Task 2 修掉的旧问题）。
6. 浏览器控制台没有新的报错。

如果这一步发现问题，先回到源码修，再重新 `npm run build` 和 `npm run lint`。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx \
  front/ryu2u_blog_admin/src/admin/moments/cosUpload.ts \
  front/ryu2u_blog_admin/src/common/Structs.ts \
  front/ryu2u_blog_admin/src/service/MomentService.ts
git commit -F - <<'EOF'
feat(admin): 说说图片改为上传到 COS

图片文本域换成 antd Upload（picture-card）：先向后端要预签名链接，再用 XHR 直传 COS，带进度；
库里已有的旧图片（含外链）可预览、可移除；上传中禁用确定，上传失败时拦住保存。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


---

### Task 4: 配置与文档

**Files:**
- Modify: `.env.example`、`CLAUDE.md`、`docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`
- Create: `docs/migrations/2026-11-04-moment-image-cos-upload.md`

- [ ] **Step 1: 应用修改并新建迁移文档**

设计文档的几处修订对应本计划开头「实现中发现的、对设计文档的补充」。迁移文档里的 CAM 策略、CORS 规则是上线时**你**要在腾讯云控制台做的事，权限路径要和 `COS_UPLOAD_PREFIX` 一致。

**修改 `.env.example`**（查找的片段必须恰好出现一次）：

查找：

````bash
NOTE_SYNC_API_BASE=
````

替换为：

````bash
NOTE_SYNC_API_BASE=

# ---- 说说图片上传到腾讯云 COS（浏览器直传，后端只发临时授权）----
# 前四项缺任意一个、桶名不是 <名称>-<APPID> 的形式、或 COS_UPLOAD_PREFIX 非法，上传功能就关闭
# （后台发不了新图片，已有图片不受影响），启动日志会说明原因。
# SecretId / SecretKey 用 CAM 子账号的永久密钥，且只授予 sts:GetFederationToken 与
# moment/* 的 name/cos:PutObject，见 docs/migrations/2026-11-04-moment-image-cos-upload.md
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=examplebucket-1250000000
COS_REGION=ap-nanjing
# 存进说说的图片地址前缀，可填 CDN / 自定义域名；留空 = https://<桶>.cos.<地域>.myqcloud.com
COS_PUBLIC_BASE=
# 对象键前缀，也是后台校验「新增图片地址」的前缀（只允许 A-Za-z0-9._/-）；要和 CAM 策略里的路径一致
COS_UPLOAD_PREFIX=moment/
# 单张图片上限（MB）；预签名上传链接的有效期（秒，最大 1800）
COS_MAX_IMAGE_MB=5
COS_SIGN_EXPIRE_SECS=300
# 仅供本地用模拟 STS / COS 做测试；非 https 只允许 localhost / 127.0.0.1 / [::1]。正常使用请留空
COS_STS_ENDPOINT=
COS_UPLOAD_BASE=
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
  cargo test moment_e2e -- --ignored --nocapture

# Frontend lint / typecheck+build
````

替换为：

````markdown
  cargo test moment_e2e -- --ignored --nocapture

# Moment image-URL validation end-to-end (same kind of throwaway database; it DROPs/CREATEs `moment`).
# The two e2e tests share a lock (`config::E2E_DB_LOCK`), so the `e2e` filter runs both safely
E2E_DATABASE_URL='mysql://user:pw@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
  cargo test e2e -- --ignored --nocapture

# Frontend lint / typecheck+build
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
**Key files**:
````

替换为：

````markdown
**`cos/` module** — 说说图片直传腾讯云 COS：浏览器直传，后端只发临时授权，文件字节不经过后端。`POST /moment/admin/upload_sign`（在 `moment/apis.rs`）校验类型（JPG/PNG/GIF/WebP）与大小 → 生成随机对象键 `moment/YYYY/MM/<32hex>.<ext>` → 用永久密钥（CAM 子账号）调 STS `GetFederationToken`（`sts.rs`，TC3-HMAC-SHA256；策略只允许 `PutObject` 到这一个对象，带大小/类型条件）→ 用临时密钥签出预签名 PUT 链接（`presign.rs`，COS sha1）→ 返回 `{upload_url, public_url, content_type, expires_at}`。`validate.rs` 的 `validate_image_urls` 在 `/moment/admin/add|update` 里校验**新增**的图片 URL：必须落在 `{COS_PUBLIC_BASE}/{COS_UPLOAD_PREFIX}` 之下，库里已有的旧 URL（含外链、仓库同步来的）原样放行。`COS_*` 未配置或不合法时 `CosConfig::from_env()` 返回 `None`（功能关闭，启动日志说明原因），`main.rs` 以 `web::Data<Option<CosConfig>>` 注册。仓库同步（`moment_sync.rs`）不校验、不改动。**rbatis 的 `update_by_column` 会跳过值为 `None` 的列**，所以修改说说时删光图片要存 `"[]"` 而不是 NULL。设计见 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`。

**Key files**:
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
everything else is `admin/*`)
````

替换为：

````markdown
everything else is `admin/*`, including `admin/upload_sign`)
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
- `NOTE_SYNC_API_BASE` — GitHub API 根地址，仅供本地模拟 GitHub 测试（非 https 只允许 localhost/127.0.0.1/[::1]），正常留空
````

替换为：

````markdown
- `NOTE_SYNC_API_BASE` — GitHub API 根地址，仅供本地模拟 GitHub 测试（非 https 只允许 localhost/127.0.0.1/[::1]），正常留空

腾讯云 COS 图片直传（`cos` 模块，见 `.env.example`；前四项缺任意一个、桶名不是 `<名称>-<APPID>`、或 `COS_UPLOAD_PREFIX` 非法，上传功能关闭）:
- `COS_SECRET_ID` / `COS_SECRET_KEY` — CAM 子账号的永久密钥，只用来调 STS（最小权限：`sts:GetFederationToken` + `moment/*` 的 `name/cos:PutObject`）
- `COS_BUCKET` / `COS_REGION` — 桶名（形如 `name-1250000000`，APPID 取最后一段数字）与地域
- `COS_PUBLIC_BASE` — 存进说说的图片地址前缀（默认 `https://<桶>.cos.<地域>.myqcloud.com`，可填 CDN / 自定义域名）
- `COS_UPLOAD_PREFIX` — 对象键前缀，也是后台校验新增图片地址的前缀（默认 `moment/`，只允许 `[A-Za-z0-9._/-]`）
- `COS_MAX_IMAGE_MB` — 单张上限（默认 5）；`COS_SIGN_EXPIRE_SECS` — 预签名链接有效期（默认 300，最大 1800）
- `COS_STS_ENDPOINT` / `COS_UPLOAD_BASE` — 仅供本地模拟 STS / COS 测试（非 https 只允许 localhost/127.0.0.1/[::1]），正常留空
````

**修改 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
返回 `TempCredentials { secret_id, secret_key, token, expired_at }`
````

替换为：

````markdown
返回 `TempCredentials { secret_id, secret_key, token }`（临时密钥的过期时间用不上：预签名链接自己的有效期更短，由 `COS_SIGN_EXPIRE_SECS` 决定）
````

**修改 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
- **状态**: 待评审
````

替换为：

````markdown
- **状态**: 已通过评审（2026-11-04）；实现计划见 `docs/superpowers/plans/2026-11-04-moment-image-cos-upload.md`
````

**修改 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
| 4 | 每个**新** URL 长度 ≤ 1024，不得为空，不得含空白字符、`?`、`#`，也不得含 `..` 路径段 | 防止借前缀匹配绕到前缀之外；本功能生成的 `public_url` 本身不含这些。已有 URL 不受此条约束 |
````

替换为：

````markdown
| 4 | 每个**新** URL 整条 ≤ 1024 字符；前缀之后的部分只能由 `[A-Za-z0-9._/-]` 组成（因此不含空白、`?`、`#`、`%`、`\` 和非 ASCII），不含 `.` / `..` 路径段，不以 `/` 结尾，且不为空 | 用白名单而不是黑名单，防止借前缀匹配绕到前缀之外（含 `%2e%2e`、`..\` 这类浏览器会当成上一级的写法）；本功能生成的 `public_url` 本身一定满足。已有 URL 不受此条约束 |
````

**修改 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
- 仓库同步（拉取新建 / 更新说说、写回仓库文件）**不校验也不改动**：`moment_sync.rs` 一行不改。
````

替换为：

````markdown
- 仓库同步（拉取新建 / 更新说说、写回仓库文件）**不校验也不改动**：`moment_sync.rs` 一行不改。

### 7.3.1 修改说说时「删光图片」要存 `"[]"`

rbatis 的 `update_by_column` 会**跳过值为 `None` 的列**：把 `images` 设成 `None`（空列表序列化的结果）再更新，库里仍是旧图片。所以 `api_admin_moment_update` 在图片列表为空时存 `"[]"` 而不是 NULL；`parse_images` 读 `"[]"` 得到空列表，公开接口与仓库同步（`moment_to_file`）都按「没有图片」处理。这是实现时在端到端测试里发现的：改动前后台就**无法**把一条说说的图片全部删掉，换成上传组件后这个问题会立刻暴露。
````

**修改 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
| 孤儿对象（上传了但没保存、或移除了图片） | 已接受 | 非目标（§2） |
````

替换为：

````markdown
| 孤儿对象（上传了但没保存、或移除了图片） | 已接受 | 非目标（§2） |
| 仓库同步的拉取路径有同样的 `None` 列问题：仓库文件里删掉图片行 / 位置后，库里不会被清空，下一轮写回还会把图片行加回仓库文件 | 已用端到端实验确认（与本功能无关，在 `moment_sync.rs` 里） | 已单独修复（提交 `3791aa7`：`save_moment` 显式写 NULL，端到端场景 ⑪ 覆盖），不属于本功能 |
````

**新建 `docs/migrations/2026-11-04-moment-image-cos-upload.md`**，内容如下：

````markdown
# 迁移文档：说说图片上传到腾讯云 COS

- **日期**：2026-11-04
- **适用对象**：已经部署了博客后端和后台前端的服务器
- **配套文档**：设计文档 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`

文中的 `<后台域名>`、`<桶域名>` 等都是**需要你替换成自己环境的值**。

---

## 0. 一分钟摘要

| 问题 | 答案 |
|---|---|
| 行为上改了什么？ | 后台编辑说说时，图片不再手填 URL，而是**选文件上传**：浏览器把文件直接传到腾讯云 COS，后端只负责签发一条 5 分钟有效、只能写一个对象的上传链接。 |
| 要改表结构吗？ | **不要。** `moment.images` 仍存完整的图片 URL。 |
| 要重新部署什么？ | **后端二进制** + **后台前端**。博客前端不用动。 |
| 要改 `.env` 吗？ | **要**。新增 `COS_*`（第 3 节）。不加也能启动，只是后台上传功能关闭。 |
| 要在腾讯云做什么？ | ① 建一个只有最小权限的 CAM 子账号和 API 密钥；② 给桶加一条 CORS 规则（**目前桶不允许浏览器 PUT**）。见第 1、2 节。 |
| 旧说说里手填的外链图片怎么办？ | 原样保留，编辑时可预览、可移除；只是**新增**的图片必须是上传得到的。 |
| 最需要留意的风险？ | ① 服务器时钟漂移超过 5 分钟，腾讯云会拒绝签发（第 5 节）；② 上传了又没保存的图片会留在桶里（不会自动清理）；③ 永久密钥放在服务器 `.env` 里，务必只给最小权限。 |
| 能回滚吗？ | 能。删掉 `.env` 里的 `COS_*` 即关闭上传，已有说说和图片不受影响；没有数据库迁移要撤销。 |

---

## 1. 在腾讯云创建最小权限的子账号

目的：就算 `.env` 里的永久密钥泄露，攻击者也只能往 `moment/` 下写文件，不能读、不能删、不能列桶。

1. 控制台 → **访问管理（CAM）** → 用户 → 新建用户（选「编程访问」），例如命名 `blog-uploader`。
2. 为它创建一条**自定义策略**（策略语法 → JSON），内容如下，并把策略授权给这个用户：

   ```json
   {
     "version": "2.0",
     "statement": [
       {
         "effect": "allow",
         "action": ["sts:GetFederationToken"],
         "resource": ["*"]
       },
       {
         "effect": "allow",
         "action": ["name/cos:PutObject"],
         "resource": ["qcs::cos:ap-nanjing:uid/1305537946:ryu2u-1305537946/moment/*"]
       }
     ]
   }
   ```

   其中 `ap-nanjing`、`1305537946`（APPID）、`ryu2u-1305537946`（桶名）、`moment/`（对象键前缀）都要和你的实际配置一致。
3. 记下这个用户的 **SecretId / SecretKey**（只显示一次），填进第 3 节的 `.env`。

> 后端每次上传都会再向腾讯云申请一份**更窄**的临时密钥（只能写这一个随机命名的对象，并限制大小和类型），所以子账号自己的权限是上限，不是实际授予浏览器的权限。

---

## 2. 给桶配置 CORS

浏览器直传 COS 是跨域请求，桶必须允许来自后台页面的 `PUT`。**不配的话上传一定失败**，后台会提示「请检查桶的跨域（CORS）配置」。

控制台 → 对象存储 → 存储桶 `ryu2u-1305537946` → 安全管理 → **跨域访问 CORS 设置** → 添加规则：

| 字段 | 取值 |
|---|---|
| 来源 Origin | 后台正式域名，如 `https://<后台域名>`；本地开发时再加一条 `http://localhost:8089` |
| 操作 Methods | `PUT` |
| Allow-Headers | `*` |
| Expose-Headers | `ETag` |
| 超时 Max-Age | `3600` |

配好后可以用只读的预检请求验证（不会写入任何对象）：

```bash
curl -s -o /dev/null -D - -X OPTIONS 'https://<桶域名>/moment/cors-check.jpg' \
  -H 'Origin: https://<后台域名>' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type'
```

期望返回 `HTTP/1.1 200`，并带有 `access-control-allow-origin` 响应头；返回 403 说明规则没生效或来源写错了。

---

## 3. 服务器 `.env`

在后端的 `.env` 里加（`.env.example` 里有同样的注释版本）：

```bash
COS_SECRET_ID=<第 1 节子账号的 SecretId>
COS_SECRET_KEY=<对应的 SecretKey>
COS_BUCKET=ryu2u-1305537946
COS_REGION=ap-nanjing
```

其余都有默认值，需要时再加：

| 变量 | 默认 | 说明 |
|---|---|---|
| `COS_PUBLIC_BASE` | `https://<桶>.cos.<地域>.myqcloud.com` | 存进说说的图片地址前缀；用了 CDN / 自定义域名时填那个域名 |
| `COS_UPLOAD_PREFIX` | `moment/` | 对象键前缀，也是后台校验新增图片地址的前缀；只允许 `A-Za-z0-9._/-`。**要和第 1 节策略里的路径一致** |
| `COS_MAX_IMAGE_MB` | `5` | 单张上限 |
| `COS_SIGN_EXPIRE_SECS` | `300` | 上传链接有效期，最大 1800 |

启动后看日志：

- 成功：`COS 图片上传已启用：bucket=… region=… prefix=…`
- 没配或配错：`COS 图片上传未启用：<原因>`（原因里会写缺哪个变量、桶名哪里不合法等）。此时后台仍可发不带新图片的说说。

---

## 4. 部署与验证

1. 部署新的后端二进制和后台前端；**数据库不用动**。
2. 后台 → 说说管理 → 发布说说 → 点「上传」选一张图：应当出现进度条，然后是缩略图。
3. 保存后到博客的「说说」页，图片应当能显示。
4. 开启了仓库双向同步的话，下一轮同步后，仓库 `说说/` 里对应的文件末尾会出现一行 `![](https://…/moment/…)`。
5. 在桶里确认对象落在 `moment/年/月/` 下，文件名是 32 位随机十六进制。

### 常见问题

| 现象 | 原因与处理 |
|---|---|
| 提示「未配置对象存储（COS_*）」 | `.env` 缺变量或桶名不合法，看启动日志里的原因 |
| 提示「获取上传授权失败，请查看后端日志」 | 看后端日志里 `申请 COS 临时密钥失败` 那一行，里面有腾讯云返回的错误码与 RequestId。常见：子账号缺 `sts:GetFederationToken` 权限（`AuthFailure` / `UnauthorizedOperation`）、密钥填错、时钟漂移（`AuthFailure.SignatureExpire`） |
| 上传时提示「请检查桶的跨域（CORS）配置」 | 第 2 节没配或来源写错 |
| 上传时提示「上传失败（HTTP 403）」 | 子账号没有该路径的 `PutObject` 权限，或 `COS_UPLOAD_PREFIX` 与策略路径不一致 |

---

## 5. 服务器时钟

腾讯云对签名请求有 **5 分钟**的时间容差。服务器时钟漂移超过这个范围，每次申请临时密钥都会失败。请确认服务器开着 NTP 校时：

```bash
timedatectl status        # 看 "System clock synchronized: yes"
```

---

## 6. 回滚

- **停用上传**：删掉（或注释）`.env` 里的 `COS_*`，重启后端。后台不能再新增图片；已有说说及其图片不受影响。
- **回到旧版本**：直接部署旧版后端和旧版后台。数据库没有改动，已存的图片 URL 在旧版里照样是文本域里的一行行地址。
- 子账号与 CORS 规则可以保留，也可以在控制台删除。
````

- [ ] **Step 2: 检查**

```bash
git diff --stat
git status --short
```

期望：除前面任务已提交的内容外，只有这几个文件有改动；`docs/superpowers/plans/` 下的本计划文件和设计文档本身此前是未跟踪的，这次一并提交。`.env`（含真实密钥）不应出现在 `git status` 里。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add .env.example \
  CLAUDE.md \
  docs/migrations/2026-11-04-moment-image-cos-upload.md \
  docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md \
  docs/superpowers/plans/2026-11-04-moment-image-cos-upload.md
git commit -F - <<'EOF'
docs: 说说图片上传到 COS 的配置说明、迁移文档、设计文档与实现计划

.env.example 与 CLAUDE.md 补充 COS_* 配置和 cos 模块；迁移文档写明 CAM 子账号、CORS、服务器时钟；
设计文档按实现修订（URL 校验改白名单、删光图片存 "[]"、记录同步路径同类旧问题的单独修复）。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


---

### Task 5（需要你的明确同意）：真实 STS / COS 联调冒烟

**这一步会用真实的腾讯云密钥调 STS，并在真实的桶里写入 1 个 70 字节的 PNG（第 ③ 步的大小限制若没生效会多写 1 个）。没有你明确说「可以跑」就不要执行；其余任务不依赖它。**

**Files:**
- Create: `src/cos/smoke.rs`
- Modify: `src/cos/mod.rs`、`CLAUDE.md`

**前置条件（需要你在腾讯云控制台和 `.env` 里先完成，步骤见迁移文档第 1～3 节）：**

1. CAM 子账号 + 最小权限策略 + API 密钥；
2. 本机 `.env` 里填好 `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION`；
3. 桶的 CORS 规则（含 `http://localhost:8089`）。

- [ ] **Step 1: 应用修改并新建冒烟测试**

测试默认被 `#[ignore]` 挡住，并且不带 `COS_SMOKE_CONFIRM=yes` 会直接拒绝运行。

**修改 `src/cos/mod.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
#[cfg(test)]
pub mod test_support;
````

替换为：

````rust
#[cfg(test)]
mod smoke;
#[cfg(test)]
pub mod test_support;
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
  cargo test e2e -- --ignored --nocapture
````

替换为：

````markdown
  cargo test e2e -- --ignored --nocapture

# Real Tencent STS/COS smoke test: writes ONE tiny object into the real bucket, needs COS_* in .env and
# the explicit confirm variable. Never run a bare `cargo test -- --ignored` (it would include this test)
COS_SMOKE_CONFIRM=yes cargo test cos_real_smoke -- --ignored --nocapture
````

**新建 `src/cos/smoke.rs`**，内容如下：

````rust
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
````

- [ ] **Step 2: 确认它在没有确认变量时拒绝运行（不会碰网络）**

```bash
cargo test cos_real_smoke -- --ignored 2>&1 | grep -E 'panicked|COS_SMOKE_CONFIRM'
```

期望：失败信息里有「加上 COS_SMOKE_CONFIRM=yes」。

- [ ] **Step 3: 得到你的同意后真跑**

```bash
COS_SMOKE_CONFIRM=yes cargo test cos_real_smoke -- --ignored --nocapture
```

它依次确认：① 向 STS 申请授权并上传成功（`Policy` 的 urlencode 写法被接受、`cos:content-type` 条件写法被接受）；② 通过公开地址读回，内容一致（桶公有读）；③ 声明 10 字节却上传 70 字节被拒（`cos:content-length` 条件在服务端真的生效）；④ 签的是 `image/png` 却以 `image/jpeg` 上传被拒（Content-Type 被签进链接）。

**如果失败，对照设计文档 §13 判断是哪一项，并同时改代码和对应的单元测试：**

| 现象 | 含义与处理 |
|---|---|
| ① 的 `向 STS 申请授权失败` 里是 `StrategyFormatError` / `InvalidParameter` 之类 | `Policy` 的 urlencode 次数不对：试试不编码、或编码两次，改 `sts::request_body` 和单元测试 `request_body_url_encodes_the_policy_once` |
| ① 授权成功但 PUT 得到 403 | 多半是 `cos:content-type` 条件写法不被接受：把策略里的 `string_equal` 条件去掉（类型仍被签进链接，浏览器换不了类型），改 `build_policy` 和 `policy_allows_exactly_one_put_with_limits` |
| ① 的 STS 错误里是 `AuthFailure.SignatureExpire` | 本机时钟漂移，先校时 |
| ① 的 STS 错误是 `UnauthorizedOperation` / `AuthFailure` | 子账号缺 `sts:GetFederationToken` 权限，或密钥填错 |
| ③ 没有被拒（得到 200） | 单个上限条件不生效：按官方「限制上传文件大小和类型」改成成对的 allow / deny 写法，并要求请求携带 `Content-Length`；改 `build_policy` 和对应的测试 |
| ② 读不到 | 桶不是公有读，或 `COS_PUBLIC_BASE` 配错 |

- [ ] **Step 4: 浏览器真实上传一次**

重启后端（让它读到 `.env` 里的 `COS_*`，日志应出现 `COS 图片上传已启用：…`），在后台说说页上传一张图并发布：有进度条、出现缩略图、博客「说说」页能看到图片。桶没配 CORS 时，页面应提示「上传失败，请检查桶的跨域（CORS）配置和网络」，并且**不会跳转到登录页**。

- [ ] **Step 5: 把结果写回设计文档 §13**

把 §13 里「未核实」的三项改成实测结论（或实际采用的写法），并去掉对应的「联调时确认」说明。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/cos/mod.rs \
  src/cos/smoke.rs \
  CLAUDE.md \
  docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md
git commit -F - <<'EOF'
test(cos): 真实 STS / COS 联调冒烟测试（#[ignore]，需确认变量）

用真实密钥确认 Policy 编码、cos:content-type / cos:content-length 条件在服务端真的生效；
联调结论写回设计文档 §13。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```


---

## 附录 A：测试向量的参考实现（Python 标准库，假密钥）

`cos::sts` 和 `cos::presign` 测试里的「黄金值」都由这个脚本算出，与 Rust 实现互相独立。需要重新生成时运行 `python3 -I golden.py`。其中两处标着「官方」的值与腾讯云官方文档给出的数值一致。

````python
"""腾讯云两套签名的独立参考实现（只用 Python 标准库），用来给 Rust 实现生成「黄金值」。
运行：python3 -I golden.py
所有密钥都是假的，只用于测试向量。"""
import hashlib, hmac, datetime, urllib.parse

def sha256_hex(s): return hashlib.sha256(s.encode()).hexdigest()
def sha1_hex(s): return hashlib.sha1(s.encode()).hexdigest()
def h256(key, msg): return hmac.new(key, msg.encode(), hashlib.sha256).digest()

# ---------- TC3-HMAC-SHA256（官方文档 CVM 示例；密钥换成假的） ----------
def tc3(secret_id, secret_key, service, host, action, ts, body):
    date = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime('%Y-%m-%d')
    ct = 'application/json; charset=utf-8'
    canon_headers = f'content-type:{ct}\nhost:{host}\nx-tc-action:{action.lower()}\n'
    signed = 'content-type;host;x-tc-action'
    canon = f'POST\n/\n\n{canon_headers}\n{signed}\n{sha256_hex(body)}'
    scope = f'{date}/{service}/tc3_request'
    sts = f'TC3-HMAC-SHA256\n{ts}\n{scope}\n{sha256_hex(canon)}'
    k = h256(('TC3' + secret_key).encode(), date)
    k = h256(k, service)
    k = h256(k, 'tc3_request')
    sig = hmac.new(k, sts.encode(), hashlib.sha256).hexdigest()
    auth = f'TC3-HMAC-SHA256 Credential={secret_id}/{scope}, SignedHeaders={signed}, Signature={sig}'
    return dict(date=date, hashed_payload=sha256_hex(body), canon=canon,
                hashed_canon=sha256_hex(canon), sts=sts, signature=sig, auth=auth)

OFFICIAL_BODY = '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}'
r = tc3('AKIDtestSecretId0123456789', 'testSecretKey0123456789abcdef', 'cvm',
        'cvm.tencentcloudapi.com', 'DescribeInstances', 1551113065, OFFICIAL_BODY)
print('== TC3 官方示例（假密钥）')
print('date          ', r['date'])
print('hashed_payload', r['hashed_payload'], '(官方: 35e9c5b0…f064)')
print('hashed_canon  ', r['hashed_canon'], '(官方: 7019a55b…1e84)')
print('signature     ', r['signature'])
print('authorization ', r['auth'])

# 另一组：UTC 日期边界（北京时间 2026-11-05 01:00 = UTC 2026-11-04 17:00）
import calendar
ts = calendar.timegm((2026, 11, 4, 17, 0, 0))
r2 = tc3('AKIDtestSecretId0123456789', 'testSecretKey0123456789abcdef', 'sts',
         'sts.tencentcloudapi.com', 'GetFederationToken', ts, '{"Name":"momentupload"}')
print('== TC3 UTC 边界 ts=', ts)
print('date          ', r2['date'])
print('signature     ', r2['signature'])

# ---------- COS sha1 ----------
OFFICIAL_HTTP_STRING = ('get\n/exampleobject(腾讯云)\n'
    'response-cache-control=max-age%3D600&response-content-type=application%2Foctet-stream\n'
    'date=Thu%2C%2016%20May%202019%2006%3A55%3A53%20GMT&host=examplebucket-1250000000.cos.ap-beijing.myqcloud.com\n')
print('== COS 官方示例 SHA1(HttpString)', sha1_hex(OFFICIAL_HTTP_STRING), '(官方: 54ecfe22…1e6)')

def enc(v): return urllib.parse.quote(v, safe='-_.~')
def cos_put(secret_id, secret_key, token, host, key, ct, now, expire):
    key_time = f'{now};{now + expire}'
    sign_key = hmac.new(secret_key.encode(), key_time.encode(), hashlib.sha1).hexdigest()
    http_string = f'put\n/{key}\n\ncontent-type={enc(ct)}&host={enc(host)}\n'
    sts = f'sha1\n{key_time}\n{sha1_hex(http_string)}\n'
    sig = hmac.new(sign_key.encode(), sts.encode(), hashlib.sha1).hexdigest()
    q = (f'q-sign-algorithm=sha1&q-ak={enc(secret_id)}&q-sign-time={enc(key_time)}&q-key-time={enc(key_time)}'
         f'&q-header-list={enc("content-type;host")}&q-url-param-list=&q-signature={sig}'
         f'&x-cos-security-token={enc(token)}')
    return dict(key_time=key_time, sign_key=sign_key, http_string=http_string,
                sha1_http=sha1_hex(http_string), sts=sts, sig=sig, query=q)

KEY = 'moment/2026/11/0123456789abcdef0123456789abcdef.jpg'
c = cos_put('AKIDtmpSecretId0123456789', 'tmpSecretKey0123456789abcdef', 'TOKEN+/=abc.def-ghi_jkl',
            'ryu2u-1305537946.cos.ap-nanjing.myqcloud.com', KEY, 'image/jpeg', 1793700000, 300)
print('== COS 预签名 PUT（假临时密钥）')
for k in ('key_time', 'sign_key', 'sha1_http', 'sig', 'query'):
    print(f'{k:10}', c[k])

# 带端口的测试主机：host 里的 : 要编码成 %3A
c2 = cos_put('AKIDtmpSecretId0123456789', 'tmpSecretKey0123456789abcdef', 'TOKEN',
             '127.0.0.1:18080', KEY, 'image/png', 1793700000, 300)
print('== COS 预签名 PUT（回环主机带端口）')
print('http_string', repr(c2['http_string']))
print('sig        ', c2['sig'])
````

## 附录 B：变异检查脚本

````python
"""变异检查：逐个把关键规则改坏，确认对应测试会失败，再还原。

用法（在项目根目录执行；脚本本身存在仓库之外，比如 $TMPDIR）：
    python3 -I mutate.py          # 只跑不需要数据库的 1~7
    python3 -I mutate.py --all    # 一并跑 8~10（需要先设置 E2E_DATABASE_URL，见 CLAUDE.md）
改坏的文件无论测试结果如何都会被还原。
"""
import os, re, subprocess, sys

ROOT = os.getcwd()

# (名字, 文件, 旧片段, 新片段, 测试过滤, 是否需要临时库)
MUTATIONS = [
    ('URL 前缀改成「包含」而不是「开头」', 'src/cos/validate.rs',
     'let Some(rest) = url.strip_prefix(prefix) else {',
     'let Some(rest) = url.find(prefix).map(|i| &url[i + prefix.len()..]) else {', 'cos::validate', False),
    ('旧 URL 不再放行', 'src/cos/validate.rs',
     'if existing.contains(url) {\n            continue;\n        }', 'if false {\n            continue;\n        }', 'cos::validate', False),
    ('STS 资源收窄被去掉（变成通配）', 'src/cos/mod.rs',
     'self.region, self.appid, self.bucket, key)', 'self.region, self.appid, self.bucket, "*")', 'cos::', False),
    ('图片类型白名单失效', 'src/cos/mod.rs',
     '.find(|(t, _)| *t == content_type)',
     '.find(|(t, _)| content_type.starts_with("image/") || *t == content_type)', 'cos::tests::upload_request', False),
    ('规范请求串里的 content-type 少了 charset', 'src/cos/sts.rs',
     'content-type:{CONTENT_TYPE}\\nhost', 'content-type:application/json\\nhost', 'cos::', False),
    ('凭证日期用了东八区而不是 UTC', 'src/cos/sts.rs',
     '.unwrap_or_default()\n        .format("%Y-%m-%d")',
     '.unwrap_or_default()\n        .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())\n        .format("%Y-%m-%d")',
     'cos::sts', False),
    ('预签名没有绑定 Content-Type', 'src/cos/presign.rs',
     'enc(content_type), enc(host))', 'enc("image/jpeg"), enc(host))', 'cos::', False),
    ('新增说说不再校验图片', 'src/moment/apis.rs',
     'check_images(&payload, &[], &cos)?;', 'let _ = &cos;', 'upload_e2e', True),
    ('修改说说不再校验图片', 'src/moment/apis.rs',
     'check_images(&payload, &parse_images(moment.images.clone()), &cos)?;', 'let _ = &cos;', 'upload_e2e', True),
    ('删光图片时存 NULL（旧图片清不掉）', 'src/moment/apis.rs',
     'Some(serialize_images(payload.images.clone()).unwrap_or_else(|| "[]".to_string()))',
     'serialize_images(payload.images.clone())', 'upload_e2e', True),
]

run_db = '--all' in sys.argv
if run_db and not os.environ.get('E2E_DATABASE_URL'):
    sys.exit('--all 需要先设置 E2E_DATABASE_URL')

missed = 0
for number, (name, path, old, new, flt, needs_db) in enumerate(MUTATIONS, 1):
    if needs_db and not run_db:
        print(f'- {number}. 跳过（加 --all 并设置 E2E_DATABASE_URL 才跑）: {name}')
        continue
    full = os.path.join(ROOT, path)
    original = open(full, encoding='utf-8').read()
    if original.count(old) != 1:
        print(f'✗ {number}. {name}：要改的片段出现 {original.count(old)} 次，代码和计划对不上')
        missed += 1
        continue
    try:
        open(full, 'w', encoding='utf-8').write(original.replace(old, new))
        cmd = ['cargo', 'test', flt] + (['--', '--ignored'] if needs_db else [])
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    finally:
        open(full, 'w', encoding='utf-8').write(original)
    output = result.stdout + result.stderr
    failed = sorted(set(re.findall(r'^test (\S+) \.\.\. FAILED', output, re.M)))
    compiled = 'could not compile' not in output
    caught = bool(failed) and compiled
    print(f'{"✓" if caught else "✗"} {number}. {name}')
    print(f'    失败的测试: {failed if failed else "（无！这条变异没有被抓住）"}{"" if compiled else "  [编译失败，变异写错了]"}')
    missed += 0 if caught else 1

print('全部变异都被测试抓住' if not missed else f'{missed} 条变异没有被抓住')
sys.exit(1 if missed else 0)
````
