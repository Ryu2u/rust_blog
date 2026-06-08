extern crate core;

use crate::middleware::{AuthFilter, FilterWhiteList};
use crate::moment::apis::moment_scope;
use crate::post::category_apis::category_scope;
use crate::post::structs::Post;
use crate::post::tag_apis::tag_scope;
use crate::user::structs::User;
use crate::comment::apis::comment_scope;
use actix_cors::Cors;
use actix_easy_multipart::MultipartFormConfig;
use actix_web::{error, web, App, HttpServer};
use config::*;
use dotenv::dotenv;
use post::apis::*;
use std::env;
use tracing::log::{error, info};
use user::apis::*;

mod config;
mod middleware;
mod post;
mod user;
mod utils;
mod comment;
mod moment;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let (server, blog_origin, admin_origin, db_path) = before_start();

    let rbatis = init_rbatis(db_path).await;

    info!("config init success!");

    // 确保数据库表已创建
    info!("database init completed!");
    HttpServer::new(move || {
        // 跨域设置
        let cors = Cors::default()
            .allowed_origin(blog_origin.as_str())
            .allowed_origin(admin_origin.as_str())
            .supports_credentials()
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allow_any_header();
        let white_list = FilterWhiteList(vec![
            "/user/login",
            "/user/get",
            "/post/get",
            "/post/page",
            "/post/list_by_category/*",
            "/category/**",
            "/comment/add",
            "/comment/list",
            "/tag/list",
            "/tag/post",
        ]);

        App::new()
            // 配置全局对象
            .app_data(web::Data::new(rbatis.clone()))
            .app_data(web::Data::new(AppState {
                app_name: "rust_blog".to_string(),
                admin_route_prefixes: vec![
                    "/post/admin",
                    "/post/add",
                    "/post/test/form",
                    "/tag/add",
                    "/tag/del",
                    "/tag/update",
                    "/comment/admin",
                    "/user/admin",
                    "/moment/admin",
                ],
            }))
            .app_data(white_list)
            // 文件上传大小限制
            .app_data(MultipartFormConfig::default().memory_limit(25 * 1024 * 1024))
            // 添加跨域配置
            .wrap(cors)
            // 添加拦截器配置
            .wrap(AuthFilter)
            .service({
                web::scope("")
                    .guard(ContentTypeGuard)
                    .service(user_scope())
                    .service(post_scope())
                    .service(tag_scope())
                    .service(category_scope())
                    .service(comment_scope())
                    .service(moment_scope())
            })
    })
    .bind(server)?
    .run()
    .await
}

/// load log and env
fn before_start() -> (String, String, String, String) {
    // init log
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_target(false)
        .pretty()
        .init();
    // init env
    dotenv().ok();

    // get ip
    let server_ip =
        env::var("SERVER_IP").expect("can't get env [SERVER_IP], please check the .env file!");
    // get port
    let server_port =
        env::var("SERVER_PORT").expect("can't get env [SERVER_PORT], please check the .env file!");

    let blog_origin =
        env::var("BLOG_ORIGIN").expect("can't get env [BLOG_ORIGIN], please check the .env file!");

    let admin_origin = env::var("ADMIN_ORIGIN")
        .expect("can't get env [ADMIN_ORIGIN], please check the .env file!");

    let db_path = env::var("DATABASE_URL")
        .expect("can't get env [DATABASE_URL], please check the .env file!");

    info!(
        "server is started by {}:{}  blog_origin:{}  admin_origin:{}",
        server_ip, server_port, blog_origin, admin_origin
    );

    (
        format!("{}:{}", server_ip, server_port),
        blog_origin,
        admin_origin,
        db_path,
    )
}
