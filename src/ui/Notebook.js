// 手帳：忘れ物の一覧（拾ったものは絵と思い出、まだのものは「？？？」と心当たり）と、構内図（トモの居場所）。
// Screens の modals に入れて、MenuNav（パッド・キーボード）で操作できるようにする。
import { t, applyDom, onLangChange } from '../core/i18n.js';
import { ITEMS } from '../game/items.js';
import { drawPlan } from '../game/world/dress.js';

export class Notebook {
  constructor(root, screens) {
    this.screens = screens;
    root.insertAdjacentHTML('beforeend', `
<section id="m-notebook" class="modal notebook hidden"><div class="book">
  <div class="page p-items">
    <div class="slots">${ITEMS.map((it, i) => `<button class="slot" data-slot="${i}"><img alt=""><span></span></button>`).join('')}</div>
    <div class="detail"><h3></h3><p class="where"></p><p class="desc"></p><div class="mem"></div></div>
  </div>
  <div class="page p-map hidden"><canvas width="1024" height="768"></canvas><p class="legend"></p></div>
  <div class="tabs">
    <button data-tab="items" data-i18n="nb.items">${t('nb.items')}</button>
    <button data-tab="map" data-i18n="nb.map">${t('nb.map')}</button>
  </div>
  <button class="close" data-act="back" data-i18n="ui.close">${t('ui.close')}</button>
</div></section>`);
    this.el = root.querySelector('#m-notebook');
    screens.modals.notebook = this.el;
    this.tab = 'items';
    this.sel = 0;
    this.found = new Set();
    this.thumbs = {};
    this.pos = null;
    this.el.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { this.setTab(tb.dataset.tab); return; }
      const sl = e.target.closest('[data-slot]');
      if (sl) { this.sel = +sl.dataset.slot; this.render(); }
    });
    // パッド・キーボードで項目に枠が来たら、その忘れ物を見せる
    this.el.addEventListener('focusin', () => {});
    onLangChange(() => { if (!this.el.classList.contains('hidden')) this.render(); });
  }

  open(state, tab = 'items') {
    this.found = state.found;
    this.thumbs = state.thumbs || this.thumbs;
    this.pos = state.pos;
    this.floor = state.floor;
    this.items = state.items;
    this.objective = state.objective;
    this.setTab(tab, false);
    // Game.setState('notebook') が先に開いている。ここでもう一度開くと積み重ねに 2 回入り、
    // 「とじる」で 1 回閉じても開いたままの扱いになる（スマホで操作できなくなっていた）
    if (!this.screens.isOpen('notebook')) this.screens.open('notebook');
  }

  setTab(tab, render = true) {
    this.tab = tab;
    this.el.querySelector('.p-items').classList.toggle('hidden', tab !== 'items');
    this.el.querySelector('.p-map').classList.toggle('hidden', tab !== 'map');
    for (const b of this.el.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
    this.render();
  }

  /** 毎フレーム（開いているとき）：パッドで選んでいる枠の項目を見せる。 */
  update() {
    const f = this.el.querySelector('.slot.gp-focus');
    if (f && +f.dataset.slot !== this.sel) { this.sel = +f.dataset.slot; this.render(); }
  }

  render() {
    applyDom(this.el);
    if (this.tab === 'items') {
      this.el.querySelectorAll('.slot').forEach((b, i) => {
        const it = ITEMS[i], got = this.found.has(it.id);
        const img = b.querySelector('img');
        if (got && this.thumbs[it.id]) { img.src = this.thumbs[it.id]; img.style.visibility = 'visible'; } else img.style.visibility = 'hidden';
        b.querySelector('span').textContent = got ? t(`item.${it.id}.name`) : t('item.unknown');
        b.classList.toggle('got', got);
        b.classList.toggle('sel', i === this.sel);
      });
      const it = ITEMS[this.sel], got = this.found.has(it.id);
      const d = this.el.querySelector('.detail');
      d.querySelector('h3').textContent = got ? t(`item.${it.id}.name`) : t('item.unknown');
      d.querySelector('.where').textContent = got ? t(`item.${it.id}.where`) : t('item.hint', { where: t(`item.${it.id}.where`) });
      d.querySelector('.desc').textContent = got ? t(`item.${it.id}.desc`) : '';
      d.querySelector('.mem').innerHTML = got ? ['m1', 'm2', 'm3'].map((k) => `<p>${escapeHtml(t(`item.${it.id}.${k}`))}</p>`).join('') : '';
    } else this.drawMap();
  }

  drawMap() {
    const c = this.el.querySelector('canvas');
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    g.fillStyle = '#f3efe2';
    g.fillRect(0, 0, w, h);
    const tr = drawPlan(g, w, h, 0, { zoom: true });
    // 忘れ物（まだのものは ？、拾ったものは ✓）
    for (const it of ITEMS) {
      const [x, , z] = it.pos;
      const [px, py] = tr(x, z);
      const got = this.found.has(it.id);
      g.fillStyle = got ? 'rgba(80,120,90,0.85)' : 'rgba(214,120,40,0.9)';
      g.beginPath(); g.arc(px, py, 15, 0, 6.28); g.fill();
      g.fillStyle = '#fff';
      g.font = 'bold 20px sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(got ? '✓' : '?', px, py + 1);
    }
    // 目的の場所
    if (this.objective) {
      const [px, py] = tr(this.objective[0], this.objective[2]);
      g.strokeStyle = 'rgba(214,60,60,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.arc(px, py, 26, 0, 6.28); g.stroke();
    }
    // トモ
    if (this.pos) {
      const [px, py] = tr(this.pos.x, this.pos.z);
      g.fillStyle = '#2f9fd0';
      g.beginPath(); g.arc(px, py, 14, 0, 6.28); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#123';
      g.font = 'bold 24px sans-serif';
      g.fillText(t('nb.you') + ` (${t('nb.floor.' + this.floor)})`, px, py - 30);
    }
    this.el.querySelector('.legend').textContent = t('nb.legend');
  }
}

function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
