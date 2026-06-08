use crate::config::Exception;
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::env;

pub const AUTH_COOKIE_NAME: &str = "auth_token";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: i32,
    pub username: String,
    pub role: String,
    pub exp: usize,
    pub iat: usize,
}

fn jwt_secret() -> Result<String, Exception> {
    env::var("JWT_SECRET").map_err(|_| Exception::InternalError)
}

fn jwt_exp_hours() -> i64 {
    env::var("JWT_EXPIRE_HOURS")
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(12)
}

pub fn create_jwt(user_id: i32, username: &str, role: &str) -> Result<String, Exception> {
    let now = Utc::now();
    let exp = now + Duration::hours(jwt_exp_hours());
    let claims = JwtClaims {
        sub: user_id,
        username: username.to_string(),
        role: role.to_string(),
        iat: now.timestamp() as usize,
        exp: exp.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret()?.as_bytes()),
    )
    .map_err(|_| Exception::InternalError)
}

pub fn verify_jwt(token: &str) -> Result<JwtClaims, Exception> {
    let data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret()?.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| Exception::BadRequest("登录状态已失效，请重新登录".to_string()))?;

    Ok(data.claims)
}
