use crate::post::structs::FileForm;
use crate::user::structs::LoginDto;
use crate::{error, AppState, Exception, User, R};
use actix_easy_multipart::MultipartForm;
use actix_web::{get, post, web, Responder};
use rbatis::rbdc::Error;
use rbatis::RBatis;
use std::fs::File;
use std::io::Seek;
use actix_session::Session;
use tracing::log::info;
use tracing::{event, instrument, span, Level};

pub fn user_scope() -> actix_web::Scope {
    actix_web::web::scope("/user")
        .service(api_login)
        .service(api_user_get)
        .service(api_logout)
}

#[post("/login")]
async fn api_login(
    login_dto: web::Json<LoginDto>,
    session: Session,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG, "api_login");
    let username = login_dto.username.clone();
    let password = login_dto.password.clone();
    info!("username -> {} password -> {}", username, password);

    let user_res = User::select_by_username_pwd(&**db, username, password).await;
    match user_res {
        Ok(mut user_vec) => {
            if user_vec.len() <= 0 {
                Err(Exception::BadRequest("账号或密码错误!".to_string()))
            } else {
                let user = user_vec.get_mut(0);
                let user = user.unwrap();
                user.filter_pwd();
                info!("login success -> {:?}", user);
                session.insert("user_id", user.id).expect("can't insert session");
                Ok(R::<User>::ok_obj(user.clone()))
            }
        }
        Err(e) => {
            error!("{}", e);
            Err(Exception::BadRequest("Error".to_string()))
        }
    }
}

#[post("/logout")]
pub async fn api_logout(session: Session) -> Result<impl Responder, Exception> {
    info!("api_logout in");
    session.clear();
    Ok(R::<()>::ok())
}

#[instrument]
#[get("/get/{id}")]
pub async fn api_user_get(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    if let Ok(mut res) = User::select_by_id(&**db, *id).await {
        if res.is_empty() {
            return Err(Exception::BadRequest("user is not exits!".to_string()));
        }
        let mut user = res.pop().unwrap();
        user.filter_pwd();
        info!("{:?}", user);
        Ok(R::<User>::ok_obj(user))
    } else {
        Err(Exception::InternalError)
    }
}

#[instrument]
pub async fn api_greet(name: web::Path<String>) -> impl Responder {
    let scope = span!(Level::DEBUG, "greet");
    let _enter = scope.enter();
    event!(Level::DEBUG, ?name);
    format!("Ok {name}")
}

#[instrument]
pub async fn api_body(body: String) -> impl Responder {
    event!(Level::DEBUG,%body);
    body
}

#[instrument]
pub async fn api_state(data: web::Data<AppState>) -> String {
    let name = &data.app_name;
    info!("app name -> {:?}", name);
    format!("app name -> {:?}", name)
}

#[instrument]
pub async fn api_result() -> Result<impl Responder, Exception> {
    let _res = R {
        code: 200,
        msg: "OK".to_string(),
        obj: "123".to_string(),
    };

    Err::<R<String>, Exception>(Exception::InternalError)
}

pub async fn api_file_test(form: MultipartForm<FileForm>) -> Result<impl Responder, Exception> {
    let file_form = form.0;
    info!("{:?}", file_form);
    let num = file_form.num.0;
    info!("NUM : {}", num);
    let mut temp_file = file_form.file;
    let file = temp_file.file.as_file_mut();
    info!("file len : {:?}", file.metadata());
    Ok(R::<()>::ok())
}

#[cfg(test)]
mod test {
    use crate::api_greet;
    use actix_web::{test, web, App};
    use tracing::instrument;

    #[tokio::test]
    async fn test_greet() {
        let app = test::init_service(
            App::new()
                .service({ web::scope("/app").route("/greet/{name}", web::get().to(api_greet)) }),
        )
            .await;
        let req = test::TestRequest::get().uri("/app/greet/123").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }
}
