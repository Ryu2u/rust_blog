use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use sha2::{Digest, Sha256};

/// RFC3986 unreserved 字符不编码
const PATH_SEG: &AsciiSet = &NON_ALPHANUMERIC.remove(b'-').remove(b'.').remove(b'_').remove(b'~');

/// 文件名去扩展名作为标题
pub fn title_from_path(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path)
        .strip_suffix(".md").unwrap_or(path).to_string()
}

/// 剥离 Markdown 语法得到纯文本（够用的朴素实现）
pub fn strip_markdown(md: &str) -> String {
    let mut out = String::new();
    let mut in_code = false;
    for line in md.lines() {
        let t = line.trim();
        if t.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        if t.starts_with('#') || t.starts_with("---") {
            continue;
        }
        out.push_str(t);
        out.push('\n');
    }
    // 去行内语法
    let mut s = out;
    s = s.replace("**", "").replace('*', "").replace('`', "");
    // 链接 [text](url) -> text，图片 ![alt](url) -> 删除
    let mut cleaned = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '!' && i + 1 < chars.len() && chars[i + 1] == '[' {
            // 图片：跳到匹配的 ')'
            if let Some(close) = chars[i..].iter().position(|&x| x == ')') {
                i += close + 1;
                continue;
            }
        }
        if c == '[' {
            if let Some(close_bracket) = chars[i..].iter().position(|&x| x == ']') {
                if chars.get(i + close_bracket + 1) == Some(&'(') {
                    if let Some(close_paren) = chars[i + close_bracket..].iter().position(|&x| x == ')') {
                        cleaned.extend(&chars[i + 1..i + close_bracket]);
                        i += close_bracket + close_paren + 1;
                        continue;
                    }
                }
            }
        }
        cleaned.push(c);
        i += 1;
    }
    cleaned.trim().to_string()
}

/// 摘要：剥Markdown后截前 limit 个字符
pub fn summarize(md: &str, limit: usize) -> String {
    let plain = strip_markdown(md);
    plain.chars().take(limit).collect()
}

/// Unicode 字符数
pub fn word_count(content: &str) -> i32 {
    content.chars().count() as i32
}

/// 每段 percent-encode（保留 / - . _ ~）
pub fn encode_path(path: &str) -> String {
    path.split('/')
        .map(|seg| utf8_percent_encode(seg, PATH_SEG).to_string())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn sha256_hex(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    let d = h.finalize();
    d.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_title_from_path() {
        assert_eq!(title_from_path("笔记/Rust/axum.md"), "axum");
        assert_eq!(title_from_path("Docker安装.md"), "Docker安装");
        assert_eq!(title_from_path("a/b/草 稿.md"), "草 稿");
    }
    #[test]
    fn test_strip_markdown() {
        let md = "# 标题\n\n正文**加粗**与`代码`。\n\n```rust\nfn x(){}\n```\n\n[链接](http://a.com)和![图](http://b.png)\n- 列表项";
        let s = strip_markdown(md);
        assert!(s.contains("正文加粗与代码。"));
        assert!(!s.contains("fn x()"));
        assert!(!s.contains("http://"));
        assert!(!s.contains('#'));
    }
    #[test]
    fn test_summarize_limit() {
        let md = "abcdefg".repeat(100);
        assert_eq!(summarize(&md, 200).chars().count(), 200);
    }
    #[test]
    fn test_word_count_unicode() {
        assert_eq!(word_count("abc中文"), 5);
    }
    #[test]
    fn test_encode_path() {
        assert_eq!(encode_path("笔记/Rust/axum.md"), "%E7%AC%94%E8%AE%B0/Rust/axum.md");
        assert_eq!(encode_path("a/草 稿.md"), "a/%E8%8D%89%20%E7%A8%BF.md");
    }
    #[test]
    fn test_sha256_hex() {
        assert_eq!(sha256_hex("abc").len(), 64);
        assert!(sha256_hex("abc").starts_with("ba7816bf"));
    }
}
