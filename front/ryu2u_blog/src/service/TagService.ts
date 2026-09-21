import {PageInfo, Result} from "../common/Structs";
import http_client from "../common/HttpClient";

export default {
    /** 标签云：所有被公开文章引用的标签及其文章数，按文章数倒序 */
    cloud(): Promise<Result> {
        return http_client.post("/tag/cloud");
    },

    /** 按标签名称分页获取文章列表 */
    postsByTag(tagName: string, pageInfo: PageInfo): Promise<Result> {
        return http_client.post("/tag/posts", {
            tag_name: tagName,
            page_num: pageInfo.page_num,
            page_size: pageInfo.page_size,
        });
    },

    /** 获取某篇文章自己的标签 */
    tagsByPost(postId: number): Promise<Result> {
        return http_client.get(`/tag/post/${postId}`);
    }
}
