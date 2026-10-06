// 駅の小物。動かない物は Builder にまとめ、動く物（時計の針・シャッター・扉・明かり）は refs に返して Game が動かす。
// どの関数も「前 = ローカル +Z」で作り、ry で向きを決める。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as SG from './signs.js';
import { sheet, patch } from './materials.js';

/** ローカル座標で置くための枠（x, y, z, ry）。 */
export function frame(B, x0, y0, z0, ry0 = 0) {
  const c = Math.cos(ry0), s = Math.sin(ry0);
  const P = (lx = 0, ly = 0, lz = 0) => [x0 + lx * c + lz * s, y0 + ly, z0 - lx * s + lz * c];
  const at = (o) => { const [x, y, z] = P(o.x, o.y, o.z); return { ...o, x, y, z, ry: (o.ry || 0) + ry0 }; };
  return {
    P, ry: ry0,
    box: (mat, o) => B.box(mat, at(o)),
    cyl: (mat, o) => B.cyl(mat, at(o)),
    plane: (mat, o) => B.plane(mat, at(o)),
    decal: (mat, o) => { const [x, y, z] = P(o.x, 0, o.z); return B.decal(mat, { ...o, x, y: o.y ?? y0, z, ry: (o.ry || 0) + ry0 }); },
  };
}

/** 物（Object3D）をワールドに置く。 */
function place(obj, x, y, z, ry = 0) { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; }

const sheetCache = new Map();
/** canvas のテクスチャの板の材質（同じ鍵なら使い回す）。 */
function sheetMat(key, makeTex, opts) {
  if (!sheetCache.has(key)) sheetCache.set(key, sheet(makeTex(), opts));
  return sheetCache.get(key);
}

// ---------------------------------------------------------------- 自販機
/** 自販機（幅 1m、奥行き 0.75m、高さ 1.83m）。戻り値 { front（材質）, variant } — 電気が戻ると光る。 */
export function vendingMachine(B, M, x, z, ry, variant = 0, seed = 1) {
  const F = frame(B, x, 0, z, ry);
  const body = variant === 0 ? M.plasticRed : M.plasticCream;
  F.box(body, { x: 0, y: 0.93, z: -0.02, w: 1.0, h: 1.84, d: 0.72, surface: 'metal' });
  F.box(M.dark, { x: 0, y: 0.04, z: 0, w: 0.98, h: 0.08, d: 0.7, collide: false });
  F.box(body, { x: 0, y: 1.87, z: 0.06, w: 1.02, h: 0.06, d: 0.82, collide: false });
  const off = SG.vendingFront({ variant, lit: false, seed });
  const on = SG.vendingFront({ variant, lit: true, seed });
  const mat = sheet(off, { emissive: true, rough: 0.35 });
  mat.emissiveMap = on;
  mat.userData.lit = on;
  mat.userData.off = off;
  F.plane(mat, { x: 0, y: 0.94, z: 0.345, w: 0.94, h: 1.82, cast: false });
  // 窓のガラス（少し前）
  F.plane(M.glassClean, { x: 0, y: 1.43, z: 0.36, w: 0.88, h: 0.98 });
  return { mat, on, off };
}

/** 空き缶入れ（青い箱、穴 2 つ）。 */
export function recycleBin(B, M, x, z, ry) {
  const F = frame(B, x, 0, z, ry);
  F.box(M.plasticNavy, { x: 0, y: 0.45, z: 0, w: 0.8, h: 0.9, d: 0.45, surface: 'metal' });
  for (const k of [-1, 1]) F.cyl(M.black, { x: k * 0.2, y: 0.91, z: 0.05, r: 0.08, h: 0.02, seg: 14 });
  const lab = sheetMat('bin', () => SG.smallLabel('かん・びん　ペットボトル', { bg: '#2b4a8e', fg: '#fff', h: 96 }));
  F.plane(lab, { x: 0, y: 0.72, z: 0.226, w: 0.7, h: 0.13 });
}

// ---------------------------------------------------------------- ベンチ（つながった椅子）
export function seats(B, M, x, z, ry, n = 4, color = 'navy', broken = []) {
  const F = frame(B, x, 0, z, ry);
  const mat = color === 'navy' ? M.plasticNavy : color === 'red' ? M.plasticRed : M.plasticCream;
  const W = 0.52;
  const L = n * W;
  F.box(M.steelDark, { x: 0, y: 0.32, z: -0.05, w: L + 0.1, h: 0.06, d: 0.08, collide: false });
  for (const k of [-1, 1]) {
    F.box(M.steelDark, { x: k * (L / 2 - 0.15), y: 0.16, z: -0.05, w: 0.06, h: 0.32, d: 0.06, collide: false });
    F.box(M.steelDark, { x: k * (L / 2 - 0.15), y: 0.02, z: -0.05, w: 0.08, h: 0.04, d: 0.5, collide: false });
  }
  for (let i = 0; i < n; i++) {
    if (broken.includes(i)) continue;
    const sx = -L / 2 + W / 2 + i * W;
    F.box(mat, { x: sx, y: 0.42, z: 0.02, w: W - 0.05, h: 0.05, d: 0.42, collide: false, rx: -0.05 });
    F.box(mat, { x: sx, y: 0.68, z: -0.2, w: W - 0.05, h: 0.42, d: 0.05, collide: false, rx: -0.15 });
  }
  // 当たり（座面の高さの箱。トモはのぼれる）
  const [cx, , cz] = F.P(0, 0, -0.02);
  B.world.addBox({ x: cx, y: 0.225, z: cz, w: Math.abs(Math.cos(ry)) > 0.5 ? L : 0.5, h: 0.45, d: Math.abs(Math.cos(ry)) > 0.5 ? 0.5 : L, surface: 'metal' });
  const [bx, , bz] = F.P(0, 0, -0.22);
  B.world.addBox({ x: bx, y: 0.7, z: bz, w: Math.abs(Math.cos(ry)) > 0.5 ? L : 0.08, h: 0.5, d: Math.abs(Math.cos(ry)) > 0.5 ? 0.08 : L, surface: 'metal' });
}

/** 木のベンチ（古い駅・外）。 */
export function woodBench(B, M, x, z, ry, L = 1.8, y = 0) {
  const F = frame(B, x, y, z, ry);
  for (let i = 0; i < 3; i++) F.box(M.wood, { x: 0, y: 0.43, z: -0.15 + i * 0.13, w: L, h: 0.04, d: 0.11, collide: false });
  for (let i = 0; i < 2; i++) F.box(M.wood, { x: 0, y: 0.62 + i * 0.16, z: -0.27, w: L, h: 0.1, d: 0.03, rx: -0.1, collide: false });
  for (const k of [-1, 1]) {
    F.box(M.steelDark, { x: k * (L / 2 - 0.12), y: 0.21, z: 0, w: 0.05, h: 0.42, d: 0.42, collide: false });
    F.box(M.steelDark, { x: k * (L / 2 - 0.12), y: 0.62, z: -0.28, w: 0.05, h: 0.42, d: 0.04, collide: false });
  }
  const [cx, cy, cz] = F.P(0, 0.225, -0.02);
  const along = Math.abs(Math.cos(ry)) > 0.5;
  B.world.addBox({ x: cx, y: cy, z: cz, w: along ? L : 0.45, h: 0.45, d: along ? 0.45 : L, surface: 'wood' });
}

// ---------------------------------------------------------------- 案内板・掲示
/** 吊り下げの案内板（両面）。y = 板の中心の高さ。棒で上から吊る。 */
export function hangingSign(B, M, x, y, z, ry, w, h, tex, { rodTop = null, back = null } = {}) {
  const F = frame(B, x, y, z, ry);
  F.box(M.steelDark, { x: 0, y: 0, z: 0, w: w + 0.1, h: h + 0.1, d: 0.12, collide: false });
  const mat = sheet(tex, { rough: 0.6 });
  F.plane(mat, { x: 0, y: 0, z: 0.061, w, h });
  const mb = back ? sheet(back, { rough: 0.6 }) : mat;
  F.plane(mb, { x: 0, y: 0, z: -0.061, w, h, ry: Math.PI });
  if (rodTop) for (const k of [-1, 1]) F.cyl(M.steelDark, { x: k * (w / 2 - 0.3), y: (rodTop - y) / 2 + h / 2, z: 0, r: 0.02, h: rodTop - y - h / 2, seg: 6 });
  return mat;
}

/** 壁に貼る板（看板・ポスター）。壁の面にぴったり（少し浮かせる）。 */
export function wallSign(B, x, y, z, ry, w, h, tex, { emissive = false, rough = 0.7, transparent = false } = {}) {
  const mat = sheet(tex, { emissive, rough, transparent });
  const F = frame(B, x, y, z, ry);
  F.plane(mat, { x: 0, y: 0, z: 0.012, w, h });
  return mat;
}

/** 掲示板（足つき・額縁）。前 = +Z。 */
export function standBoard(B, M, x, z, ry, tex, { w = 1.6, h = 1.2, y = 1.55, tilt = 0 } = {}) {
  const F = frame(B, x, 0, z, ry);
  F.box(M.steelDark, { x: 0, y, z: 0, w: w + 0.12, h: h + 0.12, d: 0.08, collide: false, rx: tilt });
  F.plane(sheet(tex, { rough: 0.55 }), { x: 0, y, z: 0.042, w, h, rx: tilt });
  F.plane(M.glassClean, { x: 0, y, z: 0.05, w, h, rx: tilt });
  for (const k of [-1, 1]) F.box(M.steelDark, { x: k * (w / 2 - 0.1), y: (y - h / 2) / 2, z: 0, w: 0.07, h: y - h / 2, d: 0.07, collide: false });
  for (const k of [-1, 1]) F.box(M.steelDark, { x: k * (w / 2 - 0.1), y: 0.03, z: 0, w: 0.1, h: 0.06, d: 0.5, collide: false });
  const [cx, , cz] = F.P(0, 0, 0);
  const along = Math.abs(Math.cos(ry)) > 0.5;
  B.world.addBox({ x: cx, y: y, z: cz, w: along ? w + 0.1 : 0.15, h: h + 0.1, d: along ? 0.15 : w + 0.1, surface: 'metal' });
  for (const k of [-1, 1]) { const [lx, , lz] = F.P(k * (w / 2 - 0.1), 0, 0); B.world.addBox({ x: lx, y: 0.5, z: lz, w: 0.12, h: 1, d: 0.12 }); }
}

// ---------------------------------------------------------------- 時計
/** 壁・柱の時計（片面）。戻り値 { hour, minute, group }（針の Object3D）。 */
export function clock(M, x, y, z, ry, { r = 0.55, small = false, double = false } = {}) {
  const g = new THREE.Group();
  g.name = 'clock';
  place(g, x, y, z, ry);
  const face = sheet(SG.clockFace({ small }), { rough: 0.4 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.05, double ? 0.22 : 0.14, 40), M.steelDark);
  rim.rotation.x = Math.PI / 2;
  rim.castShadow = rim.receiveShadow = true;
  g.add(rim);
  const sides = double ? [1, -1] : [1];
  const hands = { hour: [], minute: [] };
  for (const sd of sides) {
    const f = new THREE.Mesh(new THREE.CircleGeometry(r, 48), face);
    f.position.z = sd * (double ? 0.112 : 0.072);
    if (sd < 0) f.rotation.y = Math.PI;
    f.receiveShadow = true;
    g.add(f);
    const handMat = M.black;
    const mk = (len, wid, z) => {
      const p = new THREE.Group();
      p.position.z = sd * z;
      if (sd < 0) p.rotation.y = Math.PI;
      const m = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.01), handMat);
      m.position.y = len * 0.4;
      m.castShadow = true;
      p.add(m);
      g.add(p);
      return p;
    };
    hands.hour.push(mk(r * 0.55, r * 0.07, double ? 0.12 : 0.08));
    hands.minute.push(mk(r * 0.82, r * 0.045, double ? 0.13 : 0.09));
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.04, r * 0.04, 0.02, 10), M.black);
    pin.rotation.x = Math.PI / 2;
    pin.position.z = sd * (double ? 0.135 : 0.095);
    g.add(pin);
  }
  // ガラス
  for (const sd of sides) {
    const gl = new THREE.Mesh(new THREE.CircleGeometry(r, 40), M.glassClean);
    gl.position.z = sd * (double ? 0.15 : 0.11);
    if (sd < 0) gl.rotation.y = Math.PI;
    g.add(gl);
  }
  /** 時刻（時・分）に針を合わせる。 */
  const set = (h, m) => {
    const ma = -(m / 60) * Math.PI * 2;
    const ha = -((h % 12) / 12 + m / 720) * Math.PI * 2;
    for (const p of hands.minute) p.rotation.z = p.rotation.y ? -ma : ma;
    for (const p of hands.hour) p.rotation.z = p.rotation.y ? -ha : ha;
  };
  return { group: g, set };
}

// ---------------------------------------------------------------- 改札
/** 自動改札機の列。aisles：通路ごとに閉じているか（true = 閉じている）。 */
export function ticketGates(B, M, z, x0, x1, closed) {
  const n = closed.length + 1;
  const pitch = (x1 - x0) / (n - 1);
  const label = sheetMat('gateLabel', () => SG.smallLabel('きっぷ・IC', { bg: '#2a6cb0', fg: '#fff', h: 96, w: 256 }));
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pitch;
    B.box(M.plasticCream, { x, y: 0.5, z, w: 0.26, h: 1.0, d: 1.5, surface: 'metal' });
    B.box(M.plasticNavy, { x, y: 1.02, z, w: 0.27, h: 0.05, d: 1.52, collide: false });
    B.box(M.dark, { x, y: 1.0, z: z + 0.45, w: 0.2, h: 0.03, d: 0.25, collide: false, rx: -0.2 });
    B.plane(label, { x: x + 0.135, y: 0.8, z: z + 0.5, w: 0.28, h: 0.1, ry: Math.PI / 2 });
    B.plane(label, { x: x - 0.135, y: 0.8, z: z + 0.5, w: 0.28, h: 0.1, ry: -Math.PI / 2 });
    if (i < n - 1) {
      const ax = x + pitch / 2;
      if (closed[i]) {
        // 閉じた扉（両側から）
        for (const k of [-1, 1]) B.box(M.plasticRed, { x: ax + k * (pitch / 4 - 0.07), y: 0.68, z, w: pitch / 2 - 0.16, h: 0.42, d: 0.03, collide: false });
        B.world.addBox({ x: ax, y: 0.68, z, w: pitch - 0.25, h: 0.42, d: 0.1, surface: 'metal' });
      } else if (i % 2 === 0) {
        // 壊れて外れた扉
        B.box(M.plasticRed, { x: ax - 0.2, y: 0.03, z: z + 0.9, w: 0.3, h: 0.03, d: 0.4, collide: false, ry: 0.7 });
      }
    }
  }
}

// ---------------------------------------------------------------- 券売機・運賃表
export function ticketMachines(B, M, x0, z, ry, n = 4) {
  const machines = [];
  for (let i = 0; i < n; i++) {
    const F = frame(B, x0 + i * 0.95 * Math.cos(ry), 0, z - i * 0.95 * Math.sin(ry), ry);
    F.box(M.steelCream, { x: 0, y: 0.95, z: -0.3, w: 0.9, h: 1.9, d: 0.6, surface: 'metal' });
    const off = SG.ticketMachineFront({ lit: false, seed: 15 + i });
    const on = SG.ticketMachineFront({ lit: true, seed: 15 + i });
    const mat = sheet(off, { emissive: true, rough: 0.5 });
    mat.emissiveMap = on;
    mat.userData = { lit: on, off };
    F.plane(mat, { x: 0, y: 1.0, z: 0.006, w: 0.84, h: 1.26, rx: -0.08 });
    F.box(M.steelDark, { x: 0, y: 1.865, z: -0.24, w: 0.92, h: 0.16, d: 0.68, collide: false });   // 上は本体より少し高く・後ろは少し短く（同じ面だとちらつく）
    machines.push({ mat, pos: F.P(0, 1.0, 0.3) });
  }
  return machines;
}

// ---------------------------------------------------------------- シャッター
/** 巻き上げるシャッター。戻り値 { mesh, open(t) }（t = 0 閉じ、1 開き）。当たりは col。 */
export function rollShutter(B, M, x, z, ry, w, y0, h, { start = 0, col = true, minY = 0 } = {}) {
  const g = new THREE.Group();
  place(g, x, y0, z, ry);
  const geo = new THREE.BoxGeometry(w, h, 0.06);
  // UV（2m で 1 枚）
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2);
  const mesh = new THREE.Mesh(geo, M.shutter);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'shutter';
  g.add(mesh);
  // 巻き取り箱
  const F = frame(B, x, y0 + h, z, ry);
  F.box(M.steelDark, { x: 0, y: 0.2, z: 0.0, w: w + 0.24, h: 0.45, d: 0.36, collide: false });   // 巻き取り箱は壁より前へ出す
  const c = col ? B.world.addBox({ x, y: y0 + h / 2, z, w: Math.abs(Math.cos(ry)) > 0.5 ? w : 0.2, h, d: Math.abs(Math.cos(ry)) > 0.5 ? 0.2 : w, surface: 'metal' }) : null;
  const api = {
    group: g, mesh, col: c, t: start,
    open(t) {
      api.t = t;
      const hh = Math.max(0.05, h * (1 - t));
      mesh.scale.y = hh / h;
      mesh.position.y = h - hh / 2;
      if (c) { c.y0 = y0 + h - hh + minY; c.enabled = t < 0.95; }
    },
  };
  api.open(start);
  return api;
}

// ---------------------------------------------------------------- 扉
/** 開き戸（片開き）。戻り値 { pivot, open(t), col }。 */
export function swingDoor(B, M, x, z, ry, w = 0.9, h = 2.1, mat = null, { y = 0, hinge = -1 } = {}) {
  const pivot = new THREE.Group();
  // 蝶番の位置
  const c = Math.cos(ry), s = Math.sin(ry);
  const hx = x + hinge * (w / 2) * c, hz = z - hinge * (w / 2) * s;
  place(pivot, hx, y, hz, ry);
  const geo = new RoundedBoxGeometry(w - 0.02, h, 0.05, 2, 0.01);
  geo.translate(-hinge * (w / 2), h / 2, 0);
  const door = new THREE.Mesh(geo, mat || M.steelCream);
  door.castShadow = door.receiveShadow = true;
  pivot.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M.chrome);
  knob.position.set(-hinge * (w - 0.12), 1.0, 0.05);
  pivot.add(knob);
  const col = B.world.addBox({ x, y: y + h / 2, z, w: Math.abs(c) > 0.5 ? w : 0.1, h, d: Math.abs(c) > 0.5 ? 0.1 : w, surface: 'metal' });
  return {
    pivot, col, t: 0,
    open(t, dir = 1) { this.t = t; pivot.rotation.y = ry + dir * hinge * t * 1.75; col.enabled = t < 0.3; },
  };
}

// ---------------------------------------------------------------- 照明（ペンダント・蛍光灯）
/** 蛍光灯の器具（天井付け）。戻り値は光る材質（電気が戻ると光る）。 */
export function tubeLight(B, M, x, y, z, ry, lit, len = 1.2) {
  const F = frame(B, x, y, z, ry);
  F.box(M.steelCream, { x: 0, y: -0.04, z: 0, w: len + 0.1, h: 0.07, d: 0.18, collide: false, cast: false });
  F.box(lit, { x: 0, y: -0.095, z: 0, w: len, h: 0.035, d: 0.035, collide: false, cast: false });
}

/** 吊り下げの照明（笠つき）。 */
export function pendant(B, M, x, y, z, len, broken = false) {
  B.cyl(M.steelDark, { x, y: y - len / 2, z, r: 0.01, h: len, seg: 4, cast: false });
  B.cyl(M.steelCream, { x, y: y - len - 0.12, z, r: 0.08, r2: 0.02, h: 0.06, seg: 14, cast: false });
  B.cyl(M.steelCream, { x, y: y - len - 0.25, z, r: 0.36, r2: 0.12, h: 0.2, seg: 18, open: true });
  if (!broken) B.cyl(M.plasticCream, { x, y: y - len - 0.33, z, r: 0.08, h: 0.06, seg: 10, cast: false });
}

// ---------------------------------------------------------------- コインロッカー
export function lockers(B, M, x, z, ry, cols = 6, rows = 4) {
  const F = frame(B, x, 0, z, ry);
  const W = cols * 0.36, H = rows * 0.42 + 0.2;
  F.box(M.steelCream, { x: 0, y: H / 2, z: -0.3, w: W + 0.06, h: H, d: 0.6, surface: 'metal' });
  const rr = (i, j) => (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const lx = -W / 2 + 0.18 + i * 0.36, ly = 0.2 + 0.21 + j * 0.42;
    const open = Math.abs(rr(i, j)) > 0.82;
    if (open) {
      F.box(M.dark, { x: lx, y: ly, z: 0.0, w: 0.33, h: 0.39, d: 0.02, collide: false });
      F.box(M.steelCream, { x: lx + 0.27, y: ly, z: 0.17, w: 0.02, h: 0.38, d: 0.33, collide: false, ry: -0.3 });
    } else {
      F.box(M.steelCream, { x: lx, y: ly, z: 0.01, w: 0.33, h: 0.39, d: 0.02, collide: false });
      F.box(M.chrome, { x: lx + 0.1, y: ly + 0.1, z: 0.03, w: 0.05, h: 0.08, d: 0.02, collide: false, cast: false });
    }
  }
}

// ---------------------------------------------------------------- 瓦礫・ごみ
/** 瓦礫（コンクリートのかけら）を置く。rng は乱数。 */
export function rubble(B, M, x, z, r, n, rng, { y = 0, mats = null, big = 0.35, collide = false, skip = null } = {}) {
  const list = mats || [M.concreteDark, M.concrete];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    const s = (0.08 + rng() * big) * (1 - d / (r * 1.4));
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const o = { x: px, y: y + s * 0.3, z: pz, w: s * (0.8 + rng()), h: s * (0.5 + rng() * 0.6), d: s * (0.8 + rng()), rx: rng() * 0.6 - 0.3, ry: rng() * 6, rz: rng() * 0.6 - 0.3, collide: false };
    if (skip?.(px, pz)) continue;
    B.box(list[i % list.length], o);
    if (collide && s > 0.25) B.world.addBox({ x: px, y: y + s * 0.25, z: pz, w: s, h: s * 0.5, d: s, surface: 'concrete' });
  }
}

/** 紙くず・落ち葉（床に貼る小さな板）。 */
export function litter(B, mat, x, z, r, n, rng, y = 0, skip = null) {
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    const s = 0.08 + rng() * 0.14;
    const o = { x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, w: s, d: s * (0.6 + rng() * 0.6), ry: rng() * 6, lift: 0.006 + rng() * 0.004 };
    if (skip?.(o.x, o.z)) continue;
    B.decal(mat, o);
  }
}

// ---------------------------------------------------------------- 車両
/** 電車の車両（1 両 20m）。lit = 窓が光る（幽霊の列車）。戻り値は Group（動かせる）。 */
export function trainCar(M, { lit = false, ghost = false, seed = 19 } = {}) {
  const g = new THREE.Group();
  g.name = 'car';
  const len = 19.5, w = 2.9, h = 3.0;
  const sideTex = SG.trainSide({ seed, lit, ghost });
  const sideMat = ghost
    ? new THREE.MeshBasicMaterial({ map: sideTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, color: 0xc9b496 })
    : patch(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.45, metalness: 0.55, envMapIntensity: 1.1 }), {});
  const bodyMat = ghost ? sideMat : patch(new THREE.MeshStandardMaterial({ color: 0xa9adae, roughness: 0.5, metalness: 0.6, map: M.steel.map }), {});
  const add = (geo, mat, pos, name) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = !ghost; m.receiveShadow = !ghost; m.name = name; g.add(m); return m; };
  // 側面（両側）
  for (const s of [-1, 1]) {
    const p = new THREE.PlaneGeometry(len, h * 0.86);
    const m = add(p, sideMat, [0, 1.25 + h * 0.43, s * w / 2], 'side');
    if (s < 0) m.rotation.y = Math.PI;
  }
  // 屋根・床・前後
  const roof = new THREE.CylinderGeometry(w / 2, w / 2, len, 16, 1, false, -Math.PI / 2, Math.PI);
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.25, 1);
  add(roof, bodyMat, [0, 1.25 + h * 0.86, 0], 'roof');
  add(new THREE.BoxGeometry(len, 0.3, w - 0.1), ghost ? sideMat : M.dark, [0, 1.15, 0], 'floor');
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, h * 0.86, w), bodyMat, [s * len / 2, 1.25 + h * 0.43, 0], 'end');
  if (!ghost) {
    // 台車と車輪
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(2.4, 0.5, 2.0), M.dark, [s * 6.5, 0.75, 0], 'bogie');
      for (const k of [-0.9, 0.9]) for (const zz of [-0.55, 0.55]) {
        const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16);
        wheel.rotateX(Math.PI / 2);
        add(wheel, M.rail, [s * 6.5 + k, 0.45, zz], 'wheel');
      }
    }
    // パンタグラフ
    add(new THREE.BoxGeometry(1.6, 0.06, 0.8), M.steelDark, [3, 1.25 + h * 0.86 + 0.45, 0], 'panto').rotation.z = 0.2;
  }
  return g;
}

// ---------------------------------------------------------------- 架線柱
export function catenaryMast(B, M, x, z, h = 7.5, arm = 5, y = 4.1, pole = true) {
  if (pole) B.box(M.steelDark, { x, y: y + h / 2, z, w: 0.25, h, d: 0.25, collide: false });
  B.box(M.steelDark, { x, y: y + h - 0.3, z: z + arm / 2 * Math.sign(arm), w: 0.12, h: 0.18, d: Math.abs(arm), collide: false });
  B.box(M.steelDark, { x, y: y + h - 0.9, z: z + arm / 3 * Math.sign(arm), w: 0.06, h: 0.06, d: Math.abs(arm) * 0.66, collide: false, rx: 0.25 * Math.sign(arm) });
}

/** 電線（2 点を結ぶ、少したるんだ線）。 */
export function wire(B, M, a, b, sag = 0.4, seg = 10) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg * 2, 0.012, 4, false);
  B.add(geo, M.black, { cast: false });
}

/** 事務机（天板・袖の引き出し・脚）。前 = +Z（座る側）。 */
export function desk(B, M, x, z, ry, w = 1.2) {
  const F = frame(B, x, 0, z, ry);
  F.box(M.steelCream, { x: 0, y: 0.72, z: 0, w, h: 0.035, d: 0.7, collide: false });
  F.box(M.steelCream, { x: w / 2 - 0.22, y: 0.36, z: 0, w: 0.42, h: 0.7, d: 0.66, collide: false });
  for (let i = 0; i < 3; i++) F.box(M.dark, { x: w / 2 - 0.22, y: 0.16 + i * 0.22, z: 0.334, w: 0.12, h: 0.02, d: 0.01, collide: false, cast: false });
  F.box(M.steelCream, { x: -w / 2 + 0.03, y: 0.36, z: 0, w: 0.03, h: 0.7, d: 0.66, collide: false });
  F.box(M.steelCream, { x: 0, y: 0.45, z: -0.32, w: w - 0.06, h: 0.5, d: 0.02, collide: false });
  const [cx, , cz] = F.P(0, 0, 0);
  const along = Math.abs(Math.cos(ry)) > 0.5;
  B.world.addBox({ x: cx, y: 0.37, z: cz, w: along ? w : 0.7, h: 0.74, d: along ? 0.7 : w, surface: 'metal' });
}

/** 事務椅子（座面・背もたれ・軸・5 本足）。 */
export function officeChair(B, M, x, z, ry, mat = null) {
  const F = frame(B, x, 0, z, ry);
  const c = mat || M.plasticNavy;
  F.box(c, { x: 0, y: 0.46, z: 0, w: 0.46, h: 0.07, d: 0.44, collide: false });
  F.box(c, { x: 0, y: 0.78, z: -0.22, w: 0.44, h: 0.42, d: 0.06, rx: -0.12, collide: false });
  F.cyl(M.dark, { x: 0, y: 0.25, z: 0, r: 0.025, h: 0.4, seg: 8 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    F.box(M.dark, { x: Math.cos(a) * 0.15, y: 0.05, z: Math.sin(a) * 0.15, w: 0.3, h: 0.03, d: 0.04, ry: -a, collide: false });
  }
  const [cx, , cz] = F.P(0, 0, 0);
  B.world.addBox({ x: cx, y: 0.25, z: cz, w: 0.45, h: 0.5, d: 0.45, surface: 'metal' });
}

/** ブラウン管のモニターとキーボード（机の上 y）。 */
export function crt(B, M, x, y, z, ry) {
  const F = frame(B, x, y, z, ry);
  F.box(M.plasticCream, { x: 0, y: 0.19, z: 0, w: 0.4, h: 0.34, d: 0.2, collide: false });
  F.box(M.plasticCream, { x: 0, y: 0.18, z: -0.17, w: 0.3, h: 0.26, d: 0.16, collide: false });
  F.box(M.black, { x: 0, y: 0.2, z: 0.101, w: 0.31, h: 0.24, d: 0.005, collide: false, cast: false });
  F.box(M.plasticCream, { x: 0, y: 0.015, z: -0.02, w: 0.22, h: 0.03, d: 0.18, collide: false });
  F.box(M.plasticCream, { x: 0.02, y: 0.02, z: 0.3, w: 0.42, h: 0.03, d: 0.15, rx: 0.08, collide: false });
}

/** ファイル（背表紙が並ぶ）。 */
export function binders(B, M, x, y, z, ry, n = 8, rng = Math.random) {
  const F = frame(B, x, y, z, ry);
  const cols = [M.plasticNavy, M.plasticRed, M.plasticCream, M.plasticGreen];
  for (let i = 0; i < n; i++) {
    const h = 0.28 + rng() * 0.04;
    F.box(cols[Math.floor(rng() * cols.length)], { x: -n * 0.03 + i * 0.06, y: h / 2, z: 0, w: 0.05, h, d: 0.24, rz: i === n - 1 ? 0.25 : 0, collide: false });
  }
}

/** 2 点を結ぶ丸い棒。 */
export function rod(B, mat, a, b, r = 0.025, seg = 8, cast = false) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  const d = Bv.clone().sub(A);
  const len = d.length();
  if (len < 1e-4) return;
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  geo.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(Bv).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  B.add(geo, mat, { cast });
}

export { place, sheetMat };
