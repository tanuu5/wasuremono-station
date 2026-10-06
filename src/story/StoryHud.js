// 物語のための表示：目的・字幕・「調べる」の案内・入手の知らせ・章の見出し・手紙（メモ）。
// 出し入れの濃さはゲームの時間（update(dt)）で動かす（CSS のアニメーションは撮影のときに止められないため）。
// ホラーゲーム（2026-10）の Hud を、どの作品でも使える形にしたもの。見た目は story.css。
//
//   const story = new StoryHud(uiRoot, { onGlyphs: () => refreshGlyphs(input, settings) });
//   story.say('intro.line1')          字幕（出しておく時間は文字数から。戻り値は秒）
//   story.setPrompt('prompt.door')    調べるの案内（null で消す）。glyph は interact の動作
//   story.setObjective('obj.find')    目的（しばらく出して薄くなる）
//   story.toast('item.key')  story.chapter('ch1.title', 'ch1.sub')  story.openNote('note.letter1')
//   毎フレーム story.update(dt)
import { t, onLangChange } from '../core/i18n.js';

const fadeTo = (cur, want, dt, speed = 3) => (cur < want ? Math.min(want, cur + dt * speed) : Math.max(want, cur - dt * speed));

export class StoryHud {
  constructor(root, { onGlyphs, interactGlyph = 'interact', verticalNote = (lang) => lang === 'ja' } = {}) {
    this.onGlyphs = onGlyphs;
    this.verticalNote = verticalNote;
    root.insertAdjacentHTML('beforeend', `
<div id="story" class="hidden">
  <div class="objective"><span class="lbl" data-i18n="story.objective">${t('story.objective')}</span><span class="txt"></span></div>
  <div class="chapter"><div class="c1"></div><div class="c2"></div></div>
  <div class="toast"></div>
  <div class="prompt"><i data-glyph="${interactGlyph}"></i><span class="txt"></span></div>
  <div class="sub"><span class="txt"></span></div>
</div>
<section id="m-note" class="modal note hidden" data-nav-skip><div class="paper"><div class="body"></div></div>
  <div class="close"><i data-glyph="${interactGlyph}"></i><span data-i18n="story.noteClose">${t('story.noteClose')}</span></div></section>`);
    this.el = root.querySelector('#story');
    const q = (s) => this.el.querySelector(s);
    this.obj = { el: q('.objective'), txt: q('.objective .txt'), a: 0, hold: 0, key: null };
    this.sub = { el: q('.sub'), txt: q('.sub .txt'), a: 0, hold: 0, key: null, vars: null };
    this.prompt = { el: q('.prompt'), txt: q('.prompt .txt'), a: 0, key: null, want: 0 };
    this.toastS = { el: q('.toast'), a: 0, hold: 0, key: null, vars: null };
    this.chap = { el: q('.chapter'), c1: q('.chapter .c1'), c2: q('.chapter .c2'), a: 0, hold: 0, k1: null, k2: null };
    this.noteEl = root.querySelector('#m-note');
    this.noteBody = this.noteEl.querySelector('.body');
    this.noteKey = null;
    this.noteEl.addEventListener('click', () => { this.noteClicked = true; }); // クリック・タップでも閉じられる
    onLangChange(() => this.refreshText());
    for (const k of ['obj', 'sub', 'prompt', 'toastS', 'chap']) this[k].el.style.opacity = '0';
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  refreshText() {
    if (this.obj.key) this.obj.txt.textContent = t(this.obj.key, this.obj.vars || {});
    if (this.sub.key) this.sub.txt.textContent = t(this.sub.key, this.sub.vars || {});
    if (this.prompt.key) this.prompt.txt.textContent = t(this.prompt.key);
    if (this.toastS.key) this.toastS.el.textContent = t(this.toastS.key, this.toastS.vars || {});
    if (this.chap.k1 || this.chap.k2) { this.chap.c1.textContent = this.chap.k1 ? t(this.chap.k1) : ''; this.chap.c2.textContent = this.chap.k2 ? t(this.chap.k2) : ''; }
    if (this.noteKey) this.renderNote();
  }

  /** 目的を変える（hold 秒出して、薄くする）。 */
  setObjective(key, { hold = 7, vars = null } = {}) {
    this.obj.key = key;
    this.obj.vars = vars;
    this.obj.txt.textContent = key ? t(key, vars || {}) : '';
    this.obj.hold = key ? hold : 0;
  }
  /** 目的をもう一度見せる（一時停止を閉じたときなど）。 */
  flashObjective(hold = 4) { if (this.obj.key) this.obj.hold = hold; }

  /** 字幕。sec は出しておく時間（省略時は文字数から）。戻り値は出しておく秒数。 */
  say(key, { sec, vars } = {}) {
    this.sub.key = key;
    this.sub.vars = vars || null;
    const text = key ? t(key, vars || {}) : '';
    this.sub.txt.textContent = text;
    this.sub.hold = key ? sec ?? Math.max(2.2, 1.2 + [...text].length * 0.11) : 0;
    return this.sub.hold;
  }
  get speaking() { return this.sub.hold > 0; }

  /** 「調べる」の案内。key が null なら消す。 */
  setPrompt(key) {
    if (key !== this.prompt.key) {
      this.prompt.key = key;
      if (key) this.prompt.txt.textContent = t(key);
      this.onGlyphs?.();
    }
    this.prompt.want = key ? 1 : 0;
  }

  /** 入手などの短い知らせ。 */
  toast(key, vars, hold = 3.2) {
    this.toastS.key = key;
    this.toastS.vars = vars || null;
    this.toastS.el.textContent = t(key, vars || {});
    this.toastS.hold = hold;
  }

  /** 章の見出し（大きな字と、小さな副題）。 */
  chapter(k1, k2 = null, hold = 4) {
    Object.assign(this.chap, { k1, k2, hold });
    this.chap.c1.textContent = k1 ? t(k1) : '';
    this.chap.c2.textContent = k2 ? t(k2) : '';
  }

  /** 手紙（メモ）を開く。日本語は縦書き（verticalNote で変えられる）。閉じるのは closeNote()。 */
  openNote(key) {
    this.noteKey = key;
    this.noteClicked = false;
    this.renderNote();
    this.noteEl.classList.remove('hidden');
    this.onGlyphs?.();
  }
  renderNote() {
    const text = t(this.noteKey);
    this.noteBody.textContent = text;
    this.noteEl.classList.toggle('vertical', !!this.verticalNote(document.documentElement.lang));
    // 長い手紙は、横書きの広い画面で 2 段に組む（1 枚に収める。パッドやキーではスクロールしにくいので）
    this.noteEl.classList.toggle('long', text.split('\n').length > 14);
  }
  closeNote() { this.noteKey = null; this.noteEl.classList.add('hidden'); }
  get noteOpen() { return !!this.noteKey; }

  update(dt) {
    const fade = (s, want, inSpeed, outSpeed = inSpeed) => { s.a = fadeTo(s.a, want, dt, want ? inSpeed : outSpeed); s.el.style.opacity = s.a.toFixed(3); };
    for (const s of [this.obj, this.sub, this.toastS, this.chap]) s.hold = Math.max(0, s.hold - dt);
    fade(this.obj, this.obj.hold > 0 ? 1 : 0, 2, 0.6);
    fade(this.sub, this.sub.hold > 0 ? 1 : 0, 4);
    fade(this.prompt, this.prompt.want, 6);
    fade(this.toastS, this.toastS.hold > 0 ? 1 : 0, 3);
    fade(this.chap, this.chap.hold > 0 ? 1 : 0, 0.8, 0.6);
  }

  /** すぐ全部消す（場面の切り替えなど）。 */
  clear() {
    this.say(null);
    this.setPrompt(null);
    this.toastS.hold = 0;
    this.chap.hold = 0;
    this.closeNote();
  }
}
