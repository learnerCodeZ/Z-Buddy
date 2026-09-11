// 总览页：大图与角落宠物同帧同步 + 状态卡 + 暂停 + 事件时间线
import { invoke } from "../shared/api.js";
import { loadPackByPref, SpriteAnimator } from "../shared/pack.js";

const statusEl = document.querySelector("#dash-status");
const detailEl = document.querySelector("#dash-detail");
const sessionEl = document.querySelector("#dash-session");
const statsEl = document.querySelector("#dash-stats");
const pauseBtn = document.querySelector("#dash-pause");
const timelineEl = document.querySelector("#timeline");

const STATUS_LABEL = {
  idle: "待机 😴",
  thinking: "思考中 💭",
  working: "干活中 ⌨️",
  permission: "等你审批 ❓",
  error: "出错了 😖",
  sleep: "睡觉 Zzz",
};

let paused = false;
let animator;

export async function bootDashboard() {
  const canvas = document.querySelector("#dash-canvas");
  const pref = await invoke("get_pet_pref_cmd");
  const pack = await loadPackByPref(pref);
  const atlas = new Image();
  atlas.src = pack.atlasUrl;
  animator = new SpriteAnimator(canvas, atlas, pack.manifest);
  animator.start();

  pauseBtn.onclick = async () => {
    paused = !paused;
    await invoke("set_pause", { on: paused });
    tick();
  };

  tick();
  setInterval(tick, 600);
}

export async function refreshDashboard() {
  // 宠物切换后重载精灵图
  try {
    const pref = await invoke("get_pet_pref_cmd");
    const pack = await loadPackByPref(pref);
    const canvas = document.querySelector("#dash-canvas");
    const atlas = new Image();
    atlas.src = pack.atlasUrl;
    animator = new SpriteAnimator(canvas, atlas, pack.manifest);
    animator.start();
  } catch {}
  tick();
}

async function tick() {
  try {
    const s = JSON.parse(await invoke("read_state"));
    paused = !!s.paused;
    const status = paused ? "paused" : s.status || "sleep";
    animator?.setStatus(status);
    statusEl.textContent = paused
      ? "已暂停 ⏸（点宠物或此处恢复）"
      : (STATUS_LABEL[status] || status) + (s.detail ? ` · ${s.detail}` : "");
    detailEl.textContent = `最近事件：${s.last_event || "-"}`;
    sessionEl.textContent = `会话：${s.session_id || "-"}`;
    pauseBtn.textContent = paused ? "▶ 恢复 Agent" : "⏸ 暂停 Agent";
    pauseBtn.classList.toggle("on", paused);

    const evs = await invoke("read_events", { limit: 10 });
    statsEl.textContent = `事件流共 ${evs.total} 条（显示最近 ${evs.items.length}）`;
    timelineEl.innerHTML = evs.items
      .map((e) => {
        const t = (e.ts || "").slice(11, 19);
        const preview = e.preview ? ` — ${e.preview}` : "";
        return `<li><b>${t}</b> ${e.event}${e.tool ? " · " + e.tool : ""}${preview}</li>`;
      })
      .join("");
  } catch (err) {
    statusEl.textContent = "读取失败";
    detailEl.textContent = String(err);
  }
}
