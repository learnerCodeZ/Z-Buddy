// 宠物包加载器（hatch-pet 兼容：atlas.png + pet.json，行=状态，横向分帧）
// 加载优先级：外部包（~/.z-buddy/pets/<pref>/）→ 内置团子（mochi）
import { convertFileSrc, invoke } from "./api.js";

/** 读取外部包清单；找不到返回 null */
export async function loadExternalManifest(name) {
  try {
    const pets = await invoke("list_external_pets");
    const p = pets.find((x) => x.name === name);
    if (!p) return null;
    const manifest = await (await fetch(convertFileSrc(p.dir + "/pet.json"))).json();
    return {
      manifest,
      atlasUrl: convertFileSrc(p.dir + "/atlas.png"),
      source: "external",
      title: manifest.title || manifest.name,
    };
  } catch {
    return null;
  }
}

/** 内置宠物（mochi/bsod/fireball，atlas 在 /pets/<名>/ 下，dev 模式由 vite serve） */
export async function loadBundledManifest(name = "mochi") {
  const manifest = await (await fetch(`/pets/${name}/pet.json`)).json();
  return {
    manifest,
    atlasUrl: `/pets/${name}/atlas.png`,
    source: "bundled",
    title: manifest.title || manifest.name,
  };
}

/** 按目录加载外部包（list_all_pets 返回的 dir） */
export async function loadExternalByDir(dir) {
  const manifest = await (await fetch(convertFileSrc(`${dir}/pet.json`))).json();
  return {
    manifest,
    atlasUrl: convertFileSrc(`${dir}/atlas.png`),
    source: "external",
    title: manifest.title || manifest.name,
  };
}

/** 按偏好加载：pref 为 "mochi" 走内置，其余尝试外部包，失败回退内置 */
export async function loadPackByPref(pref) {
  if (pref && pref !== "mochi") {
    const ext = await loadExternalManifest(pref);
    if (ext) return ext;
  }
  return loadBundledManifest();
}

/** 精灵图动画器：bind 到 canvas，按状态名推帧（imageSmoothing 关闭保像素风） */
export class SpriteAnimator {
  constructor(canvas, atlas, manifest) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.atlas = atlas;
    this.manifest = manifest;
    this.col = 0;
    this.lastAt = 0;
    this.status = "idle";
  }

  setStatus(status) {
    if (this.manifest?.states?.[status]) this.status = status;
  }

  start() {
    const loop = (ts) => {
      if (this.atlas.complete && this.atlas.naturalWidth && this.manifest) {
        const st = this.manifest.states[this.status] || this.manifest.states.idle;
        if (ts - this.lastAt >= 1000 / (st.fps || 4)) {
          this.col = (this.col + 1) % st.frames;
          this.lastAt = ts;
        }
        const fw = this.manifest.frame.w;
        const fh = this.manifest.frame.h;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(
          this.atlas,
          this.col * fw,
          st.row * fh,
          fw,
          fh,
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        );
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
