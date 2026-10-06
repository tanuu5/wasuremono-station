// 草木：垂れ下がるつた、壁をはうつた、草の束、茂み、小さな木。葉はアトラス（tex.js の foliageAtlas）の 4 区画から。
// 揺れは windW（0 = 固定の端、1 = 揺れる端）で決める（materials.js の WIND）。
// 草・茂みは InstancedMesh（数が多い）、つたと木は Builder にまとめる。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { L, inPit } from './layout.js';
import { rand } from './noise.js';

// アトラスの区画（u0, v0, u1, v1）。canvas の上 = v の 1
const Q = { vine: [0, 0.5, 0.5, 1], grass: [0.5, 0.5, 1, 1], bush: [0, 0, 0.5, 0.5], branch: [0.5, 0, 1, 0.5] };

/** 1 枚の葉の板。anchor：'bottom'（下が固定）/ 'top'（上が固定）/ 'center'。 */
function card(w, h, quad, anchor = 'bottom', tilt = 0) {
  const g = new THREE.PlaneGeometry(w, h, 1, 3);
  const [u0, v0, u1, v1] = Q[quad];
  const uv = g.attributes.uv, pos = g.attributes.position;
  const ww = new Float32Array(pos.count);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    const y = pos.getY(i);
    const t = (y + h / 2) / h;         // 0（下）〜 1（上）
    ww[i] = anchor === 'bottom' ? t : anchor === 'top' ? 1 - t : 0.5;
    // 少し前に曲げる（草の先が垂れる）
    if (tilt) pos.setZ(i, pos.getZ(i) + t * t * tilt * h);
  }
  if (anchor === 'bottom') g.translate(0, h / 2, 0);
  else if (anchor === 'top') g.translate(0, -h / 2, 0);
  g.setAttribute('windW', new THREE.BufferAttribute(ww, 1));
  g.computeVertexNormals();
  return g;
}

/** n 枚を Y のまわりに回して重ねる（どこから見ても形がある）。 */
function cross(n, w, h, quad, anchor = 'bottom', tilt = 0) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = card(w, h, quad, anchor, tilt);
    g.rotateY((i / n) * Math.PI);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  // 法線を上向きに寄せる（下から光が当たらない草の見え方）
  const nrm = m.attributes.normal;
  for (let i = 0; i < nrm.count; i++) {
    const v = new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).multiplyScalar(0.4).add(new THREE.Vector3(0, 0.6, 0)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return m;
}

/** 茂み：葉の板を球の形に何枚も。 */
function bushGeo(r, n, rng) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const g = card(r * 1.3, r * 1.3, 'bush', 'center');
    const ww = g.attributes.windW;
    for (let k = 0; k < ww.count; k++) ww.setX(k, 0.35 + 0.65 * (i / n));
    g.rotateX(rng() * Math.PI);
    g.rotateY(rng() * Math.PI * 2);
    const a = rng() * Math.PI * 2, el = rng() * 1.2, d = r * 0.45 * rng();
    g.translate(Math.cos(a) * Math.cos(el) * d, r * 0.55 + Math.sin(el) * d * 0.6, Math.sin(a) * Math.cos(el) * d);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  // 法線は中心から外へ（ふんわり丸く光が当たる）
  const pos = m.attributes.position, nrm = m.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i) - r * 0.3, pos.getZ(i)).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  return m;
}

export function buildPlants(B, M, scene, quality = 'high') {
  const rng = rand(9191);
  const H = L.hall;
  const dense = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
  const out = { meshes: [] };

  // ---------------------------------------------------------------- 垂れ下がるつた（Builder にまとめる）
  const vine = (x, y, z, len, w = 0.7, ry = 0) => {
    const g = cross(2, w * 1.5, len, 'vine', 'top');
    g.rotateY(ry);
    g.translate(x, y, z);
    B.add(g, M.vine, { cast: true, receive: true });
  };
  // トラスから
  for (const z of [-6, 0, 6, 12]) {
    for (let i = 0; i < 6; i++) {
      const x = H.x0 + 2 + rng() * (H.x1 - H.x0 - 4);
      vine(x, H.roof - 0.25, z + (rng() - 0.5) * 0.3, 1.5 + rng() * 4.5, 0.5 + rng() * 0.6, rng() * 3);
    }
  }
  // キャットウォーク・バルコニーのふちから
  for (let x = H.x0 + 1; x < H.x1 - 1; x += 1.3 + rng() * 2.5) vine(x, 8.75, H.z0 + 1.05, 1 + rng() * 3.2, 0.6 + rng() * 0.5, rng() * 3);
  for (let z = -11; z < 9.5; z += 1.2 + rng() * 2.2) vine(14.0, L.balcony.y - 0.4, z, 0.8 + rng() * 2.4, 0.6, rng() * 3);
  for (let x = 10.2; x < 14; x += 1.2 + rng() * 1.5) vine(x, L.balcony.y - 0.4, -4, 0.8 + rng() * 2.0, 0.6, rng() * 3);
  // 高窓・壁の上から
  for (let i = 0; i < 18; i++) {
    const side = i % 3;
    if (side === 0) vine(H.x0 + 0.15, 11 + rng() * 1.5, H.z0 + 1 + rng() * (H.z1 - H.z0 - 2), 2 + rng() * 5, 0.9, Math.PI / 2);
    else if (side === 1) vine(H.x1 - 0.15, 11 + rng() * 1.5, H.z0 + 1 + rng() * (H.z1 - H.z0 - 2), 2 + rng() * 5, 0.9, Math.PI / 2);
    else vine(H.x0 + 1 + rng() * (H.x1 - H.x0 - 2), 12 + rng(), H.z0 + 0.15, 2 + rng() * 4, 0.9, 0);
  }
  // 屋根の穴から
  for (const [x, z] of [[9.5, -9], [7.5, -3], [3.5, 3], [-5, -9], [-9, 9]]) for (let k = 0; k < 3; k++) vine(x + (rng() - 0.5) * 2, 14 + rng(), z + (rng() - 0.5) * 3, 3 + rng() * 4, 0.8, rng() * 3);
  // ホームの屋根のふち
  for (let x = L.platform.x0 + 3; x < L.platform.x1 - 3; x += 1.5 + rng() * 3) {
    if (x > 4 && x < 13.5) continue;
    vine(x, L.platform.canopy - 0.05, L.platform.z0 + 0.85, 0.8 + rng() * 2.4, 0.7, rng() * 3);
  }
  // 入口ホールの天井の穴
  for (let k = 0; k < 6; k++) vine(4 + rng() * 5, 6.2, 20 + rng() * 3.5, 1 + rng() * 2.5, 0.7, rng() * 3);
  // 忘れ物センターの天井の穴
  for (let k = 0; k < 4; k++) vine(-22.2 + rng() * 1.8, 3.45, 7.6 + rng() * 1.7, 0.5 + rng() * 1.3, 0.5, rng() * 3);
  // ホールの床の穴のふちから、横丁へ垂れる
  {
    const r2 = rand(2727);
    const [x0, x1, z0, z1] = L.pit[0];
    for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.6 + r2() * 0.9) {
      vine(x, -0.05, z0 + 0.1, 0.8 + r2() * 2.2, 0.6, 0);
      if (r2() < 0.6) vine(x + 0.3, -0.05, z1 - 0.1, 0.6 + r2() * 1.8, 0.6, 0);
    }
  }

  // ---------------------------------------------------------------- 壁をはうつた（壁に平らに）
  const ivy = (x, y, z, w, h, ry) => {
    const g = card(w, h, 'bush', 'bottom');
    const ww = g.attributes.windW;
    for (let k = 0; k < ww.count; k++) ww.setX(k, ww.getX(k) * 0.25);
    g.rotateY(ry);
    g.translate(x, y, z);
    B.add(g, M.bush, { cast: false, receive: true });
  };
  for (let i = 0; i < 26; i++) {
    const side = i % 4;
    const w = 1 + rng() * 2.5, h = 1.2 + rng() * 4;
    if (side === 0) ivy(H.x0 + 0.06, 0, H.z0 + 1 + rng() * (H.z1 - H.z0 - 2), w, h, Math.PI / 2);
    else if (side === 1) ivy(H.x1 - 0.06, 0, H.z0 + 1 + rng() * (H.z1 - H.z0 - 2), w, h, -Math.PI / 2);
    else if (side === 2) ivy(H.x0 + 1 + rng() * (H.x1 - H.x0 - 2), 0, H.z0 + 0.06, w, h, 0);
    else ivy(H.x0 + 1 + rng() * (H.x1 - H.x0 - 2), 0, H.z1 - 0.06, w, h, Math.PI);
  }
  // 高い所から垂れる大きなつたのカーテン
  for (const [x, z, ry] of [[H.x0 + 0.08, -8, Math.PI / 2], [H.x1 - 0.08, 5.5, -Math.PI / 2], [-12, H.z0 + 0.08, 0], [8.5, H.z0 + 0.08, 0]]) {
    const g = card(2.5 + rng() * 2, 6 + rng() * 3, 'vine', 'top');
    g.rotateY(ry);
    g.translate(x, H.roof - 0.5, z);
    B.add(g, M.vine, { cast: false });
  }

  // ---------------------------------------------------------------- 草（InstancedMesh）
  const grassGeo = cross(3, 0.55, 0.5, 'grass', 'bottom', 0.12);
  const spots = [];
  const sprinkle = (x0, x1, z0, z1, y, n, s0 = 0.6, s1 = 1.4) => { for (let i = 0; i < n * dense; i++) spots.push([x0 + rng() * (x1 - x0), y, z0 + rng() * (z1 - z0), s0 + rng() * (s1 - s0)]); };
  const clump = (x, z, y, r, n, s0 = 0.6, s1 = 1.3) => { for (let i = 0; i < n * dense; i++) { const a = rng() * 6.28, d = Math.sqrt(rng()) * r; spots.push([x + Math.cos(a) * d, y, z + Math.sin(a) * d, s0 + rng() * (s1 - s0)]); } };
  // ホール：壁ぎわ・床の割れ目・光の当たる所
  for (let i = 0; i < 40; i++) {
    const t = rng();
    const side = i % 4;
    const x = side === 0 ? H.x0 + 0.3 + rng() * 0.6 : side === 1 ? H.x1 - 0.3 - rng() * 0.6 : H.x0 + 1 + t * (H.x1 - H.x0 - 2);
    const z = side === 2 ? H.z0 + 0.3 + rng() * 0.6 : side === 3 ? H.z1 - 0.3 - rng() * 0.6 : H.z0 + 1 + t * (H.z1 - H.z0 - 2);
    clump(x, z, 0, 0.6, 5, 0.4, 1.0);
  }
  for (const [x, z, r, n] of [[-4, 2.5, 1.6, 26], [3.5, 9, 1.2, 18], [-9.5, 9.5, 1.4, 20], [6, -9, 2.4, 34], [-13, -3.4, 1.0, 14], [1, -5, 1.2, 16], [-1, 9, 1.0, 12], [16, -9.5, 1.5, 16]]) clump(x, z, 0, r, n);
  // ホーム・線路・2 番ホーム（たくさん）
  sprinkle(L.platform.x0, L.platform.x1, L.platform.z0 + 0.3, L.platform.z0 + 2.5, L.platform.y, 140, 0.5, 1.1);
  sprinkle(L.platform.x0, L.platform.x1, L.platform.z1 - 1.5, L.platform.z1 - 0.2, L.platform.y, 80, 0.5, 1.0);
  sprinkle(-36, 36, L.track1.z0, L.track1.z1, L.track1.y, 380, 0.7, 1.6);
  sprinkle(-34, 15, L.platform2.z0, L.platform2.z1, L.platform2.y, 420, 0.8, 1.9);
  sprinkle(-36, 36, L.track2.z0, L.track2.z1, L.track2.y, 320, 0.8, 1.8);
  sprinkle(-40, 40, L.track2.z0 - 6, L.track2.z0, 5.6, 300, 1.0, 2.2);
  // 外
  sprinkle(L.plaza.x0, L.plaza.x1, L.plaza.z0 + 0.5, L.plaza.z1, 0, 520, 0.6, 1.6);
  for (const [x, z, w, d] of [[2, 39, 8, 3], [-10, 41, 5, 3], [12, 41, 5, 3]]) sprinkle(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0.38, 50, 1.2, 2.4);
  // 入口ホール・地下の入口
  for (const [x, z, r, n] of [[6, 22, 2, 30], [-4, 26.5, 1.5, 16], [16, 18, 1.2, 12]]) clump(x, z, 0, r, n);
  sprinkle(L.office.x0 + 0.3, L.office.x0 + 3, L.office.z0 + 0.3, L.office.z0 + 3, 0, 18, 0.4, 0.9);
  // 床の穴の上には生やさない（下の横丁の分は、あとで坂の上に）
  // 売店・駅務室の中にも生やさない
  const inside = (x, z, r) => x > r.x0 - 0.2 && x < r.x1 + 0.2 && z > r.z0 - 0.2 && z < r.z1 + 0.2;
  for (let i = spots.length - 1; i >= 0; i--) {
    const [x, y, z] = spots[i];
    if (y === 0 && (inPit(x, z, 0.12) || inside(x, z, L.kiosk) || inside(x, z, L.stationOffice))) spots.splice(i, 1);
  }
  // 横丁：くずれた床の坂の、日の当たる所と、ふもと
  {
    const R = L.ramp, A = L.alley, r2 = rand(3131);
    const rampY = (x) => A.y + (x - R.x0) * (-A.y / (R.x1 - R.x0));
    for (let i = 0; i < 60 * dense; i++) {
      const x = -8.2 + r2() * 5.2, z = R.slab[0] + 0.2 + r2() * (R.slab[1] - R.slab[0] - 0.4);
      spots.push([x, rampY(x) - 0.02, z, 0.5 + r2() * 0.8]);
    }
    for (let i = 0; i < 26 * dense; i++) spots.push([R.x0 - 0.9 + r2() * 1.6, A.y, R.slab[0] + r2() * (R.slab[1] - R.slab[0]), 0.5 + r2() * 0.7]);
    for (let i = 0; i < 18 * dense; i++) spots.push([-7.5 + r2() * 4.5, A.y, A.z1 - 0.2 - r2() * 1.2, 0.4 + r2() * 0.6]);
  }
  const grass = new THREE.InstancedMesh(grassGeo, M.grass, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach(([x, y, z, s], i) => {
    e.set((rng() - 0.5) * 0.25, rng() * 6.28, (rng() - 0.5) * 0.25);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s * (0.8 + rng() * 0.5), s));
    grass.setMatrixAt(i, m4);
  });
  grass.name = 'grass';
  grass.receiveShadow = true;
  grass.castShadow = false;
  grass.computeBoundingSphere();
  scene.add(grass);
  out.meshes.push(grass);

  // ---------------------------------------------------------------- 茂み（InstancedMesh、3 種類の形）
  const bushes = [];
  const bush = (x, y, z, s) => bushes.push([x, y, z, s]);
  for (const [x, z, s] of [[17, 11, 1.4], [16, 14.5, 1.2], [-15, 15, 0.9], [-15, -11.3, 0.8], [6, -10.5, 1.0], [-0.9, 14.2, 0.6], [-15.2, 5.5, 0.6]]) bush(x, 0, z, s);
  // 横丁のすみ
  bush(-10.5, L.alley.y, 13.3, 0.7);
  bush(-3.3, L.alley.y, L.alley.z1 - 0.5, 0.55);
  for (let i = 0; i < 40 * dense; i++) bush(-34 + rng() * 49, L.platform2.y, L.platform2.z0 + rng() * (L.platform2.z1 - L.platform2.z0), 0.8 + rng() * 1.2);
  for (let i = 0; i < 60 * dense; i++) bush(-45 + rng() * 90, 5.6, L.track2.z0 - 1 - rng() * 5, 1.2 + rng() * 1.6);
  for (let i = 0; i < 26 * dense; i++) bush(L.platform.x0 + rng() * 64, L.platform.y, L.platform.z0 + 0.6 + rng() * 1.2, 0.5 + rng() * 0.6);
  for (let i = 0; i < 18; i++) bush(-36 + rng() * 72, L.track1.y, L.track1.z0 + rng() * 5, 0.7 + rng() * 0.8);
  // 外のふち（広場を囲む）
  for (let x = L.plaza.x0 - 1; x <= L.plaza.x1 + 1; x += 1.6) bush(x, 0, L.plaza.z1 + rng() * 1.5, 1.6 + rng() * 1.2);
  for (let z = L.plaza.z0 + 1; z <= L.plaza.z1; z += 1.6) { bush(L.plaza.x0 - 1.2, 0, z, 1.5 + rng()); bush(L.plaza.x1 + 1.2, 0, z, 1.5 + rng()); }
  for (const [x, z, w, d] of [[2, 39, 8, 3], [-10, 41, 5, 3], [12, 41, 5, 3]]) for (let k = 0; k < 4; k++) bush(x - w / 2 + 0.6 + rng() * (w - 1.2), 0.38, z - 0.6 + rng() * 1.2, 0.9 + rng() * 0.6);
  const bgeos = [bushGeo(0.8, 14, rng), bushGeo(0.8, 18, rng), bushGeo(0.8, 10, rng)];
  for (let k = 0; k < 3; k++) {
    const list = bushes.filter((_, i) => i % 3 === k);
    const im = new THREE.InstancedMesh(bgeos[k], M.bush, list.length);
    list.forEach(([x, y, z, s], i) => {
      e.set(0, rng() * 6.28, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, y - 0.1 * s, z), q, new THREE.Vector3(s, s * (0.7 + rng() * 0.5), s));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.name = 'bushes' + k;
    im.computeBoundingSphere();
    scene.add(im);
    out.meshes.push(im);
  }

  // ---------------------------------------------------------------- 木
  const tree = (x, y, z, h, r, lean = 0) => {
    const trunk = new THREE.CylinderGeometry(0.06 * h / 3, 0.12 * h / 3, h * 0.75, 7, 3);
    // 少し曲げる
    const pos = trunk.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) + h * 0.375) / (h * 0.75);
      pos.setX(i, pos.getX(i) + Math.sin(t * 2.2) * 0.15 * h / 3 + lean * t * t);
    }
    trunk.translate(x, y + h * 0.375, z);
    B.add(trunk, M.bark, { cast: true });
    const top = new THREE.Vector3(x + lean, y + h * 0.75, z);
    const n = Math.round(14 + r * 12);
    for (let i = 0; i < n; i++) {
      const g = card(r * 1.05, r * 1.05, i % 3 === 0 ? 'bush' : 'branch', 'bottom');
      const ww = g.attributes.windW;
      for (let k = 0; k < ww.count; k++) ww.setX(k, 0.3 + ww.getX(k) * 0.7);
      g.rotateX(-0.3 - rng() * 0.6);
      g.rotateY(rng() * Math.PI * 2);
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r * 0.55;
      g.translate(top.x + Math.cos(a) * d, top.y - r * 0.35 + rng() * r * 0.6, top.z + Math.sin(a) * d);
      B.add(g, M.treeLeaf, { cast: true });
    }
    // 枝（幹から外へ）
    for (let i = 0; i < 4; i++) {
      const a = rng() * 6.28;
      const b = new THREE.CylinderGeometry(0.015, 0.035, r * 0.6, 5);
      b.rotateZ(1.0);
      b.rotateY(a);
      b.translate(top.x + Math.cos(a) * r * 0.2, top.y - r * 0.1, top.z - Math.sin(a) * r * 0.2);
      B.add(b, M.bark, { cast: true });
    }
  };
  // ホールの中（屋根の穴の下、光の当たる所）
  tree(6.2, 0, -9.3, 4.2, 1.8, -0.3);
  tree(-4.2, 0, 2.6, 2.4, 1.1, 0.15);
  tree(-0.6, 0, 12.9, 1.6, 0.8, 0.1);
  // ホーム・線路の向こう
  for (let i = 0; i < 14; i++) tree(-44 + i * 6.5 + rng() * 2, 5.6, L.track2.z0 - 2.5 - rng() * 3, 5 + rng() * 3.5, 2.2 + rng());
  tree(-22, L.platform2.y, -32, 3.5, 1.6);
  tree(-5, L.platform2.y, -31, 2.8, 1.3);
  tree(9, L.platform2.y, -33, 3.2, 1.5);
  // 外（広場の大きな木と、まわりの木）
  tree(4.5, 0, 38.5, 8.5, 3.6, 0.4);
  for (let x = L.plaza.x0 - 2; x <= L.plaza.x1 + 2; x += 5 + rng() * 2) tree(x, 0, L.plaza.z1 + 2 + rng() * 2, 6 + rng() * 4, 2.6 + rng());
  for (let z = L.plaza.z0 + 3; z <= L.plaza.z1; z += 5 + rng() * 2) { tree(L.plaza.x0 - 2.5, 0, z, 6 + rng() * 3, 2.5); tree(L.plaza.x1 + 2.5, 0, z, 6 + rng() * 3, 2.5); }
  return out;
}
