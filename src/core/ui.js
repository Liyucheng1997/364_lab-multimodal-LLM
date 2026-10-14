// 界面层：顶部章节目录、右侧讲解面板、步骤导航、提示气泡、加载遮罩。
const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ chapters, onChapter, onStep, onPanelToggle, onBloom }) {
    this.chapters = chapters;
    this.onChapter = onChapter;
    this.onStep = onStep;
    this.app = $('app');
    this.nav = $('chapnav');
    this.dots = $('step-dots');
    this.content = $('step-content');
    this.widgetEl = $('widget');
    this.prevBtn = $('btn-prev');
    this.nextBtn = $('btn-next');
    this.count = $('step-count');
    this.scroller = document.querySelector('.panel-scroll');

    chapters.forEach((Ch, i) => {
      const b = document.createElement('button');
      b.className = 'chap-pill';
      b.title = Ch.meta.title;
      b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="t">${Ch.meta.short}</span>`;
      b.addEventListener('click', () => onChapter(i, 0));
      this.nav.appendChild(b);
    });

    this.prevBtn.addEventListener('click', () => onStep(-1));
    this.nextBtn.addEventListener('click', () => onStep(+1));

    const panelBtn = $('btn-panel');
    panelBtn.classList.add('on');
    panelBtn.addEventListener('click', () => {
      const hidden = this.app.classList.toggle('panel-hidden');
      panelBtn.classList.toggle('on', !hidden);
      onPanelToggle?.(!hidden);
    });
    const bloomBtn = $('btn-bloom');
    bloomBtn.addEventListener('click', () => {
      const on = !bloomBtn.classList.contains('on');
      bloomBtn.classList.toggle('on', on);
      onBloom?.(on);
    });
    $('btn-full').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    });
  }

  get panelVisible() {
    return !this.app.classList.contains('panel-hidden');
  }

  setChapter(index, Ch) {
    [...this.nav.children].forEach((b, i) => b.classList.toggle('active', i === index));
    this.nav.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    $('ch-kicker').textContent = `CHAPTER ${String(index + 1).padStart(2, '0')} / ${String(this.chapters.length).padStart(2, '0')}`;
    $('ch-title').textContent = Ch.meta.title;
    $('ch-subtitle').textContent = Ch.meta.subtitle || '';
    this.dots.innerHTML = '';
    Ch.steps.forEach((s, i) => {
      const d = document.createElement('button');
      d.className = 'dot';
      d.title = `${i + 1}. ${s.title}`;
      d.addEventListener('click', () => this.onChapter(index, i));
      this.dots.appendChild(d);
    });
    document.title = `${Ch.meta.title} · 多模态大模型 3D 图解`;
  }

  setStep(chIndex, Ch, step) {
    const s = Ch.steps[step];
    [...this.dots.children].forEach((d, i) => {
      d.classList.toggle('active', i === step);
      d.classList.toggle('done', i < step);
    });
    this.content.innerHTML = `<div class="fade-in"><h2><span class="step-no">${String(step + 1).padStart(2, '0')}</span>${s.title}</h2>${s.html}</div>`;
    this.count.textContent = `${step + 1} / ${Ch.steps.length}`;
    const lastCh = chIndex === this.chapters.length - 1;
    const lastStep = step === Ch.steps.length - 1;
    this.prevBtn.disabled = chIndex === 0 && step === 0;
    this.nextBtn.disabled = lastCh && lastStep;
    this.nextBtn.textContent = lastStep && !lastCh ? '下一章 →' : '下一步 →';
    this.prevBtn.textContent = step === 0 && chIndex > 0 ? '← 上一章' : '← 上一步';
    this.scroller.scrollTop = 0;
    // 内容中的章节跳转链接：<a data-goto="3">
    this.content.querySelectorAll('[data-goto]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.onChapter(Number(a.dataset.goto), Number(a.dataset.step || 0));
      })
    );
  }

  clearWidget() {
    this.widgetEl.innerHTML = '';
  }

  toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  loading(on, text = '正在加载…', soft = false) {
    const l = $('loading');
    l.querySelector('span').textContent = text;
    l.classList.toggle('soft', soft);
    l.classList.toggle('hide', !on);
  }

  /** 面板遮挡的像素区域（供引擎偏移视口中心） */
  panelInset() {
    if (!this.panelVisible) return { right: 0, bottom: 0 };
    const p = $('panel');
    const r = p.getBoundingClientRect();
    if (window.innerWidth <= 760) return { right: 0, bottom: Math.round(window.innerHeight - r.top) };
    return { right: Math.round(window.innerWidth - r.left), bottom: 0 };
  }
}
