// ステージの寸法（m）。建物・当たり・地図・演出が同じ数字を使う。北 = -Z、東 = +X、床 y = 0。
export const L = {
  hall: { x0: -16, x1: 18, z0: -12, z1: 16, roof: 13, ridge: 15.5 },
  office: { x0: -24, x1: -16, z0: 6, z1: 14, h: 3.2, door: [9, 10.6] },
  kiosk: { x0: -15.6, x1: -11, z0: -11, z1: -6, h: 2.8, open: [-10.2, -6.8], shutterY: 1.15 },
  mainStairs: { x0: -8, x1: -2, zBottom: -1, zLand0: -5.5, zLand1: -7, zTop: -11.5, top: 5.4 },
  corridor: { x0: -8, x1: -2, h: 3, shutterZ: -12.2 },
  rightStairs: { x0: 10, x1: 12.5, zBottom: 6, zTop: -4 },
  balcony: { y: 5.4, north: [10, 18, -12, -4], east: [14, 18, -4, 10], gap: [0, 1.35] },
  gates: { z: 16, x0: -4.2, x1: 4.2 },
  stationOffice: { x0: 6, x1: 13, z0: 11, z1: 16, h: 3, door: [7, 8.6] },
  entrance: { x0: -16, x1: 18, z0: 16, z1: 28, h: 6, doors: [-4, 8] },
  underStairs: { x0: -15.5, x1: -11.5, zTop: 26, zBottom: 18 },   // 幅は地下通路の壁の内側いっぱい（すき間から落ちないように）
  under: { x0: -15.5, x1: -11.5, z0: -10, z1: 18, y: -4.5, h: 3, water: [-2.5, 10], waterY: -4.36 },
  elec: { x0: -18, x1: -10, z0: -16.5, z1: -10, door: [-14.3, -12.7] },
  platform: { y: 5.4, x0: -34, x1: 30, z0: -24, z1: -12.4, canopy: 8.7 },
  track1: { z0: -29, z1: -24, y: 4.1, rail: -25.6 },
  platform2: { z0: -35, z1: -29, y: 5.2 },
  track2: { z0: -41, z1: -35, y: 4.1, rail: -38 },
  plaza: { x0: -16, x1: 18, z0: 28, z1: 46 },
  grates: [[-13.4, 4.2], [-13.4, -3.8]],
  // つきみ横丁（古い地下街の入口）。地下通路の東の壁の割れ目から入る。ホールの床が抜けて、くずれた床が坂になっている。東の奥はふさがっている
  alley: { x0: -11.1, x1: -0.6, z0: 7.9, z1: 13.9, y: -4.5, h: 3, door: [10.2, 12.4] },
  pit: [[-8.0, -2.4, 8.9, 12.3], [-8.8, -8.0, 9.6, 11.6]],    // ホールの床の穴（長方形の集まり）
  ramp: { x0: -9.6, x1: -2.4, z0: 8.9, z1: 12.3, slab: [9.1, 12.1] },   // くずれた床の坂（西の端が横丁の床、東の端がホールの床）。slab = 見える板の幅（z）
};

/** (x, z) がホールの床の穴に（m だけ広げて）かかるか。 */
export function inPit(x, z, m = 0) {
  return L.pit.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);
}

/** 長方形 [x0, x1, z0, z1] から穴（同じ形）を抜いた残りを、長方形の並びで返す。 */
export function subtract(rect, holes) {
  let pieces = [rect];
  for (const h of holes) {
    const next = [];
    for (const p of pieces) {
      if (h[1] <= p[0] || h[0] >= p[1] || h[3] <= p[2] || h[2] >= p[3]) { next.push(p); continue; }
      const ix0 = Math.max(p[0], h[0]), ix1 = Math.min(p[1], h[1]), iz0 = Math.max(p[2], h[2]), iz1 = Math.min(p[3], h[3]);
      if (p[0] < ix0) next.push([p[0], ix0, p[2], p[3]]);
      if (ix1 < p[1]) next.push([ix1, p[1], p[2], p[3]]);
      if (p[2] < iz0) next.push([ix0, ix1, p[2], iz0]);
      if (iz1 < p[3]) next.push([ix0, ix1, iz1, p[3]]);
    }
    pieces = next;
  }
  return pieces.filter((p) => p[1] - p[0] > 1e-3 && p[3] - p[2] > 1e-3);
}
