pub mod apis;

use crate::utils::time_utils::get_sys_time;
use rbatis::{crud, impl_select};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Moment {
    pub id: Option<i32>,
    pub content: String,
    pub images: Option<String>,
    pub is_public: i32,
    pub location: Option<String>,
    pub likes: i32,
    pub comments: i32,
    pub created_time: Option<i64>,
    pub update_time: Option<i64>,
    pub is_deleted: Option<i32>,
}

impl Moment {
    pub fn new(content: String, images: Option<String>, is_public: i32, location: Option<String>) -> Self {
        let now = get_sys_time();
        Self {
            id: None,
            content,
            images,
            is_public,
            location,
            likes: 0,
            comments: 0,
            created_time: Some(now),
            update_time: Some(now),
            is_deleted: Some(0),
        }
    }

    pub async fn count_all(db: &rbatis::RBatis, keyword: Option<&str>) -> i32 {
        let mut sql = "select count(*) as count from moment where is_deleted = 0".to_string();
        if let Some(keyword) = keyword.filter(|v| !v.trim().is_empty()) {
            let escaped = escape_sql(keyword);
            sql.push_str(&format!(" and content like '%{}%'", escaped));
        }
        db.query_decode(sql.as_str(), vec![]).await.unwrap_or(0)
    }

    pub async fn select_page(
        db: &rbatis::RBatis,
        offset: i32,
        size: i32,
        keyword: Option<&str>,
    ) -> Result<Vec<Moment>, rbatis::rbdc::Error> {
        let mut sql = "select * from moment where is_deleted = 0".to_string();
        if let Some(keyword) = keyword.filter(|v| !v.trim().is_empty()) {
            let escaped = escape_sql(keyword);
            sql.push_str(&format!(" and content like '%{}%'", escaped));
        }
        sql.push_str(&format!(" order by created_time desc limit {}, {}", offset, size));
        db.query_decode(sql.as_str(), vec![]).await
    }
}

fn escape_sql(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "''")
}

crud!(Moment {}, "moment");

impl_select!(
    Moment {
        select_by_id(id:i32) => "`where id = #{id} and is_deleted = 0`"
    },
    "moment"
);
