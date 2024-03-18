use actix_web::{post, Responder, web};
use futures_util::future::err;
use rbatis::RBatis;
use rbatis::rbdc::db::ExecResult;
use rbatis::rbdc::Error;
use rbs::to_value;
use tracing::instrument;
use tracing::log::error;
use crate::{Exception, R};
use crate::Exception::BadRequest;
use crate::post::structs::{PostTag, Tag};

pub fn tag_scope() -> actix_web::Scope {
    actix_web::web::scope("/tag")
        .service(api_tag_add)
        .service(api_tag_del)
        .service(api_tag_update)
}

#[instrument]
#[post("/add")]
async fn api_tag_add(tag: web::Json<Tag>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    tag_add(tag, db).await
}

#[post("/del/{id}")]
async fn api_tag_del(id: web::Path<i32>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    Ok(R::ok())
}

#[post("/update")]
async fn api_tag_update(tag: web::Json<Tag>, db: web::Data<RBatis>) -> Result<impl Responder,
    Exception> {
    Ok(R::ok())
}


///////////////////////////////////////////////
async fn tag_add(tag: web::Json<Tag>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    match Tag::insert(&**db, &tag).await {
        Ok(_) => {
            Ok(R::ok_msg("添加成功!"))
        }
        Err(_) => {
            Err(Exception::BadRequest("添加失败!".to_string()))
        }
    }
}


async fn get_tag_by_post_id(post_id: i32, db: &RBatis) -> Vec<Tag> {
    let sql = "select b.* from PostTag as a join tag as b on a.tag_id = b.id where a.post_id = ?";
    match db.query_decode::<Vec<Tag>>(sql, vec![to_value!(post_id)]).await {
        Ok(vec) => {

            vec
        }
        Err(_) =>{
            vec![]
        }
    }

}
