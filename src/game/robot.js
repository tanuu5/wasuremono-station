// トモ：駅の小さな案内ロボット（高さ約 1m）。白くて丸い頭、横に水色に光る耳、茶色の背負いかばん、右手にランタン。
// 形（RobotModel）と動き（RobotAnimator）を分ける。動きは「姿勢」（関節の角度の組）を重ねて作る：
//   歩き・走り・待機の姿勢 ＋ 演出の姿勢（座る・拾う・持つ・手をふる…）を重みで混ぜる。
// ランタンは手から吊り下げた振り子（手の加速度でゆれる）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, damp, lerp, wrapAngle } from '../core/math.js';
import { patch } from './world/materials.js';
import { robotShell } from './world/tex.js';

const CYAN = 0x6fe6ff;

// ---------------------------------------------------------------- 目（顔の画面に描く）
const EYE_W = 256, EYE_H = 128;
function eyeCanvas(kind, color = '#7ff0ff') {
  const c = document.createElement('canvas');
  c.width = EYE_W; c.height = EYE_H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, EYE_W, EYE_H);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.shadowColor = color;
  g.shadowBlur = 14;
  const L = [EYE_W * 0.36, EYE_H * 0.5], R = [EYE_W * 0.64, EYE_H * 0.5];
  const pill = (x, y, w, h) => { g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2); g.fill(); };
  for (const [x, y] of [L, R]) {
    if (kind === 'open') pill(x, y, 22, 40);
    else if (kind === 'half') pill(x, y + 6, 22, 20);
    else if (kind === 'blink' || kind === 'closed') { g.lineWidth = 7; g.beginPath(); g.moveTo(x - 13, y + 4); g.lineTo(x + 13, y + 4); g.stroke(); }
    else if (kind === 'happy') { g.lineWidth = 8; g.beginPath(); g.arc(x, y + 10, 14, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    else if (kind === 'wide') { g.beginPath(); g.ellipse(x, y, 15, 22, 0, 0, 6.28); g.fill(); }
    else if (kind === 'sad') { pill(x, y + 4, 20, 30); g.save(); g.globalCompositeOperation = 'destination-out'; g.shadowBlur = 0; g.beginPath(); g.moveTo(x - 20, y - 22); g.lineTo(x + 20, y - 22); g.lineTo(x + (x < EYE_W / 2 ? 20 : -20), y - 6); g.closePath(); g.fill(); g.restore(); }
    else if (kind === 'boot') { g.lineWidth = 4; g.strokeRect(x - 11, y - 16, 22, 32); }
  }
  return c;
}

/** 顔の画面の形（角の丸い四角）。alphaMap に使う。 */
function visorMask() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#fff';
  g.beginPath();
  g.roundRect(6, 8, 244, 112, 44);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** 形を作る。root は足もとが y = 0、+Z を向く。 */
export class RobotModel {
  constructor({ shellTex = null } = {}) {
    const shell = shellTex || robotShell();
    const P = (m, o = {}) => patch(m, o);
    this.mats = {
      shell: P(new THREE.MeshStandardMaterial({ name: 'shell', map: shell.map, roughnessMap: shell.roughnessMap, roughness: 1, envMapIntensity: 1.0 })),
      joint: P(new THREE.MeshStandardMaterial({ name: 'joint', color: 0x3a3c40, roughness: 0.55, metalness: 0.3 })),
      dark: P(new THREE.MeshStandardMaterial({ name: 'dark', color: 0x24262a, roughness: 0.6, metalness: 0.2 })),
      visor: P(new THREE.MeshStandardMaterial({ name: 'visor', color: 0x0b0d10, roughness: 0.12, metalness: 0.4, envMapIntensity: 1.6, alphaMap: visorMask(), alphaTest: 0.5 })),
      eyes: new THREE.MeshBasicMaterial({ name: 'eyes', transparent: true, depthWrite: false, toneMapped: false, color: 0xffffff }),
      glow: new THREE.MeshBasicMaterial({ name: 'glow', color: CYAN, toneMapped: false }),
      leather: P(new THREE.MeshStandardMaterial({ name: 'leather', color: 0x7a5636, roughness: 0.72 })),
      leatherDark: P(new THREE.MeshStandardMaterial({ name: 'leatherDark', color: 0x4e3622, roughness: 0.75 })),
      cloth: P(new THREE.MeshStandardMaterial({ name: 'cloth', color: 0x6f7a5a, roughness: 0.95 })),
      solar: P(new THREE.MeshStandardMaterial({ name: 'solar', color: 0x1d2c4a, roughness: 0.25, metalness: 0.5, envMapIntensity: 1.4 })),
      brass: P(new THREE.MeshStandardMaterial({ name: 'brass', color: 0xa67c3d, roughness: 0.4, metalness: 0.85 })),
      iron: P(new THREE.MeshStandardMaterial({ name: 'iron', color: 0x2c2a28, roughness: 0.55, metalness: 0.7 })),
      lanternGlass: new THREE.MeshStandardMaterial({ name: 'lanternGlass', color: 0xffe2b0, roughness: 0.1, transparent: true, opacity: 0.35, emissive: 0xffb45a, emissiveIntensity: 0.6, depthWrite: false }),
      flame: new THREE.MeshBasicMaterial({ name: 'flame', color: 0xffd28a, toneMapped: false }),
    };
    const M = this.mats;
    // 目のテクスチャ
    this.eyeTex = {};
    for (const k of ['open', 'half', 'blink', 'closed', 'happy', 'wide', 'sad', 'boot']) {
      const t = new THREE.CanvasTexture(eyeCanvas(k));
      t.colorSpace = THREE.SRGBColorSpace;
      this.eyeTex[k] = t;
    }
    M.eyes.map = this.eyeTex.open;

    const root = (this.root = new THREE.Group());
    root.name = 'tomo';
    const mesh = (geo, mat, name, parent, pos = [0, 0, 0], rot = [0, 0, 0], scale = null) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.position.set(...pos);
      m.rotation.set(...rot);
      if (scale) m.scale.set(...scale);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const group = (name, parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); return g; };
    const J = (this.j = {});

    // 腰
    J.hips = group('hips', root, [0, 0.43, 0]);
    mesh(new RoundedBoxGeometry(0.24, 0.1, 0.16, 3, 0.04), M.joint, 'pelvis', J.hips, [0, -0.01, 0]);
    // 脚
    // 注意：+Z を向いているので、ロボットの右は -X、左は +X
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L';
      const hip = (J['hip' + side] = group('hip' + side, J.hips, [0.075 * s, -0.04, 0]));
      mesh(new THREE.SphereGeometry(0.05, 16, 10), M.joint, 'hipBall' + side, hip);
      mesh(new RoundedBoxGeometry(0.1, 0.12, 0.11, 3, 0.035), M.shell, 'thigh' + side, hip, [0, -0.07, 0]);
      const knee = (J['knee' + side] = group('knee' + side, hip, [0, -0.15, 0]));
      mesh(new THREE.SphereGeometry(0.046, 14, 10), M.joint, 'kneeBall' + side, knee);
      mesh(new RoundedBoxGeometry(0.11, 0.13, 0.12, 3, 0.038), M.shell, 'shin' + side, knee, [0, -0.08, 0.002]);
      const ankle = (J['ankle' + side] = group('ankle' + side, knee, [0, -0.16, 0]));
      mesh(new RoundedBoxGeometry(0.125, 0.085, 0.19, 3, 0.04), M.shell, 'boot' + side, ankle, [0, -0.028, 0.03]);
      mesh(new RoundedBoxGeometry(0.13, 0.025, 0.195, 2, 0.01), M.dark, 'sole' + side, ankle, [0, -0.072, 0.03]);
    }
    // 胴
    J.spine = group('spine', J.hips, [0, 0.03, 0]);
    mesh(new RoundedBoxGeometry(0.29, 0.25, 0.22, 4, 0.09), M.shell, 'torso', J.spine, [0, 0.14, 0]);
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 20), M.joint, 'waist', J.spine, [0, 0.0, 0]);
    // 胸のランプと番号
    mesh(new THREE.CircleGeometry(0.022, 18), M.glow, 'chestLight', J.spine, [0.05, 0.17, 0.123], [0, 0.25, 0]);
    mesh(new RoundedBoxGeometry(0.07, 0.03, 0.02, 2, 0.008), M.dark, 'chestPlate', J.spine, [-0.04, 0.2, 0.118], [0, -0.2, 0]);
    // 背負いかばん
    const pack = (J.pack = group('pack', J.spine, [0, 0.13, -0.16]));
    mesh(new RoundedBoxGeometry(0.27, 0.28, 0.13, 4, 0.04), M.leather, 'bag', pack);
    mesh(new RoundedBoxGeometry(0.28, 0.1, 0.14, 3, 0.03), M.leatherDark, 'flap', pack, [0, 0.1, 0.004], [0.08, 0, 0]);
    mesh(new RoundedBoxGeometry(0.16, 0.1, 0.05, 3, 0.02), M.leather, 'pocket', pack, [0, -0.05, -0.075]);
    for (const s of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.025, 0.13, 0.01), M.leatherDark, 'buckleStrap', pack, [0.06 * s, 0.035, -0.07]);
      mesh(new THREE.BoxGeometry(0.03, 0.02, 0.012), M.brass, 'buckle', pack, [0.06 * s, -0.01, -0.076]);
      // 肩ひも（前にまわる）
      mesh(new THREE.BoxGeometry(0.035, 0.24, 0.015), M.leatherDark, 'strap', J.spine, [0.075 * s, 0.17, 0.115], [0.25, 0, 0]);
      mesh(new THREE.BoxGeometry(0.035, 0.015, 0.2), M.leatherDark, 'strapTop', J.spine, [0.075 * s, 0.27, -0.0], [0, 0, 0]);
    }
    // ふたの上の、小さな太陽電池の板（日の光で動く）
    mesh(new THREE.BoxGeometry(0.17, 0.006, 0.08), M.solar, 'solar', pack, [0, 0.152, -0.005], [0.1, 0, 0]);
    // 腕
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L';
      const sh = (J['shoulder' + side] = group('shoulder' + side, J.spine, [0.165 * s, 0.215, 0]));
      mesh(new THREE.SphereGeometry(0.046, 14, 10), M.joint, 'shoulderBall' + side, sh);
      const pad = new THREE.SphereGeometry(0.068, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
      mesh(pad, M.shell, 'shoulderPad' + side, sh, [0.012 * s, 0.012, 0], [0, 0, -0.35 * s]);
      mesh(new THREE.CylinderGeometry(0.044, 0.04, 0.1, 12), M.shell, 'upperArm' + side, sh, [0, -0.075, 0]);
      const el = (J['elbow' + side] = group('elbow' + side, sh, [0, -0.138, 0]));
      mesh(new THREE.SphereGeometry(0.038, 12, 8), M.joint, 'elbowBall' + side, el);
      mesh(new RoundedBoxGeometry(0.088, 0.105, 0.088, 3, 0.03), M.shell, 'forearm' + side, el, [0, -0.062, 0]);
      const hand = (J['hand' + side] = group('hand' + side, el, [0, -0.125, 0]));
      const mit = new THREE.SphereGeometry(0.042, 14, 10);
      mit.scale(0.85, 1.0, 1.05);
      mesh(mit, M.dark, 'mitten' + side, hand, [0, -0.01, 0]);
      mesh(new THREE.CapsuleGeometry(0.015, 0.03, 4, 8), M.dark, 'thumb' + side, hand, [-0.025 * s, 0.0, 0.03], [0.6, 0, 0.3 * s]);
    }
    // 首と頭
    J.neck = group('neck', J.spine, [0, 0.28, 0]);
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 14), M.joint, 'neckMesh', J.neck, [0, 0.0, 0]);
    J.head = group('head', J.neck, [0, 0.155, 0]);
    const skull = new THREE.SphereGeometry(0.18, 36, 24);
    skull.scale(1.06, 0.97, 1.0);
    mesh(skull, M.shell, 'skull', J.head);
    // 顔の画面（頭の前面を少し切り取った球の一部）
    const visorGeo = new THREE.SphereGeometry(0.187, 48, 24, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.5 - 0.62, 1.12);
    visorGeo.scale(1.06, 0.97, 1.0);
    mesh(visorGeo, M.visor, 'visor', J.head, [0, -0.01, 0]);
    const eyeGeo = new THREE.SphereGeometry(0.1895, 48, 24, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.5 - 0.62, 1.12);
    eyeGeo.scale(1.06, 0.97, 1.0);
    const eyes = mesh(eyeGeo, M.eyes, 'eyes', J.head, [0, -0.01, 0]);
    eyes.castShadow = false;
    eyes.renderOrder = 2;
    // 耳（横の円盤と、水色に光る輪）
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'R' : 'L';
      const ear = group('ear' + side, J.head, [0.18 * s, 0.0, -0.01]);
      const disc = new THREE.CylinderGeometry(0.075, 0.08, 0.05, 28);
      disc.rotateZ(Math.PI / 2);
      mesh(disc, M.shell, 'earDisc' + side, ear);
      const ring = new THREE.TorusGeometry(0.056, 0.011, 8, 32);
      ring.rotateY(Math.PI / 2);
      mesh(ring, M.glow, 'earRing' + side, ear, [0.027 * s, 0, 0]).castShadow = false;
      const cap = new THREE.CylinderGeometry(0.044, 0.044, 0.012, 20);
      cap.rotateZ(Math.PI / 2);
      mesh(cap, M.joint, 'earCap' + side, ear, [0.03 * s, 0, 0]);
    }
    // 頭の継ぎ目（後ろ半分の横の輪と、後ろの縦の線。顔の画面はよける）
    const seam = new THREE.TorusGeometry(0.1815, 0.0028, 6, 64, 4.23);
    seam.rotateX(Math.PI / 2);
    seam.rotateY(-2.6);
    seam.scale(1.06, 0.97, 1);
    mesh(seam, M.joint, 'seamH', J.head, [0, 0.03, 0]).castShadow = false;
    const seamV = new THREE.TorusGeometry(0.1815, 0.0028, 6, 48, 3.07);
    seamV.rotateZ(-0.9);
    seamV.rotateY(Math.PI / 2);
    seamV.scale(1.06, 0.97, 1);
    mesh(seamV, M.joint, 'seamV', J.head).castShadow = false;
    // 頭のてっぺんの小さな通気口
    mesh(new RoundedBoxGeometry(0.08, 0.02, 0.05, 2, 0.008), M.joint, 'vent', J.head, [0, 0.168, -0.03], [-0.15, 0, 0]);

    // ランタン（root の外。振り子として毎フレーム置く）
    this.lantern = this._lantern();
    this.lanternLight = null;
    this.parts = J;
  }

  _lantern() {
    const M = this.mats;
    const g = new THREE.Group();
    g.name = 'lantern';
    const add = (geo, mat, name, pos, rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; g.add(m); return m; };
    // 吊り手（輪）→ 笠 → ガラス → 台
    add(new THREE.TorusGeometry(0.028, 0.004, 6, 16), M.iron, 'bail', [0, -0.005, 0]);
    add(new THREE.CylinderGeometry(0.012, 0.06, 0.05, 14), M.iron, 'capTop', [0, -0.055, 0]);
    add(new THREE.CylinderGeometry(0.062, 0.062, 0.012, 14), M.brass, 'capRim', [0, -0.085, 0]);
    add(new THREE.CylinderGeometry(0.048, 0.048, 0.11, 14, 1, true), M.lanternGlass, 'glass', [0, -0.145, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5), M.iron, 'rod' + i, [Math.cos(a) * 0.052, -0.145, Math.sin(a) * 0.052]);
    }
    add(new THREE.CylinderGeometry(0.058, 0.05, 0.03, 14), M.iron, 'base', [0, -0.215, 0]);
    const flame = add(new THREE.SphereGeometry(0.018, 10, 8), M.flame, 'flame', [0, -0.15, 0]);
    flame.scale.set(1, 1.6, 1);
    flame.castShadow = false;
    g.userData.flame = flame;
    return g;
  }

  setEyes(kind) {
    const t = this.eyeTex[kind] || this.eyeTex.open;
    if (this.mats.eyes.map !== t) { this.mats.eyes.map = t; this.mats.eyes.needsUpdate = true; }
  }

  /** 光の明るさ（0〜1）：目・耳・胸。 */
  setGlow(v) {
    this.mats.eyes.opacity = v;
    this.mats.glow.color.setHex(CYAN).multiplyScalar(0.2 + 0.8 * v);
  }
}

// ---------------------------------------------------------------- 姿勢
const ZERO = {
  hipsY: 0, hipsP: 0, hipsR: 0, spineP: 0, spineY: 0, spineR: 0, headP: 0, headY: 0, headR: 0,
  shLP: 0, shLR: 0, shLY: 0, elL: 0, shRP: 0, shRR: 0, shRY: 0, elR: 0,
  hipLP: 0, hipLR: 0, kneeL: 0, ankL: 0, hipRP: 0, hipRR: 0, kneeR: 0, ankR: 0,
};
const KEYS = Object.keys(ZERO);
const pose = (o) => ({ ...ZERO, ...o });

// 演出の姿勢（足すのではなく、この姿勢へ寄せる）
export const POSES = {
  // 床に座って、うなだれている（目が覚める前）
  sit: pose({ hipsY: -0.33, hipsP: -0.15, spineP: 0.45, headP: 0.55, shLP: -0.2, shLR: 0.25, elL: -0.3, shRP: -0.15, shRR: -0.2, elR: -0.3, hipLP: -1.45, hipLR: 0.15, kneeL: 0.15, ankL: 0.3, hipRP: -1.45, hipRR: -0.15, kneeR: 0.15, ankR: 0.3 }),
  // 座って顔を上げる
  sitUp: pose({ hipsY: -0.33, hipsP: -0.1, spineP: 0.0, headP: -0.15, shLP: 0.35, shLR: 0.3, elL: -0.2, shRP: 0.3, shRR: -0.3, elR: -0.2, hipLP: -1.45, hipLR: 0.15, kneeL: 0.15, ankL: 0.3, hipRP: -1.45, hipRR: -0.15, kneeR: 0.15, ankR: 0.3 }),
  // しゃがんで拾う（左手を下へ）
  crouch: pose({ hipsY: -0.14, spineP: 0.5, headP: 0.3, shLP: -0.9, shLR: 0.1, elL: -0.3, shRP: -0.2, elR: -0.4, hipLP: -1.1, kneeL: 1.6, ankL: -0.5, hipRP: -0.8, kneeR: 1.4, ankR: -0.6 }),
  // 両手で胸の前に持って見る
  hold: pose({ spineP: 0.05, headP: 0.35, headR: 0.12, shLP: -0.95, shLR: -0.25, elL: -1.2, shRP: -0.5, shRR: 0.1, elR: -0.9 }),
  // 見上げる
  lookUp: pose({ spineP: -0.12, headP: -0.55, shLP: 0.1, shRP: 0.1 }),
  // 左手をふる（右手はランタン）
  wave: pose({ spineR: 0.05, headR: -0.08, shLP: -2.6, shLR: 0.35, elL: -0.4, shRP: 0.05 }),
  // おじぎ（案内ロボらしく）
  bow: pose({ spineP: 0.55, headP: 0.25, shLP: 0.1, shRP: 0.1, hipLP: -0.15, hipRP: -0.15 }),
  // 手を伸ばす（スイッチ・レバー）
  reach: pose({ spineP: 0.1, headP: -0.05, shLP: -1.55, shLR: -0.05, elL: -0.15 }),
  // ランタンをかかげる
  raise: pose({ headP: -0.2, shRP: -1.9, shRR: -0.15, elR: -0.5 }),
  // 首をかしげる
  tilt: pose({ headR: 0.32, headP: 0.08 }),
};

export class RobotAnimator {
  constructor(model) {
    this.m = model;
    this.t = 0;
    this.phase = 0;
    this.cur = pose({});
    this.out = pose({});
    this.layers = {};          // name → { w, target }
    this.look = { yaw: 0, pitch: 0, wantYaw: 0, wantPitch: 0 };
    this.idleLookT = 2;
    this.blinkT = 2.5;
    this.blinking = 0;
    this.expression = 'open';
    this.exprT = 0;
    this.glow = 1;
    this.prevHand = new THREE.Vector3();
    this.handVel = new THREE.Vector3();
    this.swing = { ax: 0, az: 0, vx: 0, vz: 0 };
    this.lastYaw = 0;
    this.lean = 0;
    this.landSquash = 0;
    this.lookAt = null;        // 見る点（ワールド座標）
    this.lanternOn = 1;
  }

  /** 演出の姿勢の重み（0〜1 へ speed で寄る）。 */
  setLayer(name, w, speed = 4) {
    const L = (this.layers[name] ||= { w: 0, want: 0, speed });
    L.want = w;
    L.speed = speed;
  }
  clearLayers() { for (const L of Object.values(this.layers)) L.want = 0; }

  /** 表情を一時的に（sec 秒、0 でずっと）。 */
  express(kind, sec = 2) { this.expression = kind; this.exprT = sec; }

  /**
   * p = { state, speed, vy, yaw, grounded, dt }
   */
  update(dt, p) {
    const J = this.m.j;
    this.t += dt;
    const o = this.out;
    for (const k of KEYS) o[k] = 0;
    const sp = p.speed || 0;
    const run = clamp((sp - 2.6) / 2, 0, 1);
    const moving = clamp(sp / 1.2, 0, 1) * (p.grounded ? 1 : 0);
    // 歩きの拍（歩幅で進める）
    const stride = lerp(0.84, 1.24, run);
    this.phase += (sp * dt / stride) * Math.PI * 2;
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    const A = lerp(0.5, 0.85, run) * moving;
    // 脚
    o.hipLP = s * A;
    o.hipRP = -s * A;
    o.kneeL = Math.max(0, -Math.sin(ph - 1.2)) * lerp(0.9, 1.4, run) * moving;
    o.kneeR = Math.max(0, Math.sin(ph - 1.2)) * lerp(0.9, 1.4, run) * moving;
    o.ankL = -o.kneeL * 0.35 + Math.max(0, s) * 0.2 * moving;
    o.ankR = -o.kneeR * 0.35 + Math.max(0, -s) * 0.2 * moving;
    // 体の上下と、ねじり
    o.hipsY = -Math.abs(Math.cos(ph)) * 0.018 * moving + 0.008 * moving - run * 0.015;
    o.spineY = s * 0.1 * moving;
    o.spineP = run * 0.22 + moving * 0.04;
    o.hipsR = c * 0.03 * moving;
    o.headY = -s * 0.08 * moving;
    o.headP = -run * 0.15;
    // 腕：左はふる、右はランタンを持つのでひかえめ
    o.shLP = -s * A * 0.9;
    o.shLR = 0.12 + run * 0.1;
    o.elL = -0.25 - run * 0.7 - Math.max(0, -s) * 0.3 * moving;
    o.shRP = s * A * 0.25 - 0.12;
    o.shRR = -0.18;
    o.elR = -0.55;
    // 待機：息をするようにゆっくり
    const idle = 1 - moving;
    o.spineP += Math.sin(this.t * 1.6) * 0.015 * idle;
    o.hipsY += Math.sin(this.t * 1.6) * 0.004 * idle;
    o.shLR += Math.sin(this.t * 1.6 + 0.5) * 0.02 * idle;
    // 空中
    if (!p.grounded) {
      const up = clamp(p.vy / 5, -1, 1);
      o.hipLP = -0.55 + up * 0.15; o.hipRP = -0.25 - up * 0.1;
      o.kneeL = 0.95; o.kneeR = 0.6;
      o.shLP = -0.4; o.shLR = 0.55 + Math.sin(this.t * 14) * 0.05; o.elL = -0.5;
      o.shRR = -0.35; o.elR = -0.7;
      o.spineP = 0.08;
      o.headP = -up * 0.12;
    }
    // 着地のしゃがみ
    if (p.landT > 0) this.landSquash = Math.max(this.landSquash, p.landT * 2.5);
    this.landSquash = Math.max(0, this.landSquash - dt * 4);
    const q = Math.min(1, this.landSquash);
    o.hipsY -= q * 0.06; o.hipLP -= q * 0.5; o.hipRP -= q * 0.5; o.kneeL += q * 1.0; o.kneeR += q * 1.0; o.ankL -= q * 0.5; o.ankR -= q * 0.5; o.spineP += q * 0.2;
    // 曲がるときに少し傾く
    const yawRate = wrapAngle(p.yaw - this.lastYaw) / Math.max(dt, 1e-4);
    this.lastYaw = p.yaw;
    this.lean = damp(this.lean, clamp(-yawRate * sp * 0.02, -0.18, 0.18), 6, dt);
    o.spineR += this.lean;
    o.hipsR += this.lean * 0.5;

    // 首：見るもの（なければときどき周りを見る）
    if (this.lookAt) {
      const hp = new THREE.Vector3();
      J.neck.getWorldPosition(hp);
      const dx = this.lookAt.x - hp.x, dy = this.lookAt.y - (hp.y + 0.16), dz = this.lookAt.z - hp.z;
      const yawTo = wrapAngle(Math.atan2(dx, dz) - p.yaw);
      this.look.wantYaw = clamp(yawTo, -1.1, 1.1);
      this.look.wantPitch = clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.7, 0.6);
    } else if (sp < 0.2) {
      if ((this.idleLookT -= dt) <= 0) {
        this.idleLookT = 2.5 + Math.random() * 3.5;
        const r = Math.random();
        this.look.wantYaw = r < 0.35 ? 0 : (Math.random() * 2 - 1) * 0.8;
        this.look.wantPitch = (Math.random() * 2 - 1) * 0.25 - (r > 0.85 ? 0.35 : 0);
      }
    } else { this.look.wantYaw = 0; this.look.wantPitch = 0; }
    this.look.yaw = damp(this.look.yaw, this.look.wantYaw, 5, dt);
    this.look.pitch = damp(this.look.pitch, this.look.wantPitch, 5, dt);
    o.headY += this.look.yaw * 0.75;
    o.spineY += this.look.yaw * 0.25;
    o.headP += this.look.pitch;

    // 演出の姿勢を重ねる
    for (const [name, L] of Object.entries(this.layers)) {
      L.w = damp(L.w, L.want, L.speed, dt);
      if (L.w < 0.002) continue;
      const P = POSES[name];
      if (!P) continue;
      const w = L.w * L.w * (3 - 2 * L.w);
      for (const k of KEYS) {
        // 頭の向き（見る）は姿勢に足す、ほかは寄せる
        if (k === 'headY' || k === 'spineY') o[k] = lerp(o[k], P[k] + (k === 'headY' ? this.look.yaw * 0.5 : 0), w);
        else o[k] = lerp(o[k], P[k], w);
      }
    }

    // なめらかに
    for (const k of KEYS) this.cur[k] = damp(this.cur[k], o[k], 18, dt);
    this.apply(this.cur);

    // まばたき・表情
    this.exprT = this.exprT > 0 ? this.exprT - dt : this.exprT;
    if (this.exprT < 0) { this.expression = 'open'; this.exprT = 0; }
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinking = 0.12; this.blinkT = 2.2 + Math.random() * 4; }
    this.blinking = Math.max(0, this.blinking - dt);
    const ex = this.expression;
    this.m.setEyes(this.blinking > 0 && (ex === 'open' || ex === 'wide' || ex === 'half') ? 'blink' : ex);
    this.m.setGlow(this.glow);
  }

  apply(o) {
    const J = this.m.j;
    J.hips.position.y = 0.43 + o.hipsY;
    J.hips.rotation.set(o.hipsP, 0, o.hipsR);
    J.spine.rotation.set(o.spineP, o.spineY, o.spineR);
    J.neck.rotation.set(o.headP * 0.3, o.headY * 0.3, o.headR * 0.3);
    J.head.rotation.set(o.headP * 0.7, o.headY * 0.7, o.headR * 0.7);
    J.shoulderL.rotation.set(o.shLP, o.shLY, o.shLR);
    J.shoulderR.rotation.set(o.shRP, o.shRY, o.shRR);
    J.elbowL.rotation.set(o.elL, 0, 0);
    J.elbowR.rotation.set(o.elR, 0, 0);
    J.hipL.rotation.set(o.hipLP, 0, o.hipLR);
    J.hipR.rotation.set(o.hipRP, 0, o.hipRR);
    J.kneeL.rotation.set(o.kneeL, 0, 0);
    J.kneeR.rotation.set(o.kneeR, 0, 0);
    J.ankleL.rotation.set(o.ankL, 0, 0);
    J.ankleR.rotation.set(o.ankR, 0, 0);
  }

  /** ランタンを右手から吊るす（振り子）。root の matrixWorld が最新であること。 */
  updateLantern(dt, yaw) {
    const m = this.m, lan = m.lantern;
    const hp = new THREE.Vector3();
    m.j.handR.updateWorldMatrix(true, false);
    m.j.handR.getWorldPosition(hp);
    hp.y -= 0.035;
    if (!this._init) { this.prevHand.copy(hp); this._init = true; }
    const vel = hp.clone().sub(this.prevHand).divideScalar(Math.max(dt, 1e-4));
    const acc = vel.clone().sub(this.handVel).divideScalar(Math.max(dt, 1e-4));
    if (dt > 0.2 || acc.length() > 200) acc.set(0, 0, 0); // 瞬間移動したとき
    this.handVel.copy(vel);
    this.prevHand.copy(hp);
    const S = this.swing, Lp = 0.15, g = 9.8, damping = 3.2;
    const subs = 3, h = dt / subs;
    for (let i = 0; i < subs; i++) {
      S.vx += (-(g / Lp) * Math.sin(S.ax) - damping * S.vx + clamp(acc.z, -40, 40) / Lp * 0.6) * h;
      S.vz += (-(g / Lp) * Math.sin(S.az) - damping * S.vz - clamp(acc.x, -40, 40) / Lp * 0.6) * h;
      S.ax = clamp(S.ax + S.vx * h, -1.0, 1.0);
      S.az = clamp(S.az + S.vz * h, -1.0, 1.0);
    }
    lan.position.copy(hp);
    const qs = new THREE.Quaternion().setFromEuler(new THREE.Euler(S.ax, 0, S.az, 'XYZ'));
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    lan.quaternion.copy(qs).multiply(qy);
    // 炎のゆらぎ
    const fl = lan.userData.flame;
    const f = 0.85 + Math.sin(this.t * 13.1) * 0.06 + Math.sin(this.t * 23.7) * 0.05;
    fl.scale.set(f * this.lanternOn, 1.6 * f * this.lanternOn, f * this.lanternOn);
    return f;
  }
}

export { CYAN };
