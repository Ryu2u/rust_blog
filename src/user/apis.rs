use crate::user::login_support::{
    auth_cookie, burn_dummy_verify, check_password, clear_auth_cookie, cookie_secure,
    sanitize_for_log, validate_login_input, PasswordCheck,
};
use crate::user::structs::{AuthUser, LoginDto};
use crate::utils::client_ip::client_ip;
use crate::utils::jwt_utils::{create_jwt, jwt_exp_hours};
use crate::utils::login_guard::LoginGuard;
use crate::{error, Exception, User, R};
use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use rbatis::RBatis;
use serde::Deserialize;
use std::time::Instant;
use tracing::instrument;
use tracing::log::{info, warn};

/// 用户 接口
pub fn user_scope() -> actix_web::Scope {
    actix_web::web::scope("/user")
        // 登录接口单独限制请求体大小，超出由 Actix 直接返回 413
        .service(
            web::resource("/login")
                .app_data(web::JsonConfig::default().limit(LOGIN_BODY_LIMIT))
                .route(web::post().to(api_login)),
        )
        .service(api_logout)
        .service(api_user_me)
        .service(api_user_get)
        .service(api_user_get_admin)
        .service(api_user_add)
        .service(api_user_list_page)
        .service(api_user_update)
        .service(api_user_del)
        .service(api_user_lock)
}

#[derive(Debug, Deserialize)]
struct UserPageQuery {
    page_num: i32,
    page_size: i32,
    keyword: Option<String>,
    status: Option<i32>,
}

/// 登录请求体上限（字节）。正常的用户名 + 密码远小于这个值，防止被喂超大请求体
const LOGIN_BODY_LIMIT: usize = 4096;

/// 登录失败：记一次失败、写一条 warn（不含密码），统一返回「账号或密码错误!」
fn fail_login(guard: &LoginGuard, ip: &str, username: &str) -> Exception {
    guard.record_failure(ip, username, Instant::now());
    warn!("login failed: ip={} username={}", ip, sanitize_for_log(username));
    Exception::BadRequest("账号或密码错误!".to_string())
}

/// 旧明文密码登录成功后升级为 bcrypt；全程绑定参数，不拼接 SQL
async fn upgrade_password_hash(db: &RBatis, user_id: i32, plain: &str) {
    match bcrypt::hash(plain, bcrypt::DEFAULT_COST) {
        Ok(hashed) => {
            let res = db
                .exec(
                    "update tb_user set password = ? where id = ?",
                    vec![rbs::to_value!(hashed), rbs::to_value!(user_id)],
                )
                .await;
            match res {
                Ok(_) => info!("upgraded plaintext password to bcrypt for user id: {}", user_id),
                Err(e) => error!("upgrade password hash failed for user id {}: {}", user_id, e),
            }
        }
        Err(e) => error!("bcrypt hash failed during upgrade: {}", e),
    }
}

/// 登录。顺序很重要：先查锁（被锁时不查库、不算 bcrypt），再校验密码；
/// 用户不存在时也做一次等价的 bcrypt 校验，抹平响应时间差。
pub async fn api_login(
    req: HttpRequest,
    login_dto: web::Json<LoginDto>,
    db: web::Data<RBatis>,
    guard: web::Data<LoginGuard>,
) -> Result<impl Responder, Exception> {
    let username = login_dto.username.as_str();
    let password = login_dto.password.as_str();
    validate_login_input(username, password)?;

    let ip = client_ip(&req);
    if let Err(retry_after_secs) = guard.check(&ip, username, Instant::now()) {
        warn!("login locked: ip={} username={}", ip, sanitize_for_log(username));
        return Err(Exception::too_many_requests(retry_after_secs));
    }

    let found = User::select_by_username(&**db, username).await.map_err(|e| {
        error!("login query failed: {}", e);
        Exception::InternalError
    })?;
    let Some(mut user) = found.into_iter().next() else {
        burn_dummy_verify(password);
        return Err(fail_login(&guard, &ip, username));
    };

    let upgrade_needed = match check_password(&user.password, password) {
        PasswordCheck::Valid { upgrade_needed } => upgrade_needed,
        PasswordCheck::Invalid => return Err(fail_login(&guard, &ip, username)),
    };

    // 密码正确但账号被锁：只对知道密码的人透露「已锁定」，不算一次失败
    if user.locked == 1 {
        return Err(Exception::BadRequest("当前账号已被锁定".to_string()));
    }

    guard.record_success(&ip, username);
    if upgrade_needed {
        if let Some(id) = user.id {
            upgrade_password_hash(&**db, id, password).await;
        }
    }

    let token = create_jwt(user.id.unwrap_or_default(), &user.username, &user.role)?;
    user.filter_pwd();
    info!("login success: id={:?} username={}", user.id, sanitize_for_log(&user.username));

    let cookie = auth_cookie(&token, jwt_exp_hours(), cookie_secure());
    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(R::<User>::ok_msg_obj("登录成功!", user)))
}

#[post("/logout")]
pub async fn api_logout() -> Result<impl Responder, Exception> {
    info!("api_logout in");
    let cookie = clear_auth_cookie(cookie_secure());

    Ok(HttpResponse::Ok().cookie(cookie).json(R::<()>::ok()))
}

/// 当前登录用户（需登录）。中间件已校验账号状态，并把 AuthUser 放进了请求扩展。
#[get("/me")]
pub async fn api_user_me(user: web::ReqData<AuthUser>) -> Result<impl Responder, Exception> {
    Ok(R::ok_obj(user.into_inner()))
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
mod login_tests {
    use super::*;
    use crate::utils::login_guard::LoginGuardConfig;

    #[test]
    fn fail_login_records_a_failure_and_returns_a_uniform_message() {
        let guard = LoginGuard::new(LoginGuardConfig::default());
        for _ in 0..4 {
            let e = fail_login(&guard, "10.0.0.1", "alice");
            assert_eq!(e.to_string(), "账号或密码错误!");
        }
        assert!(guard.check("10.0.0.1", "alice", Instant::now()).is_ok(), "4 次还不该锁");
        fail_login(&guard, "10.0.0.1", "alice");
        assert!(guard.check("10.0.0.1", "alice", Instant::now()).is_err(), "第 5 次应锁定");
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
