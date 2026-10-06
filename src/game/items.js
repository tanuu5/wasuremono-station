// 忘れ物：7 つの小物の形と、置き場所・思い出の場面（残像の人・カメラ）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { postcardTex, ticketTex, sketchTex, strawTex } from './world/signs.js';
import { patch } from './world/materials.js';
import { L } from './world/layout.js';

const std = (o) => patch(new THREE.MeshStandardMaterial(o), {});

/** 忘れ物の一覧。pos = 置く場所（足もと）、ry = 向き、ghosts = 思い出の場面の人、cam = そのときのカメラ。 */
export const ITEMS = [
  {
    id: 'umbrella', pos: [1.55, 0, 15.05], ry: 0.3, lean: 0.32,
    ghosts: [{ type: 'girl', pos: [0.2, 0, 14.5], ry: 0.15, pose: 'stand', prop: 'umbrellaClosed' }],
    cam: { pos: [2.6, 1.3, 11.6], look: [0.6, 0.8, 14.8] },
  },
  {
    id: 'postcard', pos: [L.hall.x0 + 0.9, 0.455, 6.45], ry: 0.4,
    ghosts: [{ type: 'youngman', pos: [L.hall.x0 + 0.95, 0, 7.45], ry: Math.PI / 2, pose: 'sitWrite' }],
    cam: { pos: [-11.6, 1.5, 9.4], look: [-15, 1.1, 7.1] },
  },
  {
    id: 'marble', pos: [L.kiosk.x1 - 0.5, 1.0, -8.75], ry: 0,
    ghosts: [
      { type: 'kid', pos: [-7.25, 0.18, -0.55], ry: Math.PI * 0.95, pose: 'sitStep', prop: 'bottleUp' },
      { type: 'kid2', pos: [-6.35, 0.18, -0.6], ry: Math.PI * 1.05, pose: 'sitStep', prop: 'bottle' },
    ],
    cam: { pos: [-9.2, 1.3, 3.0], look: [-6.8, 0.8, -0.5] },
  },
  {
    id: 'hat', pos: [14.08, L.balcony.y + 0.97, 8.2], ry: Math.PI / 2, onRail: true,
    ghosts: [{ type: 'boy', pos: [17.3, L.balcony.y, 6.6], ry: -Math.PI / 2, pose: 'sitSwing' }],
    cam: { pos: [14.6, L.balcony.y + 1.5, 9.4], look: [17, L.balcony.y + 0.8, 6.4] },
  },
  {
    // つきみ横丁の入口（地下通路の割れ目のすぐ奥、床の穴から差す光の中）。残像の親子は通路を出口のほうへ
    id: 'rabbit', pos: [-10.15, L.alley.y, 11.45], ry: -Math.PI / 2 - 0.3,
    ghosts: [
      { type: 'mother', pos: [-13.95, L.under.y, 7.3], ry: 0, pose: 'walk', walk: [0, 0, 0.55] },
      { type: 'child', pos: [-13.1, L.under.y, 7.5], ry: Math.PI - 0.9, pose: 'lookBack', walk: [0, 0, 0.55], hand: true },
    ],
    cam: { pos: [-14.85, L.under.y + 1.45, 15.4], look: [-12.7, L.under.y + 0.75, 10.0] },
  },
  {
    id: 'ticket', pos: [-8.55, 0.42, L.entrance.z0 + 1.08], ry: 0, inMachine: true,
    ghosts: [{ type: 'oldman', pos: [-8.6, 0, L.entrance.z0 + 1.62], ry: Math.PI, pose: 'bend' }],
    cam: { pos: [-6.0, 1.4, L.entrance.z0 + 3.6], look: [-8.5, 1.0, L.entrance.z0 + 1.3] },
  },
  {
    id: 'sketch', pos: [-2.15, L.platform.y + 0.455, -19.55], ry: 0.2,
    ghosts: [{ type: 'child', pos: [-0.6, L.platform.y, -18.3], ry: -2.4, pose: 'wave' }],
    cam: { pos: [-3.6, L.platform.y + 1.2, -16.6], look: [-1.2, L.platform.y + 0.7, -19.2] },
  },
];
export const ITEM_IDS = ITEMS.map((i) => i.id);
export const itemById = (id) => ITEMS.find((i) => i.id === id);

/** 忘れ物の形。底が y = 0、+Z が前。 */
export function itemModel(id) {
  const g = new THREE.Group();
  g.name = 'item:' + id;
  const add = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  if (id === 'umbrella') {
    const red = std({ color: 0xc8322c, roughness: 0.45 });
    const dark = std({ color: 0x2a2a2a, roughness: 0.5 });
    // たたんだ傘：細い円すい（布）＋軸＋J の持ち手
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.008 + Math.sin(t * Math.PI) * 0.045 * (1 - t * 0.5), 0.06 + t * 0.42)); }
    const cloth = new THREE.LatheGeometry(pts, 10);
    add(cloth, red);
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.62, 6), dark, [0, 0.31, 0]);
    const hook = new THREE.TorusGeometry(0.035, 0.009, 6, 12, Math.PI);
    add(hook, red, [0.035, 0.62, 0], [0, 0, 0]);
    add(new THREE.ConeGeometry(0.006, 0.05, 6), dark, [0, 0.025, 0], [Math.PI, 0, 0]);
    // 名札
    add(new THREE.BoxGeometry(0.03, 0.02, 0.003), std({ color: 0xf2efe6 }), [0.0, 0.5, 0.03]);
  } else if (id === 'postcard') {
    const tex = postcardTex();
    add(new THREE.BoxGeometry(0.15, 0.002, 0.1), std({ color: 0xf2efe6, roughness: 0.8 }));
    const top = add(new THREE.PlaneGeometry(0.145, 0.096), std({ map: tex, roughness: 0.7 }), [0, 0.0015, 0], [-Math.PI / 2, 0, 0]);
    top.castShadow = false;
  } else if (id === 'marble') {
    // ラムネの瓶（くびれにビー玉）
    const pts = [];
    const prof = [[0, 0], [0.028, 0], [0.03, 0.01], [0.03, 0.09], [0.026, 0.11], [0.015, 0.13], [0.017, 0.145], [0.014, 0.16], [0.016, 0.19], [0.014, 0.2], [0, 0.2]];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fd4d0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 2 });
    patch(glass, {});
    add(new THREE.LatheGeometry(pts, 18), glass);
    const marble = add(new THREE.SphereGeometry(0.0125, 14, 10), std({ color: 0xcff6ff, roughness: 0.02, metalness: 0.1, envMapIntensity: 3, emissive: 0x2a5560 }), [0, 0.14, 0]);
    marble.name = 'marbleBall';
    add(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 14), std({ color: 0x2e7ec6, roughness: 0.4 }), [0, 0.205, 0]);
    add(new THREE.CylinderGeometry(0.0305, 0.0305, 0.05, 18, 1, true), std({ color: 0x3a8ad0, roughness: 0.5, side: THREE.DoubleSide }), [0, 0.05, 0]);
  } else if (id === 'hat') {
    const straw = std({ map: strawTex(), roughness: 0.85, side: THREE.DoubleSide });
    const pts = [];
    const prof = [[0.0, 0.1], [0.06, 0.1], [0.085, 0.085], [0.09, 0.03], [0.095, 0.012], [0.16, 0.006], [0.2, -0.004], [0.205, -0.008]];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y + 0.01));
    add(new THREE.LatheGeometry(pts, 28), straw);
    const ribbon = new THREE.CylinderGeometry(0.092, 0.094, 0.025, 28, 1, true);
    add(ribbon, std({ color: 0x2f62b8, roughness: 0.6, side: THREE.DoubleSide }), [0, 0.035, 0]);
    add(new THREE.BoxGeometry(0.05, 0.02, 0.01), std({ color: 0x2f62b8 }), [0.06, 0.035, 0.075], [0, 0.6, 0.3]);
  } else if (id === 'rabbit') {
    const fur = std({ color: 0xf1e6dc, roughness: 0.95 });
    const pink = std({ color: 0xe8b4b8, roughness: 0.9 });
    const black = std({ color: 0x1a1a1a, roughness: 0.3 });
    const body = new THREE.SphereGeometry(0.075, 18, 14);
    body.scale(1, 1.15, 0.9);
    add(body, fur, [0, 0.085, 0]);
    add(new THREE.SphereGeometry(0.065, 18, 14), fur, [0, 0.21, 0.01]);
    for (const s of [-1, 1]) {
      const ear = new THREE.CapsuleGeometry(0.02, 0.09, 4, 8);
      const e = add(ear, fur, [s * 0.03, 0.31, -0.005], [s < 0 ? -0.1 : 0.9, 0, s * 0.15]);
      if (s > 0) e.position.set(0.05, 0.285, 0.02); // とれかけた耳
      add(new THREE.SphereGeometry(0.009, 8, 6), black, [s * 0.025, 0.22, 0.068]);
      add(new THREE.SphereGeometry(0.026, 10, 8), fur, [s * 0.065, 0.11, 0.03]);   // 手
      add(new THREE.SphereGeometry(0.03, 10, 8), fur, [s * 0.045, 0.02, 0.05]);    // 足
    }
    add(new THREE.SphereGeometry(0.012, 8, 6), pink, [0, 0.205, 0.072]);
    // 首のリボン
    add(new THREE.TorusGeometry(0.045, 0.008, 6, 16), std({ color: 0xc8322c, roughness: 0.6 }), [0, 0.16, 0], [Math.PI / 2, 0, 0]);
  } else if (id === 'ticket') {
    add(new THREE.BoxGeometry(0.07, 0.0015, 0.035), std({ color: 0xe8d9a8 }));
    const top = add(new THREE.PlaneGeometry(0.068, 0.034), std({ map: ticketTex(), roughness: 0.7 }), [0, 0.001, 0], [-Math.PI / 2, 0, 0]);
    top.castShadow = false;
    g.scale.setScalar(1.6);
  } else if (id === 'sketch') {
    const cover = std({ color: 0x3b6fa8, roughness: 0.75 });
    add(new RoundedBoxGeometry(0.3, 0.018, 0.22, 2, 0.004), cover, [0, 0.009, 0]);
    const page = add(new THREE.PlaneGeometry(0.27, 0.2), std({ map: sketchTex(), roughness: 0.85 }), [0, 0.0185, 0], [-Math.PI / 2, 0, 0]);
    page.castShadow = false;
    for (let i = 0; i < 9; i++) add(new THREE.TorusGeometry(0.008, 0.0015, 4, 8), std({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 }), [-0.13 + i * 0.0325, 0.012, -0.112], [0, Math.PI / 2, 0]);
  }
  return g;
}

/** 忘れ物のまわりの、ほのかな光（遠くからでも見つけられるように）。 */
export function itemGlow() {
  const g = new THREE.Group();
  g.name = 'itemGlow';
  // 縦の細い光の柱
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255,240,200,0)');
  grd.addColorStop(0.6, 'rgba(255,240,200,0.35)');
  grd.addColorStop(1, 'rgba(255,240,200,0.9)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 32, 128);
  const img = x.getImageData(0, 0, 32, 128);
  for (let yy = 0; yy < 128; yy++) for (let xx = 0; xx < 32; xx++) {
    const k = Math.sin((xx / 31) * Math.PI);
    img.data[(yy * 32 + xx) * 4 + 3] *= k * k;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe6b0, toneMapped: false, opacity: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.6), mat);
    p.position.y = 0.8;
    p.rotation.y = i * Math.PI / 2;
    p.renderOrder = 7;
    g.add(p);
  }
  // きらきら（小さな点）
  const n = 14;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.4; pos[i * 3 + 1] = Math.random() * 0.8; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4; seed[i] = Math.random(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const pm = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float t = fract(uTime * 0.25 + seed); p.y = mod(p.y + uTime * 0.18, 0.9);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = (18.0 + 14.0 * sin(uTime * 3.0 + seed * 20.0)) / max(-mv.z, 0.3);
        vA = sin(t * 3.14159) * (0.6 + 0.4 * sin(uTime * 5.0 + seed * 40.0)); }`,
    fragmentShader: `uniform float uAlpha; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.25, 0.0, dot(c, c));
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.72) * a * vA * uAlpha, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, pm);
  pts.renderOrder = 8;
  g.add(pts);
  g.userData.update = (t, a = 1) => { pm.uniforms.uTime.value = t; pm.uniforms.uAlpha.value = a; mat.opacity = 0.5 * a * (0.75 + 0.25 * Math.sin(t * 2)); };
  return g;
}
