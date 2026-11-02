import axios from "axios";


const http_client = axios.create({
});

http_client.defaults.baseURL = "http://localhost:9002";
// 登录凭证在 httpOnly Cookie 里，跨端口请求必须显式带上
http_client.defaults.withCredentials = true;

let unauthorizedHandler: (() => void) | null = null;

/** AuthProvider 注册：任何请求收到 HTTP 401 时回调，用来清空登录状态 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
    unauthorizedHandler = handler;
}

//一些配置，发起请求和响应可以打印出来查看
http_client.interceptors.request.use((config)=>{
    if (config.method === 'get') {
        //  给data赋值以绕过if判断
        config.data = true
    }
    config.headers.setContentType("application/json");
    return config;
});

//在response中
http_client.interceptors.response.use((config) =>{
    if (config.status == 200){
        return config.data;
    }
    return config;
}, (error) => {
    if (error?.response?.status === 401) {
        unauthorizedHandler?.();
    }
    return Promise.reject(error);
});

export  default http_client;
