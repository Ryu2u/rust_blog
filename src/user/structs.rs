
use serde::{Serialize,Deserialize};


pub struct User {}


#[derive(Debug,Serialize,Deserialize)]
pub struct LoginDto {
    pub username: String,
    pub password: String,
}
