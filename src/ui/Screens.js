// タイトル・一時停止・設定・あそびかたの画面。上に重なる画面（モーダル）は積み重ねで管理し、
// いちばん上の画面を MenuNav が操作する。文言はすべて i18n のキー（data-i18n）で書く。
//
//   const screens = new Screens(uiRoot, { onStart, onResume, onRetry, onToTitle, onSettings });
//   screens.showTitle(true)  screens.open('pause')  screens.back()  screens.current()
import { t, applyDom, LANGS } from '../core/i18n.js';
import { settings, QUALITIES, PAD_TYPES } from '../core/settings.js';

const opt = (v, key) => `<option value="${v}" data-i18n="${key}">${t(key)}</option>`;
const slider = (k) => `<label class="row"><span data-i18n="settings.${k}">${t('settings.' + k)}</span>
  <input type="range" min="0" max="100" step="5" data-vol="${k}" value="${Math.round(settings.volume[k] * 100)}"></label>`;

export class Screens {
  constructor(root, cb) {
    this.cb = cb;
    this.stack = [];
    root.insertAdjacentHTML('beforeend', `
<section id="title" class="screen hidden">
  <h1 data-i18n="game.title">${t('game.title')}</h1>
  <div class="tagline" aria-hidden="true"></div>
  <p class="sub" data-i18n="game.tagline">${t('game.tagline')}</p>
  <div class="menu">
    <button data-act="continue" class="continue hidden" data-i18n="title.continue">${t('title.continue')}</button>
    <button data-act="start" data-i18n="title.start">${t('title.start')}</button>
    <button data-act="howto" data-i18n="title.howto">${t('title.howto')}</button>
    <button data-act="settings" data-i18n="title.settings">${t('title.settings')}</button>
  </div>
  <footer class="copyright">© 2026 たぬ</footer>
</section>
<section id="m-pause" class="modal hidden"><div class="card">
  <h2 data-i18n="pause.title">${t('pause.title')}</h2>
  <button data-act="resume" data-i18n="pause.resume">${t('pause.resume')}</button>
  <button data-act="retry" data-i18n="pause.retry">${t('pause.retry')}</button>
  <button data-act="settings" data-i18n="title.settings">${t('title.settings')}</button>
  <button data-act="toTitle" data-i18n="pause.toTitle">${t('pause.toTitle')}</button>
</div></section>
<section id="m-settings" class="modal hidden"><div class="card">
  <h2 data-i18n="settings.title">${t('settings.title')}</h2>
  ${slider('master')}${slider('music')}${slider('sfx')}
  <label class="row"><span data-i18n="settings.quality">${t('settings.quality')}</span>
    <select data-set="quality">${QUALITIES.map((q) => opt(q, 'settings.quality.' + q)).join('')}</select></label>
  <label class="row"><span data-i18n="settings.lang">${t('settings.lang')}</span>
    <select data-set="lang">${LANGS.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select></label>
  <label class="row"><span data-i18n="settings.pad">${t('settings.pad')}</span>
    <select data-set="padType">${PAD_TYPES.map((p) => opt(p, 'settings.pad.' + p)).join('')}</select></label>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>
<section id="m-howto" class="modal hidden"><div class="card" data-scroll>
  <h2 data-i18n="howto.title">${t('howto.title')}</h2>
  <p data-i18n="howto.body">${t('howto.body')}</p>
  <dl class="keys">
    <dt data-glyph="move"></dt><dd data-i18n="howto.move">${t('howto.move')}</dd>
    <dt data-glyph="look"></dt><dd data-i18n="howto.look">${t('howto.look')}</dd>
    <dt data-glyph="interact"></dt><dd data-i18n="howto.interact">${t('howto.interact')}</dd>
    <dt data-glyph="jump"></dt><dd data-i18n="howto.jump">${t('howto.jump')}</dd>
    <dt data-glyph="action"></dt><dd data-i18n="howto.run">${t('howto.run')}</dd>
    <dt data-glyph="notebook"></dt><dd data-i18n="howto.notebook">${t('howto.notebook')}</dd>
    <dt data-glyph="pause"></dt><dd data-i18n="howto.pause">${t('howto.pause')}</dd>
  </dl>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>`);
    this.title = root.querySelector('#title');
    this.modals = { pause: root.querySelector('#m-pause'), settings: root.querySelector('#m-settings'), howto: root.querySelector('#m-howto') };

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      cb.onClick?.(act);
      if (act === 'start') cb.onStart?.();
      else if (act === 'continue') cb.onContinue?.();
      else if (act === 'howto') this.open('howto');
      else if (act === 'settings') this.open('settings');
      else if (act === 'resume') cb.onResume?.();
      else if (act === 'retry') cb.onRetry?.();
      else if (act === 'toTitle') cb.onToTitle?.();
      else if (act === 'back') this.back();
    });
    const s = this.modals.settings;
    for (const r of s.querySelectorAll('[data-vol]')) {
      r.addEventListener('input', () => { settings.volume[r.dataset.vol] = +r.value / 100; cb.onSettings?.('volume'); });
    }
    for (const sel of s.querySelectorAll('[data-set]')) {
      sel.addEventListener('change', () => { settings[sel.dataset.set] = sel.value; cb.onSettings?.(sel.dataset.set); });
    }
  }

  /** 設定画面の表示を、今の設定にそろえる（開くたびに呼ぶ）。 */
  syncSettings() {
    const s = this.modals.settings;
    for (const r of s.querySelectorAll('[data-vol]')) r.value = Math.round(settings.volume[r.dataset.vol] * 100);
    for (const sel of s.querySelectorAll('[data-set]')) sel.value = settings[sel.dataset.set];
  }

  showTitle(on) { this.title.classList.toggle('hidden', !on); }

  /** クリアしたあとは、タイトルの副題を「おかえりなさい」に。 */
  setCleared(on) {
    const sub = this.title.querySelector('.sub');
    if (sub) { sub.dataset.i18n = on ? 'title.cleared' : 'game.tagline'; sub.textContent = t(sub.dataset.i18n); }
  }

  /** タイトルの「つづきから」を出すか。 */
  setContinue(on) { this.title.querySelector('.continue')?.classList.toggle('hidden', !on); }

  open(name) {
    const m = this.modals[name];
    if (name === 'settings') this.syncSettings();
    applyDom(m);
    m.classList.remove('hidden');
    // 同じ画面を 2 回積まない（2 回積むと、もどる 1 回では閉じきらない）。開いていれば、いちばん上へ
    const i = this.stack.indexOf(m);
    if (i >= 0) this.stack.splice(i, 1);
    this.stack.push(m);
    if (i < 0) this.cb.onModal?.(name, true);
  }

  /** いちばん上の画面を閉じる。閉じたら true。 */
  back() {
    const m = this.stack.pop();
    if (!m) return false;
    m.classList.add('hidden');
    this.cb.onModal?.(m.id.slice(2), false);
    return true;
  }

  closeAll() { while (this.back()); }

  get top() { return this.stack[this.stack.length - 1] || null; }
  isOpen(name) { return this.stack.includes(this.modals[name]); }

  /** MenuNav が操作する画面：いちばん上のモーダル、なければ（出ていれば）タイトルのメニュー。 */
  current() {
    if (this.top) return this.top;
    return this.title.classList.contains('hidden') ? null : this.title.querySelector('.menu');
  }
}
