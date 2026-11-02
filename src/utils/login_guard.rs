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
