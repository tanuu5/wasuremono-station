// 駅の建物：床・壁・天井・階段・屋根・ホーム・線路。小物は props.js、草木は plants.js。
import * as THREE from 'three';
import { L, subtract } from './layout.js';
import { rand } from './noise.js';

export function buildArchitecture(B, M) {
  // ---------------------------------------------------------------- 道具
  /** 床（上面 y、厚さ t、穴あき）。 */
  const floor = (mat, r, y, { t = 0.4, holes = [], surface = 'tile', skipBottom = true } = {}) => {
    for (const p of subtract(r, holes)) {
      B.box(mat, { x: (p[0] + p[1]) / 2, y: y - t / 2, z: (p[2] + p[3]) / 2, w: p[1] - p[0], h: t, d: p[3] - p[2], surface, skip: skipBottom ? ['ny'] : null });
    }
  };
  /** 天井（下面 y）。 */
  const ceiling = (mat, r, y, { t = 0.3, holes = [] } = {}) => {
    for (const p of subtract(r, holes)) B.box(mat, { x: (p[0] + p[1]) / 2, y: y + t / 2, z: (p[2] + p[3]) / 2, w: p[1] - p[0], h: t, d: p[3] - p[2], surface: 'concrete' });
  };
  /** x が一定の壁（z0〜z1、y0〜y1）。穴は [z0, z1, y0, y1]。 */
  const wallX = (mat, x, z0, z1, y0, y1, { t = 0.4, holes = [] } = {}) => {
    for (const p of subtract([z0, z1, y0, y1], holes)) B.box(mat, { x, y: (p[2] + p[3]) / 2, z: (p[0] + p[1]) / 2, w: t, h: p[3] - p[2], d: p[1] - p[0], surface: 'concrete' });
  };
  /** z が一定の壁（x0〜x1、y0〜y1）。穴は [x0, x1, y0, y1]。 */
  const wallZ = (mat, z, x0, x1, y0, y1, { t = 0.4, holes = [] } = {}) => {
    for (const p of subtract([x0, x1, y0, y1], holes)) B.box(mat, { x: (p[0] + p[1]) / 2, y: (p[2] + p[3]) / 2, z, w: p[1] - p[0], h: p[3] - p[2], d: t, surface: 'concrete' });
  };
  const H = L.hall;

  // ---------------------------------------------------------------- コンコース
  const grateHoles = L.grates.map(([x, z]) => [x - 0.45, x + 0.45, z - 0.45, z + 0.45]);
  floor(M.floor, [H.x0, H.x1, H.z0, H.z1], 0, { holes: [...grateHoles, ...L.pit] });
  // 西の壁（忘れ物センターの扉）
  wallX(M.concrete, H.x0 - 0.2, H.z0, H.z1, 0, H.roof, { holes: [[L.office.door[0], L.office.door[1], 0, 2.5]] });
  // 北の壁（大階段の上の通路、高窓）
  const clere = [[-14, -9.5], [-0.5, 4], [6, 10.5], [12.5, 17]];
  wallZ(M.concrete, H.z0 - 0.2, H.x0 - 0.4, H.x1 + 0.4, 0, H.roof, {
    holes: [[L.corridor.x0, L.corridor.x1, L.balcony.y, L.balcony.y + L.corridor.h], ...clere.map(([a, b]) => [a, b, 9.3, 12])],
  });
  // 東の壁（バルコニーの上の窓、塞がった東口）
  const eastWin = [[-10.5, -6.5], [-3, 1.5], [4, 8.5]];
  wallX(M.concrete, H.x1 + 0.2, H.z0, H.z1, 0, H.roof, {
    holes: [...eastWin.map(([a, b]) => [a, b, 7, 11.5]), [11, 14.5, 0, 3.2]],
  });
  // 南の壁（改札の口、上の窓）
  wallZ(M.concrete, H.z1 + 0.2, H.x0 - 0.4, H.x1 + 0.4, 0, H.roof, {
    holes: [[-4.6, 4.6, 0, 3.2], [-12, -7, 8.5, 11.5], [8, 13, 8.5, 11.5]],
  });
  // 妻壁（屋根の三角）
  for (const z of [H.z0 - 0.2, H.z1 + 0.2]) gable(B, M.concrete, z, H.x0 - 0.4, H.x1 + 0.4, H.roof, H.ridge, 0.4);
  // 西の壁の付け柱
  for (let z = -12; z <= 16; z += 6) B.box(M.concreteDark, { x: H.x0 + 0.15, y: H.roof / 2, z: Math.min(z, 15.7), w: 0.5, h: H.roof, d: 0.7 });

  // ---------------------------------------------------------------- 屋根（切妻。北東側にいくつか穴）
  buildRoof(B, M);

  // ---------------------------------------------------------------- 柱の列（x = 14、時計の柱）
  for (const z of [-12, -6, 0, 6, 12]) {
    const zz = z === -12 ? -11.7 : z;
    B.box(M.steelDark, { x: 14, y: H.roof / 2, z: zz, w: 0.5, h: H.roof, d: 0.5, surface: 'metal' });
    B.box(M.concreteDark, { x: 14, y: 0.3, z: zz, w: 0.8, h: 0.6, d: 0.8, surface: 'concrete' });
  }

  // ---------------------------------------------------------------- 大階段（中間の踊り場あり）→ 上の踊り場 → 通路 → ホーム
  const S = L.mainStairs;
  const sx = (S.x0 + S.x1) / 2, sw = S.x1 - S.x0;
  B.stairs(M.concrete, { x: sx, z: (S.zBottom + S.zLand0) / 2, w: sw, d: S.zBottom - S.zLand0, y0: S.top / 2, y1: 0, nose: M.tactileLine, sideMat: M.concreteDark, sideH: 0.95, base: 0, surface: 'concrete' });
  B.box(M.concrete, { x: sx, y: S.top / 4, z: (S.zLand0 + S.zLand1) / 2, w: sw, h: S.top / 2, d: S.zLand0 - S.zLand1, surface: 'concrete' });
  for (const k of [-1, 1]) B.box(M.concreteDark, { x: sx + k * (sw / 2 + 0.06), y: (S.top / 2 + 0.95) / 2, z: (S.zLand0 + S.zLand1) / 2, w: 0.12, h: S.top / 2 + 0.95, d: S.zLand0 - S.zLand1 });
  B.stairs(M.concrete, { x: sx, z: (S.zLand1 + S.zTop) / 2, w: sw, d: S.zLand1 - S.zTop, y0: S.top, y1: S.top / 2, nose: M.tactileLine, sideMat: M.concreteDark, sideH: 0.95, base: 0, surface: 'concrete' });
  // 上の踊り場（北の壁の口からホームへ。下は詰めておく）
  const C = L.corridor;
  B.box(M.concrete, { x: sx, y: S.top / 2, z: (S.zTop + H.z0) / 2, w: sw, h: S.top, d: S.zTop - H.z0, surface: 'concrete', skip: ['ny'] });
  // 踊り場の両わきの腰壁
  for (const x of [C.x0 - 0.06, C.x1 + 0.06]) B.box(M.concreteDark, { x, y: S.top / 2 + 0.475, z: (S.zTop + H.z0) / 2, w: 0.12, h: S.top + 0.95, d: S.zTop - H.z0 });

  // ---------------------------------------------------------------- 右の階段 → 東のバルコニー
  const R = L.rightStairs, BY = L.balcony.y;
  B.stairs(M.steelDark, { x: (R.x0 + R.x1) / 2, z: (R.zBottom + R.zTop) / 2, w: R.x1 - R.x0, d: R.zBottom - R.zTop, y0: BY, y1: 0, nose: M.tactileLine, base: 0, surface: 'metal', open: true, stringer: M.steelDark });
  // 右の階段の東側の手すり
  B.railing(M.steel, { x0: R.x1 + 0.05, z0: R.zBottom, x1: R.x1 + 0.05, z1: R.zTop, y: 0, y1: BY, gap: 1.6 });
  const [nx0, nx1, nz0, nz1] = L.balcony.north;
  floor(M.floor, [nx0, nx1, nz0, nz1], BY, { t: 0.35, skipBottom: false });
  const [ex0, ex1, ez0, ez1] = L.balcony.east;
  const gap = L.balcony.gap;
  floor(M.floor, [ex0, ex1, ez0, ez1], BY, { t: 0.35, holes: [[ex0, ex1, gap[0], gap[1]]], skipBottom: false });
  // バルコニーの手すり
  B.railing(M.steel, { x0: nx0, z0: nz0 + 0.1, x1: nx0, z1: nz1, y: BY });
  B.railing(M.steel, { x0: R.x1, z0: nz1, x1: ex0, z1: nz1, y: BY });
  B.railing(M.steel, { x0: ex0, z0: ez0, x1: ex0, z1: gap[0] - 0.2, y: BY });
  B.railing(M.steel, { x0: ex0, z0: gap[1] + 0.4, x1: ex0, z1: ez1, y: BY });
  B.railing(M.steel, { x0: ex0, z0: ez1, x1: ex1, z1: ez1, y: BY });
  // 階段の手すり（西側）
  B.railing(M.steel, { x0: R.x0 - 0.05, z0: R.zBottom, x1: R.x0 - 0.05, z1: R.zTop, y: 0, y1: BY, gap: 1.6 });
  // バルコニーの下の梁
  for (const z of [-6, 0, 6]) B.box(M.steelDark, { x: 16, y: BY - 0.55, z, w: 4.4, h: 0.4, d: 0.3, collide: false });
  B.box(M.steelDark, { x: ex0, y: BY - 0.5, z: (ez0 + ez1) / 2, w: 0.3, h: 0.5, d: ez1 - ez0, collide: false });

  // ---------------------------------------------------------------- 忘れ物センター
  const O = L.office;
  floor(M.floor, [O.x0, O.x1, O.z0, O.z1], 0);
  wallX(M.concrete, O.x0 - 0.2, O.z0, O.z1, 0, O.h);
  wallZ(M.concrete, O.z0 - 0.2, O.x0 - 0.4, O.x1 - 0.2, 0, O.h);
  wallZ(M.concrete, O.z1 + 0.2, O.x0 - 0.4, O.x1 - 0.2, 0, O.h, { holes: [[-22.6, -18.4, 1.0, 2.3]] });
  const officeHole = [-22.3, -20.4, 7.5, 9.4];
  ceiling(M.ceiling, [O.x0 - 0.35, O.x1 - 0.2, O.z0 - 0.35, O.z1 + 0.35], O.h, { t: 0.35, holes: [officeHole] });
  // 崩れた天井のふち（折れた板）
  B.box(M.ceiling, { x: -21.35, y: O.h - 0.25, z: 9.6, w: 2.2, h: 0.06, d: 0.9, rx: 0.5, collide: false });

  // ---------------------------------------------------------------- 売店
  const K = L.kiosk;
  wallZ(M.mosaic, K.z0 - 0.1, K.x0, K.x1, 0, K.h, { t: 0.2 });
  wallZ(M.mosaic, K.z1 + 0.1, K.x0, K.x1 + 0.1, 0, K.h, { t: 0.2 });
  wallX(M.mosaic, K.x1 + 0.1, K.z0, K.z1 + 0.2, 0, K.h, { t: 0.2, holes: [[K.open[0], K.open[1], 0, 2.4]] });
  ceiling(M.ceiling, [K.x0, K.x1 + 0.2, K.z0 - 0.2, K.z1 + 0.2], K.h, { t: 0.25 });
  B.box(M.plasticCream, { x: (K.x0 + K.x1) / 2 + 0.1, y: K.h + 0.45, z: (K.z0 + K.z1) / 2, w: K.x1 - K.x0 + 0.4, h: 0.6, d: K.z1 - K.z0 + 0.6, collide: false });

  // ---------------------------------------------------------------- 駅務室
  const SO = L.stationOffice;
  wallZ(M.concrete, SO.z0 - 0.15, SO.x0 - 0.3, SO.x1 + 0.3, 0, SO.h, { t: 0.3, holes: [[SO.door[0], SO.door[1], 0, 2.2]] });
  wallX(M.concrete, SO.x0 - 0.15, SO.z0, SO.z1, 0, SO.h, { t: 0.3, holes: [[12, 15, 1.0, 2.2]] });
  wallX(M.concrete, SO.x1 + 0.15, SO.z0, SO.z1, 0, SO.h, { t: 0.3 });
  ceiling(M.ceiling, [SO.x0 - 0.3, SO.x1 + 0.3, SO.z0 - 0.3, SO.z1], SO.h, { t: 0.25 });

  // ---------------------------------------------------------------- 入口ホール
  const E = L.entrance, U = L.underStairs;
  const uHole = [U.x0, U.x1, U.zBottom, U.zTop];
  floor(M.floor, [E.x0, E.x1, E.z0, E.z1], 0, { holes: [uHole] });
  wallX(M.concrete, E.x0 - 0.2, E.z0 + 0.4, E.z1, 0, E.h);
  wallX(M.concrete, E.x1 + 0.2, E.z0 + 0.4, E.z1, 0, E.h);
  wallZ(M.concrete, E.z1 + 0.2, E.x0 - 0.4, E.x1 + 0.4, 0, E.h + 1.5, { holes: [[E.doors[0], E.doors[1], 0, 3.0]] });
  const entHole = [3.5, 9.5, 19.5, 24];
  ceiling(M.ceiling, [E.x0 - 0.35, E.x1 + 0.35, E.z0 + 0.4, E.z1 + 0.05], E.h, { t: 0.4, holes: [entHole] });
  // 地下への口の腰壁（東・西・北。南が入口。西は壁まで詰める）
  B.box(M.concreteDark, { x: U.x1 + 0.1, y: 0.5, z: (U.zBottom + U.zTop) / 2 - 0.1, w: 0.2, h: 1.0, d: U.zTop - U.zBottom + 0.2 });
  B.box(M.concreteDark, { x: (E.x0 - 0.05 + U.x0) / 2, y: 0.5, z: (U.zBottom + U.zTop) / 2 - 0.1, w: U.x0 - E.x0 + 0.05, h: 1.0, d: U.zTop - U.zBottom + 0.2 });
  B.box(M.concreteDark, { x: (U.x0 + U.x1) / 2, y: 0.5, z: U.zBottom - 0.1, w: U.x1 - U.x0, h: 1.0, d: 0.2 });

  // ---------------------------------------------------------------- 地下通路と電気室
  const D = L.under, EL = L.elec;
  B.stairs(M.concrete, { x: (U.x0 + U.x1) / 2, z: (U.zBottom + U.zTop) / 2, w: U.x1 - U.x0, d: U.zTop - U.zBottom, y0: D.y, y1: 0, nose: M.tactileLine, base: D.y - 0.3, surface: 'concrete' });
  floor(M.floor, [D.x0, D.x1, D.z0, U.zBottom], D.y, { surface: 'tile' });
  // 通路の壁（上は床の板の下面まで：床と同じ高さまで上げると床の上面と、板の中まで上げると階段の口の床のふちとちらつく）
  wallX(M.mosaic, D.x0 - 0.2, D.z0 + 0.4, U.zTop + 0.15, D.y, -0.4, { t: 0.4 });
  wallX(M.mosaic, D.x1 + 0.2, D.z0 + 0.4, U.zTop + 0.15, D.y, -0.4, { t: 0.4, holes: [[L.alley.door[0], L.alley.door[1], D.y, D.y + 2.4]] });
  const gratesUnder = L.grates.map(([x, z]) => [x - 0.45, x + 0.45, z - 0.45, z + 0.45]);
  // 天井の板は上の床の下面まで（すき間から床下がのぞかないように）
  ceiling(M.concreteDark, [D.x0 - 0.35, D.x1 + 0.35, D.z0 + 0.4, U.zBottom], D.y + D.h, { t: -0.4 - (D.y + D.h), holes: gratesUnder });
  // 格子の下の縦穴は、天井の板（上の床まで厚い）の穴がそのまま壁になる
  // 電気室
  floor(M.concreteDark, [EL.x0, EL.x1, EL.z0, EL.z1], D.y, { surface: 'concrete' });
  wallZ(M.concrete, EL.z1 + 0.2, EL.x0 - 0.4, EL.x1 + 0.4, D.y, D.y + D.h, { holes: [[EL.door[0], EL.door[1], D.y, D.y + 2.2]] });
  wallZ(M.concrete, EL.z0 - 0.2, EL.x0 - 0.4, EL.x1 + 0.4, D.y, D.y + D.h);
  wallX(M.concrete, EL.x0 - 0.2, EL.z0, EL.z1, D.y, D.y + D.h);
  wallX(M.concrete, EL.x1 + 0.2, EL.z0, EL.z1, D.y, D.y + D.h);
  ceiling(M.concreteDark, [EL.x0 - 0.4, EL.x1 + 0.4, EL.z0 - 0.4, EL.z1 + 0.4], D.y + D.h, { t: 1.0 });

  buildAlley(B, M, { floor, ceiling, wallX, wallZ });

  // ---------------------------------------------------------------- ホーム・線路
  const P = L.platform, T1 = L.track1, P2 = L.platform2, T2 = L.track2;
  // ホーム 1（下は詰める）。南のはしはホールの北の壁
  B.box(M.pavement, { x: (P.x0 + P.x1) / 2, y: P.y - 0.25, z: (P.z0 + P.z1) / 2, w: P.x1 - P.x0, h: 0.5, d: P.z1 - P.z0, surface: 'concrete', skip: ['ny'] });
  B.box(M.concreteDark, { x: (P.x0 + P.x1) / 2, y: (P.y - 0.5) / 2, z: (P.z0 + P.z1) / 2 + 0.4, w: P.x1 - P.x0, h: P.y - 0.5, d: P.z1 - P.z0 - 0.8, collide: false, skip: ['ny'] });
  B.box(M.concreteDark, { x: (P.x0 + P.x1) / 2, y: T1.y + 0.3, z: P.z0 + 0.3, w: P.x1 - P.x0, h: 0.6, d: 0.6, surface: 'concrete' });   // ホームの下のくぼみの奥
  // ホームの縁（白線と点字ブロック）
  B.box(M.plasticCream, { x: (P.x0 + P.x1) / 2, y: P.y + 0.003, z: P.z0 + 0.12, w: P.x1 - P.x0, h: 0.01, d: 0.16, collide: false, cast: false });
  B.box(M.tactileLine, { x: (P.x0 + P.x1) / 2, y: P.y + 0.006, z: P.z0 + 1.0, w: P.x1 - P.x0, h: 0.012, d: 0.3, collide: false, cast: false });
  // ホールの外の、ホームの南の壁（ホールの幅の外側）
  wallZ(M.concrete, P.z1 - 0.15, P.x0, H.x0 - 0.4, P.y, P.y + 2.6, { t: 0.3 });
  wallZ(M.concrete, P.z1 - 0.15, H.x1 + 0.4, P.x1, P.y, P.y + 2.6, { t: 0.3 });
  // ホームの東のはしの坂（線路の高さの空き地へ下りられる）
  B.box(M.ballast, { x: P.x1 + 8, y: T1.y - 0.4, z: (P.z0 + P.z1) / 2, w: 16, h: 0.8, d: P.z1 - P.z0, surface: 'gravel', skip: ['ny'] });
  B.world.addRamp({ x: P.x1 + 2, z: P.z0 + 1.6, w: 3, d: 4, ry: Math.PI / 2, y0: P.y, y1: T1.y, surface: 'concrete' });
  B.box(M.pavement, { x: P.x1 + 2, y: (P.y + T1.y) / 2 - 0.3, z: P.z0 + 1.6, w: Math.hypot(4, P.y - T1.y), h: 0.6, d: 3, rz: -Math.atan2(P.y - T1.y, 4), collide: false });
  // 線路の道床
  B.box(M.ballast, { x: 0, y: T1.y - 0.4, z: (T1.z0 + T1.z1) / 2, w: 90, h: 0.8, d: T1.z1 - T1.z0, surface: 'gravel', skip: ['ny'] });
  B.box(M.ballast, { x: 0, y: T2.y - 0.4, z: (T2.z0 + T2.z1) / 2, w: 90, h: 0.8, d: T2.z1 - T2.z0, surface: 'gravel', skip: ['ny'] });
  // 2 番ホーム（東半分は崩れている）
  B.box(M.pavement, { x: (P.x0 + 15) / 2, y: (P2.y + T1.y - 0.8) / 2, z: (P2.z0 + P2.z1) / 2, w: 15 - P.x0, h: P2.y - T1.y + 0.8, d: P2.z1 - P2.z0, surface: 'concrete' });
  B.box(M.ballast, { x: 32, y: T1.y - 0.4, z: (P2.z0 + P2.z1) / 2, w: 30, h: 0.8, d: P2.z1 - P2.z0, surface: 'gravel', skip: ['ny'] });
  rubbleSlope(B, M, 15, 4, P2, T1);
  // 北の土手（向こうは草木）
  B.box(M.ground, { x: 0, y: 2.6 + 1.5, z: T2.z0 - 3, w: 90, h: 3, d: 6, surface: 'grass' });
  // 両はし（見えない壁）
  for (const x of [P.x0 - 2, P.x1 + 6]) B.world.addBox({ x, y: 8, z: (T2.z0 + P.z1) / 2, w: 0.5, h: 10, d: P.z1 - T2.z0 + 6, cam: false });
  B.world.addBox({ x: 0, y: 8, z: T2.z0 - 1, w: 100, h: 10, d: 0.5, cam: false });
  // レールと枕木
  for (const tz of [T1.rail, T2.rail]) {
    for (const k of [-0.53, 0.53]) {
      B.box(M.rail, { x: 0, y: L.track1.y + 0.18, z: tz + k, w: 90, h: 0.14, d: 0.07, collide: false });
      B.box(M.railTop, { x: 0, y: L.track1.y + 0.255, z: tz + k, w: 90, h: 0.012, d: 0.055, collide: false, cast: false });
    }
  }
  sleepers(B, M);
  // 屋根（キャノピー）。柱と梁、ところどころ抜けている
  canopy(B, M);

  // ---------------------------------------------------------------- 駅前広場（外）
  const Z = L.plaza;
  floor(M.pavement, [Z.x0 - 10, Z.x1 + 10, Z.z0, Z.z1 + 6], 0, { t: 0.5, surface: 'concrete' });
  for (const [x, w] of [[Z.x0 - 1, 0.5], [Z.x1 + 1, 0.5]]) B.world.addBox({ x, y: 2, z: (Z.z0 + Z.z1) / 2, w, h: 6, d: Z.z1 - Z.z0, cam: false });
  B.world.addBox({ x: (Z.x0 + Z.x1) / 2, y: 2, z: Z.z1, w: Z.x1 - Z.x0 + 2, h: 6, d: 0.5, cam: false });
  // 駅舎の正面（入口ホールの南の壁の上と、ひさし）
  B.box(M.concrete, { x: 1, y: (E.h + 1.5 + 11) / 2, z: E.z1 + 0.2, w: 34.8, h: 11 - E.h - 1.5, d: 0.4 });
  B.box(M.steelCream, { x: 2, y: 3.4, z: E.z1 + 1.4, w: 16, h: 0.25, d: 2.4, collide: false });
  // 遠くの地面。コンコースと入口ホールの下はあける（床の穴：地下への口・格子・崩れた所から地面が見えてしまうので）
  for (const p of subtract([-130, 130, -130, 130], [[H.x0 + 0.3, H.x1 - 0.3, H.z0 + 0.3, E.z1 - 0.3]])) {   // ふちは床の板の中に隠す
    B.box(M.ground, { x: (p[0] + p[1]) / 2, y: -0.6, z: (p[2] + p[3]) / 2, w: p[1] - p[0], h: 1, d: p[3] - p[2], collide: false, cast: false, skip: ['ny'] });
  }
}

/**
 * つきみ横丁：地下通路から東へ入る古い地下街の入口。ホールの床が抜けて、くずれた床の板が坂になって下りている。
 * 板の下はがれきの山（当たりは坂の下まで詰まっている）。東の奥はがれきでふさがっている。
 */
function buildAlley(B, M, { floor, ceiling, wallX, wallZ }) {
  const A = L.alley, R = L.ramp, D = L.under;
  const top = A.y + A.h;
  floor(M.floor, [D.x1, A.x1, A.z0, A.z1], A.y, { surface: 'tile' });
  wallZ(M.mosaic, A.z0 - 0.2, D.x1 + 0.2, A.x1 + 0.4, A.y, top);
  wallZ(M.mosaic, A.z1 + 0.2, D.x1 + 0.2, A.x1 + 0.4, A.y, top);
  wallX(M.concrete, A.x1 + 0.2, A.z0, A.z1, A.y, top);
  // 天井の板は上の床の下面まで。穴はホールの床と同じ形
  ceiling(M.concreteDark, [D.x1 + 0.35, A.x1 + 0.4, A.z0 - 0.4, A.z1 + 0.4], top, { t: -0.4 - top, holes: L.pit });
  // くずれた床の板（上の面が坂の当たりと同じ）
  const run = R.x1 - R.x0, rise = 0 - A.y, ang = Math.atan2(rise, run), len = Math.hypot(run, rise), th = 0.32;
  const [s0, s1] = R.slab;
  B.box(M.floor, { x: (R.x0 + R.x1) / 2 + Math.sin(ang) * th / 2, y: (A.y + 0) / 2 - Math.cos(ang) * th / 2, z: (s0 + s1) / 2, w: len, h: th, d: s1 - s0, rz: ang, collide: false, surface: 'tile' });
  B.world.addRamp({ x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2, w: R.z1 - R.z0, d: run, ry: Math.PI / 2, y0: A.y, y1: 0, base: A.y, surface: 'concrete' });
  // 板の下のがれきの山：芯の三角の柱と、両わきに積み重なったかけら
  const wedge = new THREE.Shape();
  wedge.moveTo(R.x0 + 0.5, A.y);
  wedge.lineTo(R.x1, A.y);
  wedge.lineTo(R.x1, -0.45);
  wedge.closePath();
  const wg = new THREE.ExtrudeGeometry(wedge, { depth: s1 - s0 - 1.0, bevelEnabled: false });
  wg.translate(0, 0, s0 + 0.5);
  B.add(wg, M.concreteDark, { cast: true });
  const rr = rand(6161), tanA = rise / run;
  for (let x = R.x0 + 0.9; x < R.x1 - 0.1; x += rr.range(0.45, 0.7)) {
    const under = A.y + (x - R.x0) * tanA - 0.42;          // 板の下の面
    for (const [z, k] of [[s0 + 0.3, -1], [s1 - 0.3, 1]]) {
      let yy = A.y;
      while (yy < under - 0.12) {
        const h = Math.min(rr.range(0.35, 0.8), under - yy);
        B.box(rr() < 0.5 ? M.concreteDark : M.concrete, { x: x + rr.range(-0.1, 0.1), y: yy + h / 2, z: z + k * rr.range(-0.12, 0.08), w: rr.range(0.45, 0.75), h, d: rr.range(0.45, 0.62), rx: rr.range(-0.12, 0.12), ry: rr.range(-0.4, 0.4), rz: rr.range(-0.12, 0.12), collide: false });
        yy += h * rr.range(0.8, 0.95);
      }
    }
  }
  // 東の奥：天井まで積もったがれき（ここで行き止まり）
  const heap = new THREE.Shape();
  heap.moveTo(R.x1 - 0.5, A.y);
  heap.lineTo(A.x1 + 0.2, A.y);
  heap.lineTo(A.x1 + 0.2, top + 0.05);
  heap.lineTo(R.x1 + 0.4, top + 0.05);
  heap.lineTo(R.x1 - 0.1, A.y + 1.6);
  heap.closePath();
  const hg = new THREE.ExtrudeGeometry(heap, { depth: A.z1 - A.z0, bevelEnabled: false });
  hg.translate(0, 0, A.z0);
  B.add(hg, M.concreteDark, { cast: true });
  B.world.addBox({ x: (R.x1 - 0.1 + A.x1 + 0.2) / 2, y: A.y + A.h / 2, z: (A.z0 + A.z1) / 2, w: A.x1 + 0.2 - (R.x1 - 0.1), h: A.h, d: A.z1 - A.z0, surface: 'concrete' });
}

/** 屋根の三角の妻壁。 */
function gable(B, mat, z, x0, x1, y0, y1, t) {
  const xm = (x0 + x1) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0);
  shape.lineTo(x1, y0);
  shape.lineTo(xm, y1);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, z - t / 2);
  // UV を m 単位に（Extrude の UV は形の座標なので、そのままで m）
  B.add(geo, mat, {});
}

// 屋根の穴とガラスの並び（[側, 帯, 区間]）。側 0 = 西、1 = 東、帯 0〜7（7 が棟の近く）、区間は z の 5 つ
// 棟の近くの '0,7,2'・'1,7,2' の光は、ホールの床の穴（L.pit）から横丁の坂まで届く
const ROOF_HOLES = new Set(['1,2,0', '1,3,0', '1,5,1', '1,6,1', '0,6,1', '0,5,2', '1,1,2', '1,2,3', '0,7,0', '1,7,0', '0,3,3', '0,4,0', '0,3,0', '0,3,1', '1,4,4', '0,7,2', '1,7,2']);
const ROOF_GLASS = new Set(['0,7,1', '1,7,1', '0,7,3', '1,7,3', '1,7,4', '0,7,4', '0,6,0', '1,6,0', '0,6,3', '1,6,2']);
const ROOF_ZS = [L.hall.z0, -6, 0, 6, 12, L.hall.z1];

/**
 * 日の光が差しこむ開口部（光の筋とほこりに使う）。p0 = 角、e1・e2 = 辺、len = 光の向きに伸ばす長さ、strength = 明るさ。
 */
export function lightOpenings() {
  const H = L.hall, out = [];
  const half = (H.x1 - H.x0) / 2, rise = H.ridge - H.roof;
  for (let side = 0; side < 2; side++) for (let i = 0; i < 8; i++) for (let k = 0; k < 5; k++) {
    const key = `${side},${i},${k}`;
    const hole = ROOF_HOLES.has(key), gl = ROOF_GLASS.has(key);
    if (!hole && !gl) continue;
    const t0 = i / 8, t1 = (i + 1) / 8;
    const xa = side === 0 ? H.x0 + half * t0 : H.x1 - half * t0, xb = side === 0 ? H.x0 + half * t1 : H.x1 - half * t1;
    const ya = H.roof + rise * t0 + 0.15, yb = H.roof + rise * t1 + 0.15;
    const z0 = ROOF_ZS[k], z1 = ROOF_ZS[k + 1];
    out.push({ p0: [xa, ya, z0], e1: [xb - xa, yb - ya, 0], e2: [0, 0, z1 - z0], len: (ya - 0.3) / 0.906, strength: hole ? 0.04 : 0.012, edge: 0.2, dust: hole ? 1 : 0.2 });
  }
  // 北の壁の高窓（南西へ、下へ）
  for (const [a, b] of [[-14, -9.5], [-0.5, 4], [6, 10.5], [12.5, 17]]) out.push({ p0: [a, 9.3, H.z0 - 0.2], e1: [b - a, 0, 0], e2: [0, 2.7, 0], len: 12, strength: 0.045, edge: 0.15 });
  // 東の壁の窓
  for (const [a, b] of [[-10.5, -6.5], [-3, 1.5], [4, 8.5]]) out.push({ p0: [H.x1 + 0.2, 7, a], e1: [0, 0, b - a], e2: [0, 4.5, 0], len: 9, strength: 0.05, edge: 0.15 });
  // 忘れ物センターの天井の穴
  out.push({ p0: [-22.3, 3.55, 7.5], e1: [1.9, 0, 0], e2: [0, 0, 1.9], len: 3.7, strength: 0.1, edge: 0.25, dust: 3 });
  // 入口ホールの天井の穴
  out.push({ p0: [3.5, 6.4, 19.5], e1: [6, 0, 0], e2: [0, 0, 4.5], len: 7.5, strength: 0.05, edge: 0.2 });
  // ホールの床の穴から横丁へ（屋根の穴 '0,7,2'・'1,7,2' の光のつづき）
  out.push({ p0: [-6.5, -0.02, L.pit[0][2]], e1: [4.1, 0, 0], e2: [0, 0, 1.9], len: 5.2, strength: 0.09, edge: 0.3, dust: 3 });
  // 地下の格子（暗いので強め）
  for (const [x, z] of L.grates) out.push({ p0: [x - 0.42, 0.0, z - 0.42], e1: [0.84, 0, 0], e2: [0, 0, 0.84], len: 5.0, strength: 0.22, edge: 0.3, dust: 4 });
  return out;
}

function buildRoof(B, M) {
  const H = L.hall;
  const xm = (H.x0 + H.x1) / 2;          // 棟
  const rise = H.ridge - H.roof;
  const half = (H.x1 - H.x0) / 2;
  const ang = Math.atan2(rise, half);
  const slopeLen = Math.hypot(half, rise);
  const zs = ROOF_ZS;
  const strips = 8;
  const holes = ROOF_HOLES, glass = ROOF_GLASS;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < strips; i++) {
      const t0 = i / strips, t1 = (i + 1) / strips;
      const tm = (t0 + t1) / 2;
      // 側 0：x は x0 → xm（i が大きいほど棟に近い）
      const x = side === 0 ? H.x0 + half * tm : H.x1 - half * tm;
      const y = H.roof + rise * tm + 0.15;
      for (let k = 0; k < zs.length - 1; k++) {
        const key = `${side},${i},${k}`;
        if (holes.has(key)) continue;
        const z = (zs[k] + zs[k + 1]) / 2, d = zs[k + 1] - zs[k];
        const mat = glass.has(key) ? M.glass : M.roof;
        B.box(mat, { x, y, z, w: slopeLen / strips + 0.02, h: glass.has(key) ? 0.02 : 0.08, d: d + 0.02, rz: side === 0 ? ang : -ang, collide: false, cast: !glass.has(key) });
      }
    }
  }
  // トラス（下弦・上弦・束・斜材）と母屋
  for (const z of zs) {
    const zz = Math.min(Math.max(z, H.z0 + 0.3), H.z1 - 0.3);
    B.box(M.steelDark, { x: xm, y: H.roof - 0.2, z: zz, w: H.x1 - H.x0, h: 0.35, d: 0.25, collide: false });
    for (const side of [0, 1]) {
      const cx = side === 0 ? (H.x0 + xm) / 2 : (H.x1 + xm) / 2;
      B.box(M.steelDark, { x: cx, y: H.roof + rise / 2 - 0.05, z: zz, w: slopeLen, h: 0.3, d: 0.22, rz: side === 0 ? ang : -ang, collide: false });
      // 束と斜材
      for (let j = 1; j < 6; j++) {
        const t = j / 6;
        const px = side === 0 ? H.x0 + half * t : H.x1 - half * t;
        const top = H.roof + rise * t;
        B.box(M.steelDark, { x: px, y: (H.roof - 0.2 + top) / 2, z: zz, w: 0.12, h: top - H.roof + 0.2, d: 0.12, collide: false });
        const px2 = side === 0 ? H.x0 + half * (t - 1 / 6) : H.x1 - half * (t - 1 / 6);
        const top2 = H.roof + rise * (t - 1 / 6);
        const L2 = Math.hypot(px - px2, top - (H.roof - 0.2));
        B.box(M.steelDark, { x: (px + px2) / 2, y: (top2 + H.roof - 0.2) / 2 + (top - top2) / 2, z: zz, w: 0.1, h: L2, d: 0.1, rz: Math.atan2(px - px2, top - H.roof) * (side === 0 ? -1 : -1), collide: false });
      }
    }
  }
  // 母屋（z 方向の細い梁）
  for (const side of [0, 1]) for (let i = 1; i < strips; i += 2) {
    const t = i / strips;
    const x = side === 0 ? H.x0 + half * t : H.x1 - half * t;
    B.box(M.steel, { x, y: H.roof + rise * t - 0.05, z: (H.z0 + H.z1) / 2, w: 0.14, h: 0.18, d: H.z1 - H.z0, collide: false });
  }
  // 屋根の当たり（カメラが外に出ないように、平らな天井として）
  B.world.addBox({ x: xm, y: H.roof + 0.4, z: (H.z0 + H.z1) / 2, w: H.x1 - H.x0, h: 0.2, d: H.z1 - H.z0, cam: false });
}

function sleepers(B, M) {
  for (const tz of [L.track1.rail, L.track2.rail]) {
    for (let x = -44; x <= 44; x += 0.62) {
      B.box(M.sleeper, { x, y: L.track1.y + 0.07, z: tz + Math.sin(x * 3.1) * 0.03, w: 0.24, h: 0.14, d: 2.1, ry: Math.sin(x * 1.7) * 0.03, collide: false });
    }
  }
}

function canopy(B, M) {
  const P = L.platform;
  const y = P.canopy;
  const z0 = P.z0 + 0.8, z1 = P.z1 - 1.6;
  const holes = [[4, 13.5, z0 - 1, z1 + 1], [-24, -20, z0 - 1, -19]];
  for (const p of subtract([P.x0 + 2, P.x1 - 2, z0, z1], holes)) {
    B.box(M.roof, { x: (p[0] + p[1]) / 2, y: y + 0.05, z: (p[2] + p[3]) / 2, w: p[1] - p[0], h: 0.1, d: p[3] - p[2], collide: false });
  }
  // 抜けた所の折れた板
  B.box(M.roof, { x: 6.5, y: y - 1.4, z: -19, w: 4, h: 0.08, d: 5, rz: 0.55, rx: 0.1, collide: false });
  B.box(M.roof, { x: 12, y: 6.2, z: -20.5, w: 3, h: 0.08, d: 4, rz: -0.25, rx: 0.2, collide: false });
  // 梁と柱
  B.box(M.steelDark, { x: (P.x0 + P.x1) / 2, y: y - 0.25, z: -18.6, w: P.x1 - P.x0 - 4, h: 0.4, d: 0.3, collide: false });
  for (let x = P.x0 + 6; x <= P.x1 - 4; x += 8) {
    if (x > 4 && x < 13) continue;
    B.box(M.steelDark, { x, y: (P.y + y) / 2, z: -18.6, w: 0.3, h: y - P.y, d: 0.3, surface: 'metal' });
    B.box(M.steelDark, { x, y: y - 0.2, z: (z0 + z1) / 2, w: 0.25, h: 0.3, d: z1 - z0, collide: false });
  }
  // 折れて傾いた柱
  B.box(M.steelDark, { x: 8.2, y: P.y + 1.4, z: -19.4, w: 0.3, h: 3.8, d: 0.3, rz: 0.95, rx: 0.2, collide: false });
}

function rubbleSlope(B, M, x0, x1, P2, T1) {
  // 2 番ホームの崩れた東側：瓦礫の山（坂）
  B.world.addRamp({ x: 17, z: (P2.z0 + P2.z1) / 2, w: P2.z1 - P2.z0, d: 4, ry: Math.PI / 2, y0: P2.y, y1: T1.y, surface: 'gravel' });
  for (let i = 0; i < 18; i++) {
    const t = (i % 6) / 6, j = Math.floor(i / 6);
    B.box(M.concreteDark, { x: 15.5 + t * 4, y: P2.y - t * 1.1 - 0.2, z: P2.z0 + 1 + j * 2, w: 1.2, h: 0.5, d: 1.4, rx: (i * 0.37) % 0.6 - 0.3, rz: 0.3 + (i * 0.21) % 0.3, ry: i * 0.7, collide: false });
  }
}

/** 屋内の暗さ（環境光の箱）。k = 空の光の届く割合。 */
export function ambientZones(addAmbientZone) {
  const H = L.hall, O = L.office, K = L.kiosk, SO = L.stationOffice, E = L.entrance, D = L.under, EL = L.elec;
  addAmbientZone([H.x0, -0.5, H.z0], [H.x1, H.ridge, H.z1], 0.5, 3);
  addAmbientZone([14, -0.5, -12], [18.5, 5.2, 10], 0.32, 1.2);       // バルコニーの下
  addAmbientZone([10, -0.5, -12], [18.5, 5.2, -4], 0.32, 1.2);
  addAmbientZone([O.x0 - 0.5, -0.5, O.z0 - 0.5], [O.x1, O.h + 0.3, O.z1 + 0.5], 0.36, 0.8);
  addAmbientZone([K.x0 - 0.3, -0.5, K.z0], [K.x1, K.h, K.z1], 0.1, 0.7);
  addAmbientZone([SO.x0, -0.5, SO.z0], [SO.x1, SO.h, SO.z1 + 0.3], 0.3, 0.6);
  addAmbientZone([E.x0, -0.5, E.z0], [E.x1, E.h + 0.5, E.z1 - 1.5], 0.45, 3.5);
  addAmbientZone([D.x0 - 0.5, D.y - 1, D.z0 - 0.5], [D.x1 + 0.5, -0.6, 25], 0.05, 2.5);
  addAmbientZone([EL.x0 - 0.5, D.y - 1, EL.z0 - 0.5], [EL.x1 + 0.5, -1.0, EL.z1], 0.03, 0.6);
  const A = L.alley;
  addAmbientZone([A.x0 - 0.3, A.y - 1, A.z0 - 0.3], [A.x1 + 0.3, -0.6, A.z1 + 0.3], 0.16, 1.2);
  addAmbientZone([L.platform.x0, 4, L.platform.z0 + 0.8], [L.platform.x1, L.platform.canopy, L.platform.z1 - 1.6], 0.75, 1.5);
}
