// 第 1 章 总览：LLM = 一台"文字接龙"机器
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, flowPath, layoutRow, V3, hide, orb, unitBoxBase, glowMat } from '../core/kit.js';
import { makeTower, makeImagePlane, makeTiles, makeWaveTube } from '../core/props.js';
import { drawScene } from '../core/imagegen.js';

// 真实 o200k_base 分词结果（GPT-4o 系列使用的分词器）
const CTX = ['人工', '智能', '正在', '改变', '我们的'];
const IDS = [47243, 60319, 70104, 182793, 155930];
const ROUNDS = [
  [['生活', 0.41], ['世界', 0.23], ['工作', 0.14], ['未来', 0.09], ['社会', 0.06], ['思维', 0.04]],
  [['方式', 0.38], ['。', 0.22], ['，', 0.18], ['和', 0.1], ['习惯', 0.07], ['质量', 0.03]],
  [['。', 0.55], ['，', 0.25], ['！', 0.08], ['和', 0.06], ['与', 0.03], ['……', 0.02]],
  [['⟨结束⟩', 0.72], ['未来', 0.08], ['它', 0.07], ['而', 0.05], ['这', 0.04], ['我们', 0.03]],
];
const MM_CANDS = [['这是', 0.46], ['图中', 0.21], ['一只', 0.12], ['猫', 0.09], ['照片', 0.07], ['它', 0.05]];

const ROW_Y = 0.5;
const ROW_RIGHT = -3.4;
const BAR_X0 = 4.4;
const BAR_DX = 1.32;
const BAR_SCALE = 7.5;

export default class Overview extends Chapter {
  static meta = {
    id: 'overview',
    short: '总览',
    title: 'LLM 是一台"接龙机器"',
    subtitle: '先看全貌：文字、图片、声音如何变成 token，又如何被"一个字一个字"地生成出来。',
  };

  static steps = [
    {
      title: '一台超级"文字接龙"机器',
      cam: [1.5, 6.5, 21.5, 1.5, 3.3, 0],
      html: `
        <p>大语言模型（LLM）看起来无所不能，但它在每一刻只做<b>一件事</b>：</p>
        <div class="key">根据前面已有的内容，预测<b>下一个 token</b>（可以先理解为"下一个字或词"）应该是什么。</div>
        <p>左边是输入的文字，中间紫色的"塔"是模型本体（几十层 Transformer），右边的柱子是模型给出的<b>下一个 token 的概率</b>。</p>
        <div class="analogy">就像玩成语接龙：你说"人工智能正在改变我们的……"，模型脑子里会冒出一堆候选——"生活""世界""工作"——并给每个候选打分。</div>
        <p class="note">提示：按 → 或点击"下一步"继续；随时可以拖动鼠标旋转视角。</p>`,
    },
    {
      title: '第一步：把文字切成 token',
      cam: [-6.4, 2.8, 8.6, -6.2, 1.1, 0],
      html: `
        <p>模型不认识"字"，只认识<b>数字</b>。所以第一步是<b>分词（Tokenization）</b>：把文字切成一个个小片段，每个片段在<b>词表</b>里有一个固定编号（Token ID）。</p>
        <p>图中的句子被 GPT-4o 的分词器（o200k_base）切成了 5 个 token，下面的数字就是它们的真实编号。</p>
        <div class="key">token ≠ 字，也 ≠ 词。它是分词器从海量文本里统计出来的"常用片段"：常见词往往是 1 个 token，生僻字可能被拆成好几个。</div>
        <p>分词的细节见 <a href="#" data-goto="1">第 2 章</a>。</p>`,
    },
    {
      title: '第二步：穿过几十层 Transformer',
      cam: [-1.2, 5.2, 14.5, -0.6, 3.6, 0],
      html: `
        <p>每个 token 先被换成一个<b>向量</b>（一长串数字），然后这一串向量一起穿过模型的几十层 <b>Transformer</b>。</p>
        <p>每一层都在做两件事：</p>
        <ul>
          <li><b>注意力</b>：让每个 token "看看"其它 token，交换信息（例如"它"指的是谁）；</li>
          <li><b>前馈网络</b>：对每个 token 单独"深加工"，调取模型学到的知识。</li>
        </ul>
        <div class="analogy">像一条有几十道工序的流水线：原料（token 向量）每经过一道工序，就被"理解"得更深一点。</div>
        <p>对应 <a href="#" data-goto="2">第 3~6 章</a>。</p>`,
    },
    {
      title: '第三步：输出"下一个 token"的概率',
      cam: [7.8, 3.4, 10.5, 7.7, 2.0, 0],
      html: `
        <p>最后一层输出的向量，会被转换成<b>词表里每一个 token 的概率</b>。GPT-4o 的词表约有 <b>20 万</b>个 token，所以其实有 20 万根柱子——这里只画了最高的 6 根。</p>
        <p>"生活"概率最高（41%），但"世界""工作"也有机会。</p>
        <div class="key">模型输出的不是"答案"，而是一个<b>概率分布</b>。最终选哪个，由<b>采样策略</b>（温度、Top-p 等）决定。</div>
        <p>对应 <a href="#" data-goto="6">第 7 章</a>。</p>`,
    },
    {
      title: '第四步：选一个，接上，再来一遍',
      cam: [0.5, 7.5, 22, 0.5, 3.5, 0],
      html: `
        <p>选出一个 token 后，把它<b>接到输入的末尾</b>，再把整个序列送进模型，预测再下一个……如此循环，直到生成"结束"标记。</p>
        <p>这叫<b>自回归生成（Autoregressive Generation）</b>。你在聊天界面里看到回答"一个字一个字往外蹦"，就是这个原因。</p>
        <div class="formula">人工智能正在改变我们的 → 生活 → 方式 → 。→ ⟨结束⟩</div>
        <div class="note">每生成 1 个 token 都要把模型完整地"跑"一遍，所以输出 token 比输入 token 更慢、通常也更贵（第 7 章细讲）。</div>`,
    },
    {
      title: '多模态：图片和声音也能变成 token',
      cam: [-1.8, 6.2, 21, -1.8, 3.4, 0],
      html: `
        <p>如果你发给模型一张<b>猫的照片</b>，再用<b>语音</b>问"这是什么动物？"，会发生什么？</p>
        <ul>
          <li><span class="chip image">图像</span> 被切成小方块（patch），经过视觉编码器，变成一串<b>图像 token</b>；</li>
          <li><span class="chip audio">语音</span> 被转成频谱图，经过音频编码器，变成一串<b>音频 token</b>；</li>
          <li>它们和 <span class="chip text">文字</span> token 排成<b>同一条序列</b>，送进同一个模型。</li>
        </ul>
        <div class="key">模型本身并不"看"也不"听"——在它眼里，<b>一切都是向量序列</b>。多模态的关键，是把图片和声音翻译成模型能读懂的向量。</div>
        <p>详见 <a href="#" data-goto="8">第 9 章（视觉）</a>和 <a href="#" data-goto="9">第 10 章（语音）</a>。</p>`,
    },
    {
      title: '学习路线图',
      cam: [13, 9.5, 19, 1.2, 3.4, 0],
      html: `
        <p>接下来我们把这台机器<b>拆开</b>，一个零件一个零件地看：</p>
        <div class="toc">
          <button data-goto="1"><span class="num">02</span><span>分词：文字 → Token<small>BPE 算法、词表、中英文差异</small></span></button>
          <button data-goto="2"><span class="num">03</span><span>嵌入：Token → 向量<small>语义空间、向量运算</small></span></button>
          <button data-goto="3"><span class="num">04</span><span>位置编码：记住顺序<small>正弦编码、RoPE 旋转</small></span></button>
          <button data-goto="4"><span class="num">05</span><span>注意力机制<small>Q / K / V、多头、因果掩码</small></span></button>
          <button data-goto="5"><span class="num">06</span><span>Transformer 层层堆叠<small>残差流、MLP、MoE、参数量</small></span></button>
          <button data-goto="6"><span class="num">07</span><span>输出与采样<small>Softmax、温度、Top-p、KV Cache</small></span></button>
          <button data-goto="7"><span class="num">08</span><span>训练：模型如何学会<small>损失函数、梯度下降、三阶段</small></span></button>
          <button data-goto="8"><span class="num">09</span><span>视觉：图片 → Token<small>Patch、ViT、投影、图片 token 计算</small></span></button>
          <button data-goto="9"><span class="num">10</span><span>听觉：语音 → Token<small>频谱图、音频编码器、语音 token 计算</small></span></button>
          <button data-goto="10"><span class="num">11</span><span>多模态融合 & Token 计算器<small>上下文窗口、费用估算</small></span></button>
        </div>`,
    },
  ];

  build() {
    // ── 输入序列 ──
    this.ctxBlocks = CTX.map((t) => new TokenBlock(t, { color: C.text }));
    this.genBlocks = ROUNDS.map((r) => new TokenBlock(r[0][0], { color: r[0][0] === '⟨结束⟩' ? C.pink : C.text }));
    this.idLabels = this.ctxBlocks.map((b, i) => {
      const l = label(`#${IDS[i]}`, 'tiny mono', { anchor: 'top' });
      l.position.set(0, -0.48, 0);
      b.add(l);
      return l;
    });
    this.add(...this.ctxBlocks, ...this.genBlocks);
    this.genBlocks.forEach((b) => hide(b));

    this.rawText = label('"人工智能正在改变我们的"', 'big', { anchor: 'bottom' });
    this.rawText.position.set(-6.6, 2.0, 0);
    this.add(this.rawText);

    this.sentence = label('', 'tag text', { anchor: 'bottom' });
    this.sentence.position.set(-6.6, 2.35, 0);
    this.add(this.sentence);

    // ── 模型塔 ──
    this.tower = makeTower();
    this.add(this.tower);

    // ── 数据流 ──
    this.inFlow = flowPath([V3(-3.25, ROW_Y, 0), V3(-2.7, 0.6, 0), V3(-2.1, 0.95, 0), V3(-1.1, 1.2, 0), V3(0, 1.25, 0)], { color: C.text, radius: 0.05 });
    this.outFlow = flowPath([V3(0, 6.9, 0), V3(1.3, 7.5, 0), V3(2.9, 7.3, 0), V3(3.7, 6.3, 0), V3(4.0, 4.6, 0)], { color: C.model, radius: 0.05 });
    this.add(this.inFlow, this.outFlow);

    // ── 输出概率柱 ──
    this.bars = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.position.set(BAR_X0 + i * BAR_DX, 0, 0);
      const mat = glowMat(i === 0 ? C.gold : C.model, { glow: i === 0 ? 0.9 : 0.45, opacity: 0.9 });
      const bar = new THREE.Mesh(unitBoxBase(), mat);
      bar.scale.set(0.78, 0.01, 0.78);
      const holder = new THREE.Group();
      holder.position.set(0, 0.3, 0.72);
      const pct = label('', 'pct', { anchor: 'bottom' });
      g.add(bar, holder, pct);
      g.userData = { bar, holder, pct, mat };
      this.bars.push(g);
      this.add(g);
    }
    this.barsTitle = label('下一个 token 的概率', 'title', { anchor: 'bottom' });
    this.barsTitle.position.set(BAR_X0 + 2.5 * BAR_DX, 4.6, 0);
    this.add(this.barsTitle);
    this.restLabel = label('……其余约 20 万个 token', 'dim', { anchor: 'left' });
    this.restLabel.position.set(BAR_X0 + 5.55 * BAR_DX, 0.25, 0);
    this.add(this.restLabel);
    this.setBarsInstant(ROUNDS[0]);

    // ── 处理中的小光球 ──
    this.orbs = Array.from({ length: 5 }, () => orb(0.12, C.cyan));
    this.orbs.forEach((o) => {
      hide(o);
      this.add(o);
    });

    // ── 多模态素材 ──
    const canvas = drawScene(256);
    this.img = makeImagePlane(canvas, 2.6);
    this.img.position.set(-10.0, 4.3, 0);
    this.imgCaption = label('一张照片', 'tag image', { anchor: 'top' });
    this.imgCaption.position.set(0, -1.55, 0);
    this.img.add(this.imgCaption);
    this.tiles = makeTiles(this.img.texture, 2.6, 2, 3, 0.04);
    this.tileGroup = new THREE.Group();
    this.tileGroup.position.copy(this.img.position);
    this.tiles.forEach((t) => this.tileGroup.add(t));
    this.wave = makeWaveTube({ width: 3.2, height: 0.75 });
    this.waveGroup = new THREE.Group();
    this.waveGroup.add(this.wave);
    this.waveGroup.position.set(-5.4, 4.3, 0);
    const wl = label('语音："这是什么动物？"', 'tag audio', { anchor: 'top' });
    wl.position.set(0, -1.0, 0);
    this.waveGroup.add(wl);
    this.imgTokens = Array.from({ length: 6 }, () => new TokenBlock('', { color: C.image, minW: 0.5, h: 0.6 }));
    this.audTokens = Array.from({ length: 4 }, () => new TokenBlock('', { color: C.audio, minW: 0.5, h: 0.6 }));
    this.mmLabelImg = label('图像 token ×6<br><span class="lbl tiny">（真实约几百~上千个）</span>', 'tag image', { anchor: 'top' });
    this.mmLabelAud = label('音频 token ×4<br><span class="lbl tiny">（真实约每秒 25~50 个）</span>', 'tag audio', { anchor: 'top' });
    this.add(this.img, this.tileGroup, this.waveGroup, ...this.imgTokens, ...this.audTokens, this.mmLabelImg, this.mmLabelAud);
    hide(this.img, this.tileGroup, this.waveGroup, ...this.imgTokens, ...this.audTokens, this.mmLabelImg, this.mmLabelAud);

    this.layoutRowInstant(this.ctxBlocks);
  }

  // ───────── 布局工具 ─────────
  rowPositions(blocks, gap = 0.16) {
    const xs = layoutRow(blocks.map((b) => b.w), gap);
    const shift = ROW_RIGHT - (xs[xs.length - 1] + blocks[blocks.length - 1].w / 2);
    return xs.map((x) => V3(x + shift, ROW_Y, 0));
  }
  layoutRowInstant(blocks) {
    this.rowPositions(blocks).forEach((p, i) => blocks[i].position.copy(p));
  }
  layoutRow(blocks, at = 0, dur = 0.6, gap = 0.16) {
    this.rowPositions(blocks, gap).forEach((p, i) => this.move(blocks[i], p, at, dur));
  }
  /** 柱子前方的候选 token（3D 方块，按文字缓存复用） */
  setBarName(i, text) {
    const holder = this.bars[i].userData.holder;
    let blk = holder.children.find((c) => c.text === text);
    if (!blk) {
      blk = new TokenBlock(text, { color: text === '⟨结束⟩' ? C.pink : C.model, h: 0.5, d: 0.26, textH: 0.3, minW: 0.5, pad: 0.2, glow: 0.6 });
      holder.add(blk);
    }
    holder.children.forEach((c) => (c.visible = c === blk));
  }
  setBarsInstant(cands) {
    cands.forEach(([t, p], i) => {
      const { bar, pct } = this.bars[i].userData;
      bar.scale.y = Math.max(0.01, p * BAR_SCALE);
      this.setBarName(i, t);
      pct.setHTML(`${Math.round(p * 100)}%`);
      pct.position.y = p * BAR_SCALE + 0.12;
    });
  }
  /** 时间轴上把柱子变为新的分布 */
  barsTo(cands, at, dur = 0.6, fromZero = false) {
    const tl = this.tl;
    cands.forEach(([t, p], i) => {
      const { bar, pct } = this.bars[i].userData;
      if (fromZero) tl.set(bar.scale, { y: 0.01 }, at);
      tl.call(() => {
        this.setBarName(i, t);
        pct.setHTML(`${Math.round(p * 100)}%`);
      }, null, at + dur * 0.4);
      tl.to(bar.scale, { y: Math.max(0.01, p * BAR_SCALE), duration: dur, ease: 'power2.inOut' }, at + i * 0.04);
      tl.to(pct.position, { y: p * BAR_SCALE + 0.12, duration: dur, ease: 'power2.inOut' }, at + i * 0.04);
    });
  }
  sentenceText(n) {
    const toks = [...CTX, ...ROUNDS.slice(0, n).map((r) => r[0][0])].filter((t) => t !== '⟨结束⟩');
    return toks.join('') + (n < ROUNDS.length ? '<span style="opacity:.6">▌</span>' : '');
  }
  /** 小光球沿输入流进入塔，再从顶部流出 */
  flowOrbs(at, n = 5) {
    const tl = this.tl;
    const cin = this.inFlow.userData.curve;
    const cout = this.outFlow.userData.curve;
    for (let i = 0; i < n; i++) {
      const o = this.orbs[i];
      const p = { t: 0 };
      const t0 = at + i * 0.12;
      tl.set(o, { opacity: 1 }, t0);
      tl.to(p, { t: 1, duration: 0.7, ease: 'power1.in', onUpdate: () => o.position.copy(cin.getPointAt(p.t)) }, t0);
      tl.set(o, { opacity: 0 }, t0 + 0.72);
    }
    const end = this.tower.pulse(tl, at + 0.7, 0.08);
    const o = this.orbs[0];
    const p2 = { t: 0 };
    tl.set(o, { opacity: 1 }, end - 0.4);
    tl.to(p2, { t: 1, duration: 0.6, ease: 'power1.out', onUpdate: () => o.position.copy(cout.getPointAt(p2.t)) }, end - 0.4);
    tl.set(o, { opacity: 0 }, end + 0.22);
    return end + 0.2;
  }

  /** 回到"纯文本"标准状态 */
  toTextState(at = 0) {
    const tl = this.tl;
    hide(...this.orbs);
    for (const b of [...this.imgTokens, ...this.audTokens]) this.fade(b, 0, at, 0.4);
    this.fade(this.img, 0, at, 0.4);
    this.fade(this.tileGroup, 0, at, 0.4);
    this.fade(this.waveGroup, 0, at, 0.4);
    this.fade(this.mmLabelImg, 0, at, 0.3);
    this.fade(this.mmLabelAud, 0, at, 0.3);
    this.genBlocks.forEach((b) => this.fade(b, 0, at, 0.4));
    this.ctxBlocks.forEach((b) => this.fade(b, 1, at + 0.1, 0.5));
    this.layoutRow(this.ctxBlocks, at, 0.7);
    this.ctxBlocks.forEach((b) => tl.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.5 }, at));
    this.tower.userData.slabs.forEach((s) => tl.to(s.material, { emissiveIntensity: 0.28, duration: 0.4 }, at));
    this.bars.forEach((g, i) => tl.to(g.userData.mat, { emissiveIntensity: i === 0 ? 0.9 : 0.45, duration: 0.3 }, at));
  }

  go(step) {
    const tl = this.tl;
    const mm = step === 5;
    if (!mm) this.toTextState(0);
    this.fade(this.rawText, step === 1 ? 1 : 0, 0, 0.4);
    this.fade(this.sentence, step === 4 ? 1 : 0, 0, 0.4);
    this.idLabels.forEach((l) => this.fade(l, step === 1 ? 1 : 0, 0.2, 0.4));
    this.fade(this.restLabel, 1, 0, 0.4);

    if (step === 0 || step === 6) {
      this.barsTo(ROUNDS[0], 0.3, 0.8);
      if (step === 6) this.flowOrbs(1.0);
    } else if (step === 1) {
      // 先挤在一起（像一整句话），再"切开"
      const tight = this.rowPositions(this.ctxBlocks, 0);
      tight.forEach((p, i) => tl.set(this.ctxBlocks[i].position, { x: p.x, y: p.y, z: p.z }, 0.75));
      this.idLabels.forEach((l) => tl.set(l, { opacity: 0 }, 0.75));
      this.ctxBlocks.forEach((b) => tl.fromTo(b.scale, { x: 1, y: 1, z: 1 }, { x: 1.06, y: 1.06, z: 1.06, duration: 0.3, yoyo: true, repeat: 1 }, 1.0));
      this.layoutRow(this.ctxBlocks, 1.7, 0.8, 0.42);
      this.idLabels.forEach((l, i) => tl.to(l, { opacity: 1, duration: 0.4 }, 2.3 + i * 0.12));
      this.barsTo(ROUNDS[0], 0, 0.5);
    } else if (step === 2) {
      this.barsTo(ROUNDS[0], 0, 0.5);
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
      const saved = this.tl;
      this.tl = loop;
      this.ctxBlocks.forEach((b, i) => loop.to(b.box.material, { emissiveIntensity: 1.8, duration: 0.15, yoyo: true, repeat: 1 }, i * 0.12));
      this.flowOrbs(0.2);
      this.tl = saved;
      tl.add(loop, 0.8);
    } else if (step === 3) {
      this.barsTo(ROUNDS[0], 0.4, 1.0, true);
      tl.to(this.bars[0].userData.mat, { emissiveIntensity: 2.2, duration: 0.4, yoyo: true, repeat: 3 }, 1.6);
    } else if (step === 4) {
      this.runGeneration();
    } else if (step === 5) {
      this.runMultimodal();
    }
  }

  /** 自回归生成循环 */
  runGeneration() {
    const tl = this.tl;
    this.sentence.setHTML(this.sentenceText(0));
    this.barsTo(ROUNDS[0], 0.2, 0.5);
    const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
    const saved = this.tl;
    this.tl = loop;
    let t = 0.3;
    loop.call(() => this.sentence.setHTML(this.sentenceText(0)), null, 0);
    for (let r = 0; r < ROUNDS.length; r++) {
      t = this.flowOrbs(t, 3) - 0.3;
      this.barsTo(ROUNDS[r], t, 0.5);
      const top = this.bars[0];
      loop.to(top.userData.mat, { emissiveIntensity: 2.6, duration: 0.2, yoyo: true, repeat: 1 }, t + 0.55);
      // 新 token 从柱子飞回输入末尾
      const g = this.genBlocks[r];
      const rowNow = [...this.ctxBlocks, ...this.genBlocks.slice(0, r + 1)];
      const target = this.rowPositions(rowNow)[rowNow.length - 1];
      const from = V3(top.position.x, ROUNDS[r][0][1] * BAR_SCALE + 0.6, 0);
      const ctl = V3((from.x + target.x) / 2, 11, 0);
      const curve = new THREE.QuadraticBezierCurve3(from, ctl, target);
      const p = { t: 0 };
      loop.set(g.position, { x: from.x, y: from.y, z: 0 }, t + 0.9);
      loop.set(g, { opacity: 1 }, t + 0.9);
      loop.fromTo(g.scale, { x: 0.2, y: 0.2, z: 0.2 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(2)' }, t + 0.9);
      loop.to(p, { t: 1, duration: 1.3, ease: 'power2.inOut', onUpdate: () => g.position.copy(curve.getPoint(p.t)) }, t + 1.2);
      // 其余 token 左移让位
      this.rowPositions(rowNow)
        .slice(0, -1)
        .forEach((pos, i) => loop.to(rowNow[i].position, { x: pos.x, duration: 0.6, ease: 'power2.inOut' }, t + 1.6));
      loop.call(() => this.sentence.setHTML(this.sentenceText(r + 1)), null, t + 2.5);
      t += 2.7;
    }
    // 收尾：停留后复位
    t += 1.8;
    this.genBlocks.forEach((g) => loop.to(g, { opacity: 0, duration: 0.5 }, t));
    this.rowPositions(this.ctxBlocks).forEach((pos, i) => loop.to(this.ctxBlocks[i].position, { x: pos.x, duration: 0.7, ease: 'power2.inOut' }, t + 0.3));
    this.barsTo(ROUNDS[0], t + 0.3, 0.5);
    this.tl = saved;
    tl.add(loop, 0.9);
  }

  /** 多模态：图片碎成图像 token，声波变成音频 token */
  runMultimodal() {
    const tl = this.tl;
    hide(...this.orbs);
    this.ctxBlocks.forEach((b) => this.fade(b, 0, 0, 0.4));
    this.idLabels.forEach((l) => this.fade(l, 0, 0, 0.3));
    this.genBlocks.forEach((b) => this.fade(b, 0, 0, 0.3));
    // 素材复位（可能停在上次动画的中途）
    tl.set(this.waveGroup.scale, { x: 1, y: 1, z: 1 }, 0);
    tl.set(this.waveGroup.position, { x: -5.4, y: 4.3, z: 0 }, 0);
    this.tiles.forEach((tile) => {
      tl.set(tile.scale, { x: 1, y: 1, z: 1 }, 0);
      tl.set(tile.position, { x: tile.userData.home.x, y: tile.userData.home.y, z: 0 }, 0);
    });
    this.fade(this.img, 1, 0.3, 0.6);
    this.fade(this.waveGroup, 1, 0.5, 0.6);
    // 图片 → 6 个切块 → 6 个图像 token
    const seq = [...this.imgTokens, ...this.audTokens];
    const pos = this.rowPositions(seq, 0.1);
    tl.set(this.tileGroup, { opacity: 1 }, 1.6);
    this.tiles.forEach((tile) => tl.set(tile.position, { x: tile.userData.home.x, y: tile.userData.home.y, z: 0 }, 1.6));
    tl.to(this.img, { opacity: 0, duration: 0.3 }, 1.6);
    this.tiles.forEach((tile, i) => {
      const dx = tile.userData.home.x * 0.35;
      const dy = tile.userData.home.y * 0.35;
      tl.to(tile.position, { x: tile.userData.home.x + dx, y: tile.userData.home.y + dy, duration: 0.5, ease: 'power2.out' }, 1.8);
      const tgt = pos[i].clone().sub(this.tileGroup.position);
      tl.to(tile.position, { x: tgt.x, y: tgt.y, z: 0.2, duration: 0.9, ease: 'power2.inOut' }, 2.4 + i * 0.06);
      tl.to(tile.scale, { x: 0.25, y: 0.3, duration: 0.9 }, 2.4 + i * 0.06);
    });
    tl.to(this.tileGroup, { opacity: 0, duration: 0.3 }, 3.4);
    this.imgTokens.forEach((b, i) => {
      tl.set(b.position, { x: pos[i].x, y: pos[i].y, z: 0 }, 0);
      tl.to(b, { opacity: 1, duration: 0.3 }, 3.3 + i * 0.05);
      tl.fromTo(b.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2.5)' }, 3.3 + i * 0.05);
    });
    // 声波 → 4 个音频 token
    tl.to(this.waveGroup.scale, { x: 0.2, y: 0.2, duration: 0.6, ease: 'power2.in' }, 3.6);
    tl.to(this.waveGroup.position, { x: pos[7].x, y: ROW_Y, duration: 0.6, ease: 'power2.in' }, 3.6);
    tl.to(this.waveGroup, { opacity: 0, duration: 0.2 }, 4.1);
    this.audTokens.forEach((b, j) => {
      const p = pos[6 + j];
      tl.set(b.position, { x: p.x, y: p.y, z: 0 }, 0);
      tl.to(b, { opacity: 1, duration: 0.3 }, 4.1 + j * 0.06);
      tl.fromTo(b.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(2.5)' }, 4.1 + j * 0.06);
    });
    // 标签
    const midImg = (pos[0].x + pos[5].x) / 2;
    const midAud = (pos[6].x + pos[9].x) / 2;
    tl.set(this.mmLabelImg.position, { x: midImg, y: -0.15, z: 0 }, 0);
    tl.set(this.mmLabelAud.position, { x: midAud, y: -0.15, z: 0 }, 0);
    tl.to(this.mmLabelImg, { opacity: 1, duration: 0.4 }, 4.0);
    tl.to(this.mmLabelAud, { opacity: 1, duration: 0.4 }, 4.5);
    // 一起送进模型
    const end = this.flowOrbs(4.9, 5);
    this.barsTo(MM_CANDS, end - 0.2, 0.7);
  }

  update(dt, t) {
    this.tower.rotation.y = Math.sin(t * 0.25) * 0.06;
  }
}
