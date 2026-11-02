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

/// 通过登录校验后放进请求扩展的「当前用户」，也是 `GET /user/me` 的响应体。
/// 刻意只含身份字段：不含密码、盐、锁定标记等。
#[derive(Clone, Debug, Serialize)]
pub struct AuthUser {
    pub id: i32,
    pub username: String,
    pub nick_name: String,
    pub role: String,
}

impl From<&User> for AuthUser {
    fn from(u: &User) -> Self {
        AuthUser {
            id: u.id.unwrap_or_default(),
            username: u.username.clone(),
            nick_name: u.nick_name.clone(),
            role: u.role.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_user_exposes_only_identity_fields() {
        let mut u = User::new("alice", "s3cret-password", "Alice");
        u.id = Some(7);
        u.role = "admin".to_string();
        let au = AuthUser::from(&u);
        assert_eq!(au.id, 7);
        assert_eq!(au.username, "alice");
        assert_eq!(au.nick_name, "Alice");
        assert_eq!(au.role, "admin");
        let json = serde_json::to_string(&au).unwrap();
        for forbidden in ["password", "s3cret", "salt", "locked", "created_time"] {
            assert!(!json.contains(forbidden), "{forbidden} 不应出现：{json}");
        }
    }
}
