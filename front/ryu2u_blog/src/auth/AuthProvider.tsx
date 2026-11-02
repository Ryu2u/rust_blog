import {ReactNode, useCallback, useEffect, useMemo, useState} from "react";
import {AuthContext, AuthStatus} from "./authContext";
import {AuthUser} from "../common/Structs";
import UserService from "../service/UserService";
import {setUnauthorizedHandler} from "../common/HttpClient";

/** 从 /user/me 或登录响应的 obj 里取身份字段；缺关键字段视为无效 */
function toAuthUser(raw: Partial<AuthUser> | undefined | null): AuthUser | null {
    if (!raw || typeof raw.id !== 'number' || !raw.username) {
        return null;
    }
    return {
        id: raw.id,
        username: raw.username,
        nick_name: raw.nick_name || raw.username,
        role: raw.role || 'user',
    };
}

export function AuthProvider({children}: { children: ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loggedOut, setLoggedOut] = useState(false);

    const clear = useCallback(() => {
        setUser(null);
        setStatus('anon');
    }, []);

    // 启动时问一次「我是谁」；之后任何请求收到 401 都回到未登录状态
    useEffect(() => {
        let cancelled = false;
        setUnauthorizedHandler(clear);
        UserService.me().then((res) => {
            if (cancelled) return;
            const me = toAuthUser(res?.obj);
            if (me) {
                setUser(me);
                setStatus('authed');
            } else {
                clear();
            }
        }).catch(() => {
            if (!cancelled) clear();
        });
        return () => {
            cancelled = true;
            setUnauthorizedHandler(null);
        };
    }, [clear]);

    const login = useCallback(async (username: string, password: string) => {
        const res = await UserService.login(username, password);
        const me = toAuthUser(res?.obj);
        if (!me) {
            throw new Error('登录响应缺少用户信息');
        }
        setLoggedOut(false);
        setUser(me);
        setStatus('authed');
    }, []);

    const logout = useCallback(async () => {
        try {
            await UserService.logout();
        } catch {
            // 即使请求失败，也要清掉本地登录状态
        }
        setLoggedOut(true);
        clear();
    }, [clear]);

    const value = useMemo(
        () => ({status, user, loggedOut, login, logout}),
        [status, user, loggedOut, login, logout]
    );
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
