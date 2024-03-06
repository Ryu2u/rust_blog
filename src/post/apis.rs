use actix_web::{post, Responder, web};
use rbatis::RBatis;
use tracing::{instrument, Level, span};
use crate::{Exception, info, Post, R};
use crate::utils::time_utils::get_sys_time;

pub fn post_scope() -> actix_web::Scope {
    actix_web::web::scope("/post")
        .service(api_post_add)
}

#[instrument]
#[post("/add")]
async fn api_post_add(post: web::Json<Post>, db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG,"api_post_add");
    info!("{:?}",post);

    todo!("format content");

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