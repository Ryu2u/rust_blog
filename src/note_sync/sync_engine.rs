use std::collections::HashSet;
use rbatis::RBatis;
use tracing::{error, info, warn};

use crate::note_sync::ai_client::{self, AiSettings};
use crate::note_sync::derive::{sha256_hex, word_count};
use crate::note_sync::github_client::GithubClient;
use crate::note_sync::moment_sync::MomentSyncConfig;
use crate::note_sync::structs::{AiMeta, NoteSyncConfig, NoteSyncMap};
use crate::post::structs::{Category, Post, PostCategory, PostTag, Tag};
use crate::utils::md_to_html;
use crate::utils::time_utils::get_sys_time;

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

/// 新同步进来的文章：**一律展示**（is_view = 1）。
/// 展示与否不由 AI 决定：AI 的公开性判定只记录在映射表里（ai_is_view / ai_reason）供追溯，
/// 不影响展示；只有在后台手动设置才能取消展示。
pub fn new_post_from_sync(author: &str, content: &str, meta: &AiMeta, commit_ms: Option<i64>) -> Post {
    let mut post = Post::new(
        meta.title.clone(),
        author.to_string(),
        content.to_string(),
        md_to_html(content),
        word_count(content),
        Some(meta.summary.clone()),
    );
    post.is_view = 1;
    if let Some(ms) = commit_ms {
        post.created_time = Some(ms);
        post.update_time = Some(ms);
    }
    post
}

/// 把本轮同步到的内容与 AI 元数据应用到已有文章上。
/// `is_view` 刻意不动：展示与否只由后台手动设置决定，同步与 AI 判定都不能改它；
/// 标题仍受「后台手改过就不覆盖」的保护（merged_title）。
pub fn updated_post_from_sync(mut p: Post, content: &str, meta: &AiMeta, old_ai_title: &str, now: i64) -> Post {
    p.title = merged_title(&p.title, old_ai_title, &meta.title);
    p.original_content = content.to_string();
    p.format_content = md_to_html(content);
    p.summary = Some(meta.summary.clone());
    p.word_count = Some(word_count(content));
    p.update_time = Some(now);
    p
}

// ==================== apply 层（DB 编排 + AI 集成）====================

#[derive(Default, Debug)]
pub struct SyncStats {
    pub created: u32,
    pub updated: u32,
    pub deleted: u32,
    pub resurrected: u32,
    pub skipped: u32,
    pub failed: u32,
    pub ai_fallback: u32,
}

#[derive(Clone)]
pub struct SyncPlan {
    pub repo: String,
    pub branch: String,
    pub token: String,
    pub root: String,
    pub exclude_dirs: Vec<String>,
    pub max_kb: i64,
    pub author: String,
    pub category: String,
    pub allow_http: bool,
    pub enc_key: String,
    /// 说说双向同步的配置；None = 关闭（NOTE_SYNC_MOMENT_DIR 留空）
    pub moment: Option<MomentSyncConfig>,
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

    let maps = NoteSyncMap::select_all(db).await.unwrap_or_default();
    let deleted_posts = Post::select_by_column(db, "is_deleted", 1).await.unwrap_or_default();
    // 已软删 post 且在映射表中的 id 集合（两次 collect 到具名 HashSet 再交集）
    let deleted_set: HashSet<i32> = deleted_posts.iter().filter_map(|p| p.id).collect();
    let mapped_set: HashSet<i32> = maps.iter().map(|m| m.post_id).collect();
    let deleted_ids: HashSet<i32> = deleted_set.intersection(&mapped_set).copied().collect();

    let categories = list_category_names(db).await;
    let actions = plan_actions(&filtered, &maps, &deleted_ids);
    stats.skipped = (filtered.len().saturating_sub(
        actions.iter().filter(|a| !matches!(a, SyncAction::SoftDelete { .. })).count())) as u32;
    let total = actions.len();

    info!("note_sync: plan {:?} -> {} actions (filtered {} files)",
        format!("{:?}", plan.repo), total, filtered.len());

    for (i, action) in actions.into_iter().enumerate() {
        let r = match action {
            SyncAction::Create { path, blob_sha } =>
                apply_create(db, &mut *gh, plan, ai.as_ref(), &path, &blob_sha, &categories, &mut stats).await,
            SyncAction::Update { map_id, post_id, path, blob_sha } =>
                apply_update(db, &mut *gh, plan, ai.as_ref(), map_id, post_id, &path, &blob_sha, &categories, &mut stats).await,
            SyncAction::Resurrect { map_id, post_id, path, blob_sha } =>
                apply_resurrect(db, &mut *gh, plan, ai.as_ref(), map_id, post_id, &path, &blob_sha, &categories, &mut stats).await,
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
        if (i + 1) % 10 == 0 { info!("note_sync: 进度 {}/{}", i + 1, total); }
    }
    info!("note_sync: 本轮完成 created={} updated={} deleted={} resurrected={} skipped={} failed={}",
        stats.created, stats.updated, stats.deleted, stats.resurrected, stats.skipped, stats.failed);
    stats
}

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
            let c = Category {
                id: None,
                name: name.to_string(),
                slug: crate::utils::parse_slug(name),
                description: None,
                priority: Some(0),
                parent_id: None,
            };
            let _ = Category::insert(db, &c).await;
            Category::select_by_column(db, "name", name).await.unwrap_or_default()
                .into_iter().next().and_then(|c| c.id).unwrap_or(0)
        }
    };
    if cat_id > 0 {
        // 存在性检查：默认分类与 AI 分类同名时不重复插 PostCategory
        let linked = PostCategory::select_by_column(db, "post_id", post_id).await.unwrap_or_default();
        if linked.iter().any(|pc| pc.category_id == cat_id) {
            return;
        }
        let _ = PostCategory::insert(db, &PostCategory { id: None, post_id, category_id: cat_id }).await;
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
                let t = Tag {
                    id: None,
                    name: n.to_string(),
                    slug: crate::utils::parse_slug(n),
                    description: None,
                    priority: Some(0),
                };
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

/// ExecResult.last_insert_id（rbs::Value，MySQL 驱动回填 u64）转 i32；不识别返回 0
pub(crate) fn value_to_i32(v: &rbs::Value) -> i32 {
    match v {
        rbs::Value::I32(x) => *x,
        rbs::Value::I64(x) => *x as i32,
        rbs::Value::U32(x) => *x as i32,
        rbs::Value::U64(x) => *x as i32,
        _ => 0,
    }
}

async fn apply_create(
    db: &RBatis,
    gh: &mut GithubClient,
    plan: &SyncPlan,
    ai: Option<&AiSettings>,
    path: &str,
    blob_sha: &str,
    categories: &[String],
    stats: &mut SyncStats,
) -> Result<String, String> {
    let content = gh.get_file(path).await.map_err(|e| { error!("{}", e); path.to_string() })?;
    let commit_ms = gh.last_commit_ms(path).await.unwrap_or(None);
    let (meta, fb) = meta_for(ai, path, &content, categories).await;
    if fb { stats.ai_fallback += 1; }

    let post = new_post_from_sync(&plan.author, &content, &meta, commit_ms);
    // 首选 last_insert_id（无歧义）；驱动未回填时兜底按 title+正文精确反查
    let mut post_id = match Post::insert(db, &post).await {
        Ok(r) => value_to_i32(&r.last_insert_id),
        Err(_) => return Err(path.to_string()),
    };
    if post_id == 0 {
        post_id = Post::select_by_column(db, "title", &meta.title).await.ok()
            .and_then(|v| v.into_iter().find(|p| p.original_content == content)
                .and_then(|p| p.id))
            .unwrap_or(0);
    }
    if post_id == 0 { return Err(path.to_string()); }

    let _ = PostCategory::delete_by_column(db, "post_id", post_id).await;
    ensure_category_and_link(db, post_id, &plan.category).await;
    ensure_category_and_link(db, post_id, &meta.category).await;
    relink_tags(db, post_id, &meta.tags).await;

    let m = NoteSyncMap {
        id: None,
        github_path: path.to_string(),
        blob_sha: blob_sha.to_string(),
        local_sha: sha256_hex(&content),
        post_id,
        ai_title: meta.title.clone(),
        ai_is_view: meta.public as i32,
        ai_reason: if meta.public { String::new() } else { meta.reason.clone() },
        last_commit_time: commit_ms,
        synced_at: get_sys_time(),
        status: "ok".into(),
    };
    if NoteSyncMap::insert(db, &m).await.is_err() { return Err(path.to_string()); }
    Ok("created".into())
}

async fn apply_update(
    db: &RBatis,
    gh: &mut GithubClient,
    plan: &SyncPlan,
    ai: Option<&AiSettings>,
    map_id: i32,
    post_id: i32,
    path: &str,
    blob_sha: &str,
    categories: &[String],
    stats: &mut SyncStats,
) -> Result<String, String> {
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
    let (meta, fb) = meta_for(ai, path, &content, categories).await;
    if fb { stats.ai_fallback += 1; }

    let old_ai_title = map_field(db, map_id, "ai_title").await.unwrap_or_default();
    // is_view 不动：展示与否只由后台手动设置决定（见 updated_post_from_sync）
    let p = updated_post_from_sync(post, &content, &meta, &old_ai_title, get_sys_time());
    if Post::update_by_column(db, &p, "id").await.is_err() { return Err(path.to_string()); }

    // 分类重建：默认分类 + AI 分类（同名时 ensure_category_and_link 内部去重）
    let _ = PostCategory::delete_by_column(db, "post_id", post_id).await;
    ensure_category_and_link(db, post_id, &plan.category).await;
    ensure_category_and_link(db, post_id, &meta.category).await;
    relink_tags(db, post_id, &meta.tags).await;

    exec_update_map(db, map_id, path, blob_sha, &content, &meta).await;
    Ok("updated".into())
}

async fn apply_resurrect(
    db: &RBatis,
    gh: &mut GithubClient,
    plan: &SyncPlan,
    ai: Option<&AiSettings>,
    map_id: i32,
    post_id: i32,
    path: &str,
    blob_sha: &str,
    categories: &[String],
    stats: &mut SyncStats,
) -> Result<String, String> {
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
        apply_update(db, gh, plan, ai, map_id, post_id, path, blob_sha, categories, stats).await?;
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
// rbatis 4.5 query_decode 标量白名单路径：字符串列解 Option<String>，
// 整型列解 Option<i32>（rbs 不支持 I32 -> String 反序列化），均为首行首列。
async fn current_local_sha(db: &RBatis, map_id: i32) -> String {
    map_field(db, map_id, "local_sha").await.unwrap_or_default()
}
async fn map_field(db: &RBatis, map_id: i32, field: &str) -> Option<String> {
    let sql = format!("select {} from note_sync_map where id = ?", field);
    db.query_decode::<Option<String>>(&sql, vec![rbs::to_value!(map_id)]).await.ok().flatten()
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
             rbs::to_value!(&meta.title), rbs::to_value!(meta.public as i32),
             rbs::to_value!(if meta.public { String::new() } else { meta.reason.clone() }),
             rbs::to_value!(now), rbs::to_value!(map_id)]).await;
    let _ = path; // path 用于日志时可取
}

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
        let out = filter_entries(&es, "笔记/", &[], &[], 1024);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "笔记/Rust/axum.md");
    }
    #[test]
    fn test_filter_excludes_dirs_and_oversize() {
        let es = vec![entry("笔记/.obsidian/x.md", "a", 10), entry("笔记/.trash/y.md", "b", 10),
            entry("笔记/big.md", "c", 2048 * 1024), entry("笔记/ok.md", "d", 10)];
        let out = filter_entries(&es, "笔记/", &[".obsidian", ".trash"], &[], 1024);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "笔记/ok.md");
    }

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

    // ---- 展示状态：同步与 AI 都不能决定，只有后台手动设置才能取消展示 ----
    fn ai_meta(public: bool) -> AiMeta {
        AiMeta {
            title: "AI 标题".into(),
            summary: "摘要".into(),
            tags: vec![],
            category: "c".into(),
            public,
            reason: if public { String::new() } else { "含内网 IP".into() },
        }
    }
    fn existing_post(is_view: i32) -> Post {
        let mut p = Post::new(
            "手工标题".into(), "hai".into(), "旧正文".into(), "<p>旧正文</p>".into(), 3, Some("旧摘要".into()),
        );
        p.is_view = is_view;
        p
    }

    #[test]
    fn test_new_synced_post_is_always_shown() {
        for public in [true, false] {
            let p = new_post_from_sync("hai", "# 标题\n正文", &ai_meta(public), Some(1_700_000_000_000));
            assert_eq!(p.is_view, 1, "AI 判定 public={public} 时，新同步的文章也必须展示");
        }
        let p = new_post_from_sync("hai", "正文", &ai_meta(true), Some(42));
        assert_eq!((p.created_time, p.update_time), (Some(42), Some(42)), "沿用 GitHub 提交时间");
    }

    #[test]
    fn test_update_never_changes_visibility() {
        // 后台手动隐藏过的文章，AI 觉得可公开也不能把它放出来
        assert_eq!(updated_post_from_sync(existing_post(0), "新正文", &ai_meta(true), "", 9).is_view, 0);
        // 展示中的文章，AI 觉得敏感也不能把它藏起来
        assert_eq!(updated_post_from_sync(existing_post(1), "新正文", &ai_meta(false), "", 9).is_view, 1);
    }

    #[test]
    fn test_update_applies_content_and_keeps_manual_title() {
        let p = updated_post_from_sync(existing_post(1), "# 新\n正文", &ai_meta(true), "AI 旧标题", 777);
        assert_eq!(p.original_content, "# 新\n正文");
        assert_eq!(p.summary.as_deref(), Some("摘要"));
        assert_eq!(p.update_time, Some(777));
        assert!(p.format_content.contains("<h1"), "正文要重新渲染成 HTML");
        assert_eq!(p.title, "手工标题", "后台手改过的标题仍受保护");
    }
}
