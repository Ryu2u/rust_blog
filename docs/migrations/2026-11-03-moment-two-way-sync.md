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
