import http_client from "../common/HttpClient";
import {PageInfo, Post, Result} from "../common/Structs";

namespace PostService {

    export function post_add(post: Post): Promise<Result> {
        return http_client.post(`/post/add`, post);
    }

    export function postListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/page`, pageInfo);
    }

}

export default PostService;
