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
