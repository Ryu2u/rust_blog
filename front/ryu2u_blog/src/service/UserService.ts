import {Result} from "../common/Structs";
import http_client from "../common/HttpClient";

export default {
    /** 登录：成功后服务端通过 httpOnly Cookie 下发凭证，响应 obj 是用户信息 */
    login(username: string, password: string): Promise<Result> {
        // LoginDto.remember 是必填 bool，博客不提供「记住我」，固定传 false
        return http_client.post("/user/login", {username, password, remember: false});
    },

    /** 退出登录：服务端清除 Cookie */
    logout(): Promise<Result> {
        return http_client.post("/user/logout");
    },

    /** 当前登录用户；未登录返回 HTTP 401 */
    me(): Promise<Result> {
        return http_client.get("/user/me");
    },
}
