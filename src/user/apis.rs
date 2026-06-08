use crate::user::structs::LoginDto;
use crate::utils::jwt_utils::{create_jwt, AUTH_COOKIE_NAME};
use crate::{error, Exception, User, R};
use actix_web::cookie::{time::Duration, Cookie, SameSite};
use actix_web::{get, post, web, HttpResponse, Responder};
use rbatis::RBatis;
use serde::Deserialize;
use tracing::log::info;
use tracing::{instrument, span, Level};

/// 用户 接口
pub fn user_scope() -> actix_web::Scope {
    actix_web::web::scope("/user")
        .service(api_login)
        .service(api_logout)
        .service(api_user_get)
        .service(api_user_get_admin)
        .service(api_user_add)
        .service(api_user_list_page)
        .service(api_user_update)
        .service(api_user_del)
        .service(api_user_lock)
}

fn is_bcrypt_hash(s: &str) -> bool {
    s.starts_with("$2b$") || s.starts_with("$2a$") || s.starts_with("$2y$")
}

#[derive(Debug, Deserialize)]
struct UserPageQuery {
    page_num: i32,
    page_size: i32,
    keyword: Option<String>,
    status: Option<i32>,
}

#[post("/login")]
async fn api_login(
    login_dto: web::Json<LoginDto>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let _ = span!(Level::DEBUG, "api_login");
    let username = login_dto.username.as_str();
    let password = login_dto.password.as_str();
    info!("username -> {}", username);

    let user_res = User::select_by_username(&**db, username).await;
    match user_res {
        Ok(mut user_vec) => {
            if user_vec.is_empty() {
                return Err(Exception::BadRequest("账号或密码错误!".to_string()));
            }
            let user = user_vec.get_mut(0).unwrap();

            let password_valid = if is_bcrypt_hash(&user.password) {
                bcrypt::verify(password, &user.password).unwrap_or(false)
            } else {
                // 兼容旧明文密码
                let matched = password == user.password;
                if matched {
                    // 自动升级为 bcrypt hash
                    if let Ok(hashed) = bcrypt::hash(password, bcrypt::DEFAULT_COST) {
                        let sql = format!(
                            "UPDATE tb_user SET password = '{}' WHERE id = {}",
                            hashed.replace('\'', "''"),
                            user.id.unwrap_or(0)
                        );
                        let _ = db.exec(&sql, vec![]).await;
                        info!("upgraded plaintext password to bcrypt for user: {}", username);
                    }
                }
                matched
            };

            if !password_valid {
                return Err(Exception::BadRequest("账号或密码错误!".to_string()));
            }

            if user.locked == 1 {
                return Err(Exception::BadRequest("当前账号已被锁定".to_string()));
            }

            let token = create_jwt(
                user.id.unwrap_or_default(),
                &user.username,
                &user.role,
            )?;
            user.filter_pwd();
            info!("login success -> {:?}", user);

            let cookie = Cookie::build(AUTH_COOKIE_NAME, token)
                .path("/")
                .http_only(true)
                .same_site(SameSite::Lax)
                .finish();

            Ok(HttpResponse::Ok()
                .cookie(cookie)
                .json(R::<User>::ok_msg_obj("登录成功!", user.clone())))
        }
        Err(e) => {
            error!("{}", e);
            Err(Exception::BadRequest("Error".to_string()))
        }
    }
}

#[post("/logout")]
pub async fn api_logout() -> Result<impl Responder, Exception> {
    info!("api_logout in");
    let cookie = Cookie::build(AUTH_COOKIE_NAME, "")
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(0))
        .finish();

    Ok(HttpResponse::Ok().cookie(cookie).json(R::<()>::ok()))
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
#[get("/admin/get/{id}")]
pub async fn api_user_get_admin(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    if let Ok(mut res) = User::select_by_id(&**db, *id).await {
        if res.is_empty() {
            return Err(Exception::NotFound);
        }
        let mut user = res.pop().unwrap();
        user.filter_pwd();
        Ok(R::<User>::ok_obj(user))
    } else {
        Err(Exception::InternalError)
    }
}

#[instrument]
#[post("/admin/add")]
async fn api_user_add(
    user: web::Json<User>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    if user.username.trim().is_empty() || user.password.trim().is_empty() {
        return Err(Exception::BadRequest("用户名和密码不能为空".to_string()));
    }

    let exists = User::select_by_username(&**db, &user.username)
        .await
        .map_err(|_| Exception::InternalError)?;
    if !exists.is_empty() {
        return Err(Exception::BadRequest("用户名已存在".to_string()));
    }

    let hashed_password = bcrypt::hash(&user.password, bcrypt::DEFAULT_COST)
        .map_err(|_| Exception::InternalError)?;

    let mut new_user = User::new(&user.username, &hashed_password, &user.nick_name);
    new_user.gender = user.gender;
    new_user.avatar_path = user.avatar_path.clone();
    new_user.signature = user.signature.clone();
    new_user.locked = user.locked;
    new_user.role = if user.role.trim().is_empty() {
        "user".to_string()
    } else {
        user.role.clone()
    };

    User::insert(&**db, &new_user)
        .await
        .map_err(|_| Exception::BadRequest("添加失败".to_string()))?;

    Ok(R::<()>::ok_msg("添加成功!"))
}

#[instrument]
#[post("/admin/list/page")]
async fn api_user_list_page(
    query: web::Json<UserPageQuery>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let page_num = if query.page_num <= 0 { 1 } else { query.page_num };
    let page_size = if query.page_size <= 0 { 10 } else { query.page_size };
    let offset = (page_num - 1) * page_size;
    let keyword = query.keyword.as_deref();
    let status = query.status;

    let total = User::count_filtered(&**db, keyword, status).await;
    let mut list = User::select_page_filtered(&**db, offset, page_size, keyword, status)
        .await
        .map_err(|_| Exception::InternalError)?;
    list.iter_mut().for_each(|user| user.filter_pwd());

    Ok(R::ok_obj(serde_json::json!({
        "page_num": page_num,
        "page_size": page_size,
        "total": total,
        "list": list,
    })))
}

#[instrument]
#[post("/admin/update")]
async fn api_user_update(
    user: web::Json<User>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let Some(user_id) = user.id else {
        return Err(Exception::BadRequest("用户不存在!".to_string()));
    };

    let mut existing_users = User::select_by_id(&**db, user_id)
        .await
        .map_err(|_| Exception::InternalError)?;
    if existing_users.is_empty() {
        return Err(Exception::NotFound);
    }
    let mut existing = existing_users.pop().unwrap();

    let same_name_users = User::select_by_username(&**db, &user.username)
        .await
        .map_err(|_| Exception::InternalError)?;
    if same_name_users
        .iter()
        .any(|item| item.id != Some(user_id))
    {
        return Err(Exception::BadRequest("用户名已存在".to_string()));
    }

    existing.username = user.username.clone();
    existing.nick_name = user.nick_name.clone();
    existing.gender = user.gender;
    existing.avatar_path = user.avatar_path.clone();
    existing.signature = user.signature.clone();
    existing.locked = user.locked;
    if !user.role.trim().is_empty() {
        existing.role = user.role.clone();
    }
    if !user.password.trim().is_empty() {
        existing.password = bcrypt::hash(&user.password, bcrypt::DEFAULT_COST)
            .map_err(|_| Exception::InternalError)?;
    }

    User::update_by_column(&**db, &existing, "id")
        .await
        .map_err(|_| Exception::BadRequest("更新失败，请重试".to_string()))?;

    Ok(R::<()>::ok_msg("更新成功!"))
}

#[instrument]
#[get("/admin/del/{id}")]
async fn api_user_del(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    User::delete_by_column(&**db, "id", &*id)
        .await
        .map_err(|_| Exception::BadRequest("删除失败!".to_string()))?;
    Ok(R::<()>::ok_msg("删除成功!"))
}

#[instrument]
#[get("/admin/lock/{id}")]
async fn api_user_lock(
    id: web::Path<i32>,
    db: web::Data<RBatis>,
) -> Result<impl Responder, Exception> {
    let mut users = User::select_by_id(&**db, *id)
        .await
        .map_err(|_| Exception::InternalError)?;
    if users.is_empty() {
        return Err(Exception::NotFound);
    }
    let mut user = users.pop().unwrap();
    user.locked = if user.locked == 1 { 0 } else { 1 };
    User::update_by_column(&**db, &user, "id")
        .await
        .map_err(|_| Exception::BadRequest("操作失败，请重试".to_string()))?;
    Ok(R::<()>::ok_msg("操作成功!"))
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
