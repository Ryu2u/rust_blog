import {Result} from "../common/Structs";
import http_client from "../common/HttpClient";

export default {
    /** 公开说说分页（无需登录）：obj 为 PageInfo，list 是 Moment[] */
    page(pageNum: number, pageSize: number): Promise<Result> {
        return http_client.post("/moment/page", {
            page_num: pageNum,
            page_size: pageSize,
        });
    }
}
