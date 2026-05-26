use actix_session::SessionExt;
use std::future::{ready, Ready};

use crate::AppState;
use crate::user::structs::User;
use actix_web::http::Method;
use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    error, web, Error,
};
use futures_util::future::LocalBoxFuture;
use rbatis::RBatis;
use tracing::log::{error, info};

// There are two steps in middleware processing.
// 1. Middleware initialization, middleware factory gets called with
//    next service in chain as parameter.
// 2. Middleware's call method gets called with normal request.
/// 权限过滤器
pub struct AuthFilter;

/// 过滤器白名单
pub struct FilterWhiteList<'a>(pub Vec<&'a str>);

// Middleware factory is `Transform` trait
// `S` - type of the next service
// `B` - type of response's body
impl<S, B> Transform<S, ServiceRequest> for AuthFilter
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = AuthFilterMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthFilterMiddleware { service }))
    }
}

pub struct AuthFilterMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for AuthFilterMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    /// 权限过滤器验证
    fn call(&self, req: ServiceRequest) -> Self::Future {
        let url = req.path();
        info!("request url is : {} {} ", req.method(), url);
        if req.method() == Method::OPTIONS {
            let fut = self.service.call(req);
            return Box::pin(async move { fut.await });
        }

        let state_op: Option<&web::Data<AppState>> = req.app_data();
        let white_list_op: Option<&FilterWhiteList> = req.app_data();

        if let Some(app_state) = state_op {
            info!("app_state : {}", app_state.app_name);
        }

        match white_list_op {
            None => {
                Box::pin(async move { Err(error::ErrorUnauthorized("unauthorized")) })
                // Box::pin(async move { Err(Exception::NotFound) })
            }
            Some(white_list) => {
                let white_list = &white_list.0;
                info!("white_list : {:?}", white_list);
                let mut valid: bool = false;
                'outer: for str in white_list {
                    let white_url_vec: Vec<&str> =
                        str.split("/").filter(|v| !v.is_empty()).collect();
                    let url_vec: Vec<&str> = url.split("/").filter(|v| !v.is_empty()).collect();
                    if url_vec.len() < white_url_vec.len() {
                        continue;
                    }
                    for i in 0..white_url_vec.len() {
                        let a = white_url_vec[i];
                        let b = url_vec[i];
                        if a == "**" {
                            valid = true;
                            break 'outer;
                        }
                        if a == b || a == "*" {
                            continue;
                        }
                        if a != b {
                            continue 'outer;
                        }
                    }
                    valid = true;
                    break;
                }

                if valid {
                    let fut = self.service.call(req);
                    return Box::pin(async move { fut.await });
                }

                // 验证身份
                let url_for_role = url.to_string();
                let session = req.get_session();
                let user_id = match session.get::<i32>("user_id") {
                    Ok(Some(id)) => id,
                    _ => {
                        error!("unable to verify identity!");
                        return Box::pin(async move { Err(error::ErrorUnauthorized("unauthorized")) });
                    }
                };
                info!("session: id -> {user_id}");

                // 检查是否为管理员路由
                let db = req.app_data::<web::Data<RBatis>>().cloned();
                let app_state = req.app_data::<web::Data<AppState>>().cloned();
                let is_admin_route = app_state.as_ref().map_or(false, |s| {
                    s.admin_route_prefixes
                        .iter()
                        .any(|p| url_for_role.starts_with(p))
                });

                if !is_admin_route {
                    info!("non-admin route, authenticated user passes");
                    let fut = self.service.call(req);
                    return Box::pin(async move { fut.await });
                }

                // 管理员路由：需要验证 role
                info!("admin route check for user_id: {}", user_id);
                let fut = self.service.call(req);
                Box::pin(async move {
                    if let Some(ref db) = db {
                        match User::select_by_id(db.as_ref(), user_id).await {
                            Ok(users) => {
                                if !users.is_empty() && users[0].role == "admin" {
                                    return fut.await;
                                }
                                error!("user {} is not admin, access denied", user_id);
                                Err(error::ErrorForbidden("admin role required"))
                            }
                            Err(e) => {
                                error!("db error checking role: {}", e);
                                Err(error::ErrorInternalServerError("db error"))
                            }
                        }
                    } else {
                        error!("no db available for role check");
                        Err(error::ErrorForbidden("admin role required"))
                    }
                })
            }
        }
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
