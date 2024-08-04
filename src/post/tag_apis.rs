use actix_web::{get, post, Responder, web};

use rbatis::RBatis;


use rbs::to_value;
use tracing::instrument;
use tracing::log::error;
use crate::{Exception, R};
use crate::Exception::BadRequest;
use crate::post::structs::{Tag};
use crate::utils::parse_slug;

pub fn tag_scope() -> actix_web::Scope {
    actix_web::web::scope("/tag")
        .service(api_tag_add)
        .service(api_tag_del)
        .service(api_tag_update)
        .service(api_get_tag_by_post_id)
}

#[instrument]
#[post("/add")]
async fn api_tag_add(tag: web::Json<Tag>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    match tag_check(&tag, &**db).await {
        Ok(_) => {
            tag_add(tag, db).await
        }
        Err(e) => {
            Err(e)
        }
    }
}

#[post("/del/{id}")]
async fn api_tag_del(id: web::Path<i32>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    match Tag::delete_by_column(&**db, "id", *id).await {
        Ok(_) => {
            Ok(R::ok_msg("删除成功!"))
        }
        Err(e) => {
            error!("{}",e);
            Err(BadRequest("删除失败!".to_string()))
        }
    }
}

#[post("/update")]
async fn api_tag_update(tag: web::Json<Tag>, db: web::Data<RBatis>) -> Result<impl Responder,
    Exception> {
    tag_update(tag, &**db).await
}


///////////////////////////////////////////////
async fn tag_check(tag: &Tag, db: &RBatis) -> Result<impl Responder, Exception> {
    match Tag::select_by_column(db, "name", &tag.name).await {
        Ok(vec) => {
            if !vec.is_empty() {
                Err(BadRequest("标签名称重复，请重试!".to_string()))
            } else {
                Ok(R::ok())
            }
        }
        Err(e) => {
            error!("{}",e);
            Err(BadRequest("标签名称重复，请重试!".to_string()))
        }
    }
}


async fn tag_add(tag: web::Json<Tag>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let mut tag = tag;
    tag.slug = parse_slug(&tag.name);

    match Tag::insert(&**db, &tag).await {
        Ok(_) => {
            Ok(R::ok_msg("添加成功!"))
        }
        Err(_) => {
            Err(Exception::BadRequest("添加失败!".to_string()))
        }
    }
}

async fn tag_update(tag: web::Json<Tag>, db: &RBatis) -> Result<impl Responder, Exception> {
    if tag.id.is_none() {
        return Err(Exception::NotFound);
    }
    match Tag::select_by_name_id(db, tag.name.as_str(), tag.id.unwrap()).await {
        Ok(vec) => {
            // 判断标签名称是否重复
            if !vec.is_empty() {
                Err(Exception::BadRequest("标签名称重复，请重试!".to_string()))
                // 更新标签对象
            } else if Tag::update_by_column(db, &tag, "id").await.is_ok() {
                Ok(R::ok_msg("更新成功!"))
            } else {
                Err(Exception::InternalError)
            }
        }
        Err(e) => {
            error!("{}",e);
            Err(Exception::InternalError)
        }
    }
}

#[get("/post/{id}")]
async fn api_get_tag_by_post_id(post_id:web::Path<i32>,db:web::Data<RBatis>) -> Result<impl Responder,
    Exception>{

    let tag_vec = get_tag_by_post_id(*post_id,&**db).await;

    Ok(R::<Vec<Tag>>::ok_obj(tag_vec))
}


pub async fn get_tag_by_post_id(post_id: i32, db: &RBatis) -> Vec<Tag> {
    let sql = "select b.* from PostTag as a join tag as b on a.tag_id = b.id where a.post_id = ?";
    match db.query_decode::<Vec<Tag>>(sql, vec![to_value!(post_id)]).await {
        Ok(vec) => {
            vec
        }
        Err(_) => {
            vec![]
        }
    }
}
