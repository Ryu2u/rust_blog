/**
 * 评论服务
 * 提供评论相关的API调用方法
 */
import http_client from "../common/HttpClient";
import {Comment, Result} from "../common/Structs";

/**
 * 评论服务对象
 */
export default {
    /**
     * 添加评论
     * @param {Comment} comment - 评论对象
     * @returns {Promise<Result>} 包含操作结果的Promise对象
     */
    addComment(comment: Comment): Promise<Result> {
        return http_client.post(`/comment/add`, comment);
    },

    /**
     * 获取文章评论列表
     * @param {number} postId - 文章ID
     * @returns {Promise<Result>} 包含评论列表的Promise对象
     */
    getCommentList(postId: number): Promise<Result> {
        return http_client.get(`/comment/list/${postId}`);
    }
}
