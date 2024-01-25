use rbatis::{crud, impl_insert, impl_select};
use serde::{Serialize, Deserialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Option<i32>,
    pub username: Option<String>,
    password: Option<String>,
    pub nick_name: Option<String>,
    salt: Option<String>,
    /// 0 -> female
    /// 1 -> male
    /// 2 -> other
    pub gender: Option<i32>,
    pub avatar_path: Option<String>,
    pub signature: Option<String>,
    created_time: Option<i32>,
    /// 0 -> unlocked
    /// 1 -> locked
    pub locked: Option<i32>,
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

    pub fn filter_pwd(&mut self) {
        self.password = None;
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
