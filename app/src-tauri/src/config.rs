//! 路径与应用配置（~/.z-buddy/app.json）读写

use std::fs;
use std::path::PathBuf;

use serde_json::Value;

pub fn z_buddy_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".z-buddy")
}

pub fn app_config_path() -> PathBuf {
    z_buddy_dir().join("app.json")
}

/// 读 app.json；不存在/损坏返回空对象
pub fn read_app_json() -> Value {
    fs::read_to_string(app_config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({}))
}

/// 写入 app.json 的单个键（保留其他键）
pub fn write_app_key(key: &str, value: Value) {
    let _ = fs::create_dir_all(z_buddy_dir());
    let mut v = read_app_json();
    v[key] = value;
    let _ = fs::write(app_config_path(), v.to_string());
}

pub fn read_app_key_str(key: &str) -> Option<String> {
    read_app_json()
        .get(key)
        .and_then(|v| v.as_str())
        .map(String::from)
}

pub fn read_app_key_bool(key: &str) -> Option<bool> {
    read_app_json().get(key).and_then(|v| v.as_bool())
}

/// 读 app.json 的单个键（任意 JSON 值，供 petWindow 等对象键使用）
pub fn read_app_key_value(key: &str) -> Option<Value> {
    read_app_json().get(key).cloned()
}

/// 读 app.json 的单个键（浮点，供 petScale 使用）
pub fn read_app_key_f64(key: &str) -> Option<f64> {
    read_app_key_value(key).and_then(|v| v.as_f64())
}

/// 可选宠物列表：内置宠物在前（首个 = 默认宠物），外部包（含 pet.json 的目录）在后
pub fn pet_list() -> Vec<String> {
    let mut list = vec![
        "yoru".to_string(),
        "mochi".to_string(),
        "bsod".to_string(),
        "fireball".to_string(),
    ];
    if let Ok(entries) = fs::read_dir(z_buddy_dir().join("pets")) {
        for e in entries.flatten() {
            if e.path().join("pet.json").is_file() {
                list.push(e.file_name().to_string_lossy().to_string());
            }
        }
    }
    list
}
