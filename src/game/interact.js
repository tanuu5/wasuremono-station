// 調べられるもの：近くて、だいたい正面にあるものを 1 つ選んで、案内（「調べる」など）を出す。
//   inter.add({ id, pos: [x, y, z], prompt: 'prompt.look', radius, use(game), enabled(game), look: [x, y, z] })
// 高さ（y）は、トモの目の高さとの差が大きすぎるものを外すのに使う（上の階のものを下から調べない）。
import * as THREE from 'three';

export class Interactions {
  constructor() {
    this.list = [];
    this.current = null;
    this._f = new THREE.Vector3();
  }

  add(o) {
    const it = { radius: 1.5, cone: 0.25, prompt: 'prompt.look', enabled: null, ...o, pos: new THREE.Vector3(...o.pos) };
    this.list.push(it);
    return it;
  }

  remove(id) { this.list = this.list.filter((i) => i.id !== id); if (this.current?.id === id) this.current = null; }
  get(id) { return this.list.find((i) => i.id === id); }

  /** いちばんよいものを選ぶ（なければ null）。 */
  pick(game) {
    const p = game.player.pos;
    const f = game.player.forward(this._f);
    let best = null, bestScore = Infinity;
    for (const it of this.list) {
      if (it.enabled && !it.enabled(game)) continue;
      const dx = it.pos.x - p.x, dz = it.pos.z - p.z;
      const dy = it.pos.y - (p.y + 0.6);
      if (dy > (it.reachUp ?? 1.6) || dy < -(it.reachDown ?? 1.2)) continue;
      const d = Math.hypot(dx, dz);
      if (d > it.radius) continue;
      const facing = d < 0.25 ? 1 : (dx * f.x + dz * f.z) / d;
      if (facing < it.cone) continue;
      const score = d - facing * 0.6;
      if (score < bestScore) { best = it; bestScore = score; }
    }
    this.current = best;
    return best;
  }
}
