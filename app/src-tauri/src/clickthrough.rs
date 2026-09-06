//! 点击穿透守护：光标不在宠物本体矩形时，把宠物窗设为穿透。
//! 三重保险期间绝不动手：DRAGGING 标记 / 物理左键按着 / （前端 mousedown 即置标记）。

use std::sync::atomic::Ordering;

use tauri::Manager;

use crate::DRAGGING;

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

pub fn spawn(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(200));
        let Some(win) = app.get_webview_window("pet") else { continue };
        if DRAGGING.load(Ordering::SeqCst) || left_button_held() {
            let _ = win.set_ignore_cursor_events(false);
            continue;
        }
        let Ok(cur) = app.cursor_position() else { continue };
        let Ok(wpos) = win.outer_position() else { continue };
        let scale = win.scale_factor().unwrap_or(1.0);
        let lx = (cur.x - wpos.x as f64) / scale;
        let ly = (cur.y - wpos.y as f64) / scale;
        // 交互区 = 宠物本体矩形（CSS 空间 50..190 x, 155..295 y，窗口宽 240）
        let interactive = lx >= 50.0 && lx <= 190.0 && ly >= 155.0 && ly <= 295.0;
        let _ = win.set_ignore_cursor_events(!interactive);
    });
}
