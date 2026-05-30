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

**Module layout** — each domain module (`post/`, `user/`, `comment/`) follows the same pattern:
- `mod.rs` — module declarations
- `structs.rs` — rbatis model structs with `crud!()`/`impl_select!()` macros, DTOs, `PageInfo`
- `apis.rs` — Actix request handlers (route functions)

**Key files**:
- `main.rs` — entry point: initializes tracing, loads `.env`, connects rbatis, configures CORS/middleware/routes
- `config.rs` — `AppState` (wraps rbatis DB pool), generic `R<T>` response struct (`{code, msg, obj}`), `Exception` error enum
- `middleware.rs` — `AuthFilter` middleware: whitelist-based public route bypass, session-based auth, admin role check for `/admin` prefixed routes

**Route structure**: `/user`, `/post`, `/tag`, `/category`, `/comment` — each scope has public routes and admin-prefixed routes requiring auth+admin role.

**Response format**: All endpoints return `R<T>` — `{ "code": i32, "msg": String, "obj": T }`. Errors use `Exception` enum mapped to HTTP 400/404/500.

### Frontend (`front/`)

Two independent React 18 + TypeScript + Vite apps sharing the same dark terminal aesthetic:

- **`ryu2u_blog/`** — public blog (port 8088). Routes: `/home`, `/post/:id`, `/category`, `/category/:tag`
- **`ryu2u_blog_admin/`** — admin panel (port 8089). Routes: `/dashboard`, `/article`, `/comment`, `/user`, `/moments`

Both use Ant Design 5, Axios with `withCredentials: true`, and `@bytemd` for Markdown editing. API base URL is hardcoded to `http://localhost:8002` in their respective HttpClient/AxioConfig files.

### Database

7 MySQL tables defined in `schema.sql` (no migration tool — manual DDL only):
- `post` — blog posts with soft delete (`is_deleted`), stores both Markdown and HTML content
- `tag`, `category` — taxonomies with slug/priority fields; category has self-referential `parent_id`
- `PostTag`, `PostCategory` — many-to-many join tables
- `comment` — threaded comments with moderation status (0=pending, 1=approved, 2=rejected)
- `tb_user` — users with role field (`"admin"` or `"user"`)

Timestamps are stored as `bigint` epoch milliseconds (not SQL datetime). Use `crate::utils::time_utils::get_sys_time()` for current time.

### Auth Middleware

The `FilterWhiteList` in `main.rs` defines public routes. The wildcard syntax is: `*` matches one path segment, `**` matches all remaining segments. Admin routes (checked via `admin_route_prefixes`) additionally require the user's `role` to be `"admin"`.

## Environment Variables

Defined in `.env` at project root:
- `SERVER_IP`, `SERVER_PORT` — backend bind address
- `DATABASE_URL` — MySQL connection string
- `BLOG_ORIGIN`, `ADMIN_ORIGIN` — CORS allowed origins
- `SESSION_KEY` — cookie session encryption key

## Conventions

- rbatis macro syntax: `crud!(Model)` for basic CRUD, `impl_select!(Model { method(args) => "SQL" })` for custom queries. Use `#{param}` for parameterized values (not `${param}`).
- New API handler functions take `(db: web::Data<AppState>, ...)` and return `HttpResponse` using `R::ok()` / `R::err()`.
- To add a new public route, register it in the `FilterWhiteList` in `main.rs`; otherwise it requires authentication.
- The admin frontend directory has a typo: `comonents/` instead of `components/` — work with it as-is.
