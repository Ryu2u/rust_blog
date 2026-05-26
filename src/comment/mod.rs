pub mod apis;

use rbatis::{crud, impl_select};
use serde::{Deserialize, Serialize};
use crate::utils::time_utils::get_sys_time;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Comment {
    pub id: Option<i32>,
    pub post_id: i32,
    pub user_email: String,
    pub user_name: String,
    pub content: String,
    pub created_time: Option<i64>,
    pub parent_id: Option<i32>,  // 父评论ID，NULL表示顶级评论
    pub status: Option<i32>,     // 审核状态(0:待审核 1:已通过 2:已拒绝)
    // 以下字段不在数据库中，查询时关联填充
    pub post_title: Option<String>,  // 文章标题
}

impl Comment {
    pub fn new(post_id: i32, user_email: String, user_name: String, content: String, parent_id: Option<i32>) -> Self {
        Comment {
            id: None,
            post_id,
            user_email,
            user_name,
            content,
            created_time: Some(get_sys_time()),
            parent_id,
            status: Some(0),  // 默认待审核
            post_title: None,
        }
    }
}

crud!(Comment {});

// 根据id查询
impl_select!(
    Comment{
        select_by_id(id:i32) => "`where id = #{id}`"
    }
);

// 查询已审核通过的评论
impl_select!(
    Comment {
        select_approved_by_post_id(post_id: i32) => "`where post_id = #{post_id} and status = 1 order by created_time desc`"
    }
);
