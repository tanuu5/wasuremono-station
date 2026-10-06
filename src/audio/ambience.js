// 環境音の層。ずっと鳴り続ける音（風・雨・低い持続音・機械のうなり）を、層ごとの音量で混ぜる。
// audio.setAmbience({ wind: 0.6, rain: 1 }) で層の大きさ（0〜1）を変える。渡さなかった層は消える。
// 層を足すときは LAYERS に「作る関数」と「最大の音量（level）」を書く。作る関数は (ctx, A) → 出口の GainNode。
// （ホラーゲームの環境音を元にした。作品に合わせて足す・消す）

export const LAYERS = {
  /** 風：ゆっくり揺れる帯域のノイズ。 */
  wind: { level: 0.22, build(ctx, A) {
    const bp = A.filter('bandpass', 380, 0.8);
    A.noise().connect(bp);
    A.lfo(0.07, 180, bp.frequency);
    return bp;
  } },
  /** 大きな建物の中の空気（こもった低い音）。 */
  room: { level: 0.12, build(ctx, A) {
    const lp = A.filter('lowpass', 260, 0.7);
    A.noise(0.5).connect(lp);
    const g = A.gain(1);
    lp.connect(g);
    A.lfo(0.05, 0.25, g.gain);
    return g;
  } },
  /** 夏の昼の蝉（アブラゼミのジーという音と、ミンミンゼミ）。 */
  cicada: { level: 0.09, build(ctx, A) {
    const mix = A.gain(1);
    // ジー：高い帯域のノイズを速く震わせる
    const bp = A.filter('bandpass', 5200, 1.6);
    const vca = A.gain(0.6);
    A.noise(1.1).connect(bp).connect(vca).connect(mix);
    A.lfo(31, 0.35, vca.gain);
    const swell = A.gain(0.7);
    vca.disconnect();
    vca.connect(swell).connect(mix);
    A.lfo(0.11, 0.3, swell.gain);
    // ミーン：音の高さが揺れる笛のような音を、ゆっくり出し入れ
    const o = A.osc('sine', 2650);
    A.lfo(5.5, 140, o.frequency);
    const mg = A.gain(0.0);
    o.connect(mg).connect(mix);
    A.lfo(0.21, 0.05, mg.gain);
    return mix;
  } },
  /** 夕方のヒグラシ（カナカナカナ…）。 */
  higurashi: { level: 0.08, build(ctx, A) {
    const mix = A.gain(1);
    for (const [f, rate, ph] of [[4300, 11, 0.13], [3900, 9.5, 0.09]]) {
      const o = A.osc('sine', f);
      A.lfo(rate, 260, o.frequency);
      const am = A.gain(0.0);
      o.connect(am).connect(mix);
      A.lfo(rate, 0.5, am.gain);
      const phrase = A.gain(0.5);
      am.disconnect();
      am.connect(phrase).connect(mix);
      A.lfo(ph, 0.5, phrase.gain);
    }
    return mix;
  } },
  /** 低い持続音（地下の広さ）。 */
  drone: { level: 0.07, build(ctx, A) {
    const lp = A.filter('lowpass', 320, 0.9);
    for (const [f, det] of [[55, 0], [82.6, 4], [110.3, -3]]) {
      const o = A.osc(f > 100 ? 'sine' : 'sawtooth', f);
      o.detune.value = det;
      o.connect(A.gain(f > 100 ? 0.25 : 0.1)).connect(lp);
    }
    A.lfo(0.05, 100, lp.frequency);
    return lp;
  } },
  /** 蛍光灯・機械のうなり（電気が戻ったあと）。 */
  hum: { level: 0.02, build(ctx, A) {
    const mix = A.gain(1);
    for (const [f, v] of [[100, 0.5], [200, 0.25], [300, 0.12]]) A.osc('sine', f).connect(A.gain(v)).connect(mix);
    return mix;
  } },
  /** 地下の水の流れ（ちょろちょろ）。 */
  water: { level: 0.08, build(ctx, A) {
    const bp = A.filter('bandpass', 1400, 1.2);
    A.noise(1.4).connect(bp);
    A.lfo(0.9, 500, bp.frequency);
    const g = A.gain(0.8);
    bp.connect(g);
    A.lfo(2.3, 0.3, g.gain);
    return g;
  } },
};

/** 層を全部作って、音量 0 で鳴らしておく。戻り値 { 層の名前: { gain, level } }。 */
export function buildAmbience(ctx, out) {
  const n = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  let s = 4242;
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0; // ピンクに近いノイズ（ざらつきが自然）
    for (let i = 0; i < n; i++) {
      const w = ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  }
  const A = {
    gain: (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; },
    filter: (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
    noise: (rate = 1) => { const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = rate; src.start(ctx.currentTime, Math.random() * 2); return src; },
    osc: (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; },
    lfo: (rate, depth, param) => { const o = A.osc('sine', rate); o.connect(A.gain(depth)).connect(param); return o; },
  };
  const layers = {};
  for (const [name, L] of Object.entries(LAYERS)) {
    const g = A.gain(0);
    L.build(ctx, A).connect(g);
    g.connect(out.dry);
    g.connect(A.gain(0.4)).connect(out.wet);
    layers[name] = { gain: g, level: L.level };
  }
  return layers;
}
