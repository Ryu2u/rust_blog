use crate::post::structs::PageInfo;
use crate::utils::time_utils::get_sys_time;
use crate::{info, Exception, Post, R};
use actix_web::web::to;
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use tracing::{instrument, span, Level};

pub fn post_scope() -> actix_web::Scope {
    actix_web::web::scope("/post")
        .service(api_post_add)
        .service(api_post_get)
        .service(api_post_list_page)
}

#[instrument]
#[post("/add")]
async fn api_post_add(
    post: web::Json<Post>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG, "api_post_add");
    info!("{:?}", post);
    if post.author.len() > 10 {
        return Err(Exception::BadRequest("author is too long!".to_string()));
    }

    if let Ok(vec) = Post::select_by_title(&**db, post.title.clone()).await {
        if !vec.is_empty() {
            return Err(Exception::BadRequest(format!(
                "title -> [{}] is exists",
                post.title.clone()
            )));
        }
    }
    // "format md -> html"
    let md_html = markdown::to_html(post.original_content.as_str());

    let post = Post::new(
        post.title.clone(),
        post.author.clone(),
        post.original_content.clone(),
        md_html,
        post.format_content.len() as i32,
    );

    if let Err(_) = Post::insert(&**db, &post).await {
        Err(Exception::BadRequest("add post failed!".to_string()))
    } else {
        Ok(R::<()>::ok_msg("add success".to_string()))
    }
}

#[instrument]
#[post("/page")]
async fn api_post_list_page(
    mut page_info: web::Json<PageInfo<Post>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let page_num = page_info.page_num;
    let page_size = page_info.page_size;
    let limit = (page_num - 1) * page_size;
    let total = Post::count_all(&**db).await;
    page_info.total = total;
    if let Ok(vec) = Post::select_page(&**db, limit, page_size).await {
        page_info.list = Some(vec);
        Ok(R::<PageInfo<Post>>::ok_obj(page_info.clone()))
    } else {
        Err(Exception::InternalError)
    }
}

#[instrument]
#[get("/get/{id}")]
async fn api_post_get(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    if let Ok(mut res) = Post::select_by_id(&**db, *id).await {
        if res.is_empty() {
            return Err(Exception::NotFound);
        }
        let mut post = res.pop().unwrap();
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
