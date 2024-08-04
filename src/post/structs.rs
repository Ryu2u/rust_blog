use crate::utils::time_utils::get_sys_time;
use actix_easy_multipart::tempfile::Tempfile;
use actix_easy_multipart::text::Text;
use actix_easy_multipart::MultipartForm;
use rbatis::{crud, impl_select, RBatis};
use serde::{Deserialize, Serialize};

/// http form 传值测试
#[derive(Debug, MultipartForm)]
pub struct FileForm {
    ///  文件标题
    pub title: Option<Text<String>>,
    /// 数量?
    pub num: Text<i32>,
    /// 文件对象
    pub file: Tempfile,
}

/// 文章实体对象
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Post {
    /// 主键
    pub id: Option<i32>,
    /// 标题
    pub title: String,
    /// 作者
    pub author: String,
    /// 是否展示
    pub is_view: i32,
    /// 文章原内容
    pub original_content: String,
    /// 文章转换为html 后的内容
    pub format_content: String,
    /// 摘要
    pub summary: Option<String>,
    /// 封面
    pub cover_img: Option<String>,
    /// 访问量
    pub visits: Option<i32>,
    /// 禁止评论
    pub disallow_comment: Option<i32>,
    /// 密码
    pub password: Option<String>,
    /// 置顶
    pub top_priority: Option<i32>,
    /// 收藏数
    pub likes: Option<i32>,
    /// 文章字符数
    pub word_count: Option<i32>,
    /// 创建时间
    pub created_time: Option<i64>,
    /// 更新时间
    pub update_time: Option<i64>,
    /// 逻辑删除
    pub is_deleted: Option<i32>,

    ///////////////////// 以下是数据库不存在字段 insert时需要值为None
    /// 文章类别
    pub category: Option<Category>,
    /// 文章标签
    pub tags: Option<Vec<Tag>>,
}

impl Post {
    /// 构造函数
    pub fn new(
        title: String,
        author: String,
        original_content: String,
        format_content: String,
        word_count: i32,
        summary: Option<String>,
    ) -> Self {
        let created_time = get_sys_time();
        Post {
            id: None,
            title,
            author,
            is_view: 1,
            original_content,
            format_content,
            summary,
            cover_img: None,
            visits: Some(0),
            disallow_comment: Some(1),
            password: None,
            top_priority: Some(0),
            likes: Some(0),
            word_count: Some(word_count),
            created_time: Some(created_time),
            update_time: Some(created_time),
            is_deleted: Some(0),
            category: None,
            tags: None,
        }
    }

    /// 查询所有文章的数量
    pub async fn count_all(db: &RBatis) -> i32 {
        db.query_decode("select count(*) as count from post", vec![])
            .await
            .unwrap()
    }

    /// 统计文章总数(已展示的)
    pub async fn count_view(db: &RBatis) -> i32 {
        db.query_decode("select count(*) as count from post where is_view = 1", vec![])
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
        select_page(offset:i32,size: i32) => "`where is_view = 1 and is_deleted = 0 order by \
        top_priority desc , update_time desc limit  #{offset} , #{size}`"
    }
);

// 分页查询所有的文章 (需要登录)
impl_select!(
    Post{
        select_page_admin(offset:i32,size: i32) => "`where is_deleted = 0 order by update_time \
        desc \
        limit ${offset} , #{size}`"
    }
);

// 根据 title 字段查询文章， title 不能重复
impl_select!(
    Post{
        select_by_title(title:String) => "`where title = #{title} and is_deleted = 0 limit 1`"
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


/// 文章标签对象
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Tag {
    /// 主键 自增
    pub id: Option<i32>,
    /// 标签名称
    pub name: String,
    /// 标签唯一标识
    pub slug: String,
    /// 标签描述
    pub description: Option<String>,
    /// 标签优先级
    pub priority: Option<i32>,
}
crud!(Tag{});

impl_select!(
    Tag{
        select_by_name_id(name:&str,id:i32) => "`where name = #{name} and id != #{id}`"
    }
);


/// 文章类别
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Category {
    /// 主键 自增
    pub id: Option<i32>,
    /// 类别名称
    pub name: String,
    /// 类别唯一标识 不能携带空格
    pub slug: String,
    /// 类别描述
    pub description: Option<String>,
    /// 类别优先级
    pub priority: Option<i32>,
    /// 父类别
    pub parent_id: Option<i32>,
}

crud!(Category{});

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PostTag {
    /// 主键 自增
    pub id: Option<i32>,
    pub post_id: i32,
    pub tag_id: i32,
}
crud!(PostTag{});

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PostCategory {
    /// 主键 自增
    pub id: Option<i32>,
    pub post_id: i32,
    pub category_id: i32,
}
crud!(PostCategory{});
