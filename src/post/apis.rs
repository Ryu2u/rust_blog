use crate::post::structs::PageInfo;
use crate::utils::time_utils::get_sys_time;
use crate::{info, Exception, Post, R};
use actix_web::web::to;
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use rbatis::rbdc::db::ExecResult;
use rbatis::rbdc::Error;
use tracing::{instrument, span, Level};

pub fn post_scope() -> actix_web::Scope {
    actix_web::web::scope("/post")
        .service(api_post_add)
        .service(api_post_get)
        .service(api_post_list_page)
        .service(api_post_list_page_admin)
        .service(api_post_get_admin)
        .service(api_post_update)
}

#[instrument]
#[post("/add")]
async fn api_post_add(
    post: web::Json<Post>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match check_post(&**db, &post).await {
        Ok(md_html) => {
            let post = Post::new(
                post.title.clone(),
                post.author.clone(),
                post.original_content.clone(),
                md_html,
                post.format_content.len() as i32,
            );

            match Post::insert(&**db, &post).await {
                Ok(_) => {
                    Ok(R::<()>::ok_msg("添加成功!"))
                }
                Err(_) => {
                    Err(Exception::BadRequest("add post failed!".to_string()))
                }
            }
        }
        Err(e) => {
            Err(e)
        }
    }
}

#[instrument]
#[post("/page")]
async fn api_post_list_page(
    mut page_info: web::Json<PageInfo<Post>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    post_list_page(page_info, db, false).await
}

#[instrument]
#[post("/admin/list/page")]
async fn api_post_list_page_admin(
    mut page_info: web::Json<PageInfo<Post>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    post_list_page(page_info, db, true).await
}


#[instrument]
#[get("/admin/get/{id}")]
async fn api_post_get_admin(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    post_get(id, db, true).await
}

#[instrument]
#[get("/get/{id}")]
async fn api_post_get(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    post_get(id, db, false).await
}

#[instrument]
#[post("/admin/update")]
async fn api_post_update(
    mut post: web::Json<Post>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match check_post(&**db, &post).await {
        Err(e) => Err(e),
        Ok(format_str) => {
            post.format_content = format_str;
            post.update_time = Some(get_sys_time());

            match Post::update_by_column(&**db, &post, "id").await {
                Ok(_) => {
                    Ok(R::<()>::ok_msg("更新成功!"))
                }
                Err(_) => {
                    Err(Exception::BadRequest("更新失败，请重试".to_string()))
                }
            }
        }
    }
}

//////////////////////////////////////////////////////////////////////////////////////////

async fn check_post(db: &RBatis, post: &Post) -> Result<String, Exception> {
    let _ = span!(Level::DEBUG, "api_post_add");
    info!("{:?}", post);
    if post.author.len() > 100 {
        return Err(Exception::BadRequest("author is too long!".to_string()));
    }

    if let Ok(vec) = Post::select_by_title(db, post.title.clone()).await {
        if !vec.is_empty() {
            return Err(Exception::BadRequest(format!(
                "title -> [{}] is exists",
                post.title.clone()
            )));
        }
    }
    // "format md -> html"
    let md_html = markdown::to_html(post.original_content.as_str());

    Ok(md_html)
}


async fn post_list_page(mut page_info: web::Json<PageInfo<Post>>,
                        db: web::Data<RBatis>, is_admin: bool) -> Result<impl Responder, Exception> {
    let page_num = page_info.page_num;
    let page_size = page_info.page_size;
    let limit = (page_num - 1) * page_size;
    let total = Post::count_all(&**db).await;
    page_info.total = total;
    let res;
    if is_admin {
        res = Post::select_page_admin(&**db, limit, page_size).await;
    } else {
        res = Post::select_page(&**db, limit, page_size).await;
    }
    if let Ok(mut vec) = res {
        vec.iter_mut().for_each(|i| {
            i.format_content = "".to_string();
            i.original_content = "".to_string();
        });
        page_info.list = Some(vec);
        Ok(R::<PageInfo<Post>>::ok_obj(page_info.clone()))
    } else {
        Err(Exception::InternalError)
    }
}


async fn post_get(id: web::Path<i32>,
                  db: web::Data<RBatis>,
                  is_admin: bool) -> Result<impl Responder, Exception> {
    if let Ok(mut res) = Post::select_by_id(&**db, *id).await {
        if res.is_empty() {
            return Err(Exception::NotFound);
        }
        let mut post = res.pop().unwrap();

        if is_admin {
            return Ok(R::<Post>::ok_obj(post));
        }
        if post.is_view != 1 {
            return Err(Exception::NotFound);
        }

        info!("{:?}", post);
        match post.visits {
            None => {
                post.visits = Some(1);
            }
            Some(mut v) => {
                v += 1;
                post.visits = Some(v);
            }
        }
        if let Err(_) = Post::update_by_column(&**db, &post, "id").await {
            Err(Exception::BadRequest("update post failed!".to_string()))
        } else {
            Ok(R::<Post>::ok_obj(post))
        }
    } else {
        Err(Exception::InternalError)
    }
}


#[cfg(test)]
mod test {
    use crate::Post;
    use rbatis::RBatis;
    use rbdc_sqlite::SqliteDriver;
    use std::fs::{read_dir, File};
    use std::future::Future;
    use std::io::{Read, Write};
    use std::path::Path;
    use tracing_subscriber::fmt::format;

    #[tokio::test]
    async fn test_post_add() {
        let path = "E:\\MarkDown";
        // let file = File::open(Path::new(path)).await;
        let res_dir = read_dir(Path::new(path));
        match res_dir {
            Ok(dirs) => {
                for entry in dirs {
                    if let Ok(dir) = entry {
                        let file_type = dir.file_type().unwrap();
                        if file_type.is_dir() {
                            continue;
                        }
                        println!("{:?}", dir.file_name());
                        let mut file = File::open(dir.path()).unwrap();
                        let mut str = String::new();
                        file.read_to_string(&mut str).unwrap();
                        let html = markdown::to_html(&str);
                        println!("{}", html);
                        let title = dir.file_name().to_str().unwrap().to_string();
                        let author = "Ryu2u".to_string();
                        let original_content = str;
                        let format_content = html;
                        let post = Post::new(
                            title.clone(),
                            author.clone(),
                            original_content.clone(),
                            format_content.clone(),
                            original_content.len() as i32,
                        );
                        let rbatis = RBatis::new();
                        rbatis.init(SqliteDriver {}, "db/rust_blog.db").unwrap();
                        Post::insert(&rbatis, &post)
                            .await
                            .expect("insert post failed!");
                    }
                }
            }
            Err(_) => {
                panic!("can't open dir");
            }
        }
    }
}
