//! Z-Buddy 桌宠应用（Tauri v2）
//!
//! 职责：读取插件写入的 ~/.z-buddy/state.json 切换宠物动画；
//! 提供"点桌宠 = 暂停/恢复 Agent"的暂停开关（写/删 ~/.z-buddy/pause，
//! 由插件的 PreToolUse hook 强制执行）。

use std::fs;
use std::path::PathBuf;

use tauri::Manager;

fn z_buddy_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".z-buddy")
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

/// 点击穿透守护：光标不在宠物本体（交互区）时，把窗口设为穿透，
/// 避免上方透明区域（悬停卡预留区）挡住身后内容的点击。
/// MVP 交互区 = 宠物本体矩形（CSS 空间 10..150 x, 155..295 y）；
/// 悬停卡暂不含在内（卡片纯展示）。
fn spawn_clickthrough(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(200));
        let Some(win) = app.get_webview_window("main") else { continue };
        let Ok(cur) = app.cursor_position() else { continue };
        let Ok(wpos) = win.outer_position() else { continue };
        let Ok(wsize) = win.outer_size() else { continue };
        let scale = win.scale_factor().unwrap_or(1.0);
        let lx = (cur.x - wpos.x as f64) / scale;
        let ly = (cur.y - wpos.y as f64) / scale;
        let interactive = lx >= 10.0 && lx <= 150.0 && ly >= 155.0 && ly <= 295.0;
        let _ = win.set_ignore_cursor_events(!interactive);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_state, set_pause])
        .setup(|app| {
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
