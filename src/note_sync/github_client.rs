use base64::Engine;
use crate::note_sync::derive::encode_path;
use crate::note_sync::sync_engine::TreeEntry;

pub const DEFAULT_API_BASE: &str = "https://api.github.com";

#[derive(Debug)]
pub enum GhError {
    Unauthorized(String),
    RateLimited,
    /// 写操作被拒绝且不是限流：令牌缺少 Contents 写权限
    Forbidden(String),
    /// 写操作的 sha 对不上，或新建时路径已存在（409 / 422）
    Conflict(u16),
    Network(String),
    Other(u16, String),
}

impl std::fmt::Display for GhError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GhError::Unauthorized(_) => write!(f, "NOTE_SYNC_TOKEN 失效或过期，请在 .env 更换"),
            GhError::RateLimited => write!(f, "GitHub API 限流，下轮重试"),
            GhError::Forbidden(_) => write!(f, "NOTE_SYNC_TOKEN 缺少 Contents 写权限（fine-grained PAT 需要 Contents: Read and write）"),
            GhError::Conflict(code) => write!(f, "GitHub 拒绝写入({}): 文件已被改动或路径已存在", code),
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
    api_base: String,
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
            api_base: DEFAULT_API_BASE.to_string(),
            token: token.to_string(),
            repo: repo.to_string(),
            branch_cfg: branch.to_string(),
            branch: None,
            etag: None,
        }
    }

    /// 换 API 根地址（NOTE_SYNC_API_BASE，仅供本地模拟 GitHub 做测试；先过 `resolve_api_base`）
    pub fn with_api_base(mut self, base: &str) -> Self {
        self.api_base = base.to_string();
        self
    }

    fn rate_remaining_zero(resp: &reqwest::Response) -> bool {
        resp.headers().get("x-ratelimit-remaining").and_then(|v| v.to_str().ok()) == Some("0")
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
            let url = format!("{}/repos/{}", self.api_base, self.repo);
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
        let url = format!("{}/repos/{}/git/trees/{}?recursive=1", self.api_base, self.repo, branch);
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
            self.api_base, self.repo, encode_path(path), self.branch.clone().unwrap_or_default());
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
