// 宠物管理页：内置 + 外部包网格卡，点击即切换 + 加号添加自定义包
import { invoke, listen } from "../shared/api.js";
import { loadBundledManifest, loadExternalByDir } from "../shared/pack.js";

const grid = document.querySelector("#pets-grid");
let rendering = false; // 防重锁：render 中不响应第二次调用

export function bootPets() {
  render();
  listen("pet-changed", () => setTimeout(render, 50)); // 延迟一帧，让状态文件落盘
}

async function render() {
  if (rendering) return; // 并发锁
  rendering = true;
  try {
    const pets = await invoke("list_all_pets");

    // 前端层去重（按名字，保留先出现的）
    const seen = new Set();
    const unique = pets.filter((p) => seen.has(p.name) ? false : (seen.add(p.name), true));

    grid.innerHTML = "";

    for (const p of unique) {
      const card = document.createElement("div");
      card.className = "pet-card" + (p.active ? " on" : "");
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      card.appendChild(canvas);
      const label = document.createElement("div");
      label.textContent = p.name;
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.textContent = (p.source === "bundled" ? "内置" : "外部") + (p.active ? " · 使用中" : "");
      card.appendChild(label);
      card.appendChild(tag);
      card.onclick = async () => {
        if (p.active) return;
        await invoke("set_pet_pref_cmd", { name: p.name });
      };
      grid.appendChild(card);

      // 预览图（内置走 public/pets，外部走 asset protocol）
      try {
        const pack = p.source === "bundled"
          ? await loadBundledManifest(p.name)
          : p.dir ? await loadExternalByDir(p.dir) : null;
        if (pack) {
          const atlas = new Image();
          atlas.onload = () => {
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, 96, 96);
            ctx.drawImage(atlas, 0, 0, pack.manifest.frame.w, pack.manifest.frame.h, 0, 0, 96, 96);
          };
          atlas.src = pack.atlasUrl;
        }
      } catch (err) {
        console.warn(`${p.name} 预览加载失败:`, err);
      }
    }

    // 加号卡片（固定只加一次）
    const addCard = document.createElement("div");
    addCard.className = "pet-card add-card";
    addCard.innerHTML = '<div class="add-icon">＋</div><div>添加自定义宠物</div><div class="tag">放入 atlas.png + pet.json</div>';
    addCard.onclick = async () => {
      try {
        const dir = await invoke("get_pets_dir");
        await invoke("open_local_dir", { dir });
      } catch (err) {
        console.warn("打开宠物目录失败:", err);
      }
    };
    grid.appendChild(addCard);
  } catch (err) {
    grid.textContent = "加载失败：" + String(err);
  } finally {
    rendering = false;
  }
}
