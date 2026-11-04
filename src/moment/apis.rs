use crate::config::Exception;
use crate::moment::{parse_images, serialize_images, Moment};
use crate::post::structs::PageInfo;
use crate::utils::time_utils::get_sys_time;
use crate::R;
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use serde::{Deserialize, Serialize};
use tracing::instrument;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentPayload {
    pub id: Option<i32>,
    pub content: String,
    pub images: Option<Vec<String>>,
    pub is_public: i32,
    pub location: Option<String>,
    pub likes: Option<i32>,
    pub comments: Option<i32>,
    pub created_time: Option<i64>,
    pub update_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MomentPageQuery {
    pub page_num: i32,
    pub page_size: i32,
    pub keyword: Option<String>,
}

/// 公开说说分页入参（未登录可访问；多余字段如 total / list 会被忽略）
#[derive(Debug, Clone, Deserialize)]
pub struct PublicMomentPageQuery {
    pub page_num: i32,
    pub page_size: i32,
}

/// 公开说说响应：只下发展示字段，不含 is_public / update_time / 点赞评论计数
#[derive(Debug, Clone, Serialize)]
pub struct PublicMoment {
    pub id: Option<i32>,
    pub content: String,
    pub images: Vec<String>,
    pub location: Option<String>,
    pub created_time: Option<i64>,
}

/// 公开分页单页条数上限（接口无需登录，必须限制单次查询规模）
const PUBLIC_PAGE_SIZE_MAX: i32 = 50;

pub fn moment_scope() -> actix_web::Scope {
    actix_web::web::scope("/moment")
        .service(api_moment_list_page)
        .service(api_admin_moment_list_page)
        .service(api_admin_moment_get)
        .service(api_admin_moment_add)
        .service(api_admin_moment_update)
        .service(api_admin_moment_delete)
        .service(api_admin_moment_toggle_public)
}

fn to_payload(moment: Moment) -> MomentPayload {
    MomentPayload {
        id: moment.id,
        content: moment.content,
        images: Some(parse_images(moment.images)),
        is_public: moment.is_public,
        location: moment.location,
        likes: Some(moment.likes),
        comments: Some(moment.comments),
        created_time: moment.created_time,
        update_time: moment.update_time,
    }
}

/// 公开分页入参校验，返回 SQL offset。
/// 非正数会让 limit 为负 → SQL 语法错误 500；乘法溢出同理，统一按 400 拒绝。
fn public_page_offset(page_num: i32, page_size: i32) -> Result<i32, Exception> {
    if page_num < 1 || !(1..=PUBLIC_PAGE_SIZE_MAX).contains(&page_size) {
        return Err(Exception::BadRequest(format!(
            "page_num 必须为正整数，page_size 必须在 1~{} 之间",
            PUBLIC_PAGE_SIZE_MAX
        )));
    }
    (page_num - 1)
        .checked_mul(page_size)
        .ok_or_else(|| Exception::BadRequest("page_num 过大".to_string()))
}

fn to_public(moment: Moment) -> PublicMoment {
    PublicMoment {
        id: moment.id,
        content: moment.content,
        images: parse_images(moment.images),
        location: moment.location,
        created_time: moment.created_time,
    }
}

/// 公开说说分页（无需登录）：只返回公开且未删除的说说。
/// skip(db)：避免 instrument 把含数据库口令的连接对象写进日志。
#[instrument(skip(db))]
#[post("/page")]
async fn api_moment_list_page(
    query: web::Json<PublicMomentPageQuery>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let offset = public_page_offset(query.page_num, query.page_size)?;

    let total = Moment::count_public(&**db).await;
    let rows = Moment::select_page_public(&**db, offset, query.page_size)
        .await
        .map_err(|_| Exception::InternalError)?;

    let page = PageInfo {
        page_num: query.page_num,
        page_size: query.page_size,
        total,
        list: Some(rows.into_iter().map(to_public).collect::<Vec<_>>()),
    };
    Ok(R::ok_obj(page))
}

#[instrument]
#[post("/admin/list/page")]
async fn api_admin_moment_list_page(
    query: web::Json<MomentPageQuery>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let page_num = if query.page_num <= 0 { 1 } else { query.page_num };
    let page_size = if query.page_size <= 0 { 10 } else { query.page_size };
    let offset = (page_num - 1) * page_size;
    let keyword = query.keyword.as_deref();

    let total = Moment::count_all(&**db, keyword).await;
    let rows = Moment::select_page(&**db, offset, page_size, keyword)
        .await
        .map_err(|_| Exception::InternalError)?;

    let page = PageInfo {
        page_num,
        page_size,
        total,
        list: Some(rows.into_iter().map(to_payload).collect()),
    };
    Ok(R::ok_obj(page))
}

#[instrument]
#[get("/admin/get/{id}")]
async fn api_admin_moment_get(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let mut rows = Moment::select_by_id(&**db, *id)
        .await
        .map_err(|_| Exception::InternalError)?;
    if rows.is_empty() {
        return Err(Exception::NotFound);
    }
    Ok(R::ok_obj(to_payload(rows.pop().unwrap())))
}

#[instrument]
#[post("/admin/add")]
async fn api_admin_moment_add(
    payload: web::Json<MomentPayload>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    if payload.content.trim().is_empty() {
        return Err(Exception::BadRequest("说说内容不能为空".to_string()));
    }

    let moment = Moment::new(
        payload.content.clone(),
        serialize_images(payload.images.clone()),
        payload.is_public,
        payload.location.clone(),
    );

    Moment::insert(&**db, &moment)
        .await
        .map_err(|_| Exception::BadRequest("发布失败，请重试".to_string()))?;
    Ok(R::<()>::ok_msg("发布成功"))
}

#[instrument]
#[post("/admin/update")]
async fn api_admin_moment_update(
    payload: web::Json<MomentPayload>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let Some(id) = payload.id else {
        return Err(Exception::BadRequest("说说不存在".to_string()));
    };
    if payload.content.trim().is_empty() {
        return Err(Exception::BadRequest("说说内容不能为空".to_string()));
    }

    let mut rows = Moment::select_by_id(&**db, id)
        .await
        .map_err(|_| Exception::InternalError)?;
    if rows.is_empty() {
        return Err(Exception::NotFound);
    }

    let mut moment = rows.pop().unwrap();
    moment.content = payload.content.clone();
    moment.images = serialize_images(payload.images.clone());
    moment.is_public = payload.is_public;
    moment.location = payload.location.clone();
    moment.update_time = Some(get_sys_time());

    Moment::update_by_column(&**db, &moment, "id")
        .await
        .map_err(|_| Exception::BadRequest("更新失败，请重试".to_string()))?;
    Ok(R::<()>::ok_msg("更新成功"))
}

#[instrument]
#[get("/admin/del/{id}")]
async fn api_admin_moment_delete(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let mut rows = Moment::select_by_id(&**db, *id)
        .await
        .map_err(|_| Exception::InternalError)?;
    if rows.is_empty() {
        return Err(Exception::NotFound);
    }

    let mut moment = rows.pop().unwrap();
    moment.is_deleted = Some(1);
    moment.update_time = Some(get_sys_time());
    Moment::update_by_column(&**db, &moment, "id")
        .await
        .map_err(|_| Exception::BadRequest("删除失败，请重试".to_string()))?;
    Ok(R::<()>::ok_msg("删除成功"))
}

#[instrument]
#[post("/admin/toggle/public/{id}")]
async fn api_admin_moment_toggle_public(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let mut rows = Moment::select_by_id(&**db, *id)
        .await
        .map_err(|_| Exception::InternalError)?;
    if rows.is_empty() {
        return Err(Exception::NotFound);
    }

    let mut moment = rows.pop().unwrap();
    moment.is_public = if moment.is_public == 1 { 0 } else { 1 };
    moment.update_time = Some(get_sys_time());
    Moment::update_by_column(&**db, &moment, "id")
        .await
        .map_err(|_| Exception::BadRequest("状态更新失败".to_string()))?;
    Ok(R::<()>::ok_msg("状态已更新"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(images: Option<&str>) -> Moment {
        Moment::new(
            "今天天气不错".to_string(),
            images.map(|v| v.to_string()),
            1,
            Some("南京".to_string()),
        )
    }

    #[test]
    fn public_offset_accepts_valid_pages() {
        assert_eq!(public_page_offset(1, 10).ok(), Some(0));
        assert_eq!(public_page_offset(3, 20).ok(), Some(40));
        assert_eq!(public_page_offset(1, PUBLIC_PAGE_SIZE_MAX).ok(), Some(0));
    }

    #[test]
    fn public_offset_rejects_bad_input() {
        for (num, size) in [(0, 10), (-1, 10), (1, 0), (1, -5), (1, PUBLIC_PAGE_SIZE_MAX + 1)] {
            assert!(
                matches!(public_page_offset(num, size), Err(Exception::BadRequest(_))),
                "page_num={num} page_size={size} 应被拒绝"
            );
        }
        // (page_num - 1) * page_size 溢出 i32
        assert!(matches!(
            public_page_offset(i32::MAX, PUBLIC_PAGE_SIZE_MAX),
            Err(Exception::BadRequest(_))
        ));
    }

    #[test]
    fn to_public_parses_images_and_keeps_display_fields() {
        let m = to_public(sample(Some(r#"["a.png","b.png"]"#)));
        assert_eq!(m.content, "今天天气不错");
        assert_eq!(m.images, vec!["a.png".to_string(), "b.png".to_string()]);
        assert_eq!(m.location.as_deref(), Some("南京"));
    }

    #[test]
    fn to_public_tolerates_missing_or_broken_images() {
        assert!(to_public(sample(None)).images.is_empty());
        assert!(to_public(sample(Some("not json"))).images.is_empty());
    }

    #[test]
    fn public_response_omits_internal_fields() {
        let json = serde_json::to_string(&to_public(sample(None))).unwrap();
        for field in ["is_public", "is_deleted", "update_time", "likes", "comments"] {
            assert!(!json.contains(field), "公开响应不应包含 {field}：{json}");
        }
    }
}
