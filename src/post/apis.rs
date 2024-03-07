use actix_web::{get,post, Responder, web};
use rbatis::RBatis;
use tracing::{instrument, Level, span};
use crate::{Exception, info, Post, R};
use crate::utils::time_utils::get_sys_time;

pub fn post_scope() -> actix_web::Scope {
    actix_web::web::scope("/post")
        .service(api_post_add)
        .service(api_post_get)
}

#[instrument]
#[post("/add")]
async fn api_post_add(post: web::Json<Post>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG,"api_post_add");
    info!("{:?}",post);
    if post.author.len() > 10 {
        return Err(Exception::BadRequest("author is too long!".to_string()));
    }

    // todo!("format content");

    let post = Post::new(post.title.clone(),
                         post.author.clone(),
                         post.original_content.clone(),
                         post.format_content.clone(),
                         post.format_content.len() as i32);

    if let Err(_) = Post::insert(&**db, &post).await {
        Err(Exception::BadRequest("add post failed!".to_string()))
    } else {
        Ok(R::<()>::ok_msg("add success".to_string()))
    }
}

#[instrument]
#[get("/get/{id}")]
async fn api_post_get(id: web::Path<i32>, db: web::Data<RBatis>) -> Result<impl Responder,
    Exception> {

    if let Ok(mut res) = Post::select_by_id(&**db,*id).await{
        if res.is_empty() {
            return Err(Exception::NotFound);
        }
        let post = res.pop().unwrap();
        info!("{:?}",post);

        Ok(R::<Post>::ok_obj(post))
    }else{
        Err(Exception::InternalError)
    }


}
