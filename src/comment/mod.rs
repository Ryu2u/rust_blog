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
        }
    }
}

crud!(Comment {});

impl_select!(
    Comment {
        select_by_post_id(post_id: i32) => "`where post_id = #{post_id} order by created_time desc`"
    }
);
