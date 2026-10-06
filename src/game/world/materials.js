// 材質。すべての材質に共通のシェーダーの足し算（patch）をかける：
//   - もや（fog）が太陽の方向で明るく色づく（逆光の空気感）
//   - 大きなむら（macro）：同じテクスチャのくり返しを目立たなくする
//   - 壁の根もとの汚れ・苔（grime）：床の高さ（-4.5 / 0 / 5.4）の近くの縦の面を暗く、緑に
//   - 環境光の箱（ambient zones）：地下・売店・電気室など、屋内の暗いところは環境光（空の光）を弱める
//   - 風（wind）：草とつたを揺らす（1 = 根もとが固定、2 = 上が固定で垂れ下がる）
// NaN よけ：pow の底は max(…, 0.0)、normalize は長さ 0 を避ける。
import * as THREE from 'three';
import * as T from './tex.js';

export const U = {
  sunDir: { value: new THREE.Vector3(0.316, 0.906, -0.281).normalize() },   // 北東の高いところ（約 65°）
  sunFog: { value: new THREE.Color(0xfff2d6) },
  fogScatter: { value: 0.75 },
  time: { value: 0 },
  wind: { value: 1 },
  ambMin: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 1)) }, // xyz = 箱の小さい角、w = 強さ（0 = 真っ暗、1 = そのまま）
  ambMax: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 1)) }, // xyz = 箱の大きい角、w = ふちのぼかし（m）
  ambCount: { value: 0 },
  ambGlobal: { value: 1 },   // 全体の環境光（夕方の演出などで変える）
};

/** 環境光の箱を足す（地下・屋内）。k = 環境光の強さ、soft = ふちのぼかし。 */
export function addAmbientZone(min, max, k, soft = 1) {
  const i = U.ambCount.value;
  if (i >= U.ambMin.value.length) { console.warn('ambient zones full'); return; }
  U.ambMin.value[i].set(min[0], min[1], min[2], k);
  U.ambMax.value[i].set(max[0], max[1], max[2], soft);
  U.ambCount.value = i + 1;
}

const GLSL_COMMON = /* glsl */ `
varying vec3 vWPos;
uniform vec3 uSunDir;
uniform vec3 uSunFog;
uniform float uFogScatter;
uniform float uTime;
uniform vec4 uAmbMin[12];
uniform vec4 uAmbMax[12];
uniform int uAmbCount;
uniform float uAmbGlobal;
float pHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), u.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float zoneAmbient(vec3 p) {
  float k = 1.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uAmbCount) break;
    vec3 d = max(uAmbMin[i].xyz - p, p - uAmbMax[i].xyz);   // 箱の外なら正（いちばん近い面までの距離）
    float o = max(max(d.x, d.y), d.z);
    float s = max(uAmbMax[i].w, 0.001);
    float inside = 1.0 - smoothstep(-s * 0.5, s * 0.5, o);  // 中ほど 1、ふちの外 s/2 で 0
    k = min(k, mix(1.0, uAmbMin[i].w, inside));
  }
  return k * uAmbGlobal;
}
`;

const VERT_WPOS = /* glsl */ `
{
  vec4 wp_ = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp_ = instanceMatrix * wp_;
  #endif
  wp_ = modelMatrix * wp_;
  vWPos = wp_.xyz;
}
`;

const WIND = /* glsl */ `
#if defined(WIND_MODE)
{
  vec4 wq_ = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wq_ = instanceMatrix * wq_;
  #endif
  wq_ = modelMatrix * wq_;
  float ph_ = dot(wq_.xz, vec2(0.37, 0.23)) + wq_.y * 0.3;
  float amp_ = windW * windW * WIND_AMP;   // 0 = 固定された端、1 = 揺れる端
  transformed.x += (sin(uTime * 1.3 + ph_) * 0.6 + sin(uTime * 2.9 + ph_ * 1.7) * 0.25) * amp_;
  transformed.z += (cos(uTime * 1.1 + ph_ * 1.3) * 0.5) * amp_;
}
#endif
`;

const FOG_FRAG = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  vec3 fd_ = vWPos - cameraPosition;
  fd_ = fd_ / max(length(fd_), 1e-4);
  float sa_ = pow(max(dot(fd_, uSunDir), 0.0), 5.0);
  vec3 fc_ = mix(fogColor, uSunFog, clamp(sa_ * uFogScatter, 0.0, 1.0));
  // 暗い屋内ではもやも暗く
  fc_ *= mix(0.25, 1.0, zoneAmbient(vWPos));
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fc_, fogFactor );
#endif
`;

/**
 * 材質にシェーダーの足し算をかける。opts：
 *   macro：大きなむらの強さ（0〜0.4）  grime：根もとの汚れ（0〜1）  wind：0 / 1 / 2  windAmp：揺れの大きさ（m）
 *   ambient：false で環境光の箱を無視（外の物など）
 */
export function patch(mat, opts = {}) {
  const { macro = 0, grime = 0, wind = 0, windAmp = 0.08, ambient = true } = opts;
  const lit = !mat.isMeshBasicMaterial;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSunDir = U.sunDir;
    sh.uniforms.uSunFog = U.sunFog;
    sh.uniforms.uFogScatter = U.fogScatter;
    sh.uniforms.uTime = U.time;
    sh.uniforms.uAmbMin = U.ambMin;
    sh.uniforms.uAmbMax = U.ambMax;
    sh.uniforms.uAmbCount = U.ambCount;
    sh.uniforms.uAmbGlobal = U.ambGlobal;
    const defs = [];
    if (macro) defs.push(`#define MACRO ${macro.toFixed(3)}`);
    if (grime) defs.push(`#define GRIME ${grime.toFixed(3)}`);
    if (wind) defs.push(`#define WIND_MODE ${wind}`, `#define WIND_AMP ${windAmp.toFixed(3)}`);
    if (ambient && lit) defs.push('#define AMB_ZONES');
    const head = defs.join('\n') + '\n' + GLSL_COMMON;
    sh.vertexShader = head + (wind ? 'attribute float windW;\n' : '') + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_WPOS);
    let fs = head + sh.fragmentShader;
    fs = fs.replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
      #ifdef MACRO
        float mn_ = pNoise(vWPos.xz * 0.21 + vWPos.y * 0.13) * 0.6 + pNoise(vWPos.xz * 0.77 + vec2(7.1, 3.3)) * 0.4;
        diffuseColor.rgb *= mix(1.0 - MACRO, 1.0 + MACRO * 0.35, mn_);
      #endif
    `);
    if (lit) {
      fs = fs.replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
        #ifdef AMB_ZONES
          float az_ = zoneAmbient(vWPos);
          reflectedLight.indirectDiffuse *= az_;
          reflectedLight.indirectSpecular *= az_;
        #endif
      `);
      fs = fs.replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        #ifdef GRIME
        {
          vec3 wn_ = inverseTransformDirection(normal, viewMatrix);
          float y_ = vWPos.y;
          // 床の高さ：0 と地下（-4.5）。5.4 はホーム（ホールの北）だけ
          float d_ = min(abs(y_), abs(y_ + 4.5));
          if (vWPos.z < -12.3) d_ = min(d_, abs(y_ - 5.4));
          float gn_ = pNoise(vWPos.xz * 1.7 + vWPos.y * 2.3) * 0.5 + pNoise(vec2(vWPos.x + vWPos.z, vWPos.y) * 4.1) * 0.5;
          float g_ = smoothstep(0.9 + gn_ * 0.6, 0.0, d_) * (1.0 - abs(wn_.y)) * GRIME;
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.16, 0.15, 0.12), vec3(0.2, 0.25, 0.1), gn_), clamp(g_, 0.0, 0.85));
        }
        #endif
      `);
    }
    fs = fs.replace('#include <fog_fragment>', FOG_FRAG);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `wsp|${macro}|${grime}|${wind}|${windAmp}|${ambient && lit}`;
  return mat;
}

const std = (o, p = {}) => patch(new THREE.MeshStandardMaterial(o), p);

/** 作品の材質を全部作る。名前 → 材質。 */
export function createMaterials() {
  const M = {};
  const rep = (t, x, y) => { for (const k of ['map', 'normalMap', 'roughnessMap']) t[k]?.repeat.set(x, y); return t; };
  // テクスチャの 1 枚が何 m か（builder は「1 UV = 1m」で貼るので、repeat = 1 / 大きさ）
  const floor = T.floorTiles();          rep(floor, 1 / 4.8, 1 / 4.8);
  const conc = T.concrete();             rep(conc, 1 / 4, 1 / 4);
  const concDark = T.concrete({ seed: 8, tint: 0x6f6b64 }); rep(concDark, 1 / 4, 1 / 4);
  const mos = T.mosaic();                rep(mos, 1, 1);
  const mosBlue = T.mosaic({ seed: 71, tint: 0xa9c2c4, n: 8 }); rep(mosBlue, 1, 1);
  const steel = T.paintedSteel();        rep(steel, 1 / 2, 1 / 2);
  const steelDark = T.paintedSteel({ seed: 33, tint: 0x353b3a, rust: 0.35 }); rep(steelDark, 1 / 2, 1 / 2);
  const steelCream = T.paintedSteel({ seed: 21, tint: 0xb9b3a2, rust: 0.0 }); rep(steelCream, 1 / 2, 1 / 2);
  const shut = T.shutter();              rep(shut, 1 / 2, 1 / 2);
  const roof = T.corrugated();           rep(roof, 1 / 3, 1 / 3);
  const ceil = T.ceilingPanels();        rep(ceil, 1 / 2.4, 1 / 2.4);
  const bal = T.ballast();               rep(bal, 1 / 2, 1 / 2);
  const grass = T.groundGrass();         rep(grass, 1 / 4, 1 / 4);
  const pave = T.pavement({ tint: 0x8b867c });  rep(pave, 1 / 4, 1 / 4);
  const tacL = T.tactile();              rep(tacL, 1 / 0.3, 1 / 0.3);
  const tacD = T.tactile({ dots: true }); rep(tacD, 1 / 0.3, 1 / 0.3);
  const wd = T.wood();                   rep(wd, 1 / 1.2, 1 / 1.2);
  const card = T.grimy({ tint: 0x9a8466 }); rep(card, 1, 1);
  const shell = T.robotShell();

  const pbr = (t, o = {}, p = {}) => std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0, ...o }, p);
  M.floor = pbr(floor, { envMapIntensity: 0.7, normalScale: new THREE.Vector2(0.8, 0.8) }, { macro: 0.28 });
  M.concrete = pbr(conc, {}, { macro: 0.22, grime: 0.9 });
  M.concreteDark = pbr(concDark, {}, { macro: 0.25, grime: 0.9 });
  M.mosaic = pbr(mos, { envMapIntensity: 0.6 }, { macro: 0.15, grime: 1 });
  M.mosaicBlue = pbr(mosBlue, { envMapIntensity: 0.6 }, { macro: 0.15, grime: 1 });
  M.steel = pbr(steel, { metalness: 0.3, envMapIntensity: 0.6 }, { macro: 0.12 });
  M.steelDark = pbr(steelDark, { metalness: 0.35, envMapIntensity: 0.5 }, { macro: 0.12 });
  M.steelCream = pbr(steelCream, { metalness: 0.2, envMapIntensity: 0.5 }, { macro: 0.12, grime: 0.6 });
  M.shutter = pbr(shut, { metalness: 0.4, envMapIntensity: 0.5 }, { macro: 0.1 });
  M.roof = pbr(roof, { metalness: 0.3, side: THREE.DoubleSide }, { macro: 0.15 });
  M.ceiling = pbr(ceil, {}, { macro: 0.18 });
  M.ballast = pbr(bal, {}, { macro: 0.3 });
  M.ground = pbr(grass, {}, { macro: 0.3 });
  M.pavement = pbr(pave, {}, { macro: 0.25, grime: 0.5 });
  M.tactileLine = pbr(tacL, {}, { macro: 0.15 });
  M.tactileDot = pbr(tacD, {}, { macro: 0.15 });
  M.wood = pbr(wd, {}, { macro: 0.1 });
  M.cardboard = pbr(card, {}, {});
  M.rail = std({ color: 0x6b5a4c, metalness: 0.7, roughness: 0.45 }, {});
  M.railTop = std({ color: 0xa8a29a, metalness: 0.9, roughness: 0.25 }, {});
  M.sleeper = std({ map: concDark.map, color: 0xb0aaa0, roughness: 0.95 }, { macro: 0.2 });
  M.dark = std({ color: 0x1d1c1b, roughness: 0.9 }, {});
  M.black = std({ color: 0x0b0b0c, roughness: 0.6 }, {});
  M.rubber = std({ color: 0x262626, roughness: 0.85 }, {});
  M.plasticNavy = std({ color: 0x2b3a5c, roughness: 0.55 }, { macro: 0.2 });
  M.plasticRed = std({ color: 0x8e3a33, roughness: 0.55 }, { macro: 0.2 });
  M.plasticCream = std({ color: 0xd9d2c0, roughness: 0.6 }, { macro: 0.15 });
  M.plasticGreen = std({ color: 0x3d7a4e, roughness: 0.5 }, { macro: 0.1 });
  M.chrome = std({ color: 0xb8b8b8, metalness: 0.9, roughness: 0.35 }, {});
  M.brass = std({ color: 0xb08a4a, metalness: 0.85, roughness: 0.4 }, {});
  M.paper = std({ color: 0xe8e1cf, roughness: 0.9, side: THREE.DoubleSide }, {});
  M.glass = std({ map: T.dirtyGlass(), transparent: true, roughness: 0.15, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 }, {});
  M.glassClean = std({ color: 0x9fb4b8, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 }, {});
  // 草木
  const fol = T.foliageAtlas();
  M.foliageTex = fol;
  M.vine = std({ map: fol, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75, color: 0xc2cfa6 }, { wind: 2, windAmp: 0.16 });
  M.grass = std({ map: fol, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xb2b98f }, { wind: 1, windAmp: 0.06 });
  M.bush = std({ map: fol, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8, color: 0xb5c294 }, { wind: 1, windAmp: 0.04 });
  M.treeLeaf = std({ map: fol, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8, color: 0xb6c596 }, { wind: 1, windAmp: 0.1 });
  M.bark = std({ color: 0x5b4a3a, roughness: 0.95, map: conc.map }, { macro: 0.2 });
  // 貼るもの（しみ・苔・影）
  M.stain = patch(new THREE.MeshStandardMaterial({ map: T.blotch({ kind: 'stain', seed: 3 }), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), {});
  M.moss = patch(new THREE.MeshStandardMaterial({ map: T.blotch({ kind: 'moss', seed: 5 }), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), {});
  M.blob = new THREE.MeshBasicMaterial({ map: T.radial({ color: 'rgba(0,0,0,0.55)' }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // ロボット
  M.shell = std({ map: shell.map, normalMap: shell.normalMap, roughnessMap: shell.roughnessMap, roughness: 1, envMapIntensity: 0.9 }, {});
  for (const [k, m] of Object.entries(M)) if (m && m.isMaterial && !m.name) m.name = k;
  return M;
}

/** 画像（canvas のテクスチャ）を貼った板の材質（看板・ポスター）。 */
export function sheet(map, { emissive = false, rough = 0.7, side = THREE.FrontSide, transparent = false, alphaTest = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: rough, side, transparent, alphaTest, depthWrite: !transparent });
  if (emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = map; m.emissiveIntensity = 0; }
  return patch(m, {});
}

/** 環境マップ（空・地平・地面の明るさ）。屋外の反射と、環境光のもと。 */
export function makeEnvironment(renderer, { sky = 0x9cc4e4, horizon = 0xf0e6d2, ground = 0x6a6152, sun = 0xfff1d0, sunDir = U.sunDir.value } = {}) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { cSky: { value: new THREE.Color(sky) }, cHor: { value: new THREE.Color(horizon) }, cGround: { value: new THREE.Color(ground) }, cSun: { value: new THREE.Color(sun) }, uSun: { value: sunDir.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 cSky, cHor, cGround, cSun, uSun; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float y = d.y;
        vec3 c = y > 0.0 ? mix(cHor, cSky, pow(max(y, 0.0), 0.6)) : mix(cHor, cGround, pow(max(-y, 0.0), 0.4));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += cSun * (pow(s, 64.0) * 6.0 + pow(s, 6.0) * 0.35);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(geo, mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  geo.dispose();
  mat.dispose();
  return rt.texture;
}
