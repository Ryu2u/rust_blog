# 博客登录门禁与登录防护 — 设计文档

- **日期**: 2026-11-02
- **状态**: 待评审
- **修订**: v1

## 1. 目标

公开博客（`front/ryu2u_blog`，:8088）从「任何人可访问」改为「登录后才能访问」：

- 未登录访问博客任意页面，都跳转到登录页；登录后回到原来要看的页面
- 后端对原来公开的读取接口同样强制登录——只在前端拦截没有意义，直接请求接口仍能拿到内容
- 登录接口具备**防暴力破解**和**防 SQL 注入**能力
- 账号被锁定或删除后，立即失去访问权限，不必等 JWT 过期

## 2. 非目标

- **不做注册**：账号只由管理员在后台「用户」页预先创建
- **不做验证码**、找回密码、记住我（没有对应后端能力，登录页不放这些入口）
- **不做限频计数的持久化**：计数在进程内存中，重启清零；不支持多实例共享
- **不改评论的署名方式**：评论表单的昵称、邮箱仍是自由填写，登录用户可以冒用他人名字评论（后续可改为绑定登录账号）
- **不改既有的手拼 SQL**：后台用户列表（`user/structs.rs` 的 `count_filtered`、`select_page_filtered`）和说说搜索（`moment/mod.rs` 的 `count_all`、`select_page`）靠 `escape_sql` 拼接，只有管理员能访问、不在登录路径上，本次不动
- **不处理既有的 GET 型修改接口 CSRF 隐患**（如 `/user/admin/del/{id}`）
- **不引入前端测试框架**：前端逻辑靠浏览器验证加少量一次性脚本检查

## 3. 已确认的决策

| 问题 | 决定 |
|---|---|
| 谁能登录博客 | 管理员预先创建的账号，不开放注册；任何角色（`admin` / `user`）都可以看博客 |
| 防暴力破解方式 | 进程内存限频 + 临时锁定，不改表结构、不加验证码 |
| 锁定维度 | 在已确认方案基础上做了一处调整：「同一用户名失败 5 次」改为「同一（用户名 + IP）失败 5 次」，另加「同一用户名跨 IP 合计 30 次」兜底。原因：纯按用户名锁会让陌生人故意输错就能把管理员本人锁在门外 |

## 4. 架构概览

```
后端 (Rust / Actix-web)
├── src/middleware.rs         # 白名单收缩；鉴权抽成 authorize()；所有已登录请求都校验账号状态；注入 AuthUser；
│                             # 拒绝时返回正常的 401/403 响应（不是 Err），以便外层 CORS 给它加头
├── src/utils/login_guard.rs  # 新增：内存限频与临时锁定（纯逻辑，可注入时间，便于单测）
├── src/utils/client_ip.rs    # 新增：提取并归一化客户端 IP
├── src/user/apis.rs          # 登录流程重写；新增 GET /user/me；cookie 加固；登录请求体上限 4 KB
├── src/user/structs.rs       # LoginDto 入参校验
├── src/config.rs             # Exception 新增 TooManyRequests → 429 + Retry-After
└── src/main.rs               # 白名单、LoginGuard 注册、中间件顺序（CORS 必须在最外层）

博客前端 (React / Vite)
├── src/common/HttpClient.ts  # withCredentials；401 统一回调
├── src/service/UserService.ts# 新增：login / logout / me
├── src/auth/AuthContext.tsx  # 新增：登录状态（loading / authed / anon）
├── src/auth/RequireAuth.tsx  # 新增：路由守卫
├── src/auth/safeRedirect.ts  # 新增：redirect 参数校验（防开放重定向）
├── src/login/LoginPage.tsx   # 新增：登录页（+ login.scss）
├── src/App.tsx               # 包 AuthProvider；除 /login 外的路由套 RequireAuth
└── src/components/Header.tsx # 登录后显示昵称与「退出」；登录页只留 logo

后台前端
└── src/login/LoginPage.tsx   # 429 时不再叠加通用的「登录失败」提示
```

## 5. 后端设计

### 5.1 访问控制

**白名单收缩**。`FilterWhiteList` 只保留：

```
/user/login
/user/logout
```

原来公开的 `/user/get`、`/post/get`、`/post/page`、`/post/list_by_category/*`、`/category/**`、`/comment/add`、`/comment/list`、`/tag/post`、`/tag/cloud`、`/tag/posts`、`/moment/page` 全部移除，改为必须携带有效登录 Cookie。`OPTIONS` 预检请求仍直接放行（CORS 需要）。`/user/logout` 保留在白名单，保证令牌过期后仍能清除 Cookie。

**白名单匹配抽成纯函数**。把 `middleware.rs` 里内联的匹配逻辑原样抽成 `is_white_listed(path: &str, white_list: &[&str]) -> bool`，行为不变（逐段匹配，`*` 匹配一段，`**` 匹配剩余全部，白名单条目同样覆盖更长的 URL），目的是让「哪些路径不需要登录」这一核心访问控制属性可以单元测试。

**所有已登录请求都校验账号状态**。非白名单请求的处理流程：

1. 从 `auth_token` Cookie 取 JWT 并验证；缺失或无效 → 401
2. 按 `claims.sub` 查 `tb_user`（主键查询）：不存在或 `locked == 1` → 401（用 401 而非 403，使前端统一回到登录页）；数据库出错 → 500
3. 把已验证的当前用户 `AuthUser { id, username, nick_name, role }` 放入请求扩展，供 handler 读取，避免重复查询
4. 若路径命中 `admin_route_prefixes`，用**数据库里的** `role` 判断：不是 `admin` → 403，与现有行为一致

**中间件顺序与 CORS（必须同时满足两点）**。Actix 里中间件「后注册的在最外层」。浏览器对跨域响应有一条硬规则：响应里没有 `Access-Control-Allow-Origin`，前端就读不到状态码，只会看到「网络错误」，那么「收到 401 就回到登录页」永远不会触发。要让被拒绝的响应也带 CORS 头，需要：

1. `main.rs` 里 CORS 在最外层：先 `.wrap(AuthFilter)`、后 `.wrap(cors)`
2. `AuthFilter` 拒绝请求时返回**正常的 401/403 响应**（`req.error_response(e)`，响应体包成 `EitherBody` 的右侧），而不是 `Err`。`actix-cors` 对内层返回的 `Err` 是直接向外冒泡的，不会给它补 CORS 头

这个问题在不经过浏览器的端到端测试里看不出来，必须有回归测试保护（见 7.1）。顺带的结果是：后台前端的 401 / 403 现在能被正确读到（见第 9 节）。

这比现状多出的开销是：非管理员路由也要多一次主键查询（现在只有管理员路由会查）。对个人博客可以接受；之后若需要优化，可加几十秒的内存缓存，但会让「账号锁定立即生效」变成「最长延迟几十秒」，本次不做。

**`GET /user/me`**（需登录）。返回 `AuthUser`（不含密码、盐等字段），前端靠它判断登录状态并显示昵称。

### 5.2 登录防暴力破解（`LoginGuard`）

进程内存中维护三类计数桶，键为：

| 键 | 含义 | 失败阈值（默认） |
|---|---|---|
| `ip:{ip}` | 同一客户端 IP | 10 次 |
| `up:{用户名}\|{ip}` | 同一用户名 + 同一 IP | 5 次 |
| `u:{用户名}` | 同一用户名，跨所有 IP | 30 次 |

用户名在作键时去首尾空白并转小写（MySQL 默认排序规则大小写不敏感，`Admin` 与 `admin` 指向同一账号，必须落入同一个桶）；**不管用户名是否真实存在都同样计数**，否则「是否被锁」会泄露用户名是否存在。

每个桶：`failures: VecDeque<Instant>`（窗口内的失败时间）、`locked_until: Option<Instant>`、`last_touch: Instant`。

- **窗口 / 锁定时长**：默认都是 15 分钟
- **记录失败**：对三个键各自：清掉窗口之外的失败记录，追加本次；若数量达到该键阈值，设置 `locked_until = now + 锁定时长`，并清空失败记录
- **检查**：登录处理的第一步。三个键里只要有任何一个处于锁定中，就拒绝，返回剩余秒数的最大值；已过期的锁视为不存在并清理
- **被拒绝的尝试不计数**：锁定期内继续尝试既不延长锁定，也不累积失败
- **记录成功**：只清除 `up:` 桶；`ip:` 和 `u:` 桶随窗口自然衰减，避免攻击者用自己的合法账号登录来重置他人桶
- **内存上限**：桶总数上限 20,000。超出时先清理已过期且无失败记录的桶，仍超出则淘汰 `last_touch` 最旧的桶
- **可测试性**：`check` / `record_failure` / `record_success` 都显式接收 `now: Instant`，测试里直接传入构造的时间

`LoginGuard` 以 `web::Data<LoginGuard>` 注册，内部用 `std::sync::Mutex`，临界区只做内存操作，不跨 `await`。

### 5.3 登录处理流程

`POST /user/login`：

1. **入参校验**：用户名非空且 ≤ 64 字符，密码非空且 ≤ 128 字符，否则 400。登录请求体上限 4 KB，超出时由 Actix 返回 413
2. 取客户端 IP（见 5.4），构造限频键
3. **`LoginGuard.check`**：被锁 → 429（见 5.6），**此时不查库、不算 bcrypt**
4. 用绑定参数按用户名查用户（`select_by_username`，本就是 `#{username}`）
5. **校验密码**
   - 用户存在：已是 bcrypt 哈希则 `bcrypt::verify`；否则走旧明文兼容分支，用**常量时间比较**
   - 用户不存在：对一个固定的假 bcrypt 哈希执行一次 `bcrypt::verify` 并丢弃结果，使响应时间与「用户存在、密码错误」接近。假哈希用 `OnceLock` 在首次使用时按 `DEFAULT_COST` 生成
6. **失败**：`LoginGuard.record_failure`，日志记一条 warn（IP + 过滤过控制字符并截断到 64 字符的用户名，**不记密码**），返回 400「账号或密码错误!」。HTTP 状态码保持 400 而不是 401，因为后台前端拦截器遇到 401 会跳转登录页，登录失败本身不应触发这个跳转
7. **成功**：账号被锁定（`locked == 1`）→ 400「当前账号已被锁定」，不算失败；否则 `LoginGuard.record_success`，签发 JWT 并设置 Cookie
8. **旧明文密码升级**：登录成功且使用的是旧明文分支时，用**绑定参数**执行 `update tb_user set password = ? where id = ?`，取代现有的 `format!` 拼接

返回给前端的用户对象沿用现有的 `filter_pwd()` 脱敏。

### 5.4 客户端 IP

`client_ip(req) -> String`：

- 默认取 `req.peer_addr()`
- 只有环境变量 `TRUST_PROXY_HEADER=true` 时才读 `X-Forwarded-For`，并取**最右一项**：最右一项是我们自己的反向代理追加的、可信的真实客户端 IP；最左一项是客户端自己提交的，可以伪造。头缺失或解析失败时回退到 `peer_addr`
- IPv4 原样使用；IPv6 归并到 /64 前缀（同一网段内换地址不能绕过限频）

### 5.5 登录 Cookie

- 保持 `HttpOnly`、`SameSite=Lax`、`Path=/`
- 新增 `Max-Age`，与 JWT 有效期（`JWT_EXPIRE_HOURS`，默认 12）一致，使 Cookie 与令牌同时失效
- `COOKIE_SECURE=true` 时加 `Secure`（上 HTTPS 时开启）
- `/user/logout` 清除 Cookie 时使用同样的属性

### 5.6 错误模型

`Exception` 新增 `TooManyRequests { msg: String, retry_after_secs: u64 }`：

- HTTP 状态码 429，响应头 `Retry-After: <秒>`
- 响应体沿用统一格式：`{"code":429,"msg":"尝试次数过多，请 N 分钟后再试","obj":null}`，`N` 为剩余秒数向上取整到分钟，至少为 1
- 文案**不透露**是哪个维度触发了锁定

### 5.7 配置项

新增环境变量，均有默认值，写入 `.env.example`；解析失败时回退默认值并记一条 warn：

| 变量 | 默认 | 含义 |
|---|---|---|
| `LOGIN_MAX_FAIL_PER_IP` | 10 | 同一 IP 窗口内失败上限 |
| `LOGIN_MAX_FAIL_PER_USER_IP` | 5 | 同一（用户名 + IP）失败上限 |
| `LOGIN_MAX_FAIL_PER_USER` | 30 | 同一用户名跨 IP 失败上限 |
| `LOGIN_WINDOW_MIN` | 15 | 统计窗口（分钟） |
| `LOGIN_LOCK_MIN` | 15 | 锁定时长（分钟） |
| `TRUST_PROXY_HEADER` | false | 是否信任 `X-Forwarded-For` |
| `COOKIE_SECURE` | false | 是否给登录 Cookie 加 `Secure` |

## 6. 前端设计

### 6.1 博客前端

**请求层（`HttpClient.ts`）**

- `withCredentials = true`，否则跨端口的请求不会带上 Cookie
- 响应拦截器遇到 HTTP 401 时调用一个由 `AuthProvider` 注册的回调 `onUnauthorized()`，不在拦截器里直接跳转路由。回调把登录状态置为 `anon`，路由守卫随后统一跳转，避免在组件之外使用 `navigate`
- 其余错误原样向上抛出，由调用方读取 `error.response.status` 与 `data.msg`

**登录状态（`AuthContext`）**

- 状态：`loading` / `authed`（含 `user`）/ `anon`
- 应用启动时调用 `GET /user/me`：成功 → `authed`，401 → `anon`，其余错误 → `anon`
- 提供 `login(username, password)`、`logout()`；`login` 成功后直接用登录响应里的用户对象，无需再请求一次

**路由守卫（`RequireAuth`）**

- `loading`：渲染整页的浅色加载占位，**不渲染任何子路由**，因此登录前不会发出任何内容接口请求
- `anon`：`<Navigate to="/login?redirect=<当前路径+查询>" replace />`
- `authed`：渲染子路由

**redirect 校验（`safeRedirect`）**

只接受以单个 `/` 开头的站内相对路径；以 `//` 开头、含 `\`、含协议（`http:` 等）、或不是以 `/` 开头的一律回退到 `/home`。登录成功后按该路径跳转。

**登录页（`/login`，不套守卫）**

- 浅色居中卡片，沿用后台登录页的视觉：品牌标记、衬线标题「欢迎回来」、用户名、密码、登录按钮
- 提交中禁用按钮；`400` 显示服务端文案（「账号或密码错误!」「当前账号已被锁定」）；`429` 显示服务端文案并保持按钮可用；网络错误显示「无法连接服务，请稍后重试」
- 已登录用户访问 `/login`，直接跳到 `redirect` 目标
- 请求体固定带 `remember: false`（`LoginDto.remember` 是必填 bool）

**顶栏**

- 已登录：保留现有导航，右侧显示昵称和「退出」按钮；退出调用 `POST /user/logout`，成功或失败都把状态置为 `anon`
- 登录页：只显示 logo，不显示导航

### 6.2 后台前端

后台登录页走同一个接口，限频自动生效。唯一的改动：`429` 时拦截器（`AxioConfig.tsx`）已经显示了服务端文案，登录页 `catch` 里不再叠加通用的「登录失败，请检查用户名和密码」，避免出现两条提示。

## 7. 测试与验证

### 7.1 Rust 单元测试

- `LoginGuard`：阈值触发锁定；窗口外的失败不计；锁定到期后恢复；锁定期内的尝试不延长锁定；成功只清 `up:` 桶；三类键各自独立触发；不存在的用户名同样计数；超过桶上限时的淘汰
- `is_white_listed`：`/user/login`、`/user/logout` 放行；`/post/page`、`/post/get/1`、`/category/list`、`/comment/add`、`/moment/page`、`/tag/cloud`、`/user/get/1` **不放行**；`/moment/admin/list/page` 不放行；`*` 与 `**` 语义
- `client_ip`：默认用对端地址；`TRUST_PROXY_HEADER` 开启时取 `X-Forwarded-For` 最右一项；关闭时忽略该头；头不可解析时回退；IPv6 /64 归并
- 中间件（不连数据库的部分）：无 Cookie、坏 Cookie → 401；没配白名单 → 401；公开路径放行；OPTIONS 预检不被拦；**被拒绝的 401 带 CORS 头**（回归测试，用「CORS 在最外层」的组合）。写完后要做一次反向验证：临时把测试里 CORS 与 AuthFilter 的顺序调换，这条测试必须失败，否则它保护不了任何东西
- 登录入参校验的边界值；常量时间比较在长度不同、内容不同、相同时的结果
- `Exception::TooManyRequests` 的状态码和 `Retry-After` 头

### 7.2 临时库端到端

沿用说说页验证时的做法：在同一 MySQL 服务上建一个带随机后缀的临时库，灌入测试账号（含一个旧明文密码账号和一个被锁定账号），让后端临时连它，验证完立刻删库，**不碰真实库**。

- 未登录访问所有原公开接口 → 401；登录后 → 200
- 被拒绝的 401 / 403 响应（请求带 `Origin` 头）里有 `Access-Control-Allow-Origin` 与 `Access-Control-Allow-Credentials: true`
- 连续输错密码 → 第 5 次后返回 429，带 `Retry-After`；锁定期内输入正确密码也被拒；换用户名不受影响
- 不同 IP（通过 `TRUST_PROXY_HEADER` 与 `X-Forwarded-For`）对同一用户名分别输错，不会互相锁；跨 IP 合计达到 30 次后锁定
- 注入用例（用户名与密码分别带 `' OR '1'='1`、`admin'--`、`\` 结尾、超长串）均返回「账号或密码错误!」，登不进去，且数据库无变化
- 旧明文密码账号登录成功后，库里的密码变成 bcrypt 哈希
- 账号被管理员锁定后，已发出的 JWT 在下一次请求立即返回 401
- 响应时间：账号不存在与账号存在但密码错误，多次测量的耗时在同一量级（都包含一次 bcrypt）
- 非管理员账号访问 `/user/admin/*` → 403；管理员 → 200
- `redirect` 校验：用一次性 Node 脚本对 `safeRedirect` 跑一组正反例（`/post/3`、`/category/Rust?x=1`、`//evil.com`、`https://evil.com`、`/\evil.com`、空串）

### 7.3 浏览器

桌面和手机宽度各走一遍：未登录打开任意页面跳到登录页；登录后回到原页面；顶栏昵称与退出；退出后再访问回到登录页；会话中途令牌失效时自动回到登录页；连续输错出现 429 提示；后台登录页的 429 只显示一条提示；刷新页面不闪出内容。

## 8. 验收标准

1. 未带有效 Cookie 请求除 `/user/login`、`/user/logout` 外的任何接口，都返回 401；跨域请求下这些 401 / 403 响应带有 CORS 头（浏览器才能读到状态码）
2. 同一 IP 在 15 分钟内对**不同**用户名累计失败 10 次后，登录返回 429；同一（用户名 + IP）失败 5 次后，登录也返回 429
3. 注入用例全部登录失败，数据库无异常变化
4. 管理员锁定某账号后，该账号已登录的会话在下一次请求即失效
5. `cargo build`、`cargo test`（新增测试全部通过；`test_greet` 与 `test_post_add` 为既有失败，不在本次范围）
6. 博客与后台前端 `tsc`、`npm run build` 通过，`npm run lint` 问题数不增加
7. 浏览器验证清单全部通过

## 9. 风险与已知限制

- **限频计数在内存里**：重启清零，多实例不共享。个人博客单实例可以接受
- **阈值以下的慢速猜测不会被拦住**：每个（用户名 + IP）每 15 分钟最多 5 次，换 IP 可以继续；跨 IP 的合计上限 30 次/15 分钟是兜底。账号密码强度仍然重要
- **共享出口 IP**：同一 NAT 后面的多人共用一个 IP，其中一人连续输错 10 次会让该出口下所有人暂时无法登录（15 分钟）。阈值可通过环境变量调整
- **反向代理**：部署在 Nginx 等后面时必须设置 `TRUST_PROXY_HEADER=true`，否则所有人共用一个 IP 桶；而未部署在代理后面时绝不能开启，否则 `X-Forwarded-For` 可被伪造来绕过限频
- **目标性拒绝服务**：攻击者可以让自己的 IP 被锁，但因为用户名桶带了 IP 维度，不会影响其他 IP 的正常登录；要把某用户名全局锁住需要跨 IP 累计 30 次失败
- **旧明文密码**：兼容分支仍在，库里仍有明文密码的账号在首次登录前一直是明文。建议上线后让这些账号登录一次，或由管理员在后台重置密码
- **每个请求多一次主键查询**：见 5.1
- **本地开发时 Cookie 不分端口**：在后台（:8089）登录后博客（:8088）也是已登录状态，反之亦然；在生产环境，若博客和后台在不同子域，则互相独立
- **后台的 403 提示会变正常**：调整中间件顺序后，后台前端能读到真实的 401 / 403。以前这些响应没有 CORS 头，被当作「网络错误」，一律跳转登录页；现在非管理员访问管理接口会看到「权限不足，需要管理员权限」，会话失效才跳转登录页。这是拦截器本来的设计意图，只是此前没有生效
- **GET 型修改接口**与 **评论冒名**：见非目标，是已有问题

## 10. 上线与运维说明

- 读者账号由管理员在后台「用户」页新建，角色选 `user` 即可
- `.env` 新增第 5.7 节的变量（都有默认值，不设置也能运行）；部署在 HTTPS 与反向代理后面时按需设置 `COOKIE_SECURE` 与 `TRUST_PROXY_HEADER`
- 上线后，现有管理员在后台的登录状态继续有效
