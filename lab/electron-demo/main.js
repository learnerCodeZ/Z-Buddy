const { app, BrowserWindow, screen } = require("electron");

// Z-Buddy Phase 0 选型对拼：最小桌宠样品（透明/无边框/置顶/托盘外）
app.disableHardwareAcceleration(); // 统一条件：关硬件加速，公平对比

app.whenReady().then(() => {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: 160,
    height: 160,
    x: workArea.x + workArea.width - 200,
    y: workArea.y + workArea.height - 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { contextIsolation: true },
  });

  win.loadURL(
    "data:text/html," +
      encodeURIComponent(`<!doctype html><body style="margin:0;background:transparent;overflow:hidden">
      <div style="width:110px;height:110px;margin:25px;border-radius:50%;background:#ff9f43;
        box-shadow:0 6px 24px #ff9f4366;display:flex;align-items:center;justify-content:center;
        font-size:52px;user-select:none">🐾</div></body>`),
  );
  win.setIgnoreMouseEvents(true, { forward: true }); // 点击穿透：实验样品不干扰真实鼠标
});
