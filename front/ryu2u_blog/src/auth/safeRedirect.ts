/** 登录后默认去的页面 */
export const DEFAULT_REDIRECT = '/home';

/**
 * 校验登录后的跳转目标，只接受站内相对路径，防止开放重定向。
 * 不合法一律回退到 DEFAULT_REDIRECT。
 */
export function safeRedirect(raw: string | null | undefined): string {
    if (!raw) return DEFAULT_REDIRECT;
    // 必须以单个 / 开头：排除 https://evil.com、javascript:、evil.com 等
    if (!raw.startsWith('/')) return DEFAULT_REDIRECT;
    // //evil.com 是协议相对 URL，浏览器会当成外站
    if (raw.startsWith('//')) return DEFAULT_REDIRECT;
    // 浏览器会把 \ 当成 /，/\evil.com 等价于 //evil.com
    if (raw.includes('\\')) return DEFAULT_REDIRECT;
    // 控制字符（换行、制表等）可被用来绕过前缀检查
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_REDIRECT;
    // 登录成功后又回到登录页没有意义
    if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return DEFAULT_REDIRECT;
    return raw;
}
