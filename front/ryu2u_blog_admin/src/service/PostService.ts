import {PageInfo, Post, Result} from "../common/Structs";
import {http_client} from "../common/AxioConfig";


export default {
    post_add(post: Post): Promise<Result> {
        return http_client.post(`/post/add`, post);
    },
    postListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/admin/list/page`, pageInfo);
    },
    post_get(id: number): Promise<Result> {
        return http_client.get(`/post/admin/get/${id}`);
    },
    post_update(data: Post): Promise<Result> {
        return http_client.post(`/post/admin/update`, data);
    },
    post_delete(id: number): Promise<Result> {
        return http_client.get(`/post/admin/del/${id}`);
    },
    post_upload(formData: FormData): Promise<Result> {
        return http_client.post(`/post/test/form`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        });
    }
}
