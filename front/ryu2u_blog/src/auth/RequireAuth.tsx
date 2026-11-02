import "./auth.scss";
import {Navigate, Outlet, useLocation} from "react-router";
import {useAuth} from "./authContext";

/**
 * 路由守卫（布局路由）：
 * - 还在确认登录状态：只显示加载占位，不渲染任何子路由，所以登录前不会发出任何内容接口请求
 * - 未登录：跳到 /login，并带上当前页面作为 redirect（主动退出时不带）
 * - 已登录：渲染子路由
 */
export function RequireAuth() {
    const {status, loggedOut} = useAuth();
    const location = useLocation();

    if (status === 'loading') {
        return (
            <div className="auth-loading" role="status" aria-label="加载中">
                <span className="auth-loading__dot"/>
            </div>
        );
    }
    if (status === 'anon') {
        const redirect = loggedOut
            ? ''
            : `?redirect=${encodeURIComponent(location.pathname + location.search)}`;
        return <Navigate to={`/login${redirect}`} replace/>;
    }
    return <Outlet/>;
}
