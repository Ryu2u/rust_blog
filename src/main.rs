use std::fmt::{Display, Formatter, write};
use actix_web::{App, error, guard, http, HttpRequest, HttpResponse, HttpServer, Responder, web};
use actix_web::body::BoxBody;
use actix_web::error::HttpError;
use actix_web::guard::{Guard, GuardContext};
use actix_web::http::header::ContentType;
use actix_web::http::StatusCode;
use serde::{Serialize, Deserialize};

use tracing::log::{error, info};
use derive_more::{Display, Error};
use serde::de::Unexpected::Option;


mod user;

use user::apis::{*};


#[derive(Debug)]
struct AppState {
    app_name: String,
}

#[derive(Debug,Serialize, Deserialize)]
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

#[derive(Debug, Error)]
enum Exception {
    ValidationError { field: String },
    InternalError,
    NotFound,
    BadRequest,
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
            Exception::BadRequest => write!(f, "bad request"),
            Exception::NotFound => write!(f, "not found")
        }
    }
}


impl error::ResponseError for Exception {
    fn status_code(&self) -> StatusCode {
        match *self {
            Exception::BadRequest => StatusCode::BAD_REQUEST,
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

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_target(false)
        .pretty()
        .init();

    let server = ("127.0.0.1", 8002);

    info!("start server -> {:?}",server);
    HttpServer::new(|| {
        App::new()
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



