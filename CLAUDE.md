# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Backend (Rust/Actix-web, listens on :8002)
cargo build
cargo run

# Public blog frontend (React/Vite, :8088)
cd front/ryu2u_blog && npm install && npm run dev

# Admin panel frontend (React/Vite, :8089)
cd front/ryu2u_blog_admin && npm install && npm run dev
```

## Architecture

This is a blog platform with a Rust/Actix-web backend and two separate React frontends.

### Backend (`src/`)

- **Framework**: Actix-web 4, single binary crate (not a workspace)
- **ORM**: rbatis 4.5 (MyBatis-style, uses macros like `crud!()` and `impl_select!()`)
- **Database**: MySQL (connection string in `.env` as `DATABASE_URL`)
- **Auth**: Cookie-based sessions via `actix-session`; bcrypt password hashing with legacy plaintext fallback that auto-upgrades on login
- **Markdown**: `pulldown-cmark` renders to HTML on save; both raw and rendered content stored in `post` table

**Module layout** — each domain module (`post/`, `user/`, `comment/`, `moment/`, `note_sync/`) follows the same pattern:
- `mod.rs` — module declarations
- `structs.rs` — rbatis model structs with `crud!()`/`impl_select!()` macros, DTOs, `PageInfo`
- `apis.rs` — Actix request handlers (route functions)

**`note_sync/` module** — GitHub 笔记单向同步 (pull-only, md_note repo → blog posts). Sub-modules: `github_client.rs` (REST + ETag 条件请求), `ai_client.rs` (AI 五字段解析/降级/URL 校验), `derive.rs` (本地差分引擎：建/改/删/复活), `sync_engine.rs` (应用循环 + 分类标签落库), `scheduler.rs` (tokio 定时轮询，启动 10s 后首轮，防重入), `crypto.rs` (AES-GCM 配置加密), `apis.rs` (管理接口 `GET/POST /note_sync/admin/config`、`POST /note_sync/admin/ai_test`). Driven entirely by `.env` `NOTE_SYNC_*` vars; state lives in tables `note_sync_map` (path→post 映射 + AI 元数据) and `note_sync_config` (AI 配置，API key AES 密文存储/掩码回显).

**Key files**:
- `main.rs` — entry point: initializes tracing, loads `.env`, connects rbatis, configures CORS/middleware/routes
- `config.rs` — `AppState` (wraps rbatis DB pool), generic `R<T>` response struct (`{code, msg, obj}`), `Exception` error enum
- `middleware.rs` — `AuthFilter` middleware: whitelist-based public route bypass, session-based auth, admin role check for `/admin` prefixed routes

**Route structure**: `/user`, `/post`, `/tag`, `/category`, `/comment`, `/moment`, `/note_sync` — each scope has public routes and admin-prefixed routes requiring auth+admin role.

**Response format**: All endpoints return `R<T>` — `{ "code": i32, "msg": String, "obj": T }`. Errors use `Exception` enum mapped to HTTP 400/404/500.

### Frontend (`front/`)

Two independent React 18 + TypeScript + Vite apps sharing the same dark terminal aesthetic:

- **`ryu2u_blog/`** — public blog (port 8088). Routes: `/home`, `/post/:id`, `/category`, `/category/:tag`
- **`ryu2u_blog_admin/`** — admin panel (port 8089). Routes: `/dashboard`, `/article`, `/comment`, `/user`, `/moments`

Both use Ant Design 5, Axios with `withCredentials: true`, and `@bytemd` for Markdown editing. API base URL is hardcoded to `http://localhost:8002` in their respective HttpClient/AxioConfig files.

### Database

10 MySQL tables defined in `schema.sql` (no migration tool — manual DDL only):
- `post` — blog posts with soft delete (`is_deleted`), stores both Markdown and HTML content
- `tag`, `category` — taxonomies with slug/priority fields; category has self-referential `parent_id`
- `PostTag`, `PostCategory` — many-to-many join tables
- `comment` — threaded comments with moderation status (0=pending, 1=approved, 2=rejected)
- `moment` — 说说/动态; `images` is a JSON array serialized into a TEXT column
- `tb_user` — users with role field (`"admin"` or `"user"`)
- `note_sync_map` — GitHub path → `post_id` 映射；`blob_sha`/`local_sha` 差分依据、`ai_*` 五字段元数据、`status`（ok/protected）
- `note_sync_config` — 单行（id=1）AI 配置：`ai_enabled`/`ai_base_url`/`ai_model`/`ai_api_key`（AES-GCM 密文）

Timestamps are stored as `bigint` epoch milliseconds (not SQL datetime). Use `crate::utils::time_utils::get_sys_time()` for current time.

### Auth Middleware

The `FilterWhiteList` in `main.rs` defines public routes. The wildcard syntax is: `*` matches one path segment, `**` matches all remaining segments. Admin routes (checked via `admin_route_prefixes` in `main.rs` — e.g. `/post/admin`, `/moment/admin`, `/note_sync/admin`) additionally require the user's `role` to be `"admin"`. A new admin route must be added to `admin_route_prefixes` explicitly; authentication alone is not enough.

## Environment Variables

Defined in `.env` at project root:
- `SERVER_IP`, `SERVER_PORT` — backend bind address
- `DATABASE_URL` — MySQL connection string
- `BLOG_ORIGIN`, `ADMIN_ORIGIN` — CORS allowed origins
- `SESSION_KEY` — cookie session encryption key
- `NOTE_SYNC_*` — GitHub 笔记同步（note_sync 模块）：
  - `NOTE_SYNC_ENABLED` — `true` 时启动后端轮询调度器
  - `NOTE_SYNC_REPO` — 仓库名（`owner/repo`，如 `Ryu2u/md_note`）
  - `NOTE_SYNC_BRANCH` — 分支（留空 = 仓库默认分支）
  - `NOTE_SYNC_TOKEN` — GitHub PAT（拉取私有仓库内容与提交时间）
  - `NOTE_SYNC_INTERVAL_MIN` — 轮询间隔（分钟，默认 30）
  - `NOTE_SYNC_ROOT` — 仓库内同步根目录（如 `笔记/`）
  - `NOTE_SYNC_EXCLUDE_DIRS` — 排除目录（逗号分隔，如 `.obsidian,.trash`）
  - `NOTE_SYNC_AUTHOR` — 同步文章的作者署名（写入 `post.author`，默认 Ryu2u）
  - `NOTE_SYNC_CATEGORY` — 同步文章的兜底分类名（默认「笔记」）
  - `NOTE_SYNC_MAX_FILE_KB` — 单文件大小上限（默认 1024）
  - `NOTE_SYNC_AI_ENC_KEY` — `note_sync_config.api_key` 的 AES-GCM 加密密钥（base64）
  - `NOTE_SYNC_AI_ALLOW_HTTP` — 是否允许 AI base_url 使用 http（0=仅 https，防 SSRF）

## Conventions

- rbatis macro syntax: `crud!(Model)` for basic CRUD, `impl_select!(Model { method(args) => "SQL" })` for custom queries. Use `#{param}` for parameterized values (not `${param}`).
- New API handler functions take `(db: web::Data<AppState>, ...)` and return `HttpResponse` using `R::ok()` / `R::err()`.
- To add a new public route, register it in the `FilterWhiteList` in `main.rs`; otherwise it requires authentication.
- The admin frontend directory has a typo: `comonents/` instead of `components/` — work with it as-is.
