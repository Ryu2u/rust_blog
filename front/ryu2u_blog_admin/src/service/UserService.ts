import {Result, User} from "../common/Structs";
import {http_client} from "../common/AxioConfig";

export type UserListQuery = {
    page_num: number;
    page_size: number;
    keyword?: string;
    status?: number | null;
};

export default {
    userGet(id: number): Promise<Result> {
        return http_client.get(`/user/admin/get/${id}`);
    },
    userAdd(user: User): Promise<Result> {
        return http_client.post(`/user/admin/add`, user);
    },
    userListPage(query: UserListQuery): Promise<Result> {
        return http_client.post(`/user/admin/list/page`, query);
    },
    userUpdate(user: User): Promise<Result> {
        return http_client.post(`/user/admin/update`, user);
    },
    userDelete(id: number): Promise<Result> {
        return http_client.get(`/user/admin/del/${id}`);
    },
    userLock(id: number): Promise<Result> {
        return http_client.get(`/user/admin/lock/${id}`);
    }
}
