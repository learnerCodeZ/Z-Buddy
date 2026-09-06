// 设置页：开机自启 / 关闭行为 / 关于
import { invoke } from "../shared/api.js";

export function bootSettings() {
  const autostartEl = document.querySelector("#set-autostart");
  const closeEl = document.querySelector("#set-close");

  invoke("autostart_enabled")
    .then((on) => (autostartEl.checked = !!on))
    .catch(() => (autostartEl.checked = false));

  autostartEl.onchange = async () => {
    const ok = await invoke("autostart_set", { on: autostartEl.checked });
    if (!ok) autostartEl.checked = !autostartEl.checked; // 失败回滚
  };

  invoke("get_close_behavior")
    .then((v) => (closeEl.value = v))
    .catch(() => (closeEl.value = "hide"));
  closeEl.onchange = () => invoke("set_close_behavior", { v: closeEl.value });

  document.querySelector("#lnk-repo").onclick = (e) => {
    e.preventDefault();
    invoke("open_external", { url: "https://github.com/learnerCodeZ/Z-Buddy" });
  };
  document.querySelector("#lnk-site").onclick = (e) => {
    e.preventDefault();
    invoke("open_external", { url: "https://learnercodez.github.io/Z-Buddy/" });
  };
}
