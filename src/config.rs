use std::error::Error;
use actix_web::body::BoxBody;
use actix_web::guard::{Guard, GuardContext};
use actix_web::http::header::ContentType;
use actix_web::http::StatusCode;
use actix_web::{error, HttpRequest, HttpResponse, Responder};
use rbatis::RBatis;
use rbdc_mysql::MysqlDriver;
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};
use tracing::log::{error, info};

#[derive(Debug)]
pub struct AppState {
    pub app_name: String,
    pub admin_route_prefixes: Vec<&'static str>,
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
    /// 429：登录失败过多被临时锁定
    TooManyRequests { msg: String, retry_after_secs: u64 },
}

impl Exception {
    /// 登录被临时锁定：文案按剩余时间向上取整到分钟（至少 1 分钟），不透露是哪条规则触发的
    pub fn too_many_requests(retry_after_secs: u64) -> Self {
        let minutes = retry_after_secs.div_ceil(60).max(1);
        Exception::TooManyRequests {
            msg: format!("尝试次数过多，请 {minutes} 分钟后再试"),
            retry_after_secs,
        }
    }
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
            Exception::TooManyRequests { msg, .. } => write!(f, "{}", msg),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::ResponseError;

    #[test]
    fn too_many_requests_is_429_with_retry_after_header() {
        let e = Exception::too_many_requests(61);
        let resp = e.error_response();
        assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(resp.headers().get("Retry-After").unwrap().to_str().unwrap(), "61");
    }

    #[test]
    fn retry_minutes_round_up_with_a_floor_of_one() {
        let cases = [(0, 1), (1, 1), (60, 1), (61, 2), (900, 15)];
        for (secs, minutes) in cases {
            assert_eq!(
                Exception::too_many_requests(secs).to_string(),
                format!("尝试次数过多，请 {minutes} 分钟后再试"),
                "{secs} 秒"
            );
        }
    }

    #[test]
    fn other_errors_have_no_retry_after_header() {
        let resp = Exception::BadRequest("x".to_string()).error_response();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert!(resp.headers().get("Retry-After").is_none());
    }
}

impl error::ResponseError for Exception {
    fn status_code(&self) -> StatusCode {
        match *self {
            Exception::BadRequest(_) => StatusCode::BAD_REQUEST,
            Exception::InternalError => StatusCode::INTERNAL_SERVER_ERROR,
            Exception::NotFound => StatusCode::NOT_FOUND,
            Exception::TooManyRequests { .. } => StatusCode::TOO_MANY_REQUESTS,
        }
    }
    fn error_response(&self) -> HttpResponse {
        let result = R {
            code: self.status_code().as_u16().into(),
            msg: format!("{}", self),
            obj: (),
        };
        error!("Error: {:?}", result);
        let mut builder = HttpResponse::build(self.status_code());
        builder.insert_header(ContentType::html());
        if let Exception::TooManyRequests { retry_after_secs, .. } = self {
            builder.insert_header(("Retry-After", retry_after_secs.to_string()));
        }
        builder.body(serde_json::to_string(&result).unwrap())
    }
}


impl From<std::io::Error> for Exception {
    fn from(value: std::io::Error) -> Self {
        Exception::BadRequest(value.to_string())
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

/// 端到端测试共用同一个临时库：串行化，避免两个 #[ignore] 测试同时 DROP / CREATE 同一张表
#[cfg(test)]
pub static E2E_DB_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub async fn init_rbatis(db_url: String) -> RBatis {
    let mut rbatis = RBatis::new();
    // 用脱敏的日志拦截器替换 rbatis 默认的 LogInterceptor：后者会把绑定参数（含密码哈希）原样打进日志
    rbatis.set_intercepts(vec![std::sync::Arc::new(crate::utils::sql_log::RedactingLogInterceptor)]);
    rbatis.init(MysqlDriver {}, db_url.as_str()).unwrap();
    rbatis
}
