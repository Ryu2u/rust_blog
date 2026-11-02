import './login.scss'
import {FormEvent, useState} from "react";
import {Navigate} from "react-router";
import {useSearchParams} from "react-router-dom";
import {AxiosError} from "axios";
import {useAuth} from "../auth/authContext";
import {safeRedirect} from "../auth/safeRedirect";

/** 把登录失败转成给用户看的文案：400 / 429 直接用服务端文案（不会透露账号是否存在） */
function describeLoginError(err: unknown): string {
    const e = err as AxiosError<{ msg?: string }>;
    if (!e?.response) {
        return '无法连接服务，请稍后重试';
    }
    const {status, data} = e.response;
    if ((status === 400 || status === 429) && typeof data?.msg === 'string' && data.msg) {
        return data.msg;
    }
    if (status === 413) {
        return '输入内容过长';
    }
    return '登录失败，请稍后重试';
}

export function LoginPage() {
    const {status, login} = useAuth();
    const [params] = useSearchParams();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // 已登录（包括刚登录成功）：跳到目标页。redirect 只接受站内相对路径
    if (status === 'authed') {
        return <Navigate to={safeRedirect(params.get('redirect'))} replace/>;
    }

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        setError('');
        try {
            await login(username.trim(), password);
            // 成功后 status 变为 authed，上面的 <Navigate> 接管跳转
        } catch (err) {
            setError(describeLoginError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-page">
            <form className="login-card" onSubmit={onSubmit} noValidate>
                <span className="login-card__mark">H</span>
                <h1 className="login-card__title">欢迎回来</h1>
                <p className="login-card__subtitle">登录后阅读 Hai Tao 的博客</p>

                <label className="login-field">
                    <span>用户名</span>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        maxLength={64}
                        placeholder="用户名"
                    />
                </label>
                <label className="login-field">
                    <span>密码</span>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        maxLength={128}
                        placeholder="密码"
                    />
                </label>

                {error && <div className="login-card__error" role="alert">{error}</div>}

                <button
                    type="submit"
                    className="login-card__submit"
                    disabled={submitting || !username.trim() || !password}
                >
                    {submitting ? '登录中…' : '登录'}
                </button>
            </form>
        </div>
    );
}
