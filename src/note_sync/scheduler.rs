use crate::note_sync::github_client::GithubClient;
use crate::note_sync::sync_engine::{load_ai_settings, run_sync_cycle, SyncPlan};
use rbatis::RBatis;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tracing::info;

/// 重入守卫：上一轮尚未结束时本轮直接跳过（tick 周期短于单轮耗时的保险）
static RUNNING: AtomicBool = AtomicBool::new(false);

pub async fn start(db: RBatis) {
    let plan = SyncPlan {
        repo: env::var("NOTE_SYNC_REPO").unwrap_or_default(),
        branch: env::var("NOTE_SYNC_BRANCH").unwrap_or_default(),
        token: env::var("NOTE_SYNC_TOKEN").unwrap_or_default(),
        root: env::var("NOTE_SYNC_ROOT").unwrap_or_else(|_| "笔记/".into()),
        exclude_dirs: env::var("NOTE_SYNC_EXCLUDE_DIRS").unwrap_or_default()
            .split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
        max_kb: env::var("NOTE_SYNC_MAX_FILE_KB").ok().and_then(|v| v.parse().ok()).unwrap_or(1024),
        author: env::var("NOTE_SYNC_AUTHOR").unwrap_or_else(|_| "Ryu2u".into()),
        category: env::var("NOTE_SYNC_CATEGORY").unwrap_or_else(|_| "笔记".into()),
        allow_http: env::var("NOTE_SYNC_AI_ALLOW_HTTP").unwrap_or_default() == "1",
        enc_key: env::var("NOTE_SYNC_AI_ENC_KEY").unwrap_or_default(),
    };
    let interval_min: u64 = env::var("NOTE_SYNC_INTERVAL_MIN").ok()
        .and_then(|v| v.parse().ok()).unwrap_or(30);

    // 启动后 10 秒先跑一轮（错开服务启动高峰）
    tokio::time::sleep(Duration::from_secs(10)).await;
    let mut ticker = tokio::time::interval(Duration::from_secs(interval_min * 60));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    // tokio interval 首 tick 立即完成：即 sleep(10s) 后跑第一轮，之后按周期。
    // 守卫直接内联包 run_once：不用 catch_unwind+spawn 包法（避免双重计数/竞态）；
    // 残余 panic 会让本任务终止并在日志可见（parse_ai_meta 已修复主要 panic 源）。
    loop {
        ticker.tick().await;
        if RUNNING.swap(true, Ordering::SeqCst) {
            info!("note_sync: 上一轮仍在进行，跳过本轮");
            continue;
        }
        run_once(&db, &plan).await;
        RUNNING.store(false, Ordering::SeqCst);
    }
}

async fn run_once(db: &RBatis, plan: &SyncPlan) {
    let ai = load_ai_settings(db, &plan.enc_key, plan.allow_http).await;
    let mut gh = GithubClient::new(&plan.token, &plan.repo, &plan.branch);
    let stats = run_sync_cycle(db, &mut gh, plan, ai).await;
    info!("note_sync stats: {:?}", stats);
}
