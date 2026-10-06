// 水たまりと、地下の浸水。床の高さの平面で 1 回だけ鏡の絵を描き（解像度は画質しだい）、水たまりはそれを映す。
// 鏡の平面の高さは、カメラのいる階で切り替える（ホール 0 / 地下の水面 / ホーム 5.4）。low では鏡を描かず、空の色だけを映す。
// 鏡のカメラの作り方は three.js の Reflector と同じ（斜めのクリップ面で、平面より下を切る）。
import * as THREE from 'three';
import { U } from './materials.js';
import { blotch } from './tex.js';
import { L } from './layout.js';

const VERT = /* glsl */ `
  uniform mat4 uTexMat;
  varying vec4 vRefl;
  varying vec3 vW;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vUv = uv;
    vRefl = uTexMat * wp;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uRefl;
  uniform sampler2D uMask;
  uniform float uHasRefl;
  uniform float uTime;
  uniform float uPlaneY;
  uniform vec3 uSky;
  uniform vec3 uDeep;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform float uOpacity;
  uniform float uFull;
  uniform float uGlint;
  varying vec4 vRefl;
  varying vec3 vW;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
  void main() {
    float m = uFull > 0.5 ? 1.0 : texture2D(uMask, vUv).a;
    if (m < 0.02) discard;
    // さざなみ（ゆっくり）と、ときどき落ちるしずくの輪
    vec2 q = vW.xz * 1.7;
    float w = n2(q + vec2(uTime * 0.15, uTime * 0.11)) + n2(q * 2.3 - vec2(uTime * 0.21, 0.0)) * 0.5;
    vec2 cell = floor(vW.xz * 0.6);
    float ph = fract(uTime * 0.35 + h21(cell) * 7.0);
    vec2 c = (cell + vec2(h21(cell + 3.1), h21(cell + 7.7))) / 0.6;
    float rd = length(vW.xz - c);
    float ring = sin(rd * 28.0 - ph * 18.0) * smoothstep(0.6, 0.0, abs(rd - ph * 1.1)) * (1.0 - ph) * step(h21(cell + 1.3), 0.35);
    vec2 dist = vec2(w - 0.75, n2(q.yx * 1.3 + uTime * 0.1) - 0.5) * 0.012 + vec2(ring) * 0.01;
    vec3 V = normalize(cameraPosition - vW);
    float fres = 0.3 + 0.7 * pow(clamp(1.0 - max(V.y, 0.0), 0.0, 1.0), 3.0);
    vec3 refl = uSky;
    if (uHasRefl > 0.5) {
      vec2 uv = vRefl.xy / max(vRefl.w, 1e-4) + dist;
      refl = texture2D(uRefl, uv).rgb;
    }
    // 太陽のきらめき（影は見ていないので、日の差さない所では uGlint = 0。明るすぎるとブルームで白い塊になるので上限）
    vec3 H = normalize(V + normalize(uSunDir));
    float spec = min(pow(max(H.y + (w - 0.75) * 0.03, 0.0), 900.0) * 1.6, 0.9) * uGlint;
    vec3 col = mix(uDeep, refl, fres) + uSunCol * spec;
    gl_FragColor = vec4(col, m * uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export class Puddles {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.mirror = new THREE.PerspectiveCamera();
    this.rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType });
    this.texMat = new THREE.Matrix4();
    this.scale = 0.5;
    this.planeY = 0;
    this.meshes = [];
    this.uniforms = {
      uRefl: { value: this.rt.texture },
      uHasRefl: { value: 1 },
      uTime: U.time,
      uPlaneY: { value: 0 },
      uTexMat: { value: this.texMat },
      uSky: { value: new THREE.Color(0x9fb4c0) },
      uDeep: { value: new THREE.Color(0x2c2f2c) },
      uSunDir: U.sunDir,
      uSunCol: { value: new THREE.Color(0xfff0d0) },
    };
    this.mask = blotch({ kind: 'puddle', seed: 13, size: 256 });
    this.mask2 = blotch({ kind: 'puddle', seed: 29, size: 256 });
  }

  /** 水たまりを置く（y = 床の高さ、full = 形のない水面）。 */
  add(x, y, z, w, d, ry = 0, { full = false, opacity = 0.82, mask = 0, glint = 1 } = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsLib.fog, ...this.uniforms, uMask: { value: mask ? this.mask2 : this.mask }, uOpacity: { value: opacity }, uFull: { value: full ? 1 : 0 }, uGlint: { value: glint } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.set(-Math.PI / 2, 0, ry);
    m.position.set(x, y + 0.015, z);
    m.renderOrder = 2;
    m.name = 'puddle';
    m.userData.planeY = y;
    this.scene.add(m);
    this.meshes.push(m);
    return m;
  }

  setQuality(scale) {
    this.scale = scale;
    this.uniforms.uHasRefl.value = scale > 0 ? 1 : 0;
    this.resize();
  }

  resize() {
    const r = this.renderer;
    const s = r.getSize(new THREE.Vector2()).multiplyScalar(r.getPixelRatio() * Math.max(0.1, this.scale));
    this.rt.setSize(Math.max(16, Math.round(s.x)), Math.max(16, Math.round(s.y)));
  }

  /** 本番の前に呼ぶ：鏡の絵を描く。 */
  render(renderer, scene, camera) {
    if (this.scale <= 0) return;
    // カメラのいる階の水面
    const cy = camera.position.y;
    const y = cy < -1.5 ? L.under.waterY : cy > 4.5 && camera.position.z < L.platform.z1 + 0.5 ? L.platform.y : 0;
    this.planeY = y;
    this.uniforms.uPlaneY.value = y;
    // 見えている水たまりがなければ描かない
    let any = false;
    for (const m of this.meshes) {
      const on = Math.abs(m.userData.planeY - y) < 0.3;
      m.visible = true;
      if (on) any = true;
    }
    if (!any || camera.position.y < y + 0.05) return;
    // 鏡のカメラ
    const mc = this.mirror;
    mc.copy(camera);
    const n = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3(0, y, 0);
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).add(camPos);
    const reflect = (v) => v.clone().sub(n.clone().multiplyScalar(2 * (v.y - y)));
    mc.position.copy(reflect(camPos));
    mc.up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    mc.up.reflect(n);
    mc.lookAt(reflect(look));
    mc.far = camera.far;
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(camera.projectionMatrix);
    // 平面より下を切る（斜めのクリップ面）
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p).applyMatrix4(mc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = mc.projectionMatrix;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0],
      (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5],
      -1, (1 + pm.elements[10]) / pm.elements[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1 - 0.003; pm.elements[14] = clip.w;
    // 世界 → 鏡の絵の UV
    this.texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMat.multiply(pm).multiply(mc.matrixWorldInverse);
    // 描く（水たまり自身・草・ほこりは描かない）
    for (const m of this.meshes) m.visible = false;
    mc.layers.set(0);
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    for (const m of this.meshes) m.visible = true;
  }
}

/** 水たまりを駅に置く。 */
export function placePuddles(P, rng) {
  const H = L.hall;
  // 屋根の穴の下に、大きめの水たまり
  const spots = [[-3.8, 6.2, 3.4, 2.4], [4.5, -2.5, 2.8, 2.2], [8.8, 3.6, 3.6, 2.6], [-12.0, 11.6, 2.0, 1.5], [1.5, 11.6, 2.6, 1.6], [-12.4, -1.5, 1.8, 1.4], [6.4, 9.4, 2.2, 1.6], [-1.6, -6.8, 1.6, 1.2], [11.8, -6.5, 2.4, 1.8]];
  // ホールの中はほとんど日陰なので、きらめきは弱く
  spots.forEach(([x, z, w, d], i) => P.add(x, 0, z, w, d, rng() * 6, { mask: i % 2, glint: 0.5 }));
  // 入口ホール・外
  P.add(6.5, 0, 22.5, 3.4, 2.6, 0.4, { mask: 1 });
  P.add(-2, 0, 33.5, 4, 3, 1.1);
  P.add(9, 0, 30.5, 2.6, 1.8, 0.2, { mask: 1 });
  // 地下の浸水（通路いっぱい）
  const D = L.under;
  P.add((D.x0 + D.x1) / 2, D.waterY - 0.015, (D.water[0] + D.water[1]) / 2, D.x1 - D.x0, D.water[1] - D.water[0], 0, { full: true, opacity: 0.88, glint: 0 });
  // ホーム
  P.add(-14, L.platform.y, -20.5, 3, 2.2, 0.3);
  P.add(8.8, L.platform.y, -18.8, 4.2, 3.2, 1.2, { mask: 1 });
}
