#!/usr/bin/env node
/**
 * 插画类桌宠精灵图生成器
 * ---------------------------------------------------------------
 * 与 gen_mochi.py / gen_builtin.py（程序化绘制像素宠物）不同，本工具把
 * **一张完整立绘**转成 Z-Buddy 的 4×4 精灵图集（atlas.png）：
 *
 *   1. 抠背景：从画布四周泛洪填充纯白背景（只吃与边缘连通的白色，
 *      因此裙子/蕾丝内部的白色不会被误伤），并对轮廓边缘做一次
 *      白底反解羽化，避免深色桌面上出现白边；
 *   2. 自动找头顶装饰（例如睡觉的「Z」符号）：内容行剖面最窄处 + 主体变宽处
 *      作为分隔线 —— 睡觉行保留装饰，其余行裁掉；
 *   3. 生成 16 帧：呼吸浮动 / 蹦跳摆头 / 出错抖动 / 安睡呼吸；
 *   4. 4× 超采样渲染 → 盒式降采样，得到方形帧的图集。
 *
 * 帧尺寸默认 128（= 桌宠窗 canvas 位图尺寸，运行时 1:1 绘制，最清晰）。
 *
 * 用法：
 *   node app/tools/gen_illustration_pet.mjs <源图.png> <输出目录> \
 *        [--name yoru] [--title 夜羽] [--frame 128] [--preview out.png] \
 *        [--split <源图行号>] [--no-ornament] [--drag <拖动立绘.png>] [--drag-faces right|left] \
 *        [--drag-upright "x0,y0,x1,y1;..."]
 *
 *   --drag：可选。传一张"拖动时显示的形象"（单张立绘、不带动效）。工具会抠背景、
 *   裁切到内容，并把 drag_left / drag_right 两行都写进去 —— 其中一个方向用水平镜像。
 *   --drag-upright：可选。镜像会把字形（头顶的 Z、配饰里的字母）也翻反，这里给定
 *   源图坐标下的矩形，镜像后把它们按原方向贴回，做到"鸭子反、字正"。
 *
 * 只导出（缩放后的）源图供入库复现：
 *   node app/tools/gen_illustration_pet.mjs <源图.png> --emit-source out.png [--emit-height 768]
 *
 * 仅依赖 Node 内置 zlib（无第三方库）。
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

// ============================ PNG 解码 ============================

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** 解码 8 位、非隔行 PNG（灰度/RGB/调色板/带 alpha）→ RGBA */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG 文件");
  let pos = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let ctype = 0;
  let interlace = 0;
  let plte = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === "PLTE") plte = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`仅支持 8 位深度，当前 ${depth}`);
  if (interlace !== 0) throw new Error("不支持隔行（Adam7）PNG");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error(`不支持的颜色类型 ${ctype}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * 4);
  let prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const off = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const x = raw[off + i];
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v;
      if (ft === 0) v = x;
      else if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) v = x + paeth(a, b, c);
      else throw new Error(`未知过滤器 ${ft}`);
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 2) {
        out[o] = cur[x * 3];
        out[o + 1] = cur[x * 3 + 1];
        out[o + 2] = cur[x * 3 + 2];
        out[o + 3] = 255;
      } else if (ctype === 6) {
        out[o] = cur[x * 4];
        out[o + 1] = cur[x * 4 + 1];
        out[o + 2] = cur[x * 4 + 2];
        out[o + 3] = cur[x * 4 + 3];
      } else if (ctype === 0) {
        out[o] = out[o + 1] = out[o + 2] = cur[x];
        out[o + 3] = 255;
      } else if (ctype === 4) {
        out[o] = out[o + 1] = out[o + 2] = cur[x * 2];
        out[o + 3] = cur[x * 2 + 1];
      } else {
        const p = cur[x] * 3;
        out[o] = plte[p];
        out[o + 1] = plte[p + 1];
        out[o + 2] = plte[p + 2];
        out[o + 3] = 255;
      }
    }
    prev = Buffer.from(cur);
  }
  return { w, h, rgba: out };
}

// ============================ PNG 编码 ============================

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** RGBA → PNG（逐行自适应过滤器：比固定 filter 0 小 20~40%） */
export function encodePNG({ w, h, rgba }) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const prevLine = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(cur);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prevLine[i];
      const c = i >= 4 ? prevLine[i - 4] : 0;
      const v = cur[i];
      cand[0][i] = v;
      cand[1][i] = (v - a) & 255;
      cand[2][i] = (v - b) & 255;
      cand[3][i] = (v - ((a + b) >> 1)) & 255;
      cand[4][i] = (v - paeth(a, b, c)) & 255;
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let s = 0;
      for (let i = 0; i < stride; i++) {
        const v = cand[f][i];
        s += v < 128 ? v : 256 - v;
      }
      if (s < bestScore) {
        bestScore = s;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
    cur.copy(prevLine);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ============================ 图像处理 ============================

/** 抠白底：边缘泛洪 + 轮廓羽化（白底反解 alpha） */
export function keyWhiteBackground(img, { bgMin = 244, featherAbove = 200 } = {}) {
  const { w, h, rgba } = img;
  const bgLike = (p) => rgba[p * 4] >= bgMin && rgba[p * 4 + 1] >= bgMin && rgba[p * 4 + 2] >= bgMin;
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  const push = (p) => {
    if (!seen[p] && bgLike(p)) {
      seen[p] = 1;
      queue[qt++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  let bgCount = 0;
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) {
      rgba[p * 4 + 3] = 0;
      bgCount++;
    }
  }
  // 轮廓边缘：与已抠区域相邻的浅色像素 → 反解「真色 + alpha」
  let feathered = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (seen[p]) continue;
      if (!(seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w])) continue;
      const o = p * 4;
      const wmin = Math.min(rgba[o], rgba[o + 1], rgba[o + 2]);
      if (wmin <= featherAbove) continue;
      const a = (255 - wmin) / 255;
      if (a <= 0.012) {
        rgba[o + 3] = 0;
        continue;
      }
      rgba[o + 3] = Math.round(a * 255);
      for (let k = 0; k < 3; k++) {
        const c = (rgba[o + k] - (1 - a) * 255) / a;
        rgba[o + k] = Math.max(0, Math.min(255, Math.round(c)));
      }
      feathered++;
    }
  }
  return { bgCount, feathered };
}

/** 每行不透明像素数 */
export function rowCounts(img, alphaMin = 8) {
  const { w, h, rgba } = img;
  const rows = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > alphaMin) c++;
    rows[y] = c;
  }
  return rows;
}

/** 不透明像素包围盒 */
export function alphaBBox(img, alphaMin = 8) {
  const { w, h, rgba } = img;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > alphaMin) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error("源图整张都是背景，抠图失败");
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

export function crop(img, x0, y0, x1, y1) {
  const { w, rgba } = img;
  const cw = x1 - x0;
  const chh = y1 - y0;
  const out = new Uint8Array(cw * chh * 4);
  for (let y = 0; y < chh; y++) {
    const src = ((y + y0) * w + x0) * 4;
    out.set(rgba.subarray(src, src + cw * 4), y * cw * 4);
  }
  return { w: cw, h: chh, rgba: out };
}

/**
 * 找「头顶装饰」分隔行：内容顶部 35% 范围内最窄的一行，
 * 再向下找主体第一次变宽的行 —— 该行即主体顶端。返回源图行号，未检测到返回 -1。
 */
export function findOrnamentSplit(counts, bbox) {
  const width = bbox.x1 - bbox.x0;
  const narrow = width * 0.25;
  const span = bbox.y1 - bbox.y0;
  const topLimit = bbox.y0 + Math.max(4, Math.floor(span * 0.35));
  // 跳过装饰自身的最顶几行（描边起笔处天然是窄的），在其下方找最窄处
  const from = Math.min(bbox.y0 + 5, topLimit - 1);
  let bestY = -1;
  let bestC = Infinity;
  for (let y = from; y < topLimit; y++) {
    if (counts[y] < bestC) {
      bestC = counts[y];
      bestY = y;
    }
  }
  if (bestY < 0 || bestY - bbox.y0 < 3) return -1;
  if (bestC === 0) {
    let y = bestY;
    while (y < bbox.y1 && counts[y] === 0) y++;
    return y < bbox.y1 ? y : -1;
  }
  if (bestC >= narrow) return -1;
  // 最窄处之上必须有“装饰主体”（不能只是描边尖），否则视为误判
  let above = 0;
  for (let y = bbox.y0; y < bestY; y++) if (counts[y] > above) above = counts[y];
  if (above < narrow * 0.5) return -1;
  for (let y = bestY; y < bbox.y1; y++) {
    if (counts[y] >= narrow) return y;
  }
  return -1;
}

/** 精确面积平均缩放（预乘 alpha） */
export function resizeArea(img, dw, dh) {
  const { w, h, rgba } = img;
  const out = new Uint8Array(dw * dh * 4);
  const sxScale = w / dw;
  const syScale = h / dh;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * syScale;
    const sy1 = (dy + 1) * syScale;
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * sxScale;
      const sx1 = (dx + 1) * sxScale;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wt = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const wgt = wx * wy;
          const o = (sy * w + sx) * 4;
          const al = rgba[o + 3] / 255;
          r += rgba[o] * al * wgt;
          g += rgba[o + 1] * al * wgt;
          b += rgba[o + 2] * al * wgt;
          a += al * wgt;
          wt += wgt;
        }
      }
      const o = (dy * dw + dx) * 4;
      if (wt <= 0 || a <= 0) {
        out[o + 3] = 0;
        continue;
      }
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((255 * a) / wt);
    }
  }
  return { w: dw, h: dh, rgba: out };
}

const _sample = [0, 0, 0, 0];
/** 预乘双线性采样（基准图坐标） */
function sampleBilinear(base, x, y) {
  const { w, h, rgba } = base;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  let pr = 0;
  let pg = 0;
  let pb = 0;
  let pa = 0;
  for (let j = 0; j < 2; j++) {
    const yy = y0 + j;
    if (yy < 0 || yy >= h) continue;
    for (let i = 0; i < 2; i++) {
      const xx = x0 + i;
      if (xx < 0 || xx >= w) continue;
      const wgt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      if (wgt <= 0) continue;
      const o = (yy * w + xx) * 4;
      const al = rgba[o + 3] / 255;
      pr += rgba[o] * al * wgt;
      pg += rgba[o + 1] * al * wgt;
      pb += rgba[o + 2] * al * wgt;
      pa += al * wgt;
    }
  }
  if (pa <= 0.0001) {
    _sample[0] = _sample[1] = _sample[2] = _sample[3] = 0;
    return _sample;
  }
  _sample[0] = pr / pa;
  _sample[1] = pg / pa;
  _sample[2] = pb / pa;
  _sample[3] = pa * 255;
  return _sample;
}

/** 渲染单帧：以「脚底中心」为锚点做平移/缩放/旋转（逆映射 + 预乘双线性） */
function renderFrame(base, p, { size, ss, bottom }) {
  const { dx = 0, dy = 0, sx = 1, sy = 1, rot = 0 } = p;
  const out = new Uint8Array(size * size * 4);
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const fbx = base.w / 2;
  const fby = base.h;
  const fdx = size / 2 + dx * ss;
  const fdy = bottom + dy * ss;
  for (let py = 0; py < size; py++) {
    const qy = py + 0.5 - fdy;
    for (let px = 0; px < size; px++) {
      const qx = px + 0.5 - fdx;
      const rx = qx * cos + qy * sin;
      const ry = -qx * sin + qy * cos;
      const s = sampleBilinear(base, fbx + rx / sx - 0.5, fby + ry / sy - 0.5);
      const o = (py * size + px) * 4;
      out[o] = s[0];
      out[o + 1] = s[1];
      out[o + 2] = s[2];
      out[o + 3] = s[3];
    }
  }
  return out;
}

/** 盒式降采样（超采样缓冲 → 最终帧），预乘 alpha */
function boxDown(src, size, f) {
  const d = size / f;
  const out = new Uint8Array(d * d * 4);
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const o = ((y * f + j) * size + (x * f + i)) * 4;
          const al = src[o + 3] / 255;
          r += src[o] * al;
          g += src[o + 1] * al;
          b += src[o + 2] * al;
          a += al;
        }
      }
      const n = f * f;
      const o = (y * d + x) * 4;
      if (a <= 0) {
        out[o + 3] = 0;
        continue;
      }
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round((255 * a) / n);
    }
  }
  return { w: d, h: d, rgba: out };
}

/** 出错态调色：降饱和 + 压暗（CSS 层没有 error 滤镜，只能画进精灵图） */
function gradeError(rgba, { desat = 0.45, bright = 0.9 } = {}) {
  for (let o = 0; o < rgba.length; o += 4) {
    if (rgba[o + 3] === 0) continue;
    const lum = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
    for (let k = 0; k < 3; k++) {
      const v = rgba[o + k] * (1 - desat) + lum * desat;
      rgba[o + k] = Math.max(0, Math.min(255, Math.round(v * bright)));
    }
  }
}

/** 直 alpha 的 source-over 贴图（用于把睡觉 Z 叠进帧内空白处） */
function alphaOver(dst, dstSize, src, x0, y0) {
  for (let y = 0; y < src.h; y++) {
    const dy = y0 + y;
    if (dy < 0 || dy >= dstSize) continue;
    for (let x = 0; x < src.w; x++) {
      const dx = x0 + x;
      if (dx < 0 || dx >= dstSize) continue;
      const so = (y * src.w + x) * 4;
      const sa = src.rgba[so + 3] / 255;
      if (sa <= 0) continue;
      const dofs = (dy * dstSize + dx) * 4;
      const da = dst[dofs + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) continue;
      for (let k = 0; k < 3; k++) {
        dst[dofs + k] = Math.round(
          (src.rgba[so + k] * sa + dst[dofs + k] * da * (1 - sa)) / oa,
        );
      }
      dst[dofs + 3] = Math.round(oa * 255);
    }
  }
}

// ============================ 帧计划 ============================

const SS = 4; // 超采样倍率
const PAD_BOTTOM = 6; // 脚底留白（最终像素）
const FIT_RATIO = 0.92; // 角色占帧高的比例

/** 状态行动画：统一 6 帧（与游动行同列数，图集网格整齐；动作按正弦采样，首尾自然衔接） */
function buildRowPlan() {
  const N = 6;
  const wave = (i, cycles = 1) => {
    const t = (2 * Math.PI * cycles * i) / N;
    return { s: Math.sin(t), c: Math.cos(t), k: (1 - Math.cos(t)) / 2 };
  };
  const rows = [
    {
      // row 0: idle / thinking —— 站立呼吸浮动
      base: "body",
      frames: Array.from({ length: N }, (_, i) => {
        const { k } = wave(i);
        return { dy: -3.0 * k, sx: 1 + 0.016 * k, sy: 1 - 0.015 * k };
      }),
    },
    {
      // row 1: working / permission —— 蹦跳 + 小幅摆头
      base: "body",
      frames: Array.from({ length: N }, (_, i) => {
        const { s, c } = wave(i);
        return { dy: -2.75 - 1.75 * c, sx: 1 + 0.01 * c, sy: 1 - 0.02 * c, rot: 2.5 * s };
      }),
    },
    {
      // row 2: error —— 左右抖动（2 倍频）+ 去色压暗
      base: "body",
      grade: "error",
      frames: Array.from({ length: N }, (_, i) => {
        const { s } = wave(i, 2);
        return { dx: 2.4 * s, rot: 3 * s, sy: 0.995 };
      }),
    },
    {
      // row 3: sleep —— 同一主体 + 右上角飘一个「Z」（CSS 另有灰化滤镜）
      base: "body",
      ornament: true,
      frames: Array.from({ length: N }, (_, i) => {
        const { k } = wave(i);
        return { dy: 1.8 * k, sx: 1 + 0.012 * k, sy: 1 - 0.022 * k };
      }),
    },
  ];
  return rows;
}

// ============================ 拖动形象（静态 + 左右镜像） ============================
//
// 长按拖动时换成这张形象。素材是单张立绘、本身不带动效，所以只做一件事：
// 水平镜像一份给另一个朝向用（原图朝右 → drag_right，镜像 → drag_left；
// 用 --drag-faces left 可反转这个假设）。
//
// 但整图镜像会把**字形**也镜像掉（头顶的 Z、配饰里的字母），看着是"反字"。
// 所以支持 --drag-upright 指定若干矩形：镜像后把这些矩形按**原方向**贴回镜像位置，
// 于是鸭子是镜像的、字是正的。

/** 水平镜像 */
export function flipHorizontal(img) {
  const { w, h, rgba } = img;
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 4;
      const dst = (y * w + (w - 1 - x)) * 4;
      out[dst] = rgba[src];
      out[dst + 1] = rgba[src + 1];
      out[dst + 2] = rgba[src + 2];
      out[dst + 3] = rgba[src + 3];
    }
  return { w, h, rgba: out };
}

/** 解析 "x0,y0,x1,y1;x0,y0,x1,y1" 形式的矩形列表 */
export function parseRegions(spec) {
  if (typeof spec !== "string") return [];
  return spec
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [x0, y0, x1, y1] = s.split(",").map(Number);
      if ([x0, y0, x1, y1].some((v) => !Number.isFinite(v))) throw new Error(`--drag-upright 矩形格式错误: ${s}`);
      return { x0, y0, x1, y1 };
    });
}

/**
 * 镜像，但把 regions（源图坐标）里的内容按原方向贴到**镜像后的位置** —— 字正、鸭子反。
 * 注意：矩形要只覆盖字形本身（含一点余量），不要压到鸭子身上，否则会在身上留一块没镜像的补丁。
 */
export function mirrorKeepUpright(img, regions = []) {
  const out = flipHorizontal(img);
  const { w, h, rgba } = img;
  for (const r of regions) {
    const x0 = Math.max(0, Math.floor(r.x0));
    const y0 = Math.max(0, Math.floor(r.y0));
    const x1 = Math.min(w, Math.ceil(r.x1));
    const y1 = Math.min(h, Math.ceil(r.y1));
    const dstX0 = w - x1; // 镜像后该矩形左上角
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const so = (y * w + x) * 4;
        const dofs = (y * w + dstX0 + (x - x0)) * 4;
        out.rgba[dofs] = rgba[so];
        out.rgba[dofs + 1] = rgba[so + 1];
        out.rgba[dofs + 2] = rgba[so + 2];
        out.rgba[dofs + 3] = rgba[so + 3];
      }
  }
  return out;
}

// ============================ 预览图 ============================

function previewSheet(atlas, frame, rows, cols, scale = 2) {
  const S = frame * scale;
  const pad = 6;
  const w = cols * S + (cols + 1) * pad;
  const h = rows * S + (rows + 1) * pad;
  const bg = [0x1e, 0x22, 0x29]; // 与应用深色底一致
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = bg[0];
    rgba[i * 4 + 1] = bg[1];
    rgba[i * 4 + 2] = bg[2];
    rgba[i * 4 + 3] = 255;
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = pad + col * (S + pad);
      const oy = pad + row * (S + pad);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const px = col * frame + ((x / scale) | 0);
          const py = row * frame + ((y / scale) | 0);
          const so = (py * atlas.w + px) * 4;
          const a = atlas.rgba[so + 3] / 255;
          if (a <= 0) continue;
          const o = ((oy + y) * w + ox + x) * 4;
          for (let k = 0; k < 3; k++) {
            rgba[o + k] = Math.round(atlas.rgba[so + k] * a + rgba[o + k] * (1 - a));
          }
        }
      }
    }
  }
  return { w, h, rgba };
}

// ============================ 主流程 ============================

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const [src, outDir] = args._;
  const emitSource = typeof args["emit-source"] === "string" ? args["emit-source"] : null;
  if (!src || (!outDir && !emitSource)) {
    console.error(
      "用法: node gen_illustration_pet.mjs <源图.png> <输出目录> [--name X --title Y --frame 128 " +
        "--preview P --split N --no-ornament] [--drag <拖动立绘.png>] [--drag-faces right|left]",
    );
    process.exit(2);
  }
  const name = typeof args.name === "string" ? args.name : path.basename(outDir || "pet");
  let title = typeof args.title === "string" ? args.title : name;
  // Windows PowerShell 5.1 向原生程序传非 ASCII 参数会按 ANSI 代码页编码而乱码，
  // 因此支持用 UTF-8 字节的十六进制传标题：--title-hex e5a49ce7bebd（夜羽）
  if (typeof args["title-hex"] === "string") title = Buffer.from(args["title-hex"], "hex").toString("utf8");
  const FRAME = Number(args.frame || 128);

  const img = decodePNG(fs.readFileSync(src));
  console.log(`源图: ${img.w}×${img.h}`);

  // --emit-source：只导出缩放后的源图（用于入库，便于复现）
  if (emitSource) {
    const targetH = Number(args["emit-height"] || 768);
    const targetW = Math.round((img.w * targetH) / img.h);
    const small = resizeArea(img, targetW, targetH);
    fs.mkdirSync(path.dirname(emitSource), { recursive: true });
    fs.writeFileSync(emitSource, encodePNG(small));
    const kb = (fs.statSync(emitSource).size / 1024).toFixed(0);
    console.log(`已导出源图: ${emitSource} (${targetW}×${targetH}, ${kb} KB)`);
    return;
  }

  const key = keyWhiteBackground(img);
  console.log(`抠背景: 背景像素 ${key.bgCount}, 边缘羽化 ${key.feathered}`);

  const counts = rowCounts(img);
  const bbox = alphaBBox(img);
  let bodyTop = bbox.y0;
  if (args["no-ornament"] !== true) {
    const split = args.split !== undefined ? Number(args.split) : findOrnamentSplit(counts, bbox);
    if (split > bbox.y0 && split < bbox.y1) {
      bodyTop = split;
      console.log(`头顶装饰: y ${bbox.y0}..${split - 1}（睡觉行保留，其余行裁掉）`);
    } else {
      console.log("头顶装饰: 未检测到（所有行使用同一张图）");
    }
  }
  console.log(`内容区: x ${bbox.x0}..${bbox.x1}, y ${bbox.y0}..${bbox.y1}; 主体从 y ${bodyTop} 起`);

  const bodyCrop = crop(img, bbox.x0, bodyTop, bbox.x1, bbox.y1);

  // 统一按「最终像素 × 超采样倍率」缩放，并保证不超出帧宽
  const fitH = Math.round(FRAME * FIT_RATIO) * SS;
  const scaleTo = (im) => {
    let h = Math.min(fitH, im.h);
    let w = Math.round((im.w * h) / im.h);
    const maxW = Math.round(FRAME * 0.96) * SS;
    if (w > maxW) {
      w = maxW;
      h = Math.round((im.h * w) / im.w);
    }
    return resizeArea(im, w, h);
  };
  const base = scaleTo(bodyCrop);

  // 头顶装饰（睡觉 Z）：与主体同比例缩放，睡觉帧贴到帧内右上方的空白处。
  // 这样四行的主体尺寸完全一致，不会出现「睡觉时宠物缩小」的跳变。
  let ornament = null;
  if (bodyTop > bbox.y0) {
    const zCrop = crop(img, bbox.x0, bbox.y0, bbox.x1, bodyTop);
    const zBox = alphaBBox(zCrop);
    const zTight = crop(zCrop, zBox.x0, zBox.y0, zBox.x1, zBox.y1);
    const k = base.h / bodyCrop.h;
    ornament = {
      img: resizeArea(zTight, Math.max(1, Math.round(zTight.w * k)), Math.max(1, Math.round(zTight.h * k))),
      gap: 6 * SS,
      top: 10 * SS,
    };
  }
  console.log(
    `基准图: body ${base.w}×${base.h}（超采样 ${SS}×，最终帧 ${FRAME}×${FRAME}）` +
      (ornament ? `; 装饰 Z ${ornament.img.w}×${ornament.img.h}` : ""),
  );

  const plan = buildRowPlan();
  const SIZE = FRAME * SS;
  const COLS = 6;

  // ---- 拖动形象（可选，--drag <立绘.png>）：静态、无动效，左右镜像 ----
  let dragBases = null;
  if (typeof args.drag === "string") {
    const dimg = decodePNG(fs.readFileSync(args.drag));
    const dinfo = keyWhiteBackground(dimg, { bgMin: Number(args["drag-bgmin"] || 250) });
    const faces = typeof args["drag-faces"] === "string" ? args["drag-faces"] : "right";
    const upRight = parseRegions(args["drag-upright"]);
    const dbox = alphaBBox(dimg);
    // 在**源图**上做镜像（这样 --drag-upright 的坐标就是源图坐标），再按对应的包围盒裁切，
    // 保证两侧基准图尺寸完全一致（否则切换方向时鸭子会跳一下）。
    const mirrored = mirrorKeepUpright(dimg, upRight);
    const mbox = { x0: dimg.w - dbox.x1, y0: dbox.y0, x1: dimg.w - dbox.x0, y1: dbox.y1 };
    const baseOf = (im, b) => scaleTo(crop(im, b.x0, b.y0, b.x1, b.y1));
    const original = baseOf(dimg, dbox);
    const flipped = baseOf(mirrored, mbox);
    dragBases =
      faces === "left"
        ? { drag_left: original, drag_right: flipped }
        : { drag_left: flipped, drag_right: original };
    console.log(
      `拖动形象: 抠背景 ${dinfo.bgCount}px / 羽化 ${dinfo.feathered}px，裁切 ${dbox.x1 - dbox.x0}×${dbox.y1 - dbox.y0}` +
        ` → 基准 ${original.w}×${original.h}（最终 ${Math.round(original.h / SS)}px 高）；` +
        `原图朝${faces === "left" ? "左" : "右"}，另一侧用镜像；` +
        (upRight.length ? `其中 ${upRight.length} 个矩形保持正字` : "未指定正字矩形（整图镜像）"),
    );
  }

  const ROWS = dragBases ? 6 : 4;
  const atlas = { w: FRAME * COLS, h: FRAME * ROWS, rgba: new Uint8Array(FRAME * COLS * FRAME * ROWS * 4) };
  const putFrame = (row, col, raw) => {
    const frame = boxDown(raw, SIZE, SS);
    if (row === 2) gradeError(frame.rgba);
    for (let y = 0; y < FRAME; y++) {
      const dst = ((row * FRAME + y) * atlas.w + col * FRAME) * 4;
      atlas.rgba.set(frame.rgba.subarray(y * FRAME * 4, (y + 1) * FRAME * 4), dst);
    }
  };

  plan.forEach((rowPlan, row) => {
    rowPlan.frames.forEach((p, col) => {
      const raw = renderFrame(base, p, { size: SIZE, ss: SS, bottom: SIZE - PAD_BOTTOM * SS });
      if (rowPlan.ornament && ornament) {
        const bodyLeft = (SIZE - base.w) / 2;
        const bodyTopInFrame = SIZE - PAD_BOTTOM * SS - base.h;
        alphaOver(
          raw,
          SIZE,
          ornament.img,
          Math.round(bodyLeft + base.w + ornament.gap),
          Math.round(bodyTopInFrame + ornament.top),
        );
      }
      putFrame(row, col, raw);
    });
  });

  if (dragBases) {
    // 静态形象：各只占 1 帧（fps 无意义，取 1）；另一侧是水平镜像
    [["drag_left", 4], ["drag_right", 5]].forEach(([key, row]) => {
      const raw = renderFrame(dragBases[key], {}, { size: SIZE, ss: SS, bottom: SIZE - PAD_BOTTOM * SS });
      putFrame(row, 0, raw);
    });
    console.log("拖动行: drag_left → row 4, drag_right → row 5（各 1 帧，静态无动效）");
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "atlas.png"), encodePNG(atlas));
  const states = {
    idle: { row: 0, frames: COLS, fps: 4.5 },
    thinking: { row: 0, frames: COLS, fps: 9 },
    working: { row: 1, frames: COLS, fps: 12 },
    permission: { row: 1, frames: COLS, fps: 12 },
    error: { row: 2, frames: COLS, fps: 9 },
    sleep: { row: 3, frames: COLS, fps: 3 },
  };
  if (dragBases) {
    // 静态拖动形象：1 帧（播放器用 frames 取模，1 帧即恒定画面）
    states.drag_left = { row: 4, frames: 1, fps: 1 };
    states.drag_right = { row: 5, frames: 1, fps: 1 };
  }
  const manifest = {
    name,
    title,
    version: "1.0.0",
    author: "Z-Buddy",
    license: "original-artwork",
    frame: { w: FRAME, h: FRAME },
    states,
  };
  fs.writeFileSync(path.join(outDir, "pet.json"), JSON.stringify(manifest, null, 2) + "\n");

  const atlasKb = (fs.statSync(path.join(outDir, "atlas.png")).size / 1024).toFixed(0);
  console.log(`已生成: ${path.join(outDir, "atlas.png")} (${atlas.w}×${atlas.h}, ${atlasKb} KB)`);
  console.log(`已生成: ${path.join(outDir, "pet.json")} (${name} / ${title})`);

  if (typeof args.preview === "string") {
    fs.mkdirSync(path.dirname(args.preview), { recursive: true });
    fs.writeFileSync(args.preview, encodePNG(previewSheet(atlas, FRAME, ROWS, COLS, 2)));
    console.log(`已生成预览: ${args.preview}`);
  }
}

// 作为脚本直接运行时才执行 main（被 import 时只暴露工具函数）
const __self = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (__self === path.resolve(fileURLToPath(import.meta.url))) main();
