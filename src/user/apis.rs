use actix_web::{post, Responder, web};
use rbatis::RBatis;
use rbatis::rbdc::Error;
use crate::{AppState, R, Exception, User, error};
use tracing::{event, instrument, Level, span};
use tracing::log::{info};
use crate::user::structs::LoginDto;

pub fn user_scope() -> actix_web::Scope {
    actix_web::web::scope("/user")
        .service(api_login)
}


#[instrument]
#[post("/login")]
async fn api_login(login_dto: web::Json<LoginDto>,
                   db: web::Data<RBatis>) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG,"api_login");
    let username = login_dto.username.clone();
    let password = login_dto.password.clone();
    info!("username -> {} password -> {}",username,password);

    let user_res = User::select_by_username_pwd(&**db, username, password).await;
    match user_res {
        Ok(mut user_vec) => {
            if user_vec.len() <= 0 {
                Err(Exception::BadRequest("账号或密码错误!".to_string()))
            } else {
                let user = user_vec.get_mut(0);
                let user = user.unwrap();
                user.filter_pwd();
                info!("login success -> {:?}",user);

                Ok(serde_json::to_string(&user))
            }
        }
        Err(e) => {
            error!("{}",e);
            Err(Exception::BadRequest("Error".to_string()))
        }
    }

    // scope.in_scope(|| {});
    // Ok(R::ok_obj(login_dto))
}

#[instrument]
pub async fn api_greet(name: web::Path<String>) -> impl Responder {
    let scope = span!(Level::DEBUG,"greet");
    let _enter = scope.enter();
    event!(Level::DEBUG,?name);
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
    info!("app name -> {:?}",name);
    format!("app name -> {:?}", name)
}


#[instrument]
pub async fn api_result() -> Result<impl Responder, Exception> {
    let _res = R {
        code: 200,
        msg: "OK".to_string(),
        obj: "123".to_string(),
    };

    Err::<R<String>, Exception>(
        Exception::InternalError
    )
}

#[cfg(test)]
mod test {
    use actix_web::{App, test, web};
    use crate::{api_greet};

    #[tokio::test]
    async fn test_greet() {
        let app = test::init_service(App::new().service({
            web::scope("/app")
                .route("/greet/{name}", web::get().to(api_greet))
        })).await;
        let req = test::TestRequest::get().uri("/app/greet/123").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }
}
