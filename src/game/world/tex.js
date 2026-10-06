// 手続き的なテクスチャ（canvas で描く。画像ファイルは使わない）。
// 床・壁・鉄骨などの「材質」のテクスチャは、色（map）・凹凸（normalMap）・つや（roughnessMap）をそろえて作る。
// どれもタイルしてもつなぎ目が出ないように描く（ノイズは周期つき、はみ出す図形は反対側にも描く）。
import * as THREE from 'three';
import { fbm, cell, hash, rand, clamp01, smooth } from './noise.js';

// ---------------------------------------------------------------- 共有のノイズ場（毎回ノイズを計算すると遅いので、一度だけ作って引く）
const FN = 256;
let FIELDS = null;
function fields() {
  if (FIELDS) return FIELDS;
  const make = (period, oct, seed, gain = 0.5) => {
    const f = new Float32Array(FN * FN);
    for (let y = 0; y < FN; y++) for (let x = 0; x < FN; x++) f[y * FN + x] = fbm((x / FN) * period, (y / FN) * period, period, oct, seed, gain);
    // 0〜1 に広げる（fbm は真ん中に寄る）
    let lo = 1, hi = 0;
    for (const v of f) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / Math.max(1e-6, hi - lo);
    return f;
  };
  FIELDS = { big: make(4, 5, 11), mid: make(12, 4, 23), fine: make(48, 3, 37, 0.6), grain: make(128, 2, 41, 0.7) };
  return FIELDS;
}
/** 場 f を、テクスチャの (x, y)（0〜W, 0〜H）で引く。k はくり返しの回数（整数）、o はずらし。双一次補間。 */
function S(f, x, y, W, H, k = 1, ox = 0, oy = 0) {
  return sampleField(f, (x / W) * FN * k + ox, (y / H) * FN * k + oy);
}
/** 場を場の画素の座標（周期 FN）で引く。 */
export function sampleField(f, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const m = (a) => ((a % FN) + FN) % FN;
  const a = f[m(y0) * FN + m(x0)], b = f[m(y0) * FN + m(x0 + 1)], c = f[m(y0 + 1) * FN + m(x0)], d = f[m(y0 + 1) * FN + m(x0 + 1)];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

export { fields, FN };

// ---------------------------------------------------------------- 道具
export const JP_SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "YuGothic", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';
export const JP_ROUND = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';
export const JP_SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP", "Noto Serif CJK JP", serif';

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d', { willReadFrequently: true }) };
}

export function texture(c, { repeat = [1, 1], srgb = true, aniso = 8, wrap = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** 高さ（0〜1 の Float32Array）から法線マップの canvas を作る。canvas の下向き = テクスチャの v の負の向き。 */
export function normalFromHeight(hgt, W, H, strength = 2) {
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const d = img.data;
  const at = (x, y) => hgt[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
    const dr = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
    let nx = -dx, ny = dr, nz = 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i = (y * W + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255;
    d[i + 1] = (ny * 0.5 + 0.5) * 255;
    d[i + 2] = (nz * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** 色・高さ・つやの 3 枚をまとめて作る。fn(x, y, out) で out = { r, g, b, h, rough } を埋める（色は 0〜1 の sRGB）。 */
function material(W, H, fn, { normal = 2, repeat = [1, 1] } = {}) {
  const col = canvas(W, H), rough = canvas(W, H);
  const ci = col.g.createImageData(W, H), ri = rough.g.createImageData(W, H);
  const hgt = new Float32Array(W * H);
  const o = { r: 0, g: 0, b: 0, h: 0, rough: 0.8, a: 1 };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    o.a = 1;
    fn(x, y, o);
    const i = (y * W + x) * 4;
    ci.data[i] = clamp01(o.r) * 255; ci.data[i + 1] = clamp01(o.g) * 255; ci.data[i + 2] = clamp01(o.b) * 255; ci.data[i + 3] = clamp01(o.a) * 255;
    const rv = clamp01(o.rough) * 255;
    ri.data[i] = rv; ri.data[i + 1] = rv; ri.data[i + 2] = rv; ri.data[i + 3] = 255;
    hgt[y * W + x] = o.h;
  }
  col.g.putImageData(ci, 0, 0);
  rough.g.putImageData(ri, 0, 0);
  return {
    map: texture(col.c, { repeat }),
    roughnessMap: texture(rough.c, { repeat, srgb: false }),
    normalMap: normal ? texture(normalFromHeight(hgt, W, H, normal), { repeat, srgb: false }) : null,
    canvas: col.c,
  };
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function set(o, c, k = 1) { o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k; }

/** 図形を描いた canvas を「マスク（0〜1 の配列）」にする。描く関数 draw(g, W, H) は、はみ出しを考えずに描いてよい（周りに 8 回写す）。 */
function mask(W, H, draw, wrap = true) {
  const { c, g } = canvas(W, H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  const offs = wrap ? [[0, 0], [-W, 0], [W, 0], [0, -H], [0, H], [-W, -H], [W, -H], [-W, H], [W, H]] : [[0, 0]];
  for (const [ox, oy] of offs) { g.save(); g.translate(ox, oy); draw(g, W, H); g.restore(); }
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Float32Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
  return m;
}

/** ひびの線を描く（ジグザグに枝分かれ）。 */
function crack(g, r, x, y, ang, len, w) {
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  let px = x, py = y;
  const n = Math.max(3, Math.floor(len / 6));
  for (let i = 0; i < n; i++) {
    ang += r.range(-0.6, 0.6);
    px += Math.cos(ang) * (len / n);
    py += Math.sin(ang) * (len / n);
    g.lineTo(px, py);
    if (r() < 0.12 && len > 20) { g.stroke(); crack(g, r, px, py, ang + r.range(-1.2, 1.2), len * 0.4, w * 0.7); g.beginPath(); g.moveTo(px, py); }
  }
  g.stroke();
}

// ---------------------------------------------------------------- 材質
/** コンコースの床：60cm 角のタイル（1 枚のテクスチャに 8×8 枚 = 4.8m）。 */
export function floorTiles({ size = 1024, seed = 3 } = {}) {
  const F = fields();
  const W = size, H = size, N = 8, T = W / N;
  const r = rand(seed);
  const cracks = mask(W, H, (g) => {
    for (let i = 0; i < 9; i++) {
      const tx = r.int(0, N - 1), ty = r.int(0, N - 1);
      crack(g, r, tx * T + r.range(0.1, 0.9) * T, ty * T + r.range(0.1, 0.9) * T, r.range(0, 6.28), r.range(30, 150), r.range(1.0, 1.8));
    }
  });
  const chipped = new Set();
  for (let i = 0; i < 2; i++) chipped.add(r.int(0, N * N - 1));
  const A = hex(0xb8b1a4), B = hex(0x9c9588), GROUT = hex(0x5f5a52), MOSS = hex(0x5d6b34), DIRT = hex(0x6b6152);
  return material(W, H, (x, y, o) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x - tx * T, ly = y - ty * T;
    const ed = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    const tv = hash(tx, ty, seed);
    const big = S(F.big, x, y, W, H, 1), mid = S(F.mid, x, y, W, H, 1, 30, 70), fine = S(F.fine, x, y, W, H, 1, 11, 5), gr = S(F.grain, x, y, W, H, 2);
    let c = mix3(A, B, tv * 0.7 + mid * 0.3);
    c = mix3(c, mix3(c, hex(0xc4b9a2), 0.5), hash(tx, ty, seed + 3) * 0.5);   // 少し黄ばんだタイル
    const gw = 1.8 + fine * 1.0;
    const isGrout = ed < gw;
    const bevel = smooth(gw, gw + 3, ed);
    let h = isGrout ? 0.15 : 0.55 + bevel * 0.45;
    let k = 0.9 + gr * 0.12 + (fine - 0.5) * 0.08;
    // 欠けたタイル（中が暗くざらざら）
    const chip = chipped.has(ty * N + tx) && S(F.mid, x, y, W, H, 2, tx * 37, ty * 53) > 0.6 && !isGrout;
    const ck = cracks[y * W + x];
    let rough = 0.42 + fine * 0.25 + (1 - bevel) * 0.2;
    if (isGrout) { c = mix3(GROUT, MOSS, smooth(0.55, 0.85, big) * 0.6); k = 0.8 + gr * 0.3; rough = 0.95; }
    if (chip) { c = mix3(hex(0x7a7468), DIRT, 0.4); h = 0.25 + gr * 0.1; rough = 0.95; k = 0.85 + gr * 0.2; }
    if (ck > 0.2) { c = mix3(c, GROUT, ck * 0.8); h -= ck * 0.35; rough = 0.95; }
    // 汚れ（大きなむら）と、水が乾いた跡
    const dirt = smooth(0.35, 0.95, big * 0.7 + mid * 0.3);
    c = mix3(c, DIRT, dirt * 0.35);
    const ring = Math.abs(S(F.mid, x, y, W, H, 1, 100, 40) - 0.5);
    if (ring < 0.02) { c = mix3(c, hex(0x8a8172), 0.25); }
    // 濡れたところ（つやが出る）
    const wet = smooth(0.6, 0.8, S(F.big, x, y, W, H, 1, 128, 64));
    rough = rough * (1 - wet * 0.7);
    k *= 1 - wet * 0.12;
    set(o, c, k);
    o.h = h;
    o.rough = rough;
  }, { normal: 3.0 });
}

/** コンクリートの壁（1 枚 = 4m）。上から垂れた水の筋、小さな穴、ひび。 */
export function concrete({ size = 512, seed = 5, tint = 0x8c8881 } = {}) {
  const F = fields();
  const W = size, H = size;
  const r = rand(seed);
  const cr = mask(W, H, (g) => { for (let i = 0; i < 5; i++) crack(g, r, r.range(0, W), r.range(0, H), r.range(0, 6.28), r.range(40, 160), 1.3); });
  const base = hex(tint), dark = hex(0x58544d), light = hex(0xa8a39a);
  return material(W, H, (x, y, o) => {
    const big = S(F.big, x, y, W, H, 1, 50, 10), mid = S(F.mid, x, y, W, H, 1, 3, 90), fine = S(F.fine, x, y, W, H, 1, 77, 13), gr = S(F.grain, x, y, W, H, 2, 9, 4);
    let c = mix3(base, light, mid * 0.35);
    // 垂れた水の筋：x 方向に細かく、y 方向に長い
    const streak = S(F.fine, x * 3, y * 0.3, W, H, 1, 20, 0) * 0.7 + S(F.mid, x, y, W, H, 1, 3, 3) * 0.3;
    const st = smooth(0.6, 0.9, streak) * smooth(0.3, 0.8, big);
    c = mix3(c, dark, st * 0.35);
    const pit = gr > 0.86 ? 1 : 0;
    const ck = cr[y * W + x];
    c = mix3(c, dark, ck * 0.7 + pit * 0.4);
    set(o, c, 0.9 + fine * 0.15);
    o.h = 0.5 + (fine - 0.5) * 0.4 + (gr - 0.5) * 0.25 - pit * 0.3 - ck * 0.4;
    o.rough = 0.85 + gr * 0.12;
  }, { normal: 2.2 });
}

/** 小さなモザイクタイル（クリーム色、1 枚 = 1m に 10×10）。地下通路・事務室の腰壁に。 */
export function mosaic({ size = 512, seed = 7, tint = 0xd8d1c0, n = 10 } = {}) {
  const F = fields();
  const W = size, H = size, T = W / n;
  const base = hex(tint), grout = hex(0x8f897d), dirt = hex(0x6d6457);
  return material(W, H, (x, y, o) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x - tx * T, ly = y - ty * T;
    const ed = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    const tv = hash(tx, ty, seed);
    const big = S(F.big, x, y, W, H, 1, 33, 3), fine = S(F.fine, x, y, W, H, 1, 3, 33);
    let c = mix3(base, mix3(base, hex(0xbfd2cf), 0.6), tv > 0.85 ? 1 : 0);
    c = mix3(c, hex(0xe9e4d6), hash(tx, ty, seed + 1) * 0.3);
    const g = ed < 2.2;
    if (g) c = grout;
    const missing = hash(tx, ty, seed + 9) > 0.975;
    if (missing) c = mix3(grout, dirt, 0.5);
    c = mix3(c, dirt, smooth(0.45, 1, big) * 0.45);
    set(o, c, 0.9 + fine * 0.12);
    o.h = g || missing ? 0.2 : 0.6 + smooth(1, 4, ed) * 0.4;
    o.rough = g || missing ? 0.95 : 0.3 + fine * 0.2 + smooth(0.45, 1, big) * 0.4;
  }, { normal: 2.5 });
}

/** 塗装した鉄（くすんだ緑灰色、はげたところは錆）。1 枚 = 2m。 */
export function paintedSteel({ size = 512, seed = 9, tint = 0x4a5650, rust = 0.5 } = {}) {
  const F = fields();
  const W = size, H = size;
  const paint = hex(tint), r1 = hex(0x5a4434), r2 = hex(0x7d5f45), bare = hex(0x4d4844);
  return material(W, H, (x, y, o) => {
    const big = S(F.big, x, y, W, H, 1, seed * 13, 7), mid = S(F.mid, x, y, W, H, 1, 3, seed * 7), fine = S(F.fine, x, y, W, H, 1, 41, 9), gr = S(F.grain, x, y, W, H, 1, 5, 5);
    const peel = rust <= 0 ? 0 : smooth(0.62 - rust * 0.15, 0.7 - rust * 0.15, mid * 0.6 + big * 0.4 + (fine - 0.5) * 0.3);
    let c = mix3(paint, mix3(paint, hex(0x6d7a72), 0.5), fine * 0.4);
    const rr = mix3(r1, r2, gr);
    c = mix3(c, rr, peel);
    // 錆が垂れた筋
    const streak = smooth(0.6, 0.9, S(F.fine, x * 5, y * 0.2, W, H, 1, 3, 0)) * smooth(0.4, 0.8, big);
    c = mix3(c, r1, streak * 0.35 * rust * 2);
    c = mix3(c, bare, smooth(0.8, 0.95, gr) * 0.3);
    set(o, c, 0.92 + gr * 0.1);
    o.h = 0.6 - peel * 0.25 + (gr - 0.5) * 0.15 * peel;
    o.rough = 0.55 + peel * 0.35 + fine * 0.1;
  }, { normal: 1.5 });
}

/** 錆びたシャッター（横の羽、1 枚 = 2m）。 */
export function shutter({ size = 512, seed = 13 } = {}) {
  const F = fields();
  const W = size, H = size, slat = H / 24;
  const base = hex(0x8a8a82), r1 = hex(0x5e4b3c), r2 = hex(0x86684d);
  return material(W, H, (x, y, o) => {
    const ly = (y % slat) / slat;
    const prof = Math.sin(ly * Math.PI);
    const big = S(F.big, x, y, W, H, 1, 9, 9), mid = S(F.mid, x, y, W, H, 1, 19, 2), gr = S(F.grain, x, y, W, H, 1, 3, 1);
    const rust = smooth(0.45, 0.75, mid * 0.5 + big * 0.5 + (1 - prof) * 0.2);
    let c = mix3(base, mix3(r1, r2, gr), rust);
    const streak = smooth(0.6, 0.85, S(F.fine, x * 6, y * 0.15, W, H, 1, 0, 3));
    c = mix3(c, r1, streak * 0.4);
    set(o, c, 0.75 + prof * 0.3);
    o.h = prof * 0.8 + gr * 0.1;
    o.rough = 0.5 + rust * 0.45;
  }, { normal: 2.5 });
}

/** 波板の屋根（錆びて暗い）。 */
export function corrugated({ size = 512, seed = 17 } = {}) {
  const F = fields();
  const W = size, H = size, wave = W / 16;
  const base = hex(0x5e5f5c), r1 = hex(0x524234), r2 = hex(0x7a5d44);
  return material(W, H, (x, y, o) => {
    const p = Math.sin((x / wave) * Math.PI * 2) * 0.5 + 0.5;
    const big = S(F.big, x, y, W, H, 1, 61, 1), mid = S(F.mid, x, y, W, H, 1, 2, 61), gr = S(F.grain, x, y, W, H, 1);
    const rust = smooth(0.4, 0.7, mid * 0.6 + big * 0.4);
    const c = mix3(base, mix3(r1, r2, gr), rust);
    set(o, c, 0.7 + p * 0.35);
    o.h = p;
    o.rough = 0.6 + rust * 0.35;
  }, { normal: 3 });
}

/** 天井のパネル（60cm 角、ところどころ抜けて暗い）。1 枚 = 2.4m。 */
export function ceilingPanels({ size = 512, seed = 19 } = {}) {
  const F = fields();
  const W = size, H = size, N = 4, T = W / N;
  const base = hex(0xc6c0b3), stain = hex(0x8b7d62), frame = hex(0x8e8a82), hole = hex(0x1f1d1b);
  return material(W, H, (x, y, o) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    const lx = x - tx * T, ly = y - ty * T;
    const ed = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
    const big = S(F.big, x, y, W, H, 1, 7, 70), fine = S(F.fine, x, y, W, H, 1, 3, 3), gr = S(F.grain, x, y, W, H, 2);
    const missing = hash(tx, ty, seed) > 0.85;
    let c = base;
    const st = smooth(0.55, 0.8, S(F.mid, x, y, W, H, 1, 40, 40));
    c = mix3(c, stain, st * 0.55);
    c = mix3(c, hex(0xb0aa9d), (gr > 0.7 ? 0.5 : 0));
    if (ed < 4) c = frame;
    if (missing && ed >= 4) c = hole;
    set(o, c, 0.92 + fine * 0.1 - big * 0.05);
    o.h = ed < 4 ? 0.3 : missing ? 0 : 0.6 + gr * 0.1;
    o.rough = 0.9;
  }, { normal: 1.5 });
}

/** 線路の砂利。 */
export function ballast({ size = 512, seed = 23 } = {}) {
  const F = fields();
  const W = size, H = size;
  return material(W, H, (x, y, o) => {
    const [d1, d2] = cell((x / W) * 40, (y / H) * 40, 40, seed);
    const edge = d2 - d1;
    const id = hash(Math.floor((x / W) * 40 + 0.5), Math.floor((y / H) * 40 + 0.5), seed);
    const big = S(F.big, x, y, W, H, 1, 80, 80);
    let c = mix3(hex(0x7d776d), hex(0x5d574f), id);
    c = mix3(c, hex(0x8a6a4a), smooth(0.5, 0.9, big) * 0.35);
    const k = smooth(0.0, 0.25, edge);
    set(o, c, 0.55 + k * 0.55);
    o.h = k;
    o.rough = 0.9;
  }, { normal: 4 });
}

/** 外の地面（草まじりの土）。 */
export function groundGrass({ size = 512, seed = 29 } = {}) {
  const F = fields();
  const W = size, H = size;
  return material(W, H, (x, y, o) => {
    const big = S(F.big, x, y, W, H, 1, 15, 99), mid = S(F.mid, x, y, W, H, 1, 99, 15), fine = S(F.fine, x, y, W, H, 2, 3, 77), gr = S(F.grain, x, y, W, H, 2, 1, 3);
    const grass = smooth(0.35, 0.6, big * 0.6 + mid * 0.4);
    let c = mix3(hex(0x6e604b), hex(0x8a7a5c), fine);
    const g = mix3(hex(0x4e6a2a), hex(0x7e8f3c), gr * 0.7 + fine * 0.3);
    c = mix3(c, g, grass);
    set(o, c, 0.85 + gr * 0.25);
    o.h = grass * (0.5 + gr * 0.5) + fine * 0.2;
    o.rough = 0.95;
  }, { normal: 2 });
}

/** 苔むしたコンクリート（ホームの床・外の舗装）。 */
export function pavement({ size = 512, seed = 31, tint = 0x9a958b } = {}) {
  const F = fields();
  const W = size, H = size;
  const r = rand(seed);
  const cr = mask(W, H, (g) => { for (let i = 0; i < 7; i++) crack(g, r, r.range(0, W), r.range(0, H), r.range(0, 6.28), r.range(60, 200), 1.6); });
  return material(W, H, (x, y, o) => {
    const big = S(F.big, x, y, W, H, 1, 5, 55), mid = S(F.mid, x, y, W, H, 1, 55, 5), fine = S(F.fine, x, y, W, H, 1, 15, 15), gr = S(F.grain, x, y, W, H, 2, 7, 7);
    let c = mix3(hex(tint), hex(0x7f7a71), mid * 0.5);
    const moss = smooth(0.55, 0.8, big * 0.7 + fine * 0.3);
    c = mix3(c, mix3(hex(0x55672d), hex(0x7a8a3e), gr), moss * 0.85);
    const ck = cr[y * W + x];
    c = mix3(c, mix3(hex(0x3f4a22), hex(0x2e2b26), 0.5), ck * 0.85);
    set(o, c, 0.9 + gr * 0.15);
    o.h = 0.5 + gr * 0.15 + moss * 0.2 - ck * 0.4;
    o.rough = 0.85 + moss * 0.1;
  }, { normal: 2.2 });
}

/** 点字ブロック（黄色、30cm 角）。dots = 警告（点）、そうでなければ誘導（線）。 */
export function tactile({ size = 256, dots = false } = {}) {
  const F = fields();
  const W = size, H = size;
  return material(W, H, (x, y, o) => {
    const u = x / W, v = y / H;
    let h;
    if (dots) {
      const gx = (u * 5) % 1 - 0.5, gy = (v * 5) % 1 - 0.5;
      h = smooth(0.3, 0.22, Math.hypot(gx, gy));
    } else {
      const gx = (u * 4) % 1;
      h = smooth(0.12, 0.2, Math.min(gx, 1 - gx)) * smooth(0.04, 0.09, Math.min(v, 1 - v));
    }
    const ed = Math.min(u, v, 1 - u, 1 - v);
    const big = S(F.big, x, y, W, H, 1, 3, 3), gr = S(F.grain, x, y, W, H, 1);
    let c = mix3(hex(0xd9b23a), hex(0xa98a3a), big * 0.6);
    c = mix3(c, hex(0x5e5546), smooth(0.6, 0.9, gr) * 0.35 + (ed < 0.02 ? 0.6 : 0));
    set(o, c, 0.85 + h * 0.2);
    o.h = ed < 0.02 ? 0 : 0.3 + h * 0.7;
    o.rough = 0.55 + gr * 0.3;
  }, { normal: 3 });
}

/** 木（ベンチの板・棚）。 */
export function wood({ size = 256, seed = 37, tint = 0x8a6440 } = {}) {
  const F = fields();
  const W = size, H = size;
  return material(W, H, (x, y, o) => {
    const ring = S(F.fine, x * 0.15, y * 3, W, H, 1, seed, 0);
    const big = S(F.big, x, y, W, H, 1, 3, seed), gr = S(F.grain, x, y, W, H, 1);
    const grain = Math.sin(ring * 40) * 0.5 + 0.5;
    let c = mix3(hex(tint), mix3(hex(tint), hex(0x3b2a1c), 0.6), grain * 0.5);
    c = mix3(c, hex(0x5a5450), smooth(0.5, 0.9, big) * 0.5);    // 古びて灰色に
    set(o, c, 0.9 + gr * 0.1);
    o.h = grain * 0.4 + gr * 0.2;
    o.rough = 0.8;
  }, { normal: 1.5 });
}

/** 段ボール・紙の箱など、くすんだ単色に汚れを足したもの。 */
export function grimy({ size = 256, tint = 0x9a8466, seed = 41, rough = 0.85 } = {}) {
  const F = fields();
  const W = size, H = size;
  return material(W, H, (x, y, o) => {
    const big = S(F.big, x, y, W, H, 1, seed, 3), fine = S(F.fine, x, y, W, H, 1, 3, seed), gr = S(F.grain, x, y, W, H, 1);
    let c = mix3(hex(tint), hex(0x4d453b), smooth(0.4, 1, big) * 0.4);
    c = mix3(c, hex(0xffffff), (fine - 0.5) * 0.12);
    set(o, c, 0.9 + gr * 0.12);
    o.h = fine * 0.3 + gr * 0.2;
    o.rough = rough;
  }, { normal: 1 });
}

/** ロボットの白い外装（少し汚れて、傷がある）。 */
export function robotShell({ size = 512, seed = 43 } = {}) {
  const F = fields();
  const W = size, H = size;
  const r = rand(seed);
  const sc = mask(W, H, (g) => { g.globalAlpha = 0.7; for (let i = 0; i < 40; i++) { g.lineWidth = r.range(0.6, 1.4); g.beginPath(); const x = r.range(0, W), y = r.range(0, H), a = r.range(0, 6.28), l = r.range(4, 26); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } });
  return material(W, H, (x, y, o) => {
    const big = S(F.big, x, y, W, H, 1, 21, 4), mid = S(F.mid, x, y, W, H, 1, 4, 21), gr = S(F.grain, x, y, W, H, 1, 2, 2);
    let c = mix3(hex(0xefede7), hex(0xe2ded5), mid);
    const dirt = smooth(0.62, 0.95, big * 0.6 + mid * 0.4);
    c = mix3(c, hex(0x9a8f7a), dirt * 0.3);
    c = mix3(c, hex(0x6d6253), smooth(0.9, 0.97, gr) * 0.4);
    const s = sc[y * W + x];
    c = mix3(c, hex(0x9c978c), s * 0.6);
    set(o, c, 0.97 + gr * 0.05);
    o.h = 0.6 - s * 0.3 + gr * 0.05;
    o.rough = 0.38 + dirt * 0.35 + s * 0.2;
  }, { normal: 0.8 });
}

/** ガラス（汚れ・ひび・割れて抜けたところ）。透明度つき。 */
export function dirtyGlass({ size = 512, seed = 47, broken = 0.3 } = {}) {
  const F = fields();
  const W = size, H = size;
  const r = rand(seed);
  const holes = mask(W, H, (g) => {
    for (let i = 0; i < 5 * broken * 3; i++) {
      const cx = r.range(0, W), cy = r.range(0, H), rad = r.range(30, 110);
      g.beginPath();
      const n = r.int(5, 9);
      for (let k = 0; k < n; k++) { const a = (k / n) * 6.28 + r.range(-0.3, 0.3), rr = rad * r.range(0.3, 1); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
  });
  const cracks = mask(W, H, (g) => { for (let i = 0; i < 8; i++) crack(g, r, r.range(0, W), r.range(0, H), r.range(0, 6.28), r.range(50, 180), 1.1); });
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const big = S(F.big, x, y, W, H, 1, 17, 17), fine = S(F.fine, x, y, W, H, 1, 3, 9);
    const dirt = smooth(0.3, 1, big * 0.7 + fine * 0.3);
    const hole = holes[y * W + x] > 0.5;
    const ck = cracks[y * W + x];
    img.data[i] = 150 + dirt * 40 - ck * 60;
    img.data[i + 1] = 165 + dirt * 30 - ck * 60;
    img.data[i + 2] = 160 + dirt * 10 - ck * 60;
    img.data[i + 3] = hole ? 0 : Math.min(255, (0.18 + dirt * 0.45 + ck * 0.5) * 255);
  }
  g.putImageData(img, 0, 0);
  return texture(c);
}

// ---------------------------------------------------------------- 汚れ・苔・影などの「貼るもの」（透明度つき、タイルしない）
/** 丸いぼかし（接地の影・光のたまり）。 */
export function radial({ size = 128, inner = 0, color = '#000' } = {}) {
  const { c, g } = canvas(size);
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.5 * inner, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return texture(c, { wrap: false, srgb: false });
}

/** しみ・苔の形（ふちがでこぼこした塊）。kind: stain / moss / puddle */
export function blotch({ size = 256, seed = 51, kind = 'stain' } = {}) {
  const F = fields();
  const W = size, H = size;
  const { c, g } = canvas(W, H);
  const img = g.createImageData(W, H);
  const col = kind === 'moss' ? [74, 92, 38] : kind === 'puddle' ? [255, 255, 255] : [52, 44, 34];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const dx = x / W - 0.5, dy = y / H - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const n = S(F.mid, x, y, W, H, 1, seed * 11, seed * 5) * 0.65 + S(F.fine, x, y, W, H, 1, seed, seed) * 0.35;
    const edge = kind === 'puddle' ? smooth(0.98, 0.9, d + (n - 0.5) * 0.7) : smooth(1.0, 0.45, d + (n - 0.5) * 0.9);
    const gr = S(F.grain, x, y, W, H, 1, seed, 0);
    let a = edge;
    if (kind === 'moss') a *= 0.55 + gr * 0.45;
    if (kind === 'stain') a *= 0.45 + n * 0.35;
    img.data[i] = col[0] * (kind === 'moss' ? 0.8 + gr * 0.5 : 1);
    img.data[i + 1] = col[1] * (kind === 'moss' ? 0.8 + gr * 0.5 : 1);
    img.data[i + 2] = col[2];
    img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return texture(c, { wrap: false, srgb: kind !== 'puddle' });
}

/** 光の筋の板（縦にのびて、ふちと端が消える）。加算で使う。 */
export function beamTex({ w = 64, h = 256 } = {}) {
  const { c, g } = canvas(w, h);
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1);
    const across = Math.pow(Math.sin(u * Math.PI), 1.5);
    const along = smooth(0, 0.12, v) * smooth(1, 0.55, v);
    const i = (y * w + x) * 4;
    const a = across * along;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return texture(c, { wrap: false, srgb: false });
}

// ---------------------------------------------------------------- 草木（透明度つきの葉）
/**
 * 葉のアトラス（2×2）：左上 = つたの垂れ（縦長）、右上 = 草の束、左下 = 茂みの葉、右下 = 小枝の葉。
 * 色は白っぽい緑で描き、材質の色で全体を調整する。
 */
export function foliageAtlas({ size = 1024, seed = 61 } = {}) {
  const { c, g } = canvas(size);
  const r = rand(seed);
  const Q = size / 2;
  const leafCol = () => {
    const k = r();
    const h = 72 + r.range(-14, 16), s = 30 + r.range(-8, 16), l = 26 + k * 24;
    return `hsl(${h} ${s}% ${l}%)`;
  };
  const leaf = (x, y, len, wid, ang, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(wid, len * 0.25, wid * 0.8, len * 0.75, 0, len);
    g.bezierCurveTo(-wid * 0.8, len * 0.75, -wid, len * 0.25, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(30,40,10,0.35)';
    g.lineWidth = Math.max(0.6, wid * 0.08);
    g.beginPath(); g.moveTo(0, len * 0.05); g.lineTo(0, len * 0.9); g.stroke();
    g.restore();
  };
  const ivy = (x, y, s, ang, col) => {
    // つたの葉（三つ又）
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
    g.beginPath();
    const p = [[0, 0], [s * 0.35, s * 0.1], [s * 0.55, -s * 0.3], [s * 0.25, -s * 0.25], [s * 0.15, -s * 0.7], [0, -s * 0.45], [-s * 0.15, -s * 0.7], [-s * 0.25, -s * 0.25], [-s * 0.55, -s * 0.3], [-s * 0.35, s * 0.1]];
    g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) { const [px, py] = p[i]; const [qx, qy] = p[(i + 1) % p.length]; g.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2); }
    g.closePath(); g.fill(); g.restore();
  };
  // 左上：垂れ下がるつた（太めの茎に、大きめの葉がびっしり）
  g.save();
  g.beginPath(); g.rect(0, 0, Q, Q); g.clip();
  for (let k = 0; k < 3; k++) {
    let x = Q * (0.25 + k * 0.25) + r.range(-12, 12);
    g.strokeStyle = 'rgb(66,58,36)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, 0);
    const pts = [];
    const end = Q * r.range(0.8, 1.0);
    for (let y = 0; y < end; y += 6) { x += r.range(-2.5, 2.5); g.lineTo(x, y); pts.push([x, y]); }
    g.stroke();
    for (const [px, py] of pts) {
      const taper = 1 - (py / Q) * 0.45;
      for (let n = 0; n < 2; n++) if (r() < 0.85) ivy(px + r.range(-14, 14) * taper, py + r.range(-4, 4), r.range(26, 46) * taper, r.range(-1.0, 1.0) + Math.PI, leafCol());
    }
  }
  g.restore();
  // 右上：草の束（下から上へ細い葉）
  g.save(); g.beginPath(); g.rect(Q, 0, Q, Q); g.clip();
  for (let i = 0; i < 90; i++) {
    const bx = Q + Q * 0.5 + r.range(-Q * 0.32, Q * 0.32), by = Q - 2;
    const len = r.range(Q * 0.35, Q * 0.95), bend = r.range(-0.5, 0.5);
    g.strokeStyle = `hsl(${68 + r.range(-14, 16)} ${22 + r.range(0, 22)}% ${24 + r.range(0, 24)}%)`;
    g.lineWidth = r.range(2, 5);
    g.beginPath(); g.moveTo(bx, by);
    g.quadraticCurveTo(bx + bend * len * 0.3, by - len * 0.6, bx + bend * len * 0.8, by - len);
    g.stroke();
  }
  g.restore();
  // 左下：茂み（丸く集まった葉）
  g.save(); g.beginPath(); g.rect(0, Q, Q, Q); g.clip();
  for (let i = 0; i < 260; i++) {
    const a = r.range(0, 6.28), d = Math.sqrt(r()) * Q * 0.44;
    leaf(Q * 0.5 + Math.cos(a) * d, Q * 1.5 + Math.sin(a) * d * 0.9, r.range(18, 36), r.range(7, 13), r.range(0, 6.28), leafCol());
  }
  g.restore();
  // 右下：小枝の葉（木の枝先。枝と葉）
  g.save(); g.beginPath(); g.rect(Q, Q, Q, Q); g.clip();
  g.strokeStyle = 'rgb(75,60,40)';
  const branch = (x, y, ang, len, w, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth > 0) {
      branch(x2, y2, ang + r.range(0.2, 0.6), len * 0.7, w * 0.7, depth - 1);
      branch(x2, y2, ang - r.range(0.2, 0.6), len * 0.7, w * 0.7, depth - 1);
    } else {
      for (let i = 0; i < 9; i++) leaf(x2 + r.range(-14, 14), y2 + r.range(-14, 14), r.range(16, 30), r.range(6, 11), r.range(0, 6.28), leafCol());
    }
  };
  branch(Q * 1.5, Q * 1.97, -Math.PI / 2, Q * 0.28, 7, 4);
  g.restore();
  return texture(c, { wrap: false });
}

/** 苔むした地面に置くための、ふちの柔らかい草地の模様（地面に貼る）。 */
export function grassPatch({ size = 256, seed = 67 } = {}) {
  return blotch({ size, seed, kind: 'moss' });
}

export { hex, mix3 };
