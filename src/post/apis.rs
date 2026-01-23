use crate::post::structs::{FileForm, PageInfo};
use crate::utils::time_utils::get_sys_time;
use crate::{info, Exception, Post, R};
use actix_easy_multipart::MultipartForm;
use std::io::Read;

use crate::config::Exception::BadRequest;
use crate::post::tag_apis::get_tag_by_post_id;
use crate::utils::md_to_html;
use actix_web::{get, post, web, Responder};
use rbatis::RBatis;
use tracing::{instrument, span, Level};

/// 文章 接口
/// api_post_add -> 文章添加
/// api_post_get -> 根据id 获取仅供展示的文章 ()
/// api_post_list_page -> 分页获取仅供展示的文章列表
/// api_post_list_page_admin -> 分页获取所有文章列表
/// api_post_list_get_admin -> 根据id获取文章
/// api_post_update -> 根据id更新文章
/// api_post_del -> 根据id删除文章(逻辑删除)
/// api_post_test -> 根据md文件添加文章
/// api_post_list_by_category -> 根据类别获取文章列表
pub fn post_scope() -> actix_web::Scope {
    actix_web::web::scope("/post")
        .service(api_post_add)
        .service(api_post_get)
        .service(api_post_list_page)
        .service(api_post_list_page_admin)
        .service(api_post_get_admin)
        .service(api_post_update)
        .service(api_post_del)
        .service(api_file_test)
        .service(api_post_list_by_category)
}

#[instrument]
#[post("/add")]
async fn api_post_add(
    post: web::Json<Post>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    match check_post(&*db, &*post).await {
        Ok(md_html) => {
            let post_new = Post::new(
                post.title.clone(),
                post.author.clone(),
                post.original_content.clone(),
                md_html,
                post.format_content.len() as i32,
                post.summary.clone(),
            );

            match Post::insert(&**db, &post_new).await {
                Ok(_) => Ok(R::ok_msg("添加成功!")),
                Err(_) => Err(Exception::BadRequest("add post failed!".to_string())),
            }
        }
        Err(e) => Err(e),
    }
}

#[instrument]
#[post("/page")]
async fn api_post_list_page(
    page_info: web::Json<PageInfo<Post>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    post_list_page(page_info, db, false).await
}

#[instrument]
#[post("/admin/list/page")]
async fn api_post_list_page_admin(
    page_info: web::Json<PageInfo<Post>>,
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
    // todo: 更新操作时，如果标题未更改应该判断成功
    match check_post(&**db, &post).await {
        Err(e) => Err(e),
        Ok(format_str) => {
            if post.id.is_none() {
                return Err(Exception::BadRequest("该文章不存在!".to_string()));
            }

            post.format_content = format_str;
            post.update_time = Some(get_sys_time());

            match Post::update_by_column(&**db, &post, "id").await {
                Ok(_) => Ok(R::ok_msg("更新成功!")),
                Err(_) => Err(Exception::BadRequest("更新失败，请重试".to_string())),
            }
        }
    }
}

#[instrument]
#[get("/admin/del/{id}")]
async fn api_post_del(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    // 判断是否存在 -> 置逻辑删除
    let res = Post::select_by_id(&**db, *id).await;
    if res.is_err() {
        return Err(Exception::NotFound);
    }
    let mut vec = res.unwrap();
    if vec.is_empty() {
        return Err(Exception::NotFound);
    }
    let mut post = vec.pop().unwrap();
    post.is_deleted = Some(1);

    if Post::update_by_column(&**db, &post, "id").await.is_err() {
        return Err(Exception::BadRequest("删除失败，请重试!".to_string()));
    }

    Ok(R::ok_msg("删除成功!"))
}

#[post("/test/form")]
pub async fn api_file_test(form: MultipartForm<FileForm>) -> Result<impl Responder, Exception> {
    let file_form = form.0;
    info!("{:?}", file_form);
    let num = file_form.num.0;
    info!("NUM : {}", num);
    let mut temp_file = file_form.file;
    match temp_file.content_type {
        None => {}
        Some(file_mime) => {
            info!("{:?}", file_mime.subtype().as_str());
            info!("{:?}", file_mime.suffix());
            info!("{:?}", file_mime);
        }
    }
    let file = temp_file.file.as_file_mut();
    info!("file len : {:?}", file.metadata());
    let mut file_content = String::new();
    match file.read_to_string(&mut file_content) {
        Ok(_) => {
            info!("{:?}", file_content);

            // let post_new = Post::new(
            //     post.title.clone(),
            //     post.author.clone(),
            //     post.original_content.clone(),
            //     md_html,
            //     post.format_content.len() as i32,
            //     post.summary.clone(),
            // );
            //
            // match Post::insert(&**db, &post_new).await {
            //     Ok(_) => Ok(R::ok_msg("添加成功!")),
            //     Err(_) => Err(Exception::BadRequest("add post failed!".to_string())),
            // }

            Ok(R::ok())
        }
        Err(_) => Ok(R::ok()),
    }
}

#[instrument]
#[post("/list_by_category/{name}")]
async fn api_post_list_by_category(
    name: web::Path<String>,
    page_info: web::Json<PageInfo<Post>>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let page_num = page_info.page_num;
    let page_size = page_info.page_size;
    let limit = (page_num - 1) * page_size;
    match Post::select_by_category(&**db, name.into_inner(), limit, page_size).await {
        Ok(vec) => Ok(R::ok_obj(vec)),
        Err(e) => Err(BadRequest(e.to_string())),
    }
}

//////////////////////////////////////////////////////////////////////////////////////////

///
/// 判断post对象是否合法
///
/// db: 数据库对象
/// post: 文章对象
///
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
    let md_html = md_to_html(post.original_content.as_str());
    Ok(md_html)
}

///
/// 根据id获取文章
/// page_info: 分页对象
/// db: 数据库对象
/// is_admin: 是否能够获取未展示的文章
///
async fn post_list_page(
    mut page_info: web::Json<PageInfo<Post>>,
    db: web::Data<RBatis>,
    is_admin: bool,
) -> Result<impl Responder, Exception> {
    let page_num = page_info.page_num;
    let page_size = page_info.page_size;
    let limit = (page_num - 1) * page_size;

    let res = if is_admin {
        page_info.total = Post::count_all(&db).await;
        Post::select_page_admin(&**db, limit, page_size).await
    } else {
        page_info.total = Post::count_view(&db).await;
        Post::select_page(&**db, limit, page_size).await
    };
    if let Ok(mut vec) = res {
        let mut iter = vec.iter_mut();
        while let Some(item) = iter.next() {
            item.format_content = "".to_string();
            item.original_content = "".to_string();
            let tag_vec = get_tag_by_post_id(item.id.unwrap(), &**db).await;
            item.tags = Some(tag_vec);
        }

        // vec.iter_mut().for_each( |item|   {
        //     // get_tag_by_post_id(item.id.unwrap(),&**db).await;
        //     item.format_content = "".to_string();
        //     item.original_content = "".to_string();
        // });
        page_info.list = Some(vec);
        Ok(R::<PageInfo<Post>>::ok_obj(page_info.clone()))
    } else {
        Err(Exception::InternalError)
    }
}

///
/// 根据id获取文章
/// id: 文章id
/// db: 数据库对象
/// is_admin: 是否能够获取未展示的文章
///
async fn post_get(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
    is_admin: bool,
) -> Result<impl Responder, Exception> {
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
        if Post::update_by_column(&**db, &post, "id").await.is_err() {
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

    use crate::utils::md_to_html;
    use std::io::Read;
    use std::path::Path;

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
                        let html = md_to_html(&str);
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
                            None,
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
