//! Z-Buddy 桌宠应用（Tauri v2）
//!
//! 双窗结构：pet（角落宠物窗，静态配置）+ main（主界面驾驶舱，动态创建、默认隐藏）。
//! 数据面：插件 hooks → ~/.z-buddy/{state.json,events.jsonl,pause} → 两窗共享。

pub mod clickthrough;
pub mod commands;
pub mod config;
pub mod tray;

use std::sync::atomic::{AtomicBool, Ordering};

use serde_json::json;
use tauri::{Emitter, Manager};

use commands::{open_external, toggle_pause};
use config::{read_app_key_bool, write_app_key};

/// 拖动进行中标记：拖动期间点击穿透守护绝不动手
pub static DRAGGING: AtomicBool = AtomicBool::new(false);

pub const WEBSITE_URL: &str = "https://learnercodez.github.io/Z-Buddy/";

/// 打开（或聚焦）主界面驾驶舱
pub fn open_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        return;
    }
    let _ = tauri::WebviewWindowBuilder::new(
        app,
        "main",
        tauri::WebviewUrl::App("/main/index.html".into()),
    )
    .title("Z-Buddy")
    .inner_size(920.0, 620.0)
    .min_inner_size(760.0, 520.0)
    .center()
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .build();
}

/// 首次运行：弹一次主界面（新手引导）+ 默认开启开机自启
fn first_run(app: &tauri::AppHandle) {
    if read_app_key_bool("mainSeen").is_some() {
        return;
    }
    write_app_key("mainSeen", json!(true));
    use tauri_plugin_autostart::ManagerExt;
    let _ = app.autolaunch().enable();
    open_main(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例必须最先注册：二次启动时聚焦主界面
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            open_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        // 自动更新：检查/下载/安装（命令见 commands.rs 的 check_update / install_update）
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_state,
            commands::set_pause,
            commands::set_dragging,
            commands::cursor_pos,
            commands::list_external_pets,
            commands::list_all_pets,
            commands::get_pet_pref_cmd,
            commands::set_pet_pref_cmd,
            commands::read_events,
            commands::hide_main,
            commands::get_close_behavior,
            commands::set_close_behavior,
            commands::autostart_enabled,
            commands::autostart_set,
            commands::open_external,
            commands::popup_pet_menu,
            commands::open_local_dir,
            commands::get_pets_dir,
            commands::check_update,
            commands::install_update
        ])
        // 宠物右键菜单（popup_pet_menu 弹出的 pet_* 项）走这里
        .on_menu_event(|app, event| match event.id().as_ref() {
            "pet_main" => open_main(app),
            "pet_pause" => {
                toggle_pause();
            }
            "pet_next" => {
                commands::cycle_pet(app);
            }
            "pet_site" => open_external(app.clone(), WEBSITE_URL.into()),
            "pet_quit" => app.exit(0),
            _ => {}
        })
        .on_window_event(|window, event| {
            // 主界面 ✕ = 按配置隐藏或退出；默认隐藏到托盘
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let behavior =
                        read_app_key_str_public("closeBehavior").unwrap_or_else(|| "hide".into());
                    if behavior != "exit" {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
        })
        .setup(|app| {
            // ---- 宠物窗出生在主屏右下角（按实际物理尺寸，适配 DPI 缩放）----
            if let Some(win) = app.get_webview_window("pet") {
                if let Ok(Some(mon)) = win.current_monitor() {
                    let mpos = mon.position();
                    let msize = mon.size();
                    let wsize = win.outer_size().unwrap_or(tauri::PhysicalSize::new(360, 450));
                    let _ = win.set_position(tauri::PhysicalPosition::new(
                        mpos.x + msize.width as i32 - wsize.width as i32 - 10,
                        mpos.y + msize.height as i32 - wsize.height as i32 - 60,
                    ));
                }
            }
            clickthrough::spawn(app.handle().clone());
            tray::init(app.handle())?;
            first_run(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// on_window_event 闭包里用的配置读取（绕开私有模块引用的小包装）
fn read_app_key_str_public(key: &str) -> Option<String> {
    config::read_app_key_str(key)
}
