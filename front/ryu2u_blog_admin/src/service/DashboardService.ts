import {Result} from "../common/Structs";
import {http_client} from "../common/AxioConfig";

const DashboardService = {
    stats(): Promise<Result> {
        return http_client.get("/dashboard/admin/stats");
    }
};

export default DashboardService;
