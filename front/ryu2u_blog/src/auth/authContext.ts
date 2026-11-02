import {createContext, useContext} from "react";
import {AuthUser} from "../common/Structs";

export type AuthStatus = 'loading' | 'authed' | 'anon';

export interface AuthContextValue {
    status: AuthStatus;
    user: AuthUser | null;
    /** 主动退出后为 true：RequireAuth 据此不再附带 redirect 参数 */
    loggedOut: boolean;
    /** 登录成功后更新状态；失败时抛出 axios 错误，由调用方展示 */
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error('useAuth 必须在 <AuthProvider> 内使用');
    }
    return ctx;
}
