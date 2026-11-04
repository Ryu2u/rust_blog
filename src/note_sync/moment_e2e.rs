//! 说说双向同步的端到端测试：真实 MySQL（临时库）+ 进程内模拟的 GitHub。
//!
//! 默认不跑。会 DROP / CREATE `moment`、`moment_sync_map` 两张表，所以库名必须含 "e2e"：
//!
//! ```text
//! mysql -uroot -p -e 'create database rust_blog_e2e default charset utf8mb4'
//! E2E_DATABASE_URL='mysql://root:密码@localhost:3306/rust_blog_e2e?charset=utf8mb4' \
//!   cargo test moment_e2e -- --ignored --nocapture
//! mysql -uroot -p -e 'drop database rust_blog_e2e'
//! ```
//!
//! 所有场景放在一个测试函数里按顺序跑，避免多个测试同时清空同一个库。

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use base64::Engine;
use rbatis::RBatis;
use serde_json::json;

use crate::moment::Moment;
use crate::note_sync::derive::sha256_hex;
use crate::note_sync::github_client::{GithubClient, TreeFetch};
use crate::note_sync::moment_sync::{
    parse_name_time, render_moment, run_moment_cycle, MomentStats, MomentSyncConfig,
};
use crate::note_sync::structs::MomentSyncMap;
use crate::note_sync::sync_engine::value_to_i32;

// ---------- 进程内模拟的 GitHub ----------

#[derive(Default)]
struct Repo {
    files: BTreeMap<String, String>,
    /// 每次变更 +1，用作树的 ETag
    rev: u64,
    forbid_write: bool,
    /// 写操作的记录，如 "PUT 说说/a.md" / "DELETE 说说/a.md"，用来断言没有多余提交
    commits: Vec<String>,
}
type Shared = Arc<Mutex<Repo>>;

fn blob_sha(content: &str) -> String {
    sha256_hex(content)[..40].to_string()
}
fn b64(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(s.as_bytes())
}

async fn tree(repo: web::Data<Shared>, req: HttpRequest) -> HttpResponse {
    let r = repo.lock().unwrap();
    let etag = format!("\"{}\"", r.rev);
    if req.headers().get("if-none-match").and_then(|v| v.to_str().ok()) == Some(etag.as_str()) {
        return HttpResponse::NotModified().finish();
    }
    let entries: Vec<_> = r
        .files
        .iter()
        .map(|(p, c)| json!({ "path": p, "type": "blob", "sha": blob_sha(c), "size": c.len() }))
        .collect();
    HttpResponse::Ok()
        .insert_header(("ETag", etag))
        .json(json!({ "tree": entries, "truncated": false }))
}

async fn get_content(repo: web::Data<Shared>, path: web::Path<(String, String, String)>) -> HttpResponse {
    let (_, _, p) = path.into_inner();
    match repo.lock().unwrap().files.get(&p) {
        Some(c) => HttpResponse::Ok().json(json!({ "content": b64(c), "encoding": "base64" })),
        None => HttpResponse::NotFound().json(json!({ "message": "Not Found" })),
    }
}

async fn put_content(
    repo: web::Data<Shared>,
    path: web::Path<(String, String, String)>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let (_, _, p) = path.into_inner();
    let mut r = repo.lock().unwrap();
    if r.forbid_write {
        return HttpResponse::Forbidden()
            .json(json!({ "message": "Resource not accessible by personal access token" }));
    }
    match (r.files.get(&p), body["sha"].as_str()) {
        (Some(old), Some(sha)) if blob_sha(old) == sha => {}
        (Some(_), Some(_)) => {
            return HttpResponse::Conflict().json(json!({ "message": "does not match" }))
        }
        (Some(_), None) => {
            return HttpResponse::UnprocessableEntity().json(json!({ "message": "sha wasn't supplied" }))
        }
        (None, _) => {}
    }
    let raw = base64::engine::general_purpose::STANDARD
        .decode(body["content"].as_str().unwrap_or_default())
        .expect("valid base64");
    let content = String::from_utf8(raw).expect("utf8");
    r.files.insert(p.clone(), content.clone());
    r.rev += 1;
    r.commits.push(format!("PUT {p}"));
    HttpResponse::Ok().json(json!({ "content": { "sha": blob_sha(&content), "path": p } }))
}

async fn delete_content(
    repo: web::Data<Shared>,
    path: web::Path<(String, String, String)>,
    body: web::Json<serde_json::Value>,
) -> HttpResponse {
    let (_, _, p) = path.into_inner();
    let mut r = repo.lock().unwrap();
    if r.forbid_write {
        return HttpResponse::Forbidden()
            .json(json!({ "message": "Resource not accessible by personal access token" }));
    }
    match r.files.get(&p) {
        None => return HttpResponse::NotFound().json(json!({ "message": "Not Found" })),
        Some(old) if Some(blob_sha(old).as_str()) != body["sha"].as_str() => {
            return HttpResponse::Conflict().json(json!({ "message": "does not match" }))
        }
        Some(_) => {}
    }
    r.files.remove(&p);
    r.rev += 1;
    r.commits.push(format!("DELETE {p}"));
    HttpResponse::Ok().json(json!({ "commit": {} }))
}

async fn commits() -> HttpResponse {
    HttpResponse::Ok().json(json!([{ "sha": "c1", "commit": { "author": { "date": "2026-09-01T10:00:00Z" } } }]))
}

async fn start_mock() -> (Shared, String) {
    let repo: Shared = Arc::default();
    let data = web::Data::new(repo.clone());
    let server = HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/repos/{owner}/{repo}/git/trees/{branch}", web::get().to(tree))
            .route("/repos/{owner}/{repo}/contents/{path:.*}", web::get().to(get_content))
            .route("/repos/{owner}/{repo}/contents/{path:.*}", web::put().to(put_content))
            .route("/repos/{owner}/{repo}/contents/{path:.*}", web::delete().to(delete_content))
            .route("/repos/{owner}/{repo}/commits", web::get().to(commits))
    })
    .workers(1)
    .bind(("127.0.0.1", 0))
    .expect("bind mock github");
    let port = server.addrs()[0].port();
    actix_web::rt::spawn(server.run());
    (repo, format!("http://127.0.0.1:{port}"))
}

// ---------- 测试环境 ----------

const M1_MS: i64 = 1_789_654_500_000; // 2026_09_17_22_15
const M2_MS: i64 = 1_789_731_600_000; // 2026_09_18_19_40
const DIR: &str = "说说/";

struct Env {
    db: RBatis,
    repo: Shared,
    base: String,
    gh: GithubClient,
    cfg: MomentSyncConfig,
}

const DDL: [&str; 4] = [
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
    "DROP TABLE IF EXISTS `moment_sync_map`",
    "CREATE TABLE `moment_sync_map` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `moment_id` INT NOT NULL,
        `github_path` VARCHAR(512) NOT NULL,
        `blob_sha` CHAR(40) NOT NULL,
        `local_sha` CHAR(64) NOT NULL,
        `synced_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`),
        UNIQUE KEY `uk_moment_id` (`moment_id`),
        UNIQUE KEY `uk_github_path` (`github_path`(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];

async fn setup() -> Env {
    // 让 warn / error 日志出现在 --nocapture 的输出里（不影响断言）
    let _ = tracing_subscriber::fmt().with_max_level(tracing::Level::WARN).with_test_writer().try_init();
    let url = std::env::var("E2E_DATABASE_URL").expect("需要设置 E2E_DATABASE_URL");
    let dbname = url.rsplit('/').next().unwrap_or("").split('?').next().unwrap_or("");
    assert!(dbname.contains("e2e"), "拒绝在库名不含 e2e 的数据库上运行: {dbname}");
    let db = crate::config::init_rbatis(url).await;
    for ddl in DDL {
        db.exec(ddl, vec![]).await.expect("ddl");
    }
    let (repo, base) = start_mock().await;
    let gh = GithubClient::new("test-token", "o/r", "master").with_api_base(&base);
    let cfg = MomentSyncConfig::new(DIR, true, vec![".obsidian".into()], 1024).unwrap();
    Env { db, repo, base, gh, cfg }
}

/// 清空库和模拟仓库，换一个新的客户端（丢掉缓存的 ETag），回到干净状态
async fn reset(e: &mut Env) {
    e.db.exec("DELETE FROM moment", vec![]).await.unwrap();
    e.db.exec("DELETE FROM moment_sync_map", vec![]).await.unwrap();
    *e.repo.lock().unwrap() = Repo::default();
    e.gh = GithubClient::new("test-token", "o/r", "master").with_api_base(&e.base);
    e.cfg.push = true;
}

/// 和调度器一样：先拉一次树，再跑说说。返回 (统计, 这一轮树是否没变)
async fn cycle(e: &mut Env) -> (MomentStats, bool) {
    let entries = match e.gh.list_tree().await.expect("list_tree") {
        TreeFetch::Unchanged => None,
        TreeFetch::Changed { entries, .. } => Some(entries),
    };
    let unchanged = entries.is_none();
    (run_moment_cycle(&e.db, &mut e.gh, &e.cfg, entries.as_deref()).await, unchanged)
}

async fn add_moment(e: &Env, content: &str, created_ms: i64) -> i32 {
    let mut m = Moment::new(content.to_string(), None, 1, None);
    m.created_time = Some(created_ms);
    m.update_time = Some(created_ms);
    let r = Moment::insert(&e.db, &m).await.expect("insert moment");
    value_to_i32(&r.last_insert_id)
}
async fn all_moments(e: &Env) -> Vec<Moment> {
    Moment::select_all(&e.db).await.unwrap()
}
async fn moment_of(e: &Env, id: i32) -> Moment {
    all_moments(e).await.into_iter().find(|m| m.id == Some(id)).expect("moment exists")
}
async fn save(e: &Env, m: &Moment) {
    Moment::update_by_column(&e.db, m, "id").await.unwrap();
}
async fn maps(e: &Env) -> Vec<MomentSyncMap> {
    MomentSyncMap::select_all(&e.db).await.unwrap()
}
fn put_local(e: &Env, path: &str, content: &str) {
    let mut r = e.repo.lock().unwrap();
    r.files.insert(path.to_string(), content.to_string());
    r.rev += 1;
}
fn rm_local(e: &Env, path: &str) {
    let mut r = e.repo.lock().unwrap();
    r.files.remove(path);
    r.rev += 1;
}
fn file_of(e: &Env, path: &str) -> Option<String> {
    e.repo.lock().unwrap().files.get(path).cloned()
}
fn commits_of(e: &Env) -> Vec<String> {
    e.repo.lock().unwrap().commits.clone()
}
/// 断言这一轮什么都没发生
fn assert_quiet(s: &MomentStats, ctx: &str) {
    let all = [
        s.adopted, s.created, s.updated, s.removed, s.skipped, s.failed,
        s.pushed_created, s.pushed_updated, s.pushed_deleted,
    ];
    assert!(all.iter().all(|n| *n == 0), "{ctx}: 本应无任何操作，实际 {s:?}");
}

const P1: &str = "说说/2026_09_17_22_15.md";
const P2: &str = "说说/2026_09_18_19_40.md";
const C1: &str = "把评论审核做完了，待审核的终于不用一条条手点。";
const C2: &str = "这台机器第一次编译 actix-web 花了 30 秒，之后就都是秒级了。";

#[actix_web::test]
#[ignore = "需要 E2E_DATABASE_URL 指向库名含 e2e 的临时库"]
async fn moment_e2e_scenarios() {
    let mut e = setup().await;

    // ① 首轮：#1 被认领（不重复创建），#2 被写成文件；之后再跑不再有任何操作
    reset(&mut e).await;
    let id1 = add_moment(&e, C1, M1_MS).await;
    let id2 = add_moment(&e, C2, M2_MS).await;
    put_local(&e, P1, C1); // 和你仓库里现有的文件一样：纯文本、没有结尾换行
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.adopted, s.created, s.pushed_created, s.failed), (1, 0, 1, 0), "① {s:?}");
    assert_eq!(all_moments(&e).await.len(), 2, "① 不能重复创建说说");
    assert_eq!(maps(&e).await.len(), 2);
    assert_eq!(file_of(&e, P2).as_deref(), Some(format!("{C2}\n").as_str()), "① #2 的文件内容");
    assert_eq!(file_of(&e, P1).as_deref(), Some(C1), "① 不能改写你手写的文件");
    assert_eq!(commits_of(&e), vec![format!("PUT {P2}")]);
    let (s, unchanged) = cycle(&mut e).await; // 我们自己的提交让树变了，这一轮会重新拉取
    assert!(!unchanged);
    assert_quiet(&s, "① 第二轮");
    let (s, unchanged) = cycle(&mut e).await;
    assert!(unchanged, "① 第三轮树没变（304）");
    assert_quiet(&s, "① 第三轮");
    assert_eq!(commits_of(&e).len(), 1, "① 稳定后不能有多余提交");

    // ② 仓库里改文件 → 库里更新；点赞数不变；之后不会被写回
    let mut m1 = moment_of(&e, id1).await;
    m1.likes = 5;
    save(&e, &m1).await;
    put_local(&e, P1, "我改了这一条\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "② {s:?}");
    let m1 = moment_of(&e, id1).await;
    assert_eq!((m1.content.as_str(), m1.likes), ("我改了这一条", 5), "② 点赞数要保留");
    assert_quiet(&cycle(&mut e).await.0, "② 之后");
    assert_eq!(commits_of(&e).len(), 1, "② 没有写回");

    // ③ 后台改说说 → 下一轮文件被更新（树没变时也要写回）
    let mut m2 = moment_of(&e, id2).await;
    m2.content = "后台改过的第二条".into();
    m2.location = Some("南京".into());
    m2.is_public = 0;
    save(&e, &m2).await;
    let (s, unchanged) = cycle(&mut e).await;
    assert!(unchanged, "③ 此时树没变，写回阶段仍然要跑");
    assert_eq!(s.pushed_updated, 1, "③ {s:?}");
    assert_eq!(
        file_of(&e, P2).as_deref(),
        Some("---\nlocation: 南京\npublic: false\n---\n后台改过的第二条\n")
    );
    assert_quiet(&cycle(&mut e).await.0, "③ 之后");

    // ④ 仓库里新增文件 → 新建说说：规范文件名 / 不规范文件名 / 带文件头与图片
    put_local(&e, "说说/2026_09_20_08_05.md", "新增的一条\n");
    put_local(&e, "说说/随想.md", "文件名不规范\n");
    put_local(
        &e,
        "说说/2026_09_21_09_00.md",
        "---\nlocation: 上海\npublic: false\n---\n私密的一条\n\n![](http://a/1.jpg)\n![](http://a/2.jpg)\n",
    );
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created, s.failed), (3, 0, 0), "④ {s:?}");
    let ms = all_moments(&e).await;
    let find = |c: &str| ms.iter().find(|m| m.content == c).unwrap_or_else(|| panic!("缺少说说 {c}"));
    assert_eq!(find("新增的一条").created_time, parse_name_time("说说/2026_09_20_08_05.md"));
    assert_eq!(
        find("文件名不规范").created_time,
        Some(chrono::DateTime::parse_from_rfc3339("2026-09-01T10:00:00Z").unwrap().timestamp_millis()),
        "④ 不规范文件名取最后一次提交时间"
    );
    let p = find("私密的一条");
    assert_eq!((p.is_public, p.location.as_deref()), (0, Some("上海")));
    assert_eq!(p.images.as_deref(), Some("[\"http://a/1.jpg\",\"http://a/2.jpg\"]"));
    let before = commits_of(&e).len();
    assert_quiet(&cycle(&mut e).await.0, "④ 之后");
    assert_eq!(commits_of(&e).len(), before, "④ 新建的说说不能被回写");

    // ⑤ 后台新发 → 新建文件；同一分钟重名时加秒数
    let a = add_moment(&e, "同一分钟的第一条", M2_MS + 60_000 * 3 + 10_000).await;
    let b = add_moment(&e, "同一分钟的第二条", M2_MS + 60_000 * 3 + 20_000).await;
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.pushed_created, s.failed), (2, 0), "⑤ {s:?}");
    assert_eq!(file_of(&e, "说说/2026_09_18_19_43.md").as_deref(), Some("同一分钟的第一条\n"));
    assert_eq!(file_of(&e, "说说/2026_09_18_19_43_20.md").as_deref(), Some("同一分钟的第二条\n"));
    assert_quiet(&cycle(&mut e).await.0, "⑤ 之后");
    let _ = (a, b);

    // ⑥ 删除：仓库删文件 → 说说软删；后台删说说 → 仓库文件被删；后台删了但仓库同时改了 → 恢复
    reset(&mut e).await;
    let x = add_moment(&e, "仓库里会被删的", M1_MS).await;
    let y = add_moment(&e, "后台会被删的", M2_MS).await;
    let z = add_moment(&e, "后台删了但仓库改了", M2_MS + 60_000 * 5).await;
    assert_eq!(cycle(&mut e).await.0.pushed_created, 3);
    let (px, py, pz) = ("说说/2026_09_17_22_15.md", P2, "说说/2026_09_18_19_45.md");

    rm_local(&e, px);
    let (s, _) = cycle(&mut e).await;
    assert_eq!(s.removed, 1, "⑥ {s:?}");
    assert_eq!(moment_of(&e, x).await.is_deleted, Some(1));
    assert_eq!(maps(&e).await.len(), 2);

    let mut my = moment_of(&e, y).await;
    my.is_deleted = Some(1);
    save(&e, &my).await;
    let (s, _) = cycle(&mut e).await;
    assert_eq!(s.pushed_deleted, 1, "⑥ {s:?}");
    assert!(file_of(&e, py).is_none(), "⑥ 仓库文件应已删除");
    assert!(commits_of(&e).contains(&format!("DELETE {py}")));

    let mut mz = moment_of(&e, z).await;
    mz.is_deleted = Some(1);
    save(&e, &mz).await;
    put_local(&e, pz, "仓库里改过\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_deleted), (1, 0), "⑥ {s:?}");
    let mz = moment_of(&e, z).await;
    assert_eq!((mz.is_deleted, mz.content.as_str()), (Some(0), "仓库里改过"), "⑥ 仓库为准：恢复并更新");
    assert!(file_of(&e, pz).is_some(), "⑥ 文件不能被删");
    assert_quiet(&cycle(&mut e).await.0, "⑥ 之后");

    // ⑦ 两边都改了同一条 → 仓库为准，后台那份不会被写回
    reset(&mut e).await;
    let id = add_moment(&e, "原文", M1_MS).await;
    assert_eq!(cycle(&mut e).await.0.pushed_created, 1);
    let mut m = moment_of(&e, id).await;
    m.content = "后台改的".into();
    save(&e, &m).await;
    put_local(&e, P1, "仓库改的\n");
    let before = commits_of(&e).len();
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "⑦ {s:?}");
    assert_eq!(moment_of(&e, id).await.content, "仓库改的", "⑦ 仓库为准");
    assert_eq!(file_of(&e, P1).as_deref(), Some("仓库改的\n"));
    assert_eq!(commits_of(&e).len(), before, "⑦ 后台的版本不能写回");
    assert_quiet(&cycle(&mut e).await.0, "⑦ 之后");

    // ⑧ 令牌没有写权限(403)：写回在第一次被拒后就停止、拉取照常；权限恢复后补上
    reset(&mut e).await;
    add_moment(&e, "没有写权限时新发的", M1_MS).await;
    add_moment(&e, "没有写权限时新发的第二条", M1_MS + 3 * 60_000).await;
    e.repo.lock().unwrap().forbid_write = true;
    put_local(&e, P2, "拉取不受影响\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created), (1, 0), "⑧ {s:?}");
    assert_eq!(s.failed, 1, "⑧ 第一次 403 之后就该停止，不能每条都再试一遍: {s:?}");
    assert!(file_of(&e, P1).is_none());
    e.repo.lock().unwrap().forbid_write = false;
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.pushed_created, s.failed), (2, 0), "⑧ 恢复后补写: {s:?}");
    assert_eq!(file_of(&e, P1).as_deref(), Some("没有写权限时新发的\n"));
    assert_eq!(
        file_of(&e, "说说/2026_09_17_22_18.md").as_deref(),
        Some("没有写权限时新发的第二条\n")
    );

    // ⑨ 崩溃恢复：三种「已提交到 GitHub、但映射没来得及更新」的状态都能收敛，且不记误导性覆盖
    reset(&mut e).await;
    //   (a) 新建：文件已在仓库，映射缺失 → 认领，不重复创建
    let a = add_moment(&e, "崩溃前已写出的", M1_MS).await;
    let text_a = render_moment(&moment_of(&e, a).await);
    put_local(&e, P1, &text_a);
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.adopted, s.created, s.pushed_created), (1, 0, 0), "⑨a {s:?}");
    assert_eq!(all_moments(&e).await.len(), 1);
    assert!(commits_of(&e).is_empty());
    //   (b) 更新：仓库文件已是新内容(== 库里渲染)，映射还是旧的 → 只刷新映射，不改说说、不提交
    let mut ma = moment_of(&e, a).await;
    ma.content = "崩溃前已更新的".into();
    save(&e, &ma).await;
    put_local(&e, P1, &render_moment(&ma));
    let update_time_before = moment_of(&e, a).await.update_time;
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (0, 0), "⑨b {s:?}");
    assert_eq!(moment_of(&e, a).await.update_time, update_time_before);
    assert!(commits_of(&e).is_empty());
    assert_quiet(&cycle(&mut e).await.0, "⑨b 之后");
    //   (c) 删除：文件已删、说说已软删，映射还在 → 只清理映射
    let mut ma = moment_of(&e, a).await;
    ma.is_deleted = Some(1);
    save(&e, &ma).await;
    rm_local(&e, P1);
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.removed, s.pushed_deleted, s.failed), (1, 0, 0), "⑨c {s:?}");
    assert!(maps(&e).await.is_empty());
    assert!(commits_of(&e).is_empty());

    // ⑩ NOTE_SYNC_MOMENT_PUSH=false：只拉取，不写回
    reset(&mut e).await;
    e.cfg.push = false;
    add_moment(&e, "不应写回", M1_MS).await;
    put_local(&e, P2, "只拉取\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created), (1, 0), "⑩ {s:?}");
    assert!(file_of(&e, P1).is_none());
    assert!(commits_of(&e).is_empty());
    e.cfg.push = true;

    // ⑪ 仓库文件里删掉图片行 / 位置 → 库里真的清掉，且不会被写回仓库（仓库为准）。
    //    rbatis 的 update_by_column 会跳过值为 None 的列：只改内存里的结构体，库里会留着旧值，
    //    指纹也和库里的数据对不上，下一轮就把旧的图片行写回仓库文件，用户的删除被还原。
    reset(&mut e).await;
    put_local(&e, P1, "---\nlocation: 上海\n---\n有图也有位置\n\n![](http://a/1.jpg)\n![](http://a/2.jpg)\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.created, s.pushed_created, s.failed), (1, 0, 0), "⑪ {s:?}");
    let id = all_moments(&e).await[0].id.unwrap();
    let m = moment_of(&e, id).await;
    assert_eq!(m.images.as_deref(), Some(r#"["http://a/1.jpg","http://a/2.jpg"]"#));
    assert_eq!(m.location.as_deref(), Some("上海"));
    //   (a) 删掉图片行：库里的图片清空，位置保留，仓库文件保持用户改的样子
    let only_location = "---\nlocation: 上海\n---\n有图也有位置\n";
    put_local(&e, P1, only_location);
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "⑪a {s:?}");
    let m = moment_of(&e, id).await;
    assert_eq!((m.images.as_deref(), m.location.as_deref()), (None, Some("上海")), "⑪a 图片应被清空");
    assert_eq!(file_of(&e, P1).as_deref(), Some(only_location), "⑪a 不能把图片行写回仓库");
    assert!(commits_of(&e).is_empty(), "⑪a 不能有任何写回: {:?}", commits_of(&e));
    assert_quiet(&cycle(&mut e).await.0, "⑪a 之后");
    //   (b) 再删掉位置：位置清空
    put_local(&e, P1, "有图也有位置\n");
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "⑪b {s:?}");
    let m = moment_of(&e, id).await;
    assert_eq!((m.images.as_deref(), m.location.as_deref()), (None, None), "⑪b 位置应被清空");
    assert_eq!(file_of(&e, P1).as_deref(), Some("有图也有位置\n"), "⑪b 不能把位置写回仓库");
    assert!(commits_of(&e).is_empty(), "⑪b 不能有任何写回: {:?}", commits_of(&e));
    assert_quiet(&cycle(&mut e).await.0, "⑪b 之后");
    //   (c) 再加回来：图片和位置都能写进去
    let back = "---\nlocation: 北京\n---\n有图也有位置\n\n![](http://a/3.jpg)\n";
    put_local(&e, P1, back);
    let (s, _) = cycle(&mut e).await;
    assert_eq!((s.updated, s.pushed_updated), (1, 0), "⑪c {s:?}");
    let m = moment_of(&e, id).await;
    assert_eq!((m.images.as_deref(), m.location.as_deref()), (Some(r#"["http://a/3.jpg"]"#), Some("北京")), "⑪c");
    assert_eq!(file_of(&e, P1).as_deref(), Some(back));
    assert!(commits_of(&e).is_empty(), "⑪c 不能有任何写回: {:?}", commits_of(&e));
    assert_quiet(&cycle(&mut e).await.0, "⑪c 之后");
}
