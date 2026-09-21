use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;

/// AES-256-GCM 加密：输出 base64( nonce(12) || ciphertext+tag )
pub fn encrypt_to_b64(plain: &str, key_b64: &str) -> Result<String, String> {
    let key_bytes = base64::engine::general_purpose::STANDARD.decode(key_b64)
        .map_err(|e| format!("ENC_KEY base64 解码失败: {}", e))?;
    if key_bytes.len() != 32 {
        return Err("ENC_KEY 必须是 32 字节的 base64".into());
    }
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce_bytes = {
        // 用 sha256(plain || 时间戳) 前 12 字节做 nonce（避免再引 rand 依赖特性）
        use sha2::{Digest, Sha256};
        let mut h = Sha256::new();
        h.update(plain.as_bytes());
        h.update(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos().to_le_bytes()).unwrap_or([0u8; 16]));
        let d = h.finalize();
        d[..12].to_vec()
    };
    let ct = cipher.encrypt(Nonce::from_slice(&nonce_bytes), Payload::from(plain.as_bytes()))
        .map_err(|e| e.to_string())?;
    let mut out = nonce_bytes;
    out.extend(ct);
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

pub fn decrypt_from_b64(cipher_b64: &str, key_b64: &str) -> Result<String, String> {
    let key_bytes = base64::engine::general_purpose::STANDARD.decode(key_b64)
        .map_err(|e| format!("ENC_KEY base64 解码失败: {}", e))?;
    let data = base64::engine::general_purpose::STANDARD.decode(cipher_b64)
        .map_err(|e| e.to_string())?;
    if data.len() < 12 {
        return Err("密文格式非法".into());
    }
    let (nonce_bytes, ct) = data.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let plain = cipher.decrypt(Nonce::from_slice(nonce_bytes), Payload::from(ct))
        .map_err(|_| "解密失败（密钥不匹配或密文损坏）".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn test_roundtrip() {
        let key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // 32字节
        let c = encrypt_to_b64("sk-secret-123", key).unwrap();
        assert_ne!(c, "sk-secret-123");
        assert_eq!(decrypt_from_b64(&c, key).unwrap(), "sk-secret-123");
    }
    #[test]
    fn test_wrong_key_fails() {
        let key = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
        let c = encrypt_to_b64("secret", key).unwrap();
        let bad = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWb="; // 错误key
        assert!(decrypt_from_b64(&c, bad).is_err());
    }
}
