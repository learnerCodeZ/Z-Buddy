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
  rowCounts,
  alphaBBox,
  crop,
  findOrnamentSplit,
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
const ROWS = 8;
const POSE_H = 140; // 各状态行的角色高度（帧内像素）——留出上方气泡空间
const SLEEP_TOP_CUT_SRC = 76; // 睡姿自带 Z 的高度（源图行数），从基准图顶部切掉

const SRC = "app/tools/source";
const FILES = {
  legacy: `${SRC}/yoru.png`, // 旧立绘（working / error 行）
  idleA: `${SRC}/yoru-pose1.png`, // 图1：站姿 / 睡姿 / 思考
  idleB: `${SRC}/yoru-pose2.png`, // 图2
  pause: `${SRC}/yoru-pose3.png`, // 图3
  thinkQ: `${SRC}/yoru-pose4.png`, // 图4（含 "?" 字形）
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

/** 一张姿势图 → 3 个姿势（剔除底部标签条，按本体中心分区） */
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
  if (bodies.length < 3) throw new Error(`姿势图只找到 ${bodies.length} 个本体，预期 3 个`);
  const centers = bodies.map((b) => (b.x0 + b.x1) / 2);
  const poses = [];
  for (let i = 0; i < 3; i++) {
    const left = i === 0 ? 0 : Math.round((centers[i] + centers[i - 1]) / 2);
    const right = i === 2 ? w : Math.round((centers[i] + centers[i + 1]) / 2);
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

/** 姿势 → 基准图（统一角色高度，底部留白由渲染时处理） */
function poseBase(img, box, heightPx = POSE_H) {
  const c = crop(img, box.x0, box.y0, box.x1, box.y1);
  const h = Math.round(heightPx * SS);
  const w = Math.max(1, Math.round((c.w * h) / c.h));
  return resizeArea(c, w, h);
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
  for (const key of ["idleA", "idleB", "pause", "thinkQ"]) {
    const img = decodePNG(fs.readFileSync(FILES[key]));
    keyWhiteBackground(img, { bgMin: 250 });
    sheets[key] = { img, poses: sheetPoses(img) };
    console.log(
      `${FILES[key].split("/").pop()}: 切出 3 个姿势 ` +
        sheets[key].poses.map((p) => `${p.box.x1 - p.box.x0}×${p.box.y1 - p.box.y0}`).join(" / "),
    );
  }

  // 气泡字形素材：Z（从图2 睡姿头顶取）、?（从图4 思考姿势头旁取）
  const zGlyphSource = sheets.idleB.img; // 图2
  const zGlyph = crop(zGlyphSource, 806, 70, 886, 156);
  const qGlyph = brighten(crop(sheets.thinkQ.img, 1428, 100, 1472, 178));
  const pauseGlyph = drawPauseGlyph();
  console.log(`气泡字形: Z ${zGlyph.w}×${zGlyph.h}, ? ${qGlyph.w}×${qGlyph.h}, 暂停 ${pauseGlyph.w}×${pauseGlyph.h}（程序绘制）`);

  // ---------- 2) 旧立绘（working / error 行）----------
  {
    const legacy = decodePNG(fs.readFileSync(FILES.legacy));
    keyWhiteBackground(legacy);
    const counts = rowCounts(legacy);
    const bbox = alphaBBox(legacy);
    const split = findOrnamentSplit(counts, bbox);
    const bodyTop = split > bbox.y0 && split < bbox.y1 ? split : bbox.y0;
    const body = crop(legacy, bbox.x0, bodyTop, bbox.x1, bbox.y1);
    const h = Math.round(POSE_H * SS);
    const base = resizeArea(body, Math.max(1, Math.round((body.w * h) / body.h)), h);
    console.log(`旧立绘基准: ${base.w}×${base.h}（working / error 行沿用，未在需求里指定）`);
    for (let k = 0; k < COLS; k++) {
      // working：蹦跳 + 摆头
      const c = Math.cos((2 * Math.PI * k) / COLS);
      const s = Math.sin((2 * Math.PI * k) / COLS);
      putFrame(1, k, render(base, { dy: -2.75 - 1.75 * c, sx: 1 + 0.01 * c, sy: 1 - 0.02 * c, rot: 2.5 * s }));
      // error：2 倍频抖动 + 去色
      const s2 = Math.sin((4 * Math.PI * k) / COLS);
      putFrame(2, k, render(base, { dx: 2.4 * s2, rot: 3 * s2, sy: 0.995 }), { error: true });
    }
  }

  // ---------- 3) idle：站姿 A/B 交替 + 呼吸 ----------
  {
    const A = poseBase(sheets.idleA.img, sheets.idleA.poses[0].box);
    const B = poseBase(sheets.idleB.img, sheets.idleB.poses[0].box);
    for (let k = 0; k < COLS; k++) putFrame(0, k, render(k < COLS / 2 ? A : B, breath(k)));
    console.log(`idle: 两张站姿交替 + 呼吸（${A.w}×${A.h} / ${B.w}×${B.h}）`);
  }

  // ---------- 4) thinking：思考姿势 A/B + "?" 气泡（并排 3 个）----------
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
      putFrame(
        6,
        k,
        render(k < COLS / 2 ? A : B, breath(k, COLS, 2.2), (raw) => {
          for (const b of bubblesAt(3, k, COLS, slots, { rise: 2 })) {
            if (b.alpha > 0.01) stamp(raw, qGlyph, { x: b.x, y: b.y, size: 24 * b.pop, alpha: b.alpha });
          }
        }),
      );
    }
    console.log(`thinking: 思考姿势交替 + "?" 气泡（并排 3 个，依次出现）`);
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
      working: { row: 1, frames: COLS, fps: 12 },
      permission: { row: 1, frames: COLS, fps: 12 },
      error: { row: 2, frames: COLS, fps: 9 },
      sleep: { row: 3, frames: COLS, fps: 5 },
      drag_left: { row: 4, frames: 1, fps: 1 },
      drag_right: { row: 5, frames: 1, fps: 1 },
      thinking: { row: 6, frames: COLS, fps: 5 },
      paused: { row: 7, frames: COLS, fps: 4 },
    },
  };
  fs.writeFileSync(path.join(outDir, "pet.json"), JSON.stringify(manifest, null, 2) + "\n");
  const kb = (fs.statSync(path.join(outDir, "atlas.png")).size / 1024).toFixed(0);
  console.log(`\n已生成: ${outDir}/atlas.png (${atlas.w}×${atlas.h}, ${kb} KB)`);
  console.log(`已生成: ${outDir}/pet.json（新增 states.paused，thinking/sleep 独立成行）`);
}

main();
