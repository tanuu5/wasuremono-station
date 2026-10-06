// 演出の進行役。ジェネレーター関数で「待つ・話す・暗転する」を順に書けるようにする。
//
//   director.run(function* () {
//     yield* say(hud, 'intro.line1');    // 字幕を出して読み終わるまで待つ（flow.js）
//     yield 1.5;                        // 1.5 秒待つ
//     yield () => player.pos.z < -40;   // 条件が満たされるまで待つ
//   });
//
// 時間はゲームの step(dt) で進む（一時停止中は止まる。コマ送り・撮影でも同じ結果になる）。
// yield の戻り値はそのフレームの dt（const dt = yield 0 で毎フレーム動かせる。flow.js の fade など）。
// ホラーゲーム（2026-10）の Director をそのまま雛形の部品にしたもの。
export class Director {
  constructor() {
    this.tasks = [];
  }

  /** 演出を始める。name を付けると stop(name) で止められる。 */
  run(gen, name = '') {
    const it = typeof gen === 'function' ? gen() : gen;
    const task = { it, wait: null, name, done: false };
    this.tasks.push(task);
    this._next(task);
    return task;
  }

  running(name) { return this.tasks.some((t) => t.name === name && !t.done); }

  stop(name) {
    for (const t of this.tasks) if (!name || t.name === name) { t.done = true; try { t.it.return?.(); } catch { /* 止めるだけ */ } }
    this.tasks = this.tasks.filter((t) => !t.done);
  }

  step(dt) {
    for (const t of [...this.tasks]) {
      if (t.done) continue;
      t.dt = dt;
      if (t.wait && !t.wait(dt)) continue;
      this._next(t);
    }
    this.tasks = this.tasks.filter((t) => !t.done);
  }

  _next(task) {
    // 待たなくてよいものは、同じフレームのうちに続けて進める
    for (let guard = 0; guard < 100; guard++) {
      let r;
      try { r = task.it.next(task.dt); } catch (e) { console.error('[director]', task.name, e); task.done = true; return; }
      if (r.done) { task.done = true; return; }
      const w = toWaiter(r.value);
      if (w) { task.wait = w; return; }
    }
  }
}

function toWaiter(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') { let t = v; return (dt) => (t -= dt) <= 0; }
  if (typeof v === 'function') return () => !!v();
  if (v.until) return () => !!v.until();
  return null;
}
