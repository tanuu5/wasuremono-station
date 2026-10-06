// ゲーム中の表示：左上に手帳と忘れ物の数、左下に操作の案内。
import { t, onLangChange } from '../core/i18n.js';

export class Hud {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', `
<div id="hud" class="hidden">
  <div class="count"><span class="book" aria-hidden="true"></span><span class="n"></span></div>
  <div class="hints">
    <span><i data-glyph="move"></i></span>
    <span><i data-glyph="look"></i></span>
    <span><i data-glyph="interact"></i><b data-i18n="howto.interact">${t('howto.interact')}</b></span>
    <span><i data-glyph="jump"></i><b data-i18n="howto.jump">${t('howto.jump')}</b></span>
    <span><i data-glyph="action"></i><b data-i18n="howto.run">${t('howto.run')}</b></span>
    <span><i data-glyph="notebook"></i><b data-i18n="hud.notebook">${t('hud.notebook')}</b></span>
  </div>
</div>`);
    this.el = root.querySelector('#hud');
    this.countEl = this.el.querySelector('.count');
    this.nEl = this.el.querySelector('.count .n');
    this.n = 0;
    this.flashT = 0;
    this.hintsEl = this.el.querySelector('.hints');
    this.idle = 0;
    onLangChange(() => this.setCount(this.n));
  }
  show(on) { this.el.classList.toggle('hidden', !on); }
  setCount(n) {
    if (n !== this.n) this.flashT = 2.5;
    this.n = n;
    this.nEl.textContent = t('hud.count', { n });
  }
  /** 毎フレーム：数が変わったら少し大きく。しばらく動かしていたら操作の案内を薄く。 */
  update(dt, moving) {
    this.flashT = Math.max(0, this.flashT - dt);
    this.countEl.classList.toggle('flash', this.flashT > 0);
    this.idle = moving ? this.idle + dt : Math.max(0, this.idle - dt * 3);
    this.hintsEl.style.opacity = this.idle > 20 ? '0.25' : '1';
  }
}
