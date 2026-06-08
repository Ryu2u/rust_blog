use crate::utils::time_utils::get_sys_time;
use rbatis::{crud, impl_select};
use rbatis::{rbdc, RBatis};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Option<i32>,
    pub username: String,
    pub(crate) password: String,
    pub nick_name: String,
    pub(crate) salt: Option<String>,
    /// 0 -> female
    /// 1 -> male
    /// 2 -> other
    pub gender: i32,
    pub avatar_path: Option<String>,
    pub signature: Option<String>,
    created_time: i64,
    /// 0 -> unlocked
    /// 1 -> locked
    pub locked: i32,
    /// admin -> administrator
    /// user -> normal user
    pub role: String,
}

impl User {
    pub fn new(username: &str, password: &str, nick_name: &str) -> Self {
        let created_time = get_sys_time();
        User {
            id: None,
            username: username.to_string(),
            password: password.to_string(),
            nick_name: nick_name.to_string(),
            salt: None,
            gender: 1,
            avatar_path: None,
            signature: None,
            created_time,
            locked: 0,
            role: "user".to_string(),
        }
    }

    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }

    pub fn filter_pwd(&mut self) {
        self.password = "".to_string();
    }

    pub async fn count_all(db: &RBatis) -> i32 {
        db.query_decode("select count(*) as count from tb_user", vec![])
            .await
            .unwrap_or(0)
    }

    pub async fn count_filtered(db: &RBatis, keyword: Option<&str>, locked: Option<i32>) -> i32 {
        let mut sql = "select count(*) as count from tb_user where 1=1".to_string();
        if let Some(keyword) = keyword.filter(|v| !v.trim().is_empty()) {
            let keyword = escape_sql(keyword);
            sql.push_str(&format!(
                " and (username like '%{}%' or nick_name like '%{}%')",
                keyword, keyword
            ));
        }
        if let Some(locked) = locked {
            sql.push_str(&format!(" and locked = {}", locked));
        }
        db.query_decode(sql.as_str(), vec![]).await.unwrap_or(0)
    }

    pub async fn select_page_filtered(
        db: &RBatis,
        offset: i32,
        size: i32,
        keyword: Option<&str>,
        locked: Option<i32>,
    ) -> Result<Vec<User>, rbdc::Error> {
        let mut sql = "select * from tb_user where 1=1".to_string();
        if let Some(keyword) = keyword.filter(|v| !v.trim().is_empty()) {
            let keyword = escape_sql(keyword);
            sql.push_str(&format!(
                " and (username like '%{}%' or nick_name like '%{}%')",
                keyword, keyword
            ));
        }
        if let Some(locked) = locked {
            sql.push_str(&format!(" and locked = {}", locked));
        }
        sql.push_str(&format!(
            " order by created_time desc limit {}, {}",
            offset, size
        ));
        db.query_decode(sql.as_str(), vec![]).await
    }
}

fn escape_sql(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "''")
}

crud!(User {}, "tb_user");
impl_select!(
    User{select_by_username_pwd(username:&str,password:&str)
        => "`where username =  #{username} and password = #{password}`"},"tb_user"
);

impl_select!(
    User{select_by_username(username:&str)
        => "`where username = #{username}`"},"tb_user"
);

impl_select!(
    User{select_by_id(id:i32) => "`where id = #{id}`"},"tb_user"
);

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginDto {
    pub username: String,
    pub password: String,
    pub remember: bool,
}
