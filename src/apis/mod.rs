use actix_web::{Responder, web};
use crate::{AppState, R, UserError};
use tracing::{event, instrument, Level, span};
use tracing::log::{info};

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
pub async fn api_result() -> Result<impl Responder, UserError> {
    let _res = R {
        code: 200,
        msg: "OK".to_string(),
        obj: "123".to_string(),
    };
    // Ok(res)
    Err::<R<String>, UserError>(
        UserError::InternalError
    )
}

#[cfg(test)]
mod test {
    use actix_web::{App, test, web};
    use crate::{api_greet, api_result};

    #[actix_web::test]
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
