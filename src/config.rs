use crate::User;
use actix_web::body::BoxBody;
use actix_web::guard::{Guard, GuardContext};
use actix_web::http::header::ContentType;
use actix_web::http::StatusCode;
use actix_web::{error, HttpRequest, HttpResponse, Responder};
use rbatis::RBatis;
use rbdc_sqlite::SqliteDriver;
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};
use std::fs::File;
use std::io::Read;
use tracing::log::{error, info};

#[derive(Debug)]
pub struct AppState {
    pub app_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct R<T: Serialize> {
    code: i32,
    msg: String,
    obj: T,
}

impl R<()> {
    pub fn ok_msg(str: &str) -> R<()> {
        R::<()>::ok_msg_unit(str)
    }

    pub fn ok() -> R<()> {
        R::<()>::ok_unit()
    }
}

impl<T: Serialize> R<T> {
    pub fn ok_unit() -> R<()> {
        R {
            code: 200,
            msg: "success".to_string(),
            obj: (),
        }
    }

    pub fn ok_msg_unit(msg: &str) -> R<()> {
        R {
            code: 200,
            msg: msg.to_string(),
            obj: (),
        }
    }

    pub fn ok_obj(obj: T) -> R<T> {
        R {
            code: 200,
            msg: "success".to_string(),
            obj,
        }
    }

    pub fn ok_msg_obj(msg: &str, obj: T) -> R<T> {
        R {
            code: 200,
            msg: msg.to_string(),
            obj,
        }
    }
}

#[derive(Debug)]
pub enum Exception {
    InternalError,
    NotFound,
    BadRequest(String),
}

pub struct ContentTypeGuard;

impl Guard for ContentTypeGuard {
    fn check(&self, req: &GuardContext<'_>) -> bool {
        info!("uri -> {}", req.head().uri);
        // req.head().headers.contains_key(http::header::CONTENT_TYPE)
        true
    }
}

impl Display for Exception {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match &self {
            Exception::InternalError => write!(f, "internal error"),
            Exception::BadRequest(msg) => write!(f, "{}", msg),
            Exception::NotFound => write!(f, "not found"),
        }
    }
}

impl error::ResponseError for Exception {
    fn status_code(&self) -> StatusCode {
        match *self {
            Exception::BadRequest(_) => StatusCode::BAD_REQUEST,
            Exception::InternalError => StatusCode::INTERNAL_SERVER_ERROR,
            Exception::NotFound => StatusCode::NOT_FOUND,
        }
    }
    fn error_response(&self) -> HttpResponse {
        let result = R {
            code: self.status_code().as_u16().into(),
            msg: format!("{}", self),
            obj: (),
        };
        error!("Error: {:?}", result);
        HttpResponse::build(self.status_code())
            .insert_header(ContentType::html())
            .body(serde_json::to_string(&result).unwrap())
    }
}

impl<T: Serialize> Responder for R<T> {
    type Body = BoxBody;

    fn respond_to(self, _req: &HttpRequest) -> HttpResponse<Self::Body> {
        let body = serde_json::to_string(&self).unwrap();
        HttpResponse::Ok()
            // .content_type(ContentType::json())
            .body(body)
    }
}

pub async fn init_rbatis(db_path: String) -> RBatis {
    let sqlite_url = "sqlite://db/rust_blog.db".to_string();
    info!("sqlite_url -> {}", sqlite_url);
    let db_path = std::path::Path::new(&db_path);
    let rbatis = RBatis::new();
    if !db_path.exists() {
        File::create(&db_path).expect("Unable to create file");
        info!("{:?} is not exists,start to init!", db_path);
        let mut file = File::open("schema.sql").expect("schema.sql is not exists!");
        let mut init_sql = String::new();
        file.read_to_string(&mut init_sql)
            .expect("can't read file schema.sql");
        rbatis.init(SqliteDriver {}, sqlite_url.as_str()).unwrap();
        rbatis
            .exec(init_sql.as_str(), vec![])
            .await
            .expect("execute init sql failed!");
        let user = User::new("admin", "123", "admin");
        User::insert(&rbatis, &user)
            .await
            .expect("insert user failed");
    } else {
        rbatis.init(SqliteDriver {}, sqlite_url.as_str()).unwrap();
    }

    rbatis
}
