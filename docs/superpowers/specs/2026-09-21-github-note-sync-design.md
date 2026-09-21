# GitHub 笔记仓库自动同步 — 设计文档

- **日期**: 2026-09-21
- **状态**: 待评审
- **仓库**: `Ryu2u/md_note`（私有，默认分支 `master`，已验证 PAT 具备 Contents 读写权限）
- **修订**: v2 — 增加 AI 元数据生成层（管理后台可配置 LLM，生成标题/摘要/标签/分类）

## 1. 目标

把 GitHub 私有笔记仓库 `Ryu2u/md_note` 中 **`笔记/` 目录下**的全部 `.md` 文件自动同步为博客文章（`post` 表），并支持在管理后台编辑后推送回仓库：

- 定时轮询拉取，无人工干预
- 完全镜像语义：仓库文件更新 → 文章更新；文件删除 → 文章软删隐藏；文件恢复 → 文章复活
- 管理后台可编辑同步文章的正文并推送到 GitHub（形成 commit）

## 2. 非目标（v1 明确不做）

- 不同步 `todo/`、`草稿/`、根目录文件（含个人待办、出差报表等隐私内容）
- 不推送管理后台**新建**的文章到仓库（只回写已同步的笔记）
- 推送只改文件**内容**：后台改标题/封面/置顶等元数据仅存本地，不重命名、不新建、不移动远端文件
- 不同步图片附件（现有笔记图片均为外链 URL，正文原样保留）
- 不做 GitHub webhook（轮询已满足需求）
- 不做管理后台同步状态页面（v1 日志足够，后续可加）

## 3. 交付阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| **Phase 1 单向拉取** | 轮询 + 镜像 + 冲突保护 | `笔记/` 全部 md 变为公开文章；仓库增删改 ≤30 分钟反映到博客 |
| **Phase 2 推送层** | 后台编辑回推 + 冲突裁决 | 后台保存同步文章 → GitHub 出现 `blog-sync:` commit |

Phase 2 在 Phase 1 验证通过后叠加，共用同一套映射表与客户端。

## 4. 架构

新增后端模块 `src/note_sync/`，不改动任何现有模块的内部逻辑：

```
src/note_sync/
├── mod.rs            # 模块声明
├── structs.rs        # NoteSyncMap / NoteSyncConfig 模型、AiMeta DTO
├── github_client.rs  # 轻量 REST 客户端（列目录树/拉文件/查提交时间；Phase 2 增加写接口）
├── ai_client.rs      # OpenAI 兼容 LLM 客户端 + 严格 JSON 解析/降级（v2 新增）
├── sync_engine.rs    # 纯函数差分：(远端目录树, 本地映射表) → 动作列表 + 应用循环
└── scheduler.rs      # tokio::time::interval 轮询循环（AtomicBool 防重入）
```

- `main.rs` 在 `init_rbatis` 之后 `tokio::spawn` 后台任务；启动 10 秒后跑第一轮，此后每 `NOTE_SYNC_INTERVAL_MIN` 分钟一轮
- 新增依赖：`reqwest`（json + rustls-tls）；Phase 2 增加 `sha2`（本地内容哈希）
- 不引入定时任务框架、不引入 git 二进制依赖

## 5. 数据模型

一张新表（Phase 1 建表时列就一次到位，Phase 2 不做 ALTER）：

```sql
CREATE TABLE note_sync_map (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  github_path      VARCHAR(512) NOT NULL UNIQUE,  -- "笔记/Rust/axum.md"（相对仓库根，含目录）
  blob_sha         CHAR(40)     NOT NULL,         -- 远端文件内容指纹
  local_sha        CHAR(64)     NOT NULL DEFAULT '',  -- 上次同步成功时本地正文 SHA-256
  post_id          INT          NOT NULL,
  ai_title         VARCHAR(255) NOT NULL DEFAULT '',  -- 上次 AI 生成的标题（更新时判断后台是否改过标题）
  last_commit_time BIGINT       NULL,             -- 该文件最近一次 git 提交时间（epoch ms）
  synced_at        BIGINT       NOT NULL,
  status           VARCHAR(16)  NOT NULL DEFAULT 'ok',  -- 'ok' | 'conflicted'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`post` 表**不加任何列**（回滚只删表）。

同步创建的文章属性：

| 字段 | 值 |
|---|---|
| title | **AI 生成**（≤30 字可读标题）；AI 不可用时降级为文件名去扩展名 |
| author | `NOTE_SYNC_AUTHOR`（默认 `Ryu2u`） |
| 分类 | **AI 从现有分类中选**（prompt 附带分类名列表，也可新建）；同时固定关联默认分类「笔记」；AI 不可用时仅挂「笔记」 |
| is_view | 1（直接发布） |
| original_content | Markdown 原文（UTF-8） |
| format_content | 现有 `pulldown-cmark` 渲染的 HTML |
| summary | **AI 生成**一句话摘要（≤80 字）；降级为正文剥离 Markdown 后截 200 字符 |
| 标签 | **AI 生成** 3-5 个，自动建 tag（slug 走现有 `parse_slug`）+ PostTag 关联；降级为无标签 |
| word_count | 正文 Unicode 字符数 |
| created_time | 该文件在 GitHub 上最近一次提交时间；无记录时取当前时间 |

`visits`、`likes`、评论数等互动字段永不触碰。

### 5.1 AI 元数据层（v2 新增）

**目标**：仓库 md 无 frontmatter，用 LLM 为每篇笔记生成 title / summary / tags / category，替代文件名标题与截断摘要。

**配置存储**（DB 表，管理后台可改，不走 .env）：

```sql
CREATE TABLE note_sync_config (   -- 永远只有一行，id=1
  id          TINYINT PRIMARY KEY DEFAULT 1,
  ai_enabled  TINYINT NOT NULL DEFAULT 0,
  ai_base_url VARCHAR(255) NOT NULL DEFAULT '',
  ai_api_key  VARCHAR(255) NOT NULL DEFAULT '',
  ai_model    VARCHAR(128) NOT NULL DEFAULT '',
  updated_at  BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**管理端接口**（均需登录 + admin 角色，加入 `FilterWhiteList` 之外的同时**必须**加入 `AppState.admin_route_prefixes`）：

| 接口 | 作用 |
|---|---|
| `GET /note_sync/admin/config` | 读配置；`ai_api_key` 只返回掩码（`sk-***abc`），绝不回明文 |
| `POST /note_sync/admin/config` | 保存；key 字段为空/掩码原样时表示「不修改现有 key」 |
| `POST /note_sync/admin/ai_test` | 发一条极小测试消息，返回模型回复或错误原因 |

管理后台新增「同步设置」页：启用开关、base_url、api_key（密码框）、model、测试连接按钮、保存。

**LLM 客户端**（新增 `src/note_sync/ai_client.rs`）：

- 协议：**OpenAI 兼容** `POST {base_url}/chat/completions`，`Authorization: Bearer <key>`，`temperature: 0.2`，超时 60s
- System prompt：要求只输出 JSON——`{"title":"≤30字","summary":"≤80字","tags":["3-5个"],"category":"分类名"}`，并附现有分类名列表要求优先从中选择；正文过长时截前 6000 字符送入
- 解析：剥 ` ```json ` 围栏 → serde 反序列化为 `AiMeta` → 失败重试 1 次 → 仍失败**降级**（文件名标题 + 截断摘要 + 无标签 + 仅「笔记」分类），warn 日志；**降级不会自动重试**，直到内容再变化或后台手动修改

**触发与更新规则**：

| 场景 | AI 行为 |
|---|---|
| 新文件导入 | 全量生成四个字段 |
| 内容更新（blob_sha 变） | 重新生成 summary/tags/category；标题带保护：`note_sync_map` 新增列 `ai_title` 记录上次 AI 标题，仅当 `post.title == ai_title`（后台没改过）才替换，否则保留后台标题 |
| 删除/复活 | 不涉及 AI，复用已有元数据 |

**成本与节奏**：首次导入 132 篇 = 132 次串行 LLM 调用（约 10-20 分钟），后台执行不阻塞任何请求，每 10 篇打一条进度日志；调度器用 AtomicBool 防上一轮未跑完时重叠触发。

## 6. GitHub API 使用

基础：`Authorization: Bearer <token>`，`Accept: application/vnd.github+json`，单请求超时 15 秒。

| 操作 | 接口 | 时机 |
|---|---|---|
| 全仓库目录树 | `GET /repos/Ryu2u/md_note/git/trees/master?recursive=1` | 每轮一次；携带 `If-None-Match` ETag，304 时本轮结束、配额零消耗 |
| 拉单文件内容 | `GET /repos/Ryu2u/md_note/contents/{path}?ref=master` | 仅新增/变更文件；path 需 percent-encode（中文/空格） |
| 查文件提交时间 | `GET /repos/Ryu2u/md_note/commits?path={path}&per_page=1` | 仅新建映射时 |
| 写文件（Phase 2） | `PUT /contents/{path}` `{message, content(base64), sha}` | 后台保存同步文章时 |
| 删文件（Phase 2） | `DELETE /contents/{path}` `{message, sha}` | 后台删除同步文章并确认后 |

commit message 固定格式：`blog-sync: update 笔记/xxx.md` / `blog-sync: delete 笔记/xxx.md`。

速率预算：认证后 5000 次/小时。首轮导入 132 文件 ≈ 264 次调用（一次性）；稳态每轮 1 次且多数命中 304。

## 7. 同步算法

### 7.1 拉取（Phase 1 起）

```
每轮:
  1. GET trees(带 ETag) → 304 则结束
  2. 过滤: path 以 "笔记/" 开头 && 以 ".md" 结尾 && 排除 NOTE_SYNC_EXCLUDE_DIRS && size ≤ MAX_FILE_KB
  3. 与 note_sync_map 全表差分:
     ├─ create  : 树有、映射无 → 拉 content + 提交时间 → AI 元数据(或降级) → 插 post(含分类/标签关联) → 插映射(含 ai_title)
     ├─ update  : 都有 且 blob_sha 变了 → 见冲突检测 → 拉 content → AI 重新生成 summary/tags/category、标题按 ai_title 保护规则 → 更新内容字段与关联 → 更新映射
     ├─ soft-del: 映射有、树无 → post.is_deleted=1，映射行保留
     ├─ resurrect: 都有 且 post.is_deleted=1 → is_deleted=0，blob_sha 变了则同时更新内容
     └─ skip    : blob_sha 未变
  4. 汇总日志: created X, updated Y, deleted Z, resurrected R, skipped S, failed F
```

**冲突检测（Phase 1 即生效，保护后台编辑）**：update 动作执行前，若 `SHA256(post.original_content) ≠ map.local_sha`（本地在后台改过、尚未推送）→ **本地赢**：跳过覆盖，`map.status='conflicted'`，记警告日志。`conflicted` 的行每轮都跳过，直到 Phase 2 的裁决动作（强制推送或放弃本地）把 status 重置为 `ok`。

单文件失败（网络/解析/超限）：跳过该文件继续其余，计入 failed。

### 7.2 推送（Phase 2）

触发点：管理后台保存一篇**在映射表中**的文章（在现有 `/post/admin/update` 成功后检测 `post_id ∈ note_sync_map`，对非同步文章零影响）。

```
保存成功 → 计算 local_sha
  → PUT contents(sha=map.blob_sha)
     ├─ 200 → 更新 map.{blob_sha, local_sha, synced_at, status=ok}，前端提示已推送
     └─ 冲突(远端 sha 不匹配/409) → 本地保存已成功，前端弹窗二选一:
         · 强制覆盖: 用远端最新 sha 重推
         · 放弃本地: 拉远端内容覆盖本地文章，status 重置 ok
```

后台**删除**同步文章：确认框明示「将同时删除 GitHub 仓库中的该文件」→ 确认后 `DELETE contents` + post 软删 + 删除映射行；取消则仅本地软删（下一轮拉取会复活，符合镜像语义）。

## 8. 配置与安全

`.env` 追加：

```ini
NOTE_SYNC_ENABLED=true
NOTE_SYNC_REPO=Ryu2u/md_note
NOTE_SYNC_BRANCH=              # 留空 = GET /repos 自动探测默认分支（当前 master）
NOTE_SYNC_TOKEN=<PAT>          # fine-grained，仅 md_note 的 Contents 读写
NOTE_SYNC_INTERVAL_MIN=30
NOTE_SYNC_ROOT=笔记/           # 只同步该目录
NOTE_SYNC_EXCLUDE_DIRS=.obsidian,.trash
NOTE_SYNC_AUTHOR=Ryu2u
NOTE_SYNC_CATEGORY=笔记
NOTE_SYNC_MAX_FILE_KB=1024
```

**`.env` 治理（随本工程执行）**：`.env` 目前被提交进 git（已含 DB 密码、JWT_SECRET）。将 `.gitignore` 加入 `.env`，`git rm --cached .env`，新增不含密钥的 `.env.example`。历史泄露建议另行轮换 DB 密码与 JWT_SECRET（超出本工程范围，仅提示）。

`NOTE_SYNC_ENABLED=false` 时完全跳过模块初始化，行为与现在一致。

## 9. 错误处理

| 场景 | 行为 |
|---|---|
| 网络/5xx/限流 403 | 记 error，本轮放弃，下一轮重试；不改动任何状态 |
| 401 | error 日志明确提示「NOTE_SYNC_TOKEN 失效或过期，请更换」 |
| 单文件拉取/解析失败 | 跳过继续，计入 failed |
| 文件超大小上限 | 跳过 + warn |
| pulldown-cmark 渲染 | 该库容错设计，不会失败 |

## 10. 测试

- **单元（不联网）**：`sync_engine` 差分纯函数用 fixture 数据覆盖 create/update/soft-del/resurrect/skip/conflicted/超限/排除目录全部分支；标题、摘要、word_count 推导；path percent-encode；`ai_client` 的 JSON 解析（正常/带围栏/截断/非法 → 重试与降级路径）用 fixture 响应体测试；config 接口的 key 掩码逻辑
- **集成（手动）**：Phase 1 完成后对真实仓库跑一轮，核对 132 篇文章、AI 标题/摘要/标签/分类、时间；在 GitHub 网页上改一个文件 → ≤30 分钟本地更新；删一个文件 → 文章隐藏；管理后台配置 LLM → 测试连接 → 保存 → key 掩码回显
- **Phase 2**：后台编辑保存 → 核对 GitHub commit；构造双向同时修改 → 验证冲突弹窗两条路径

## 11. 风险与边界

- 中文文件名/目录名：API path percent-encode；MySQL utf8mb4 已兼容；`github_path` 唯一索引长度 512×4 字节需确认（必要时前缀索引）
- 仓库根目录的 `.omc/` 状态文件非 `.md`，天然排除
- 首轮导入 132 篇会瞬间填充博客列表——符合预期（就是要公开笔记）
- ETag 缓存在我们自己推送成功后失效，下一轮会重新拉树，代价一次调用，可忽略
- AI 成本与质量：132 篇首轮 LLM 调用按所选模型计费（正文截 6000 字符控制单次成本）；AI 生成质量依赖模型，标题保护规则防止覆盖人工标题；降级路径保证 AI 故障不影响同步主线
