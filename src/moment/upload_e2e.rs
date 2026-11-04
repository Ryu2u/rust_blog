//! 说说图片 URL 校验的端到端测试：真实 MySQL（临时库）+ 真实的 `moment_scope()` 路由。
//!
//! 默认不跑。会 DROP / CREATE `moment` 表，所以库名必须含 "e2e"：
//!
//! ```text
//! mysql -uroot -p -e 'create database rust_blog_e2e default charset utf8mb4'
//! E2E_DATABASE_URL='mysql://root:密码@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
//!   cargo test upload_e2e -- --ignored --nocapture
//! mysql -uroot -p -e 'drop database rust_blog_e2e'
//! ```
//!
//! 这里没有登录态：测试直接挂 `moment_scope()`，不经过 `AuthFilter`（管理员鉴权由中间件负责，
//! 它对 `/moment/admin` 前缀的覆盖见 CLAUDE.md）。

use actix_web::http::StatusCode;
use actix_web::{test, web, App};
use rbatis::RBatis;
use serde_json::json;

use crate::cos::test_support::test_config;
use crate::cos::CosConfig;
use crate::moment::apis::moment_scope;
use crate::moment::{parse_images, Moment};
use crate::note_sync::sync_engine::value_to_i32;

const DDL: [&str; 2] = [
    "DROP TABLE IF EXISTS `moment`",
    "CREATE TABLE `moment` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `content` TEXT NOT NULL,
        `images` TEXT,
        `is_public` TINYINT NOT NULL DEFAULT 1,
        `location` VARCHAR(255),
        `likes` INT NOT NULL DEFAULT 0,
        `comments` INT NOT NULL DEFAULT 0,
        `created_time` BIGINT NOT NULL,
        `update_time` BIGINT,
        `is_deleted` TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

const LEGACY_1: &str = "https://legacy.example.com/a.jpg?token=1";
const LEGACY_2: &str = "https://legacy.example.com/b.png";

async fn setup() -> RBatis {
    let url = std::env::var("E2E_DATABASE_URL").expect("需要设置 E2E_DATABASE_URL");
    let dbname = url.rsplit('/').next().unwrap_or("").split('?').next().unwrap_or("");
    assert!(dbname.contains("e2e"), "拒绝在库名不含 e2e 的数据库上运行: {dbname}");
    let db = crate::config::init_rbatis(url).await;
    for ddl in DDL {
        db.exec(ddl, vec![]).await.expect("ddl");
    }
    db
}

macro_rules! app {
    ($db:expr, $cos:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($db.clone()))
                .app_data(web::Data::new($cos.clone()))
                .service(moment_scope()),
        )
        .await
    };
}

macro_rules! post_status {
    ($app:expr, $uri:expr, $body:expr) => {{
        let req = test::TestRequest::post().uri($uri).set_json($body).to_request();
        test::call_service(&$app, req).await.status()
    }};
}

async fn all_moments(db: &RBatis) -> Vec<Moment> {
    Moment::select_all(db).await.unwrap()
}

async fn images_of(db: &RBatis, id: i32) -> Vec<String> {
    let m = all_moments(db).await.into_iter().find(|m| m.id == Some(id)).expect("moment exists");
    parse_images(m.images)
}

async fn insert_legacy(db: &RBatis, images: &[&str]) -> i32 {
    let list: Vec<String> = images.iter().map(|s| s.to_string()).collect();
    let m = Moment::new("旧说说".to_string(), serde_json::to_string(&list).ok(), 1, None);
    value_to_i32(&Moment::insert(db, &m).await.expect("insert").last_insert_id)
}

#[actix_web::test]
#[ignore = "需要 E2E_DATABASE_URL 指向库名含 e2e 的临时库"]
async fn upload_e2e_scenarios() {
    // 与 moment_e2e 共用同一个临时库：串行化，避免两个测试同时 DROP / CREATE 同一张表
    let _guard = crate::config::E2E_DB_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let db = setup().await;
    let cfg: CosConfig = test_config("http://127.0.0.1:1"); // add / update 不会真的访问 COS
    let configured = Some(cfg.clone());
    let prefix = cfg.allowed_url_prefix();
    let good = |name: &str| format!("{prefix}2026/11/{name}.jpg");

    let app = app!(db, configured);

    // ① 新增：外链被拒，库里不落盘
    let status = post_status!(app, "/moment/admin/add", json!({
        "content": "带外链", "images": ["https://evil.example.com/x.jpg"], "is_public": 1
    }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "① 外链应被拒");
    assert!(all_moments(&db).await.is_empty(), "① 被拒的请求不能落盘");

    // ② 新增：上传位置下的地址通过，原样存进库
    let a = good("aaaa");
    let status = post_status!(app, "/moment/admin/add", json!({
        "content": "带图片", "images": [a], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "② 上传位置的地址应通过");
    let rows = all_moments(&db).await;
    assert_eq!(rows.len(), 1);
    let id_new = rows[0].id.unwrap();
    assert_eq!(images_of(&db, id_new).await, vec![a.clone()], "② 库里存完整 URL");

    // ③ 新增：试图借 `..` / `?` 逃出前缀被拒；超过 9 张被拒
    for bad in [format!("{prefix}../x.jpg"), format!("{prefix}a.jpg?x=1"), format!("{prefix}%2e%2e/x.jpg")] {
        let status = post_status!(app, "/moment/admin/add", json!({
            "content": "逃逸", "images": [bad], "is_public": 1
        }));
        assert_eq!(status, StatusCode::BAD_REQUEST, "③ {bad}");
    }
    let ten: Vec<String> = (0..10).map(|i| good(&format!("n{i}"))).collect();
    let status = post_status!(app, "/moment/admin/add", json!({ "content": "十张", "images": ten, "is_public": 1 }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "③ 超过 9 张");
    assert_eq!(all_moments(&db).await.len(), 1, "③ 被拒的请求不能落盘");

    // ④ 修改带旧外链的说说：保留旧链接并追加一张上传的 → 通过
    let legacy_id = insert_legacy(&db, &[LEGACY_1, LEGACY_2]).await;
    let b = good("bbbb");
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "改了正文", "images": [LEGACY_1, LEGACY_2, b], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "④");
    assert_eq!(images_of(&db, legacy_id).await, vec![LEGACY_1.to_string(), LEGACY_2.to_string(), b.clone()]);

    // ⑤ 修改时新增一个外链 → 被拒，库里保持原样
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "x", "images": [LEGACY_1, "https://evil.example.com/y.jpg"], "is_public": 1
    }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "⑤");
    assert_eq!(images_of(&db, legacy_id).await.len(), 3, "⑤ 被拒的更新不能改动图片");

    // ⑥ 只改正文、图片原样提交 → 通过（旧外链不受影响）
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "只改正文", "images": [LEGACY_1, LEGACY_2, b], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "⑥");

    // ⑦ 把图片全部删光 → 通过，旧图片真的从库里清掉。
    // rbatis 的 update_by_column 会跳过 None 列，所以这里存的是 "[]" 而不是 NULL
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": legacy_id, "content": "没图了", "images": [], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "⑦");
    let row = all_moments(&db).await.into_iter().find(|m| m.id == Some(legacy_id)).unwrap();
    assert_eq!(row.images.as_deref(), Some("[]"), "⑦ 删光图片后库里不能还留着旧图片");
    assert!(parse_images(row.images).is_empty());

    // ⑧ 没配对象存储：不带图片照常发；带新图片被拒；保留旧图片的修改仍然通过
    let unconfigured: Option<CosConfig> = None;
    let app = app!(db, unconfigured);
    let status = post_status!(app, "/moment/admin/add", json!({ "content": "纯文字", "is_public": 1 }));
    assert_eq!(status, StatusCode::OK, "⑧ 纯文字");
    let status = post_status!(app, "/moment/admin/add", json!({
        "content": "带图", "images": [a], "is_public": 1
    }));
    assert_eq!(status, StatusCode::BAD_REQUEST, "⑧ 没配置时不能新增图片");
    let keep_id = insert_legacy(&db, &[LEGACY_1]).await;
    let status = post_status!(app, "/moment/admin/update", json!({
        "id": keep_id, "content": "没配置也能改字", "images": [LEGACY_1], "is_public": 1
    }));
    assert_eq!(status, StatusCode::OK, "⑧ 保留旧图");
}
