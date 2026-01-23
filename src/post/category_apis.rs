use crate::config::{Exception, R};
use crate::post::structs::Category;
use actix_web::{post, web, Responder};
use rbatis::RBatis;
use tracing::instrument;

pub fn category_scope() -> actix_web::Scope {
    actix_web::web::scope("/category").service(api_category_list)
}

#[instrument]
#[post("/list")]
async fn api_category_list(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    match Category::select_all(&**db).await {
        Ok(vec) => Ok(R::ok_obj(vec)),
        Err(e) => Err(Exception::BadRequest(e.to_string())),
    }
}
