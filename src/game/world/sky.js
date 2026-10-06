// 空：上が青く、地平が明るい。雲はゆっくり流れる。太陽の円盤と光の滲み。夕方への色の変化もここで持つ。
import * as THREE from 'three';
import { U } from './materials.js';

export const SKY_DAY = { top: 0x5e9bd6, horizon: 0xdfe8e6, sun: 0xfff3d6, cloud: 0xffffff, cloudShade: 0xb8c4cc };
export const SKY_EVENING = { top: 0x4a6aa8, horizon: 0xf3b98a, sun: 0xffb46a, cloud: 0xffd2b0, cloudShade: 0x9a7f8f };

export function createSky() {
  const uni = {
    uTop: { value: new THREE.Color(SKY_DAY.top) },
    uHorizon: { value: new THREE.Color(SKY_DAY.horizon) },
    uSunCol: { value: new THREE.Color(SKY_DAY.sun) },
    uCloud: { value: new THREE.Color(SKY_DAY.cloud) },
    uCloudShade: { value: new THREE.Color(SKY_DAY.cloudShade) },
    uSunDir: U.sunDir,
    uTime: U.time,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uSunCol, uCloud, uCloudShade, uSunDir;
      uniform float uTime;
      varying vec3 vDir;
      float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55));
        if (y < 0.0) col = mix(uHorizon, uHorizon * 0.75, clamp(-y * 3.0, 0.0, 1.0));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * (pow(s, 900.0) * 30.0 + pow(s, 40.0) * 0.5 + pow(s, 5.0) * 0.18);
        // 雲（空の平面に投影）
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
          float c = fbm(uv);
          float cov = smoothstep(0.48, 0.78, c) * smoothstep(0.0, 0.18, y);
          float shade = smoothstep(0.45, 0.9, fbm(uv * 1.7 + 3.0));
          vec3 cc = mix(uCloud, uCloudShade, shade * 0.7) + uSunCol * pow(s, 8.0) * 0.6;
          col = mix(col, cc, cov * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;   // いちばん先に描く（深度は書かない）。位置は毎フレームカメラに合わせる
  mesh.userData.uni = uni;
  return mesh;
}

/** 空の色を a（昼）から b（夕方）へ t で混ぜる。 */
export function setSkyBlend(sky, t, a = SKY_DAY, b = SKY_EVENING) {
  const u = sky.userData.uni;
  const c = new THREE.Color();
  for (const [k, name] of [['top', 'uTop'], ['horizon', 'uHorizon'], ['sun', 'uSunCol'], ['cloud', 'uCloud'], ['cloudShade', 'uCloudShade']]) {
    u[name].value.copy(c.set(a[k])).lerp(new THREE.Color(b[k]), t);
  }
}
