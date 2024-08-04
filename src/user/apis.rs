use crate::user::structs::LoginDto;
use crate::{error, Exception, User, R};
use actix_web::{get, post, web, Responder};

use rbatis::RBatis;

use actix_session::Session;
use tracing::log::info;
use tracing::{instrument, span, Level};

/// 用户 接口
/// api_login -> 登录接口
/// api_logout -> 退出登录接口
/// api_user_get -> 获取用户对象接口
/// api_file_test -> form表单请求测试接口
///
pub fn user_scope() -> actix_web::Scope {
    actix_web::web::scope("/user")
        .service(api_login)
        .service(api_logout)
        .service(api_user_get)
}

#[post("/login")]
async fn api_login(
    login_dto: web::Json<LoginDto>,
    session: Session,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG, "api_login");
    let username = login_dto.username.as_str();
    let password = login_dto.password.as_str();
    info!("username -> {} password -> {}", username, password);

    let user_res = User::select_by_username_pwd(&**db, username, password).await;
    match user_res {
        Ok(mut user_vec) => {
            if user_vec.is_empty() {
                Err(Exception::BadRequest("账号或密码错误!".to_string()))
            } else {
                let user = user_vec.get_mut(0);
                let user = user.unwrap();
                user.filter_pwd();
                info!("login success -> {:?}", user);
                session
                    .insert("user_id", user.id)
                    .expect("can't insert session");
                Ok(R::<User>::ok_msg_obj("登录成功!",user.clone()))
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


#[cfg(test)]
mod test {
    use actix_web::{test, App};

    #[tokio::test]
    async fn test_greet() {
        let app = test::init_service(
            App::new(), // .service(web::scope("/app").route("/greet/{name}", web::get().to())),
        )
        .await;
        let req = test::TestRequest::get().uri("/app/greet/123").to_request();
        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), 200);
    }
}
