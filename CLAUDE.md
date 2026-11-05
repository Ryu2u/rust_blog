# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Backend (Rust/Actix-web, port comes from .env SERVER_PORT — currently 9002)
cargo build
cargo run

# Public blog frontend (React/Vite, :8088)
cd front/ryu2u_blog && npm install && npm run dev

# Admin panel frontend (React/Vite, :8089)
cd front/ryu2u_blog_admin && npm install && npm run dev

# Tests — unit tests are inline `#[cfg(test)]` modules (there is no tests/ directory)
cargo test

# Moment two-way sync end-to-end (real MySQL + in-process mock GitHub). Needs a throwaway database
# whose name contains "e2e" — the test DROPs/CREATEs `moment` and `moment_sync_map` in it
E2E_DATABASE_URL='mysql://user:pw@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
  cargo test moment_e2e -- --ignored --nocapture

# Moment image-URL validation end-to-end (same kind of throwaway database; it DROPs/CREATEs `moment`).
# The two e2e tests share a lock (`config::E2E_DB_LOCK`), so the `e2e` filter runs both safely
E2E_DATABASE_URL='mysql://user:pw@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
  cargo test e2e -- --ignored --nocapture

# Real Tencent STS/COS smoke test: writes ONE tiny object into the real bucket, needs COS_* in .env and
# the explicit confirm variable. Never run a bare `cargo test -- --ignored` (it would include this test)
COS_SMOKE_CONFIRM=yes cargo test cos_real_smoke -- --ignored --nocapture

# Frontend lint / typecheck+build
npm run lint     # eslint, --max-warnings 0
npm run build    # tsc && vite build
```

The backend port is **not hardcoded in one place**: `.env` `SERVER_PORT` (9002) and the two frontends' hardcoded `http://localhost:9002` base URLs (`front/ryu2u_blog/src/common/HttpClient.ts`, `front/ryu2u_blog_admin/src/common/AxioConfig.tsx`) must be changed together.

## Architecture

Blog platform: one Rust/Actix-web backend + two independent React frontends.

### Backend (`src/`)

- **Framework**: Actix-web 4, single binary crate (not a workspace)
- **ORM**: rbatis 4.5 (MyBatis-style macros)
- **Database**: MySQL via `rbdc-mysql`; connection string in `.env` as `DATABASE_URL`
- **Auth**: JWT (`jsonwebtoken`) delivered in an **httpOnly cookie named `auth_token`** — there is no `actix-session` in this project. **The whole blog is login-gated**: only `/user/login` and `/user/logout` are public (`PUBLIC_PATHS` in `middleware.rs`); every other request needs a valid cookie **and** an existing, unlocked account (looked up in `tb_user` on every request, so locking a user takes effect immediately). Login is rate-limited in memory (`utils/login_guard.rs`) and uses bound SQL parameters only
- **Markdown**: `pulldown-cmark` renders to HTML on save; both raw and rendered content stored in `post`

**Module layout** — each domain module (`post/`, `user/`, `comment/`, `moment/`, `note_sync/`) follows the same pattern:
- `mod.rs` — module declarations
- `structs.rs` — rbatis model structs with `crud!()`/`impl_select!()` macros, DTOs, `PageInfo`
- `apis.rs` — Actix request handlers plus a `<domain>_scope()` fn that registers the module's routes

Modules: `user/`, `post/` (split into `apis.rs`, `tag_apis.rs`, `category_apis.rs`), `comment/`, `moment/` (说说/动态), plus `config.rs`, `middleware.rs`, `utils/` (`time_utils`, `utils`, `jwt_utils`).

**`note_sync/` module** — GitHub 笔记单向同步 (pull-only, md_note repo → blog posts). Sub-modules: `github_client.rs` (REST + ETag 条件请求), `ai_client.rs` (AI 五字段解析/降级/URL 校验), `derive.rs` (本地差分引擎：建/改/删/复活), `sync_engine.rs` (应用循环 + 分类标签落库), `scheduler.rs` (tokio 定时轮询，启动 10s 后首轮，防重入), `crypto.rs` (AES-GCM 配置加密), `apis.rs` (管理接口 `GET/POST /note_sync/admin/config`、`POST /note_sync/admin/ai_test`). **Synced posts are always shown (`is_view = 1`); sync never touches `is_view` on update, and the AI "public" judgment is only recorded in `note_sync_map` (`ai_is_view`/`ai_reason`) — hiding a post is only possible by hand in the admin.** Driven entirely by `.env` `NOTE_SYNC_*` vars; state lives in tables `note_sync_map` (path→post 映射 + AI 元数据) and `note_sync_config` (AI 配置，API key AES 密文存储/掩码回显).

**Moment two-way sync** (`moment_sync.rs`) — 仓库根目录 `说说/*.md` ↔ `moment` 表。文件名 `YYYY_MM_DD_HH_mm.md` 就是发布时间（固定 +08:00，同一分钟重名加 `_ss`、`-N`）；文件默认是纯文本，有位置/私密时才带 YAML 文件头（`location`、`public: false`），图片以 Markdown 图片行写在正文末尾（图片行之间允许空行，从末尾往上遇到正文文字就停）。映射表 `moment_sync_map`：`blob_sha` 判断仓库有没有变，`local_sha`（按库里数据渲染出的文本的 sha256）判断后台有没有变。每轮**先拉后推**，冲突时**仓库为准**（与笔记同步的「本地赢」相反，是有意的）；后台的发布/修改/删除随下一轮写回（`GithubClient::put_file` / `delete_file`，要求令牌有 Contents 写权限，写回每轮最多 50 个操作，403 时停止写回但拉取照常）。调度层（`scheduler.rs`）一轮只拉一次仓库树，交给笔记与说说两个阶段；树没变（304）时说说仍会跑写回。设计与规则见 `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`。

**`cos/` module** — 说说图片直传腾讯云 COS：浏览器直传，后端只发临时授权，文件字节不经过后端。`POST /moment/admin/upload_sign`（在 `moment/apis.rs`）校验类型（JPG/PNG/GIF/WebP）与大小 → 生成随机对象键 `moment/YYYY/MM/<32hex>.<ext>` → 用永久密钥（CAM 子账号）调 STS `GetFederationToken`（`sts.rs`，TC3-HMAC-SHA256；策略只允许 `PutObject` 到这一个对象，带大小/类型条件）→ 用临时密钥签出预签名 PUT 链接（`presign.rs`，COS sha1）→ 返回 `{upload_url, public_url, content_type, expires_at}`。`validate.rs` 的 `validate_image_urls` 在 `/moment/admin/add|update` 里校验**新增**的图片 URL：必须落在 `{COS_PUBLIC_BASE}/{COS_UPLOAD_PREFIX}` 之下，库里已有的旧 URL（含外链、仓库同步来的）原样放行。`COS_*` 未配置或不合法时 `CosConfig::from_env()` 返回 `None`（功能关闭，启动日志说明原因），`main.rs` 以 `web::Data<Option<CosConfig>>` 注册。仓库同步（`moment_sync.rs`）不校验、不改动。**rbatis 的 `update_by_column` 会跳过值为 `None` 的列**，所以修改说说时删光图片要存 `"[]"` 而不是 NULL。设计见 `docs/superpowers/specs/2026-11-04-moment-image-cos-upload-design.md`。

**Key files**:
- `main.rs` — entry: tracing, `.env`, rbatis init, CORS, `FilterWhiteList`, `AppState.admin_route_prefixes`, and the service scopes
- `config.rs` — `AppState`, generic `R<T>` response struct, `Exception` error enum, `ContentTypeGuard`, `init_rbatis`
- `middleware.rs` — `AuthFilter`: whitelist bypass → JWT verify → account status check → admin role check. It must stay **inside** the CORS middleware (`.wrap(AuthFilter)` before `.wrap(cors)` in `main.rs`) and return normal 401/403 responses instead of `Err`, otherwise rejected responses carry no CORS headers and browsers hide the status code from the frontend
- `src/utils/jwt_utils.rs` — `create_jwt` / `verify_jwt`, `AUTH_COOKIE_NAME`, claims (`sub`, `username`, `role`, `exp`)

**Routes** (scope → handlers): `/user` (`login`, `logout`, `me`, `get`, `admin/*`), `/post` (`get`, `page`, `list_by_category`, `admin/*`), `/tag`, `/category`, `/comment` (`add`, `list/{post_id}`, `admin/*`), `/moment` (`POST /moment/page` is open to any logged-in user — only `is_public=1` and not deleted, page_size ≤ 50; everything else is `admin/*`, including `admin/upload_sign`), `/note_sync` (`admin/config`, `admin/ai_test` only). Every mutation is a GET or POST — CORS only allows `GET, POST, OPTIONS`.

**Response format**: all handlers return `Result<impl Responder, Exception>` producing `R<T>` → `{ "code", "msg", "obj" }`. Handlers take `db: web::Data<RBatis>` (not `AppState`) as their data param; `AppState` only carries `app_name` and `admin_route_prefixes`. `Exception` maps to HTTP 400/500/404. Note `error_response` sets `ContentType::html()` even though the body is JSON.

### Adding an authenticated/admin endpoint

This is the easiest thing to get wrong — two separate lists in `main.rs` must both be updated:

1. **`FilterWhiteList`** — built from `PUBLIC_PATHS` in `src/middleware.rs`, which contains only `/user/login` and `/user/logout`. Paths not matching it require a valid `auth_token`, so **new endpoints are authenticated by default; do not add public ones**. Matching is segment-wise: `*` matches exactly one segment, `**` matches all remaining segments, and a whitelist entry also covers longer URLs with that prefix (`/comment/list` covers `/comment/list/5`).
2. **`AppState.admin_route_prefixes`** — after JWT verification, a request whose path `starts_with()` one of these entries is treated as an admin route. The current entries are verb-specific (`/post/admin`, `/post/add`, `/post/test/form`, `/tag/add`, `/tag/del`, `/tag/update`, `/comment/admin`, `/user/admin`, `/moment/admin`, `/note_sync/admin`), so a new admin route must be added here explicitly — being authenticated is not sufficient. Admin check queries `tb_user` per request and requires `role == "admin"` **and** `locked == 0`.

Failure modes are plain `ErrorUnauthorized` (401) / `ErrorForbidden` (403), not `R<T>`. `ContentTypeGuard` wraps all scopes but currently always returns `true` (no-op).

### Frontend (`front/`)

Two independent React 18 + TypeScript + Vite apps sharing a light, claude.ai-style design (cream `#faf9f5` background, terracotta `#c96442` accent, serif headings). Design tokens are CSS variables in `ryu2u_blog/src/index.scss` and `ryu2u_blog_admin/src/index.css` (the admin also mirrors them as antd tokens in `main.tsx`) — use the variables, not hardcoded colors. Light theme only; there is no dark mode:

- **`ryu2u_blog/`** — public blog (:8088). Routes: `/home`, `/post/:id`, `/category`, `/category/:tag`, `/moment` (defined inline in `App.tsx`, all inside the `RequireAuth` layout route), plus the public `/login`. Login state lives in `auth/AuthProvider.tsx` (`useAuth()` from `auth/authContext.ts`); a 401 from any request clears it
- **`ryu2u_blog_admin/`** — admin panel (:8089). Routes come from `common/routerConfig.tsx`, a `RouteConfig[]` that drives both the routes and the breadcrumbs; `App.tsx` flattens it. Paths: `/dashboard`, `/article`(`/list`, `/new`, `/edit/:id`), `/user/list`, `/user/edit/:id`, `/comment`, `/moments`, `/about`

Both use Ant Design 5, Axios, and `@bytemd` for Markdown. The admin app additionally uses a `useAjaxEffect`/`HttpEffectFragment` interceptor pair (`common/AxioConfig.tsx`) that redirects to `/login` on 401 and shows a message on 403.

### Database

11 MySQL tables defined in `schema.sql` (no migration tool — manual DDL only):
- `post` — soft delete (`is_deleted`), stores both Markdown and HTML content; content columns are `MEDIUMTEXT` (long notes exceed `TEXT`)
- `tag`, `category` — slug/priority fields; category has self-referential `parent_id`
- `PostTag`, `PostCategory` — many-to-many join tables (note the PascalCase table names — `crud!` needs the two-arg form for these)
- `comment` — threaded via `parent_id`, moderation `status` (0=pending, 1=approved, 2=rejected)
- `moment` — 说说/动态; `images` is a JSON array serialized into a `TEXT` column
- `tb_user` — `role` ("admin"/"user"), `locked` flag
- `note_sync_map` — GitHub path → `post_id` mapping: `blob_sha`/`local_sha` diff basis, `ai_*` metadata, `status` (`ok`/`conflicted`)
- `note_sync_config` — single row (id=1) AI config: `ai_enabled`/`ai_base_url`/`ai_model`/`ai_api_key` (AES-GCM ciphertext)
- `moment_sync_map` — 说说 ↔ 仓库文件映射：`moment_id`、`github_path` 各自唯一；`blob_sha`（仓库文件指纹）、`local_sha`（后台渲染文本指纹）

Timestamps are `bigint` epoch **milliseconds**, not SQL datetime. Use `crate::utils::time_utils::get_sys_time()`.

## Conventions

- rbatis macros: `crud!(Model)` for basic CRUD — use the two-arg form `crud!(User {}, "tb_user")` when the struct name differs from the table. `impl_select!(Model { method(args) => "`where ...`" })` for custom queries; use `#{param}` for bound values.
- Structs may declare fields that don't exist as columns (e.g. `Post.category` / `Post.tags`); they must be `None` on insert.
- `select_page_admin` in `post/structs.rs` interpolates its offset with `${offset}` rather than `#{}` — follow `#{}` in new queries.
- rbatis `update_by_column` **skips columns whose value is `None`**: setting a nullable field to `None` and updating does not clear it in the database (and leaves any in-memory fingerprint out of sync with the row). To clear a column, write NULL explicitly — see `save_moment` in `note_sync/moment_sync.rs`.
- Passwords: bcrypt with a legacy plaintext fallback that auto-upgrades the row to a bcrypt hash on successful login (`user/apis.rs`).
- **Keep secrets out of the logs** (three layers, all covered by tests):
  - Every `#[instrument]` on a function taking `db: web::Data<RBatis>` must skip it — `skip(db)`, `skip(db, cos)` or `skip_all`. `RBatis`'s `Debug` prints the connection URL's user and password. `src/log_guard.rs` scans `src/` and fails the tests naming the file and line when one is missing.
  - Types that carry passwords (`User`, `LoginDto`, `Post`) have hand-written `Debug` impls that print `***`. Add new fields to them too — tests check that every serialized field is listed.
  - SQL logging goes through `utils/sql_log.rs`: `RedactingLogInterceptor`, installed in `init_rbatis` in place of rbatis's default `LogInterceptor` (which prints every bound argument). It masks arguments bound to the columns in `SENSITIVE_COLUMNS` (`password`, `salt`, `ai_api_key`) and anything shaped like a bcrypt hash. Add new secret columns there. Query result rows are never printed.
- Frontend: the admin directory is misspelled `comonents/` instead of `components/` — work with it as-is. The public blog uses `components/`.

## Environment Variables

`.env` at project root: `SERVER_IP`, `SERVER_PORT` (9002), `DATABASE_URL`, `BLOG_ORIGIN`, `ADMIN_ORIGIN` (CORS allow-list), `JWT_SECRET`, `JWT_EXPIRE_HOURS` (default 12). Login protection (all optional): `LOGIN_MAX_FAIL_PER_IP` (10), `LOGIN_MAX_FAIL_PER_USER_IP` (5), `LOGIN_MAX_FAIL_PER_USER` (30), `LOGIN_WINDOW_MIN` (15), `LOGIN_LOCK_MIN` (15), `TRUST_PROXY_HEADER` (false — set true only behind a reverse proxy that appends the real client IP to `X-Forwarded-For`), `COOKIE_SECURE` (false — set true on HTTPS).

GitHub 笔记同步（`note_sync` 模块，见 `.env.example`）:
- `NOTE_SYNC_ENABLED` — `true` 时启动后端轮询调度器
- `NOTE_SYNC_REPO` — 仓库名（`owner/repo`）
- `NOTE_SYNC_BRANCH` — 分支（留空 = 仓库默认分支）
- `NOTE_SYNC_TOKEN` — GitHub PAT（fine-grained，目标仓库 Contents 读写）
- `NOTE_SYNC_INTERVAL_MIN` — 轮询间隔（分钟，默认 30）
- `NOTE_SYNC_ROOT` — 仓库内同步根目录（如 `笔记/`）
- `NOTE_SYNC_EXCLUDE_DIRS` — 排除目录（逗号分隔）
- `NOTE_SYNC_AUTHOR` — 同步文章作者署名
- `NOTE_SYNC_CATEGORY` — 兜底分类名（默认「笔记」）
- `NOTE_SYNC_MAX_FILE_KB` — 单文件大小上限（默认 1024）
- `NOTE_SYNC_AI_ENC_KEY` — `note_sync_config.ai_api_key` 的 AES-GCM 主密钥（`openssl rand -base64 32`）
- `NOTE_SYNC_AI_ALLOW_HTTP` — 是否允许 AI base_url 用 http（0=仅 https，防 SSRF）
- `NOTE_SYNC_MOMENT_DIR` — 说说双向同步的仓库目录（默认 `说说/`；设为空 = 关闭说说同步）
- `NOTE_SYNC_MOMENT_PUSH` — 是否把后台的说说改动写回仓库（默认 true；`false`/`0` = 只拉取）
- `NOTE_SYNC_API_BASE` — GitHub API 根地址，仅供本地模拟 GitHub 测试（非 https 只允许 localhost/127.0.0.1/[::1]），正常留空

腾讯云 COS 图片直传（`cos` 模块，见 `.env.example`；前四项缺任意一个、桶名不是 `<名称>-<APPID>`、或 `COS_UPLOAD_PREFIX` 非法，上传功能关闭）:
- `COS_SECRET_ID` / `COS_SECRET_KEY` — CAM 子账号的永久密钥，只用来调 STS（最小权限：`sts:GetFederationToken` + `moment/*` 的 `name/cos:PutObject`）
- `COS_BUCKET` / `COS_REGION` — 桶名（形如 `name-1250000000`，APPID 取最后一段数字）与地域
- `COS_PUBLIC_BASE` — 存进说说的图片地址前缀（默认 `https://<桶>.cos.<地域>.myqcloud.com`，可填 CDN / 自定义域名）
- `COS_UPLOAD_PREFIX` — 对象键前缀，也是后台校验新增图片地址的前缀（默认 `moment/`，只允许 `[A-Za-z0-9._/-]`）
- `COS_MAX_IMAGE_MB` — 单张上限（默认 5）；`COS_SIGN_EXPIRE_SECS` — 预签名链接有效期（默认 300，最大 1800）
- `COS_STS_ENDPOINT` / `COS_UPLOAD_BASE` — 仅供本地模拟 STS / COS 测试（非 https 只允许 localhost/127.0.0.1/[::1]），正常留空
