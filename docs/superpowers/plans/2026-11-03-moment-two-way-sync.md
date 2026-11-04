# 说说与 md_note 仓库双向同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让博客「说说」（`moment` 表）与笔记仓库 `Ryu2u/md_note` 根目录下的 `说说/` 文件夹双向同步：仓库里的增改删同步到说说，后台的发布/修改/删除随下一轮定时同步写回仓库，两边都改了同一条时以仓库为准。

**Architecture:** 新增 `src/note_sync/moment_sync.rs`（纯函数：文件名 ↔ 发布时间、文件解析/渲染、认领、差分规划；带 IO 的：拉取阶段、写回阶段、一轮入口）和映射表 `moment_sync_map`；`GithubClient` 增加 `put_file` / `delete_file` 与可配置的 API 根地址；调度层一轮只拉一次仓库树，依次交给笔记阶段与说说阶段（树没变时说说仍跑写回）。笔记 → 文章的既有行为不变。

**Tech Stack:** Rust / Actix-web 4 / rbatis 4.5（MySQL）/ reqwest 0.12 / chrono / sha2 / url；前端只改一行 React 文案。**不新增任何依赖。**

**Spec:** `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`（已通过评审）

## 关于这份计划里的代码

- 计划里所有「新建文件」「查找/替换」都是**逐字**的：它们先在仓库的一份临时副本里完整实现、编译，并跑通了全部单元测试（Task 2、3、5 的数量见各自的期望输出）和对接临时 MySQL 的 10 个端到端场景；随后把本计划里的全部操作按顺序应用到另一份全新副本，`src/` 与 `schema.sql` 和已验证的实现逐文件一致。照着做，应得到同样的结果。
- 因为代码和测试是一起准备好的，所以每个任务不再单独走「先写失败测试」的红灯步骤，而是用**变异检查**（临时改坏关键规则，确认测试会失败，再还原）来证明测试真的在约束行为。

## 关于提交

每个任务末尾有一个提交步骤。**你批准这份计划并选定执行方式时，请一并说明是否同意按任务逐个提交**（不含推送）。没有明确同意就不要提交，把改动留在工作树里。

## Global Constraints

- 文件名格式 `YYYY_MM_DD_HH_mm.md`，时区固定 **+08:00**；同一分钟重名依次尝试 `…_mm.md` → `…_mm_ss.md` → `…_ss-2.md` → `-3` → `-4`（共 5 个候选）
- 冲突规则：**仓库为准**（与笔记同步的「本地赢」相反，是有意的，不要统一）
- 写回阶段每轮最多 **50** 个操作；先删、再改、后建
- 配置默认值：`NOTE_SYNC_MOMENT_DIR=说说/`（设为空 = 关闭说说同步）、`NOTE_SYNC_MOMENT_PUSH=true`（`false` / `0` = 只拉取）、`NOTE_SYNC_API_BASE=https://api.github.com`（非 https 只允许 `localhost` / `127.0.0.1` / `[::1]`）
- 笔记 → 文章的同步结果不变；唯一的结构性改动是「拉树提到调度层」和「笔记过滤排除说说目录」
- 注释用中文，风格与周围代码一致
- **执行期间不要碰真实仓库 `Ryu2u/md_note`，也不要用 `.env` 里的真实令牌跑后端**（`.claude/launch.json` 的 backend 配置已经带 `NOTE_SYNC_ENABLED=false`）。所有验证只用临时库 + 进程内模拟的 GitHub。唯一例外是文末可选的 Task 9，必须先得到你的明确同意
- 工作目录 `/Users/ryu2u/Developer/Project/rust_blog`，分支 `master`

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/note_sync/moment_sync.rs` | 新建 | 纯函数 + 拉取/写回阶段 + 一轮入口 |
| `src/note_sync/moment_e2e.rs` | 新建 | 端到端测试（`#[ignore]`，需临时库） |
| `src/note_sync/github_client.rs` | 修改 | `put_file` / `delete_file`、`Forbidden` / `Conflict`、可配置 API 根地址 |
| `src/note_sync/structs.rs` | 修改 | `MomentSyncMap` |
| `src/note_sync/sync_engine.rs` | 修改 | `run_sync_cycle` 接收调度层拉到的条目；过滤排除说说目录；`SyncPlan.moment`；`value_to_i32` 对 crate 可见 |
| `src/note_sync/scheduler.rs` | 修改 | 一轮拉一次树，依次跑笔记与说说 |
| `src/note_sync/mod.rs` | 修改 | 注册两个新模块 |
| `src/moment/mod.rs`、`src/moment/apis.rs` | 修改 | 图片 JSON 的解析/序列化函数提到 `moment` 模块并公开 |
| `schema.sql` | 修改 | `moment_sync_map` 表 |
| `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx` | 修改 | 一行说明文案 |
| `.env.example`、`CLAUDE.md`、设计文档 | 修改 | 配置与文档 |
| `docs/migrations/2026-11-03-moment-two-way-sync.md` | 新建 | 服务器迁移文档 |

---

### Task 1: 数据层（映射表结构体、建表、图片辅助函数公开）

**Files:**
- Modify: `src/note_sync/structs.rs`、`schema.sql`、`src/moment/mod.rs`、`src/moment/apis.rs`

**Interfaces:**
- Produces: `MomentSyncMap`（`id: Option<i32>, moment_id: i32, github_path: String, blob_sha: String, local_sha: String, synced_at: i64`，`crud!` 生成 `select_all` / `insert` / `delete_by_column`）；`crate::moment::parse_images(Option<String>) -> Vec<String>`、`crate::moment::serialize_images(Option<Vec<String>>) -> Option<String>`

**修改 `src/note_sync/structs.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
impl_select!(NoteSyncMap {
    select_by_post_id(post_id: i32) => "`where post_id = #{post_id}`"
});
````

替换为：

````rust
impl_select!(NoteSyncMap {
    select_by_post_id(post_id: i32) => "`where post_id = #{post_id}`"
});

/// 说说 ↔ 仓库 `说说/` 目录下文件 的映射
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MomentSyncMap {
    pub id: Option<i32>,
    pub moment_id: i32,
    /// 仓库内相对路径，如 "说说/2026_09_17_22_15.md"，唯一
    pub github_path: String,
    /// 上次同步时仓库文件的 git blob sha（判断仓库有没有变；写回时带的旧 sha）
    pub blob_sha: String,
    /// 上次同步时 sha256(按库里数据渲染出的文件文本)（判断后台有没有变）
    pub local_sha: String,
    pub synced_at: i64,
}
crud!(MomentSyncMap {});
````

**修改 `schema.sql`**（查找的片段必须恰好出现一次）：

查找：

````sql
  `updated_at` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
````

替换为：

````sql
  `updated_at` BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ----------------------------
-- 说说 ↔ 仓库文件映射（说说双向同步）
-- ----------------------------
DROP TABLE IF EXISTS `moment_sync_map`;
CREATE TABLE `moment_sync_map` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `moment_id` INT NOT NULL,
  `github_path` VARCHAR(512) NOT NULL,
  `blob_sha` CHAR(40) NOT NULL,
  `local_sha` CHAR(64) NOT NULL,
  `synced_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_moment_id` (`moment_id`),
  UNIQUE KEY `uk_github_path` (`github_path`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='说说与仓库文件映射';
````

**修改 `src/moment/mod.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
fn escape_sql(value: &str) -> String {
````

替换为：

````rust
/// 图片列的 JSON 数组 → 列表；NULL / 坏 JSON 都得到空列表
pub fn parse_images(images: Option<String>) -> Vec<String> {
    images
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

/// 列表 → 图片列的 JSON 数组；空列表存 NULL
pub fn serialize_images(images: Option<Vec<String>>) -> Option<String> {
    let values = images.unwrap_or_default();
    if values.is_empty() {
        None
    } else {
        serde_json::to_string(&values).ok()
    }
}

fn escape_sql(value: &str) -> String {
````

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
fn parse_images(images: Option<String>) -> Vec<String> {
    images
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

fn serialize_images(images: Option<Vec<String>>) -> Option<String> {
    let values = images.unwrap_or_default();
    if values.is_empty() {
        None
    } else {
        serde_json::to_string(&values).ok()
    }
}
````

替换为：

（空——即删除上面查找到的整段）

**修改 `src/moment/apis.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
use crate::moment::Moment;
````

替换为：

````rust
use crate::moment::{parse_images, serialize_images, Moment};
````

- [ ] **验证：能编译，说说既有测试不受影响**

```bash
cargo check 2>&1 | tail -3
cargo test moment 2>&1 | grep -E "^test result"
```

期望：`Finished`（会有 `MomentSyncMap` 尚未使用的警告，属正常）；`moment` 相关测试 `0 failed`。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/note_sync/structs.rs \
  schema.sql \
  src/moment/mod.rs \
  src/moment/apis.rs
git commit -F - <<'EOF'
feat(moment_sync): 说说映射表 moment_sync_map 与图片辅助函数公开

新增 MomentSyncMap 结构体与 moment_sync_map 建表语句；parse_images / serialize_images
从说说接口文件提到 moment 模块并公开，供同步复用。行为不变。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 纯函数（文件名、文件格式、认领、差分规划）

**Files:**
- Create: `src/note_sync/moment_sync.rs`（本任务只含纯函数与单元测试）
- Modify: `src/note_sync/mod.rs`

**Interfaces:**
- Consumes: Task 1 的 `MomentSyncMap`、`parse_images`
- Produces（后面的任务都用）：
  - `MomentSyncConfig { dir, push, exclude_dirs, max_kb }`，`MomentSyncConfig::new(raw_dir, push, exclude_dirs, max_kb) -> Option<Self>`，`MomentSyncConfig::from_env(exclude_dirs, max_kb) -> Option<Self>`，`parse_push_flag(Option<&str>) -> bool`
  - `path_candidates(dir, created_ms) -> Vec<String>`、`parse_name_time(path) -> Option<i64>`、`same_minute`、`commit_message(verb, path) -> String`
  - `MomentFile { content, images, location, is_public }`、`parse_file(&str) -> Option<MomentFile>`、`render_file`、`moment_to_file`、`render_moment(&Moment) -> String`、`fingerprint(&Moment) -> String`、`normalized(&Moment) -> Option<MomentFile>`
  - `find_adoptee(path, &MomentFile, &[Moment], &HashSet<i32>) -> Option<&Moment>`
  - `filter_moment_files(entries, dir, exclude_dirs, max_kb) -> Vec<TreeEntry>`
  - `PullAction { New | Update | Remove }`、`plan_pull(files, maps)`；`PushAction { Delete | Update | Create }`、`plan_push(moments, maps)`、`MAX_PUSH_OPS = 50`

**修改 `src/note_sync/mod.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub mod github_client;
````

替换为：

````rust
pub mod github_client;
pub mod moment_sync;
````

**新建 `src/note_sync/moment_sync.rs`**，内容如下：

````rust
//! 说说 ↔ 仓库 `说说/` 目录的双向同步（设计文档 2026-11-03-moment-two-way-sync-design.md）。
//!
//! 上半部分是纯函数（文件名、文件格式、认领、差分规划），带单元测试；
//! 下半部分是带数据库与网络的同步阶段：先拉取（仓库为准），再写回。

use std::collections::{HashMap, HashSet};

use chrono::{FixedOffset, NaiveDate, TimeZone};

use crate::moment::{parse_images, Moment};
use crate::note_sync::derive::sha256_hex;
use crate::note_sync::structs::MomentSyncMap;
use crate::note_sync::sync_engine::TreeEntry;

/// 文件名里的时间按 +08:00 解释（设计文档 §6.1）
const TZ_OFFSET_SECS: i32 = 8 * 3600;
/// 每轮写回阶段最多执行的操作数（防 GitHub 二级限流）
pub const MAX_PUSH_OPS: usize = 50;

fn tz() -> FixedOffset {
    FixedOffset::east_opt(TZ_OFFSET_SECS).expect("valid offset")
}

// ---------- 配置 ----------

#[derive(Clone, Debug, PartialEq)]
pub struct MomentSyncConfig {
    /// 仓库内说说目录，以 "/" 结尾
    pub dir: String,
    /// false = 只拉取不写回
    pub push: bool,
    pub exclude_dirs: Vec<String>,
    pub max_kb: i64,
}

impl MomentSyncConfig {
    /// 目录留空表示关闭说说同步；否则规范成以 "/" 结尾
    pub fn new(raw_dir: &str, push: bool, exclude_dirs: Vec<String>, max_kb: i64) -> Option<Self> {
        let dir = raw_dir.trim();
        if dir.is_empty() {
            return None;
        }
        let dir = if dir.ends_with('/') { dir.to_string() } else { format!("{dir}/") };
        Some(Self { dir, push, exclude_dirs, max_kb })
    }

    /// NOTE_SYNC_MOMENT_DIR（未设置 = "说说/"，设为空 = 关闭）与 NOTE_SYNC_MOMENT_PUSH
    pub fn from_env(exclude_dirs: Vec<String>, max_kb: i64) -> Option<Self> {
        let dir = std::env::var("NOTE_SYNC_MOMENT_DIR").unwrap_or_else(|_| "说说/".to_string());
        let push = parse_push_flag(std::env::var("NOTE_SYNC_MOMENT_PUSH").ok().as_deref());
        Self::new(&dir, push, exclude_dirs, max_kb)
    }
}

/// 未设置 = true；"false" / "0"（不区分大小写）= false；其余都当 true
pub fn parse_push_flag(raw: Option<&str>) -> bool {
    match raw.map(|v| v.trim().to_ascii_lowercase()) {
        None => true,
        Some(v) => !matches!(v.as_str(), "false" | "0"),
    }
}

// ---------- 文件名 ↔ 发布时间 ----------

fn stamp(ms: i64, with_seconds: bool) -> String {
    let dt = tz()
        .timestamp_millis_opt(ms)
        .single()
        .unwrap_or_else(|| tz().timestamp_millis_opt(0).unwrap());
    let fmt = if with_seconds { "%Y_%m_%d_%H_%M_%S" } else { "%Y_%m_%d_%H_%M" };
    dt.format(fmt).to_string()
}

/// 新建文件时依次尝试的候选路径：分钟 → 加秒 → 加秒并带 -2、-3、-4
pub fn path_candidates(dir: &str, created_ms: i64) -> Vec<String> {
    let minute = stamp(created_ms, false);
    let second = stamp(created_ms, true);
    vec![
        format!("{dir}{minute}.md"),
        format!("{dir}{second}.md"),
        format!("{dir}{second}-2.md"),
        format!("{dir}{second}-3.md"),
        format!("{dir}{second}-4.md"),
    ]
}

/// 从文件路径解析发布时间（毫秒）。接受 `YYYY_MM_DD_HH_mm`、`…_ss`，以及可选的 `-N` 后缀
pub fn parse_name_time(path: &str) -> Option<i64> {
    let name = path.rsplit('/').next()?;
    let stem = name.strip_suffix(".md")?;
    let stem = match stem.rsplit_once('-') {
        Some((head, n)) if !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()) => head,
        _ => stem,
    };
    let parts: Vec<&str> = stem.split('_').collect();
    if parts.len() != 5 && parts.len() != 6 {
        return None;
    }
    let widths = [4usize, 2, 2, 2, 2, 2];
    let mut nums = [0u32; 6];
    for (i, p) in parts.iter().enumerate() {
        if p.len() != widths[i] || !p.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        nums[i] = p.parse().ok()?;
    }
    let date = NaiveDate::from_ymd_opt(nums[0] as i32, nums[1], nums[2])?;
    let naive = date.and_hms_opt(nums[3], nums[4], nums[5])?;
    Some(tz().from_local_datetime(&naive).single()?.timestamp_millis())
}

/// 同一分钟（+08:00 是整小时偏移，所以按 UTC 分钟对齐即可）
pub fn same_minute(a_ms: i64, b_ms: i64) -> bool {
    a_ms.div_euclid(60_000) == b_ms.div_euclid(60_000)
}

/// 提交信息，如 `sync(说说): 新增 2026_09_18_19_40`
pub fn commit_message(verb: &str, path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    let stem = name.strip_suffix(".md").unwrap_or(name);
    format!("sync(说说): {verb} {stem}")
}

// ---------- 文件格式 ----------

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MomentFile {
    pub content: String,
    pub images: Vec<String>,
    pub location: Option<String>,
    pub is_public: bool,
}

/// `---` 包起来的文件头；没有或未闭合则返回 (None, 原文)
fn split_header(text: &str) -> (Option<&str>, &str) {
    let Some(rest) = text.strip_prefix("---\n") else {
        return (None, text);
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end() == "---" {
            return (Some(&rest[..offset]), &rest[offset + line.len()..]);
        }
        offset += line.len();
    }
    (None, text)
}

/// 整行恰好是一张 Markdown 图片 `![alt](url)`（url 不含空白与右括号）时返回 url
fn image_url(line: &str) -> Option<&str> {
    let rest = line.trim().strip_prefix("![")?;
    let (alt, tail) = rest.split_once("](")?;
    if alt.contains(']') {
        return None;
    }
    let url = tail.strip_suffix(')')?;
    if url.is_empty() || url.chars().any(|c| c.is_whitespace() || c == ')') {
        return None;
    }
    Some(url)
}

/// 解析说说文件。正文为空返回 None
pub fn parse_file(text: &str) -> Option<MomentFile> {
    let text = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    let (header, body) = split_header(&text);

    let mut location = None;
    let mut is_public = true;
    if let Some(header) = header {
        for line in header.lines() {
            let Some((key, value)) = line.split_once(':') else { continue };
            let value = value.trim();
            match key.trim() {
                "location" if !value.is_empty() => location = Some(value.to_string()),
                "public" => {
                    is_public = !matches!(value.to_ascii_lowercase().as_str(), "false" | "0" | "no")
                }
                _ => {}
            }
        }
    }

    let mut lines: Vec<&str> = body.trim().lines().collect();
    let mut images = Vec::new();
    while let Some(url) = lines.last().copied().and_then(image_url) {
        images.push(url.to_string());
        lines.pop();
    }
    images.reverse();

    let content = lines.join("\n").trim().to_string();
    if content.is_empty() {
        return None;
    }
    Some(MomentFile { content, images, location, is_public })
}

/// 渲染成文件文本：文件头只在有位置 / 私密时才写
pub fn render_file(f: &MomentFile) -> String {
    let mut out = String::new();
    // 正文以 "---" 开头时必须带文件头，否则解析会把它当成文件头的开始
    if !f.is_public || f.location.is_some() || f.content.starts_with("---") {
        out.push_str("---\n");
        if let Some(loc) = &f.location {
            out.push_str("location: ");
            out.push_str(&loc.replace(['\r', '\n'], " "));
            out.push('\n');
        }
        if !f.is_public {
            out.push_str("public: false\n");
        }
        out.push_str("---\n");
    }
    out.push_str(&f.content);
    out.push('\n');
    if !f.images.is_empty() {
        out.push('\n');
        for url in &f.images {
            out.push_str(&format!("![]({url})\n"));
        }
    }
    out
}

/// 库里的说说 → 规范化的文件模型（NULL / 空串 / `[]` / 坏 JSON 的图片一律视为无图）
pub fn moment_to_file(m: &Moment) -> MomentFile {
    MomentFile {
        content: m.content.replace("\r\n", "\n").trim().to_string(),
        images: parse_images(m.images.clone())
            .into_iter()
            .filter(|u| !u.trim().is_empty())
            .collect(),
        location: m
            .location
            .as_deref()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(String::from),
        is_public: m.is_public != 0,
    }
}

pub fn render_moment(m: &Moment) -> String {
    render_file(&moment_to_file(m))
}

/// 内容指纹：按库里数据渲染出的文本的 sha256（写进 `moment_sync_map.local_sha`）
pub fn fingerprint(m: &Moment) -> String {
    sha256_hex(&render_moment(m))
}

/// 经过一次「渲染 → 解析」的规范形式，用来和 `parse_file` 的结果比较。
/// 两边都过一遍解析，渲染 / 解析里无法还原的边角（比如正文末尾恰好是图片行）会相互抵消。
pub fn normalized(m: &Moment) -> Option<MomentFile> {
    parse_file(&render_moment(m))
}

// ---------- 认领 ----------

/// 为仓库里一个还没有映射的文件，在库里找一条「同一分钟发布、内容相等、尚未映射」的说说。
/// 多个满足时取 id 最小的。文件名解析不出时间则不认领。
pub fn find_adoptee<'a>(
    path: &str,
    file: &MomentFile,
    moments: &'a [Moment],
    mapped_ids: &HashSet<i32>,
) -> Option<&'a Moment> {
    let file_ms = parse_name_time(path)?;
    moments
        .iter()
        .filter(|m| m.is_deleted != Some(1))
        .filter(|m| m.id.is_some_and(|id| !mapped_ids.contains(&id)))
        .filter(|m| m.created_time.is_some_and(|t| same_minute(t, file_ms)))
        .filter(|m| normalized(m).as_ref() == Some(file))
        .min_by_key(|m| m.id)
}

// ---------- 差分规划 ----------

/// 说说目录下参与同步的文件：目录前缀 + `.md` 后缀 + 排除目录段 + 大小上限
pub fn filter_moment_files(
    entries: &[TreeEntry],
    dir: &str,
    exclude_dirs: &[&str],
    max_kb: i64,
) -> Vec<TreeEntry> {
    entries
        .iter()
        .filter(|e| e.path.starts_with(dir) && e.path.ends_with(".md"))
        .filter(|e| !e.path.split('/').any(|seg| exclude_dirs.contains(&seg)))
        .filter(|e| e.size <= max_kb * 1024)
        .cloned()
        .collect()
}

#[derive(Clone, Debug, PartialEq)]
pub enum PullAction {
    /// 仓库有文件、没有映射：先尝试认领，认领不到就新建
    New { path: String, blob_sha: String },
    /// 有映射，文件 sha 变了：仓库为准
    Update { map: MomentSyncMap, blob_sha: String },
    /// 有映射，文件已不在仓库里
    Remove { map: MomentSyncMap },
}

pub fn plan_pull(files: &[TreeEntry], maps: &[MomentSyncMap]) -> Vec<PullAction> {
    let by_path: HashMap<&str, &MomentSyncMap> =
        maps.iter().map(|m| (m.github_path.as_str(), m)).collect();
    let present: HashSet<&str> = files.iter().map(|e| e.path.as_str()).collect();

    let mut actions = Vec::new();
    for e in files {
        match by_path.get(e.path.as_str()) {
            None => actions.push(PullAction::New { path: e.path.clone(), blob_sha: e.sha.clone() }),
            Some(m) if m.blob_sha != e.sha => actions.push(PullAction::Update {
                map: (*m).clone(),
                blob_sha: e.sha.clone(),
            }),
            Some(_) => {}
        }
    }
    for m in maps {
        if !present.contains(m.github_path.as_str()) {
            actions.push(PullAction::Remove { map: m.clone() });
        }
    }
    actions
}

#[derive(Clone, Debug, PartialEq)]
pub enum PushAction {
    /// 说说已删（或库里已没有这行）：删除仓库文件
    Delete { map: MomentSyncMap },
    /// 后台改过（指纹与记录不同）：更新仓库文件
    Update { map: MomentSyncMap },
    /// 后台新发、还没有映射：在仓库里新建文件
    Create { moment_id: i32 },
}

/// 写回规划：先删、再改、后建，总数不超过 `MAX_PUSH_OPS`。
/// 调用前拉取阶段已执行完，「仓库也变了」的说说指纹已刷新，不会被误推。
pub fn plan_push(moments: &[Moment], maps: &[MomentSyncMap]) -> Vec<PushAction> {
    let by_id: HashMap<i32, &Moment> =
        moments.iter().filter_map(|m| m.id.map(|id| (id, m))).collect();
    let mapped: HashSet<i32> = maps.iter().map(|m| m.moment_id).collect();

    let mut deletes = Vec::new();
    let mut updates = Vec::new();
    for map in maps {
        match by_id.get(&map.moment_id) {
            None => deletes.push(PushAction::Delete { map: map.clone() }),
            Some(m) if m.is_deleted == Some(1) => {
                deletes.push(PushAction::Delete { map: map.clone() })
            }
            Some(m) if fingerprint(m) != map.local_sha => {
                updates.push(PushAction::Update { map: map.clone() })
            }
            Some(_) => {}
        }
    }

    let mut create_ids: Vec<i32> = moments
        .iter()
        .filter(|m| m.is_deleted != Some(1))
        .filter_map(|m| m.id)
        .filter(|id| !mapped.contains(id))
        .collect();
    create_ids.sort_unstable();

    let mut all = deletes;
    all.extend(updates);
    all.extend(create_ids.into_iter().map(|moment_id| PushAction::Create { moment_id }));
    all.truncate(MAX_PUSH_OPS);
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moment(id: i32, content: &str, created_ms: i64) -> Moment {
        Moment {
            id: Some(id),
            content: content.into(),
            images: None,
            is_public: 1,
            location: None,
            likes: 0,
            comments: 0,
            created_time: Some(created_ms),
            update_time: Some(created_ms),
            is_deleted: Some(0),
        }
    }
    fn entry(path: &str, sha: &str) -> TreeEntry {
        TreeEntry { path: path.into(), sha: sha.into(), size: 10 }
    }
    fn map(id: i32, moment_id: i32, path: &str, blob: &str, local: &str) -> MomentSyncMap {
        MomentSyncMap {
            id: Some(id),
            moment_id,
            github_path: path.into(),
            blob_sha: blob.into(),
            local_sha: local.into(),
            synced_at: 0,
        }
    }
    /// 真实数据锚点：本地说说 #1 的发布时间 / 仓库文件 2026_09_17_22_15.md
    const M1_MS: i64 = 1_789_654_500_000;
    /// 本地说说 #2：2026_09_18_19_40
    const M2_MS: i64 = 1_789_731_600_000;

    // ---- 文件名 ----
    #[test]
    fn test_parse_name_time_matches_real_data() {
        assert_eq!(parse_name_time("说说/2026_09_17_22_15.md"), Some(M1_MS));
        assert_eq!(parse_name_time("说说/2026_09_18_19_40.md"), Some(M2_MS));
    }
    #[test]
    fn test_parse_name_time_variants() {
        assert_eq!(parse_name_time("说说/2026_09_18_19_40_05.md"), Some(M2_MS + 5_000));
        assert_eq!(parse_name_time("说说/2026_09_18_19_40_05-2.md"), Some(M2_MS + 5_000));
        assert_eq!(parse_name_time("说说/2026_09_18_19_40-3.md"), Some(M2_MS));
        assert_eq!(parse_name_time("2026_09_18_19_40.md"), Some(M2_MS));
    }
    #[test]
    fn test_parse_name_time_rejects_bad_names() {
        for bad in [
            "说说/随想.md",
            "说说/2026_13_01_00_00.md",
            "说说/2026_02_30_00_00.md",
            "说说/2026_9_1_0_0.md",
            "说说/2026_09_18_19_40.txt",
            "说说/2026_09_18_19_40_05_01.md",
            "说说/2026_09_18_25_40.md",
            "说说/2026_09_18_19_40-.md",
            "说说/2026_09_18_19_40-x.md",
        ] {
            assert_eq!(parse_name_time(bad), None, "{bad}");
        }
    }
    #[test]
    fn test_path_candidates() {
        let c = path_candidates("说说/", M2_MS + 5_123);
        assert_eq!(
            c,
            vec![
                "说说/2026_09_18_19_40.md",
                "说说/2026_09_18_19_40_05.md",
                "说说/2026_09_18_19_40_05-2.md",
                "说说/2026_09_18_19_40_05-3.md",
                "说说/2026_09_18_19_40_05-4.md",
            ]
        );
    }
    #[test]
    fn test_name_round_trip_and_midnight() {
        // +08:00 的 00:00 = 前一天 16:00 UTC：换算不能错一天
        let midnight = parse_name_time("说说/2026_09_18_00_00.md").unwrap();
        assert_eq!(midnight, M2_MS - (19 * 60 + 40) * 60_000);
        for ms in [M1_MS, M2_MS, midnight, M2_MS + 59_000] {
            let c = path_candidates("说说/", ms);
            assert_eq!(parse_name_time(&c[0]), Some(ms.div_euclid(60_000) * 60_000));
            assert_eq!(parse_name_time(&c[1]), Some(ms.div_euclid(1_000) * 1_000));
        }
    }
    #[test]
    fn test_same_minute() {
        assert!(same_minute(M2_MS, M2_MS + 59_999));
        assert!(!same_minute(M2_MS, M2_MS + 60_000));
        assert!(!same_minute(M2_MS, M2_MS - 1));
    }
    #[test]
    fn test_commit_message() {
        assert_eq!(commit_message("新增", "说说/2026_09_18_19_40.md"), "sync(说说): 新增 2026_09_18_19_40");
        assert_eq!(commit_message("删除", "a.md"), "sync(说说): 删除 a");
    }

    // ---- 配置 ----
    #[test]
    fn test_config_dir_normalized_and_disabled_when_empty() {
        assert_eq!(MomentSyncConfig::new("说说", true, vec![], 1024).unwrap().dir, "说说/");
        assert_eq!(MomentSyncConfig::new(" 说说/ ", true, vec![], 1024).unwrap().dir, "说说/");
        assert!(MomentSyncConfig::new("", true, vec![], 1024).is_none());
        assert!(MomentSyncConfig::new("  ", true, vec![], 1024).is_none());
    }
    #[test]
    fn test_parse_push_flag() {
        assert!(parse_push_flag(None));
        assert!(parse_push_flag(Some("true")));
        assert!(parse_push_flag(Some("1")));
        assert!(parse_push_flag(Some("")));
        assert!(!parse_push_flag(Some("false")));
        assert!(!parse_push_flag(Some("FALSE")));
        assert!(!parse_push_flag(Some(" 0 ")));
    }

    // ---- 解析 ----
    #[test]
    fn test_parse_plain_text_like_real_file() {
        let f = parse_file("把评论审核做完了，待审核的终于不用一条条手点。").unwrap();
        assert_eq!(f.content, "把评论审核做完了，待审核的终于不用一条条手点。");
        assert!(f.images.is_empty() && f.location.is_none() && f.is_public);
    }
    #[test]
    fn test_parse_header() {
        let f = parse_file("---\nlocation: 南京\npublic: false\n---\n正文\n").unwrap();
        assert_eq!(f.location.as_deref(), Some("南京"));
        assert!(!f.is_public);
        assert_eq!(f.content, "正文");
    }
    #[test]
    fn test_parse_public_values() {
        for (v, public) in [("false", false), ("False", false), ("0", false), ("no", false), ("NO", false),
                            ("true", true), ("yes", true), ("1", true), ("", true)] {
            let f = parse_file(&format!("---\npublic: {v}\n---\n正文")).unwrap();
            assert_eq!(f.is_public, public, "public: {v:?}");
        }
    }
    #[test]
    fn test_parse_header_ignores_unknown_keys_and_keeps_colons_in_value() {
        let f = parse_file("---\ntitle: x\nlocation: 南京: 鼓楼\n没有冒号的行\n---\n正文").unwrap();
        assert_eq!(f.location.as_deref(), Some("南京: 鼓楼"));
        assert!(f.is_public);
    }
    #[test]
    fn test_parse_unterminated_header_is_all_body() {
        let f = parse_file("---\nlocation: x\n正文").unwrap();
        assert_eq!(f.content, "---\nlocation: x\n正文");
        assert!(f.location.is_none());
    }
    #[test]
    fn test_parse_crlf_and_bom() {
        let f = parse_file("\u{feff}---\r\npublic: false\r\n---\r\n第一行\r\n第二行\r\n").unwrap();
        assert_eq!(f.content, "第一行\n第二行");
        assert!(!f.is_public);
    }
    #[test]
    fn test_parse_lifts_trailing_images_only() {
        let f = parse_file("正文\n\n![](http://a/1.jpg)\n![x](http://a/2.jpg)\n").unwrap();
        assert_eq!(f.content, "正文");
        assert_eq!(f.images, vec!["http://a/1.jpg", "http://a/2.jpg"]);

        let f = parse_file("![](http://a/1.jpg)\n后面还有字").unwrap();
        assert_eq!(f.content, "![](http://a/1.jpg)\n后面还有字");
        assert!(f.images.is_empty());

        // 带标题的图片、url 含空白的都不提取
        let f = parse_file("正文\n![a](http://a/1.jpg \"t\")").unwrap();
        assert!(f.images.is_empty());
        assert!(f.content.contains("\"t\""));
    }
    #[test]
    fn test_parse_empty_body_is_none() {
        assert!(parse_file("").is_none());
        assert!(parse_file("  \n\n").is_none());
        assert!(parse_file("---\nlocation: x\n---\n\n").is_none());
        // 只有图片没有文字也视为空：后台不允许发空正文
        assert!(parse_file("![](http://a/1.jpg)\n").is_none());
    }

    // ---- 渲染 ----
    fn file(content: &str) -> MomentFile {
        MomentFile { content: content.into(), images: vec![], location: None, is_public: true }
    }
    #[test]
    fn test_render_variants() {
        assert_eq!(render_file(&file("正文")), "正文\n");
        let mut f = file("正文");
        f.location = Some("南京".into());
        assert_eq!(render_file(&f), "---\nlocation: 南京\n---\n正文\n");
        f.is_public = false;
        assert_eq!(render_file(&f), "---\nlocation: 南京\npublic: false\n---\n正文\n");
        f.location = None;
        assert_eq!(render_file(&f), "---\npublic: false\n---\n正文\n");
        f.images = vec!["http://a/1.jpg".into(), "http://a/2.jpg".into()];
        assert_eq!(
            render_file(&f),
            "---\npublic: false\n---\n正文\n\n![](http://a/1.jpg)\n![](http://a/2.jpg)\n"
        );
    }
    #[test]
    fn test_render_location_newlines_flattened() {
        let mut f = file("正文");
        f.location = Some("南京\n鼓楼".into());
        assert_eq!(render_file(&f), "---\nlocation: 南京 鼓楼\n---\n正文\n");
    }
    #[test]
    fn test_round_trip() {
        let cases = vec![
            file("纯文本"),
            file("多行\n第二行\n\n第四行"),
            file("---\n看起来像文件头的正文\n---\n后面"),
            MomentFile { location: Some("南京: 鼓楼".into()), ..file("带位置") },
            MomentFile { is_public: false, ..file("私密") },
            MomentFile { images: vec!["http://a/1.jpg".into(), "https://b/2.png".into()], ..file("带图") },
            MomentFile {
                content: "全都有".into(),
                images: vec!["http://a/1.jpg".into()],
                location: Some("上海".into()),
                is_public: false,
            },
        ];
        for f in cases {
            let text = render_file(&f);
            assert_eq!(parse_file(&text), Some(f.clone()), "往返不一致:\n{text}");
        }
    }

    // ---- 库里的说说 → 文件模型 / 指纹 ----
    #[test]
    fn test_moment_to_file_normalizes() {
        let mut m = moment(1, "  正文\r\n第二行  ", M1_MS);
        m.location = Some("  ".into());
        assert_eq!(moment_to_file(&m), file("正文\n第二行"));
        for images in [None, Some(""), Some("[]"), Some("not json"), Some("[\"\", \"  \"]")] {
            m.images = images.map(String::from);
            assert!(moment_to_file(&m).images.is_empty(), "{images:?}");
        }
        m.images = Some("[\"http://a/1.jpg\"]".into());
        m.location = Some("南京".into());
        m.is_public = 0;
        let f = moment_to_file(&m);
        assert_eq!((f.images, f.location, f.is_public), (vec!["http://a/1.jpg".to_string()], Some("南京".to_string()), false));
    }
    #[test]
    fn test_fingerprint_stable_and_sensitive() {
        let a = moment(1, "正文", M1_MS);
        let mut same = a.clone();
        same.images = Some("[]".into());
        same.location = Some(String::new());
        same.update_time = Some(1);
        same.likes = 9;
        assert_eq!(fingerprint(&a), fingerprint(&same), "等价写法 / 非内容字段不影响指纹");

        let mut changed = a.clone();
        changed.content = "新正文".into();
        assert_ne!(fingerprint(&a), fingerprint(&changed));
        let mut private = a.clone();
        private.is_public = 0;
        assert_ne!(fingerprint(&a), fingerprint(&private));
        let mut located = a.clone();
        located.location = Some("南京".into());
        assert_ne!(fingerprint(&a), fingerprint(&located));
    }

    // ---- 认领 ----
    #[test]
    fn test_adopt_same_minute_equal_content() {
        let moments = vec![moment(1, "把评论审核做完了", M1_MS + 30_000), moment(2, "别的", M2_MS)];
        let f = parse_file("把评论审核做完了").unwrap();
        let got = find_adoptee("说说/2026_09_17_22_15.md", &f, &moments, &HashSet::new());
        assert_eq!(got.and_then(|m| m.id), Some(1));
    }
    #[test]
    fn test_adopt_refuses_when_not_matching() {
        let f = parse_file("正文").unwrap();
        let p = "说说/2026_09_17_22_15.md";
        // 内容不同
        assert!(find_adoptee(p, &f, &[moment(1, "另一段", M1_MS)], &HashSet::new()).is_none());
        // 分钟不同
        assert!(find_adoptee(p, &f, &[moment(1, "正文", M1_MS + 60_000)], &HashSet::new()).is_none());
        // 已映射
        let mapped: HashSet<i32> = [1].into();
        assert!(find_adoptee(p, &f, &[moment(1, "正文", M1_MS)], &mapped).is_none());
        // 已软删
        let mut deleted = moment(1, "正文", M1_MS);
        deleted.is_deleted = Some(1);
        assert!(find_adoptee(p, &f, &[deleted], &HashSet::new()).is_none());
        // 文件名解析不出时间
        assert!(find_adoptee("说说/随想.md", &f, &[moment(1, "正文", M1_MS)], &HashSet::new()).is_none());
    }
    #[test]
    fn test_adopt_prefers_smallest_id() {
        let moments = vec![moment(7, "正文", M1_MS), moment(3, "正文", M1_MS + 1_000)];
        let f = parse_file("正文").unwrap();
        let got = find_adoptee("说说/2026_09_17_22_15.md", &f, &moments, &HashSet::new());
        assert_eq!(got.and_then(|m| m.id), Some(3));
    }
    #[test]
    fn test_adopt_compares_private_and_location_too() {
        let mut m = moment(1, "正文", M1_MS);
        m.is_public = 0;
        let public_file = parse_file("正文").unwrap();
        assert!(find_adoptee("说说/2026_09_17_22_15.md", &public_file, &[m.clone()], &HashSet::new()).is_none());
        let private_file = parse_file("---\npublic: false\n---\n正文").unwrap();
        assert!(find_adoptee("说说/2026_09_17_22_15.md", &private_file, &[m], &HashSet::new()).is_some());
    }

    // ---- 过滤 ----
    #[test]
    fn test_filter_moment_files() {
        let mut big = entry("说说/big.md", "x");
        big.size = 2048 * 1024;
        let es = vec![
            entry("说说/a.md", "1"),
            entry("说说/子目录/b.md", "2"),
            entry("说说/.obsidian/c.md", "3"),
            entry("说说/d.png", "4"),
            entry("笔记/e.md", "5"),
            big,
        ];
        let out = filter_moment_files(&es, "说说/", &[".obsidian", ".trash"], 1024);
        let paths: Vec<&str> = out.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["说说/a.md", "说说/子目录/b.md"]);
    }

    // ---- 拉取规划 ----
    #[test]
    fn test_plan_pull() {
        let files = vec![entry("说说/new.md", "n"), entry("说说/changed.md", "c2"), entry("说说/same.md", "s")];
        let maps = vec![
            map(1, 10, "说说/changed.md", "c1", "L"),
            map(2, 11, "说说/same.md", "s", "L"),
            map(3, 12, "说说/gone.md", "g", "L"),
        ];
        let acts = plan_pull(&files, &maps);
        assert_eq!(acts.len(), 3);
        assert!(acts.contains(&PullAction::New { path: "说说/new.md".into(), blob_sha: "n".into() }));
        assert!(acts.contains(&PullAction::Update { map: maps[0].clone(), blob_sha: "c2".into() }));
        assert!(acts.contains(&PullAction::Remove { map: maps[2].clone() }));
    }

    // ---- 写回规划 ----
    #[test]
    fn test_plan_push_each_case() {
        let unchanged = moment(1, "没变", M1_MS);
        let changed = moment(2, "改过", M2_MS);
        let mut deleted = moment(3, "删了", M2_MS);
        deleted.is_deleted = Some(1);
        let fresh = moment(5, "新发", M2_MS + 60_000);
        let mut fresh_deleted = moment(6, "新发就删", M2_MS + 120_000);
        fresh_deleted.is_deleted = Some(1);

        let maps = vec![
            map(1, 1, "说说/1.md", "b1", &fingerprint(&unchanged)),
            map(2, 2, "说说/2.md", "b2", "过期的指纹"),
            map(3, 3, "说说/3.md", "b3", "x"),
            map(4, 4, "说说/4.md", "b4", "x"), // 库里已没有 id=4
        ];
        let acts = plan_push(&[unchanged, changed, deleted, fresh, fresh_deleted], &maps);
        assert_eq!(
            acts,
            vec![
                PushAction::Delete { map: maps[2].clone() },
                PushAction::Delete { map: maps[3].clone() },
                PushAction::Update { map: maps[1].clone() },
                PushAction::Create { moment_id: 5 },
            ]
        );
    }
    #[test]
    fn test_plan_push_creates_sorted_and_capped() {
        let moments: Vec<Moment> = (1..=60).rev().map(|i| moment(i, "新", M2_MS + i as i64 * 60_000)).collect();
        let acts = plan_push(&moments, &[]);
        assert_eq!(acts.len(), MAX_PUSH_OPS);
        assert_eq!(acts[0], PushAction::Create { moment_id: 1 });
        assert_eq!(acts[MAX_PUSH_OPS - 1], PushAction::Create { moment_id: MAX_PUSH_OPS as i32 });
    }
    #[test]
    fn test_plan_push_cap_keeps_deletes_first() {
        let moments: Vec<Moment> = (1..=60).map(|i| moment(i, "新", M2_MS + i as i64 * 60_000)).collect();
        let stale = map(1, 999, "说说/old.md", "b", "x");
        let acts = plan_push(&moments, &[stale.clone()]);
        assert_eq!(acts[0], PushAction::Delete { map: stale });
        assert_eq!(acts.len(), MAX_PUSH_OPS);
    }
}
````

- [ ] **运行单元测试**

```bash
cargo test note_sync::moment_sync 2>&1 | grep -E "^test |^test result"
```

期望：`test result: ok. 31 passed; 0 failed`。

- [ ] **变异检查：测试真的在约束规则**

先备份，再依次临时改坏下面三处，每次运行 `cargo test note_sync::moment_sync`，期望**有测试失败**，然后还原：

```bash
B=$(mktemp) && cp src/note_sync/moment_sync.rs "$B" && echo "备份在 $B"
```

1. 删掉 `find_adoptee` 里的这一行（认领不再比较内容）：`        .filter(|m| normalized(m).as_ref() == Some(file))` → 期望 `test_adopt_refuses_when_not_matching` 等失败
2. 删掉 `plan_push` 里 `Some(m) if m.is_deleted == Some(1) => { deletes.push(PushAction::Delete { map: map.clone() }) }` 这一整个分支 → 期望 `test_plan_push_each_case` 失败
3. 把 `plan_pull` 里的 `Some(m) if m.blob_sha != e.sha` 改成 `==` → 期望 `test_plan_pull` 失败

```bash
cp "$B" src/note_sync/moment_sync.rs && cargo test note_sync::moment_sync 2>&1 | grep -E "^test result"
```

期望还原后 `31 passed; 0 failed`。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/note_sync/moment_sync.rs \
  src/note_sync/mod.rs
git commit -F - <<'EOF'
feat(moment_sync): 说说文件名、文件格式、认领与差分规划的纯函数

文件名 YYYY_MM_DD_HH_mm.md（+08:00）与发布时间互转；说说文件解析/渲染（纯文本 + 可选
YAML 文件头 + 末尾图片行）；认领库里已有的同一条说说；拉取/写回的差分规划；
MomentSyncConfig。均为纯函数，带 31 个单元测试。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: GitHub 客户端（写接口、两个新错误、可配置 API 根地址）

**Files:**
- Modify: `src/note_sync/github_client.rs`

**Interfaces:**
- Consumes: 无
- Produces：
  - `GithubClient::with_api_base(self, &str) -> Self`
  - `GithubClient::put_file(&mut self, path, text, message, sha: Option<&str>) -> Result<String, GhError>`（返回新 blob sha）
  - `GithubClient::delete_file(&mut self, path, sha, message) -> Result<(), GhError>`
  - `GhError::Forbidden(String)`、`GhError::Conflict(u16)`
  - `resolve_api_base(&str) -> (String, Option<String>)`（第二项是需要告警的原因）、`DEFAULT_API_BASE`

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
const API_BASE: &str = "https://api.github.com";
````

替换为：

````rust
pub const DEFAULT_API_BASE: &str = "https://api.github.com";
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    RateLimited,
    Network(String),
````

替换为：

````rust
    RateLimited,
    /// 写操作被拒绝且不是限流：令牌缺少 Contents 写权限
    Forbidden(String),
    /// 写操作的 sha 对不上，或新建时路径已存在（409 / 422）
    Conflict(u16),
    Network(String),
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
            GhError::RateLimited => write!(f, "GitHub API 限流，下轮重试"),
````

替换为：

````rust
            GhError::RateLimited => write!(f, "GitHub API 限流，下轮重试"),
            GhError::Forbidden(_) => write!(f, "NOTE_SYNC_TOKEN 缺少 Contents 写权限（fine-grained PAT 需要 Contents: Read and write）"),
            GhError::Conflict(code) => write!(f, "GitHub 拒绝写入({}): 文件已被改动或路径已存在", code),
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub struct GithubClient {
    http: reqwest::Client,
    token: String,
````

替换为：

````rust
pub struct GithubClient {
    http: reqwest::Client,
    api_base: String,
    token: String,
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
                .expect("build reqwest client"),
            token: token.to_string(),
````

替换为：

````rust
                .expect("build reqwest client"),
            api_base: DEFAULT_API_BASE.to_string(),
            token: token.to_string(),
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    fn auth(&self, rb: reqwest::RequestBuilder)
````

替换为：

````rust
    /// 换 API 根地址（NOTE_SYNC_API_BASE，仅供本地模拟 GitHub 做测试；先过 `resolve_api_base`）
    pub fn with_api_base(mut self, base: &str) -> Self {
        self.api_base = base.to_string();
        self
    }

    fn rate_remaining_zero(resp: &reqwest::Response) -> bool {
        resp.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok()) == Some("0")
    }

    fn auth(&self, rb: reqwest::RequestBuilder)
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
let url = format!("{}/repos/{}", API_BASE, self.repo);
````

替换为：

````rust
let url = format!("{}/repos/{}", self.api_base, self.repo);
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
let url = format!("{}/repos/{}/git/trees/{}?recursive=1", API_BASE, self.repo, branch);
````

替换为：

````rust
let url = format!("{}/repos/{}/git/trees/{}?recursive=1", self.api_base, self.repo, branch);
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
            API_BASE, self.repo, encode_path(path), self.branch.clone().unwrap_or_default());
````

替换为：

````rust
            self.api_base, self.repo, encode_path(path), self.branch.clone().unwrap_or_default());
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
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
````

替换为：

````rust
            self.api_base, self.repo, encode_path(path));
        let resp = self.auth(self.http.get(&url)).send().await
            .map_err(|e| GhError::Network(e.to_string()))?;
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(Self::err_of(status, body));
        }
        Ok(parse_commit_ms(&body))
    }

    /// 创建或更新文件（更新已有文件必须带旧 sha）。成功返回新文件的 blob sha
    pub async fn put_file(
        &mut self,
        path: &str,
        text: &str,
        message: &str,
        sha: Option<&str>,
    ) -> Result<String, GhError> {
        let branch = self.branch().await?;
        let url = format!("{}/repos/{}/contents/{}", self.api_base, self.repo, encode_path(path));
        let resp = self.auth(self.http.put(&url)).json(&put_body(text, message, &branch, sha))
            .send().await.map_err(|e| GhError::Network(e.to_string()))?;
        let status = resp.status();
        let rate_zero = Self::rate_remaining_zero(&resp);
        let resp_body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(write_err_of(status.as_u16(), rate_zero, resp_body));
        }
        parse_put_sha(&resp_body)
            .ok_or_else(|| GhError::Other(status.as_u16(), "响应里没有 content.sha".into()))
    }

    /// 删除文件（必须带旧 sha）
    pub async fn delete_file(&mut self, path: &str, sha: &str, message: &str) -> Result<(), GhError> {
        let branch = self.branch().await?;
        let url = format!("{}/repos/{}/contents/{}", self.api_base, self.repo, encode_path(path));
        let resp = self.auth(self.http.delete(&url)).json(&delete_body(message, &branch, sha))
            .send().await.map_err(|e| GhError::Network(e.to_string()))?;
        let status = resp.status();
        let rate_zero = Self::rate_remaining_zero(&resp);
        let resp_body = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(write_err_of(status.as_u16(), rate_zero, resp_body));
        }
        Ok(())
    }
}
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
#[cfg(test)]
mod tests {
    use super::*;
````

替换为：

````rust
/// NOTE_SYNC_API_BASE 校验：空 → 默认；https 任意主机；http 只允许本机回环；
/// 其余回退默认。返回 (根地址, 需要告警的原因)。
pub fn resolve_api_base(raw: &str) -> (String, Option<String>) {
    let raw = raw.trim().trim_end_matches('/');
    if raw.is_empty() {
        return (DEFAULT_API_BASE.to_string(), None);
    }
    match url::Url::parse(raw) {
        Ok(u) if u.scheme() == "https" => (raw.to_string(), None),
        Ok(u)
            if u.scheme() == "http"
                && matches!(u.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")) =>
        {
            (raw.to_string(), None)
        }
        _ => (
            DEFAULT_API_BASE.to_string(),
            Some(format!(
                "NOTE_SYNC_API_BASE={raw} 不合法（非 https 只允许 localhost / 127.0.0.1 / [::1]），已回退默认"
            )),
        ),
    }
}

/// `PUT /contents/{path}` 的请求体；更新已有文件时带 sha
pub fn put_body(text: &str, message: &str, branch: &str, sha: Option<&str>) -> serde_json::Value {
    let mut body = serde_json::json!({
        "message": message,
        "content": base64::engine::general_purpose::STANDARD.encode(text.as_bytes()),
        "branch": branch,
    });
    if let Some(sha) = sha {
        body["sha"] = serde_json::Value::String(sha.to_string());
    }
    body
}

/// `DELETE /contents/{path}` 的请求体
pub fn delete_body(message: &str, branch: &str, sha: &str) -> serde_json::Value {
    serde_json::json!({ "message": message, "branch": branch, "sha": sha })
}

/// 从 PUT 响应里取新文件的 blob sha
pub fn parse_put_sha(json: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    v["content"]["sha"].as_str().map(String::from)
}

/// 写操作的状态码映射。403 要区分限流与缺权限；409 / 422 是 sha 不匹配或路径已存在
pub fn write_err_of(status: u16, rate_remaining_zero: bool, body: String) -> GhError {
    match status {
        401 => GhError::Unauthorized(body),
        429 => GhError::RateLimited,
        403 if rate_remaining_zero || body.to_ascii_lowercase().contains("rate limit") => {
            GhError::RateLimited
        }
        403 => GhError::Forbidden(body),
        409 | 422 => GhError::Conflict(status),
        404 => GhError::Other(404, "not found".into()),
        c => GhError::Other(c, body),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
````

**修改 `src/note_sync/github_client.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
        assert_eq!(parse_commit_ms("[]"), None);
    }
}
````

替换为：

````rust
        assert_eq!(parse_commit_ms("[]"), None);
    }

    #[test]
    fn test_resolve_api_base() {
        assert_eq!(resolve_api_base("").0, DEFAULT_API_BASE);
        assert_eq!(resolve_api_base("  ").0, DEFAULT_API_BASE);
        assert_eq!(resolve_api_base("https://ghe.example.com/api/v3/").0, "https://ghe.example.com/api/v3");
        for ok in ["http://127.0.0.1:18080", "http://localhost:3000", "http://[::1]:9000"] {
            let (base, warn) = resolve_api_base(ok);
            assert_eq!((base.as_str(), warn), (ok, None), "{ok}");
        }
        for bad in ["http://evil.example.com", "http://10.0.0.5:8080", "ftp://x", "不是网址"] {
            let (base, warn) = resolve_api_base(bad);
            assert_eq!(base, DEFAULT_API_BASE, "{bad}");
            assert!(warn.is_some(), "{bad} 应当带告警");
        }
    }
    #[test]
    fn test_put_body() {
        let b = put_body("你好", "msg", "master", None);
        assert_eq!(b["content"], "5L2g5aW9");
        assert_eq!(b["branch"], "master");
        assert!(b.get("sha").is_none());
        assert_eq!(put_body("x", "m", "b", Some("abc"))["sha"], "abc");
    }
    #[test]
    fn test_delete_body() {
        let b = delete_body("m", "master", "abc");
        assert_eq!((b["message"].as_str(), b["branch"].as_str(), b["sha"].as_str()), (Some("m"), Some("master"), Some("abc")));
    }
    #[test]
    fn test_parse_put_sha() {
        assert_eq!(parse_put_sha(r#"{"content":{"sha":"abc","path":"x"},"commit":{}}"#), Some("abc".into()));
        assert_eq!(parse_put_sha(r#"{"commit":{}}"#), None);
        assert_eq!(parse_put_sha("不是 json"), None);
    }
    #[test]
    fn test_write_err_of() {
        assert!(matches!(write_err_of(401, false, "x".into()), GhError::Unauthorized(_)));
        assert!(matches!(write_err_of(403, true, "x".into()), GhError::RateLimited));
        assert!(matches!(write_err_of(403, false, "You have exceeded a secondary Rate Limit".into()), GhError::RateLimited));
        assert!(matches!(write_err_of(429, false, "x".into()), GhError::RateLimited));
        assert!(matches!(write_err_of(403, false, "Resource not accessible by personal access token".into()), GhError::Forbidden(_)));
        assert!(matches!(write_err_of(409, false, "x".into()), GhError::Conflict(409)));
        assert!(matches!(write_err_of(422, false, "x".into()), GhError::Conflict(422)));
        assert!(matches!(write_err_of(404, false, "x".into()), GhError::Other(404, _)));
        assert!(matches!(write_err_of(500, false, "boom".into()), GhError::Other(500, _)));
    }
}
````

- [ ] **运行测试**

```bash
cargo test note_sync::github_client 2>&1 | grep -E "^test |^test result"
```

期望：`test result: ok. 8 passed; 0 failed`（原有 3 个 + 新增 5 个）。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/note_sync/github_client.rs
git commit -F - <<'EOF'
feat(note_sync): GitHub 客户端支持写文件与可配置 API 根地址

新增 put_file / delete_file（Contents API，带旧 sha）；写操作的 403 区分限流与缺少
Contents 写权限（Forbidden），409/422 归为 Conflict；API 根地址改为客户端字段，由
NOTE_SYNC_API_BASE 覆盖（非 https 只允许本机回环），仅供本地模拟 GitHub 测试。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 拉取阶段与写回阶段

**Files:**
- Modify: `src/note_sync/moment_sync.rs`、`src/note_sync/sync_engine.rs`

**Interfaces:**
- Consumes: Task 2 的纯函数与类型、Task 3 的 `put_file` / `delete_file` / `GhError`
- Produces：`MomentStats { adopted, created, updated, removed, skipped, failed, pushed_created, pushed_updated, pushed_deleted }`；`run_moment_cycle(db: &RBatis, gh: &mut GithubClient, cfg: &MomentSyncConfig, entries: Option<&[TreeEntry]>) -> MomentStats`（`entries` 为 `None` 表示这一轮仓库树没变：跳过拉取、照常写回）；`sync_engine::value_to_i32` 改为 `pub(crate)`

**修改 `src/note_sync/moment_sync.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
use std::collections::{HashMap, HashSet};

use chrono::{FixedOffset, NaiveDate, TimeZone};

use crate::moment::{parse_images, Moment};
use crate::note_sync::derive::sha256_hex;
use crate::note_sync::structs::MomentSyncMap;
use crate::note_sync::sync_engine::TreeEntry;
````

替换为：

````rust
use std::collections::{HashMap, HashSet};

use chrono::{FixedOffset, NaiveDate, TimeZone};
use rbatis::RBatis;
use tracing::{error, info, warn};

use crate::moment::{parse_images, serialize_images, Moment};
use crate::note_sync::derive::sha256_hex;
use crate::note_sync::github_client::{GhError, GithubClient};
use crate::note_sync::structs::MomentSyncMap;
use crate::note_sync::sync_engine::{value_to_i32, TreeEntry};
use crate::utils::time_utils::get_sys_time;
````

**修改 `src/note_sync/moment_sync.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
#[cfg(test)]
mod tests {
````

替换为：

````rust
// ---------- 带 IO 的同步阶段 ----------

#[derive(Default, Debug)]
pub struct MomentStats {
    pub adopted: u32,
    pub created: u32,
    pub updated: u32,
    pub removed: u32,
    pub skipped: u32,
    pub failed: u32,
    pub pushed_created: u32,
    pub pushed_updated: u32,
    pub pushed_deleted: u32,
}

/// 一轮说说同步。`entries` 是这一轮拉到的仓库树；树没变（304）时传 None：
/// 跳过拉取阶段，写回阶段照常执行（后台的改动不会让仓库树变化）。
pub async fn run_moment_cycle(
    db: &RBatis,
    gh: &mut GithubClient,
    cfg: &MomentSyncConfig,
    entries: Option<&[TreeEntry]>,
) -> MomentStats {
    let mut stats = MomentStats::default();
    if let Some(entries) = entries {
        let excludes: Vec<&str> = cfg.exclude_dirs.iter().map(String::as_str).collect();
        let files = filter_moment_files(entries, &cfg.dir, &excludes, cfg.max_kb);
        pull_phase(db, gh, &files, &mut stats).await;
    }
    if cfg.push {
        push_phase(db, gh, cfg, entries, &mut stats).await;
    }
    info!("moment_sync: {:?}", stats);
    stats
}

async fn load_state(db: &RBatis) -> Option<(Vec<Moment>, Vec<MomentSyncMap>)> {
    let moments = match Moment::select_all(db).await {
        Ok(v) => v,
        Err(e) => {
            error!("moment_sync: 读取说说失败: {e}");
            return None;
        }
    };
    let maps = match MomentSyncMap::select_all(db).await {
        Ok(v) => v,
        Err(e) => {
            error!("moment_sync: 读取映射失败: {e}");
            return None;
        }
    };
    Some((moments, maps))
}

// ----- 数据库小工具 -----

async fn insert_moment(db: &RBatis, m: &Moment) -> Result<i32, String> {
    let r = Moment::insert(db, m).await.map_err(|e| format!("插入说说失败: {e}"))?;
    match value_to_i32(&r.last_insert_id) {
        0 => Err("插入说说后取不到自增 id".to_string()),
        id => Ok(id),
    }
}

async fn insert_map(
    db: &RBatis,
    moment_id: i32,
    path: &str,
    blob_sha: &str,
    local_sha: &str,
) -> Result<(), String> {
    let row = MomentSyncMap {
        id: None,
        moment_id,
        github_path: path.to_string(),
        blob_sha: blob_sha.to_string(),
        local_sha: local_sha.to_string(),
        synced_at: get_sys_time(),
    };
    MomentSyncMap::insert(db, &row)
        .await
        .map(|_| ())
        .map_err(|e| format!("写入映射失败 {path}: {e}"))
}

async fn update_map(db: &RBatis, map_id: i32, blob_sha: &str, local_sha: &str) -> Result<(), String> {
    db.exec(
        "update moment_sync_map set blob_sha = ?, local_sha = ?, synced_at = ? where id = ?",
        vec![
            rbs::to_value!(blob_sha),
            rbs::to_value!(local_sha),
            rbs::to_value!(get_sys_time()),
            rbs::to_value!(map_id),
        ],
    )
    .await
    .map(|_| ())
    .map_err(|e| format!("更新映射失败 {map_id}: {e}"))
}

async fn delete_map(db: &RBatis, map_id: i32) -> Result<(), String> {
    MomentSyncMap::delete_by_column(db, "id", map_id)
        .await
        .map(|_| ())
        .map_err(|e| format!("删除映射失败 {map_id}: {e}"))
}

// ----- 拉取阶段（仓库 → 库，仓库为准）-----

async fn pull_phase(db: &RBatis, gh: &mut GithubClient, files: &[TreeEntry], stats: &mut MomentStats) {
    let Some((mut moments, maps)) = load_state(db).await else { return };
    let mut mapped_ids: HashSet<i32> = maps.iter().map(|m| m.moment_id).collect();

    for action in plan_pull(files, &maps) {
        let result = match action {
            PullAction::New { path, blob_sha } => {
                pull_new(db, gh, &path, &blob_sha, &mut moments, &mut mapped_ids, stats).await
            }
            PullAction::Update { map, blob_sha } => {
                pull_update(db, gh, &map, &blob_sha, &mut moments, &mut mapped_ids, stats).await
            }
            PullAction::Remove { map } => {
                let r = pull_remove(db, &map, &mut moments, &mut mapped_ids).await;
                if r.is_ok() {
                    stats.removed += 1;
                }
                r
            }
        };
        if let Err(what) = result {
            stats.failed += 1;
            error!("moment_sync: 拉取失败 {what}");
        }
    }
}

/// 仓库有文件、没有映射：认领库里已有的同一条说说，认领不到就新建
async fn pull_new(
    db: &RBatis,
    gh: &mut GithubClient,
    path: &str,
    blob_sha: &str,
    moments: &mut Vec<Moment>,
    mapped_ids: &mut HashSet<i32>,
    stats: &mut MomentStats,
) -> Result<(), String> {
    let text = gh.get_file(path).await.map_err(|e| format!("{path}: {e}"))?;
    let Some(file) = parse_file(&text) else {
        warn!("moment_sync: {path} 正文为空，已跳过");
        stats.skipped += 1;
        return Ok(());
    };

    if let Some(m) = find_adoptee(path, &file, moments, mapped_ids) {
        let id = m.id.unwrap_or(0);
        insert_map(db, id, path, blob_sha, &fingerprint(m)).await?;
        mapped_ids.insert(id);
        stats.adopted += 1;
        return Ok(());
    }

    // 发布时间取自文件名；文件名不规范就取该文件最后一次提交的时间
    let created_ms = match parse_name_time(path) {
        Some(ms) => ms,
        None => gh.last_commit_ms(path).await.ok().flatten().unwrap_or_else(get_sys_time),
    };
    let mut m = Moment::new(
        file.content.clone(),
        serialize_images(Some(file.images.clone())),
        file.is_public as i32,
        file.location.clone(),
    );
    m.created_time = Some(created_ms);
    m.update_time = Some(created_ms);
    let id = insert_moment(db, &m).await?;
    m.id = Some(id);
    insert_map(db, id, path, blob_sha, &fingerprint(&m)).await?;
    mapped_ids.insert(id);
    moments.push(m);
    stats.created += 1;
    Ok(())
}

/// 有映射、文件 sha 变了：仓库为准，覆盖库里的内容（已软删的说说同时恢复）
async fn pull_update(
    db: &RBatis,
    gh: &mut GithubClient,
    map: &MomentSyncMap,
    blob_sha: &str,
    moments: &mut Vec<Moment>,
    mapped_ids: &mut HashSet<i32>,
    stats: &mut MomentStats,
) -> Result<(), String> {
    let path = map.github_path.as_str();
    let map_id = map.id.unwrap_or(0);

    let Some(idx) = moments.iter().position(|m| m.id == Some(map.moment_id)) else {
        // 映射指向的说说在库里已不存在：丢弃映射，按新文件处理
        delete_map(db, map_id).await?;
        mapped_ids.remove(&map.moment_id);
        return pull_new(db, gh, path, blob_sha, moments, mapped_ids, stats).await;
    };

    let text = gh.get_file(path).await.map_err(|e| format!("{path}: {e}"))?;
    let Some(file) = parse_file(&text) else {
        warn!("moment_sync: {path} 正文为空，保持库里原样");
        stats.skipped += 1;
        return Ok(());
    };

    let old = moments[idx].clone();
    let restored = old.is_deleted == Some(1);
    let differs = normalized(&old).as_ref() != Some(&file);

    // 后台在两次同步之间也改过、且内容确实不同：仓库为准，把被覆盖的内容留在日志里
    if differs && !restored && fingerprint(&old) != map.local_sha {
        let preview: String = old.content.chars().take(500).collect();
        warn!(
            "moment_sync: {path} 仓库与后台都改了，以仓库为准；被覆盖的后台内容(前500字): {preview:?}"
        );
    }

    let mut m = old;
    if differs || restored {
        m.content = file.content.clone();
        m.images = serialize_images(Some(file.images.clone()));
        m.location = file.location.clone();
        m.is_public = file.is_public as i32;
        m.update_time = Some(get_sys_time());
        m.is_deleted = Some(0);
        Moment::update_by_column(db, &m, "id")
            .await
            .map_err(|e| format!("更新说说失败 {path}: {e}"))?;
        stats.updated += 1;
    }
    update_map(db, map_id, blob_sha, &fingerprint(&m)).await?;
    moments[idx] = m;
    Ok(())
}

/// 有映射、文件已不在仓库里：说说软删，映射删除
async fn pull_remove(
    db: &RBatis,
    map: &MomentSyncMap,
    moments: &mut [Moment],
    mapped_ids: &mut HashSet<i32>,
) -> Result<(), String> {
    if let Some(m) = moments.iter_mut().find(|m| m.id == Some(map.moment_id)) {
        if m.is_deleted != Some(1) {
            m.is_deleted = Some(1);
            m.update_time = Some(get_sys_time());
            Moment::update_by_column(db, m, "id")
                .await
                .map_err(|e| format!("软删说说失败 {}: {e}", map.github_path))?;
        }
    }
    delete_map(db, map.id.unwrap_or(0)).await?;
    mapped_ids.remove(&map.moment_id);
    Ok(())
}

// ----- 写回阶段（库 → 仓库）-----

enum PushStep {
    Continue,
    Stop,
}

async fn push_phase(
    db: &RBatis,
    gh: &mut GithubClient,
    cfg: &MomentSyncConfig,
    entries: Option<&[TreeEntry]>,
    stats: &mut MomentStats,
) {
    // 重新读取：拉取阶段可能已经改了说说和映射
    let Some((moments, maps)) = load_state(db).await else { return };
    let actions = plan_push(&moments, &maps);
    if actions.is_empty() {
        return;
    }
    let by_id: HashMap<i32, &Moment> =
        moments.iter().filter_map(|m| m.id.map(|id| (id, m))).collect();
    // 新建文件选路径时要避开的已知路径：所有映射 + 这一轮树里的所有条目
    let mut taken: HashSet<String> = maps.iter().map(|m| m.github_path.clone()).collect();
    if let Some(entries) = entries {
        taken.extend(entries.iter().map(|e| e.path.clone()));
    }

    for action in actions {
        if let PushStep::Stop = push_one(db, gh, cfg, &by_id, &mut taken, action, stats).await {
            break;
        }
    }
}

async fn push_one(
    db: &RBatis,
    gh: &mut GithubClient,
    cfg: &MomentSyncConfig,
    by_id: &HashMap<i32, &Moment>,
    taken: &mut HashSet<String>,
    action: PushAction,
    stats: &mut MomentStats,
) -> PushStep {
    match action {
        PushAction::Delete { map } => {
            let msg = commit_message("删除", &map.github_path);
            match gh.delete_file(&map.github_path, &map.blob_sha, &msg).await {
                // 文件已经不在了（404）也算删除完成
                Ok(()) | Err(GhError::Other(404, _)) => {
                    match delete_map(db, map.id.unwrap_or(0)).await {
                        Ok(()) => stats.pushed_deleted += 1,
                        Err(e) => {
                            stats.failed += 1;
                            error!("moment_sync: {e}");
                        }
                    }
                    PushStep::Continue
                }
                Err(e) => handle_push_err(e, &map.github_path, stats),
            }
        }
        PushAction::Update { map } => {
            let Some(m) = by_id.get(&map.moment_id) else { return PushStep::Continue };
            let text = render_moment(m);
            let msg = commit_message("更新", &map.github_path);
            match gh.put_file(&map.github_path, &text, &msg, Some(&map.blob_sha)).await {
                Ok(new_sha) => {
                    match update_map(db, map.id.unwrap_or(0), &new_sha, &sha256_hex(&text)).await {
                        Ok(()) => stats.pushed_updated += 1,
                        Err(e) => {
                            stats.failed += 1;
                            error!("moment_sync: {e}");
                        }
                    }
                    PushStep::Continue
                }
                Err(e) => handle_push_err(e, &map.github_path, stats),
            }
        }
        PushAction::Create { moment_id } => {
            let Some(m) = by_id.get(&moment_id) else { return PushStep::Continue };
            let text = render_moment(m);
            let created_ms = m.created_time.unwrap_or_else(get_sys_time);
            for path in path_candidates(&cfg.dir, created_ms) {
                if taken.contains(&path) {
                    continue;
                }
                let msg = commit_message("新增", &path);
                match gh.put_file(&path, &text, &msg, None).await {
                    Ok(new_sha) => {
                        taken.insert(path.clone());
                        match insert_map(db, moment_id, &path, &new_sha, &sha256_hex(&text)).await {
                            Ok(()) => stats.pushed_created += 1,
                            // 文件已经写进仓库但映射没写成：下一轮会被「认领」绑回这条说说
                            Err(e) => {
                                stats.failed += 1;
                                error!("moment_sync: {e}");
                            }
                        }
                        return PushStep::Continue;
                    }
                    // 路径已被占用：换下一个候选
                    Err(GhError::Conflict(_)) => {
                        taken.insert(path);
                    }
                    Err(e) => return handle_push_err(e, &path, stats),
                }
            }
            warn!("moment_sync: 说说 {moment_id} 找不到可用的文件名，本轮跳过");
            stats.skipped += 1;
            PushStep::Continue
        }
    }
}

fn handle_push_err(e: GhError, path: &str, stats: &mut MomentStats) -> PushStep {
    match e {
        // 仓库端在这之前变了：本条本轮跳过，下一轮拉取会按「仓库为准」处理
        GhError::Conflict(_) => {
            warn!("moment_sync: {path} 仓库端已变化，本轮跳过，下轮重新比较");
            stats.skipped += 1;
            PushStep::Continue
        }
        GhError::Network(_) | GhError::Other(..) => {
            error!("moment_sync: 写回失败 {path}: {e}");
            stats.failed += 1;
            PushStep::Continue
        }
        // 权限 / 限流 / 令牌失效：继续写也只会继续失败，本轮写回到此为止
        GhError::Forbidden(_) | GhError::RateLimited | GhError::Unauthorized(_) => {
            error!("moment_sync: 写回停止（{path}）: {e}");
            stats.failed += 1;
            PushStep::Stop
        }
    }
}

#[cfg(test)]
mod tests {
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
fn value_to_i32(v: &rbs::Value) -> i32 {
````

替换为：

````rust
pub(crate) fn value_to_i32(v: &rbs::Value) -> i32 {
````

- [ ] **验证：能编译**

```bash
cargo check 2>&1 | grep -E "^error" -A8 | head -30; cargo check 2>&1 | tail -2
```

期望：没有 `error`；`Finished`。会有 `run_moment_cycle` 等「从未使用」的警告，Task 5 接线后消失。带 IO 的这部分由 Task 6 的端到端测试覆盖。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/note_sync/moment_sync.rs \
  src/note_sync/sync_engine.rs
git commit -F - <<'EOF'
feat(moment_sync): 拉取阶段（仓库为准）与写回阶段

拉取：新文件先认领、认领不到再新建；文件变了覆盖说说（已软删则恢复），后台也改过且内容
不同时把被覆盖的内容写进 warn 日志；文件没了说说软删。写回：先删、再改、后建，每轮最多
50 个操作；403/限流/令牌失效时本轮写回停止，409/422 跳过本条，新建遇重名换下一个候选文件名。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 调度器接线（一轮拉一次树，笔记与说说各跑一个阶段）

**Files:**
- Modify: `src/note_sync/sync_engine.rs`、`src/note_sync/scheduler.rs`

**Interfaces:**
- Consumes: Task 4 的 `run_moment_cycle`、Task 2 的 `MomentSyncConfig::from_env`、Task 3 的 `resolve_api_base`
- Produces：`filter_entries(entries, root, exclude_dirs, exclude_prefixes, max_kb)`；`run_sync_cycle(db, gh, plan, ai, entries: &[TreeEntry]) -> SyncStats`；`SyncPlan.moment: Option<MomentSyncConfig>`

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
use crate::note_sync::github_client::{GithubClient, TreeFetch};
````

替换为：

````rust
use crate::note_sync::github_client::GithubClient;
use crate::note_sync::moment_sync::MomentSyncConfig;
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
/// 过滤：root 前缀 + .md 后缀 + 排除目录段 + 大小上限
pub fn filter_entries(entries: &[TreeEntry], root: &str, exclude_dirs: &[&str], max_kb: i64) -> Vec<TreeEntry> {
    entries
        .iter()
        .filter(|e| e.path.starts_with(root) && e.path.ends_with(".md"))
````

替换为：

````rust
/// 过滤：root 前缀 + .md 后缀 + 排除路径前缀（说说目录）+ 排除目录段 + 大小上限
pub fn filter_entries(
    entries: &[TreeEntry],
    root: &str,
    exclude_dirs: &[&str],
    exclude_prefixes: &[&str],
    max_kb: i64,
) -> Vec<TreeEntry> {
    entries
        .iter()
        .filter(|e| e.path.starts_with(root) && e.path.ends_with(".md"))
        .filter(|e| !exclude_prefixes.iter().any(|p| e.path.starts_with(p)))
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    pub allow_http: bool,
    pub enc_key: String,
}
````

替换为：

````rust
    pub allow_http: bool,
    pub enc_key: String,
    /// 说说双向同步的配置；None = 关闭（NOTE_SYNC_MOMENT_DIR 留空）
    pub moment: Option<MomentSyncConfig>,
}
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub async fn run_sync_cycle(
    db: &RBatis,
    gh: &mut GithubClient,
    plan: &SyncPlan,
    ai: Option<AiSettings>,
) -> SyncStats {
    let mut stats = SyncStats::default();
    let entries = match gh.list_tree().await {
        Ok(TreeFetch::Unchanged) => {
            info!("note_sync: 仓库无变化 (ETag 304)");
            return stats;
        }
        Ok(TreeFetch::Changed { entries, .. }) => entries,
        Err(e) => {
            error!("note_sync: {}", e);
            return stats;
        }
    };
    let excludes: Vec<&str> = plan.exclude_dirs.iter().map(|s| s.as_str()).collect();
    let filtered = filter_entries(&entries, &plan.root, &excludes, plan.max_kb);
````

替换为：

````rust
/// 笔记 → 文章的一轮同步。仓库树由调度层拉取后传入（ETag 缓存在 `gh` 上，一轮只能拉一次）
pub async fn run_sync_cycle(
    db: &RBatis,
    gh: &mut GithubClient,
    plan: &SyncPlan,
    ai: Option<AiSettings>,
    entries: &[TreeEntry],
) -> SyncStats {
    let mut stats = SyncStats::default();
    let excludes: Vec<&str> = plan.exclude_dirs.iter().map(|s| s.as_str()).collect();
    // 说说目录由说说同步负责：NOTE_SYNC_ROOT 被配成空（整个仓库）时，也不能把里面的 .md 当文章
    let moment_dir: Vec<&str> = plan.moment.iter().map(|c| c.dir.as_str()).collect();
    let filtered = filter_entries(entries, &plan.root, &excludes, &moment_dir, plan.max_kb);
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
let out = filter_entries(&es, "笔记/", &[], 1024);
````

替换为：

````rust
let out = filter_entries(&es, "笔记/", &[], &[], 1024);
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
let out = filter_entries(&es, "笔记/", &[".obsidian", ".trash"], 1024);
````

替换为：

````rust
let out = filter_entries(&es, "笔记/", &[".obsidian", ".trash"], &[], 1024);
````

**修改 `src/note_sync/sync_engine.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    // ---- plan_actions ----
````

替换为：

````rust
    #[test]
    fn test_filter_excludes_moment_dir_even_when_root_is_empty() {
        let es = vec![entry("说说/2026_09_17_22_15.md", "a", 10), entry("笔记/x.md", "b", 10),
            entry("README.md", "c", 10)];
        // root 为空 = 整个仓库；说说目录必须被排除，否则说说文件会被当成文章
        let out = filter_entries(&es, "", &[], &["说说/"], 1024);
        let paths: Vec<&str> = out.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["笔记/x.md", "README.md"]);
        // 不排除时（说说同步关闭）行为不变
        assert_eq!(filter_entries(&es, "", &[], &[], 1024).len(), 3);
    }

    // ---- plan_actions ----
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
use crate::note_sync::github_client::GithubClient;
use crate::note_sync::sync_engine::{load_ai_settings, run_sync_cycle, SyncPlan};
````

替换为：

````rust
use crate::note_sync::github_client::{resolve_api_base, GithubClient, TreeFetch};
use crate::note_sync::moment_sync::{run_moment_cycle, MomentSyncConfig};
use crate::note_sync::sync_engine::{load_ai_settings, run_sync_cycle, SyncPlan};
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
use tracing::info;
````

替换为：

````rust
use tracing::{error, info, warn};
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub async fn start(db: RBatis) {
    let plan = SyncPlan {
````

替换为：

````rust
pub async fn start(db: RBatis) {
    let exclude_dirs: Vec<String> = env::var("NOTE_SYNC_EXCLUDE_DIRS").unwrap_or_default()
        .split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
    let max_kb: i64 = env::var("NOTE_SYNC_MAX_FILE_KB").ok().and_then(|v| v.parse().ok()).unwrap_or(1024);
    let moment = MomentSyncConfig::from_env(exclude_dirs.clone(), max_kb);
    match &moment {
        Some(c) => info!("note_sync: 说说双向同步已开启 dir={} push={}", c.dir, c.push),
        None => info!("note_sync: 说说同步未开启（NOTE_SYNC_MOMENT_DIR 为空）"),
    }

    let plan = SyncPlan {
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
        exclude_dirs: env::var("NOTE_SYNC_EXCLUDE_DIRS").unwrap_or_default()
            .split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
        max_kb: env::var("NOTE_SYNC_MAX_FILE_KB").ok().and_then(|v| v.parse().ok()).unwrap_or(1024),
````

替换为：

````rust
        exclude_dirs,
        max_kb,
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
        enc_key: env::var("NOTE_SYNC_AI_ENC_KEY").unwrap_or_default(),
    };
````

替换为：

````rust
        enc_key: env::var("NOTE_SYNC_AI_ENC_KEY").unwrap_or_default(),
        moment,
    };
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
    let mut gh = GithubClient::new(&plan.token, &plan.repo, &plan.branch);
````

替换为：

````rust
    let (api_base, api_base_warn) = resolve_api_base(&env::var("NOTE_SYNC_API_BASE").unwrap_or_default());
    if let Some(w) = api_base_warn {
        warn!("note_sync: {w}");
    }
    let mut gh = GithubClient::new(&plan.token, &plan.repo, &plan.branch).with_api_base(&api_base);
````

**修改 `src/note_sync/scheduler.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
async fn run_once(db: &RBatis, plan: &SyncPlan, gh: &mut GithubClient) {
    let ai = load_ai_settings(db, &plan.enc_key, plan.allow_http).await;
    let stats = run_sync_cycle(db, gh, plan, ai).await;
    info!("note_sync stats: {:?}", stats);
}
````

替换为：

````rust
async fn run_once(db: &RBatis, plan: &SyncPlan, gh: &mut GithubClient) {
    // 仓库树一轮只拉一次（ETag 缓存在 gh 上），再分别交给笔记与说说两个阶段
    let entries = match gh.list_tree().await {
        Ok(TreeFetch::Unchanged) => {
            info!("note_sync: 仓库无变化 (ETag 304)");
            None
        }
        Ok(TreeFetch::Changed { entries, .. }) => Some(entries),
        Err(e) => {
            error!("note_sync: {}", e);
            return;
        }
    };
    if let Some(entries) = &entries {
        let ai = load_ai_settings(db, &plan.enc_key, plan.allow_http).await;
        let stats = run_sync_cycle(db, gh, plan, ai, entries).await;
        info!("note_sync stats: {:?}", stats);
    }
    if let Some(cfg) = &plan.moment {
        // 树没变时 entries 为 None：说说只做写回
        run_moment_cycle(db, gh, cfg, entries.as_deref()).await;
    }
}
````

- [ ] **运行全部测试**

```bash
cargo test 2>&1 | grep -E "^test result|FAILED|failed"
```

期望：`119 passed; 2 failed`，且失败的**只有** `post::apis::test::test_post_add`（缺目录）和 `user::apis::test::test_greet`（旧的 404 断言）——它们改动前就失败。新增的 `test_filter_excludes_moment_dir_even_when_root_is_empty` 通过。

- [ ] **确认没有新增编译警告**

```bash
touch src/main.rs && cargo build 2>&1 | grep -E "^warning" -A2 | grep -E "^warning|-->" | head -30
```

期望：警告全部落在这次没动的文件里（`config.rs`、`post/structs.rs`、`user/structs.rs`、`comment/apis.rs`、`github_client.rs` 里原有的 `GhError::Unauthorized` 字段 / `TreeFetch::Changed.etag`），`moment_sync.rs`、`scheduler.rs`、`sync_engine.rs` 没有。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/note_sync/sync_engine.rs \
  src/note_sync/scheduler.rs
git commit -F - <<'EOF'
feat(note_sync): 调度层一轮只拉一次仓库树，笔记与说说各跑一个阶段

run_sync_cycle 改为接收调度层拉到的条目（ETag 缓存在客户端上，同一轮不能拉两次）；树没变
（304）时跳过笔记与说说的拉取，说说仍执行写回。笔记过滤排除说说目录，NOTE_SYNC_ROOT 配成空
也不会把说说文件当文章。SyncPlan 带上说说配置；NOTE_SYNC_API_BASE 经 resolve_api_base 校验。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 端到端测试（临时 MySQL + 进程内模拟 GitHub）

**Files:**
- Create: `src/note_sync/moment_e2e.rs`
- Modify: `src/note_sync/mod.rs`

**Interfaces:**
- Consumes: Task 4 的 `run_moment_cycle`、Task 3 的 `with_api_base`
- Produces: 测试 `note_sync::moment_e2e::moment_e2e_scenarios`（`#[ignore]`）。进程内模拟的 GitHub 支持：树（带 ETag / 304）、读文件、PUT / DELETE（校验 sha：缺 sha 返回 422、不匹配返回 409）、提交时间、可切换的 403。10 个场景：①首轮认领与写出 ②仓库改文件 ③后台改说说 ④仓库新增文件 ⑤后台新发与重名 ⑥两边删除与恢复 ⑦两边都改 ⑧403 ⑨崩溃恢复 ⑩只拉取

**修改 `src/note_sync/mod.rs`**（查找的片段必须恰好出现一次）：

查找：

````rust
pub mod moment_sync;
````

替换为：

````rust
pub mod moment_sync;
#[cfg(test)]
mod moment_e2e;
````

**新建 `src/note_sync/moment_e2e.rs`**，内容如下：

````rust
//! 说说双向同步的端到端测试：真实 MySQL（临时库）+ 进程内模拟的 GitHub。
//!
//! 默认不跑。会 DROP / CREATE `moment`、`moment_sync_map` 两张表，所以库名必须含 "e2e"：
//!
//! ```text
//! mysql -uroot -p -e 'create database rust_blog_e2e default charset utf8mb4'
//! E2E_DATABASE_URL='mysql://root:密码@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
//!   cargo test moment_e2e -- --ignored --nocapture
//! mysql -uroot -p -e 'drop database rust_blog_e2e'
//! ```
//!
//! 所有场景放在一个测试函数里按顺序跑，避免多个测试同时清空同一个库。

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use base64::Engine;
use rbatis::RBatis;
use serde_json::json;

use crate::moment::Moment;
use crate::note_sync::derive::sha256_hex;
use crate::note_sync::github_client::{GithubClient, TreeFetch};
use crate::note_sync::moment_sync::{
    parse_name_time, render_moment, run_moment_cycle, MomentStats, MomentSyncConfig,
};
use crate::note_sync::structs::MomentSyncMap;
use crate::note_sync::sync_engine::value_to_i32;

// ---------- 进程内模拟的 GitHub ----------

#[derive(Default)]
struct Repo {
    files: BTreeMap<String, String>,
    /// 每次变更 +1，用作树的 ETag
    rev: u64,
    forbid_write: bool,
    /// 写操作的记录，如 "PUT 说说/a.md" / "DELETE 说说/a.md"，用来断言没有多余提交
    commits: Vec<String>,
}
type Shared = Arc<Mutex<Repo>>;

fn blob_sha(content: &str) -> String {
    sha256_hex(content)[..40].to_string()
}
fn b64(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
}

async fn tree(repo: web::Data<Shared>, req: HttpRequest) -> HttpResponse {
    let r = repo.lock().unwrap();
    let etag = format!("\"{}\"", r.rev);
    if req.headers().get("if-none-match").and_then(|v| v.to_str().ok()) == Some(etag.as_str()) {
        return HttpResponse::NotModified().finish();
    }
    let entries: Vec<_> = r
        .files
        .iter()
        .map(|(p, c)| json!({ "path": p, "type": "blob", "sha": blob_sha(c), "size": c.len() }))
        .collect();
    HttpResponse::Ok()
        .insert_header(("ETag", etag))
        .json(json!({ "tree": entries, "truncated": false }))
}

async fn get_content(repo: web::Data<Shared>, path: web::Path<(String, String, String)>) -> HttpResponse {
    let (_, _, p) = path.into_inner();
    match repo.lock().unwrap().files.get(&p) {
        Some(c) => HttpResponse::Ok().json(json!({ "content": b64(c), "encoding": "base64" })),
        None => HttpResponse::NotFound().json(json!({ "message": "Not Found" })),
    }
}

async fn put_content(
    repo: web::Data<Shared>,
    path: web::Path<(String, String, String)>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let (_, _, p) = path.into_inner();
    let mut r = repo.lock().unwrap();
    if r.forbid_write {
        return HttpResponse::Forbidden()
            .json(json!({ "message": "Resource not accessible by personal access token" }));
    }
    match (r.files.get(&p), body["sha"].as_str()) {
        (Some(old), Some(sha)) if blob_sha(old) == sha => {}
        (Some(_), Some(_)) => {
            return HttpResponse::Conflict().json(json!({ "message": "does not match" }))
        }
        (Some(_), None) => {
            return HttpResponse::UnprocessableEntity().json(json!({ "message": "sha wasn't supplied" }))
        }
        (None, _) => {}
    }
    let raw = base64::engine::general_purpose::STANDARD
        .decode(body["content"].as_str().unwrap_or_default())
        .expect("valid base64");
    let content = String::from_utf8(raw).expect("utf8");
    r.files.insert(p.clone(), content.clone());
    r.rev += 1;
    r.commits.push(format!("PUT {p}"));
    HttpResponse::Ok().json(json!({ "content": { "sha": blob_sha(&content), "path": p } }))
}

async fn delete_content(
    repo: web::Data<Shared>,
    path: web::Path<(String, String, String)>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let (_, _, p) = path.into_inner();
    let mut r = repo.lock().unwrap();
    if r.forbid_write {
        return HttpResponse::Forbidden()
            .json(json!({ "message": "Resource not accessible by personal access token" }));
    }
    match r.files.get(&p) {
        None => return HttpResponse::NotFound().json(json!({ "message": "Not Found" })),
        Some(old) if Some(blob_sha(old).as_str()) != body["sha"].as_str() => {
            return HttpResponse::Conflict().json(json!({ "message": "does not match" }))
        }
        Some(_) => {}
    }
    r.files.remove(&p);
    r.rev += 1;
    r.commits.push(format!("DELETE {p}"));
    HttpResponse::Ok().json(json!({ "commit": {} }))
}

async fn commits() -> HttpResponse {
    HttpResponse::Ok().json(json!([{ "sha": "c1", "commit": { "author": { "date": "2026-09-01T10:00:00Z" } } }]))
}

async fn start_mock() -> (Shared, String) {
    let repo: Shared = Arc::default();
    let data = web::Data::new(repo.clone());
    let server = HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/repos/{owner}/{repo}/git/trees/{branch}", web::get().to(tree))
            .route("/repos/{owner}/{repo}/contents/{path:.*}", web::get().to(get_content))
            .route("/repos/{owner}/{repo}/contents/{path:.*}", web::put().to(put_content))
            .route("/repos/{owner}/{repo}/contents/{path:.*}", web::delete().to(delete_content))
            .route("/repos/{owner}/{repo}/commits", web::get().to(commits))
    })
    .workers(1)
    .bind(("127.0.0.1", 0))
    .expect("bind mock github");
    let port = server.addrs()[0].port();
    actix_web::rt::spawn(server.run());
    (repo, format!("http://127.0.0.1:{port}"))
}

// ---------- 测试环境 ----------

const M1_MS: i64 = 1_789_654_500_000; // 2026_09_17_22_15
const M2_MS: i64 = 1_789_731_600_000; // 2026_09_18_19_40
const DIR: &str = "说说/";

struct Env {
    db: RBatis,
    repo: Shared,
    base: String,
    gh: GithubClient,
    cfg: MomentSyncConfig,
}

const DDL: [&str; 4] = [
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
    "DROP TABLE IF EXISTS `moment_sync_map`",
    "CREATE TABLE `moment_sync_map` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `moment_id` INT NOT NULL,
        `github_path` VARCHAR(512) NOT NULL,
        `blob_sha` CHAR(40) NOT NULL,
        `local_sha` CHAR(64) NOT NULL,
        `synced_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_moment_id` (`moment_id`),
        UNIQUE KEY `uk_github_path` (`github_path`(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

async fn setup() -> Env {
    // 让 warn / error 日志出现在 --nocapture 的输出里（不影响断言）
    let _ = tracing_subscriber::fmt().with_max_level(tracing::Level::WARN).with_test_writer().try_init();
    let url = std::env::var("E2E_DATABASE_URL").expect("需要设置 E2E_DATABASE_URL");
    let dbname = url.rsplit('/').next().unwrap_or("").split('?').next().unwrap_or("");
    assert!(dbname.contains("e2e"), "拒绝在库名不含 e2e 的数据库上运行: {dbname}");
    let db = crate::config::init_rbatis(url).await;
    for ddl in DDL {
        db.exec(ddl, vec![]).await.expect("ddl");
    }
    let (repo, base) = start_mock().await;
    let gh = GithubClient::new("test-token", "o/r", "master").with_api_base(&base);
    let cfg = MomentSyncConfig::new(DIR, true, vec![".obsidian".into()], 1024).unwrap();
    Env { db, repo, base, gh, cfg }
}

/// 清空库和模拟仓库，换一个新的客户端（丢掉缓存的 ETag），回到干净状态
async fn reset(e: &mut Env) {
    e.db.exec("DELETE FROM moment", vec![]).await.unwrap();
    e.db.exec("DELETE FROM moment_sync_map", vec![]).await.unwrap();
    *e.repo.lock().unwrap() = Repo::default();
    e.gh = GithubClient::new("test-token", "o/r", "master").with_api_base(&e.base);
    e.cfg.push = true;
}

/// 和调度器一样：先拉一次树，再跑说说。返回 (统计, 这一轮树是否没变)
async fn cycle(e: &mut Env) -> (MomentStats, bool) {
    let entries = match e.gh.list_tree().await.expect("list_tree") {
        TreeFetch::Unchanged => None,
        TreeFetch::Changed { entries, .. } => Some(entries),
    };
    let unchanged = entries.is_none();
    (run_moment_cycle(&e.db, &mut e.gh, &e.cfg, entries.as_deref()).await, unchanged)
}

async fn add_moment(e: &Env, content: &str, created_ms: i64) -> i32 {
    let mut m = Moment::new(content.to_string(), None, 1, None);
    m.created_time = Some(created_ms);
    m.update_time = Some(created_ms);
    let r = Moment::insert(&e.db, &m).await.expect("insert moment");
    value_to_i32(&r.last_insert_id)
}
async fn all_moments(e: &Env) -> Vec<Moment> {
    Moment::select_all(&e.db).await.unwrap()
}
async fn moment_of(e: &Env, id: i32) -> Moment {
    all_moments(e).await.into_iter().find(|m| m.id == Some(id)).expect("moment exists")
}
async fn save(e: &Env, m: &Moment) {
    Moment::update_by_column(&e.db, m, "id").await.unwrap();
}
async fn maps(e: &Env) -> Vec<MomentSyncMap> {
    MomentSyncMap::select_all(&e.db).await.unwrap()
}
fn put_local(e: &Env, path: &str, content: &str) {
    let mut r = e.repo.lock().unwrap();
    r.files.insert(path.to_string(), content.to_string());
    r.rev += 1;
}
fn rm_local(e: &Env, path: &str) {
    let mut r = e.repo.lock().unwrap();
    r.files.remove(path);
    r.rev += 1;
}
fn file_of(e: &Env, path: &str) -> Option<String> {
    e.repo.lock().unwrap().files.get(path).cloned()
}
fn commits_of(e: &Env) -> Vec<String> {
    e.repo.lock().unwrap().commits.clone()
}
/// 断言这一轮什么都没发生
fn assert_quiet(s: &MomentStats, ctx: &str) {
    let all = [
        s.adopted, s.created, s.updated, s.removed, s.skipped, s.failed,
        s.pushed_created, s.pushed_updated, s.pushed_deleted,
    ];
    assert!(all.iter().all(|n| *n == 0), "{ctx}: 本应无任何操作，实际 {s:?}");
}

const P1: &str = "说说/2026_09_17_22_15.md";
const P2: &str = "说说/2026_09_18_19_40.md";
const C1: &str = "把评论审核做完了，待审核的终于不用一条条手点。";
const C2: &str = "这台机器第一次编译 actix-web 花了 30 秒，之后就都是秒级了。";

#[actix_web::test]
#[ignore = "需要 E2E_DATABASE_URL 指向库名含 e2e 的临时库"]
async fn moment_e2e_scenarios() {
    let mut e = setup().await;

    // ① 首轮：#1 被认领（不重复创建），#2 被写成文件；之后再跑不再有任何操作
    reset(&mut e).await;
    let id1 = add_moment(&e, C1, M1_MS).await;
    let id2 = add_moment(&e, C2, M2_MS).await;
    put_local(&e, P1, C1); // 和你仓库里现有的文件一样：纯文本、没有结尾换行
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.adopted, s.created, s.pushed_created, s.failed), (1, 0, 1, 0), "① {s:?}");
    assert_eq!(all_moments(&e).await.len(), 2, "① 不能重复创建说说");
    assert_eq!(maps(&e).await.len(), 2);
    assert_eq!(file_of(&e, P2).as_deref(), Some(format!("{C2}\n").as_str()), "① #2 的文件内容");
    assert_eq!(file_of(&e, P1).as_deref(), Some(C1), "① 不能改写你手写的文件");
    assert_eq!(commits_of(&e), vec![format!("PUT {P2}")]);
    let (s, unchanged) = cycle(&mut e).await; // 我们自己的提交让树变了，这一轮会重新拉取
    assert!(!unchanged);
    assert_quiet(&s, "① 第二轮");
    let (s, unchanged) = cycle(&mut e).await;
    assert!(unchanged, "① 第三轮树没变（304）");
    assert_quiet(&s, "① 第三轮");
    assert_eq!(commits_of(&e).len(), 1, "① 稳定后不能有多余提交");

    // ② 仓库里改文件 → 库里更新；点赞数不变；之后不会被写回
    let mut m1 = moment_of(&e, id1).await;
    m1.likes = 5;
    save(&e, &m1).await;
    put_local(&e, P1, "我改了这一条\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "② {s:?}");
    let m1 = moment_of(&e, id1).await;
    assert_eq!((m1.content.as_str(), m1.likes), ("我改了这一条", 5), "② 点赞数要保留");
    assert_quiet(&cycle(&mut e).await.0, "② 之后");
    assert_eq!(commits_of(&e).len(), 1, "② 没有写回");

    // ③ 后台改说说 → 下一轮文件被更新（树没变时也要写回）
    let mut m2 = moment_of(&e, id2).await;
    m2.content = "后台改过的第二条".into();
    m2.location = Some("南京".into());
    m2.is_public = 0;
    save(&e, &m2).await;
    let (s, unchanged) = cycle(&mut e).await;
    assert!(unchanged, "③ 此时树没变，写回阶段仍然要跑");
    assert_eq!(s.pushed_updated, 1, "③ {s:?}");
    assert_eq!(
        file_of(&e, P2).as_deref(),
        Some("---\nlocation: 南京\npublic: false\n---\n后台改过的第二条\n")
    );
    assert_quiet(&cycle(&mut e).await.0, "③ 之后");

    // ④ 仓库里新增文件 → 新建说说：规范文件名 / 不规范文件名 / 带文件头与图片
    put_local(&e, "说说/2026_09_20_08_05.md", "新增的一条\n");
    put_local(&e, "说说/随想.md", "文件名不规范\n");
    put_local(
        &e,
        "说说/2026_09_21_09_00.md",
        "---\nlocation: 上海\npublic: false\n---\n私密的一条\n\n![](http://a/1.jpg)\n![](http://a/2.jpg)\n",
    );
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created, s.failed), (3, 0, 0), "④ {s:?}");
    let ms = all_moments(&e).await;
    let find = |c: &str| ms.iter().find(|m| m.content == c).unwrap_or_else(|| panic!("缺少说说 {c}"));
    assert_eq!(find("新增的一条").created_time, parse_name_time("说说/2026_09_20_08_05.md"));
    assert_eq!(
        find("文件名不规范").created_time,
        Some(chrono::DateTime::parse_from_rfc3339("2026-09-01T10:00:00Z").unwrap().timestamp_millis()),
        "④ 不规范文件名取最后一次提交时间"
    );
    let p = find("私密的一条");
    assert_eq!((p.is_public, p.location.as_deref()), (0, Some("上海")));
    assert_eq!(p.images.as_deref(), Some("[\"http://a/1.jpg\",\"http://a/2.jpg\"]"));
    let before = commits_of(&e).len();
    assert_quiet(&cycle(&mut e).await.0, "④ 之后");
    assert_eq!(commits_of(&e).len(), before, "④ 新建的说说不能被回写");

    // ⑤ 后台新发 → 新建文件；同一分钟重名时加秒数
    let a = add_moment(&e, "同一分钟的第一条", M2_MS + 60_000 * 3 + 10_000).await;
    let b = add_moment(&e, "同一分钟的第二条", M2_MS + 60_000 * 3 + 20_000).await;
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.pushed_created, s.failed), (2, 0), "⑤ {s:?}");
    assert_eq!(file_of(&e, "说说/2026_09_18_19_43.md").as_deref(), Some("同一分钟的第一条\n"));
    assert_eq!(file_of(&e, "说说/2026_09_18_19_43_20.md").as_deref(), Some("同一分钟的第二条\n"));
    assert_quiet(&cycle(&mut e).await.0, "⑤ 之后");
    let _ = (a, b);

    // ⑥ 删除：仓库删文件 → 说说软删；后台删说说 → 仓库文件被删；后台删了但仓库同时改了 → 恢复
    reset(&mut e).await;
    let x = add_moment(&e, "仓库里会被删的", M1_MS).await;
    let y = add_moment(&e, "后台会被删的", M2_MS).await;
    let z = add_moment(&e, "后台删了但仓库改了", M2_MS + 60_000 * 5).await;
    assert_eq!(cycle(&mut e).await.0.pushed_created, 3);
    let (px, py, pz) = ("说说/2026_09_17_22_15.md", P2, "说说/2026_09_18_19_45.md");

    rm_local(&e, px);
    let (s, _) = cycle(&mut e).await;
    assert_eq!(s.removed, 1, "⑥ {s:?}");
    assert_eq!(moment_of(&e, x).await.is_deleted, Some(1));
    assert_eq!(maps(&e).await.len(), 2);

    let mut my = moment_of(&e, y).await;
    my.is_deleted = Some(1);
    save(&e, &my).await;
    let (s, _) = cycle(&mut e).await;
    assert_eq!(s.pushed_deleted, 1, "⑥ {s:?}");
    assert!(file_of(&e, py).is_none(), "⑥ 仓库文件应已删除");
    assert!(commits_of(&e).contains(&format!("DELETE {py}")));

    let mut mz = moment_of(&e, z).await;
    mz.is_deleted = Some(1);
    save(&e, &mz).await;
    put_local(&e, pz, "仓库里改过\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_deleted), (1, 0), "⑥ {s:?}");
    let mz = moment_of(&e, z).await;
    assert_eq!((mz.is_deleted, mz.content.as_str()), (Some(0), "仓库里改过"), "⑥ 仓库为准：恢复并更新");
    assert!(file_of(&e, pz).is_some(), "⑥ 文件不能被删");
    assert_quiet(&cycle(&mut e).await.0, "⑥ 之后");

    // ⑦ 两边都改了同一条 → 仓库为准，后台那份不会被写回
    reset(&mut e).await;
    let id = add_moment(&e, "原文", M1_MS).await;
    assert_eq!(cycle(&mut e).await.0.pushed_created, 1);
    let mut m = moment_of(&e, id).await;
    m.content = "后台改的".into();
    save(&e, &m).await;
    put_local(&e, P1, "仓库改的\n");
    let before = commits_of(&e).len();
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "⑦ {s:?}");
    assert_eq!(moment_of(&e, id).await.content, "仓库改的", "⑦ 仓库为准");
    assert_eq!(file_of(&e, P1).as_deref(), Some("仓库改的\n"));
    assert_eq!(commits_of(&e).len(), before, "⑦ 后台的版本不能写回");
    assert_quiet(&cycle(&mut e).await.0, "⑦ 之后");

    // ⑧ 令牌没有写权限(403)：写回在第一次被拒后就停止、拉取照常；权限恢复后补上
    reset(&mut e).await;
    add_moment(&e, "没有写权限时新发的", M1_MS).await;
    add_moment(&e, "没有写权限时新发的第二条", M1_MS + 3 * 60_000).await;
    e.repo.lock().unwrap().forbid_write = true;
    put_local(&e, P2, "拉取不受影响\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created), (1, 0), "⑧ {s:?}");
    assert_eq!(s.failed, 1, "⑧ 第一次 403 之后就该停止，不能每条都再试一遍: {s:?}");
    assert!(file_of(&e, P1).is_none());
    e.repo.lock().unwrap().forbid_write = false;
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.pushed_created, s.failed), (2, 0), "⑧ 恢复后补写: {s:?}");
    assert_eq!(file_of(&e, P1).as_deref(), Some("没有写权限时新发的\n"));
    assert_eq!(
        file_of(&e, "说说/2026_09_17_22_18.md").as_deref(),
        Some("没有写权限时新发的第二条\n")
    );

    // ⑨ 崩溃恢复：三种「已提交到 GitHub、但映射没来得及更新」的状态都能收敛，且不记误导性覆盖
    reset(&mut e).await;
    //   (a) 新建：文件已在仓库，映射缺失 → 认领，不重复创建
    let a = add_moment(&e, "崩溃前已写出的", M1_MS).await;
    let text_a = render_moment(&moment_of(&e, a).await);
    put_local(&e, P1, &text_a);
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.adopted, s.created, s.pushed_created), (1, 0, 0), "⑨a {s:?}");
    assert_eq!(all_moments(&e).await.len(), 1);
    assert!(commits_of(&e).is_empty());
    //   (b) 更新：仓库文件已是新内容(== 库里渲染)，映射还是旧的 → 只刷新映射，不改说说、不提交
    let mut ma = moment_of(&e, a).await;
    ma.content = "崩溃前已更新的".into();
    save(&e, &ma).await;
    put_local(&e, P1, &render_moment(&ma));
    let update_time_before = moment_of(&e, a).await.update_time;
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (0, 0), "⑨b {s:?}");
    assert_eq!(moment_of(&e, a).await.update_time, update_time_before);
    assert!(commits_of(&e).is_empty());
    assert_quiet(&cycle(&mut e).await.0, "⑨b 之后");
    //   (c) 删除：文件已删、说说已软删，映射还在 → 只清理映射
    let mut ma = moment_of(&e, a).await;
    ma.is_deleted = Some(1);
    save(&e, &ma).await;
    rm_local(&e, P1);
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.removed, s.pushed_deleted, s.failed), (1, 0, 0), "⑨c {s:?}");
    assert!(maps(&e).await.is_empty());
    assert!(commits_of(&e).is_empty());

    // ⑩ NOTE_SYNC_MOMENT_PUSH=false：只拉取，不写回
    reset(&mut e).await;
    e.cfg.push = false;
    add_moment(&e, "不应写回", M1_MS).await;
    put_local(&e, P2, "只拉取\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created), (1, 0), "⑩ {s:?}");
    assert!(file_of(&e, P1).is_none());
    assert!(commits_of(&e).is_empty());
    e.cfg.push = true;
}
````

- [ ] **建临时库并运行端到端测试**（库名必须含 `e2e`；测试会 DROP / CREATE 其中的 `moment`、`moment_sync_map`）

```bash
# 取 .env 里的库连接信息，拼出临时库 rust_blog_e2e 的连接串（不打印密码）
eval "$(python3 - "$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" <<'PY'
import sys, shlex, urllib.parse as u
p = u.urlparse(sys.argv[1])
for k, v in [("DBUSER", p.username), ("DBPASS", u.unquote(p.password or "")),
             ("DBHOST", p.hostname), ("DBPORT", p.port or 3306), ("RAWPASS", p.password or "")]:
    print(f"{k}={shlex.quote(str(v))}")
PY
)"
export MYSQL_PWD="$DBPASS"
export E2E_DATABASE_URL="mysql://$DBUSER:$RAWPASS@$DBHOST:$DBPORT/rust_blog_e2e?charset=utf8mb4"
mysql -h "$DBHOST" -P "$DBPORT" -u "$DBUSER" -e 'drop database if exists rust_blog_e2e; create database rust_blog_e2e default charset utf8mb4'
cargo test moment_e2e -- --ignored --nocapture 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "^test |^test result|panicked|assertion"
```

期望：`moment_e2e_scenarios ... ok`，`1 passed; 0 failed`。

再单独看一遍日志（上面的命令把日志过滤掉了）：

```bash
cargo test moment_e2e -- --ignored --nocapture 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' | grep -E "WARN|ERROR" | grep moment_sync | cut -c1-200
```

期望**恰好两条**：⑦ 的 `仓库与后台都改了，以仓库为准；被覆盖的后台内容(前500字): "后台改的"`，和 ⑧ 的 `写回停止 … 缺少 Contents 写权限`。出现别的 `moment_sync` 警告都要查原因（尤其 ⑨ 崩溃恢复不能误报「被覆盖」）。

- [ ] **变异检查：端到端场景真的在约束规则**

先备份 `src/note_sync/moment_sync.rs`，依次临时改坏下面三处，每次重新运行上一步的 `cargo test moment_e2e …`，期望**失败**，然后还原：

1. 让 `find_adoptee` 永远返回 `None`（在 `let file_ms = parse_name_time(path)?;` 之后加 `return None;`）→ 期望 ① 失败（`adopted` 为 0、说说被重复创建）
2. 把 `pull_update` 里的 `if differs || restored {` 改成 `if (differs || restored) && fingerprint(&m) == map.local_sha {`（后台改过就不覆盖）→ 期望 ⑦ 失败
3. 把 `handle_push_err` 里 `GhError::Forbidden(_) | GhError::RateLimited | GhError::Unauthorized(_)` 那个分支末尾的 `PushStep::Stop` 改成 `PushStep::Continue`（403 不停止）→ 期望 ⑧ 失败（`failed` 为 2，断言要求 1）

还原后再跑一次，期望 `1 passed`。

- [ ] **删除临时库**

```bash
mysql -h "$DBHOST" -P "$DBPORT" -u "$DBUSER" -e 'drop database if exists rust_blog_e2e'
mysql -h "$DBHOST" -P "$DBPORT" -u "$DBUSER" -N -e "show databases like '%e2e%'" | wc -l
```

期望输出 `0`。

- [ ] **确认默认的 `cargo test` 不受影响**（端到端测试被 `#[ignore]` 跳过）

```bash
cargo test 2>&1 | grep -E "^test result"
```

期望：`119 passed; 2 failed; 1 ignored`。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add src/note_sync/moment_e2e.rs \
  src/note_sync/mod.rs
git commit -F - <<'EOF'
test(moment_sync): 说说双向同步的端到端测试

进程内模拟 GitHub（树/ETag、读写删文件、sha 校验、403 开关）+ 临时 MySQL，覆盖认领、
双向增改删、同分钟重名、两边都改以仓库为准、403 停止写回、三种崩溃恢复状态、只拉取模式。
默认 #[ignore]，库名必须含 e2e 才会运行。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: 后台「说说」页说明文案

**Files:**
- Modify: `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`

**Interfaces:** 无（纯文案）

**修改 `front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx`**（查找的片段必须恰好出现一次）：

查找：

````tsx
                    </Space>
                </div>

                <div className="admin-stat-grid">
````

替换为：

````tsx
                    </Space>
                </div>

                <div style={{ marginBottom: 12, color: 'var(--color-text-muted)', fontSize: 12 }}>
                    说说会与笔记仓库的「说说」文件夹双向同步：此处的改动将在下一轮同步（默认 30 分钟）写回仓库；仓库里的改动也会同步回来，两边都改过时以仓库为准。
                </div>

                <div className="admin-stat-grid">
````

- [ ] **类型检查、lint、构建**（分开跑，别用管道串联，免得前一步失败被吞掉）

```bash
cd front/ryu2u_blog_admin
npx tsc --noEmit; echo "tsc exit: $?"
npm run lint 2>&1 | tail -4
npm run build 2>&1 | tail -4
cd ../..
```

期望：`tsc exit: 0`；lint 仍是 **29 个问题**（改动前就是 29 个，不得新增）；构建成功（`built in …`）。

- [ ] **（可选）在浏览器里看一眼**：用 `.claude/launch.json` 的 `backend`（已带 `NOTE_SYNC_ENABLED=false`，不会触碰仓库）和 `admin` 起服务，登录后台，打开「说说管理」，确认标题下面出现一行淡色说明、不换乱版面。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add front/ryu2u_blog_admin/src/admin/moments/MomentsPage.tsx
git commit -F - <<'EOF'
feat(admin): 说说管理页提示与仓库双向同步

说明改动会在下一轮同步（默认 30 分钟）写回仓库，仓库里的改动也会同步回来，两边都改过时以仓库为准。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: 配置、文档与最终验证

**Files:**
- Modify: `.env.example`、`CLAUDE.md`、`docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`
- Create: `docs/migrations/2026-11-03-moment-two-way-sync.md`

**Interfaces:** 无

**修改 `.env.example`**（查找的片段必须恰好出现一次）：

查找：

````bash
NOTE_SYNC_AI_ALLOW_HTTP=0
````

替换为：

````bash
NOTE_SYNC_AI_ALLOW_HTTP=0
# ---- 说说 ↔ 仓库「说说/」目录 双向同步（需要 NOTE_SYNC_ENABLED=true）----
# 仓库内的说说目录；留空 = 关闭说说同步
NOTE_SYNC_MOMENT_DIR=说说/
# false / 0 = 只从仓库拉取，不把后台的改动写回仓库。写回需要令牌有 Contents 读写权限；
# 第一次上线建议先设 false 观察一轮，确认「认领 / 新建」符合预期后再改成 true
NOTE_SYNC_MOMENT_PUSH=true
# 仅供本地用模拟 GitHub 做测试；非 https 只允许 localhost / 127.0.0.1 / [::1]。正常使用请留空
NOTE_SYNC_API_BASE=
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
and `note_sync_config` (AI 配置，API key AES 密文存储/掩码回显).
````

替换为：

````markdown
and `note_sync_config` (AI 配置，API key AES 密文存储/掩码回显).

**Moment two-way sync** (`moment_sync.rs`) — 仓库根目录 `说说/*.md` ↔ `moment` 表。文件名 `YYYY_MM_DD_HH_mm.md` 就是发布时间（固定 +08:00，同一分钟重名加 `_ss`、`-N`）；文件默认是纯文本，有位置/私密时才带 YAML 文件头（`location`、`public: false`），图片以 Markdown 图片行写在正文末尾。映射表 `moment_sync_map`：`blob_sha` 判断仓库有没有变，`local_sha`（按库里数据渲染出的文本的 sha256）判断后台有没有变。每轮**先拉后推**，冲突时**仓库为准**（与笔记同步的「本地赢」相反，是有意的）；后台的发布/修改/删除随下一轮写回（`GithubClient::put_file` / `delete_file`，要求令牌有 Contents 写权限，写回每轮最多 50 个操作，403 时停止写回但拉取照常）。调度层（`scheduler.rs`）一轮只拉一次仓库树，交给笔记与说说两个阶段；树没变（304）时说说仍会跑写回。设计与规则见 `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`。
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
- `NOTE_SYNC_AI_ALLOW_HTTP` — 是否允许 AI base_url 用 http（0=仅 https，防 SSRF）
````

替换为：

````markdown
- `NOTE_SYNC_AI_ALLOW_HTTP` — 是否允许 AI base_url 用 http（0=仅 https，防 SSRF）
- `NOTE_SYNC_MOMENT_DIR` — 说说双向同步的仓库目录（默认 `说说/`；设为空 = 关闭说说同步）
- `NOTE_SYNC_MOMENT_PUSH` — 是否把后台的说说改动写回仓库（默认 true；`false`/`0` = 只拉取）
- `NOTE_SYNC_API_BASE` — GitHub API 根地址，仅供本地模拟 GitHub 测试（非 https 只允许 localhost/127.0.0.1/[::1]），正常留空
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
10 MySQL tables defined in `schema.sql`
````

替换为：

````markdown
11 MySQL tables defined in `schema.sql`
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
- `note_sync_config` — single row (id=1) AI config: `ai_enabled`/`ai_base_url`/`ai_model`/`ai_api_key` (AES-GCM ciphertext)
````

替换为：

````markdown
- `note_sync_config` — single row (id=1) AI config: `ai_enabled`/`ai_base_url`/`ai_model`/`ai_api_key` (AES-GCM ciphertext)
- `moment_sync_map` — 说说 ↔ 仓库文件映射：`moment_id`、`github_path` 各自唯一；`blob_sha`（仓库文件指纹）、`local_sha`（后台渲染文本指纹）
````

**修改 `CLAUDE.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
# Tests — there is no tests/ directory; the only tests are 2 #[test] fns in src/middleware.rs
cargo test
````

替换为：

````markdown
# Tests — unit tests are inline `#[cfg(test)]` modules (there is no tests/ directory)
cargo test

# Moment two-way sync end-to-end (real MySQL + in-process mock GitHub). Needs a throwaway database
# whose name contains "e2e" — the test DROPs/CREATEs `moment` and `moment_sync_map` in it
E2E_DATABASE_URL='mysql://user:pw@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
  cargo test moment_e2e -- --ignored --nocapture
````

**修改 `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
- **状态**: 待评审
````

替换为：

````markdown
- **状态**: 已通过评审（实现计划：`docs/superpowers/plans/2026-11-03-moment-two-way-sync.md`）
````

**修改 `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
对任意说说 `m`，`parse(render(m))` 得到的 `(content, images, location, is_public)` 必须等于 `m` 规范化后的值。这是单元测试的核心属性。
````

替换为：

````markdown
对任意说说 `m`，`parse(render(m))` 得到的 `(content, images, location, is_public)` 必须等于 `m` 规范化后的值。这是单元测试的核心属性。

唯一的例外：正文末尾恰好是一行独立的 `![](url)`、而 `images` 为空时，往返后这一行会被识别为图片。所以「内容是否相等」一律比较**两边各过一遍解析**的结果（`parse(render(说说))` 与 `parse(文件)`），而不是比较原文。这个边角只影响比较，不会丢数据。
````

**修改 `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`**（查找的片段必须恰好出现一次）：

查找：

````markdown
3. 文件内容与该说说**规范化后相等**：`sha256(render(parse(文件)))` == `sha256(render(说说))`
````

替换为：

````markdown
3. 文件内容与该说说**规范化后相等**：`parse(render(说说))` == `parse(文件)`（两边各过一遍解析，见 §6.3）
````

**新建 `docs/migrations/2026-11-03-moment-two-way-sync.md`**，内容如下：

````markdown
# 迁移文档：说说与笔记仓库双向同步

- **日期**：2026-11-03
- **适用对象**：已经部署了「GitHub 笔记同步」（`note_sync`）的服务器
- **配套文档**：设计文档 `docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md`

文中的 `<库名>`、`<服务名>` 等都是**需要你替换成自己环境的值**。

---

## 0. 一分钟摘要

| 问题 | 答案 |
|---|---|
| 行为上改了什么？ | 博客的「说说」和仓库根目录 `说说/` 文件夹双向同步：仓库里新增/修改/删除文件，说说随之变化；后台发布/修改/删除说说，下一轮同步（默认 30 分钟）写回仓库。两边都改了同一条时**以仓库为准**。 |
| 要改表结构吗？ | **要新增一张表** `moment_sync_map`，`moment` 表不变。 |
| 要重新部署什么？ | **后端二进制** + **后台前端**（「说说」页多一行说明文案）。博客前端不用动。 |
| 要改 `.env` 吗？ | 不是必须（都有默认值），但**强烈建议第一次上线先加 `NOTE_SYNC_MOMENT_PUSH=false`**，见第 3 节。 |
| 令牌要什么权限？ | 写回需要 `NOTE_SYNC_TOKEN` 对该仓库有 **Contents: Read and write**（fine-grained PAT）。只有读权限也能用，但写回会被 403 拒绝，日志会提示，拉取不受影响。 |
| 最需要留意的风险？ | ① **后台未写回的改动会被仓库覆盖**，而且这份改动从没进过 git；② 写回会在你的仓库里产生提交，你本地的 Obsidian 副本需要 `git pull`；③ 私密说说也会写进仓库，仓库必须是私有的。 |
| 能回滚吗？ | 能。把 `NOTE_SYNC_MOMENT_DIR` 留空即可停用说说同步；映射表和已写出的文件保留，不影响其他功能。 |

---

## 1. 行为变化

| 场景 | 行为 |
|---|---|
| 仓库 `说说/` 下新增 `.md` 文件 | 新建说说；发布时间取自文件名 `YYYY_MM_DD_HH_mm.md`（+08:00）；文件名不规范则取该文件最后一次提交的时间 |
| 修改仓库里的说说文件 | 说说内容随之更新，点赞数、评论数保持不变 |
| 删除仓库里的说说文件 | 说说软删 |
| 后台发布说说 | 下一轮在仓库 `说说/` 下新建文件（文件名是发布时间，同一分钟重名加秒数） |
| 后台修改说说（含切换公开状态） | 下一轮更新仓库里的文件 |
| 后台删除说说 | 下一轮删除仓库里的文件（文件仍在 git 历史里，可找回） |
| 两边都改了同一条 | **仓库为准**，覆盖后台那份；被覆盖的后台内容（前 500 字）会写进后端的 warn 日志 |
| 库里已有、文件名时间同一分钟且内容一致的说说 | 首次同步时被「认领」（绑定到该文件），不会重复创建 |

文件格式：默认是纯文本；说说带位置或为私密时才有 YAML 文件头；图片以 Markdown 图片行写在正文末尾。

```
---
location: 南京
public: false
---
正文……

![](https://example.com/a.jpg)
```

---

## 2. 升级前

### 2.1 备份

```bash
mysqldump -u <用户> -p <库名> moment > /path/to/backup/moment_$(date +%F).sql
```

### 2.2 确认令牌权限

在 GitHub 的 fine-grained token 设置里，确认目标仓库（`md_note`）的 **Contents** 是 **Read and write**。不确定就先按第 3 节的两步上线：第一步只拉取，用不到写权限。

### 2.3 建表

用 `IF NOT EXISTS`，**不要执行 `schema.sql` 里带 `DROP TABLE` 的那一段**：

```sql
CREATE TABLE IF NOT EXISTS `moment_sync_map` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `moment_id` INT NOT NULL,
  `github_path` VARCHAR(512) NOT NULL,
  `blob_sha` CHAR(40) NOT NULL,
  `local_sha` CHAR(64) NOT NULL,
  `synced_at` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_moment_id` (`moment_id`),
  UNIQUE KEY `uk_github_path` (`github_path`(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='说说与仓库文件映射';
```

---

## 3. 推荐的两步上线

### 第一步：只拉取，观察一轮

在服务器 `.env` 里加：

```
NOTE_SYNC_MOMENT_PUSH=false
```

部署新后端并重启，等第一轮同步（启动后约 10 秒）。看日志里的 `moment_sync:` 行：

- `adopted` 是库里已有说说与仓库文件配对上的数量；
- `created` 是由仓库文件新建的说说数量；
- 不应出现意料之外的 `created`（比如你明明已经发过的说说又被重复创建）——认领要求「同一分钟 + 内容一致」，内容有出入就不会认领。

### 第二步：打开写回

先看**哪些说说会被写成仓库文件**（还没有映射的、未删除的说说）：

```sql
SELECT m.id, m.is_public, FROM_UNIXTIME(m.created_time / 1000) AS created, LEFT(m.content, 40) AS content
FROM moment m
LEFT JOIN moment_sync_map s ON s.moment_id = m.id
WHERE m.is_deleted = 0 AND s.id IS NULL
ORDER BY m.id;
```

每条会在仓库里产生一个提交，一轮最多写 50 个，剩下的下一轮继续。确认无误后，把 `NOTE_SYNC_MOMENT_PUSH` 改成 `true`（或删掉这一行），重启后端。

写回开始后，在本地 Obsidian 副本里先 `git pull`，再继续写笔记：

```bash
cd ~/Documents/md_note && git pull
```

---

## 4. 升级后验证

1. 在仓库 `说说/` 下新建一个纯文本文件，如 `2026_11_03_20_30.md`，提交并推送；一轮同步后，博客「说说」页应出现这条，发布时间是 20:30；
2. 在后台「说说」页发布一条，一轮同步后仓库 `说说/` 下应出现对应文件；
3. 稳定后重复几轮，仓库里**不应再出现新的提交**；
4. 后端日志里的 `moment_sync:` 统计行，在没有任何改动时各项应全为 0。

---

## 5. 回滚

- 停用：把 `.env` 里的 `NOTE_SYNC_MOMENT_DIR` 设为空，重启。说说与仓库不再同步，其他功能不受影响。
- 只想暂停写回：`NOTE_SYNC_MOMENT_PUSH=false`。
- 想换回旧后端二进制：旧版本不认识 `moment_sync_map`，直接忽略它，没有冲突。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 日志：`NOTE_SYNC_TOKEN 缺少 Contents 写权限` | 令牌只读 | 给令牌加 Contents 读写权限；或先 `NOTE_SYNC_MOMENT_PUSH=false` |
| 日志：`仓库端已变化，本轮跳过` | 写回时仓库那一边刚好又变了 | 不用处理，下一轮会先拉取（仓库为准）再比较 |
| 日志：`仓库与后台都改了，以仓库为准` | 两次同步之间两边都改了同一条 | 被覆盖的后台内容在这行日志里；需要的话手动补回 |
| 本地 `git push` 被拒绝 | 后端往仓库提交过，本地落后了 | 先 `git pull` 再推送 |
| 说说文件被识别成了图片 | 正文末尾恰好有一行独立的 `![](url)` 且没有图片字段 | 这是文件格式的已知边角，不会丢数据；把这行放到正文中间即可 |
````

- [ ] **决定本地 `.env` 要不要先关掉写回（需要你拍板）**

本地 `.env`（不入库）里有真实的仓库令牌，且 `NOTE_SYNC_ENABLED=true`。新代码上线后 `NOTE_SYNC_MOMENT_PUSH` 默认是 `true`，所以**任何直接 `cargo run` 的本地启动，约 10 秒后就会往你的真实仓库提交**（例如把 #2 写成 `说说/2026_09_18_19_40.md`）。要先观察再放开的话，在 `.env` 末尾加一行：

```bash
printf '\n# 先只拉取，确认认领/新建符合预期后再改成 true（见 docs/migrations/2026-11-03-moment-two-way-sync.md）\nNOTE_SYNC_MOMENT_PUSH=false\n' >> .env
```

用 `.claude/launch.json` 的 `backend` 配置起服务不受影响（它自带 `NOTE_SYNC_ENABLED=false`）。

- [ ] **最终验证**

```bash
cargo test 2>&1 | grep -E "^test result|FAILED|failed"
git status --short
```

期望：`119 passed; 2 failed; 1 ignored`，失败的只有 `test_post_add`、`test_greet`；`git status` 里只有本计划涉及的文件。

- [ ] **提交**（需经你同意，见文首「关于提交」）

```bash
git add .env.example \
  CLAUDE.md \
  docs/superpowers/specs/2026-11-03-moment-two-way-sync-design.md \
  docs/superpowers/plans/2026-11-03-moment-two-way-sync.md \
  docs/migrations/2026-11-03-moment-two-way-sync.md
git commit -F - <<'EOF'
docs: 说说双向同步的配置说明、迁移文档与设计文档修订

.env.example 与 CLAUDE.md 补充 NOTE_SYNC_MOMENT_DIR / NOTE_SYNC_MOMENT_PUSH / NOTE_SYNC_API_BASE、
同步模块说明与端到端测试命令；设计文档修正「内容相等」的比较方式并标为已通过评审；
新增服务器迁移文档（两步上线、写回前的核对查询、回滚）。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9（可选，需要你明确同意）: 真实仓库冒烟

这一步会让后端真的读写 `Ryu2u/md_note`，并在里面产生提交。**没有你明确说「可以」就不要做。**

- [ ] **第一步：只拉取。** 确认 `.env` 里 `NOTE_SYNC_MOMENT_PUSH=false`，用 `NOTE_SYNC_ENABLED=true` 启动后端（`cargo run`），等约 10 秒的第一轮。看日志：

```text
moment_sync: MomentStats { adopted: 1, created: 0, … pushed_created: 0 … }
```

期望 `adopted: 1`（#1 与 `说说/2026_09_17_22_15.md` 配对）、`created: 0`、`pushed_*` 全为 0。若出现意料之外的 `created`，停下来看原因，不要继续。

- [ ] **第二步：打开写回。** 先在库里看会被写成文件的说说（见迁移文档第 3 节的查询）；应当只有 #2。把 `NOTE_SYNC_MOMENT_PUSH` 改成 `true`，重启后端等一轮，期望仓库里多出 `说说/2026_09_18_19_40.md` 一个提交。再等两轮，期望没有新的提交（稳定）。

- [ ] **第三步：** 在本地副本 `cd ~/Documents/md_note && git pull`，确认文件在；关闭后端。

---

## 规格覆盖对照

| 设计文档 | 对应任务 |
|---|---|
| §3 已确认的决策（双向、仓库为准、纯文本 + 可选文件头、随定时同步写回） | 全部；冲突规则见 Task 4 `pull_update` 与 Task 6 ⑦ |
| §4 架构（模块、只拉一次树、304 时仍写回、笔记过滤排除说说目录） | Task 4、5；Task 5 的 `test_filter_excludes_moment_dir_…`；Task 6 ① |
| §5 数据模型（`moment_sync_map`、两个指纹、不改 `moment` 表） | Task 1、2（`fingerprint`）；Task 4 读写整行再回写（保留点赞数）；Task 6 ② |
| §6 文件格式（文件名、文件头、图片行、空正文、往返） | Task 2 |
| §7.2 拉取规则 / §7.3 认领 / §7.4 被覆盖内容留存 | Task 2（`plan_pull`、`find_adoptee`）；Task 4；Task 6 ①②④⑥⑦ |
| §7.5 写回规则 / §7.6 崩溃安全 | Task 2（`plan_push`、`path_candidates`）；Task 4；Task 6 ③⑤⑥⑨ |
| §8 GitHub 客户端（写接口、错误模型、API 根地址） | Task 3；Task 6 ⑧ |
| §9 配置项 | Task 2（`MomentSyncConfig`、`parse_push_flag`）、Task 3（`resolve_api_base`）、Task 5（读环境变量）、Task 8（`.env.example`、`CLAUDE.md`）；Task 6 ⑩ |
| §10 前端 | Task 7 |
| §11 测试 | Task 2、3、5、6 |
| §12 验收标准 | Task 6（自动化部分）；Task 9（真实仓库部分） |
| §14 上线与运维 | Task 8（迁移文档）；Task 9 |
