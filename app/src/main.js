// Z-Buddy 桌宠前端：轮询状态 → 切动画；单击 → 暂停/恢复
const { invoke } = window.__TAURI__.core;

const pet = document.querySelector("#pet");
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

const STATUS_FACE = {
  idle: "🐾",
  thinking: "🤔",
  working: "🐾",
  permission: "❓",
  error: "😵",
  sleep: "💤",
};

let paused = false;

async function tick() {
  try {
    const raw = await invoke("read_state");
    const s = JSON.parse(raw);
    paused = !!s.paused;
    const status = paused ? "working" : s.status || "sleep"; // 暂停时保留底色动画但置灰
    pet.className = paused ? "paused-ui" : status;
    statusEl.textContent = paused
      ? "已暂停 ⏸（点我恢复）"
      : (STATUS_LABEL[s.status] || s.status) + (s.detail ? ` · ${s.detail}` : "");
    detailEl.textContent = paused
      ? "Agent 的工具调用已被拦截"
      : s.detail && !s.detail.startsWith(s.status)
        ? `最近事件：${s.last_event || "-"}`
        : `最近事件：${s.last_event || "-"}`;
    pet.querySelector("#pet-face").textContent = paused ? "😴" : (STATUS_FACE[s.status] || "🐾");
  } catch (err) {
    statusEl.textContent = "读取失败";
    detailEl.textContent = String(err);
  }
}

pet.addEventListener("click", async (e) => {
  // 拖动结束时也会触发 click？Tauri 拖动区域通常不触发 click，保险起见直接切换
  paused = !paused;
  await invoke("set_pause", { on: paused });
  tick();
});

setInterval(tick, 600);
tick();
