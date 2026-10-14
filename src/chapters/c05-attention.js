// 第 5 章 注意力机制：token 之间的"对话"
import * as THREE from 'three';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, beam, softmax, unitBoxBase, flowMaterial } from '../core/kit.js';

const VARIANTS = {
  A: { toks: ['小猫', '没有', '吃', '鱼', '，', '因为', '它', '太', '饱', '了'], q: 8, desc: '小猫没有吃鱼，因为它太饱了' },
  B: { toks: ['小猫', '没有', '吃', '鱼', '，', '因为', '它', '不', '新鲜', '了'], q: 8, desc: '小猫没有吃鱼，因为它不新鲜了' },
};
// 语义关联（query → key : 额外打分），只在 j < i 时生效（因果）
const LINKS = {
  common: [[1, 0, 1.5], [2, 1, 1.4], [2, 0, 1.1], [3, 2, 2.2], [4, 3, 0.8], [5, 4, 0.9], [5, 1, 1.0], [6, 0, 1.9], [6, 3, 1.6]],
  A: [[7, 6, 1.6], [8, 0, 2.7], [8, 6, 2.3], [8, 2, 1.2], [8, 7, 1.0], [9, 8, 2.0], [9, 6, 1.0]],
  B: [[7, 6, 1.6], [8, 3, 2.7], [8, 6, 2.3], [8, 2, 0.9], [8, 7, 1.0], [9, 8, 2.0], [9, 6, 1.0]],
};
const HEADS = [
  { name: '头 1：指代 / 语义', color: C.pink, kind: 'sem' },
  { name: '头 2：前一个词', color: C.green, kind: 'prev' },
  { name: '头 3：句法（修饰/谓语）', color: C.k, kind: 'syn' },
  { name: '头 4：开头 / 标点（"汇聚点"）', color: C.gray, kind: 'sink' },
];
const SPACING = 1.22;
const ROW_Y = 0.5;

export default class Attention extends Chapter {
  static meta = {
    id: 'attention',
    short: '注意力',
    title: '注意力机制：token 之间的"对话"',
    subtitle: 'Transformer 的灵魂。每个 token 都会"环顾"前文，决定该从谁那里获取多少信息。',
  };

  static steps = [
    {
      title: '直觉：每个词都要"环顾"上下文',
      cam: [0, 4.6, 13.2, 0, 2.0, 0],
      html: `
        <p>读到"因为它太<b>饱</b>了"时，你会自动想到：饱的是<b>小猫</b>，不是鱼。</p>
        <p>注意力机制让模型做同样的事：处理"饱"时，它向前面每个 token 发出一道"目光"，<b>光束越粗，关注越多</b>。可以看到"饱"主要在看"小猫"和"它"。</p>
        <p>试试下方切换句子：换成"……因为它不<b>新鲜</b>了"，"新鲜"的目光立刻转向了<b>鱼</b>。</p>
        <div class="key">同样的"它"，指代对象由上下文决定——注意力就是模型"联系上下文"的机制。</div>
        <p class="note">提示：点击任意一个词，看看它在关注谁。（权重为演示用的示意数值。）</p>`,
    },
    {
      title: 'Q、K、V：查询、键、值',
      cam: [0, 4.2, 12.2, 0, 1.9, 0],
      html: `
        <p>每个 token 的向量会分别乘以三个可学习的矩阵，得到三个新向量：</p>
        <ul>
          <li><span class="chip q">Q 查询</span>：我在<b>找</b>什么样的信息？</li>
          <li><span class="chip k">K 键</span>：我能被怎样<b>找到</b>？（我的"标签"）</li>
          <li><span class="chip v">V 值</span>：如果你关注我，我<b>提供</b>什么内容？</li>
        </ul>
        <div class="analogy">图书馆检索：Q 是你输入的搜索词，K 是每本书的标签，V 是书的内容。搜索词和标签越匹配，你就从那本书里读得越多。</div>
        <div class="formula">Q = x·W_Q    K = x·W_K    V = x·W_V</div>`,
    },
    {
      title: '打分：Q 与每个 K 做点积',
      cam: [0, 4.4, 12.4, 0, 2.1, 0],
      html: `
        <p>"饱"的 <span class="chip q">Q</span> 依次和每个 token 的 <span class="chip k">K</span> 做<b>点积</b>（对应位置相乘再相加），得到一个"匹配分数"。分数越高，说明越相关。</p>
        <p>注意最右边的"了"：它在"饱"<b>之后</b>，生成"饱"的时候还不存在，所以被<b>遮住（mask）</b>，不参与打分。这叫<b>因果掩码</b>——模型只能看过去，不能偷看未来。</p>
        <div class="formula">score(i, j) = Q_i · K_j / √d_k</div>
        <div class="note">除以 √d_k 是为了防止维度很大时分数过大，让后面的 softmax 不至于过于"尖锐"。</div>`,
    },
    {
      title: 'Softmax：分数 → 注意力权重',
      cam: [0, 4.4, 12.4, 0, 2.1, 0],
      html: `
        <p>把所有分数送进 <b>softmax</b>：先取指数（拉开差距、全变成正数），再除以总和。结果是一组<b>加起来等于 100%</b> 的权重。</p>
        <div class="formula">weight_j = e^(score_j) / Σ e^(score_k)</div>
        <p>柱子高度就是"饱"分配给每个 token 的注意力。大部分注意力给了"小猫"和"它"。</p>`,
    },
    {
      title: '加权求和：把信息"搬"过来',
      cam: [0.4, 5.2, 13.2, 0.4, 2.5, 0],
      html: `
        <p>最后，用权重对所有 <span class="chip v">V</span> 做<b>加权平均</b>：权重大的 token，它的 V 就贡献得多。</p>
        <div class="formula">output = Σ weight_j × V_j</div>
        <p>得到的新向量，就是"饱"在<b>融合了上下文之后</b>的表示——它现在"知道"饱的是小猫。这个结果会被<b>加回</b>到"饱"原来的向量上（残差连接，下一章）。</p>
        <div class="key">整个过程对每个 token 同时进行，而且全部是矩阵乘法——非常适合 GPU 并行计算。这也是 Transformer 能训练得如此大的关键原因。</div>`,
    },
    {
      title: '多头注意力：同时关注不同的关系',
      cam: [-0.8, 6.0, 13.8, -0.8, 2.4, 0],
      html: `
        <p>一组 Q/K/V 只能捕捉一种"关注模式"。所以模型会并行地用<b>多组</b> Q/K/V，每组叫一个<b>注意力头</b>：</p>
        <ul>
          <li><span class="chip pink">头 1</span> 追踪指代与语义（饱 → 小猫、它）；</li>
          <li><span class="chip green">头 2</span> 只看前一个词；</li>
          <li><span class="chip k">头 3</span> 关注句法结构；</li>
          <li><span class="chip gray">头 4</span> 把多余的注意力"停放"在开头或标点上。</li>
        </ul>
        <p>各个头的输出拼接起来，再乘一个矩阵投影回原来的维度。</p>
        <div class="note">真实模型每层有 32~128 个头，它们分工是训练中自发形成的，并不总能被人类清晰解释。这里的分工是常见现象的示意。</div>`,
    },
    {
      title: '注意力矩阵与因果掩码',
      cam: [0, 11.5, 15.5, 0, 0.2, 3.6],
      html: `
        <p>把<b>每个</b> token 对<b>每个</b> token 的权重排成一张表，就是<b>注意力矩阵</b>：</p>
        <ul>
          <li>每一<b>行</b>是一个 query（谁在看）；每一<b>列</b>是一个 key（被看的人）；</li>
          <li>柱子越高，权重越大；每行加起来 = 100%；</li>
          <li>右上角的三角形全部被<b>遮住</b>（红色）——任何 token 都看不到自己之后的内容。</li>
        </ul>
        <p class="note">点击上方任意一个词，矩阵中对应的那一行会高亮。</p>`,
    },
    {
      title: '代价：长度翻倍，计算量翻四倍',
      cam: [0, 9, 12, 0, 1.2, 0],
      html: `
        <p>注意力矩阵有 <b>n × n</b> 个格子：序列长度 n 翻一倍，格子数就翻<b>四倍</b>。</p>
        <table class="mini">
          <tr><th>序列长度 n</th><th>矩阵格子数（每层每头）</th></tr>
          <tr><td>1,000</td><td class="num">100 万</td></tr>
          <tr><td>10,000</td><td class="num">1 亿</td></tr>
          <tr><td>100,000</td><td class="num">100 亿</td></tr>
          <tr><td>1,000,000</td><td class="num">1 万亿</td></tr>
        </table>
        <p>这就是长上下文昂贵的根本原因。工程上有很多优化：</p>
        <ul>
          <li><b>FlashAttention</b>：分块计算，避免把整个矩阵写进显存（结果完全相同，只是更快更省）；</li>
          <li><b>滑动窗口 / 稀疏注意力</b>：只看附近或部分 token；</li>
          <li><b>GQA / MQA</b>：多个头共享 K、V，大幅减小 KV 缓存（第 7 章）。</li>
        </ul>`,
    },
  ];

  build() {
    this.variant = 'A';
    this.query = VARIANTS.A.q;
    this.rowG = new THREE.Group();
    this.beamG = new THREE.Group();
    this.qkvG = new THREE.Group();
    this.barG = new THREE.Group();
    this.headG = new THREE.Group();
    this.matrixG = new THREE.Group();
    this.costG = new THREE.Group();
    this.add(this.rowG, this.beamG, this.qkvG, this.barG, this.headG, this.matrixG, this.costG);
    this.buildRow();
    this.buildMatrix();
    this.buildCost();
    hide(this.qkvG, this.barG, this.headG, this.matrixG, this.costG);
  }

  // ───────── 权重计算 ─────────
  logits(i, kind = 'mix', variant = this.variant) {
    const n = VARIANTS[variant].toks.length;
    const toks = VARIANTS[variant].toks;
    const out = [];
    const links = [...LINKS.common, ...LINKS[variant]];
    for (let j = 0; j < n; j++) {
      if (j > i) {
        out.push(-Infinity);
        continue;
      }
      let s = 0;
      const sem = links.filter((l) => l[0] === i && l[1] === j).reduce((a, l) => a + l[2], 0);
      if (kind === 'mix') {
        s = (j === i ? 0.7 : 0) + (j === i - 1 ? 0.6 : 0) + (j === 0 ? 0.3 : 0) + sem;
      } else if (kind === 'sem') {
        s = sem * 1.4 + (j === i ? 0.3 : 0);
      } else if (kind === 'prev') {
        s = j === i - 1 ? 3.2 : j === i ? 1.0 : 0;
      } else if (kind === 'syn') {
        s = (j === i - 1 ? 1.4 : 0) + ([2, 7].includes(j) ? 1.6 : 0) + (j === i ? 0.4 : 0);
      } else if (kind === 'sink') {
        s = (j === 0 ? 2.6 : 0) + (toks[j] === '，' ? 1.8 : 0);
      }
      out.push(s);
    }
    return out;
  }
  weights(i, kind = 'mix', variant = this.variant) {
    const lg = this.logits(i, kind, variant);
    const valid = lg.map((v) => (v === -Infinity ? null : v));
    const vals = valid.filter((v) => v !== null);
    const sm = softmax(vals);
    let k = 0;
    return valid.map((v) => (v === null ? 0 : sm[k++]));
  }

  // ───────── 句子 ─────────
  xOf(j) {
    const n = VARIANTS[this.variant].toks.length;
    return (j - (n - 1) / 2) * SPACING;
  }
  buildRow() {
    for (const c of [...this.rowG.children]) {
      this.rowG.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.material) o.material.dispose();
      });
    }
    for (const c of [...this.qkvG.children]) {
      this.qkvG.remove(c);
      c.traverse((o) => o.material && o.material.dispose());
    }
    const toks = VARIANTS[this.variant].toks;
    this.blocks = toks.map((t, j) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.8, h: 0.72, textH: 0.4 });
      b.position.set(this.xOf(j), ROW_Y, 0);
      this.rowG.add(b);
      this.pick(b, {
        onClick: () => this.setQuery(j),
        onHover: (on) => b.glowTo(on ? 1.0 : j === this.query ? 0.75 : b.baseGlow, 0.2),
      });
      return b;
    });
    // Q / K / V 小标签
    this.qkv = toks.map((t, j) => {
      const mk = (txt, color, y) => {
        const m = new TokenBlock(txt, { color, minW: 0.42, h: 0.36, d: 0.2, textH: 0.24, glow: 0.8, textColor: '#0b1020' });
        m.position.set(this.xOf(j), y, 0);
        m.userData.home = m.position.clone();
        this.qkvG.add(m);
        return m;
      };
      return { k: mk('K', C.k, 1.35), v: mk('V', C.v, 1.85), q: mk('Q', C.q, 2.35) };
    });
    // 分数 / 权重标签与柱
    for (const c of [...this.barG.children]) {
      this.barG.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.material) o.material.dispose();
      });
    }
    this.bars = toks.map((t, j) => {
      const g = new THREE.Group();
      g.position.set(this.xOf(j), 2.9, -0.15);
      const m = new THREE.Mesh(unitBoxBase(), glowMat(C.q, { glow: 0.8 }));
      m.scale.set(0.5, 0.01, 0.5);
      const val = label('', 'pct', { anchor: 'bottom' });
      val.position.y = 0.1;
      const mask = textPlane('✕ 遮住', 0.26, { color: '#f87171' });
      mask.position.set(0, 0.25, 0.3);
      g.add(m, val, mask);
      g.userData = { m, val, mask };
      this.barG.add(g);
      return g;
    });
    this.qMarker = label('query', 'tag q', { anchor: 'top' });
    this.rowG.add(this.qMarker);
    this.placeMarker();
  }
  placeMarker() {
    this.qMarker.position.set(this.xOf(this.query), ROW_Y - 0.5, 0);
    this.blocks.forEach((b, j) => {
      const m = b.box.material;
      const c = new THREE.Color(j === this.query ? C.q : C.text);
      m.emissive.copy(c);
      m.color.copy(c).multiplyScalar(0.3);
      b.setGlow(j === this.query ? 0.75 : b.baseGlow);
    });
  }

  setQuery(j) {
    this.query = j;
    this.placeMarker();
    this.refresh();
  }
  setVariant(v) {
    if (v === this.variant) return;
    this.variant = v;
    this.query = VARIANTS[v].q;
    this.engine.clearPickables();
    this.buildRow();
    this.buildMatrixCells();
    this.refresh();
  }

  /** 按当前步骤重绘依赖 query 的元素（光束、分数、柱、矩阵行） */
  refresh() {
    const s = this.step;
    this.clearBeams();
    if (s === 0 || s === 3) this.drawBeams(this.weights(this.query), C.cyan, 1.2);
    if (s === 5) this.drawHeads();
    if (s === 2) this.showScores(true);
    if (s === 3) this.showWeights(true);
    if (s === 4) this.showWeights(false);
    if (s === 6) this.highlightRow();
    this.qkv?.forEach((o, j) => {
      if (s >= 2 && s <= 4) o.q.setGlow(j === this.query ? 1.1 : 0.15);
    });
  }

  clearBeams() {
    for (const c of [...this.beamG.children]) {
      this.beamG.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }
  }
  drawBeams(w, color, h0 = 1.2, zOff = 0, group = this.beamG, strength = 1) {
    const i = this.query;
    const from = V3(this.xOf(i), ROW_Y + 0.38, zOff);
    w.forEach((wt, j) => {
      if (j === i || wt < 0.015) return;
      const to = V3(this.xOf(j), ROW_Y + 0.38, zOff);
      const b = beam(from, to, {
        height: h0 + Math.abs(i - j) * 0.28,
        radius: 0.015 + wt * 0.12,
        color,
        opacity: (0.3 + wt * 1.3) * strength,
        base: 0.25,
        speed: -0.6,
        density: 2,
      });
      group.add(b);
    });
  }
  showScores(animate) {
    const lg = this.logits(this.query);
    this.bars.forEach((g, j) => {
      const { m, val, mask } = g.userData;
      const masked = lg[j] === -Infinity;
      mask.visible = masked;
      val.setHTML(masked ? '' : (lg[j] / 1).toFixed(1));
      const h = masked ? 0.01 : 0.12 + lg[j] * 0.45;
      m.material.emissive.setHex(C.k);
      if (animate) this.tw(m.scale, { y: h, duration: 0.5 });
      else m.scale.y = h;
      val.position.y = h + 0.08;
    });
  }
  showWeights(animate) {
    const w = this.weights(this.query);
    this.bars.forEach((g, j) => {
      const { m, val, mask } = g.userData;
      const masked = j > this.query;
      mask.visible = masked;
      val.setHTML(masked ? '' : `${Math.round(w[j] * 100)}%`);
      const h = masked ? 0.01 : Math.max(0.02, w[j] * 3.2);
      m.material.emissive.setHex(C.q);
      if (animate) this.tw(m.scale, { y: h, duration: 0.6, ease: 'power2.inOut' });
      else m.scale.y = h;
      this.tw(val.position, { y: h + 0.08, duration: animate ? 0.6 : 0 });
    });
  }

  // ───────── 多头 ─────────
  drawHeads() {
    for (const c of [...this.headG.children]) {
      this.headG.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    HEADS.forEach((h, k) => {
      const w = this.weights(this.query, h.kind);
      const g = new THREE.Group();
      this.drawBeams(w, h.color, 0.5 + k * 0.75, (k - 1.5) * 0.45, g, 0.6);
      const top = label(h.name, 'tag', { anchor: 'right' });
      top.element.style.color = '#' + new THREE.Color(h.color).getHexString();
      top.position.set(this.xOf(0) - 0.7, ROW_Y + 1.0 + k * 0.75, (k - 1.5) * 0.45);
      g.add(top);
      this.headG.add(g);
    });
  }

  // ───────── 注意力矩阵 ─────────
  buildMatrix() {
    this.matrixG.position.set(0, 0, 2.2);
    const t = label('注意力矩阵：行 = 谁在看（query），列 = 被看的（key）', 'tag', { anchor: 'bottom' });
    t.position.set(0, 0.2, 6.6);
    this.matrixG.add(t);
    this.cellsG = new THREE.Group();
    this.matrixG.add(this.cellsG);
    this.buildMatrixCells();
  }
  buildMatrixCells() {
    for (const c of [...this.cellsG.children]) {
      this.cellsG.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.material) o.material.dispose();
        if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
      });
    }
    const toks = VARIANTS[this.variant].toks;
    const n = toks.length;
    const DZ = 0.6;
    this.cells = [];
    for (let i = 0; i < n; i++) {
      const w = this.weights(i);
      const row = [];
      for (let j = 0; j < n; j++) {
        const masked = j > i;
        const m = new THREE.Mesh(unitBoxBase(), glowMat(masked ? C.red : C.q, { glow: masked ? 0.25 : 0.4 + w[j] * 1.6, opacity: masked ? 0.35 : 0.9 }));
        const h = masked ? 0.03 : 0.04 + w[j] * 1.7;
        m.scale.set(0.9, h, 0.5);
        m.position.set(this.xOf(j), 0, i * DZ);
        m.userData.h = h;
        this.cellsG.add(m);
        row.push(m);
      }
      const rl = textPlane(toks[i], 0.24, { color: '#cbd5e1' });
      rl.rotation.x = -Math.PI / 2;
      rl.position.set(this.xOf(0) - 1.0, 0.02, i * DZ);
      this.cellsG.add(rl);
      this.cells.push(row);
    }
  }
  highlightRow() {
    this.cells.forEach((row, i) =>
      row.forEach((m, j) => {
        const masked = j > i;
        m.material.emissiveIntensity = masked ? 0.25 : i === this.query ? 0.9 + (m.userData.h / 1.7) * 1.2 : 0.25 + (m.userData.h / 1.7) * 0.9;
        m.material.opacity = masked ? 0.3 : i === this.query ? 1 : 0.55;
      })
    );
  }

  // ───────── O(n²) ─────────
  buildCost() {
    const MAXN = 48;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.costMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x334155, emissive: C.q, emissiveIntensity: 0.5, transparent: true, roughness: 0.4 }), MAXN * MAXN);
    this.costMesh.count = 0;
    this.costG.add(this.costMesh);
    this.costLabel = label('', 'tag q', { anchor: 'bottom' });
    this.costLabel.position.set(0, 2.2, -3.4);
    this.costG.add(this.costLabel);
    this.costN = { n: 6 };
  }
  layoutCost(nf) {
    const n = Math.max(2, Math.round(nf));
    const SIZE = 6.4;
    const cell = SIZE / n;
    const m4 = new THREE.Matrix4();
    const R = (i, j) => Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const masked = j > i;
        const h = masked ? 0.02 : 0.05 + Math.pow(R(i, j), 3) * 1.2 * (j === i || j === 0 ? 1.6 : 1);
        m4.compose(V3(-SIZE / 2 + cell * (j + 0.5), 0, -SIZE / 2 + cell * (i + 0.5) + 0.6), new THREE.Quaternion(), V3(cell * 0.86, h, cell * 0.86));
        this.costMesh.setMatrixAt(k++, m4);
      }
    }
    this.costMesh.count = k;
    this.costMesh.instanceMatrix.needsUpdate = true;
    this.costLabel.setHTML(`n = <b>${n}</b> 个 token → <b>${(n * n).toLocaleString()}</b> 个注意力分数`);
  }

  // ───────── 步骤 ─────────
  go(step) {
    const tl = this.tl;
    const rowOn = step <= 6;
    this.fade(this.rowG, rowOn ? 1 : 0, 0, 0.5);
    this.fade(this.qkvG, step >= 1 && step <= 4 ? 1 : 0, 0, 0.5);
    this.fade(this.barG, step >= 2 && step <= 4 ? 1 : 0, 0, 0.5);
    this.fade(this.headG, step === 5 ? 1 : 0, 0, 0.4);
    this.fade(this.matrixG, step === 6 ? 1 : 0, step === 6 ? 0.3 : 0, 0.6);
    this.fade(this.costG, step === 7 ? 1 : 0, step === 7 ? 0.3 : 0, 0.6);
    this.fade(this.beamG, step === 0 || step === 3 ? 1 : 0, 0, 0.3);
    this.clearOutVec();

    tl.call(() => this.refresh(), null, 0.05);
    // Q/K/V 回到原位（第 2 步有自己的入场动画）
    if (step !== 1) this.qkv.forEach((o) => {
      for (const key of ['q', 'k', 'v']) {
        const m = o[key];
        tl.to(m.position, { x: m.userData.home.x, y: m.userData.home.y, z: 0, duration: 0.4 }, 0);
        tl.to(m.scale, { x: 1, y: 1, z: 1, duration: 0.4 }, 0);
        tl.to(m, { opacity: 1, duration: 0.3 }, 0);
      }
    });
    if (step === 1) {
      this.qkv.forEach((o, j) => {
        ['k', 'v', 'q'].forEach((key, r) => {
          const m = o[key];
          tl.fromTo(m.position, { y: ROW_Y }, { y: m.userData.home.y, duration: 0.6, ease: 'back.out(1.8)' }, 0.4 + j * 0.06 + r * 0.25);
        });
        o.q.setGlow(0.8);
      });
    }
    if (step === 2) {
      // Q 与每个 K 连线
      tl.call(() => this.drawQK(), null, 0.4);
    }
    if (step === 4) tl.call(() => this.animateWeightedSum(), null, 0.3);
    if (step === 6) {
      this.cells.forEach((row, i) => row.forEach((m) => tl.fromTo(m.scale, { y: 0.001 }, { y: m.userData.h, duration: 0.6, ease: 'power2.out' }, 0.6 + i * 0.08)));
    }
    if (step === 7) {
      tl.set(this.costN, { n: 6 }, 0);
      tl.call(() => this.layoutCost(6), null, 0);
      const seq = [6, 12, 24, 48];
      seq.forEach((n, k) => {
        if (k === 0) return;
        tl.to(this.costN, { n, duration: 1.2, ease: 'power1.inOut', onUpdate: () => this.layoutCost(this.costN.n) }, 1.2 + (k - 1) * 2.4);
      });
    }
  }

  drawQK() {
    this.clearBeams();
    const i = this.query;
    const qPos = this.qkv[i].q.position.clone();
    this.qkv.forEach((o, j) => {
      if (j > i) return;
      const kPos = o.k.position.clone();
      const b = beam(qPos.clone().add(V3(0, 0.15, 0)), kPos.clone().add(V3(0, 0.15, 0)), { height: 0.6 + Math.abs(i - j) * 0.12, radius: 0.018, color: C.q, opacity: 0.8, base: 0.3, speed: -0.8 });
      this.beamG.add(b);
    });
    this.beamG.opacity = 1;
  }

  clearOutVec() {
    if (this.outVec) {
      this.root.remove(this.outVec);
      this.outVec.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.material) o.material.dispose();
      });
      this.outVec = null;
    }
  }
  animateWeightedSum() {
    this.clearOutVec();
    const i = this.query;
    const w = this.weights(i);
    const target = V3(this.xOf(i) + 2.0, 4.6, 0);
    const toks = VARIANTS[this.variant].toks;
    this.outVec = new THREE.Group();
    this.outVec.position.copy(target);
    const blk = new TokenBlock(`新的"${toks[i]}"`, { color: C.v, minW: 1.6, h: 0.7, textH: 0.34, glow: 0.4 });
    const top = w
      .map((x, j) => [x, j])
      .filter(([x]) => x > 0.06)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 4)
      .map(([x, j]) => `${toks[j]} ${Math.round(x * 100)}%`)
      .join(' · ');
    const lb = label(`融合了：${top} …`, 'tag v', { anchor: 'bottom' });
    lb.position.set(0, 0.55, 0);
    this.outVec.add(blk, lb);
    this.root.add(this.outVec);
    this.outVec.opacity = 0;
    this.qkv.forEach((o, j) => {
      if (j > i) return;
      const m = o.v;
      const s = 0.25 + w[j] * 2.2;
      this.tw(m.scale, { x: s, y: s, z: s, duration: 0.5, delay: 0.2 });
      this.tw(m.position, { x: target.x, y: target.y, z: 0.3, duration: 1.2, delay: 0.9 + j * 0.08, ease: 'power2.in' });
      this.tw(m, { opacity: 0, duration: 0.25, delay: 2.0 + j * 0.08 });
    });
    this.tw(this.outVec, { opacity: 1, duration: 0.5, delay: 2.2 });
    this.tw(blk.box.material, { emissiveIntensity: 1.8, duration: 0.4, delay: 2.4, yoyo: true, repeat: 1 });
  }

  widget(step, el) {
    if (step > 6) return null;
    el.innerHTML = `
      <div class="w-title">切换句子（看"它"指谁）</div>
      <div class="w-btns">
        <button class="w-btn ${this.variant === 'A' ? 'active' : ''}" data-v="A">${VARIANTS.A.desc}</button>
        <button class="w-btn ${this.variant === 'B' ? 'active' : ''}" data-v="B">${VARIANTS.B.desc}</button>
      </div>
      <div class="w-small">点击 3D 场景中的任意词，可把它设为 query（发出目光的人）。</div>`;
    el.querySelectorAll('[data-v]').forEach((b) =>
      b.addEventListener('click', () => {
        this.setVariant(b.dataset.v);
        el.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('active', x.dataset.v === this.variant));
        if (this.step === 4) this.animateWeightedSum();
        if (this.step === 2) this.drawQK();
      })
    );
    return null;
  }

  update(dt, t) {
    if (this.step === 7) this.costG.rotation.y = Math.sin(t * 0.3) * 0.15;
  }
}
