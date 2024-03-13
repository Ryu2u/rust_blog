use crate::utils::time_utils::get_sys_time;
use rbatis::{crud, impl_select};
use serde::{Deserialize, Serialize};


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Option<i32>,
    pub username: String,
    password: String,
    pub nick_name: String,
    salt: Option<String>,
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
        }
    }

    pub fn filter_pwd(&mut self) {
        self.password = "".to_string();
    }
}

crud!(User {}, "tb_user");
impl_select!(
    User{select_by_username_pwd(username:String,password:String)
        => "`where username =  #{username} and password = #{password}`"},"tb_user"
);

impl_select!(
    User{select_by_id(id:i32) => "`where id = #{id}`"},"tb_user"
);

#[derive(Debug, Serialize, Deserialize)]
pub struct LoginDto {
    pub username: String,
    pub password: String,
    pub remember: bool
}
