// Z-Buddy 宠物窗：精灵动画 + 状态轮询 + 点按暂停 + 拖动 + 右键菜单
import { invoke, listen } from "../shared/api.js";
import { loadPackByPref, SpriteAnimator, pickDragState } from "../shared/pack.js";

const pet = document.querySelector("#pet");
const canvas = document.querySelector("#pet-canvas");
const statusEl = document.querySelector("#card-status");
const detailEl = document.querySelector("#card-detail");

const STATUS_LABEL = {
  idle: "待机 😴",
  thinking: "思考中 💭",
  working: "干活中 ⌨️",
  permission: "等你审批 ❓",
  error: "出错了 😖",
  sleep: "睡觉 Zzz",
};

// ---- 宠物包 ----
let currentPref = await invoke("get_pet_pref_cmd");
let pack = await loadPackByPref(currentPref);
document.querySelector("#card-title").textContent = `Z-Buddy · ${pack.title}`;
let atlas = new Image();
atlas.src = pack.atlasUrl;
let animator = new SpriteAnimator(canvas, atlas, pack.manifest);
animator.start();

// 监听宠物切换事件（主界面/托盘/右键切换后热加载）
console.log("[z-buddy-pet] 注册 pet-changed 监听器，listen =", typeof listen);
listen("pet-changed", async (e) => {
  console.log("[z-buddy-pet] pet-changed 事件收到:", e.payload);
  const newPref = e.payload;
  if (newPref === currentPref) return;
  currentPref = newPref;
  pack = await loadPackByPref(currentPref);
  document.querySelector("#card-title").textContent = `Z-Buddy · ${pack.title}`;
  atlas = new Image();
  atlas.src = pack.atlasUrl;
  atlas.onload = () => {
    animator = new SpriteAnimator(canvas, atlas, pack.manifest);
    animator.start();
  };
});

// ---- 状态轮询 ----
let paused = false;

async function tick() {
  try {
    const s = JSON.parse(await invoke("read_state"));
    paused = !!s.paused;
    // 暂停 = 独立状态行（蜷缩姿势 + 暂停气泡）；class 仍用 paused-ui 以显示角标
    const status = paused ? "paused" : s.status || "sleep";
    // 长按拖动期间动画由拖动形象接管，别让轮询把状态覆盖回去
    if (!dragState) {
      pet.className = paused ? "paused-ui" : status;
      animator.setStatus(status);
    }
    statusEl.textContent = paused
      ? "已暂停 ⏸（点我恢复）"
      : (STATUS_LABEL[status] || status) + (s.detail ? ` · ${s.detail}` : "");
    detailEl.textContent = `最近事件：${s.last_event || "-"}`;
  } catch (err) {
    statusEl.textContent = "读取失败";
    detailEl.textContent = String(err);
  }
}

// ---- 长按 = 拎起来（换成拖动形象）；点按 = 暂停/恢复；拖动 = 挪窗口 ----
//
// 拖动形象（drag_left / drag_right）是静态单帧，只按拖动方向左右切换（另一侧是镜像）。
// 方向判定放在 Rust 侧取光标位置（每 80ms 轮询）：原生拖动窗口时 WebView 收不到
// mousemove（系统模态移动循环），但 JS 定时器照常跑，取光标最稳。
const LONG_PRESS_MS = 150; // 按多久算"长按"，进入拖动形象（仍明显区别于单击）
const DIR_DEAD = 9; // 累计位移超过它才改朝向（防抖、防边界抖动）
let downPos = null;
let moved = false;
let pressTimer = null;
let longPressed = false;
let dragState = null; // "drag_left" | "drag_right" | null
let dragTimer = null;
let accX = 0;
let accY = 0;
let lastCursor = null;
let lastMouseScreen = null; // 最近一次 mousemove 的屏幕坐标（原生拖动接管前的方向线索）

/** 当前宠物包有没有拖动形象行（外部包可能没有） */
function hasDragRows() {
  return !!(pack?.manifest?.states?.drag_left && pack?.manifest?.states?.drag_right);
}

function enterDragPose() {
  if (!hasDragRows() || dragState) return;
  // 初始朝向：优先用"按下后已经移动的方向"——原生拖动接管之前 mousemove 还收得到；
  // 完全没动就先给左向，紧接着的第一次光标采样会纠正（不再固定先显示左向）。
  const hx = lastMouseScreen ? lastMouseScreen.x - downScreen.x : 0;
  const hy = lastMouseScreen ? lastMouseScreen.y - downScreen.y : 0;
  dragState = pickDragState(hx, hy, "drag_left") || "drag_left";
  accX = 0;
  accY = 0;
  lastCursor = null;
  pet.className = "dragging";
  animator.setStatus(dragState);
  const sample = async () => {
    if (!dragState) return;
    try {
      const p = await invoke("cursor_pos");
      if (!p) return;
      if (lastCursor) {
        accX += p.x - lastCursor.x;
        accY += p.y - lastCursor.y;
        if (Math.abs(accX) >= DIR_DEAD || Math.abs(accY) >= DIR_DEAD) {
          const next = pickDragState(accX, accY, dragState);
          if (next && next !== dragState) {
            dragState = next;
            animator.setStatus(next);
          }
          accX = 0;
          accY = 0;
        }
      }
      lastCursor = p;
    } catch {
      /* 预览/无该命令时静默 */
    }
  };
  sample(); // 立刻建立光标基准，别干等第一个 tick
  dragTimer = setInterval(sample, 60); // 之后 60ms 一次
}

function exitDragPose() {
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
  dragState = null;
  lastCursor = null;
  if (pack) animator.setStatus(paused ? "paused" : "idle");
}

let downScreen = { x: 0, y: 0 };

pet.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  downPos = { x: e.clientX, y: e.clientY };
  downScreen = { x: e.screenX, y: e.screenY };
  lastMouseScreen = null;
  moved = false;
  longPressed = false;
  invoke("set_dragging", { on: true });
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    longPressed = true;
    enterDragPose();
  }, LONG_PRESS_MS);
});

window.addEventListener("mousemove", (e) => {
  // 记下最近一次鼠标屏幕位置：长按那一刻用它直接判朝向
  // （原生拖动窗口会走系统模态循环，之后 mousemove 就收不到了）
  if (downPos) lastMouseScreen = { x: e.screenX, y: e.screenY };
  if (!downPos || moved) return;
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) {
    moved = true;
    invoke("plugin:window|start_dragging");
  }
});

window.addEventListener("mouseup", () => {
  clearTimeout(pressTimer);
  if (downPos) invoke("set_dragging", { on: false });
  downPos = null;
  exitDragPose();
});

pet.addEventListener("click", async () => {
  // 长按（拖动形象）或拖动过 → 不当成"点按暂停"
  if (moved || longPressed) {
    moved = false;
    longPressed = false;
    return;
  }
  paused = !paused;
  await invoke("set_pause", { on: paused });
  tick();
});

// ---- 右键：宠物上下文菜单（Rust 弹出，见 popup_pet_menu）----
pet.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  invoke("popup_pet_menu");
});

setInterval(tick, 600);
tick();
