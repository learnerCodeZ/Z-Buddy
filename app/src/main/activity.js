// 活动页：events.jsonl 时间线 + 类型/项目/会话筛选
import { invoke } from "../shared/api.js";

const listEl = document.querySelector("#act-list");
const filtersEl = document.querySelector("#act-filters");
const FILTERS = ["全部", "PreToolUse", "PostToolUse", "PostToolUseFailure", "Stop"];
let current = "全部";
let currentProject = "";
let currentSession = "";

export function bootActivity() {
  // 第一行：事件类型筛选
  const typeRow = document.createElement("div");
  typeRow.className = "act-filter-row";
  FILTERS.forEach((f) => {
    const btn = document.createElement("button");
    btn.textContent = f;
    btn.className = f === current ? "on" : "";
    btn.onclick = () => {
      current = f;
      typeRow.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      render();
    };
    typeRow.appendChild(btn);
  });
  filtersEl.appendChild(typeRow);

  // 第二行：项目 / 会话下拉（候选来自全量事件去重，event_facets）
  const selectRow = document.createElement("div");
  selectRow.className = "act-filter-row";
  const selProject = document.createElement("select");
  const selSession = document.createElement("select");
  selProject.onchange = () => {
    currentProject = selProject.value;
    render();
  };
  selSession.onchange = () => {
    currentSession = selSession.value;
    render();
  };
  selectRow.append(selProject, selSession);
  filtersEl.appendChild(selectRow);

  invoke("event_facets")
    .then((f) => {
      const fill = (sel, allLabel, items, cur) => {
        sel.innerHTML = "";
        const all = document.createElement("option");
        all.value = "";
        all.textContent = allLabel;
        sel.appendChild(all);
        items.forEach(({ value, label }) => {
          const o = document.createElement("option");
          o.value = value;
          o.textContent = label;
          sel.appendChild(o);
        });
        sel.value = cur;
      };
      fill(selProject, "全部项目", (f.projects || []).map((v) => ({ value: v, label: v })), currentProject);
      fill(
        selSession,
        "全部会话",
        (f.sessions || []).map((v) => ({ value: v, label: v.slice(0, 10) + "…" })),
        currentSession,
      );
    })
    .catch(() => {});

  render();
  setInterval(render, 2000);
}

async function render() {
  try {
    const evs = await invoke("read_events", {
      limit: 200,
      project: currentProject || null,
      session: currentSession || null,
    });
    const items = evs.items.filter((e) => current === "全部" || e.event === current);
    listEl.innerHTML = items
      .map((e) => {
        const t = (e.ts_local || e.ts || "").slice(11, 19);
        const preview = e.preview ? ` — ${e.preview}` : "";
        const interrupt = e.is_interrupt ? " ⚡被打断" : "";
        const proj = e.project ? ` [${e.project}]` : "";
        const cu = e.computer_use ? " 🖥" : "";
        return `<li><b>${t}</b> <b>${e.event}</b>${e.tool ? " · " + e.tool : ""}${proj}${cu}${interrupt}${preview}</li>`;
      })
      .join("");
    if (!items.length) listEl.innerHTML = '<li class="hint">暂无事件——装好 z-buddy 插件并让 ZCode 干个活试试。</li>';
  } catch (err) {
    listEl.innerHTML = "<li>读取失败：" + String(err) + "</li>";
  }
}
