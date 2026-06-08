use crate::config::Exception;
use crate::moment::Moment;
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

pub fn moment_scope() -> actix_web::Scope {
    actix_web::web::scope("/moment")
        .service(api_admin_moment_list_page)
        .service(api_admin_moment_get)
        .service(api_admin_moment_add)
        .service(api_admin_moment_update)
        .service(api_admin_moment_delete)
        .service(api_admin_moment_toggle_public)
}

fn parse_images(images: Option<String>) -> Vec<String> {
    images
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

fn serialize_images(images: Option<Vec<String>>) -> Option<String> {
    let values = images.unwrap_or_default();
    if values.is_empty() {
        None
    } else {
        serde_json::to_string(&values).ok()
    }
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
