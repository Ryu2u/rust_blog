//! 后台提交说说时对图片 URL 的校验：新增的图片必须来自本功能的上传位置，杜绝手填外链。
//! 纯函数，不依赖数据库与网络。

use super::is_key_char;

/// 一条说说默认最多几张图
const MAX_IMAGES: usize = 9;
const MAX_URL_LEN: usize = 1024;

/// - `new`：这次提交的全部图片 URL
/// - `existing`：该说说库里已有的图片 URL（新增说说传空）
/// - `allowed_prefix`：`{public_base}/{upload_prefix}`；未配置对象存储时为 None
///
/// 规则（设计文档 §7.1）：
/// 1. 与 `existing` 中完全相同的 URL 放行（保留旧链接，含外链、仓库同步来的链接）；
/// 2. 其余视为「新」URL，必须以 `allowed_prefix` 开头，且前缀之后只能由 `[A-Za-z0-9._/-]` 组成，
///    不含 `.` / `..` 路径段，不以 `/` 结尾，整条不超过 1024 字符；
/// 3. 未配置对象存储时，任何新 URL 都不合法；
/// 4. 总数不超过 `max(9, existing.len())`：原本就超过 9 张的只许保持或减少，不许增加。
pub fn validate_image_urls(
    new: &[String],
    existing: &[String],
    allowed_prefix: Option<&str>,
) -> Result<(), String> {
    let limit = MAX_IMAGES.max(existing.len());
    if new.len() > limit {
        return Err(format!("图片最多 {limit} 张"));
    }
    for url in new {
        if existing.contains(url) {
            continue;
        }
        check_new_url(url, allowed_prefix)?;
    }
    Ok(())
}

fn check_new_url(url: &str, allowed_prefix: Option<&str>) -> Result<(), String> {
    let Some(prefix) = allowed_prefix else {
        return Err("未配置对象存储（COS_*），不能新增图片".to_string());
    };
    let not_uploaded = || format!("图片地址不是通过上传得到的：{}", shorten(url));

    if url.chars().count() > MAX_URL_LEN {
        return Err(not_uploaded());
    }
    let Some(rest) = url.strip_prefix(prefix) else {
        return Err(not_uploaded());
    };
    // 白名单而不是黑名单：空白、`?`、`#`、`%`（`%2e%2e` 会被浏览器当成 `..`）、`\`、非 ASCII 全部挡住
    let clean = !rest.is_empty()
        && !rest.ends_with('/')
        && rest.chars().all(is_key_char)
        && !rest.split('/').any(|seg| seg == "." || seg == "..");
    if clean {
        Ok(())
    } else {
        Err(not_uploaded())
    }
}

/// 出错提示里最多回显 80 个字符，避免把超长内容原样塞进响应
fn shorten(url: &str) -> String {
    let mut out: String = url.chars().take(80).collect();
    if url.chars().count() > 80 {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const PREFIX: &str = "https://img.example.com/moment/";

    fn v(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }
    fn ok(new: &[&str], existing: &[&str], prefix: Option<&str>) {
        validate_image_urls(&v(new), &v(existing), prefix).expect("应当通过");
    }
    fn err(new: &[&str], existing: &[&str], prefix: Option<&str>) -> String {
        validate_image_urls(&v(new), &v(existing), prefix).expect_err("应当被拒绝")
    }

    #[test]
    fn accepts_urls_under_the_upload_prefix() {
        ok(&[], &[], Some(PREFIX));
        ok(&["https://img.example.com/moment/2026/11/0f.jpg"], &[], Some(PREFIX));
        ok(
            &["https://img.example.com/moment/a.png", "https://img.example.com/moment/b/c-d_e.f.webp"],
            &[],
            Some(PREFIX),
        );
    }

    #[test]
    fn rejects_external_urls() {
        let msg = err(&["https://evil.example.com/x.jpg"], &[], Some(PREFIX));
        assert!(msg.starts_with("图片地址不是通过上传得到的："), "{msg}");
        for bad in [
            "http://img.example.com/moment/a.jpg",            // 协议不同
            "https://img.example.com.evil.com/moment/a.jpg",  // 前缀只是主机名的开头
            "https://img.example.com/moment-evil/a.jpg",      // 前缀只是目录名的开头
            "https://img.example.com/other/a.jpg",
            "https://evil.example.com/r/https://img.example.com/moment/a.jpg", // 前缀出现在后面
            "//img.example.com/moment/a.jpg",
            "moment/a.jpg",
            "",
        ] {
            err(&[bad], &[], Some(PREFIX));
        }
    }

    #[test]
    fn rejects_everything_new_when_storage_is_not_configured() {
        let msg = err(&["https://img.example.com/moment/a.jpg"], &[], None);
        assert!(msg.contains("未配置对象存储"), "{msg}");
        ok(&[], &[], None);
    }

    #[test]
    fn keeps_existing_urls_even_when_external_or_unconfigured() {
        let old = "https://old.example.com/pic?id=1&x=2#frag";
        ok(&[old], &[old], Some(PREFIX));
        ok(&[old], &[old], None);
        // 旧的和合法的新的混在一起
        ok(&[old, "https://img.example.com/moment/a.jpg"], &[old], Some(PREFIX));
        // 但「长得像旧的」不算旧的
        err(&["https://old.example.com/pic?id=1&x=2"], &[old], Some(PREFIX));
    }

    #[test]
    fn blocks_tricks_that_escape_the_prefix() {
        for tail in [
            "a.jpg?x=1",
            "a.jpg#x",
            "../secret.jpg",
            "a/../../secret.jpg",
            "./a.jpg",
            "a/./b.jpg",
            "%2e%2e/secret.jpg",
            "a%2Fb.jpg",
            "a\\..\\b.jpg",
            "a b.jpg",
            "a\tb.jpg",
            "a\nb.jpg",
            "中文.jpg",
            "dir/",
            "",
        ] {
            let url = format!("{PREFIX}{tail}");
            err(&[url.as_str()], &[], Some(PREFIX));
        }
    }

    #[test]
    fn rejects_overlong_urls() {
        let long_ok = format!("{PREFIX}{}", "a".repeat(MAX_URL_LEN - PREFIX.len()));
        assert_eq!(long_ok.chars().count(), MAX_URL_LEN);
        ok(&[long_ok.as_str()], &[], Some(PREFIX));
        let too_long = format!("{long_ok}a");
        let msg = err(&[too_long.as_str()], &[], Some(PREFIX));
        assert!(msg.chars().count() < 200, "提示不应回显整条超长地址: {}", msg.len());
    }

    #[test]
    fn caps_the_count_at_nine_for_new_content() {
        let urls: Vec<String> = (0..10).map(|i| format!("{PREFIX}{i}.jpg")).collect();
        let refs: Vec<&str> = urls.iter().map(String::as_str).collect();
        ok(&refs[..9], &[], Some(PREFIX));
        assert_eq!(err(&refs, &[], Some(PREFIX)), "图片最多 9 张");
    }

    #[test]
    fn legacy_over_the_cap_may_stay_or_shrink_but_not_grow() {
        let legacy: Vec<String> = (0..12).map(|i| format!("https://old.example.com/{i}.jpg")).collect();
        let legacy_refs: Vec<&str> = legacy.iter().map(String::as_str).collect();
        ok(&legacy_refs, &legacy_refs, Some(PREFIX)); // 原样保存
        ok(&legacy_refs[..5], &legacy_refs, Some(PREFIX)); // 删减
        let mut grown = legacy_refs.clone();
        grown.push("https://img.example.com/moment/new.jpg");
        assert_eq!(err(&grown, &legacy_refs, Some(PREFIX)), "图片最多 12 张");
    }

    #[test]
    fn long_url_message_is_shortened() {
        let url = format!("https://evil.example.com/{}", "x".repeat(500));
        let msg = err(&[url.as_str()], &[], Some(PREFIX));
        assert!(msg.ends_with('…'), "{msg}");
    }
}
