extern crate core;

use crate::middleware::{AuthFilter, FilterWhiteList, PUBLIC_PATHS};
use crate::moment::apis::moment_scope;
use crate::post::category_apis::category_scope;
use crate::post::structs::Post;
use crate::post::tag_apis::tag_scope;
use crate::user::structs::User;
use crate::utils::login_guard::{LoginGuard, LoginGuardConfig};
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
mod cos;
mod middleware;
mod post;
mod user;
mod utils;
mod comment;
mod moment;
mod note_sync;
#[cfg(test)]
mod log_guard;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let (server, blog_origin, admin_origin, db_path) = before_start();

    let rbatis = init_rbatis(db_path).await;

    info!("config init success!");

    // 腾讯云 COS 图片直传配置：未配置或配置不合法时为 None（功能关闭，启动日志里会说明原因）
    let cos_config = web::Data::new(cos::CosConfig::from_env());

    // GitHub 笔记同步后台任务
    if env::var("NOTE_SYNC_ENABLED").unwrap_or_default() == "true" {
        info!("note_sync enabled, background task starting");
        tokio::spawn(note_sync::scheduler::start(rbatis.clone()));
    }

    // 确保数据库表已创建
    info!("database init completed!");

    // 登录限频状态必须在所有 worker 之间共享：Data 在闭包外创建，闭包内 clone（共享同一个 Arc）。
    // 若在闭包内创建，每个 worker 各有一份计数，限频阈值会被放大 worker 数倍。
    let login_guard = web::Data::new(LoginGuard::new(LoginGuardConfig::from_env()));
    // 预热「用户不存在」时用来抹平耗时的假 bcrypt 哈希，避免第一次登录多花一次哈希时间
    user::login_support::dummy_bcrypt_hash();

    HttpServer::new(move || {
        // 跨域设置
        let cors = Cors::default()
            .allowed_origin(blog_origin.as_str())
            .allowed_origin(admin_origin.as_str())
            .supports_credentials()
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allow_any_header();
        let white_list = FilterWhiteList(PUBLIC_PATHS.to_vec());

        App::new()
            // 配置全局对象
            .app_data(web::Data::new(rbatis.clone()))
            .app_data(login_guard.clone())
            .app_data(cos_config.clone())
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
                    "/note_sync/admin",
                ],
            }))
            .app_data(white_list)
            // 文件上传大小限制
            .app_data(MultipartFormConfig::default().memory_limit(25 * 1024 * 1024))
            // 中间件的执行顺序是「后注册的在最外层」：AuthFilter 先注册（内层），
            // CORS 后注册（最外层）。这样 AuthFilter 拒绝请求时返回的 401 / 403 也会带上 CORS 头；
            // 反过来的话，浏览器会把跨域的 401 当成网络错误，前端读不到状态码。
            .wrap(AuthFilter)
            // 添加跨域配置
            .wrap(cors)
            .service({
                web::scope("")
                    .guard(ContentTypeGuard)
                    .service(user_scope())
                    .service(post_scope())
                    .service(tag_scope())
                    .service(category_scope())
                    .service(comment_scope())
                    .service(moment_scope())
                    .service(note_sync::apis::note_sync_scope())
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
