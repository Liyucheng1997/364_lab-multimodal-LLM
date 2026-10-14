import './style.css';
import gsap from 'gsap';
import { Engine } from './core/engine.js';
import { UI } from './core/ui.js';
import { chapters } from './chapters/index.js';

// 讲解动画是"状态式"的：标签页被切走/卡顿后，直接按真实时间跳到应有状态，而不是慢放。
gsap.ticker.lagSmoothing(0);

const engine = new Engine(document.getElementById('stage'));

const state = { ch: -1, step: 0, inst: null, widgetCleanup: null, busy: false, pending: null };

const ui = new UI({
  chapters,
  onChapter: (ci, si) => open(ci, si),
  onStep: (d) => stepBy(d),
  onPanelToggle: () => syncInset(),
  onBloom: (on) => engine.setBloom(on),
});

function syncInset() {
  const { right, bottom } = ui.panelInset();
  engine.setInset(right, bottom);
}

async function open(ci, si = 0) {
  ci = Math.max(0, Math.min(chapters.length - 1, ci));
  const Ch = chapters[ci];
  si = Math.max(0, Math.min(Ch.steps.length - 1, si));
  if (state.busy) {
    state.pending = [ci, si];
    return;
  }
  if (ci === state.ch && state.inst) {
    goStep(si);
    return;
  }
  state.busy = true;
  cleanupWidget();
  if (state.inst) state.inst.dispose();
  engine.clearPickables();
  state.inst = null;
  state.ch = ci;
  ui.setChapter(ci, Ch);
  const inst = new Ch(engine, { ui, open, toast: (m) => ui.toast(m) });
  try {
    ui.loading(true, '正在准备 3D 场景…', true);
    await inst.init();
    inst.build();
  } catch (err) {
    console.error(err);
    ui.toast('场景加载失败：' + err.message, 5000);
  } finally {
    ui.loading(false);
  }
  state.inst = inst;
  state.step = -1;
  state.busy = false;
  goStep(si, true);
  if (state.pending) {
    const [a, b] = state.pending;
    state.pending = null;
    open(a, b);
  }
}

function cleanupWidget() {
  if (typeof state.widgetCleanup === 'function') state.widgetCleanup();
  state.widgetCleanup = null;
  ui.clearWidget();
}

function goStep(si, first = false) {
  const Ch = chapters[state.ch];
  const inst = state.inst;
  if (!inst) return;
  const prev = state.step;
  state.step = si;
  ui.setStep(state.ch, Ch, si);
  const s = Ch.steps[si];
  engine.flyTo(s.cam, first ? 1.8 : 1.5);
  cleanupWidget();
  inst.newTimeline();
  inst.step = si;
  try {
    inst.go(si, prev);
    state.widgetCleanup = inst.widget(si, document.getElementById('widget'));
  } catch (err) {
    console.error(err);
  }
  history.replaceState(null, '', `#${state.ch + 1}-${si + 1}`);
}

function stepBy(d) {
  const Ch = chapters[state.ch];
  if (!Ch) return;
  const n = state.step + d;
  if (n < 0) {
    if (state.ch > 0) open(state.ch - 1, chapters[state.ch - 1].steps.length - 1);
    return;
  }
  if (n >= Ch.steps.length) {
    if (state.ch < chapters.length - 1) open(state.ch + 1, 0);
    return;
  }
  goStep(n);
}

window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') {
    e.preventDefault();
    stepBy(1);
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    stepBy(-1);
  } else if (e.key === 'h' || e.key === 'H') {
    document.getElementById('btn-panel').click();
  } else if (e.key === 'f' || e.key === 'F') {
    document.getElementById('btn-full').click();
  }
});

window.addEventListener('resize', () => syncInset());

function parseHash() {
  const m = location.hash.match(/^#(\d+)(?:-(\d+))?/);
  if (!m) return [0, 0];
  return [Number(m[1]) - 1, Number(m[2] || 1) - 1];
}

window.addEventListener('hashchange', () => {
  const [c, s] = parseHash();
  if (c !== state.ch || s !== state.step) open(c, s);
});

syncInset();
const [c0, s0] = parseHash();
open(c0, s0);
// 调试用：在控制台访问；tick() 可在页面不可见（rAF 暂停）时手动推进动画并渲染一帧
window.__app = {
  engine,
  state,
  open,
  tick() {
    gsap.ticker.tick();
    engine._frame();
  },
};
