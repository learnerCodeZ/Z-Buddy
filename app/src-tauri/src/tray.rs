//! 托盘图标与菜单：打开主界面 / 显示隐藏 / 切换宠物 / 打开官方网站 / 退出

use tauri::Manager;
use tauri::menu::{Menu, MenuItem};

use crate::commands::{cycle_pet, open_external, toggle_pause};
use crate::open_main;
use crate::WEBSITE_URL;

pub fn init(app: &tauri::AppHandle) -> tauri::Result<()> {
    let open_main_item =
        MenuItem::with_id(app, "open_main", "打开主界面", true, None::<&str>)?;
    let sep1 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let show_hide =
        MenuItem::with_id(app, "show_hide", "显示 / 隐藏宠物", true, None::<&str>)?;
    let next_pet = MenuItem::with_id(app, "next_pet", "切换宠物", true, None::<&str>)?;
    let sep2 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let open_site = MenuItem::with_id(app, "open_site", "打开官方网站", true, None::<&str>)?;
    let sep3 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Z-Buddy", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open_main_item,
            &sep1,
            &show_hide,
            &next_pet,
            &sep2,
            &open_site,
            &sep3,
            &quit,
        ],
    )?;

    tauri::tray::TrayIconBuilder::with_id("zbuddy-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Z-Buddy")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_main" => open_main(app),
            "show_hide" => {
                if let Some(win) = app.get_webview_window("pet") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                    }
                }
            }
            "next_pet" => {
                cycle_pet(app);
            }
            "open_site" => open_external(app.clone(), WEBSITE_URL.into()),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}
