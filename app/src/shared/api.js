// Z-Buddy 共享 API：两个窗口（pet/main）统一从这里拿 Tauri 桥
export const invoke = window.__TAURI__.core.invoke;
export const convertFileSrc = window.__TAURI__.core.convertFileSrc;
export const listen = window.__TAURI__.event.listen;
