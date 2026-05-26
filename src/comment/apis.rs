use crate::comment::Comment;
use crate::config::Exception;
use crate::R;
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use serde::{Deserialize, Serialize};
use tracing::instrument;

#[derive(Debug, Serialize, Deserialize)]
pub struct PageInfo {
    pub page_num: Option<i32>,
    pub page_size: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommentListResult {
    pub list: Vec<Comment>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommentCounts {
    pub pending: i64,
    pub approved: i64,
    pub rejected: i64,
}

pub fn comment_scope() -> actix_web::Scope {
    actix_web::web::scope("/comment")
        // 公开API
        .service(api_comment_add)
        .service(api_comment_list)
        // 管理员API
        .service(api_admin_comment_list)
        .service(api_admin_comment_counts)
        .service(api_admin_comment_approve)
        .service(api_admin_comment_reject)
        .service(api_admin_comment_delete)
        .service(api_admin_comment_batch_approve)
        .service(api_admin_comment_batch_delete)
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
        Ok(_) => Ok(R::ok_msg("评论成功，等待审核!")),
        Err(e) => {
            tracing::error!("{}", e);
            Err(Exception::BadRequest("评论失败，请重试".to_string()))
        }
    }
}

// 公开API - 只返回已审核通过的评论
#[instrument]
#[get("/list/{post_id}")]
async fn api_comment_list(
    post_id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match Comment::select_approved_by_post_id(&**db, *post_id).await {
        Ok(vec) => Ok(R::ok_obj(vec)),
        Err(e) => {
            tracing::error!("{}", e);
            Err(Exception::BadRequest("获取评论列表失败".to_string()))
        }
    }
}

// ==================== 管理员API ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct CommentQuery {
    pub keyword: Option<String>,
    pub status: Option<i32>,
    pub post_id: Option<i32>,
    pub page_num: Option<i32>,
    pub page_size: Option<i32>,
}

// 管理员 - 分页查询评论列表
#[instrument]
#[post("/admin/list")]
async fn api_admin_comment_list(
    query: web::Json<CommentQuery>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    use crate::Post;

    let query = query.into_inner();
    let page_num = query.page_num.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(10);
    let offset = (page_num - 1) * page_size;

    // 获取所有评论进行过滤
    let all_comments = Comment::select_all(&**db).await.map_err(|e| {
        tracing::error!("Query error: {}", e);
        Exception::BadRequest("查询失败".to_string())
    })?;

    // 收集所有 post_id
    let post_ids: Vec<i32> = all_comments.iter().map(|c| c.post_id).collect();

    // 查询所有文章以获取标题
    let mut post_title_map: std::collections::HashMap<i32, String> = std::collections::HashMap::new();
    if !post_ids.is_empty() {
        let all_posts = Post::select_all(&**db).await.map_err(|e| {
            tracing::error!("Query error: {}", e);
            Exception::BadRequest("查询失败".to_string())
        })?;
        for post in all_posts {
            if let Some(id) = post.id {
                post_title_map.insert(id, post.title);
            }
        }
    }

    // 过滤并填充 post_title
    let filtered: Vec<Comment> = all_comments.into_iter().filter(|c| {
        if let Some(status) = query.status {
            if c.status.unwrap_or(0) != status {
                return false;
            }
        }
        if let Some(post_id) = query.post_id {
            if c.post_id != post_id {
                return false;
            }
        }
        if let Some(ref keyword) = query.keyword {
            if !keyword.is_empty() {
                let kw = keyword.to_lowercase();
                if !c.content.to_lowercase().contains(&kw) && !c.user_name.to_lowercase().contains(&kw) {
                    return false;
                }
            }
        }
        true
    }).map(|mut c| {
        c.post_title = post_title_map.get(&c.post_id).cloned();
        c
    }).collect();

    let total = filtered.len() as i64;

    // 分页
    let list = filtered.into_iter()
        .skip(offset as usize)
        .take(page_size as usize)
        .collect::<Vec<Comment>>();

    let result = CommentListResult { list, total };
    Ok(R::ok_obj(result))
}

// 管理员 - 评论统计
#[instrument]
#[get("/admin/counts")]
async fn api_admin_comment_counts(
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let all_comments = Comment::select_all(&**db).await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::BadRequest("查询失败".to_string())
    })?;

    let mut pending = 0i64;
    let mut approved = 0i64;
    let mut rejected = 0i64;
    for c in &all_comments {
        match c.status.unwrap_or(0) {
            0 => pending += 1,
            1 => approved += 1,
            2 => rejected += 1,
            _ => {}
        }
    }

    Ok(R::ok_obj(CommentCounts { pending, approved, rejected }))
}

// 管理员 - 审核通过评论
#[instrument]
#[post("/admin/approve/{id}")]
async fn api_admin_comment_approve(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let comments = Comment::select_by_id(&**db, *id).await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::BadRequest("查询失败".to_string())
    })?;

    if comments.is_empty() {
        return Err(Exception::NotFound);
    }

    let mut comment = comments.into_iter().next().unwrap();
    comment.status = Some(1);

    Comment::update_by_column(&**db, &comment, "id").await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::BadRequest("操作失败".to_string())
    })?;

    Ok(R::ok_msg("评论已通过"))
}

// 管理员 - 拒绝评论
#[instrument]
#[post("/admin/reject/{id}")]
async fn api_admin_comment_reject(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let comments = Comment::select_by_id(&**db, *id).await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::BadRequest("查询失败".to_string())
    })?;

    if comments.is_empty() {
        return Err(Exception::NotFound);
    }

    let mut comment = comments.into_iter().next().unwrap();
    comment.status = Some(2);

    Comment::update_by_column(&**db, &comment, "id").await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::BadRequest("操作失败".to_string())
    })?;

    Ok(R::ok_msg("评论已拒绝"))
}

// 管理员 - 删除评论
#[instrument]
#[get("/admin/del/{id}")]
async fn api_admin_comment_delete(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    Comment::delete_by_column(&**db, "id", &*id).await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::BadRequest("删除失败".to_string())
    })?;
    Ok(R::ok_msg("删除成功"))
}

// 管理员 - 批量审核通过
#[instrument]
#[post("/admin/batch/approve")]
async fn api_admin_comment_batch_approve(
    ids: web::Json<Vec<i32>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let ids = ids.into_inner();
    for id in ids {
        if let Ok(comments) = Comment::select_by_id(&**db, id).await {
            if let Some(mut comment) = comments.into_iter().next() {
                comment.status = Some(1);
                let _ = Comment::update_by_column(&**db, &comment, "id").await;
            }
        }
    }
    Ok(R::ok_msg("批量审核成功"))
}

// 管理员 - 批量删除
#[instrument]
#[post("/admin/batch/delete")]
async fn api_admin_comment_batch_delete(
    ids: web::Json<Vec<i32>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let ids = ids.into_inner();
    for id in ids {
        let _ = Comment::delete_by_column(&**db, "id", &id).await;
    }
    Ok(R::ok_msg("批量删除成功"))
}
