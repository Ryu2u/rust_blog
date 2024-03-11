import http_client from "../common/HttpClient";
import {PageInfo, Result} from "../common/Structs";

namespace LoginService {
    export function login(username: string, password: string, remember?: boolean): Promise<Result> {
        let data = {
            username,
            password,
            remember
        };
        return http_client.post("/user/login", data);
    }

}

export default LoginService;
