// Z-Buddy 宠物窗：精灵动画 + 状态轮询 + 点按暂停 + 拖动 + 右键菜单
import { invoke, listen } from "../shared/api.js";
import { loadPackByPref, SpriteAnimator } from "../shared/pack.js";

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
    const status = paused ? "sleep" : s.status || "sleep";
    pet.className = paused ? "paused-ui" : status;
    animator.setStatus(status);
    statusEl.textContent = paused
      ? "已暂停 ⏸（点我恢复）"
      : (STATUS_LABEL[status] || status) + (s.detail ? ` · ${s.detail}` : "");
    detailEl.textContent = `最近事件：${s.last_event || "-"}`;
  } catch (err) {
    statusEl.textContent = "读取失败";
    detailEl.textContent = String(err);
  }
}

// ---- 点按暂停 / 拖动（阈值区分）----
let downPos = null;
let moved = false;

pet.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  downPos = { x: e.clientX, y: e.clientY };
  moved = false;
  invoke("set_dragging", { on: true });
});

window.addEventListener("mousemove", (e) => {
  if (!downPos || moved) return;
  if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) {
    moved = true;
    invoke("plugin:window|start_dragging");
  }
});

window.addEventListener("mouseup", () => {
  if (downPos) invoke("set_dragging", { on: false });
  downPos = null;
});

pet.addEventListener("click", async () => {
  if (moved) {
    moved = false;
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
