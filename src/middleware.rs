use std::future::{ready, Ready};
use std::rc::Rc;

use crate::user::structs::{AuthUser, User};
use crate::utils::jwt_utils::{verify_jwt, AUTH_COOKIE_NAME};
use crate::AppState;
use actix_web::body::EitherBody;
use actix_web::http::Method;
use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    error, web, Error, HttpMessage,
};
use futures_util::future::LocalBoxFuture;
use rbatis::RBatis;
use tracing::log::{error, info};

/// 无需登录即可访问的路径；其余一律要求有效登录。
/// 这个列表就是整个站点的「大门」，新增公开接口前请三思。
pub const PUBLIC_PATHS: &[&str] = &["/user/login", "/user/logout"];

// There are two steps in middleware processing.
// 1. Middleware initialization, middleware factory gets called with
//    next service in chain as parameter.
// 2. Middleware's call method gets called with normal request.
/// 权限过滤器
pub struct AuthFilter;

/// 过滤器白名单
pub struct FilterWhiteList<'a>(pub Vec<&'a str>);

/// 白名单匹配（逐段）：`*` 匹配恰好一段，`**` 匹配剩余全部；
/// 白名单条目同样覆盖更长的 URL（`/comment/list` 覆盖 `/comment/list/5`）。空条目不匹配任何路径。
pub fn is_white_listed(path: &str, white_list: &[&str]) -> bool {
    let url_vec: Vec<&str> = path.split('/').filter(|v| !v.is_empty()).collect();
    'outer: for entry in white_list {
        let white_vec: Vec<&str> = entry.split('/').filter(|v| !v.is_empty()).collect();
        if white_vec.is_empty() || url_vec.len() < white_vec.len() {
            continue;
        }
        for (i, seg) in white_vec.iter().enumerate() {
            if *seg == "**" {
                return true;
            }
            if *seg == "*" || *seg == url_vec[i] {
                continue;
            }
            continue 'outer;
        }
        return true;
    }
    false
}

/// 鉴权。`Ok(None)`：公开路径，无需登录；`Ok(Some(user))`：已登录且账号状态正常；`Err`：拒绝。
/// - 没配白名单时一律拒绝，而不是一律放行
/// - 必须带有效 JWT，并且账号在库里存在、未被锁定（每次请求都查，锁定立即生效）
/// - 命中管理员路由前缀的，还要求库里的 role 是 admin
async fn authorize(req: &ServiceRequest, path: &str) -> Result<Option<AuthUser>, Error> {
    let is_public = match req.app_data::<FilterWhiteList>() {
        Some(white_list) => is_white_listed(path, &white_list.0),
        None => return Err(error::ErrorUnauthorized("unauthorized")),
    };
    if is_public {
        return Ok(None);
    }

    let claims = match req.cookie(AUTH_COOKIE_NAME).map(|c| c.value().to_string()) {
        Some(token) => match verify_jwt(&token) {
            Ok(claims) => claims,
            Err(_) => {
                error!("jwt verify failed");
                return Err(error::ErrorUnauthorized("unauthorized"));
            }
        },
        None => {
            error!("unable to verify identity!");
            return Err(error::ErrorUnauthorized("unauthorized"));
        }
    };

    let Some(db) = req.app_data::<web::Data<RBatis>>().cloned() else {
        error!("no db available for auth check");
        return Err(error::ErrorInternalServerError("db error"));
    };
    let user = match User::select_by_id(db.as_ref(), claims.sub).await {
        Ok(mut rows) => match rows.pop() {
            Some(user) => user,
            None => {
                error!("user {} no longer exists, access denied", claims.sub);
                return Err(error::ErrorUnauthorized("unauthorized"));
            }
        },
        Err(e) => {
            error!("db error checking user: {}", e);
            return Err(error::ErrorInternalServerError("db error"));
        }
    };
    if user.locked != 0 {
        error!("user {} is locked, access denied", claims.sub);
        return Err(error::ErrorUnauthorized("unauthorized"));
    }

    let is_admin_route = req
        .app_data::<web::Data<AppState>>()
        .map_or(false, |s| s.admin_route_prefixes.iter().any(|p| path.starts_with(p)));
    if is_admin_route && !user.is_admin() {
        error!("user {} is not admin, access denied", claims.sub);
        return Err(error::ErrorForbidden("admin role required"));
    }

    Ok(Some(AuthUser::from(&user)))
}

// Middleware factory is `Transform` trait
// `S` - type of the next service
// `B` - type of response's body
impl<S, B> Transform<S, ServiceRequest> for AuthFilter
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = AuthFilterMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthFilterMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct AuthFilterMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for AuthFilterMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    /// 权限过滤：OPTIONS 预检直接放行；其余请求交给 `authorize`，通过后把 AuthUser 放进请求扩展。
    ///
    /// 拒绝时返回的是「正常的 401/403 响应」（响应体包在 `EitherBody` 的右侧），而不是 `Err`：
    /// `Err` 会一路向外冒泡，绕过外层的 CORS 中间件，响应就不带 CORS 头了，
    /// 浏览器会把跨域的 401 当成网络错误，前端读不到状态码。
    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Rc::clone(&self.service);
        Box::pin(async move {
            let path = req.path().to_string();
            info!("request url is : {} {} ", req.method(), path);
            if req.method() == Method::OPTIONS {
                return service.call(req).await.map(|res| res.map_into_left_body());
            }

            match authorize(&req, &path).await {
                Ok(user) => {
                    if let Some(user) = user {
                        req.extensions_mut().insert(user);
                    }
                    service.call(req).await.map(|res| res.map_into_left_body())
                }
                Err(e) => Ok(req.error_response(e).map_into_right_body()),
            }
        })
    }
}

#[test]
fn test_contains() {
    let vec = &vec!["/post/get"];
    let _ = vec.iter().for_each(|str| println!("{str}"));
    assert!("/post/get/1".contains("/post/get"));
}

#[test]
fn test_split() {
    let url = "/post/get";
    let vec: Vec<&str> = url.split("/").filter(|v| !v.is_empty()).collect();
    println!("{:?}", vec);
}

#[cfg(test)]
mod gate_tests {
    use super::*;
    use actix_web::http::StatusCode;
    // 注意：必须重命名导入。直接 `use actix_web::test` 会把标准库的 #[test] 属性也一并遮蔽，
    // 普通同步测试会被当成 actix 的异步测试而编译失败。
    use actix_web::{test as actix_test, App, HttpResponse};

    #[test]
    fn white_list_matches_segment_wise() {
        let list = ["/user/login", "/post/list_by_category/*", "/category/**"];
        assert!(is_white_listed("/user/login", &list));
        assert!(is_white_listed("/user/login/extra", &list), "条目同样覆盖更长的 URL");
        assert!(!is_white_listed("/user/logi", &list));
        assert!(!is_white_listed("/user", &list));
        assert!(is_white_listed("/post/list_by_category/Rust", &list), "* 匹配恰好一段");
        assert!(!is_white_listed("/post/list_by_category", &list));
        assert!(is_white_listed("/category/list", &list));
        assert!(is_white_listed("/category/a/b/c", &list), "** 匹配剩余全部");
        assert!(!is_white_listed("/category", &list), "** 至少要有一段");
    }

    #[test]
    fn empty_white_list_entries_never_match() {
        for entry in ["", "/", "//"] {
            assert!(!is_white_listed("/post/page", &[entry]), "{entry:?} 不能放行任何路径");
        }
        assert!(!is_white_listed("/post/page", &[]));
    }

    #[test]
    fn only_login_and_logout_are_public() {
        assert_eq!(PUBLIC_PATHS, &["/user/login", "/user/logout"]);
        for p in ["/user/login", "/user/logout"] {
            assert!(is_white_listed(p, PUBLIC_PATHS), "{p} 应公开");
        }
        let must_be_protected = [
            "/post/page",
            "/post/get/1",
            "/post/list_by_category/Rust",
            "/category/list",
            "/comment/add",
            "/comment/list/3",
            "/tag/cloud",
            "/tag/posts",
            "/tag/post/1",
            "/moment/page",
            "/user/get/1",
            "/user/me",
            "/user/admin/list/page",
            "/moment/admin/list/page",
            "/note_sync/admin/config",
        ];
        for p in must_be_protected {
            assert!(!is_white_listed(p, PUBLIC_PATHS), "{p} 不应公开");
        }
    }

    async fn ok() -> HttpResponse {
        HttpResponse::Ok().finish()
    }

    /// 发请求并取状态码：拒绝时中间件返回的是正常的 401 响应；
    /// 内层服务若返回 Err，就取 Error 对应的响应状态码
    macro_rules! status_of {
        ($app:expr, $req:expr) => {
            match actix_test::try_call_service(&$app, $req).await {
                Ok(res) => res.status(),
                Err(e) => e.as_response_error().status_code(),
            }
        };
    }

    #[actix_web::test]
    async fn protected_path_without_cookie_is_401() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let status = status_of!(app, actix_test::TestRequest::post().uri("/post/page").to_request());
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn garbage_cookie_is_401() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let req = actix_test::TestRequest::post()
            .uri("/post/page")
            .insert_header(("Cookie", "auth_token=not-a-jwt"))
            .to_request();
        assert_eq!(status_of!(app, req), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn public_path_needs_no_cookie() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/user/login", actix_web::web::post().to(ok)),
        )
        .await;
        let status = status_of!(app, actix_test::TestRequest::post().uri("/user/login").to_request());
        assert_eq!(status, StatusCode::OK);
    }

    #[actix_web::test]
    async fn missing_white_list_fails_closed() {
        let app = actix_test::init_service(
            App::new()
                .wrap(AuthFilter)
                .route("/user/login", actix_web::web::post().to(ok)),
        )
        .await;
        let status = status_of!(app, actix_test::TestRequest::post().uri("/user/login").to_request());
        assert_eq!(status, StatusCode::UNAUTHORIZED, "没配白名单时一律拒绝，而不是一律放行");
    }

    #[actix_web::test]
    async fn cors_preflight_is_not_blocked() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let req = actix_test::TestRequest::default()
            .method(actix_web::http::Method::OPTIONS)
            .uri("/post/page")
            .to_request();
        assert_ne!(status_of!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// 回归测试：被拒绝的 401 必须带 CORS 头，否则浏览器会把跨域的 401 当成网络错误，
    /// 前端读不到状态码，「401 → 回登录页」就不会触发。
    /// 条件有两个：Cors 在最外层（main.rs 里 .wrap(AuthFilter) 在前、.wrap(cors) 在后），
    /// 且 AuthFilter 拒绝时返回的是正常响应而不是 Err（Err 会绕过外层的 Cors 中间件）。
    #[actix_web::test]
    async fn denied_response_still_carries_cors_headers() {
        use actix_cors::Cors;
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .wrap(
                    Cors::default()
                        .allowed_origin("http://localhost:8188")
                        .supports_credentials(),
                )
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let req = actix_test::TestRequest::post()
            .uri("/post/page")
            .insert_header(("Origin", "http://localhost:8188"))
            .to_request();
        let res = actix_test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        let allow_origin = res.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap());
        assert_eq!(allow_origin, Some("http://localhost:8188"));
        let allow_creds = res.headers().get("access-control-allow-credentials").map(|v| v.to_str().unwrap());
        assert_eq!(allow_creds, Some("true"));
    }
}
