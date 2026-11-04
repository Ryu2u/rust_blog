pub mod apis;
#[cfg(test)]
mod upload_e2e;

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

    /// 统计公开说说总数（公开且未软删）
    pub async fn count_public(db: &rbatis::RBatis) -> i32 {
        db.query_decode(
            "select count(*) as count from moment where is_public = 1 and is_deleted = 0",
            vec![],
        )
        .await
        .unwrap_or(0)
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

/// 图片列的 JSON 数组 → 列表；NULL / 坏 JSON 都得到空列表
pub fn parse_images(images: Option<String>) -> Vec<String> {
    images
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
}

/// 列表 → 图片列的 JSON 数组；空列表存 NULL
pub fn serialize_images(images: Option<Vec<String>>) -> Option<String> {
    let values = images.unwrap_or_default();
    if values.is_empty() {
        None
    } else {
        serde_json::to_string(&values).ok()
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

// 公开分页：仅公开且未软删，按发布时间倒序（id 兜底保证翻页顺序确定）
impl_select!(
    Moment {
        select_page_public(offset:i32, size:i32) => "`where is_public = 1 and is_deleted = 0 \
        order by created_time desc , id desc limit #{offset} , #{size}`"
    },
    "moment"
);
