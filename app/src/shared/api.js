// Z-Buddy 共享 API：两个窗口（pet/main）统一从这里拿 Tauri 桥
// 注意：__TAURI__ 在模块加载时由 Tauri 运行时注入，模块级取值是安全的
export const invoke = window.__TAURI__.core.invoke;
export const convertFileSrc = window.__TAURI__.core.convertFileSrc;
export const listen = window.__TAURI__.event.listen;
export const emit = window.__TAURI__.event.emit;
