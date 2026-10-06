// 文字や絵のあるテクスチャ：駅の案内板、駅名標、自販機、壁画、路線図、時計、発車標、ポスター、券売機、車両など。
// どれも canvas に描き、最後に「古びさせる」処理（汚れ・色あせ・錆の筋）をかける。
import { canvas, texture, JP_SANS, JP_SERIF, JP_ROUND, fields, sampleField } from './tex.js';
import { fbm, rand, clamp01, smooth } from './noise.js';

const NAVY = '#1f3157';
/** この駅の線（西から東へ）。時刻表のポスター（public/tex/timetable.jpg）と同じ。 */
export const LINE_STATIONS = ['海ヶ浜', '潮見台', '月見坂', '風の丘', '山ノ原'];
const OTHER_STATIONS = ['桜川', '本町', '若葉', '旭ヶ丘', '中央', '港', '緑町', '宮前', '鈴原', '野辺山'];

/** 古びさせる：色あせ（灰色に寄せる）、汚れのむら、下に垂れた錆・水の筋、小さな傷。 */
export function weather(c, { amount = 0.5, seed = 1, fade = 0.25, streaks = 0.5, edge = 0.4 } = {}) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const W = c.width, H = c.height;
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const r = rand(seed);
  const F = fields();
  const ox = r.range(0, 256), oy = r.range(0, 256);
  const sc = 256 / Math.max(W, H);   // 長い辺 = 場の 1 周期
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const n = sampleField(F.big, x * sc + ox, y * sc + oy) * 0.7 + sampleField(F.mid, x * sc + oy, y * sc + ox) * 0.3;
    const n2 = sampleField(F.fine, x * sc + oy, y * sc + ox);
    const stv = sampleField(F.fine, x * sc * 3 + ox, y * sc * 0.12 + oy);
    const st = smooth(0.62, 0.8, stv) * streaks * smooth(0.2, 1, y / H);
    const ed = Math.min(x / W, y / H, 1 - x / W, 1 - y / H);
    const edd = smooth(0.08, 0, ed) * edge;
    let R = d[i], G = d[i + 1], B = d[i + 2];
    const l = R * 0.3 + G * 0.59 + B * 0.11;
    const f = fade + n * 0.25;
    R += (l - R) * f; G += (l - G) * f; B += (l - B) * f;            // 色あせ
    R += (235 - R) * fade * 0.25; G += (230 - G) * fade * 0.25; B += (220 - B) * fade * 0.25;  // 日焼けで白っぽく
    const dirt = clamp01(smooth(0.4, 0.9, n) * amount + n2 * 0.15 * amount + edd + st * 0.6);
    R = R * (1 - dirt * 0.55) + 70 * dirt * 0.55;
    G = G * (1 - dirt * 0.55) + 56 * dirt * 0.55;
    B = B * (1 - dirt * 0.55) + 40 * dirt * 0.55;
    d[i] = R; d[i + 1] = G; d[i + 2] = B;
  }
  g.putImageData(img, 0, 0);
  // 傷
  g.save();
  g.globalAlpha = 0.25 * amount;
  g.strokeStyle = '#d8d0c0';
  for (let k = 0; k < 30 * amount; k++) {
    g.lineWidth = r.range(0.5, 1.5);
    g.beginPath();
    const x = r.range(0, W), y = r.range(0, H), a = r.range(0, 6.28), L = r.range(5, 40);
    g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  g.restore();
  return c;
}

/** はがれ（ところどころ下地の色が見える）。 */
function peel(g, W, H, seed, amount = 0.3, under = '#cfc8b8', size = 1) {
  const r = rand(seed);
  g.save();
  g.fillStyle = under;
  for (let k = 0; k < 14 * amount; k++) {
    const cx = r.range(0, W), cy = r.range(0, H), rad = r.range(8, 50) * (W / 1024 + 0.5) * size;
    g.beginPath();
    const n = r.int(6, 10);
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.28, rr = rad * r.range(0.4, 1.1); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  g.restore();
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ---------------------------------------------------------------- ピクトグラム
export function pictogram(g, kind, x, y, s, col = '#fff') {
  g.save();
  g.translate(x, y);
  g.scale(s / 100, s / 100);
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineWidth = 8;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (kind === 'train') {
    roundRect(g, 18, 8, 64, 70, 14); g.fill();
    g.fillStyle = NAVY;
    roundRect(g, 26, 18, 48, 26, 5); g.fill();
    g.beginPath(); g.arc(32, 60, 6, 0, 6.28); g.fill();
    g.beginPath(); g.arc(68, 60, 6, 0, 6.28); g.fill();
    g.fillStyle = col;
    g.beginPath(); g.moveTo(30, 80); g.lineTo(20, 96); g.moveTo(70, 80); g.lineTo(80, 96); g.stroke();
  } else if (kind === 'arrowL' || kind === 'arrowR' || kind === 'arrowU' || kind === 'arrowD') {
    const rot = { arrowL: Math.PI, arrowR: 0, arrowU: -Math.PI / 2, arrowD: Math.PI / 2 }[kind];
    g.translate(50, 50); g.rotate(rot); g.translate(-50, -50);
    g.beginPath();
    g.moveTo(10, 42); g.lineTo(58, 42); g.lineTo(58, 22); g.lineTo(92, 50); g.lineTo(58, 78); g.lineTo(58, 58); g.lineTo(10, 58);
    g.closePath(); g.fill();
  } else if (kind === 'stairsDown') {
    g.beginPath();
    g.moveTo(8, 30); g.lineTo(30, 30); g.lineTo(30, 50); g.lineTo(52, 50); g.lineTo(52, 70); g.lineTo(74, 70); g.lineTo(74, 90); g.lineTo(96, 90);
    g.stroke();
    g.beginPath(); g.arc(58, 14, 7, 0, 6.28); g.fill();
    g.beginPath(); g.moveTo(56, 22); g.lineTo(62, 40); g.lineTo(72, 48); g.moveTo(60, 30); g.lineTo(48, 36); g.stroke();
  } else if (kind === 'exit') {
    g.beginPath(); g.moveTo(12, 8); g.lineTo(60, 8); g.lineTo(60, 92); g.lineTo(12, 92); g.closePath(); g.stroke();
    g.beginPath(); g.arc(72, 22, 8, 0, 6.28); g.fill();
    g.beginPath(); g.moveTo(70, 32); g.lineTo(62, 58); g.lineTo(76, 70); g.lineTo(78, 90); g.moveTo(62, 58); g.lineTo(48, 72); g.moveTo(68, 40); g.lineTo(84, 50); g.moveTo(68, 40); g.lineTo(52, 46); g.stroke();
  } else if (kind === 'ticket') {
    roundRect(g, 10, 24, 80, 52, 6); g.stroke();
    g.beginPath(); g.moveTo(66, 24); g.lineTo(66, 76); g.setLineDash([6, 6]); g.stroke(); g.setLineDash([]);
    g.font = `bold 26px ${JP_SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('¥', 38, 50);
  } else if (kind === 'info') {
    g.beginPath(); g.arc(50, 50, 42, 0, 6.28); g.stroke();
    g.beginPath(); g.arc(50, 28, 7, 0, 6.28); g.fill();
    g.fillRect(43, 42, 14, 36);
  } else if (kind === 'umbrella') {
    g.beginPath(); g.arc(50, 50, 38, Math.PI, 0); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(50, 50); g.lineTo(50, 82); g.arc(42, 82, 8, 0, Math.PI); g.stroke();
  } else if (kind === 'waiting') {
    g.fillRect(12, 56, 76, 10);
    g.fillRect(16, 66, 8, 24); g.fillRect(76, 66, 8, 24);
    g.beginPath(); g.arc(40, 22, 8, 0, 6.28); g.fill();
    g.beginPath(); g.moveTo(40, 32); g.lineTo(40, 54); g.lineTo(58, 54); g.lineTo(58, 76); g.stroke();
  } else if (kind === 'shop') {
    g.beginPath(); g.moveTo(10, 30); g.lineTo(90, 30); g.lineTo(82, 46); g.lineTo(18, 46); g.closePath(); g.fill();
    g.fillRect(18, 50, 8, 40); g.fillRect(74, 50, 8, 40); g.fillRect(14, 86, 72, 6);
    g.fillRect(32, 58, 36, 22);
  } else if (kind === 'phone') {
    g.beginPath(); g.moveTo(22, 30); g.quadraticCurveTo(50, 10, 78, 30); g.lineTo(70, 42); g.lineTo(58, 36); g.lineTo(42, 36); g.lineTo(30, 42); g.closePath(); g.fill();
    roundRect(g, 26, 48, 48, 40, 6); g.fill();
  } else if (kind === 'bolt') {
    g.beginPath(); g.moveTo(58, 6); g.lineTo(22, 56); g.lineTo(46, 56); g.lineTo(38, 94); g.lineTo(78, 40); g.lineTo(54, 40); g.closePath(); g.fill();
  }
  g.restore();
}

// ---------------------------------------------------------------- 案内板
/**
 * 駅の案内板（紺地に白文字）。items：[{ icon, text, sub, w }] を左から並べる。
 * yellow: true で出口の黄色い板（黒文字）。
 */
export function guideSign({ w = 1024, h = 256, items = [], yellow = false, seed = 1, bg = null, fg = null, amount = 0.45 } = {}) {
  const { c, g } = canvas(w, h);
  const BG = bg || (yellow ? '#e9c23d' : NAVY);
  const FG = fg || (yellow ? '#1d1d1d' : '#ffffff');
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = h * 0.03;
  g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
  let x = h * 0.18;
  const total = items.reduce((s, it) => s + (it.w || 1), 0);
  const unit = (w - h * 0.36) / total;
  for (const it of items) {
    const iw = unit * (it.w || 1);
    let tx = x;
    if (it.icon) {
      const s = h * 0.62;
      if (it.iconBox) { g.fillStyle = FG; g.fillRect(x, (h - s) / 2, s, s); pictogram(g, it.icon, x + s * 0.1, (h - s) / 2 + s * 0.1, s * 0.8, BG); }
      else pictogram(g, it.icon, x, (h - s) / 2, s, FG);
      tx = x + s + h * 0.12;
    }
    if (it.text) {
      g.fillStyle = FG;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      const fs = it.size || h * (it.sub ? 0.36 : 0.44);
      g.font = `bold ${fs}px ${JP_SANS}`;
      const maxW = x + iw - tx - h * 0.1;
      g.fillText(it.text, tx, h * (it.sub ? 0.4 : 0.5), maxW);
      if (it.sub) {
        g.font = `${h * 0.17}px ${JP_SANS}`;
        g.globalAlpha = 0.85;
        g.fillText(it.sub, tx, h * 0.76, maxW);
        g.globalAlpha = 1;
      }
    }
    x += iw;
  }
  weather(c, { amount, seed, fade: 0.2, streaks: 0.6 });
  return texture(c, { wrap: false });
}

/** 駅名標（白地に、線の色の帯。となりの駅）。 */
export function stationNameSign({ w = 1024, h = 512, seed = 3 } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#f2efe6';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2d8a5e';
  g.fillRect(0, h * 0.62, w, h * 0.12);
  g.fillStyle = '#1a1a1a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${h * 0.3}px ${JP_SANS}`;
  g.fillText('月見坂', w / 2, h * 0.24);
  g.font = `${h * 0.1}px ${JP_SANS}`;
  g.fillText('つきみざか　　Tsukimizaka', w / 2, h * 0.49);
  g.font = `bold ${h * 0.08}px ${JP_SANS}`;
  g.fillStyle = '#fff';
  g.textAlign = 'left';
  g.fillText('◀ しおみだい', w * 0.03, h * 0.68);
  g.textAlign = 'right';
  g.fillText('かぜのおか ▶', w * 0.97, h * 0.68);
  g.fillStyle = '#333';
  g.font = `${h * 0.075}px ${JP_SANS}`;
  g.textAlign = 'left';
  g.fillText('潮見台　Shiomidai', w * 0.03, h * 0.85);
  g.textAlign = 'right';
  g.fillText('風の丘　Kazenooka', w * 0.97, h * 0.85);
  peel(g, w, h, seed, 0.35, '#d8d2c4');
  weather(c, { amount: 0.6, seed, fade: 0.3, streaks: 0.8 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 自販機
/** 自販機の前面。variant 0 = 赤、1 = 白と青。lit：明かりがついているか（電気が戻ったあと）。 */
export function vendingFront({ variant = 0, lit = false, seed = 5 } = {}) {
  const w = 512, h = 1024;
  const { c, g } = canvas(w, h);
  const r = rand(seed + variant * 7);
  const body = variant === 0 ? '#b8302c' : '#e8e8e2';
  const trim = variant === 0 ? '#7e1d1b' : '#2a6cb0';
  g.fillStyle = body;
  g.fillRect(0, 0, w, h);
  // 商品の窓
  const wx = 30, wy = 40, ww = w - 60, wh = 560;
  g.fillStyle = lit ? '#f4f7f2' : '#3d4244';
  g.fillRect(wx, wy, ww, wh);
  const cols = 6, rows = 3;
  const cw = ww / cols, rh = wh / rows;
  const colors = ['#d43c3c', '#2e6fbe', '#f0c419', '#2e9c5a', '#ffffff', '#f08a24', '#8b4ac2', '#3a3a3a', '#86c5e8', '#c9a77c'];
  for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
    const x = wx + cx * cw, y = wy + ry * rh;
    const can = r.pick(colors);
    const empty = r() < 0.12;
    if (!empty) {
      // 缶（円柱を正面から）
      const grd = g.createLinearGradient(x + 12, 0, x + cw - 12, 0);
      grd.addColorStop(0, can); grd.addColorStop(0.35, '#ffffff'); grd.addColorStop(0.5, can); grd.addColorStop(1, '#111');
      g.fillStyle = grd;
      roundRect(g, x + 14, y + 22, cw - 28, rh - 92, 10); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(x + 18, y + 40 + r.range(0, 30), cw - 36, 10);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 14, y + 22, cw - 28, 8);
    }
    // 値段と「つめた〜い」の札
    g.fillStyle = r() < 0.25 ? '#d22' : '#1e5bb5';
    g.fillRect(x + 6, y + rh - 64, cw - 12, 18);
    g.fillStyle = '#fff';
    g.font = `bold 13px ${JP_SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(r() < 0.3 ? 'あたたか〜い' : 'つめた〜い', x + cw / 2, y + rh - 55, cw - 14);
    g.fillStyle = '#111';
    g.fillRect(x + 8, y + rh - 42, cw - 16, 22);
    g.fillStyle = lit ? '#ff5a2a' : '#4a3a30';
    g.font = `bold 16px ${JP_SANS}`;
    g.fillText(String(r.pick([100, 120, 130, 150])), x + cw / 2, y + rh - 31);
    // ボタン
    g.fillStyle = lit && !empty ? '#ffe36a' : '#7c7a70';
    roundRect(g, x + cw / 2 - 14, y + rh - 16, 28, 12, 4); g.fill();
  }
  // 窓の汚れと反射
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + ww * 0.4, wy); g.lineTo(wx, wy + wh * 0.6); g.closePath(); g.fill();
  // 下の部分：ロゴ・お金を入れるところ・取り出し口
  g.fillStyle = trim;
  g.fillRect(0, 620, w, 90);
  g.fillStyle = variant === 0 ? '#fff' : '#fff';
  g.font = `bold italic 54px ${JP_ROUND}`;
  g.textAlign = 'center';
  g.fillText(variant === 0 ? 'ひかりドリンク' : 'つきみ ソーダ', w / 2, 667);
  g.fillStyle = '#1c1c1c';
  g.fillRect(330, 730, 150, 120);
  g.fillStyle = lit ? '#8aff6a' : '#2e3a2a';
  g.fillRect(345, 745, 120, 30);
  g.fillStyle = '#999';
  g.fillRect(350, 790, 40, 8); g.fillRect(410, 790, 50, 40);
  g.fillStyle = '#121212';
  g.fillRect(40, 880, 300, 100);
  g.fillStyle = '#2a2a2a';
  g.fillRect(50, 890, 280, 50);
  g.fillStyle = body;
  g.font = `bold 22px ${JP_SANS}`;
  g.fillStyle = variant === 0 ? '#ffd6c8' : '#2a6cb0';
  g.fillText('とりだしぐち', 190, 960);
  peel(g, w, h, seed + variant, 0.3, variant === 0 ? '#c8c0b0' : '#b8b2a4');
  weather(c, { amount: 0.55, seed: seed + variant, fade: lit ? 0.1 : 0.25, streaks: 0.7 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 壁画（富士山と桜）
export function mural({ w = 1536, h = 768, seed = 7 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  // 空
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5f8fbf');
  sky.addColorStop(0.55, '#a9c8dc');
  sky.addColorStop(1, '#e6ddc8');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  // 雲（横長）
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 9; i++) {
    const x = r.range(0, w), y = r.range(h * 0.08, h * 0.35);
    for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + k * 40 + r.range(-10, 10), y + r.range(-8, 8), r.range(40, 90), r.range(10, 20), 0, 0, 6.28); g.fill(); }
  }
  // 遠い山なみ
  g.fillStyle = '#7d95a8';
  g.beginPath(); g.moveTo(0, h * 0.68);
  for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.66 - Math.sin(x * 0.006) * 30 - fbm(x * 0.01, 1, 4096, 3, 3) * 50);
  g.lineTo(w, h); g.lineTo(0, h); g.fill();
  // 富士山
  const fx = w * 0.56, peak = h * 0.16, base = h * 0.78;
  const fuji = g.createLinearGradient(0, peak, 0, base);
  fuji.addColorStop(0, '#4f6d93'); fuji.addColorStop(1, '#2f4a6e');
  g.fillStyle = fuji;
  g.beginPath();
  g.moveTo(fx - w * 0.42, base);
  g.quadraticCurveTo(fx - w * 0.16, base - h * 0.2, fx - w * 0.055, peak + 6);
  g.lineTo(fx + w * 0.055, peak + 6);
  g.quadraticCurveTo(fx + w * 0.16, base - h * 0.2, fx + w * 0.42, base);
  g.closePath(); g.fill();
  // 雪
  g.fillStyle = '#f4f6f8';
  g.beginPath();
  g.moveTo(fx - w * 0.055, peak + 6);
  g.lineTo(fx + w * 0.055, peak + 6);
  g.lineTo(fx + w * 0.1, peak + h * 0.1);
  for (let i = 0; i < 9; i++) { const t = i / 8; g.lineTo(fx + w * 0.1 - t * w * 0.2, peak + h * (0.1 + (i % 2 ? 0.06 : 0) + r.range(0, 0.03))); }
  g.lineTo(fx - w * 0.1, peak + h * 0.1);
  g.closePath(); g.fill();
  // 湖と町
  g.fillStyle = '#6f9ab8';
  g.fillRect(0, h * 0.8, w, h * 0.2);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 40; i++) g.fillRect(r.range(0, w), r.range(h * 0.81, h), r.range(20, 80), 2);
  g.fillStyle = '#3e5a46';
  g.beginPath(); g.moveTo(0, h * 0.8);
  for (let x = 0; x <= w; x += 12) g.lineTo(x, h * 0.78 - fbm(x * 0.03, 5, 4096, 3, 9) * 26);
  g.lineTo(w, h * 0.8); g.fill();
  // 桜の枝（左上と右）
  const branch = (x, y, ang, len, wd, depth) => {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.strokeStyle = '#3a2a24'; g.lineWidth = wd; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth > 0) {
      branch(x2, y2, ang + r.range(0.15, 0.6), len * 0.72, wd * 0.68, depth - 1);
      branch(x2, y2, ang - r.range(0.15, 0.6), len * 0.72, wd * 0.68, depth - 1);
    } else {
      for (let i = 0; i < 18; i++) {
        g.fillStyle = r() < 0.5 ? '#f3c4d2' : r() < 0.5 ? '#f7dbe3' : '#e9a6bb';
        g.beginPath(); g.arc(x2 + r.range(-26, 26), y2 + r.range(-20, 20), r.range(4, 9), 0, 6.28); g.fill();
      }
    }
  };
  branch(-20, -h * 0.02, 0.3, 170, 20, 4);
  branch(w + 20, h * 0.02, Math.PI - 0.35, 150, 18, 4);
  // 花びら
  for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(246,206,220,0.9)'; g.beginPath(); g.ellipse(r.range(0, w), r.range(0, h), 4, 2.5, r.range(0, 3), 0, 6.28); g.fill(); }
  // 作品の札
  g.fillStyle = 'rgba(240,235,225,0.9)';
  g.fillRect(w - 300, h - 70, 270, 46);
  g.fillStyle = '#333';
  g.font = `${22}px ${JP_SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('「ふるさとの山」 月見坂小学校 卒業制作', w - 165, h - 47, 260);
  peel(g, w, h, seed, 0.45, '#cfc7b6', 0.45);
  weather(c, { amount: 0.75, seed, fade: 0.35, streaks: 1 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 路線図・構内図
export function routeMap({ w = 1024, h = 768, seed = 9 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = '#f1eee4';
  g.fillRect(0, 0, w, h);
  g.fillStyle = NAVY;
  g.fillRect(0, 0, w, 80);
  g.fillStyle = '#fff';
  g.font = `bold 44px ${JP_SANS}`;
  g.textBaseline = 'middle';
  g.fillText('路線図　Route Map', 30, 42);
  const lines = [['#2d8a5e', 0.3], ['#e07b2a', 0.5], ['#3a6fc4', 0.7], ['#c43a5a', 0.86]];
  const stations = [];
  for (const [col, yy] of lines) {
    g.strokeStyle = col; g.lineWidth = 14; g.lineJoin = 'round';
    g.beginPath();
    let x = 60, y = h * yy;
    g.moveTo(x, y);
    const pts = [[x, y]];
    if (col === '#2d8a5e') {
      // この駅の線：海ヶ浜〜山ノ原の 5 駅
      for (let i = 1; i < 5; i++) { x = 60 + i * (w - 140) / 4; y += r.range(-40, 40); y = Math.max(120, Math.min(h - 40, y)); g.lineTo(x, y); pts.push([x, y]); }
      pts.forEach((p, i) => p.push(LINE_STATIONS[i]));
    } else {
      while (x < w - 80) { x += r.range(90, 150); y += r.range(-60, 60); y = Math.max(120, Math.min(h - 40, y)); g.lineTo(x, y); pts.push([x, y]); }
    }
    g.stroke();
    stations.push(...pts);
  }
  for (const [x, y, name] of stations) {
    g.fillStyle = '#fff'; g.strokeStyle = '#333'; g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, 11, 0, 6.28); g.fill(); g.stroke();
    g.fillStyle = '#222';
    g.font = `${name ? 'bold 20px' : '16px'} ${JP_SANS}`;
    if (name !== '月見坂') g.fillText(name || r.pick(OTHER_STATIONS), x + 14, y - 16);
  }
  const [hx, hy] = stations[2];
  g.fillStyle = '#d22';
  g.beginPath(); g.arc(hx, hy, 18, 0, 6.28); g.fill();
  g.fillStyle = '#fff';
  g.font = `bold 15px ${JP_SANS}`;
  g.textAlign = 'center';
  g.fillText('現在地', hx, hy);
  g.fillStyle = '#d22';
  g.font = `bold 22px ${JP_SANS}`;
  g.fillText('月見坂', hx, hy + 36);
  peel(g, w, h, seed, 0.6);
  weather(c, { amount: 0.7, seed, fade: 0.3, streaks: 0.8 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 時計
export function clockFace({ size = 512, seed = 11, small = false } = {}) {
  const { c, g } = canvas(size);
  const R = size / 2;
  g.fillStyle = '#2b2b2b';
  g.beginPath(); g.arc(R, R, R, 0, 6.28); g.fill();
  g.fillStyle = '#f1eee6';
  g.beginPath(); g.arc(R, R, R * 0.9, 0, 6.28); g.fill();
  g.strokeStyle = '#1b1b1b';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    g.lineWidth = big ? size * 0.018 : size * 0.006;
    g.beginPath();
    g.moveTo(R + Math.sin(a) * R * (big ? 0.7 : 0.78), R - Math.cos(a) * R * (big ? 0.7 : 0.78));
    g.lineTo(R + Math.sin(a) * R * 0.85, R - Math.cos(a) * R * 0.85);
    g.stroke();
  }
  if (!small) {
    g.fillStyle = '#1b1b1b';
    g.font = `bold ${size * 0.1}px ${JP_SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillText(String(i), R + Math.sin(a) * R * 0.56, R - Math.cos(a) * R * 0.56);
    }
    g.font = `${size * 0.035}px ${JP_SANS}`;
    g.fillText('TSUKIMIZAKA', R, R + R * 0.3);
  }
  weather(c, { amount: 0.5, seed, fade: 0.2, streaks: 0.4, edge: 0 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 発車標（LED）
export function departureBoard({ lit = false, mode = 'off', w = 1024, h = 256 } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#121416';
  g.fillRect(0, 0, w, h);
  // LED の格子
  const dot = 6;
  g.fillStyle = '#1d2124';
  for (let y = 4; y < h; y += dot) for (let x = 4; x < w; x += dot) g.fillRect(x, y, dot - 2, dot - 2);
  if (lit) {
    // 1 行目は日本語、2 行目は英語（字を小さく）。列：種別・行き先・時刻・状態
    const rows = mode === 'final'
      ? [['臨時', '最終列車', '23:42', 'まもなく'], ['Special', 'Last Train', '23:42', 'Arriving']]
      : [['臨時', '回送', '--:--', ''], ['Special', 'Not in Service', '--:--', '']];
    const cols = ['#ff8a2a', '#ff8a2a', '#ffd26a', '#5aff8a'];
    const xs = [0.02, 0.2, 0.62, 0.79], ws = [0.17, 0.4, 0.16, 0.2];
    g.textBaseline = 'middle';
    rows.forEach((row, i) => {
      const y = h * (0.3 + i * 0.42);
      g.font = `bold ${h * (i === 0 ? 0.3 : 0.2)}px ${JP_SANS}`;
      for (let k = 0; k < 4; k++) { g.fillStyle = cols[k]; g.fillText(row[k], xs[k] * w, y, ws[k] * w); }
    });
    // LED らしく格子で抜く
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < h; y += dot) g.fillRect(0, y, w, 2);
    for (let x = 0; x < w; x += dot) g.fillRect(x, 0, 2, h);
  }
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- ポスター
export function poster({ kind = 'sea', w = 512, h = 724, seed = 13 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (kind === 'sea') {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#3c9ad6'); sky.addColorStop(1, '#bfe6f2');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f7f1df';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(r.range(50, w - 50), r.range(80, 240), 90, 40, 0, 0, 6.28); g.fill(); }
    g.fillStyle = '#1f6aa8'; g.fillRect(0, h * 0.55, w, h * 0.2);
    g.fillStyle = '#ead9a8'; g.fillRect(0, h * 0.75, w, h * 0.25);
    g.fillStyle = '#d33b3b';
    g.beginPath(); g.moveTo(w * 0.7, h * 0.78); g.lineTo(w * 0.85, h * 0.62); g.lineTo(w * 1.0, h * 0.78); g.fill();
    g.fillStyle = '#fff';
    g.font = `bold 64px ${JP_SERIF}`;
    g.fillText('海ヶ浜へ', w / 2, h * 0.14);
    g.font = `24px ${JP_SANS}`;
    g.fillStyle = '#123';
    g.fillText('夏の青い一日を。', w / 2, h * 0.86);
    g.font = `18px ${JP_SANS}`;
    g.fillText('月見坂から　各駅停車で12分', w / 2, h * 0.92);
  } else if (kind === 'festival') {
    g.fillStyle = '#1d2048'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      const x = r.range(80, w - 80), y = r.range(100, h * 0.5), rad = r.range(50, 110);
      const col = r.pick(['#ff6a6a', '#ffd34a', '#7affc2', '#8ab4ff', '#ff9ae0']);
      g.strokeStyle = col; g.lineWidth = 3;
      for (let k = 0; k < 24; k++) { const a = (k / 24) * 6.28; g.beginPath(); g.moveTo(x + Math.cos(a) * rad * 0.2, y + Math.sin(a) * rad * 0.2); g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); g.stroke(); }
    }
    g.fillStyle = '#f2e6c8';
    g.font = `bold 66px ${JP_SERIF}`;
    g.fillText('月見坂', w / 2, h * 0.63);
    g.fillText('夏まつり', w / 2, h * 0.74);
    g.font = `22px ${JP_SANS}`;
    g.fillText('八月十五日　花火大会　午後七時より', w / 2, h * 0.86);
    // ちょうちん
    for (let i = 0; i < 7; i++) { g.fillStyle = '#e0452f'; g.beginPath(); g.ellipse(40 + i * 72, h * 0.97, 22, 16, 0, 0, 6.28); g.fill(); }
  } else if (kind === 'cat') {
    g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c22';
    g.font = `bold 60px ${JP_SANS}`;
    g.fillText('さがしています', w / 2, 70);
    g.fillStyle = '#ddd';
    g.fillRect(70, 120, w - 140, 300);
    // ねこの絵（茶トラ）
    g.fillStyle = '#d98a3a';
    g.beginPath(); g.ellipse(w / 2, 300, 110, 80, 0, 0, 6.28); g.fill();
    g.beginPath(); g.arc(w / 2, 200, 70, 0, 6.28); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 60, 160); g.lineTo(w / 2 - 40, 110); g.lineTo(w / 2 - 15, 150); g.fill();
    g.beginPath(); g.moveTo(w / 2 + 60, 160); g.lineTo(w / 2 + 40, 110); g.lineTo(w / 2 + 15, 150); g.fill();
    g.fillStyle = '#222';
    g.beginPath(); g.arc(w / 2 - 25, 200, 7, 0, 6.28); g.arc(w / 2 + 25, 200, 7, 0, 6.28); g.fill();
    g.fillStyle = '#222';
    g.font = `bold 34px ${JP_SANS}`;
    g.fillText('なまえ：こむぎ', w / 2, 470);
    g.font = `24px ${JP_SANS}`;
    g.fillText('茶トラ・オス・しっぽが短い', w / 2, 520);
    g.fillText('駅のまわりで見かけたら', w / 2, 580);
    g.fillText('ご連絡ください', w / 2, 615);
    g.font = `20px ${JP_SANS}`;
    g.fillText('TEL 0xx-xxx-xxxx', w / 2, 670);
  } else if (kind === 'safety') {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e83a2a'; g.fillRect(0, 0, w, 150);
    g.fillStyle = '#fff';
    g.font = `bold 52px ${JP_SANS}`;
    g.fillText('かけこみ乗車は', w / 2, 55);
    g.fillText('おやめください', w / 2, 112);
    g.fillStyle = '#2a6cb0';
    g.beginPath(); g.arc(w / 2, 380, 150, 0, 6.28); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(w / 2 - 20, 300, 26, 0, 6.28); g.fill();
    g.lineWidth = 18; g.strokeStyle = '#fff'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w / 2 - 25, 330); g.lineTo(w / 2 - 5, 410); g.lineTo(w / 2 + 40, 470); g.moveTo(w / 2 - 5, 410); g.lineTo(w / 2 - 60, 460); g.moveTo(w / 2 - 15, 360); g.lineTo(w / 2 + 50, 340); g.stroke();
    g.fillStyle = '#333';
    g.font = `26px ${JP_SANS}`;
    g.fillText('つぎの電車をお待ちください。', w / 2, 600);
    g.font = `18px ${JP_SANS}`;
    g.fillText('月見坂駅', w / 2, 660);
  } else if (kind === 'notice') {
    g.fillStyle = '#f7f3e8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#222';
    g.font = `bold 42px ${JP_SANS}`;
    g.fillText('お知らせ', w / 2, 70);
    g.font = `24px ${JP_SANS}`;
    g.textAlign = 'left';
    const lines = ['本日の最終列車は', '23時42分発の臨時列車です。', '', 'お忘れ物のないよう', 'ご注意ください。', '', 'お忘れ物は', '忘れ物センターで', 'おあずかりしています。', '', '月見坂駅長'];
    lines.forEach((l, i) => g.fillText(l, 60, 160 + i * 42));
  }
  weather(c, { amount: 0.6, seed, fade: 0.4, streaks: 0.6 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 券売機・運賃表
export function ticketMachineFront({ lit = false, seed = 15 } = {}) {
  const w = 512, h = 768;
  const { c, g } = canvas(w, h);
  g.fillStyle = '#c9c6bd'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9e7e0'; g.fillRect(20, 20, w - 40, 90);
  g.fillStyle = '#2a6cb0';
  g.font = `bold 40px ${JP_SANS}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('きっぷ', w / 2, 65);
  // 画面
  g.fillStyle = lit ? '#cfe8ff' : '#1d2226';
  g.fillRect(50, 140, w - 100, 320);
  if (lit) {
    g.fillStyle = '#1e5bb5';
    g.font = `bold 26px ${JP_SANS}`;
    g.fillText('きっぷを おとりください', w / 2, 175);
    const fares = [140, 180, 220, 260, 320, 380];
    fares.forEach((f, i) => {
      const x = 75 + (i % 3) * 125, y = 215 + Math.floor(i / 3) * 110;
      g.fillStyle = f === 320 ? '#ffe36a' : '#fff';
      roundRect(g, x, y, 110, 90, 8); g.fill();
      g.fillStyle = '#123';
      g.font = `bold 34px ${JP_SANS}`;
      g.fillText(String(f), x + 55, y + 45);
    });
  }
  g.fillStyle = '#2a2a2a';
  g.fillRect(80, 500, 120, 24); g.fillRect(300, 500, 140, 60);
  g.fillStyle = '#555';
  g.fillRect(90, 560, 330, 120);
  g.fillStyle = '#111';
  g.fillRect(110, 590, 290, 40);
  g.fillStyle = '#333';
  g.font = `bold 20px ${JP_SANS}`;
  g.fillStyle = '#eee';
  g.fillText('きっぷ・おつり', w / 2, 660);
  weather(c, { amount: 0.55, seed, fade: 0.2, streaks: 0.6 });
  return texture(c, { wrap: false });
}

export function fareChart({ w = 1024, h = 384, seed = 17 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, w, h);
  const ly = h * 0.6;
  const xs = LINE_STATIONS.map((_, i) => 110 + i * (w - 220) / 4);
  // 潮見台から分かれる線（上と下へ）
  g.strokeStyle = '#e07b2a'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(xs[1], 70); g.lineTo(xs[1], h - 30); g.stroke();
  g.strokeStyle = '#2d8a5e';
  g.beginPath(); g.moveTo(40, ly); g.lineTo(w - 40, ly); g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const dot = (x, y) => { g.fillStyle = '#fff'; g.strokeStyle = '#333'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 10, 0, 6.28); g.fill(); g.stroke(); };
  const fare = (x, y, yen) => { g.fillStyle = '#1e5bb5'; g.font = `bold 20px ${JP_SANS}`; g.fillText(String(yen), x, y); };
  LINE_STATIONS.forEach((name, i) => {
    dot(xs[i], ly);
    g.fillStyle = name === '月見坂' ? '#d22' : '#222';
    g.font = `bold 20px ${JP_SANS}`;
    g.fillText(name, xs[i] + (i === 1 ? 52 : 0), ly - 30);
    if (name === '月見坂') { g.font = `bold 18px ${JP_SANS}`; g.fillText('当駅', xs[i], ly + 32); }
    else fare(xs[i], ly + 32, 140 + (Math.abs(i - 2) - 1) * 80);
  });
  const names = [...OTHER_STATIONS];
  for (const [y, yen] of [[100, 300], [170, 260], [h - 60, 260]]) {
    dot(xs[1], y);
    g.fillStyle = '#222';
    g.font = `16px ${JP_SANS}`;
    g.textAlign = 'left';
    g.fillText(names.splice(r.int(0, names.length - 1), 1)[0], xs[1] + 18, y);
    g.textAlign = 'center';
    fare(xs[1] - 44, y, yen);
  }
  g.fillStyle = NAVY;
  g.fillRect(0, 0, w, 44);
  g.fillStyle = '#fff';
  g.font = `bold 26px ${JP_SANS}`;
  g.textAlign = 'left';
  g.fillText('運賃表　Fares（円）', 20, 24);
  weather(c, { amount: 0.6, seed, fade: 0.3, streaks: 0.7 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 車両の側面
export function trainSide({ w = 2048, h = 512, seed = 19, lit = false, ghost = false } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  // ステンレスの地（細い横の筋）
  const base = ghost ? '#e8f0ff' : '#b9bcbd';
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  if (!ghost) for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(${r() < 0.5 ? 255 : 0},${r() < 0.5 ? 255 : 0},255,${r.range(0.02, 0.06)})`; g.fillRect(0, y, w, 1); }
  // 帯
  g.fillStyle = ghost ? '#ffd9a0' : '#e0782a';
  g.fillRect(0, h * 0.7, w, h * 0.06);
  g.fillStyle = ghost ? '#bfe8c8' : '#2d8a5e';
  g.fillRect(0, h * 0.77, w, h * 0.05);
  // 窓と扉
  const doors = [0.12, 0.37, 0.63, 0.88];
  for (const d of doors) {
    const x = d * w;
    g.fillStyle = ghost ? '#fff7e0' : '#8d9091';
    g.fillRect(x - w * 0.035, h * 0.12, w * 0.07, h * 0.85);
    g.fillStyle = lit || ghost ? '#fff1c8' : '#1f2a30';
    g.fillRect(x - w * 0.028, h * 0.2, w * 0.024, h * 0.32);
    g.fillRect(x + w * 0.004, h * 0.2, w * 0.024, h * 0.32);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, h * 0.12); g.lineTo(x, h * 0.97); g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x0 = (doors[i] + 0.05) * w, x1 = (doors[i + 1] - 0.05) * w;
    g.fillStyle = lit || ghost ? '#ffe9b8' : '#25333a';
    g.fillRect(x0, h * 0.2, x1 - x0, h * 0.35);
    if (!lit && !ghost) {
      g.fillStyle = 'rgba(160,200,210,0.18)';
      g.beginPath(); g.moveTo(x0, h * 0.2); g.lineTo(x0 + (x1 - x0) * 0.4, h * 0.2); g.lineTo(x0, h * 0.5); g.fill();
    }
    g.strokeStyle = '#6d7072'; g.lineWidth = 6;
    g.strokeRect(x0, h * 0.2, x1 - x0, h * 0.35);
    g.beginPath(); g.moveTo((x0 + x1) / 2, h * 0.2); g.lineTo((x0 + x1) / 2, h * 0.55); g.stroke();
  }
  g.fillStyle = ghost ? '#666' : '#333';
  g.font = `bold 28px ${JP_SANS}`;
  g.fillText('モハ 3742', w * 0.5, h * 0.66);
  if (!ghost) weather(c, { amount: 0.8, seed, fade: 0.15, streaks: 1, edge: 0.6 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 小物のテクスチャ
export function postcardTex() {
  const { c, g } = canvas(512, 340);
  const sky = g.createLinearGradient(0, 0, 0, 340);
  sky.addColorStop(0, '#6aa6d6'); sky.addColorStop(1, '#f2d9b0');
  g.fillStyle = sky; g.fillRect(0, 0, 512, 340);
  g.fillStyle = '#3f5f86';
  g.beginPath(); g.moveTo(40, 300); g.quadraticCurveTo(200, 200, 230, 90); g.lineTo(290, 90); g.quadraticCurveTo(320, 200, 480, 300); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(230, 90); g.lineTo(290, 90); g.lineTo(312, 140); g.lineTo(285, 130); g.lineTo(262, 150); g.lineTo(238, 128); g.lineTo(208, 140); g.fill();
  g.fillStyle = '#3e6a4a'; g.fillRect(0, 300, 512, 40);
  g.strokeStyle = '#fff'; g.lineWidth = 12; g.strokeRect(6, 6, 500, 328);
  g.fillStyle = '#fff';
  g.font = `bold 26px ${JP_SERIF}`;
  g.fillText('ふじのみえるまち', 24, 40);
  weather(c, { amount: 0.4, seed: 21, fade: 0.25, streaks: 0.2 });
  return texture(c, { wrap: false });
}

export function ticketTex() {
  const { c, g } = canvas(256, 128);
  g.fillStyle = '#e8d9a8'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(160,120,60,0.35)';
  for (let i = 0; i < 20; i++) { g.beginPath(); g.moveTo(0, i * 7); g.lineTo(256, i * 7 + 20); g.stroke(); }
  g.fillStyle = '#222';
  g.font = `bold 22px ${JP_SANS}`;
  g.fillText('月見坂 → 海ヶ浜', 14, 36);
  g.font = `16px ${JP_SANS}`;
  g.fillText('乗車券　220円', 14, 66);
  g.fillText('当日限り有効　下車前途無効', 14, 92);
  g.fillStyle = '#c33';
  g.fillText('8.15', 200, 112);
  return texture(c, { wrap: false });
}

export function sketchTex() {
  const { c, g } = canvas(512, 384);
  g.fillStyle = '#fbf8ee'; g.fillRect(0, 0, 512, 384);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 子どもの絵：駅とロボット
  g.strokeStyle = '#5a4a3a'; g.lineWidth = 4;
  g.strokeRect(40, 120, 240, 160);
  g.beginPath(); g.moveTo(30, 125); g.lineTo(160, 60); g.lineTo(290, 125); g.stroke();
  g.fillStyle = '#e66'; g.fillRect(140, 200, 50, 80);
  g.fillStyle = '#7bd'; g.fillRect(60, 150, 50, 40); g.fillRect(210, 150, 50, 40);
  // ロボ（白い丸い頭・青い目・ランタン）
  g.strokeStyle = '#333'; g.lineWidth = 4; g.fillStyle = '#fff';
  g.beginPath(); g.arc(380, 170, 46, 0, 6.28); g.fill(); g.stroke();
  g.fillStyle = '#39c'; g.beginPath(); g.arc(365, 170, 8, 0, 6.28); g.arc(395, 170, 8, 0, 6.28); g.fill();
  g.fillStyle = '#fff'; g.fillRect(352, 214, 56, 70); g.strokeRect(352, 214, 56, 70);
  g.beginPath(); g.moveTo(408, 230); g.lineTo(440, 260); g.stroke();
  g.fillStyle = '#fc4'; g.beginPath(); g.arc(446, 276, 14, 0, 6.28); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(365, 284); g.lineTo(360, 320); g.moveTo(395, 284); g.lineTo(400, 320); g.stroke();
  // 太陽
  g.fillStyle = '#f93'; g.beginPath(); g.arc(470, 50, 26, 0, 6.28); g.fill();
  g.fillStyle = '#e44';
  g.font = `bold 34px ${JP_ROUND}`;
  g.fillText('トモくん いつも ありがとう', 30, 350);
  g.fillStyle = '#58a';
  g.font = `22px ${JP_ROUND}`;
  g.fillText('つきみざかえき', 60, 105);
  return texture(c, { wrap: false });
}

export function strawTex() {
  const { c, g } = canvas(256);
  g.fillStyle = '#d8b56a'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) for (let x = 0; x < 256; x += 8) {
    g.fillStyle = (x / 8 + y / 8) % 2 ? '#c9a259' : '#e6c983';
    g.fillRect(x, y, 8, 8);
  }
  weather(c, { amount: 0.3, seed: 23, fade: 0.1, streaks: 0, edge: 0 });
  return texture(c);
}

/** 公衆電話・駅務室などで使う小さな札。 */
export function smallLabel(text, { w = 512, h = 128, bg = '#f2efe6', fg = '#222', seed = 29, font = JP_SANS, bold = true } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `${bold ? 'bold ' : ''}${h * 0.5}px ${font}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2, w * 0.92);
  weather(c, { amount: 0.5, seed, fade: 0.3, streaks: 0.5 });
  return texture(c, { wrap: false });
}

/** 駅の構内図（ゲームの地図と同じ形を描く）。draw(g, w, h) で中身を描いてもらう。 */
export function stationMapBoard(drawPlan, { w = 1024, h = 768, seed = 31 } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#eef0ec'; g.fillRect(0, 0, w, h);
  g.fillStyle = NAVY; g.fillRect(0, 0, w, 70);
  g.fillStyle = '#fff';
  g.font = `bold 40px ${JP_SANS}`;
  g.textBaseline = 'middle';
  g.fillText('構内図　Station Map', 26, 36);
  drawPlan?.(g, w, h, 80);
  peel(g, w, h, seed, 0.5, '#d8d4c8');
  weather(c, { amount: 0.6, seed, fade: 0.3, streaks: 0.8 });
  return texture(c, { wrap: false });
}

/** 落書き（チョーク・スプレー）。 */
export function graffiti(text, { w = 512, h = 256, color = '#e8e2d0', seed = 33, font = JP_ROUND } = {}) {
  const { c, g } = canvas(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  g.font = `${h * 0.32}px ${font}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n');
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * h * 0.38, w * 0.95));
  // かすれ
  const img = g.getImageData(0, 0, w, h);
  const r = rand(seed);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] *= 0.55 + r() * 0.45;
  g.putImageData(img, 0, 0);
  return texture(c, { wrap: false });
}

/** 黒板の立て看板（チョークの字）。 */
export function chalkboard(lines, { w = 384, h = 512, seed = 87 } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#5a4430'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#26342c'; g.fillRect(16, 16, w - 32, h - 32);
  g.fillStyle = 'rgba(240,240,230,0.9)';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([text, size, col], i) => {
    g.fillStyle = col || 'rgba(240,240,230,0.9)';
    g.font = `${size || 44}px ${JP_ROUND}`;
    g.fillText(text, w / 2, 70 + i * (h - 120) / Math.max(1, lines.length - 1), w - 50);
  });
  // チョークのかすれ
  const img = g.getImageData(0, 0, w, h);
  const r = rand(seed);
  for (let i = 0; i < img.data.length; i += 4) { if (img.data[i + 1] > 150) { const k = 0.7 + r() * 0.3; img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k; } }
  g.putImageData(img, 0, 0);
  weather(c, { amount: 0.4, seed, fade: 0.1, streaks: 0.3, edge: 0.2 });
  return texture(c, { wrap: false });
}

/** 雑誌の表紙（色と見出しだけ）。 */
export function magazineRack({ w = 512, h = 256, seed = 89 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = '#3a3530'; g.fillRect(0, 0, w, h);
  const cols = ['#e05a4a', '#f0c040', '#4a90d0', '#60b070', '#e88ab0', '#f2f0e8', '#8060c0'];
  for (let i = 0; i < 8; i++) {
    const x = 8 + i * 63, y = 10 + (i % 2) * 8;
    g.fillStyle = r.pick(cols);
    g.fillRect(x, y, 56, h - 30);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(x + 4, y + 8, 48, 18);
    g.fillStyle = '#222';
    g.font = `bold 13px ${JP_SANS}`;
    g.textAlign = 'center';
    g.fillText(r.pick(['夏号', '旅', 'まんが', '電車', '花火', '海', 'ラジオ']), x + 28, y + 18);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(x + 6, y + 40, 44, 70);
  }
  weather(c, { amount: 0.5, seed, fade: 0.35, streaks: 0.3 });
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- 画像の素材（public/tex/。たぬが ChatGPT で作った絵）
// カレンダー・落書き・時刻表の 3 枚。読みこめなかったとき（確認台など）は、文字だけの札で代える。
const pictures = {};
/** 読みこんだ画像（HTMLImageElement、なければ null）を渡す。 */
export function setPictures(p) { Object.assign(pictures, p); }

/** 赤ペンの線（少しふるえる）。 */
function penStroke(g, pts, r, wobble) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x + r.range(-wobble, wobble), y + r.range(-wobble, wobble)) : g.moveTo(x, y)));
  g.stroke();
}

/** 壁掛けのカレンダー（8 月）。上に綴じ具。14 日までに×、15 日（駅の最後の日）に赤い丸。 */
export function calendar({ w = 768, h = 620, seed = 63 } = {}) {
  const img = pictures.calendar;
  if (!img) return smallLabel('8月', { w: 256, h: 340, seed, bg: '#f4f1ea' });
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h);
  const top = 46, pad = 12;
  const s = (w - pad * 2) / img.width;
  const x0 = pad, y0 = top + 8;
  g.drawImage(img, x0, y0, img.width * s, img.height * s);
  // 日付のマス（元の絵 1024×768 の座標）
  const K = img.width / 1448;
  const cx = (col) => (25 + (col + 0.5) * 199.6) * K, cy = (row) => [406, 548, 692, 837, 982][row] * K;
  g.save();
  g.translate(x0, y0);
  g.scale(s, s);
  g.strokeStyle = 'rgba(196, 40, 40, 0.82)';
  g.lineCap = 'round';
  g.lineWidth = 7 * K;
  for (let d = 1; d <= 14; d++) {
    const i = d + 2, col = i % 7, row = Math.floor(i / 7);
    const x = cx(col) + r.range(-6, 6) * K, y = cy(row) + r.range(-4, 4) * K, a = 34 * K;
    penStroke(g, [[x - a, y - a * 0.8], [x, y], [x + a, y + a * 0.8]], r, 2 * K);
    penStroke(g, [[x + a, y - a * 0.8], [x, y], [x - a, y + a * 0.8]], r, 2 * K);
  }
  // 15 日：二重にぐるっと
  g.lineWidth = 6 * K;
  const x = cx(3), y = cy(2);
  g.beginPath();
  for (let k = 0; k <= 64; k++) {
    const t = (k / 64) * Math.PI * 2.3 - 0.4, rr = (62 + Math.sin(t * 3) * 3) * K;
    const px = x + Math.cos(t) * rr * 1.25, py = y + Math.sin(t) * rr * 0.92 + t * 1.5 * K;
    k ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.stroke();
  g.restore();
  // 綴じ具（黒い帯と、つるす穴）
  g.fillStyle = '#26272b'; g.fillRect(0, 0, w, top);
  g.fillStyle = '#4a4b52'; g.fillRect(0, top - 6, w, 6);
  g.fillStyle = '#d8d2c2';
  g.beginPath(); g.arc(w / 2, top * 0.45, 9, 0, 6.28); g.fill();
  // 紙の日焼け（下ほど黄ばむ）と、しみ
  const grd = g.createLinearGradient(0, top, 0, h);
  grd.addColorStop(0, 'rgba(214, 190, 130, 0.10)'); grd.addColorStop(1, 'rgba(196, 160, 90, 0.26)');
  g.fillStyle = grd; g.fillRect(0, top, w, h - top);
  for (let k = 0; k < 5; k++) {
    const sx = r.range(0, w), sy = r.range(top, h), sr = r.range(14, 48);
    const sg = g.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr);
    sg.addColorStop(0, 'rgba(150, 110, 50, 0.16)'); sg.addColorStop(0.8, 'rgba(150, 110, 50, 0.10)'); sg.addColorStop(1, 'rgba(150, 110, 50, 0)');
    g.fillStyle = sg; g.beginPath(); g.arc(sx, sy, sr, 0, 6.28); g.fill();
  }
  weather(c, { amount: 0.45, seed, fade: 0.3, streaks: 0.35, edge: 0.3 });
  return texture(c, { wrap: false });
}

/** 時刻表のポスター（月見坂駅）。 */
export function timetable({ seed = 61, amount = 0.5 } = {}) {
  const img = pictures.timetable;
  if (!img) return smallLabel('時刻表　月見坂', { w: 512, h: 384, seed });
  const w = 512, h = Math.round((w * img.height) / img.width);
  const { c, g } = canvas(w, h);
  g.drawImage(img, 0, 0, w, h);
  peel(g, w, h, seed, 0.25 * amount, '#d8d2c4', 0.6);
  weather(c, { amount, seed, fade: 0.32, streaks: 0.6 });
  return texture(c, { wrap: false });
}

/** 落書き（「また あおうね」。マーカーの手書き）。白黒の絵の黒いところを、色の線にする。 */
export function graffitiPicture({ color = [30, 34, 52], seed = 67 } = {}) {
  const img = pictures.graffiti;
  if (!img) return graffiti('また あおうね', { seed });
  const w = 768, h = Math.round((w * img.height) / img.width);
  const { c, g } = canvas(w, h);
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h);
  const F = fields();
  const r = rand(seed);
  const ox = r.range(0, 256), oy = r.range(0, 256), sc = 256 / w;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const ink = clamp01((235 - d.data[i]) / 200);
    // かすれ・色あせ（場のむら）
    const n = sampleField(F.mid, x * sc * 2 + ox, y * sc * 2 + oy) * 0.6 + sampleField(F.fine, x * sc * 4 + oy, y * sc * 4 + ox) * 0.4;
    d.data[i] = color[0]; d.data[i + 1] = color[1]; d.data[i + 2] = color[2];
    d.data[i + 3] = 255 * ink * clamp01(0.95 - smooth(0.45, 0.9, n) * 0.6);
  }
  g.putImageData(d, 0, 0);
  return texture(c, { wrap: false });
}

/** 床の格子（グレーチング）。細い板が密に並び、つなぎの棒がまばらに渡る。すき間は透明（アルファ）。 */
export function gratingTex({ size = 256, seed = 71 } = {}) {
  const { c, g } = canvas(size);
  const r = rand(seed);
  g.clearRect(0, 0, size, size);
  g.fillStyle = '#3b3e41';
  for (let x = 4; x < size; x += 18) g.fillRect(x, 0, 6, size);
  g.fillStyle = '#33363a';
  for (let y = 20; y < size; y += 64) g.fillRect(0, y, size, 5);
  // 錆（棒の上だけ）
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 90; k++) {
    g.fillStyle = r() < 0.5 ? 'rgba(122, 78, 44, 0.55)' : 'rgba(84, 60, 40, 0.5)';
    g.beginPath(); g.arc(r.range(0, size), r.range(0, size), r.range(2, 10), 0, 6.28); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return texture(c, { wrap: false });
}

// ---------------------------------------------------------------- クリアのあとに増えるもの（夕方の「つづきから」）
/** 新聞の切り抜き（黄ばんだ紙。見出し・写真・本文）。 */
export function newsClip({ w = 512, h = 640, seed = 75 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.clearRect(0, 0, w, h);
  // はさみで切ったふち（少しがたがた）
  g.fillStyle = '#e8dfc6';
  g.beginPath();
  const pts = [[8, 10], [w - 10, 6], [w - 6, h - 12], [10, h - 6]];
  pts.forEach(([x, y], i) => (i ? g.lineTo(x + r.range(-3, 3), y + r.range(-3, 3)) : g.moveTo(x, y)));
  g.closePath(); g.fill();
  g.fillStyle = '#3a352c';
  g.textBaseline = 'top';
  g.font = `bold 20px ${JP_SERIF}`;
  g.fillText('月見坂新聞', 28, 26);
  g.fillRect(28, 54, w - 56, 2);
  g.font = `bold 46px ${JP_SERIF}`;
  g.fillText('月見坂線、', 28, 70);
  g.fillText('あす最後の運行', 28, 122);
  g.font = `bold 22px ${JP_SANS}`;
  g.fillText('お盆の臨時列車、今年かぎり', 30, 182);
  // 写真（夜のホームと列車）
  g.fillStyle = '#4a463e'; g.fillRect(28, 222, w - 56, 170);
  g.fillStyle = '#7d776a'; g.fillRect(44, 300, w - 88, 52);
  g.fillStyle = '#d8d0b8';
  for (let i = 0; i < 6; i++) g.fillRect(60 + i * 68, 312, 44, 20);
  g.fillStyle = '#e9e1c9'; g.beginPath(); g.arc(w - 90, 258, 16, 0, 6.28); g.fill();
  // 本文（小さな字の行）
  g.fillStyle = '#4a443a';
  g.font = `15px ${JP_SERIF}`;
  const body = ['海ヶ浜から山ノ原までを結んできた月見坂線が、', 'あす八月十五日で運行を終える。沿線の町も、', 'この夏でそろって移る。最後の列車は、月見坂駅を', '午後十一時四十二分に出る臨時列車。毎年、お盆の', '夜にだけ走ってきた列車で、駅長は「今年は、', 'みんなで乗ります」と話した。駅の案内ロボット', '「トモ」は、駅に残して休ませるという。'];
  body.forEach((l, i) => g.fillText(l, 30, 410 + i * 26, w - 60));
  weather(c, { amount: 0.5, seed, fade: 0.35, streaks: 0.3, edge: 0.2 });
  return texture(c, { wrap: false });
}

/** 乗客からのカード（トモくんへ）。いろいろな人の字と、すみにトモの絵。 */
export function thanksCard({ w = 512, h = 360, seed = 77 } = {}) {
  const { c, g } = canvas(w, h);
  const r = rand(seed);
  g.fillStyle = '#f6f0e0'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(180, 150, 100, 0.5)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
  g.textBaseline = 'top';
  g.fillStyle = '#2b3a5a';
  g.font = `bold 36px ${JP_ROUND}`;
  g.fillText('トモくんへ', 28, 22);
  const lines = [['かさ、ありがとう', '#c0392b'], ['ビー玉、はんぶんこ！', '#2a6cb0'], ['ミミ、おかえり', '#b05a8a'], ['いってきます', '#3a3a3a'], ['またね', '#2d8a5e']];
  lines.forEach(([s, col], i) => {
    g.save();
    g.translate(34 + (i % 2) * 18, 84 + i * 50);
    g.rotate(r.range(-0.05, 0.05));
    g.fillStyle = col;
    g.font = `${r.range(24, 30)}px ${JP_ROUND}`;
    g.fillText(s, 0, 0);
    g.restore();
  });
  // トモの絵（丸い頭と、ランタン）
  const x = w - 110, y = 190;
  g.strokeStyle = '#333'; g.lineWidth = 3;
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(x, y, 34, 0, 6.28); g.fill(); g.stroke();
  g.fillStyle = '#26303a'; g.beginPath(); g.ellipse(x, y + 4, 24, 15, 0, 0, 6.28); g.fill();
  g.fillStyle = '#79e6ff'; g.beginPath(); g.arc(x - 9, y + 4, 4, 0, 6.28); g.arc(x + 9, y + 4, 4, 0, 6.28); g.fill();
  g.strokeStyle = '#333';
  g.beginPath(); g.moveTo(x - 20, y + 32); g.lineTo(x - 26, y + 90); g.moveTo(x + 20, y + 32); g.lineTo(x + 26, y + 90); g.stroke();
  g.strokeRect(x - 22, y + 34, 44, 46);
  g.fillStyle = '#ffb347'; g.fillRect(x + 34, y + 60, 16, 20);
  weather(c, { amount: 0.2, seed, fade: 0.1, streaks: 0, edge: 0.1 });
  return texture(c, { wrap: false });
}

/** 鉛筆の書き足し（小さな紙）。 */
export function pencilMemo(text, { w = 512, h = 144, seed = 79 } = {}) {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#f1ece0'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(70, 70, 76, 0.85)';
  g.font = `${h * 0.42}px ${JP_ROUND}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save(); g.translate(w / 2, h / 2); g.rotate(-0.03); g.fillText(text, 0, 0, w * 0.9); g.restore();
  weather(c, { amount: 0.25, seed, fade: 0.15, streaks: 0, edge: 0.2 });
  return texture(c, { wrap: false });
}
