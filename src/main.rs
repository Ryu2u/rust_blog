extern crate core;

use actix_cors::Cors;
use actix_easy_multipart::MultipartFormConfig;
use actix_web::{error, web, App, HttpServer};
use std::env;
use actix_session::storage::CookieSessionStore;
use actix_session::SessionMiddleware;
use actix_web::cookie::Key;
use dotenv::dotenv;
use tracing::log::{error, info};
use crate::post::structs::Post;
use crate::user::structs::User;
use config::*;
use user::apis::*;
use crate::middleware::{AuthFilter, FilterWhiteList};
use post::apis::*;
use crate::post::tag_apis::tag_scope;

mod config;
mod middleware;
mod post;
mod user;
mod utils;


#[tokio::main]
async fn main() -> std::io::Result<()> {
    let (server, blog_origin, admin_origin, db_path) = before_start();

    let rbatis = init_rbatis(db_path).await;

    info!("config init success!");
    HttpServer::new(move || {
        // 跨域设置
        let cors = Cors::default()
            .allowed_origin(blog_origin.as_str())
            .allowed_origin(admin_origin.as_str())
            .supports_credentials()
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allow_any_header();
        let white_list = FilterWhiteList(vec!["/user/login", "/post/get/", "/post/page"]);

        App::new()
            // 配置全局对象
            .app_data(web::Data::new(rbatis.clone()))
            .app_data(web::Data::new(AppState {
                app_name: "rust_blog".to_string(),
            }))
            .app_data(white_list)
            // 文件上传大小限制
            .app_data(MultipartFormConfig::default().memory_limit(25 * 1024 * 1024))
            // 添加跨域配置
            .wrap(cors)
            // 添加拦截器配置
            .wrap(AuthFilter)
            .wrap(
                // create cookie based session middleware
                SessionMiddleware::builder(CookieSessionStore::default(), Key::from(&[0; 64]))
                    .cookie_secure(false)
                    .build(),
            )
            .service({
                web::scope("")
                    .guard(ContentTypeGuard)
                    .service(user_scope())
                    .service(post_scope())
                    .service(tag_scope())
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
    let server_ip = env::var("SERVER_IP")
        .expect("can't get env [SERVER_IP], please check the .env file!");
    // get port
    let server_port = env::var("SERVER_PORT")
        .expect("can't get env [SERVER_PORT], please check the .env file!");

    let blog_origin = env::var("BLOG_ORIGIN")
        .expect("can't get env [BLOG_ORIGIN], please check the .env file!");

    let admin_origin = env::var("ADMIN_ORIGIN")
        .expect("can't get env [ADMIN_ORIGIN], please check the .env file!");

    let db_path = env::var("DATABASE_URL")
        .expect("can't get env [DATABASE_URL], please check the .env file!");


    info!("server is started by {}:{}  blog_origin:{}  admin_origin:{}",server_ip, server_port,
                         blog_origin, admin_origin );

    (format!("{}:{}", server_ip, server_port), blog_origin, admin_origin, db_path)
}
