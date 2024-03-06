use std::time::{SystemTime, UNIX_EPOCH};
use rbatis::crud;
use serde::{Serialize, Deserialize};

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
        let now = SystemTime::now();
        let created_time = now.duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
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
}
crud!(Post{});