
use actix_web::{App, error, guard, http, HttpRequest, HttpResponse, HttpServer, Responder, web};
use actix_web::body::BoxBody;
use actix_web::guard::{Guard, GuardContext};
use actix_web::http::header::ContentType;
use actix_web::http::StatusCode;
use serde::{Serialize, Deserialize};

use tracing::log::{info};
use derive_more::{Display, Error};


mod apis;

use apis::{*};


#[derive(Debug)]
struct AppState {
    app_name: String,
}

#[derive(Serialize, Deserialize)]
struct R<T: Serialize> {
    code: i32,
    msg: String,
    obj: T,
}

#[derive(Debug, Display, Error)]
enum UserError {
    #[display(fmt = "Validation error on field : {}", field)]
    ValidationError { field: String },
    #[display(fmt = "An internal error occurred. Please try again later.")]
    InternalError,
}

struct ContentTypeGuard;

impl Guard for ContentTypeGuard {
    fn check(&self, req: &GuardContext<'_>) -> bool {
        req.head().headers.contains_key(http::header::CONTENT_TYPE)
    }
}


impl error::ResponseError for UserError {
    fn status_code(&self) -> StatusCode {
        match *self {
            UserError::ValidationError { .. } => StatusCode::BAD_REQUEST,
            UserError::InternalError => StatusCode::INTERNAL_SERVER_ERROR
        }
    }
    fn error_response(&self) -> HttpResponse {
        HttpResponse::build(self.status_code())
            .insert_header(ContentType::html())
            .body(self.to_string())
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
            .route("/",
                   web::route().guard(ContentTypeGuard)
                       .to(HttpResponse::Ok)
            )
            .app_data(web::Data::new(AppState {
                app_name: "rust_blog".to_string()
            }))
            .service({
                web::scope("/app")
                    .guard(guard::Header("Content-Type", "application/json"))
                    .route("/hello/{name}", web::get().to(api_greet))
                    .route("/tests", web::post().to(api_body))
                    .route("/state", web::get().to(api_state))
                    .route("/result", web::get().to(api_result))
            })
    }).bind(server)?
        .run()
        .await
}


