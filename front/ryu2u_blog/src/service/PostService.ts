/**
 * 文章服务
 * 提供文章相关的API调用方法
 */
import http_client from "../common/HttpClient";
import {PageInfo, Result} from "../common/Structs";

/**
 * 文章服务对象
 */
export default {
    /**
     * 根据ID获取文章详情
     * @param {number} id - 文章ID
     * @returns {Promise<Result>} 包含文章详情的Promise对象
     */
    getPostById(id: number): Promise<Result> {
        return http_client.get(`/post/get/${id}`);
    },

    /**
     * 获取文章列表分页数据
     * @param {PageInfo} pageInfo - 分页信息
     * @returns {Promise<Result>} 包含文章列表的Promise对象
     */
    postListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/page`, pageInfo);
    },

    /**
     * 根据分类获取文章列表
     * @param {string} categoryName - 分类名称
     * @param {PageInfo} pageInfo - 分页信息
     * @returns {Promise<Result>} 包含分类文章列表的Promise对象
     */
    postListByCategory(categoryName: string, pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/list_by_category/${categoryName}`, pageInfo);
    }
}
