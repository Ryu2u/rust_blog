use std::time::{SystemTime, UNIX_EPOCH};
use rbatis::{crud, impl_insert, impl_select};
use serde::{Serialize, Deserialize};

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
    pub fn new(username: &str,
               password: &str,
               nick_name: &str,
    )
               -> Self {
        let now = SystemTime::now();
        let created_time = now.duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
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

crud!(User{},"tb_user");
impl_select!(
    User{select_by_username_pwd(username:String,password:String)
        => "`where username =  #{username} and password = #{password}`"},"tb_user");


#[derive(Debug, Serialize, Deserialize)]
pub struct LoginDto {
    pub username: String,
    pub password: String,
}
