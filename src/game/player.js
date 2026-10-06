// トモ（プレイヤー）の動き。見た目とアニメーションは robot.js、ここは移動・ジャンプ・足音の拍。
import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math.js';

export const WALK = 3.0;
export const RUN = 4.8;
const JUMP = 5.4;
const GRAVITY = 20;

export class Player {
  constructor(world) {
    this.world = world;
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), r: 0.27, h: 1.0, step: 0.36, snap: 0.42, gravity: GRAVITY, grounded: true, surface: 'tile' };
    this.yaw = 0;          // 向いている方向（0 = +Z を向く）
    this.speed = 0;        // 水平の速さ
    this.state = 'idle';   // idle / walk / run / jump / fall / land / busy
    this.airT = 0;
    this.landT = 0;
    this.stride = 0;       // 足音の拍（歩いた距離）
    this.lastSafe = new THREE.Vector3();
    this.safeT = 0;
    this.frozen = false;   // 演出中は動かない
    this.events = [];      // このフレームの出来事（'step', 'jump', 'land'）
  }

  get pos() { return this.body.pos; }

  place(x, y, z, yaw = 0) {
    this.body.pos.set(x, y, z);
    this.body.vel.set(0, 0, 0);
    this.body.grounded = true;
    this.yaw = yaw;
    this.speed = 0;
    this.lastSafe.set(x, y, z);
  }

  /** その場で止める（手紙・手帳・一時停止のあいだ、足だけ動きつづけないように）。 */
  halt() {
    this.body.vel.x = 0;
    this.body.vel.z = 0;
    this.speed = 0;
    if (this.body.grounded) this.state = 'idle';
  }

  /**
   * 1 コマ。move = { x, y }（カメラから見た向き）、camYaw = カメラの向き、opts.run / opts.jump。
   */
  update(dt, move, camYaw, { run = false, jump = false } = {}) {
    const b = this.body;
    this.events.length = 0;
    let mx = this.frozen ? 0 : move.x, my = this.frozen ? 0 : move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1e-4) { wx /= wl; wz /= wl; }
    // アナログのスティックは倒し具合で歩く速さ、いっぱいに倒すか走るボタンで走る
    const target = mag < 0.05 ? 0 : (run ? RUN : WALK * clamp(mag * 1.15, 0.35, 1));
    const accel = b.grounded ? 11 : 2.5;
    b.vel.x = damp(b.vel.x, wx * target, accel, dt);
    b.vel.z = damp(b.vel.z, wz * target, accel, dt);
    if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), b.grounded ? 12 : 5, dt);
    if (jump && b.grounded && !this.frozen) {
      b.vel.y = JUMP;
      b.grounded = false;
      this.events.push('jump');
    }
    const res = this.world.move(b, dt);
    this.speed = Math.hypot(b.vel.x, b.vel.z);
    if (res.landed > 2.5) { this.events.push('land'); this.landT = Math.min(0.35, res.landed * 0.05); this.landVel = res.landed; }
    // 足音の拍：歩幅ごとに 'step'
    if (b.grounded && this.speed > 0.4) {
      const prev = this.stride;
      this.stride += this.speed * dt;
      const sl = this.speed > 3.6 ? 0.62 : 0.42;
      if (Math.floor(prev / sl) !== Math.floor(this.stride / sl)) this.events.push('step');
    }
    // 状態
    this.landT = Math.max(0, this.landT - dt);
    if (!b.grounded) { this.airT += dt; this.state = b.vel.y > 0 ? 'jump' : this.airT > 0.12 ? 'fall' : this.state; }
    else {
      this.airT = 0;
      this.state = this.landT > 0 ? 'land' : this.speed > 3.4 ? 'run' : this.speed > 0.25 ? 'walk' : 'idle';
    }
    // 落ちたら戻す（安全な場所を覚えておく）
    this.safeT += dt;
    if (b.grounded && this.safeT > 0.5) { this.lastSafe.copy(b.pos); this.safeT = 0; }
    if (b.pos.y < -12) { this.place(this.lastSafe.x, this.lastSafe.y + 0.2, this.lastSafe.z, this.yaw); this.events.push('respawn'); }
  }

  /** 正面の向き（水平の単位ベクトル）。 */
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
}
