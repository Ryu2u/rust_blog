# 博客登录门禁与登录防护 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公开博客改为登录后才能访问，后端所有内容接口强制登录；登录接口具备防暴力破解（内存限频 + 临时锁定）与防 SQL 注入能力。

**Architecture:** 后端把 `FilterWhiteList` 收缩为只含登录/退出，中间件对每个已登录请求都按主键校验账号状态并把 `AuthUser` 放进请求扩展，拒绝时返回正常的 401/403 响应（CORS 在最外层，浏览器才能读到状态码）；登录处理先查 `LoginGuard` 的三类计数桶（IP / 用户名+IP / 用户名跨 IP）再校验密码，账号不存在时做等价的假 bcrypt 抹平耗时。博客前端用 `AuthProvider` 管登录状态、`RequireAuth` 做路由守卫、新增 `/login` 页，请求层带 Cookie 并在 401 时清空状态。

**Tech Stack:** Rust / Actix-web 4 / rbatis / bcrypt / actix-cors；React 18 + TypeScript + Vite + react-router 6 + axios。

**Spec:** `docs/superpowers/specs/2026-11-02-blog-login-gate-design.md`

## Global Constraints

- 账号只由管理员在后台预先创建：**不做注册、验证码、记住我、找回密码**
- 公开路径（`PUBLIC_PATHS`）只有 `/user/login`、`/user/logout`；其余一律要求有效登录，任何角色都可以
- 限频默认值：同一 IP 失败 10 次、同一（用户名 + IP）失败 5 次、同一用户名跨 IP 失败 30 次；统计窗口 15 分钟；锁定 15 分钟；计数桶总数上限 20,000
- 登录入参：用户名 ≤ 64 字符、密码 ≤ 128 字符（按字符数计），登录请求体上限 4 KB（超出 413）
- 登录失败统一返回 HTTP **400**（不是 401）、文案「账号或密码错误!」；被锁定返回 HTTP **429**、响应头 `Retry-After`、文案「尝试次数过多，请 N 分钟后再试」
- 登录 Cookie：`HttpOnly`、`SameSite=Lax`、`Path=/`、`Max-Age = JWT_EXPIRE_HOURS（默认 12）× 3600`；`COOKIE_SECURE=true` 时加 `Secure`
- 中间件顺序：`main.rs` 里先 `.wrap(AuthFilter)`、后 `.wrap(cors)`（CORS 最外层）；`AuthFilter` 拒绝请求时返回正常响应而不是 `Err`
- 新增环境变量及默认值：`LOGIN_MAX_FAIL_PER_IP=10`、`LOGIN_MAX_FAIL_PER_USER_IP=5`、`LOGIN_MAX_FAIL_PER_USER=30`、`LOGIN_WINDOW_MIN=15`、`LOGIN_LOCK_MIN=15`、`TRUST_PROXY_HEADER=false`、`COOKIE_SECURE=false`
- **不碰真实库 `rust_blog`**：所有需要数据库的验证都用临时库，验完立刻删除
- Rust 测试模块里**不要** `use actix_web::test`（会遮蔽标准库的 `#[test]`），要写 `use actix_web::{test as actix_test, ...}`
- `cargo test` 全量运行时 `post::apis::test::test_post_add` 与 `user::apis::test::test_greet` 是**既有失败**，不要修改它们；基线是 34 通过 / 2 失败，全部做完后应是 **80 通过 / 2 失败**
- lint 问题数不能增加：博客前端基线 37（32 errors, 5 warnings），后台前端基线 29（20 errors, 9 warnings）
- 提交信息用中文 conventional commit 风格，并以 `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` 结尾

## 准备工作

- 需要：Rust 工具链、Node、`mysql` 命令行、正在运行的本机 MySQL、项目根目录下存在 `.env`
- 端到端脚本会占用端口 9003 和 9004，浏览器验证会占用 9002 和 8088，开始前确认没有别的进程占用（见 Task 11 / Task 12）
- 验证脚本和临时文件放在**仓库之外**的一个临时目录里，下文用 `$SCRATCH` 表示。执行前先在 shell 里定义（用你环境里的会话临时目录更好）：

```bash
export SCRATCH="${TMPDIR:-/tmp}/login_gate_verify"
mkdir -p "$SCRATCH"
```

- 每个任务都以一次提交结束；除 Task 5（登录行为）、Task 6（中间件顺序与账号状态校验）、Task 11（关闭公开接口）之外，其余任务不改变对外行为。

---

### Task 1: 环境变量工具与登录限频器 `LoginGuard`

纯逻辑、只依赖 `std` 与 `tracing`，所有方法显式接收 `now: Instant`，测试里可以直接构造时间。后面所有任务都建立在它之上。

**Files:**
- Create: `src/utils/env_conf.rs`
- Create: `src/utils/login_guard.rs`
- Modify: `src/utils/mod.rs`
- Modify: `.env.example`

**Interfaces:**
- Consumes: 无
- Produces:
  - `utils::env_conf::{parse_positive(&str) -> Option<u64>, parse_flag(Option<&str>) -> bool, env_positive(&str, u64) -> u64, env_flag(&str) -> bool}`
  - `utils::login_guard::LoginGuardConfig { max_fail_per_ip, max_fail_per_user_ip, max_fail_per_user: usize, window, lock: Duration, max_buckets: usize }`，含 `Default` 与 `from_env()`
  - `utils::login_guard::LoginGuard::{new(LoginGuardConfig), check(&self, ip: &str, user: &str, now: Instant) -> Result<(), u64>（Err 里是剩余秒数）, record_failure(&self, ip, user, now), record_success(&self, ip, user)}`

- [ ] **Step 1: 写失败的测试**

创建 `src/utils/env_conf.rs`，**先只写测试**：

````rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_positive_accepts_only_positive_integers() {
        assert_eq!(parse_positive("15"), Some(15));
        assert_eq!(parse_positive(" 7 "), Some(7));
        assert_eq!(parse_positive("0"), None);
        assert_eq!(parse_positive("-3"), None);
        assert_eq!(parse_positive("abc"), None);
        assert_eq!(parse_positive(""), None);
    }

    #[test]
    fn parse_flag_is_case_insensitive_and_defaults_to_false() {
        for v in ["true", "TRUE", " True ", "1", "yes", "on"] {
            assert!(parse_flag(Some(v)), "{v:?} 应为真");
        }
        for v in ["false", "0", "no", "off", "", "maybe"] {
            assert!(!parse_flag(Some(v)), "{v:?} 应为假");
        }
        assert!(!parse_flag(None));
    }
}
````

创建 `src/utils/login_guard.rs`，**先只写测试**：

````rust
#[cfg(test)]
mod tests {
    use super::*;

    const IP_A: &str = "10.0.0.1";
    const IP_B: &str = "10.0.0.2";

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    fn mins(n: u64) -> Duration {
        Duration::from_secs(n * 60)
    }

    fn default_guard() -> LoginGuard {
        LoginGuard::new(LoginGuardConfig::default())
    }

    /// 只想隔离某一类桶时，把其余阈值调到 1000
    fn guard_with(ip: usize, user_ip: usize, user: usize) -> LoginGuard {
        LoginGuard::new(LoginGuardConfig {
            max_fail_per_ip: ip,
            max_fail_per_user_ip: user_ip,
            max_fail_per_user: user,
            ..LoginGuardConfig::default()
        })
    }

    #[test]
    fn user_ip_bucket_locks_at_five_failures() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..4 {
            g.record_failure(IP_A, "alice", t0 + secs(i));
        }
        assert!(g.check(IP_A, "alice", t0 + secs(4)).is_ok(), "4 次还不该锁");
        g.record_failure(IP_A, "alice", t0 + secs(4));
        assert!(g.check(IP_A, "alice", t0 + secs(5)).is_err(), "第 5 次应锁定");
    }

    #[test]
    fn user_ip_lock_does_not_affect_other_ip_or_other_user() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..5 {
            g.record_failure(IP_A, "alice", t0 + secs(i));
        }
        assert!(g.check(IP_A, "alice", t0 + secs(6)).is_err());
        assert!(g.check(IP_B, "alice", t0 + secs(6)).is_ok(), "换 IP 登录同一用户名不受影响");
        assert!(g.check(IP_A, "bob", t0 + secs(6)).is_ok(), "同一 IP 登录别的用户名不受影响");
    }

    #[test]
    fn ip_bucket_locks_at_ten_failures_across_different_users() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..10u64 {
            g.record_failure(IP_A, &format!("user{i}"), t0 + secs(i));
        }
        assert!(g.check(IP_A, "someone-else", t0 + secs(11)).is_err());
        assert!(g.check(IP_B, "someone-else", t0 + secs(11)).is_ok());
    }

    #[test]
    fn user_bucket_locks_at_thirty_failures_across_ips() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..30u64 {
            g.record_failure(&format!("10.9.0.{i}"), "alice", t0 + secs(i));
        }
        assert!(g.check("10.8.0.1", "alice", t0 + secs(31)).is_err(), "任何新 IP 登录 alice 都被拒");
        assert!(g.check("10.8.0.1", "bob", t0 + secs(31)).is_ok());
    }

    #[test]
    fn failures_outside_window_do_not_count() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..4 {
            g.record_failure(IP_A, "alice", t0 + secs(i));
        }
        let later = t0 + mins(16);
        for i in 0..4 {
            g.record_failure(IP_A, "alice", later + secs(i));
        }
        assert!(g.check(IP_A, "alice", later + secs(5)).is_ok(), "旧的 4 次已出窗口，新的只有 4 次");
        g.record_failure(IP_A, "alice", later + secs(5));
        assert!(g.check(IP_A, "alice", later + secs(6)).is_err());
    }

    #[test]
    fn lock_expires_after_lock_duration() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..5 {
            g.record_failure(IP_A, "alice", t0 + secs(i));
        }
        assert!(g.check(IP_A, "alice", t0 + mins(14)).is_err());
        assert!(g.check(IP_A, "alice", t0 + mins(15) + secs(5)).is_ok());
    }

    #[test]
    fn retry_after_is_rounded_up_and_bounded() {
        let g = default_guard();
        let t0 = Instant::now();
        for _ in 0..5 {
            g.record_failure(IP_A, "alice", t0);
        }
        assert_eq!(g.check(IP_A, "alice", t0), Err(900));
        assert_eq!(g.check(IP_A, "alice", t0 + Duration::from_millis(899_400)), Err(1), "剩 0.6 秒向上取整为 1");
        assert!(g.check(IP_A, "alice", t0 + mins(15)).is_ok());
    }

    #[test]
    fn failures_during_lock_do_not_extend_it() {
        let g = guard_with(1000, 5, 1000);
        let t0 = Instant::now();
        for i in 0..5 {
            g.record_failure(IP_A, "alice", t0 + secs(i));
        }
        for i in 0..5 {
            g.record_failure(IP_A, "alice", t0 + mins(10) + secs(i));
        }
        assert!(g.check(IP_A, "alice", t0 + mins(15) + secs(10)).is_ok(), "锁定期内的失败不能把锁延长");
    }

    #[test]
    fn success_clears_only_the_user_ip_bucket() {
        let g = guard_with(1000, 5, 1000);
        let t0 = Instant::now();
        for i in 0..4 {
            g.record_failure(IP_A, "alice", t0 + secs(i));
        }
        assert_eq!(g.bucket_count(), 3);
        g.record_success(IP_A, "alice");
        assert_eq!(g.bucket_count(), 2, "只删 up: 桶，ip: 与 u: 桶保留");
        for i in 0..4 {
            g.record_failure(IP_A, "alice", t0 + secs(10 + i));
        }
        assert!(g.check(IP_A, "alice", t0 + secs(20)).is_ok(), "成功后重新计数，4 次不够");
        g.record_failure(IP_A, "alice", t0 + secs(21));
        assert!(g.check(IP_A, "alice", t0 + secs(22)).is_err());
    }

    #[test]
    fn username_is_case_and_whitespace_insensitive() {
        let g = default_guard();
        let t0 = Instant::now();
        for i in 0..3 {
            g.record_failure(IP_A, "Alice", t0 + secs(i));
        }
        for i in 3..5 {
            g.record_failure(IP_A, " alice ", t0 + secs(i));
        }
        assert!(g.check(IP_A, "ALICE", t0 + secs(6)).is_err());
    }

    #[test]
    fn bucket_count_never_exceeds_the_cap() {
        let g = LoginGuard::new(LoginGuardConfig {
            max_buckets: 6,
            ..LoginGuardConfig::default()
        });
        let t0 = Instant::now();
        for i in 0..50u64 {
            g.record_failure(&format!("10.1.{i}.1"), &format!("user{i}"), t0 + secs(i));
            assert!(g.bucket_count() <= 6);
        }
    }

    #[test]
    fn expired_buckets_are_purged_before_evicting_fresh_ones() {
        let g = LoginGuard::new(LoginGuardConfig {
            max_buckets: 6,
            ..LoginGuardConfig::default()
        });
        let t0 = Instant::now();
        g.record_failure(IP_A, "u1", t0);
        g.record_failure(IP_B, "u2", t0);
        assert_eq!(g.bucket_count(), 6);
        g.record_failure("10.5.5.5", "u3", t0 + mins(20));
        assert_eq!(g.bucket_count(), 3, "两个旧事件的 6 个桶都已过期，应被清掉，只剩新事件的 3 个");
    }
}
````

修改 `src/utils/mod.rs`：把下面这段

````rust
pub mod jwt_utils;
````

替换为

````rust
pub mod jwt_utils;
pub mod env_conf;
pub mod login_guard;
````

- [ ] **Step 2: 运行，确认失败**

```bash
cargo test -- utils::env_conf utils::login_guard
```

Expected: 编译失败（找不到 `parse_positive`、`LoginGuardConfig`、`LoginGuard` 等，因为实现还不存在）。

- [ ] **Step 3: 写最小实现**

在 `src/utils/env_conf.rs` 的**最上方**（测试模块之前）加入实现：

````rust
//! 环境变量解析的小工具。解析逻辑与「读环境」分开，便于单元测试。
use std::env;
use tracing::log::warn;

/// 解析正整数；非数字或为 0 返回 None。
pub fn parse_positive(raw: &str) -> Option<u64> {
    raw.trim().parse::<u64>().ok().filter(|n| *n > 0)
}

/// 解析布尔开关：`true` / `1` / `yes` / `on`（不分大小写）为真，其余为假。
pub fn parse_flag(raw: Option<&str>) -> bool {
    matches!(
        raw.map(|v| v.trim().to_ascii_lowercase()).as_deref(),
        Some("true" | "1" | "yes" | "on")
    )
}

/// 读取正整数环境变量：未设置或留空用默认值；设置了但非法则回退默认值并记一条 warn。
pub fn env_positive(name: &str, default: u64) -> u64 {
    match env::var(name) {
        Ok(raw) if !raw.trim().is_empty() => parse_positive(&raw).unwrap_or_else(|| {
            warn!("环境变量 {} 的值 {:?} 不是正整数，已回退默认值 {}", name, raw, default);
            default
        }),
        _ => default,
    }
}

/// 读取布尔开关环境变量。
pub fn env_flag(name: &str) -> bool {
    parse_flag(env::var(name).ok().as_deref())
}
````

在 `src/utils/login_guard.rs` 的**最上方**（测试模块之前）加入实现：

````rust
//! 登录防暴力破解：进程内存中的限频与临时锁定。
//!
//! 三类计数桶（键）：
//! - `ip:{ip}`           同一客户端 IP
//! - `up:{用户名}|{ip}`   同一用户名 + 同一 IP
//! - `u:{用户名}`         同一用户名，跨所有 IP
//!
//! 任何一个桶处于锁定期，登录就被拒绝。所有方法都显式接收 `now`，便于测试。
use crate::utils::env_conf::env_positive;
use std::collections::{HashMap, VecDeque};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// 限频参数。默认：IP 10 次、（用户名 + IP）5 次、用户名跨 IP 30 次；窗口与锁定时长均为 15 分钟。
#[derive(Debug, Clone)]
pub struct LoginGuardConfig {
    pub max_fail_per_ip: usize,
    pub max_fail_per_user_ip: usize,
    pub max_fail_per_user: usize,
    pub window: Duration,
    pub lock: Duration,
    /// 计数桶总数上限，防止有人用随机用户名 / IP 刷爆内存
    pub max_buckets: usize,
}

impl Default for LoginGuardConfig {
    fn default() -> Self {
        Self {
            max_fail_per_ip: 10,
            max_fail_per_user_ip: 5,
            max_fail_per_user: 30,
            window: Duration::from_secs(15 * 60),
            lock: Duration::from_secs(15 * 60),
            max_buckets: 20_000,
        }
    }
}

impl LoginGuardConfig {
    /// 从环境变量读取，缺失或非法时回退默认值
    pub fn from_env() -> Self {
        let d = Self::default();
        Self {
            max_fail_per_ip: env_positive("LOGIN_MAX_FAIL_PER_IP", d.max_fail_per_ip as u64) as usize,
            max_fail_per_user_ip: env_positive("LOGIN_MAX_FAIL_PER_USER_IP", d.max_fail_per_user_ip as u64)
                as usize,
            max_fail_per_user: env_positive("LOGIN_MAX_FAIL_PER_USER", d.max_fail_per_user as u64) as usize,
            window: Duration::from_secs(env_positive("LOGIN_WINDOW_MIN", d.window.as_secs() / 60) * 60),
            lock: Duration::from_secs(env_positive("LOGIN_LOCK_MIN", d.lock.as_secs() / 60) * 60),
            max_buckets: d.max_buckets,
        }
    }
}

#[derive(Debug)]
struct Bucket {
    /// 窗口内的失败时间
    failures: VecDeque<Instant>,
    locked_until: Option<Instant>,
    last_touch: Instant,
}

pub struct LoginGuard {
    cfg: LoginGuardConfig,
    buckets: Mutex<HashMap<String, Bucket>>,
}

/// 剩余时间向上取整到秒
fn ceil_secs(d: Duration) -> u64 {
    d.as_secs() + u64::from(d.subsec_nanos() > 0)
}

impl LoginGuard {
    pub fn new(cfg: LoginGuardConfig) -> Self {
        Self {
            cfg,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// 用户名归一化：去首尾空白并转小写。MySQL 默认排序规则大小写不敏感，
    /// `Admin` 与 `admin` 指向同一账号，必须落入同一个桶。
    fn normalize_user(user: &str) -> String {
        user.trim().to_lowercase()
    }

    fn keys(&self, ip: &str, user: &str) -> [(String, usize); 3] {
        let user = Self::normalize_user(user);
        [
            (format!("ip:{ip}"), self.cfg.max_fail_per_ip),
            (format!("up:{user}|{ip}"), self.cfg.max_fail_per_user_ip),
            (format!("u:{user}"), self.cfg.max_fail_per_user),
        ]
    }

    fn lock_map(&self) -> MutexGuard<'_, HashMap<String, Bucket>> {
        // 临界区里只有内存操作；即使某次 panic 导致锁中毒，也继续使用里面的数据
        self.buckets.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// 登录处理的第一步：三个桶里只要有一个处于锁定期就拒绝，返回剩余秒数（取最长的一个）。
    pub fn check(&self, ip: &str, user: &str, now: Instant) -> Result<(), u64> {
        let keys = self.keys(ip, user);
        let mut map = self.lock_map();
        let mut longest = Duration::ZERO;
        for (key, _) in keys.iter() {
            if let Some(b) = map.get_mut(key) {
                match b.locked_until {
                    Some(until) if until > now => longest = longest.max(until - now),
                    Some(_) => b.locked_until = None, // 锁已过期
                    None => {}
                }
            }
        }
        if longest > Duration::ZERO {
            Err(ceil_secs(longest))
        } else {
            Ok(())
        }
    }

    /// 记录一次失败（不管用户名是否真实存在都要记，否则「是否被锁」会泄露用户名是否存在）。
    pub fn record_failure(&self, ip: &str, user: &str, now: Instant) {
        let keys = self.keys(ip, user);
        let mut map = self.lock_map();
        for (key, max) in keys {
            if !map.contains_key(&key) && map.len() >= self.cfg.max_buckets {
                self.make_room(&mut map, now);
            }
            let bucket = map.entry(key).or_insert_with(|| Bucket {
                failures: VecDeque::new(),
                locked_until: None,
                last_touch: now,
            });
            bucket.last_touch = now;
            // 锁定期内的失败不累积，也不延长锁定
            if matches!(bucket.locked_until, Some(until) if until > now) {
                continue;
            }
            while let Some(&oldest) = bucket.failures.front() {
                if now.saturating_duration_since(oldest) > self.cfg.window {
                    bucket.failures.pop_front();
                } else {
                    break;
                }
            }
            bucket.failures.push_back(now);
            if bucket.failures.len() >= max {
                bucket.locked_until = Some(now + self.cfg.lock);
                bucket.failures.clear();
            }
        }
    }

    /// 登录成功：只清除（用户名 + IP）这一个桶。`ip:` 与 `u:` 桶随窗口自然衰减，
    /// 避免攻击者用自己的合法账号登录来重置针对他人的计数。
    pub fn record_success(&self, ip: &str, user: &str) {
        let key = format!("up:{}|{}", Self::normalize_user(user), ip);
        self.lock_map().remove(&key);
    }

    /// 桶总数达到上限时腾位置：先清掉已过期且无锁的桶，仍不够再淘汰最久未更新的。
    fn make_room(&self, map: &mut HashMap<String, Bucket>, now: Instant) {
        let window = self.cfg.window;
        map.retain(|_, b| {
            let locked = b.locked_until.map_or(false, |until| until > now);
            let recent = b
                .failures
                .back()
                .map_or(false, |&t| now.saturating_duration_since(t) <= window);
            locked || recent
        });
        while map.len() >= self.cfg.max_buckets {
            let oldest = map
                .iter()
                .min_by_key(|(_, b)| b.last_touch)
                .map(|(k, _)| k.clone());
            match oldest {
                Some(k) => {
                    map.remove(&k);
                }
                None => break,
            }
        }
    }

    #[cfg(test)]
    fn bucket_count(&self) -> usize {
        self.lock_map().len()
    }
}
````

修改 `.env.example`：把下面这段

````ini
JWT_EXPIRE_HOURS=12
````

替换为

````ini
JWT_EXPIRE_HOURS=12
# ---- 登录防护（均有默认值，可不设置）----
LOGIN_MAX_FAIL_PER_IP=10
LOGIN_MAX_FAIL_PER_USER_IP=5
LOGIN_MAX_FAIL_PER_USER=30
LOGIN_WINDOW_MIN=15
LOGIN_LOCK_MIN=15
````

- [ ] **Step 4: 运行，确认通过**

```bash
cargo test -- utils::env_conf utils::login_guard
```

Expected: `test result: ok. 14 passed; 0 failed`（env_conf 2 个 + login_guard 12 个）。

- [ ] **Step 5: 提交**

```bash
git add "src/utils/env_conf.rs" "src/utils/login_guard.rs" "src/utils/mod.rs" ".env.example"
git commit -F - <<'EOF'
feat(auth): 登录限频器 LoginGuard 与环境变量解析工具

三类计数桶：ip / 用户名+IP / 用户名跨 IP；任一处于锁定期即拒绝。
锁定期内的失败不累积、不延长；登录成功只清「用户名+IP」桶；
桶总数封顶 20,000，超出先清过期桶再淘汰最久未更新的。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 2: 客户端 IP 提取与归一化

限频要按「谁在请求」计数。默认只信任连接对端地址；只有显式开启 `TRUST_PROXY_HEADER` 才读 `X-Forwarded-For`，并取**最右一项**（我们自己的反向代理追加的那一项，客户端无法伪造）。IPv6 按 /64 归并。

**Files:**
- Create: `src/utils/client_ip.rs`
- Modify: `src/utils/mod.rs`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `utils::env_conf::env_flag`（Task 1）
- Produces: `utils::client_ip::{normalize_ip(IpAddr) -> String, resolve_client_ip(peer: Option<IpAddr>, forwarded_for: Option<&str>, trust_proxy_header: bool) -> String, client_ip(&HttpRequest) -> String}`

- [ ] **Step 1: 写失败的测试**

创建 `src/utils/client_ip.rs`，**先只写测试**：

````rust
#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn untrusted_mode_ignores_forwarded_header() {
        let got = resolve_client_ip(Some(ip("203.0.113.9")), Some("1.2.3.4"), false);
        assert_eq!(got, "203.0.113.9");
    }

    #[test]
    fn trusted_mode_uses_rightmost_entry() {
        let got = resolve_client_ip(Some(ip("10.0.0.1")), Some("1.1.1.1, 2.2.2.2, 3.3.3.3"), true);
        assert_eq!(got, "3.3.3.3");
        // 客户端自己塞的假地址在最左边，代理追加的真实地址在最右边
        let spoofed = resolve_client_ip(Some(ip("10.0.0.1")), Some("9.9.9.9, 5.5.5.5"), true);
        assert_eq!(spoofed, "5.5.5.5");
    }

    #[test]
    fn trusted_mode_tolerates_whitespace_and_trailing_comma() {
        assert_eq!(resolve_client_ip(None, Some("  3.3.3.3  "), true), "3.3.3.3");
        assert_eq!(resolve_client_ip(None, Some("1.1.1.1,3.3.3.3,"), true), "3.3.3.3");
    }

    #[test]
    fn trusted_mode_falls_back_to_peer_when_header_missing_or_garbage() {
        assert_eq!(resolve_client_ip(Some(ip("10.0.0.7")), None, true), "10.0.0.7");
        assert_eq!(resolve_client_ip(Some(ip("10.0.0.7")), Some("not-an-ip"), true), "10.0.0.7");
        assert_eq!(resolve_client_ip(Some(ip("10.0.0.7")), Some(""), true), "10.0.0.7");
    }

    #[test]
    fn missing_peer_maps_to_unknown() {
        assert_eq!(resolve_client_ip(None, None, false), "unknown");
    }

    #[test]
    fn ipv6_is_bucketed_by_slash_64() {
        let a = resolve_client_ip(Some(ip("2001:db8:abcd:12::1")), None, false);
        let b = resolve_client_ip(Some(ip("2001:db8:abcd:12:ffff::99")), None, false);
        assert_eq!(a, "2001:db8:abcd:12::/64");
        assert_eq!(a, b, "同一 /64 内换地址必须落入同一个桶");
        let other = resolve_client_ip(Some(ip("2001:db8:abcd:13::1")), None, false);
        assert_ne!(a, other);
    }

    #[test]
    fn ipv4_mapped_ipv6_is_treated_as_ipv4() {
        assert_eq!(normalize_ip(ip("::ffff:1.2.3.4")), "1.2.3.4");
    }
}
````

修改 `src/utils/mod.rs`：把下面这段

````rust
pub mod login_guard;
````

替换为

````rust
pub mod login_guard;
pub mod client_ip;
````

- [ ] **Step 2: 运行，确认失败**

```bash
cargo test -- utils::client_ip
```

Expected: 编译失败（找不到 `resolve_client_ip`、`normalize_ip`）。

- [ ] **Step 3: 写最小实现**

在 `src/utils/client_ip.rs` 的**最上方**（测试模块之前）加入实现：

````rust
//! 提取并归一化客户端 IP，供登录限频使用。
use crate::utils::env_conf::env_flag;
use actix_web::HttpRequest;
use std::net::{IpAddr, Ipv6Addr};
use std::sync::OnceLock;

/// IPv4 原样；IPv4 映射的 IPv6 当作 IPv4；其余 IPv6 归并到 /64 前缀
/// （同一网段内换地址不能绕过限频）。
pub fn normalize_ip(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v4) => v4.to_string(),
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return v4.to_string();
            }
            let s = v6.segments();
            format!("{}/64", Ipv6Addr::new(s[0], s[1], s[2], s[3], 0, 0, 0, 0))
        }
    }
}

/// 纯函数版本，便于测试。
/// `trust_proxy_header` 为 false 时一律忽略 `X-Forwarded-For`（它可以被客户端伪造）；
/// 为 true 时取**最右一项**：那是我们自己的反向代理追加的、可信的真实客户端 IP。
pub fn resolve_client_ip(
    peer: Option<IpAddr>,
    forwarded_for: Option<&str>,
    trust_proxy_header: bool,
) -> String {
    if trust_proxy_header {
        let rightmost = forwarded_for
            .and_then(|raw| raw.split(',').map(str::trim).filter(|s| !s.is_empty()).last());
        if let Some(ip) = rightmost.and_then(|s| s.parse::<IpAddr>().ok()) {
            return normalize_ip(ip);
        }
    }
    peer.map(normalize_ip).unwrap_or_else(|| "unknown".to_string())
}

/// 从请求里取客户端 IP。`TRUST_PROXY_HEADER` 只在进程启动后读取一次。
pub fn client_ip(req: &HttpRequest) -> String {
    static TRUST: OnceLock<bool> = OnceLock::new();
    let trust = *TRUST.get_or_init(|| env_flag("TRUST_PROXY_HEADER"));
    // 可能有多行 X-Forwarded-For 头：全部拼起来，最右一项仍是最后追加的
    let joined = req
        .headers()
        .get_all("x-forwarded-for")
        .filter_map(|v| v.to_str().ok())
        .collect::<Vec<_>>()
        .join(",");
    let forwarded = if joined.is_empty() { None } else { Some(joined.as_str()) };
    resolve_client_ip(req.peer_addr().map(|a| a.ip()), forwarded, trust)
}
````

修改 `.env.example`：把下面这段

````ini
LOGIN_LOCK_MIN=15
````

替换为

````ini
LOGIN_LOCK_MIN=15
# 部署在 Nginx 等反向代理后面时设为 true（读取 X-Forwarded-For 最右一项）；
# 未经代理直连时务必保持 false，否则该请求头可被伪造来绕过限频
TRUST_PROXY_HEADER=false
````

- [ ] **Step 4: 运行，确认通过**

```bash
cargo test -- utils::client_ip
```

Expected: `test result: ok. 7 passed; 0 failed`。

- [ ] **Step 5: 提交**

```bash
git add "src/utils/client_ip.rs" "src/utils/mod.rs" ".env.example"
git commit -F - <<'EOF'
feat(auth): 客户端 IP 提取与归一化（可选信任 X-Forwarded-For）

默认只用连接对端地址；TRUST_PROXY_HEADER=true 时取 X-Forwarded-For 最右一项；
IPv6 归并到 /64，IPv4 映射地址按 IPv4 处理。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 3: 429 错误类型与 `Retry-After`

`Exception` 新增 `TooManyRequests`，状态码 429，响应头带 `Retry-After`，文案按剩余时间向上取整到分钟（至少 1 分钟），不透露是哪条规则触发的。

**Files:**
- Modify: `src/config.rs`

**Interfaces:**
- Consumes: 无
- Produces: `config::Exception::TooManyRequests { msg: String, retry_after_secs: u64 }`、`Exception::too_many_requests(retry_after_secs: u64) -> Exception`

- [ ] **Step 1: 写失败的测试**

修改 `src/config.rs`：把下面这段

````rust
impl error::ResponseError for Exception {
````

替换为

````rust
#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::ResponseError;

    #[test]
    fn too_many_requests_is_429_with_retry_after_header() {
        let e = Exception::too_many_requests(61);
        let resp = e.error_response();
        assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(resp.headers().get("Retry-After").unwrap().to_str().unwrap(), "61");
    }

    #[test]
    fn retry_minutes_round_up_with_a_floor_of_one() {
        let cases = [(0, 1), (1, 1), (60, 1), (61, 2), (900, 15)];
        for (secs, minutes) in cases {
            assert_eq!(
                Exception::too_many_requests(secs).to_string(),
                format!("尝试次数过多，请 {minutes} 分钟后再试"),
                "{secs} 秒"
            );
        }
    }

    #[test]
    fn other_errors_have_no_retry_after_header() {
        let resp = Exception::BadRequest("x".to_string()).error_response();
        assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
        assert!(resp.headers().get("Retry-After").is_none());
    }
}

impl error::ResponseError for Exception {
````

- [ ] **Step 2: 运行，确认失败**

```bash
cargo test -- config::tests
```

Expected: 编译失败：`Exception` 上没有名为 `too_many_requests` 的关联函数。

- [ ] **Step 3: 写最小实现**

修改 `src/config.rs`：把下面这段

````rust
    BadRequest(String),
}
````

替换为

````rust
    BadRequest(String),
    /// 429：登录失败过多被临时锁定
    TooManyRequests { msg: String, retry_after_secs: u64 },
}

impl Exception {
    /// 登录被临时锁定：文案按剩余时间向上取整到分钟（至少 1 分钟），不透露是哪条规则触发的
    pub fn too_many_requests(retry_after_secs: u64) -> Self {
        let minutes = retry_after_secs.div_ceil(60).max(1);
        Exception::TooManyRequests {
            msg: format!("尝试次数过多，请 {minutes} 分钟后再试"),
            retry_after_secs,
        }
    }
}
````

修改 `src/config.rs`：把下面这段

````rust
            Exception::NotFound => write!(f, "not found"),
````

替换为

````rust
            Exception::NotFound => write!(f, "not found"),
            Exception::TooManyRequests { msg, .. } => write!(f, "{}", msg),
````

修改 `src/config.rs`：把下面这段

````rust
            Exception::NotFound => StatusCode::NOT_FOUND,
        }
````

替换为

````rust
            Exception::NotFound => StatusCode::NOT_FOUND,
            Exception::TooManyRequests { .. } => StatusCode::TOO_MANY_REQUESTS,
        }
````

修改 `src/config.rs`：把下面这段

````rust
        error!("Error: {:?}", result);
        HttpResponse::build(self.status_code())
            .insert_header(ContentType::html())
            .body(serde_json::to_string(&result).unwrap())
````

替换为

````rust
        error!("Error: {:?}", result);
        let mut builder = HttpResponse::build(self.status_code());
        builder.insert_header(ContentType::html());
        if let Exception::TooManyRequests { retry_after_secs, .. } = self {
            builder.insert_header(("Retry-After", retry_after_secs.to_string()));
        }
        builder.body(serde_json::to_string(&result).unwrap())
````

- [ ] **Step 4: 运行，确认通过**

```bash
cargo test -- config::tests
```

Expected: `test result: ok. 3 passed; 0 failed`。

- [ ] **Step 5: 提交**

```bash
git add "src/config.rs"
git commit -F - <<'EOF'
feat(auth): 新增 429 错误类型与 Retry-After

文案「尝试次数过多，请 N 分钟后再试」，N 为剩余秒数向上取整到分钟（至少 1）。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 4: 登录辅助函数：入参校验、常量时间比较、假哈希、Cookie

把登录里不依赖数据库和请求对象的逻辑都放进 `user/login_support.rs`，全部可单测。`is_bcrypt_hash` 从 `apis.rs` 搬到这里（Task 5 删除旧定义）。

**Files:**
- Create: `src/user/login_support.rs`
- Modify: `src/user/mod.rs`
- Modify: `src/utils/jwt_utils.rs`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `Exception`（Task 3 之前就有 `BadRequest`）、`utils::env_conf::env_flag`（Task 1）
- Produces: `user::login_support::{USERNAME_MAX_CHARS: usize = 64, PASSWORD_MAX_CHARS: usize = 128, validate_login_input(&str, &str) -> Result<(), Exception>, ct_eq(&[u8], &[u8]) -> bool, sanitize_for_log(&str) -> String, is_bcrypt_hash(&str) -> bool, dummy_bcrypt_hash() -> &'static str, burn_dummy_verify(&str), enum PasswordCheck { Valid { upgrade_needed: bool }, Invalid }, check_password(stored: &str, input: &str) -> PasswordCheck, cookie_secure() -> bool, auth_cookie(token: &str, max_age_hours: i64, secure: bool) -> Cookie<'static>, clear_auth_cookie(secure: bool) -> Cookie<'static>}`；`utils::jwt_utils::jwt_exp_hours` 改为 `pub`

- [ ] **Step 1: 写失败的测试**

创建 `src/user/login_support.rs`，**先只写测试**：

````rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_login_input_enforces_presence_and_length() {
        assert!(validate_login_input("alice", "pw").is_ok());
        for (u, p) in [("", "pw"), ("   ", "pw"), ("alice", "")] {
            assert!(
                matches!(validate_login_input(u, p), Err(Exception::BadRequest(_))),
                "{u:?}/{p:?} 应被拒绝"
            );
        }
        let max_name = "a".repeat(USERNAME_MAX_CHARS);
        let max_pwd = "p".repeat(PASSWORD_MAX_CHARS);
        assert!(validate_login_input(&max_name, &max_pwd).is_ok());
        assert!(validate_login_input(&format!("{max_name}x"), "pw").is_err());
        assert!(validate_login_input("alice", &format!("{max_pwd}x")).is_err());
    }

    #[test]
    fn length_limits_count_characters_not_bytes() {
        let cjk_pwd = "密".repeat(PASSWORD_MAX_CHARS);
        assert!(validate_login_input("alice", &cjk_pwd).is_ok(), "128 个汉字应该放行");
        assert!(validate_login_input("alice", &format!("{cjk_pwd}密")).is_err());
    }

    #[test]
    fn ct_eq_matches_plain_equality() {
        assert!(ct_eq(b"secret", b"secret"));
        assert!(ct_eq(b"", b""));
        assert!(!ct_eq(b"secret", b"secreT"));
        assert!(!ct_eq(b"secret", b"secret!"), "长度不同必须不相等");
        assert!(!ct_eq(b"secret!", b"secret"));
        assert!(!ct_eq(b"", b"x"));
    }

    #[test]
    fn sanitize_for_log_strips_control_chars_and_truncates() {
        assert_eq!(sanitize_for_log("ab\ncd\r\x1b[31mef"), "abcd[31mef");
        assert_eq!(sanitize_for_log(&"x".repeat(100)).chars().count(), 64);
        assert_eq!(sanitize_for_log("正常用户名"), "正常用户名");
    }

    #[test]
    fn bcrypt_hash_detection() {
        assert!(is_bcrypt_hash("$2b$12$abcdefghijklmnopqrstuv"));
        assert!(is_bcrypt_hash("$2a$10$x"));
        assert!(is_bcrypt_hash("$2y$10$x"));
        assert!(!is_bcrypt_hash("plain-password"));
        assert!(!is_bcrypt_hash(""));
    }

    #[test]
    fn bcrypt_password_is_verified_without_upgrade() {
        let stored = bcrypt::hash("s3cret", 4).unwrap();
        assert_eq!(check_password(&stored, "s3cret"), PasswordCheck::Valid { upgrade_needed: false });
        assert_eq!(check_password(&stored, "wrong"), PasswordCheck::Invalid);
    }

    #[test]
    fn legacy_plaintext_password_is_valid_and_flagged_for_upgrade() {
        assert_eq!(check_password("legacy-pw", "legacy-pw"), PasswordCheck::Valid { upgrade_needed: true });
        assert_eq!(check_password("legacy-pw", "legacy-px"), PasswordCheck::Invalid);
        assert_eq!(check_password("legacy-pw", ""), PasswordCheck::Invalid);
    }

    #[test]
    fn malformed_bcrypt_value_is_invalid_not_a_panic() {
        assert_eq!(check_password("$2b$garbage", "x"), PasswordCheck::Invalid);
    }

    #[test]
    fn dummy_hash_is_a_valid_stable_bcrypt_hash() {
        let first = dummy_bcrypt_hash();
        assert!(is_bcrypt_hash(first));
        assert!(std::ptr::eq(first, dummy_bcrypt_hash()), "只生成一次");
        burn_dummy_verify("anything"); // 不 panic 即可
    }

    #[test]
    fn auth_cookie_has_expected_attributes() {
        let c = auth_cookie("tok", 12, true);
        assert_eq!(c.name(), "auth_token");
        assert_eq!(c.value(), "tok");
        assert_eq!(c.path(), Some("/"));
        assert_eq!(c.http_only(), Some(true));
        assert_eq!(c.secure(), Some(true));
        assert_eq!(c.same_site(), Some(SameSite::Lax));
        assert_eq!(c.max_age(), Some(Duration::hours(12)));
        assert_ne!(auth_cookie("tok", 12, false).secure(), Some(true), "未开启时不能带 Secure");
    }

    #[test]
    fn clear_cookie_expires_immediately_with_same_scope() {
        let c = clear_auth_cookie(false);
        assert_eq!(c.value(), "");
        assert_eq!(c.path(), Some("/"));
        assert_eq!(c.max_age(), Some(Duration::seconds(0)));
        assert_eq!(c.http_only(), Some(true));
    }
}
````

修改 `src/user/mod.rs`：把下面这段

````rust
pub mod apis;
````

替换为

````rust
pub mod apis;
pub mod login_support;
````

- [ ] **Step 2: 运行，确认失败**

```bash
cargo test -- user::login_support
```

Expected: 编译失败（找不到 `validate_login_input`、`check_password` 等）。

- [ ] **Step 3: 写最小实现**

在 `src/user/login_support.rs` 的**最上方**（测试模块之前）加入实现：

````rust
//! 登录相关的纯辅助逻辑：入参校验、密码校验、日志净化、Cookie 构造。
use crate::config::Exception;
use crate::utils::env_conf::env_flag;
use crate::utils::jwt_utils::AUTH_COOKIE_NAME;
use actix_web::cookie::{time::Duration, Cookie, SameSite};
use std::sync::OnceLock;

pub const USERNAME_MAX_CHARS: usize = 64;
pub const PASSWORD_MAX_CHARS: usize = 128;

/// 登录入参校验：用户名非空且 ≤ 64 字符，密码非空且 ≤ 128 字符。
pub fn validate_login_input(username: &str, password: &str) -> Result<(), Exception> {
    if username.trim().is_empty() || password.is_empty() {
        return Err(Exception::BadRequest("请输入用户名和密码".to_string()));
    }
    if username.chars().count() > USERNAME_MAX_CHARS || password.chars().count() > PASSWORD_MAX_CHARS {
        return Err(Exception::BadRequest("用户名或密码过长".to_string()));
    }
    Ok(())
}

/// 常量时间比较：长度不同也走满较长一方的循环，只泄露「是否相等」。
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    let n = a.len().max(b.len());
    let mut diff = u8::from(a.len() != b.len());
    for i in 0..n {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        diff |= x ^ y;
    }
    std::hint::black_box(diff) == 0
}

/// 写进日志的用户名：去掉控制字符（防日志注入）并截断到 64 个字符。
pub fn sanitize_for_log(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(64).collect()
}

pub fn is_bcrypt_hash(s: &str) -> bool {
    s.starts_with("$2b$") || s.starts_with("$2a$") || s.starts_with("$2y$")
}

static DUMMY_HASH: OnceLock<String> = OnceLock::new();

/// 一个固定的假 bcrypt 哈希，首次使用时按 `DEFAULT_COST` 生成。
/// 用户名不存在时拿它做一次等价的 `bcrypt::verify`，使响应时间与「用户存在、密码错误」接近。
pub fn dummy_bcrypt_hash() -> &'static str {
    DUMMY_HASH
        .get_or_init(|| bcrypt::hash("dummy-password-for-timing", bcrypt::DEFAULT_COST).unwrap_or_default())
        .as_str()
}

/// 对假哈希做一次校验并丢弃结果（仅为消耗与真实校验相同的时间）。
pub fn burn_dummy_verify(password: &str) {
    let _ = bcrypt::verify(password, dummy_bcrypt_hash());
}

#[derive(Debug, PartialEq, Eq)]
pub enum PasswordCheck {
    /// `upgrade_needed`：库里还是旧明文密码，登录成功后应升级为 bcrypt
    Valid { upgrade_needed: bool },
    Invalid,
}

/// 校验密码：bcrypt 哈希走 `bcrypt::verify`；否则按旧明文密码做常量时间比较。
pub fn check_password(stored: &str, input: &str) -> PasswordCheck {
    if is_bcrypt_hash(stored) {
        if bcrypt::verify(input, stored).unwrap_or(false) {
            PasswordCheck::Valid { upgrade_needed: false }
        } else {
            PasswordCheck::Invalid
        }
    } else if ct_eq(stored.as_bytes(), input.as_bytes()) {
        PasswordCheck::Valid { upgrade_needed: true }
    } else {
        PasswordCheck::Invalid
    }
}

/// 登录 Cookie 是否加 `Secure`（上 HTTPS 时通过 `COOKIE_SECURE=true` 开启），进程内只读一次。
pub fn cookie_secure() -> bool {
    static SECURE: OnceLock<bool> = OnceLock::new();
    *SECURE.get_or_init(|| env_flag("COOKIE_SECURE"))
}

/// 登录 Cookie：HttpOnly + SameSite=Lax，`Max-Age` 与 JWT 有效期一致，使 Cookie 与令牌同时失效。
pub fn auth_cookie(token: &str, max_age_hours: i64, secure: bool) -> Cookie<'static> {
    Cookie::build(AUTH_COOKIE_NAME, token.to_owned())
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::hours(max_age_hours))
        .secure(secure)
        .finish()
}

/// 退出登录时清除 Cookie：属性必须与签发时一致，浏览器才会认作同一个 Cookie。
pub fn clear_auth_cookie(secure: bool) -> Cookie<'static> {
    Cookie::build(AUTH_COOKIE_NAME, "")
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(0))
        .secure(secure)
        .finish()
}
````

修改 `src/utils/jwt_utils.rs`：把下面这段

````rust
fn jwt_exp_hours() -> i64 {
````

替换为

````rust
pub fn jwt_exp_hours() -> i64 {
````

修改 `.env.example`：把下面这段

````ini
TRUST_PROXY_HEADER=false
````

替换为

````ini
TRUST_PROXY_HEADER=false
# 登录 Cookie 加 Secure 属性（上 HTTPS 时设为 true）
COOKIE_SECURE=false
````

- [ ] **Step 4: 运行，确认通过**

```bash
cargo test -- user::login_support
```

Expected: `test result: ok. 11 passed; 0 failed`。第一次运行会慢几秒：`dummy_hash_is_a_valid_stable_bcrypt_hash` 要在调试版里算一次 cost 12 的 bcrypt。

- [ ] **Step 5: 提交**

```bash
git add "src/user/login_support.rs" "src/user/mod.rs" "src/utils/jwt_utils.rs" ".env.example"
git commit -F - <<'EOF'
feat(auth): 登录辅助函数（入参校验、常量时间比较、假哈希、Cookie）

用户名 ≤64、密码 ≤128 字符；旧明文密码用常量时间比较；
用户名不存在时用固定假 bcrypt 哈希做等价校验以抹平耗时；
Cookie 带 Max-Age（与 JWT 有效期一致），COOKIE_SECURE=true 时加 Secure。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 5: 重写登录处理并接入限频

顺序很重要：**先查锁**（被锁时不查库、不算 bcrypt）→ 查用户（绑定参数）→ 校验密码（用户不存在时做假校验）→ 失败记账并统一返回 400「账号或密码错误!」→ 成功清「用户名+IP」桶。旧明文密码升级为 bcrypt 时改用绑定参数的 `UPDATE`，取代原来的 `format!` 拼接。登录路由单独限制请求体 4 KB。

`LoginGuard` 必须在 `main.rs` 里**闭包外**创建、闭包内 `clone`，才能让所有 worker 共享同一份计数；在闭包内创建会让每个 worker 各有一份，限频阈值被放大 worker 数倍。

**Files:**
- Modify: `src/user/apis.rs`
- Modify: `src/main.rs`

**Interfaces:**
- Consumes: Task 1–4 的全部产出
- Produces: `POST /user/login` 的新行为；`web::Data<LoginGuard>` 已注册到应用；`user::apis::api_login` 变成普通 `async fn`（不再带 `#[post]` 宏，改为在 `user_scope()` 里用 `web::resource("/login")` 注册以便单独设置请求体上限）

- [ ] **Step 1: 写失败的测试**

修改 `src/user/apis.rs`：把下面这段

````rust
#[cfg(test)]
mod test {
````

替换为

````rust
#[cfg(test)]
mod login_tests {
    use super::*;
    use crate::utils::login_guard::LoginGuardConfig;

    #[test]
    fn fail_login_records_a_failure_and_returns_a_uniform_message() {
        let guard = LoginGuard::new(LoginGuardConfig::default());
        for _ in 0..4 {
            let e = fail_login(&guard, "10.0.0.1", "alice");
            assert_eq!(e.to_string(), "账号或密码错误!");
        }
        assert!(guard.check("10.0.0.1", "alice", Instant::now()).is_ok(), "4 次还不该锁");
        fail_login(&guard, "10.0.0.1", "alice");
        assert!(guard.check("10.0.0.1", "alice", Instant::now()).is_err(), "第 5 次应锁定");
    }
}

#[cfg(test)]
mod test {
````

- [ ] **Step 2: 运行，确认失败**

```bash
cargo test -- user::apis::login_tests
```

Expected: 编译失败（找不到 `fail_login`）。

- [ ] **Step 3: 写最小实现**

修改 `src/user/apis.rs`：把下面这段

````rust
use crate::user::structs::LoginDto;
use crate::utils::jwt_utils::{create_jwt, AUTH_COOKIE_NAME};
use crate::{error, Exception, User, R};
use actix_web::cookie::{time::Duration, Cookie, SameSite};
use actix_web::{get, post, web, HttpResponse, Responder};
use rbatis::RBatis;
use serde::Deserialize;
use tracing::log::info;
use tracing::{instrument, span, Level};
````

替换为

````rust
use crate::user::login_support::{
    auth_cookie, burn_dummy_verify, check_password, clear_auth_cookie, cookie_secure,
    sanitize_for_log, validate_login_input, PasswordCheck,
};
use crate::user::structs::LoginDto;
use crate::utils::client_ip::client_ip;
use crate::utils::jwt_utils::{create_jwt, jwt_exp_hours};
use crate::utils::login_guard::LoginGuard;
use crate::{error, Exception, User, R};
use actix_web::{get, post, web, HttpRequest, HttpResponse, Responder};
use rbatis::RBatis;
use serde::Deserialize;
use std::time::Instant;
use tracing::instrument;
use tracing::log::{info, warn};
````

修改 `src/user/apis.rs`：把下面这段

````rust
        .service(api_login)
        .service(api_logout)
````

替换为

````rust
        // 登录接口单独限制请求体大小，超出由 Actix 直接返回 413
        .service(
            web::resource("/login")
                .app_data(web::JsonConfig::default().limit(LOGIN_BODY_LIMIT))
                .route(web::post().to(api_login)),
        )
        .service(api_logout)
````

修改 `src/user/apis.rs`：**删除**下面这段

````rust
fn is_bcrypt_hash(s: &str) -> bool {
    s.starts_with("$2b$") || s.starts_with("$2a$") || s.starts_with("$2y$")
}
````

修改 `src/user/apis.rs`：把从 `#[post("/login")]` 这一行开始、到 `#[post("/logout")]` 这一行**之前**的全部内容，替换为

````rust
/// 登录请求体上限（字节）。正常的用户名 + 密码远小于这个值，防止被喂超大请求体
const LOGIN_BODY_LIMIT: usize = 4096;

/// 登录失败：记一次失败、写一条 warn（不含密码），统一返回「账号或密码错误!」
fn fail_login(guard: &LoginGuard, ip: &str, username: &str) -> Exception {
    guard.record_failure(ip, username, Instant::now());
    warn!("login failed: ip={} username={}", ip, sanitize_for_log(username));
    Exception::BadRequest("账号或密码错误!".to_string())
}

/// 旧明文密码登录成功后升级为 bcrypt；全程绑定参数，不拼接 SQL
async fn upgrade_password_hash(db: &RBatis, user_id: i32, plain: &str) {
    match bcrypt::hash(plain, bcrypt::DEFAULT_COST) {
        Ok(hashed) => {
            let res = db
                .exec(
                    "update tb_user set password = ? where id = ?",
                    vec![rbs::to_value!(hashed), rbs::to_value!(user_id)],
                )
                .await;
            match res {
                Ok(_) => info!("upgraded plaintext password to bcrypt for user id: {}", user_id),
                Err(e) => error!("upgrade password hash failed for user id {}: {}", user_id, e),
            }
        }
        Err(e) => error!("bcrypt hash failed during upgrade: {}", e),
    }
}

/// 登录。顺序很重要：先查锁（被锁时不查库、不算 bcrypt），再校验密码；
/// 用户不存在时也做一次等价的 bcrypt 校验，抹平响应时间差。
pub async fn api_login(
    req: HttpRequest,
    login_dto: web::Json<LoginDto>,
    db: web::Data<RBatis>,
    guard: web::Data<LoginGuard>,
) -> Result<impl Responder, Exception> {
    let username = login_dto.username.as_str();
    let password = login_dto.password.as_str();
    validate_login_input(username, password)?;

    let ip = client_ip(&req);
    if let Err(retry_after_secs) = guard.check(&ip, username, Instant::now()) {
        warn!("login locked: ip={} username={}", ip, sanitize_for_log(username));
        return Err(Exception::too_many_requests(retry_after_secs));
    }

    let found = User::select_by_username(&**db, username).await.map_err(|e| {
        error!("login query failed: {}", e);
        Exception::InternalError
    })?;
    let Some(mut user) = found.into_iter().next() else {
        burn_dummy_verify(password);
        return Err(fail_login(&guard, &ip, username));
    };

    let upgrade_needed = match check_password(&user.password, password) {
        PasswordCheck::Valid { upgrade_needed } => upgrade_needed,
        PasswordCheck::Invalid => return Err(fail_login(&guard, &ip, username)),
    };

    // 密码正确但账号被锁：只对知道密码的人透露「已锁定」，不算一次失败
    if user.locked == 1 {
        return Err(Exception::BadRequest("当前账号已被锁定".to_string()));
    }

    guard.record_success(&ip, username);
    if upgrade_needed {
        if let Some(id) = user.id {
            upgrade_password_hash(&**db, id, password).await;
        }
    }

    let token = create_jwt(user.id.unwrap_or_default(), &user.username, &user.role)?;
    user.filter_pwd();
    info!("login success: id={:?} username={}", user.id, sanitize_for_log(&user.username));

    let cookie = auth_cookie(&token, jwt_exp_hours(), cookie_secure());
    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(R::<User>::ok_msg_obj("登录成功!", user)))
}
````

修改 `src/user/apis.rs`：把下面这段

````rust
    let cookie = Cookie::build(AUTH_COOKIE_NAME, "")
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(Duration::seconds(0))
        .finish();
````

替换为

````rust
    let cookie = clear_auth_cookie(cookie_secure());
````

修改 `src/main.rs`：把下面这段

````rust
use crate::user::structs::User;
````

替换为

````rust
use crate::user::structs::User;
use crate::utils::login_guard::{LoginGuard, LoginGuardConfig};
````

修改 `src/main.rs`：把下面这段

````rust
    info!("database init completed!");
    HttpServer::new(move || {
````

替换为

````rust
    info!("database init completed!");

    // 登录限频状态必须在所有 worker 之间共享：Data 在闭包外创建，闭包内 clone（共享同一个 Arc）。
    // 若在闭包内创建，每个 worker 各有一份计数，限频阈值会被放大 worker 数倍。
    let login_guard = web::Data::new(LoginGuard::new(LoginGuardConfig::from_env()));
    // 预热「用户不存在」时用来抹平耗时的假 bcrypt 哈希，避免第一次登录多花一次哈希时间
    user::login_support::dummy_bcrypt_hash();

    HttpServer::new(move || {
````

修改 `src/main.rs`：把下面这段

````rust
            .app_data(web::Data::new(rbatis.clone()))
````

替换为

````rust
            .app_data(web::Data::new(rbatis.clone()))
            .app_data(login_guard.clone())
````

- [ ] **Step 4: 运行，确认通过**

```bash
cargo test -- user::apis::login_tests
```

Expected: `test result: ok. 1 passed; 0 failed`；再运行一次 `cargo build` 确认整个项目能编译（只会有原来就有的 warning）。

- [ ] **Step 5: 提交**

```bash
git add "src/user/apis.rs" "src/main.rs"
git commit -F - <<'EOF'
feat(auth): 登录接入限频，统一错误文案，旧明文密码升级改用绑定参数

先查锁再校验密码；用户不存在时做假 bcrypt 校验抹平耗时；
失败统一返回 400「账号或密码错误!」，被锁返回 429；
登录路由请求体上限 4 KB；LoginGuard 在闭包外创建以便所有 worker 共享。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 6: 中间件重写：账号状态校验、`AuthUser`、`GET /user/me`、CORS 顺序

- 鉴权逻辑抽成 `authorize()`；白名单匹配抽成可单测的 `is_white_listed()`（行为不变，并让空条目不再匹配任何路径）
- **每个**非公开请求都按主键查用户：不存在或被锁定 → 401，实现「账号锁定立即生效」
- 拒绝时返回**正常的 401/403 响应**（响应体用 `EitherBody` 的右侧），**并且**在 `main.rs` 里把 CORS 放到最外层。两者缺一不可：`actix-cors` 对内层返回的 `Err` 是直接冒泡的，不会补 CORS 头；而响应没有 `Access-Control-Allow-Origin` 时，浏览器会把跨域的 401 当成「网络错误」，前端读不到状态码，「401 → 回登录页」就永远不会触发。
- `PUBLIC_PATHS` 在本任务里定义并有测试，但 `main.rs` 里实际使用它（真正关上大门）留到 Task 11。

**Files:**
- Modify: `src/user/structs.rs`
- Modify: `src/user/apis.rs`
- Modify: `src/middleware.rs`
- Modify: `src/main.rs`

**Interfaces:**
- Consumes: `User::select_by_id`、`utils::jwt_utils::verify_jwt`（已有）
- Produces: `middleware::{PUBLIC_PATHS: &[&str], is_white_listed(&str, &[&str]) -> bool, AuthFilter, FilterWhiteList}`、`user::structs::AuthUser { id: i32, username, nick_name, role: String }`（含 `From<&User>`）、`GET /user/me`（需登录，返回 `AuthUser`）

- [ ] **Step 1: 写失败的测试**

修改 `src/user/structs.rs`：把下面这段

````rust
    pub remember: bool,
}
````

替换为

````rust
    pub remember: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_user_exposes_only_identity_fields() {
        let mut u = User::new("alice", "s3cret-password", "Alice");
        u.id = Some(7);
        u.role = "admin".to_string();
        let au = AuthUser::from(&u);
        assert_eq!(au.id, 7);
        assert_eq!(au.username, "alice");
        assert_eq!(au.nick_name, "Alice");
        assert_eq!(au.role, "admin");
        let json = serde_json::to_string(&au).unwrap();
        for forbidden in ["password", "s3cret", "salt", "locked", "created_time"] {
            assert!(!json.contains(forbidden), "{forbidden} 不应出现：{json}");
        }
    }
}
````

修改 `src/middleware.rs`：把下面这段

````rust
    println!("{:?}", vec);
}
````

替换为

````rust
    println!("{:?}", vec);
}

#[cfg(test)]
mod gate_tests {
    use super::*;
    use actix_web::http::StatusCode;
    // 注意：必须重命名导入。直接 `use actix_web::test` 会把标准库的 #[test] 属性也一并遮蔽，
    // 普通同步测试会被当成 actix 的异步测试而编译失败。
    use actix_web::{test as actix_test, App, HttpResponse};

    #[test]
    fn white_list_matches_segment_wise() {
        let list = ["/user/login", "/post/list_by_category/*", "/category/**"];
        assert!(is_white_listed("/user/login", &list));
        assert!(is_white_listed("/user/login/extra", &list), "条目同样覆盖更长的 URL");
        assert!(!is_white_listed("/user/logi", &list));
        assert!(!is_white_listed("/user", &list));
        assert!(is_white_listed("/post/list_by_category/Rust", &list), "* 匹配恰好一段");
        assert!(!is_white_listed("/post/list_by_category", &list));
        assert!(is_white_listed("/category/list", &list));
        assert!(is_white_listed("/category/a/b/c", &list), "** 匹配剩余全部");
        assert!(!is_white_listed("/category", &list), "** 至少要有一段");
    }

    #[test]
    fn empty_white_list_entries_never_match() {
        for entry in ["", "/", "//"] {
            assert!(!is_white_listed("/post/page", &[entry]), "{entry:?} 不能放行任何路径");
        }
        assert!(!is_white_listed("/post/page", &[]));
    }

    #[test]
    fn only_login_and_logout_are_public() {
        assert_eq!(PUBLIC_PATHS, &["/user/login", "/user/logout"]);
        for p in ["/user/login", "/user/logout"] {
            assert!(is_white_listed(p, PUBLIC_PATHS), "{p} 应公开");
        }
        let must_be_protected = [
            "/post/page",
            "/post/get/1",
            "/post/list_by_category/Rust",
            "/category/list",
            "/comment/add",
            "/comment/list/3",
            "/tag/cloud",
            "/tag/posts",
            "/tag/post/1",
            "/moment/page",
            "/user/get/1",
            "/user/me",
            "/user/admin/list/page",
            "/moment/admin/list/page",
            "/note_sync/admin/config",
        ];
        for p in must_be_protected {
            assert!(!is_white_listed(p, PUBLIC_PATHS), "{p} 不应公开");
        }
    }

    async fn ok() -> HttpResponse {
        HttpResponse::Ok().finish()
    }

    /// 发请求并取状态码：拒绝时中间件返回的是正常的 401 响应；
    /// 内层服务若返回 Err，就取 Error 对应的响应状态码
    macro_rules! status_of {
        ($app:expr, $req:expr) => {
            match actix_test::try_call_service(&$app, $req).await {
                Ok(res) => res.status(),
                Err(e) => e.as_response_error().status_code(),
            }
        };
    }

    #[actix_web::test]
    async fn protected_path_without_cookie_is_401() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let status = status_of!(app, actix_test::TestRequest::post().uri("/post/page").to_request());
        assert_eq!(status, StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn garbage_cookie_is_401() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let req = actix_test::TestRequest::post()
            .uri("/post/page")
            .insert_header(("Cookie", "auth_token=not-a-jwt"))
            .to_request();
        assert_eq!(status_of!(app, req), StatusCode::UNAUTHORIZED);
    }

    #[actix_web::test]
    async fn public_path_needs_no_cookie() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/user/login", actix_web::web::post().to(ok)),
        )
        .await;
        let status = status_of!(app, actix_test::TestRequest::post().uri("/user/login").to_request());
        assert_eq!(status, StatusCode::OK);
    }

    #[actix_web::test]
    async fn missing_white_list_fails_closed() {
        let app = actix_test::init_service(
            App::new()
                .wrap(AuthFilter)
                .route("/user/login", actix_web::web::post().to(ok)),
        )
        .await;
        let status = status_of!(app, actix_test::TestRequest::post().uri("/user/login").to_request());
        assert_eq!(status, StatusCode::UNAUTHORIZED, "没配白名单时一律拒绝，而不是一律放行");
    }

    #[actix_web::test]
    async fn cors_preflight_is_not_blocked() {
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let req = actix_test::TestRequest::default()
            .method(actix_web::http::Method::OPTIONS)
            .uri("/post/page")
            .to_request();
        assert_ne!(status_of!(app, req), StatusCode::UNAUTHORIZED);
    }

    /// 回归测试：被拒绝的 401 必须带 CORS 头，否则浏览器会把跨域的 401 当成网络错误，
    /// 前端读不到状态码，「401 → 回登录页」就不会触发。
    /// 条件有两个：Cors 在最外层（main.rs 里 .wrap(AuthFilter) 在前、.wrap(cors) 在后），
    /// 且 AuthFilter 拒绝时返回的是正常响应而不是 Err（Err 会绕过外层的 Cors 中间件）。
    #[actix_web::test]
    async fn denied_response_still_carries_cors_headers() {
        use actix_cors::Cors;
        let app = actix_test::init_service(
            App::new()
                .app_data(FilterWhiteList(PUBLIC_PATHS.to_vec()))
                .wrap(AuthFilter)
                .wrap(
                    Cors::default()
                        .allowed_origin("http://localhost:8188")
                        .supports_credentials(),
                )
                .route("/post/page", actix_web::web::post().to(ok)),
        )
        .await;
        let req = actix_test::TestRequest::post()
            .uri("/post/page")
            .insert_header(("Origin", "http://localhost:8188"))
            .to_request();
        let res = actix_test::call_service(&app, req).await;
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);
        let allow_origin = res.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap());
        assert_eq!(allow_origin, Some("http://localhost:8188"));
        let allow_creds = res.headers().get("access-control-allow-credentials").map(|v| v.to_str().unwrap());
        assert_eq!(allow_creds, Some("true"));
    }
}
````

- [ ] **Step 2: 运行，确认失败**

```bash
cargo test -- middleware::gate_tests user::structs::tests
```

Expected: 编译失败（找不到 `is_white_listed`、`PUBLIC_PATHS`、`AuthUser`）。

- [ ] **Step 3: 写最小实现**

修改 `src/user/structs.rs`：把下面这段

````rust
    pub remember: bool,
}
````

替换为

````rust
    pub remember: bool,
}

/// 通过登录校验后放进请求扩展的「当前用户」，也是 `GET /user/me` 的响应体。
/// 刻意只含身份字段：不含密码、盐、锁定标记等。
#[derive(Clone, Debug, Serialize)]
pub struct AuthUser {
    pub id: i32,
    pub username: String,
    pub nick_name: String,
    pub role: String,
}

impl From<&User> for AuthUser {
    fn from(u: &User) -> Self {
        AuthUser {
            id: u.id.unwrap_or_default(),
            username: u.username.clone(),
            nick_name: u.nick_name.clone(),
            role: u.role.clone(),
        }
    }
}
````

修改 `src/user/apis.rs`：把下面这段

````rust
use crate::user::structs::LoginDto;
````

替换为

````rust
use crate::user::structs::{AuthUser, LoginDto};
````

修改 `src/user/apis.rs`：把下面这段

````rust
        .service(api_logout)
````

替换为

````rust
        .service(api_logout)
        .service(api_user_me)
````

修改 `src/user/apis.rs`：把下面这段

````rust
#[instrument]
#[get("/get/{id}")]
pub async fn api_user_get(
````

替换为

````rust
/// 当前登录用户（需登录）。中间件已校验账号状态，并把 AuthUser 放进了请求扩展。
#[get("/me")]
pub async fn api_user_me(user: web::ReqData<AuthUser>) -> Result<impl Responder, Exception> {
    Ok(R::ok_obj(user.into_inner()))
}

#[instrument]
#[get("/get/{id}")]
pub async fn api_user_get(
````

修改 `src/middleware.rs`：把从 `use std::future::{ready, Ready};` 这一行开始、到 `#[test]` 这一行**之前**（指文件里**第一个** `#[test]`，即 `fn test_contains` 上面那一行）的全部内容，替换为

````rust
use std::future::{ready, Ready};
use std::rc::Rc;

use crate::user::structs::{AuthUser, User};
use crate::utils::jwt_utils::{verify_jwt, AUTH_COOKIE_NAME};
use crate::AppState;
use actix_web::body::EitherBody;
use actix_web::http::Method;
use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    error, web, Error, HttpMessage,
};
use futures_util::future::LocalBoxFuture;
use rbatis::RBatis;
use tracing::log::{error, info};

/// 无需登录即可访问的路径；其余一律要求有效登录。
/// 这个列表就是整个站点的「大门」，新增公开接口前请三思。
pub const PUBLIC_PATHS: &[&str] = &["/user/login", "/user/logout"];

// There are two steps in middleware processing.
// 1. Middleware initialization, middleware factory gets called with
//    next service in chain as parameter.
// 2. Middleware's call method gets called with normal request.
/// 权限过滤器
pub struct AuthFilter;

/// 过滤器白名单
pub struct FilterWhiteList<'a>(pub Vec<&'a str>);

/// 白名单匹配（逐段）：`*` 匹配恰好一段，`**` 匹配剩余全部；
/// 白名单条目同样覆盖更长的 URL（`/comment/list` 覆盖 `/comment/list/5`）。空条目不匹配任何路径。
pub fn is_white_listed(path: &str, white_list: &[&str]) -> bool {
    let url_vec: Vec<&str> = path.split('/').filter(|v| !v.is_empty()).collect();
    'outer: for entry in white_list {
        let white_vec: Vec<&str> = entry.split('/').filter(|v| !v.is_empty()).collect();
        if white_vec.is_empty() || url_vec.len() < white_vec.len() {
            continue;
        }
        for (i, seg) in white_vec.iter().enumerate() {
            if *seg == "**" {
                return true;
            }
            if *seg == "*" || *seg == url_vec[i] {
                continue;
            }
            continue 'outer;
        }
        return true;
    }
    false
}

/// 鉴权。`Ok(None)`：公开路径，无需登录；`Ok(Some(user))`：已登录且账号状态正常；`Err`：拒绝。
/// - 没配白名单时一律拒绝，而不是一律放行
/// - 必须带有效 JWT，并且账号在库里存在、未被锁定（每次请求都查，锁定立即生效）
/// - 命中管理员路由前缀的，还要求库里的 role 是 admin
async fn authorize(req: &ServiceRequest, path: &str) -> Result<Option<AuthUser>, Error> {
    let is_public = match req.app_data::<FilterWhiteList>() {
        Some(white_list) => is_white_listed(path, &white_list.0),
        None => return Err(error::ErrorUnauthorized("unauthorized")),
    };
    if is_public {
        return Ok(None);
    }

    let claims = match req.cookie(AUTH_COOKIE_NAME).map(|c| c.value().to_string()) {
        Some(token) => match verify_jwt(&token) {
            Ok(claims) => claims,
            Err(_) => {
                error!("jwt verify failed");
                return Err(error::ErrorUnauthorized("unauthorized"));
            }
        },
        None => {
            error!("unable to verify identity!");
            return Err(error::ErrorUnauthorized("unauthorized"));
        }
    };

    let Some(db) = req.app_data::<web::Data<RBatis>>().cloned() else {
        error!("no db available for auth check");
        return Err(error::ErrorInternalServerError("db error"));
    };
    let user = match User::select_by_id(db.as_ref(), claims.sub).await {
        Ok(mut rows) => match rows.pop() {
            Some(user) => user,
            None => {
                error!("user {} no longer exists, access denied", claims.sub);
                return Err(error::ErrorUnauthorized("unauthorized"));
            }
        },
        Err(e) => {
            error!("db error checking user: {}", e);
            return Err(error::ErrorInternalServerError("db error"));
        }
    };
    if user.locked != 0 {
        error!("user {} is locked, access denied", claims.sub);
        return Err(error::ErrorUnauthorized("unauthorized"));
    }

    let is_admin_route = req
        .app_data::<web::Data<AppState>>()
        .map_or(false, |s| s.admin_route_prefixes.iter().any(|p| path.starts_with(p)));
    if is_admin_route && !user.is_admin() {
        error!("user {} is not admin, access denied", claims.sub);
        return Err(error::ErrorForbidden("admin role required"));
    }

    Ok(Some(AuthUser::from(&user)))
}

// Middleware factory is `Transform` trait
// `S` - type of the next service
// `B` - type of response's body
impl<S, B> Transform<S, ServiceRequest> for AuthFilter
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Transform = AuthFilterMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthFilterMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct AuthFilterMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for AuthFilterMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    /// 权限过滤：OPTIONS 预检直接放行；其余请求交给 `authorize`，通过后把 AuthUser 放进请求扩展。
    ///
    /// 拒绝时返回的是「正常的 401/403 响应」（响应体包在 `EitherBody` 的右侧），而不是 `Err`：
    /// `Err` 会一路向外冒泡，绕过外层的 CORS 中间件，响应就不带 CORS 头了，
    /// 浏览器会把跨域的 401 当成网络错误，前端读不到状态码。
    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = Rc::clone(&self.service);
        Box::pin(async move {
            let path = req.path().to_string();
            info!("request url is : {} {} ", req.method(), path);
            if req.method() == Method::OPTIONS {
                return service.call(req).await.map(|res| res.map_into_left_body());
            }

            match authorize(&req, &path).await {
                Ok(user) => {
                    if let Some(user) = user {
                        req.extensions_mut().insert(user);
                    }
                    service.call(req).await.map(|res| res.map_into_left_body())
                }
                Err(e) => Ok(req.error_response(e).map_into_right_body()),
            }
        })
    }
}
````

修改 `src/main.rs`：把下面这段

````rust
            // 添加跨域配置
            .wrap(cors)
            // 添加拦截器配置
            .wrap(AuthFilter)
````

替换为

````rust
            // 中间件的执行顺序是「后注册的在最外层」：AuthFilter 先注册（内层），
            // CORS 后注册（最外层）。这样 AuthFilter 拒绝请求时返回的 401 / 403 也会带上 CORS 头；
            // 反过来的话，浏览器会把跨域的 401 当成网络错误，前端读不到状态码。
            .wrap(AuthFilter)
            // 添加跨域配置
            .wrap(cors)
````

- [ ] **Step 4: 运行，确认通过**

```bash
cargo test -- middleware::gate_tests user::structs::tests
```

Expected: `test result: ok. 10 passed; 0 failed`（gate_tests 9 个 + AuthUser 1 个）。

然后做一次**反向验证**，确认 CORS 回归测试真的能抓到问题：把 `src/middleware.rs` 的 `denied_response_still_carries_cors_headers` 里 `.wrap(AuthFilter)` 与 `.wrap(Cors::default()...)` 两段的顺序**临时调换**，运行 `cargo test -- denied_response_still_carries_cors_headers`，应当失败（`left: None`、`right: Some("http://localhost:8188")`）；**再改回来**，重新运行应当通过。

- [ ] **Step 5: 提交**

```bash
git add "src/user/structs.rs" "src/user/apis.rs" "src/middleware.rs" "src/main.rs"
git commit -F - <<'EOF'
feat(auth): 中间件逐请求校验账号状态，新增 GET /user/me，CORS 置于最外层

- 鉴权抽成 authorize()，白名单匹配抽成 is_white_listed() 并有单测
- 所有非公开请求都按主键校验账号：不存在或被锁定返回 401，锁定立即生效
- 拒绝时返回正常的 401/403 响应（EitherBody），main.rs 里 CORS 放最外层，
  使跨域的 401/403 带 CORS 头，浏览器才能读到状态码（有回归测试）

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 7: 前端 `safeRedirect`（防开放重定向）

登录成功后按 `?redirect=` 跳转，这个参数来自 URL，必须只接受站内相对路径。博客前端没有测试框架，也不为此引入：用一个仓库外的一次性 Node 脚本对这个纯函数跑一组正反例。

**Files:**
- Create: `front/ryu2u_blog/src/auth/safeRedirect.ts`

**Interfaces:**
- Consumes: 无
- Produces: `front/ryu2u_blog/src/auth/safeRedirect.ts` 导出 `DEFAULT_REDIRECT = '/home'`、`safeRedirect(raw: string | null | undefined): string`

- [ ] **Step 1: 写检查脚本**

创建 `$SCRATCH/safe_redirect_check.mjs`：

````js
// 一次性检查脚本（不进仓库）：对 safeRedirect 跑一组正反例
import assert from 'node:assert/strict';
import {safeRedirect, DEFAULT_REDIRECT} from './safeRedirect.mjs';

const accepted = [
    '/post/3',
    '/category/Rust?x=1',
    '/moment',
    '/home#top',
    '/tag/%E7%AE%97%E6%B3%95',   // 已编码的中文标签
    '/loginx',                    // 不是登录页本身
];
for (const p of accepted) {
    assert.equal(safeRedirect(p), p, `应原样放行: ${p}`);
}

const rejected = [
    null, undefined, '',
    'evil.com', 'https://evil.com', 'http://evil.com/x', 'javascript:alert(1)',
    '//evil.com', '///evil.com',
    '/\\evil.com', '\\/evil.com', '\\\\evil.com',
    '/foo\nbar', '/\tfoo', '/foo\u0000', '/foo\u007f',
    '/login', '/login?redirect=/home', '/login/extra',
];
for (const p of rejected) {
    assert.equal(safeRedirect(p), DEFAULT_REDIRECT, `应回退到 ${DEFAULT_REDIRECT}: ${JSON.stringify(p)}`);
}
console.log(`safeRedirect 检查通过：${accepted.length} 个放行、${rejected.length} 个拒绝`);
````

- [ ] **Step 2: 运行，确认失败**

```bash
cd front/ryu2u_blog
npx esbuild src/auth/safeRedirect.ts --format=esm --outfile="$SCRATCH/safeRedirect.mjs" --log-level=warning
```

Expected: esbuild 报错 `Could not resolve "src/auth/safeRedirect.ts"`（文件还不存在）。

- [ ] **Step 3: 写实现**

创建 `front/ryu2u_blog/src/auth/safeRedirect.ts`：

````ts
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
````

- [ ] **Step 4: 运行，确认通过**

```bash
cd front/ryu2u_blog
npx esbuild src/auth/safeRedirect.ts --format=esm --outfile="$SCRATCH/safeRedirect.mjs" --log-level=warning \
  && node "$SCRATCH/safe_redirect_check.mjs"
npx tsc --noEmit
npx eslint src/auth --ext ts,tsx
```

Expected: 打印 `safeRedirect 检查通过：6 个放行、19 个拒绝`；`tsc` 与 `eslint` 无输出。

- [ ] **Step 5: 提交**

```bash
git add "front/ryu2u_blog/src/auth/safeRedirect.ts"
git commit -F - <<'EOF'
feat(blog): 登录后跳转目标的校验函数 safeRedirect

只接受以单个 / 开头的站内相对路径；拒绝 //、\\、协议、控制字符，
以及 /login 自身；其余回退到 /home。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 8: 前端请求层与登录状态（`AuthProvider`）

- `HttpClient` 开 `withCredentials`（凭证在 httpOnly Cookie 里，跨端口请求必须显式带上），并提供 `setUnauthorizedHandler`：任何请求收到 HTTP 401 都回调它
- `authContext.ts`（上下文 + `useAuth`，**不含组件**）与 `AuthProvider.tsx`（**只导出组件**）拆成两个文件，因为项目 eslint 的 `react-refresh/only-export-components` 规则会对「同一文件既导出组件又导出 hook」告警
- 本任务结束时只是给应用包上了 `AuthProvider`，页面行为不变（只多一次 `/user/me` 请求，未登录时返回 401 → 状态为 `anon`，暂时没有任何东西会据此跳转）
- `AuthProvider` 的 `loggedOut` 标志：主动退出后为 `true`，Task 10 的 `RequireAuth` 据此不再附带 `redirect` 参数；会话中途 401 过期则保留 `redirect`

**Files:**
- Create: `front/ryu2u_blog/src/auth/authContext.ts`
- Create: `front/ryu2u_blog/src/auth/AuthProvider.tsx`
- Modify: `front/ryu2u_blog/src/common/Structs.ts`
- Modify: `front/ryu2u_blog/src/service/UserService.ts`
- Modify: `front/ryu2u_blog/src/common/HttpClient.ts`
- Modify: `front/ryu2u_blog/src/App.tsx`

**Interfaces:**
- Consumes: 后端 `POST /user/login`、`POST /user/logout`、`GET /user/me`（Task 5、6）
- Produces: `AuthUser` 类型（`common/Structs.ts`）、`UserService.{login, logout, me}`、`setUnauthorizedHandler(handler | null)`、`useAuth(): { status: 'loading' | 'authed' | 'anon', user, loggedOut, login(username, password), logout() }`、`<AuthProvider>`

- [ ] **Step 1: 写代码**

修改 `front/ryu2u_blog/src/common/Structs.ts`：把下面这段

````ts
export class User {
````

替换为

````ts
/** 当前登录用户（/user/me 与登录响应里取出的身份字段） */
export interface AuthUser {
    id: number;
    username: string;
    nick_name: string;
    role: string;
}

export class User {
````

用下面的内容**整体替换** `front/ryu2u_blog/src/service/UserService.ts`：

````ts
import {Result} from "../common/Structs";
import http_client from "../common/HttpClient";

export default {
    /** 登录：成功后服务端通过 httpOnly Cookie 下发凭证，响应 obj 是用户信息 */
    login(username: string, password: string): Promise<Result> {
        // LoginDto.remember 是必填 bool，博客不提供「记住我」，固定传 false
        return http_client.post("/user/login", {username, password, remember: false});
    },

    /** 退出登录：服务端清除 Cookie */
    logout(): Promise<Result> {
        return http_client.post("/user/logout");
    },

    /** 当前登录用户；未登录返回 HTTP 401 */
    me(): Promise<Result> {
        return http_client.get("/user/me");
    },
}
````

用下面的内容**整体替换** `front/ryu2u_blog/src/common/HttpClient.ts`：

````ts
import axios from "axios";


const http_client = axios.create({
});

http_client.defaults.baseURL = "http://localhost:9002";
// 登录凭证在 httpOnly Cookie 里，跨端口请求必须显式带上
http_client.defaults.withCredentials = true;

let unauthorizedHandler: (() => void) | null = null;

/** AuthProvider 注册：任何请求收到 HTTP 401 时回调，用来清空登录状态 */
export function setUnauthorizedHandler(handler: (() => void) | null) {
    unauthorizedHandler = handler;
}

//一些配置，发起请求和响应可以打印出来查看
http_client.interceptors.request.use((config)=>{
    if (config.method === 'get') {
        //  给data赋值以绕过if判断
        config.data = true
    }
    config.headers.setContentType("application/json");
    return config;
});

//在response中
http_client.interceptors.response.use((config) =>{
    if (config.status == 200){
        return config.data;
    }
    return config;
}, (error) => {
    if (error?.response?.status === 401) {
        unauthorizedHandler?.();
    }
    return Promise.reject(error);
});

export  default http_client;
````

创建 `front/ryu2u_blog/src/auth/authContext.ts`：

````ts
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
````

创建 `front/ryu2u_blog/src/auth/AuthProvider.tsx`：

````tsx
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
````

用下面的内容**整体替换** `front/ryu2u_blog/src/App.tsx`：

````tsx
import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/Post/PostPage";
import {CategoryPage} from "./category/CategoryPage.tsx";
import {TagPage} from "./tag/TagPage.tsx";
import {MomentPage} from "./moment/MomentPage.tsx";
import {Header} from "./components/Header";
import {Footer} from "./components/Footer";
import {AuthProvider} from "./auth/AuthProvider";

function App() {

    return (
        <>
            <BrowserRouter>
                <AuthProvider>
                    <Header/>
                    <Routes>
                    <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                    <Route path={"/home"} element={<Home />}></Route>
                    <Route path={"/post/:id"} element={<PostPage />}></Route>
                    <Route path={"/category"} element={<CategoryPage />}></Route>
                    <Route path={"/category/:tag"} element={<CategoryPage />}></Route>
                    <Route path={"/tag/:name"} element={<TagPage />}></Route>
                    <Route path={"/moment"} element={<MomentPage />}></Route>
                    </Routes>
                    <Footer/>
                </AuthProvider>
            </BrowserRouter>
        </>
    )
}

export default App
````

- [ ] **Step 2: 类型检查、lint 与构建**

```bash
cd front/ryu2u_blog
npx tsc --noEmit
npx eslint src/auth src/service/UserService.ts src/common/HttpClient.ts src/App.tsx --ext ts,tsx
npx eslint . --ext ts,tsx | tail -3
npm run build
```

Expected: `tsc` 与第一条 `eslint` 无输出；全量 lint 仍是 `✖ 37 problems (32 errors, 5 warnings)`；构建以 `✓ built in` 结束。

- [ ] **Step 3: 提交**

```bash
git add "front/ryu2u_blog/src/common/Structs.ts" "front/ryu2u_blog/src/service/UserService.ts" "front/ryu2u_blog/src/common/HttpClient.ts" "front/ryu2u_blog/src/auth/authContext.ts" "front/ryu2u_blog/src/auth/AuthProvider.tsx" "front/ryu2u_blog/src/App.tsx"
git commit -F - <<'EOF'
feat(blog): 请求层携带 Cookie 并处理 401，新增登录状态 AuthProvider

HttpClient 开 withCredentials，收到 401 回调 AuthProvider 清空登录状态；
authContext.ts 与 AuthProvider.tsx 拆开以满足 react-refresh 规则。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 9: 前端登录页与顶栏用户区

- 新增 `/login` 页（浅色居中卡片）：用户名 / 密码 / 错误提示；`400`、`429` 直接显示服务端文案；无响应显示「无法连接服务，请稍后重试」；提交中或输入为空时禁用按钮
- 顶栏：已登录显示导航 + 昵称 + 「退出」；未登录和 `/login` 页只留 logo。**手机宽度（≤600px）隐藏昵称和两个没有功能的占位入口（友链 / 关于）**，否则一行放不下
- `useSearchParams` 要从 `react-router-dom` 导入（`react-router` 没有导出它）
- 本任务结束时 `/login` 路由已可用，但还没有任何东西把未登录用户送过去

**Files:**
- Create: `front/ryu2u_blog/src/login/login.scss`
- Create: `front/ryu2u_blog/src/login/LoginPage.tsx`
- Modify: `front/ryu2u_blog/src/components/Header.tsx`
- Modify: `front/ryu2u_blog/src/home/home.scss`
- Modify: `front/ryu2u_blog/src/App.tsx`

**Interfaces:**
- Consumes: `useAuth`、`safeRedirect`（Task 7、8）
- Produces: `LoginPage`；`Header` 使用 `useAuth`

- [ ] **Step 1: 写代码**

创建 `front/ryu2u_blog/src/login/login.scss`：

````scss
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - var(--header-height));
  margin-top: var(--header-height);
  padding: 32px 16px;
  box-sizing: border-box;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 40px 36px 36px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
}

.login-card__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin-bottom: 20px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #ffffff;
  font-family: var(--font-serif);
  font-size: 22px;
}

.login-card__title {
  margin: 0 0 6px;
  color: var(--color-text);
  font-family: var(--font-serif);
  font-size: 30px;
  font-weight: 500;
}

.login-card__subtitle {
  margin: 0 0 28px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.login-field {
  display: block;
  margin-bottom: 16px;

  > span {
    display: block;
    margin-bottom: 6px;
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  input {
    width: 100%;
    height: 42px;
    padding: 0 12px;
    box-sizing: border-box;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 15px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      outline: none;
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px var(--color-primary-soft);
    }
  }
}

.login-card__error {
  margin: 4px 0 16px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: #f8e4e1;
  color: #b3261e;
  font-size: 13px;
  line-height: 1.6;
}

.login-card__submit {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #ffffff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  &:disabled {
    background: var(--color-border-strong);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
}
````

创建 `front/ryu2u_blog/src/login/LoginPage.tsx`：

````tsx
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
````

用下面的内容**整体替换** `front/ryu2u_blog/src/components/Header.tsx`：

````tsx
import {useLocation, useNavigate} from "react-router";
import {useAuth} from "../auth/authContext";

export function Header() {

    const navigate = useNavigate();
    const {pathname} = useLocation();
    const {status, user, logout} = useAuth();

    const navClass = (prefix: string) => pathname.startsWith(prefix) ? 'is-active' : '';
    // 登录页和未登录状态下只留 logo，不显示导航与用户信息
    const showMenu = status === 'authed' && !pathname.startsWith('/login');

    return (
        <>
            <header className={"header"}>
                <div className={"header-item"}>
                    <div className={"logo-div"} onClick={() => showMenu && navigate('/home')}>
                        <span className="logo-mark">H</span>
                        Hai Tao
                    </div>
                    {showMenu && (
                        <div className={"header-right"}>
                            <nav className={"header-menu"}>
                                <ul>
                                    <li>
                                        <button type="button" className={navClass('/home')} onClick={() => navigate("/home")}>
                                            首页
                                        </button>
                                    </li>
                                    <li>
                                        <button type="button" className={navClass('/category')} onClick={() => navigate("/category")}>
                                            分类
                                        </button>
                                    </li>
                                    <li>
                                        <button type="button" className={navClass('/moment')} onClick={() => navigate("/moment")}>
                                            说说
                                        </button>
                                    </li>
                                    <li className="header-menu__placeholder">
                                        <button type="button">
                                            友链
                                        </button>
                                    </li>
                                    <li className="header-menu__placeholder">
                                        <button type="button">
                                            关于
                                        </button>
                                    </li>
                                </ul>
                            </nav>
                            <div className={"header-user"}>
                                <span className={"header-user__name"}>{user?.nick_name || user?.username}</span>
                                <button type="button" className={"header-user__logout"} onClick={() => logout()}>
                                    退出
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </header>
        </>
    )
}
````

修改 `front/ryu2u_blog/src/home/home.scss`：把下面这段

````scss
/* ---------- 通用两栏容器 ---------- */
````

替换为

````scss
/* ---------- 顶栏右侧：导航 + 当前用户 ---------- */

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--color-border);
}

.header-user__name {
  max-width: 120px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-user__logout {
  padding: 5px 12px;
  border: 1px solid var(--color-border-strong);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--color-surface-muted);
    color: var(--color-text);
  }
}

@media (max-width: 600px) {
  .header-right {
    gap: 4px;
  }

  .header-user {
    padding-left: 0;
    border-left: 0;
  }

  .header-user__name,
  .header-menu__placeholder {
    display: none;
  }
}

/* ---------- 通用两栏容器 ---------- */
````

用下面的内容**整体替换** `front/ryu2u_blog/src/App.tsx`：

````tsx
import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/Post/PostPage";
import {CategoryPage} from "./category/CategoryPage.tsx";
import {TagPage} from "./tag/TagPage.tsx";
import {MomentPage} from "./moment/MomentPage.tsx";
import {Header} from "./components/Header";
import {Footer} from "./components/Footer";
import {AuthProvider} from "./auth/AuthProvider";
import {LoginPage} from "./login/LoginPage.tsx";

function App() {

    return (
        <>
            <BrowserRouter>
                <AuthProvider>
                    <Header/>
                    <Routes>
                    <Route path={"/login"} element={<LoginPage />}></Route>
                    <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                    <Route path={"/home"} element={<Home />}></Route>
                    <Route path={"/post/:id"} element={<PostPage />}></Route>
                    <Route path={"/category"} element={<CategoryPage />}></Route>
                    <Route path={"/category/:tag"} element={<CategoryPage />}></Route>
                    <Route path={"/tag/:name"} element={<TagPage />}></Route>
                    <Route path={"/moment"} element={<MomentPage />}></Route>
                    </Routes>
                    <Footer/>
                </AuthProvider>
            </BrowserRouter>
        </>
    )
}

export default App
````

- [ ] **Step 2: 类型检查、lint 与构建**

```bash
cd front/ryu2u_blog
npx tsc --noEmit
npx eslint src/login src/components/Header.tsx src/App.tsx --ext ts,tsx
npx eslint . --ext ts,tsx | tail -3
npm run build
```

Expected: `tsc` 与第一条 `eslint` 无输出；全量 lint 仍是 `✖ 37 problems (32 errors, 5 warnings)`；构建以 `✓ built in` 结束。

- [ ] **Step 3: 提交**

```bash
git add "front/ryu2u_blog/src/login/login.scss" "front/ryu2u_blog/src/login/LoginPage.tsx" "front/ryu2u_blog/src/components/Header.tsx" "front/ryu2u_blog/src/home/home.scss" "front/ryu2u_blog/src/App.tsx"
git commit -F - <<'EOF'
feat(blog): 登录页与顶栏用户区

新增 /login 页；顶栏登录后显示昵称与退出，未登录和登录页只留 logo；
手机宽度隐藏昵称与两个占位入口避免溢出。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 10: 前端路由守卫 `RequireAuth` 与后台登录页 429 提示

- `RequireAuth` 作为布局路由包住所有内容路由：`loading` 时只显示加载占位、**不渲染任何子路由**（所以登录前不会发出任何内容接口请求）；`anon` 时跳 `/login?redirect=<当前页>`（主动退出时不带 redirect）；未知路径回到 `/home`（同样在守卫之内，未登录会先去登录）
- 后台登录页：`429` 时请求拦截器（`AxioConfig.tsx`）已经显示了服务端文案，`catch` 里不再叠加通用的「登录失败」提示

**Files:**
- Create: `front/ryu2u_blog/src/auth/auth.scss`
- Create: `front/ryu2u_blog/src/auth/RequireAuth.tsx`
- Modify: `front/ryu2u_blog/src/App.tsx`
- Modify: `front/ryu2u_blog_admin/src/login/LoginPage.tsx`

**Interfaces:**
- Consumes: `useAuth`（Task 8）、`LoginPage`（Task 9）
- Produces: `RequireAuth`（布局路由，无 props）

- [ ] **Step 1: 写代码**

创建 `front/ryu2u_blog/src/auth/auth.scss`：

````scss
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - var(--header-height));
  margin-top: var(--header-height);
}

.auth-loading__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-primary);
  animation: auth-pulse 1.2s ease-in-out infinite;
}

@keyframes auth-pulse {
  0%,
  100% {
    transform: scale(0.7);
    opacity: 0.45;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
````

创建 `front/ryu2u_blog/src/auth/RequireAuth.tsx`：

````tsx
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
````

用下面的内容**整体替换** `front/ryu2u_blog/src/App.tsx`：

````tsx
import './App.css'
import {BrowserRouter} from "react-router-dom";
import {Navigate, Route, Routes} from "react-router";
import {Home} from "./home/Home";
import {PostPage} from "./components/Post/PostPage";
import {CategoryPage} from "./category/CategoryPage.tsx";
import {TagPage} from "./tag/TagPage.tsx";
import {MomentPage} from "./moment/MomentPage.tsx";
import {Header} from "./components/Header";
import {Footer} from "./components/Footer";
import {AuthProvider} from "./auth/AuthProvider";
import {LoginPage} from "./login/LoginPage.tsx";
import {RequireAuth} from "./auth/RequireAuth";

function App() {

    return (
        <>
            <BrowserRouter>
                <AuthProvider>
                    <Header/>
                    <Routes>
                    <Route path={"/login"} element={<LoginPage />}></Route>
                    <Route element={<RequireAuth />}>
                        <Route path={"/"} element={<Navigate to={"/home"}/>}></Route>
                        <Route path={"/home"} element={<Home />}></Route>
                        <Route path={"/post/:id"} element={<PostPage />}></Route>
                        <Route path={"/category"} element={<CategoryPage />}></Route>
                        <Route path={"/category/:tag"} element={<CategoryPage />}></Route>
                        <Route path={"/tag/:name"} element={<TagPage />}></Route>
                        <Route path={"/moment"} element={<MomentPage />}></Route>
                        <Route path={"*"} element={<Navigate to={"/home"} replace/>}></Route>
                    </Route>
                    </Routes>
                    <Footer/>
                </AuthProvider>
            </BrowserRouter>
        </>
    )
}

export default App
````

修改 `front/ryu2u_blog_admin/src/login/LoginPage.tsx`：把下面这段

````tsx
            .catch((error) => {
                messageApi.error('登录失败，请检查用户名和密码');
                console.error('Login error:', error);
            })
````

替换为

````tsx
            .catch((error) => {
                // 429（尝试次数过多）：请求拦截器已经显示了服务端文案，不再叠加通用提示
                if (error?.response?.status !== 429) {
                    messageApi.error('登录失败，请检查用户名和密码');
                }
                console.error('Login error:', error);
            })
````

- [ ] **Step 2: 类型检查、lint 与构建**

```bash
cd front/ryu2u_blog
npx tsc --noEmit
npx eslint src/auth src/App.tsx --ext ts,tsx
npx eslint . --ext ts,tsx | tail -3
npm run build
cd ../ryu2u_blog_admin
npx tsc --noEmit
npx eslint . --ext ts,tsx | tail -3
npm run build
```

Expected: 博客：`tsc` 与第一条 `eslint` 无输出，全量 lint 仍是 `✖ 37 problems (32 errors, 5 warnings)`，构建成功；后台：`tsc` 无输出，全量 lint 仍是 `✖ 29 problems (20 errors, 9 warnings)`，构建成功。

- [ ] **Step 3: 提交**

```bash
git add "front/ryu2u_blog/src/auth/auth.scss" "front/ryu2u_blog/src/auth/RequireAuth.tsx" "front/ryu2u_blog/src/App.tsx" "front/ryu2u_blog_admin/src/login/LoginPage.tsx"
git commit -F - <<'EOF'
feat(blog): 路由守卫 RequireAuth；后台登录页 429 不再叠加通用提示

未登录跳 /login?redirect=<当前页>，主动退出不带 redirect；
守卫在确认登录状态前不渲染任何子路由，登录前不发内容接口请求；
后台登录页 429 时只显示拦截器给出的服务端文案。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 11: 关上大门，并做端到端验证

`PUBLIC_PATHS` 早已在 Task 6 定义并有测试，这里让 `main.rs` 真正使用它。这是整个功能里**对外行为变化最大**的一步：之后任何未登录的请求都会被拒绝（登录、退出除外）。验证用端到端脚本：它自己建临时库（导入 `schema.sql` 并灌入测试账号）、起两个临时后端（9003 信任 `X-Forwarded-For`，9004 不信任）、跑完 66 项检查、再清理，**不碰真实库**。

**Files:**
- Modify: `src/main.rs`

**Interfaces:**
- Consumes: `PUBLIC_PATHS`（Task 6）
- Produces: 白名单 = `["/user/login", "/user/logout"]`

- [ ] **Step 1: 写端到端脚本**

创建 `$SCRATCH/login_gate_e2e.py`：

````python
#!/usr/bin/env python3
"""登录门禁端到端验证：临时库 + 两个临时后端，不碰真实库。

用法: python3 login_gate_e2e.py <项目根目录> <后端可执行文件>
  - 项目根目录：用来读取 .env（JWT_SECRET 等）和 schema.sql
  - 后端可执行文件：建议用 release 版（bcrypt 在调试版里很慢）
退出码：全部通过为 0，有失败为 1。
"""
import http.client, json, os, re, secrets, statistics, subprocess, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))

ROOT, BIN = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
PORT_TRUST, PORT_NOTRUST = 9003, 9004

env_file = dict(l.strip().split('=', 1) for l in open(f'{ROOT}/.env', encoding='utf-8') if '=' in l and not l.startswith('#'))
real = urllib.parse.urlparse(env_file['DATABASE_URL'])
JWT_HOURS = int(env_file.get('JWT_EXPIRE_HOURS', '12'))
MYSQL = ['mysql', '-h', real.hostname, '-P', str(real.port or 3306), '-u', real.username]
MENV = dict(os.environ, MYSQL_PWD=urllib.parse.unquote(real.password or ''))
DB = 'rust_blog_logingate_' + secrets.token_hex(3)


def sql(stmt, db=None, stdin=None):
    cmd = MYSQL + ([db] if db else []) + ([] if stdin else ['-N', '-e', stmt])
    r = subprocess.run(cmd, env=MENV, input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('mysql 失败: ' + r.stderr.strip()[:300])
    return r.stdout.strip()


def call(port, method, path, body=None, cookie=None, headers=None, raw=None):
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=60)
    h = {'Content-Type': 'application/json'}
    if cookie:
        h['Cookie'] = f'auth_token={cookie}'
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    conn.request(method, path, body=data, headers=h)
    r = conn.getresponse()
    text = r.read().decode('utf-8', 'replace')
    conn.close()
    try:
        js = json.loads(text)
    except ValueError:
        js = None
    return r.status, {k.lower(): v for k, v in r.getheaders()}, text, js


_ip_counter = [0]


def fresh_ip():
    """每个场景用不同的客户端 IP，互不触发锁定"""
    _ip_counter[0] += 1
    return f'198.51.{_ip_counter[0] // 250}.{_ip_counter[0] % 250 + 1}'


def login(port, user, pw, ip=None):
    hdr = {'X-Forwarded-For': ip or fresh_ip()}
    st, hd, text, js = call(port, 'POST', '/user/login', {'username': user, 'password': pw, 'remember': False}, headers=hdr)
    m = re.search(r'auth_token=([^;]+)', hd.get('set-cookie', ''))
    return st, hd, js, (m.group(1) if m else None)


results = []


def check(name, cond, detail=''):
    results.append((bool(cond), name, detail))
    print(('  PASS  ' if cond else '  FAIL  ') + name + ('' if cond else f'   ← {detail}'))


def start_backend(port, trust):
    env = dict(os.environ, DATABASE_URL=urllib.parse.urlunparse(real._replace(path='/' + DB)), SERVER_PORT=str(port),
               NOTE_SYNC_ENABLED='false', TRUST_PROXY_HEADER='true' if trust else 'false')
    log_path = os.path.join(HERE, f'login_gate_e2e_{port}.log')
    log = open(log_path, 'w')
    p = subprocess.Popen([BIN], cwd=ROOT, env=env, stdout=log, stderr=log)
    for _ in range(60):
        try:
            call(port, 'OPTIONS', '/user/login')
            return p
        except OSError:
            time.sleep(0.5)
    p.kill()
    raise SystemExit(f'后端 {port} 没有启动，日志: {log_path}')


# ───────────────────────── 准备 ─────────────────────────
print(f'临时库: {DB}')
assert DB not in sql('show databases'), '临时库名冲突'
sql(f'create database `{DB}` default charset utf8mb4')
procs = []
try:
    sql('', db=DB, stdin=open(f'{ROOT}/schema.sql', encoding='utf-8').read())
    now = int(time.time() * 1000)
    users = [('admin', 'admin-pass-1', 'admin', 0), ('reader', 'reader-pass-1', 'user', 0),
             ('locked_user', 'locked-pass-1', 'user', 1), ('revoked', 'revoked-pass-1', 'user', 0),
             ('deleted', 'deleted-pass-1', 'user', 0)]
    users += [(n, f'{n}-pass-1', 'user', 0) for n in ('victim', 'victim2', 'victim3', 'victim4', 'victim5', 'v6user')]
    values = ','.join(f"('{n}','{p}','{n}',1,{now},{lk},'{r}')" for n, p, r, lk in users)
    sql(f'insert into tb_user (username,password,nick_name,gender,created_time,locked,role) values {values}', db=DB)
    user_count = sql('select count(*) from tb_user', db=DB)
    procs = [start_backend(PORT_TRUST, True), start_backend(PORT_NOTRUST, False)]
    T, N = PORT_TRUST, PORT_NOTRUST

    # ───────────────────────── 1. 大门 ─────────────────────────
    print('\n[1] 未登录访问原公开接口，一律 401')
    PAGE = {'page_num': 1, 'page_size': 10, 'total': 0, 'list': []}
    anon = [('POST', '/post/page', PAGE), ('GET', '/post/get/1', None), ('POST', '/post/list_by_category/Rust', PAGE),
            ('POST', '/category/list', None), ('GET', '/comment/list/1', None),
            ('POST', '/comment/add', {'post_id': 1, 'user_email': 'a@b.c', 'user_name': 'n', 'content': 'c'}),
            ('POST', '/tag/cloud', None), ('POST', '/tag/posts', {'tag_name': 'x', 'page_num': 1, 'page_size': 10}),
            ('GET', '/tag/post/1', None), ('POST', '/moment/page', {'page_num': 1, 'page_size': 10}),
            ('GET', '/user/get/1', None), ('GET', '/user/me', None)]
    for m, p, b in anon:
        st = call(T, m, p, b)[0]
        check(f'匿名 {m} {p} → 401', st == 401, f'实际 {st}')
    check('CORS 预检 OPTIONS 不被拦截', call(T, 'OPTIONS', '/post/page')[0] != 401)
    origin = env_file['BLOG_ORIGIN']
    st, hd, _, _ = call(T, 'GET', '/user/me', headers={'Origin': origin})
    check('401 响应带 CORS 头（否则浏览器把跨域 401 当网络错误，前端读不到状态码）',
          st == 401 and hd.get('access-control-allow-origin') == origin and hd.get('access-control-allow-credentials') == 'true',
          f'{st} {hd.get("access-control-allow-origin")} {hd.get("access-control-allow-credentials")}')

    # ───────────────────────── 2. 登录与 Cookie ─────────────────────────
    print('\n[2] 登录（旧明文密码账号）、Cookie 属性与密码升级')
    st, hd, js, tok = login(T, 'reader', 'reader-pass-1')
    check('reader 登录成功', st == 200 and tok, f'{st} {js}')
    cookie_hdr = hd.get('set-cookie', '')
    check('Cookie 含 HttpOnly', 'HttpOnly' in cookie_hdr, cookie_hdr)
    check('Cookie 含 SameSite=Lax', 'SameSite=Lax' in cookie_hdr, cookie_hdr)
    check(f'Cookie Max-Age = {JWT_HOURS * 3600}', f'Max-Age={JWT_HOURS * 3600}' in cookie_hdr, cookie_hdr)
    check('未设 COOKIE_SECURE 时不带 Secure', 'Secure' not in cookie_hdr, cookie_hdr)
    check('登录响应不含密码', js and js['obj'].get('password') in ('', None), str(js))
    pwd_in_db = sql("select password from tb_user where username='reader'", db=DB)
    check('旧明文密码已升级为 bcrypt', pwd_in_db.startswith('$2'), pwd_in_db[:10])
    st2, _, js2, tok2 = login(T, 'reader', 'reader-pass-1')
    check('升级后仍能用原密码登录', st2 == 200 and tok2)

    # ───────────────────────── 3. 登录后可访问 ─────────────────────────
    print('\n[3] 登录后访问原公开接口，不再是 401')
    for m, p, b in anon[:-1]:
        st = call(T, m, p, b, cookie=tok)[0]
        check(f'已登录 {m} {p} → 非 401 且非 5xx', st != 401 and st < 500, f'实际 {st}')
    st, _, text, js = call(T, 'GET', '/user/me', cookie=tok)
    check('/user/me → 200 且是 reader', st == 200 and js['obj']['username'] == 'reader' and js['obj']['role'] == 'user', text[:150])
    check('/user/me 不含密码等字段', not any(k in text for k in ('password', 'salt', 'locked', 'created_time')), text[:150])

    # ───────────────────────── 4. 管理员权限 ─────────────────────────
    print('\n[4] 管理员接口仍要求 admin')
    st = call(T, 'POST', '/user/admin/list/page', {'page_num': 1, 'page_size': 10}, cookie=tok)[0]
    check('普通用户访问 /user/admin/* → 403', st == 403, f'实际 {st}')
    st, hd, _, _ = call(T, 'POST', '/user/admin/list/page', {'page_num': 1, 'page_size': 10}, cookie=tok, headers={'Origin': origin})
    check('403 响应同样带 CORS 头', st == 403 and hd.get('access-control-allow-origin') == origin, f'{st} {hd.get("access-control-allow-origin")}')
    _, _, _, admin_tok = login(T, 'admin', 'admin-pass-1')
    st = call(T, 'POST', '/user/admin/list/page', {'page_num': 1, 'page_size': 10}, cookie=admin_tok)[0]
    check('管理员访问 /user/admin/* → 200', st == 200, f'实际 {st}')

    # ───────────────────────── 5. 账号状态实时生效 ─────────────────────────
    print('\n[5] 账号被锁定 / 删除后，已发出的令牌立即失效')
    _, _, _, t_rev = login(T, 'revoked', 'revoked-pass-1')
    check('revoked 登录后 /user/me → 200', call(T, 'GET', '/user/me', cookie=t_rev)[0] == 200)
    sql("update tb_user set locked=1 where username='revoked'", db=DB)
    check('被锁定后同一令牌 → 401', call(T, 'GET', '/user/me', cookie=t_rev)[0] == 401)
    _, _, _, t_del = login(T, 'deleted', 'deleted-pass-1')
    sql("delete from tb_user where username='deleted'", db=DB)
    check('账号被删除后同一令牌 → 401', call(T, 'GET', '/user/me', cookie=t_del)[0] == 401)
    st, _, js, _ = login(T, 'locked_user', 'locked-pass-1')
    check('锁定账号用正确密码登录 → 400「已被锁定」', st == 400 and '锁定' in js['msg'], f'{st} {js}')
    st, _, js, _ = login(T, 'locked_user', 'wrong')
    check('锁定账号用错误密码 → 400「账号或密码错误!」（不泄露锁定状态）', st == 400 and js['msg'] == '账号或密码错误!', f'{st} {js}')

    # ───────────────────────── 6. 防暴力破解 ─────────────────────────
    print('\n[6] 防暴力破解')
    ip = fresh_ip()
    codes = [login(T, 'victim', 'wrong', ip)[0] for _ in range(5)]
    check('同一（用户名+IP）前 5 次错误都是 400', codes == [400] * 5, str(codes))
    st, hd, js, _ = login(T, 'victim', 'victim-pass-1', ip)
    retry = int(hd.get('retry-after', '0') or 0)
    check('第 6 次（即使密码正确）→ 429', st == 429, f'{st} {js}')
    check('429 带 Retry-After，且在 (0, 900] 秒内', 0 < retry <= 900, f'Retry-After={hd.get("retry-after")}')
    check('429 文案是「请 N 分钟后再试」', js and '分钟后再试' in js['msg'], str(js))
    st, _, _, vtok = login(T, 'victim', 'victim-pass-1', fresh_ip())
    check('换一个 IP，同一用户名用正确密码仍可登录', st == 200 and vtok)

    ip = fresh_ip()
    codes = [login(T, f'nouser{i}', 'x', ip)[0] for i in range(10)]
    check('同一 IP 对 10 个不同用户名失败 → 都是 400', codes == [400] * 10, str(codes))
    check('第 11 次（有效账号、正确密码）→ 429（IP 桶）', login(T, 'reader', 'reader-pass-1', ip)[0] == 429)

    codes = [login(T, f'v6u{i}', 'x', f'2001:db8:1:2::{i + 1}')[0] for i in range(10)]
    check('同一 IPv6 /64 内换地址仍累计 → 前 10 次 400', codes == [400] * 10, str(codes))
    check('同一 /64 的第三个地址登录 → 429', login(T, 'reader', 'reader-pass-1', '2001:db8:1:2::99')[0] == 429)

    codes = [login(T, 'victim3', 'wrong', f'203.0.113.{i + 1}')[0] for i in range(30)]
    check('同一用户名在 30 个不同 IP 上失败 → 都是 400', codes == [400] * 30, str(set(codes)))
    st, _, js, _ = login(T, 'victim3', 'victim3-pass-1', '203.0.113.200')
    check('第 31 次（新 IP、正确密码）→ 429（用户名跨 IP 桶）', st == 429, f'{st} {js}')

    ip = fresh_ip()
    for i in range(5):
        login(T, 'Victim5' if i % 2 == 0 else ' victim5 ', 'wrong', ip)
    check('用户名大小写 / 首尾空格变体归入同一个桶', login(T, 'VICTIM5', 'victim5-pass-1', ip)[0] == 429)

    print('\n[6b] 不信任 X-Forwarded-For 的后端：伪造该头不能绕过限频')
    for i in range(5):
        login(N, 'victim4', 'wrong', f'10.20.30.{i + 1}')
    st = login(N, 'victim4', 'victim4-pass-1', '10.20.30.99')[0]
    check('伪造不同的 X-Forwarded-For 仍被按真实连接 IP 锁定 → 429', st == 429, f'实际 {st}')

    # ───────────────────────── 7. 防注入与入参限制 ─────────────────────────
    print('\n[7] SQL 注入与入参限制')
    payloads = [("' OR '1'='1", "' OR '1'='1"), ("admin'--", 'x'), ("admin' #", 'x'), ("reader' OR 1=1 -- ", 'x'),
                ('"; DROP TABLE tb_user; --', 'x'), ("a'; update tb_user set role='admin' where username='reader'; --", 'x'),
                ('reader\\', 'x'), ("reader", "' OR '1'='1"), ("reader", "x' OR '1'='1' -- "), ("' UNION SELECT 1,2,3,4,5,6,7,8,9,10,11 -- ", 'x')]
    all_rejected = True
    for u, p in payloads:
        st, hd, js, tk = login(T, u, p)
        ok = st == 400 and js and js['msg'] == '账号或密码错误!' and not tk
        all_rejected &= bool(ok)
        if not ok:
            check(f'注入用例被拒: {u!r}/{p!r}', False, f'{st} {js}')
    check(f'{len(payloads)} 个注入用例全部返回「账号或密码错误!」且没有下发 Cookie', all_rejected)
    check('tb_user 表仍在且行数只因本脚本的删除/新增而变化',
          sql('select count(*) from tb_user', db=DB) == str(int(user_count) - 1), sql('select count(*) from tb_user', db=DB))
    check('reader 的角色没有被注入改成 admin', sql("select role from tb_user where username='reader'", db=DB) == 'user')
    st, _, js, _ = login(T, 'a' * 65, 'x')
    check('用户名 65 字符 → 400「过长」', st == 400 and '过长' in js['msg'], f'{st} {js}')
    st, _, js, _ = login(T, 'reader', 'p' * 129)
    check('密码 129 字符 → 400「过长」', st == 400 and '过长' in js['msg'], f'{st} {js}')
    st, _, js, _ = login(T, '', 'x')
    check('空用户名 → 400', st == 400, f'{st} {js}')
    st = call(T, 'POST', '/user/login', raw=b'{"username":"a","password":"' + b'x' * 5000 + b'","remember":false}',
              headers={'X-Forwarded-For': fresh_ip()})[0]
    check('请求体超过 4KB → 413', st == 413, f'实际 {st}')

    # ───────────────────────── 8. 响应时间 ─────────────────────────
    print('\n[8] 账号存在与不存在的响应时间接近')
    def timed(user):
        t0 = time.perf_counter()
        login(T, user, 'definitely-wrong')
        return time.perf_counter() - t0
    ghost = [timed(f'ghost{i}') for i in range(6)]
    exist = [timed('reader') for _ in range(6)]   # 每次换 IP，不会触发（用户名+IP）锁；6 < 30 也不触发用户名桶
    mg, me = statistics.median(ghost), statistics.median(exist)
    check(f'不存在 {mg * 1000:.0f}ms / 存在 {me * 1000:.0f}ms：都做了 bcrypt（>30ms）', mg > 0.03 and me > 0.03)
    check('两者中位数之比在 0.5~2 之间', 0.5 <= mg / me <= 2.0, f'比值 {mg / me:.2f}')

    # ───────────────────────── 9. 退出 ─────────────────────────
    print('\n[9] 退出登录')
    st, hd, _, _ = call(T, 'POST', '/user/logout')
    check('未带 Cookie 也能退出 → 200，并下发 Max-Age=0 的清除 Cookie', st == 200 and 'Max-Age=0' in hd.get('set-cookie', ''), f'{st} {hd.get("set-cookie")}')
finally:
    for p in procs:
        p.terminate()
    for p in procs:
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            p.kill()
    sql(f'drop database `{DB}`')
    left = [d for d in sql('show databases').split() if d.startswith('rust_blog_logingate_')]
    print(f'\n已删除临时库 {DB}；残留临时库: {left or "无"}')

failed = [r for r in results if not r[0]]
print(f'\n共 {len(results)} 项检查，通过 {len(results) - len(failed)}，失败 {len(failed)}')
for _, name, detail in failed:
    print(f'  FAIL: {name}   {detail}')
sys.exit(1 if failed else 0)
````

- [ ] **Step 2: 构建 release 版并运行，确认失败**

调试版的 bcrypt 很慢，端到端要发近百次登录请求，所以用 release 版。

```bash
cargo build --release
python3 "$SCRATCH/login_gate_e2e.py" "$PWD" "$PWD/target/release/rust_blog"
```

Expected: 末尾打印 `共 66 项检查，通过 54，失败 12`。12 项失败是：第 [1] 节里 11 条「匿名 … → 401」（这些接口现在仍在旧白名单里，匿名也能访问），以及第 [9] 节「未带 Cookie 也能退出」（旧白名单里没有 `/user/logout`）。其余全部通过，并且最后一行是「已删除临时库 …；残留临时库: 无」。

- [ ] **Step 3: 关上大门**

修改 `src/main.rs`：把下面这段

````rust
use crate::middleware::{AuthFilter, FilterWhiteList};
````

替换为

````rust
use crate::middleware::{AuthFilter, FilterWhiteList, PUBLIC_PATHS};
````

修改 `src/main.rs`：把以 `let white_list = FilterWhiteList(vec![` 开头、到对应的 `]);` 结束的**整条语句**（包括里面所有的路径字符串和注释）替换为

````rust
let white_list = FilterWhiteList(PUBLIC_PATHS.to_vec());
````

- [ ] **Step 4: 重新构建并运行，确认全部通过**

```bash
cargo build --release
python3 "$SCRATCH/login_gate_e2e.py" "$PWD" "$PWD/target/release/rust_blog"
cargo test -- middleware::
```

Expected: 端到端 `共 66 项检查，通过 66，失败 0`，且 `残留临时库: 无`；`cargo test -- middleware::` 为 `11 passed`（`gate_tests` 9 个 + 原有 2 个）。

- [ ] **Step 5: 提交**

```bash
git add "src/main.rs"
git commit -F - <<'EOF'
feat(auth): 白名单收缩为仅登录/退出，博客改为登录后访问

原先公开的文章、分类、标签、评论、说说与 /user/get 全部改为必须登录；
管理接口规则不变。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

### Task 12: 文档与最终验证

更新 `CLAUDE.md`，做全量验证，并在**真实浏览器**里把登录流程完整走一遍。浏览器验证是必须的：端到端脚本不经过浏览器，没有 CORS，抓不到 Task 6 里那类「浏览器读不到 401」的问题。

**Files:**
- Modify: `CLAUDE.md`
- 验证脚本放在仓库之外：`$SCRATCH/login_gate_browser_env.py`、`$SCRATCH/login_gate_lock_user.py`

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 无

- [ ] **Step 1: 更新 `CLAUDE.md`**

修改 `CLAUDE.md`：把

````markdown
- **Auth**: JWT (`jsonwebtoken`) delivered in an **httpOnly cookie named `auth_token`** — there is no `actix-session` in this project
````

替换为

````markdown
- **Auth**: JWT (`jsonwebtoken`) delivered in an **httpOnly cookie named `auth_token`** — there is no `actix-session` in this project. **The whole blog is login-gated**: only `/user/login` and `/user/logout` are public (`PUBLIC_PATHS` in `middleware.rs`); every other request needs a valid cookie **and** an existing, unlocked account (looked up in `tb_user` on every request, so locking a user takes effect immediately). Login is rate-limited in memory (`utils/login_guard.rs`) and uses bound SQL parameters only
````

修改 `CLAUDE.md`：把

````markdown
- `middleware.rs` — `AuthFilter`: whitelist bypass → JWT verify → admin role check
````

替换为

````markdown
- `middleware.rs` — `AuthFilter`: whitelist bypass → JWT verify → account status check → admin role check. It must stay **inside** the CORS middleware (`.wrap(AuthFilter)` before `.wrap(cors)` in `main.rs`) and return normal 401/403 responses instead of `Err`, otherwise rejected responses carry no CORS headers and browsers hide the status code from the frontend
````

修改 `CLAUDE.md`：把

````markdown
`/user` (`login`, `logout`, `get`, `admin/*`)
````

替换为

````markdown
`/user` (`login`, `logout`, `me`, `get`, `admin/*`)
````

修改 `CLAUDE.md`：把

````markdown
`/moment` (`POST /moment/page` is public — only `is_public=1` and not deleted, page_size ≤ 50; everything else is `admin/*`)
````

替换为

````markdown
`/moment` (`POST /moment/page` is open to any logged-in user — only `is_public=1` and not deleted, page_size ≤ 50; everything else is `admin/*`)
````

修改 `CLAUDE.md`：把

````markdown
1. **`FilterWhiteList`** — paths not matching this require a valid `auth_token`.
````

替换为

````markdown
1. **`FilterWhiteList`** — built from `PUBLIC_PATHS` in `src/middleware.rs`, which contains only `/user/login` and `/user/logout`. Paths not matching it require a valid `auth_token`, so **new endpoints are authenticated by default; do not add public ones**.
````

修改 `CLAUDE.md`：把

````markdown
`/category`, `/category/:tag`, `/moment` (defined inline in `App.tsx`)
````

替换为

````markdown
`/category`, `/category/:tag`, `/moment` (defined inline in `App.tsx`, all inside the `RequireAuth` layout route), plus the public `/login`. Login state lives in `auth/AuthProvider.tsx` (`useAuth()` from `auth/authContext.ts`); a 401 from any request clears it
````

修改 `CLAUDE.md`：把

````markdown
`JWT_SECRET`, `JWT_EXPIRE_HOURS` (default 12).
````

替换为

````markdown
`JWT_SECRET`, `JWT_EXPIRE_HOURS` (default 12). Login protection (all optional): `LOGIN_MAX_FAIL_PER_IP` (10), `LOGIN_MAX_FAIL_PER_USER_IP` (5), `LOGIN_MAX_FAIL_PER_USER` (30), `LOGIN_WINDOW_MIN` (15), `LOGIN_LOCK_MIN` (15), `TRUST_PROXY_HEADER` (false — set true only behind a reverse proxy that appends the real client IP to `X-Forwarded-For`), `COOKIE_SECURE` (false — set true on HTTPS).
````

- [ ] **Step 2: 全量自动验证**

```bash
cargo test 2>&1 | grep -E "^test result|FAILED"
(cd front/ryu2u_blog && npx tsc --noEmit && npx eslint . --ext ts,tsx | tail -3 && npm run build | tail -2)
(cd front/ryu2u_blog_admin && npx tsc --noEmit && npx eslint . --ext ts,tsx | tail -3 && npm run build | tail -2)
cargo build --release && python3 "$SCRATCH/login_gate_e2e.py" "$PWD" "$PWD/target/release/rust_blog" | tail -3
```

Expected: `cargo test` 为 `80 passed; 2 failed`，失败的只有 `test_post_add` 与 `test_greet`；博客 lint 仍是 37 个问题、后台仍是 29 个；两个前端构建成功；端到端 `共 66 项检查，通过 66，失败 0`。

- [ ] **Step 3: 准备浏览器验证环境**

创建 `$SCRATCH/login_gate_browser_env.py`：

````python
#!/usr/bin/env python3
"""浏览器验证用的临时环境：独立数据库 + 测试账号，不碰真实库。
用法: python3 login_gate_browser_env.py <项目根目录> setup|teardown
setup 会建库、导入 schema.sql、插入账号，并把临时库连接串写进同目录的 browser_env.state（权限 600）。
"""
import os, secrets, subprocess, sys, time, urllib.parse

ROOT, ACTION = os.path.abspath(sys.argv[1]), sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, 'browser_env.state')

env_file = dict(l.strip().split('=', 1) for l in open(f'{ROOT}/.env', encoding='utf-8') if '=' in l and not l.startswith('#'))
real = urllib.parse.urlparse(env_file['DATABASE_URL'])
MYSQL = ['mysql', '-h', real.hostname, '-P', str(real.port or 3306), '-u', real.username]
MENV = dict(os.environ, MYSQL_PWD=urllib.parse.unquote(real.password or ''))


def sql(stmt, db=None, stdin=None):
    cmd = MYSQL + ([db] if db else []) + ([] if stdin else ['-N', '-e', stmt])
    r = subprocess.run(cmd, env=MENV, input=stdin, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('mysql 失败: ' + r.stderr.strip()[:300])
    return r.stdout.strip()


if ACTION == 'setup':
    name = 'rust_blog_browser_' + secrets.token_hex(3)
    assert name not in sql('show databases'), '临时库名冲突'
    sql(f'create database `{name}` default charset utf8mb4')
    sql('', db=name, stdin=open(f'{ROOT}/schema.sql', encoding='utf-8').read())
    now = int(time.time() * 1000)
    rows = [('admin', 'admin-pass-1', '管理员', 'admin'), ('reader', 'reader-pass-1', '小读者', 'user'),
            ('lockme', 'lockme-pass-1', '待锁定', 'user')]
    values = ','.join(f"('{u}','{p}','{n}',1,{now},0,'{r}')" for u, p, n, r in rows)
    sql(f'insert into tb_user (username,password,nick_name,gender,created_time,locked,role) values {values}', db=name)
    sql("insert into category (name, slug) values ('Rust','rust')", db=name)
    with open(STATE, 'w') as f:
        os.fchmod(f.fileno(), 0o600)
        f.write(name + '\n' + urllib.parse.urlunparse(real._replace(path='/' + name)) + '\n')
    print(f'临时库 {name} 已创建，账号：admin / reader / lockme（密码见脚本）')
elif ACTION == 'teardown':
    name = open(STATE).read().splitlines()[0]
    assert name.startswith('rust_blog_browser_'), '拒绝删除非临时库'
    sql(f'drop database `{name}`')
    os.remove(STATE)
    left = [d for d in sql('show databases').split() if d.startswith('rust_blog_browser_')]
    print(f'已删除 {name}；残留临时库: {left or "无"}')
````

创建 `$SCRATCH/login_gate_lock_user.py`：

````python
#!/usr/bin/env python3
"""把浏览器验证用临时库里的某个账号锁定 / 解锁。
用法: python3 login_gate_lock_user.py <项目根目录> <用户名> <0|1>      （1 = 锁定，0 = 解锁）
只会操作 browser_env.state 里记录的、名字以 rust_blog_browser_ 开头的临时库。
"""
import os, subprocess, sys, urllib.parse

ROOT, USER, LOCKED = os.path.abspath(sys.argv[1]), sys.argv[2], sys.argv[3]
assert LOCKED in ('0', '1'), '第三个参数必须是 0 或 1'
assert USER.replace('_', '').isalnum(), '用户名只允许字母数字下划线'
HERE = os.path.dirname(os.path.abspath(__file__))
name = open(os.path.join(HERE, 'browser_env.state')).read().splitlines()[0]
assert name.startswith('rust_blog_browser_'), '拒绝操作非临时库'

env = dict(l.strip().split('=', 1) for l in open(f'{ROOT}/.env', encoding='utf-8') if '=' in l and not l.startswith('#'))
u = urllib.parse.urlparse(env['DATABASE_URL'])
cmd = ['mysql', '-h', u.hostname, '-P', str(u.port or 3306), '-u', u.username, name, '-N', '-e',
       f"update tb_user set locked={LOCKED} where username='{USER}'; select username, locked from tb_user where username='{USER}'"]
r = subprocess.run(cmd, env=dict(os.environ, MYSQL_PWD=urllib.parse.unquote(u.password or '')), capture_output=True, text=True)
print(r.stdout.strip() or r.stderr.strip())
````

博客前端把后端地址写死为 `http://localhost:9002`，所以浏览器验证要让临时后端跑在 9002 上。**先停掉你正在运行的后端（9002）和博客（8088）**，再：

```bash
python3 "$SCRATCH/login_gate_browser_env.py" "$PWD" setup
cargo build --release
```

然后在两个**另开的终端**里分别运行（保持运行）：

```bash
# 终端 A：连临时库的后端，跑在 9002
DATABASE_URL="$(sed -n 2p "$SCRATCH/browser_env.state")" NOTE_SYNC_ENABLED=false ./target/release/rust_blog
```

```bash
# 终端 B：博客前端，8088
cd front/ryu2u_blog && npm run dev
```

测试账号（密码在脚本里）：`reader`（普通用户，昵称「小读者」）、`admin`（管理员）、`lockme`（用来测试被锁定）。

- [ ] **Step 4: 在浏览器里逐项验证**

用浏览器（或 Claude 内置浏览器）逐项检查，每一项都要得到「预期」里写的结果：

1. 未登录打开 `http://localhost:8088/home`。预期：地址变成 `/login?redirect=%2Fhome`；顶栏只有 logo，没有导航和用户区；输入为空时「登录」按钮是禁用的。
2. 用 `reader` + 错误密码登录。预期：卡片里出现「账号或密码错误!」，按钮恢复可点。再用正确密码 `reader-pass-1` 登录。预期：回到 `/home`，顶栏出现昵称「小读者」和「退出」，页面数据正常加载。
3. 点「退出」。预期：地址是 `/login`，**不带** `redirect` 参数，顶栏菜单收起。
4. 用 `lockme` / `lockme-pass-1` 登录成功（回到 `/home`）。然后在终端里执行 `python3 "$SCRATCH/login_gate_lock_user.py" "$PWD" lockme 1`（预期输出 `lockme\t1`），回到浏览器点「分类」。预期：被带到 `/login?redirect=%2Fcategory`，顶栏菜单收起。**这一项依赖 Task 6 的 CORS 修复：若停在 `/category` 不动，控制台出现 CORS 错误，说明 401 没带 CORS 头。**
5. 此时用 `lockme` 的正确密码登录。预期：「当前账号已被锁定」。改用 `reader` 登录。预期：回到 `/category`（保留了 redirect）。
6. 点「退出」，手动打开 `http://localhost:8088/login?redirect=//evil.com`，用 `reader` 登录。预期：停在站内 `http://localhost:8088/home`，不会跳到外站。
7. 点「退出」，对 `admin` 连续输错 6 次密码。预期：前 5 次是「账号或密码错误!」，第 6 次是「尝试次数过多，请 15 分钟后再试」；此时用 `admin` 的正确密码也被拒（同样的文案）。
8. 把浏览器视口调到手机宽度（375×812），用 `reader` 登录。预期：顶栏显示「首页 / 分类 / 说说 / 退出」，没有昵称和占位入口，页面没有横向滚动条（`document.documentElement.scrollWidth === window.innerWidth`）。
9. 在 DevTools 控制台里确认：登录前的任意时刻，Network 面板里除 `/user/me` 和 `/user/login` 外，没有任何发往 9002 的内容接口请求（守卫在确认登录状态前不渲染子路由）。

- [ ] **Step 5: 清理验证环境**

**先在浏览器里点「退出」**：Cookie 不区分端口，留着的测试登录 Cookie 会被你真实的后台误读（临时库里的用户 id 与真实库不同，却用的是同一个 `JWT_SECRET`）。然后停掉终端 A、B 里的进程，再：

```bash
python3 "$SCRATCH/login_gate_browser_env.py" "$PWD" teardown
```

Expected: `已删除 rust_blog_browser_xxxxxx；残留临时库: 无`。最后按平时的方式重新启动后端（记得 `NOTE_SYNC_ENABLED=false`，除非你要同步）和博客。

- [ ] **Step 6: 提交**

```bash
git add CLAUDE.md
git commit -F - <<'EOF'
docs: CLAUDE.md 补充登录门禁与登录防护说明

说明公开路径只有登录/退出、每个请求都校验账号状态、中间件与 CORS 的顺序要求、
登录限频及新增的环境变量，以及博客前端的 /login 与 RequireAuth。

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: 收尾核对**

```bash
git status --short
git log --oneline -13
```

Expected: 除了设计文档和本计划这两个未跟踪的文档文件（是否提交由用户决定）之外，工作区干净；最近 12 个提交依次对应 Task 1–12。**不要推送**，除非用户明确要求。

---

## 规格覆盖对照

| 规格章节 | 内容 | 实现任务 |
|---|---|---|
| 5.1 白名单收缩 + 可测试的匹配函数 | `PUBLIC_PATHS`、`is_white_listed` | Task 6（定义与测试）、Task 11（真正启用） |
| 5.1 账号状态逐请求校验、`AuthUser`、`/user/me` | `authorize()`、请求扩展 | Task 6 |
| 5.1 中间件顺序与 CORS | `EitherBody`、CORS 最外层 | Task 6 |
| 5.2 `LoginGuard` 三类计数桶 | 阈值、窗口、锁定、清理、淘汰 | Task 1 |
| 5.3 登录处理流程 | 先查锁、假哈希、统一文案、旧明文升级 | Task 4、5 |
| 5.4 客户端 IP | 默认对端地址；可选信任 `X-Forwarded-For` 最右一项；IPv6 /64 | Task 2 |
| 5.5 登录 Cookie | `Max-Age`、`Secure` 开关 | Task 4、5 |
| 5.6 错误模型 | 429 + `Retry-After` | Task 3 |
| 5.7 配置项 | 7 个环境变量 | Task 1、2、4（各自写入 `.env.example`） |
| 3 / 5.3 入参限制、请求体 4 KB | 校验函数、`JsonConfig` | Task 4、5 |
| 6.1 请求层 / 登录状态 / 路由守卫 / `safeRedirect` / 登录页 / 顶栏 | 博客前端 | Task 7、8、9、10 |
| 6.2 后台登录页 429 | 不叠加通用提示 | Task 10 |
| 7.1 Rust 单元测试 | 限频、白名单、IP、入参、Exception、CORS 回归 | Task 1–6 |
| 7.2 临时库端到端 | 66 项检查 | Task 11 |
| 7.3 浏览器验证 | 9 项清单 | Task 12 |
| 8 验收标准 / 10 上线说明 | 全量验证；`CLAUDE.md` 与 `.env.example` | Task 12（以及各任务的 `.env.example`） |
