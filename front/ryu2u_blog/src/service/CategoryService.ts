import {Result} from "../../../ryu2u_blog_admin/src/common/Structs.ts";
import http_client from "../common/HttpClient.ts";

export default {
    categoryList(): Promise<Result> {
        return http_client.post("/category/list");
    }
}
