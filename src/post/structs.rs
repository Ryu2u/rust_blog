use crate::utils::time_utils::get_sys_time;
use actix_easy_multipart::tempfile::Tempfile;
use actix_easy_multipart::text::Text;
use actix_easy_multipart::MultipartForm;
use rbatis::{crud, impl_select, RBatis};
use serde::{Deserialize, Serialize};

/// http form 传值测试
#[derive(Debug, MultipartForm)]
pub struct FileForm {
    pub title: Option<Text<String>>,
    pub num: Text<i32>,
    pub file: Tempfile,
}

/// 文章实体对象
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Post {
    pub id: Option<i32>,
    pub title: String,
    pub author: String,
    pub is_view: i32,
    pub original_content: String,
    pub format_content: String,
    pub summary: Option<String>,
    pub cover_img: Option<String>,
    pub visits: Option<i32>,
    pub disallow_comment: Option<i32>,
    pub password: Option<String>,
    pub top_priority: Option<i32>,
    pub likes: Option<i32>,
    pub word_count: Option<i32>,
    pub created_time: Option<i64>,
    pub update_time: Option<i64>,
}

impl Post {
    /// 构造函数
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
            cover_img: None,
            visits: Some(0),
            disallow_comment: Some(1),
            password: None,
            top_priority: Some(0),
            likes: Some(0),
            word_count: Some(word_count),
            created_time: Some(created_time),
            update_time: Some(created_time),
        }
    }

    /// 查询 文章的数量
    pub async fn count_all(db: &RBatis) -> i32 {
        db.query_decode("select count(*) as count from post", vec![])
            .await
            .unwrap()
    }
}
crud!(Post {});

// 根据id 获取文章
impl_select!(
    Post{
        select_by_id(id:i32) => "`where id = #{id}`"
    }
);

// 分页获取 已展示 的文章
impl_select!(
    Post{
        select_page(offset:i32,size: i32) => "`where is_view = 1 limit ${offset} , #{size}`"
    }
);

// 分页查询所有的文章 (需要登录)
impl_select!(
    Post{
        select_page_admin(offset:i32,size: i32) => "`limit ${offset} , #{size}`"
    }
);

// 根据 title 字段查询文章， title 不能重复
impl_select!(
    Post{
        select_by_title(title:String) => "`where title = #{title}` limit 1"
    }
);

/// 分页 实体对象
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PageInfo<T>
where
    T: Serialize,
{
    pub page_num: i32,
    pub page_size: i32,
    pub total: i32,
    pub list: Option<Vec<T>>,
}
