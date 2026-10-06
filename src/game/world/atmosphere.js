// 空気：光の筋（屋根の穴・窓から差しこむ日の光）と、光の中を漂うほこり。
// 光の筋は「開口部の四角を、光の向きに伸ばした柱」。柱の中を数歩だけ光線で進んで、通った長さぶん光らせる（加算）。
// 柱の座標：開口部の角 p0、辺 e1・e2、光の向き × len を (u, v, w) ∈ [0,1]^3 に写す。
import * as THREE from 'three';
import { U } from './materials.js';

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const FRAG = /* glsl */ `
  uniform mat4 uInvA;
  uniform vec3 uColor;
  uniform vec3 uSunDir;
  uniform float uStrength;
  uniform float uTime;
  uniform float uEdge;
  uniform float uLen;
  varying vec3 vWorld;
  float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float dens(vec3 l, vec3 wp) {
    float e = uEdge;
    float a = smoothstep(0.0, e, l.x) * smoothstep(0.0, e, 1.0 - l.x) * smoothstep(0.0, e, l.y) * smoothstep(0.0, e, 1.0 - l.y);
    float along = smoothstep(0.0, 0.08, l.z) * (1.0 - smoothstep(0.55, 1.0, l.z));
    float n = n3(wp * 0.9 + vec3(0.0, -uTime * 0.05, uTime * 0.03)) * 0.6 + n3(wp * 2.7 + vec3(uTime * 0.07, 0.0, 0.0)) * 0.4;
    return a * along * (0.45 + 0.75 * n);
  }
  void main() {
    // 裏の面で描き、カメラから柱に入る所〜この面（出る所）までを進む（カメラが柱の中でも見える）
    vec3 rd = vWorld - cameraPosition;
    float rl = max(length(rd), 1e-4);
    rd /= rl;
    vec3 lc = (uInvA * vec4(cameraPosition, 1.0)).xyz;
    vec3 ld = (uInvA * vec4(rd, 0.0)).xyz;          // 世界で 1 進むと、柱の座標でどれだけ進むか
    vec3 inv = 1.0 / (sign(ld) * max(abs(ld), vec3(1e-6)) + vec3(1e-9));
    vec3 ta = (vec3(0.0) - lc) * inv, tb = (vec3(1.0) - lc) * inv;
    vec3 tmn = min(ta, tb), tmx = max(ta, tb);
    float tin = max(max(max(tmn.x, tmn.y), tmn.z), 0.0);
    float tout = min(min(min(tmx.x, tmx.y), tmx.z), rl);
    float len = max(tout - tin, 0.0);
    float sum = 0.0;
    const int N = 7;
    float dt = len / float(N);
    for (int i = 0; i < N; i++) {
      float s = tin + (float(i) + 0.5) * dt;
      vec3 l = lc + ld * s;
      sum += dens(clamp(l, 0.0, 1.0), cameraPosition + rd * s) * dt;
    }
    float view = 0.35 + 1.1 * pow(max(dot(rd, uSunDir), 0.0), 3.0);
    float k = sum * uStrength * view;
    k = k / (1.0 + k);   // 重なっても白く飛ばない
    gl_FragColor = vec4(uColor * k, 1.0);
  }`;

/**
 * 光の筋を作る。openings：[{ p0: [x,y,z], e1: [..], e2: [..], len, strength }]
 * 戻り値 { group, setStrength(k), setColor(c) }
 */
export function createLightShafts(openings, { color = 0xffe7c0 } = {}) {
  const group = new THREE.Group();
  group.name = 'lightShafts';
  const dir = U.sunDir.value.clone().negate();
  const shared = { uColor: { value: new THREE.Color(color) }, uTime: U.time, uSunDir: U.sunDir, global: 1 };
  const mats = [];
  for (const o of openings) {
    const p0 = new THREE.Vector3(...o.p0), e1 = new THREE.Vector3(...o.e1), e2 = new THREE.Vector3(...o.e2);
    const e3 = dir.clone().multiplyScalar(o.len);
    const A = new THREE.Matrix4().makeBasis(e1, e2, e3).setPosition(p0);
    const inv = A.clone().invert();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0.5, 0.5, 0.5);
    geo.applyMatrix4(A);
    // 箱の面の向き（行列の行列式が負なら裏返る）
    const det = A.determinant();
    const mat = new THREE.ShaderMaterial({
      uniforms: { uInvA: { value: inv }, uColor: shared.uColor, uSunDir: shared.uSunDir, uStrength: { value: o.strength ?? 1 }, uTime: shared.uTime, uEdge: { value: o.edge ?? 0.22 }, uLen: { value: o.len } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: det < 0 ? THREE.FrontSide : THREE.BackSide,   // 裏の面（行列式が負なら面が裏返っている）
      fog: false,
    });
    mat.userData.base = o.strength ?? 1;
    mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = true;
    m.renderOrder = 5;
    m.name = 'shaft';
    group.add(m);
  }
  return {
    group,
    openings,
    setStrength(k) { for (const m of mats) m.uniforms.uStrength.value = m.userData.base * k; },
    setColor(c) { shared.uColor.value.set(c); },
  };
}

/** ほこり：光の筋の中に点を散らす。光の中だけ、太陽の方を見たときに強く光る。 */
export function createDust(openings, { count = 2400, rng = Math.random } = {}) {
  const dir = U.sunDir.value.clone().negate();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  const total = openings.reduce((s, o) => s + (o.dust ?? 1) * o.len * Math.hypot(...o.e1) * Math.hypot(...o.e2), 0);
  let i = 0;
  for (const o of openings) {
    const share = Math.round(count * ((o.dust ?? 1) * o.len * Math.hypot(...o.e1) * Math.hypot(...o.e2)) / total);
    for (let k = 0; k < share && i < count; k++, i++) {
      const u = 0.1 + rng() * 0.8, v = 0.1 + rng() * 0.8, w = 0.05 + rng() * 0.75;
      pos[i * 3] = o.p0[0] + o.e1[0] * u + o.e2[0] * v + dir.x * o.len * w;
      pos[i * 3 + 1] = o.p0[1] + o.e1[1] * u + o.e2[1] * v + dir.y * o.len * w;
      pos[i * 3 + 2] = o.p0[2] + o.e1[2] * u + o.e2[2] * v + dir.z * o.len * w;
      seed[i] = rng();
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, i * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed.slice(0, i), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uSunDir: U.sunDir, uColor: { value: new THREE.Color(0xfff0d0) }, uSize: { value: 22 }, uStrength: { value: 0.8 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime, uSize;
      uniform vec3 uSunDir;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.15 + seed * 0.2) + seed * 40.0;
        p += vec3(sin(t * 1.3) * 0.25, sin(t * 0.7 + 2.0) * 0.18 - fract(uTime * 0.01 + seed) * 0.2, cos(t * 1.1) * 0.25);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(-mv.z, 0.1);
        gl_PointSize = uSize * (0.4 + seed * 0.8) / d;
        vec3 vd = normalize(p - cameraPosition);
        float fwd = pow(max(dot(vd, uSunDir), 0.0), 4.0);
        float tw = 0.5 + 0.5 * sin(uTime * (1.0 + seed * 2.0) + seed * 30.0);
        vA = (0.12 + 1.8 * fwd) * (0.3 + 0.7 * tw) * smoothstep(0.3, 1.5, d) * (1.0 - smoothstep(12.0, 22.0, d));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = dot(c, c);
        float a = smoothstep(0.25, 0.0, r);
        gl_FragColor = vec4(uColor * a * vA * uStrength, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'dust';
  pts.frustumCulled = false;
  pts.renderOrder = 6;
  return pts;
}
