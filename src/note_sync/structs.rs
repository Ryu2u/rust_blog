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

impl_select!(NoteSyncConfig {
    select_by_id(id: i32) => "`where id = #{id}`"
});

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
