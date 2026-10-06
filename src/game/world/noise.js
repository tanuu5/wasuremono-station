// テクスチャを描くための小さなノイズ（タイルしてもつなぎ目が出ない）。
//   vnoise(x, y, period, seed)   値ノイズ。x, y は格子の単位。period ごとにくり返す
//   fbm(x, y, period, octaves, seed)
// どれも 0〜1 を返す。

export function hash(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x, y, p = 256, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const P = Math.max(1, Math.round(p));
  const m = (a) => ((a % P) + P) % P;
  const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, p, oct = 4, s = 0, gain = 0.5) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, p * f, s + i * 31);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

/** 細胞ノイズ（近い点までの距離。0 に近いほど点の中心）。ひび・石・水しみの形に。 */
export function cell(x, y, p, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const P = Math.max(1, Math.round(p));
  const m = (a) => ((a % P) + P) % P;
  let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const px = cx + hash(m(cx), m(cy), s), py = cy + hash(m(cx), m(cy), s + 7);
    const d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}

/** シード付きの乱数（mulberry32）。 */
export function rand(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
