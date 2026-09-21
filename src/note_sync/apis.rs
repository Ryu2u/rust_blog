use crate::note_sync::ai_client;
use crate::note_sync::crypto;
use crate::note_sync::structs::NoteSyncConfig;
use crate::{Exception, R};
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use serde::{Deserialize, Serialize};
use crate::utils::time_utils::get_sys_time;
use tracing::{info, warn};
use std::sync::Mutex;
use std::time::Instant;

pub fn note_sync_scope() -> actix_web::Scope {
    actix_web::web::scope("/note_sync")
        .service(api_config_get)
        .service(api_config_save)
        .service(api_ai_test)
}

#[derive(Serialize)]
pub struct ConfigVo {
    pub ai_enabled: i32,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key_masked: String,
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct ConfigSaveDto {
    pub ai_enabled: i32,
    pub ai_base_url: String,
    pub ai_model: String,
    pub ai_api_key: Option<String>,
}

#[derive(Serialize)]
pub struct AiTestVo { pub reply: String }

pub fn mask_key(key: &str) -> String {
    let n = key.chars().count();
    if n <= 8 {
        "***".into()
    } else {
        let c: Vec<char> = key.chars().collect();
        format!("{}***{}", c[..5].iter().collect::<String>(), c[n - 4..].iter().collect::<String>())
    }
}

pub fn should_update_key(k: &Option<String>) -> bool {
    match k {
        None => false,
        Some(s) => !s.is_empty() && !s.contains("***"),
    }
}

fn enc_key() -> String {
    std::env::var("NOTE_SYNC_AI_ENC_KEY").unwrap_or_default()
}
fn allow_http() -> bool {
    std::env::var("NOTE_SYNC_AI_ALLOW_HTTP").unwrap_or_default() == "1"
}

#[get("/admin/config")]
async fn api_config_get(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let rows = NoteSyncConfig::select_by_id(&**db, 1).await
        .map_err(|_| Exception::InternalError)?;
    match rows.into_iter().next() {
        Some(c) => {
            // 先算掩码再移动字段，避免部分移动后再借用 c
            let masked = mask_plain_or_empty(&c).await;
            Ok(R::ok_obj(ConfigVo {
                ai_enabled: c.ai_enabled,
                ai_base_url: c.ai_base_url,
                ai_model: c.ai_model,
                ai_api_key_masked: masked,
                updated_at: c.updated_at,
            }))
        }
        None => Ok(R::ok_obj(ConfigVo {
            ai_enabled: 0, ai_base_url: String::new(), ai_model: String::new(),
            ai_api_key_masked: String::new(), updated_at: 0,
        })),
    }
}

async fn mask_plain_or_empty(c: &NoteSyncConfig) -> String {
    if c.ai_api_key.is_empty() { return String::new(); }
    crypto::decrypt_from_b64(&c.ai_api_key, &enc_key())
        .map(|k| mask_key(&k)).unwrap_or_else(|_| "*(解密失败)*".into())
}

#[post("/admin/config")]
async fn api_config_save(dto: web::Json<ConfigSaveDto>, db: web::Data<RBatis>)
    -> Result<impl Responder, Exception> {
    ai_client::validate_base_url(&dto.ai_base_url, allow_http())
        .map_err(Exception::BadRequest)?;
    let key = enc_key();
    if key.is_empty() {
        return Err(Exception::BadRequest("服务端未配置 NOTE_SYNC_AI_ENC_KEY".into()));
    }
    let old = NoteSyncConfig::select_by_id(&**db, 1).await.ok()
        .and_then(|v| v.into_iter().next());
    let cipher = if should_update_key(&dto.ai_api_key) {
        crypto::encrypt_to_b64(dto.ai_api_key.as_ref().unwrap(), &key)
            .map_err(Exception::BadRequest)?
    } else {
        old.as_ref().map(|o| o.ai_api_key.clone()).unwrap_or_default()
    };
    let now = get_sys_time();
    let row = NoteSyncConfig {
        id: Some(1), ai_enabled: dto.ai_enabled,
        ai_base_url: dto.ai_base_url.clone(), ai_api_key: cipher,
        ai_model: dto.ai_model.clone(), updated_at: now,
    };
    let existed = old.is_some();
    let r = if existed {
        NoteSyncConfig::update_by_column(&**db, &row, "id").await
    } else {
        NoteSyncConfig::insert(&**db, &row).await
    };
    match r {
        Ok(_) => {
            // 审计日志：只记字段名不记值
            let mut fields = vec!["ai_enabled", "ai_base_url", "ai_model"];
            if should_update_key(&dto.ai_api_key) { fields.push("ai_api_key"); }
            info!("note_sync config updated: {:?}", fields);
            Ok(R::ok_msg("保存成功!"))
        }
        Err(_) => Err(Exception::BadRequest("保存失败".into())),
    }
}

static LAST_TEST: Mutex<Option<Instant>> = Mutex::new(None);

#[post("/admin/ai_test")]
async fn api_ai_test(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    // 10 秒滑动窗限速
    {
        let mut last = LAST_TEST.lock().unwrap();
        if let Some(t) = *last {
            if t.elapsed().as_secs() < 10 {
                return Err(Exception::BadRequest("测试太频繁，请 10 秒后再试".into()));
            }
        }
        *last = Some(Instant::now());
    }
    let settings = crate::note_sync::sync_engine::load_ai_settings(&**db, &enc_key(), allow_http())
        .await.ok_or_else(|| Exception::BadRequest("AI 未启用或配置不完整".into()))?;
    let cats = vec!["测试".to_string()];
    match ai_client::extract_meta(&settings, "## 测试笔记\n这是一条连通性测试。", &cats).await {
        Ok(m) => Ok(R::ok_obj(AiTestVo { reply: format!("模型连通正常，示例标题: {}", m.title) })),
        Err(e) => { warn!("ai_test 失败: {}", e); Err(Exception::BadRequest(e)) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key() {
        assert_eq!(mask_key("sk-abcdefgh1234"), "sk-ab***1234");
        assert_eq!(mask_key("short"), "***");
        assert_eq!(mask_key(""), "***");
    }
    #[test]
    fn test_should_update_key() {
        assert!(!should_update_key(&None));
        assert!(!should_update_key(&Some(String::new())));
        assert!(!should_update_key(&Some("sk-ab***1234".into())));
        assert!(should_update_key(&Some("sk-newkey".into())));
    }
}
