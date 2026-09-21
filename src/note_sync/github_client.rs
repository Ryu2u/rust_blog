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
    struct Commit { commit: Detail }
    #[derive(serde::Deserialize)]
    struct Detail { author: Author }
    #[derive(serde::Deserialize)]
    struct Author { date: String }
    let commits: Vec<Commit> = serde_json::from_str(json).ok()?;
    let date = commits.first()?.commit.author.date.clone();
    chrono::DateTime::parse_from_rfc3339(&date).ok().map(|d| d.timestamp_millis())
}

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
