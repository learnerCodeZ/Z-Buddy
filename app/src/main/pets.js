// 宠物管理页：内置 + 外部包网格卡，点击即切换 + 加号添加自定义包
import { convertFileSrc, invoke, listen } from "../shared/api.js";
import { loadBundledManifest } from "../shared/pack.js";

const grid = document.querySelector("#pets-grid");

export function bootPets() {
  render();
  listen("pet-changed", render); // 托盘/右键切换后同步高亮
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

      // 取清单与图集，画出 idle 第一帧
      const load = p.source === "bundled" ? loadBundledManifest() : loadExternal(p.dir);
      const pack = await load;
      const atlas = new Image();
      atlas.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const fw = pack.manifest.frame.w;
        const fh = pack.manifest.frame.h;
        ctx.clearRect(0, 0, 96, 96);
        ctx.drawImage(atlas, 0, 0, fw, fh, 0, 0, 96, 96);
      };
      atlas.src = pack.atlasUrl;
    }

    // 加号卡片：点击打开 ~/.z-buddy/pets/ 目录
    const addCard = document.createElement("div");
    addCard.className = "pet-card add-card";
    addCard.innerHTML = `
      <div class="add-icon">＋</div>
      <div>添加自定义宠物</div>
      <div class="tag">放入 atlas.png + pet.json</div>
    `;
    addCard.onclick = () => {
      const home = navigator.userAgent.includes("Windows")
        ? navigator.userAgent.match(/Users\\([^\\]+)/)?.[1] || "" : "";
      invoke("open_local_dir", { dir: `C:\\Users\\${home}\\.z-buddy\\pets` });
    };
    grid.appendChild(addCard);
  } catch (err) {
    grid.textContent = "加载失败：" + String(err);
  }
}

async function loadExternal(dir) {
  const manifest = await (await fetch(convertFileSrc(dir + "/pet.json"))).json();
  return { manifest, atlasUrl: convertFileSrc(dir + "/atlas.png") };
}
