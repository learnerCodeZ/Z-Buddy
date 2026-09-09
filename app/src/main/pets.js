// 宠物管理页：内置 + 外部包网格卡，点击即切换 + 加号添加自定义包
import { convertFileSrc, invoke, listen } from "../shared/api.js";
import { loadBundledManifest, loadExternalManifest } from "../shared/pack.js";

const grid = document.querySelector("#pets-grid");

export function bootPets() {
  render();
  listen("pet-changed", render);
}

async function render() {
  try {
    const pets = await invoke("list_all_pets");
    grid.innerHTML = "";

    for (const p of pets) {
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
        render();
      };
      grid.appendChild(card);

      // 加载宠物预览图
      try {
        let pack;
        if (p.source === "bundled") {
          pack = await loadBundledManifest(p.name);
        } else if (p.dir) {
          pack = await loadExternalByDir(p.dir);
        }
        if (pack) {
          const atlas = new Image();
          atlas.onload = () => {
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, 96, 96);
            const fw = pack.manifest.frame.w;
            const fh = pack.manifest.frame.h;
            ctx.drawImage(atlas, 0, 0, fw, fh, 0, 0, 96, 96);
          };
          atlas.src = pack.atlasUrl;
        }
      } catch (err) {
        console.warn(`${p.name} 预览加载失败:`, err);
      }
    }

    // 加号卡片：点击打开 ~/.z-buddy/pets/ 目录
    const addCard = document.createElement("div");
    addCard.className = "pet-card add-card";
    addCard.innerHTML = `
      <div class="add-icon">＋</div>
      <div>添加自定义宠物</div>
      <div class="tag">放入 atlas.png + pet.json</div>
    `;
    addCard.onclick = async () => {
      try {
        // 通过 Rust 命令获取 home 目录并打开
        const dir = await invoke("get_pets_dir");
        invoke("open_local_dir", { dir });
      } catch (err) {
        console.warn("打开宠物目录失败:", err);
      }
    };
    grid.appendChild(addCard);
  } catch (err) {
    grid.textContent = "加载失败：" + String(err);
  }
}
