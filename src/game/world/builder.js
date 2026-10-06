// ステージを組み立てる道具。動かない形は材質ごとに 1 つのメッシュにまとめる（draw call を減らす）。
// テクスチャは「1 UV = 1m」で貼る（材質のテクスチャの repeat が大きさを決める）ので、どの壁もつなぎ目なくそろう。
//   const B = new Builder(world);
//   B.box(M.concrete, { x, y, z, w, h, d, ry })     中心と大きさ。当たり判定も足す（collide: false で足さない）
//   B.stairs(M.concrete, { x, z, w, d, ry, y0, y1 })  階段（見た目の段＋坂の当たり）
//   B.plane(mat, { x, y, z, w, h, ry, rx })           看板・貼りもの（UV は 0〜1）
//   B.build(parent)                                    まとめて parent に足す
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const FACES = [
  // BoxGeometry の面の順：px, nx, py, ny, pz, nz。u と v のローカル軸
  { u: [0, 0, -1], v: [0, 1, 0] },
  { u: [0, 0, 1], v: [0, 1, 0] },
  { u: [1, 0, 0], v: [0, 0, -1] },
  { u: [1, 0, 0], v: [0, 0, 1] },
  { u: [1, 0, 0], v: [0, 1, 0] },
  { u: [-1, 0, 0], v: [0, 1, 0] },
];
const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

function clean(geo) {
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'windW'].includes(k)) geo.deleteAttribute(k);
  if (!geo.index) return geo;
  return geo;
}

export class Builder {
  constructor(world) {
    this.world = world;
    this.buckets = new Map();
    this.objects = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this.tris = 0;
    this.records = null;   // 確認用：軸にそろった箱の一覧（findCoplanar で、同じ面に重なった面＝ちらつきを探す）
  }

  /** 形を材質のバケツに入れる（geo はワールド座標にしてから渡す）。 */
  add(geo, mat, { cast = true, receive = true } = {}) {
    const key = `${mat.uuid}|${cast}|${receive}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { mat, cast, receive, geos: [] }));
    clean(geo);
    if (!geo.index) geo = toIndexed(geo);
    b.geos.push(geo);
    return geo;
  }

  /** そのまま足す物（動く物・特別な物）。 */
  object(o) { this.objects.push(o); return o; }

  _matrix(x, y, z, rx, ry, rz) {
    this._e.set(rx, ry, rz, 'YXZ');
    this._q.setFromEuler(this._e);
    return this._m.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(1, 1, 1));
  }

  /**
   * 箱。o：x, y, z（中心）, w, h, d, rx, ry, rz, uv（UV の倍率）, collide, surface, cast, receive, skip（['ny', …] 描かない面）, cam
   * 戻り値は当たり（collide のとき）。
   */
  box(mat, o) {
    const { x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, rx = 0, ry = 0, rz = 0, uv = 1, collide = true, surface = 'tile', cast = true, receive = true, skip = null, cam = true, tag = '' } = o;
    let geo = new THREE.BoxGeometry(w, h, d);
    const m = this._matrix(x, y, z, rx, ry, rz);
    const pos = geo.attributes.position, uvs = geo.attributes.uv;
    const P = new THREE.Vector3(), U3 = new THREE.Vector3(), V3 = new THREE.Vector3();
    const rot = new THREE.Matrix4().extractRotation(m);
    for (let f = 0; f < 6; f++) {
      U3.fromArray(FACES[f].u).applyMatrix4(rot);
      V3.fromArray(FACES[f].v).applyMatrix4(rot);
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        P.fromBufferAttribute(pos, i).applyMatrix4(m);
        uvs.setXY(i, P.dot(U3) * uv, P.dot(V3) * uv);
      }
    }
    geo.applyMatrix4(m);
    if (skip) geo = dropFaces(geo, skip.map((n) => FACE_NAMES.indexOf(n)));
    this.add(geo, mat, { cast, receive });
    this.tris += 12;
    if (this.records && !rx && !rz && Math.abs(Math.sin(ry * 2)) < 1e-3) {
      const swap = Math.abs(Math.sin(ry)) > 0.5;
      const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
      // ry で面の名前（px/nx/pz/nz）も入れ替わるので、描かない面は「ワールドの向き」で持つ
      const c = Math.round(Math.cos(ry)), sn = Math.round(Math.sin(ry));
      const worldSkip = new Set((skip || []).map((f) => {
        if (f === 'py' || f === 'ny') return f;
        const lx = f === 'px' ? 1 : f === 'nx' ? -1 : 0, lz = f === 'pz' ? 1 : f === 'nz' ? -1 : 0;
        const wx = lx * c + lz * sn, wz = -lx * sn + lz * c;
        return wx > 0.5 ? 'px' : wx < -0.5 ? 'nx' : wz > 0.5 ? 'pz' : 'nz';
      }));
      this.records.push({ min: [x - hw, y - h / 2, z - hd], max: [x + hw, y + h / 2, z + hd], mat: mat.name || mat.type, skip: worldSkip, at: [x, y, z] });
    }
    if (collide && !rx && !rz) return this.world.addBox({ x, y, z, w, h, d, ry, surface, cam, tag });
    return null;
  }

  /** 円柱（柱・管）。UV は周りの長さと高さ（m）。 */
  cyl(mat, o) {
    const { x = 0, y = 0, z = 0, r = 0.2, r2 = null, h = 1, seg = 12, rx = 0, ry = 0, rz = 0, uv = 1, collide = false, cast = true, receive = true, open = false, surface = 'metal' } = o;
    const geo = new THREE.CylinderGeometry(r2 ?? r, r, h, seg, 1, open);
    const uvs = geo.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * Math.PI * 2 * r * uv, uvs.getY(i) * h * uv);
    geo.applyMatrix4(this._matrix(x, y, z, rx, ry, rz));
    this.add(geo, mat, { cast, receive });
    if (collide) return this.world.addBox({ x, y, z, w: r * 1.8, h, d: r * 1.8, ry, surface });
    return null;
  }

  /** 板（看板・ポスター・貼りもの）。UV は 0〜1（world: true で m 単位）。向きは ry（0 = +Z を向く）・rx。 */
  plane(mat, o) {
    const { x = 0, y = 0, z = 0, w = 1, h = 1, rx = 0, ry = 0, rz = 0, cast = false, receive = true, world = false, uv = 1, flipU = false } = o;
    const geo = new THREE.PlaneGeometry(w, h);
    if (world || flipU) {
      const uvs = geo.attributes.uv;
      for (let i = 0; i < uvs.count; i++) {
        const u = flipU ? 1 - uvs.getX(i) : uvs.getX(i);
        uvs.setXY(i, world ? u * w * uv : u, world ? uvs.getY(i) * h * uv : uvs.getY(i));
      }
    }
    geo.applyMatrix4(this._matrix(x, y, z, rx, ry, rz));
    this.add(geo, mat, { cast, receive });
    return geo;
  }

  /** 床に貼る板（しみ・苔・接地の影）。y は床の高さ。 */
  decal(mat, { x, y, z, w, d = w, ry = 0, lift = 0.012 }) {
    return this.plane(mat, { x, y: y + lift, z, w, h: d, rx: -Math.PI / 2, ry, cast: false });
  }

  /**
   * 階段。足もとの中心 (x, z)、幅 w（ローカル x）、奥行き d（ローカル z）、ry。
   * y0 = ローカル -z の端の高さ、y1 = +z の端の高さ。段の高さは rise 前後に丸める。
   * nose：段の先の滑り止めの材質（任意）。
   */
  stairs(mat, o) {
    const { x, z, w, d, ry = 0, y0, y1, rise = 0.18, nose = null, surface = 'tile', base = null, sideMat = null, sideH = 0.9, sides = [true, true], open = false, stringer = null } = o;
    const n = Math.max(1, Math.round(Math.abs(y1 - y0) / rise));
    const lo = Math.min(y0, y1);
    const run = d / n;
    const c = Math.cos(ry), s = Math.sin(ry);
    const wx = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const bot = base ?? lo - 0.25;
    for (let i = 0; i < n; i++) {
      // 低い側から i 段目（低い側の端が y0 か y1 か）
      const fromNeg = y0 < y1; // ローカル -z が低い
      const tread = lo + ((i + 1) / n) * Math.abs(y1 - y0);
      const lz0 = fromNeg ? -d / 2 + i * run : d / 2 - (i + 1) * run;
      const lzc = lz0 + run / 2;
      const [cx, cz] = wx(0, lzc);
      const hh = open ? 0.06 : tread - bot;
      this.box(mat, { x: cx, y: tread - hh / 2, z: cz, w, h: hh, d: run + (open ? 0.02 : 0), ry, collide: false, skip: open ? null : ['ny'] });
      if (nose) {
        const lzn = fromNeg ? lz0 + run - 0.03 : lz0 + 0.03;
        const [nx, nz] = wx(0, lzn);
        this.box(nose, { x: nx, y: tread + 0.004, z: nz, w: w - 0.1, h: 0.012, d: 0.05, ry, collide: false, cast: false });
      }
    }
    // 側面の壁（ささら）
    if (sideMat) {
      for (const [k, on] of [[-1, sides[0]], [1, sides[1]]]) {
        if (!on) continue;
        // 斜めの板：坂に沿った箱を、段の数だけ細かく
        for (let i = 0; i < n; i++) {
          const fromNeg = y0 < y1;
          const tread = lo + ((i + 1) / n) * Math.abs(y1 - y0);
          const lz0 = fromNeg ? -d / 2 + i * run : d / 2 - (i + 1) * run;
          const [cx, cz] = wx(k * (w / 2 + 0.06), lz0 + run / 2);
          const top = tread + sideH;
          this.box(sideMat, { x: cx, y: (bot + top) / 2, z: cz, w: 0.12, h: top - bot, d: run + 0.002, ry, collide: false });
        }
      }
    }
    if (open && stringer) {
      // 斜めの桁（両側）
      const ang = Math.atan2(y0 - y1, d);
      const len = Math.hypot(d, y1 - y0);
      for (const k of [-1, 1]) {
        const [cx, cz] = wx(k * (w / 2 + 0.04), 0);
        this.box(stringer, { x: cx, y: (y0 + y1) / 2 - 0.12, z: cz, w: 0.08, h: 0.32, d: len, rx: ang, ry, collide: false });
      }
    }
    this.world.addRamp({ x, z, w, d, ry, y0, y1, base: bot, surface });
    if (sideMat) {
      // 側面の当たり（坂の横から入れないように、坂より少し高い薄い坂）
      for (const k of [-1, 1]) {
        if (!sides[k < 0 ? 0 : 1]) continue;
        const [cx, cz] = wx(k * (w / 2 + 0.06), 0);
        this.world.addRamp({ x: cx, z: cz, w: 0.14, d, ry, y0: y0 + sideH, y1: y1 + sideH, base: bot, surface: 'metal', cam: false });
      }
    }
  }

  /** 手すり（2 点の間、高さ h）。柱の間隔 gap。 */
  railing(mat, { x0, z0, x1, z1, y = 0, h = 1.05, gap = 1.2, r = 0.025, collide = true, y1 = null }) {
    const ya = y, yb = y1 ?? y;
    const L = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(L / gap));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const yy = ya + (yb - ya) * t;
      this.cyl(mat, { x: x0 + (x1 - x0) * t, y: yy + h / 2, z: z0 + (z1 - z0) * t, r, h, seg: 6 });
    }
    // 上の横棒と中の横棒（傾きも）
    const slope = Math.atan2(yb - ya, L);
    for (const hh of [h, h * 0.5]) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, cy = (ya + yb) / 2 + hh;
      const geo = new THREE.CylinderGeometry(r * 1.3, r * 1.3, Math.hypot(L, yb - ya), 6);
      geo.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2 - slope));
      geo.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
      geo.applyMatrix4(new THREE.Matrix4().makeTranslation(cx, cy, cz));
      this.add(geo, mat, {});
    }
    if (collide) {
      if (Math.abs(yb - ya) < 0.01) this.world.addBox({ x: (x0 + x1) / 2, y: ya + h / 2 + 0.3, z: (z0 + z1) / 2, w: 0.1, h: h + 0.6, d: L, ry, surface: 'metal', cam: false });
      // ローカル +z は (x0, z0) → (x1, z1) の向きなので、-z の端が ya、+z の端が yb
      else this.world.addRamp({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: 0.1, d: L, ry, y0: ya + h + 0.4, y1: yb + h + 0.4, base: Math.min(ya, yb) - 0.3, cam: false });
    }
  }

  /** まとめて 1 つにして parent に足す。 */
  build(parent) {
    const meshes = [];
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const geo = mergeGeometries(b.geos, false);
      if (!geo) { console.warn('merge failed', b.mat.name); continue; }
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.name = 'static:' + (b.mat.name || b.mat.type);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
      for (const g of b.geos) g.dispose();
    }
    for (const o of this.objects) parent.add(o);
    this.buckets.clear();
    this.objects = [];
    return meshes;
  }
}

function toIndexed(geo) {
  const n = geo.attributes.position.count;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geo.setIndex(idx);
  return geo;
}

/** 箱の面を消す（面の番号 0〜5）。 */
function dropFaces(geo, faces) {
  const idx = geo.index.array;
  const keep = [];
  for (let f = 0; f < 6; f++) {
    if (faces.includes(f)) continue;
    for (let k = 0; k < 6; k++) keep.push(idx[f * 6 + k]);
  }
  geo.setIndex(keep);
  return geo;
}

/**
 * 確認用：同じ平面に、同じ向きで重なっている面（＝ちらつく）を探す。records は Builder.records。
 * 戻り値：[{ axis, side, plane, area, a, b }]（面積の大きい順）。
 */
export function findCoplanar(records, { eps = 0.003, minArea = 0.004 } = {}) {
  const out = [];
  const ax = ['x', 'y', 'z'];
  for (let i = 0; i < records.length; i++) {
    const A = records[i];
    for (let j = i + 1; j < records.length; j++) {
      const Bx = records[j];
      // 外接箱が触れていなければ飛ばす
      let touch = true;
      for (let k = 0; k < 3; k++) if (A.max[k] < Bx.min[k] - eps || Bx.max[k] < A.min[k] - eps) { touch = false; break; }
      if (!touch) continue;
      for (let k = 0; k < 3; k++) {
        for (const side of [0, 1]) {
          const name = (side ? 'p' : 'n') + ax[k];
          if (A.skip.has(name) || Bx.skip.has(name)) continue;
          const pa = side ? A.max[k] : A.min[k], pb = side ? Bx.max[k] : Bx.min[k];
          if (Math.abs(pa - pb) > eps) continue;
          // 残りの 2 軸で重なる面積
          let area = 1;
          for (let q = 0; q < 3; q++) {
            if (q === k) continue;
            const o = Math.min(A.max[q], Bx.max[q]) - Math.max(A.min[q], Bx.min[q]);
            if (o <= 0) { area = 0; break; }
            area *= o;
          }
          if (area < minArea) continue;
          out.push({ face: name, plane: +pa.toFixed(3), area: +area.toFixed(3), a: `${A.mat}@${A.at.map((v) => v.toFixed(2)).join(',')}`, b: `${Bx.mat}@${Bx.at.map((v) => v.toFixed(2)).join(',')}` });
        }
      }
    }
  }
  return out.sort((p, q) => q.area - p.area);
}

/** よく使う：箱の形の当たりだけ（見た目なし）。 */
export function solid(world, o) { return world.addBox(o); }
