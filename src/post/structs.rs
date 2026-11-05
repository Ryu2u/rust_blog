use crate::utils::time_utils::get_sys_time;
use actix_easy_multipart::tempfile::Tempfile;
use actix_easy_multipart::text::Text;
use actix_easy_multipart::MultipartForm;
use rbatis::{crud, impl_select, rbdc, RBatis};
use rbs::Value;
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
#[derive(Clone, Serialize, Deserialize)]
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

/// 手写 Debug：文章口令输出 `***`（保留「有没有设置」的信息），避免被 `#[instrument]` 或 `{:?}` 日志带出去。
/// 新增字段时必须同步加到这里（`post_debug_lists_every_serialized_field` 会检查）。
impl std::fmt::Debug for Post {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Post")
            .field("id", &self.id)
            .field("title", &self.title)
            .field("author", &self.author)
            .field("is_view", &self.is_view)
            .field("original_content", &self.original_content)
            .field("format_content", &self.format_content)
            .field("summary", &self.summary)
            .field("cover_img", &self.cover_img)
            .field("visits", &self.visits)
            .field("disallow_comment", &self.disallow_comment)
            .field("password", &self.password.as_ref().map(|_| "***"))
            .field("top_priority", &self.top_priority)
            .field("likes", &self.likes)
            .field("word_count", &self.word_count)
            .field("created_time", &self.created_time)
            .field("update_time", &self.update_time)
            .field("is_deleted", &self.is_deleted)
            .field("category", &self.category)
            .field("tags", &self.tags)
            .finish()
    }
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

    /// 统计文章总数(已展示的，且未软删)
    pub async fn count_view(db: &RBatis) -> i32 {
        db.query_decode(
            "select count(*) as count from post where is_view = 1 and is_deleted = 0",
            vec![],
        )
        .await
        .unwrap()
    }

    /// 公开响应脱敏：口令字段永不下发
    pub fn filter_pwd(&mut self) {
        self.password = None;
    }

    /// 公开列表脱敏：口令与正文都不下发（体积与口径同 /post/page）
    pub fn filter_public_list(&mut self) {
        self.filter_pwd();
        self.format_content = String::new();
        self.original_content = String::new();
    }

    /// 文章是否存在且对公众可见（is_view = 1 且未软删）
    /// 公开读接口在返回「从属于某篇文章」的数据（标签、评论等）前必须先过这一关
    pub async fn is_public(db: &RBatis, id: i32) -> bool {
        match Post::select_by_id(db, id).await {
            Ok(rows) => rows
                .first()
                .map_or(false, |p| p.is_view == 1 && p.is_deleted != Some(1)),
            Err(_) => false,
        }
    }

    pub async fn select_by_category(
        db: &RBatis,
        category_name: String,
        limit: i32,
        page_size: i32,
    ) -> Result<Vec<Post>, rbdc::Error> {
        // 必须与公开列表口径一致：只返回「公开且未删除」的文章，
        // 否则 AI 公开性审查/软删在分类页这条路径上会被绕过。
        // order by 带 id 兜底：分页（加载更多）需要确定序，避免并列 update_time 造成跨页重复/漏项
        db.query_decode(
            "select b.* from PostCategory as a join post as b on a.post_id = b.id join category as c on a.category_id = c.id where c.name = ? and b.is_view = 1 and b.is_deleted = 0 order by b.update_time desc, b.id desc limit ?,?",
            vec![Value::String(category_name),Value::I32(limit),Value::I32(page_size)]
        ).await
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
        top_priority desc , update_time desc , id desc limit  #{offset} , #{size}`"
    }
);

// 分页查询所有的文章 (需要登录)
impl_select!(
    Post{
        select_page_admin(offset:i32,size: i32) => "`where is_deleted = 0 order by update_time \
        desc , id desc \
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
crud!(Tag {});

impl_select!(
    Tag{
        select_by_name_id(name:&str,id:i32) => "`where name = #{name} and id != #{id}`"
    }
);

/// 标签云条目：标签名称 + 关联文章数
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TagCount {
    /// 标签名称
    pub name: String,
    /// 关联文章数量
    pub count: i32,
}

/// 按标签分页查询文章列表的请求体
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TagPostsQuery {
    /// 标签名称
    pub tag_name: String,
    /// 页码 从 1 开始
    pub page_num: i32,
    /// 每页数量
    pub page_size: i32,
}

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

crud!(Category {});

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PostTag {
    /// 主键 自增
    pub id: Option<i32>,
    pub post_id: i32,
    pub tag_id: i32,
}
crud!(PostTag {}, "PostTag");

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PostCategory {
    /// 主键 自增
    pub id: Option<i32>,
    pub post_id: i32,
    pub category_id: i32,
}
crud!(PostCategory {}, "PostCategory");

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_post() -> Post {
        let mut p = Post::new(
            "标题".to_string(),
            "作者".to_string(),
            "正文".to_string(),
            "<p>正文</p>".to_string(),
            2,
            Some("摘要".to_string()),
        );
        p.password = Some("post-pass-9527".to_string());
        p
    }

    #[test]
    fn post_debug_hides_password() {
        let dbg = format!("{:?}", sample_post());
        assert!(!dbg.contains("post-pass-9527"), "文章口令不应出现在 Debug 里：{dbg}");
        assert!(dbg.contains("password: Some(\"***\")"), "应保留「已设置口令」的信息：{dbg}");
        assert!(dbg.contains("标题") && dbg.contains("作者"), "其它字段应保留：{dbg}");
        // 没设置口令时仍是 None，不会被打成 ***
        let mut p = sample_post();
        p.password = None;
        assert!(format!("{:?}", p).contains("password: None"));
        // `#[instrument]` 记录的是 `web::Json<Post>`，它转发给内部类型的 Debug
        let dbg = format!("{:?}", actix_web::web::Json(sample_post()));
        assert!(!dbg.contains("post-pass-9527"), "Json 包装后口令也不应出现：{dbg}");
    }

    #[test]
    fn post_debug_lists_every_serialized_field() {
        let p = sample_post();
        let json = serde_json::to_value(&p).unwrap();
        let dbg = format!("{:?}", p);
        for key in json.as_object().unwrap().keys() {
            assert!(dbg.contains(&format!("{key}: ")), "手写 Debug 漏了字段 {key}：{dbg}");
        }
    }
}
