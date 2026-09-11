#!/usr/bin/env node
/**
 * 夜羽图集构建器（姿势合成 + 气泡系统）
 * ---------------------------------------------------------------
 * 与通用工具 gen_illustration_pet.mjs 的分工：
 *   - gen_illustration_pet.mjs：一张立绘 → 图集（通用，别的宠物也用）
 *   - 本工具：夜羽专用 —— 把多张"姿势图"合成 8 行状态动画，并叠加气泡队列
 *
 * 行结构（frame 192×192，图集 6 列 × 8 行）：
 *   0 idle      站姿 A/B 交替 + 呼吸（图1-1、图2-1）
 *   1 working   旧立绘的蹦跳（yoru.png，未指定状态，保持原样）
 *   2 error     旧立绘的抖动 + 去色（yoru.png，未指定状态，保持原样）
 *   3 sleep     睡姿（图2-2）+ 头顶 Z 气泡：3 个、上下排列、依次出现、第四个顶掉最早的
 *   4 drag_left  天鹅形象（水平镜像）
 *   5 drag_right 天鹅形象
 *   6 thinking  思考姿势 A/B 交替（图1-3、图2-3）+ 头旁 "?" 气泡：3 个、并排、同上队列
 *   7 paused    蜷缩姿势（图3-2）+ 头顶"暂停"气泡
 *
 * 用法：
 *   node app/tools/gen_yoru_atlas.mjs <输出目录> [--frame 192]
 *     源图固定从 app/tools/source/ 下取（见 FILES）。
 */

import fs from "node:fs";
import path from "node:path";
import {
  decodePNG,
  encodePNG,
  keyWhiteBackground,
  alphaBBox,
  crop,
  resizeArea,
  renderFrame,
  boxDown,
  gradeError,
  alphaOver,
  mirrorKeepUpright,
  parseRegions,
} from "./gen_illustration_pet.mjs";

const FRAME = 192;
const SS = 4;
const SIZE = FRAME * SS;
const PAD_BOTTOM = 6;
const COLS = 6;
const ROWS = 11;
const POSE_H = 140; // 各状态行的角色高度（帧内像素）——留出上方气泡空间
const SLEEP_TOP_CUT_SRC = 76; // 睡姿自带 Z 的高度（源图行数），从基准图顶部切掉
// 思考姿势里曾做过"手部左右微动"，按用户要求**已关闭**（提交 c8cb2f3 里可找回实现）

const SRC = "app/tools/source";
const FILES = {
  idleA: `${SRC}/yoru-pose1.png`, // 图1：站姿 / 睡姿 / 思考
  idleB: `${SRC}/yoru-pose2.png`, // 图2
  pause: `${SRC}/yoru-pose3.png`, // 图3
  thinkQ: `${SRC}/yoru-pose4.png`, // 图4（含 "?" 字形）
  err: `${SRC}/yoru-err.png`, // 出错：举红叉按钮（亮/暗两张）
  typing: `${SRC}/yoru-type.png`, // 干活：敲键盘（3 张）
  perm: `${SRC}/yoru-perm.png`, // 审批：举"请审批"牌子（左倾/右倾两张）
  swan: `${SRC}/yoru-drag.png`, // 天鹅拖动形象
};

// 天鹅镜像时需要保持正字的字形矩形（源图坐标，实测）
const SWAN_UPRIGHT = "683,0,838,148;697,148,762,178;686,712,744,768";

// ============================ 基础工具 ============================

/** 深色连通块 */
function darkBlobs(img, { darkMax = 130, minArea = 300 } = {}) {
  const { w, h, rgba } = img;
  const dark = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const o = p * 4;
    dark[p] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2] < darkMax ? 1 : 0;
  }
  const seen = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  const out = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (!dark[p0] || seen[p0]) continue;
    let qh = 0;
    let qt = 0;
    let n = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    q[qt++] = p0;
    seen[p0] = 1;
    while (qh < qt) {
      const p = q[qh++];
      const x = p % w;
      const y = (p / w) | 0;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (dark[np] && !seen[np]) {
            seen[np] = 1;
            q[qt++] = np;
          }
        }
    }
    if (n >= minArea) out.push({ n, x0, y0, x1, y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
  }
  return out;
}

function eraseRect(img, r) {
  for (let y = Math.max(0, r.y0); y < Math.min(img.h, r.y1); y++)
    for (let x = Math.max(0, r.x0); x < Math.min(img.w, r.x1); x++) img.rgba[(y * img.w + x) * 4 + 3] = 0;
}

/** 一张姿势图 → N 个姿势（2 或 3 个；剔除底部标签带，按本体中心分区） */
function sheetPoses(img) {
  const { w, h, rgba } = img;
  const A = (x, y) => rgba[(y * w + x) * 4 + 3];
  const blobs = darkBlobs(img);
  // 底部标签带：这些图的标签都在最底部（浅色文字 + 深色底），
  // 直接整条切掉最稳（角色脚底约在 93% 高度处，不会误伤）
  const bandTop = Math.round(h * 0.937);
  eraseRect(img, { x0: 0, y0: bandTop, x1: w, y1: h });
  const pills = blobs.filter((b) => b.bw / b.bh > 3 && b.bh < h * 0.12 && b.n > 800);
  if (pills.length) console.log(`  （切掉底部标签带 y≥${bandTop}，命中 ${pills.length} 条标签）`);
  const bodies = blobs
    .filter((b) => !pills.includes(b) && b.n > 40000 && b.bw / b.bh < 3)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1));
  // 分区锚点优先用"顶部 40%（头部区域）的列剖面"：底部键盘/道具粘成一片也能正确切开；
  // 头部区域至少要 2 段，否则退回"深色大块"的老办法
  const topH = Math.round(h * 0.4);
  const has = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = 0; y < topH; y++) if (A(x, y) > 20) c++;
    has[x] = c >= 3 ? 1 : 0;
  }
  const raw = [];
  let s0 = -1;
  for (let x = 0; x <= w; x++) {
    const v = x < w ? has[x] : 0;
    if (v && s0 < 0) s0 = x;
    else if (!v && s0 >= 0) {
      raw.push([s0, x]);
      s0 = -1;
    }
  }
  const mergedBands = [];
  for (const b of raw) {
    const last = mergedBands[mergedBands.length - 1];
    if (last && b[0] - last[1] < w * 0.03) last[1] = b[1];
    else mergedBands.push([...b]);
  }
  const headBands = mergedBands.filter(([a, b]) => b - a > w * 0.05).slice(0, 3);
  // 优先用"深色大块"（站姿/举牌这类能分开）；它少于 2 个时才退回头部剖面
  // （敲键盘那种底部道具粘成一片的情况）
  const useHeads = bodies.length < 2 && headBands.length >= 2;
  if (useHeads) console.log(`  （深色本体粘连，改用头部区域列剖面分区：${headBands.length} 段）`);
  const centers = useHeads
    ? headBands.map(([a, b]) => (a + b) / 2)
    : bodies.map((b) => (b.x0 + b.x1) / 2);
  const n = centers.length;
  if (n < 2) throw new Error(`姿势图只找到 ${n} 个本体（预期 2~3 个）`);
  const poses = [];
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? 0 : Math.round((centers[i] + centers[i - 1]) / 2);
    const right = i === n - 1 ? w : Math.round((centers[i] + centers[i + 1]) / 2);
    let bx0 = right;
    let by0 = h;
    let bx1 = left;
    let by1 = 0;
    for (let y = 0; y < h; y++)
      for (let x = left; x < right; x++) {
        if (A(x, y) <= 20) continue;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    poses.push({ box: { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 }, body: bodies[i] });
  }
  return poses;
}

/** 姿势 → 基准图（统一角色高度；顺手去掉裁剪框边缘被切进来的邻姿势残渣） */
function poseBase(img, box, heightPx = POSE_H) {
  const c = crop(img, box.x0, box.y0, box.x1, box.y1);
  const h = Math.round(heightPx * SS);
  const w = Math.max(1, Math.round((c.w * h) / c.h));
  const base = resizeArea(c, w, h);
  const dropped = dropEdgeSpecks(base);
  if (dropped) console.log(`  （清掉 ${dropped} 处贴边残渣/白线）`);
  return base;
}

/** 把一张字形素材缩放到目标大小，并按 alpha 系数贴进帧缓冲 */
function stamp(frame, glyph, { x, y, size, alpha = 1 }) {
  const h = Math.max(1, Math.round(size * SS));
  const w = Math.max(1, Math.round((glyph.w * h) / glyph.h));
  const g = resizeArea(glyph, w, h);
  if (alpha < 1) {
    for (let i = 3; i < g.rgba.length; i += 4) g.rgba[i] = Math.round(g.rgba[i] * alpha);
  }
  alphaOver(frame, SIZE, g, Math.round(x * SS - w / 2), Math.round(y * SS - h / 2));
}

/** 去掉"贴着裁剪框边缘的细小白点/白线"——那是相邻姿势被切进来的残渣 */
function dropEdgeSpecks(img, { maxAreaRatio = 0.03, edgeBand = 0.05 } = {}) {
  const { w, h, rgba } = img;
  const seen = new Uint8Array(w * h);
  const st = [];
  const comps = [];
  for (let p0 = 0; p0 < w * h; p0++) {
    if (seen[p0] || rgba[p0 * 4 + 3] <= 20) continue;
    st.length = 0;
    st.push(p0);
    seen[p0] = 1;
    let n = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    while (st.length) {
      const p = st.pop();
      const x = p % w;
      const y = (p / w) | 0;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (!seen[np] && rgba[np * 4 + 3] > 20) {
          seen[np] = 1;
          st.push(np);
        }
      }
    }
    comps.push({ n, x0, y0, x1, y1, bw: x1 - x0 + 1, bh: y1 - y0 + 1 });
  }
  if (!comps.length) return 0;
  const main = comps.reduce((a, b) => (b.n > a.n ? b : a));
  const band = w * edgeBand;
  let removed = 0;
  for (const c of comps) {
    if (c === main) continue;
    const small = c.n < main.n * maxAreaRatio;
    const atEdge = c.x1 < band || c.x0 > w - band;
    const thinTall = c.bh >= c.bw * 1.5;
    if (small && atEdge && thinTall) {
      // 擦掉该连通块（连同 2px 膨胀余量）
      for (let y = Math.max(0, c.y0 - 2); y <= Math.min(h - 1, c.y1 + 2); y++)
        for (let x = Math.max(0, c.x0 - 2); x <= Math.min(w - 1, c.x1 + 2); x++) {
          const o = (y * w + x) * 4;
          rgba[o + 3] = 0;
        }
      removed++;
    }
  }
  return removed;
}

/** 把"?"做成和头顶 Z 一样的样式：白色实心 + 深色描边 */
function outlineGlyph(glyph, { outlinePx = 4, dark = [0x1d, 0x1b, 0x22], feather = 1.2 } = {}) {
  const { w, h, rgba } = glyph;
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = rgba[p * 4 + 3] > 40 ? 1 : 0;
  const out = new Uint8Array(w * h * 4);
  const r = Math.ceil(outlinePx);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const o = p * 4;
      if (mask[p]) {
        out[o] = out[o + 1] = out[o + 2] = 255; // 白色实心
        out[o + 3] = 255;
        continue;
      }
      // 距最近字形像素的距离（小图直接搜邻域就够）
      let best = Infinity;
      for (let dy = -r; dy <= r && best > 0; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (!mask[ny * w + nx]) continue;
          const d = Math.hypot(dx, dy);
          if (d < best) best = d;
        }
      if (best <= outlinePx + feather) {
        const a = best <= outlinePx ? 1 : Math.max(0, (outlinePx + feather - best) / feather);
        out[o] = dark[0];
        out[o + 1] = dark[1];
        out[o + 2] = dark[2];
        out[o + 3] = Math.round(255 * a);
      }
    }
  return { w, h, rgba: out };
}

/** 提亮字形（素材里的 "?" 偏灰，深色桌面上不够醒目） */
function brighten(glyph, gain = 1.35, lift = 20) {
  const out = { w: glyph.w, h: glyph.h, rgba: new Uint8Array(glyph.rgba.length) };
  for (let i = 0; i < glyph.rgba.length; i += 4) {
    for (let k = 0; k < 3; k++) out.rgba[i + k] = Math.min(255, Math.round(glyph.rgba[i + k] * gain + lift));
    out.rgba[i + 3] = glyph.rgba[i + 3];
  }
  return out;
}

/** 程序绘制"暂停"字形：白色双竖条 + 深色描边（与 Z/? 的描边风格一致） */
function drawPauseGlyph(w = 58, h = 64) {
  const rgba = new Uint8Array(w * h * 4);
  const r = 7;
  const barW = 14;
  const gap = 10;
  const top = 6;
  const bot = h - 6;
  const bars = [-1, 1].map((s) => ({
    cx: w / 2 + s * (gap / 2 + barW / 2),
    cy: (top + bot) / 2,
    hx: barW / 2,
    hy: (bot - top) / 2,
  }));
  const sdf = (px, py, b) => {
    const dx = Math.abs(px - b.cx) - (b.hx - r);
    const dy = Math.abs(py - b.cy) - (b.hy - r);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
  };
  const OUT = 4;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.min(sdf(x + 0.5, y + 0.5, bars[0]), sdf(x + 0.5, y + 0.5, bars[1]));
      const o = (y * w + x) * 4;
      if (d <= 0) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = 255;
        rgba[o + 3] = 255;
      } else if (d <= OUT) {
        const a = Math.min(1, OUT - d);
        rgba[o] = 0x1d;
        rgba[o + 1] = 0x1b;
        rgba[o + 2] = 0x22;
        rgba[o + 3] = Math.round(255 * a);
      }
    }
  return { w, h, rgba };
}

/** 气泡队列：count 个固定槽位，按阶段依次淡入淡出（第 count+1 个出现时最早的已消失） */
function bubblesAt(count, k, nFrames, slots, { rise = 3 } = {}) {
  const out = [];
  for (let j = 0; j < count; j++) {
    const p = ((k / nFrames + j / count) % 1 + 1) % 1;
    const alpha = p < 0.25 ? p / 0.25 : p > 0.75 ? (1 - p) / 0.25 : 1;
    const pop = 0.8 + 0.2 * Math.min(1, p / 0.25);
    const slot = slots[j];
    out.push({ x: slot.x, y: slot.y - rise * p, alpha: Math.max(0, Math.min(1, alpha)), pop });
  }
  return out;
}

/** 呼吸参数（6 帧平滑循环） */
const breath = (k, n = COLS, amp = 2.5) => {
  const w = (1 - Math.cos((2 * Math.PI * k) / n)) / 2;
  return { dy: -amp * w, sx: 1 + 0.012 * w, sy: 1 - 0.013 * w };
};

// ============================ 主流程 ============================

function main() {
  const args = process.argv.slice(2);
  const outDir = args.find((a) => !a.startsWith("--")) || "app/src/pets/yoru";
  const atlas = { w: FRAME * COLS, h: FRAME * ROWS, rgba: new Uint8Array(FRAME * COLS * FRAME * ROWS * 4) };

  const putFrame = (row, col, raw, { error = false } = {}) => {
    const f = boxDown(raw, SIZE, SS);
    if (error) gradeError(f.rgba);
    for (let y = 0; y < FRAME; y++) {
      const dst = ((row * FRAME + y) * atlas.w + col * FRAME) * 4;
      atlas.rgba.set(f.rgba.subarray(y * FRAME * 4, (y + 1) * FRAME * 4), dst);
    }
  };
  const render = (base, p = {}, extra) => {
    const raw = renderFrame(base, p, { size: SIZE, ss: SS, bottom: SIZE - PAD_BOTTOM * SS });
    if (extra) extra(raw);
    return raw;
  };

  // ---------- 1) 姿势图 ----------
  const sheets = {};
  for (const key of ["idleA", "idleB", "pause", "thinkQ", "err", "typing", "perm"]) {
    const img = decodePNG(fs.readFileSync(FILES[key]));
    keyWhiteBackground(img, { bgMin: 250 });
    sheets[key] = { img, poses: sheetPoses(img) };
    console.log(
      `${FILES[key].split("/").pop()}: 切出 ${sheets[key].poses.length} 个姿势 ` +
        sheets[key].poses.map((p) => `${p.box.x1 - p.box.x0}×${p.box.y1 - p.box.y0}`).join(" / "),
    );
  }

  // 气泡字形素材：Z（从图2 睡姿头顶取）、?（从图4 思考姿势头旁取）
  const zGlyphSource = sheets.idleB.img; // 图2
  const zGlyph = crop(zGlyphSource, 806, 70, 886, 156);
  const qGlyph = outlineGlyph(crop(sheets.thinkQ.img, 1428, 100, 1472, 178));
  const pauseGlyph = drawPauseGlyph();
  console.log(`气泡字形: Z ${zGlyph.w}×${zGlyph.h}, ? ${qGlyph.w}×${qGlyph.h}, 暂停 ${pauseGlyph.w}×${pauseGlyph.h}（程序绘制）`);

  // ---------- 2) working / error / permission：各用专门的姿势图 ----------
  {
    // working（干活中）：3 张敲键盘姿势循环 → 手指敲键盘的动效
    const typing = sheets.typing.poses;
    const bases = typing.map((p) => poseBase(sheets.typing.img, p.box));
    for (let k = 0; k < bases.length; k++) putFrame(1, k, render(bases[k], {}));
    console.log(
      `working: ${bases.length} 张敲键盘姿势循环，fps 8（每个姿势 ${(1000 / 8).toFixed(0)}ms，一轮 ${((bases.length * 1000) / 8).toFixed(0)}ms）`,
    );

    // error（出错了）：红灯亮/暗两张交替 → 0.5 秒一次闪烁
    const errBases = sheets.err.poses.map((p) => poseBase(sheets.err.img, p.box));
    for (let k = 0; k < errBases.length; k++) putFrame(2, k, render(errBases[k], {}));
    console.log(`error: 红灯亮/暗交替，fps 2（每 500ms 闪一次）`);

    // permission（等你审批）：牌子左倾/右倾两张交替 → 0.5 秒一次摇晃
    const permBases = sheets.perm.poses.map((p) => poseBase(sheets.perm.img, p.box));
    for (let k = 0; k < permBases.length; k++) putFrame(10, k, render(permBases[k], {}));
    console.log(`permission: 牌子左右摇，fps 2（每 500ms 换边）`);
  }

  // ---------- 3) idle：两张站姿各占一行（运行期每 30 秒换一行）----------
  {
    const A = poseBase(sheets.idleA.img, sheets.idleA.poses[0].box);
    const B = poseBase(sheets.idleB.img, sheets.idleB.poses[0].box);
    for (let k = 0; k < COLS; k++) {
      putFrame(0, k, render(A, breath(k)));
      putFrame(8, k, render(B, breath(k)));
    }
    console.log(`idle: 两张站姿各一行（row0 / row8），运行期每 30 秒切换（${A.w}×${A.h} / ${B.w}×${B.h}）`);
  }

  // ---------- 4) thinking：两张思考姿势各一行 + "?" 气泡（手部动效已按用户要求关闭）----------
  {
    const A = poseBase(sheets.idleA.img, sheets.idleA.poses[2].box);
    const B = poseBase(sheets.idleB.img, sheets.idleB.poses[2].box);
    // 姿势自带一个 Z（在头顶偏右），所以 "?" 排在**左上**，别和它挤在一起
    const slots = [
      { x: 26, y: 30 },
      { x: 56, y: 30 },
      { x: 86, y: 30 },
    ];
    for (let k = 0; k < COLS; k++) {
      const b = breath(k, COLS, 2.2);
      for (const [row, base] of [
        [6, A],
        [9, B],
      ]) {
        putFrame(
          row,
          k,
          render(base, b, (raw) => {
            for (const bb of bubblesAt(3, k, COLS, slots, { rise: 2 })) {
              if (bb.alpha > 0.01) stamp(raw, qGlyph, { x: bb.x, y: bb.y, size: 24 * bb.pop, alpha: bb.alpha });
            }
          }),
        );
      }
    }
    console.log(`thinking: 两张思考姿势各一行（row6 / row9，每 30 秒切换）+ "?" 气泡（无手部动效）`);
  }

  // ---------- 5) sleep：睡姿 + Z 气泡（上下 3 个）----------
  {
    const src = sheets.idleB.img;
    const pose = sheets.idleB.poses[1];
    // 睡姿自带一个 Z（含卷尾），直接从基准图顶部按源图行数切掉，
    // 免得和新气泡撞在一起；切多少要换算到缩放后的基准图坐标。
    let base = poseBase(src, pose.box);
    const cutScaled = Math.round((SLEEP_TOP_CUT_SRC * base.h) / (pose.box.y1 - pose.box.y0));
    base = crop(base, 0, cutScaled, base.w, base.h);
    const slots = [
      { x: 146, y: 42 },
      { x: 146, y: 26 },
      { x: 146, y: 10 },
    ];
    for (let k = 0; k < COLS; k++) {
      putFrame(
        3,
        k,
        render(base, breath(k, COLS, 2.0), (raw) => {
          for (const b of bubblesAt(3, k, COLS, slots)) {
            if (b.alpha > 0.01) stamp(raw, zGlyph, { x: b.x, y: b.y, size: 15 * b.pop, alpha: b.alpha });
          }
        }),
      );
    }
    console.log(`sleep: 睡姿（顶部切掉 ${SLEEP_TOP_CUT_SRC} 源行 = ${cutScaled} 基准行，去掉自带 Z）+ Z 气泡（上下 3 个）`);
  }

  // ---------- 6) paused：蜷缩姿势 + "暂停"气泡 ----------
  {
    const img = sheets.pause.img;
    const pose = sheets.pause.poses[1];
    const base = poseBase(img, pose.box);
    for (let k = 0; k < COLS; k++) {
      const b = breath(k, COLS, 1.6);
      const pulse = 0.85 + 0.15 * ((1 + Math.cos((2 * Math.PI * k) / COLS)) / 2);
      putFrame(
        7,
        k,
        render(base, b, (raw) => {
          stamp(raw, pauseGlyph, { x: 96, y: 24 - 1.5 * (1 - pulse), size: 19, alpha: 1 });
        }),
      );
    }
    console.log(`paused: 蜷缩姿势 + 暂停气泡`);
  }

  // ---------- 7) drag：天鹅形象（缩到原来的一半）----------
  {
    const swan = decodePNG(fs.readFileSync(FILES.swan));
    keyWhiteBackground(swan, { bgMin: 250 });
    const box = alphaBBox(swan);
    const mask = mirrorKeepUpright(swan, parseRegions(SWAN_UPRIGHT));
    const mbox = { x0: swan.w - box.x1, y0: box.y0, x1: swan.w - box.x0, y1: box.y1 };
    const half = 0.5; // 用户要求：小到原来的一半
    const mk = (im, b) => {
      const c = crop(im, b.x0, b.y0, b.x1, b.y1);
      const h = Math.round(FRAME * 0.92 * half * SS);
      return resizeArea(c, Math.max(1, Math.round((c.w * h) / c.h)), h);
    };
    const right = mk(swan, box);
    const left = mk(mask, mbox);
    for (let k = 0; k < 1; k++) {
      putFrame(4, k, render(left));
      putFrame(5, k, render(right));
    }
    console.log(`drag: 天鹅 ${right.w}×${right.h}（原 177px → ${Math.round(right.h / SS)}px，一半）`);
  }

  // ---------- 8) 写盘 ----------
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "atlas.png"), encodePNG(atlas));
  const manifest = {
    name: "yoru",
    title: "夜羽",
    version: "1.1.0",
    author: "Z-Buddy",
    license: "original-artwork",
    frame: { w: FRAME, h: FRAME },
    states: {
      idle: { row: 0, frames: COLS, fps: 4 },
      working: { row: 1, frames: 3, fps: 8 }, // 3 张敲键盘姿势循环（125ms/张）
      error: { row: 2, frames: 2, fps: 2 }, // 红灯亮/暗，500ms 一闪
      sleep: { row: 3, frames: COLS, fps: 5 },
      drag_left: { row: 4, frames: 1, fps: 1 },
      drag_right: { row: 5, frames: 1, fps: 1 },
      thinking: { row: 6, frames: COLS, fps: 5 },
      paused: { row: 7, frames: COLS, fps: 4 },
      // 运行期每 30 秒切换的第二张形象（见 shared/pack.js 的 withPoseAlternate）
      idle_alt: { row: 8, frames: COLS, fps: 4 },
      thinking_alt: { row: 9, frames: COLS, fps: 5 },
      permission: { row: 10, frames: 2, fps: 2 }, // 牌子左右摇，500ms 换边
    },
  };
  fs.writeFileSync(path.join(outDir, "pet.json"), JSON.stringify(manifest, null, 2) + "\n");
  const kb = (fs.statSync(path.join(outDir, "atlas.png")).size / 1024).toFixed(0);
  console.log(`\n已生成: ${outDir}/atlas.png (${atlas.w}×${atlas.h}, ${kb} KB)`);
  console.log(
    `已生成: ${outDir}/pet.json（11 行；idle↔idle_alt / thinking↔thinking_alt 每 30 秒切换；` +
      `working 敲键盘 3 帧、error 红灯 2 帧、permission 摇牌 2 帧均为 500ms 级节奏）`,
  );
}

main();
