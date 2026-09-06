//! Z-Buddy 桌宠应用（Tauri v2）
//!
//! 职责：读取插件写入的 ~/.z-buddy/state.json 切换宠物动画；
//! 提供"点桌宠 = 暂停/恢复 Agent"的暂停开关（写/删 ~/.z-buddy/pause，
//! 由插件的 PreToolUse hook 强制执行）。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Emitter, Manager};

/// 拖动进行中标记：拖动期间点击穿透守护必须闭嘴，
/// 否则光标移出宠物矩形瞬间穿透被打开，原生拖拽当场夭折。
static DRAGGING: AtomicBool = AtomicBool::new(false);

fn z_buddy_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".z-buddy")
}

fn app_config_path() -> PathBuf {
    z_buddy_dir().join("app.json")
}

fn get_pet_pref() -> String {
    fs::read_to_string(app_config_path())
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.get("pet").and_then(|p| p.as_str()).map(String::from))
        .unwrap_or_else(|| "mochi".into())
}

fn set_pet_pref(name: &str) -> bool {
    let _ = fs::create_dir_all(z_buddy_dir());
    fs::write(
        app_config_path(),
        serde_json::json!({ "pet": name }).to_string(),
    )
    .is_ok()
}

/// 可选宠物列表：内置团子优先，其后是外部包
fn pet_list() -> Vec<String> {
    let mut list = vec!["mochi".to_string()];
    if let Ok(entries) = fs::read_dir(z_buddy_dir().join("pets")) {
        for e in entries.flatten() {
            if e.path().join("pet.json").is_file() {
                list.push(e.file_name().to_string_lossy().to_string());
            }
        }
    }
    list
}

#[tauri::command]
fn get_pet_pref_cmd() -> String {
    get_pet_pref()
}

/// 扫描外部宠物包：~/.z-buddy/pets/<名>/pet.json 存在即为合法包
#[tauri::command]
fn list_external_pets() -> Vec<serde_json::Value> {
    let mut out = Vec::new();
    let dir = z_buddy_dir().join("pets");
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() && p.join("pet.json").is_file() {
                let name = p
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                out.push(serde_json::json!({
                    "name": name,
                    "dir": p.to_string_lossy(),
                }));
            }
        }
    }
    out
}

/// 读取插件写入的状态快照；paused 字段以 pause 文件实时状态为准
/// （state.json 只在 hook 事件到来时刷新，直接信它会回退 UI）
#[tauri::command]
fn read_state() -> String {
    let mut v: serde_json::Value = serde_json::from_str(
        &fs::read_to_string(z_buddy_dir().join("state.json")).unwrap_or_else(|_| {
            r#"{"status":"sleep","detail":"no plugin data yet"}"#.into()
        }),
    )
    .unwrap_or_else(|_| serde_json::json!({"status": "sleep", "detail": "state parse error"}));
    v["paused"] = serde_json::Value::Bool(z_buddy_dir().join("pause").exists());
    v.to_string()
}

/// 点桌宠 = 暂停/恢复：写/删 pause 文件，由插件 PreToolUse hook 强制执行
#[tauri::command]
fn set_pause(on: bool) -> bool {
    println!("[z-buddy] set_pause({}) invoked", on); // 诊断埋点：排查重启时的幽灵点击
    let dir = z_buddy_dir();
    let p = dir.join("pause");
    if on {
        let _ = fs::create_dir_all(&dir);
        fs::File::create(&p).is_ok()
    } else {
        match fs::remove_file(&p) {
            Ok(_) => true,
            Err(_) => !p.exists(),
        }
    }
}

/// 前端在开始原生拖拽前置 true、结束后置 false
#[tauri::command]
fn set_dragging(on: bool) {
    DRAGGING.store(on, Ordering::SeqCst);
}

/// 点击穿透守护：光标不在宠物本体（交互区）时，把窗口设为穿透，
/// 避免上方透明区域（悬停卡预留区）挡住身后内容的点击。
/// 交互区 = 宠物本体矩形（CSS 空间 50..190 x, 155..295 y，窗口宽 240）；
/// 拖动进行中强制保持可交互。
/// 物理左键是否按着（按钮按下期间穿透守护绝不动手，物理上覆盖所有拖拽手势）
#[cfg(windows)]
fn left_button_held() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    // VK_LBUTTON = 0x01；高位置 1 表示按下
    (unsafe { GetAsyncKeyState(0x01i32) } & 0x8000u16 as i16) != 0
}
#[cfg(not(windows))]
fn left_button_held() -> bool {
    false
}

fn spawn_clickthrough(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(200));
        let Some(win) = app.get_webview_window("main") else { continue };
        if DRAGGING.load(Ordering::SeqCst) || left_button_held() {
            let _ = win.set_ignore_cursor_events(false);
            continue;
        }
        let Ok(cur) = app.cursor_position() else { continue };
        let Ok(wpos) = win.outer_position() else { continue };
        let scale = win.scale_factor().unwrap_or(1.0);
        let lx = (cur.x - wpos.x as f64) / scale;
        let ly = (cur.y - wpos.y as f64) / scale;
        let interactive = lx >= 50.0 && lx <= 190.0 && ly >= 155.0 && ly <= 295.0;
        let _ = win.set_ignore_cursor_events(!interactive);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_state,
            set_pause,
            set_dragging,
            list_external_pets,
            get_pet_pref_cmd
        ])
        .setup(|app| {
            // ---- 托盘：显示/隐藏 · 切换宠物 · 退出 ----
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::TrayIconBuilder;
            let show_hide =
                MenuItem::with_id(app, "show_hide", "显示 / 隐藏宠物", true, None::<&str>)?;
            let next_pet = MenuItem::with_id(app, "next_pet", "切换宠物", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Z-Buddy", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &next_pet, &quit])?;
            TrayIconBuilder::with_id("zbuddy-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Z-Buddy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let Some(win) = app.get_webview_window("main") else { return };
                    match event.id().as_ref() {
                        "show_hide" => {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                        "next_pet" => {
                            let list = pet_list();
                            let cur = get_pet_pref();
                            let idx = list
                                .iter()
                                .position(|p| p == &cur)
                                .map(|i| (i + 1) % list.len())
                                .unwrap_or(0);
                            if let Some(next) = list.get(idx) {
                                let _ = set_pet_pref(next);
                                let _ = win.emit("pet-changed", next.clone());
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .build(app)?;
            // 桌宠出生在主屏右下角（按窗口实际物理尺寸计算，适配任意 DPI 缩放）
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(mon)) = win.current_monitor() {
                    let mpos = mon.position();
                    let msize = mon.size();
                    let wsize = win.outer_size().unwrap_or(tauri::PhysicalSize::new(240, 450));
                    let _ = win.set_position(tauri::PhysicalPosition::new(
                        mpos.x + msize.width as i32 - wsize.width as i32 - 10,
                        mpos.y + msize.height as i32 - wsize.height as i32 - 60,
                    ));
                }
            }
            spawn_clickthrough(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
