// Z-Buddy 主界面：导航 + 各页装配
import { invoke, listen } from "../shared/api.js";
import { bootDashboard, refreshDashboard } from "./dashboard.js";
import { bootPets } from "./pets.js";
import { bootActivity } from "./activity.js";
import { bootSettings } from "./settings.js";

// ---- 侧栏页签 ----
document.querySelectorAll(".nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("on"));
    document.querySelector(`#page-${btn.dataset.page}`)?.classList.add("on");
  });
});

// ---- 标题栏 ----
document.querySelector("#tb-min").onclick = () => invoke("hide_main");
document.querySelector("#tb-close").onclick = () => window.close();

// ---- 装配各页 ----
bootDashboard();
bootPets();
bootActivity();
bootSettings();

// 宠物切换（托盘/宠物右键/宠物管理页）→ 总览大图同步
listen("pet-changed", () => refreshDashboard());
