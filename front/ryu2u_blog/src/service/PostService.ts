import http_client from "../common/HttpClient";
import {PageInfo, Result} from "../common/Structs";

namespace PostService {
    export function getPostById(id: number): Promise<Result> {
        return http_client.get(`/post/get/${id}`);
    }

    export function postListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/page`, pageInfo);
    }


}

export default PostService;