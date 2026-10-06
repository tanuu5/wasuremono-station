// 駅の飾りつけ：小物を置く。動く物・電気で光る物・調べられる物の手がかりは refs に入れて返す。
import * as THREE from 'three';
import { L, inPit, onGrate } from './layout.js';
import * as P from './props.js';
import * as SG from './signs.js';
import { sheet, patch } from './materials.js';
import { rand } from './noise.js';
import { blotch, JP_SERIF } from './tex.js';

/** 主電源のレバーの角度（x 軸まわり）。切 = 下・手前、入 = 上・手前。 */
export const LEVER_OFF = Math.PI - 0.5;
export const LEVER_ON = 0.5;

export function dressStation(B, M, scene) {
  const rng = rand(4242);
  const refs = { vending: [], tickets: [], lights: [], boards: [], clocks: [], dynamic: [], spots: {} };
  const H = L.hall;
  const add = (o) => { scene.add(o); refs.dynamic.push(o); return o; };

  // 電気が戻ると光る材質（蛍光灯）
  const tubeOff = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.4, emissive: 0xf4fff8, emissiveIntensity: 0 });
  refs.tubeMat = tubeOff;

  // ================================================================ コンコース：西
  // 腰壁（モザイクタイル）と幅木
  wainscot(B, M.mosaicBlue, M.steelDark, 'x', H.x0, H.z0, H.z1, 1.25, [[L.office.door[0] - 0.1, L.office.door[1] + 0.1], [L.kiosk.z0, L.kiosk.z1]], 1);
  wainscot(B, M.mosaicBlue, M.steelDark, 'z', H.z1, H.x0, H.x1, 1.25, [[-4.7, 4.7], [L.stationOffice.x0 - 0.3, L.stationOffice.x1 + 0.3]], -1);
  wainscot(B, M.mosaicBlue, M.steelDark, 'x', H.x1, H.z0, H.z1, 1.25, [[11, 14.5]], -1);
  // 自販機 3 台と空き缶入れ
  refs.vending.push(P.vendingMachine(B, M, H.x0 + 0.37, 1.05, Math.PI / 2, 0, 3));
  refs.vending.push(P.vendingMachine(B, M, H.x0 + 0.37, 2.15, Math.PI / 2, 1, 5));
  refs.vending.push(P.vendingMachine(B, M, H.x0 + 0.37, 3.25, Math.PI / 2, 0, 9));
  P.recycleBin(B, M, H.x0 + 0.25, 4.3, Math.PI / 2);
  refs.spots.vending = [H.x0 + 1.2, 0, 2.15];
  // 壁画（ふるさとの山）：付け柱の前に額縁ごと
  const mural = sheet(SG.mural(), { rough: 0.8 });
  B.box(M.steelDark, { x: H.x0 + 0.62, y: 5.9, z: 3, w: 0.08, h: 5.4, d: 10.6, collide: false });
  B.plane(mural, { x: H.x0 + 0.67, y: 5.9, z: 3, w: 10.2, h: 5.1, ry: Math.PI / 2 });
  refs.spots.mural = [H.x0 + 0.7, 5.9, 3];
  // 壁画の下のベンチ（絵はがき）
  P.woodBench(B, M, H.x0 + 0.75, 6.95, Math.PI / 2, 1.8);
  refs.spots.postcardBench = [H.x0 + 0.85, 0.45, 6.6];
  // 忘れ物センターの入口（枠と看板）
  const od = L.office.door;
  B.box(M.steelCream, { x: H.x0 + 0.04, y: 2.55, z: (od[0] + od[1]) / 2, w: 0.1, h: 0.12, d: od[1] - od[0] + 0.3, collide: false });
  for (const zz of od) B.box(M.steelCream, { x: H.x0 + 0.04, y: 1.25, z: zz + (zz === od[0] ? -0.06 : 0.06), w: 0.1, h: 2.5, d: 0.1, collide: false });
  P.wallSign(B, H.x0 + 0.02, 3.05, (od[0] + od[1]) / 2, Math.PI / 2, 2.6, 0.55, SG.guideSign({ w: 1024, h: 216, items: [{ icon: 'umbrella', text: '忘れ物センター', sub: 'Lost & Found' }], seed: 41 }));
  // 売店
  const K = L.kiosk;
  P.wallSign(B, K.x1 + 0.22, K.h + 0.45, (K.z0 + K.z1) / 2, Math.PI / 2, 4.6, 0.5, SG.guideSign({ w: 1024, h: 112, items: [{ icon: 'shop', text: '売店　つきみ', size: 60 }], bg: '#c8433a', seed: 43 }));
  const shutterK = P.rollShutter(B, M, K.x1 + 0.12, (K.open[0] + K.open[1]) / 2, Math.PI / 2, K.open[1] - K.open[0], 0, 2.4, { start: 1 - (2.4 - K.shutterY) / 2.4, col: true });
  add(shutterK.group);
  refs.kioskShutter = shutterK;
  kioskInside(B, M, refs);
  // 新聞の棚（売店の前）
  const F1 = P.frame(B, K.x1 + 0.45, 0, K.z0 + 0.5, Math.PI / 2);
  F1.box(M.steelDark, { x: 0, y: 0.5, z: 0, w: 0.8, h: 1.0, d: 0.3 });
  for (let i = 0; i < 3; i++) F1.box(M.paper, { x: 0, y: 0.4 + i * 0.25, z: 0.12, w: 0.7, h: 0.2, d: 0.04, collide: false, rx: 0.3 });

  officeInside(B, M, refs, rng);

  // ================================================================ コンコース：真ん中
  // 吊り下げの案内（のりば）
  const sgnPlat = SG.guideSign({ w: 1536, h: 320, items: [{ icon: 'arrowU', w: 0.5 }, { icon: 'train', iconBox: true, w: 0.55 }, { text: 'のりば　1・2番線', sub: 'Platforms 1・2', w: 2.6 }], seed: 3 });
  const sgnPlatB = SG.guideSign({ w: 1536, h: 320, items: [{ icon: 'arrowU', w: 0.5 }, { icon: 'exit', w: 0.55 }, { text: '改札口・出口', sub: 'Ticket Gates・Exit', w: 2.6 }], seed: 5, yellow: true });
  P.hangingSign(B, M, -3.5, 6.2, 3.2, 0, 4.8, 1.0, sgnPlat, { rodTop: 12.7, back: sgnPlatB });
  // 階段の上の「のりば」
  P.wallSign(B, -5, 9.0, H.z0 + 0.01, 0, 5.2, 0.85, SG.guideSign({ w: 1536, h: 252, items: [{ icon: 'train', iconBox: true, w: 0.5 }, { text: '1・2番線 のりば', sub: 'Platforms', w: 2.5 }], seed: 7 }));
  // 発車標（電気が戻ると光る）
  const dbOff = SG.departureBoard({ lit: false });
  const dbOn = SG.departureBoard({ lit: true });
  const dbFinal = SG.departureBoard({ lit: true, mode: 'final' });
  const dbMat = P.hangingSign(B, M, -5, 8.1, -0.8, 0, 3.2, 0.8, dbOff, { rodTop: 12.7 });
  dbMat.emissive = new THREE.Color(0xffffff);
  dbMat.emissiveMap = dbOn;
  dbMat.emissiveIntensity = 0;
  refs.boards.push({ mat: dbMat, off: dbOff, on: dbOn, final: dbFinal });
  // 構内図・路線図の掲示板（階段の前）
  refs.stationMapTex = null;
  P.standBoard(B, M, -10.4, 0.9, 0.45, SG.stationMapBoard((g, w, h, top) => drawPlan(g, w, h, top)), { w: 1.7, h: 1.3 });
  refs.spots.mapBoard = [-10.4, 1.2, 1.4];
  P.standBoard(B, M, -0.4, 0.6, -0.35, SG.routeMap(), { w: 1.7, h: 1.25 });
  refs.spots.routeBoard = [-0.4, 1.2, 1.1];
  // 大階段の手すり（真ん中と、腰壁の上）
  const S = L.mainStairs;
  for (const [x, top] of [[(S.x0 + S.x1) / 2, true], [S.x0 + 0.02, false], [S.x1 - 0.02, false]]) {
    const yOff = top ? 0 : 0.95;
    stairRail(B, M, x, S.zBottom + (top ? -0.3 : 0), 0, S.zLand0, S.top / 2, yOff, top);
    stairRail(B, M, x, S.zLand1, S.top / 2, S.zTop, S.top, yOff, top);
  }
  // 階段の上のシャッター（電気が戻ると開く）
  const shutterTop = P.rollShutter(B, M, (S.x0 + S.x1) / 2, L.corridor.shutterZ, 0, S.x1 - S.x0, S.top, L.corridor.h, { start: 0 });
  add(shutterTop.group);
  refs.platformShutter = shutterTop;
  refs.spots.shutter = [(S.x0 + S.x1) / 2, S.top + 0.5, L.corridor.shutterZ + 0.6];
  // 点字ブロック（改札 → 大階段、右の階段へ）
  // 右の階段へは、階段の手前（z = 6.6）を通す。分かれ目・角・行き止まりには点の板
  tactilePaths(B, M, [
    [[0, 15.2], [0, 6.6], [0, 6], [-5, 1.0], [-5, -0.6]],
    [[0, 6.6], [11.25, 6.6]],
    [[-5, 1.0], [-13.5, 1.0], [-13.5, 9.8], [-15.6, 9.8]],
  ], [[0, 15.2], [-5, -0.6], [11.25, 6.6], [-15.6, 9.8]]);

  // ================================================================ コンコース：東
  // 時計（柱）
  const ck = P.clock(M, 13.66, 4.1, 0, -Math.PI / 2, { r: 0.6 });
  B.box(M.steelDark, { x: 13.72, y: 4.85, z: 0, w: 0.1, h: 0.25, d: 0.08, collide: false });
  ck.set(11, 42);
  add(ck.group);
  refs.clocks.push(ck);
  refs.spots.hallClock = [13.6, 4.1, 0];
  // 椅子（背中あわせ）
  // 背中あわせの 2 列
  P.seats(B, M, 11.55, 9.4, Math.PI / 2, 5, 'navy', [2]);
  P.seats(B, M, 10.95, 9.4, -Math.PI / 2, 5, 'navy');
  P.seats(B, M, 16.9, 4.2, -Math.PI / 2, 4, 'red', [1]);
  // ロッカー（バルコニーの下）
  // ロッカー（前の面の位置で置く。奥行き 0.6m が壁の手前に収まるように）
  P.lockers(B, M, H.x1 - 0.63, -1.2, -Math.PI / 2, 7, 4);
  P.lockers(B, M, 13.4, H.z0 + 0.63, 0, 7, 4);
  // 床の格子（下は地下通路）。上を歩けて、光が透けて落ちる。影も格子の形に（customDepthMaterial）
  const grTex = SG.gratingTex();
  const grMat = sheet(grTex, { transparent: true, rough: 0.55 });
  grMat.side = THREE.DoubleSide;
  const grDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: grTex, alphaTest: 0.5, side: THREE.DoubleSide });
  for (const [x, z] of L.grates) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), grMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, -0.015, z);
    m.castShadow = true;
    m.receiveShadow = true;
    m.customDepthMaterial = grDepth;
    m.name = 'grating';
    add(m);
    for (const k of [-1, 1]) {
      B.box(M.steelDark, { x: x + k * 0.47, y: -0.01, z, w: 0.06, h: 0.03, d: 1.0, collide: false, cast: false });
      B.box(M.steelDark, { x, y: -0.01, z: z + k * 0.47, w: 0.88, h: 0.03, d: 0.06, collide: false, cast: false });
    }
    B.world.addBox({ x, y: -0.06, z, w: 0.9, h: 0.12, d: 0.9, surface: 'metal' });
  }
  // 落ちた案内板（斜めに床へ）
  const fallen = SG.guideSign({ w: 1536, h: 320, items: [{ icon: 'arrowR', w: 0.5 }, { icon: 'exit', w: 0.5 }, { text: '東口', sub: 'East Exit', w: 2 }], seed: 9 });
  const fs = sheet(fallen, { rough: 0.6 });
  const Ff = P.frame(B, 4.8, 0.42, 6.4, 0.35);
  Ff.box(M.steelDark, { x: 0, y: 0, z: 0, w: 3.4, h: 0.8, d: 0.1, rx: -1.05, collide: false });
  Ff.plane(fs, { x: 0, y: 0.051 * 0.867, z: 0.051 * 0.497, w: 3.3, h: 0.72, rx: -1.05 });
  B.world.addBox({ x: 4.8, y: 0.35, z: 6.4, w: 3.4, h: 0.7, d: 0.5, ry: 0.35 });
  // 東口（ふさがっている：瓦礫とつた）
  P.rubble(B, M, 17.2, 12.8, 2.2, 26, rng, { big: 0.6 });
  B.world.addBox({ x: 17.2, y: 1.5, z: 12.75, w: 2, h: 3, d: 3.6 });
  P.wallSign(B, H.x1 - 0.02, 3.6, 12.75, -Math.PI / 2, 2.4, 0.5, SG.guideSign({ w: 1024, h: 214, items: [{ icon: 'exit', text: '東口', sub: 'East Exit' }], yellow: true, seed: 11 }));
  // バルコニーの待合室あたり
  P.woodBench(B, M, 17.4, 6.6, -Math.PI / 2, 1.6, L.balcony.y);
  refs.spots.hatRail = [14.05, L.balcony.y + 1.05, 8.2];
  // 窓（z 1.5〜4 のあいだ）の枠にかからないように、窓と窓のあいだの壁に
  P.wallSign(B, H.x1 - 0.02, L.balcony.y + 2.3, 2.75, -Math.PI / 2, 2.0, 0.42, SG.guideSign({ w: 1024, h: 214, items: [{ icon: 'waiting', text: '待合室', sub: 'Waiting Room' }], seed: 13 }));
  P.vendingMachine(B, M, H.x1 - 0.42, -8.5, -Math.PI / 2, 1, 21);

  // ================================================================ 改札・駅務室・南
  P.ticketGates(B, M, L.gates.z, L.gates.x0, L.gates.x1, [true, false, true, true, false, true, true]);
  P.wallSign(B, 0, 3.75, H.z1 - 0.01, Math.PI, 7, 0.9, SG.guideSign({ w: 1536, h: 198, items: [{ icon: 'ticket', text: '改札口', sub: 'Ticket Gates', w: 1.2 }, { icon: 'exit', text: '出口', sub: 'Exit', w: 1 }], seed: 15 }));
  refs.spots.gates = [0, 0.6, 15.2];
  stationOffice(B, M, refs, add);
  // 南の壁のポスター
  P.wallSign(B, -9, 1.9, H.z1 - 0.01, Math.PI, 0.9, 1.27, SG.poster({ kind: 'sea', seed: 51 }));
  P.wallSign(B, -11, 1.9, H.z1 - 0.01, Math.PI, 0.9, 1.27, SG.poster({ kind: 'festival', seed: 53 }));
  refs.spots.posterSea = [-9, 1.5, H.z1 - 0.6];
  P.wallSign(B, H.x0 + 0.02, 1.9, -1.5, Math.PI / 2, 0.9, 1.27, SG.poster({ kind: 'cat', seed: 55 }));
  refs.spots.posterCat = [H.x0 + 0.6, 1.5, -1.5];
  P.wallSign(B, H.x1 - 0.02, 1.9, 9.0, -Math.PI / 2, 0.9, 1.27, SG.poster({ kind: 'safety', seed: 57 }));

  // ================================================================ 入口ホール
  const E = L.entrance;
  refs.tickets = P.ticketMachines(B, M, -9.5, E.z0 + 1.02, 0, 4);
  P.wallSign(B, -8.1, 2.55, E.z0 + 0.42 + 0.01, 0, 3.8, 1.2, SG.fareChart());
  P.wallSign(B, -8.1, 3.45, E.z0 + 0.43, 0, 3.8, 0.45, SG.guideSign({ w: 1024, h: 120, items: [{ icon: 'ticket', text: 'きっぷうりば　Tickets', size: 56 }], seed: 17 }));
  refs.spots.ticketMachine = [-8.55, 1.0, E.z0 + 1.6];
  // 地下通路の入口
  const U = L.underStairs;
  P.hangingSign(B, M, (U.x0 + U.x1) / 2, 3.1, U.zTop + 0.5, Math.PI, 3.2, 0.62, SG.guideSign({ w: 1024, h: 198, items: [{ icon: 'stairsDown', text: '地下通路', sub: 'Underground Passage' }], seed: 19 }), { rodTop: E.h });
  P.wallSign(B, U.x1 + 0.21, 0.6, (U.zTop + U.zBottom) / 2, Math.PI / 2, 2.2, 0.5, SG.guideSign({ w: 1024, h: 232, items: [{ icon: 'stairsDown', text: '地下通路', sub: 'Underground' }], seed: 21 }));
  // 入口の扉（割れたガラス）
  const [d0, d1] = E.doors;
  for (let i = 0; i < 4; i++) {
    const x = d0 + (i + 0.5) * (d1 - d0) / 4;
    B.box(M.steelCream, { x, y: 1.5, z: E.z1 + 0.05, w: 0.08, h: 3, d: 0.12, collide: false });
    if (i !== 1) B.plane(M.glass, { x: x + 0.75, y: 1.45, z: E.z1 + 0.05, w: 1.4, h: 2.8 });
  }
  for (const x of [d0, d1]) B.box(M.steelCream, { x, y: 1.5, z: E.z1 + 0.05, w: 0.12, h: 3, d: 0.14, collide: false });
  B.box(M.steelCream, { x: (d0 + d1) / 2, y: 3.0, z: E.z1 + 0.05, w: d1 - d0, h: 0.12, d: 0.14, collide: false });
  // 公衆電話（ピンク）と台
  const Fp = P.frame(B, E.x1 - 0.35, 0, 20.5, -Math.PI / 2);
  Fp.box(M.wood, { x: 0, y: 0.9, z: 0, w: 0.9, h: 0.05, d: 0.5 });
  Fp.box(M.steelCream, { x: 0, y: 0.45, z: -0.05, w: 0.85, h: 0.9, d: 0.4 });
  Fp.box(M.plasticRed, { x: 0, y: 1.08, z: 0.02, w: 0.32, h: 0.3, d: 0.25, collide: false });
  Fp.box(M.plasticRed, { x: 0.05, y: 1.25, z: 0.04, w: 0.25, h: 0.06, d: 0.1, collide: false, rz: 0.05 });
  P.wallSign(B, E.x1 - 0.02, 1.9, 20.5, -Math.PI / 2, 0.7, 0.32, SG.guideSign({ w: 512, h: 232, items: [{ icon: 'phone', text: '電話', size: 90 }], seed: 23 }));
  refs.spots.phone = [E.x1 - 0.9, 1.0, 20.5];
  P.seats(B, M, E.x1 - 0.5, 24, -Math.PI / 2, 4, 'cream');
  P.wallSign(B, E.x0 + 0.02, 1.9, 22, Math.PI / 2, 0.9, 1.27, SG.poster({ kind: 'notice', seed: 59 }));
  refs.spots.notice = [E.x0 + 0.6, 1.5, 22];
  // 天井の照明
  for (let x = -12; x <= 14; x += 6.5) for (const z of [19, 25]) P.tubeLight(B, M, x, E.h, z, 0, tubeOff, 1.2);

  // ================================================================ 地下通路
  underground(B, M, refs, add, tubeOff, rng);
  alley(B, M, refs, add, tubeOff, rand(5151));

  // ================================================================ ホーム
  platformProps(B, M, refs, add, rng);

  // ================================================================ 外（駅前広場）
  plaza(B, M, refs, rng);

  // ================================================================ 屋根まわり・天井の照明
  for (const z of [-6, 6]) for (const x of [-10, -2, 6]) P.pendant(B, M, x, H.roof - 0.4, z, 3.6, (x + z) % 4 === 0);
  // 北の壁の高窓：ガラスと枠
  for (const [a, b] of [[-14, -9.5], [-0.5, 4], [6, 10.5], [12.5, 17]]) windowFrame(B, M, 'z', H.z0 + 0.0, a, b, 9.3, 12, [0.4, 0.2, 0.7, 0.15][Math.abs(Math.round(a)) % 4]);
  for (const [a, b] of [[-10.5, -6.5], [-3, 1.5], [4, 8.5]]) windowFrame(B, M, 'x', H.x1 + 0.0, a, b, 7, 11.5, 0.5);
  for (const [a, b] of [[-12, -7], [8, 13]]) windowFrame(B, M, 'z', H.z1 + 0.0, a, b, 8.5, 11.5, 0.3);
  // 北の壁のキャットウォーク（見るだけ）
  B.box(M.steelDark, { x: 1, y: 8.8, z: H.z0 + 0.6, w: 33, h: 0.08, d: 1.0, collide: false });
  B.railing(M.steel, { x0: H.x0 + 0.6, z0: H.z0 + 1.08, x1: H.x1 - 0.6, z1: H.z0 + 1.08, y: 8.84, h: 0.95, gap: 2.0, collide: false });
  for (let x = -14; x <= 16; x += 4) B.box(M.steelDark, { x, y: 8.55, z: H.z0 + 0.6, w: 0.08, h: 0.5, d: 1.0, rx: 0, collide: false });

  // ================================================================ 床のしみ・苔・落ち葉
  const stain = new THREE.MeshStandardMaterial({ map: blotch({ kind: 'stain', seed: 7 }), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  patch(stain, {});
  for (let i = 0; i < 46; i++) {
    const x = H.x0 + 1 + rng() * (H.x1 - H.x0 - 2), z = H.z0 + 1 + rng() * (H.z1 - H.z0 - 2);
    const w = 1 + rng() * 3.2, d = 1 + rng() * 3.2, ry = rng() * 6;
    if (inPit(x, z, Math.hypot(w, d) / 2) || onGrate(x, z, Math.hypot(w, d) / 2)) continue;     // 床の穴・格子にかかるもの
    B.decal(stain, { x, y: 0, z, w, d, ry, lift: 0.004 + i * 0.0001 });
  }
  for (let i = 0; i < 30; i++) {
    // 壁ぎわの苔
    const side = i % 4;
    const t = rng();
    const x = side === 0 ? H.x0 + 0.8 : side === 1 ? H.x1 - 0.8 : H.x0 + 1 + t * (H.x1 - H.x0 - 2);
    const z = side === 2 ? H.z0 + 0.8 : side === 3 ? H.z1 - 0.8 : H.z0 + 1 + t * (H.z1 - H.z0 - 2);
    B.decal(M.moss, { x, y: 0, z, w: 1.2 + rng() * 2.5, d: 0.8 + rng() * 1.6, ry: rng() * 6, lift: 0.008 + i * 0.0001 });
  }
  const leaf = leafMaterial();
  const offPit = (x, z) => inPit(x, z, 0.15) || onGrate(x, z, 0.1);
  P.litter(B, leaf, -6, 4, 6, 70, rng, 0, offPit);
  P.litter(B, leaf, 8, 2, 5, 40, rng);
  P.litter(B, leaf, 4, -8, 4, 40, rng);
  P.litter(B, leaf, -12, 12, 3, 30, rng, 0, offPit);
  // 瓦礫（屋根の穴の下、壁ぎわ）
  P.rubble(B, M, -14.5, -3.5, 1.4, 16, rng);
  P.rubble(B, M, 6, -9, 2.2, 22, rng, { big: 0.45 });
  P.rubble(B, M, -0.6, 13.6, 1.0, 10, rng);
  P.rubble(B, M, 15.5, -9.5, 1.5, 12, rng);
  P.rubble(B, M, -10.2, 14.2, 1.4, 14, rng, { skip: (x, z) => inPit(x, z, 0.5) });
  refs.leafMat = leaf;
  return refs;
}

// ---------------------------------------------------------------- 部分ごと
/** 腰壁（壁の面 face から部屋の側 inward へ少し出す）。gaps は抜くところ。 */
function wainscot(B, mat, trim, axis, face, a0, a1, h, gaps = [], inward = 1) {
  const pieces = [];
  let cur = a0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) pieces.push([cur, g0]); cur = Math.max(cur, g1); }
  if (cur < a1) pieces.push([cur, a1]);
  for (const [p0, p1] of pieces) {
    const c = face + inward * 0.02, ct = face + inward * 0.045;
    if (axis === 'x') {
      B.box(mat, { x: c, y: h / 2, z: (p0 + p1) / 2, w: 0.04, h, d: p1 - p0, collide: false });
      B.box(trim, { x: ct, y: h + 0.02, z: (p0 + p1) / 2, w: 0.04, h: 0.05, d: p1 - p0, collide: false });
    } else {
      B.box(mat, { x: (p0 + p1) / 2, y: h / 2, z: c, w: p1 - p0, h, d: 0.04, collide: false });
      B.box(trim, { x: (p0 + p1) / 2, y: h + 0.02, z: ct, w: p1 - p0, h: 0.05, d: 0.04, collide: false });
    }
  }
}

function stairRail(B, M, x, z0, y0, z1, y1, yOff, center) {
  const h = 0.85;
  P.rod(B, M.chrome, [x, y0 + yOff + h, z0], [x, y1 + yOff + h, z1], 0.025, 8);
  const n = Math.max(2, Math.round(Math.abs(z1 - z0) / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const yy = y0 + (y1 - y0) * t + yOff;
    B.cyl(M.chrome, { x, y: yy + h / 2, z: z0 + (z1 - z0) * t, r: 0.02, h, seg: 6, cast: false });
  }
  if (center) {
    // 真ん中の手すりは当たりにする（階段を左右に分ける）。z0 > z1（北へのぼる）なので、ローカル -z（北）が高い
    B.world.addRamp({ x, z: (z0 + z1) / 2, w: 0.12, d: Math.abs(z1 - z0), y0: Math.max(y0, y1) + 1.2, y1: Math.min(y0, y1) + 1.2, base: Math.min(y0, y1) - 0.2, cam: false });
  }
}

/**
 * 点字ブロック。線（誘導）の板は、分かれ目・角・行き止まりの点（警告）の板の下で止める。
 * 線どうしを重ねると、同じ高さの面がちらつくので。点の板は線より 8mm 高い（遠くから見てもちらつかないように）。
 * paths：折れ線の並び（同じ座標の点はつながっているとみなす）、ends：点の板を置く行き止まり。
 */
function tactilePaths(B, M, paths, ends = []) {
  const W = 0.3, S = 0.3;                // 線の幅、点の板の半分の大きさ（0.6m 四方）
  const key = (p) => `${p[0]},${p[1]}`;
  const deg = new Map();
  for (const pts of paths) pts.forEach((p, i) => deg.set(key(p), (deg.get(key(p)) || 0) + (i > 0) + (i < pts.length - 1)));
  const dots = new Map();
  for (const pts of paths) for (const p of pts) if (deg.get(key(p)) >= 2) dots.set(key(p), p);
  for (const p of ends) dots.set(key(p), p);
  for (const pts of paths) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = Math.abs(x1 - x0) / len, uz = Math.abs(z1 - z0) / len;
      // 点の板の中で止める長さ（斜めでも、線の角が点の板からはみ出さないように）。点の板がなければ少しのばす
      const inDot = Math.min(ux > 1e-6 ? (S - (W / 2) * uz) / ux : Infinity, uz > 1e-6 ? (S - (W / 2) * ux) / uz : Infinity) - 0.02;
      const a = dots.has(key(pts[i])) ? inDot : -W / 2, b = dots.has(key(pts[i + 1])) ? inDot : -W / 2;
      if (len - a - b < 0.25) continue;     // 点の板どうしのあいだが短い所は、線を引かない
      const t0 = a / len, t1 = 1 - b / len;
      const cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = z0 + (z1 - z0) * (t0 + t1) / 2;
      B.box(M.tactileLine, { x: cx, y: 0.006, z: cz, w: W, h: 0.012, d: len - a - b, ry: Math.atan2(x1 - x0, z1 - z0), collide: false, cast: false, uv: 1 });
    }
  }
  for (const [x, z] of dots.values()) B.box(M.tactileDot, { x, y: 0.011, z, w: S * 2, h: 0.018, d: S * 2, collide: false, cast: false });
}

function windowFrame(B, M, axis, c, a, b, y0, y1, broken) {
  const mids = 3;
  for (let i = 0; i <= mids; i++) {
    const t = a + (b - a) * (i / mids);
    if (axis === 'z') B.box(M.steelDark, { x: t, y: (y0 + y1) / 2, z: c, w: 0.08, h: y1 - y0, d: 0.12, collide: false });
    else B.box(M.steelDark, { x: c, y: (y0 + y1) / 2, z: t, w: 0.12, h: y1 - y0, d: 0.08, collide: false });
  }
  for (const y of [y0, (y0 + y1) / 2, y1]) {
    if (axis === 'z') B.box(M.steelDark, { x: (a + b) / 2, y, z: c, w: b - a, h: 0.08, d: 0.12, collide: false });
    else B.box(M.steelDark, { x: c, y, z: (a + b) / 2, w: 0.12, h: 0.08, d: b - a, collide: false });
  }
  // ガラス（割れて抜けた枠もある）
  for (let i = 0; i < mids; i++) for (let j = 0; j < 2; j++) {
    if (((i * 7 + j * 3 + Math.round(a)) % 10) / 10 < broken) continue;
    const t0 = a + (b - a) * (i / mids), t1 = a + (b - a) * ((i + 1) / mids);
    const ya = y0 + (y1 - y0) * (j / 2), yb = y0 + (y1 - y0) * ((j + 1) / 2);
    if (axis === 'z') B.plane(M.glass, { x: (t0 + t1) / 2, y: (ya + yb) / 2, z: c, w: t1 - t0, h: yb - ya });
    else B.plane(M.glass, { x: c, y: (ya + yb) / 2, z: (t0 + t1) / 2, w: t1 - t0, h: yb - ya, ry: Math.PI / 2 });
  }
}

function leafMaterial() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(32, 2); g.bezierCurveTo(58, 18, 54, 50, 32, 62); g.bezierCurveTo(10, 50, 6, 18, 32, 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.MeshStandardMaterial({ map: t, color: 0x8a6a3a, alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>');
  };
  return patch(m, {});
}

/** 構内図（掲示板とゲームの地図で同じ形）。 */
export function drawPlan(g, w, h, top = 0, { zoom = false } = {}) {
  // ワールド x[-26, 28], z[-42, 30] を板に（手帳では駅のまわりだけ大きく）
  const X0 = zoom ? -25 : -26, X1 = zoom ? 21 : 28, Z0 = zoom ? -30 : -42, Z1 = zoom ? 29 : 30;
  const sx = (w - 60) / (X1 - X0), sz = (h - top - 40) / (Z1 - Z0);
  const s = Math.min(sx, sz);
  const fs = zoom ? 1.7 : 1;
  const ox = (w - (X1 - X0) * s) / 2, oz = top + 20;
  const R = (x0, x1, z0, z1, fill, stroke = null) => {
    g.fillStyle = fill;
    g.fillRect(ox + (x0 - X0) * s, oz + (z0 - Z0) * s, (x1 - x0) * s, (z1 - z0) * s);
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.strokeRect(ox + (x0 - X0) * s, oz + (z0 - Z0) * s, (x1 - x0) * s, (z1 - z0) * s); }
  };
  const T = (txt, x, z, size = 15, col = '#223') => { g.fillStyle = col; g.font = `bold ${Math.round(size * fs)}px ${'"Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, ox + (x - X0) * s, oz + (z - Z0) * s); };
  R(-26, 28, -41, -35, '#c9c2b4');
  R(-26, 28, -35, -29, '#d8d4ca', '#998');
  R(-26, 28, -29, -24, '#c9c2b4');
  R(-26, 28, -24, -12.4, '#e6e1d4', '#776');
  R(L.hall.x0, L.hall.x1, L.hall.z0, L.hall.z1, '#f4f1e8', '#556');
  R(L.office.x0, L.office.x1, L.office.z0, L.office.z1, '#f6e8c8', '#556');
  R(L.kiosk.x0, L.kiosk.x1, L.kiosk.z0, L.kiosk.z1, '#f3d0c8', '#556');
  R(L.stationOffice.x0, L.stationOffice.x1, L.stationOffice.z0, L.stationOffice.z1, '#d8e4f0', '#556');
  R(L.entrance.x0, L.entrance.x1, L.entrance.z0, L.entrance.z1, '#efece2', '#556');
  R(L.mainStairs.x0, L.mainStairs.x1, L.mainStairs.zTop, L.mainStairs.zBottom, '#cfd8e2', '#556');
  R(L.rightStairs.x0, L.rightStairs.x1, L.rightStairs.zTop, L.rightStairs.zBottom, '#cfd8e2', '#556');
  R(L.underStairs.x0, L.underStairs.x1, L.underStairs.zBottom, L.underStairs.zTop, '#cfd8e2', '#556');
  R(L.gates.x0, L.gates.x1, L.gates.z - 0.4, L.gates.z + 0.4, '#2a6cb0');
  for (const [x0, x1, z0, z1] of L.pit) R(x0, x1, z0, z1, '#8a8274');
  T('くずれた床', (L.pit[0][0] + L.pit[0][1]) / 2, (L.pit[0][2] + L.pit[0][3]) / 2, 11, '#fff');
  T('1番線', 0, -26.5, 16, '#555');
  T('ホーム', -14, -18, 18);
  T('コンコース', 1, 6, 20);
  T('忘れ物センター', -20, 10, 12);
  T('売店', -13.3, -8.5, 13);
  T('駅務室', 9.5, 13.5, 13);
  T('改札', 0, 14.6, 13, '#fff');
  T('入口ホール', 3, 23, 15);
  T('地下通路↓', -13.5, 22, 12);
  return (x, z) => [ox + (x - X0) * s, oz + (z - Z0) * s];
}

function officeInside(B, M, refs, rng) {
  const O = L.office;
  // カウンター（北側。上に台帳）
  B.box(M.wood, { x: -18.3, y: 0.98, z: 7.6, w: 0.7, h: 0.05, d: 2.6 });
  B.box(M.plasticCream, { x: -18.3, y: 0.48, z: 7.6, w: 0.6, h: 0.96, d: 2.5 });
  B.box(M.paper, { x: -18.3, y: 1.02, z: 7.9, w: 0.34, h: 0.03, d: 0.26, collide: false, ry: 0.15 });      // 台帳
  B.box(M.plasticRed, { x: -18.3, y: 1.012, z: 7.9, w: 0.36, h: 0.012, d: 0.28, collide: false, ry: 0.15 });
  refs.spots.ledger = [-18.3, 1.0, 7.9];
  P.wallSign(B, -18.3, 1.35, 6.32, 0, 0.9, 0.24, SG.smallLabel('お忘れ物　受付', { w: 512, h: 128, bg: '#f2efe6', seed: 81 }));
  // 棚（西の壁）と、札のついた忘れ物
  for (let k = 0; k < 3; k++) {
    const z = 7.3 + k * 2.3;
    for (let i = 0; i < 4; i++) B.box(M.steelCream, { x: O.x0 + 0.35, y: 0.25 + i * 0.6, z, w: 0.55, h: 0.03, d: 2.0, collide: false });
    for (const dz of [-0.98, 0.98]) B.box(M.steelCream, { x: O.x0 + 0.35, y: 1.1, z: z + dz, w: 0.55, h: 2.2, d: 0.04 });
    B.world.addBox({ x: O.x0 + 0.35, y: 1.1, z, w: 0.6, h: 2.2, d: 2.0 });
    const things = [M.cardboard, M.plasticNavy, M.plasticRed, M.plasticCream, M.leatherish || M.cardboard, M.wood];
    for (let i = 0; i < 4; i++) for (let n = 0; n < 5; n++) {
      if (rng() < 0.25) continue;
      const w = 0.18 + rng() * 0.25, h = 0.12 + rng() * 0.3;
      B.box(things[(i + n + k) % things.length], { x: O.x0 + 0.35, y: 0.27 + i * 0.6 + h / 2, z: z - 0.8 + n * 0.4, w, h, d: 0.22 + rng() * 0.12, collide: false, ry: rng() * 0.5 - 0.25 });
      B.box(M.paper, { x: O.x0 + 0.62, y: 0.3 + i * 0.6 + 0.05, z: z - 0.8 + n * 0.4, w: 0.01, h: 0.06, d: 0.04, collide: false });
    }
  }
  refs.spots.shelf = [O.x0 + 0.8, 1.0, 9.6];
  // 傘立て（傘がいっぱい）
  B.cyl(M.steelDark, { x: -23.2, y: 0.3, z: 13.2, r: 0.28, h: 0.6, seg: 16, open: true, collide: true });
  const ucol = [M.plasticNavy, M.plasticRed, M.plasticCream, M.dark, M.plasticGreen];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 6.28;
    B.cyl(ucol[i % ucol.length], { x: -23.2 + Math.cos(a) * 0.14, y: 0.55, z: 13.2 + Math.sin(a) * 0.14, r: 0.03, r2: 0.012, h: 0.95, seg: 6, rx: Math.sin(a) * 0.15, rz: Math.cos(a) * 0.15 });
  }
  refs.spots.umbrellas = [-23.2, 0.8, 13.2];
  // 机（窓の下。ランタンが置いてある）
  B.box(M.wood, { x: -20.4, y: 0.74, z: 13.55, w: 1.4, h: 0.04, d: 0.6 });
  for (const [dx, dz] of [[-0.65, -0.25], [0.65, -0.25], [-0.65, 0.25], [0.65, 0.25]]) B.box(M.steelDark, { x: -20.4 + dx, y: 0.36, z: 13.55 + dz, w: 0.04, h: 0.72, d: 0.04, collide: false });
  B.world.addBox({ x: -20.4, y: 0.38, z: 13.55, w: 1.4, h: 0.76, d: 0.6 });
  refs.spots.deskLantern = [-20.1, 0.76, 13.45];
  // トモの充電台（日の光の当たる所）
  B.box(M.steelCream, { x: -22.5, y: 0.02, z: 9.55, w: 0.9, h: 0.04, d: 0.9, collide: false });
  B.box(M.steelCream, { x: -23.05, y: 0.5, z: 9.55, w: 0.08, h: 1.0, d: 0.7, collide: false });
  B.box(M.dark, { x: -23.0, y: 0.75, z: 9.55, w: 0.04, h: 0.12, d: 0.3, collide: false });
  B.cyl(M.dark, { x: -23.03, y: 0.25, z: 9.9, r: 0.02, h: 0.5, seg: 6 });
  refs.spots.dock = [-22.5, 0.4, 9.55];
  // 壁の時計（止まっている）・ポスター・段ボール
  const ck = P.clock(M, -20.5, 2.5, O.z0 + 0.03, 0, { r: 0.22, small: true });
  ck.set(11, 42);
  refs.clocks.push(ck);
  refs.dynamic.push(ck.group);
  B.object(ck.group);
  P.wallSign(B, -23.97, 1.7, 11.5, Math.PI / 2, 0.6, 0.85, SG.poster({ kind: 'notice', seed: 83 }));
  // 段ボール（床に置いたもの・2 段に積んだもの）
  for (const [x, y, z, w, h, d, ry, col] of [
    [-17.45, 0, 12.75, 0.5, 0.4, 0.4, 0.1, true], [-17.42, 0.4, 12.78, 0.42, 0.34, 0.36, -0.12, false],
    [-18.1, 0, 12.9, 0.5, 0.4, 0.4, 0.45, true], [-17.75, 0, 13.45, 0.45, 0.3, 0.35, -0.25, true], [-18.6, 0, 13.5, 0.4, 0.24, 0.3, 0.9, false],
  ]) B.box(M.cardboard, { x, y: y + h / 2, z, w, h, d, ry, collide: col });
  P.rubble(B, M, -21.0, 8.3, 0.8, 12, rng, { mats: [M.ceiling, M.concreteDark] });
  // 腰壁（クリーム色のタイル）
  wainscot(B, M.mosaic, M.steelDark, 'z', O.z1, O.x0, O.x1 - 0.21, 1.1, [[-22.7, -18.3]], -1);
  wainscot(B, M.mosaic, M.steelDark, 'z', O.z0, O.x0, O.x1 - 0.21, 1.1, [], 1);
  // コート掛け（帽子とマフラー）
  B.cyl(M.steelDark, { x: -17.0, y: 0.9, z: 13.4, r: 0.02, h: 1.8, seg: 6 });
  B.cyl(M.steelDark, { x: -17.0, y: 0.02, z: 13.4, r: 0.22, h: 0.04, seg: 12 });
  B.cyl(M.plasticRed, { x: -17.0, y: 1.55, z: 13.4, r: 0.07, h: 0.5, seg: 8 });
  B.cyl(M.cardboard, { x: -17.0, y: 1.84, z: 13.4, r: 0.16, r2: 0.12, h: 0.1, seg: 14 });
  // かばんと紙袋（床）、札つき
  for (const [x, z, w, h, d, mat] of [[-23.3, 7.2, 0.45, 0.32, 0.22, M.plasticNavy], [-23.2, 12.0, 0.36, 0.42, 0.18, M.cardboard], [-22.8, 12.5, 0.5, 0.28, 0.3, M.plasticRed]]) {
    B.box(mat, { x, y: h / 2, z, w, h, d, ry: rng() * 0.8, collide: true });
    B.box(M.paper, { x: x + 0.1, y: h + 0.02, z, w: 0.06, h: 0.005, d: 0.04, collide: false });
  }
  // 掲示板（ピンでとめた紙）
  B.box(M.wood, { x: -19.0, y: 1.75, z: O.z0 + 0.04, w: 1.4, h: 0.9, d: 0.04, collide: false });
  for (let i = 0; i < 6; i++) B.box(M.paper, { x: -19.5 + (i % 3) * 0.45, y: 1.95 - Math.floor(i / 3) * 0.4, z: O.z0 + 0.065, w: 0.3, h: 0.32, d: 0.005, rz: (rng() - 0.5) * 0.2, collide: false });
}

function kioskInside(B, M, refs) {
  const K = L.kiosk;
  // 棚（奥の壁）・冷蔵ケース・カウンター
  for (let i = 0; i < 4; i++) B.box(M.steelCream, { x: K.x0 + 0.35, y: 0.3 + i * 0.45, z: (K.z0 + K.z1) / 2, w: 0.5, h: 0.04, d: 4.2, collide: false });
  B.box(M.steelCream, { x: K.x0 + 0.62, y: 1.0, z: (K.z0 + K.z1) / 2, w: 0.04, h: 2.0, d: 4.2 });
  const rr = rand(77);
  const snack = [M.plasticRed, M.plasticNavy, M.plasticCream, M.cardboard];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 14; k++) {
    if (rr() < 0.35) continue;
    B.box(snack[(i + k) % 4], { x: K.x0 + 0.35, y: 0.38 + i * 0.45, z: K.z0 + 0.6 + k * 0.28, w: 0.3, h: 0.12 + rr() * 0.1, d: 0.2, collide: false, ry: rr() * 0.4 - 0.2 });
  }
  // 冷蔵ケース（北の壁）
  // 冷蔵ケース（前が開いた箱＋ガラス）
  const kx = (K.x0 + K.x1) / 2;
  B.box(M.steelCream, { x: kx, y: 0.95, z: K.z0 + 0.08, w: 2.2, h: 1.9, d: 0.06, collide: false });
  for (const sx of [-1.08, 1.08]) B.box(M.steelCream, { x: kx + sx, y: 0.95, z: K.z0 + 0.36, w: 0.05, h: 1.9, d: 0.6, collide: false });
  B.box(M.steelCream, { x: kx, y: 1.88, z: K.z0 + 0.36, w: 2.2, h: 0.06, d: 0.6, collide: false });
  B.box(M.steelCream, { x: kx, y: 0.17, z: K.z0 + 0.36, w: 2.2, h: 0.34, d: 0.6, collide: false });
  for (let i = 0; i < 3; i++) B.box(M.chrome, { x: kx, y: 0.34 + i * 0.5, z: K.z0 + 0.36, w: 2.1, h: 0.015, d: 0.52, collide: false, cast: false });
  B.world.addBox({ x: kx, y: 0.95, z: K.z0 + 0.36, w: 2.2, h: 1.9, d: 0.6 });
  B.plane(M.glassClean, { x: kx, y: 1.05, z: K.z0 + 0.67, w: 2.1, h: 1.6 });
  for (let i = 0; i < 3; i++) for (let k = 0; k < 8; k++) {
    if (rr() < 0.4) continue;
    B.cyl(snack[k % 3], { x: (K.x0 + K.x1) / 2 - 0.85 + k * 0.24, y: 0.45 + i * 0.5, z: K.z0 + 0.45, r: 0.035, h: 0.2, seg: 8 });
  }
  // カウンター（シャッターの内側）
  B.box(M.plasticCream, { x: K.x1 - 0.55, y: 0.48, z: K.z0 + 1.6, w: 0.6, h: 0.96, d: 1.8 });
  B.box(M.wood, { x: K.x1 - 0.55, y: 0.98, z: K.z0 + 1.6, w: 0.7, h: 0.04, d: 1.9, collide: false });
  B.box(M.dark, { x: K.x1 - 0.6, y: 1.1, z: K.z0 + 1.2, w: 0.35, h: 0.2, d: 0.35, collide: false, ry: 0.3 });
  refs.spots.kioskCounter = [K.x1 - 0.55, 1.05, K.z0 + 2.15];
  // レジ
  B.box(M.plasticCream, { x: K.x1 - 0.62, y: 1.1, z: K.z0 + 1.15, w: 0.32, h: 0.2, d: 0.3, collide: false, ry: 0.2 });
  B.box(M.dark, { x: K.x1 - 0.62, y: 1.25, z: K.z0 + 1.1, w: 0.2, h: 0.08, d: 0.03, collide: false, ry: 0.2, rx: -0.4 });
  // 雑誌の棚（南の壁）
  const mag = sheet(SG.magazineRack({ seed: 91 }), { rough: 0.7 });
  B.box(M.steelCream, { x: (K.x0 + K.x1) / 2 - 0.4, y: 0.75, z: K.z1 - 0.2, w: 2.0, h: 1.5, d: 0.3 });
  B.plane(mag, { x: (K.x0 + K.x1) / 2 - 0.4, y: 0.95, z: K.z1 - 0.36, w: 1.9, h: 0.95, ry: Math.PI, rx: 0.12 });
  // 「ラムネ」のポスター（中）と、外の黒板
  P.wallSign(B, K.x0 + 0.66, 1.9, K.z0 + 2.4, Math.PI / 2, 0.7, 0.98, SG.poster({ kind: 'sea', seed: 93 }));
  const cb = sheet(SG.chalkboard([['ラムネ', 64, '#bfe8ff'], ['ひえてます', 44], ['', 20], ['ビー玉つき', 38, '#ffe08a']]), { rough: 0.9 });
  // A 型の立て看板：上でつながった 2 枚の板が、下で前（黒板）と後ろ（脚）に開く
  const cry = Math.PI / 2 + 0.35;
  const Fc = P.frame(B, K.x1 + 0.75, 0, K.z1 - 0.15, cry);
  const ca = 0.2, clen = 0.85, chalf = clen / 2, ctop = clen * Math.cos(ca) + 0.005;
  const cy = ctop - chalf * Math.cos(ca), cz = chalf * Math.sin(ca);
  Fc.box(M.wood, { x: 0, y: cy, z: cz, w: 0.6, h: clen, d: 0.04, rx: -ca, collide: false });
  Fc.plane(cb, { x: 0, y: cy + 0.023 * Math.sin(ca), z: cz + 0.023 * Math.cos(ca), w: 0.54, h: 0.72, rx: -ca });
  Fc.box(M.wood, { x: 0, y: cy, z: -cz, w: 0.6, h: clen, d: 0.04, rx: ca, collide: false });
  Fc.box(M.steelDark, { x: 0, y: ctop - 0.012, z: 0, w: 0.63, h: 0.03, d: 0.05, collide: false });   // 上のつなぎ目
  const [cbx, , cbz] = Fc.P(0, 0, 0);
  B.world.addBox({ x: cbx, y: 0.45, z: cbz, w: 0.62, h: 0.9, d: 0.36, ry: cry, cam: false });
  // 外のひさし（赤白のしま）
  // 付け根はシャッターの巻き取り箱の上（箱を突き抜けないように）
  for (let i = 0; i < 6; i++) B.box(i % 2 ? M.plasticCream : M.plasticRed, { x: K.x1 + 0.675, y: 2.86 - 0.375 * Math.tan(0.35), z: K.z0 + 0.415 + i * 0.83, w: 0.8, h: 0.04, d: 0.83, rz: -0.35, collide: false });
}

function stationOffice(B, M, refs, add) {
  const SO = L.stationOffice;
  // 扉
  const door = P.swingDoor(B, M, (SO.door[0] + SO.door[1]) / 2, SO.z0 - 0.15, Math.PI, SO.door[1] - SO.door[0], 2.15, null, { hinge: 1 });
  add(door.pivot);
  refs.officeDoor = door;
  P.wallSign(B, (SO.door[0] + SO.door[1]) / 2, 2.55, SO.z0 - 0.31, Math.PI, 1.6, 0.36, SG.guideSign({ w: 1024, h: 230, items: [{ text: '駅務室', sub: 'Station Office' }], seed: 25 }));
  // 窓（改札側）
  B.plane(M.glass, { x: SO.x0 - 0.15, y: 1.6, z: 13.5, w: 3, h: 1.2, ry: Math.PI / 2 });
  B.box(M.wood, { x: SO.x0 - 0.35, y: 0.98, z: 13.5, w: 0.4, h: 0.05, d: 3.0, collide: false });
  // 机・椅子・棚（机は窓に向かって 2 つ）
  const rr = rand(303);
  P.desk(B, M, 8.0, 13.7, Math.PI, 1.3);
  P.desk(B, M, 10.6, 13.7, Math.PI, 1.3);
  P.officeChair(B, M, 8.1, 12.8, 0.2);
  P.officeChair(B, M, 10.8, 12.9, -0.4);
  P.crt(B, M, 7.8, 0.74, 13.85, Math.PI - 0.15);
  B.box(M.paper, { x: 10.4, y: 0.75, z: 13.55, w: 0.42, h: 0.03, d: 0.3, collide: false, ry: 0.2 });   // 駅の日誌
  B.box(M.plasticNavy, { x: 10.4, y: 0.76, z: 13.55, w: 0.2, h: 0.02, d: 0.3, collide: false, ry: 0.2 });
  B.cyl(M.plasticCream, { x: 11.0, y: 0.79, z: 13.8, r: 0.04, h: 0.1, seg: 10 });   // 湯のみ
  B.cyl(M.chrome, { x: 8.4, y: 0.83, z: 13.95, r: 0.08, r2: 0.05, h: 0.18, seg: 12 });   // やかん（机のはしから落ちないように内側へ）
  refs.spots.diary = [10.4, 0.8, 13.55];
  // 書類棚とファイル（北の壁）
  B.box(M.steelCream, { x: 11.6, y: 0.9, z: SO.z0 + 0.25, w: 1.6, h: 1.8, d: 0.4 });
  for (let i = 0; i < 3; i++) P.binders(B, M, 11.6, 0.3 + i * 0.55, SO.z0 + 0.5, Math.PI, 9, rr);
  B.box(M.steelCream, { x: SO.x1 - 0.25, y: 1.0, z: 15.2, w: 0.4, h: 2.0, d: 1.2 });  // ロッカー
  // 壁の時計（ここも止まっている）とカレンダー
  const ck2 = P.clock(M, 6.03, 2.3, 14.5, Math.PI / 2, { r: 0.18, small: true });
  ck2.set(11, 42);
  refs.clocks.push(ck2);
  add(ck2.group);
  P.wallSign(B, 6.0, 1.7, 15.45, Math.PI / 2, 0.6, 0.484, SG.calendar());
  refs.spots.calendar = [6.45, 1.5, 15.45];
  // キーボックス（東の壁）
  const kb = P.frame(B, SO.x1 - 0.02, 1.45, 12.6, -Math.PI / 2);
  kb.box(M.steelCream, { x: 0, y: 0, z: 0.06, w: 0.5, h: 0.6, d: 0.1, collide: false });
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) kb.box(M.brass, { x: -0.15 + k * 0.15, y: 0.18 - i * 0.13, z: 0.12, w: 0.025, h: 0.06, d: 0.01, collide: false, cast: false });
  refs.spots.keybox = [SO.x1 - 0.45, 1.45, 12.6];
  // 帽子掛けの駅長の帽子
  B.cyl(M.plasticNavy, { x: SO.x1 - 0.1, y: 1.85, z: 14.2, r: 0.13, h: 0.1, seg: 16, rz: Math.PI / 2 - 0.2 });
  // 時刻表
  P.wallSign(B, 9, 1.75, SO.z1 - 0.01, Math.PI, 0.7, 1.05, SG.timetable({ seed: 61 }));
  refs.spots.timetableOffice = [9, 1.4, SO.z1 - 0.6];
  // 天井の照明
  P.tubeLight(B, M, 9.5, SO.h, 13.5, 0, refs.tubeMat, 1.2);
}

/** つきみ横丁（地下通路の東の割れ目の奥）と、ホールの床の穴のまわり。 */
function alley(B, M, refs, add, tubeOff, rng) {
  const A = L.alley, R = L.ramp, D = L.under, y = A.y;
  const [d0, d1] = A.door, dz = (d0 + d1) / 2;
  // 地下通路の側：割れた壁の上の看板と、くずれたタイル
  P.wallSign(B, D.x1 - 0.01, y + 2.62, dz, -Math.PI / 2, 1.9, 0.42, SG.guideSign({ w: 1024, h: 226, items: [{ text: 'つきみ横丁', sub: 'Tsukimi Yokocho' }], bg: '#6b3a2c', fg: '#f3e6c8', seed: 39 }));
  refs.spots.alleySign = [D.x1 - 0.6, y + 1.2, dz];
  P.rubble(B, M, D.x1 - 0.1, d0 + 0.1, 0.55, 8, rng, { y, mats: [M.mosaic, M.concreteDark] });
  P.rubble(B, M, D.x1 - 0.2, d1 - 0.1, 0.5, 7, rng, { y, mats: [M.mosaic, M.concreteDark] });
  for (let i = 0; i < 6; i++) B.box(M.mosaic, { x: D.x1 + rng.range(-0.15, 0.15), y: y + 2.4 + rng.range(-0.05, 0.1), z: rng.range(d0, d1), w: 0.42, h: rng.range(0.08, 0.2), d: rng.range(0.15, 0.4), rx: rng.range(-0.3, 0.3), collide: false });
  // 店の並び（シャッターは閉まったまま）。北の壁と南の壁
  const shops = [
    { x: -9.7, side: 0, name: '喫茶　つきあかり', bg: '#3d5a4a' },
    { x: -6.6, side: 0, name: 'おもちゃ　みかづき', bg: '#7a4a6a' },
    { x: -9.3, side: 1, name: 'パン　こむぎや', bg: '#8a5a2a' },
    { x: -5.9, side: 1, name: '本と文具　しおり', bg: '#2f4a6e' },
  ];
  shops.forEach(({ x, side, name, bg }, i) => {
    const z = side === 0 ? A.z0 + 0.02 : A.z1 - 0.02, ry = side === 0 ? 0 : Math.PI;
    const sz = z + (side === 0 ? 0.04 : -0.04);
    const sh = P.rollShutter(B, M, x, sz, ry, 2.2, y, 2.25, { start: 0, col: false });
    add(sh.group);
    // 看板は巻き取り箱の前の面に
    P.wallSign(B, x, y + 2.25 + 0.2, sz + (side === 0 ? 0.18 : -0.18), ry, 2.36, 0.42, SG.smallLabel(name, { w: 1024, h: 182, bg, fg: '#f3ead2', seed: 41 + i * 2, font: JP_SERIF }));
  });
  // 閉店のお知らせ（南の壁）
  P.wallSign(B, -3.6, y + 1.5, A.z1 - 0.01, Math.PI, 0.55, 0.75, SG.poster({ kind: 'notice', seed: 49 }));
  // こわれた蛍光灯（西の端。電気が戻ってもつかない）
  P.tubeLight(B, M, -10.4, y + A.h, 9.0, 0, M.plasticCream, 1.2);
  // 板の両わきと、ふもとのがれき
  const [s0, s1] = R.slab;
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9, x = R.x0 + 0.4 + t * (R.x1 - R.x0 - 0.9), yy = y + (x - R.x0) * (-y / (R.x1 - R.x0));
    for (const z of [s0 - 0.1, s1 + 0.1]) P.rubble(B, M, x, z, 0.35, 3, rng, { y: yy - 0.15, big: 0.3 });
  }
  P.rubble(B, M, R.x0 + 0.1, (s0 + s1) / 2, 1.1, 14, rng, { y, big: 0.4 });
  P.rubble(B, M, R.x1 - 0.6, A.z0 + 0.5, 0.7, 9, rng, { y, big: 0.45 });
  P.rubble(B, M, R.x1 - 0.6, A.z1 - 0.5, 0.8, 10, rng, { y, big: 0.45 });
  // 落ちてきた床のかけら（ホールのタイル）
  for (const [x, z, ry] of [[-10.3, 9.0, 0.4], [-4.0, 13.2, -0.3], [-7.6, 13.4, 1.1]]) B.box(M.floor, { x, y: y + 0.12, z, w: rng.range(0.6, 0.9), h: 0.22, d: rng.range(0.4, 0.7), ry, rx: rng.range(-0.15, 0.15), rz: rng.range(-0.2, 0.2), collide: false });
  // 穴のふちの鉄筋（下に曲がって垂れる）
  const rebar = (x, z, dx, dz) => {
    for (let k = 0; k < 2; k++) {
      const l = rng.range(0.3, 0.7), a = rng.range(0.6, 1.2);
      B.cyl(M.steelDark, { x: x + dx * l * 0.5 * Math.cos(a) + rng.range(-0.1, 0.1), y: -0.5 - l * 0.5 * Math.sin(a) - k * 0.35, z: z + dz * l * 0.5 * Math.cos(a), r: 0.012, h: l, seg: 5, rx: dz ? -dz * (Math.PI / 2 - a) : 0, rz: dx ? dx * (Math.PI / 2 - a) : 0 });
    }
  };
  for (const [x0, x1, z0, z1] of L.pit) {
    for (let x = x0 + 0.4; x < x1 - 0.2; x += rng.range(0.7, 1.3)) { rebar(x, z0, 0, 1); rebar(x, z1, 0, -1); }
  }
  // ホールの側：穴のまわりの柵（坂の上の東は開けておく）と、立入禁止の札
  const [px0, , pz0, pz1] = [L.pit[1][0], 0, L.pit[0][2], L.pit[0][3]];
  const rx0 = px0 - 0.35, rz0 = pz0 - 0.35, rz1 = pz1 + 0.35, rx1 = R.x1 - 0.15;
  B.railing(M.steel, { x0: rx0, z0: rz0, x1: rx1, z1: rz0, gap: 1.3 });
  B.railing(M.steel, { x0: rx0, z0: rz1, x1: rx1, z1: rz1, gap: 1.3 });
  B.railing(M.steel, { x0: rx0, z0: rz0, x1: rx0, z1: rz1, gap: 1.3 });
  const keep = SG.smallLabel('立入禁止', { w: 512, h: 160, bg: '#e8c93a', fg: '#1d1d1d', seed: 51 });
  for (const [x, z, ry] of [[(rx0 + rx1) / 2, rz0 - 0.03, Math.PI], [(rx0 + rx1) / 2 + 1.2, rz1 + 0.03, 0]]) {
    P.wallSign(B, x, 0.62, z, ry, 0.5, 0.16, keep, { rough: 0.8 });
  }
  // 穴のふちの、割れた床のかけら
  for (const [x0, x1, z0, z1] of L.pit) {
    for (let x = x0 + 0.3; x < x1; x += rng.range(0.8, 1.6)) for (const z of [z0, z1]) {
      if (z > L.pit[0][2] && z < L.pit[0][3] && x > L.pit[0][0] && x < L.pit[0][1]) continue;
      B.box(M.floor, { x, y: 0.03, z: z + (z === z0 ? -0.12 : 0.12), w: rng.range(0.25, 0.5), h: 0.08, d: rng.range(0.15, 0.3), ry: rng.range(-0.5, 0.5), rx: rng.range(-0.2, 0.2), collide: false });
    }
  }
}

function underground(B, M, refs, add, tubeOff, rng) {
  const D = L.under, EL = L.elec;
  const cx = (D.x0 + D.x1) / 2;
  // 天井の蛍光灯（電気が戻ると光る）
  for (let z = -8; z <= 16; z += 4) P.tubeLight(B, M, cx, D.y + D.h, z, Math.PI / 2, tubeOff, 1.2);
  // 壁のポスター・案内
  const sgn = SG.guideSign({ w: 1024, h: 214, items: [{ icon: 'arrowU', w: 0.4 }, { text: '電気室', sub: 'Electrical Room（関係者以外立入禁止）', w: 2 }], seed: 27 });
  P.wallSign(B, D.x1 - 0.01, D.y + 2.2, 4, -Math.PI / 2, 2.2, 0.46, sgn);
  P.wallSign(B, D.x0 + 0.01, D.y + 1.6, 12, Math.PI / 2, 0.9, 1.27, SG.poster({ kind: 'sea', seed: 63 }));
  P.wallSign(B, D.x1 - 0.01, D.y + 1.6, -5, -Math.PI / 2, 0.9, 1.27, SG.poster({ kind: 'festival', seed: 65 }));
  // 落書き（子どもの背の高さに、マーカーで）
  P.wallSign(B, D.x0 + 0.01, D.y + 1.05, -6, Math.PI / 2, 1.35, 0.45, SG.graffitiPicture(), { transparent: true, rough: 0.6 });
  refs.spots.graffiti = [D.x0 + 0.6, D.y + 1.0, -6];
  // 非常口の緑のあかり（いつも光っている）
  const exitTex = SG.guideSign({ w: 512, h: 256, items: [{ icon: 'exit', text: '非常口', size: 80 }], bg: '#1f9a5a', seed: 29 });
  const exitMat = new THREE.MeshBasicMaterial({ map: exitTex, toneMapped: false, color: 0x9affc8 });
  for (const [x, z, ry] of [[cx + 1.2, EL.z1 + 0.42, 0], [cx, L.underStairs.zBottom - 0.2, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), exitMat);
    m.position.set(x, D.y + 2.6, z);
    m.rotation.y = ry;
    add(m);
  }
  // 排水溝（東の壁ぞい）
  B.box(M.dark, { x: D.x1 - 0.2, y: D.y + 0.004, z: (D.z0 + D.z1) / 2, w: 0.25, h: 0.01, d: D.z1 - D.z0, collide: false, cast: false });
  // ベンチ（くぼみ）
  P.woodBench(B, M, D.x0 + 0.45, 14.5, Math.PI / 2, 1.6, D.y);
  P.rubble(B, M, D.x0 + 0.6, 1.5, 0.9, 10, rng, { y: D.y });
  P.rubble(B, M, D.x1 - 0.6, -7.5, 0.8, 8, rng, { y: D.y });
  // 電気室の扉（鍵がかかっている）
  const door = P.swingDoor(B, M, (EL.door[0] + EL.door[1]) / 2, EL.z1 + 0.2, 0, EL.door[1] - EL.door[0], 2.15, M.steelDark, { y: D.y, hinge: -1 });
  add(door.pivot);
  refs.elecDoor = door;
  refs.spots.elecDoor = [(EL.door[0] + EL.door[1]) / 2, D.y + 1.0, EL.z1 + 0.7];
  P.wallSign(B, (EL.door[0] + EL.door[1]) / 2, D.y + 2.45, EL.z1 + 0.41, 0, 1.4, 0.3, SG.smallLabel('電気室', { bg: '#e8e2d0', h: 96, seed: 31 }));
  // 電気室の中：配電盤・レバー・変圧器
  for (let i = 0; i < 4; i++) {
    const x = EL.x0 + 0.9 + i * 1.3;
    B.box(M.steelCream, { x, y: D.y + 1.05, z: EL.z0 + 0.35, w: 1.2, h: 2.1, d: 0.6 });
    for (let k = 0; k < 3; k++) B.box(M.dark, { x: x - 0.3 + k * 0.3, y: D.y + 1.5, z: EL.z0 + 0.66, w: 0.18, h: 0.12, d: 0.02, collide: false, cast: false });
  }
  // 主電源の箱とレバー（動く）。下げた位置が「切」、手前を通って上げると「入」。トモの手がとどく高さ
  const LV = { x: EL.x1 - 1.3, z: EL.z0 - 0.2 + 0.2 };          // 北の壁の内側の面
  B.box(M.steelCream, { x: LV.x, y: D.y + 0.85, z: LV.z + 0.215, w: 0.9, h: 1.7, d: 0.45, surface: 'metal' });
  B.box(M.steelDark, { x: LV.x, y: D.y + 1.72, z: LV.z + 0.24, w: 0.96, h: 0.06, d: 0.52, collide: false });
  const front = LV.z + 0.44;
  B.box(M.steelDark, { x: LV.x, y: D.y + 1.0, z: front + 0.015, w: 0.36, h: 0.62, d: 0.03, collide: false });
  for (const k of [-1, 1]) B.box(M.steelDark, { x: LV.x + k * 0.065, y: D.y + 1.0, z: front + 0.06, w: 0.025, h: 0.12, d: 0.1, collide: false });
  P.wallSign(B, LV.x + 0.29, D.y + 1.3, front + 0.005, 0, 0.16, 0.16, SG.smallLabel('入', { w: 128, h: 128, bg: '#e8e2d0', seed: 33 }));
  P.wallSign(B, LV.x + 0.29, D.y + 0.7, front + 0.005, 0, 0.16, 0.16, SG.smallLabel('切', { w: 128, h: 128, bg: '#e8e2d0', seed: 35 }));
  P.wallSign(B, LV.x, D.y + 1.52, front + 0.005, 0, 0.6, 0.15, SG.smallLabel('主電源', { w: 512, h: 128, bg: '#e8e2d0', seed: 37 }));
  const lever = new THREE.Group();
  lever.position.set(LV.x, D.y + 1.0, front + 0.06);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 12), M.steelDark);
  hub.rotation.z = Math.PI / 2;
  lever.add(hub);
  const arm = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.4, 0.045), M.steelDark);
  bar.position.y = 0.2;
  bar.castShadow = true;
  arm.add(bar);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), M.plasticRed);
  grip.rotation.z = Math.PI / 2;
  grip.position.y = 0.41;
  grip.castShadow = true;
  arm.add(grip);
  arm.rotation.x = LEVER_OFF;
  lever.add(arm);
  add(lever);
  refs.lever = { group: lever, arm };
  refs.spots.lever = [LV.x, D.y + 1.0, front + 0.7];
  refs.spots.leverStand = [LV.x + 0.165, D.y, front + 0.06 + 0.42 * Math.sin(LEVER_OFF) + 0.31];
  // 変圧器（柵の中）
  B.box(M.steelDark, { x: EL.x0 + 1.2, y: D.y + 0.8, z: EL.z1 - 1.4, w: 1.6, h: 1.6, d: 1.2 });
  for (let i = 0; i < 6; i++) B.box(M.steelDark, { x: EL.x0 + 0.5 + i * 0.3, y: D.y + 0.85, z: EL.z1 - 0.7, w: 0.04, h: 1.7, d: 0.04, collide: false });
  B.world.addBox({ x: EL.x0 + 1.2, y: D.y + 0.9, z: EL.z1 - 1.2, w: 1.9, h: 1.8, d: 1.5 });
  // ケーブル
  for (let i = 0; i < 4; i++) P.wire(B, M, [EL.x0 + 1 + i * 1.3, D.y + 2.1, EL.z0 + 0.4], [EL.x0 + 1.2 + i * 0.1, D.y + 2.6, EL.z1 - 1.4], 0.25);
  // 電気室のほのかな赤い非常灯
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }));
  red.position.set(EL.x0 + 0.3, D.y + 2.6, EL.z0 + 0.3);
  add(red);
  refs.elecRedLamp = red;
}

function platformProps(B, M, refs, add, rng) {
  const Pf = L.platform, T1 = L.track1, T2 = L.track2, P2 = L.platform2;
  const y = Pf.y;
  // 駅名標（両面）
  const nameTex = SG.stationNameSign();
  const nm = sheet(nameTex, { rough: 0.6 });
  const Fn = P.frame(B, 3, y, -21.6, 0);
  Fn.box(M.steelDark, { x: 0, y: 1.95, z: 0, w: 2.6, h: 1.4, d: 0.1, collide: false });
  Fn.plane(nm, { x: 0, y: 1.95, z: 0.052, w: 2.5, h: 1.25 });
  Fn.plane(nm, { x: 0, y: 1.95, z: -0.052, w: 2.5, h: 1.25, ry: Math.PI });
  for (const k of [-1, 1]) Fn.box(M.steelDark, { x: k * 1.1, y: 0.65, z: 0, w: 0.08, h: 1.3, d: 0.08 });
  refs.spots.nameSign = [3, y + 1.2, -20.8];
  // 番線の札（吊り下げ）
  P.hangingSign(B, M, -5, y + 2.75, -15.2, 0, 1.6, 0.55, SG.guideSign({ w: 768, h: 264, items: [{ text: '1', size: 170, w: 0.6 }, { text: '番線', sub: 'Track 1', w: 1.4 }], seed: 33 }), { rodTop: Pf.canopy });
  // 発車標（ホーム）
  const dbOff = SG.departureBoard({ lit: false });
  const dbOn = SG.departureBoard({ lit: true });
  const dbFinal = SG.departureBoard({ lit: true, mode: 'final' });
  const dbm = P.hangingSign(B, M, -5, y + 2.4, -17.8, 0, 3.0, 0.75, dbOff, { rodTop: Pf.canopy });
  dbm.emissive = new THREE.Color(0xffffff);
  dbm.emissiveMap = dbOn;
  dbm.emissiveIntensity = 0;
  refs.boards.push({ mat: dbm, off: dbOff, on: dbOn, final: dbFinal });
  // ホームの時計（両面、線路に沿って見える向き）
  const ck = P.clock(M, -11, y + 2.45, -18.6, Math.PI / 2, { r: 0.42, double: true, small: false });
  ck.set(11, 42);
  add(ck.group);
  refs.clocks.push(ck);
  B.cyl(M.steelDark, { x: -11, y: (y + 2.9 + Pf.canopy) / 2, z: -18.6, r: 0.025, h: Pf.canopy - y - 2.9, seg: 6 });
  refs.spots.platformClock = [-11, y + 2.45, -18.6];
  // ベンチ（壁ぎわ、線路を向く）
  for (const x of [-24, -16, 6, 16]) P.seats(B, M, x, -13.3, Math.PI, 4, x > 0 ? 'cream' : 'navy', x === 6 ? [3] : []);
  P.woodBench(B, M, -2, -19.4, Math.PI, 1.8, y);   // スケッチブックのベンチ
  refs.spots.sketchBench = [-2, y + 0.5, -19.6];
  // 乗車位置（床の印）
  const markTex = SG.smallLabel('乗車位置 △ 1', { w: 512, h: 128, bg: '#e8c93a', fg: '#1d1d1d', seed: 35 });
  const mm = sheet(markTex, { rough: 0.8 });
  for (const x of [-15, -5, 5, 15]) B.decal(mm, { x, y, z: Pf.z0 + 1.6, w: 1.1, d: 0.28, ry: Math.PI, lift: 0.01 });
  refs.spots.board = [-5, y, Pf.z0 + 1.8];
  // ホームの自販機とごみ箱
  P.vendingMachine(B, M, -20, -13.0, Math.PI, 1, 37);
  P.recycleBin(B, M, -18.8, -12.85, Math.PI);
  // 柱のポスター
  P.wallSign(B, -4.16, y + 1.6, -18.6, -Math.PI / 2, 0.6, 0.85, SG.poster({ kind: 'sea', seed: 71 }));
  // 時刻表（ホールの北の壁の、ホーム側。額に入れてガラス）
  const Ft = P.frame(B, 1.2, y, L.hall.z0 - 0.4, Math.PI);
  Ft.box(M.steelDark, { x: 0, y: 1.55, z: 0.015, w: 0.72, h: 1.04, d: 0.03, collide: false });
  Ft.plane(sheet(SG.timetable({ seed: 73, amount: 0.65 }), { rough: 0.6 }), { x: 0, y: 1.55, z: 0.032, w: 0.64, h: 0.96 });
  Ft.plane(M.glassClean, { x: 0, y: 1.55, z: 0.04, w: 0.64, h: 0.96 });
  refs.spots.timetable = [1.2, y + 1.2, L.hall.z0 - 1.0];
  // ホームの端の柵
  B.railing(M.steel, { x0: Pf.x0 + 0.2, z0: Pf.z0 + 0.3, x1: Pf.x0 + 0.2, z1: Pf.z1 - 0.3, y, gap: 1.5 });
  // 東のはしは、線路へ下りる坂のぶんだけ柵を開けておく
  B.railing(M.steel, { x0: Pf.x1 - 0.2, z0: Pf.z0 + 3.4, x1: Pf.x1 - 0.2, z1: Pf.z1 - 0.3, y, gap: 1.5 });
  // 廃車両（2 番線）
  for (const [x, seed] of [[-9, 19], [11, 23]]) {
    const car = P.trainCar(M, { seed });
    car.position.set(x, T2.y + 0.26, T2.rail);
    car.rotation.y = 0;
    add(car);
    B.world.addBox({ x, y: T2.y + 2.2, z: T2.rail, w: 19.5, h: 4.2, d: 2.9 });
  }
  // 架線柱と電線
  for (let x = -30; x <= 10; x += 20) {
    P.catenaryMast(B, M, x, (P2.z0 + P2.z1) / 2, 7.5, 5.5, P2.y);
    P.catenaryMast(B, M, x, (P2.z0 + P2.z1) / 2, 7.5, -5.5, P2.y, false);
  }
  for (const zz of [T1.rail, T2.rail]) P.wire(B, M, [-40, P2.y + 6.7, zz], [40, P2.y + 6.7, zz], 0.6, 16);
  // 2 番ホームの草むらに古い看板
  const Fo = P.frame(B, -16, P2.y, -32, Math.PI);
  Fo.box(M.steelDark, { x: 0, y: 1.2, z: 0, w: 1.6, h: 0.9, d: 0.06, collide: false, rz: 0.15 });
  Fo.plane(sheet(SG.poster({ kind: 'notice', seed: 73 }), { rough: 0.8 }), { x: 0, y: 1.2, z: 0.035, w: 0.6, h: 0.85, rz: 0.15 });
  for (const k of [-1, 1]) Fo.box(M.steelDark, { x: k * 0.6, y: 0.4, z: 0, w: 0.06, h: 0.8, d: 0.06, collide: false });
}

function plaza(B, M, refs, rng) {
  const Z = L.plaza;
  // 駅名（正面の上）
  P.wallSign(B, 2, 7.7, L.entrance.z1 + 0.41, 0, 7.2, 1.5, SG.smallLabel('月見坂駅', { w: 1024, h: 214, bg: '#efe9da', fg: '#1d2b48', seed: 37, font: '"Hiragino Mincho ProN", "Yu Mincho", serif' }));
  // 入口の柱と、正面の時計（止まっている）
  for (const x of [-5.2, 9.2]) B.box(M.concreteDark, { x, y: 3.2, z: L.entrance.z1 + 0.65, w: 0.6, h: 6.4, d: 0.6 });
  const ck3 = P.clock(M, 2, 5.6, L.entrance.z1 + 0.45, 0, { r: 0.6 });
  ck3.set(11, 42);
  refs.clocks.push(ck3);
  refs.dynamic.push(ck3.group);
  B.object(ck3.group);
  // バス停
  const Fb = P.frame(B, -7, 0, 34, 0);
  Fb.cyl(M.steelDark, { x: 0, y: 1.2, z: 0, r: 0.04, h: 2.4, seg: 8, collide: true });
  Fb.cyl(M.plasticRed, { x: 0, y: 2.35, z: 0, r: 0.26, h: 0.05, seg: 20, rx: Math.PI / 2 });
  Fb.box(M.plasticCream, { x: 0, y: 1.5, z: 0.0, w: 0.4, h: 0.6, d: 0.04, collide: false });
  Fb.box(M.concrete, { x: 0, y: 0.08, z: 0, w: 0.5, h: 0.16, d: 0.5 });
  refs.spots.busStop = [-7, 1.2, 34.6];
  P.woodBench(B, M, -5.4, 34.4, Math.PI, 1.8);
  // ポスト（赤くて丸い）
  B.cyl(M.plasticRed, { x: -11, y: 0.65, z: 31.5, r: 0.28, h: 1.3, seg: 24, collide: true });
  B.cyl(M.plasticRed, { x: -11, y: 1.36, z: 31.5, r: 0.33, h: 0.12, seg: 24 });
  B.box(M.dark, { x: -11, y: 1.05, z: 31.78, w: 0.25, h: 0.04, d: 0.02, collide: false });
  refs.spots.postbox = [-11, 1.0, 32.2];
  // 電話ボックス
  const Fph = P.frame(B, 13.5, 0, 33, -0.2);
  Fph.box(M.steelCream, { x: 0, y: 2.3, z: 0, w: 1.0, h: 0.12, d: 1.0 });
  Fph.box(M.steelCream, { x: 0, y: 0.05, z: 0, w: 1.0, h: 0.1, d: 1.0 });
  for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) Fph.box(M.steelCream, { x, y: 1.2, z, w: 0.05, h: 2.2, d: 0.05, collide: false });
  for (const [x, z, ry] of [[0, -0.48, 0], [-0.48, 0, Math.PI / 2], [0.48, 0, Math.PI / 2]]) Fph.plane(M.glass, { x, y: 1.2, z, w: 0.95, h: 2.1, ry });
  Fph.box(M.plasticGreen, { x: 0, y: 1.2, z: -0.35, w: 0.3, h: 0.4, d: 0.2, collide: false });
  B.world.addBox({ x: 13.5, y: 1.2, z: 33, w: 1, h: 2.4, d: 1, ry: -0.2 });
  // 自転車（倒れたもの・置いてあるもの）
  for (const [x, z, ry, fall] of [[-12, 29.6, 0.2, false], [-12.9, 29.6, 0.15, false], [-13.8, 29.8, 1.4, true]]) bicycle(B, M, x, z, ry, fall);
  // 植えこみ（縁石）
  for (const [x, z, w, d] of [[2, 39, 8, 3], [-10, 41, 5, 3], [12, 41, 5, 3]]) {
    B.box(M.concrete, { x, y: 0.2, z: z - d / 2, w, h: 0.4, d: 0.2 });
    B.box(M.concrete, { x, y: 0.2, z: z + d / 2, w, h: 0.4, d: 0.2 });
    B.box(M.concrete, { x: x - w / 2, y: 0.2, z, w: 0.2, h: 0.4, d });
    B.box(M.concrete, { x: x + w / 2, y: 0.2, z, w: 0.2, h: 0.4, d });
    B.box(M.ground, { x, y: 0.2, z, w: w - 0.2, h: 0.36, d: d - 0.2, surface: 'grass' });
  }
  // 古い車（草に埋もれている）
  car(B, M, 7.5, 44.2, 1.35);
  refs.spots.car = [7.5, 1, 42.6];
}

function bicycle(B, M, x, z, ry, fallen) {
  const F = P.frame(B, x, 0, z, ry);
  const rot = fallen ? Math.PI / 2 - 0.1 : 0;
  const ring = (lx) => {
    const g = new THREE.TorusGeometry(0.33, 0.02, 6, 24);
    g.rotateY(Math.PI / 2);
    if (fallen) g.rotateZ(rot);
    const [wx, , wz] = F.P(lx, 0, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
    g.translate(wx, fallen ? 0.03 : 0.34, wz);
    B.add(g, M.dark, {});
  };
  ring(0); ring(0);
  const [fx, , fz] = F.P(0, 0, 0.0);
  const g = new THREE.TorusGeometry(0.33, 0.02, 6, 24);
  g.rotateY(Math.PI / 2);
  if (fallen) g.rotateZ(rot);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));
  const off = new THREE.Vector3(0, 0, 1.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  g.translate(fx + off.x, fallen ? 0.03 : 0.34, fz + off.z);
  B.add(g, M.dark, {});
  if (!fallen) {
    F.box(M.plasticRed, { x: 0, y: 0.55, z: 0.52, w: 0.04, h: 0.04, d: 1.0, rx: -0.15, collide: false });
    F.box(M.plasticRed, { x: 0, y: 0.5, z: 0.3, w: 0.04, h: 0.45, d: 0.04, rx: 0.3, collide: false });
    F.box(M.dark, { x: 0, y: 0.78, z: 0.25, w: 0.1, h: 0.04, d: 0.22, collide: false });
    F.box(M.chrome, { x: 0, y: 0.9, z: 0.95, w: 0.5, h: 0.03, d: 0.03, collide: false });
    F.box(M.chrome, { x: 0, y: 0.6, z: 1.1, w: 0.25, h: 0.18, d: 0.2, collide: false });
  }
}

function car(B, M, x, z, ry) {
  const F = P.frame(B, x, 0, z, ry);
  F.box(M.plasticCream, { x: 0, y: 0.62, z: 0, w: 1.65, h: 0.75, d: 3.9 });
  F.box(M.plasticCream, { x: 0, y: 1.22, z: -0.2, w: 1.5, h: 0.55, d: 2.1, collide: false });
  F.plane(M.glass, { x: 0, y: 1.22, z: 0.86, w: 1.4, h: 0.5, rx: -0.4 });
  for (const s of [-1, 1]) F.plane(M.glass, { x: s * 0.76, y: 1.25, z: -0.2, w: 1.9, h: 0.42, ry: s * Math.PI / 2 });
  for (const [lx, lz] of [[-0.78, 1.25], [0.78, 1.25], [-0.78, -1.25], [0.78, -1.25]]) F.cyl(M.dark, { x: lx, y: 0.3, z: lz, r: 0.3, h: 0.2, seg: 14, rz: Math.PI / 2 });
}
