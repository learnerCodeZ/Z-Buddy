// 宠物包加载器（hatch-pet 兼容：atlas.png + pet.json，行=状态，横向分帧）
// 加载优先级：外部包（~/.z-buddy/pets/<pref>/）→ 内置宠物（默认夜羽 yoru）
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

/** 内置宠物（yoru/mochi/bsod/fireball，atlas 在 /pets/<名>/ 下，dev 模式由 vite serve） */
export async function loadBundledManifest(name = "yoru") {
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

/** 按偏好加载：内置名字优先走 loadBundledManifest，其余先尝试外部包，失败回退内置 */
export async function loadPackByPref(pref) {
  const BUNDLED = ["yoru", "mochi", "bsod", "fireball"];
  if (BUNDLED.includes(pref)) {
    return loadBundledManifest(pref);
  }
  // 外部包
  const ext = await loadExternalManifest(pref);
  if (ext) return ext;
  // 失败回退默认
  return loadBundledManifest("yoru");
}

/**
 * 拖动方向 → 游动行（长按拖动时的朝向）：
 *   向左（含左上/左下）与**正上方** → drag_left；其余（含向右、正下方）→ drag_right。
 * 调用方已按累计位移过滤，这里只做方向分类；无法判定时保持 current。
 */
export function pickDragState(dx, dy, current = null) {
  if (dx < 0) return "drag_left";
  if (dx > 0) return "drag_right";
  if (dy < 0) return "drag_left"; // 正上方
  if (dy > 0) return "drag_right"; // 正下方
  return current;
}

/** 待机超过多久算睡着（用户要求 5 分钟） */
export const IDLE_SLEEP_MS = 5 * 60 * 1000;

/**
 * 待机超时 → 睡觉：状态是 idle 且已持续超过 thresholdMs 时返回 "sleep"。
 * sinceMs 取 state.json 的 since（进状态的时间），无效时传 null（保持原状态）。
 */
export function withIdleSleep(status, sinceMs, nowMs, thresholdMs = IDLE_SLEEP_MS) {
  if (status !== "idle") return status;
  if (!Number.isFinite(sinceMs)) return status;
  return nowMs - sinceMs >= thresholdMs ? "sleep" : status;
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
