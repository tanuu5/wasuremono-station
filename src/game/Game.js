// わすれもの駅：ゲームの本体。形は雛形のまま（init / step / render / STATES / snapshot）。
// 物語の進み：flags（ランタン・台帳・鍵・電気…）と found（拾った忘れ物）。演出は story.js の台本を Director で動かす。
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';
import { events } from '../core/events.js';
import { createStore } from '../core/save.js';
import { t } from '../core/i18n.js';
import { World } from './physics.js';
import { Builder, findCoplanar } from './world/builder.js';
import { createMaterials, makeEnvironment, U, addAmbientZone } from './world/materials.js';
import { buildArchitecture, ambientZones, lightOpenings } from './world/station.js';
import { dressStation, LEVER_OFF, LEVER_ON } from './world/dress.js';
import { setPictures } from './world/signs.js';
import { asset } from '../core/assets.js';
import { buildPlants } from './world/plants.js';
import { createLightShafts, createDust } from './world/atmosphere.js';
import { createSky } from './world/sky.js';
import { L, inPit } from './world/layout.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { RobotModel, RobotAnimator } from './robot.js';
import { Interactions } from './interact.js';
import { ITEMS, itemModel, itemGlow } from './items.js';
import { Director } from '../story/Director.js';
import * as ST from './story.js';
import { Ghost } from './ghosts.js';
import { trainCar } from './world/props.js';
import { setSkyBlend } from './world/sky.js';
import { radial } from './world/tex.js';
import { Puddles, placePuddles } from './world/water.js';
import { rand } from './world/noise.js';
import { Life } from './life.js';

export const STATES = {
  title: { title: true, input: 'menu', music: 'title' },
  intro: { story: true, input: 'actions', music: 'stop' },
  play: { hud: true, touch: true, story: true, input: 'play', music: 'play' },
  cutscene: { story: true, input: 'actions' },
  note: { story: true, input: 'actions', duck: true },
  notebook: { input: 'menu', modal: 'notebook', duck: true },
  paused: { hud: true, input: 'menu', modal: 'pause', duck: true },
  ending: { story: true, input: 'actions', music: 'stop' },
};

const SAVE_VERSION = 1;
const V3 = (a) => new THREE.Vector3(...a);

// 見た目（場所ごとの明るさ）。露出は「目が慣れる」ようにゆっくり変える
const LOOK_BASE = { exposure: 1.0, bloomStrength: 0.42, bloomRadius: 0.62, bloomThreshold: 0.8, vignette: 0.3, saturation: 1.02, contrast: 1.04, lift: [0.012, 0.018, 0.028], gain: [1.03, 1.0, 0.96], grain: 0.025 };
const LOOK_MEMORY = { saturation: 0.62, contrast: 0.98, vignette: 0.55, lift: [0.05, 0.045, 0.035], gain: [1.08, 1.02, 0.92], bloomStrength: 0.75 };

export class Game {
  constructor({ renderer, input, audio, screens, touch, hud, story, boot, notebook }) {
    Object.assign(this, { renderer, input, audio, screens, touch, hud, story, boot, notebook });
    this.save = createStore('wasuremono-station.save', { found: [], flags: [], pos: null, playTime: 0, cleared: false }, SAVE_VERSION);
    this.time = 0;
    this.state = 'title';
    this.flags = new Set();
    this.found = new Set();
    this.ghosts = [];
    this.director = new Director();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 700);
    this.camera.position.set(0, 2, 10);
    renderer.setScene(this.scene, this.camera);
    renderer.setLook({ ...LOOK_BASE });
    this.memoryT = 0;
    this.memoryWant = 0;
    this.exposure = 1;
    this.power = 0;
    this.playTime = 0;
    this.saveT = 0;
    this.evening = 0;
    this.clockRunning = false;
  }

  async init() {
    await document.fonts?.ready;
    const scene = this.scene;
    this.M = createMaterials();
    this.world = new World();
    this.level = new THREE.Group();
    this.level.name = 'level';
    scene.add(this.level);
    // 絵の素材（カレンダー・落書き・時刻表）。読めなくても、文字の札で代わりに作るので止めない
    const pic = (path) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = asset(path); });
    const [calendar, graffiti, timetable] = await Promise.all(['tex/calendar.jpg', 'tex/graffiti.png', 'tex/timetable.jpg'].map(pic));
    setPictures({ calendar, graffiti, timetable });
    const B = new Builder(this.world);
    if (import.meta.env?.DEV || /[?&]dev\b/.test(location.search)) B.records = [];
    buildArchitecture(B, this.M);
    this.refs = dressStation(B, this.M, this.level);
    this.plants = buildPlants(B, this.M, this.level, this.renderer.quality);
    this.boxRecords = B.records;
    B.build(this.level);
    ambientZones(addAmbientZone);
    for (const v of U.ambMin.value) v.base = v.w;

    // 光の筋とほこり
    const openings = lightOpenings();
    this.shafts = createLightShafts(openings);
    scene.add(this.shafts.group);
    this.dust = createDust(openings, { count: 1800 });
    scene.add(this.dust);

    // 空・環境光・もや
    this.sky = createSky();
    scene.add(this.sky);
    scene.environment = makeEnvironment(this.renderer.renderer);
    scene.environmentIntensity = 0.85;
    scene.fog = new THREE.FogExp2(0xb9c6c8, 0.011);

    // 太陽（影はステージ全体を覆う）
    const sun = (this.sun = new THREE.DirectionalLight(0xffeccf, 4.2));
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 2;
    this.fitShadow();
    scene.add(sun, sun.target);
    // 水たまり（鏡）
    this.puddles = new Puddles(this.renderer.renderer, scene, this.camera);
    placePuddles(this.puddles, rand(77));
    this.renderer.before.push((r, sc, cam) => this.puddles.render(r, sc, cam));
    this.renderer.onResize = () => this.puddles?.resize();
    this.renderer.onQuality = (p) => {
      sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.autoUpdate = !p.staticShadow;
      sun.shadow.needsUpdate = true;
      this.puddles?.setQuality(p.reflect || 0);
    };
    this.renderer.onQuality(this.renderer.preset);
    // 鏡に映さないもの（草・光の筋・ほこり）は層 1 に
    this.camera.layers.enable(1);
    for (const m of this.plants.meshes) if (m.name === 'grass') m.layers.set(1);
    this.shafts.group.traverse((o) => o.layers.set(1));
    this.dust.layers.set(1);

    // トモ
    this.player = new Player(this.world);
    this.robot = new RobotModel();
    this.anim = new RobotAnimator(this.robot);
    this.avatar = this.robot.root;
    scene.add(this.avatar, this.robot.lantern);
    this.lanternLight = new THREE.PointLight(0xffb866, 0.35, 8, 1.6);
    this.lanternLight.name = 'lanternLight';
    scene.add(this.lanternLight);
    // 机の上のランタン（手に取る前）
    const dl = this.robot._lantern();
    dl.position.set(...this.refs.spots.deskLantern).add(V3([0, 0.23, 0]));
    dl.userData.flame.visible = false;
    scene.add(dl);
    this.refs.deskLantern = dl;
    // 接地の影（丸いぼかし）
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), this.M.blob);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;
    scene.add(this.blob);

    this.cam = new CameraRig(this.camera, this.world);
    this.glowTex = radial({ size: 128, color: 'rgba(255,255,255,1)' });
    this.envNoon = scene.environment;

    // 忘れ物
    this.items = {};
    for (const it of ITEMS) {
      const group = itemModel(it.id);
      group.position.set(...it.pos);
      group.rotation.y = it.ry || 0;
      if (it.lean) group.rotation.z = it.lean;
      const glow = itemGlow();
      glow.position.set(it.pos[0], it.pos[1], it.pos[2]);
      glow.traverse((o) => o.layers.set(1));
      scene.add(group, glow);
      this.items[it.id] = { group, glow, home: group.position.clone(), homeRot: group.rotation.clone(), homeScale: group.scale.x, def: it };
    }
    this.thumbs = this.makeThumbs();

    // 生きもの
    this.life = new Life(scene, this.world, this.audio);

    // 調べられるもの
    this.inter = new Interactions();
    this.setupInteractions();

    this.resetProgress();
    this.reset();
    this.setState('title');
  }

  // ================================================================ 状態
  setState(s) {
    const S = STATES[s];
    if (!S) throw new Error('状態がありません: ' + s);
    const prev = this.state;
    this.state = s;
    this.screens.showTitle(!!S.title);
    this.hud.show(!!S.hud);
    this.story.show(!!S.story);
    this.touch.setVisible(!!S.touch);
    this.input.mode = S.input || 'menu';
    if (!S.modal) this.screens.closeAll();
    else if (!this.screens.isOpen(S.modal)) this.screens.open(S.modal);
    if (S.music === 'stop') this.audio.stopMusic(1.5);
    else if (S.music) this.audio.music(S.music);
    this.audio.duck(!!S.duck);
    if (s !== 'play') this.story.setPrompt(null);
    if (s !== 'play' && s !== 'paused') this.input.unlockPointer?.();
    // プレイヤーを動かさない状態では止めておく（止めないと、歩く速さが残って足だけ動く）
    if (s === 'note' || s === 'notebook' || s === 'paused') this.player.halt();
    this[`enter_${s}`]?.(prev);
    if (prev !== s) events.emit('state', { from: prev, to: s });
  }

  enter_play() { this.grace = 0.25; this.hud.setCount(this.found.size); }
  enter_paused() { this.audio.sfx('pause'); }
  enter_title() {
    this.cam.shot([-12.8, 1.15, 12.6], [-3.5, 3.4, -6.5], 50);
    this.cam.blend = 1;
    this.renderer.setFx({ fade: 0 });
    this.screens.setContinue?.(this.hasSave());
    this.screens.setCleared?.(!!this.save.data.cleared);
  }

  /** はじめから。 */
  start() {
    this.director.stop();
    this.resetProgress();
    this.reset();
    this.save.data.flags = [];
    this.save.data.found = [];
    this.save.data.pos = null;
    this.save.save();
    this.director.run(ST.intro(this), 'intro');
  }

  /** つづきから。 */
  continueGame() {
    this.director.stop();
    this.resetProgress();
    this.loadGame();
    this.cam.shot(null);
    this.cam.blend = 0;
    this.cam.snap(this.player);
    this.renderer.setFx({ fade: 0 });
    this.setObjective();
    this.setState('play');
    if (this.flags.has('cleared')) this.story.say('after.hint');
  }

  /** 確認用：途中から遊べる状態にする（__dev.goto('play', { at, flags, found })）。 */
  devPlay({ at = null, flags = ['lantern', 'ledger', 'firstExit'], found = [] } = {}) {
    this.director.stop();
    this.resetProgress();
    for (const f of flags) this.flags.add(f);
    for (const id of found) if (this.items[id]) { this.found.add(id); this.items[id].group.visible = false; this.items[id].glow.visible = false; }
    if (this.flags.has('lantern')) { this.refs.deskLantern.visible = false; this.anim.lanternOn = 1; }
    if (this.flags.has('power')) { this.setPower(1); this.refs.platformShutter.open(1); this.setBoards('on'); }
    if (this.flags.has('elecOpen')) this.refs.elecDoor.open(1);
    if (this.flags.has('ticketOut') && !this.found.has('ticket')) { this.items.ticket.group.visible = true; this.items.ticket.glow.visible = true; }
    if (at) this.player.place(at[0], at[1], at[2], at[3] || 0);
    else this.reset();
    this.cam.shot(null);
    this.cam.blend = 0;
    this.cam.snap(this.player);
    this.renderer.setFx({ fade: 0 });
    this.setObjective();
    this.setState('play');
  }

  hasSave() { return !!(this.save.data.flags?.length || this.save.data.found?.length); }

  resetProgress() {
    this.flags.clear();
    this.found.clear();
    for (const g of this.ghosts) this.scene.remove(g.root);
    this.ghosts = [];
    this.held = null;
    for (const [id, o] of Object.entries(this.items)) {
      if (o.group.parent !== this.scene) this.scene.add(o.group);
      o.group.visible = id !== 'ticket';
      o.glow.visible = id !== 'ticket';
      o.group.position.copy(o.home);
      o.group.rotation.copy(o.homeRot);
      o.group.scale.setScalar(o.homeScale);
    }
    this.refs.deskLantern.visible = true;
    this.anim.lanternOn = 0;
    this.anim.glow = 1;
    this.anim.clearLayers();
    this.anim.lookAt = null;
    this.refs.platformShutter.open(0);
    this.refs.elecDoor.open(0);
    this.refs.officeDoor.open(0);
    this.refs.lever.arm.rotation.x = LEVER_OFF;
    this.setPower(0);
    this.setBoards('off');
    this.player.frozen = false;
    this.walkTo = null;
    this.setAfter(false);
    this.playTime = 0;
    this.memoryWant = 0;
    if (this.evening > 0) { this.setTimeOfDay(0); this.scene.environment = this.envNoon; }
    this.clockRunning = false;
    for (const c of this.refs.clocks) c.set(11, 42);
    this.story.clear();
    this.story.setObjective(null);
  }

  reset() {
    this.player.place(-22.5, 0, 9.55, 0.55);
    this.cam.snap(this.player);
  }

  // ================================================================ 保存
  saveGame() {
    const d = this.save.data;
    d.flags = [...this.flags];
    d.found = [...this.found];
    const p = this.player.pos;
    if (this.player.body.grounded) d.pos = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +this.player.yaw.toFixed(2)];
    d.playTime = Math.round(this.playTime);
    this.save.save();
  }

  loadGame() {
    const d = this.save.data;
    for (const f of d.flags || []) this.flags.add(f);
    for (const id of d.found || []) if (this.items[id]) { this.found.add(id); this.items[id].group.visible = false; this.items[id].glow.visible = false; }
    this.playTime = d.playTime || 0;
    if (this.flags.has('lantern')) { this.refs.deskLantern.visible = false; this.anim.lanternOn = 1; }
    if (this.flags.has('elecOpen')) this.refs.elecDoor.open(1);
    if (this.flags.has('officeOpen')) this.refs.officeDoor.open(1);
    if (this.flags.has('power')) { this.setPower(1); this.refs.platformShutter.open(1); this.refs.lever.arm.rotation.x = LEVER_ON; this.setBoards(this.found.size === 7 ? 'final' : 'on'); }
    if (this.flags.has('ticketOut') && !this.found.has('ticket')) { this.items.ticket.group.visible = true; this.items.ticket.glow.visible = true; }
    if (this.flags.has('cleared')) { this.setTimeOfDay(1); this.startClocks(18 * 60 + 12, 1); this.setAfter(true); }
    const pos = d.pos;
    if (pos) this.player.place(pos[0], pos[1] + 0.05, pos[2], pos[3] || 0);
    else this.reset();
  }

  /** クリアのあとにだけ出るもの（新聞の切り抜き・乗客からのカード・貼り紙の書き足し）。 */
  setAfter(on) { for (const m of this.refs.after || []) m.visible = on; }

  // ================================================================ 目的
  /** [文言のキー, 値, 地図に出す場所] */
  objectiveKey() {
    const n = this.found.size, S = this.refs.spots;
    if (this.flags.has('cleared')) return ['obj.after', null, null];
    if (!this.flags.has('lantern')) return ['obj.lantern', null, S.deskLantern];
    if (!this.flags.has('ledger')) return ['obj.ledger', null, S.ledger];
    if (n === 7) return ['obj.deliver', null, S.board];
    if (!this.flags.has('power')) {
      if (this.flags.has('key')) return ['obj.elec', { n }, S.lever];
      if (this.flags.has('shutterSeen')) return ['obj.power', { n }, null];
      return ['obj.find', { n }, null];
    }
    if (!this.flags.has('platformSeen')) return ['obj.platform', { n }, S.shutter];
    return ['obj.find', { n }, null];
  }
  setObjective() {
    const [key, vars] = this.objectiveKey();
    this.story.setObjective(key, { hold: 7, vars });
    this.hud.setCount(this.found.size);
  }

  // ================================================================ 調べられるもの
  setupInteractions() {
    const I = this.inter, R = this.refs.spots, F = this.flags;
    const look = (id, pos, key, extra = {}) => I.add({ id, pos, prompt: 'prompt.look', use: (G) => G.run(ST.look(G, typeof key === 'function' ? key(G) : key)), ...extra });
    // 忘れ物センター
    I.add({ id: 'lantern', pos: R.deskLantern, prompt: 'prompt.take', radius: 1.4, enabled: () => !F.has('lantern'), use: (G) => G.run(ST.takeLantern(G)) });
    I.add({ id: 'ledger', pos: R.ledger, prompt: 'prompt.read', radius: 1.5, enabled: () => F.has('lantern'), use: (G) => (G.flags.has('cleared') ? G.run(G.readNote('note.ledgerAfter')) : G.run(ST.readLedger(G))) });
    look('dock', R.dock, 'look.dock', { radius: 1.1, enabled: () => F.has('lantern') });
    look('shelf', R.shelf, 'look.shelf', { radius: 1.6 });
    look('umbrellas', R.umbrellas, 'look.umbrellas', { radius: 1.3 });
    // ホール
    I.add({ id: 'mapBoard', pos: R.mapBoard, prompt: 'prompt.map', radius: 1.7, use: (G) => G.openNotebook('map') });
    look('routeBoard', R.routeBoard, 'look.routeMap', { radius: 1.7 });
    look('hallClock', R.hallClock, (G) => (G.clockRunning ? 'look.clockMoving' : 'look.clock'), { radius: 2.4, reachUp: 4 });
    look('vending', R.vending, (G) => (G.flags.has('power') ? 'look.vendingOn' : 'look.vendingOff'), { radius: 1.6 });
    look('posterCat', R.posterCat, 'look.posterCat', { radius: 1.4 });
    look('posterSea', R.posterSea, 'look.posterSea', { radius: 1.4 });
    look('gates', R.gates, 'look.gate', { radius: 1.3, cone: 0.5 });
    look('kiosk', [L.kiosk.x1 + 0.6, 1.0, -7.6], 'look.kiosk', { radius: 1.4 });
    I.add({ id: 'shutter', pos: R.shutter, prompt: 'prompt.look', radius: 1.8, enabled: (G) => !G.flags.has('power'), use: (G) => { G.flags.add('shutterSeen'); G.setObjective(); G.run(ST.look(G, 'look.shutterOff')); } });
    // 駅務室
    I.add({ id: 'officeDoor', pos: [7.8, 1.0, L.stationOffice.z0 - 0.6], prompt: 'prompt.open', radius: 1.4, enabled: () => !F.has('officeOpen'), use: (G) => G.run(G.openOfficeDoor()) });
    I.add({ id: 'diary', pos: R.diary, prompt: 'prompt.read', radius: 1.4, use: (G) => G.run(G.readNote('note.diary')) });
    I.add({ id: 'news', pos: R.news, prompt: 'prompt.read', radius: 1.3, enabled: () => F.has('cleared'), use: (G) => G.run(G.readNote('note.news')) });
    I.add({ id: 'keybox', pos: R.keybox, prompt: 'prompt.look', radius: 1.4, use: (G) => (G.flags.has('key') ? G.run(ST.look(G, 'look.keyboxEmpty')) : G.run(ST.takeKey(G))) });
    // 入口ホール
    I.add({
      id: 'ticketMachine', pos: R.ticketMachine, prompt: 'prompt.press', radius: 1.4,
      enabled: (G) => !(G.flags.has('ticketOut') && !G.found.has('ticket')),
      use: (G) => {
        if (!G.flags.has('power')) G.run(ST.look(G, 'look.ticketOff'));
        else if (!G.flags.has('ticketOut')) G.run(ST.ticketOut(G));
        else G.run(ST.look(G, 'look.ticketDone'));
      },
    });
    look('phone', R.phone, (G) => (G.flags.has('power') ? 'look.phoneOn' : 'look.phone'), { radius: 1.4 });
    look('notice', R.notice, (G) => (G.flags.has('cleared') ? 'look.noticeAfter' : 'look.notice'), { radius: 1.4 });
    // 地下
    look('graffiti', R.graffiti, 'look.graffiti', { radius: 1.6 });
    look('alleySign', R.alleySign, 'look.alley', { radius: 1.6 });
    look('calendar', R.calendar, 'look.calendar', { radius: 1.3 });
    look('timetableOffice', R.timetableOffice, 'look.timetable', { radius: 1.4 });
    look('timetable', R.timetable, 'look.timetable', { radius: 1.5 });
    I.add({ id: 'elecDoor', pos: R.elecDoor, prompt: 'prompt.open', radius: 1.4, enabled: () => !F.has('elecOpen'), use: (G) => (G.flags.has('key') ? G.run(ST.openElecDoor(G)) : G.run(ST.look(G, 'look.elecLocked'))) });
    I.add({ id: 'lever', pos: R.lever, prompt: 'prompt.pull', radius: 1.4, use: (G) => (G.flags.has('power') ? G.run(ST.look(G, 'look.leverDone')) : G.run(ST.powerOn(G))) });
    // ホーム
    look('nameSign', R.nameSign, 'look.nameSign', { radius: 1.6 });
    I.add({ id: 'thanks', pos: R.thanks, prompt: 'prompt.read', radius: 1.4, enabled: () => F.has('cleared'), use: (G) => G.run(G.readNote('note.thanks')) });
    look('train', [-9, L.track2.y + 1.2, L.track2.rail + 1.6], 'look.train', { radius: 2.2 });
    I.add({
      id: 'deliver', pos: [R.board[0], R.board[1] + 0.5, R.board[2]], prompt: 'prompt.deliver', radius: 1.4, cone: -1,
      enabled: (G) => !G.flags.has('cleared'),
      use: (G) => { if (G.found.size < 7) G.run(ST.look(G, 'look.deliverNot', { n: G.found.size })); else G.startEnding(); },
    });
    // 外
    look('busStop', R.busStop, 'look.busStop', { radius: 1.5 });
    look('postbox', R.postbox, 'look.postbox', { radius: 1.4 });
    look('car', R.car, 'look.car', { radius: 2.2 });
    // 忘れ物
    for (const it of ITEMS) {
      I.add({
        id: 'item:' + it.id, pos: [it.pos[0], it.pos[1] + 0.1, it.pos[2]], prompt: 'prompt.take', radius: it.id === 'hat' ? 1.5 : 1.3, cone: 0.1, reachUp: 1.8,
        enabled: (G) => !G.found.has(it.id) && G.items[it.id].group.visible && !G.held,
        use: (G) => G.run(ST.memory(G, it.id)),
      });
    }
  }

  *openOfficeDoor() {
    this.setState('cutscene');
    this.anim.setLayer('reach', 1, 6);
    yield 0.35;
    this.audio.sfx('door');
    this.anim.setLayer('reach', 0, 4);
    this.flags.add('officeOpen');
    yield* ST.tween(0.9, (k) => this.refs.officeDoor.open(k * k * (3 - 2 * k), 1));
    this.setState('play');
  }

  *readNote(key) {
    this.openNote(key);
    yield () => this.state === 'play';
  }

  run(gen) { this.director.run(gen, 'action'); }

  /** 文字数（字幕の長さを決めるため）。 */
  textLen(key, vars) { return [...t(key, vars || {})].length; }

  openNote(key) {
    this.audio.sfx('paper');
    this.story.openNote(key);
    this.setState('note');
  }

  openNotebook(tab = 'items') {
    this.audio.sfx('book');
    const p = this.player.pos;
    const floor = p.y < -2 ? 'B1' : p.y > 3 ? '2F' : '1F';
    const obj = this.objectiveKey()[2];
    this.setState('notebook');
    this.notebook.open({ found: this.found, thumbs: this.thumbs, pos: p.clone(), floor, objective: obj }, tab);
  }

  // ================================================================ 1 コマ
  step(dt) {
    const input = this.input;
    input.update(dt);
    this.time += dt;
    U.time.value = this.time;
    this[`update_${this.state}`]?.(dt);
    if (this.state !== 'paused' && this.state !== 'notebook' && this.state !== 'title') {
      this.director.step(dt);
      this.story.update(dt);
      this.boot.update(dt);
    }
    this.updateWorld(dt);
    this.audio.listen(this.camera);
    this.audio.tick(dt);
    input.endFrame();
  }

  update_title(dt) {
    if (this.input.menu.back && this.screens.back()) this.audio.sfx('ui_back');
    // ゆっくり流れるカメラ（ホールを見わたす）
    const k = Math.sin(this.time * 0.05);
    this.cam.shot([-12.8 + k * 1.2, 1.15 + k * 0.15, 12.6 - k * 0.6], [-3.5 + k * 2, 3.4, -6.5], 50);
    this.cam.update(dt, null, this.player, { cut: true });
  }

  update_paused() {
    const input = this.input;
    if (input.menu.back || input.menu.start || input.pressed('pause')) {
      if (this.screens.top !== this.screens.modals.pause) { this.screens.back(); this.audio.sfx('ui_back'); }
      else this.setState('play');
    }
  }

  update_notebook(dt) {
    const input = this.input;
    this.player.update(dt, { x: 0, y: 0 }, this.cam.yaw, {});
    this.notebook.update();
    if (!this.screens.isOpen('notebook') || input.menu.back || input.pressed('notebook') || input.pressed('pause') || input.menu.start) {
      this.audio.sfx('ui_back');
      this.screens.closeAll();
      this.setState('play');
    }
  }

  update_note(dt) {
    const input = this.input;
    this.player.update(dt, { x: 0, y: 0 }, this.cam.yaw, {});
    if (input.pressed('interact') || input.pressed('jump') || input.menu.back || this.story.noteClicked || input.pressed('pause')) {
      this.story.closeNote();
      this.audio.sfx('paper');
      this.setState('play');
    }
  }

  update_intro(dt) {
    this.cam.update(dt, null, this.player, {});
    // 2 回目からは飛ばせる（Esc・Start・B / ○）
    if (this.input.pressed('pause') || this.input.menu.start || this.input.menu.back) this.skipIntro();
  }

  skipIntro() {
    this.director.stop('intro');
    this.boot.hide();
    this.renderer.setFx({ fade: 0 });
    this.anim.glow = 1;
    this.anim.clearLayers();
    this.anim.lookAt = null;
    this.anim.express('open', 0);
    this.cam.shot(null);
    this.cam.blend = 0;
    this.cam.snap(this.player);
    this.story.say(null);
    this.setObjective();
    this.setState('play');
  }
  update_cutscene(dt) {
    // 演出で決めた所まで歩かせる（walkTo = [x, y, z]。着いたら null に戻る）
    let move = { x: 0, y: 0 }, yaw = this.cam.yaw;
    const w = this.walkTo;
    if (w) {
      const p = this.player.pos, dx = w[0] - p.x, dz = w[2] - p.z, d = Math.hypot(dx, dz);
      if (d < 0.06) this.walkTo = null;
      else { const k = Math.min(1, d / 0.4) * 0.75 / d; move = { x: dx * k, y: -dz * k }; yaw = 0; }
    }
    this.player.update(dt, move, yaw, {});
    this.cam.update(dt, null, this.player, {});
  }
  update_ending(dt) { this.update_cutscene(dt); }

  update_play(dt) {
    const input = this.input;
    if (input.pressed('pause') || input.menu.start) { this.setState('paused'); return; }
    if (input.pressed('notebook')) { this.openNotebook('items'); return; }
    this.grace = Math.max(0, (this.grace || 0) - dt);
    this.playTime += dt;
    const target = this.grace ? null : this.inter.pick(this);
    this.story.setPrompt(target ? target.prompt : null);
    document.documentElement.classList.toggle('can-interact', !!target);
    let jump = !this.grace && input.pressed('jump');
    if (target && !this.grace && (input.pressed('interact') || jump)) {
      jump = false;
      this.player.body.vel.x *= 0.2;
      this.player.body.vel.z *= 0.2;
      target.use(this);
    }
    // 走る：ボタン、またはタッチのスティックをいっぱいに倒したとき
    const mag = Math.hypot(input.move.x, input.move.y);
    const run = input.down('action') || (input.device === 'touch' && mag > 0.92);
    this.player.update(dt, input.move, this.cam.yaw, { run, jump });
    const moving = Math.hypot(input.move.x, input.move.y) > 0.1;
    this.cam.update(dt, input.look, this.player, { moving });
    this.hud.update(dt, moving);
    this.anim.lookAt = target ? target.pos : null;
    // 足音・着地
    for (const e of this.player.events) {
      if (e === 'step') this.audio.sfx('step_' + (this.player.body.surface || 'tile'), { minGap: 0.05 });
      else if (e === 'jump') this.audio.sfx('jump');
      else if (e === 'land') this.audio.sfx('land', { vel: Math.min(1, (this.player.landVel || 4) / 10) });
    }
    // 場所の出来事
    const p = this.player.pos;
    if (!this.flags.has('firstExit') && this.flags.has('ledger') && p.x > L.hall.x0 + 0.6) this.run(ST.firstExit(this));
    if (!this.flags.has('platformSeen') && p.z < L.platform.z1 - 0.5 && p.y > 5) { this.flags.add('platformSeen'); this.setObjective(); }
    // バルコニーの崩れた所：はじめて来たときに、ひとこと
    if (!this.flags.has('gapHint') && p.y > 5 && p.x > 14 && p.z > -2.2 && p.z < -0.2 && !this.found.has('hat')) { this.flags.add('gapHint'); this.story.say('hint.gap'); }
    // ホールの床の穴：はじめて近づいたときに、ひとこと（下へおりられることを知らせる）
    if (!this.flags.has('pitHint') && Math.abs(p.y) < 0.3 && inPit(p.x, p.z, 1.4)) { this.flags.add('pitHint'); this.story.say('hint.pit'); }
    // ときどき保存
    this.saveT += dt;
    if (this.saveT > 15) { this.saveT = 0; this.saveGame(); }
  }

  // ================================================================ 世界
  updateWorld(dt) {
    const pl = this.player, p = pl.pos;
    this.avatar.position.copy(p);
    this.avatar.rotation.y = pl.yaw;
    this.anim.update(dt, { speed: pl.speed, grounded: pl.body.grounded, vy: pl.body.vel.y, yaw: pl.yaw, landT: pl.landT });
    this.avatar.updateMatrixWorld(true);
    const flick = this.anim.updateLantern(dt, pl.yaw);
    this.robot.lantern.visible = this.anim.lanternOn > 0.01;
    // ランタンの明かり：明るい所ではほとんど要らない（近すぎて脚が白く飛ぶので、少し前に置く）
    const fw = pl.forward(new THREE.Vector3());
    this.lanternLight.position.copy(this.robot.lantern.position).addScaledVector(fw, 0.35).y -= 0.1;
    const dark = 1 - this.ambientAt(p);
    const k = clamp((dark - 0.55) / 0.4, 0, 1);
    this.lanternLight.intensity = (0.12 + k * k * (3 - 2 * k) * 1.6) * flick * this.anim.lanternOn;
    this.lanternLight.distance = 5 + dark * 7;
    this.sky.position.copy(this.camera.position);
    // 接地の影
    const g = this.world.ground(p.x, p.z, p.y + 0.2);
    if (g.y > -Infinity) { this.blob.position.set(p.x, g.y + 0.015, p.z); this.blob.material.opacity = clamp(1 - (p.y - g.y) * 1.2, 0, 1); }
    // 忘れ物の光（近いほど強く）
    for (const [id, o] of Object.entries(this.items)) {
      if (!o.glow.visible) continue;
      const d = o.group.position.distanceTo(p);
      o.glow.userData.update(this.time, clamp(1.2 - d / 14, 0.25, 1));
      if (this.held?.id !== id && id !== 'umbrella' && id !== 'hat' && id !== 'ticket') o.group.rotation.y = o.homeRot.y + Math.sin(this.time * 0.8) * 0.15;
    }
    // 残像
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.update(dt);
      if (gh.removeAfter !== undefined && !gh.visible) {
        gh.removeAfter -= dt;
        if (gh.removeAfter <= 0) { this.scene.remove(gh.root); this.ghosts.splice(i, 1); }
      }
    }
    // 持っている忘れ物（両手の間）→ かばんへ
    if (this.held) {
      const h = this.held, J = this.robot.j;
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      J.handL.getWorldPosition(a);
      J.handR.getWorldPosition(b);
      const mid = a.lerp(b, 0.5);
      if (h.stow > 0) {
        h.stow = Math.min(1, h.stow + dt * 1.6);
        const back = new THREE.Vector3();
        J.pack.getWorldPosition(back);
        mid.lerp(back, h.stow);
        h.group.scale.setScalar(h.scale * (1 - h.stow * 0.95));
        if (h.stow >= 1) { h.group.visible = false; this.held = null; }
      }
      if (this.held) {
        h.group.position.copy(mid).add(new THREE.Vector3(0, -0.03, 0));
        h.group.rotation.set(0, pl.yaw + 0.3, 0);
      }
    }
    this.life?.update(dt, this.player, this.time);
    // 光の玉（エンディング）
    if (this.orbs) for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t = Math.min(1, o.t + dt / 1.3);
      const k = o.t * o.t * (3 - 2 * o.t);
      o.s.position.lerpVectors(o.from, o.to, k).y += Math.sin(k * Math.PI) * 1.2;
      o.s.material.opacity = o.t < 0.9 ? 1 : (1 - o.t) * 10;
      if (o.t >= 1) { this.scene.remove(o.s); this.orbs.splice(i, 1); o.ghost.flash = 1; }
    }
    for (const gh of this.ghosts) if (gh.flash) { gh.flash = Math.max(0, gh.flash - dt * 0.8); gh.mat.uniforms.uAlpha.value *= 1 + gh.flash * 1.5; }
    const tr = this.scene.getObjectByName('lightTrain');
    if (tr) { const dm = tr.userData.doorMat; dm.opacity = damp(dm.opacity, tr.userData.doorOpen ? 0.28 : 0, 3, dt); }
    // 場所ごとの明るさ（目が慣れる）
    const amb = this.ambientAt(this.camera.position);
    const cz = this.camera.position.z;
    const outdoor = cz > L.entrance.z1 + 0.5 || (cz < L.platform.z1 - 1 && this.camera.position.y > 4);
    const wantExp = outdoor ? 0.8 : lerp(1.95, 1.0, clamp(amb / 0.5, 0, 1));
    this.exposure = damp(this.exposure, wantExp, 1.4, dt);
    this.memoryT = damp(this.memoryT, this.memoryWant, 2.2, dt);
    this.applyLook();
    // 時計
    if (this.clockRunning) {
      this.clockTime += dt * this.clockSpeed;
      const m = this.clockTime;
      for (const c of this.refs.clocks) c.set(Math.floor(m / 60), m % 60);
    }
    if (this.sunMoved) { this.sun.shadow.needsUpdate = true; this.sunMoved = false; }
    this.updateAudioZone(dt);
  }

  /** 場所ごとの環境音・曲・鳥のさえずり（0.5 秒ごとに見る）。 */
  updateAudioZone(dt) {
    this.audioT = (this.audioT ?? 0) - dt;
    if (this.audioT > 0) return;
    this.audioT = 0.5;
    const p = this.state === 'title' ? this.camera.position : this.player.pos;
    const inBox = (b, y0 = -1, y1 = 4) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y > y0 && p.y < y1;
    let zone = 'hall';
    if (p.y < -2) zone = 'under';
    else if (inBox(L.office) || inBox(L.kiosk) || inBox(L.stationOffice)) zone = 'room';
    else if (p.z > L.entrance.z1 + 0.3 || (p.z < L.platform.z1 - 0.3 && p.y > 4)) zone = 'outdoor';
    else if (p.z > L.entrance.z0) zone = 'entrance';
    const eve = this.evening > 0.5;
    const key = zone + (eve ? ':eve' : '') + (this.power > 0.5 ? ':p' : '') + ':' + this.state;
    if (key === this.audioKey) return;
    this.audioKey = key;
    const pow = this.power > 0.5 ? 1 : 0;
    const bug = eve ? 'higurashi' : 'cicada';
    const mixes = {
      hall: { room: 0.7, wind: 0.35, [bug]: 0.45, hum: pow * 0.4 },
      entrance: { room: 0.45, wind: 0.5, [bug]: 0.7, hum: pow * 0.3 },
      outdoor: { wind: 0.85, [bug]: 1.0 },
      room: { room: 0.85, wind: 0.15, [bug]: 0.3, hum: pow * 0.5 },
      under: { drone: 1, water: 0.9, room: 0.3, hum: pow * 0.6 },
    };
    if (this.state !== 'ending') this.audio.setAmbience(mixes[zone]);
    // 曲：地下では止める（エンディング中は台本が決める）
    if (this.state === 'play') {
      if (zone === 'under') this.audio.stopMusic(2.5);
      else this.audio.music('play');
    }
    // 鳥（地下・夕方ではいない）と、地下のしずく
    const birds = zone !== 'under' && !eve;
    if (birds !== this.birdsOn) {
      this.birdsOn = birds;
      const spots = [[-4, 12.4, -6], [8, 12.4, 6], [-10, 12.4, 12], [-20, 8.5, -20], [10, 9, -30], [6, 8, 40], [-12, 6, 44]];
      spots.forEach((pos, i) => {
        if (birds) this.audio.loop('bird' + i, 'chirp', { period: 5 + i * 1.3, jitter: 3.5, pos: V3(pos), refDistance: 4, vel: 0.8 });
        else this.audio.stopLoop('bird' + i);
      });
    }
    const drips = zone === 'under';
    if (drips !== this.dripsOn) {
      this.dripsOn = drips;
      [[-14.8, -4.4, 2], [-12.2, -4.4, 8.5], [-13.5, -4.4, -6], [-15, -4.4, 14]].forEach((pos, i) => {
        if (drips) this.audio.loop('drip' + i, 'drip', { period: 2.2 + i * 0.7, jitter: 1.4, pos: V3(pos), refDistance: 2 });
        else this.audio.stopLoop('drip' + i);
      });
    }
  }

  /** その場所の「空の光」の割合（環境光の箱から。シェーダーの zoneAmbient と同じ計算）。 */
  ambientAt(p) {
    let k = 1;
    const n = U.ambCount.value;
    for (let i = 0; i < n; i++) {
      const lo = U.ambMin.value[i], hi = U.ambMax.value[i];
      const s = Math.max(hi.w, 0.001);
      const d = Math.max(lo.x - p.x, p.x - hi.x, lo.y - p.y, p.y - hi.y, lo.z - p.z, p.z - hi.z);
      const e = clamp((d + s * 0.5) / s, 0, 1);
      const inside = 1 - e * e * (3 - 2 * e);
      k = Math.min(k, lerp(1, lo.w, inside));
    }
    return k * U.ambGlobal.value;
  }

  applyLook() {
    const m = this.memoryT;
    const L1 = { ...LOOK_BASE, ...LOOK_MEMORY };
    const out = {};
    for (const k of Object.keys(LOOK_BASE)) {
      const a = LOOK_BASE[k], b = L1[k];
      out[k] = Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], m)) : lerp(a, b, m);
    }
    out.exposure = this.exposure;
    this.renderer.setLook(out);
  }

  memoryLook(on) { this.memoryWant = on ? 1 : 0; }

  // ================================================================ 電気・発車標
  setPower(k) {
    this.power = k;
    this.refs.tubeMat.emissiveIntensity = k * 2.2;
    for (const v of this.refs.vending) v.mat.emissiveIntensity = k * 0.9;
    for (const tk of this.refs.tickets) tk.mat.emissiveIntensity = k * 0.8;
    if (this.refs.elecRedLamp) this.refs.elecRedLamp.visible = k < 0.5;
    // 地下・売店などの暗い所に、明かりのぶんの光を足す
    for (const v of U.ambMin.value) if (v.base !== undefined && v.base < 0.12) v.w = lerp(v.base, Math.min(0.3, v.base + 0.22), k);
  }

  setBoards(mode) {
    for (const b of this.refs.boards) {
      b.mode = mode;
      const tex = mode === 'final' ? b.final : b.on;
      b.mat.emissiveMap = tex;
      b.mat.map = mode === 'off' ? b.off : tex;
      b.mat.emissiveIntensity = mode === 'off' ? 0 : 1.4;
      b.mat.needsUpdate = true;
    }
  }

  // ================================================================ 忘れ物を持つ・しまう
  holdItem(id) {
    const o = this.items[id];
    o.group.visible = true;
    o.group.rotation.set(0, 0, 0);
    this.held = { id, group: o.group, stow: 0, scale: o.group.scale.x };
  }
  stowItem() { if (this.held) this.held.stow = 0.001; }

  // ================================================================ エンディング
  startEnding() {
    if (!this.flags.has('power')) { this.run(ST.look(this, 'look.deliverPower')); return; }
    this.director.stop('action');
    this.director.run(ST.ending(this), 'ending');
  }

  startClocks(minutes, speed) {
    this.clockRunning = true;
    this.clockTime = minutes;
    this.clockSpeed = speed;
  }

  /** 昼（0）→ 夕方（1）。太陽・空・もや・光の筋・環境音。 */
  setTimeOfDay(e) {
    this.evening = e;
    const noon = new THREE.Vector3(0.316, 0.906, -0.281), eve = new THREE.Vector3(-0.86, 0.26, -0.44).normalize();
    U.sunDir.value.copy(noon).lerp(eve, e).normalize();
    this.sun.color.set(0xffeccf).lerp(new THREE.Color(0xff9f5a), e);
    this.sun.intensity = lerp(4.2, 3.4, e);
    this.scene.fog.color.set(0xb9c6c8).lerp(new THREE.Color(0xd7b89c), e);
    this.scene.fog.density = lerp(0.011, 0.015, e);
    U.sunFog.value.set(0xfff2d6).lerp(new THREE.Color(0xffb27a), e);
    this.scene.environmentIntensity = lerp(0.85, 0.6, e);
    U.ambGlobal.value = lerp(1, 0.8, e);
    setSkyBlend(this.sky, e);
    this.shafts.setStrength(Math.max(0, 1 - e * 2.5));
    this.dust.material.uniforms.uStrength.value = 0.8 * Math.max(0, 1 - e * 2.5);
    this.fitShadow();
    if (e >= 1) {
      this.envEvening ||= makeEnvironment(this.renderer.renderer, { sky: 0x7d8cb2, horizon: 0xf0b088, ground: 0x5a4a40, sun: 0xffa060, sunDir: U.sunDir.value });
      this.scene.environment = this.envEvening;
    } else if (e <= 0 && this.envNoon) this.scene.environment = this.envNoon;
  }

  /** 光の列車（2 両）。 */
  spawnLightTrain() {
    const g = new THREE.Group();
    g.name = 'lightTrain';
    const z = L.track1.rail, y = L.track1.y + 0.26;
    for (const dx of [-9.875, 9.875]) {
      const car = trainCar(this.M, { ghost: true, seed: 91 });
      car.position.set(dx, 0, 0);
      g.add(car);
    }
    // 扉の光（開くと見える）
    const doorMat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    g.userData.doors = [];
    for (const dx of [-9.875, 9.875]) for (const f of [0.12, 0.37, 0.63, 0.88]) {
      const x = dx - 9.75 + f * 19.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.9), doorMat);
      m.position.set(x, 2.25, 1.47);
      g.add(m);
      g.userData.doors.push(x);
    }
    g.userData.doorMat = doorMat;
    // 前の光
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff0c8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    head.scale.set(4, 3, 1);
    head.position.set(-19.9, 2.2, 0);
    g.add(head);
    const light = new THREE.PointLight(0xffd8a0, 6, 22, 1.5);
    light.position.set(0, 3, 1.8);
    g.add(light);
    g.userData.light = light;
    g.position.set(90, y, z);
    this.scene.add(g);
    return g;
  }
  trainGlow(train, a) {
    train.traverse((o) => { if (o.isMesh && o.material !== train.userData.doorMat) o.material.opacity = 0.5 * a; else if (o.isSprite) o.material.opacity = a; });
    train.userData.light.intensity = 6 * a;
  }
  openTrainDoors(train, open) { train.userData.doorOpen = open; }
  trainDoorFor(train, x) {
    let best = train.userData.doors[0], bd = Infinity;
    for (const dx of train.userData.doors) { const wx = train.position.x + dx; const d = Math.abs(wx - x); if (d < bd) { bd = d; best = wx; } }
    return new THREE.Vector3(best, L.platform.y, L.platform.z0 - 0.2);
  }
  removeLightTrain(train) { this.scene.remove(train); }

  /** 忘れ物の持ち主たち（ホームに並ぶ）。 */
  spawnOwners() {
    const types = [['girl', 'umbrella'], ['youngman', 'postcard'], ['kid', 'marble'], ['boy', 'hat'], ['mother', 'rabbit'], ['oldman', 'ticket'], ['child', 'sketch']];
    const mark = this.refs.spots.board;
    const out = [];
    types.forEach(([type, item], i) => {
      const gh = new Ghost(type);
      const t = i / (types.length - 1);
      const x = mark[0] - 4.2 + t * 8.4, z = mark[2] - 0.9 - Math.sin(t * Math.PI) * 0.7;
      gh.root.position.set(x, L.platform.y, item === 'sketch' ? mark[2] - 0.55 : z);
      if (item === 'sketch') gh.root.position.x = mark[0] + 1.1;
      gh.root.rotation.y = Math.atan2(mark[0] - x, mark[2] + 0.4 - z);
      gh.setPose('stand');
      gh.item = item;
      gh.isChild = item === 'sketch';
      this.scene.add(gh.root);
      this.ghosts.push(gh);
      out.push(gh);
    });
    return out;
  }

  /** 忘れ物が光の玉になって、トモのかばんから持ち主へ飛ぶ。 */
  sendOrb(i, ghost) {
    const from = new THREE.Vector3();
    this.robot.j.pack.getWorldPosition(from);
    const to = ghost.root.position.clone().add(new THREE.Vector3(0, ghost.T.h * 0.55, 0));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffe6b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(0.35);
    this.scene.add(s);
    (this.orbs ||= []).push({ s, from, to, t: 0, ghost });
  }

  finishGame() {
    this.flags.add('cleared');
    this.save.data.cleared = true;
    this.saveGame();
    this.player.frozen = false;
    for (const g of this.ghosts) this.scene.remove(g.root);
    this.ghosts = [];
    this.story.clear();
    this.renderer.setFx({ fade: 0 });
    this.setState('title');
  }

  // ================================================================ 道具
  /** 影のカメラを、ステージ全体が入る大きさにする（太陽の向きから見た箱）。 */
  fitShadow() {
    const sun = this.sun;
    const center = new THREE.Vector3(0, 0, 2);
    sun.position.copy(center).addScaledVector(U.sunDir.value, 120);
    sun.target.position.copy(center);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    const view = new THREE.Matrix4().lookAt(sun.position, center, new THREE.Vector3(0, 1, 0)).setPosition(sun.position).invert();
    const box = new THREE.Box3(new THREE.Vector3(-38, -6, -44), new THREE.Vector3(36, 17, 48));
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const q = new THREE.Vector3(x, y, z).applyMatrix4(view);
      x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
    }
    const cam = sun.shadow.camera;
    Object.assign(cam, { left: x0, right: x1, bottom: y0, top: y1, near: Math.max(0.5, -z1 - 1), far: -z0 + 1 });
    cam.updateProjectionMatrix();
    this.sunMoved = true;
  }

  /** 忘れ物の小さな絵（手帳に出す）。 */
  makeThumbs() {
    const r = this.renderer.renderer;
    const size = 160;
    const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
    const sc = new THREE.Scene();
    sc.environment = this.scene.environment;
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 2);
    sc.add(key, new THREE.AmbientLight(0xffffff, 0.6));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    const out = {};
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const buf = new Uint8Array(size * size * 4);
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    for (const it of ITEMS) {
      const m = itemModel(it.id);
      const box = new THREE.Box3().setFromObject(m);
      const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).length();
      sc.add(m);
      cam.position.copy(ctr).add(new THREE.Vector3(0.6, 0.7, 1).normalize().multiplyScalar(sz * 2.1));
      cam.lookAt(ctr);
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(sc, cam);
      r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      const img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      g.putImageData(img, 0, 0);
      out[it.id] = c.toDataURL();
      sc.remove(m);
    }
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    rt.dispose();
    return out;
  }

  /** 確認用：ちらつく面（同じ平面に重なった面）の一覧。 */
  zcheck(opts) { return this.boxRecords ? findCoplanar(this.boxRecords, opts) : null; }

  render(dt) { this.renderer.render(dt); }

  snapshot() {
    const p = this.player.pos;
    return {
      state: this.state, player: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], yaw: +this.player.yaw.toFixed(2),
      grounded: this.player.body.grounded, surface: this.player.body.surface, anim: this.player.state,
      found: [...this.found], flags: [...this.flags], target: this.inter?.current?.id ?? null, exposure: +this.exposure.toFixed(2),
    };
  }
}
