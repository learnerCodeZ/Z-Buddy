// 活动页：events.jsonl 时间线 + 类型筛选
import { invoke } from "../shared/api.js";

const listEl = document.querySelector("#act-list");
const filtersEl = document.querySelector("#act-filters");
const FILTERS = ["全部", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"];
let current = "全部";

export function bootActivity() {
  FILTERS.forEach((f) => {
    const btn = document.createElement("button");
    btn.textContent = f;
    btn.className = f === current ? "on" : "";
    btn.onclick = () => {
      current = f;
      filtersEl.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      render();
    };
    filtersEl.appendChild(btn);
  });
  render();
  setInterval(render, 2000);
}

async function render() {
  try {
    const evs = await invoke("read_events", { limit: 200 });
    const items = evs.items.filter((e) => current === "全部" || e.event === current);
    listEl.innerHTML = items
      .map((e) => {
        const t = (e.ts || "").slice(11, 19);
        const preview = e.preview ? ` — ${e.preview}` : "";
        const interrupt = e.is_interrupt ? " ⚡被打断" : "";
        return `<li><b>${t}</b> <b>${e.event}</b>${e.tool ? " · " + e.tool : ""}${interrupt}${preview}</li>`;
      })
      .join("");
    if (!items.length) listEl.innerHTML = '<li class="hint">暂无事件——装好 z-buddy 插件并让 ZCode 干个活试试。</li>';
  } catch (err) {
    listEl.innerHTML = "<li>读取失败：" + String(err) + "</li>";
  }
}
