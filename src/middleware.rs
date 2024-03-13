use std::future::{ready, Ready};
use actix_session::SessionExt;

use crate::{AppState};
use actix_web::{dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform}, error, Error, web};
use actix_web::http::Method;
use futures_util::future::LocalBoxFuture;
use tracing::log::{error, info};

// There are two steps in middleware processing.
// 1. Middleware initialization, middleware factory gets called with
//    next service in chain as parameter.
// 2. Middleware's call method gets called with normal request.
pub struct AuthFilter;

// 过滤器白名单
pub struct FilterWhiteList<'a>(pub Vec<&'a str>);

// Middleware factory is `Transform` trait
// `S` - type of the next service
// `B` - type of response's body
impl<S, B> Transform<S, ServiceRequest> for AuthFilter
    where
        S: Service<ServiceRequest, Response=ServiceResponse<B>, Error=Error>,
        S::Future: 'static,
        B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = SayHiMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(SayHiMiddleware { service }))
    }
}

pub struct SayHiMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for SayHiMiddleware<S>
    where
        S: Service<ServiceRequest, Response=ServiceResponse<B>, Error=Error>,
        S::Future: 'static,
        B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let url = req.path();
        info!("request url is : {} {} ",req.method(), url);
        if req.method() == Method::OPTIONS {
            let fut = self.service.call(req);
            return Box::pin(async move { Ok(fut.await?) });
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
                info!("white_list : {:?}",white_list);
                let mut valid: bool = false;
                let _ = white_list.iter().for_each(|str| {
                    if url.contains(str) {
                        valid = true;
                    }
                });

                if valid {
                    let fut = self.service.call(req);
                    return Box::pin(async move { Ok(fut.await?) });
                }

                // todo 验证身份
                let session = req.get_session();

                if let Ok(Some(id)) = session.get::<i32>("user_id") {
                    info!("session: id -> {id}");
                    valid = true;
                }

                if valid {
                    let fut = self.service.call(req);
                    return Box::pin(async move { Ok(fut.await?) });
                } else {
                    // Unable to verify identity
                    error!("unable to verify identity!");
                    Box::pin(async move { Err(error::ErrorUnauthorized("unauthorized")) })
                }
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