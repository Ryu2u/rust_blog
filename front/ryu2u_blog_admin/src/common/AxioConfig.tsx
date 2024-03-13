import {Fragment, useEffect} from "react";
import axios, {AxiosError} from "axios";
import {useNavigate} from "react-router";
import {message} from "antd";
import {Result} from "./Structs";
import {useLog} from "./log";

export const http_client = axios.create();

http_client.defaults.withCredentials = true;
http_client.defaults.baseURL = "http://localhost:8002";

message.config({
    top: 50,
    duration: 2,
    maxCount: 4,
    rtl: false,
});

// 服务封装
function useAjaxEffect1() {
    const {writeRef} = useLog();
    const navigate = useNavigate();

    useEffect(() => {

        function request(config) {
            console.log(`new request: ${config.url}`);
            writeRef.current(`新请求：${config.url}`);
            return config;
        }

        function fail(error: AxiosError) {
            console.log(`request failed: ${error.message}`);
            writeRef.current(`请求失败：${error.message}`);
            if (error.response) {
                let data:Result = error.response.data as any;
                if (data){
                    message.error(data.msg);
                }
            } else {
                navigate('/login');
            }
            return Promise.reject(error);
        }

        function success(response) {
            console.log(`request success: `);
            console.log(response.data);
            writeRef.current(`响应成功：${response.config.url}`);
            if (response.data) {
                let result: Result = response.data;
                return Promise.resolve(result as any);
            }
            return Promise.resolve(response);
        }

        const inter1 = http_client.interceptors.request.use(request, fail);
        const inter2 = http_client.interceptors.response.use(success, fail);

        return () => {
            http_client.interceptors.request.eject(inter1);
            http_client.interceptors.response.eject(inter2);
        };
    }, [])
}

function useAjaxEffect2() {

}

// 服务钩子集合
export function useAjaxEffect() {
    useAjaxEffect1();
    useAjaxEffect2();
}

// 服务片段
export function HttpEffectFragment() {
    useAjaxEffect();
    return <Fragment/>;
}
