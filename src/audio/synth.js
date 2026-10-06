// 音源と効果音。音声ファイルは使わず、Web Audio のオシレーターとノイズで鳴らす。
// どの関数も (ctx, out, t, p) の形：out はミキサーの系統（{ dry, wet }）、t は鳴らす時刻（ctx.currentTime 基準）。
// p は { f（Hz）or m（MIDI）, dur, vel（0〜1）, pan（-1〜1）, rev（リバーブへの送り 0〜1） } など。
// 値はすべて fin() で確かめてから使う（NaN が AudioParam に入ると、その音はもう鳴らない）。
// わすれもの駅：ピアノ・オルゴール・フルート・弦、駅のチャイム、足音（床の種類ごと）、鳥、踏切、列車など。

const fin = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const FLOOR = 0.0001; // 指数ランプは 0 に向かえないので、ここまで下げる

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const n = ctx.sampleRate * 1.5;
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < n; i++) d[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** node → 音量 → 定位 → out.dry（と、rev があれば out.wet）につなぐ。音量の GainNode を返す。 */
function route(ctx, node, out, p) {
  const g = ctx.createGain();
  g.gain.value = 0;
  let last = node.connect(g);
  if (p.pan) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, fin(p.pan, 0)));
    last = last.connect(pan);
  }
  last.connect(out.dry);
  const rev = fin(p.rev, 0);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; last.connect(s).connect(out.wet); }
  return g;
}

/** 立ち上がり a、減衰 d で peak から消える（打楽器・効果音の形）。 */
function perc(param, t, peak, a, d) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + a);
  param.exponentialRampToValueAtTime(FLOOR, t + a + d);
}
/** 立ち上がり a、保持、離して r で消える（持続音の形）。 */
function adsr(param, t, peak, a, hold, r) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + a);
  param.setValueAtTime(Math.max(FLOOR, peak), t + a + hold);
  param.exponentialRampToValueAtTime(FLOOR, t + a + hold + r);
}

function osc(ctx, type, f, t, end) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f), t);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function noise(ctx, t, end, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(t, Math.random() * 1.2);
  s.stop(end + 0.05);
  return s;
}

function filter(ctx, type, f, q = 0.8) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = Math.max(10, f);
  b.Q.value = q;
  return b;
}

const hz = (p, def) => fin(p.f, p.m !== undefined ? mtof(fin(p.m, 69)) : def);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- 楽器（シーケンサーから使う）
export const INSTRUMENTS = {
  /** 矩形波のリード（チップチューン寄り）。 */
  lead(ctx, out, t, p) {
    const f = hz(p, 440), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'square', f, t, t + dur + 0.2);
    const lp = filter(ctx, 'lowpass', Math.min(9000, f * 6), 0.7);
    const g = route(ctx, o.connect(lp), out, { rev: 0.18, ...p });
    adsr(g.gain, t, 0.14 * vel, 0.006, Math.max(0, dur - 0.03), 0.12);
  },
  /** のこぎり波のベース。 */
  bass(ctx, out, t, p) {
    const f = hz(p, 55), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'sawtooth', f, t, t + dur + 0.15);
    const lp = filter(ctx, 'lowpass', 900, 3);
    lp.frequency.setValueAtTime(220 + 2200 * vel, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const g = route(ctx, o.connect(lp), out, p);
    adsr(g.gain, t, 0.3 * vel, 0.004, Math.max(0, dur - 0.04), 0.08);
  },
  /** やわらかい低音（ピアノの左手のかわり）。 */
  softbass(ctx, out, t, p) {
    const f = hz(p, 55), dur = fin(p.dur, 1), vel = fin(p.vel, 0.7);
    const o = osc(ctx, 'triangle', f, t, t + dur + 1.2);
    const o2 = osc(ctx, 'sine', f * 2, t, t + dur + 0.8);
    const m = ctx.createGain(); m.gain.value = 0.5;
    o.connect(m); o2.connect(m);
    const g = route(ctx, m, out, { rev: 0.25, ...p });
    adsr(g.gain, t, 0.22 * vel, 0.01, Math.max(0.05, dur * 0.6), 1.0);
  },
  /** 少しずらした 3 本ののこぎり波のパッド（和音向け）。 */
  pad(ctx, out, t, p) {
    const f = hz(p, 220), dur = fin(p.dur, 1), vel = fin(p.vel, 0.6);
    const lp = filter(ctx, 'lowpass', 1500, 0.5);
    const mix = ctx.createGain();
    for (const det of [-9, 0, 8]) { const o = osc(ctx, 'sawtooth', f, t, t + dur + 1.2); o.detune.value = det; o.connect(mix); }
    mix.gain.value = 0.33;
    const g = route(ctx, mix.connect(lp), out, { rev: 0.45, ...p });
    adsr(g.gain, t, 0.055 * vel, 0.5, Math.max(0, dur - 0.5), 1.0);
  },
  /** 弦（ゆっくり立ち上がる、こもった音）。 */
  strings(ctx, out, t, p) {
    const f = hz(p, 220), dur = fin(p.dur, 1), vel = fin(p.vel, 0.6);
    const lp = filter(ctx, 'lowpass', Math.min(3200, f * 4), 0.6);
    const mix = ctx.createGain();
    mix.gain.value = 0.3;
    for (const det of [-6, 5]) {
      const o = osc(ctx, 'sawtooth', f, t, t + dur + 1.5);
      o.detune.value = det;
      const vib = osc(ctx, 'sine', 5.2, t, t + dur + 1.5);
      const vg = ctx.createGain(); vg.gain.value = f * 0.004;
      vib.connect(vg).connect(o.frequency);
      o.connect(mix);
    }
    const g = route(ctx, mix.connect(lp), out, { rev: 0.5, ...p });
    adsr(g.gain, t, 0.07 * vel, 0.35, Math.max(0, dur - 0.3), 0.9);
  },
  /** 弾いた音（三角波＋短い倍音）。 */
  pluck(ctx, out, t, p) {
    const f = hz(p, 440), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'triangle', f, t, t + 0.6);
    const o2 = osc(ctx, 'sine', f * 2, t, t + 0.25);
    const m = ctx.createGain();
    o.connect(m); o2.connect(m);
    const g = route(ctx, m, out, { rev: 0.2, ...p });
    perc(g.gain, t, 0.25 * vel, 0.003, 0.45);
  },
  /** ピアノ（倍音を重ねて、高い音ほど早く消える）。 */
  piano(ctx, out, t, p) {
    const f = hz(p, 440), vel = fin(p.vel, 0.7), dur = fin(p.dur, 0.5);
    const decay = Math.max(0.6, 3.2 - (f / 1000) * 1.6);
    const mix = ctx.createGain();
    mix.gain.value = 1;
    const parts = [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4, 0.05, 'sine']];
    for (const [k, a, type] of parts) {
      const o = osc(ctx, type, f * k * (1 + (k - 1) * 0.0008), t, t + decay + 0.5);
      const g = ctx.createGain();
      perc(g.gain, t, a, 0.004, decay / (0.6 + k * 0.5));
      o.connect(g).connect(mix);
    }
    const lp = filter(ctx, 'lowpass', 1800 + vel * 3500, 0.5);
    const g = route(ctx, mix.connect(lp), out, { rev: 0.4, ...p });
    // 鍵盤を離したら早めに消える
    const rel = Math.min(decay, dur + 0.35);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.005);
    g.gain.setTargetAtTime(0.11 * vel, t + 0.05, 0.4);
    g.gain.setTargetAtTime(FLOOR, t + rel, 0.25);
  },
  /** オルゴール（高くて澄んだ、すぐ消える金属の音）。 */
  musicbox(ctx, out, t, p) {
    const f = hz(p, 880), vel = fin(p.vel, 0.7);
    const o = osc(ctx, 'sine', f, t, t + 2.2);
    const o2 = osc(ctx, 'sine', f * 4.02, t, t + 0.5);
    const o3 = osc(ctx, 'sine', f * 2.0, t, t + 1.0);
    const g2 = ctx.createGain(); perc(g2.gain, t, 0.35, 0.001, 0.25);
    const g3 = ctx.createGain(); perc(g3.gain, t, 0.25, 0.001, 0.6);
    const m = ctx.createGain();
    o.connect(m); o2.connect(g2).connect(m); o3.connect(g3).connect(m);
    const g = route(ctx, m, out, { rev: 0.45, ...p });
    perc(g.gain, t, 0.12 * vel, 0.002, 1.8);
  },
  /** フルート（息の音＋ゆれ）。 */
  flute(ctx, out, t, p) {
    const f = hz(p, 660), dur = fin(p.dur, 0.5), vel = fin(p.vel, 0.7);
    const o = osc(ctx, 'sine', f, t, t + dur + 0.6);
    const o2 = osc(ctx, 'triangle', f * 2, t, t + dur + 0.6);
    const vib = osc(ctx, 'sine', 5, t, t + dur + 0.6);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.35);
    vib.connect(vg).connect(o.frequency);
    const m = ctx.createGain();
    const h = ctx.createGain(); h.gain.value = 0.12;
    o.connect(m); o2.connect(h).connect(m);
    const br = noise(ctx, t, t + dur + 0.3);
    const bg = ctx.createGain(); bg.gain.value = 0.05;
    br.connect(filter(ctx, 'bandpass', f * 1.5, 1.2)).connect(bg).connect(m);
    const g = route(ctx, m, out, { rev: 0.45, ...p });
    adsr(g.gain, t, 0.11 * vel, 0.07, Math.max(0, dur - 0.08), 0.25);
  },
  /** 鐘（FM）。 */
  bell(ctx, out, t, p) {
    const f = hz(p, 880), vel = fin(p.vel, 0.7), dur = fin(p.dur, 1.4);
    const car = osc(ctx, 'sine', f, t, t + dur);
    const mod = osc(ctx, 'sine', f * 3.5, t, t + dur);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = route(ctx, car, out, { rev: 0.35, ...p });
    perc(g.gain, t, 0.18 * vel, 0.002, dur);
  },
  /** 駅のチャイムの鐘（澄んだ、長く響く）。 */
  chimebell(ctx, out, t, p) {
    const f = hz(p, 880), vel = fin(p.vel, 0.8), dur = fin(p.dur, 2.4);
    const car = osc(ctx, 'sine', f, t, t + dur);
    const mod = osc(ctx, 'sine', f * 2, t, t + dur);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 0.6, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.02), t + dur * 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = route(ctx, car, out, { rev: 0.55, ...p });
    perc(g.gain, t, 0.2 * vel, 0.003, dur);
  },
  kick(ctx, out, t, p) {
    const vel = fin(p.vel, 0.9);
    const o = osc(ctx, 'sine', 150, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = route(ctx, o, out, p);
    perc(g.gain, t, 0.9 * vel, 0.002, 0.38);
  },
  snare(ctx, out, t, p) {
    const vel = fin(p.vel, 0.8);
    const n = noise(ctx, t, t + 0.25);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 1800, 0.7)), out, { rev: 0.15, ...p });
    perc(g.gain, t, 0.5 * vel, 0.001, 0.18);
  },
  hat(ctx, out, t, p) {
    const vel = fin(p.vel, 0.6), open = !!p.open;
    const n = noise(ctx, t, t + (open ? 0.35 : 0.08));
    const g = route(ctx, n.connect(filter(ctx, 'highpass', 7500, 0.7)), out, p);
    perc(g.gain, t, 0.22 * vel, 0.001, open ? 0.3 : 0.05);
  },
};

const I = INSTRUMENTS;

/** 小さな金属の「カツ」（ロボットの足音のもと）。 */
function tick(ctx, out, t, f, a, d, p = {}) {
  const o = osc(ctx, 'triangle', f, t, t + d + 0.05);
  o.frequency.exponentialRampToValueAtTime(f * 0.7, t + d);
  const g = route(ctx, o.connect(filter(ctx, 'bandpass', f * 1.2, 2)), out, p);
  perc(g.gain, t, a, 0.001, d);
}
function thud(ctx, out, t, f, a, d, p = {}) {
  const n = noise(ctx, t, t + d + 0.05);
  const g = route(ctx, n.connect(filter(ctx, 'lowpass', f, 0.8)), out, p);
  perc(g.gain, t, a, 0.002, d);
}
function hiss(ctx, out, t, f0, f1, a, d, q = 1, p = {}) {
  const n = noise(ctx, t, t + d + 0.1);
  const bp = filter(ctx, 'bandpass', f0, q);
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
  const g = route(ctx, n.connect(bp), out, p);
  perc(g.gain, t, a, Math.min(0.05, d * 0.2), d);
  return g;
}

// ---------------------------------------------------------------- 効果音（audio.sfx(name) で鳴らす）
export const SFX = {
  ui_move(ctx, out, t) { I.pluck(ctx, out, t, { f: 1320, vel: 0.3, rev: 0 }); },
  ui_ok(ctx, out, t) { I.musicbox(ctx, out, t, { f: 1175, vel: 0.5 }); I.musicbox(ctx, out, t + 0.07, { f: 1568, vel: 0.45 }); },
  ui_back(ctx, out, t) { I.musicbox(ctx, out, t, { f: 1175, vel: 0.4 }); I.musicbox(ctx, out, t + 0.07, { f: 880, vel: 0.4 }); },
  pause(ctx, out, t) { I.chimebell(ctx, out, t, { f: 784, vel: 0.5, dur: 1.2 }); },
  // ---- トモ
  boot(ctx, out, t) {
    [523, 659, 784, 1047].forEach((f, i) => { const o = osc(ctx, 'square', f, t + i * 0.12, t + i * 0.12 + 0.1); const g = route(ctx, o.connect(filter(ctx, 'lowpass', 2500)), out, { rev: 0.2 }); perc(g.gain, t + i * 0.12, 0.05, 0.003, 0.09); });
    hiss(ctx, out, t + 0.6, 300, 1800, 0.05, 1.4, 2);
  },
  wake(ctx, out, t) {
    const o = osc(ctx, 'sine', 600, t, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
    o.frequency.exponentialRampToValueAtTime(1000, t + 0.4);
    const g = route(ctx, o, out, { rev: 0.3 });
    perc(g.gain, t, 0.08, 0.01, 0.4);
    const o2 = osc(ctx, 'sine', 900, t + 0.3, t + 0.8);
    o2.frequency.exponentialRampToValueAtTime(1600, t + 0.45);
    const g2 = route(ctx, o2, out, { rev: 0.3 });
    perc(g2.gain, t + 0.3, 0.06, 0.01, 0.35);
  },
  stand(ctx, out, t) {
    // サーボのうなり
    const o = osc(ctx, 'sawtooth', 120, t, t + 0.7);
    o.frequency.linearRampToValueAtTime(260, t + 0.5);
    const g = route(ctx, o.connect(filter(ctx, 'bandpass', 900, 3)), out, {});
    adsr(g.gain, t, 0.035, 0.05, 0.4, 0.2);
    tick(ctx, out, t + 0.62, 1800, 0.06, 0.06);
  },
  lantern(ctx, out, t) {
    tick(ctx, out, t, 2600, 0.05, 0.12, { rev: 0.3 });
    hiss(ctx, out, t + 0.08, 900, 300, 0.06, 0.5, 0.7);
    I.musicbox(ctx, out, t + 0.25, { f: 1319, vel: 0.35 });
  },
  pickup(ctx, out, t) {
    [1568, 2093, 2637].forEach((f, i) => I.musicbox(ctx, out, t + i * 0.06, { f, vel: 0.45 }));
  },
  memory(ctx, out, t) {
    // ふわっと広がる和音
    for (const [m, d] of [[62, 0], [69, 0.02], [74, 0.04], [78, 0.06], [81, 0.5], [86, 0.9]]) I.musicbox(ctx, out, t + d, { m, vel: 0.5 });
    for (const m of [50, 57, 62, 66]) I.pad(ctx, out, t, { m, dur: 3.5, vel: 0.7 });
  },
  stow(ctx, out, t) { hiss(ctx, out, t, 2400, 900, 0.12, 0.25, 1.5); tick(ctx, out, t + 0.22, 900, 0.14, 0.08); },
  paper(ctx, out, t) { hiss(ctx, out, t, 3000, 1500, 0.16, 0.18, 0.6); hiss(ctx, out, t + 0.12, 2500, 1200, 0.12, 0.22, 0.6); },
  book(ctx, out, t) { hiss(ctx, out, t, 2200, 900, 0.14, 0.25, 0.6); thud(ctx, out, t + 0.18, 400, 0.3, 0.12); },
  chapter(ctx, out, t) { I.chimebell(ctx, out, t, { m: 74, vel: 0.5, dur: 3 }); I.chimebell(ctx, out, t + 0.5, { m: 81, vel: 0.35, dur: 3 }); },
  key(ctx, out, t) { for (let i = 0; i < 4; i++) tick(ctx, out, t + i * 0.07 + Math.random() * 0.03, 3200 + Math.random() * 1500, 0.12, 0.12, { rev: 0.2 }); },
  unlock(ctx, out, t) { tick(ctx, out, t, 1400, 0.14, 0.05); thud(ctx, out, t + 0.06, 900, 0.2, 0.08); tick(ctx, out, t + 0.12, 2200, 0.08, 0.05); },
  door(ctx, out, t) {
    // きしむ音
    const o = osc(ctx, 'sawtooth', 180, t, t + 0.9);
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(240, t + 0.3);
    o.frequency.linearRampToValueAtTime(150, t + 0.8);
    const g = route(ctx, o.connect(filter(ctx, 'bandpass', 1100, 6)), out, { rev: 0.3 });
    adsr(g.gain, t, 0.09, 0.1, 0.5, 0.2);
    thud(ctx, out, t + 0.85, 300, 0.45, 0.2, { rev: 0.3 });
  },
  lever(ctx, out, t) { thud(ctx, out, t, 250, 0.5, 0.3, { rev: 0.4 }); tick(ctx, out, t + 0.02, 700, 0.2, 0.2, { rev: 0.4 }); thud(ctx, out, t + 0.35, 180, 0.4, 0.4, { rev: 0.5 }); },
  powerUp(ctx, out, t) {
    // 電気が通る：低いうなりが上がって、カチカチと明かりがつく
    const o = osc(ctx, 'sawtooth', 40, t, t + 3.5);
    o.frequency.exponentialRampToValueAtTime(100, t + 1.5);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 400, 2)), out, { rev: 0.3 });
    adsr(g.gain, t, 0.12, 0.8, 1.6, 1.0);
    for (let i = 0; i < 8; i++) tick(ctx, out, t + 0.6 + i * 0.18 + Math.random() * 0.1, 1200 + Math.random() * 900, 0.06, 0.05, { rev: 0.5 });
  },
  chime(ctx, out, t) {
    // 駅の案内のチャイム（ピン・ポーン）
    I.chimebell(ctx, out, t, { m: 79, vel: 0.9, dur: 2.0 });
    I.chimebell(ctx, out, t + 0.62, { m: 76, vel: 0.85, dur: 3.2 });
  },
  shutter(ctx, out, t) {
    const n = noise(ctx, t, t + 3.4);
    const bp = filter(ctx, 'bandpass', 900, 0.8);
    const am = osc(ctx, 'square', 18, t, t + 3.4);
    const ag = ctx.createGain(); ag.gain.value = 0.5;
    const vca = ctx.createGain(); vca.gain.value = 0.5;
    am.connect(ag).connect(vca.gain);
    const g = route(ctx, n.connect(bp).connect(vca), out, { rev: 0.35 });
    adsr(g.gain, t, 0.12, 0.2, 2.8, 0.4);
    thud(ctx, out, t + 3.2, 300, 0.3, 0.3, { rev: 0.4 });
  },
  ticket(ctx, out, t) {
    const o = osc(ctx, 'square', 70, t, t + 0.9);
    const g = route(ctx, o.connect(filter(ctx, 'bandpass', 600, 2)), out, {});
    adsr(g.gain, t, 0.03, 0.05, 0.6, 0.1);
    for (let i = 0; i < 6; i++) tick(ctx, out, t + i * 0.1, 2400, 0.03, 0.03);
    tick(ctx, out, t + 0.85, 1500, 0.1, 0.08);
    I.musicbox(ctx, out, t + 1.0, { f: 1760, vel: 0.4 });
  },
  jump(ctx, out, t) { const o = osc(ctx, 'sine', 500, t, t + 0.18); o.frequency.exponentialRampToValueAtTime(900, t + 0.12); const g = route(ctx, o, out, {}); perc(g.gain, t, 0.08, 0.005, 0.14); },
  land(ctx, out, t, p = {}) { const v = fin(p.vel, 0.6); thud(ctx, out, t, 500, 0.6 * v, 0.1); tick(ctx, out, t, 1100, 0.16 * v, 0.06); },
  // ---- 足音（床の種類ごと）
  step_tile(ctx, out, t) { tick(ctx, out, t, rnd(1700, 2100), 0.1, 0.045); thud(ctx, out, t, 700, 0.18, 0.04); },
  step_concrete(ctx, out, t) { tick(ctx, out, t, rnd(1300, 1600), 0.08, 0.04); thud(ctx, out, t, 500, 0.22, 0.05); },
  step_metal(ctx, out, t) { tick(ctx, out, t, rnd(900, 1200), 0.14, 0.12, { rev: 0.2 }); tick(ctx, out, t, rnd(2400, 2800), 0.06, 0.08); },
  step_wood(ctx, out, t) { tick(ctx, out, t, rnd(500, 650), 0.16, 0.06); thud(ctx, out, t, 400, 0.18, 0.05); },
  step_gravel(ctx, out, t) { for (let i = 0; i < 3; i++) hiss(ctx, out, t + i * 0.015, rnd(2500, 4000), 1500, 0.12, 0.06, 1.2); },
  step_grass(ctx, out, t) { hiss(ctx, out, t, rnd(3000, 4500), 2000, 0.09, 0.1, 0.8); },
  step_water(ctx, out, t) { hiss(ctx, out, t, rnd(1200, 1800), 600, 0.25, 0.15, 1.5); tick(ctx, out, t + 0.02, rnd(500, 800), 0.1, 0.08); },
  // ---- まわりの音
  chirp(ctx, out, t, p = {}) {
    // すずめ：短い「チュン」を 2〜4 回
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rnd(0.09, 0.16);
      const f = rnd(3200, 4300);
      const o = osc(ctx, 'sine', f, tt, tt + 0.08);
      o.frequency.setValueAtTime(f, tt);
      o.frequency.exponentialRampToValueAtTime(f * rnd(1.15, 1.35), tt + 0.02);
      o.frequency.exponentialRampToValueAtTime(f * 0.8, tt + 0.06);
      const g = route(ctx, o, out, { rev: 0.4, ...p });
      perc(g.gain, tt, 0.05 * fin(p.vel, 1), 0.004, 0.06);
    }
  },
  flap(ctx, out, t, p = {}) { for (let i = 0; i < 5; i++) hiss(ctx, out, t + i * 0.07, 900, 500, 0.06, 0.05, 0.8, p); },
  drip(ctx, out, t, p = {}) {
    const f = rnd(1400, 2200);
    const o = osc(ctx, 'sine', f, t, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    const g = route(ctx, o, out, { rev: 0.7, ...p });
    perc(g.gain, t, 0.05 * fin(p.vel, 1), 0.001, 0.08);
  },
  crossing(ctx, out, t, p = {}) {
    // 踏切（カン・カン…）。遠くから
    const n = fin(p.n, 8);
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.42;
      for (const f of [740, 932]) { const o = osc(ctx, 'square', f + (i % 2) * 18, tt, tt + 0.3); const g = route(ctx, o.connect(filter(ctx, 'bandpass', 1400, 3)), out, { rev: 0.6, ...p }); perc(g.gain, tt, 0.07, 0.002, 0.28); }
    }
  },
  rumble(ctx, out, t, p = {}) {
    const d = fin(p.dur, 6);
    const n = noise(ctx, t, t + d, 0.6);
    const g = route(ctx, n.connect(filter(ctx, 'lowpass', 220, 1)), out, { rev: 0.3, ...p });
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.5 * fin(p.vel, 1), t + d * 0.6);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + d);
    // レールの継ぎ目（ガタン、ゴトン）
    for (let i = 0; i < d / 0.55; i++) { const tt = t + i * 0.55 + (i % 2) * 0.12; thud(ctx, out, tt, 180, 0.18 * Math.min(1, (i * 0.55) / (d * 0.6)), 0.12, p); }
  },
  brake(ctx, out, t, p = {}) { const g = hiss(ctx, out, t, 4200, 3400, 0.08, 2.2, 8, { rev: 0.4, ...p }); g.gain.setTargetAtTime(FLOOR, t + 1.8, 0.4); },
  doorOpen(ctx, out, t, p = {}) {
    hiss(ctx, out, t, 1800, 700, 0.18, 0.9, 0.7, { rev: 0.4, ...p });
    thud(ctx, out, t + 0.85, 250, 0.25, 0.2, p);
    I.chimebell(ctx, out, t + 0.1, { m: 84, vel: 0.35, dur: 0.8 });
    I.chimebell(ctx, out, t + 0.35, { m: 88, vel: 0.35, dur: 0.8 });
  },
  horn(ctx, out, t, p = {}) {
    for (const f of [311, 370]) { const o = osc(ctx, 'sawtooth', f, t, t + 1.3); const g = route(ctx, o.connect(filter(ctx, 'lowpass', 1200, 1)), out, { rev: 0.6, ...p }); adsr(g.gain, t, 0.04, 0.05, 1.0, 0.2); }
  },
  clockTick(ctx, out, t) { tick(ctx, out, t, 2200, 0.25, 0.05, { rev: 0.5 }); tick(ctx, out, t + 0.012, 3400, 0.12, 0.03, { rev: 0.5 }); },
  // 旧デモの音（使っていないが、雛形の確認台のために残す）
  coin(ctx, out, t) { I.musicbox(ctx, out, t, { f: 1319 }); I.musicbox(ctx, out, t + 0.07, { f: 1976 }); },
  powerup(ctx, out, t) { [523, 659, 784, 1047, 1319].forEach((f, i) => I.musicbox(ctx, out, t + i * 0.055, { f, vel: 0.55 })); },
  hit(ctx, out, t) { thud(ctx, out, t, 300, 0.3, 0.2); },
  explode(ctx, out, t) { thud(ctx, out, t, 400, 0.5, 0.8); },
};
