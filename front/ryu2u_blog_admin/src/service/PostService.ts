import {PageInfo, Post, Result} from "../common/Structs";
import {http_client} from "../common/AxioConfig";


namespace PostService {

    export function post_add(post: Post): Promise<Result> {
        return http_client.post(`/post/add`, post);
    }

    export function postListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/admin/list/page`, pageInfo);
    }

    export function post_get(id: number): Promise<Result> {
        return http_client.get(`/post/admin/get/${id}`);
    }

    export function post_update(data: Post): Promise<Result> {
        return http_client.post(`/post/admin/update`, data);
    }

    export function post_delete(id: number): Promise<Result> {
        return http_client.get(`/post/admin/del/${id}`);
    }
}

export default PostService;
