# 迁移文档：升级到「登录门禁」版本

- **日期**：2026-11-02
- **适用对象**：已经把上一个版本部署到服务器上的人
- **目标版本**：`master` 的提交 `7106ddb`（要先推送到远端，服务器才能拉到）
- **配套文档**：设计文档 `docs/superpowers/specs/2026-11-02-blog-login-gate-design.md`

文中出现的 `example.com`、`/path/to/...`、`<服务名>` 等都是**需要你替换成自己环境的值**，用到的地方会写明。

---

## 0. 一分钟摘要

| 问题 | 答案 |
|---|---|
| 要改数据库吗？ | **不用。** 表结构、依赖、`Cargo.lock`、两个前端的 `package-lock.json` 都没有变化，没有任何 SQL 迁移。 |
| 要重新部署什么？ | **三样都要**：后端二进制、博客前端、后台前端。 |
| 要改配置吗？ | `.env` 新增 7 个可选变量，都有默认值，不加也能跑。但其中 `TRUST_PROXY_HEADER` 和 `COOKIE_SECURE` 要**按你的部署形态决定**（见 3.5、3.6），设错会出问题。 |
| 最大的行为变化？ | **博客不再对所有人开放。** 原来匿名能访问的所有接口现在都返回 401，读者必须登录。 |
| 读者怎么登录？ | 用管理员在后台「用户」页预先创建的账号。**升级前就可以先在旧版后台建好**（见 3.7）。 |
| 要停机吗？ | 不需要长时间停机。重启后端加切换前端静态文件，窗口期是几秒到一分钟（见第 4 节第 5 步）。 |
| 能回滚吗？ | 能，而且很简单：换回旧二进制和旧前端，**数据库不需要回滚**（见第 6 节）。 |
| 升级前最容易踩的坑？ | ① 服务器上手改过前端写死的后端地址，拉代码会冲突（3.2）；② 博客和后端不同站，登录后 Cookie 带不过去（3.3）；③ 在反向代理后面却没开 `TRUST_PROXY_HEADER`，一个人输错 10 次会把所有人锁住（3.5）。 |

---

## 1. 版本说明

这次升级包含自「上一个版本」以来的三批变更。你部署的是哪一版，就会带上它之后的所有批次：

| 批次 | 提交 | 影响范围 |
|---|---|---|
| UI 重设计（浅色风格）、后台子页面标题与侧栏高亮修复 | `152227f`、`636d70b` | 仅前端 |
| 公开博客「说说」页 | `4c67bd2` | 后端新增 `POST /moment/page` + 博客前端 |
| **登录门禁与登录防护** | `5973530` … `7106ddb`（12 个提交） | 后端 + 博客前端 + 后台前端 + 配置 |

**不管你现在是哪一版，升级步骤都一样**（三样都重新构建部署），不需要逐批升级。

---

## 2. 这次升级改了什么

### 2.1 行为变化

| 项目 | 旧版本 | 新版本 |
|---|---|---|
| 博客访问 | 任何人可访问 | **登录后才能访问**，未登录一律跳到 `/login`，登录后回到原来的页面 |
| 内容接口（文章、分类、标签、评论、说说、`/user/get`） | 匿名可访问 | **必须带有效登录 Cookie**，否则返回 401 |
| 公开路径 | 11 个（见附录） | **只有 `/user/login` 和 `/user/logout`** |
| 账号状态校验 | 只有管理员接口才查库 | **每个请求都按主键查一次用户**：账号被锁定或删除，已登录的会话下一次请求立即失效，不用等 JWT 过期 |
| 登录失败 | 无限次尝试 | 同一 IP 15 分钟内失败 10 次、同一（用户名 + IP）失败 5 次、同一用户名跨 IP 失败 30 次，就**锁定 15 分钟**，返回 HTTP 429 和 `Retry-After` |
| 登录失败的文案与状态码 | 400「账号或密码错误!」 | **不变**（仍是 400）；账号不存在时也做一次等价的 bcrypt 校验，响应时间与「密码错误」几乎一样 |
| 登录入参 | 无限制 | 用户名 ≤ 64 字符、密码 ≤ 128 字符；请求体超过 4 KB 返回 413 |
| 登录 Cookie | `HttpOnly`、`SameSite=Lax`，无过期时间 | 另加 `Max-Age`（与 `JWT_EXPIRE_HOURS` 一致，默认 12 小时）；`COOKIE_SECURE=true` 时加 `Secure` |
| `POST /user/logout` | 需要先登录 | **公开**（令牌过期后也能清除 Cookie） |
| 401 / 403 的 CORS 头 | 没有（浏览器把它们当成「网络错误」） | **有**。后台前端现在能读到真实的 401 / 403：非管理员访问管理接口会看到「权限不足，需要管理员权限」，而不是被直接踢回登录页 |
| 旧的明文密码 | 兼容，但一直是明文 | 兼容；**登录成功时自动升级为 bcrypt 并写回数据库**（比较改为常量时间） |
| 日志 | 登录成功时把整个用户对象打进日志 | 只记用户 id 和（过滤过控制字符的）用户名；登录失败和被锁定各记一条 warn（含 IP 与用户名，不含密码） |

### 2.2 新增接口

| 接口 | 说明 |
|---|---|
| `GET /user/me` | 当前登录用户（id、用户名、昵称、角色），需登录。博客前端靠它判断是否已登录 |
| `POST /moment/page` | 公开博客的「说说」分页，只返回公开且未删除的说说；**现在同样需要登录** |

### 2.3 配置变化（`.env`）

新增 7 个变量，**都是可选的**，不设置就用默认值：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `LOGIN_MAX_FAIL_PER_IP` | `10` | 同一 IP 窗口内失败上限 |
| `LOGIN_MAX_FAIL_PER_USER_IP` | `5` | 同一（用户名 + IP）失败上限 |
| `LOGIN_MAX_FAIL_PER_USER` | `30` | 同一用户名跨所有 IP 的失败上限 |
| `LOGIN_WINDOW_MIN` | `15` | 失败统计窗口（分钟） |
| `LOGIN_LOCK_MIN` | `15` | 锁定时长（分钟） |
| `TRUST_PROXY_HEADER` | `false` | 是否信任 `X-Forwarded-For`（取最右一项作为客户端 IP）。**要按部署形态决定，见 3.5** |
| `COOKIE_SECURE` | `false` | 登录 Cookie 是否加 `Secure`。**站点是 HTTPS 就设 `true`，纯 HTTP 必须保持 `false`，见 3.6** |

变量值非法（不是正整数）时，会回退默认值并在日志里记一条 warn。已有的 `JWT_SECRET`、`JWT_EXPIRE_HOURS`、`BLOG_ORIGIN`、`ADMIN_ORIGIN` 等**不变**。

### 2.4 数据库

- **无表结构变化，无需执行任何 SQL。**
- 唯一的数据变化：旧的明文密码账号首次登录成功后，`tb_user.password` 会被改写成 bcrypt 哈希。旧版本本来就能识别 bcrypt 哈希，所以**回滚后这些账号照样能登录**。

### 2.5 前端

- 博客：浅色界面、新增 `/login` 登录页、`/moment` 说说页、顶栏显示昵称与「退出」。
- 后台：浅色界面、登录页改版、「关于」页文案更新。

---

## 3. 升级前必须检查的事

### 3.1 确认服务器上现在是哪一版

```bash
cd /path/to/rust_blog        # 换成服务器上的项目目录
git log -1 --format='%h %ad %s' --date=short   # 当前部署的提交
git status --short                              # 有没有服务器上的本地改动
git diff --stat                                 # 本地改动具体改了哪些文件
```

记下当前提交号，回滚时要用。

### 3.2 前端里写死的后端地址（重点）

两个前端都把后端地址**写死**在源码里，仓库里的值是开发用的 `http://localhost:9002`：

| 文件 | 本次是否修改 |
|---|---|
| `front/ryu2u_blog/src/common/HttpClient.ts`（博客） | **修改了**（新增 `withCredentials` 和 401 处理） |
| `front/ryu2u_blog_admin/src/common/AxioConfig.tsx`（后台） | 没改 |

你的服务器肯定已经把这两处改成了线上地址。检查一下：

```bash
grep -n "baseURL" front/ryu2u_blog/src/common/HttpClient.ts front/ryu2u_blog_admin/src/common/AxioConfig.tsx
```

**如果你是直接在服务器的工作区里手改过这一行**，`git pull` 会因为 `HttpClient.ts` 被本次改动覆盖而冲突或被拒绝。**不要在服务器的工作区里手改被跟踪的文件**，推荐的做法是：在一个干净副本里构建，构建时用 `sed` 替换地址（见第 4 节第 4 步）。这样服务器的工作区永远是干净的，以后升级不会再冲突。

> 想一劳永逸，可以把后端地址改成构建时的环境变量，这是后续可以单独做的改进，不在本次升级范围内。

### 3.3 博客和后端必须「同站」

登录凭证在 `HttpOnly` + `SameSite=Lax` 的 Cookie 里，**只有当博客页面和后端 API 属于同一个站点时，浏览器才会在 XHR 请求里带上它**。否则表现为：登录请求返回 200，但紧接着的 `/user/me` 就是 401，页面又回到登录页。

| 博客地址 | 后端地址 | 是否可行 |
|---|---|---|
| `https://blog.example.com` | `https://api.example.com` | ✅ 同站（同一个可注册域名 `example.com`） |
| `http://1.2.3.4:8088` | `http://1.2.3.4:9002` | ✅ 同主机（Cookie 不区分端口） |
| `https://blog.example.com` | `http://api.example.com` | ❌ 协议不同，现代浏览器视为跨站 |
| `https://a.com` | `https://b.com` | ❌ 跨站 |

你的后台前端本来就依赖同样的机制，所以**如果后台现在登录正常，并且博客和后台部署在同一个域名下（或同一台主机上），这一项就不用担心**。如果博客在另一个域名下，需要先解决（常见做法：让 Nginx 把 `https://博客域名/api/` 反向代理到后端并去掉前缀，同时把前端地址改成 `/api`，这样根本不跨域）。

### 3.4 CORS 源必须与浏览器地址栏完全一致

`.env` 里的 `BLOG_ORIGIN`、`ADMIN_ORIGIN` 必须与用户在浏览器里访问的地址**逐字一致**：协议 + 域名 + 端口，不带路径和结尾的 `/`。例如 `https://blog.example.com`。

后端只支持**一个**博客源：如果你同时用 `example.com` 和 `www.example.com` 访问，只有配置的那个能正常登录。

### 3.5 反向代理、CDN 与 `TRUST_PROXY_HEADER`

限频要按「谁在请求」计数，所以后端必须知道真实的客户端 IP：

| 你的部署形态 | `TRUST_PROXY_HEADER` | 要注意 |
|---|---|---|
| 浏览器**直连**后端端口，中间没有任何代理 | `false`（默认） | 不要开启，否则客户端可以伪造 `X-Forwarded-For` 绕过限频 |
| 前面有 **Nginx / Caddy** 等反向代理，并且代理会追加 `X-Forwarded-For` | `true` | ① 后端只允许代理访问：设 `SERVER_IP=127.0.0.1`，或用防火墙禁止外部直连后端端口（否则有人绕过代理直连，仍然可以伪造）；② 代理要设置 `X-Forwarded-For` |
| 代理前面**还有 CDN**（如 Cloudflare） | `true` | 必须先在 Nginx 里把真实客户端 IP 还原出来（见下方示例），否则所有用户都会显示成 CDN 边缘节点的 IP |

**设错的后果**：

- 在反向代理后面却保持 `false` → 后端看到的所有请求都来自代理自己的 IP，**同一个 IP 桶**，任何人连续输错 10 次，就会把**所有人**锁 15 分钟。
- 没有代理却设成 `true` → 任何人都能用请求头伪造 IP，限频形同虚设。

Nginx 示例（后端接口站点）：

```nginx
server {
    listen 443 ssl;
    server_name api.example.com;              # 换成你的后端域名

    location / {
        proxy_pass http://127.0.0.1:9002;     # 换成你的后端监听地址
        proxy_set_header Host $host;
        # 追加客户端 IP；后端取最右一项，也就是这一层 Nginx 看到的真实对端地址
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果 Nginx 前面还有 Cloudflare 这类 CDN，在 `http` 或 `server` 块里加（网段请以 CDN 官方公布的完整列表为准）：

```nginx
set_real_ip_from 173.245.48.0/20;     # 逐个列出 CDN 的网段
real_ip_header CF-Connecting-IP;      # 换成你的 CDN 传递真实 IP 的请求头
```

### 3.6 HTTPS 与 `COOKIE_SECURE`

- 站点走 **HTTPS**：设 `COOKIE_SECURE=true`，Cookie 只在加密连接上发送。
- 站点只有 **HTTP**（没有 TLS）：**必须保持 `false`**。如果设成 `true`，浏览器会直接丢弃这个 Cookie，表现为「登录成功但马上又被踢回登录页」。

### 3.7 账号检查（升级前就可以做）

在服务器的数据库上执行（只读）：

```sql
-- 账号概况：角色 / 是否锁定 / 数量
select role, locked, count(*) as n from tb_user group by role, locked;

-- 至少要有一个未锁定的管理员，并且你确实记得他的密码
select count(*) as admins from tb_user where role = 'admin' and locked = 0;

-- 还是旧明文密码的账号数（这些账号首次登录成功后会自动升级成 bcrypt）
select count(*) as plaintext_users from tb_user where password not like '$2%';

-- 新版登录会拒绝的账号：用户名超过 64 字符
select id, username from tb_user where char_length(username) > 64;

-- 新版登录会拒绝的账号：明文密码超过 128 字符
select id, username from tb_user where password not like '$2%' and char_length(password) > 128;
```

后两条应当返回空。如果有记录，需要先在**旧版后台**里改短这些账号的用户名或密码，否则升级后这些账号无法登录。（已经是 bcrypt 哈希的账号看不出原始密码长度，如果有人的密码超过 128 个字符，需要在升级后重置。）

**给读者建账号**：登录门禁上线后，没有账号的人就看不了博客。**可以先在旧版后台**的「用户」页新建好读者账号（角色选 `user`），升级后他们就能直接登录。

### 3.8 备份

```bash
# 数据库
mysqldump -u <用户名> -p --single-transaction <库名> > rust_blog_$(date +%F).sql

# 旧的后端二进制与旧的前端发布目录，各留一份，回滚要用
cp /path/to/旧后端二进制 /path/to/旧后端二进制.bak
cp -r /path/to/博客前端发布目录 /path/to/博客前端发布目录.bak
cp -r /path/to/后台前端发布目录 /path/to/后台前端发布目录.bak
cp .env .env.bak
```

---

## 4. 升级步骤

按顺序执行。**第 5 步之前，线上服务都不受影响。**

### 第 1 步：把代码推到远端并拉到服务器

在开发机上先推送（`7106ddb` 及之前的 12 个提交），然后在服务器上：

```bash
cd /path/to/rust_blog
git fetch origin
git status --short          # 应当是干净的（见 3.2）；有本地改动先处理，不要硬覆盖
git checkout master
git pull --ff-only
git log -1 --format='%h %s'  # 应当是 7106ddb 或更新
```

### 第 2 步：更新 `.env`

在服务器的 `.env` 里**追加**（不要覆盖原有的内容）。下面是按「前面有 Nginx 反代 + 站点是 HTTPS」写的示例，请按 3.5、3.6 改成你的情况：

```ini
# ---- 登录防护 ----
LOGIN_MAX_FAIL_PER_IP=10
LOGIN_MAX_FAIL_PER_USER_IP=5
LOGIN_MAX_FAIL_PER_USER=30
LOGIN_WINDOW_MIN=15
LOGIN_LOCK_MIN=15
TRUST_PROXY_HEADER=true     # 有反向代理且代理追加 X-Forwarded-For 才设 true
COOKIE_SECURE=true          # 站点是 HTTPS 才设 true，纯 HTTP 保持 false
```

如果使用反向代理，同时确认后端只监听本机：

```ini
SERVER_IP=127.0.0.1
```

再核对一遍 `BLOG_ORIGIN` 和 `ADMIN_ORIGIN`（见 3.4）。

### 第 3 步：构建后端

```bash
cd /path/to/rust_blog
cargo build --release          # 产物：target/release/rust_blog
```

首次构建需要几分钟。也可以在与服务器**同架构**的机器上构建后把二进制传上去。

### 第 4 步：构建两个前端（在干净副本里，替换后端地址）

```bash
# 换成浏览器能访问到的后端地址，不带结尾的 /
API_BASE="https://api.example.com"

BUILD=$(mktemp -d)
git archive HEAD front | tar -x -C "$BUILD"

# 只替换写死的后端地址；服务器的工作区保持干净。macOS 的 sed 需要写成 sed -i ''
sed -i "s#http://localhost:9002#${API_BASE}#" \
    "$BUILD/front/ryu2u_blog/src/common/HttpClient.ts" \
    "$BUILD/front/ryu2u_blog_admin/src/common/AxioConfig.tsx"

# 确认两处都替换成功（应当各输出一行你的线上地址）
grep -n "baseURL" "$BUILD/front/ryu2u_blog/src/common/HttpClient.ts" "$BUILD/front/ryu2u_blog_admin/src/common/AxioConfig.tsx"

(cd "$BUILD/front/ryu2u_blog"       && npm ci && npm run build)    # 产物：dist/
(cd "$BUILD/front/ryu2u_blog_admin" && npm ci && npm run build)    # 产物：dist/
echo "$BUILD"
```

把两个 `dist/` 分别上传到服务器上**新的**目录（例如 `/var/www/blog.new`、`/var/www/admin.new`），**先不要覆盖线上目录**。

> 前端是 SPA，静态服务器必须把未知路径回退到 `index.html`（`/login`、`/post/3` 这些路径都靠它）。旧版本已经依赖这一点，如果你的博客现在能直接打开 `/post/3`，就不用改。另外 `index.html` 不要被长期缓存。

### 第 5 步：切换（窗口期尽量短）

**两步要连着做**：旧前端配新后端时，所有内容请求都会 401；新前端配旧后端时，登录页会提示「无法连接服务」或登录失败。窗口期就是这两步之间的时间，所以先把一切准备好再动手。

```bash
# 1) 重启后端（按你的方式；systemd 示例，Docker / supervisor 请换成对应命令）
sudo systemctl restart <服务名>

# 2) 紧接着把新前端换上去（示例：目录改名；用符号链接切换更利索）
mv /var/www/blog  /var/www/blog.old   && mv /var/www/blog.new  /var/www/blog
mv /var/www/admin /var/www/admin.old  && mv /var/www/admin.new /var/www/admin
```

**重启后端会清空内存里的限频计数**（所有被锁定的 IP / 账号立即解锁），这是预期行为。

---

## 5. 升级后验证

### 5.1 命令行（几秒钟）

```bash
API=https://api.example.com        # 后端地址
BLOG=https://blog.example.com      # 浏览器里访问博客的地址（origin，不带路径）

# ① 未登录访问内容接口 → 401，并且带 CORS 头（浏览器才能读到状态码）
curl -si -X POST "$API/category/list" -H "Origin: $BLOG" \
  | grep -iE '^HTTP|access-control-allow-(origin|credentials)'
# 期望：
#   HTTP/1.1 401 Unauthorized
#   access-control-allow-origin: https://blog.example.com
#   access-control-allow-credentials: true

# ② 未登录问「我是谁」→ 401
curl -si "$API/user/me" | head -1
# 期望：HTTP/1.1 401 Unauthorized

# ③ 登录接口可达；用一个不存在的账号 → 400，文案不变
curl -si -X POST "$API/user/login" -H 'Content-Type: application/json' \
  -d '{"username":"__no_such_user__","password":"x","remember":false}' | grep -E '^HTTP|^\{'
# 期望：HTTP/1.1 400 Bad Request   {"code":400,"msg":"账号或密码错误!","obj":null}

# ④ 退出接口无需登录，并且会清除 Cookie
curl -si -X POST "$API/user/logout" | grep -iE '^HTTP|^set-cookie'
# 期望：HTTP/1.1 200 OK   set-cookie: auth_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0
#      （设了 COOKIE_SECURE=true 时，末尾还会有 Secure）
```

如果第 ① 步的 `access-control-allow-origin` 缺失，说明 `BLOG_ORIGIN` 与你访问博客的地址不一致，或者反向代理吞掉了响应头（见第 7 节）。

> **不要**在线上用错误密码去「测试锁定功能」，除非你接受自己的 IP 被锁 15 分钟（重启后端可以立即解锁）。

### 5.2 浏览器（用一个真实的读者账号）

1. 无痕窗口打开博客首页，应当被带到登录页，地址栏是 `/login?redirect=%2Fhome`。
2. 输入错误密码，应当显示「账号或密码错误!」；输入正确密码，应当回到首页，顶栏右侧有你的昵称和「退出」。
3. 点「分类」「说说」「文章详情」，页面数据都能正常加载。
4. 点「退出」，回到 `/login`。
5. 打开后台，用管理员账号登录，文章 / 评论 / 用户 / 说说 / 同步设置各页面正常。
6. 在后台把一个测试读者账号**锁定**，该账号已登录的浏览器里再点任意导航，应当被带回登录页。

### 5.3 日志

```bash
journalctl -u <服务名> --since "10 min ago" | grep -E "login (failed|locked)"
```

应当能看到你刚才那次错误登录的记录（IP + 用户名，没有密码）。

---

## 6. 回滚

**什么时候回滚**：升级后登录整体不可用，且按第 7 节排查十几分钟仍没解决。

```bash
# 1) 换回旧前端
mv /var/www/blog  /var/www/blog.new   && mv /var/www/blog.old  /var/www/blog
mv /var/www/admin /var/www/admin.new  && mv /var/www/admin.old  /var/www/admin

# 2) 换回旧后端二进制并重启
cp /path/to/旧后端二进制.bak /path/to/旧后端二进制
sudo systemctl restart <服务名>
```

- **数据库不需要回滚**：这次没有改表结构。被自动升级成 bcrypt 的密码，旧版本能识别；你新建的读者账号也无害。
- **`.env` 里新增的变量可以保留**：旧版本不认识它们，会直接忽略。想恢复原样就用 `.env.bak`。
- 回滚后博客又恢复成对所有人开放，请尽快安排第二次升级。

---

## 7. 常见问题排查

| 现象 | 最可能的原因 | 怎么办 |
|---|---|---|
| 登录接口返回 200，但马上又回到登录页 | 浏览器没有带上 Cookie | ① 博客与后端不同站（3.3）；② 站点是 HTTP 但设了 `COOKIE_SECURE=true`（3.6）；③ `BLOG_ORIGIN` 与地址栏不一致（3.4）。用浏览器开发者工具看登录响应有没有 `Set-Cookie`，以及后续请求有没有带 `Cookie` |
| 浏览器控制台出现 CORS 报错 | `BLOG_ORIGIN` 不匹配，或反向代理吞掉了 `Access-Control-*` 响应头 | 按 5.1 第 ① 步用 `curl` 带 `Origin` 头复现；检查 Nginx 里有没有用 `add_header` 或 `proxy_hide_header` 覆盖这些头 |
| 一个人输错几次，所有人都登录不了（429） | 在反向代理后面却没开 `TRUST_PROXY_HEADER`，所有请求被当成同一个 IP | 开启 `TRUST_PROXY_HEADER=true` 并确认代理设置了 `X-Forwarded-For`（3.5）。紧急处理：重启后端立即解锁 |
| 所有用户都被识别成同一个 IP（开了 `true` 之后） | 代理前面还有 CDN，`X-Forwarded-For` 最右一项是 CDN 的地址 | 在 Nginx 里还原真实 IP（3.5 的 `real_ip` 示例） |
| 我把自己锁了 | 同一个用户名 + IP 失败了 5 次，或同一 IP 失败了 10 次 | 等 15 分钟；或换一个网络；或重启后端清零 |
| 某个旧账号突然登录不了，提示「账号或密码错误」 | 用户名超过 64 字符，或明文密码超过 128 字符（3.7） | 在后台重置该账号的用户名 / 密码 |
| 管理员进后台提示「权限不足，需要管理员权限」 | 该账号的 `role` 不是 `admin`，或被锁定 | 检查 `tb_user`。（这条提示以前被当成网络错误而不显示，现在是真实的 403） |
| 打开博客一直空白或转圈 | 浏览器缓存了旧的 `index.html` 和旧资源 | 强制刷新；确认静态服务器没有给 `index.html` 设置长缓存 |
| 登录页提示「无法连接服务，请稍后重试」 | 前端写死的后端地址不对，或后端没起来 | 检查 3.2；`curl` 一下后端地址 |
| 登录页提示「输入内容过长」（413） | 请求体超过 4 KB | 正常登录不会触发，通常是被人恶意构造 |

---

## 8. 日常运维

- **给新读者开账号**：后台「用户」页 → 新建用户，角色选 `user`。
- **停用某个读者**：后台「用户」页点「锁定」，该账号已登录的会话下一次请求就会失效。
- **清除所有登录锁定**：重启后端（计数在进程内存里）。
- **调整限频阈值**：改 `.env` 里的 `LOGIN_*` 变量，重启后端生效。共用同一个出口 IP 的人很多（公司 / 学校 NAT）时，可以适当调大 `LOGIN_MAX_FAIL_PER_IP`。
- **日志关键字**：`login failed`（登录失败，含 IP 与用户名）、`login locked`（被锁定期间的尝试）、`login success`（登录成功，含用户 id）。短时间内出现大量 `login failed` 说明有人在猜密码。

---

## 9. 已知限制

- **限频计数在进程内存里**：重启清零；如果你跑了多个后端实例，各实例的计数互不共享。
- **阈值以下的慢速猜测不会被拦住**：每个（用户名 + IP）每 15 分钟最多 5 次。账号密码本身的强度仍然重要。
- **评论仍然可以冒名**：评论表单的昵称和邮箱是自由填写的，任何登录用户都可以冒用别人的名字评论。后续可以改为绑定登录账号。
- **后台的部分「修改类」接口是 GET 请求**（如 `/user/admin/del/{id}`），在 `SameSite=Lax` 下仍有 CSRF 风险。这是已有问题，这次没有处理。
- **后端日志的敏感信息**：部分接口（带 `#[instrument]` 的）会把数据库连接对象整个写进日志，**里面包含数据库口令**。这是已有问题，不是这次引入的；在单独处理之前，请**限制日志文件的访问权限**，不要把日志发给别人。
- **已有的 2 个失败测试**（`test_greet`、`test_post_add`）在升级前就失败，与本次无关。`test_post_add` 会往真实数据库里写文章，**不要在生产库上跑 `cargo test`**。
- **外部抓取失效**：博客不再对匿名开放，搜索引擎、RSS 阅读器、第三方抓取和以前分享出去的文章直链，都会先要求登录。

---

## 附录 A：接口访问控制对照

**旧版本的白名单（匿名可访问）**：

```
/user/login      /user/get         /post/get        /post/page
/post/list_by_category/*           /category/**
/comment/add     /comment/list     /tag/post        /tag/cloud     /tag/posts
(以及 /moment/page，如果你部署的是带说说页的版本)
```

**新版本的白名单**：

```
/user/login      /user/logout
```

其余所有路径都要求有效登录 Cookie，且账号在库里存在、未被锁定；命中管理员路径前缀（`/post/admin`、`/post/add`、`/tag/add`、`/comment/admin`、`/user/admin`、`/moment/admin`、`/note_sync/admin` 等，**不变**）的，还要求角色是 `admin`。

## 附录 B：升级检查清单

升级前：

- [ ] 记下当前部署的提交号（3.1）
- [ ] 服务器工作区干净，或已处理本地改动（3.2）
- [ ] 博客、后台、后端三者同站，协议一致（3.3）
- [ ] `BLOG_ORIGIN`、`ADMIN_ORIGIN` 与浏览器地址栏一致（3.4）
- [ ] 想清楚 `TRUST_PROXY_HEADER`、`COOKIE_SECURE` 怎么设（3.5、3.6）
- [ ] 数据库检查通过，管理员账号可用，读者账号已建好（3.7）
- [ ] 数据库、旧二进制、旧前端目录、`.env` 都已备份（3.8）

升级中：

- [ ] 代码已拉到 `7106ddb` 或更新
- [ ] `.env` 已追加新变量
- [ ] 后端 `cargo build --release` 成功
- [ ] 两个前端在干净副本里构建成功，后端地址已替换
- [ ] 新前端已上传到新目录，后端重启后立刻切换

升级后：

- [ ] 5.1 的四条 `curl` 结果符合预期
- [ ] 5.2 的浏览器流程走通
- [ ] 后台管理员登录、各页面正常
- [ ] 日志里能看到 `login failed` 记录
