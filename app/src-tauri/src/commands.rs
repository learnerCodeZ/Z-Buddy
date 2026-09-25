//! 全部 Tauri 命令：状态/暂停/拖动/宠物包/事件流/设置/外部打开

use std::fs;

use serde_json::json;
use tauri::menu::ContextMenu;
use tauri::{Emitter, Manager};

use crate::config::{pet_list, read_app_key_f64, read_app_key_str, write_app_key, z_buddy_dir};

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
pub fn set_pause(on: bool, source: Option<String>) -> bool {
    // source 标记调用来源（pet-click / pet-menu / dashboard），排查"幽灵暂停"用
    println!(
        "[z-buddy] set_pause({}) from {}",
        on,
        source.as_deref().unwrap_or("unknown")
    );
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

/// 当前光标位置（物理像素）。长按拖动时 WebView 收不到 mousemove（Windows 系统模态
/// 移动循环），但 JS 定时器照常跑 → 由前端轮询本命令判断游动朝向。
#[tauri::command]
pub fn cursor_pos(app: tauri::AppHandle) -> serde_json::Value {
    match app.cursor_position() {
        Ok(p) => json!({ "x": p.x, "y": p.y }),
        Err(_) => json!(null),
    }
}

// ---- 桌宠缩放与位置记忆 ----

/// 桌宠缩放（1.0 = 原始 240×340 窗口，CSS 侧用 transform 等比缩放）
#[tauri::command]
pub fn get_pet_scale() -> f64 {
    read_app_key_f64("petScale").unwrap_or(1.0).clamp(0.5, 2.0)
}

/// 设置缩放并联动窗口尺寸；底边锚定（宠物"脚下"位置不动），返回吸附后的值
#[tauri::command]
pub fn set_pet_scale(app: tauri::AppHandle, scale: f64) -> f64 {
    let s = scale.clamp(0.5, 2.0);
    let prev = crate::PET_SCALE.load(std::sync::atomic::Ordering::SeqCst) as f64 / 100.0;
    write_app_key("petScale", json!(s));
    crate::PET_SCALE.store(
        (s * 100.0).round() as u32,
        std::sync::atomic::Ordering::SeqCst,
    );
    if let Some(win) = app.get_webview_window("pet") {
        if let Ok(dpi) = win.scale_factor() {
            let dy = (340.0 * (s - prev) * dpi).round() as i32;
            if dy != 0 {
                if let Ok(p) = win.outer_position() {
                    let _ = win.set_position(tauri::PhysicalPosition::new(p.x, p.y - dy));
                }
            }
        }
        let _ = win.set_size(tauri::LogicalSize::new(240.0 * s, 340.0 * s));
        let _ = app.emit("pet-scale-changed", s);
    }
    s
}

/// 保存宠物窗当前位置（物理像素），下次启动恢复（配合拖动结束的 mouseup 调用）
#[tauri::command]
pub fn save_pet_position(app: tauri::AppHandle) -> bool {
    if let Some(win) = app.get_webview_window("pet") {
        if let Ok(p) = win.outer_position() {
            write_app_key("petWindow", json!({ "x": p.x, "y": p.y }));
            return true;
        }
    }
    false
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
    const BUNDLED: &[&str] = &["yoru", "mochi", "bsod", "fireball"];
    let mut seen = std::collections::HashSet::new();
    pet_list()
        .into_iter()
        .filter(|name| seen.insert(name.clone()))
        .map(|name| {
            let is_bundled = BUNDLED.contains(&name.as_str());
            json!({
                "name": name,
                "source": if is_bundled { "bundled" } else { "external" },
                "dir": if !is_bundled {
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
    // 默认宠物：夜羽（插画形象）
    read_app_key_str("pet").unwrap_or_else(|| "yoru".into())
}

#[tauri::command]
pub fn get_pet_pref_cmd() -> String {
    get_pet_pref()
}

/// 切换宠物：写偏好并广播（宠物窗与主界面同时热切换）
#[tauri::command]
pub fn set_pet_pref_cmd(app: tauri::AppHandle, name: String) -> bool {
    write_app_key("pet", json!(name));
    // 广播到所有窗口（pet 窗和 main 窗）
    let _ = app.emit("pet-changed", &name);
    true
}

// ---- 事件流 ----

/// 事件流轮转阈值：超过该行数时，读操作顺带截断（应用是唯一单实例读者，
/// 放这里避免多会话插件进程并发写时截断竞态）
const EVENT_ROTATE_LINES: usize = 5000;
/// 轮转后保留的尾部行数
const EVENT_KEEP_LINES: usize = 2000;

/// 读 events.jsonl 尾部 limit 条（可按项目 / 会话筛选）+ 总条数
#[tauri::command]
pub fn read_events(
    limit: usize,
    project: Option<String>,
    session: Option<String>,
) -> serde_json::Value {
    let path = z_buddy_dir().join("events.jsonl");
    let text = fs::read_to_string(&path).unwrap_or_default();
    let mut total = text.lines().count();
    // 轮转：保留尾部 EVENT_KEEP_LINES 行，临时文件 + rename 原子替换
    if total > EVENT_ROTATE_LINES {
        let mut kept: Vec<&str> = text.lines().rev().take(EVENT_KEEP_LINES).collect();
        kept.reverse();
        let tmp = path.with_extension("jsonl.tmp");
        let body = format!("{}\n", kept.join("\n"));
        if fs::write(&tmp, body).is_ok() && fs::rename(&tmp, &path).is_ok() {
            total = EVENT_KEEP_LINES;
        }
        let _ = fs::remove_file(&tmp);
    }
    let matches = |v: &serde_json::Value, key: &str, want: &Option<String>| match want {
        Some(w) => v.get(key).and_then(|x| x.as_str()) == Some(w.as_str()),
        None => true,
    };
    let items: Vec<serde_json::Value> = text
        .lines()
        .rev()
        .filter_map(|l| serde_json::from_str(l).ok())
        .filter(|v: &serde_json::Value| {
            matches(v, "project", &project) && matches(v, "session_id", &session)
        })
        .take(limit)
        .collect();
    json!({ "total": total, "items": items })
}

// ---- 多会话聚合（phase-3）----

/// 会话失活阈值：hook 没有"会话结束"事件（枚举已从 ZCode 开源源码确认），只能超时判活
const SESSION_STALE_MS: u64 = 10 * 60 * 1000;
/// 会话分片数量上限，超出时清理最旧的
const SESSION_SHARD_MAX: usize = 50;

/// 读全部会话分片（按最近活跃倒序）。active = updated_ms 距今 10 分钟内；
/// 分片由插件每会话独立写入，应用端只读，无并发问题
#[tauri::command]
pub fn read_sessions() -> Vec<serde_json::Value> {
    let dir = z_buddy_dir().join("sessions");
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let mut items: Vec<(u64, serde_json::Value)> = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("json") {
                continue;
            }
            if let Ok(text) = fs::read_to_string(&p) {
                if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&text) {
                    let ums = v.get("updated_ms").and_then(|x| x.as_u64()).unwrap_or(0);
                    v["active"] = json!(ums > 0 && now_ms.saturating_sub(ums) < SESSION_STALE_MS);
                    items.push((ums, v));
                }
            }
        }
    }
    items.sort_by(|a, b| b.0.cmp(&a.0));
    if items.len() > SESSION_SHARD_MAX {
        for (_, v) in items.iter().skip(SESSION_SHARD_MAX) {
            if let Some(sid) = v.get("session_id").and_then(|x| x.as_str()) {
                let safe: String = sid
                    .chars()
                    .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
                    .collect();
                let _ = fs::remove_file(dir.join(format!("{safe}.json")));
            }
        }
    }
    items
        .into_iter()
        .take(SESSION_SHARD_MAX)
        .map(|(_, v)| v)
        .collect()
}

/// 活动页筛选候选：全量事件中去重的 project / session_id
#[tauri::command]
pub fn event_facets() -> serde_json::Value {
    let text = fs::read_to_string(z_buddy_dir().join("events.jsonl")).unwrap_or_default();
    let mut projects = std::collections::BTreeSet::new();
    let mut sessions = std::collections::BTreeSet::new();
    for line in text.lines() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(p) = v.get("project").and_then(|x| x.as_str()) {
                if !p.is_empty() {
                    projects.insert(p.to_string());
                }
            }
            if let Some(s) = v.get("session_id").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    sessions.insert(s.to_string());
                }
            }
        }
    }
    json!({
        "projects": projects.into_iter().collect::<Vec<_>>(),
        "sessions": sessions.into_iter().collect::<Vec<_>>(),
    })
}

/// 今日统计：按 events.jsonl 的 ts_local（本地时间）切日，day 形如 "2026-09-25"
/// （由前端传入本地日期，避免 Rust 侧处理时区）；活跃时长取当日首尾事件跨度
#[tauri::command]
pub fn daily_stats(day: String) -> serde_json::Value {
    let text = fs::read_to_string(z_buddy_dir().join("events.jsonl")).unwrap_or_default();
    let prefix = format!("{day}T");
    let mut events = 0usize;
    let mut tool_calls = 0usize;
    let mut first: Option<i64> = None;
    let mut last: Option<i64> = None;
    let mut tools: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for line in text.lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let Some(ts) = v.get("ts_local").and_then(|x| x.as_str()) else {
            continue;
        };
        if !ts.starts_with(&prefix) {
            continue;
        }
        events += 1;
        if let Some(tool) = v.get("tool").and_then(|x| x.as_str()).filter(|s| !s.is_empty()) {
            tool_calls += 1;
            *tools.entry(tool.to_string()).or_insert(0) += 1;
        }
        let secs = ts.get(11..19).and_then(hms_to_secs).unwrap_or(0);
        first = Some(match first {
            Some(f) => f.min(secs),
            None => secs,
        });
        last = Some(match last {
            Some(l) => l.max(secs),
            None => secs,
        });
    }
    let mut top: Vec<(String, usize)> = tools.into_iter().collect();
    top.sort_by(|a, b| b.1.cmp(&a.1));
    top.truncate(3);
    json!({
        "events": events,
        "toolCalls": tool_calls,
        "activeMinutes": first.zip(last).map(|(f, l)| (l - f).max(0) / 60).unwrap_or(0),
        "topTools": top
            .into_iter()
            .map(|(name, count)| json!({ "name": name, "count": count }))
            .collect::<Vec<_>>(),
    })
}

/// "HH:MM:SS" → 当日秒数
fn hms_to_secs(s: &str) -> Option<i64> {
    let mut it = s.split(':');
    let h: i64 = it.next()?.parse().ok()?;
    let m: i64 = it.next()?.parse().ok()?;
    let sec: i64 = it.next()?.parse().ok()?;
    Some(h * 3600 + m * 60 + sec)
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

// ---- 宠物目录与打开 ----

/// 返回 ~/.z-buddy/pets 路径
#[tauri::command]
pub fn get_pets_dir() -> String {
    z_buddy_dir().join("pets").to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_local_dir(dir: String) {
    // Windows explorer 需要末尾反斜杠才能识别为文件夹
    let normalized = if std::path::Path::new(&dir).is_dir() {
        if dir.ends_with('\\') || dir.ends_with('/') { dir } else { format!("{}\\", dir) }
    } else {
        dir
    };
    let _ = std::process::Command::new("explorer").arg(&normalized).spawn();
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

// ---- 应用更新（tauri-plugin-updater，v0.2.0 起启用）----

/// 检查更新：主界面启动时调用，有新版才显示标题栏的更新按钮。
/// 出错（断网/未配置）一律返回 available:false，前端静默跳过。
#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> serde_json::Value {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return json!({ "available": false, "error": e.to_string() }),
    };
    match updater.check().await {
        Ok(Some(update)) => json!({
            "available": true,
            "version": update.version,
            "current": update.current_version,
            "notes": update.body,
        }),
        Ok(None) => json!({ "available": false }),
        Err(e) => json!({ "available": false, "error": e.to_string() }),
    }
}

/// 下载并安装更新；NSIS 安装器会自行结束旧进程并重启应用
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> serde_json::Value {
    use tauri_plugin_updater::UpdaterExt;
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => return json!({ "ok": false, "error": e.to_string() }),
    };
    match updater.check().await {
        Ok(Some(update)) => match update.download_and_install(|_, _| {}, || {}).await {
            Ok(_) => json!({ "ok": true }),
            Err(e) => json!({ "ok": false, "error": e.to_string() }),
        },
        Ok(None) => json!({ "ok": false, "error": "已是最新版本" }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}
