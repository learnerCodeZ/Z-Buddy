// 宠物管理页：内置 + 外部包网格卡（hover 播放动画）+ 文件夹导入自定义包
import { invoke, listen, dialog } from "../shared/api.js";
import { loadBundledManifest, loadExternalByDir, SpriteAnimator } from "../shared/pack.js";

const grid = document.querySelector("#pets-grid");
let rendering = false; // 防重锁：render 中不响应第二次调用

export function bootPets() {
  render();
  listen("pet-changed", () => setTimeout(render, 50)); // 延迟一帧，让状态文件落盘
}

/** 轻量提示条（导入成功/失败反馈），2.6 秒自动消失 */
function toast(msg) {
  document.querySelector(".pet-toast")?.remove();
  const el = document.createElement("div");
  el.className = "pet-toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
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

      // 预览：静态第一帧，hover 时播放 idle 动画（用与宠物窗同一套 SpriteAnimator）
      try {
        const pack = p.source === "bundled"
          ? await loadBundledManifest(p.name)
          : p.dir ? await loadExternalByDir(p.dir) : null;
        if (pack) {
          const atlas = new Image();
          atlas.onload = () => {
            const drawFirst = () => {
              const ctx = canvas.getContext("2d");
              ctx.imageSmoothingEnabled = false;
              ctx.clearRect(0, 0, 96, 96);
              ctx.drawImage(atlas, 0, 0, pack.manifest.frame.w, pack.manifest.frame.h, 0, 0, 96, 96);
            };
            drawFirst();
            const animator = new SpriteAnimator(canvas, atlas, pack.manifest);
            animator.setStatus("idle");
            card.addEventListener("mouseenter", () => animator.start());
            card.addEventListener("mouseleave", () => {
              animator.stop();
              drawFirst();
            });
          };
          atlas.src = pack.atlasUrl;
        }
      } catch (err) {
        console.warn(`${p.name} 预览加载失败:`, err);
      }
    }

    // 加号卡片：选文件夹 → 校验导入 → 刷新（替代旧的"打开目录手动放"）
    const addCard = document.createElement("div");
    addCard.className = "pet-card add-card";
    addCard.innerHTML =
      '<div class="add-icon">＋</div><div>导入自定义宠物</div><div class="tag">选择含 atlas.png + pet.json 的文件夹</div>';
    addCard.onclick = async () => {
      try {
        const picked = await dialog.open({
          directory: true,
          multiple: false,
          title: "选择宠物包文件夹（含 atlas.png 与 pet.json）",
        });
        if (!picked) return; // 用户取消
        const name = await invoke("import_pet_from_dir", { source: picked });
        toast(`✓ 已导入「${name}」，点击卡片即可使用`);
        await render();
      } catch (err) {
        toast("导入失败：" + String(err));
      }
    };
    grid.appendChild(addCard);
  } catch (err) {
    grid.textContent = "加载失败：" + String(err);
  } finally {
    rendering = false;
  }
}
