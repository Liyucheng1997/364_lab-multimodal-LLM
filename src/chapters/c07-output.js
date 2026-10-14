// 第 7 章 输出与采样：从向量到下一个 token
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, VectorBars, glassBox, beam, unitBoxBase, rng, flowPath } from '../core/kit.js';

const CANDS = [
  ['好', 4.2],
  ['不错', 3.4],
  ['热', 2.6],
  ['冷', 2.2],
  ['晴朗', 1.9],
  ['棒', 1.5],
  ['闷', 1.1],
  ['糟糕', 0.9],
  ['舒服', 0.6],
  ['差', 0.3],
  ['美', 0.1],
  ['的', -0.6],
];
const BAR_X0 = -1.6;
const BAR_DX = 0.86;
const BASE_Y = 1.25;
const PROB_SCALE = 5.5;
const WHEEL_C = V3(3.2, 3.4, 0);
const SEG_COLORS = [0xfbbf24, 0xa78bfa, 0x38bdf8, 0x34d399, 0xf472b6, 0x60a5fa, 0xfb923c, 0x22d3ee, 0xc084fc, 0x4ade80, 0xf87171, 0x94a3b8];

function distribution(T, topK, topP) {
  const z = CANDS.map((c) => c[1] / Math.max(T, 0.01));
  const m = Math.max(...z);
  let p = z.map((v) => Math.exp(v - m));
  let s = p.reduce((a, b) => a + b, 0);
  p = p.map((v) => v / s);
  const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  const keep = new Set();
  let cum = 0;
  for (let r = 0; r < order.length; r++) {
    if (r >= topK) break;
    keep.add(order[r][1]);
    cum += order[r][0];
    if (cum >= topP) break;
  }
  const kept = p.map((v, i) => (keep.has(i) ? v : 0));
  s = kept.reduce((a, b) => a + b, 0);
  return { raw: p, final: kept.map((v) => v / s), keep };
}

export default class Output extends Chapter {
  static meta = {
    id: 'output',
    short: '输出采样',
    title: '输出与采样：从向量到下一个词',
    subtitle: '模型给出的是概率；"选哪个"由采样策略决定。温度、Top-p 这些参数，就在这里起作用。',
  };

  static steps = [
    {
      title: '打分：给词表里每个 token 一个分数',
      cam: [-0.5, 4.2, 13.4, -0.5, 2.6, 0],
      html: `
        <p>Transformer 最后一层输出的向量（左），乘以<b>输出矩阵</b>（中间的紫色板，形状为 维度 × 词表大小），就得到词表中<b>每个 token 的分数</b>——称为 <b>logits</b>。</p>
        <p>右边是"今天天气真___"之后分数最高的 12 个候选。分数可正可负，没有上限，还不是概率。</p>
        <div class="note">输出矩阵常与第 3 章的嵌入矩阵共享权重（或形状对称）：嵌入是"token → 向量"，这里是"向量 → 每个 token 的匹配度"。</div>`,
    },
    {
      title: 'Softmax：分数 → 概率',
      cam: [-0.5, 4.2, 13.4, -0.5, 2.6, 0],
      html: `
        <p>和注意力里一样，用 <b>softmax</b> 把分数变成概率：取指数，再归一化。</p>
        <div class="formula">p_i = e^(z_i) / Σ_j e^(z_j)</div>
        <p>"好"的分数比"不错"只高 0.8，但概率却高出一倍多——指数会<b>放大差距</b>。负分数的"的"概率接近 0，但不是 0。</p>`,
    },
    {
      title: '温度：控制"冒险"程度',
      cam: [-0.5, 4.2, 13.4, -0.5, 2.6, 0],
      html: `
        <p>在 softmax 之前，先把所有分数<b>除以温度 T</b>：</p>
        <div class="formula">p_i = e^(z_i / T) / Σ_j e^(z_j / T)</div>
        <ul>
          <li><b>T &lt; 1</b>：差距被放大，分布更"尖"——回答更稳定、更保守；</li>
          <li><b>T = 1</b>：原始分布；</li>
          <li><b>T &gt; 1</b>：差距被缩小，分布更"平"——回答更多样、更有创意，但也更容易出错；</li>
          <li><b>T → 0</b>：永远选最高的那个（贪心解码）。</li>
        </ul>
        <p>拖动下方滑块，看柱子怎么变。</p>`,
    },
    {
      title: 'Top-k 与 Top-p：先划定候选圈',
      cam: [-0.5, 4.2, 13.4, -0.5, 2.6, 0],
      html: `
        <p>即使概率很低，长尾里的"怪词"偶尔也会被抽中。所以通常先<b>截断</b>：</p>
        <ul>
          <li><b>Top-k</b>：只保留概率最高的 k 个；</li>
          <li><b>Top-p（核采样）</b>：从高到低累加概率，凑够 p（如 90%）就停，只在这些里面选。</li>
        </ul>
        <p>被淘汰的候选变成灰色，剩下的重新归一化。Top-p 的好处是"自适应"：模型很确定时候选圈很小，不确定时圈子自动变大。</p>`,
    },
    {
      title: '掷骰子：按概率采样',
      cam: [2.2, 4.0, 11.5, 2.4, 3.2, 0],
      html: `
        <p>候选圈和概率定好之后，就像转一个<b>转盘</b>：每个 token 占的扇形面积等于它的概率，转到哪个就输出哪个。</p>
        <p>点下面的按钮试试，或者<b>连抽 20 次</b>看看统计结果。再回到前两步改改温度 / Top-p，转盘会跟着变。</p>
        <div class="key">这就是为什么同一个问题问两次，模型的回答可能不一样。如果需要可复现的结果，可以把温度设为 0（或接近 0）。</div>`,
    },
    {
      title: 'KV Cache：别把算过的再算一遍',
      cam: [0.6, 4.6, 12.5, 0.6, 2.6, 0],
      html: `
        <p>生成第 n 个 token 时，前面 n−1 个 token 的 <span class="chip k">K</span> 和 <span class="chip v">V</span> 在上一步已经算过了，而且<b>不会变</b>（因果掩码保证前面的 token 看不到后面）。</p>
        <p>所以只需为<b>新 token</b> 计算 Q、K、V，再让它的 Q 去和缓存里所有的 K 打分即可。这就是 <b>KV Cache</b>。</p>
        <p>代价是显存：每个 token、每一层都要存一份 K 和 V。以 Llama 3 8B 为例：</p>
        <div class="formula">2 (K和V) × 32 层 × 8 个KV头 × 128 维 × 2 字节
≈ 128 KB / token
128K 上下文 ≈ 16 GB</div>
        <div class="note">这就是为什么长上下文推理很吃显存，也是 GQA（多个头共享 K/V）等技术存在的原因。</div>`,
    },
    {
      title: '为什么输出 token 更慢、更贵？',
      cam: [0, 3.6, 12.5, 0, 2.4, 0],
      html: `
        <p>一次请求分两个阶段：</p>
        <ul>
          <li><b>预填充（Prefill）</b>：你输入的所有 token <b>一次性并行</b>处理完，GPU 算力被充分利用；</li>
          <li><b>解码（Decode）</b>：输出 token 只能<b>一个接一个</b>地生成，每步都要读一遍全部模型权重，速度受显存带宽限制。</li>
        </ul>
        <div class="key">所以各家 API 的<b>输出 token 单价通常是输入的数倍（常见 4~8 倍）</b>；"首字延迟"取决于输入长度，"打字速度"取决于解码速度。推理模型的"思考过程"也是输出 token，同样计费。</div>`,
    },
  ];

  build() {
    this.params = { T: 1, topK: 12, topP: 1 };
    this.buildLogits();
    this.buildWheel();
    this.buildKV();
    this.buildPhases();
  }

  // ───────────── 向量 → logits → 概率柱 ─────────────
  buildLogits() {
    const g = (this.logitG = new THREE.Group());
    const R = rng(5);
    this.vec = new VectorBars(Array.from({ length: 14 }, () => (R() * 2 - 1) * 0.9), { w: 0.11, gap: 0.04, maxH: 0.9 });
    this.vec.position.set(-6.4, 2.2, 0);
    const vl = label('最后一层输出的向量', 'tag text', { anchor: 'top' });
    vl.position.set(-6.4, 1.0, 0);
    this.unemb = glassBox(0.5, 3.6, 2.2, { color: C.model, opacity: 0.25, edge: 0.7, glow: 0.6 });
    this.unemb.position.set(-3.7, 2.4, 0);
    const ul = label('输出矩阵<br><span class="lbl tiny">（d × 词表大小）</span>', 'tag model', { anchor: 'top' });
    ul.position.set(-3.7, 0.3, 0);
    this.flow1 = flowPath([V3(-5.3, 2.3, 0), V3(-4.6, 2.35, 0), V3(-4.0, 2.4, 0)], { color: C.cyan, radius: 0.05 });
    this.flow2 = flowPath([V3(-3.4, 2.4, 0), V3(-2.7, 2.2, 0), V3(-2.1, 1.8, 0)], { color: C.model, radius: 0.05 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(CANDS.length * BAR_DX + 0.4, 0.04, 1.0), glowMat(C.gray, { glow: 0.4, opacity: 0.6 }));
    base.position.set(BAR_X0 + ((CANDS.length - 1) * BAR_DX) / 2, BASE_Y, 0);
    g.add(this.vec, vl, this.unemb, ul, this.flow1, this.flow2, base);
    this.bars = CANDS.map(([t], i) => {
      const grp = new THREE.Group();
      grp.position.set(BAR_X0 + i * BAR_DX, BASE_Y, 0);
      const m = new THREE.Mesh(unitBoxBase(), glowMat(i === 0 ? C.gold : C.model, { glow: 0.55 }));
      m.scale.set(0.62, 0.01, 0.62);
      const tok = new TokenBlock(t, { color: C.model, minW: 0.5, w: 0.74, h: 0.46, d: 0.22, textH: t.length > 1 ? 0.24 : 0.3, glow: 0.45 });
      tok.position.set(0, -0.5, 0.45);
      const val = label('', 'pct', { anchor: 'bottom' });
      grp.add(m, tok, val);
      grp.userData = { m, tok, val };
      g.add(grp);
      return grp;
    });
    this.ctxLabel = label('上文："今天天气真___"', 'tag', { anchor: 'bottom' });
    this.ctxLabel.position.set(BAR_X0 + 4.7, 5.4, 0);
    this.modeLabel = label('', 'title', { anchor: 'bottom' });
    this.modeLabel.position.set(BAR_X0 + 4.7, 6.0, 0);
    g.add(this.ctxLabel, this.modeLabel);
    this.add(g);
  }
  setLogits(at = 0, tl = this.tl) {
    this.bars.forEach((grp, i) => {
      const z = CANDS[i][1];
      const h = z * 0.55;
      const { m, val, tok } = grp.userData;
      tl.to(m.scale, { y: Math.abs(h) < 0.01 ? 0.01 : h, duration: 0.7, ease: 'power2.inOut' }, at + i * 0.04);
      tl.to(val.position, { y: Math.max(h, 0) + 0.08, duration: 0.7 }, at + i * 0.04);
      tl.to(tok.position, { y: h < 0 ? h - 0.35 : -0.5, duration: 0.7 }, at + i * 0.04);
      tl.call(() => val.setHTML(z.toFixed(1)), null, at);
      tl.call(() => {
        m.material.emissive.setHex(i === 0 ? C.gold : C.model);
        tok.box.material.emissive.setHex(C.model);
      }, null, at);
    });
    tl.call(() => this.modeLabel.setHTML('logits（原始分数）'), null, at);
  }
  setProbs(animate = true, at = 0, tl = null) {
    const { T, topK, topP } = this.params;
    const d = distribution(T, topK, topP);
    this.dist = d;
    this.bars.forEach((grp, i) => {
      const p = d.final[i];
      const kept = d.keep.has(i);
      const h = Math.max(0.01, p * PROB_SCALE);
      const { m, val, tok } = grp.userData;
      const vars = { y: h, duration: animate ? 0.6 : 0, ease: 'power2.inOut' };
      if (tl) tl.to(m.scale, vars, at + i * 0.03);
      else this.tw(m.scale, vars);
      const lv = { y: h + 0.08, duration: animate ? 0.6 : 0 };
      if (tl) tl.to(val.position, lv, at + i * 0.03);
      else this.tw(val.position, lv);
      const tv = { y: -0.5, duration: animate ? 0.6 : 0 };
      if (tl) tl.to(tok.position, tv, at);
      else this.tw(tok.position, tv);
      const txt = kept ? `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%` : '✕';
      if (tl) tl.call(() => val.setHTML(txt), null, at + 0.3);
      else val.setHTML(txt);
      m.material.emissive.setHex(kept ? (i === 0 ? C.gold : C.model) : C.slate);
      tok.box.material.emissive.setHex(kept ? C.model : C.slate);
    });
    const msg = `概率（T = ${T.toFixed(2)}${topK < CANDS.length ? `，Top-k = ${topK}` : ''}${topP < 1 ? `，Top-p = ${topP.toFixed(2)}` : ''}）`;
    if (tl) tl.call(() => this.modeLabel.setHTML(msg), null, at);
    else this.modeLabel.setHTML(msg);
  }

  // ───────────── 转盘 ─────────────
  buildWheel() {
    const g = (this.wheelG = new THREE.Group());
    g.position.copy(WHEEL_C);
    this.wheel = new THREE.Group();
    g.add(this.wheel);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.08, 0.05, 10, 96), glowMat(C.white, { glow: 0.5 }));
    g.add(rim);
    const ptr = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 3), glowMat(C.red, { glow: 1.2 }));
    ptr.rotation.z = Math.PI;
    ptr.position.set(0, 2.35, 0.05);
    g.add(ptr);
    this.picked = new TokenBlock('?', { color: C.gold, minW: 1.0, h: 0.8, textH: 0.44, glow: 0.7 });
    this.picked.position.set(0, 0, 0.3);
    g.add(this.picked);
    this.sentence = label('', 'tag', { anchor: 'top' });
    this.sentence.position.set(0, -2.45, 0);
    g.add(this.sentence);
    this.add(g);
    hide(g);
  }
  rebuildWheel() {
    for (const c of [...this.wheel.children]) {
      this.wheel.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    const { T, topK, topP } = this.params;
    const d = distribution(T, topK, topP);
    this.dist = d;
    let cum = 0;
    this.segs = [];
    d.final.forEach((p, i) => {
      if (p <= 0) return;
      const start = cum * Math.PI * 2;
      const len = p * Math.PI * 2;
      const seg = new THREE.Mesh(new THREE.RingGeometry(0.75, 2.0, Math.max(3, Math.ceil(p * 96)), 1, start, Math.max(len - 0.012, 0.001)), new THREE.MeshStandardMaterial({ color: SEG_COLORS[i], emissive: SEG_COLORS[i], emissiveIntensity: 0.45, transparent: true, side: THREE.DoubleSide }));
      this.wheel.add(seg);
      const mid = start + len / 2;
      if (p > 0.035) {
        const tp = textPlane(`${CANDS[i][0]} ${Math.round(p * 100)}%`, p > 0.12 ? 0.26 : 0.19, { color: '#0b1020' });
        tp.position.set(Math.cos(mid) * 1.42, Math.sin(mid) * 1.42, 0.02);
        tp.rotation.z = mid - Math.PI / 2;
        this.wheel.add(tp);
      }
      this.segs.push({ i, start: cum, p, mid });
      cum += p;
    });
  }
  spin(onDone) {
    const r = Math.random();
    let acc = 0;
    let seg = this.segs[this.segs.length - 1];
    for (const s of this.segs) {
      acc += s.p;
      if (r < acc) {
        seg = s;
        break;
      }
    }
    const cur = this.wheel.rotation.z;
    const want = Math.PI / 2 - seg.mid; // 让该扇区中心转到正上方（指针处）
    let target = want - Math.PI * 2 * 4;
    while (target > cur - Math.PI * 2 * 3) target -= Math.PI * 2;
    this.tw(this.wheel.rotation, {
      z: target,
      duration: 2.4,
      ease: 'power3.out',
      onComplete: () => {
        this.wheel.rotation.z = ((target % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        onDone?.(seg.i);
      },
    });
    return seg.i;
  }
  showPicked(i) {
    const t = CANDS[i][0];
    const old = this.picked;
    this.picked = new TokenBlock(t, { color: C.gold, minW: 1.0, h: 0.8, textH: 0.44, glow: 0.7 });
    this.picked.position.copy(old.position);
    this.wheelG.add(this.picked);
    this.wheelG.remove(old);
    old.traverse((o) => o.material && o.material.dispose());
    this.tw(this.picked.scale, { x: 1.25, y: 1.25, z: 1.25, duration: 0.25, yoyo: true, repeat: 1 });
    this.sentence.setHTML(`今天天气真<b style="color:#fde047">${t}</b>`);
  }

  // ───────────── KV Cache ─────────────
  buildKV() {
    const g = (this.kvG = new THREE.Group());
    const toks = ['今', '天天', '气', '真', '好', '，'];
    this.kvToks = toks;
    this.kvCols = toks.map((t, i) => {
      const col = new THREE.Group();
      col.position.set(-4.6 + i * 1.35, 0, 0);
      const b = new TokenBlock(t, { color: C.text, minW: 0.8, h: 0.56, textH: 0.3 });
      b.position.y = 0.45;
      col.add(b);
      const kv = [];
      for (let l = 0; l < 3; l++) {
        const k = new TokenBlock('K', { color: C.k, minW: 0.4, w: 0.42, h: 0.32, d: 0.2, textH: 0.2, glow: 0.45, textColor: '#0b1020' });
        const v = new TokenBlock('V', { color: C.v, minW: 0.4, w: 0.42, h: 0.32, d: 0.2, textH: 0.2, glow: 0.45, textColor: '#0b1020' });
        k.position.set(-0.24, 1.25 + l * 0.95, 0);
        v.position.set(0.24, 1.25 + l * 0.95, 0);
        col.add(k, v);
        kv.push(k, v);
      }
      col.userData = { b, kv };
      g.add(col);
      return col;
    });
    for (let l = 0; l < 3; l++) {
      const ll = textPlane(`第 ${l + 1} 层`, 0.2, { color: '#94a3b8', weight: 500 });
      ll.position.set(-5.7, 1.25 + l * 0.95, 0);
      g.add(ll);
    }
    this.kvBox = glassBox(1.35 * 5 + 0.2, 3.0, 0.9, { color: C.k, opacity: 0.05, edge: 0.45, glow: 0.2 });
    this.kvBox.position.set(-4.6 + 1.35 * 2, 2.2, 0);
    g.add(this.kvBox);
    this.kvLabel = label('KV 缓存：已算好的 K、V 存起来复用', 'tag k', { anchor: 'bottom' });
    this.kvLabel.position.set(-4.6 + 1.35 * 2, 3.8, 0);
    this.kvNew = label('新 token：只算它自己的 Q / K / V', 'tag q', { anchor: 'bottom' });
    this.kvNew.position.set(-4.6 + 1.35 * 5, 4.4, 0);
    this.kvQ = new TokenBlock('Q', { color: C.q, minW: 0.42, w: 0.46, h: 0.34, d: 0.2, textH: 0.22, glow: 0.9, textColor: '#0b1020' });
    this.kvQ.position.set(-4.6 + 1.35 * 5, 4.1, 0);
    this.kvBeams = new THREE.Group();
    g.add(this.kvLabel, this.kvNew, this.kvQ, this.kvBeams);
    this.kvMode = 'cache';
    this.add(g);
    hide(g);
  }
  runKV(tl) {
    const last = this.kvCols[this.kvCols.length - 1];
    const prev = this.kvCols.slice(0, -1);
    const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
    // 新 token 出现
    loop.set(last, { opacity: 0 }, 0);
    loop.to(last, { opacity: 1, duration: 0.4 }, 0.2);
    loop.fromTo(last.position, { y: 1.5 }, { y: 0, duration: 0.6, ease: 'back.out(1.6)' }, 0.2);
    loop.set(this.kvQ, { opacity: 0 }, 0);
    loop.to(this.kvQ, { opacity: 1, duration: 0.3 }, 0.8);
    last.userData.kv.forEach((m, j) => loop.fromTo(m.box.material, { emissiveIntensity: 2.0 }, { emissiveIntensity: 0.45, duration: 0.8 }, 0.9 + j * 0.03));
    if (this.kvMode === 'nocache') {
      prev.forEach((c, ci) => c.userData.kv.forEach((m) => loop.fromTo(m.box.material, { emissiveIntensity: 2.0 }, { emissiveIntensity: 0.45, duration: 0.6 }, 1.0 + ci * 0.12)));
    }
    loop.call(() => this.drawKVBeams(), null, 1.6);
    loop.call(() => this.clearKVBeams(), null, 3.6);
    tl.add(loop, 0.5);
  }
  drawKVBeams() {
    this.clearKVBeams();
    const q = this.kvQ.position;
    this.kvCols.forEach((c) => {
      const k = c.userData.kv[4];
      const to = V3(c.position.x + k.position.x, k.position.y + 0.2, 0);
      this.kvBeams.add(beam(V3(q.x, q.y + 0.1, 0), to, { height: 0.5, radius: 0.025, color: C.q, opacity: 0.9, base: 0.3, speed: -0.9 }));
    });
  }
  clearKVBeams() {
    for (const c of [...this.kvBeams.children]) {
      this.kvBeams.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }
  }

  // ───────────── Prefill vs Decode ─────────────
  buildPhases() {
    const g = (this.phaseG = new THREE.Group());
    const mk = (n, y, color) =>
      Array.from({ length: n }, (_, i) => {
        const b = new TokenBlock('', { color, minW: 0.42, w: 0.46, h: 0.46, d: 0.3, glow: 0.3 });
        b.position.set(-5.2 + i * 0.58, y, 0);
        g.add(b);
        return b;
      });
    this.preBlocks = mk(18, 3.7, C.text);
    this.decBlocks = mk(18, 1.3, C.gold);
    const l1 = label('输入（预填充 Prefill）：一次并行算完', 'tag text', { anchor: 'bottom' });
    l1.position.set(-5.4, 4.35, 0);
    l1.center.set(0, 1);
    const l2 = label('输出（解码 Decode）：只能一个接一个', 'tag', { anchor: 'bottom' });
    l2.position.set(-5.4, 1.95, 0);
    l2.center.set(0, 1);
    this.preClock = label('', 'pct', { anchor: 'left' });
    this.preClock.position.set(5.6, 3.7, 0);
    this.decClock = label('', 'pct', { anchor: 'left' });
    this.decClock.position.set(5.6, 1.3, 0);
    g.add(l1, l2, this.preClock, this.decClock);
    this.add(g);
    hide(g);
  }
  runPhases(tl) {
    const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    const clk = { a: 0, b: 0 };
    this.preBlocks.forEach((b) => loop.set(b.box.material, { emissiveIntensity: 0.15 }, 0));
    this.decBlocks.forEach((b) => loop.set(b, { opacity: 0 }, 0));
    loop.set(clk, { a: 0, b: 0 }, 0);
    this.preBlocks.forEach((b) => loop.to(b.box.material, { emissiveIntensity: 1.6, duration: 0.25, yoyo: true, repeat: 1 }, 0.5));
    loop.to(clk, { a: 1, duration: 0.5, onUpdate: () => this.preClock.setHTML(`⏱ ${(clk.a * 0.2).toFixed(2)} 秒`) }, 0.5);
    this.decBlocks.forEach((b, i) => {
      loop.to(b, { opacity: 1, duration: 0.15 }, 1.0 + i * 0.32);
      loop.fromTo(b.scale, { x: 0.3, y: 0.3, z: 0.3 }, { x: 1, y: 1, z: 1, duration: 0.25, ease: 'back.out(2)' }, 1.0 + i * 0.32);
    });
    loop.to(clk, { b: 1, duration: 18 * 0.32, ease: 'none', onUpdate: () => this.decClock.setHTML(`⏱ ${(clk.b * 18 * 0.03).toFixed(2)} 秒`) }, 1.0);
    tl.add(loop, 0.4);
  }

  go(step) {
    const tl = this.tl;
    const barsOn = step <= 3;
    this.fade(this.logitG, barsOn ? 1 : 0, 0, 0.5);
    this.fade(this.wheelG, step === 4 ? 1 : 0, step === 4 ? 0.3 : 0, 0.5);
    this.fade(this.kvG, step === 5 ? 1 : 0, step === 5 ? 0.3 : 0, 0.5);
    this.fade(this.phaseG, step === 6 ? 1 : 0, step === 6 ? 0.3 : 0, 0.5);
    if (step === 0) {
      this.bars.forEach((grp) => tl.set(grp.userData.m.scale, { y: 0.01 }, 0));
      tl.fromTo(this.vec.position, { x: -7.4 }, { x: -6.4, duration: 0.8 }, 0.2);
      this.setLogits(1.0);
    }
    if (step === 1) {
      this.params = { T: 1, topK: CANDS.length, topP: 1 };
      this.setLogits(0, tl);
      tl.call(() => this.setProbs(true), null, 1.4);
    }
    if (step === 2 || step === 3) {
      if (step === 2) this.params.topK = CANDS.length;
      if (step === 2) this.params.topP = 1;
      tl.call(() => this.setProbs(true), null, 0.2);
    }
    if (step === 4) {
      tl.call(() => {
        this.rebuildWheel();
        this.sentence.setHTML('今天天气真___');
      }, null, 0);
    }
    if (step === 5) this.runKV(tl);
    if (step === 6) this.runPhases(tl);
  }

  widget(step, el) {
    if (step === 2) {
      el.innerHTML = `
        <div class="w-title">温度 Temperature</div>
        <div class="w-row"><label>T</label><input type="range" id="t" min="0.05" max="2" step="0.05" value="${this.params.T}"><output id="tv">${this.params.T.toFixed(2)}</output></div>
        <div class="w-btns"><button class="w-btn" data-t="0.2">0.2 保守</button><button class="w-btn" data-t="0.7">0.7 常用</button><button class="w-btn" data-t="1">1.0 原始</button><button class="w-btn" data-t="1.6">1.6 奔放</button></div>`;
      const r = el.querySelector('#t');
      const set = (v) => {
        this.params.T = Number(v);
        r.value = v;
        el.querySelector('#tv').textContent = Number(v).toFixed(2);
        this.setProbs(true);
      };
      r.addEventListener('input', () => set(r.value));
      el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => set(b.dataset.t)));
      return null;
    }
    if (step === 3) {
      el.innerHTML = `
        <div class="w-title">截断策略</div>
        <div class="w-row"><label>Top-k</label><input type="range" id="k" min="1" max="${CANDS.length}" step="1" value="${this.params.topK}"><output id="kv">${this.params.topK}</output></div>
        <div class="w-row"><label>Top-p</label><input type="range" id="p" min="0.1" max="1" step="0.05" value="${this.params.topP}"><output id="pv">${this.params.topP.toFixed(2)}</output></div>
        <div class="w-row"><label>温度 T</label><input type="range" id="t" min="0.05" max="2" step="0.05" value="${this.params.T}"><output id="tv">${this.params.T.toFixed(2)}</output></div>
        <div class="w-small">提示：Top-p = 0.9 时，只保留累计概率前 90% 的候选。</div>`;
      const k = el.querySelector('#k');
      const p = el.querySelector('#p');
      const t = el.querySelector('#t');
      const upd = () => {
        this.params.topK = Number(k.value);
        this.params.topP = Number(p.value);
        this.params.T = Number(t.value);
        el.querySelector('#kv').textContent = k.value;
        el.querySelector('#pv').textContent = Number(p.value).toFixed(2);
        el.querySelector('#tv').textContent = Number(t.value).toFixed(2);
        this.setProbs(true);
      };
      [k, p, t].forEach((x) => x.addEventListener('input', upd));
      return null;
    }
    if (step === 4) {
      el.innerHTML = `
        <div class="w-title">采样实验（T = ${this.params.T.toFixed(2)}，Top-k = ${this.params.topK}，Top-p = ${this.params.topP.toFixed(2)}）</div>
        <div class="w-btns"><button class="w-btn primary" id="once">🎲 采样一次</button><button class="w-btn" id="twenty">连抽 20 次</button><button class="w-btn" id="reset">清空统计</button></div>
        <div id="hist" style="margin-top:8px"></div>`;
      const counts = new Map();
      const hist = el.querySelector('#hist');
      const draw = () => {
        const total = [...counts.values()].reduce((a, b) => a + b, 0);
        if (!total) {
          hist.innerHTML = '<div class="w-small">还没有采样。</div>';
          return;
        }
        const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        hist.innerHTML =
          `<div class="w-small">共 ${total} 次：</div>` +
          rows
            .map(
              ([i, n]) =>
                `<div class="w-row" style="margin:3px 0"><span style="min-width:44px">${CANDS[i][0]}</span><span style="flex:1;height:10px;border-radius:5px;background:#1e293b;overflow:hidden"><span style="display:block;height:100%;width:${(n / total) * 100}%;background:#${SEG_COLORS[i].toString(16).padStart(6, '0')}"></span></span><span class="w-val">${n}</span></div>`
            )
            .join('');
      };
      draw();
      const once = el.querySelector('#once');
      once.onclick = () => {
        once.disabled = true;
        this.spin((i) => {
          counts.set(i, (counts.get(i) || 0) + 1);
          this.showPicked(i);
          draw();
          once.disabled = false;
        });
      };
      el.querySelector('#twenty').onclick = () => {
        for (let n = 0; n < 20; n++) {
          const r = Math.random();
          let acc = 0;
          for (const s of this.segs) {
            acc += s.p;
            if (r < acc) {
              counts.set(s.i, (counts.get(s.i) || 0) + 1);
              break;
            }
          }
        }
        draw();
      };
      el.querySelector('#reset').onclick = () => {
        counts.clear();
        draw();
      };
      return null;
    }
    if (step === 5) {
      el.innerHTML = `
        <div class="w-title">对比</div>
        <div class="w-btns"><button class="w-btn ${this.kvMode === 'cache' ? 'active' : ''}" data-m="cache">使用 KV Cache</button><button class="w-btn ${this.kvMode === 'nocache' ? 'active' : ''}" data-m="nocache">不用缓存（全部重算）</button></div>
        <div class="w-small">不用缓存时，每生成一个 token，前面所有 token 的 K、V 都要重算一遍（闪烁），总计算量随长度平方增长。</div>`;
      el.querySelectorAll('[data-m]').forEach((b) =>
        b.addEventListener('click', () => {
          this.kvMode = b.dataset.m;
          el.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('active', x.dataset.m === this.kvMode));
          this.newTimeline();
          this.tl.to(this.kvG, { opacity: 1, duration: 0.2 }, 0);
          this.runKV(this.tl);
        })
      );
      return null;
    }
    return null;
  }

  update(dt, t) {
    if (this.wheelG.visible && this.picked) this.picked.rotation.y = Math.sin(t * 1.4) * 0.25;
  }
}
