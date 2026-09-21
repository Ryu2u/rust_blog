# GitHub 笔记同步 Phase 1（拉取 + AI 元数据层）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 GitHub 私有仓库 `Ryu2u/md_note` 的 `笔记/` 目录下全部 `.md` 定时单向同步为博客文章，AI 生成元数据（标题/摘要/标签/分类/公开性审查），管理后台可配置 LLM。

**Architecture:** 新增 `src/note_sync/` 后端模块（github 客户端 / ai 客户端 / 纯函数差分引擎 / 应用循环 / 调度器 / 管理接口），`post` 表零改动，新表 `note_sync_map`（路径↔文章映射）与 `note_sync_config`（LLM 配置，key AES-GCM 加密落库）。tokio 后台任务轮询，ETag 增量。Phase 2（推送回 GitHub）不在本计划内。

**Tech Stack:** Rust/actix-web 4（现有）、rbatis 4.5（现有）、reqwest 0.12（新增，rustls-tls）、sha2、aes-gcm、base64、percent-encoding、chrono（现有）、React18+antd5 管理页（现有栈）。

**Spec:** `docs/superpowers/specs/2026-09-21-github-note-sync-design.md`（v2.3，含安全加固与公开性审查）

## Global Constraints

- Rust edition 2021，单 crate；**不引入**定时任务框架/git 二进制/新 ORM
- 处理器签名一律 `async fn(...) -> Result<impl Responder, Exception>`，响应用 `R<T>`；数据参数用 `db: web::Data<RBatis>`
- rbatis 自定义 SQL 用 `#{}` 绑定参数（禁止 `${}` 插值）；时间戳一律 epoch **毫秒**（`get_sys_time()`）
- 新管理端路由：**不得**加入 `FilterWhiteList`（要保持登录强制），**必须**加入 `AppState.admin_route_prefixes`（`/note_sync/admin`）
- AI key 只存 AES-256-GCM 密文于 DB；任何接口/日志/报错不得出现明文 key 或 Authorization 头
- AI 失败降级：`is_view=0`（默认隐藏）、标题=文件名、摘要=截断、无标签、仅「笔记」分类
- CORS 只允许 GET/POST/OPTIONS——新接口全部用 GET/POST
- 单元测试写在模块文件内 `#[cfg(test)] mod tests`（项目既有模式），纯函数不碰网络和 DB
- 每个任务结束 `cargo build`（或 `cargo test`）通过并 git commit；commit 末尾带 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- 验证用 DB：`mysql -uroot -p123456 -h127.0.0.1 rust_blog`；登录态：`admin / <ADMIN_PASSWORD>`

---

### Task 1: 依赖引入与 .env 安全治理

**Files:**
- Modify: `Cargo.toml`
- Modify: `.gitignore`（加 `.env`）
- Create: `.env.example`
- Modify: `.env`（追加 NOTE_SYNC_* 变量）

**Interfaces:**
- Produces: Cargo 依赖 `reqwest/json+rustls-tls`、`sha2`、`aes-gcm`、`base64`、`percent-encoding`；环境变量集合（后续任务用 `env::var` 读取，键名锁定如下）

```ini
NOTE_SYNC_ENABLED / NOTE_SYNC_REPO / NOTE_SYNC_BRANCH / NOTE_SYNC_TOKEN /
NOTE_SYNC_INTERVAL_MIN / NOTE_SYNC_ROOT / NOTE_SYNC_EXCLUDE_DIRS / NOTE_SYNC_AUTHOR /
NOTE_SYNC_CATEGORY / NOTE_SYNC_MAX_FILE_KB / NOTE_SYNC_AI_ENC_KEY / NOTE_SYNC_AI_ALLOW_HTTP
```

- [ ] **Step 1: Cargo.toml 追加依赖**

在 `[dependencies]` 末尾（`jsonwebtoken = "9"` 之后）加：

```toml
# note_sync: github/ai 同步
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls"] }
sha2 = "0.10"
aes-gcm = "0.10"
base64 = "0.22"
percent-encoding = "2"
```

- [ ] **Step 2: .env 治理——移出 git 追踪**

```bash
printf '.env\n' >> .gitignore
git rm --cached .env
```

- [ ] **Step 3: 生成加密主密钥并追加 .env 变量**

```bash
ENC_KEY=$(openssl rand -base64 32)
cat >> .env <<EOF

# ---- GitHub 笔记同步 (note_sync) ----
NOTE_SYNC_ENABLED=true
NOTE_SYNC_REPO=Ryu2u/md_note
NOTE_SYNC_BRANCH=
NOTE_SYNC_TOKEN=<真实PAT见本机.env，勿写入任何被跟踪文件>
NOTE_SYNC_INTERVAL_MIN=30
NOTE_SYNC_ROOT=笔记/
NOTE_SYNC_EXCLUDE_DIRS=.obsidian,.trash
NOTE_SYNC_AUTHOR=Ryu2u
NOTE_SYNC_CATEGORY=笔记
NOTE_SYNC_MAX_FILE_KB=1024
NOTE_SYNC_AI_ENC_KEY=$ENC_KEY
NOTE_SYNC_AI_ALLOW_HTTP=0
EOF
```

- [ ] **Step 4: 创建 .env.example（占位，不含真实密钥）**

```ini
SERVER_IP=127.0.0.1
SERVER_PORT=9002
DATABASE_URL=mysql://user:password@localhost:3306/rust_blog?charset=utf8mb4
BLOG_ORIGIN=http://localhost:8088
ADMIN_ORIGIN=http://localhost:8089
JWT_SECRET=change-me
JWT_EXPIRE_HOURS=12
# ---- GitHub 笔记同步 ----
NOTE_SYNC_ENABLED=true
NOTE_SYNC_REPO=owner/repo
NOTE_SYNC_BRANCH=
NOTE_SYNC_TOKEN=github_pat_xxx
NOTE_SYNC_INTERVAL_MIN=30
NOTE_SYNC_ROOT=笔记/
NOTE_SYNC_EXCLUDE_DIRS=.obsidian,.trash
NOTE_SYNC_AUTHOR=your-name
NOTE_SYNC_CATEGORY=笔记
NOTE_SYNC_MAX_FILE_KB=1024
# openssl rand -base64 32
NOTE_SYNC_AI_ENC_KEY=
NOTE_SYNC_AI_ALLOW_HTTP=0
```

- [ ] **Step 5: 验证编译 + 密钥不入库**

```bash
cargo build 2>&1 | tail -3        # Expected: Finished dev profile
git check-ignore .env             # Expected: .env
git status --short | grep -c '^??' # .env.example 出现在未跟踪
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml Cargo.lock .gitignore .env.example
git commit -m "chore: note_sync 依赖引入与 .env 移出 git 追踪"
```

---

### Task 2: 数据模型与 DDL（note_sync_map / note_sync_config）

**Files:**
- Create: `src/note_sync/mod.rs`
- Create: `src/note_sync/structs.rs`
- Modify: `src/main.rs:16`（`mod note_sync;`）
- Modify: `schema.sql`（末尾追加两张表）
- Modify: 本地 MySQL 执行 DDL

**Interfaces:**
- Produces（后续所有任务依赖的模型，字段名与表列一致）:

```rust
pub struct NoteSyncMap { pub id: Option<i32>, pub github_path: String, pub blob_sha: String,
    pub local_sha: String, pub post_id: i32, pub ai_title: String, pub ai_is_view: i32,
    pub ai_reason: String, pub last_commit_time: Option<i64>, pub synced_at: i64, pub status: String }
pub struct NoteSyncConfig { pub id: Option<i32>, pub ai_enabled: i32, pub ai_base_url: String,
    pub ai_api_key: String /*AES密文*/, pub ai_model: String, pub updated_at: i64 }
pub struct AiMeta { pub title: String, pub summary: String, pub tags: Vec<String>,
    pub category: String, pub public: bool, pub reason: String }
// rbatis: NoteSyncMap::select_all(db)、NoteSyncMap::select_by_post_id(db, post_id:i32)
// rbatis: NoteSyncConfig::select_by_id(db, 1) -> Vec<NoteSyncConfig>
```

- [ ] **Step 1: 写失败测试（AiMeta serde 反序列化——public/reason 字段约定）**

`src/note_sync/structs.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_meta_deser_full() {
        let raw = r#"{"title":"Ubuntu上安装Docker","summary":"安装步骤","tags":["Docker","Ubuntu"],
            "category":"技术教程","public":false,"reason":"包含内网IP"}"#;
        let m: AiMeta = serde_json::from_str(raw).unwrap();
        assert_eq!(m.title, "Ubuntu上安装Docker");
        assert!(!m.public);
        assert_eq!(m.reason, "包含内网IP");
        assert_eq!(m.tags.len(), 2);
    }

    #[test]
    fn test_ai_meta_deser_reason_optional() {
        let raw = r#"{"title":"t","summary":"s","tags":[],"category":"c","public":true}"#;
        let m: AiMeta = serde_json::from_str(raw).unwrap();
        assert!(m.public);
        assert_eq!(m.reason, "");
    }
}
```

- [ ] **Step 2: 运行确认失败**

`cargo test note_sync` → 编译失败（模块不存在）。先在 `src/main.rs:16` 附近 `mod moment;` 之后加 `mod note_sync;`，创建 `src/note_sync/mod.rs`：

```rust
pub mod structs;
```

再建 `src/note_sync/structs.rs`：

```rust
use rbatis::{crud, impl_select};
use serde::{Deserialize, Serialize};

/// GitHub 笔记 ↔ 文章 映射
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NoteSyncMap {
    pub id: Option<i32>,
    /// 仓库内相对路径，如 "笔记/Rust/axum.md"，唯一
    pub github_path: String,
    /// 远端文件内容指纹（GitHub blob sha）
    pub blob_sha: String,
    /// 上次同步成功时本地正文 SHA-256（冲突检测）
    pub local_sha: String,
    pub post_id: i32,
    /// 上次 AI 生成的标题（人工标题保护）
    pub ai_title: String,
    /// 上次 AI 公开性判定 0/1（人工开关保护）
    pub ai_is_view: i32,
    /// AI 判定不可公开时的理由
    pub ai_reason: String,
    pub last_commit_time: Option<i64>,
    pub synced_at: i64,
    /// 'ok' | 'conflicted'
    pub status: String,
}
crud!(NoteSyncMap {});

impl_select!(NoteSyncMap {
    select_by_post_id(post_id: i32) => "`where post_id = #{post_id}`"
});

/// LLM 配置（单行表，id=1）
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NoteSyncConfig {
    pub id: Option<i32>,
    pub ai_enabled: i32,
    pub ai_base_url: String,
    /// AES-256-GCM 密文（base64），绝不存明文
    pub ai_api_key: String,
    pub ai_model: String,
    pub updated_at: i64,
}
crud!(NoteSyncConfig {});

/// AI 生成的元数据
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AiMeta {
    pub title: String,
    pub summary: String,
    pub tags: Vec<String>,
    pub category: String,
    pub public: bool,
    #[serde(default)]
    pub reason: String,
}
```

（`AiMeta` 上加 `#[serde(default)]` 于 `reason`——测试 2 依赖它。）

- [ ] **Step 3: 运行测试通过**

`cargo test note_sync` → 2 passed。

- [ ] **Step 4: schema.sql 追加 DDL 并执行**

`schema.sql` 末尾追加：

```sql
-- ----------------------------
-- GitHub 笔记同步映射表
-- ----------------------------
DROP TABLE IF EXISTS `note_sync_map`;
CREATE TABLE `note_sync_map` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `github_path` VARCHAR(512) NOT NULL,
  `blob_sha` CHAR(40) NOT NULL,
  `local_sha` CHAR(64) NOT NULL DEFAULT '',
  `post_id` INT NOT NULL,
  `ai_title` VARCHAR(255) NOT NULL DEFAULT '',
  `ai_is_view` TINYINT NOT NULL DEFAULT 0,
  `ai_reason` VARCHAR(512) NOT NULL DEFAULT '',
  `last_commit_time` BIGINT NULL,
  `synced_at` BIGINT NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'ok',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_github_path` (`github_path`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- 笔记同步 LLM 配置（单行）
-- ----------------------------
DROP TABLE IF EXISTS `note_sync_config`;
CREATE TABLE `note_sync_config` (
  `id` TINYINT NOT NULL DEFAULT 1,
  `ai_enabled` TINYINT NOT NULL DEFAULT 0,
  `ai_base_url` VARCHAR(255) NOT NULL DEFAULT '',
  `ai_api_key` VARCHAR(512) NOT NULL DEFAULT '',
  `ai_model` VARCHAR(128) NOT NULL DEFAULT '',
  `updated_at` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

执行（**只执行 CREATE，不跑 DROP 其他表**——用单独管道执行上面两段而非整个 schema.sql）：

```bash
mysql -uroot -p123456 -h127.0.0.1 rust_note 2>/dev/null; mysql -uroot -p123456 -h127.0.0.1 rust_blog <<'SQL'
CREATE TABLE IF NOT EXISTS note_sync_map (
  id INT NOT NULL AUTO_INCREMENT,
  github_path VARCHAR(512) NOT NULL,
  blob_sha CHAR(40) NOT NULL,
  local_sha CHAR(64) NOT NULL DEFAULT '',
  post_id INT NOT NULL,
  ai_title VARCHAR(255) NOT NULL DEFAULT '',
  ai_is_view TINYINT NOT NULL DEFAULT 0,
  ai_reason VARCHAR(512) NOT NULL DEFAULT '',
  last_commit_time BIGINT NULL,
  synced_at BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ok',
  PRIMARY KEY (id),
  UNIQUE KEY uk_github_path (github_path(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS note_sync_config (
  id TINYINT NOT NULL DEFAULT 1,
  ai_enabled TINYINT NOT NULL DEFAULT 0,
  ai_base_url VARCHAR(255) NOT NULL DEFAULT '',
  ai_api_key VARCHAR(512) NOT NULL DEFAULT '',
  ai_model VARCHAR(128) NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL
mysql -uroot -p123456 -h127.0.0.1 rust_blog -e "SHOW TABLES LIKE 'note_sync%';"
# Expected: note_sync_config, note_sync_map 两行
```

- [ ] **Step 5: Commit**

```bash
git add src/note_sync/ src/main.rs schema.sql
git commit -m "feat(note_sync): 数据模型 NoteSyncMap/NoteSyncConfig/AiMeta 与 DDL"
```

---

### Task 3: 纯函数差分引擎（filter/plan/人工保护判定）

**Files:**
- Create: `src/note_sync/sync_engine.rs`（本任务只写纯函数部分）
- Modify: `src/note_sync/mod.rs`（`pub mod sync_engine;`）

**Interfaces:**
- Consumes: `structs::NoteSyncMap`（Task 2）
- Produces（Task 7 应用循环消费）:

```rust
pub struct TreeEntry { pub path: String, pub sha: String, pub size: i64 }
pub enum SyncAction {
    Create { path: String, blob_sha: String },
    Update { map_id: i32, post_id: i32, path: String, blob_sha: String },
    Resurrect { map_id: i32, post_id: i32, path: String, blob_sha: String },
    SoftDelete { map_id: i32, post_id: i32 },
}
pub fn filter_entries(entries: &[TreeEntry], root: &str, exclude_dirs: &[&str], max_kb: i64) -> Vec<TreeEntry>;
pub fn plan_actions(filtered: &[TreeEntry], maps: &[NoteSyncMap], deleted_post_ids: &HashSet<i32>) -> Vec<SyncAction>;
pub fn merged_title(post_title: &str, ai_title: &str, new_title: &str) -> String;
pub fn merged_is_view(post_is_view: i32, ai_is_view: i32, new_public: bool) -> i32;
```

- [ ] **Step 1: 写失败测试**

`src/note_sync/sync_engine.rs`：

```rust
use std::collections::HashSet;
use crate::note_sync::structs::NoteSyncMap;

#[derive(Clone, Debug, PartialEq)]
pub struct TreeEntry {
    pub path: String,
    pub sha: String,
    pub size: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum SyncAction {
    Create { path: String, blob_sha: String },
    Update { map_id: i32, post_id: i32, path: String, blob_sha: String },
    Resurrect { map_id: i32, post_id: i32, path: String, blob_sha: String },
    SoftDelete { map_id: i32, post_id: i32 },
}
```

文件末尾测试（先写测试再写实现）：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, sha: &str, size: i64) -> TreeEntry {
        TreeEntry { path: path.into(), sha: sha.into(), size }
    }
    fn map(path: &str, sha: &str, post_id: i32) -> NoteSyncMap {
        NoteSyncMap { id: Some(1), github_path: path.into(), blob_sha: sha.into(),
            local_sha: String::new(), post_id, ai_title: String::new(), ai_is_view: 1,
            ai_reason: String::new(), last_commit_time: None, synced_at: 0, status: "ok".into() }
    }

    // ---- filter_entries ----
    #[test]
    fn test_filter_keeps_only_md_under_root() {
        let es = vec![entry("笔记/Rust/axum.md", "a", 10), entry("todo/x.md", "b", 10),
            entry("笔记/img.png", "c", 10), entry("笔记/a.txt", "d", 10)];
        let out = filter_entries(&es, "笔记/", &[], 1024);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "笔记/Rust/axum.md");
    }
    #[test]
    fn test_filter_excludes_dirs_and_oversize() {
        let es = vec![entry("笔记/.obsidian/x.md", "a", 10), entry("笔记/.trash/y.md", "b", 10),
            entry("笔记/big.md", "c", 2048 * 1024), entry("笔记/ok.md", "d", 10)];
        let out = filter_entries(&es, "笔记/", &[".obsidian", ".trash"], 1024);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "笔记/ok.md");
    }

    // ---- plan_actions ----
    #[test]
    fn test_plan_create_update_skip() {
        let es = vec![entry("笔记/new.md", "s1", 10), entry("笔记/changed.md", "s2", 10),
            entry("笔记/same.md", "s3", 10)];
        let maps = vec![map("笔记/changed.md", "old", 5), map("笔记/same.md", "s3", 6)];
        let acts = plan_actions(&es, &maps, &HashSet::new());
        assert!(acts.contains(&SyncAction::Create { path: "笔记/new.md".into(), blob_sha: "s1".into() }));
        assert!(acts.contains(&SyncAction::Update { map_id: 1, post_id: 5, path: "笔记/changed.md".into(), blob_sha: "s2".into() }));
        assert!(!acts.iter().any(|a| matches!(a, SyncAction::Update { path, .. } if path == "笔记/same.md")));
    }
    #[test]
    fn test_plan_softdelete_and_resurrect() {
        // 树里没有 -> 软删；树里有但post已删 -> 复活
        let es = vec![entry("笔记/back.md", "s9", 10)];
        let maps = vec![map("笔记/gone.md", "s0", 7), map("笔记/back.md", "s8", 8)];
        let mut deleted = HashSet::new();
        deleted.insert(8);
        let acts = plan_actions(&es, &maps, &deleted);
        assert!(acts.contains(&SyncAction::SoftDelete { map_id: 1, post_id: 7 }));
        assert!(acts.contains(&SyncAction::Resurrect { map_id: 1, post_id: 8, path: "笔记/back.md".into(), blob_sha: "s9".into() }));
    }

    // ---- 人工保护 ----
    #[test]
    fn test_merged_title_admin_kept() {
        assert_eq!(merged_title("我的标题", "AI标题", "AI新标题"), "我的标题");
        assert_eq!(merged_title("AI标题", "AI标题", "AI新标题"), "AI新标题");
    }
    #[test]
    fn test_merged_is_view_admin_kept() {
        assert_eq!(merged_is_view(0, 1, true), 0);   // 后台手动隐藏过 -> 保持隐藏
        assert_eq!(merged_is_view(1, 1, false), 0);  // 未动过 -> 采纳AI新判定
        assert_eq!(merged_is_view(1, 1, true), 1);
    }
}
```

- [ ] **Step 2: 运行确认失败**

`cargo test note_sync` → 编译失败（函数未定义）。

- [ ] **Step 3: 实现纯函数**

在 `sync_engine.rs` 类型定义后追加：

```rust
/// 过滤：root 前缀 + .md 后缀 + 排除目录段 + 大小上限
pub fn filter_entries(entries: &[TreeEntry], root: &str, exclude_dirs: &[&str], max_kb: i64) -> Vec<TreeEntry> {
    entries
        .iter()
        .filter(|e| e.path.starts_with(root) && e.path.ends_with(".md"))
        .filter(|e| !e.path.split('/').any(|seg| exclude_dirs.contains(&seg)))
        .filter(|e| e.size <= max_kb * 1024)
        .cloned()
        .collect()
}

/// 差分：树 + 映射 + 已删除post集合 -> 动作列表（sha 相同的不产生动作 = skip）
pub fn plan_actions(
    filtered: &[TreeEntry],
    maps: &[NoteSyncMap],
    deleted_post_ids: &HashSet<i32>,
) -> Vec<SyncAction> {
    use std::collections::HashMap;
    let mut actions = Vec::new();
    let by_path: HashMap<&str, &NoteSyncMap> =
        maps.iter().map(|m| (m.github_path.as_str(), m)).collect();
    let tree_paths: HashSet<&str> = filtered.iter().map(|e| e.path.as_str()).collect();

    for e in filtered {
        match by_path.get(e.path.as_str()) {
            None => actions.push(SyncAction::Create {
                path: e.path.clone(),
                blob_sha: e.sha.clone(),
            }),
            Some(m) => {
                if deleted_post_ids.contains(&m.post_id) {
                    actions.push(SyncAction::Resurrect {
                        map_id: m.id.unwrap_or(0),
                        post_id: m.post_id,
                        path: e.path.clone(),
                        blob_sha: e.sha.clone(),
                    });
                } else if m.blob_sha != e.sha {
                    actions.push(SyncAction::Update {
                        map_id: m.id.unwrap_or(0),
                        post_id: m.post_id,
                        path: e.path.clone(),
                        blob_sha: e.sha.clone(),
                    });
                }
            }
        }
    }
    for m in maps {
        if !tree_paths.contains(m.github_path.as_str()) {
            actions.push(SyncAction::SoftDelete {
                map_id: m.id.unwrap_or(0),
                post_id: m.post_id,
            });
        }
    }
    actions
}

/// 标题人工保护：后台没改过（当前标题==上次AI标题）才采纳新AI标题
pub fn merged_title(post_title: &str, ai_title: &str, new_title: &str) -> String {
    if post_title == ai_title {
        new_title.to_string()
    } else {
        post_title.to_string()
    }
}

/// is_view 人工保护：后台没拨过开关（当前值==上次AI判定）才采纳新判定
pub fn merged_is_view(post_is_view: i32, ai_is_view: i32, new_public: bool) -> i32 {
    if post_is_view == ai_is_view {
        new_public as i32
    } else {
        post_is_view
    }
}
```

`mod.rs` 更新为：

```rust
pub mod structs;
pub mod sync_engine;
```

- [ ] **Step 4: 测试通过**

`cargo test note_sync` → 6 passed。

- [ ] **Step 5: Commit**

```bash
git add src/note_sync/
git commit -m "feat(note_sync): 纯函数差分引擎 filter/plan/人工保护判定"
```

---

### Task 4: 文本推导工具（标题/摘要/字数/路径编码）

**Files:**
- Create: `src/note_sync/derive.rs`
- Modify: `src/note_sync/mod.rs`（加 `pub mod derive;`）

**Interfaces:**
- Consumes: 无
- Produces（Task 6/7 消费）:

```rust
pub fn title_from_path(path: &str) -> String;   // "笔记/Rust/axum.md" -> "axum"
pub fn strip_markdown(md: &str) -> String;      // 剥离代码块/围栏/链接/强调/标题符/图片
pub fn summarize(md: &str, limit: usize) -> String; // strip 后截前 limit 字符
pub fn word_count(content: &str) -> i32;        // Unicode 字符数
pub fn encode_path(path: &str) -> String;       // 每段 percent-encode（中文/空格）
pub fn sha256_hex(s: &str) -> String;
```

- [ ] **Step 1: 写失败测试**

`src/note_sync/derive.rs`：

```rust
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use sha2::{Digest, Sha256};

/// RFC3986 unreserved 字符不编码
const PATH_SEG: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'.').remove(b'_').remove(b'~');

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_title_from_path() {
        assert_eq!(title_from_path("笔记/Rust/axum.md"), "axum");
        assert_eq!(title_from_path("Docker安装.md"), "Docker安装");
        assert_eq!(title_from_path("a/b/草 稿.md"), "草 稿");
    }
    #[test]
    fn test_strip_markdown() {
        let md = "# 标题\n\n正文**加粗**与`代码`。\n\n```rust\nfn x(){}\n```\n\n[链接](http://a.com)和![图](http://b.png)\n- 列表项";
        let s = strip_markdown(md);
        assert!(s.contains("正文加粗与代码。"));
        assert!(!s.contains("fn x()"));
        assert!(!s.contains("http://"));
        assert!(!s.contains('#'));
    }
    #[test]
    fn test_summarize_limit() {
        let md = "abcdefg".repeat(100);
        assert_eq!(summarize(&md, 200).chars().count(), 200);
    }
    #[test]
    fn test_word_count_unicode() {
        assert_eq!(word_count("abc中文"), 5);
    }
    #[test]
    fn test_encode_path() {
        assert_eq!(encode_path("笔记/Rust/axum.md"), "%E7%AC%94%E8%AE%B0/Rust/axum.md");
        assert_eq!(encode_path("a/草 稿.md"), "a/%E8%8D%89%20%E7%A8%BF.md");
    }
    #[test]
    fn test_sha256_hex() {
        assert_eq!(sha256_hex("abc").len(), 64);
        assert!(sha256_hex("abc").starts_with("ba7816bf"));
    }
}
```

- [ ] **Step 2: 运行确认失败**（函数未定义）

- [ ] **Step 3: 实现**

```rust
/// 文件名去扩展名作为标题
pub fn title_from_path(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path)
        .strip_suffix(".md").unwrap_or(path).to_string()
}

/// 剥离 Markdown 语法得到纯文本（够用的朴素实现）
pub fn strip_markdown(md: &str) -> String {
    let mut out = String::new();
    let mut in_code = false;
    for line in md.lines() {
        let t = line.trim();
        if t.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        if t.starts_with('#') || t.starts_with("---") {
            continue;
        }
        out.push_str(t);
        out.push('\n');
    }
    // 去行内语法
    let mut s = out;
    s = s.replace("**", "").replace('*', "").replace('`', "");
    // 链接 [text](url) -> text，图片 ![alt](url) -> 删除
    let mut cleaned = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '!' && i + 1 < chars.len() && chars[i + 1] == '[' {
            // 图片：跳到匹配的 ')'
            if let Some(close) = chars[i..].iter().position(|&x| x == ')') {
                i += close + 1;
                continue;
            }
        }
        if c == '[' {
            if let Some(close_bracket) = chars[i..].iter().position(|&x| x == ']') {
                if chars.get(i + close_bracket + 1) == Some(&'(') {
                    if let Some(close_paren) = chars[i + close_bracket..].iter().position(|&x| x == ')') {
                        cleaned.extend(&chars[i + 1..i + close_bracket]);
                        i += close_bracket + close_paren + 1;
                        continue;
                    }
                }
            }
        }
        cleaned.push(c);
        i += 1;
    }
    cleaned.trim().to_string()
}

/// 摘要：剥Markdown后截前 limit 个字符
pub fn summarize(md: &str, limit: usize) -> String {
    let plain = strip_markdown(md);
    plain.chars().take(limit).collect()
}

/// Unicode 字符数
pub fn word_count(content: &str) -> i32 {
    content.chars().count() as i32
}

/// 每段 percent-encode（保留 / - . _ ~）
pub fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|seg| utf8_percent_encode(seg, PATH_SEG).to_string())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    let d = h.finalize();
    d.iter().map(|b| format!("{:02x}", b)).collect()
}
```

- [ ] **Step 4: 测试通过**

`cargo test note_sync` → 全部 passed（累计 12）。

- [ ] **Step 5: Commit**

```bash
git add src/note_sync/
git commit -m "feat(note_sync): 标题/摘要/字数/路径编码/SHA256 工具"
```

---

### Task 5: GitHub REST 客户端（ETag 增量/拉文件/提交时间）

**Files:**
- Create: `src/note_sync/github_client.rs`
- Modify: `src/note_sync/mod.rs`（加 `pub mod github_client;`）

**Interfaces:**
- Consumes: `sync_engine::TreeEntry`（Task 3）、`derive::encode_path`（Task 4）
- Produces（Task 7/9 消费）:

```rust
pub enum GhError { Unauthorized(String), RateLimited, Network(String), Other(u16, String) }
pub enum TreeFetch { Unchanged, Changed { entries: Vec<TreeEntry>, etag: Option<String> } }
pub struct GithubClient { /* reqwest::Client + token/repo/branch/etag 缓存 */ }
impl GithubClient {
    pub fn new(token: &str, repo: &str, branch: &str) -> Self;
    pub async fn branch(&mut self) -> Result<String, GhError>;   // 传入空则 GET /repos 自动探测并缓存
    pub async fn list_tree(&mut self) -> Result<TreeFetch, GhError>; // If-None-Match -> 304=Unchanged
    pub async fn get_file(&self, path: &str) -> Result<String, GhError>; // base64 解码后的 UTF-8
    pub async fn last_commit_ms(&self, path: &str) -> Result<Option<i64>, GhError>;
}
pub fn parse_tree(json: &str) -> Vec<TreeEntry>;          // 纯函数（测试用）
pub fn parse_content_b64(json: &str) -> Result<String, String>; // 纯函数
pub fn parse_commit_ms(json: &str) -> Option<i64>;        // 纯函数
```

- [ ] **Step 1: 写失败测试（三个纯解析函数，fixture 固定）**

`src/note_sync/github_client.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tree() {
        let raw = r#"{"sha":"x","tree":[
            {"path":"笔记/Rust/axum.md","type":"blob","sha":"aaa","size":120},
            {"path":"笔记","type":"tree","sha":"bbb"},
            {"path":"笔记/img.png","type":"blob","sha":"ccc","size":50}],"truncated":false}"#;
        let es = parse_tree(raw);
        assert_eq!(es.len(), 2); // 只收 blob
        assert_eq!(es[0].path, "笔记/Rust/axum.md");
        assert_eq!(es[0].sha, "aaa");
        assert_eq!(es[0].size, 120);
    }
    #[test]
    fn test_parse_content_b64() {
        // "你好" 的 base64
        let raw = r#"{"name":"a.md","content":"5L2g5aW9","encoding":"base64"}"#;
        assert_eq!(parse_content_b64(raw).unwrap(), "你好");
        // GitHub 会把 base64 按行折行插入 \n
        let raw2 = r#"{"content":"5L2g\n5aW9","encoding":"base64"}"#;
        assert_eq!(parse_content_b64(raw2).unwrap(), "你好");
    }
    #[test]
    fn test_parse_commit_ms() {
        let raw = r#"[{"sha":"c1","commit":{"author":{"date":"2026-09-01T10:00:00Z"}}}]"#;
        let ms = parse_commit_ms(raw).unwrap();
        assert_eq!(ms, 1789994400000i64 - 1789994400000i64 + chrono::DateTime::parse_from_rfc3339("2026-09-01T10:00:00Z").unwrap().timestamp_millis());
        assert_eq!(parse_commit_ms("[]"), None);
    }
}
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**

```rust
use base64::Engine;
use crate::note_sync::derive::encode_path;
use crate::note_sync::sync_engine::TreeEntry;

const API_BASE: &str = "https://api.github.com";

#[derive(Debug)]
pub enum GhError {
    Unauthorized(String),
    RateLimited,
    Network(String),
    Other(u16, String),
}

impl std::fmt::Display for GhError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GhError::Unauthorized(_) => write!(f, "NOTE_SYNC_TOKEN 失效或过期，请在 .env 更换"),
            GhError::RateLimited => write!(f, "GitHub API 限流，下轮重试"),
            GhError::Network(e) => write!(f, "网络错误: {}", e),
            GhError::Other(code, e) => write!(f, "GitHub API {}: {}", code, e),
        }
    }
}

pub enum TreeFetch {
    Unchanged,
    Changed { entries: Vec<TreeEntry>, etag: Option<String> },
}

pub struct GithubClient {
    http: reqwest::Client,
    token: String,
    repo: String,
    branch_cfg: String,   // 配置值，空则自动探测
    branch: Option<String>,
    etag: Option<String>,
}

impl GithubClient {
    pub fn new(token: &str, repo: &str, branch: &str) -> Self {
        GithubClient {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("build reqwest client"),
            token: token.to_string(),
            repo: repo.to_string(),
            branch_cfg: branch.to_string(),
            branch: None,
            etag: None,
        }
    }

    fn auth(&self, rb: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        rb.header("Authorization", format!("Bearer {}", self.token))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "rust_blog-note-sync")
    }

    fn err_of(status: reqwest::StatusCode, body: String) -> GhError {
        match status.as_u16() {
            401 => GhError::Unauthorized(body),
            403 => GhError::RateLimited,
            404 => GhError::Other(404, "not found".into()),
            c => GhError::Other(c, body),
        }
    }

    pub async fn branch(&mut self) -> Result<String, GhError> {
        if let Some(b) = &self.branch {
            return Ok(b.clone());
        }
        let b = if !self.branch_cfg.is_empty() {
            self.branch_cfg.clone()
        } else {
            let url = format!("{}/repos/{}", API_BASE, self.repo);
            let resp = self.auth(self.http.get(&url)).send().await
                .map_err(|e| GhError::Network(e.to_string()))?;
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if !status.is_success() {
                return Err(Self::err_of(status, body));
            }
            serde_json::from_str::<serde_json::Value>(&body).ok()
                .and_then(|v| v["default_branch"].as_str().map(String::from))
                .unwrap_or_else(|| "master".into())
        };
        self.branch = Some(b.clone());
        Ok(b)
    }

    pub async fn list_tree(&mut self) -> Result<TreeFetch, GhError> {
        let branch = self.branch().await?;
        let url = format!("{}/repos/{}/git/trees/{}?recursive=1", API_BASE, self.repo, branch);
        let mut rb = self.auth(self.http.get(&url));
        if let Some(etag) = &self.etag {
            rb = rb.header("If-None-Match", etag);
        }
        let resp = rb.send().await.map_err(|e| GhError::Network(e.to_string()))?;
        if resp.status() == reqwest::StatusCode::NOT_MODIFIED {
            return Ok(TreeFetch::Unchanged);
        }
        let status = resp.status();
        let etag = resp.headers().get("etag")
            .and_then(|v| v.to_str().ok()).map(String::from);
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(Self::err_of(status, body));
        }
        let entries = parse_tree(&body);
        self.etag = etag.clone();
        Ok(TreeFetch::Changed { entries, etag })
    }

    pub async fn get_file(&self, path: &str) -> Result<String, GhError> {
        let url = format!("{}/repos/{}/contents/{}?ref={}",
            API_BASE, self.repo, encode_path(path), self.branch.clone().unwrap_or_default());
        let resp = self.auth(self.http.get(&url)).send().await
            .map_err(|e| GhError::Network(e.to_string()))?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(Self::err_of(status, body));
        }
        parse_content_b64(&body).map_err(|e| GhError::Other(0, e))
    }

    pub async fn last_commit_ms(&self, path: &str) -> Result<Option<i64>, GhError> {
        let url = format!("{}/repos/{}/commits?path={}&per_page=1",
            API_BASE, self.repo, encode_path(path));
        let resp = self.auth(self.http.get(&url)).send().await
            .map_err(|e| GhError::Network(e.to_string()))?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(Self::err_of(status, body));
        }
        Ok(parse_commit_ms(&body))
    }
}

// ---------- 纯解析函数 ----------

pub fn parse_tree(json: &str) -> Vec<TreeEntry> {
    #[derive(serde::Deserialize)]
    struct Row { path: String, #[serde(rename = "type")] kind: String, sha: String, #[serde(default)] size: i64 }
    #[derive(serde::Deserialize)]
    struct Root { #[serde(default)] tree: Vec<Row> }
    let root: Root = serde_json::from_str(json).unwrap_or(Root { tree: vec![] });
    root.tree.into_iter()
        .filter(|r| r.kind == "blob")
        .map(|r| TreeEntry { path: r.path, sha: r.sha, size: r.size })
        .collect()
}

pub fn parse_content_b64(json: &str) -> Result<String, String> {
    #[derive(serde::Deserialize)]
    struct Row { content: String }
    let row: Row = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let compact: String = row.content.chars().filter(|c| *c != '\n' && *c != '\r').collect();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(compact.as_bytes()).map_err(|e| e.to_string())?;
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

pub fn parse_commit_ms(json: &str) -> Option<i64> {
    #[derive(serde::Deserialize)]
    struct Commit { author: Author }
    #[derive(serde::Deserialize)]
    struct Author { date: String }
    let commits: Vec<Commit> = serde_json::from_str(json).ok()?;
    let date = commits.first()?.author.date.clone();
    chrono::DateTime::parse_from_rfc3339(&date).ok().map(|d| d.timestamp_millis())
}
```

- [ ] **Step 4: 测试通过**

`cargo test note_sync` → 全部通过（累计 15）。

- [ ] **Step 5: 真实连通冒烟（一次性手动验证，不进测试）**

```bash
cargo test note_sync -- --nocapture 2>&1 | tail -3
```

（网络调用在 Task 11 端到端验证，这里不单独跑。）

- [ ] **Step 6: Commit**

```bash
git add src/note_sync/
git commit -m "feat(note_sync): GitHub REST 客户端（ETag/内容/提交时间）"
```

---

### Task 6: AES 加密 + AI 客户端（解析/降级/URL 校验/thinking 适配）

**Files:**
- Create: `src/note_sync/crypto.rs`
- Create: `src/note_sync/ai_client.rs`
- Modify: `src/note_sync/mod.rs`（加 `pub mod crypto; pub mod ai_client;`）

**Interfaces:**
- Consumes: `structs::AiMeta`（Task 2）、`derive::{title_from_path, summarize}`（Task 4）
- Produces（Task 7/9 消费）:

```rust
// crypto.rs
pub fn encrypt_to_b64(plain: &str, key_b64: &str) -> Result<String, String>;  // base64(nonce(12)||ct+tag)
pub fn decrypt_from_b64(cipher_b64: &str, key_b64: &str) -> Result<String, String>;
// ai_client.rs
pub struct AiSettings { pub base_url: String, pub api_key: String, pub model: String }
pub fn validate_base_url(url: &str, allow_http: bool) -> Result<(), String>;
pub fn strip_fence(raw: &str) -> String;
pub fn parse_ai_meta(raw: &str) -> Option<AiMeta>;
pub fn fallback_meta(path: &str, content: &str) -> AiMeta;   // public 恒为 false
pub async fn extract_meta(s: &AiSettings, content: &str, categories: &[String]) -> Result<AiMeta, String>;
```

- [ ] **Step 1: 写失败测试**

`src/note_sync/crypto.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_roundtrip() {
        let key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // 32字节
        let c = encrypt_to_b64("sk-secret-123", key).unwrap();
        assert_ne!(c, "sk-secret-123");
        assert_eq!(decrypt_from_b64(&c, key).unwrap(), "sk-secret-123");
    }
    #[test]
    fn test_wrong_key_fails() {
        let key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
        let c = encrypt_to_b64("secret", key).unwrap();
        let bad = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWb="; // 错误key
        assert!(decrypt_from_b64(&c, bad).is_err());
    }
}
```

`src/note_sync/ai_client.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_base_url() {
        assert!(validate_base_url("https://api.deepseek.com/v1", false).is_ok());
        assert!(validate_base_url("http://localhost:11434/v1", false).is_err());
        assert!(validate_base_url("http://localhost:11434/v1", true).is_ok());
        assert!(validate_base_url("https://169.254.169.254/v1", false).is_err()); // 云元数据
        assert!(validate_base_url("not a url", false).is_err());
        assert!(validate_base_url("ftp://x.com", false).is_err());
    }
    #[test]
    fn test_strip_fence() {
        assert_eq!(strip_fence("```json\n{\"a\":1}\n```"), "{\"a\":1}");
        assert_eq!(strip_fence("{\"a\":1}"), "{\"a\":1}");
    }
    #[test]
    fn test_parse_ai_meta() {
        let ok = r#"{"title":"t","summary":"s","tags":["a"],"category":"c","public":true,"reason":""}"#;
        assert!(parse_ai_meta(ok).is_some());
        let fenced = "```json\n".to_string() + ok + "\n```";
        assert!(parse_ai_meta(&fenced).is_some());
        assert!(parse_ai_meta("我觉得这篇笔记写得不错").is_none());
        assert!(parse_ai_meta("{broken").is_none());
    }
    #[test]
    fn test_fallback_meta_hidden() {
        let m = fallback_meta("笔记/Docker/安装.md", "# 安装\n正文");
        assert_eq!(m.title, "安装");
        assert!(!m.public, "降级元数据必须默认隐藏");
        assert!(m.tags.is_empty());
    }
}
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现 crypto.rs**

```rust
use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;

/// AES-256-GCM 加密：输出 base64( nonce(12) || ciphertext+tag )
pub fn encrypt_to_b64(plain: &str, key_b64: &str) -> Result<String, String> {
    let key_bytes = base64::engine::general_purpose::STANDARD.decode(key_b64)
        .map_err(|e| format!("ENC_KEY base64 解码失败: {}", e))?;
    if key_bytes.len() != 32 {
        return Err("ENC_KEY 必须是 32 字节的 base64".into());
    }
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce_bytes = {
        // 用 sha256(plain || 时间戳) 前 12 字节做 nonce（避免再引 rand 依赖特性）
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(plain.as_bytes());
        h.update(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos().to_le_bytes()).unwrap_or([0u8; 16]));
        let d = h.finalize();
        d[..12].to_vec()
    };
    let ct = cipher.encrypt(Nonce::from_slice(&nonce_bytes), Payload::from(plain.as_bytes()))
        .map_err(|e| e.to_string())?;
    let mut out = nonce_bytes;
    out.extend(ct);
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

pub fn decrypt_from_b64(cipher_b64: &str, key_b64: &str) -> Result<String, String> {
    let key_bytes = base64::engine::general_purpose::STANDARD.decode(key_b64)
        .map_err(|e| format!("ENC_KEY base64 解码失败: {}", e))?;
    let data = base64::engine::general_purpose::STANDARD.decode(cipher_b64)
        .map_err(|e| e.to_string())?;
    if data.len() < 12 {
        return Err("密文格式非法".into());
    }
    let (nonce_bytes, ct) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let plain = cipher.decrypt(Nonce::from_slice(nonce_bytes), Payload::from(ct))
        .map_err(|_| "解密失败（密钥不匹配或密文损坏）".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}
```

- [ ] **Step 4: 实现 ai_client.rs**

```rust
use crate::note_sync::derive::{summarize, title_from_path};
use crate::note_sync::structs::AiMeta;

pub struct AiSettings {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// base_url 校验：https 强制（allow_http 显式放行本机服务），拒绝链路本地/云元数据地址
pub fn validate_base_url(url: &str, allow_http: bool) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "URL 格式非法".to_string())?;
    match parsed.scheme() {
        "https" => {}
        "http" if allow_http => {}
        _ => return Err("base_url 必须是 https://（本机明文服务需 NOTE_SYNC_AI_ALLOW_HTTP=1）".into()),
    }
    if let Some(host) = parsed.host_str() {
        let h = host.trim_start_matches('[').trim_end_matches(']');
        if h.starts_with("169.254.") || h == "metadata.google.internal" {
            return Err("禁止指向云元数据/链路本地地址".into());
        }
    }
    Ok(())
}
```

（`url` crate 已随 reqwest 间接引入，但需显式声明：在 Cargo.toml 加 `url = "2"`。）

```rust
pub fn strip_fence(raw: &str) -> String {
    let t = raw.trim();
    let t = t.strip_prefix("```json").or_else(|| t.strip_prefix("```"))
        .unwrap_or(t).trim();
    let t = t.strip_suffix("```").unwrap_or(t).trim();
    t.to_string()
}

pub fn parse_ai_meta(raw: &str) -> Option<AiMeta> {
    let stripped = strip_fence(raw);
    // 有的模型会在JSON前说废话：截取第一个 '{' 到最后一个 '}'
    let start = stripped.find('{')?;
    let end = stripped.rfind('}')?;
    serde_json::from_str::<AiMeta>(&stripped[start..=end]).ok()
}

/// AI 失败降级元数据：默认隐藏（安全闸门）
pub fn fallback_meta(path: &str, content: &str) -> AiMeta {
    AiMeta {
        title: title_from_path(path),
        summary: summarize(content, 200),
        tags: vec![],
        category: String::new(),
        public: false,
        reason: String::new(),
    }
}

const SYSTEM_PROMPT: &str = "你是技术博客编辑。根据提供的Markdown笔记生成文章元数据。只输出一个JSON对象，不要输出任何其他文字、解释或代码围栏。格式：{\"title\":\"不超过30字的文章标题\",\"summary\":\"不超过80字的一句话摘要\",\"tags\":[\"3到5个简短技术标签\"],\"category\":\"分类名（优先从给定列表选择，没有合适的就新建一个简短分类）\",\"public\":true或false,\"reason\":\"当public为false时给出一句话理由，否则为空字符串\"}。public判定标准：包含个人隐私（证件号/手机号/住址/真实姓名）、凭据密钥（API key/密码/token，包括示例中出现的）、公司敏感信息（出差报表/薪资/客户/内网架构/内部系统）、明显不宜公开的草稿碎片，命中任一条 public 必须为 false。";

pub async fn extract_meta(
    s: &AiSettings,
    content: &str,
    categories: &[String],
) -> Result<AiMeta, String> {
    let truncated: String = content.chars().take(6000).collect();
    let user = format!(
        "现有分类列表：[{}]\n\n笔记内容：\n{}",
        categories.join("、"), truncated
    );
    let url = format!("{}/chat/completions", s.base_url.trim_end_matches('/'));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build().map_err(|e| e.to_string())?;

    let body_with_thinking = serde_json::json!({
        "model": s.model,
        "temperature": 0.2,
        "max_tokens": 300,
        "thinking": { "type": "disabled" },
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user}
        ]
    });
    let body_without_thinking = {
        let mut b = body_with_thinking.clone();
        b.as_object_mut().unwrap().remove("thinking");
        b
    };

    // 第一轮带 thinking:disabled（deepseek-flash 等推理模型省token）；供应商不认(400)则去掉重试
    let mut resp = client.post(&url)
        .bearer_auth(&s.api_key)
        .json(&body_with_thinking)
        .send().await.map_err(|e| format!("AI 网络错误: {}", e))?;
    if resp.status().as_u16() == 400 {
        resp = client.post(&url)
            .bearer_auth(&s.api_key)
            .json(&body_without_thinking)
            .send().await.map_err(|e| format!("AI 网络错误: {}", e))?;
    }
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        // 摘出错误信息但不回显 key
        let msg = serde_json::from_str::<serde_json::Value>(&text).ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
        return Err(format!("AI 调用失败: {}", msg));
    }
    let content_str = serde_json::from_str::<serde_json::Value>(&text).ok()
        .and_then(|v| v["choices"][0]["message"]["content"].as_str().map(String::from))
        .ok_or("AI 响应结构异常")?;
    parse_ai_meta(&content_str).ok_or_else(|| "AI 返回内容无法解析为元数据JSON".to_string())
}
```

- [ ] **Step 5: 测试通过**

`cargo test note_sync` → 全部通过（累计 21）。

- [ ] **Step 6: Commit**

```bash
git add src/note_sync/ Cargo.toml Cargo.lock
git commit -m "feat(note_sync): AES-GCM 加密与 AI 客户端（解析/降级/URL校验/thinking适配）"
```

---

### Task 7: 应用循环（apply：建/改/删/复活 + AI 集成 + 关联落库）

**Files:**
- Modify: `src/note_sync/sync_engine.rs`（追加 async 应用层）
- Modify: `src/note_sync/mod.rs`

**Interfaces:**
- Consumes: Task 3 的 `SyncAction/filter_entries/plan_actions/merged_*`、Task 2 模型、Task 4 `derive::*`、Task 5 `GithubClient`、Task 6 `ai_client::*`
- Produces（Task 8 调度器消费）:

```rust
pub struct SyncStats { pub created: u32, pub updated: u32, pub deleted: u32,
    pub resurrected: u32, pub skipped: u32, pub failed: u32, pub ai_fallback: u32 }
pub struct SyncPlan { pub repo: String, pub branch: String, pub token: String,
    pub root: String, pub exclude_dirs: Vec<String>, pub max_kb: i64,
    pub author: String, pub category: String, pub allow_http: bool, pub enc_key: String }
pub async fn run_sync_cycle(db: &RBatis, gh: &mut GithubClient, plan: &SyncPlan,
    ai: Option<AiSettings>) -> SyncStats;
pub async fn load_ai_settings(db: &RBatis, enc_key: &str, allow_http: bool) -> Option<AiSettings>; // Task 9 也用
```

- [ ] **Step 1: 写保护判定测试（apply 层可测的纯部分已在 Task 3 覆盖；此处测 stats 结构与 load 逻辑留给集成）**

无新增纯函数——本任务以 `cargo build` + Task 11 集成验证为准。（差分/保护逻辑的测试已在 Task 3 全覆盖，apply 层是 DB I/O 编排。）

- [ ] **Step 2: 实现 apply 层**

`src/note_sync/sync_engine.rs` 追加（顶部 use 增补）：

```rust
use crate::note_sync::ai_client::{self, AiSettings};
use crate::note_sync::derive::{self, sha256_hex, summarize, title_from_path, word_count};
use crate::note_sync::github_client::{GhError, GithubClient, TreeFetch};
use crate::note_sync::structs::{AiMeta, NoteSyncConfig, NoteSyncMap};
use crate::post::structs::{Category, Post, PostCategory, PostTag, Tag};
use crate::utils::md_to_html;
use crate::utils::time_utils::get_sys_time;
use rbatis::RBatis;
use tracing::{error, info, warn};
```

主体：

```rust
#[derive(Default, Debug)]
pub struct SyncStats {
    pub created: u32, pub updated: u32, pub deleted: u32,
    pub resurrected: u32, pub skipped: u32, pub failed: u32, pub ai_fallback: u32,
}

pub struct SyncPlan {
    pub repo: String, pub branch: String, pub token: String,
    pub root: String, pub exclude_dirs: Vec<String>, pub max_kb: i64,
    pub author: String, pub category: String,
    pub allow_http: bool, pub enc_key: String,
}

/// 从 DB 读 LLM 配置并解密；未启用/未配置/校验失败返回 None（走降级路径）
pub async fn load_ai_settings(db: &RBatis, enc_key: &str, allow_http: bool) -> Option<AiSettings> {
    let rows = NoteSyncConfig::select_by_id(db, 1).await.ok()?;
    let cfg = rows.into_iter().next()?;
    if cfg.ai_enabled != 1 || cfg.ai_base_url.is_empty() || cfg.ai_model.is_empty() {
        return None;
    }
    if ai_client::validate_base_url(&cfg.ai_base_url, allow_http).is_err() {
        warn!("note_sync: AI base_url 校验失败，本轮走降级路径");
        return None;
    }
    let key = crate::note_sync::crypto::decrypt_from_b64(&cfg.ai_api_key, enc_key).ok()?;
    Some(AiSettings { base_url: cfg.ai_base_url, api_key: key, model: cfg.ai_model })
}

pub async fn run_sync_cycle(
    db: &RBatis,
    gh: &mut GithubClient,
    plan: &SyncPlan,
    ai: Option<AiSettings>,
) -> SyncStats {
    let mut stats = SyncStats::default();
    let entries = match gh.list_tree().await {
        Ok(TreeFetch::Unchanged) => { info!("note_sync: 仓库无变化 (ETag 304)"); return stats; }
        Ok(TreeFetch::Changed { entries, .. }) => entries,
        Err(e) => { error!("note_sync: {}", e); return stats; }
    };
    let excludes: Vec<&str> = plan.exclude_dirs.iter().map(|s| s.as_str()).collect();
    let filtered = filter_entries(&entries, &plan.root, &excludes, plan.max_kb);

    let maps = NoteSyncMap::select_all(db).await.unwrap_or_default();
    let deleted_posts = Post::select_by_column(db, "is_deleted", 1).await.unwrap_or_default();
    let deleted_ids: HashSet<i32> = deleted_posts.iter()
        .filter_map(|p| p.id).collect::<HashSet<i32>>()
        .intersection(&maps.iter().map(|m| m.post_id).collect()).copied().collect();

    let categories = list_category_names(db).await;
    let actions = plan_actions(&filtered, &maps, &deleted_ids);
    stats.skipped = (filtered.len().saturating_sub(
        actions.iter().filter(|a| !matches!(a, SyncAction::SoftDelete { .. })).count())) as u32;

    info!("note_sync: plan {:?} -> {} actions (filtered {} files)",
        format!("{:?}", plan.repo), actions.len(), filtered.len());

    for (i, action) in actions.into_iter().enumerate() {
        let r = match action {
            SyncAction::Create { path, blob_sha } =>
                apply_create(db, gh, plan, ai.as_ref(), &path, &blob_sha, &categories).await,
            SyncAction::Update { map_id, post_id, path, blob_sha } =>
                apply_update(db, gh, plan, ai.as_ref(), map_id, post_id, &path, &blob_sha, &categories).await,
            SyncAction::Resurrect { map_id, post_id, path, blob_sha } =>
                apply_resurrect(db, gh, plan, ai.as_ref(), map_id, post_id, &path, &blob_sha, &categories).await,
            SyncAction::SoftDelete { post_id, .. } => apply_soft_delete(db, post_id).await,
        };
        match r {
            Ok(what) => match what.as_str() {
                "created" => stats.created += 1,
                "updated" => stats.updated += 1,
                "deleted" => stats.deleted += 1,
                "resurrected" => stats.resurrected += 1,
                "conflict" => { stats.skipped += 1; warn!("note_sync: 冲突跳过（本地有未推送编辑）"); }
                _ => {}
            },
            Err(path) => { stats.failed += 1; error!("note_sync: 处理失败 {}", path); }
        }
        if (i + 1) % 10 == 0 { info!("note_sync: 进度 {}/{}", i + 1, i + 1 + (actions.len() - i - 1)); }
    }
    info!("note_sync: 本轮完成 created={} updated={} deleted={} resurrected={} skipped={} failed={}",
        stats.created, stats.updated, stats.deleted, stats.resurrected, stats.skipped, stats.failed);
    stats
}
```

子函数（同文件追加）：

```rust
async fn list_category_names(db: &RBatis) -> Vec<String> {
    Category::select_all(db).await.unwrap_or_default()
        .iter().map(|c| c.name.clone()).collect()
}

/// 确保（默认「笔记」+ AI选的）分类存在并关联到文章
async fn ensure_category_and_link(db: &RBatis, post_id: i32, name: &str) {
    if name.is_empty() { return; }
    let existing = Category::select_by_column(db, "name", name).await.unwrap_or_default();
    let cat_id = match existing.into_iter().next() {
        Some(c) => c.id.unwrap_or(0),
        None => {
            let c = Category { id: None, name: name.to_string(),
                slug: crate::utils::parse_slug(name), description: None,
                priority: Some(0), parent_id: None };
            let _ = Category::insert(db, &c).await;
            Category::select_by_column(db, "name", name).await.unwrap_or_default()
                .into_iter().next().and_then(|c| c.id).unwrap_or(0)
        }
    };
    if cat_id > 0 {
        let link = PostCategory { id: None, post_id, category_id: cat_id };
        let _ = PostCategory::insert(db, &link).await;
    }
}

async fn relink_tags(db: &RBatis, post_id: i32, names: &[String]) {
    let _ = PostTag::delete_by_column(db, "post_id", post_id).await;
    for n in names {
        let n = n.trim();
        if n.is_empty() { continue; }
        let existing = Tag::select_by_column(db, "name", n).await.unwrap_or_default();
        let tag_id = match existing.into_iter().next() {
            Some(t) => t.id.unwrap_or(0),
            None => {
                let t = Tag { id: None, name: n.to_string(),
                    slug: crate::utils::parse_slug(n), description: None, priority: Some(0) };
                let _ = Tag::insert(db, &t).await;
                Tag::select_by_column(db, "name", n).await.unwrap_or_default()
                    .into_iter().next().and_then(|t| t.id).unwrap_or(0)
            }
        };
        if tag_id > 0 {
            let _ = PostTag::insert(db, &PostTag { id: None, post_id, tag_id }).await;
        }
    }
}

/// 调 AI（可用时）生成元数据；失败降级。返回 (meta, 是否降级)
async fn meta_for(ai: Option<&AiSettings>, path: &str, content: &str, categories: &[String]) -> (AiMeta, bool) {
    match ai {
        Some(s) => match ai_client::extract_meta(s, content, categories).await {
            Ok(m) => (m, false),
            Err(e) => { warn!("note_sync: AI 失败({}) -> 降级 {}", e, path); (ai_client::fallback_meta(path, content), true) }
        },
        None => (ai_client::fallback_meta(path, content), true),
    }
}

async fn apply_create(db: &RBatis, gh: &mut GithubClient, plan: &SyncPlan,
    ai: Option<&AiSettings>, path: &str, blob_sha: &str, categories: &[String])
    -> Result<String, String> {
    let content = gh.get_file(path).await.map_err(|e| { error!("{}", e); path.to_string() })?;
    let commit_ms = gh.last_commit_ms(path).await.unwrap_or(None);
    let (meta, fb) = meta_for(ai, path, &content, categories).await;

    let mut post = Post::new(
        meta.title.clone(),
        plan.author.clone(),
        content.clone(),
        md_to_html(&content),
        word_count(&content),
        Some(meta.summary.clone()),
    );
    post.is_view = meta.public as i32;
    if let Some(ms) = commit_ms { post.created_time = Some(ms); post.update_time = Some(ms); }
    let post_id = match Post::insert(db, &post).await {
        Ok(_) => Post::select_by_column(db, "title", &meta.title).await.ok()
            .and_then(|v| v.into_iter().find(|p| p.original_content == content)
                .and_then(|p| p.id)).unwrap_or(0),
        Err(_) => return Err(path.to_string()),
    };
    if post_id == 0 { return Err(path.to_string()); }

    let _ = PostCategory::delete_by_column(db, "post_id", post_id).await;
    ensure_category_and_link(db, post_id, &plan.category).await;
    ensure_category_and_link(db, post_id, &meta.category).await;
    relink_tags(db, post_id, &meta.tags).await;

    let m = NoteSyncMap {
        id: None, github_path: path.to_string(), blob_sha: blob_sha.to_string(),
        local_sha: sha256_hex(&content), post_id,
        ai_title: meta.title.clone(), ai_is_view: meta.public as i32,
        ai_reason: if meta.public { String::new() } else { meta.reason.clone() },
        last_commit_time: commit_ms, synced_at: get_sys_time(), status: "ok".into(),
    };
    if NoteSyncMap::insert(db, &m).await.is_err() { return Err(path.to_string()); }
    if fb { /* 计数由调用方通过返回值区分——简化：降级也成功 */ }
    Ok("created".into())
}

async fn apply_update(db: &RBatis, gh: &mut GithubClient, plan: &SyncPlan,
    ai: Option<&AiSettings>, map_id: i32, post_id: i32, path: &str, blob_sha: &str,
    categories: &[String]) -> Result<String, String> {
    // 冲突检测：本地改过（正文 hash != local_sha）-> 本地赢，跳过并标记
    let post = match Post::select_by_id(db, post_id).await {
        Ok(mut v) if !v.is_empty() => v.pop().unwrap(),
        _ => return Err(path.to_string()),
    };
    if sha256_hex(&post.original_content) != current_local_sha(db, map_id).await {
        mark_conflicted(db, map_id).await;
        return Ok("conflict".into());
    }
    let content = gh.get_file(path).await.map_err(|e| { error!("{}", e); path.to_string() })?;
    let (meta, _) = meta_for(ai, path, &content, categories).await;

    let old_ai_title = map_field(db, map_id, "ai_title").await.unwrap_or_default();
    let old_ai_view: i32 = map_field(db, map_id, "ai_is_view").await
        .and_then(|s| s.parse().ok()).unwrap_or(post.is_view);

    let mut p = post;
    p.title = merged_title(&p.title, &old_ai_title, &meta.title);
    p.is_view = merged_is_view(p.is_view, old_ai_view, meta.public);
    p.original_content = content.clone();
    p.format_content = md_to_html(&content);
    p.summary = Some(meta.summary.clone());
    p.word_count = Some(word_count(&content));
    p.update_time = Some(get_sys_time());
    if Post::update_by_column(db, &p, "id").await.is_err() { return Err(path.to_string()); }

    // 分类重建：默认分类 + AI 分类（保留可能与默认相同的情况自动去重由DB唯一性吸收失败）
    let _ = PostCategory::delete_by_column(db, "post_id", post_id).await;
    ensure_category_and_link(db, post_id, &plan.category).await;
    ensure_category_and_link(db, post_id, &meta.category).await;
    relink_tags(db, post_id, &meta.tags).await;

    exec_update_map(db, map_id, path, blob_sha, &content, &meta).await;
    Ok("updated".into())
}

async fn apply_resurrect(db: &RBatis, gh: &mut GithubClient, plan: &SyncPlan,
    ai: Option<&AiSettings>, map_id: i32, post_id: i32, path: &str, blob_sha: &str,
    categories: &[String]) -> Result<String, String> {
    // 取消软删
    if let Ok(mut v) = Post::select_by_id(db, post_id).await {
        if let Some(mut p) = v.pop() {
            p.is_deleted = Some(0);
            p.update_time = Some(get_sys_time());
            let _ = Post::update_by_column(db, &p, "id").await;
        }
    }
    // 内容也变了就顺带更新
    let sha_changed = map_field(db, map_id, "blob_sha").await.map(|s| s != blob_sha).unwrap_or(true);
    if sha_changed {
        apply_update(db, gh, plan, ai, map_id, post_id, path, blob_sha, categories).await?;
    }
    Ok("resurrected".into())
}

async fn apply_soft_delete(db: &RBatis, post_id: i32) -> Result<String, String> {
    if let Ok(mut v) = Post::select_by_id(db, post_id).await {
        if let Some(mut p) = v.pop() {
            p.is_deleted = Some(1);
            p.update_time = Some(get_sys_time());
            if Post::update_by_column(db, &p, "id").await.is_err() {
                return Err(format!("post {}", post_id));
            }
            return Ok("deleted".into());
        }
    }
    Err(format!("post {}", post_id))
}

// ---- map 表辅助（避免整行回写踩并发）----
async fn current_local_sha(db: &RBatis, map_id: i32) -> String {
    map_field(db, map_id, "local_sha").await.unwrap_or_default()
}
async fn map_field(db: &RBatis, map_id: i32, field: &str) -> Option<String> {
    let sql = format!("select {} from note_sync_map where id = ?", field);
    let v: Option<String> = db.query_decode(sql, vec![rbs::to_value!(map_id)]).await.ok();
    v
}
async fn mark_conflicted(db: &RBatis, map_id: i32) {
    let _ = db.exec("update note_sync_map set status = 'conflicted' where id = ?",
        vec![rbs::to_value!(map_id)]).await;
}
async fn exec_update_map(db: &RBatis, map_id: i32, path: &str, blob_sha: &str,
    content: &str, meta: &AiMeta) {
    let now = get_sys_time();
    let _ = db.exec(
        "update note_sync_map set blob_sha = ?, local_sha = ?, ai_title = ?, ai_is_view = ?, \
         ai_reason = ?, synced_at = ?, status = 'ok' where id = ?",
        vec![rbs::to_value!(blob_sha), rbs::to_value!(sha256_hex(content)),
             rbs::to_value!(meta.title), rbs::to_value!(meta.public as i32),
             rbs::to_value!(if meta.public { String::new() } else { meta.reason.clone() }),
             rbs::to_value!(now), rbs::to_value!(map_id)]).await;
    let _ = path; // path 用于日志时可取
}
```

**注意**：`Post::select_by_column(db, "is_deleted", 1)` 返回 `Vec<Post>`；`rbatis` 的 `query_decode` 标量用法参考 `Post::count_all` 的既有写法。若 `query_decode::<Option<String>>` 类型不匹配，改为 `Vec<String>` 后 `into_iter().next()`（实现时以编译为准，语义不变）。

- [ ] **Step 3: 编译 + 全部测试通过**

```bash
cargo build 2>&1 | grep -E "^error" | head; cargo test note_sync 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add src/note_sync/
git commit -m "feat(note_sync): 应用循环（建/改/删/复活 + AI集成 + 分类标签落库）"
```

---

### Task 8: 调度器与 main.rs 接线

**Files:**
- Create: `src/note_sync/scheduler.rs`
- Modify: `src/note_sync/mod.rs`（加 `pub mod scheduler;`）
- Modify: `src/main.rs`（spawn 后台任务；`admin_route_prefixes` 不动——本任务无新路由）

**Interfaces:**
- Consumes: Task 7 `run_sync_cycle/load_ai_settings/SyncPlan`
- Produces: `pub async fn start(db: RBatis)`（main 调用一次）

- [ ] **Step 1: 实现 scheduler.rs**（无可单测的纯逻辑，靠编译 + Task 11 集成验证）

```rust
use crate::note_sync::github_client::GithubClient;
use crate::note_sync::sync_engine::{load_ai_settings, run_sync_cycle, SyncPlan};
use rbatis::RBatis;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use tracing::{error, info};
use std::time::Duration;

static RUNNING: AtomicBool = AtomicBool::new(false);

pub async fn start(db: RBatis) {
    let plan = SyncPlan {
        repo: env::var("NOTE_SYNC_REPO").unwrap_or_default(),
        branch: env::var("NOTE_SYNC_BRANCH").unwrap_or_default(),
        token: env::var("NOTE_SYNC_TOKEN").unwrap_or_default(),
        root: env::var("NOTE_SYNC_ROOT").unwrap_or_else(|_| "笔记/".into()),
        exclude_dirs: env::var("NOTE_SYNC_EXCLUDE_DIRS").unwrap_or_default()
            .split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
        max_kb: env::var("NOTE_SYNC_MAX_FILE_KB").ok().and_then(|v| v.parse().ok()).unwrap_or(1024),
        author: env::var("NOTE_SYNC_AUTHOR").unwrap_or_else(|_| "Ryu2u".into()),
        category: env::var("NOTE_SYNC_CATEGORY").unwrap_or_else(|_| "笔记".into()),
        allow_http: env::var("NOTE_SYNC_AI_ALLOW_HTTP").unwrap_or_default() == "1",
        enc_key: env::var("NOTE_SYNC_AI_ENC_KEY").unwrap_or_default(),
    };
    let interval_min: u64 = env::var("NOTE_SYNC_INTERVAL_MIN").ok()
        .and_then(|v| v.parse().ok()).unwrap_or(30);

    // 启动后 10 秒先跑一轮
    tokio::time::sleep(Duration::from_secs(10)).await;
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_min * 60));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    loop {
        ticker.tick().await;
        if RUNNING.swap(true, Ordering::SeqCst) {
            info!("note_sync: 上一轮仍在进行，跳过本轮");
            continue;
        }
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            // run_sync_cycle 是 async，catch_unwind 需要包 spawn + join
            tokio::spawn(run_once(db.clone(), plan.clone()))
        }));
        match result {
            Ok(handle) => { let _ = handle.await; }
            Err(_) => error!("note_sync: 同步轮任务 panic"),
        }
        RUNNING.store(false, Ordering::SeqCst);
    }
}

async fn run_once(db: RBatis, plan: SyncPlan) {
    let ai = load_ai_settings(&db, &plan.enc_key, plan.allow_http).await;
    let mut gh = GithubClient::new(&plan.token, &plan.repo, &plan.branch);
    let stats = run_sync_cycle(&db, &mut gh, &plan, ai).await;
    info!("note_sync stats: {:?}", stats);
}
```

（`SyncPlan` 需要派生 `Clone`：在 Task 7 定义处加 `#[derive(Clone)]`。）

- [ ] **Step 2: main.rs 接线**

`src/main.rs` 在 `let rbatis = init_rbatis(db_path).await;` 与 `info!("config init success!");` 之后插入：

```rust
// GitHub 笔记同步后台任务
if env::var("NOTE_SYNC_ENABLED").unwrap_or_default() == "true" {
    info!("note_sync enabled, background task starting");
    tokio::spawn(note_sync::scheduler::start(rbatis.clone()));
}
```

（`env` 已在 main.rs 引入。）

- [ ] **Step 3: 编译验证**

```bash
cargo build 2>&1 | grep -cE "^error"   # Expected: 0
```

- [ ] **Step 4: Commit**

```bash
git add src/note_sync/ src/main.rs
git commit -m "feat(note_sync): tokio 轮询调度器并接入 main"
```

---

### Task 9: 管理端配置接口（读写/掩码/测试/限速/审计）

**Files:**
- Create: `src/note_sync/apis.rs`
- Modify: `src/note_sync/mod.rs`（加 `pub mod apis;`）
- Modify: `src/main.rs`（`admin_route_prefixes` 加 `"/note_sync/admin"`；`.service(note_sync::apis::note_sync_scope())`）

**Interfaces:**
- Consumes: Task 6 `crypto/validate_base_url/extract_meta`、Task 7 `load_ai_settings`、既有 `R<T>`/`Exception`
- Produces（Task 10 前端消费的 HTTP 契约）:

```
GET  /note_sync/admin/config  -> R<ConfigVo>   { ai_enabled, ai_base_url, ai_model, ai_api_key_masked, updated_at }
POST /note_sync/admin/config  body ConfigSaveDto { ai_enabled:i32, ai_base_url:String, ai_model:String, ai_api_key:Option<String> }
     key 为 None/空串/含"***" -> 保留旧密文；否则 AES 加密后存储。返回 R::ok_msg
POST /note_sync/admin/ai_test -> R<AiTestVo> { reply:String }  10 秒滑动窗限速
```

- [ ] **Step 1: 写失败测试（掩码与"是否更新key"判定）**

`src/note_sync/apis.rs` 末尾：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key() {
        assert_eq!(mask_key("sk-abcdefgh1234"), "sk-ab***1234");
        assert_eq!(mask_key("short"), "***");
        assert_eq!(mask_key(""), "***");
    }
    #[test]
    fn test_should_update_key() {
        assert!(!should_update_key(&None));
        assert!(!should_update_key(&Some(String::new())));
        assert!(!should_update_key(&Some("sk-ab***1234".into())));
        assert!(should_update_key(&Some("sk-newkey".into())));
    }
}
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**

```rust
use crate::note_sync::ai_client::{self, AiSettings};
use crate::note_sync::crypto;
use crate::note_sync::structs::NoteSyncConfig;
use crate::{Exception, R};
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use serde::{Deserialize, Serialize};
use crate::utils::time_utils::get_sys_time;
use tracing::{info, warn};
use std::sync::Mutex;
use std::time::Instant;

pub fn note_sync_scope() -> actix_web::Scope {
    actix_web::web::scope("/note_sync")
        .service(api_config_get)
        .service(api_config_save)
        .service(api_ai_test)
}

#[derive(Serialize)]
pub struct ConfigVo {
    pub ai_enabled: i32,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key_masked: String,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct ConfigSaveDto {
    pub ai_enabled: i32,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key: Option<String>,
}

#[derive(Serialize)]
pub struct AiTestVo { pub reply: String }

pub fn mask_key(key: &str) -> String {
    let n = key.chars().count();
    if n <= 8 {
        "***".into()
    } else {
        let c: Vec<char> = key.chars().collect();
        format!("{}***{}", c[..5].iter().collect::<String>(), c[n - 4..].iter().collect::<String>())
    }
}

pub fn should_update_key(k: &Option<String>) -> bool {
    match k {
        None => false,
        Some(s) => !s.is_empty() && !s.contains("***"),
    }
}

fn enc_key() -> String {
    std::env::var("NOTE_SYNC_AI_ENC_KEY").unwrap_or_default()
}
fn allow_http() -> bool {
    std::env::var("NOTE_SYNC_AI_ALLOW_HTTP").unwrap_or_default() == "1"
}

#[get("/admin/config")]
async fn api_config_get(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let rows = NoteSyncConfig::select_by_id(&**db, 1).await
        .map_err(|_| Exception::InternalError)?;
    match rows.into_iter().next() {
        Some(c) => Ok(R::ok_obj(ConfigVo {
            ai_enabled: c.ai_enabled,
            ai_base_url: c.ai_base_url,
            ai_model: c.ai_model,
            ai_api_key_masked: mask_key_plain_or_empty(&**db, &c).await,
            updated_at: c.updated_at,
        })),
        None => Ok(R::ok_obj(ConfigVo {
            ai_enabled: 0, ai_base_url: String::new(), ai_model: String::new(),
            ai_api_key_masked: String::new(), updated_at: 0,
        })),
    }
}

async fn mask_plain_or_empty(db: &RBatis, c: &NoteSyncConfig) -> String {
    if c.ai_api_key.is_empty() { return String::new(); }
    crypto::decrypt_from_b64(&c.ai_api_key, &enc_key())
        .map(|k| mask_key(&k)).unwrap_or_else(|_| "*(解密失败)*".into())
    , let _ = db;
}

#[post("/admin/config")]
async fn api_config_save(dto: web::Json<ConfigSaveDto>, db: web::Data<RBatis>)
    -> Result<impl Responder, Exception> {
    ai_client::validate_base_url(&dto.ai_base_url, allow_http())
        .map_err(Exception::BadRequest)?;
    let key = enc_key();
    if key.is_empty() {
        return Err(Exception::BadRequest("服务端未配置 NOTE_SYNC_AI_ENC_KEY".into()));
    }
    let old = NoteSyncConfig::select_by_id(&**db, 1).await.ok()
        .and_then(|v| v.into_iter().next());
    let cipher = if should_update_key(&dto.ai_api_key) {
        crypto::encrypt_to_b64(dto.ai_api_key.as_ref().unwrap(), &key)
            .map_err(Exception::BadRequest)?
    } else {
        old.as_ref().map(|o| o.ai_api_key.clone()).unwrap_or_default()
    };
    let now = get_sys_time();
    let row = NoteSyncConfig {
        id: Some(1), ai_enabled: dto.ai_enabled,
        ai_base_url: dto.ai_base_url.clone(), ai_api_key: cipher,
        ai_model: dto.ai_model.clone(), updated_at: now,
    };
    let existed = old.is_some();
    let r = if existed {
        NoteSyncConfig::update_by_column(&**db, &row, "id").await
    } else {
        NoteSyncConfig::insert(&**db, &row).await
    };
    match r {
        Ok(_) => {
            // 审计日志：只记字段名不记值
            let mut fields = vec!["ai_enabled", "ai_base_url", "ai_model"];
            if should_update_key(&dto.ai_api_key) { fields.push("ai_api_key"); }
            info!("note_sync config updated: {:?}", fields);
            Ok(R::ok_msg("保存成功!"))
        }
        Err(_) => Err(Exception::BadRequest("保存失败".into())),
    }
}

static LAST_TEST: Mutex<Option<Instant>> = Mutex::new(None);

#[post("/admin/ai_test")]
async fn api_ai_test(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    // 10 秒滑动窗限速
    {
        let mut last = LAST_TEST.lock().unwrap();
        if let Some(t) = *last {
            if t.elapsed().as_secs() < 10 {
                return Err(Exception::BadRequest("测试太频繁，请 10 秒后再试".into()));
            }
        }
        *last = Some(Instant::now());
    }
    let settings = crate::note_sync::sync_engine::load_ai_settings(&**db, &enc_key(), allow_http())
        .await.ok_or_else(|| Exception::BadRequest("AI 未启用或配置不完整".into()))?;
    let cats = vec!["测试".to_string()];
    match ai_client::extract_meta(&settings, "## 测试笔记\n这是一条连通性测试。", &cats).await {
        Ok(m) => Ok(R::ok_obj(AiTestVo { reply: format!("模型连通正常，示例标题: {}", m.title) })),
        Err(e) => { warn!("ai_test 失败: {}", e); Err(Exception::BadRequest(e)) }
    }
}
```

**修正说明**：`mask_plain_or_empty` 里那行 `, let _ = db;` 是笔误，实现时删除该行并去掉 `db` 参数（函数只需 `c`）。签名：`async fn mask_plain_or_empty(c: &NoteSyncConfig) -> String`，调用处相应改为 `mask_plain_or_empty(&c).await`。注意 `Exception::BadRequest` 接收 `String`（见 `src/config.rs` 定义，若为 `&str` 则 `.into()`）。

- [ ] **Step 4: main.rs 注册路由（两处清单！）**

`AppState.admin_route_prefixes` 的 vec 里追加：

```rust
"/note_sync/admin",
```

`.service(moment_scope())` 之后追加：

```rust
.service(note_sync::apis::note_sync_scope())
```

**不要**把 `/note_sync/admin` 加进 `FilterWhiteList`。

- [ ] **Step 5: 测试 + 编译**

```bash
cargo test note_sync 2>&1 | tail -3   # 全部通过
cargo build 2>&1 | grep -cE "^error"  # 0
```

- [ ] **Step 6: 接口冒烟（登录 cookie）**

```bash
cargo run &   # 或复用已跑进程（先 kill 旧的）
sleep 5
curl -s -c /tmp/cj.txt -X POST localhost:9002/user/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>","remember":true}' > /dev/null
curl -s -b /tmp/cj.txt localhost:9002/note_sync/admin/config
# Expected: {"code":200,...ai_enabled":0,"ai_base_url":""...}（尚无配置行）
curl -s -b /tmp/cj.txt -X POST localhost:9002/note_sync/admin/config -H 'Content-Type: application/json' \
  -d '{"ai_enabled":1,"ai_base_url":"https://api.deepseek.com/v1","ai_model":"deepseek-flash","ai_api_key":"<真实key由控制台在派发时单独提供，勿写入任何被跟踪文件>"}'
# Expected: {"code":200,"msg":"保存成功!"...}
curl -s -b /tmp/cj.txt localhost:9002/note_sync/admin/config
# Expected: ai_api_key_masked = "sk-74***ae7a"，不出现完整key
curl -s -X POST localhost:9002/note_sync/admin/ai_test
# Expected: 401（未登录被拦截，验证 admin 前缀生效）
```

- [ ] **Step 7: Commit**

```bash
git add src/note_sync/ src/main.rs
git commit -m "feat(note_sync): 管理端配置接口（AES存储/掩码回显/限速测试/审计）"
```

---

### Task 10: 管理后台「同步设置」页（前端）

**Files:**
- Create: `front/ryu2u_blog_admin/src/service/NoteSyncService.ts`
- Create: `front/ryu2u_blog_admin/src/admin/notesync/SyncSettingsPage.tsx`
- Modify: `front/ryu2u_blog_admin/src/common/routerConfig.tsx`
- Modify: `front/ryu2u_blog_admin/src/admin/Admin.tsx`（菜单）

**Interfaces:**
- Consumes: Task 9 的三个 HTTP 接口；`http_client`（AxioConfig 既有导出）；antd5 组件
- Produces: 路由 `/notesync` 页面

- [ ] **Step 1: NoteSyncService.ts**

```typescript
import {Result} from "../common/Structs";
import {http_client} from "../common/AxioConfig";

namespace NoteSyncService {
    export function getConfig(): Promise<Result> {
        return http_client.get("/note_sync/admin/config");
    }

    export function saveConfig(aiEnabled: number, baseUrl: string, model: string, apiKey?: string): Promise<Result> {
        return http_client.post("/note_sync/admin/config", {
            ai_enabled: aiEnabled,
            ai_base_url: baseUrl,
            ai_model: model,
            ai_api_key: apiKey
        });
    }

    export function testAi(): Promise<Result> {
        return http_client.post("/note_sync/admin/ai_test");
    }
}

export default NoteSyncService;
```

- [ ] **Step 2: SyncSettingsPage.tsx**

```tsx
import {useEffect, useState} from "react";
import {Button, Card, Form, Input, message, Switch} from "antd";
import NoteSyncService from "../../service/NoteSyncService";

interface ConfigVo {
    ai_enabled: number;
    ai_base_url: string;
    ai_model: string;
    ai_api_key_masked: string;
    updated_at: number;
}

export function SyncSettingsPage() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        NoteSyncService.getConfig().then((res: any) => {
            if (res?.code === 200 && res.obj) {
                const c: ConfigVo = res.obj;
                form.setFieldsValue({
                    enabled: c.ai_enabled === 1,
                    base_url: c.ai_base_url,
                    model: c.ai_model,
                });
            }
        });
    }, [form]);

    const onSave = () => {
        form.validateFields().then((v) => {
            setLoading(true);
            NoteSyncService.saveConfig(v.enabled ? 1 : 0, v.base_url, v.model, v.api_key || undefined)
                .then((res: any) => {
                    if (res?.code === 200) {
                        message.success("保存成功");
                        form.setFieldValue("api_key", undefined);
                    } else {
                        message.error(res?.msg || "保存失败");
                    }
                })
                .finally(() => setLoading(false));
        });
    };

    const onTest = () => {
        setTesting(true);
        NoteSyncService.testAi().then((res: any) => {
            if (res?.code === 200) {
                message.success(res.obj?.reply || "连通正常");
            } else {
                message.error(res?.msg || "测试失败");
            }
        }).finally(() => setTesting(false));
    };

    return (
        <Card title="同步设置 · AI 元数据" style={{margin: 16}}>
            <Form form={form} layout="vertical" style={{maxWidth: 520}}>
                <Form.Item name="enabled" label="启用 AI 元数据生成" valuePropName="checked">
                    <Switch/>
                </Form.Item>
                <Form.Item name="base_url" label="Base URL（OpenAI 兼容，必须 https）"
                    rules={[{required: true, message: "必填"},
                            {pattern: /^https:\/\//, message: "必须以 https:// 开头"}]}>
                    <Input placeholder="https://api.deepseek.com/v1"/>
                </Form.Item>
                <Form.Item name="model" label="模型 ID" rules={[{required: true, message: "必填"}]}>
                    <Input placeholder="deepseek-flash"/>
                </Form.Item>
                <Form.Item name="api_key" label="API Key（留空 = 保持已有）">
                    <Input.Password placeholder="sk-..."/>
                </Form.Item>
                <Form.Item>
                    <Button type="primary" loading={loading} onClick={onSave}>保存</Button>
                    <Button style={{marginLeft: 8}} loading={testing} onClick={onTest}>测试连接</Button>
                </Form.Item>
            </Form>
            <div style={{color: "#888", fontSize: 12}}>
                说明：AI 为同步的笔记生成标题/摘要/标签/分类，并判定是否可公开；AI 不可用时笔记默认隐藏。
            </div>
        </Card>
    );
}
```

- [ ] **Step 3: 路由与菜单**

`routerConfig.tsx`：import 区加 `import {SyncSettingsPage} from "../admin/notesync/SyncSettingsPage";`，`routeConfig` 数组 `/about` 项之前插入：

```tsx
    {
        path: '/notesync',
        element: SyncSettingsPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '同步设置' }
        ]
    },
```

`Admin.tsx`：import 区加 `CloudSyncOutlined`（`@ant-design/icons`），菜单数组 `/about` 项之前插入：

```tsx
    {
        key: "/notesync",
        title: '同步设置',
        label: "同步设置",
        icon: createElement(CloudSyncOutlined),
        disabled: false,
        danger: false
    },
```

- [ ] **Step 4: 类型检查 + 构建 + lint**

```bash
cd front/ryu2u_blog_admin && npm run build 2>&1 | tail -5   # tsc && vite build 通过
cd front/ryu2u_blog_admin && npm run lint 2>&1 | tail -5    # 0 error（--max-warnings 0）
```

- [ ] **Step 5: Commit**

```bash
git add front/ryu2u_blog_admin/src
git commit -m "feat(note_sync): 管理后台同步设置页（LLM 配置/测试连接）"
```

---

### Task 11: 端到端验证 + 文档更新

**Files:**
- Modify: `CLAUDE.md`（模块清单/环境变量/管理端前缀说明）

**Interfaces:**
- Consumes: 全部前序任务

- [ ] **Step 1: 重启后端触发首轮同步**

```bash
pkill -f 'target/debug/rust_blog' 2>/dev/null; sleep 1
cargo run 2>&1 | tee /tmp/sync_first.log &
# 等 10 秒首轮启动；132 文件 × AI 串行预计 10-20 分钟，观察进度日志
sleep 60; grep -c "note_sync" /tmp/sync_first.log
```

- [ ] **Step 2: 数据核验**

```bash
mysql -uroot -p123456 -h127.0.0.1 rust_blog -e "
SELECT COUNT(*) AS posts_total FROM post;
SELECT COUNT(*) AS maps FROM note_sync_map;
SELECT is_view, COUNT(*) FROM note_sync_map m JOIN post p ON p.id=m.post_id GROUP BY is_view;
SELECT github_path, ai_title, ai_is_view, LEFT(ai_reason,40) FROM note_sync_map WHERE ai_is_view=0 LIMIT 10;
SELECT DISTINCT name FROM category;"
# 预期: maps ≈ 132（笔记/目录实际 md 数），posts 相应增加；is_view=0 的行有理由；出现「笔记」及 AI 新分类
```

- [ ] **Step 3: 前端核验**

```bash
curl -s -X POST localhost:9002/post/page -H 'Content-Type: application/json' \
  -d '{"page_num":1,"page_size":5,"total":200}' | python3 -m json.tool | head -30
# 预期: AI 标题/摘要的文章出现在公开列表（is_view=1 的那些）
# 管理后台 http://localhost:8089/notesync 页面可正常显示配置、测试连接成功
```

- [ ] **Step 4: 增量/删除语义核验（选一个远端文件做小改动）**

```bash
# 在 GitHub 网页上改 笔记/Docker/Docker安装.md 加一行文字（或 gh api PUT）
# 下一轮（或重启）后: post 表该文章 original_content 含新行
# 再删掉该文件 -> 该 post is_deleted=1；恢复文件 -> is_deleted=0（复活）
```

- [ ] **Step 5: 更新 CLAUDE.md**

`## Architecture` 的 Modules 行补 `note_sync/`（github 客户端/AI 客户端/差分引擎/调度器/管理接口，`.env` `NOTE_SYNC_*` 驱动，表 `note_sync_map`/`note_sync_config`）；`## Environment Variables` 一节列出全部 `NOTE_SYNC_*` 变量；"Adding an authenticated/admin endpoint" 的 admin_route_prefixes 示例补 `/note_sync/admin`。

- [ ] **Step 6: 最终提交**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 补充 note_sync 模块与 NOTE_SYNC_* 环境变量"
```

---

## 自审记录（Self-Review）

1. **Spec 覆盖**：拉取镜像（Task 3/7）、ETag（5）、AI 五字段+公开审查+降级隐藏（6/7）、人工保护（3/7）、分类双挂（7）、配置表+掩码+审计+限速+SSRF/https（6/9）、AES 落库（6/9）、`.env` 治理（1）、调度防重入（8）、管理页（10）、E2E（11）——全部有任务。Phase 2 推送按 spec 明确不在本计划。
2. **占位符**：无 TBD/TODO；Task 9 有一处已标注的笔误修正说明（实现时照改）。
3. **类型一致性**：`TreeEntry/SyncAction/SyncPlan/SyncStats/AiSettings/AiMeta/ConfigVo/ConfigSaveDto` 各任务间签名已互相对齐；`SyncPlan` 的 `#[derive(Clone)]` 在 Task 8 标注补到 Task 7 定义处。
