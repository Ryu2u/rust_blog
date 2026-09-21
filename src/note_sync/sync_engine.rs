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
