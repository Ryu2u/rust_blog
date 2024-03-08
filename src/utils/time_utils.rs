use std::time::{SystemTime, UNIX_EPOCH};

pub fn get_sys_time() -> i64 {
    let now = SystemTime::now();
    now.duration_since(UNIX_EPOCH)
        .expect("get system time failed!")
        .as_millis() as i64
}
