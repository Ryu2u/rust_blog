import { PageInfo, Moment, Result } from "../common/Structs";
import { http_client } from "../common/AxioConfig";

export default {
    momentListPage(pageInfo: PageInfo): Promise<Result> {
        return http_client.post(`/moment/admin/list/page`, pageInfo);
    },
    moment_get(id: number): Promise<Result> {
        return http_client.get(`/moment/admin/get/${id}`);
    },
    moment_add(moment: Moment): Promise<Result> {
        return http_client.post(`/moment/admin/add`, moment);
    },
    moment_update(moment: Moment): Promise<Result> {
        return http_client.post(`/moment/admin/update`, moment);
    },
    moment_delete(id: number): Promise<Result> {
        return http_client.get(`/moment/admin/del/${id}`);
    },
    moment_toggle_public(id: number): Promise<Result> {
        return http_client.post(`/moment/admin/toggle/public/${id}`);
    }
}
