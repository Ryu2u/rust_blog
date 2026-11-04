//! 说说 ↔ 仓库 `说说/` 目录的双向同步（设计文档 2026-11-03-moment-two-way-sync-design.md）。
//!
//! 上半部分是纯函数（文件名、文件格式、认领、差分规划），带单元测试；
//! 下半部分是带数据库与网络的同步阶段：先拉取（仓库为准），再写回。

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
