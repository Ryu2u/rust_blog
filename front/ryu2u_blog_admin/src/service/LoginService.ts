import {PageInfo, Result} from "../common/Structs";
import {http_client} from "../common/AxioConfig";

namespace LoginService {
    export function login(username: string, password: string, remember?: boolean): Promise<Result> {
        let data = {
            username,
            password,
            remember
        };
        return http_client.post("/user/login", data);
    }

    export function logout():Promise<Result>{
        return http_client.post("/user/logout");
    }

}

export default LoginService;
