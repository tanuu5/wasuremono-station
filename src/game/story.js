// 演出の台本（Director のジェネレーター）。時間はゲームの step で進むので、一時停止・コマ送り・撮影でも同じになる。
import * as THREE from 'three';
import { fade, say } from '../story/flow.js';
import { itemById } from './items.js';
import { makeScene } from './ghosts.js';
import { L } from './world/layout.js';
import { LEVER_OFF, LEVER_ON } from './world/dress.js';
import { lerp } from '../core/math.js';

const V = (a) => new THREE.Vector3(...a);

/** dt を受けながら sec 秒、fn(t: 0〜1) を呼ぶ。 */
function* tween(sec, fn) {
  let t = 0;
  while (t < sec) {
    const dt = yield 0;
    t += typeof dt === 'number' ? dt : 1 / 60;
    fn(Math.min(1, t / sec));
  }
  fn(1);
}

// ---------------------------------------------------------------- 起動（はじめから）
export function* intro(G) {
  const R = G.renderer, A = G.anim, S = G.story;
  G.setState('intro');
  R.setFx({ fade: 1, fadeColor: '#000' });
  A.glow = 0;
  A.lanternOn = 0;
  A.setLayer('sit', 1, 50);
  A.express('closed', 0);
  G.cam.shot([-20.5, 0.85, 11.3], [-22.5, 0.55, 9.55], 42);
  G.cam.blend = 1;
  yield 0.8;
  G.boot.show(['boot.l1', 'boot.l2', 'boot.l3']);
  G.audio.sfx('boot');
  yield () => G.boot.done;
  yield 0.9;
  G.boot.hide();
  yield* fade(R, 0, 2.6);
  // 目に光がもどる（ちらつきながら）
  yield* tween(1.4, (t) => { A.glow = t < 0.3 ? (Math.sin(t * 90) > 0 ? 0.6 : 0.05) : t < 0.5 ? 0.3 : t; });
  A.express('half', 1.5);
  G.audio.sfx('wake');
  yield 0.8;
  A.setLayer('sit', 0, 2);
  A.setLayer('sitUp', 1, 2);
  A.express('open', 0);
  A.lookAt = V([-21.3, 3.6, 8.4]);   // 天井の穴を見上げる
  yield 1.4;
  yield* say(S, 'intro.1');
  yield* say(S, 'intro.2');
  // 立ち上がる
  A.lookAt = null;
  A.setLayer('sitUp', 0, 3);
  G.audio.sfx('stand');
  yield 1.0;
  G.cam.shot(null);
  yield* say(S, 'intro.3');
  G.setObjective();
  G.setState('play');
}

// ---------------------------------------------------------------- ランタン
export function* takeLantern(G) {
  const A = G.anim;
  G.setState('cutscene');
  A.setLayer('reach', 1, 6);
  yield 0.5;
  G.refs.deskLantern.visible = false;
  G.audio.sfx('lantern');
  A.setLayer('reach', 0, 4);
  A.setLayer('raise', 1, 4);
  yield* tween(0.8, (t) => { A.lanternOn = t; });
  A.express('happy', 1.5);
  yield* say(G.story, 'intro.lantern', { sec: 2.2 });
  A.setLayer('raise', 0, 3);
  G.flags.add('lantern');
  G.setObjective();
  G.saveGame();
  G.setState('play');
}

// ---------------------------------------------------------------- 台帳
export function* readLedger(G) {
  G.openNote('note.ledger');
  yield () => G.state === 'play';
  if (!G.flags.has('ledger')) {
    G.flags.add('ledger');
    G.setState('cutscene');
    G.anim.setLayer('bow', 1, 4);
    yield 0.9;
    G.anim.setLayer('bow', 0, 3);
    yield* say(G.story, 'intro.after');
    G.setObjective();
    G.saveGame();
    G.setState('play');
  }
}

// ---------------------------------------------------------------- ホールに出たとき
export function* firstExit(G) {
  G.flags.add('firstExit');
  G.audio.sfx('chapter');
  G.story.chapter('chapter.station', 'chapter.stationSub', 4.5);
  yield 0.1;
}

// ---------------------------------------------------------------- 忘れ物を拾う → 思い出
export function* memory(G, id) {
  const it = itemById(id);
  const A = G.anim, S = G.story, R = G.renderer;
  const obj = G.items[id];
  G.setState('cutscene');
  G.player.frozen = true;
  // 拾う
  A.lookAt = obj.group.position.clone().add(V([0, 0.1, 0]));
  const low = obj.group.position.y < G.player.pos.y + 0.6;
  A.setLayer(low ? 'crouch' : 'reach', 1, 6);
  yield 0.55;
  G.audio.sfx('pickup');
  obj.glow.visible = false;
  G.holdItem(id);
  A.setLayer(low ? 'crouch' : 'reach', 0, 5);
  A.setLayer('hold', 1, 5);
  A.lookAt = null;
  A.express('wide', 1.2);
  yield 0.9;
  // 思い出の場面
  const ghosts = makeScene(it.ghosts);
  for (const g of ghosts) G.scene.add(g.root);
  G.ghosts.push(...ghosts);
  G.cam.shot(it.cam.pos, it.cam.look, 46);
  G.audio.sfx('memory');
  G.audio.duck(true);
  G.memoryLook(1);
  yield 0.6;
  for (const g of ghosts) g.show(true);
  yield 1.4;
  for (const k of ['m1', 'm2', 'm3']) yield* say(S, `item.${id}.${k}`, { sec: 3.6 });
  for (const g of ghosts) g.show(false);
  yield 1.2;
  G.memoryLook(0);
  G.cam.shot(null);
  G.audio.duck(false);
  if (id === 'sketch') {
    A.express('sad', 2.5);
    yield* say(S, 'item.sketch.tomo', { sec: 2.6 });
  }
  // かばんへしまう
  A.setLayer('hold', 0, 4);
  G.stowItem(id);
  G.audio.sfx('stow');
  G.found.add(id);
  S.toast('item.got', { n: G.found.size });
  A.express('happy', 1.6);
  G.player.frozen = false;
  G.setObjective();
  G.saveGame();
  yield 0.4;
  for (const g of ghosts) g.removeAfter = 3;
  G.setState('play');
  if (G.found.size === 7) G.director.run(allFound(G), 'allFound');
}

export function* allFound(G) {
  yield 1.5;
  G.audio.sfx('chime');
  yield* say(G.story, 'event.allFound');
  yield* say(G.story, 'event.allFound2');
  G.setBoards('final');
  G.setObjective();
}

// ---------------------------------------------------------------- キーボックス
export function* takeKey(G) {
  G.setState('cutscene');
  G.anim.setLayer('reach', 1, 6);
  yield 0.5;
  G.audio.sfx('key');
  G.flags.add('key');
  G.anim.setLayer('reach', 0, 4);
  G.story.toast('event.key');
  yield* say(G.story, 'look.keybox', { sec: 2.6 });
  G.setObjective();
  G.saveGame();
  G.setState('play');
}

// ---------------------------------------------------------------- 電気室の扉
export function* openElecDoor(G) {
  G.setState('cutscene');
  G.anim.setLayer('reach', 1, 6);
  yield 0.4;
  G.audio.sfx('unlock');
  yield 0.4;
  G.audio.sfx('door');
  G.flags.add('elecOpen');
  G.anim.setLayer('reach', 0, 4);
  yield* tween(1.0, (t) => G.refs.elecDoor.open(t * t * (3 - 2 * t), 1));
  yield* say(G.story, 'look.elecOpen', { sec: 2.2 });
  G.saveGame();
  G.setState('play');
}

// ---------------------------------------------------------------- 主電源
export function* powerOn(G) {
  const A = G.anim, R = G.renderer, S = G.story;
  G.setState('cutscene');
  // レバーの前まで歩いて、向きなおる
  G.walkTo = G.refs.spots.leverStand;
  for (let t = 0; G.walkTo && t < 4;) { const dt = yield 0; t += typeof dt === 'number' ? dt : 1 / 60; }
  G.walkTo = null;
  const y0 = G.player.yaw, dy = Math.atan2(Math.sin(Math.PI - y0), Math.cos(Math.PI - y0));
  yield* tween(0.25, (t) => { G.player.yaw = y0 + dy * t * t * (3 - 2 * t); });
  A.setLayer('reach', 1, 5);
  yield 0.5;
  G.audio.sfx('lever');
  const arm = G.refs.lever.arm;
  yield* tween(0.45, (t) => { arm.rotation.x = LEVER_OFF + (LEVER_ON - LEVER_OFF) * t * t; });
  A.setLayer('reach', 0, 4);
  A.express('wide', 2);
  G.cam.shake = 0.4;
  yield 0.5;
  G.audio.sfx('powerUp');
  // 地下の明かりが、ちらつきながらつく
  yield* tween(1.6, (t) => { G.setPower(t < 0.6 ? (Math.sin(t * 70) > 0.2 ? t : 0) : t); });
  G.flags.add('power');
  yield* say(S, 'event.power1', { sec: 2.4 });
  // ホールへ（切り替え）
  yield* fade(R, 1, 0.5, '#000');
  G.cam.shot([-1.5, 3.2, 9.5], [-5, 5.2, -6], 50);
  G.cam.blend = 1;
  yield* fade(R, 0, 0.6);
  G.audio.sfx('chime');
  G.setBoards('on');
  yield 0.6;
  yield* say(S, 'event.announce', { sec: 3 });
  G.audio.sfx('shutter', { pos: V([-5, 7, -12.2]) });
  yield* tween(3.2, (t) => G.refs.platformShutter.open(t));
  yield* say(S, 'event.power2', { sec: 2.6 });
  yield* say(S, 'event.shutter', { sec: 3 });
  yield* fade(R, 1, 0.5);
  G.cam.shot(null);
  G.cam.blend = 0;
  G.cam.snap(G.player);
  yield* fade(R, 0, 0.6);
  G.setObjective();
  G.saveGame();
  G.setState('play');
}

// ---------------------------------------------------------------- 券売機（切符）
export function* ticketOut(G) {
  G.setState('cutscene');
  G.anim.setLayer('reach', 1, 6);
  yield 0.4;
  G.audio.sfx('ticket');
  G.anim.setLayer('reach', 0, 4);
  G.flags.add('ticketOut');
  G.items.ticket.group.visible = true;
  G.items.ticket.glow.visible = true;
  yield* say(G.story, 'look.ticketOn', { sec: 2.6 });
  G.setState('play');
}

// ---------------------------------------------------------------- 調べたことばを言うだけ
export function* look(G, key, vars) {
  G.setState('cutscene');
  G.anim.setLayer('tilt', 1, 5);
  yield* say(G.story, key, { vars, sec: Math.max(2.2, 1.2 + G.textLen(key, vars) * 0.09) });
  G.anim.setLayer('tilt', 0, 4);
  G.setState('play');
}

export { tween };

// ---------------------------------------------------------------- エンディング：最後の列車
export function* ending(G) {
  const A = G.anim, S = G.story, R = G.renderer, P = G.player;
  G.setState('ending');
  P.frozen = true;
  G.flags.add('ending');
  // 乗車位置で、線路のほうを向く
  const mark = G.refs.spots.board;
  P.place(mark[0], mark[1], mark[2] + 0.35, Math.PI);
  G.cam.shot([mark[0] + 3.6, mark[1] + 1.25, mark[2] + 2.2], [mark[0], mark[1] + 0.7, mark[2]], 44);
  yield 1.0;
  A.setLayer('bow', 1, 3);
  yield* say(S, 'end.1', { sec: 3 });
  A.setLayer('bow', 0, 3);
  yield 1.2;
  // 時計が動きだす
  G.audio.sfx('clockTick');
  const pc = G.refs.spots.platformClock;
  G.cam.shot([pc[0] + 1.6, pc[1] - 0.25, pc[2] + 0.3], [pc[0], pc[1], pc[2]], 34);
  yield 1.4;
  G.startClocks(11 * 60 + 42, 1);
  G.audio.sfx('clockTick');
  yield 0.8;
  yield* say(S, 'end.clock', { sec: 2.6 });
  // 昼から夕方へ（時計が早まわり）
  G.clockSpeed = 40;
  G.audio.setAmbience({ wind: 0.6, higurashi: 1, room: 0.2 });
  G.cam.shot([mark[0] - 6, mark[1] + 2.4, mark[2] + 6], [mark[0] + 6, mark[1] + 2.2, mark[2] - 8], 52);
  yield* tween(7, (t) => G.setTimeOfDay(t * t * (3 - 2 * t)));
  G.clockSpeed = 1;
  // ホールの時計も
  yield* fade(R, 1, 0.5, '#000');
  G.cam.shot([10.4, 3.2, 2.4], [13.6, 4.1, 0], 36);
  G.cam.blend = 1;
  yield* fade(R, 0, 0.7);
  yield 2.6;
  yield* fade(R, 1, 0.5, '#000');
  G.cam.shot([mark[0] - 3.5, mark[1] + 1.25, mark[2] + 1.8], [mark[0] + 24, mark[1] + 0.9, mark[2] - 3.6], 46);
  G.cam.blend = 1;
  G.setBoards('final');
  yield* fade(R, 0, 0.8);
  // 踏切と、アナウンス
  G.audio.sfx('crossing', { n: 12, pos: new THREE.Vector3(60, 5, -26) });
  yield 2.2;
  G.audio.sfx('chime');
  yield 1.2;
  yield* say(S, 'end.announce', { sec: 3.4 });
  // 光の列車が来る
  const train = G.spawnLightTrain();
  G.audio.sfx('horn', { pos: new THREE.Vector3(40, 6, -26.5) });
  G.audio.sfx('rumble', { dur: 9, pos: new THREE.Vector3(10, 5, -26.5) });
  const stopX = -2.5;
  yield* tween(8.5, (t) => {
    const e = 1 - Math.pow(1 - t, 2.6);
    train.position.x = lerp(stopX + 90, stopX, e);
    G.trainGlow(train, 1);
  });
  G.audio.sfx('brake', { pos: new THREE.Vector3(-5, 5, -26.5) });
  yield 1.2;
  G.audio.sfx('doorOpen', { pos: new THREE.Vector3(-5, 5.5, -25) });
  G.openTrainDoors(train, 1);
  // 持ち主たちが現れる
  G.cam.shot([mark[0] - 2.6, mark[1] + 1.6, mark[2] + 4.3], [mark[0] + 0.4, mark[1] + 0.85, mark[2] - 0.8], 50);
  yield 0.8;
  const owners = G.spawnOwners();
  for (const o of owners) { o.show(true); o.boost = 1.6; }
  yield 2.2;
  // 忘れ物が、光になって持ち主へ
  for (let i = 0; i < owners.length; i++) {
    G.sendOrb(i, owners[i]);
    G.audio.sfx('pickup');
    yield 0.45;
  }
  yield 2.2;
  // 子ども以外は、列車へ
  for (let i = 0; i < owners.length; i++) {
    const o = owners[i];
    if (o.isChild) continue;
    o.boardTo = G.trainDoorFor(train, o.root.position.x);
    o.setPose('walk');
  }
  yield 3.4;
  // 子どもとトモ
  const child = owners.find((o) => o.isChild);
  child.root.lookAt(P.pos.x, child.root.position.y, P.pos.z);
  A.lookAt = child.root.position.clone().add(new THREE.Vector3(0, 0.8, 0));
  G.cam.shot([mark[0] + 2.2, mark[1] + 1.1, mark[2] + 1.6], [mark[0] - 0.4, mark[1] + 0.75, mark[2] - 0.8], 40);
  yield 0.6;
  yield* say(S, 'end.child1', { sec: 3 });
  A.setLayer('tilt', 1, 3);
  yield 0.8;
  A.setLayer('tilt', 0, 3);
  A.express('happy', 4);
  yield* say(S, 'end.tomo1', { sec: 3.6 });
  child.setPose('wave');
  yield* say(S, 'end.child2', { sec: 3 });
  A.setLayer('wave', 1, 4);
  yield* say(S, 'end.tomo2', { sec: 2.6 });
  child.boardTo = G.trainDoorFor(train, child.root.position.x);
  child.setPose('walk');
  yield 2.2;
  A.setLayer('wave', 0, 3);
  // 発車
  G.audio.music('depart');
  G.cam.shot([mark[0] + 1.4, mark[1] + 1.0, mark[2] + 3.4], [mark[0] - 6, mark[1] + 1.4, mark[2] - 3], 50);
  yield 6.5;
  G.audio.sfx('doorOpen', { pos: new THREE.Vector3(-5, 5.5, -25) });
  G.openTrainDoors(train, 0);
  yield 1.4;
  G.audio.sfx('rumble', { dur: 8, pos: new THREE.Vector3(-20, 5, -26.5) });
  A.setLayer('wave', 1, 3);
  yield* tween(9, (t) => {
    train.position.x = stopX - 140 * t * t;
    G.trainGlow(train, 1 - Math.max(0, t - 0.6) / 0.4);
  });
  A.setLayer('wave', 0, 2);
  G.removeLightTrain(train);
  // ひとり、夕焼けのホームに
  A.lookAt = null;
  G.cam.shot([mark[0] + 0.6, mark[1] + 1.05, mark[2] + 2.8], [mark[0] - 3, mark[1] + 1.6, mark[2] - 12], 48);
  yield 4.5;
  A.express('happy', 0);
  yield* fade(R, 1, 2.5, '#fff1dc');
  G.audio.music('ending');
  G.story.chapter('end.last', null, 6);
  yield 6.5;
  yield* fade(R, 1, 1.2, '#000');
  G.story.chapter('end.fin', 'end.credit1', 7);
  yield 7.5;
  G.story.chapter('game.title', 'end.credit2', 6);
  yield 7;
  G.finishGame();
}
