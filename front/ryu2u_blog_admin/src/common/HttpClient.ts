import axios, {AxiosError} from "axios";
import {Result} from "./Structs";
import {message} from "antd";


const http_client = axios.create({});

http_client.defaults.withCredentials = true;
http_client.defaults.baseURL = "http://localhost:8002";
message.config({
    top: 50,
    duration: 2,
    maxCount: 4,
    rtl: false,
});

//一些配置，发起请求和响应可以打印出来查看
http_client.interceptors.request.use((config) => {
    if (config.method === 'get') {
        //  给data赋值以绕过if判断
        config.data = true
    }
    if (!config.headers.getContentType) {
        config.headers.setContentType("application/json");
    }
    //这里是用户登录的时候，将token写入了sessionStorage中了，之后进行其他的接口操作时，进行身份验证。
    // config.headers.token = localStorage.getItem("cookie");
    return config;
});

//在response中
http_client.interceptors.response.use((config) => {
    if (config.status == 200) {
        return config.data;
    }
    return config;
}, (error: AxiosError) => {
    if (error.response) {
        let result: Result = error.response.data as any;
        if (result.msg) {
            message.error(result.msg);
        }
    } else {
        message.error("请求失败!");
    }
})

export default http_client;
