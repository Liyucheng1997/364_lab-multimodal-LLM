// 第 6 章 Transformer：层层堆叠
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, beam, flowMaterial, slab, sphereGeo, unitBoxBase, rng, flowPath } from '../core/kit.js';

const TOKS = ['今天', '天气', '真', '好'];
const XS = [-2.25, -0.75, 0.75, 2.25];
const L = 4; // 画出来的层数
const LAYER_H = 2.6;
const Y0 = 1.3;
const TOP = Y0 + L * LAYER_H + 0.4;
const MOE_X = 8.4;
const PARAM_X = -8.6;

// Llama 3 8B 的参数分布（由公开配置计算：词表 128,256、d=4096、32 层、FFN 14,336、GQA 8 个 KV 头）
const PARAMS = [
  ['嵌入层', 0.525, C.text, '128,256 × 4,096'],
  ['注意力（32 层）', 1.342, C.model, '每层 Q/K/V/O ≈ 4,194 万'],
  ['前馈网络 MLP（32 层）', 5.637, C.green, '每层 3 × 4,096 × 14,336 ≈ 1.76 亿'],
  ['输出层', 0.525, C.gold, '4,096 × 128,256'],
];

export default class Transformer extends Chapter {
  static meta = {
    id: 'transformer',
    short: 'Transformer',
    title: 'Transformer：层层堆叠的"理解"',
    subtitle: '注意力负责 token 之间的交流，前馈网络负责每个 token 的深加工；几十层堆叠起来，就是大模型。',
  };

  static steps = [
    {
      title: '一个 Transformer 块',
      cam: [5.2, 3.6, 8.8, 0, 2.6, 0],
      html: `
        <p>大模型由几十个<b>结构完全相同</b>的 Transformer 块堆叠而成。每个块只有两个核心部件：</p>
        <ul>
          <li><span class="chip model">多头注意力</span>：token 之间互相交流（上一章）；</li>
          <li><span class="chip green">前馈网络 MLP</span>：每个 token 各自"深加工"。</li>
        </ul>
        <p>此外还有两个"配件"：<b>归一化（Norm）</b>把数值拉回稳定范围，<b>残差连接（+）</b>把结果加回原向量。</p>
        <div class="formula">x = x + Attention(Norm(x))
x = x + MLP(Norm(x))</div>`,
    },
    {
      title: '残差流：一条信息高速公路',
      cam: [6.5, 7.5, 14, 0, 6.0, 0],
      html: `
        <p>每个 token 都有一条贯穿所有层的竖直"管道"——<b>残差流（Residual Stream）</b>。光点就是在管道中向上流动的向量。</p>
        <p>每个子层都只是从管道里<b>读取</b>信息、计算，再把结果<b>加回</b>管道（"+" 号处），而不是覆盖原来的内容。</p>
        <div class="analogy">像一份在流水线上传递的文件：每道工序只在上面<b>批注</b>，不会撕掉重写。越往上，批注越丰富。</div>
        <div class="note">这种设计让梯度可以顺畅地传到底层，是能训练上百层深网络的关键（源自 2015 年的 ResNet）。</div>`,
    },
    {
      title: '注意力子层：横向交流',
      cam: [4.0, 4.6, 9.5, 0, 3.2, 0],
      html: `
        <p>在紫色的注意力平板上，光束在管道之间<b>横向</b>穿梭——这是 token 之间交换信息的<b>唯一</b>地方。</p>
        <p>例如"好"会从"天气"那里获取"在评价天气"的信息，从"真"那里获取"程度很强"的信息。</p>
        <div class="key">整个 Transformer 中，只有注意力层会让不同位置的 token 相互影响；其它部件都是"各算各的"。</div>`,
    },
    {
      title: '前馈网络 MLP：纵向深加工',
      cam: [4.2, 5.4, 9.0, 0, 3.6, 0],
      html: `
        <p>绿色的前馈网络对<b>每个 token 单独</b>处理：先把向量<b>放大</b>到约 4 倍宽（如 4,096 → 14,336 维），经过非线性激活，再<b>压缩</b>回原来的维度。</p>
        <div class="formula">MLP(x) = W_down · σ(W_up · x)</div>
        <p>研究认为，模型学到的大量<b>事实知识</b>（"巴黎是法国首都"）主要存储在 MLP 的权重里——它像一张巨大的"键值记忆表"。</p>
        <div class="note">闪烁的小球代表被激活的神经元：不同的输入会点亮不同的神经元组合。</div>`,
    },
    {
      title: '混合专家 MoE：只请"对口"的专家',
      cam: [MOE_X - 0.6, 4.4, 10.5, MOE_X - 0.4, 3.2, 0],
      html: `
        <p>很多新模型（Mixtral、DeepSeek-V3、Qwen3-MoE 等）把 MLP 换成了<b>混合专家（Mixture of Experts）</b>：</p>
        <ul>
          <li>准备很多个"专家"（每个都是一个 MLP），图中是 8 个；</li>
          <li>一个小小的<b>路由器</b>为每个 token 挑选最合适的少数几个专家（这里是 2 个）；</li>
          <li>只有被选中的专家参与计算。</li>
        </ul>
        <div class="key">总参数可以非常大，但每个 token 实际用到的只是一小部分。例如 DeepSeek-V3 总共 6,710 亿参数，每个 token 只激活约 370 亿。</div>`,
    },
    {
      title: '堆叠 N 层：越往上越抽象',
      cam: [10, 9.5, 21, 0, 6.2, 0],
      html: `
        <p>把这样的块堆叠几十次：</p>
        <table class="mini">
          <tr><th>模型</th><th>层数</th></tr>
          <tr><td>GPT-2 Small</td><td class="num">12</td></tr>
          <tr><td>Llama 3 8B</td><td class="num">32</td></tr>
          <tr><td>Llama 3 70B</td><td class="num">80</td></tr>
          <tr><td>GPT-3 175B</td><td class="num">96</td></tr>
        </table>
        <p>可解释性研究发现了大致的分工趋势：<b>底层</b>多处理词形、局部搭配；<b>中层</b>形成语义、实体、事实等概念；<b>高层</b>更多地在为"下一个 token 是什么"做准备。</p>
        <p>最顶层的向量，经过输出层变成整个词表的概率（下一章）。</p>`,
    },
    {
      title: '参数都在哪里？',
      cam: [PARAM_X + 0.6, 4.6, 11.5, PARAM_X + 0.8, 3.0, 0],
      html: `
        <p>以开源的 <b>Llama 3 8B</b> 为例（按公开配置计算）：</p>
        <table class="mini">
          <tr><th>部件</th><th>参数量</th></tr>
          <tr><td>嵌入层（词表 × 维度）</td><td class="num">5.3 亿</td></tr>
          <tr><td>注意力（32 层）</td><td class="num">13.4 亿</td></tr>
          <tr class="hl"><td>前馈网络 MLP（32 层）</td><td class="num">56.4 亿</td></tr>
          <tr><td>输出层</td><td class="num">5.3 亿</td></tr>
          <tr><td><b>合计</b></td><td class="num"><b>≈ 80.3 亿</b></td></tr>
        </table>
        <div class="key">MLP 占了约 <b>70%</b> 的参数。"8B"就是 80 亿个可学习的数字；用 16 位精度存储，每个参数 2 字节，光权重就要约 <b>16 GB</b> 显存。</div>`,
    },
  ];

  build() {
    this.towerG = new THREE.Group();
    this.add(this.towerG);
    this.buildTower();
    this.buildMoE();
    this.buildParams();
  }

  buildTower() {
    const g = this.towerG;
    // token 与残差流
    this.tokens = TOKS.map((t, i) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.9, h: 0.62, textH: 0.34 });
      b.position.set(XS[i], 0.45, 0);
      g.add(b);
      return b;
    });
    this.streams = XS.map((x) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, TOP - 0.8, 12, 1, true), flowMaterial(C.cyan, { axis: 1, speed: 0.5, density: 7, base: 0.3, opacity: 0.7 }));
      m.position.set(x, 0.8 + (TOP - 0.8) / 2, 0);
      g.add(m);
      return m;
    });
    this.layers = [];
    for (let l = 0; l < L; l++) {
      const yb = Y0 + l * LAYER_H;
      const layer = new THREE.Group();
      layer.position.y = yb;
      // Norm 1
      const norms = [];
      for (const dy of [0.25, 1.35]) {
        XS.forEach((x) => {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 32), glowMat(C.white, { glow: 0.5, opacity: 0.8 }));
          r.rotation.x = Math.PI / 2;
          r.position.set(x, dy, 0);
          layer.add(r);
          norms.push(r);
        });
      }
      // 注意力平板 + 横向光束
      const plate = slab(6.6, 0.1, 1.5, C.model, { glow: 0.35, opacity: 0.4 });
      plate.position.y = 0.7;
      layer.add(plate);
      const arcs = new THREE.Group();
      const R = rng(11 + l);
      for (let a = 0; a < XS.length; a++) {
        for (let b = 0; b < a; b++) {
          if (R() < 0.35) continue;
          const bm = beam(V3(XS[a], 0.78, 0), V3(XS[b], 0.78, 0), { height: 0.35 + (a - b) * 0.12, radius: 0.025, color: C.model, opacity: 0.9, base: 0.15, speed: -0.9, density: 1.5 });
          arcs.add(bm);
        }
      }
      layer.add(arcs);
      // 残差加号
      const plus = [];
      for (const dy of [1.05, 2.3]) {
        XS.forEach((x) => {
          const p = textPlane('+', 0.32, { color: '#fde047' });
          p.position.set(x + 0.28, dy, 0.02);
          layer.add(p);
          plus.push(p);
        });
      }
      // MLP：每个 token 一圈"神经元"
      const neurons = [];
      const mlps = XS.map((x) => {
        const grp = new THREE.Group();
        grp.position.set(x, 1.8, 0);
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.42, 32, 1, true), new THREE.MeshStandardMaterial({ color: C.green, emissive: C.green, emissiveIntensity: 0.2, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
        grp.add(shell);
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const n = new THREE.Mesh(sphereGeo(0.055, 10), glowMat(C.green, { glow: 0.4, dark: 0.6 }));
          n.position.set(Math.cos(a) * 0.48, (k % 2 ? 0.08 : -0.08), Math.sin(a) * 0.48);
          grp.add(n);
          neurons.push(n);
        }
        layer.add(grp);
        return grp;
      });
      g.add(layer);
      this.layers.push({ layer, plate, arcs, norms, plus, mlps, neurons });
    }
    // 第一层的说明标签
    const L0 = this.layers[0].layer;
    const tags = [
      ['归一化 Norm', 0.25, 'tag'],
      ['多头注意力（token 间交流）', 0.72, 'tag model'],
      ['残差相加 +', 1.05, 'tag q'],
      ['前馈网络 MLP（各自加工）', 1.8, 'tag green'],
    ];
    this.blockTags = tags.map(([t, y, cls]) => {
      const l = label(t, cls, { anchor: 'left' });
      l.position.set(3.55, y, 0);
      L0.add(l);
      return l;
    });
    // 层级说明
    this.depthTags = [
      ['底层：词形、局部搭配', 0],
      ['中层：语义、实体、事实', 1],
      ['中高层：关系、推理', 2],
      ['高层：准备"下一个词"', 3],
    ].map(([t, l]) => {
      const lb = label(t, 'tag', { anchor: 'right' });
      lb.position.set(-3.6, Y0 + l * LAYER_H + 1.0, 0);
      g.add(lb);
      return lb;
    });
    const dots = label('⋮ 真实模型有 32~128 层', 'dim', { anchor: 'right' });
    dots.position.set(-3.6, TOP - 0.2, 0);
    g.add(dots);
    this.depthTags.push(dots);
    // 输出层
    this.outSlab = slab(6.8, 0.3, 1.6, C.gold, { glow: 0.5, opacity: 0.7 });
    this.outSlab.position.y = TOP + 0.2;
    g.add(this.outSlab);
    const ol = label('输出层 → 词表上每个 token 的概率', 'tag', { anchor: 'bottom' });
    ol.position.set(0, TOP + 0.45, 0);
    g.add(ol);
    // 向上流动的光点
    this.pulses = [];
    XS.forEach((x, i) => {
      for (let k = 0; k < 4; k++) {
        const o = new THREE.Mesh(sphereGeo(0.09, 14), glowMat(C.cyan, { glow: 1.2, dark: 0.7 }));
        o.userData = { x, phase: k / 4 + i * 0.13 };
        g.add(o);
        this.pulses.push(o);
      }
    });
  }

  buildMoE() {
    const g = (this.moeG = new THREE.Group());
    g.position.set(MOE_X, 0, 0);
    const toks = ['今天', '天气', '真', '好'];
    this.moeTok = toks.map((t, i) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.85, h: 0.56, textH: 0.3 });
      b.position.set(-2.4 + i * 1.6, 0.45, 0);
      g.add(b);
      return b;
    });
    this.router = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), glowMat(C.q, { glow: 1.0 }));
    this.router.position.set(0, 2.1, 0);
    g.add(this.router);
    const rl = label('路由器：为每个 token 选 2 位专家', 'tag q', { anchor: 'left' });
    rl.position.set(0.6, 2.1, 0);
    g.add(rl);
    this.experts = Array.from({ length: 8 }, (_, k) => {
      const e = new TokenBlock(`专家 ${k + 1}`, { color: C.green, minW: 0.9, w: 0.95, h: 0.7, textH: 0.24, glow: 0.25 });
      e.position.set(-3.85 + k * 1.1, 4.6, 0);
      g.add(e);
      return e;
    });
    this.moeLines = new THREE.Group();
    g.add(this.moeLines);
    const t = label('MoE 层：8 个专家，每个 token 只激活 2 个', 'title', { anchor: 'bottom' });
    t.position.set(0, 5.4, 0);
    g.add(t);
    this.add(g);
    hide(g);
  }
  drawRoute(ti, picks) {
    for (const c of [...this.moeLines.children]) {
      this.moeLines.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }
    const tok = this.moeTok[ti].position;
    this.moeLines.add(flowPath([tok.clone().add(V3(0, 0.3, 0)), V3(tok.x * 0.5, 1.4, 0), this.router.position.clone()], { color: C.cyan, radius: 0.035, speed: 0.8, base: 0.35 }));
    picks.forEach((k) => {
      const e = this.experts[k].position;
      this.moeLines.add(flowPath([this.router.position.clone(), V3((e.x + 0) / 2, 3.5, 0), e.clone().add(V3(0, -0.36, 0))], { color: C.q, radius: 0.035, speed: 0.8, base: 0.35 }));
    });
    this.experts.forEach((e, k) => e.setGlow(picks.includes(k) ? 0.85 : 0.1));
    this.moeTok.forEach((b, i) => b.setGlow(i === ti ? 0.9 : 0.3));
  }

  buildParams() {
    const g = (this.paramG = new THREE.Group());
    g.position.set(PARAM_X, 0, 0);
    const SCALE = 0.85;
    this.paramBars = PARAMS.map(([name, b, color, formula], i) => {
      const grp = new THREE.Group();
      grp.position.set(-2.4 + i * 1.6, 0, 0);
      const m = new THREE.Mesh(unitBoxBase(), glowMat(color, { glow: 0.65 }));
      m.scale.set(1.0, b * SCALE, 1.0);
      grp.add(m);
      const v = label(`${b.toFixed(2)}B`, 'pct', { anchor: 'bottom' });
      v.position.y = b * SCALE + 0.1;
      grp.add(v);
      const n = label(`${name}<br><span class="lbl tiny">${formula}</span>`, 'tag', { anchor: 'top' });
      n.position.set(0, -0.15, 0.6);
      grp.add(n);
      grp.userData = { m, h: b * SCALE };
      g.add(grp);
      return grp;
    });
    const t = label('Llama 3 8B 的 80 亿参数分布', 'title', { anchor: 'bottom' });
    t.position.set(0, 5.6, 0);
    g.add(t);
    this.add(g);
    hide(g);
  }

  go(step) {
    const tl = this.tl;
    const towerOn = step <= 5;
    this.fade(this.towerG, towerOn ? 1 : 0.0, 0, 0.6);
    this.fade(this.moeG, step === 4 ? 1 : 0, step === 4 ? 0.3 : 0, 0.6);
    this.fade(this.paramG, step === 6 ? 1 : 0, step === 6 ? 0.3 : 0, 0.6);
    // 第一层说明标签只在第 1 步显示；层级标签在第 6 步显示
    this.blockTags.forEach((l) => this.fade(l, step === 0 ? 1 : 0, 0.2, 0.4));
    this.depthTags.forEach((l, i) => this.fade(l, step === 5 ? 1 : 0, step === 5 ? 0.6 + i * 0.25 : 0, 0.5));
    // 其他层在第 1 步时变暗，突出第一层
    this.layers.forEach((ly, l) => this.fade(ly.layer, step === 0 && l > 0 ? 0.15 : 1, 0, 0.5));
    // 注意力光束 & MLP 的强调
    const attnFocus = step === 2;
    const mlpFocus = step === 3;
    this.layers.forEach((ly) => {
      tl.to(ly.plate.material, { emissiveIntensity: attnFocus ? 1.1 : 0.35, duration: 0.5 }, 0);
      this.fade(ly.arcs, step === 3 ? 0.25 : 1, 0, 0.4);
      ly.mlps.forEach((m) => tl.to(m.children[0].material, { emissiveIntensity: mlpFocus ? 0.9 : 0.2, duration: 0.5 }, 0));
    });
    this.streams.forEach((s) => tl.to(s.material.uniforms.uBase, { value: step === 1 ? 0.7 : 0.35, duration: 0.5 }, 0));
    if (step === 4) {
      const routes = [
        [0, [1, 5]],
        [1, [5, 6]],
        [2, [0, 3]],
        [3, [2, 6]],
      ];
      const loop = gsap.timeline({ repeat: -1 });
      routes.forEach(([ti, picks], k) => loop.call(() => this.drawRoute(ti, picks), null, k * 1.8));
      loop.to({}, { duration: 1.8 }, 3 * 1.8);
      tl.add(loop, 0.6);
    }
    if (step === 6) {
      this.paramBars.forEach((grp, i) => tl.fromTo(grp.userData.m.scale, { y: 0.01 }, { y: grp.userData.h, duration: 0.9, ease: 'power2.out' }, 0.6 + i * 0.2));
    }
  }

  update(dt, t) {
    if (!this.towerG.visible) return;
    const span = TOP - 0.9;
    const speed = this.step === 1 ? 0.16 : 0.1;
    for (const o of this.pulses) {
      const f = (t * speed + o.userData.phase) % 1;
      o.position.set(o.userData.x, 0.9 + f * span, 0);
      o.scale.setScalar(0.6 + Math.sin(f * Math.PI) * 0.4);
    }
    // MLP 神经元闪烁
    if (this.step === 3 || this.step === 1 || this.step === 5) {
      const k = Math.floor(t * 6);
      if (k !== this._flick) {
        this._flick = k;
        const R = rng(k + 1);
        this.layers.forEach((ly) => ly.neurons.forEach((n) => (n.material.emissiveIntensity = R() < 0.22 ? 2.2 : 0.3)));
      }
    }
  }
}
