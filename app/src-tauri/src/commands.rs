//! 全部 Tauri 命令：状态/暂停/拖动/宠物包/事件流/设置/外部打开

use std::fs;

use serde_json::json;
use tauri::menu::ContextMenu;
use tauri::{Emitter, Manager};

use crate::config::{pet_list, read_app_json, read_app_key_bool, read_app_key_str, write_app_key, z_buddy_dir};

// ---- 状态与暂停 ----

#[tauri::command]
pub fn read_state() -> String {
    // paused 以 pause 文件实时状态为准（state.json 只在 hook 事件时刷新）
    let mut v: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(z_buddy_dir().join("state.json"))
            .unwrap_or_else(|_| r#"{"status":"sleep","detail":"no plugin data yet"}"#.into()),
    )
    .unwrap_or_else(|_| serde_json::json!({"status": "sleep", "detail": "state parse error"}));
    v["paused"] = json!(z_buddy_dir().join("pause").exists());
    v.to_string()
}

#[tauri::command]
pub fn set_pause(on: bool) -> bool {
    println!("[z-buddy] set_pause({}) invoked", on);
    let p = z_buddy_dir().join("pause");
    if on {
        let _ = fs::create_dir_all(z_buddy_dir());
        fs::File::create(&p).is_ok()
    } else {
        match fs::remove_file(&p) {
            Ok(_) => true,
            Err(_) => !p.exists(),
        }
    }
}

#[tauri::command]
pub fn set_dragging(on: bool) {
    crate::DRAGGING.store(on, std::sync::atomic::Ordering::SeqCst);
}

// ---- 宠物包 ----

/// 外部包（~/.z-buddy/pets/<名>/pet.json）
#[tauri::command]
pub fn list_external_pets() -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let dir = z_buddy_dir().join("pets");
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() && p.join("pet.json").is_file() {
                out.push(json!({
                    "name": p.file_name().map(|s| s.to_string_lossy()).unwrap_or_default(),
                    "dir": p.to_string_lossy(),
                }));
            }
        }
    }
    out
}

/// 全部可选宠物（内置 + 外部），供主界面网格
#[tauri::command]
pub fn list_all_pets() -> Vec<serde_json::Value> {
    let pref = get_pet_pref();
    pet_list()
        .into_iter()
        .map(|name| {
            let source = if name == "mochi" { "bundled" } else { "external" };
            json!({
                "name": name,
                "source": source,
                "dir": if source == "external" {
                    z_buddy_dir().join("pets").join(&name).to_string_lossy().to_string()
                } else {
                    "".to_string()
                },
                "active": name == pref,
            })
        })
        .collect()
}

pub fn get_pet_pref() -> String {
    read_app_key_str("pet").unwrap_or_else(|| "mochi".into())
}

#[tauri::command]
pub fn get_pet_pref_cmd() -> String {
    get_pet_pref()
}

/// 切换宠物：写偏好并广播（宠物窗与主界面同时热切换）
#[tauri::command]
pub fn set_pet_pref_cmd(app: tauri::AppHandle, name: String) -> bool {
    write_app_key("pet", json!(name));
    let _ = app.emit("pet-changed", name);
    true
}

// ---- 事件流 ----

/// 读 events.jsonl 尾部 limit 条 + 总条数
#[tauri::command]
pub fn read_events(limit: usize) -> serde_json::Value {
    let text = fs::read_to_string(z_buddy_dir().join("events.jsonl")).unwrap_or_default();
    let total = text.lines().count();
    let items: Vec<serde_json::Value> = text
        .lines()
        .rev()
        .take(limit)
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    json!({ "total": total, "items": items })
}

// ---- 主窗口 ----

#[tauri::command]
pub fn hide_main(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

#[tauri::command]
pub fn get_close_behavior() -> String {
    read_app_key_str("closeBehavior").unwrap_or_else(|| "hide".into())
}

#[tauri::command]
pub fn set_close_behavior(v: String) {
    write_app_key("closeBehavior", json!(v));
}

// ---- 开机自启 ----

#[tauri::command]
pub fn autostart_enabled(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
pub fn autostart_set(app: tauri::AppHandle, on: bool) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    if on {
        al.enable().is_ok()
    } else {
        al.disable().is_ok()
    }
}

// ---- 外部打开 ----

#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url, None::<&str>);
}

// ---- 宠物右键菜单 ----

#[tauri::command]
pub fn popup_pet_menu(app: tauri::AppHandle, window: tauri::Window) {
    use tauri::menu::{Menu, MenuItem};
    let paused = z_buddy_dir().join("pause").exists();
    let pause_label = if paused { "恢复 Agent" } else { "暂停 Agent" };
    let main_item =
        MenuItem::with_id(&app, "pet_main", "打开主界面", true, None::<&str>).expect("menu item");
    let pause_item =
        MenuItem::with_id(&app, "pet_pause", pause_label, true, None::<&str>).expect("menu item");
    let next_item =
        MenuItem::with_id(&app, "pet_next", "切换宠物", true, None::<&str>).expect("menu item");
    let site_item =
        MenuItem::with_id(&app, "pet_site", "打开官方网站", true, None::<&str>).expect("menu item");
    let quit_item =
        MenuItem::with_id(&app, "pet_quit", "退出 Z-Buddy", true, None::<&str>).expect("menu item");
    let menu = Menu::with_items(
        &app,
        &[
            &main_item,
            &pause_item,
            &next_item,
            &site_item,
            &quit_item,
        ],
    )
    .expect("popup menu");
    let _ = menu.popup(window);
}

// ---- 托盘回调复用的小工具 ----

pub fn cycle_pet(app: &tauri::AppHandle) -> Option<String> {
    let list = pet_list();
    let cur = get_pet_pref();
    let idx = list.iter().position(|p| p == &cur).map(|i| (i + 1) % list.len()).unwrap_or(0);
    let next = list.get(idx).cloned()?;
    write_app_key("pet", json!(next));
    let _ = app.emit("pet-changed", next.clone());
    Some(next)
}

pub fn toggle_pause() -> bool {
    let p = z_buddy_dir().join("pause");
    if p.exists() {
        let _ = fs::remove_file(&p);
        false
    } else {
        let _ = fs::create_dir_all(z_buddy_dir());
        fs::File::create(&p).is_ok()
    }
}

pub fn read_events_total() -> usize {
    fs::read_to_string(z_buddy_dir().join("events.jsonl"))
        .map(|t| t.lines().count())
        .unwrap_or(0)
}
