// Z-Buddy 桌宠前端：精灵图动画（hatch-pet 兼容格式）+ 状态轮询 + 点桌宠暂停
const { invoke } = window.__TAURI__.core;

const pet = document.querySelector("#pet");
const canvas = document.querySelector("#pet-canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.querySelector("#card-status");
const detailEl = document.querySelector("#card-detail");
const titleEl = document.querySelector("#card-title");

const STATUS_LABEL = {
  idle: "待机 😴",
  thinking: "思考中 💭",
  working: "干活中 ⌨️",
  permission: "等你审批 ❓",
  error: "出错了 😖",
  sleep: "睡觉 Zzz",
};

// ---- 宠物包加载（hatch-pet 兼容：atlas.png + pet.json，行=状态，横向分帧）----
// 优先外部包（~/.z-buddy/pets/<名>/，按 app.json 的偏好选择），无则回退内置团子
const { convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
let manifest = null;
const atlas = new Image();

async function loadPack(pref) {
  try {
    if (pref && pref !== "mochi") {
      const pets = await invoke("list_external_pets");
      const p = pets.find((x) => x.name === pref);
      if (p) {
        const m = await (await fetch(convertFileSrc(p.dir + "/pet.json"))).json();
        manifest = m;
        atlas.src = convertFileSrc(p.dir + "/atlas.png");
        titleEl.textContent = `Z-Buddy · ${m.title || m.name}（外部包）`;
        return;
      }
    }
  } catch (err) {
    console.warn("外部宠物包加载失败，回退内置:", err);
  }
  atlas.src = "./pets/mochi/atlas.png";
  try {
    const m = await (await fetch("./pets/mochi/pet.json")).json();
    manifest = m;
    titleEl.textContent = `Z-Buddy · ${m.title || m.name}`;
  } catch {}
}

const petPref = await invoke("get_pet_pref_cmd");
await loadPack(petPref);

// 托盘“切换宠物”→ Rust 写偏好并广播事件 → 这里热切换
listen("pet-changed", (e) => loadPack(e.payload));

let frameCol = 0;
let lastFrameAt = 0;
let currentStatus = "sleep";

function drawSprite(ts) {
  if (manifest && atlas.complete && atlas.naturalWidth) {
    const st = manifest.states[currentStatus] || manifest.states.idle;
    const interval = 1000 / (st.fps || 4);
    if (ts - lastFrameAt >= interval) {
      frameCol = (frameCol + 1) % st.frames;
      lastFrameAt = ts;
    }
    const fw = manifest.frame.w;
    const fh = manifest.frame.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false; // 像素风必须关平滑
    ctx.drawImage(atlas, frameCol * fw, st.row * fh, fw, fh, 0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(drawSprite);
}
requestAnimationFrame(drawSprite);

// ---- 状态轮询 ----
let paused = false;

async function tick() {
  try {
    const raw = await invoke("read_state");
    const s = JSON.parse(raw);
    paused = !!s.paused;
    currentStatus = paused ? "sleep" : s.status || "sleep";
    pet.className = paused ? "paused-ui" : currentStatus;
    statusEl.textContent = paused
      ? "已暂停 ⏸（点我恢复）"
      : (STATUS_LABEL[currentStatus] || currentStatus) + (s.detail ? ` · ${s.detail}` : "");
    detailEl.textContent = `最近事件：${s.last_event || "-"}`;
  } catch (err) {
    statusEl.textContent = "读取失败";
    detailEl.textContent = String(err);
  }
}

// ---- 拖动（手动触发原生拖拽，位移阈值区分“拖”与“点”）----
// 不能依赖 data-tauri-drag-region：它与点击穿透守护互相打架（拖动瞬间
// 光标移出矩形 → 穿透被打开 → 原生拖拽夭折）。
// 关键：mousedown 瞬间就 set_dragging(true)（不等位移阈值）——
// 否则快速拖动会在守护线程 200ms 一帧内光标已出矩形，穿透提前打开。
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
  if (downPos) {
    invoke("set_dragging", { on: false });
  }
  downPos = null;
});

pet.addEventListener("click", async () => {
  if (moved) {
    moved = false; // 拖动结束产生的 click：不算点击，不切换暂停
    return;
  }
  paused = !paused;
  await invoke("set_pause", { on: paused });
  tick();
});

setInterval(tick, 600);
tick();
