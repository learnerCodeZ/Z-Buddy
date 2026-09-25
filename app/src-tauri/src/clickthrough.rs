//! 点击穿透守护：光标不在宠物本体矩形时，把宠物窗设为穿透。
//! 三重保险期间绝不动手：DRAGGING 标记 / 物理左键按着 / （前端 mousedown 即置标记）。

use std::sync::atomic::Ordering;

use tauri::Manager;

use crate::config::read_app_key_f64;
use crate::{DRAGGING, PET_SCALE};

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
    // 启动即载入已保存的缩放，重启后穿透矩形仍按缩放计算
    if let Some(s) = read_app_key_f64("petScale") {
        PET_SCALE.store(
            (s.clamp(0.5, 2.0) * 100.0).round() as u32,
            Ordering::SeqCst,
        );
    }
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
        // 交互区 = 宠物本体矩形（CSS 空间 24..216 x, 142..334 y，原始窗口 240×340）
        // × 宠物缩放（PET_SCALE/100，与 pet/styles.css 的 #pet 位置尺寸保持一致）；
        // lx/ly 已是逻辑像素，PET_SCALE 是逻辑缩放，直接相乘
        let s = PET_SCALE.load(Ordering::SeqCst) as f64 / 100.0;
        let interactive = lx >= 24.0 * s && lx <= 216.0 * s && ly >= 142.0 * s && ly <= 334.0 * s;
        let _ = win.set_ignore_cursor_events(!interactive);
    });
}
