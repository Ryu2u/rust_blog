use rbatis::{crud, impl_insert};
use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    id: Option<i32>,
    username: Option<String>,
    password: Option<String>,
    nick_name: Option<String>,
    salt: Option<String>,
    /// 0 -> female
    /// 1 -> male
    /// 2 -> other
    gender: Option<i32>,
    avatar_path: Option<String>,
    signature: Option<String>,
    created_time: Option<i32>,
    /// 0 -> unlocked
    /// 1 -> locked
    locked: Option<i32>,
}

impl User {
    pub fn new(username: &str,
               password: &str,
               nick_name: &str,
               salt: &str,
               gender: Option<i32>,
               avatar_path: Option<String>,
               signature: Option<String>,
               created_time: i32)
               -> Self {
        User {
            id: None,
            username: Some(username.to_string()),
            password: Some(password.to_string()),
            nick_name: Some(nick_name.to_string()),
            salt: Some(salt.to_string()),
            gender,
            avatar_path,
            signature,
            created_time: Some(created_time),
            locked: Some(0),
        }
    }
}


crud!(User{},"tb_user");


#[derive(Debug, Serialize, Deserialize)]
pub struct LoginDto {
    pub username: String,
    pub password: String,
}
