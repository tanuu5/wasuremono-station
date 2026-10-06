// 起動の文字（黒い画面に、1 行ずつ打たれていく）。時間はゲームの update(dt) で進む（撮影でも同じ）。
import { t } from '../core/i18n.js';

export class Boot {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', '<div id="boot" class="hidden"><pre></pre></div>');
    this.el = root.querySelector('#boot');
    this.pre = this.el.querySelector('pre');
    this.lines = [];
    this.done = true;
  }
  show(keys) {
    this.lines = keys.map((k) => t(k));
    this.line = 0;
    this.chars = 0;
    this.wait = 0;
    this.done = false;
    this.el.classList.remove('hidden');
    this.render();
  }
  hide() { this.el.classList.add('hidden'); this.done = true; }
  update(dt) {
    if (this.done || this.el.classList.contains('hidden')) return;
    if (this.wait > 0) { this.wait -= dt; if (this.wait <= 0) { this.line++; this.chars = 0; } this.render(); return; }
    const cur = this.lines[this.line];
    if (cur === undefined) { this.done = true; this.render(); return; }
    this.chars += dt * 26;
    if (this.chars >= [...cur].length) { this.chars = [...cur].length; this.wait = 0.55; }
    this.render();
  }
  render() {
    const out = [];
    for (let i = 0; i < this.lines.length; i++) {
      if (i < this.line) out.push(this.lines[i]);
      else if (i === this.line) out.push([...this.lines[i]].slice(0, Math.floor(this.chars)).join('') + (Math.floor(performance.now() / 400) % 2 ? '▌' : ' '));
    }
    this.pre.textContent = out.join('\n');
  }
}
