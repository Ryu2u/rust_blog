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

# Tests — there is no tests/ directory; the only tests are 2 #[test] fns in src/middleware.rs
cargo test

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
- **Auth**: JWT (`jsonwebtoken`) delivered in an **httpOnly cookie named `auth_token`** — there is no `actix-session` in this project
- **Markdown**: `pulldown-cmark` renders to HTML on save; both raw and rendered content stored in `post`

**Module layout** — each domain module (`post/`, `user/`, `comment/`, `moment/`, `note_sync/`) follows the same pattern:
- `mod.rs` — module declarations
- `structs.rs` — rbatis model structs with `crud!()`/`impl_select!()` macros, DTOs, `PageInfo`
- `apis.rs` — Actix request handlers plus a `<domain>_scope()` fn that registers the module's routes

Modules: `user/`, `post/` (split into `apis.rs`, `tag_apis.rs`, `category_apis.rs`), `comment/`, `moment/` (说说/动态), plus `config.rs`, `middleware.rs`, `utils/` (`time_utils`, `utils`, `jwt_utils`).

**`note_sync/` module** — GitHub 笔记单向同步 (pull-only, md_note repo → blog posts). Sub-modules: `github_client.rs` (REST + ETag 条件请求), `ai_client.rs` (AI 五字段解析/降级/URL 校验), `derive.rs` (本地差分引擎：建/改/删/复活), `sync_engine.rs` (应用循环 + 分类标签落库), `scheduler.rs` (tokio 定时轮询，启动 10s 后首轮，防重入), `crypto.rs` (AES-GCM 配置加密), `apis.rs` (管理接口 `GET/POST /note_sync/admin/config`、`POST /note_sync/admin/ai_test`). Driven entirely by `.env` `NOTE_SYNC_*` vars; state lives in tables `note_sync_map` (path→post 映射 + AI 元数据) and `note_sync_config` (AI 配置，API key AES 密文存储/掩码回显).

**Key files**:
- `main.rs` — entry: tracing, `.env`, rbatis init, CORS, `FilterWhiteList`, `AppState.admin_route_prefixes`, and the service scopes
- `config.rs` — `AppState`, generic `R<T>` response struct, `Exception` error enum, `ContentTypeGuard`, `init_rbatis`
- `middleware.rs` — `AuthFilter`: whitelist bypass → JWT verify → admin role check
- `src/utils/jwt_utils.rs` — `create_jwt` / `verify_jwt`, `AUTH_COOKIE_NAME`, claims (`sub`, `username`, `role`, `exp`)

**Routes** (scope → handlers): `/user` (`login`, `logout`, `get`, `admin/*`), `/post` (`get`, `page`, `list_by_category`, `admin/*`), `/tag`, `/category`, `/comment` (`add`, `list/{post_id}`, `admin/*`), `/moment` (`admin/*` only), `/note_sync` (`admin/config`, `admin/ai_test` only). Every mutation is a GET or POST — CORS only allows `GET, POST, OPTIONS`.

**Response format**: all handlers return `Result<impl Responder, Exception>` producing `R<T>` → `{ "code", "msg", "obj" }`. Handlers take `db: web::Data<RBatis>` (not `AppState`) as their data param; `AppState` only carries `app_name` and `admin_route_prefixes`. `Exception` maps to HTTP 400/500/404. Note `error_response` sets `ContentType::html()` even though the body is JSON.

### Adding an authenticated/admin endpoint

This is the easiest thing to get wrong — two separate lists in `main.rs` must both be updated:

1. **`FilterWhiteList`** — paths not matching this require a valid `auth_token`. Matching is segment-wise: `*` matches exactly one segment, `**` matches all remaining segments, and a whitelist entry also covers longer URLs with that prefix (`/comment/list` covers `/comment/list/5`).
2. **`AppState.admin_route_prefixes`** — after JWT verification, a request whose path `starts_with()` one of these entries is treated as an admin route. The current entries are verb-specific (`/post/admin`, `/post/add`, `/post/test/form`, `/tag/add`, `/tag/del`, `/tag/update`, `/comment/admin`, `/user/admin`, `/moment/admin`, `/note_sync/admin`), so a new admin route must be added here explicitly — being authenticated is not sufficient. Admin check queries `tb_user` per request and requires `role == "admin"` **and** `locked == 0`.

Failure modes are plain `ErrorUnauthorized` (401) / `ErrorForbidden` (403), not `R<T>`. `ContentTypeGuard` wraps all scopes but currently always returns `true` (no-op).

### Frontend (`front/`)

Two independent React 18 + TypeScript + Vite apps sharing a dark terminal aesthetic:

- **`ryu2u_blog/`** — public blog (:8088). Routes: `/home`, `/post/:id`, `/category`, `/category/:tag` (defined inline in `App.tsx`)
- **`ryu2u_blog_admin/`** — admin panel (:8089). Routes come from `common/routerConfig.tsx`, a `RouteConfig[]` that drives both the routes and the breadcrumbs; `App.tsx` flattens it. Paths: `/dashboard`, `/article`(`/list`, `/new`, `/edit/:id`), `/user/list`, `/user/edit/:id`, `/comment`, `/moments`, `/about`

Both use Ant Design 5, Axios, and `@bytemd` for Markdown. The admin app additionally uses a `useAjaxEffect`/`HttpEffectFragment` interceptor pair (`common/AxioConfig.tsx`) that redirects to `/login` on 401 and shows a message on 403.

### Database

10 MySQL tables defined in `schema.sql` (no migration tool — manual DDL only):
- `post` — soft delete (`is_deleted`), stores both Markdown and HTML content; content columns are `MEDIUMTEXT` (long notes exceed `TEXT`)
- `tag`, `category` — slug/priority fields; category has self-referential `parent_id`
- `PostTag`, `PostCategory` — many-to-many join tables (note the PascalCase table names — `crud!` needs the two-arg form for these)
- `comment` — threaded via `parent_id`, moderation `status` (0=pending, 1=approved, 2=rejected)
- `moment` — 说说/动态; `images` is a JSON array serialized into a `TEXT` column
- `tb_user` — `role` ("admin"/"user"), `locked` flag
- `note_sync_map` — GitHub path → `post_id` mapping: `blob_sha`/`local_sha` diff basis, `ai_*` metadata, `status` (`ok`/`conflicted`)
- `note_sync_config` — single row (id=1) AI config: `ai_enabled`/`ai_base_url`/`ai_model`/`ai_api_key` (AES-GCM ciphertext)

Timestamps are `bigint` epoch **milliseconds**, not SQL datetime. Use `crate::utils::time_utils::get_sys_time()`.

## Conventions

- rbatis macros: `crud!(Model)` for basic CRUD — use the two-arg form `crud!(User {}, "tb_user")` when the struct name differs from the table. `impl_select!(Model { method(args) => "`where ...`" })` for custom queries; use `#{param}` for bound values.
- Structs may declare fields that don't exist as columns (e.g. `Post.category` / `Post.tags`); they must be `None` on insert.
- `select_page_admin` in `post/structs.rs` interpolates its offset with `${offset}` rather than `#{}` — follow `#{}` in new queries.
- Passwords: bcrypt with a legacy plaintext fallback that auto-upgrades the row to a bcrypt hash on successful login (`user/apis.rs`).
- Frontend: the admin directory is misspelled `comonents/` instead of `components/` — work with it as-is. The public blog uses `components/`.

## Environment Variables

`.env` at project root: `SERVER_IP`, `SERVER_PORT` (9002), `DATABASE_URL`, `BLOG_ORIGIN`, `ADMIN_ORIGIN` (CORS allow-list), `JWT_SECRET`, `JWT_EXPIRE_HOURS` (default 12).

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
