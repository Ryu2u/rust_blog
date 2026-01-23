use actix_web::{get, post, web, Responder};

use crate::post::structs::Tag;
use crate::utils::parse_slug;
use crate::Exception::BadRequest;
use crate::{Exception, R};
use rbatis::RBatis;
use rbs::to_value;
use tracing::instrument;
use tracing::log::error;

pub fn tag_scope() -> actix_web::Scope {
    actix_web::web::scope("/tag")
        .service(api_tag_list)
        .service(api_tag_add)
        .service(api_tag_del)
        .service(api_tag_update)
        .service(api_get_tag_by_post_id)
}

#[instrument]
#[post("/list")]
async fn api_tag_list(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    match Tag::select_all(&**db).await {
        Ok(res) => Ok(R::ok_obj(res)),
        Err(e) => Err(Exception::BadRequest(e.to_string())),
    }
}

#[instrument]
#[post("/add")]
async fn api_tag_add(
    tag: web::Json<Tag>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match tag_check(&tag, &**db).await {
        Ok(_) => tag_add(tag.into_inner(), &**db).await,
        Err(e) => Err(e),
    }
}

#[post("/del/{id}")]
async fn api_tag_del(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match Tag::delete_by_column(&**db, "id", *id).await {
        Ok(_) => Ok(R::ok_msg("删除成功!")),
        Err(e) => {
            error!("{}", e);
            Err(BadRequest("删除失败!".to_string()))
        }
    }
}

#[post("/update")]
async fn api_tag_update(
    tag: web::Json<Tag>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
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
            error!("{}", e);
            Err(BadRequest("标签名称重复，请重试!".to_string()))
        }
    }
}

async fn tag_add(tag: Tag, db: &RBatis) -> Result<impl Responder, Exception> {
    let mut tag = tag;
    tag.slug = parse_slug(&tag.name);

    match Tag::insert(db, &tag).await {
        Ok(_) => Ok(R::ok_msg("添加成功!")),
        Err(_) => Err(Exception::BadRequest("添加失败!".to_string())),
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
            error!("{}", e);
            Err(Exception::InternalError)
        }
    }
}

#[get("/post/{id}")]
async fn api_get_tag_by_post_id(
    post_id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let tag_vec = get_tag_by_post_id(*post_id, &**db).await;

    Ok(R::<Vec<Tag>>::ok_obj(tag_vec))
}

pub async fn get_tag_by_post_id(post_id: i32, db: &RBatis) -> Vec<Tag> {
    let sql = "select b.* from PostTag as a join tag as b on a.tag_id = b.id where a.post_id = ?";
    match db
        .query_decode::<Vec<Tag>>(sql, vec![to_value!(post_id)])
        .await
    {
        Ok(vec) => vec,
        Err(_) => {
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::before_start;
    use crate::config::init_rbatis;
    use crate::post::structs::Tag;
    use crate::post::tag_apis::tag_add;

    #[tokio::test]
    async fn test_tag_add() {
        let (_, _, _, db_path) = before_start();
        let rbatis = init_rbatis(db_path).await;

        let vec = vec![
            "HTML",
            "Rust",
            "Python",
            "Linux",
            "笔记",
            "C++",
            "Git",
            "Vim",
            "计算机网络",
            "计算机操作系统",
        ];
        for i in 0..vec.len() {
            let language = vec[i];
            let tag = Tag {
                id: None,
                name: language.to_string(),
                slug: String::new(),
                description: Some(language.to_string()),
                priority: None,
            };
            tag_add(tag, &rbatis).await.unwrap();
        }
    }
}
