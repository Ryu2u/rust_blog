import { Result } from "../common/Structs";
import { http_client } from "../common/AxioConfig";

export default {
    commentListPage(query: { page_num: number, page_size: number, keyword?: string, status?: number | null, post_id?: number | null }): Promise<Result> {
        return http_client.post(`/comment/admin/list`, query);
    },
    comment_get(id: number): Promise<Result> {
        return http_client.get(`/comment/admin/get/${id}`);
    },
    comment_approve(id: number): Promise<Result> {
        return http_client.post(`/comment/admin/approve/${id}`);
    },
    comment_reject(id: number): Promise<Result> {
        return http_client.post(`/comment/admin/reject/${id}`);
    },
    comment_delete(id: number): Promise<Result> {
        return http_client.get(`/comment/admin/del/${id}`);
    },
    comment_batch_approve(ids: number[]): Promise<Result> {
        return http_client.post(`/comment/admin/batch/approve`, { ids });
    },
    comment_batch_delete(ids: number[]): Promise<Result> {
        return http_client.post(`/comment/admin/batch/delete`, { ids });
    },
    comment_counts(): Promise<Result> {
        return http_client.get(`/comment/admin/counts`);
    }
}
