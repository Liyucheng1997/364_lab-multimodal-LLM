// 第 11 章 多模态融合 & Token 计算器 & 全景回顾
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, flowPath, glassBox, roundedBoxGeo } from '../core/kit.js';
import { makeTower, makeImagePlane, makeWaveTube } from '../core/props.js';
import { drawScene } from '../core/imagegen.js';
import { getEncoding } from '../core/tokenizer.js';
import { IMAGE_SCHEMES, AUDIO_SCHEMES, videoTokensPerSec, fmt } from '../core/tokenmath.js';

const TANK_L = 14;
const TANK_R = 0.85;
const SEG_COLORS = { text: C.text, image: C.image, audio: C.audio, video: C.video, output: C.model };
const SEG_NAMES = { text: '文字', image: '图片', audio: '音频', video: '视频', output: '预留输出' };
const SIZE_PRESETS = [
  ['手机照片 4032×3024', 4032, 3024],
  ['1080p 截图 1920×1080', 1920, 1080],
  ['正方形 1024×1024', 1024, 1024],
  ['小图 512×512', 512, 512],
];

export default class Fusion extends Chapter {
  static meta = {
    id: 'fusion',
    short: '融合 & 计算器',
    title: '多模态融合 & Token 计算器',
    subtitle: '文字、图片、声音最终都变成同一条 token 序列。它们共同占用上下文窗口，也共同决定费用。',
  };

  static steps = [
    {
      title: '万物皆 token：三条河流汇成一条',
      cam: [0.3, 5.8, 18.5, 0.3, 2.6, 0],
      html: `
        <p>回顾一下三种模态各自的"翻译"过程：</p>
        <ul>
          <li><span class="chip text">文字</span> 分词器 → 查嵌入表 → 向量；</li>
          <li><span class="chip image">图片</span> 切 patch → 视觉编码器 → 投影器 → 向量；</li>
          <li><span class="chip audio">语音</span> 梅尔频谱 → 音频编码器 → 投影器 → 向量。</li>
        </ul>
        <p>最后它们按出现顺序<b>拼成同一条序列</b>，送进同一个 Transformer。在注意力层里，文字 token 可以"看"图像 token，图像 token 也可以"看"音频 token——跨模态的理解就发生在这里。</p>
        <div class="key">视频 = 按时间抽取的一连串图片帧（+ 音轨）。所以视频的 token 数随时长线性增长，是最"费 token"的输入。</div>`,
    },
    {
      title: '上下文窗口：模型的"工作记忆"',
      cam: [0, 3.4, 17, 0, 2.0, 0],
      html: `
        <p>模型一次能处理的 token 总数是有上限的，叫<b>上下文窗口</b>（如 128K、200K、1M）。可以把它想象成一个<b>油箱</b>：</p>
        <ul>
          <li>系统提示、历史对话、你上传的文件/图片/音频、模型的回答（包括"思考过程"）——<b>全部</b>都要装进这个油箱；</li>
          <li>装满了，就必须删减或总结之前的内容，否则请求会失败；</li>
          <li>油箱越满，计算越慢、越贵（注意力是 n² 的，KV 缓存也越大）。</li>
        </ul>
        <div class="note">"窗口大"不等于"记得牢"：内容很长时，模型对中间部分的信息利用往往不如开头和结尾。</div>`,
    },
    {
      title: 'Token 计算器',
      cam: [0, 3.4, 17, 0, 2.0, 0],
      html: `
        <p>在下面填入你的请求内容，估算总 token 数、上下文占用和费用：</p>
        <div id="calc-out"></div>
        <div class="note">文字按 GPT-4o 分词器（o200k_base）精确计数，其它模型的分词器会有差异；图片/音频/视频按所选方案的公开规则估算。单价请填写你所用模型的官方价格（这里的默认值只是示例）。</div>`,
    },
    {
      title: '省 token 的实用技巧',
      cam: [0, 4.4, 16.5, 0, 2.6, 0],
      html: `
        <ul>
          <li><b>图片按需缩小</b>：识别文字、看清细节才需要高分辨率；只是"看看大意"，缩到 1000 像素左右就够了。手机原图往往会被模型自动缩小，但先缩小能省带宽、降延迟。</li>
          <li><b>裁剪无关区域</b>：只截取需要的部分，比整张截图便宜得多。</li>
          <li><b>音频剪掉静音</b>：音频按时长计费，静音也算钱。</li>
          <li><b>视频降低抽帧率</b>：很多场景每秒 1 帧甚至更低就够了。</li>
          <li><b>复用前缀</b>：把固定的长提示放在开头，并开启<b>提示缓存（Prompt Caching）</b>，重复部分可大幅降价。</li>
          <li><b>控制输出长度</b>：输出 token 通常更贵，要求"简洁回答"、设置最大输出长度。</li>
        </ul>
        <p>图中对比了同一个请求优化前后的 token 占用。</p>`,
    },
    {
      title: '全景回顾',
      cam: [0.3, 7.8, 23.5, 0.2, 3.0, 0],
      html: `
        <p>恭喜你走完了全程！这张全景图把所有零件串在了一起（点击图中的标签可以跳回对应章节）：</p>
        <ol>
          <li>各种输入被<b>切分</b>成 token（分词 / patch / 音频帧）；</li>
          <li>每个 token 变成<b>向量</b>，加上<b>位置</b>信息；</li>
          <li>几十层 <b>Transformer</b>：注意力负责交流，MLP 负责加工；</li>
          <li>最后输出下一个 token 的<b>概率</b>，<b>采样</b>得到结果；</li>
          <li>接到序列末尾，<b>循环</b>往复。</li>
        </ol>
        <div class="key">所谓"多模态"，本质上是给同一个"预测下一个 token"的引擎，配上了能把图片和声音翻译成向量的"眼睛"和"耳朵"——还有能把 token 变回图片和声音的"嘴巴"和"画笔"。</div>`,
    },
  ];

  async init() {
    this.enc = await getEncoding('o200k_base');
  }

  build() {
    this.form = {
      text: '请仔细看看这张图片和这段录音，告诉我图里的动物在做什么，录音里说了什么，并总结成三点。',
      imgCount: 3,
      imgPreset: 0,
      imgW: 4032,
      imgH: 3024,
      imgScheme: 'claude',
      audioMin: 5,
      audioScheme: 'qwenAudio',
      videoSec: 0,
      videoScheme: 'gemini',
      output: 2000,
      window: 128000,
      priceIn: 3,
      priceOut: 15,
    };
    this.buildConverge();
    this.buildTank();
    this.buildTips();
    this.buildRecap();
  }

  // ───────────── 三流汇聚 ─────────────
  buildConverge() {
    const g = (this.convG = new THREE.Group());
    const img = makeImagePlane(drawScene(256), 2.2);
    img.position.set(-7.4, 5.0, 0);
    const wave = makeWaveTube({ width: 2.6, height: 0.55 });
    wave.position.set(-7.4, 2.6, 0);
    const txt = label('"图里的动物在做什么？"', 'tag text', { anchor: 'center' });
    txt.position.set(-7.4, 0.6, 0);
    g.add(img, wave, txt);
    const lane = (y, color, n, x0) =>
      Array.from({ length: n }, (_, i) => {
        const b = new TokenBlock('', { color, minW: 0.32, w: 0.34, h: 0.34, d: 0.34, glow: 0.55 });
        b.position.set(x0 + i * 0.42, y, 0);
        g.add(b);
        return b;
      });
    this.laneImg = lane(5.0, C.image, 6, -5.6);
    this.laneAud = lane(2.6, C.audio, 5, -5.6);
    this.laneTxt = ['图里', '的', '动物', '在做', '什么', '？'].map((t, i) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.34, h: 0.36, d: 0.3, textH: 0.2, pad: 0.1 });
      b.position.set(-5.6 + i * 0.62, 0.6, 0);
      g.add(b);
      return b;
    });
    g.add(flowPath([V3(-2.9, 5.0, 0), V3(-1.5, 4.4, 0), V3(-0.6, 2.9, 0), V3(0.2, 2.6, 0)], { color: C.image, radius: 0.05 }));
    g.add(flowPath([V3(-3.2, 2.6, 0), V3(-1.4, 2.6, 0), V3(0.2, 2.6, 0)], { color: C.audio, radius: 0.05 }));
    g.add(flowPath([V3(-1.7, 0.6, 0), V3(-1.0, 0.9, 0), V3(-0.4, 2.2, 0), V3(0.2, 2.6, 0)], { color: C.text, radius: 0.05 }));
    // 合并后的序列
    const colors = [...Array(6).fill(C.image), ...Array(5).fill(C.audio), ...Array(6).fill(C.text)];
    this.mergedSeq = colors.map((c, i) => {
      const b = new TokenBlock('', { color: c, minW: 0.26, w: 0.28, h: 0.4, d: 0.3, glow: 0.6 });
      b.position.set(0.6 + i * 0.32, 2.6, 0);
      g.add(b);
      return b;
    });
    const sl = label('一条序列（17 个 token 示意；真实可达成千上万个）', 'tag', { anchor: 'top' });
    sl.position.set(3.2, 2.1, 0);
    g.add(sl);
    this.convTower = makeTower({ layers: 8, w: 3.0, d: 2.4, gap: 0.6, y0: 0.9, title: '同一个 Transformer', sub: '' });
    this.convTower.position.set(7.8, 0, 0);
    g.add(this.convTower);
    g.add(flowPath([V3(5.95, 2.6, 0), V3(6.2, 2.6, 0), V3(6.5, 2.6, 0)], { color: C.model, radius: 0.06 }));
    this.add(g);
    hide(g);
  }

  // ───────────── 上下文"油箱" ─────────────
  buildTank() {
    const g = (this.tankG = new THREE.Group());
    g.position.set(0, 2.4, 0);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_L, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x60a5fa, emissiveIntensity: 0.05, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
    );
    glass.rotation.z = Math.PI / 2;
    g.add(glass);
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(TANK_R, 0.05, 10, 48), glowMat(0x93c5fd, { glow: 0.8 }));
      ring.rotation.y = Math.PI / 2;
      ring.position.x = (sx * TANK_L) / 2;
      g.add(ring);
    }
    // 刻度
    for (let k = 0; k <= 10; k++) {
      const x = -TANK_L / 2 + (k / 10) * TANK_L;
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.02), glowMat(C.gray, { glow: 0.5 }));
      t.position.set(x, -TANK_R - 0.2, 0);
      g.add(t);
      const n = textPlane(`${k * 10}%`, 0.18, { color: '#64748b', weight: 500 });
      n.position.set(x, -TANK_R - 0.5, 0);
      g.add(n);
    }
    this.segGroup = new THREE.Group();
    g.add(this.segGroup);
    this.tankTitle = label('', 'title', { anchor: 'bottom' });
    this.tankTitle.position.set(0, TANK_R + 0.5, 0);
    this.tankLegend = label('', 'tag', { anchor: 'top' });
    this.tankLegend.position.set(0, -TANK_R - 0.85, 0);
    g.add(this.tankTitle, this.tankLegend);
    this.add(g);
    hide(g);
  }
  /** 根据各部分 token 数，重建油箱里的彩色"液段" */
  fillTank(parts, windowSize, group = this.segGroup, animate = true) {
    for (const c of [...group.children]) {
      group.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    let x = -TANK_L / 2;
    let used = 0;
    for (const [k, n] of parts) {
      if (n <= 0) continue;
      const len = (n / windowSize) * TANK_L;
      const inside = Math.max(0, Math.min(len, TANK_L / 2 - x));
      const over = len - inside;
      const mk = (l, color, xs) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R * 0.86, TANK_R * 0.86, 1, 32), glowMat(color, { glow: 0.7, opacity: 0.85 }));
        m.rotation.z = Math.PI / 2;
        m.position.x = xs + l / 2;
        m.scale.y = animate ? 0.001 : Math.max(l, 0.001);
        group.add(m);
        if (animate) this.tw(m.scale, { y: Math.max(l, 0.001), duration: 0.6, ease: 'power2.out' });
        return m;
      };
      if (inside > 0.001) mk(inside, SEG_COLORS[k], x);
      if (over > 0.001) mk(Math.min(over, 6), C.red, x + inside);
      if (len > 0.9 && inside > 0.9) {
        const l = label(`${SEG_NAMES[k]} ${fmt(n)}`, 'pct', { anchor: 'center' });
        l.position.set(x + inside / 2, 0, TANK_R + 0.05);
        group.add(l);
      }
      x += len;
      used += n;
    }
    return used;
  }

  // ───────────── 优化前后对比 ─────────────
  buildTips() {
    const g = (this.tipsG = new THREE.Group());
    this.tipBefore = new THREE.Group();
    this.tipAfter = new THREE.Group();
    const mkTank = (y, title) => {
      const t = new THREE.Group();
      t.position.y = y;
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(TANK_R * 0.7, TANK_R * 0.7, TANK_L, 40, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x60a5fa, emissiveIntensity: 0.05, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false })
      );
      glass.rotation.z = Math.PI / 2;
      t.add(glass);
      const l = label(title, 'tag', { anchor: 'right' });
      l.position.set(-TANK_L / 2 - 0.3, 0, 0);
      t.add(l);
      g.add(t);
      return t;
    };
    this.tankA = mkTank(4.2, '优化前');
    this.tankB = mkTank(1.4, '优化后');
    this.tankA.add(this.tipBefore);
    this.tankB.add(this.tipAfter);
    this.tipNote = label('', 'card', { anchor: 'top' });
    this.tipNote.position.set(0, 0.2, 0);
    g.add(this.tipNote);
    this.add(g);
    hide(g);
  }
  runTips() {
    const W = 64000;
    const scale = (parts) => parts.map(([k, n]) => [k, n]);
    const img = (w, h) => IMAGE_SCHEMES[0].fn(w, h).tokens;
    const before = scale([
      ['text', 6000],
      ['image', 3 * img(4032, 3024)],
      ['audio', 25 * 300],
      ['video', 263 * 60],
      ['output', 4000],
    ]);
    const after = scale([
      ['text', 2500],
      ['image', 3 * img(1024, 768)],
      ['audio', Math.round(25 * 300 * 0.7)],
      ['video', Math.round(263 * 60 * 0.35)],
      ['output', 1200],
    ]);
    const segFill = (grp, parts) => {
      for (const c of [...grp.children]) {
        grp.remove(c);
        c.traverse((o) => {
          if (o.isCSS2DObject) o.element.remove();
          if (o.material) o.material.dispose();
          if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
        });
      }
      let x = -TANK_L / 2;
      for (const [k, n] of parts) {
        const len = (n / W) * TANK_L;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R * 0.6, TANK_R * 0.6, 1, 28), glowMat(SEG_COLORS[k], { glow: 0.7, opacity: 0.9 }));
        m.rotation.z = Math.PI / 2;
        m.position.x = x + len / 2;
        m.scale.y = 0.001;
        grp.add(m);
        this.tw(m.scale, { y: Math.max(len, 0.001), duration: 0.8, delay: 0.3, ease: 'power2.out' });
        if (len > 1.1) {
          const l = label(`${SEG_NAMES[k]} ${fmt(n)}`, 'pct', { anchor: 'center' });
          l.position.set(x + len / 2, 0, TANK_R * 0.6 + 0.05);
          grp.add(l);
        }
        x += len;
      }
      return parts.reduce((a, [, n]) => a + n, 0);
    };
    const tb = segFill(this.tipBefore, before);
    const ta = segFill(this.tipAfter, after);
    this.tipNote.setHTML(
      `<b>优化前 ${fmt(tb)} → 优化后 ${fmt(ta)} token（节省 ${Math.round((1 - ta / tb) * 100)}%）</b><br>` +
        `3 张手机原图 → 缩到 1024×768 · 5 分钟录音剪掉 30% 静音 · 1 分钟视频抽帧率降低 · 提示精简 · 限制输出长度`
    );
  }

  // ───────────── 全景回顾 ─────────────
  buildRecap() {
    const g = (this.recapG = new THREE.Group());
    const st = (x, y, w, color, text, ch, h = 0.8) => {
      const b = glassBox(w, h, 0.9, { color, opacity: 0.12, edge: 0.8, glow: 0.4 });
      b.position.set(x, y, 0);
      g.add(b);
      const l = label(text, 'tag click', {
        anchor: 'center',
        onClick: () => this.app.open(ch, 0),
      });
      l.position.set(x, y, 0.5);
      g.add(l);
      return b;
    };
    // 文字行
    st(-9.6, 5.0, 1.6, C.text, '📝 文字', 1);
    st(-7.0, 5.0, 1.8, C.text, '分词（BPE）', 1);
    st(-4.4, 5.0, 1.8, C.text, '查嵌入表', 2);
    // 图片行
    st(-9.6, 3.0, 1.6, C.image, '🖼 图片', 8);
    st(-7.0, 3.0, 1.8, C.image, '切 patch', 8);
    st(-4.4, 3.0, 1.8, C.image, 'ViT + 投影', 8);
    // 音频行
    st(-9.6, 1.0, 1.6, C.audio, '🎤 语音', 9);
    st(-7.0, 1.0, 1.8, C.audio, '梅尔频谱', 9);
    st(-4.4, 1.0, 1.8, C.audio, '编码器 + 投影', 9);
    // 汇合
    st(-1.4, 3.0, 2.0, C.white, 'token 序列 + 位置', 3, 2.6);
    const tower = makeTower({ layers: 9, w: 2.6, d: 2.0, gap: 0.55, y0: 0.8, title: '', sub: '' });
    tower.position.set(2.4, 0, 0);
    g.add(tower);
    this.recapTower = tower;
    const tl = label('Transformer × N<br><span class="lbl tiny">注意力 + MLP（点我）</span>', 'tag model click', { anchor: 'bottom', onClick: () => this.app.open(5, 0) });
    tl.position.set(2.4, 6.0, 0);
    g.add(tl);
    st(5.9, 3.0, 1.9, C.gold, '下一个 token 的概率', 6);
    st(8.7, 3.0, 1.5, C.gold, '采样', 6);
    st(8.7, 1.0, 1.5, C.pink, '训练', 7);
    // 连线
    for (const y of [5.0, 3.0, 1.0]) {
      const c = y === 5 ? C.text : y === 3 ? C.image : C.audio;
      g.add(flowPath([V3(-8.8, y, 0), V3(-7.9, y, 0)], { color: c, radius: 0.04 }));
      g.add(flowPath([V3(-6.1, y, 0), V3(-5.3, y, 0)], { color: c, radius: 0.04 }));
      g.add(flowPath([V3(-3.5, y, 0), V3(-2.9, y + (3 - y) * 0.3, 0), V3(-2.4, 3.0 + (y - 3) * 0.25, 0)], { color: c, radius: 0.04 }));
    }
    g.add(flowPath([V3(-0.4, 3.0, 0), V3(0.4, 3.0, 0), V3(1.1, 3.0, 0)], { color: C.white, radius: 0.05 }));
    g.add(flowPath([V3(3.7, 3.0, 0), V3(4.95, 3.0, 0)], { color: C.model, radius: 0.05 }));
    g.add(flowPath([V3(6.85, 3.0, 0), V3(7.95, 3.0, 0)], { color: C.gold, radius: 0.05 }));
    // 自回归回环
    g.add(flowPath([V3(8.7, 3.4, 0), V3(8.2, 6.6, 0), V3(3.0, 7.6, 0), V3(-1.4, 6.6, 0), V3(-1.4, 4.4, 0)], { color: C.gold, radius: 0.05, tension: 0.5 }));
    const loopL = label('↺ 把新 token 接到序列末尾，继续预测（自回归）', 'tag q', { anchor: 'bottom' });
    loopL.position.set(3.0, 7.7, 0);
    g.add(loopL);
    this.add(g);
    hide(g);
  }

  // ───────────── 计算器 ─────────────
  compute() {
    const f = this.form;
    const text = this.enc ? this.enc.encode(f.text || '', { disallowedSpecial: new Set() }).length : 0;
    const sch = IMAGE_SCHEMES.find((s) => s.id === f.imgScheme);
    const per = sch.fn(f.imgW, f.imgH).tokens;
    const image = f.imgCount * per;
    const aud = AUDIO_SCHEMES.find((s) => s.id === f.audioScheme);
    const audio = Math.round(f.audioMin * 60 * aud.perSec);
    const video = Math.round(f.videoSec * videoTokensPerSec(f.videoScheme));
    const input = text + image + audio + video;
    const cost = (input / 1e6) * f.priceIn + (f.output / 1e6) * f.priceOut;
    return { text, image, per, audio, video, input, output: f.output, total: input + f.output, cost, sch, aud };
  }
  renderCalc() {
    const r = this.compute();
    const f = this.form;
    const used = this.fillTank(
      [
        ['text', r.text],
        ['image', r.image],
        ['audio', r.audio],
        ['video', r.video],
        ['output', r.output],
      ],
      f.window
    );
    const pct = (used / f.window) * 100;
    this.tankTitle.setHTML(`上下文窗口 ${fmt(f.window)} token · 已占用 <b style="color:${pct > 100 ? '#f87171' : '#7dd3fc'}">${pct.toFixed(1)}%</b>${pct > 100 ? '（超出！）' : ''}`);
    this.tankLegend.setHTML(
      Object.entries(SEG_NAMES)
        .map(([k, n]) => `<span style="color:#${new THREE.Color(SEG_COLORS[k]).getHexString()}">■</span> ${n}`)
        .join('　')
    );
    const out = document.getElementById('calc-out');
    if (out) {
      out.innerHTML = `
        <table class="mini">
          <tr><th>部分</th><th>说明</th><th>token</th></tr>
          <tr><td>文字</td><td>${[...(f.text || '')].length} 个字符</td><td class="num">${fmt(r.text)}</td></tr>
          <tr><td>图片</td><td>${f.imgCount} 张 × ${fmt(r.per)}（${r.sch.name}）</td><td class="num">${fmt(r.image)}</td></tr>
          <tr><td>音频</td><td>${f.audioMin} 分钟 × ${r.aud.perSec}/秒</td><td class="num">${fmt(r.audio)}</td></tr>
          <tr><td>视频</td><td>${f.videoSec} 秒（${f.videoScheme === 'gemini' ? 'Gemini ≈263/秒' : 'Qwen2.5-VL 720p ≈720/秒'}）</td><td class="num">${fmt(r.video)}</td></tr>
          <tr class="hl"><td><b>输入合计</b></td><td></td><td class="num"><b>${fmt(r.input)}</b></td></tr>
          <tr><td>输出（预计）</td><td></td><td class="num">${fmt(r.output)}</td></tr>
          <tr class="hl"><td><b>估算费用</b></td><td>输入 $${f.priceIn}/M · 输出 $${f.priceOut}/M</td><td class="num"><b>$${r.cost.toFixed(4)}</b></td></tr>
        </table>`;
    }
    return r;
  }
  calcWidget(el) {
    const f = this.form;
    el.innerHTML = `
      <div class="w-title">① 文字</div>
      <textarea class="w-text" id="c-text" spellcheck="false"></textarea>
      <div class="w-title" style="margin-top:10px">② 图片</div>
      <div class="w-row"><label>数量</label><input type="number" id="c-ic" min="0" max="100" value="${f.imgCount}">
        <select id="c-ip">${SIZE_PRESETS.map((p, i) => `<option value="${i}" ${i === f.imgPreset ? 'selected' : ''}>${p[0]}</option>`).join('')}</select></div>
      <div class="w-row"><label>计费方案</label><select id="c-is">${IMAGE_SCHEMES.map((s) => `<option value="${s.id}" ${s.id === f.imgScheme ? 'selected' : ''}>${s.name}</option>`).join('')}</select></div>
      <div class="w-title" style="margin-top:10px">③ 音频 / 视频</div>
      <div class="w-row"><label>音频分钟</label><input type="number" id="c-am" min="0" max="600" step="0.5" value="${f.audioMin}">
        <select id="c-as">${AUDIO_SCHEMES.map((s) => `<option value="${s.id}" ${s.id === f.audioScheme ? 'selected' : ''}>${s.name}</option>`).join('')}</select></div>
      <div class="w-row"><label>视频秒数</label><input type="number" id="c-vs" min="0" max="36000" step="10" value="${f.videoSec}">
        <select id="c-vsch"><option value="gemini" ${f.videoScheme === 'gemini' ? 'selected' : ''}>Gemini（≈263/秒）</option><option value="qwen" ${f.videoScheme === 'qwen' ? 'selected' : ''}>Qwen2.5-VL 720p</option></select></div>
      <div class="w-title" style="margin-top:10px">④ 输出、窗口与单价</div>
      <div class="w-row"><label>预计输出</label><input type="number" id="c-out" min="0" max="200000" step="100" value="${f.output}"> token</div>
      <div class="w-row"><label>上下文窗口</label><select id="c-win">${[32000, 128000, 200000, 1000000].map((w) => `<option value="${w}" ${w === f.window ? 'selected' : ''}>${w >= 1e6 ? '1M' : w / 1000 + 'K'}</option>`).join('')}</select></div>
      <div class="w-row"><label>输入单价</label>$<input type="number" id="c-pi" min="0" step="0.1" value="${f.priceIn}"> / 百万 token</div>
      <div class="w-row"><label>输出单价</label>$<input type="number" id="c-po" min="0" step="0.1" value="${f.priceOut}"> / 百万 token</div>`;
    const $ = (id) => el.querySelector(id);
    $('#c-text').value = f.text;
    let timer = null;
    const upd = () => {
      f.text = $('#c-text').value;
      f.imgCount = Math.max(0, Number($('#c-ic').value) || 0);
      f.imgPreset = Number($('#c-ip').value);
      [, f.imgW, f.imgH] = SIZE_PRESETS[f.imgPreset];
      f.imgScheme = $('#c-is').value;
      f.audioMin = Math.max(0, Number($('#c-am').value) || 0);
      f.audioScheme = $('#c-as').value;
      f.videoSec = Math.max(0, Number($('#c-vs').value) || 0);
      f.videoScheme = $('#c-vsch').value;
      f.output = Math.max(0, Number($('#c-out').value) || 0);
      f.window = Number($('#c-win').value);
      f.priceIn = Math.max(0, Number($('#c-pi').value) || 0);
      f.priceOut = Math.max(0, Number($('#c-po').value) || 0);
      this.renderCalc();
    };
    el.querySelectorAll('input, select, textarea').forEach((x) =>
      x.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(upd, x.tagName === 'TEXTAREA' ? 200 : 60);
      })
    );
    upd();
    return () => clearTimeout(timer);
  }

  go(step) {
    const tl = this.tl;
    this.fade(this.convG, step === 0 ? 1 : 0, 0, 0.5);
    this.fade(this.tankG, step === 1 || step === 2 ? 1 : 0, step <= 2 ? 0.3 : 0, 0.5);
    this.fade(this.tipsG, step === 3 ? 1 : 0, step === 3 ? 0.3 : 0, 0.5);
    this.fade(this.recapG, step === 4 ? 1 : 0, step === 4 ? 0.3 : 0, 0.6);
    if (step === 0) {
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
      [...this.laneImg, ...this.laneAud, ...this.laneTxt].forEach((b, i) => loop.fromTo(b.box.material, { emissiveIntensity: 1.4 }, { emissiveIntensity: 0.5, duration: 0.6 }, (i % 6) * 0.1));
      this.mergedSeq.forEach((b, i) => loop.fromTo(b.scale, { x: 0.2, y: 0.2, z: 0.2 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' }, 0.9 + i * 0.07));
      this.convTower.pulse(loop, 2.3, 0.07);
      tl.add(loop, 0.5);
    }
    if (step === 1) {
      // 一个"典型请求"的示例占用
      tl.call(() => {
        this.tankTitle.setHTML('示例：一个 200K 窗口里装了什么？');
        this.tankLegend.setHTML(Object.entries(SEG_NAMES).map(([k, n]) => `<span style="color:#${new THREE.Color(SEG_COLORS[k]).getHexString()}">■</span> ${n}`).join('　'));
        this.fillTank(
          [
            ['text', 18000],
            ['image', 4 * 1560],
            ['audio', 1500 * 5],
            ['video', 263 * 120],
            ['output', 8000],
          ],
          200000
        );
      }, null, 0.4);
    }
    if (step === 2) tl.call(() => this.renderCalc(), null, 0.3);
    if (step === 3) tl.call(() => this.runTips(), null, 0.3);
  }

  widget(step, el) {
    if (step === 2) return this.calcWidget(el);
    return null;
  }

  update(dt, t) {
    if (this.step === 4) this.recapTower.rotation.y = Math.sin(t * 0.4) * 0.1;
  }
}
