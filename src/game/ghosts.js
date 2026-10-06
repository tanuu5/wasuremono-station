// 残像：忘れ物の持ち主の、思い出の姿。半透明で、ふちがほのかに光る（こわくない、やさしい光）。
// 体は単純な形（頭・胴・腕・脚）。姿勢は関節の角度の組で決める（ロボットと同じ考え方）。
import * as THREE from 'three';
import { damp, lerp } from '../core/math.js';

const VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uRim;
  uniform float uAlpha; uniform float uTime; uniform float uAppear; uniform float uBase; uniform float uHeight;
  varying vec3 vN; varying vec3 vW;
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  void main() {
    vec3 V = cameraPosition - vW;
    V /= max(length(V), 1e-4);
    vec3 N = normalize(vN);
    float f = 1.0 - abs(dot(N, V));
    float fr = f * f;
    // 足もとから現れる（uAppear 0→1）。ふちにノイズ
    float hy = (vW.y - uBase) / max(uHeight, 0.1);
    float edge = uAppear * 1.25 - hy + (h21(floor(vW.xz * 40.0) + floor(vW.y * 40.0)) - 0.5) * 0.12;
    if (edge < 0.0) discard;
    float glowEdge = smoothstep(0.12, 0.0, edge) * step(uAppear, 0.999);
    float scan = 0.88 + 0.12 * sin(vW.y * 55.0 - uTime * 2.4);
    float body = (0.28 + fr * 1.1) * scan;
    vec3 col = mix(uColor, uRim, fr * 0.8) * body + uRim * glowEdge * 1.5;
    float a = clamp(body + glowEdge, 0.0, 1.4) * uAlpha;
    gl_FragColor = vec4(col * a, 1.0);
  }`;

let haloTex = null;
function haloMaterial() {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,236,200,0.55)');
    grd.addColorStop(0.45, 'rgba(200,236,255,0.18)');
    grd.addColorStop(1, 'rgba(200,236,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    haloTex = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
}

function ghostMaterial(color = 0xfff1d8, rim = 0x9fe8ff) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uRim: { value: new THREE.Color(rim) }, uAlpha: { value: 0 }, uTime: { value: 0 }, uAppear: { value: 0 }, uBase: { value: 0 }, uHeight: { value: 1.6 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

// 体つき：h = 身長、build = 太さ、skirt / hair / cap / hat / bag
const TYPES = {
  girl: { h: 1.12, build: 0.85, skirt: true, hair: 'twin' },
  youngman: { h: 1.74, build: 1.0, hair: 'short' },
  kid: { h: 1.25, build: 0.85, cap: true },
  kid2: { h: 1.2, build: 0.85, hair: 'short' },
  boy: { h: 1.3, build: 0.85, hair: 'short', bag: true },
  mother: { h: 1.6, build: 0.92, skirt: true, hair: 'long' },
  child: { h: 0.98, build: 0.8, hair: 'bob', skirt: true },
  oldman: { h: 1.62, build: 1.0, hat: true, cane: true },
  stationmaster: { h: 1.72, build: 1.05, cap: true, uniform: true },
  woman: { h: 1.62, build: 0.9, skirt: true, hair: 'long' },
  man: { h: 1.75, build: 1.05, hair: 'short' },
};

const ZERO = { hipsY: 0, spineP: 0, spineR: 0, headP: 0, headY: 0, headR: 0, shLP: 0, shLR: 0, elL: 0, shRP: 0, shRR: 0, elR: 0, hipLP: 0, kneeL: 0, hipRP: 0, kneeR: 0 };
export const GHOST_POSES = {
  stand: { shLR: 0.08, shRR: -0.08, elL: -0.15, elR: -0.15 },
  sitWrite: { hipsY: -0.48, spineP: 0.3, headP: 0.4, shLP: -0.7, elL: -1.3, shRP: -0.5, elR: -1.1, hipLP: -1.5, kneeL: 1.5, hipRP: -1.5, kneeR: 1.5 },
  sitStep: { hipsY: -0.5, spineP: 0.05, headP: -0.2, shLP: -0.3, elL: -0.6, shRP: -1.9, elR: -0.4, hipLP: -1.4, kneeL: 1.4, hipRP: -1.4, kneeR: 1.4 },
  sitSwing: { hipsY: -0.48, spineP: -0.05, headP: -0.25, shLP: -0.2, elL: -0.5, shRP: -0.2, elR: -0.5, hipLP: -1.5, kneeL: 1.3, hipRP: -1.5, kneeR: 1.3 },
  walk: { shLR: 0.06, shRR: -0.06 },
  lookBack: { headY: 1.1, spineR: 0.0, shRP: -0.6, elR: -0.3 },
  bend: { spineP: 0.55, headP: 0.1, shLP: -0.9, elL: -0.2, shRP: -0.3, elR: -0.3, hipLP: -0.2, kneeL: 0.3, hipRP: -0.2, kneeR: 0.3 },
  wave: { shRP: -2.7, shRR: -0.3, elR: -0.4, headR: 0.15 },
  bow: { spineP: 0.7, headP: 0.2, shLP: 0.1, shRP: 0.1 },
};

export class Ghost {
  constructor(type = 'man', { color, rim } = {}) {
    const T = (this.T = TYPES[type] || TYPES.man);
    this.type = type;
    this.mat = ghostMaterial(color, rim);
    const s = T.h / 1.7;
    const b = T.build;
    const root = (this.root = new THREE.Group());
    root.name = 'ghost:' + type;
    const mk = (geo, parent, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, this.mat); m.position.set(...pos); m.rotation.set(...rot); m.renderOrder = 9; parent.add(m); return m; };
    const grp = (parent, pos) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };
    const J = (this.j = {});
    J.hips = grp(root, [0, 0.92 * s, 0]);
    J.spine = grp(J.hips, [0, 0.05 * s, 0]);
    mk(new THREE.CapsuleGeometry(0.15 * s * b, 0.3 * s, 6, 14), J.spine, [0, 0.27 * s, 0]).scale.set(1, 1, 0.7);
    if (T.skirt) mk(new THREE.CylinderGeometry(0.12 * s, 0.24 * s, 0.38 * s, 16, 1, true), J.hips, [0, -0.13 * s, 0]);
    J.neck = grp(J.spine, [0, 0.55 * s, 0]);
    J.head = grp(J.neck, [0, 0.13 * s, 0]);
    const kid = T.h < 1.4;
    const hr = (kid ? 0.13 : 0.11) * (kid ? T.h / 1.2 : s);
    mk(new THREE.SphereGeometry(hr, 18, 14), J.head, [0, 0.02, 0]);
    if (T.hair === 'twin') for (const k of [-1, 1]) mk(new THREE.SphereGeometry(hr * 0.35, 10, 8), J.head, [k * hr * 1.0, -0.01, -hr * 0.3]);
    if (T.hair === 'long') mk(new THREE.CapsuleGeometry(hr * 0.85, hr * 1.4, 4, 10), J.head, [0, -hr * 0.6, -hr * 0.45]);
    if (T.hair === 'bob') mk(new THREE.SphereGeometry(hr * 1.08, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), J.head, [0, 0.03, -0.01]);
    if (T.cap) { mk(new THREE.CylinderGeometry(hr * 0.95, hr * 1.02, hr * 0.5, 16), J.head, [0, hr * 0.75, 0]); mk(new THREE.BoxGeometry(hr * 1.6, 0.012, hr * 0.9), J.head, [0, hr * 0.55, hr * 0.7]); }
    if (T.hat) { mk(new THREE.CylinderGeometry(hr * 0.8, hr * 0.85, hr * 0.6, 14), J.head, [0, hr * 0.8, 0]); mk(new THREE.CylinderGeometry(hr * 1.5, hr * 1.5, 0.015, 18), J.head, [0, hr * 0.5, 0]); }
    if (T.bag) mk(new THREE.BoxGeometry(0.26 * s, 0.3 * s, 0.12 * s), J.spine, [0, 0.3 * s, -0.16 * s]);
    for (const side of [-1, 1]) {
      const k = side < 0 ? 'R' : 'L';
      const sh = (J['sh' + k] = grp(J.spine, [side * 0.2 * s * b, 0.48 * s, 0]));
      mk(new THREE.CapsuleGeometry(0.045 * s * b, 0.22 * s, 4, 8), sh, [0, -0.14 * s, 0]);
      const el = (J['el' + k] = grp(sh, [0, -0.29 * s, 0]));
      mk(new THREE.CapsuleGeometry(0.04 * s * b, 0.2 * s, 4, 8), el, [0, -0.13 * s, 0]);
      mk(new THREE.SphereGeometry(0.045 * s, 8, 6), el, [0, -0.27 * s, 0]);
      const hip = (J['hip' + k] = grp(J.hips, [side * 0.09 * s * b, -0.04 * s, 0]));
      mk(new THREE.CapsuleGeometry(0.065 * s * b, 0.3 * s, 4, 8), hip, [0, -0.21 * s, 0]);
      const kn = (J['knee' + k] = grp(hip, [0, -0.43 * s, 0]));
      mk(new THREE.CapsuleGeometry(0.055 * s * b, 0.32 * s, 4, 8), kn, [0, -0.2 * s, 0]);
      mk(new THREE.BoxGeometry(0.09 * s, 0.06 * s, 0.2 * s), kn, [0, -0.43 * s, 0.04 * s]);
    }
    if (T.cane) { const c = mk(new THREE.CylinderGeometry(0.012, 0.012, 0.85 * s, 6), J.elR, [0, -0.6 * s, 0.05]); this.cane = c; }
    this.s = s;
    this.pose = { ...ZERO };
    this.cur = { ...ZERO };
    this.poseName = 'stand';
    this.alpha = 0;
    this.want = 0;
    this.appear = 0;
    this.t = Math.random() * 10;
    this.walkVel = null;
    this.props = new THREE.Group();
    root.add(this.props);
    // 体のまわりのやわらかい光
    this.halo = new THREE.Sprite(haloMaterial());
    this.halo.scale.set(T.h * 1.1, T.h * 1.25, 1);
    this.halo.position.y = T.h * 0.55;
    this.halo.renderOrder = 8;
    root.add(this.halo);
  }

  /** 小物を持たせる（同じ光の材質で）。 */
  addProp(kind) {
    const s = this.s, m = this.mat;
    const hand = this.j.elR;
    if (kind === 'umbrellaClosed') {
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.5, 8), m); c.rotation.x = Math.PI; c.position.y = -0.2;
      g.add(c);
      g.position.set(0, -0.3 * s, 0.05);
      this.j.elL.add(g);
    } else if (kind === 'bottleUp' || kind === 'bottle') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 10), m);
      b.position.set(0, -0.32 * s, 0.03);
      hand.add(b);
    }
  }

  setPose(name) { this.poseName = name; }

  /** 見せる・消す（足もとから現れて、ゆっくり消える）。 */
  show(on) { this.want = on ? 1 : 0; }

  get visible() { return this.alpha > 0.01; }

  update(dt) {
    this.t += dt;
    const P = { ...ZERO, ...(GHOST_POSES[this.poseName] || {}) };
    if (this.poseName === 'walk' || this.walkVel || this.boardTo) {
      const ph = this.t * 5.2;
      P.hipLP += Math.sin(ph) * 0.45; P.hipRP -= Math.sin(ph) * 0.45;
      P.kneeL += Math.max(0, -Math.sin(ph - 1.2)) * 0.8; P.kneeR += Math.max(0, Math.sin(ph - 1.2)) * 0.8;
      if (this.poseName === 'walk') { P.shLP -= Math.sin(ph) * 0.35; P.shRP += Math.sin(ph) * 0.35; }
      P.hipsY += -Math.abs(Math.cos(ph)) * 0.02;
    }
    if (this.poseName === 'sitSwing') { P.kneeL += Math.sin(this.t * 3) * 0.35; P.kneeR += Math.sin(this.t * 3 + 2) * 0.35; }
    if (this.poseName === 'wave') P.shRR += Math.sin(this.t * 7) * 0.25;
    if (this.poseName === 'sitWrite') P.elR += Math.sin(this.t * 6) * 0.08;
    if (this.poseName === 'stand') { P.headY += Math.sin(this.t * 0.6) * 0.15; P.spineP += Math.sin(this.t * 1.4) * 0.01; }
    for (const k of Object.keys(ZERO)) this.cur[k] = damp(this.cur[k], P[k], 6, dt);
    const c = this.cur, J = this.j, s = this.s;
    J.hips.position.y = 0.92 * s + c.hipsY * s;
    J.spine.rotation.set(c.spineP, 0, c.spineR);
    J.head.rotation.set(c.headP, c.headY, c.headR);
    J.shL.rotation.set(c.shLP, 0, 0.1 + c.shLR);
    J.shR.rotation.set(c.shRP, 0, -0.1 + c.shRR);
    J.elL.rotation.set(c.elL, 0, 0);
    J.elR.rotation.set(c.elR, 0, 0);
    J.hipL.rotation.set(c.hipLP, 0, 0);
    J.hipR.rotation.set(c.hipRP, 0, 0);
    J.kneeL.rotation.set(c.kneeL, 0, 0);
    J.kneeR.rotation.set(c.kneeR, 0, 0);
    if (this.walkVel && this.alpha > 0.01) this.root.position.addScaledVector(this.walkVel, dt);
    // 列車の扉へ歩いていく（着いたら消える）
    if (this.boardTo) {
      const p = this.root.position;
      const dx = this.boardTo.x - p.x, dz = this.boardTo.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const sp = Math.min(0.9, d * 2) * dt;
        p.x += (dx / d) * sp; p.z += (dz / d) * sp;
        this.root.rotation.y = Math.atan2(dx, dz);
      } else if (this.want) { this.show(false); }
    }
    // 出入り
    this.alpha = damp(this.alpha, this.want, this.want ? 1.6 : 1.1, dt);
    this.appear = this.want ? Math.min(1, this.appear + dt * 0.8) : this.appear;
    if (!this.want && this.alpha < 0.02) this.appear = 0;
    const u = this.mat.uniforms;
    u.uAlpha.value = this.alpha * (0.85 + 0.15 * Math.sin(this.t * 2.3)) * (this.boost || 1);
    u.uTime.value = this.t;
    u.uAppear.value = this.appear;
    u.uBase.value = this.root.position.y - 0.05;
    u.uHeight.value = this.T.h + 0.1;
    this.halo.material.opacity = this.alpha * 0.55 * Math.min(1, this.appear * 1.5);
    this.root.visible = this.alpha > 0.005;
  }
}

/** 思い出の場面：items.js の ghosts の並びから作る。 */
export function makeScene(specs) {
  return specs.map((sp) => {
    const g = new Ghost(sp.type);
    g.root.position.set(...sp.pos);
    g.root.rotation.y = sp.ry || 0;
    g.setPose(sp.pose || 'stand');
    if (sp.prop) g.addProp(sp.prop);
    if (sp.walk) g.walkVel = new THREE.Vector3(...sp.walk);
    g.home = new THREE.Vector3(...sp.pos);
    return g;
  });
}
