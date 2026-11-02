use crate::config::Exception;
use crate::R;
use actix_web::{get, web, Responder};
use rbatis::RBatis;
use serde::{Deserialize, Serialize};
use tracing::instrument;

/// 后台仪表盘统计
/// 口径：文章数 / 访问量 / 最近更新 均排除软删文章（is_deleted = 1）；
/// 评论不区分文章，按审核状态拆分，与 /comment/admin/counts 一致
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    pub post_count: i64,
    pub visit_count: i64,
    /// 最近一篇文章的 update_time（毫秒时间戳），没有文章时为 null
    pub last_update_time: Option<i64>,
    pub user_count: i64,
    pub comment_total: i64,
    pub comment_pending: i64,
    pub comment_approved: i64,
    pub comment_rejected: i64,
    /// 后端版本（Cargo.toml package.version），不来自 SQL
    #[serde(default)]
    pub version: String,
}

// sum(int) 在 MySQL 中是 DECIMAL，cast 成 signed 才能按 i64 解码
const STATS_SQL: &str = "select \
    (select count(*) from post where is_deleted = 0) as post_count, \
    (select cast(coalesce(sum(visits), 0) as signed) from post where is_deleted = 0) as visit_count, \
    (select max(update_time) from post where is_deleted = 0) as last_update_time, \
    (select count(*) from tb_user) as user_count, \
    (select count(*) from comment) as comment_total, \
    (select count(*) from comment where status = 0) as comment_pending, \
    (select count(*) from comment where status = 1) as comment_approved, \
    (select count(*) from comment where status = 2) as comment_rejected";

pub fn dashboard_scope() -> actix_web::Scope {
    actix_web::web::scope("/dashboard")
        // 管理员API
        .service(api_admin_stats)
}

// 管理员 - 仪表盘统计
#[instrument]
#[get("/admin/stats")]
async fn api_admin_stats(db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let mut stats: DashboardStats = db.query_decode(STATS_SQL, vec![]).await.map_err(|e| {
        tracing::error!("{}", e);
        Exception::InternalError
    })?;
    stats.version = env!("CARGO_PKG_VERSION").to_string();
    Ok(R::ok_obj(stats))
}
