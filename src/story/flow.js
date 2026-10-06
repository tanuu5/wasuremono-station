// Director の中で使う小道具（yield* で呼ぶ）と、「調べる」の判定・チェックポイント。
//
//   director.run(function* () {
//     yield* fade(renderer, 1, 0.8);          // 0.8 秒で暗転
//     yield* load(() => game.loadStage('house'));   // 読み込み（Promise）が終わるまで待つ
//     yield* fade(renderer, 0, 1.2);          // 明ける
//     yield* say(story, 'house.line1');       // 字幕を出し、消えるまで待つ
//     yield* waitPress(input, 'interact');    // ボタンを待つ
//   }, 'scene');
//
// 時間はすべて Director（＝ゲームの step）で進むので、一時停止・__dev.advance()・撮影でも同じ結果になる。
// ただし load() の Promise は advance() の中では終わらない（同期で回るため）。確認では eval を挟む（dev-harness の contract.md）。

/** renderer.setFx({ fade }) を sec 秒で to まで動かす（0 = 明るい、1 = 真っ黒）。 */
export function* fade(renderer, to, sec = 0.8, color) {
  const from = renderer.fx.fade ?? 0;
  if (color) renderer.setFx({ fadeColor: color });
  let t = 0;
  while (t < sec) {
    const dt = yield 0; // 次のフレームまで待つ（Director は数字を秒として待つ）
    t += typeof dt === 'number' ? dt : 1 / 60;
    renderer.setFx({ fade: from + (to - from) * Math.min(1, t / sec) });
  }
  renderer.setFx({ fade: to });
}

/** 字幕を出して、消えるまで待つ。 */
export function* say(story, key, opts) {
  const sec = story.say(key, opts);
  yield sec + 0.25;
}

/** ボタンが押されるまで待つ。 */
export function* waitPress(input, action) {
  yield () => input.pressed(action);
}

/** Promise が終わるまで待つ（失敗したら例外を投げ直す）。 */
export function* load(start) {
  let done = false, err = null;
  let p;
  try { p = Promise.resolve(start()); } catch (e) { p = Promise.reject(e); } // すぐ始める（advance の中でも読み込みは走り出す）
  p.then(() => { done = true; }, (e) => { err = e; done = true; });
  yield () => done;
  if (err) throw err;
}

/**
 * 「調べる」の判定：近くにあって、だいたい正面にあるものを 1 つ選ぶ。
 *   const near = pickInteract(player.position, forward, things, { radius: 1.6, cone: 0.5 });
 *   story.setPrompt(near?.prompt ?? null);
 *   if (near && input.pressed('interact')) near.use();
 * things：[{ pos: Vector3, prompt: 'prompt.door', use() {}, enabled?: () => boolean }]
 */
export function pickInteract(from, forward, things, { radius = 1.6, cone = 0.45 } = {}) {
  let best = null, bestD = Infinity;
  for (const it of things) {
    if (it.enabled && !it.enabled()) continue;
    const dx = it.pos.x - from.x, dz = it.pos.z - from.z;
    const d = Math.hypot(dx, dz);
    if (d > (it.radius ?? radius)) continue;
    const facing = d < 1e-4 ? 1 : (dx * forward.x + dz * forward.z) / d; // 1 = 正面
    if (facing < cone) continue;
    if (d < bestD) { best = it; bestD = d; }
  }
  return best;
}

/**
 * チェックポイント：場面と位置と旗（flags）を保存する。save は core/save.js の createStore で作ったもの。
 *   saveCheckpoint(save, { stage: 'house', spawn: 'door', flags: [...game.flags] })
 *   const cp = save.data.checkpoint  // 「つづきから」で使う
 * 既定値に checkpoint: null を入れておくこと（createStore の形合わせのため）。
 */
export function saveCheckpoint(save, cp) {
  save.data.checkpoint = { ...cp, at: Date.now() };
  save.save();
}
