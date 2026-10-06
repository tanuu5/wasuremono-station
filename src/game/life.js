// 生きもの：すずめ（日なたで跳ねてついばみ、トモが近づくと飛んで逃げ、しばらくすると戻ってくる）と、白いちょうちょ。
// 昼の駅に「だれもいないけど、生きているもの」を置く。
import * as THREE from 'three';
import { damp, wrapAngle } from '../core/math.js';
import { patch } from './world/materials.js';
import { L } from './world/layout.js';

const std = (o) => patch(new THREE.MeshStandardMaterial(o), {});

function sparrowModel() {
  const g = new THREE.Group();
  const brown = std({ color: 0x7a5a3a, roughness: 0.9 });
  const cream = std({ color: 0xd9ccb0, roughness: 0.9 });
  const dark = std({ color: 0x2a2420, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), brown);
  body.scale.set(0.8, 0.75, 1.25);
  body.position.y = 0.06;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), cream);
  belly.scale.set(0.75, 0.7, 1.0);
  belly.position.set(0, 0.05, 0.008);
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.045);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), brown);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), cream);
  cheek.position.set(0, -0.006, 0.01);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 6), dark);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.004, 0.035);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), dark); e.position.set(s * 0.022, 0.006, 0.02); head.add(e); }
  head.add(hm, cheek, beak);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.06), brown);
  tail.position.set(0, 0.07, -0.07);
  tail.rotation.x = -0.4;
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.11, 0, -0.01, 0, 0, -0.05], 3));
  wingGeo.computeVertexNormals();
  const wingMat = std({ color: 0x5e4630, roughness: 0.9, side: THREE.DoubleSide });
  const wl = new THREE.Mesh(wingGeo, wingMat);
  const wr = new THREE.Mesh(wingGeo, wingMat);
  wr.scale.x = -1;
  const wgL = new THREE.Group(), wgR = new THREE.Group();
  wgL.position.set(0.03, 0.085, 0); wgR.position.set(-0.03, 0.085, 0);
  wgL.add(wl); wgR.add(wr);
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 4), dark); leg.position.set(s * 0.015, 0.015, 0); g.add(leg); }
  g.add(body, belly, head, tail, wgL, wgR);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, wgL, wgR };
  return g;
}

function butterflyModel() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#f6f4ea';
  x.beginPath(); x.ellipse(28, 22, 22, 18, -0.3, 0, 6.28); x.fill();
  x.beginPath(); x.ellipse(24, 46, 14, 12, 0.4, 0, 6.28); x.fill();
  x.fillStyle = '#3a3a3a';
  x.beginPath(); x.arc(40, 14, 4, 0, 6.28); x.fill();
  x.beginPath(); x.arc(30, 24, 3, 0, 6.28); x.fill();
  const tex = new THREE.CanvasTexture(c);
  const mat = patch(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), {});
  const geo = new THREE.PlaneGeometry(0.06, 0.06);
  geo.translate(0.03, 0, 0);
  geo.rotateX(-Math.PI / 2);
  const l = new THREE.Mesh(geo, mat), r = new THREE.Mesh(geo, mat);
  r.scale.x = -1;
  g.add(l, r);
  g.userData = { l, r };
  return g;
}

export class Life {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.birds = [];
    this.flies = [];
    // すずめ：日なたの床（ホール）、ホーム、外
    const homes = [[-4.5, 0, 4.5], [-3.0, 0, 6.8], [5, 0, -4], [8.5, 0, 5], [2.5, 0, 10.5], [-10.6, 0, 6.4], [-8, L.platform.y, -20], [10, L.platform.y, -19.5], [0, 0, 36], [-8, 0, 40], [12, 0, 37]];
    for (const [hx, hy, hz] of homes) {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const m = sparrowModel();
        m.scale.setScalar(1.15);
        const b = { m, home: new THREE.Vector3(hx + (Math.random() - 0.5) * 1.2, hy, hz + (Math.random() - 0.5) * 1.2), state: 'ground', t: Math.random() * 3, hop: 0, vel: new THREE.Vector3(), target: new THREE.Vector3(), yaw: Math.random() * 6.28, perch: null, flap: 0 };
        b.m.position.copy(b.home);
        scene.add(m);
        this.birds.push(b);
      }
    }
    // ちょうちょ：外の日なた
    const fhomes = [[2, 1.2, 38], [-6, 1, 41], [10, 1.4, 41], [-14, 6.2, -32], [-2, 6.4, -31], [6, 6.2, -33], [-20, 6.6, -38]];
    for (const [x, y, z] of fhomes) {
      const m = butterflyModel();
      scene.add(m);
      this.flies.push({ m, home: new THREE.Vector3(x, y, z), ph: Math.random() * 100, pos: new THREE.Vector3(x, y, z) });
    }
    this._v = new THREE.Vector3();
  }

  update(dt, player, time) {
    const pp = player.pos;
    for (const b of this.birds) {
      b.t -= dt;
      const m = b.m;
      const ud = m.userData;
      const d = m.position.distanceTo(pp);
      if (b.state === 'ground') {
        // 近づかれたら飛ぶ
        if (d < 2.4 && Math.abs(pp.y - m.position.y) < 2) {
          b.state = 'fly';
          b.t = 2.5 + Math.random() * 2;
          const away = this._v.copy(m.position).sub(pp).setY(0).normalize();
          b.vel.set(away.x * 3.5 + (Math.random() - 0.5), 3.2 + Math.random() * 1.5, away.z * 3.5 + (Math.random() - 0.5));
          this.audio.sfx('flap', { pos: m.position.clone(), minGap: 0.2 });
          continue;
        }
        // ついばむ・跳ねる
        if (b.hop > 0) {
          b.hop = Math.max(0, b.hop - dt * 4);
          const k = 1 - b.hop;
          m.position.lerpVectors(b.from, b.target, k);
          m.position.y = b.target.y + Math.sin(k * Math.PI) * 0.06;
        } else if (b.t <= 0) {
          b.t = 0.3 + Math.random() * 1.6;
          if (Math.random() < 0.55) {
            b.from = m.position.clone();
            b.target.copy(b.home).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6));
            b.yaw = Math.atan2(b.target.x - m.position.x, b.target.z - m.position.z);
            b.hop = 1;
          } else b.peck = 0.35;
        }
        b.peck = Math.max(0, (b.peck || 0) - dt);
        ud.head.rotation.x = b.peck > 0 ? Math.sin((0.35 - b.peck) * 30) * 0.5 + 0.3 : damp(ud.head.rotation.x, 0, 8, dt);
        m.rotation.y = damp(m.rotation.y, m.rotation.y + wrapAngle(b.yaw - m.rotation.y), 12, dt);
        ud.wgL.rotation.z = 0.1; ud.wgR.rotation.z = -0.1;
        if (Math.random() < dt * 0.04) this.audio.sfx('chirp', { pos: m.position.clone(), minGap: 0.8, vel: 0.7 });
      } else if (b.state === 'fly') {
        b.vel.y -= dt * 1.2;
        b.vel.multiplyScalar(1 - dt * 0.3);
        m.position.addScaledVector(b.vel, dt);
        m.rotation.y = Math.atan2(b.vel.x, b.vel.z);
        b.flap += dt * 38;
        ud.wgL.rotation.z = Math.sin(b.flap) * 1.1;
        ud.wgR.rotation.z = -Math.sin(b.flap) * 1.1;
        if (b.t <= 0 || m.position.y > 14) { b.state = 'away'; b.t = 8 + Math.random() * 10; m.visible = false; }
      } else if (b.state === 'away') {
        // しばらくしたら、家の近くに戻る（トモが離れていれば）
        if (b.t <= 0 && b.home.distanceTo(pp) > 6) { b.state = 'ground'; m.position.copy(b.home); m.visible = true; b.hop = 0; }
      }
    }
    for (const f of this.flies) {
      f.ph += dt;
      const t = f.ph;
      f.pos.set(f.home.x + Math.sin(t * 0.37) * 2.2 + Math.sin(t * 1.3) * 0.4, f.home.y + Math.sin(t * 0.9) * 0.35 + Math.sin(t * 3.1) * 0.08, f.home.z + Math.cos(t * 0.29) * 2.0);
      const prev = f.m.position.clone();
      f.m.position.copy(f.pos);
      const dx = f.pos.x - prev.x, dz = f.pos.z - prev.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-5) f.m.rotation.y = Math.atan2(dx, dz);
      const w = Math.sin(t * 22) * 0.9;
      f.m.userData.l.rotation.z = w;
      f.m.userData.r.rotation.z = -w;
    }
  }
}
