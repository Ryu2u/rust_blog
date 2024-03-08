use std::time::{SystemTime, UNIX_EPOCH};
use rbatis::{crud, impl_select, impl_select_page, RBatis};
use serde::{Serialize, Deserialize};
use crate::utils::time_utils::get_sys_time;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Post {
    pub id: Option<i32>,
    pub title: String,
    pub author: String,
    pub is_view: i32,
    pub original_content: String,
    pub format_content: String,
    pub summary: Option<String>,
    pub visits: i32,
    pub disallow_comment: i32,
    pub password: Option<String>,
    pub top_priority: i32,
    pub likes: i32,
    pub word_count: i32,
    pub created_time: i64,
    pub update_time: i64,
}

impl Post {
    pub fn new(
        title: String,
        author: String,
        original_content: String,
        format_content: String,
        word_count: i32,
    ) -> Self {
        let created_time = get_sys_time();
        Post {
            id: None,
            title,
            author,
            is_view: 1,
            original_content,
            format_content,
            summary: None,
            visits: 0,
            disallow_comment: 0,
            password: None,
            top_priority: 0,
            likes: 0,
            word_count,
            created_time,
            update_time: created_time.clone(),
        }
    }

    pub async fn count_all(db:&RBatis) -> i32{
        let count = db.query_decode("select count(*) as count from post",vec![])
            .await.unwrap();
        count
    }


}
crud!(Post{});

impl_select!(
    Post{
        select_by_id(id:i32) => "`where id = #{id}`"
    }
);

impl_select!(
    Post{
        select_page(offset:i32,size: i32) => "`limit ${offset} , #{size}`"
    }
);


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PageInfo<T>
    where
        T: Serialize
{
    pub page_num: i32,
    pub page_size: i32,
    pub total: i32,
    pub list: Option<Vec<T>>,
}