// 总览页：大图与角落宠物同帧同步 + 状态卡 + 暂停 + 多会话卡片 + 今日统计 + 事件时间线
import { invoke } from "../shared/api.js";
import {
  loadPackByPref,
  SpriteAnimator,
  resolvePetStatus,
  pickDominantSession,
  baseStatusName,
} from "../shared/pack.js";

const statusEl = document.querySelector("#dash-status");
const detailEl = document.querySelector("#dash-detail");
const sessionEl = document.querySelector("#dash-session");
const projectEl = document.querySelector("#dash-project");
const statsEl = document.querySelector("#dash-stats");
const sessionsEl = document.querySelector("#dash-sessions");
const dailyEl = document.querySelector("#dash-daily");
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
let manifestStates = null; // 当前宠物包的 states（判断有没有 *_alt 形象）

export async function bootDashboard() {
  const canvas = document.querySelector("#dash-canvas");
  const pref = await invoke("get_pet_pref_cmd");
  const pack = await loadPackByPref(pref);
  manifestStates = pack.manifest.states || null;
  const atlas = new Image();
  atlas.src = pack.atlasUrl;
  animator = new SpriteAnimator(canvas, atlas, pack.manifest);
  animator.start();

  pauseBtn.onclick = async () => {
    paused = !paused;
    await invoke("set_pause", { on: paused, source: "dashboard" });
    tick();
  };

  tick();
  setInterval(tick, 600);
  refreshStats();
  setInterval(refreshStats, 30000); // 今日统计 30 秒一刷足够
}

/** 今日统计（本地日切，30 秒一刷） */
async function refreshStats() {
  try {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const st = await invoke("daily_stats", { day });
    const tops = (st.topTools || []).map((t) => `${t.name}×${t.count}`).join(" · ");
    dailyEl.textContent =
      `今日：${st.toolCalls} 次工具调用 · 活跃约 ${st.activeMinutes} 分钟` + (tops ? ` · ${tops}` : "");
  } catch {
    dailyEl.textContent = "";
  }
}

/** 多会话卡片：最近活跃在前，失活置灰，最多 8 张 */
function renderSessions(sessions) {
  if (!sessions || !sessions.length) {
    sessionsEl.innerHTML = '<div class="session-hint">暂无会话——装好 z-buddy 插件让 ZCode 干个活。</div>';
    return;
  }
  sessionsEl.innerHTML = sessions
    .slice(0, 8)
    .map((s) => {
      const label = STATUS_LABEL[baseStatusName(s.status)] || s.status;
      const project = (s.cwd || "").split(/[\\/]/).filter(Boolean).pop() || "未知项目";
      const stale = s.active === false ? " stale" : "";
      const mins = s.updated_ms ? Math.floor((Date.now() - s.updated_ms) / 60000) : null;
      const ago = mins === null ? "" : mins < 1 ? " · 刚刚" : ` · ${mins} 分钟前`;
      const agent = s.agent ? ` · ${s.agent}` : "";
      const cu = s.desktop_control ? " 🖥" : "";
      return `<div class="session-card${stale}"><b>${label}${cu}</b><span>${project}${agent}${ago}</span></div>`;
    })
    .join("");
}

export async function refreshDashboard() {
  // 宠物切换后重载精灵图
  try {
    const pref = await invoke("get_pet_pref_cmd");
    const pack = await loadPackByPref(pref);
    manifestStates = pack.manifest.states || null;
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
    // 多会话聚合：大状态显示"最要紧"的会话；无分片时退回 state.json 兼容快照
    let dom = null;
    let sessions = [];
    try {
      sessions = (await invoke("read_sessions")) || [];
      dom = pickDominantSession(sessions);
    } catch {}
    const cur = dom || s;
    const sinceMs = Date.parse(cur.since || "");
    // 与宠物窗共用同一套状态判定（shared/pack.js）
    const status = resolvePetStatus(cur.status || "sleep", sinceMs, Date.now(), manifestStates, paused);
    animator?.setStatus(status);
    statusEl.textContent = paused
      ? "已暂停 ⏸（点宠物或此处恢复）"
      : (STATUS_LABEL[baseStatusName(status)] || status) +
        (cur.detail ? ` · ${cur.detail}` : "");
    detailEl.textContent = `最近事件：${cur.last_event || "-"}`;
    sessionEl.textContent = `会话：${cur.session_id || "-"}`;
    const project = (cur.cwd || "").split(/[\\/]/).filter(Boolean).pop();
    projectEl.textContent = `项目：${project || "未知（还没有插件事件）"}`;
    renderSessions(sessions);
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
