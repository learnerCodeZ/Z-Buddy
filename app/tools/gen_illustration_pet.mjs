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
 *        [--split <源图行号>] [--no-ornament] [--swim <游动姿势表.png>]
 *
 *   --swim：可选。传一张"游动姿势表"（两行：左游/右游），工具取每行最左的大模板立绘，
 *   程序化派生 6 帧游动动效，追加 drag_left / drag_right 两行（供长按拖拽播放）。
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

// ============================ 路线 C：游动行（拖拽动效） ============================
//
// 素材是一张"游动姿势表"（两行：左游 / 右游）。取每行最左那张**大模板立绘**作为唯一
// 静帧，程序化派生 6 帧游动动效（鸭子浮沉俯仰 + 水面涟漪波光），接成
// drag_left / drag_right 两个状态行。
//
// 为什么不用右侧那 6 张编号小帧：它们只有 ~127×175px，塞进 192 帧会糊；大模板是
// 253×315，缩到 192 帧仍有余量。

/** 深色连通域（用于定位鸭子本体） */
function darkBlobs(img, { darkMax = 120, minArea = 500 } = {}) {
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
    let area = 0;
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
      area++;
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
    if (area >= minArea) out.push({ area, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out.sort((a, b) => b.area - a.area);
}

/**
 * 自动定位两张大模板立绘并给出裁切框：
 *   每半张图里最大的"非标签条"深色块 = 大模板本体；
 *   其右侧最近的"编号帧级"块（面积 8k~20k）左边界再留余量 = 切线（避免切进邻帧）；
 *   裁切框 = 该窗口内的内容包围盒（含水面）。
 */
export function detectSwimTemplates(img, { cutMargin = 24 } = {}) {
  const { w, h, rgba } = img;
  const bg = [rgba[0], rgba[1], rgba[2]];
  const isContent = (o) =>
    Math.abs(rgba[o] - bg[0]) > 3 || Math.abs(rgba[o + 1] - bg[1]) > 3 || Math.abs(rgba[o + 2] - bg[2]) > 3;
  const blobs = darkBlobs(img);
  const out = {};
  const halves = [
    ["left", 0, Math.floor(h / 2)],
    ["right", Math.floor(h / 2), h],
  ];
  for (const [key, lo, hi] of halves) {
    const inHalf = blobs.filter((b) => (b.y0 + b.y1) / 2 >= lo && (b.y0 + b.y1) / 2 < hi);
    const cand = inHalf.filter((b) => b.w / b.h <= 3.2); // 排除方向标签条
    if (!cand.length) throw new Error(`游动素材：${key} 半张没找到大模板`);
    const tmpl = cand[0];
    // 方向标签条（宽扁的深色块）：算内容包围盒时要跳过它，否则会把标签裁进帧里
    const pillBlob = inHalf.find((b) => b.w / b.h > 3.2 && b.area > 2000) || null;
    const pill = pillBlob
      ? { x0: pillBlob.x0 - 4, y0: pillBlob.y0 - 4, x1: pillBlob.x1 + 5, y1: pillBlob.y1 + 5 }
      : null;
    const inPill = (x, y) => pill && x >= pill.x0 && x <= pill.x1 && y >= pill.y0 && y <= pill.y1;
    const frames = cand
      .filter((b) => b.x0 > tmpl.x1 && b.area > 8000 && b.area < 20000)
      .sort((a, b) => a.x0 - b.x0);
    const cutX = frames.length ? frames[0].x0 - cutMargin : w;
    let bx0 = cutX;
    let by0 = hi;
    let bx1 = 0;
    let by1 = lo;
    for (let y = lo; y < hi; y++)
      for (let x = 0; x < cutX; x++) {
        if (inPill(x, y)) continue;
        if (!isContent((y * w + x) * 4)) continue;
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        if (y > by1) by1 = y;
      }
    out[key] = {
      crop: { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 },
      pill,
      bodyBottom: tmpl.y1, // 水线参考
      bodyH: tmpl.h,
      bodyCx: (tmpl.x0 + tmpl.x1) / 2,
      framesFound: frames.length,
    };
  }
  return out;
}

/** 底部若干行做 alpha 渐隐（游动素材的水面在裁切处会有硬边） */
export function fadeBottomEdge(img, rows = 10) {
  const { w, h, rgba } = img;
  for (let i = 0; i < rows; i++) {
    const y = h - 1 - i;
    if (y < 0) break;
    const g = i / rows; // 最底行 g≈0 → 全透明
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o + 3] = Math.round(rgba[o + 3] * g);
    }
  }
}

/** 把一块矩形区域擦成透明（用于剔除方向标签条） */
export function eraseRect(img, r) {
  for (let y = Math.max(0, r.y0); y < Math.min(img.h, r.y1); y++)
    for (let x = Math.max(0, r.x0); x < Math.min(img.w, r.x1); x++) {
      const o = (y * img.w + x) * 4;
      img.rgba[o + 3] = 0;
    }
}

/** 按"颜色 + 水线"把素材拆成鸭子层与水面层（鸭子黑、水浅，可干净分离） */
export function splitWaterLayers(img, { yWater, lightMin = 195 }) {
  const { w, h, rgba } = img;
  const duck = new Uint8Array(rgba.length);
  const water = new Uint8Array(rgba.length);
  let duckPx = 0;
  let waterPx = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const a = rgba[o + 3];
      if (!a) continue;
      const m = Math.min(rgba[o], rgba[o + 1], rgba[o + 2]);
      const isWater = y >= yWater && m >= lightMin;
      const dst = isWater ? water : duck;
      dst[o] = rgba[o];
      dst[o + 1] = rgba[o + 1];
      dst[o + 2] = rgba[o + 2];
      dst[o + 3] = a;
      if (isWater) waterPx++;
      else duckPx++;
    }
  return { duck: { w, h, rgba: duck }, water: { w, h, rgba: water }, duckPx, waterPx };
}

/** 把一层按"绕锚点旋转缩放 + 锚点落到目标点"贴进帧缓冲（source-over） */
function blitLayer(dst, size, layer, o) {
  const { ss, dx = 0, dy = 0, rot = 0, sx = 1, sy = 1, alphaGain = 1, anchorX, anchorY, destX, destY } = o;
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = destX + dx * ss;
  const cy = destY + dy * ss;
  for (let py = 0; py < size; py++) {
    const qy = py + 0.5 - cy;
    for (let px = 0; px < size; px++) {
      const qx = px + 0.5 - cx;
      const rx = qx * cos + qy * sin;
      const ry = -qx * sin + qy * cos;
      const s = sampleBilinear(layer, anchorX + rx / sx - 0.5, anchorY + ry / sy - 0.5);
      const a = (s[3] / 255) * alphaGain;
      if (a <= 0.002) continue;
      const dofs = (py * size + px) * 4;
      const da = dst[dofs + 3] / 255;
      const oa = a + da * (1 - a);
      if (oa <= 0) continue;
      for (let k = 0; k < 3; k++) {
        dst[dofs + k] = (s[k] * a + dst[dofs + k] * da * (1 - a)) / oa;
      }
      dst[dofs + 3] = oa * 255;
    }
  }
}

/** 合成一帧游动：水面先铺，鸭子压在上面 */
function renderSwimFrame(layers, p, geom) {
  const out = new Uint8Array(geom.size * geom.size * 4);
  blitLayer(out, geom.size, layers.water, {
    ...geom,
    dx: p.wdx,
    dy: p.wdy,
    rot: p.wrot,
    sx: p.wsx,
    sy: p.wsy,
    alphaGain: p.wgain,
  });
  blitLayer(out, geom.size, layers.duck, {
    ...geom,
    dx: p.ddx,
    dy: p.ddy,
    rot: p.drot,
    sx: p.dsx,
    sy: p.dsy,
  });
  return out;
}

/** 6 帧游动循环（正弦采样，首尾自然衔接） */
export function buildSwimPlan(n = 6) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * (i + 0.5)) / n;
    const s = Math.sin(t);
    const c = Math.cos(t);
    frames.push({
      ddx: 0,
      ddy: -3.2 * s, // 鸭子随波浮沉
      drot: 2.4 * c, // 轻微俯仰
      dsx: 1 + 0.01 * c,
      dsy: 1 - 0.012 * c,
      wdx: 0,
      wdy: 1.1 * s, // 水面反向微动
      wrot: -1.2 * c,
      wsx: 1 + 0.018 * c,
      wsy: 1 - 0.01 * s,
      wgain: 0.9 + 0.1 * c, // 波光闪烁
    });
  }
  return frames;
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
        "--preview P --split N --no-ornament] [--swim <游动姿势表.png>]",
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

  // ---- 路线 C：游动行（可选，--swim <姿势表.png>）----
  let swim = null;
  if (typeof args.swim === "string") {
    const sheet = decodePNG(fs.readFileSync(args.swim));
    keyWhiteBackground(sheet, { bgMin: 250 }); // 实测：内容最亮 249、背景 253 → 250 干净分界
    const det = detectSwimTemplates(sheet);
    swim = {};
    const fitPx = FRAME * 0.94 * SS;
    for (const dir of ["left", "right"]) {
      const d = det[dir];
      if (d.pill) eraseRect(sheet, d.pill); // 先剔除方向标签条，再裁切
    }
    for (const dir of ["left", "right"]) {
      const d = det[dir];
      // 裁切宽度收到本体高的 1.15 倍（左右对称、以鸭子为中心）：避免宽水面把鸭子挤小，
      // 也让左右两个方向的鸭子最终渲染尺寸基本一致。
      const maxW = Math.round(d.bodyH * 1.15);
      let cx0 = d.crop.x0;
      let cx1 = d.crop.x1;
      if (cx1 - cx0 > maxW) {
        const bc = Math.round(d.bodyCx);
        cx0 = Math.max(d.crop.x0, bc - Math.round(maxW / 2));
        cx1 = Math.min(d.crop.x1, cx0 + maxW);
        cx0 = Math.max(d.crop.x0, cx1 - maxW);
      }
      const raw = crop(sheet, cx0, d.crop.y0, cx1, d.crop.y1);
      fadeBottomEdge(raw, 10);
      const yWater = d.bodyBottom - d.crop.y0 - 6;
      const layers = splitWaterLayers(raw, { yWater });
      const k = fitPx / Math.max(raw.w, raw.h);
      const w = Math.max(1, Math.round(raw.w * k));
      const h = Math.max(1, Math.round(raw.h * k));
      const scaled = {
        duck: resizeArea(layers.duck, w, h),
        water: resizeArea(layers.water, w, h),
      };
      const anchorY = yWater * k;
      const layerTop = (SIZE - h) / 2;
      // 以「鸭子本体中心」对齐帧中心（水面可以不对称地拖在后面）
      const bodyCxLayer = (d.bodyCx - cx0) * k;
      swim[dir] = {
        layers: scaled,
        geom: {
          size: SIZE,
          ss: SS,
          anchorX: w / 2,
          anchorY,
          destX: SIZE / 2 - (bodyCxLayer - w / 2),
          destY: layerTop + anchorY,
        },
      };
      console.log(
        `游动素材 ${dir}: 裁切 ${raw.w}×${raw.h}（本体高 ${d.bodyH}，编号帧 ${d.framesFound} 个）` +
          ` → 缩放 ${w}×${h}，鸭子 ${Math.round((d.bodyH * k) / SS)}px 高，` +
          `鸭子层 ${layers.duckPx}px / 水面层 ${layers.waterPx}px`,
      );
    }
  }

  const ROWS = swim ? 6 : 4;
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

  if (swim) {
    const swimFrames = buildSwimPlan(COLS);
    [["left", 4], ["right", 5]].forEach(([dir, row]) => {
      const s = swim[dir];
      swimFrames.forEach((p, col) => putFrame(row, col, renderSwimFrame(s.layers, p, s.geom)));
    });
    console.log(`游动行: drag_left → row 4, drag_right → row 5（各 ${COLS} 帧）`);
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
  if (swim) {
    states.drag_left = { row: 4, frames: COLS, fps: 10 };
    states.drag_right = { row: 5, frames: COLS, fps: 10 };
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
