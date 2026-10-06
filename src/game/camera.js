// 肩の後ろから見るカメラ。壁にめりこまない（当たりの光線で手前に寄る）。
// 動いているあいだは、ゆっくり背中側に回りこむ（キーボードだけでも遊べるように）。
// 演出のときは shot() で決めた位置・注視点へなめらかに移る。
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../core/math.js';

const TMP = new THREE.Vector3();

export class CameraRig {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 3.6;
    this.curDist = 3.6;
    this.target = new THREE.Vector3();
    this.idleLook = 0;
    this.shotT = null;       // 演出の位置（null ならふつうの追いかけ）
    this.blend = 0;          // 0 = 追いかけ、1 = 演出
    this.shotPos = new THREE.Vector3();
    this.shotLook = new THREE.Vector3();
    this.shotFov = 55;
    this.followPos = new THREE.Vector3();
    this.followLook = new THREE.Vector3();
    this.shake = 0;
    this.fov = 55;
  }

  /** プレイヤーの後ろにすぐ置く。 */
  snap(player) {
    this.yaw = player.yaw + Math.PI;
    this.target.copy(player.pos).y += 0.95;
    this.curDist = this.dist;
    this._follow(0, player, true);
    this.camera.position.copy(this.followPos);
    this.camera.lookAt(this.followLook);
  }

  /** 演出のカメラ（pos, look は Vector3 か配列）。null で追いかけに戻る。 */
  shot(pos, look, fov = 50) {
    if (!pos) { this.shotT = null; return; }
    this.shotPos.set(...(Array.isArray(pos) ? pos : pos.toArray()));
    this.shotLook.set(...(Array.isArray(look) ? look : look.toArray()));
    this.shotFov = fov;
    this.shotT = 0;
  }

  update(dt, look, player, { moving = false, cut = false, blendSpeed = 2.2 } = {}) {
    // 視点の入力
    if (look && (look.x || look.y)) {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch + look.y, -0.45, 1.15);
      this.idleLook = 0;
    } else this.idleLook += dt;
    // 歩いているときは、ゆっくり背中側へ
    if (moving && this.idleLook > 1.2 && player.speed > 0.6) {
      const behind = player.yaw + Math.PI;
      this.yaw = dampAngle(this.yaw, behind, 0.9, dt);
      this.pitch = damp(this.pitch, 0.2, 0.6, dt);
    }
    this._follow(dt, player, false);
    const want = this.shotT !== null ? 1 : 0;
    this.blend = cut ? want : damp(this.blend, want, blendSpeed, dt);
    if (this.shotT !== null) this.shotT += dt;
    const c = this.camera;
    const b = this.blend;
    const s = b * b * (3 - 2 * b);
    c.position.lerpVectors(this.followPos, this.shotPos, s);
    TMP.lerpVectors(this.followLook, this.shotLook, s);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.04;
      c.position.x += (Math.random() - 0.5) * k; c.position.y += (Math.random() - 0.5) * k;
    }
    c.lookAt(TMP);
    // 縦長の画面（スマホの縦持ち）では広く見せる
    const base = c.aspect < 1 ? lerp(70, 55, clamp((c.aspect - 0.45) / 0.55, 0, 1)) : this.fov;
    const fov = lerp(base, this.shotFov * (c.aspect < 1 ? 1.2 : 1), s);
    if (Math.abs(c.fov - fov) > 0.01) { c.fov = fov; c.updateProjectionMatrix(); }
  }

  _follow(dt, player, instant) {
    const p = player.pos;
    const ty = p.y + 0.95;
    if (instant) this.target.set(p.x, ty, p.z);
    else {
      this.target.x = damp(this.target.x, p.x, 14, dt);
      this.target.z = damp(this.target.z, p.z, 14, dt);
      this.target.y = damp(this.target.y, ty, 7, dt);
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = TMP.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // 壁に当たるなら手前へ（少し余裕をもって）
    const hit = this.world.raycast(this.target, dir, this.dist + 0.4);
    const want = clamp(hit - 0.35, 0.55, this.dist);
    this.curDist = instant ? want : want < this.curDist ? damp(this.curDist, want, 25, dt) : damp(this.curDist, want, 3, dt);
    this.followPos.copy(this.target).addScaledVector(dir, this.curDist);
    // 近すぎるときは少し上から
    const close = clamp(1 - this.curDist / 1.6, 0, 1);
    this.followPos.y += close * 0.25;
    this.followLook.copy(this.target);
    this.followLook.y += 0.05 - close * 0.15;
  }
}
