// 当たり判定：ステージは「箱」と「坂（階段）」の集まり。キャラクターは縦の円柱（半径 r・高さ h）。
//   world.addBox({ x, y, z, w, h, d, ry, surface })   中心と大きさ（y は中心）
//   world.addRamp({ x, z, w, d, ry, y0, y1, base })   足場が local z の -d/2 で y0、+d/2 で y1 の坂（下は base まで詰まっている）
//   world.move(body, dt)                               body = { pos, vel, r, h, step, grounded, … } を動かす
//   world.ground(x, z, yMax)                           (x, z) の真下で yMax より低い、いちばん高い足場
//   world.raycast(origin, dir, max)                    いちばん近い当たり（カメラのめりこみよけ）
//   world.addTrigger({ min, max, id })                 入った・出たを知るための箱
// 回転 ry は three.js と同じ（ローカル (lx, lz) → ワールド (x + lx cos + lz sin, z − lx sin + lz cos)）。
import * as THREE from 'three';

const EPS = 1e-6;
const CELL = 4;

export class World {
  constructor() {
    this.cols = [];
    this.triggers = [];
    this.grid = new Map();
    this.dirty = true;
    this._q = 0;
  }

  addBox({ x, y, z, w, h, d, ry = 0, surface = 'tile', tag = '', cam = true, enabled = true }) {
    const c = { type: 'box', cx: x, cz: z, hx: w / 2, hz: d / 2, y0: y - h / 2, y1: y + h / 2, ry, cos: Math.cos(ry), sin: Math.sin(ry), surface, tag, cam, enabled };
    this.cols.push(c);
    this.dirty = true;
    return c;
  }

  addRamp({ x, z, w, d, ry = 0, y0, y1, base = null, surface = 'tile', tag = '', cam = true, enabled = true }) {
    const lo = base ?? Math.min(y0, y1) - 0.5;
    const c = { type: 'ramp', cx: x, cz: z, hx: w / 2, hz: d / 2, ry, cos: Math.cos(ry), sin: Math.sin(ry), ty0: y0, ty1: y1, y0: lo, y1: Math.max(y0, y1), surface, tag, cam, enabled };
    this.cols.push(c);
    this.dirty = true;
    return c;
  }

  addTrigger({ min, max, id, data = null }) {
    const t = { min, max, id, data, inside: false };
    this.triggers.push(t);
    return t;
  }

  /** 触れている・入ったトリガーを返す（毎フレーム）。 */
  checkTriggers(p, onEnter, onExit) {
    for (const t of this.triggers) {
      const inside = p.x >= t.min[0] && p.x <= t.max[0] && p.y >= t.min[1] && p.y <= t.max[1] && p.z >= t.min[2] && p.z <= t.max[2];
      if (inside && !t.inside) onEnter?.(t);
      if (!inside && t.inside) onExit?.(t);
      t.inside = inside;
    }
  }

  // ---- 近くの当たりだけを調べるための格子
  _rebuild() {
    this.grid.clear();
    for (const c of this.cols) {
      const ext = Math.abs(c.hx * c.cos) + Math.abs(c.hz * c.sin);
      const ezt = Math.abs(c.hx * c.sin) + Math.abs(c.hz * c.cos);
      c.bx0 = c.cx - ext; c.bx1 = c.cx + ext; c.bz0 = c.cz - ezt; c.bz1 = c.cz + ezt;
      for (let gx = Math.floor(c.bx0 / CELL); gx <= Math.floor(c.bx1 / CELL); gx++) {
        for (let gz = Math.floor(c.bz0 / CELL); gz <= Math.floor(c.bz1 / CELL); gz++) {
          const k = gx * 73856093 ^ gz * 19349663;
          let a = this.grid.get(k);
          if (!a) this.grid.set(k, (a = []));
          a.push(c);
        }
      }
    }
    this.dirty = false;
  }

  /** (x, z) のまわり rad の中にありそうな当たり（重複なし）。 */
  near(x, z, rad = 1) {
    if (this.dirty) this._rebuild();
    const q = ++this._q;
    const out = [];
    for (let gx = Math.floor((x - rad) / CELL); gx <= Math.floor((x + rad) / CELL); gx++) {
      for (let gz = Math.floor((z - rad) / CELL); gz <= Math.floor((z + rad) / CELL); gz++) {
        const a = this.grid.get(gx * 73856093 ^ gz * 19349663);
        if (!a) continue;
        for (const c of a) { if (c._q !== q) { c._q = q; out.push(c); } }
      }
    }
    return out;
  }

  /** 当たりの上面の高さ（ローカル座標で）。 */
  static top(c, lz) {
    if (c.type !== 'ramp') return c.y1;
    const t = Math.min(1, Math.max(0, (lz + c.hz) / (2 * c.hz)));
    return c.ty0 + (c.ty1 - c.ty0) * t;
  }

  static local(c, x, z) {
    const dx = x - c.cx, dz = z - c.cz;
    return [dx * c.cos - dz * c.sin, dx * c.sin + dz * c.cos];
  }

  /** (x, z) の真下で、yMax 以下のいちばん高い足場 { y, surface, col }（なければ y = -Infinity）。 */
  ground(x, z, yMax, inset = 0.0) {
    let best = -Infinity, bc = null;
    for (const c of this.near(x, z, 0.5)) {
      if (!c.enabled) continue;
      const [lx, lz] = World.local(c, x, z);
      if (Math.abs(lx) > c.hx - inset || Math.abs(lz) > c.hz - inset) continue;
      const top = World.top(c, lz);
      if (top <= yMax + EPS && top > best) { best = top; bc = c; }
    }
    return { y: best, surface: bc?.surface ?? null, col: bc };
  }

  /**
   * キャラクターを dt 秒ぶん動かす。body：
   *   pos（足もと）, vel, r, h, step（のぼれる段差）, snap（下りで地面に吸いつく距離）, gravity, grounded, surface
   * 戻り値：{ landed: 着地の速さ（0 なら着地していない）, hitWall }
   */
  move(b, dt) {
    const res = { landed: 0, hitWall: false };
    const p = b.pos, v = b.vel;
    const sub = Math.max(1, Math.ceil((Math.hypot(v.x, v.z) * dt) / (b.r * 0.45)));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      p.x += v.x * h;
      p.z += v.z * h;
      if (this._push(b)) res.hitWall = true;
    }
    // たて
    const wasGrounded = b.grounded;
    const g = this.ground(p.x, p.z, p.y + b.step);
    if (wasGrounded && v.y <= 0 && g.y > -Infinity && p.y - g.y <= b.snap) {
      p.y = g.y;
      v.y = 0;
      b.grounded = true;
    } else {
      v.y -= b.gravity * dt;
      p.y += v.y * dt;
      const g2 = this.ground(p.x, p.z, Math.max(p.y, p.y - v.y * dt) + b.step * 0.5);
      if (v.y <= 0 && g2.y > -Infinity && p.y <= g2.y) {
        res.landed = -v.y;
        p.y = g2.y;
        v.y = 0;
        b.grounded = true;
        b.surface = g2.surface;
      } else {
        b.grounded = false;
      }
      // 天井
      if (v.y > 0) {
        for (const c of this.near(p.x, p.z, b.r)) {
          if (!c.enabled || c.type === 'ramp') continue;
          if (c.y0 <= p.y + 0.05 || c.y0 >= p.y + b.h) continue;
          const [lx, lz] = World.local(c, p.x, p.z);
          if (Math.abs(lx) < c.hx + b.r * 0.5 && Math.abs(lz) < c.hz + b.r * 0.5) { p.y = c.y0 - b.h; v.y = 0; }
        }
      }
    }
    if (b.grounded) b.surface = this.ground(p.x, p.z, p.y + 0.05).surface ?? b.surface;
    return res;
  }

  /** 壁から押し出す。押し出したら true。 */
  _push(b) {
    const p = b.pos, v = b.vel, r = b.r;
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.near(p.x, p.z, r + 0.2)) {
        if (!c.enabled) continue;
        if (c.y0 >= p.y + b.h - 0.02) continue;              // 頭より上
        const [lx, lz] = World.local(c, p.x, p.z);
        const qx = Math.max(-c.hx, Math.min(c.hx, lx));
        const qz = Math.max(-c.hz, Math.min(c.hz, lz));
        const top = World.top(c, qz);
        if (top <= p.y + b.step) continue;                     // のぼれる高さ（または足もとより下）
        const ex = lx - qx, ez = lz - qz;
        const d2 = ex * ex + ez * ez;
        if (d2 >= r * r) continue;
        let nx, nz, push;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx = ex / d; nz = ez / d; push = r - d;
        } else {
          const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
          if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; }
          else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
        }
        // ローカル → ワールド
        const wx = nx * c.cos + nz * c.sin;
        const wz = -nx * c.sin + nz * c.cos;
        p.x += wx * push;
        p.z += wz * push;
        const vn = v.x * wx + v.z * wz;
        if (vn < 0) { v.x -= vn * wx; v.z -= vn * wz; }
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** 光線の当たり（origin から dir 方向、max まで）。origin が中にある当たりは数えない。戻り値は距離（なければ max）。 */
  raycast(o, dir, max = 50, filter = null) {
    let best = max;
    // 光線が通る格子だけを見る
    const steps = Math.ceil(max / (CELL * 0.5));
    const seen = new Set();
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(max, (i / steps) * max);
      for (const c of this.near(o.x + dir.x * t, o.z + dir.z * t, CELL * 0.5)) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (!c.enabled || !c.cam || (filter && !filter(c))) continue;
        const d = rayCol(c, o, dir, best);
        if (d !== null && d < best) best = d;
      }
    }
    return best;
  }
}

/** 光線と当たり（凸の立体）の交わり。平面で切っていく。 */
function rayCol(c, o, dir, max) {
  // ローカルへ
  const dx = o.x - c.cx, dz = o.z - c.cz;
  const ox = dx * c.cos - dz * c.sin, oz = dx * c.sin + dz * c.cos, oy = o.y;
  const vx = dir.x * c.cos - dir.z * c.sin, vz = dir.x * c.sin + dir.z * c.cos, vy = dir.y;
  let t0 = 0, t1 = max;
  const clip = (nx, ny, nz, dd) => {
    // 内側：n・p <= dd
    const den = nx * vx + ny * vy + nz * vz;
    const dist = dd - (nx * ox + ny * oy + nz * oz);
    if (Math.abs(den) < EPS) return dist >= 0;
    const t = dist / den;
    if (den < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    return t0 <= t1;
  };
  if (!clip(1, 0, 0, c.hx) || !clip(-1, 0, 0, c.hx) || !clip(0, 0, 1, c.hz) || !clip(0, 0, -1, c.hz) || !clip(0, -1, 0, -c.y0)) return null;
  if (c.type === 'ramp') {
    // 上面：y <= ty0 + (ty1 - ty0) * (lz + hz) / (2hz)  →  y - k lz <= ty0 + k hz
    const k = (c.ty1 - c.ty0) / (2 * c.hz);
    const n = Math.hypot(k, 1);
    if (!clip(0 / n, 1 / n, -k / n, (c.ty0 + k * c.hz) / n)) return null;
  } else if (!clip(0, 1, 0, c.y1)) return null;
  if (t0 <= 0) return null; // 中から（または当たっていない）
  return t0;
}

export const _test = { rayCol };
export { THREE };
