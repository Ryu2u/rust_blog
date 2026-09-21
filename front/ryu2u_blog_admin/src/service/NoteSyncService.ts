import {Result} from "../common/Structs";
import {http_client} from "../common/AxioConfig";

const NoteSyncService = {
    getConfig(): Promise<Result> {
        return http_client.get("/note_sync/admin/config");
    },

    saveConfig(aiEnabled: number, baseUrl: string, model: string, apiKey?: string): Promise<Result> {
        return http_client.post("/note_sync/admin/config", {
            ai_enabled: aiEnabled,
            ai_base_url: baseUrl,
            ai_model: model,
            ai_api_key: apiKey
        });
    },

    testAi(): Promise<Result> {
        return http_client.post("/note_sync/admin/ai_test");
    }
};

export default NoteSyncService;
