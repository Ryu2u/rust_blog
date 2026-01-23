import {Result} from "../../../ryu2u_blog_admin/src/common/Structs.ts";
import {http_client} from "../../../ryu2u_blog_admin/src/common/AxioConfig.tsx";

export default {
    tagList(): Promise<Result> {
        return http_client.post("/tag/list");
    }
}
