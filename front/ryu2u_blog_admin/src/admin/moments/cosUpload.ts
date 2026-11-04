import type {UploadSign} from "../../common/Structs";

/** 后台允许上传的图片类型。后端有同样的白名单，这里只是提前给出友好提示 */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');

/** 一条说说最多几张图 */
export const MAX_IMAGES = 9;

/** 单张上限（MB）。与后端 COS_MAX_IMAGE_MB 的默认值一致；后端配置不同时以后端的提示为准 */
export const MAX_IMAGE_MB = 5;

/**
 * 把文件直传到 COS（预签名链接），文件字节不经过后端。
 *
 * 注意：这里故意不用 axios 的 http_client——它的拦截器遇到「没有响应」的网络错误会跳转到登录页，
 * 而直传 COS 时 CORS 配置不对恰恰就是这种错误。XHR 默认也不带 cookie，不要设置 withCredentials。
 */
export function putToCos(sign: UploadSign, file: Blob, onPercent: (percent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', sign.upload_url);
        // 必须与后端返回的 content_type 完全一致：它已经被签进链接
        xhr.setRequestHeader('Content-Type', sign.content_type);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onPercent(Math.round((event.loaded * 100) / event.total));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error(`上传失败（HTTP ${xhr.status}）`));
            }
        };
        // 浏览器不会暴露 CORS 失败的细节，只给一个没有响应的网络错误
        xhr.onerror = () => reject(new Error('上传失败，请检查桶的跨域（CORS）配置和网络'));
        xhr.ontimeout = () => reject(new Error('上传超时'));
        xhr.send(file);
    });
}
