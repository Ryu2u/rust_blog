use crate::comment::Comment;
use crate::config::Exception;
use crate::R;
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use tracing::instrument;

pub fn comment_scope() -> actix_web::Scope {
    actix_web::web::scope("/comment")
        .service(api_comment_add)
        .service(api_comment_list)
}

#[instrument]
#[post("/add")]
async fn api_comment_add(
    comment: web::Json<Comment>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let comment = comment.into_inner();

    if comment.user_email.is_empty() {
        return Err(Exception::BadRequest("邮箱不能为空".to_string()));
    }
    if comment.user_name.is_empty() {
        return Err(Exception::BadRequest("用户名不能为空".to_string()));
    }
    if comment.content.is_empty() {
        return Err(Exception::BadRequest("评论内容不能为空".to_string()));
    }

    let new_comment = Comment::new(
        comment.post_id,
        comment.user_email,
        comment.user_name,
        comment.content,
        comment.parent_id,
    );

    match Comment::insert(&**db, &new_comment).await {
        Ok(_) => Ok(R::ok_msg("评论成功!")),
        Err(e) => {
            tracing::error!("{}", e);
            Err(Exception::BadRequest("评论失败，请重试".to_string()))
        }
    }
}

#[instrument]
#[get("/list/{post_id}")]
async fn api_comment_list(
    post_id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match Comment::select_by_post_id(&**db, *post_id).await {
        Ok(vec) => Ok(R::ok_obj(vec)),
        Err(e) => {
            tracing::error!("{}", e);
            Err(Exception::BadRequest("获取评论列表失败".to_string()))
        }
    }
}
