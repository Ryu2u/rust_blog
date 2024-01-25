use std::env;
use std::fmt::{Display, Formatter};
use std::fs::File;
use std::io::Read;
use std::time::{SystemTime, UNIX_EPOCH};
use actix_web::{App, error, guard, http, HttpRequest, HttpResponse, HttpServer, Responder, web};
use actix_web::body::BoxBody;

use actix_web::guard::{Guard, GuardContext};
use actix_web::http::header::ContentType;
use actix_web::http::StatusCode;
use serde::{Serialize, Deserialize};

use tracing::log::{debug, error, info};
use derive_more::{Error};
use dotenv::dotenv;
use rbatis::RBatis;
use rbdc_sqlite::SqliteDriver;


mod user;

use user::apis::{*};
use crate::user::structs::User;


#[derive(Debug)]
struct AppState {
    app_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct R<T: Serialize> {
    code: i32,
    msg: String,
    obj: T,
}

impl<T: Serialize> R<T> {
    fn ok() -> R<()> {
        R {
            code: 200,
            msg: "success".to_string(),
            obj: (),
        }
    }

    fn ok_msg(msg: String) -> R<()> {
        R {
            code: 200,
            msg,
            obj: (),
        }
    }

    fn ok_obj(obj: T) -> R<T> {
        R {
            code: 200,
            msg: "success".to_string(),
            obj,
        }
    }
}

#[derive(Debug)]
enum Exception {
    ValidationError { field: String },
    InternalError,
    NotFound,
    BadRequest(String),
}


struct ContentTypeGuard;

impl Guard for ContentTypeGuard {
    fn check(&self, req: &GuardContext<'_>) -> bool {
        info!("uri -> {}",req.head().uri);
        req.head().headers.contains_key(http::header::CONTENT_TYPE)
    }
}

impl Display for Exception {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match &self {
            Exception::ValidationError { field } => write!(f, "Validation error on field : {}", field),
            Exception::InternalError => write!(f, "internal error"),
            Exception::BadRequest(msg) => write!(f, "{}", msg),
            Exception::NotFound => write!(f, "not found")
        }
    }
}


impl error::ResponseError for Exception {
    fn status_code(&self) -> StatusCode {
        match *self {
            Exception::BadRequest(_) => StatusCode::BAD_REQUEST,
            Exception::ValidationError { .. } => StatusCode::BAD_REQUEST,
            Exception::InternalError => StatusCode::INTERNAL_SERVER_ERROR,
            Exception::NotFound => StatusCode::NOT_FOUND
        }
    }
    fn error_response(&self) -> HttpResponse {
        let result = R {
            code: self.status_code().as_u16().into(),
            msg: format!("{}", self),
            obj: (),
        };
        error!("Error: {:?}",result);
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
            .content_type(ContentType::json())
            .body(body)
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // init log
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_target(false)
        .pretty()
        .init();
    // init env
    dotenv().ok();

    for (key, value) in dotenv::vars() {
        debug!("{} | {}",key,value);
    }

    // get ip
    let server_ip = env::var("SERVER_IP")
        .expect("can't get env [SERVER_IP], please check the .env file!");
    // get port
    let server_port = env::var("SERVER_PORT")
        .expect("can't get env [SERVER_PORT], please check the .env file!");

    let server = format!("{}:{}", server_ip, server_port);

    info!("server is started by {}",server);

    let rbatis = init_rbatis().await;

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(rbatis.clone()))
            .app_data(web::Data::new(AppState {
                app_name: "rust_blog".to_string()
            }))
            .service({
                web::scope("")
                    .guard(ContentTypeGuard)
                    .service(test_scope())
                    .service(user_scope())
            })
    }).bind(server)?
        .run()
        .await
}

fn test_scope() -> actix_web::Scope {
    actix_web::web::scope("/test")
        .guard(guard::Header("Content-Type", "application/json"))
        .route("/hello/{name}", web::get().to(api_greet))
        .route("/tests", web::post().to(api_body))
        .route("/state", web::get().to(api_state))
        .route("/result", web::get().to(api_result))
}


async fn init_rbatis() -> RBatis {
    let db_path = env::var("DATABASE_URL")
        .expect("can't get env [DATABASE_URL], please check the .env file!");

    let sqlite_url = format!("sqlite://{}", db_path);
    info!("sqlite_url -> {}",sqlite_url);
    let rbatis = RBatis::new();
    rbatis.init(SqliteDriver {}, sqlite_url.as_str()).unwrap();

    let db_path = std::path::Path::new(&db_path);

    if !db_path.exists() {
        info!("{:?} is not exists,start to init!",db_path);
        let mut file = File::open("schema.sql").expect("schema.sql is not exists!");
        let mut init_sql = String::new();
        file.read_to_string(&mut init_sql).expect("can't read file schema.sql");
        rbatis.exec(init_sql.as_str(), vec![]).await.expect("execute init sql failed!");
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let user = User::new("admin", "123", "admin", "salt", None, None, None, now as i32);
        User::insert(&rbatis, &user).await.expect("insert user failed");
    }
    rbatis
}



