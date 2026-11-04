# 说说图片上传到腾讯云 COS：设计文档

- **日期**: 2026-11-04
- **状态**: 已通过评审（2026-11-04）；实现计划见 `docs/superpowers/plans/2026-11-04-moment-image-cos-upload.md`
- **范围**: 后端新增 `cos/` 模块与 `POST /moment/admin/upload_sign`；后台「说说」页把图片地址文本域换成上传组件；后端对新提交的图片 URL 做校验。博客前端、数据库表结构、说说与仓库的同步代码**都不改**。
- **相关文档**: `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`（说说与 `md_note` 仓库的双向同步，本设计与它的关系见 §7.4）

---

## 1. 背景与目标

现状：

- 后端没有任何上传或对象存储代码；依赖里只有 `actix-easy-multipart`，被一个测试接口用着。
- 后台编辑说说时，图片是一个文本域，**每行手填一个 URL**；库里 `moment.images` 存成 JSON 数组；博客前端把这些 URL 原样交给 antd `Image` 渲染。
- 项目已经有一个腾讯云 COS 桶：`ryu2u-1305537946`，地域 `ap-nanjing`，**公有读、不可匿名列桶**（已用匿名 HEAD / 列桶请求验证）。博客前端里已有直接引用该桶对象的 URL。

目标：

1. 说说的图片只能通过**上传**进入：后台选文件，浏览器**直传** COS，文件不经过 Rust 后端。
2. 后端只负责发「临时授权」：为每个文件签发一条只能写**这一个对象**、有大小和类型限制、5 分钟内有效的预签名上传链接。
3. 库里仍存 COS 的完整公开 URL，博客前端和仓库同步都无需改动。
4. 后端对后台新提交的图片 URL 校验必须落在本功能的上传位置，杜绝手填外链；已有说说里的旧 URL 不受影响。

## 2. 非目标

- **不删 COS 对象。** 移除图片、删除说说都只改库。桶里可能留下孤儿对象；仓库里的说说文件也可能引用同一 URL，所以不自动清理。
- 不做缩略图、压缩、水印、CDN 配置；不改博客前端；不动文章（post）编辑器的图片。
- 不对上传内容做服务端检查（后端看不到文件字节）。类型和大小由 COS 服务端按策略强制，但「声明为 `image/jpeg` 的字节是不是真的 JPEG」不在保证范围内——上传接口只有管理员能调。
- 不迁移历史图片：旧 URL 原样保留。
- 不新增数据库表或字段。

## 3. 已确认的决策

| 决策 | 结论 |
|---|---|
| 对象存储 | 腾讯云 COS（用户写的「oos」按 COS 理解），现有桶 `ryu2u-1305537946` / `ap-nanjing` |
| 上传路径 | 浏览器**直传** COS；后端只发临时授权，不留本地文件，不中转字节 |
| 授权形式 | 后端调 STS 换「单对象」临时密钥，**自己签出预签名 PUT 链接**，只把 URL 交给浏览器；浏览器不接触任何密钥，前端不加依赖 |
| 图片来源 | 后台**只能上传**；后端对新提交的图片 URL 校验 |
| 读权限 | 桶公有读，库里存完整 URL，无需签名访问链接 |

## 4. 架构

### 4.1 上传流程

```
后台选图 ──① 本地检查类型/大小
   │
   ├─② POST /moment/admin/upload_sign { content_type, size }
   │        │  管理员登录态（现有中间件）
   │        ├─ 校验类型白名单 + 大小上限；未配置则提示
   │        ├─ 生成随机对象键 moment/YYYY/MM/<hex>.<ext>
   │        ├─ 调 STS GetFederationToken（策略：只允许 PutObject 到这一个键，带大小/类型条件）
   │        └─ 用临时密钥签出预签名 PUT URL → { upload_url, public_url, ... }
   │
   ├─③ 浏览器 PUT upload_url（body = 文件，Content-Type 与签名一致）──▶ COS 桶
   │
   └─④ 成功后把 public_url 加入表单；保存时走现有 /moment/admin/add|update
            └─ 后端校验图片 URL（§7）后落库
```

### 4.2 后端模块

新增 `src/cos/`，遵循项目模块布局：

| 文件 | 职责 |
|---|---|
| `mod.rs` | `CosConfig`（读环境变量，手写脱敏 `Debug`）、`issue_upload(cfg, content_type, size) -> UploadGrant`、对象键生成、STS 策略 JSON 构造、公开 URL 拼接 |
| `sts.rs` | 用 **TC3-HMAC-SHA256** 签名调用 `GetFederationToken`，返回 `TempCredentials { secret_id, secret_key, token }`（临时密钥的过期时间用不上：预签名链接自己的有效期更短，由 `COS_SIGN_EXPIRE_SECS` 决定） |
| `presign.rs` | 用临时密钥按 COS **sha1** 算法签出预签名 PUT URL |
| `validate.rs` | 纯函数 `validate_image_urls`（§7） |

- 路由 `POST /moment/admin/upload_sign` 注册在现有 `moment_scope()` 里（`src/moment/apis.rs`）。路径以 `/moment/admin` 开头，已在 `AppState.admin_route_prefixes` 里，**自动要求管理员**，`main.rs` 的前缀列表与白名单都不用改。
- 新增依赖：`hmac = "0.12"`、`sha1 = "0.10"`（RustCrypto，`sha2` 已有）。随机数、`percent-encoding`、`reqwest`（rustls）、`base64` 都已在依赖里。
- 后端不持有任何长期状态：临时密钥只存在于一次请求的内存里。

## 5. 接口契约

### 5.1 `POST /moment/admin/upload_sign`

请求：

```json
{ "content_type": "image/jpeg", "size": 183204 }
```

成功响应（项目统一的 `R<T>` 外壳，`obj` 为）：

```json
{
  "upload_url": "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/moment/2026/11/3f9c…a1.jpg?q-sign-algorithm=sha1&q-ak=…&q-sign-time=…&q-key-time=…&q-header-list=content-type%3Bhost&q-url-param-list=&q-signature=…&x-cos-security-token=…",
  "public_url": "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com/moment/2026/11/3f9c…a1.jpg",
  "content_type": "image/jpeg",
  "expires_at": 1793759100000
}
```

- `expires_at` 是链接过期的 Unix **毫秒**（与项目其它时间戳一致）。
- 浏览器必须用 `PUT` 访问 `upload_url`，请求头 `Content-Type` 必须**恰好等于**返回的 `content_type`（它已被签进链接）。

失败（沿用现有 `Exception`，不新增 HTTP 状态码；提示文案管理员可见）：

| 情形 | 提示 |
|---|---|
| `content_type` 不在白名单 | 「不支持的图片类型，仅支持 JPG / PNG / GIF / WebP」 |
| `size` ≤ 0 或超过上限 | 「图片大小须在 1 B ~ {上限} MB 之间」 |
| `COS_*` 必填项缺失 | 「未配置对象存储（COS_*），无法上传图片」 |
| STS 调用失败 | 「获取上传授权失败，请查看后端日志」；日志里记录腾讯云错误码、Message、RequestId，**不**记录任何密钥或令牌 |

## 6. 对象键、策略与签名

### 6.1 对象键

`{COS_UPLOAD_PREFIX}{YYYY}/{MM}/{32 位随机十六进制}.{ext}`，例如 `moment/2026/11/3f9c…a1.jpg`。

- 年月按 +08:00 取（与说说发布时间的惯例一致）。
- 32 位十六进制 = 16 字节随机数（`rand`），不可猜测、不会撞名。
- `ext` 只由 `content_type` 白名单映射：`image/jpeg→jpg`、`image/png→png`、`image/gif→gif`、`image/webp→webp`。**不使用客户端文件名。**
- 键里只会出现 `[A-Za-z0-9/._-]`：`COS_UPLOAD_PREFIX` 含其它字符时视为配置非法（按未配置处理，并在启动日志里告警）。所以链接里的路径与签名用的 `UriPathname` 都无需转义，两处写法一致（官方示例里签名用未编码路径、链接用编码路径，对本功能的键而言二者相同）。

### 6.2 STS 策略（每次上传一份）

```json
{
  "version": "2.0",
  "statement": [{
    "effect": "allow",
    "action": ["name/cos:PutObject"],
    "resource": ["qcs::cos:ap-nanjing:uid/1305537946:ryu2u-1305537946/moment/2026/11/3f9c…a1.jpg"],
    "condition": {
      "numeric_less_than_equal": { "cos:content-length": 183204 },
      "string_equal": { "cos:content-type": "image/jpeg" }
    }
  }]
}
```

- `resource` 精确到**单个对象键**，符合官方「前端直传临时密钥安全指引」的最小权限要求；`action` 只有 `PutObject`。
- 大小上限取**请求声明的 `size`**（已先校验 ≤ 全局上限），比全局上限更紧。
- APPID（`1305537946`）取桶名最后一个 `-` 之后的数字。
- 最终有效权限 = 调用账号（CAM 子账号）的权限 ∩ 这份策略，所以子账号自己也要有对应权限（§14）。

### 6.3 调 STS：`GetFederationToken`（TC3-HMAC-SHA256）

- 端点 `https://sts.tencentcloudapi.com/`，`POST`，JSON 体：

  ```json
  { "Name": "momentupload", "Policy": "<上面策略 JSON 做 urlencode 后的字符串>", "DurationSeconds": 1800 }
  ```

  `Name` 只能是字母；`DurationSeconds` 取默认/最小的 1800。`Policy` 按官方要求需要 urlencode，服务端会 urldecode。
- 公共参数（HTTP 头）：`X-TC-Action: GetFederationToken`、`X-TC-Version: 2018-08-13`、`X-TC-Region: {COS_REGION}`（该接口要求带 Region）、`X-TC-Timestamp: {当前 Unix 秒}`。
- 签名（官方「签名方法 v3」）：
  - `CanonicalRequest = "POST\n/\n\ncontent-type:{CT}\nhost:sts.tencentcloudapi.com\nx-tc-action:getfederationtoken\n\ncontent-type;host;x-tc-action\n{SHA256(body)}"`
  - `CredentialScope = {UTC 日期}/sts/tc3_request`；**日期必须由时间戳换算成 UTC**，用本地时区会导致凌晨必然失败
  - `StringToSign = "TC3-HMAC-SHA256\n{timestamp}\n{CredentialScope}\n{SHA256(CanonicalRequest)}"`
  - `SecretDate = HMAC("TC3"+SecretKey, 日期)`，`SecretService = HMAC(SecretDate, "sts")`，`SecretSigning = HMAC(SecretService, "tc3_request")`，`Signature = hex(HMAC(SecretSigning, StringToSign))`
  - `Authorization: TC3-HMAC-SHA256 Credential={SecretId}/{CredentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature={Signature}`
- **陷阱**：`Content-Type` 必须与签名时**逐字相同**（官方特别提醒有些网络库会自动补 `charset`）。`reqwest` 的 `.json()` 发的是不带 `charset` 的 `application/json`，所以实现里**显式设置** `Content-Type: application/json; charset=utf-8` 并以字符串发送请求体，不使用 `.json()`。
- **陷阱**：服务端时钟与标准时间相差超过 5 分钟，STS 必定拒绝（签名过期）。迁移文档里提醒服务器开 NTP。
- 响应：成功时读取 `Response.Credentials.{TmpSecretId, TmpSecretKey, Token}` 与 `Response.ExpiredTime`；失败时读取 `Response.Error.{Code, Message}` 与 `Response.RequestId`。
- 该接口**只接受永久密钥调用**，所以 `.env` 里放的是 CAM 子账号的永久密钥，且该子账号只授予最小权限（§14）。

### 6.4 预签名上传链接（COS sha1 签名）

用临时密钥签 `PUT`（官方文档明确建议预签名使用临时密钥）：

1. `KeyTime = "{now};{now + COS_SIGN_EXPIRE_SECS}"`（Unix 秒）
2. `SignKey = hex(HMAC-SHA1(TmpSecretKey, KeyTime))`（注意后面的 HMAC 用它的**十六进制字符串**当密钥，不是二进制）
3. `HttpString = "put\n/{对象键}\n\ncontent-type={urlencode(CT)}&host={桶域名}\n"`
4. `StringToSign = "sha1\n{KeyTime}\n{hex(SHA1(HttpString))}\n"`
5. `Signature = hex(HMAC-SHA1(SignKey, StringToSign))`
6. 链接 = `https://{桶域名}/{对象键}?q-sign-algorithm=sha1&q-ak={TmpSecretId}&q-sign-time={KeyTime}&q-key-time={KeyTime}&q-header-list=content-type;host&q-url-param-list=&q-signature={Signature}&x-cos-security-token={Token}`，其中各参数值按官方要求做 URL 编码（`;` 编成 `%3B`）。`x-cos-security-token` 附在链接上，不参与签名。

- 签进去的头部只有 `content-type` 与 `host`：绑定类型，且尽量少的签名头减少与浏览器实际请求不一致的风险；大小限制交给 STS 策略在服务端强制。
- 上传主机恒为 `{桶}.cos.{地域}.myqcloud.com`（`COS_UPLOAD_BASE` 仅测试时覆盖）；`COS_PUBLIC_BASE` 只影响返回的 `public_url`。

## 7. 图片 URL 校验

### 7.1 规则

作用位置：`/moment/admin/add` 与 `/moment/admin/update` 收到的 `images`。

| # | 规则 | 说明 |
|---|---|---|
| 1 | 每个**新** URL 必须以 `{public_base}/{upload_prefix}` 开头 | 「新」= 不在该说说库里已有的图片列表中；新增接口没有已有列表，所以全部都是新的 |
| 2 | 与该说说**库里已有图片完全相同**的 URL 放行 | 保留旧链接（含外链、仓库同步来的链接）；编辑其它字段时图片原样保留 |
| 3 | 总数 ≤ `max(9, 已有图片数)` | 原本就超过 9 张的（仓库同步来的）允许保持或减少，不允许增加 |
| 4 | 每个**新** URL 整条 ≤ 1024 字符；前缀之后的部分只能由 `[A-Za-z0-9._/-]` 组成（因此不含空白、`?`、`#`、`%`、`\` 和非 ASCII），不含 `.` / `..` 路径段，不以 `/` 结尾，且不为空 | 用白名单而不是黑名单，防止借前缀匹配绕到前缀之外（含 `%2e%2e`、`..\` 这类浏览器会当成上一级的写法）；本功能生成的 `public_url` 本身一定满足。已有 URL 不受此条约束 |
| 5 | 未配置 COS（取不到 `public_base`）时，规则 1 对任何新 URL 都判为不合法 | 即：没配对象存储就不能新增图片，已有图片仍可保留 |

失败返回 `BadRequest`，提示指出哪一条（如「图片地址不是通过上传得到的：…」）。

### 7.2 实现形态

纯函数 `validate_image_urls(new: &[String], existing: &[String], allowed_prefix: Option<&str>) -> Result<(), String>`，放在 `cos/validate.rs`，不依赖数据库与网络，单测覆盖每一条。`api_admin_moment_update` 已经会先读出该说说，把 `parse_images(row.images)` 作为 `existing` 传入；`api_admin_moment_add` 传空列表。

### 7.3 不校验的地方

- `toggle_public`、`delete` 不涉及图片。
- 仓库同步（拉取新建 / 更新说说、写回仓库文件）**不校验也不改动**：`moment_sync.rs` 一行不改。

### 7.3.1 修改说说时「删光图片」要存 `"[]"`

rbatis 的 `update_by_column` 会**跳过值为 `None` 的列**：把 `images` 设成 `None`（空列表序列化的结果）再更新，库里仍是旧图片。所以 `api_admin_moment_update` 在图片列表为空时存 `"[]"` 而不是 NULL；`parse_images` 读 `"[]"` 得到空列表，公开接口与仓库同步（`moment_to_file`）都按「没有图片」处理。这是实现时在端到端测试里发现的：改动前后台就**无法**把一条说说的图片全部删掉，换成上传组件后这个问题会立刻暴露。

### 7.4 与说说仓库双向同步的关系

图片在同步文件里是正文末尾的 `![](URL)` 行，URL 换成 COS 的 `https://…/moment/…` 后规则不变。因此：

- 后台上传发布的说说，下一轮同步写回仓库时，文件里的图片行就是 COS URL；
- 仓库里手写的外链图片行，拉回来后原样存入库里；之后在后台编辑这条说说时按规则 2 放行；
- 在后台把这条说说的图片全部删光再保存，仓库文件随下一轮同步被改写成无图片行。

## 8. 配置

`.env`（不入库）；`.env.example` 同步补充注释。

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `COS_SECRET_ID` | 是 | — | CAM 子账号的永久密钥 ID，只用来调 STS |
| `COS_SECRET_KEY` | 是 | — | 对应的 SecretKey |
| `COS_BUCKET` | 是 | — | `ryu2u-1305537946`；APPID 取最后一段数字 |
| `COS_REGION` | 是 | — | `ap-nanjing` |
| `COS_PUBLIC_BASE` | 否 | `https://{桶}.cos.{地域}.myqcloud.com` | 返回的 `public_url` 前缀，可填 CDN / 自定义域名；去掉末尾 `/` |
| `COS_UPLOAD_PREFIX` | 否 | `moment/` | 对象键前缀，规范成以 `/` 结尾、不以 `/` 开头；只允许 `[A-Za-z0-9._/-]`，含其它字符视为配置非法 |
| `COS_MAX_IMAGE_MB` | 否 | `5` | 单张上限；非法值回退默认 |
| `COS_SIGN_EXPIRE_SECS` | 否 | `300` | 预签名链接有效期 |
| `COS_STS_ENDPOINT` | 否 | `https://sts.tencentcloudapi.com` | **仅供本地用模拟 STS 测试**；非 https 只允许 `localhost` / `127.0.0.1` / `[::1]`，规则复用 `resolve_api_base` 的思路 |
| `COS_UPLOAD_BASE` | 否 | `https://{桶}.cos.{地域}.myqcloud.com` | **仅供本地用模拟 COS 测试**，规则同上 |

- 前四项缺任意一个、`COS_BUCKET` 不符合 `<名称>-<数字 APPID>` 的形式、或 `COS_UPLOAD_PREFIX` 非法，都算对象存储**未配置**，功能关闭（§5.1、§7.1 规则 5），并在启动日志里告警一次。
- `CosConfig` 手写 `Debug`，密钥字段输出 `***`；任何日志与错误信息不得包含 `SecretKey`、临时密钥、令牌或预签名链接的签名部分。

## 9. 后台前端

文件：`front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`、`src/service/MomentService`（新增方法）、`src/common/Structs.ts`（新增 `UploadSign` 类型）。

- 把「图片地址」文本域换成 antd `Upload`，`listType="picture-card"`，`maxCount={9}`，`accept` 只放四种图片类型。表单项 `images` 的值是 `string[]`（URL 数组），与现有提交结构一致。
- `beforeUpload`：本地检查类型白名单与 ≤ 5MB（不通过则提示并拒绝）。
- `customRequest`：① 调 `MomentService.moment_upload_sign(type, size)`；② 用 `XMLHttpRequest` `PUT` 到 `upload_url`，`setRequestHeader('Content-Type', 返回的 content_type)`，`upload.onprogress` 驱动进度条；③ 成功后把 `public_url` 写回文件项。
- 编辑已有说说时，旧图（包括外链）显示为已完成缩略图：可预览；可删除（仅从这条说说里去掉）。
- 有文件处于「上传中」时禁用弹窗「确定」。
- PUT 在网络层失败且没有响应（浏览器对 CORS 失败不暴露细节）时，提示「上传失败，请检查桶的跨域（CORS）配置」；有 HTTP 响应时提示状态码。
- 现有的「说说会与笔记仓库双向同步……」那行说明保留。
- 列表页的缩略图展示、博客前端的渲染都不动。

## 10. 错误处理与安全

- **仅管理员**可调签名接口（中间件现有逻辑）。接口本身再无其它鉴权。
- **纵深防御**：随机对象键 + 单对象授权 + 类型与大小由 COS 服务端按 STS 策略强制 + 类型同时签进链接 + 链接 5 分钟过期 + 后端落库前再校验 URL。
- **密钥处理**：永久密钥只在 `.env` 与进程内存里；临时密钥只活在一次请求里，用完即弃，不落库、不进日志；手写脱敏 `Debug`；`#[instrument]` 用 `skip(...)` 排除含密钥的参数。
- **永久密钥泄露的影响面**由子账号的最小权限限定：只能调 `GetFederationToken`，且最终只能对 `moment/*` 做 `PutObject`；不能读、不能删、不能列桶。
- **已知接受的风险**：同一条链接在 5 分钟内可重复使用，覆盖同一个随机键；该键只回给管理员本人。

## 11. 测试

### 11.1 单元测试（纯函数，`#[cfg(test)]` 内联）

- **TC3 签名**：
  - 对官方示例里**不依赖密钥**的中间值逐项核对：`HashedRequestPayload = 35e9c5b0…f064`、`HashedCanonicalRequest = 7019a55b…1e84`；
  - 密钥相关的 HMAC 链，用 Python 标准库（`hmac`/`hashlib`）对固定输入算出「黄金值」写进测试，作为跨语言的独立实现对照。
- **COS 预签名**：官方示例里 `SHA1(HttpString) = 54ecfe22f59d3514fdc764b87a32d8133ea611e6` 可复现；`SignKey` / `Signature` 同样用 Python 黄金值；另测 `;`→`%3B`、`q-header-list`、`x-cos-security-token` 的拼接。
- **STS 策略 JSON**：资源恰好一个对象、`action` 只有 `PutObject`、条件里的大小等于声明值、类型正确；`Policy` 字段的 urlencode。
- **对象键**：格式、年月取 +08:00、`ext` 映射、两次生成不同、只含允许字符。
- **类型/大小校验**、**`validate_image_urls` 全部分支**（规则 1–5 的合法与非法，含 `?` / `#` / `..` / 空白、旧 URL 保留、超过 9 张、原本超 9 张只减不增）、**配置解析**（默认值、非法 `COS_MAX_IMAGE_MB` 回退、`COS_PUBLIC_BASE` 去尾斜杠、非法 `COS_STS_ENDPOINT` 被拒、APPID 从桶名解析）。

### 11.2 进程内集成测试（actix 模拟）

- 模拟 STS：校验收到的 `Authorization` 结构、`X-TC-*` 头与 `Content-Type` 是否逐字一致，返回固定的临时凭证。
- 模拟 COS：对到来的 `PUT`，按文档算法用同一把临时密钥**重新验签**，并检查 `Content-Type` 与签名一致。
- 用例：`issue_upload` → 取返回的 `upload_url` → `PUT` → 模拟 COS 验签通过；改动 URL 任一参数 / 换 `Content-Type` → 验签失败。
- 新增 / 修改说说接口的 URL 校验沿用上次的做法，在 `#[ignore]` 的端到端测试里用临时库（库名必须含 `e2e`）跑。

### 11.3 变异检查

把下面几处各自临时改坏，确认对应测试会失败，再还原：URL 前缀校验、旧 URL 放行、`resource` 收窄到单对象、类型白名单、`CanonicalRequest` 里的 `content-type`、UTC 日期。

### 11.4 自动化覆盖不到的：可选的手动冒烟

真实 STS 与 COS 联调，需要子账号密钥与桶的 CORS 配置，**必须先得到用户明确同意**。用来确认 §13 里标为「未核实」的几点。

## 12. 验收标准

1. 后台编辑说说时能选图上传，有进度，成功后出现缩略图；保存后博客「说说」页能看到图片。
2. 库里 `images` 存的是 `COS_PUBLIC_BASE/COS_UPLOAD_PREFIX…` 形式的完整 URL。
3. 直接调用 `/moment/admin/add` 提交非上传位置的外链 → 400；编辑一条带旧外链的说说并保存 → 通过且旧链接保留。
4. 未配置 `COS_*`：签名接口给出明确提示，后台仍可发不带新图片的说说。
5. 超过大小 / 类型不对 / 把链接上的参数或 `Content-Type` 改掉再 PUT → COS 拒绝。
6. 开启仓库同步时，后台上传发布的说说下一轮写回仓库，文件末尾的图片行是 COS URL。
7. `cargo test` 全绿（除两个改动前就失败的老测试）；`#[ignore]` 的端到端测试在临时库上通过；后台 `tsc` / `build` 通过，lint 问题数不增加。
8. 任何日志里都搜不到 `SecretKey` / 临时密钥 / 令牌 / 预签名的签名串。

## 13. 风险与未核实项

| 项 | 状态 | 处理 |
|---|---|---|
| 官方 STS `GetFederationToken` 的参数、返回结构、只接受永久密钥、权限为交集 | **已核实**（官方接口文档） | — |
| TC3-HMAC-SHA256 签名步骤与陷阱（UTC 日期、`Content-Type` 逐字一致、5 分钟时钟） | **已核实**（官方「签名方法 v3」） | 实现时用不含密钥的中间值与 Python 黄金值测试 |
| COS sha1 签名与预签名 URL 的写法（`x-cos-security-token` 附在链接上、可签 `Content-Type`） | **已核实**（官方「请求签名」） | 同上 |
| 用 `cos:content-length` 在 STS 策略里限制大小、资源收窄到单对象 | **已核实**（官方「限制上传文件大小和类型」「前端直传安全指引」） | 官方示例里条件常与 allow/deny 成对出现并要求请求携带 `Content-Length`；若联调发现单个上限条件不生效，改成官方的成对写法 |
| `cos:content-type` 条件在 **STS 策略 JSON** 里的确切写法 | **未核实**（官方只给了控制台策略示例） | 联调时确认；即使该条件不生效，类型仍被签进链接，浏览器无法换类型，风险低 |
| `Policy` 在 JSON 请求体里是**单次** urlencode（官方 GET 示例是两次，因为整个 URL 又编码一次） | **未核实** | 联调时确认；错了会得到 `StrategyFormatError` 一类错误，易发现 |
| STS 失败响应的 `Response.Error` 结构 | API 3.0 的通用格式，**未逐项核实** | 联调时确认 |
| 桶 CORS | **目前未放行 PUT**（对已有对象发 `PUT` 预检，来自 `http://localhost:8089` 与另一个域名都返回 403） | 上线前必须配置（§14）；后台对网络层失败给出提示 |
| 服务器时钟漂移 | 已知必现风险 | 迁移文档要求开 NTP |
| 孤儿对象（上传了但没保存、或移除了图片） | 已接受 | 非目标（§2） |
| 仓库同步的拉取路径有同样的 `None` 列问题：仓库文件里删掉图片行 / 位置后，库里不会被清空，下一轮写回还会把图片行加回仓库文件 | 已用端到端实验确认（与本功能无关，在 `moment_sync.rs` 里） | 已单独修复（提交 `3791aa7`：`save_moment` 显式写 NULL，端到端场景 ⑪ 覆盖），不属于本功能 |

## 14. 上线与运维

以下步骤需要**用户**在腾讯云控制台与服务器上完成：

1. **建 CAM 子账号**（例如 `blog-uploader`），只授予两条权限，并为它创建 API 密钥：
   - `sts:GetFederationToken`
   - `name/cos:PutObject`，资源 `qcs::cos:ap-nanjing:uid/1305537946:ryu2u-1305537946/moment/*`
2. **给桶加 CORS 规则**：来源 = 后台正式域名（开发时再加 `http://localhost:8089`）；方法 `PUT`；允许的头部 `*`；暴露的头部 `ETag`；`MaxAge` 3600。
3. **服务器 `.env`** 加 `COS_*`（§8）。
4. **部署**后端与后台前端。**数据库无改动。**
5. **验证**：后台上传一张图并发布，博客页能看到；仓库同步开启时，下一轮同步后仓库的说说文件里出现对应图片行。

回滚：删掉 `.env` 里的 `COS_*` 即关闭上传，已有说说与图片不受影响；旧版后端对此无感，没有迁移要撤销。

---

## 参考文档（官方）

- 请求签名（COS）：https://cloud.tencent.com/document/product/436/7778
- 签名方法 v3（TC3-HMAC-SHA256）：https://cloud.tencent.com/document/api/213/30654
- 获取联合身份临时访问凭证 `GetFederationToken`：https://cloud.tencent.com/document/product/1312/48195
- 限制上传文件大小和类型：https://cloud.tencent.com/document/product/436/54370
- 用于前端直传 COS 的临时密钥安全指引：https://cloud.tencent.com/document/product/436/40265
- 生成预签名 URL：https://cloud.tencent.com/document/product/436/35217
