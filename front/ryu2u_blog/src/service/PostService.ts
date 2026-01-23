import http_client from "../common/HttpClient";
import {PageInfo, Result} from "../common/Structs";

export default {
     getPostById(id: number): Promise<Result> {
        return http_client.get(`/post/get/${id}`);
    },
     postListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/post/page`, pageInfo);
    },
    postListByCategory(categoryName: string,pageInfo: PageInfo): Promise<Result> {
         return http_client.post(`/post/list_by_category/${categoryName}`, pageInfo);
    }
}
