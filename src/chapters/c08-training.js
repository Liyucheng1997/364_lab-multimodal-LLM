// 第 8 章 训练：模型是怎么学会的
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, unitBoxBase, flowPath, viridis, sphereGeo, glassBox, slab, orb } from '../core/kit.js';
import { makeTower } from '../core/props.js';

const POEM = ['床', '前', '明', '月', '光', '，', '疑', '是', '地', '上', '霜'];
// 训练初期 / 训练后：模型给"正确下一个字"的概率（示意）
const P_EARLY = [0.002, 0.01, 0.004, 0.02, 0.006, 0.03, 0.003, 0.02, 0.01, 0.008];
const P_LATE = [0.35, 0.62, 0.71, 0.93, 0.88, 0.57, 0.96, 0.9, 0.95, 0.97];
const DETAIL_IDX = 3; // "床前明月" → "光"
const DETAIL = [['光', 0.93], ['亮', 0.03], ['下', 0.01], ['色', 0.01], ['圆', 0.005]];

// 损失地形
function lossFn(x, z) {
  return (
    0.045 * (x * x + z * z) -
    1.7 * Math.exp(-((x - 1.6) ** 2 + (z + 1.1) ** 2) / 2.2) -
    1.0 * Math.exp(-((x + 2.1) ** 2 + (z - 1.6) ** 2) / 1.1) +
    0.7 * Math.exp(-(x * x + (z - 0.3) ** 2) / 0.9) +
    0.07 * Math.sin(1.7 * x) * Math.cos(1.4 * z)
  );
}
const LAND_Y = 2.0;
const LAND_S = 1.25;

export default class Training extends Chapter {
  static meta = {
    id: 'training',
    short: '训练',
    title: '训练：模型是怎么"学会"的',
    subtitle: '没有人把规则写进模型。它只是在海量文本上反复做"预测下一个 token"的练习，一点点调整几十亿个参数。',
  };

  static steps = [
    {
      title: '学习目标：猜下一个字',
      cam: [0, 3.8, 12.5, 0, 2.2, 0],
      html: `
        <p>预训练的任务极其简单：给模型一段真实文本，让它在<b>每个位置</b>预测下一个 token，然后对照答案打分。</p>
        <p>以"床前明月光，疑是地上霜"为例：看到"床前明月"，正确答案是"光"。绿色柱子是模型给正确答案的概率。</p>
        <ul>
          <li><b>训练前</b>：参数是随机的，正确答案的概率几乎为 0；</li>
          <li><b>训练后</b>：模型学会了，"光"的概率高达 93%。</li>
        </ul>
        <div class="key">一段文本的每个位置都能同时出题，所以一本书就是几十万道免费的练习题——不需要人工标注。这叫<b>自监督学习</b>。</div>`,
    },
    {
      title: '损失函数：猜错要受"惩罚"',
      cam: [0, 3.2, 10, 0, 2.6, 0],
      html: `
        <p>怎么衡量"猜得好不好"？用<b>交叉熵损失</b>：</p>
        <div class="formula">loss = −log( p(正确答案) )</div>
        <ul>
          <li>p = 0.9 → 损失 0.11（猜得好，惩罚小）</li>
          <li>p = 0.5 → 损失 0.69</li>
          <li>p = 0.01 → 损失 4.6（很有把握地猜错，惩罚巨大）</li>
        </ul>
        <p>拖动滑块，看小球在曲线上移动。训练的目标，就是让所有位置的平均损失<b>尽可能小</b>。</p>`,
    },
    {
      title: '梯度下降：蒙着眼下山',
      cam: [7.5, 8.2, 10.5, 0, 1.6, 0],
      html: `
        <p>把模型的所有参数想象成"地图上的坐标"，损失就是这个位置的"海拔"。训练就是要找到海拔最低的山谷。</p>
        <p>模型看不到全貌，只能感受脚下的<b>坡度</b>（梯度），然后朝下坡方向迈一小步——这就是<b>梯度下降</b>。每一步的步长叫<b>学习率</b>。</p>
        <ul>
          <li>学习率太小：走得太慢；</li>
          <li>学习率太大：一步跨过山谷，来回震荡甚至"飞出去"。</li>
        </ul>
        <div class="note">真实模型有几十亿个参数，相当于在几十亿维的空间里下山。"反向传播"算法能一次性高效算出所有参数的梯度。</div>`,
    },
    {
      title: '三个阶段：从"续写机"到"助手"',
      cam: [0, 5.5, 15, 0, 2.6, 0],
      html: `
        <ol>
          <li><b>预训练</b>：在数万亿 token 的网页、书籍、代码上练习"预测下一个 token"。得到一个知识渊博的"续写机"，但它只会接着往下写，不懂得回答问题。（例：Llama 3 用了约 15 万亿 token。）</li>
          <li><b>指令微调（SFT）</b>：用人工编写的高质量"问题 → 回答"对话继续训练，让它学会按指令办事。</li>
          <li><b>偏好对齐（RLHF / DPO）</b>：让人类（或 AI）比较多个回答的好坏，引导模型更有用、更诚实、更安全。</li>
        </ol>
        <div class="note">近年的"推理模型"还会加一轮<b>强化学习</b>：在数学题、编程题这类答案可自动验证的任务上，奖励能得出正确结果的思考过程。</div>`,
    },
    {
      title: '多模态模型怎么训练？',
      cam: [0, 4.6, 13, 0, 2.6, 0],
      html: `
        <p>常见的"视觉编码器 + 投影器 + LLM"结构（如 LLaVA、Qwen-VL 系列）通常分两步训练：</p>
        <ol>
          <li><b>对齐阶段</b>：<span class="chip k">❄ 冻结</span>已经训练好的视觉编码器和 LLM，<span class="chip" style="background:#fb923c">🔥 只训练</span>中间小小的<b>投影器</b>。数据是海量"图片 + 描述"对。目标：让图像向量"翻译"成 LLM 能读懂的语言。</li>
          <li><b>指令微调阶段</b>：解冻 LLM（有时也微调视觉编码器），用"看图问答""看图聊天"这类多模态对话数据一起训练。</li>
        </ol>
        <p>点下方按钮切换阶段，观察哪些模块被"冻住"。</p>
        <div class="note">也有模型从一开始就把图像、文本混在一起预训练（"原生多模态"），各家的具体做法不尽相同。</div>`,
    },
  ];

  build() {
    this.buildPoem();
    this.buildCurve();
    this.buildLand();
    this.buildStages();
    this.buildMM();
  }

  // ───────────── 下一个字预测 ─────────────
  buildPoem() {
    const g = (this.poemG = new THREE.Group());
    const DX = 1.05;
    this.poemBlocks = POEM.map((t, i) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.8, h: 0.7, textH: 0.42 });
      b.position.set((i - (POEM.length - 1) / 2) * DX, 0.5, 0);
      g.add(b);
      return b;
    });
    this.probBars = P_EARLY.map((p, i) => {
      const grp = new THREE.Group();
      grp.position.set((i - (POEM.length - 1) / 2) * DX + DX / 2, 1.1, 0);
      const m = new THREE.Mesh(unitBoxBase(), glowMat(C.green, { glow: 0.8 }));
      m.scale.set(0.42, 0.02, 0.42);
      const v = label('', 'pct', { anchor: 'bottom' });
      const arrowTxt = textPlane(`→${POEM[i + 1]}`, 0.2, { color: '#86efac', weight: 600 });
      arrowTxt.position.set(0, -0.2, 0.3);
      grp.add(m, v, arrowTxt);
      grp.userData = { m, v };
      g.add(grp);
      return grp;
    });
    this.lossLabel = label('', 'tag red', { anchor: 'bottom' });
    this.lossLabel.position.set(0, 5.2, 0);
    this.stateLabel = label('', 'title', { anchor: 'bottom' });
    this.stateLabel.position.set(0, 5.8, 0);
    // 细节框：看到"床前明月"之后的候选
    this.detail = label('', 'card', { anchor: 'bottom' });
    this.detail.position.set(this.probBars[DETAIL_IDX].position.x - 3.2, 3.2, 0);
    g.add(this.lossLabel, this.stateLabel, this.detail);
    this.add(g);
    hide(g);
  }
  setPoemProbs(ps, tl, at, tag) {
    const mean = ps.reduce((a, p) => a - Math.log(p), 0) / ps.length;
    this.probBars.forEach((grp, i) => {
      const { m, v } = grp.userData;
      const h = Math.max(0.02, ps[i] * 3.2);
      tl.to(m.scale, { y: h, duration: 0.9, ease: 'power2.inOut' }, at + i * 0.05);
      tl.to(v.position, { y: h + 0.06, duration: 0.9 }, at + i * 0.05);
      tl.call(() => v.setHTML(`${Math.round(ps[i] * 100)}%`), null, at + 0.4);
    });
    tl.call(() => {
      this.stateLabel.setHTML(tag);
      this.lossLabel.setHTML(`平均损失 = ${mean.toFixed(2)}`);
    }, null, at);
  }

  // ───────────── −log(p) 曲线 ─────────────
  buildCurve() {
    const g = (this.curveG = new THREE.Group());
    g.position.set(-3.6, 0.8, 0);
    const W = 7.2;
    const H = 4.4;
    const ax1 = new THREE.Mesh(new THREE.BoxGeometry(W, 0.03, 0.03), glowMat(C.gray, { glow: 0.6 }));
    ax1.position.set(W / 2, 0, 0);
    const ax2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, 0.03), glowMat(C.gray, { glow: 0.6 }));
    ax2.position.set(0, H / 2, 0);
    g.add(ax1, ax2);
    const xl = label('p（模型给正确答案的概率）→', 'dim', { anchor: 'top' });
    xl.position.set(W / 2, -0.25, 0);
    const yl = label('损失 ↑', 'dim', { anchor: 'right' });
    yl.position.set(-0.15, H - 0.2, 0);
    g.add(xl, yl);
    for (const p of [0.25, 0.5, 0.75, 1]) {
      const t = textPlane(p.toFixed(2), 0.18, { color: '#64748b', weight: 500 });
      t.position.set(p * W, -0.55, 0);
      g.add(t);
    }
    const pts = [];
    for (let k = 0; k <= 200; k++) {
      const p = 0.012 + (k / 200) * 0.988;
      pts.push(V3(p * W, Math.min(-Math.log(p), 4.4) * (H / 4.6), 0));
    }
    g.add(flowPath(pts, { color: C.red, radius: 0.04, base: 0.8, density: 4, speed: 0.3, tension: 0 }));
    this.curveBall = orb(0.16, C.q, 1.6);
    this.curveDrop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1, 0.02), glowMat(C.q, { glow: 0.8, opacity: 0.6 }));
    this.curveText = label('', 'tag q', { anchor: 'left' });
    g.add(this.curveBall, this.curveDrop, this.curveText);
    this.curve = { W, H, p: { v: 0.5 } };
    this.placeCurve(0.5);
    this.add(g);
    hide(g);
  }
  placeCurve(p) {
    const { W, H } = this.curve;
    const loss = -Math.log(p);
    const y = Math.min(loss, 4.4) * (H / 4.6);
    this.curveBall.position.set(p * W, y, 0);
    this.curveDrop.scale.y = Math.max(y, 0.01);
    this.curveDrop.position.set(p * W, y / 2, 0);
    this.curveText.position.set(p * W + 0.3, y + 0.3, 0);
    this.curveText.setHTML(`p = ${p.toFixed(2)} → 损失 = ${loss.toFixed(2)}`);
  }

  // ───────────── 损失地形 + 梯度下降 ─────────────
  buildLand() {
    const g = (this.landG = new THREE.Group());
    const N = 90;
    const S = 9;
    const geo = new THREE.PlaneGeometry(S, S, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new THREE.Color();
    const colors = new Float32Array(pos.count * 3);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 0; k < pos.count; k++) {
      const y = lossFn(pos.getX(k), pos.getZ(k));
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let k = 0; k < pos.count; k++) {
      const y = lossFn(pos.getX(k), pos.getZ(k));
      pos.setY(k, y * LAND_S);
      viridis(1 - (y - minY) / (maxY - minY), col);
      colors.set([col.r * 0.3, col.g * 0.3, col.b * 0.3], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 1.1;');
    };
    const mesh = new THREE.Mesh(geo, mat);
    const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6366f1, wireframe: true, transparent: true, opacity: 0.12 }));
    wire.position.y = 0.005;
    g.add(mesh, wire);
    g.position.y = LAND_Y;
    this.gdBall = orb(0.17, C.q, 1.8);
    g.add(this.gdBall);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(600 * 3);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeo.setDrawRange(0, 0);
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xfde047, transparent: true }));
    g.add(this.trail);
    const gm = label('全局最低点', 'tag green', { anchor: 'bottom' });
    gm.position.set(1.6, lossFn(1.6, -1.1) * LAND_S + 0.4, -1.1);
    const lm = label('局部低谷（可能被困住）', 'tag', { anchor: 'bottom' });
    lm.position.set(-2.1, lossFn(-2.1, 1.6) * LAND_S + 0.4, 1.6);
    this.gdInfo = label('', 'tag q', { anchor: 'bottom' });
    this.gdInfo.position.set(0, 3.2, 0);
    g.add(gm, lm, this.gdInfo);
    this.gd = { x: -3.4, z: -3.2, lr: 0.35, n: 0, running: false, acc: 0 };
    this.placeBall();
    this.add(g);
    hide(g);
  }
  placeBall() {
    const { x, z } = this.gd;
    this.gdBall.position.set(x, lossFn(x, z) * LAND_S + 0.17, z);
  }
  resetGD(x, z) {
    Object.assign(this.gd, { x, z, n: 0, running: true, acc: 0 });
    this.trailGeo.setDrawRange(0, 0);
    this.placeBall();
  }
  stepGD() {
    const g = this.gd;
    const e = 1e-3;
    const gx = (lossFn(g.x + e, g.z) - lossFn(g.x - e, g.z)) / (2 * e);
    const gz = (lossFn(g.x, g.z + e) - lossFn(g.x, g.z - e)) / (2 * e);
    g.x = Math.max(-4.4, Math.min(4.4, g.x - g.lr * gx * 2.2));
    g.z = Math.max(-4.4, Math.min(4.4, g.z - g.lr * gz * 2.2));
    if (g.n < 600) {
      this.trailPos.set([g.x, lossFn(g.x, g.z) * LAND_S + 0.06, g.z], g.n * 3);
      g.n++;
      this.trailGeo.setDrawRange(0, g.n);
      this.trailGeo.attributes.position.needsUpdate = true;
    }
    this.placeBall();
    const grad = Math.hypot(gx, gz);
    this.gdInfo.setHTML(`第 ${g.n} 步 · 损失 ${lossFn(g.x, g.z).toFixed(3)} · 坡度 ${grad.toFixed(3)}`);
    if ((grad < 0.004 && g.n > 10) || g.n >= 300) g.running = false;
  }

  // ───────────── 三阶段 ─────────────
  buildStages() {
    const g = (this.stageG = new THREE.Group());
    const defs = [
      ['① 预训练', '数万亿 token：网页、书籍、代码', '→ 博学的"续写机"', C.text, -5.2, 0.6],
      ['② 指令微调 SFT', '数万~数百万条高质量问答', '→ 听懂指令的助手', C.green, 0, 1.5],
      ['③ 偏好对齐 RLHF / DPO', '人类比较："A 比 B 好"', '→ 有用、诚实、安全', C.pink, 5.2, 2.4],
    ];
    this.stages = defs.map(([t, d, r, color, x, y]) => {
      const p = slab(3.8, 0.35, 2.6, color, { glow: 0.35, opacity: 0.6 });
      p.position.set(x, y, 0);
      const l = label(`<b>${t}</b><br>${d}<br><span style="color:#94a3b8">${r}</span>`, 'card', { anchor: 'top' });
      l.position.set(x, y - 0.3, 1.5);
      g.add(p, l);
      return { p, l, x, y };
    });
    // 数据"湖"
    const lake = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.6, 40, 1, true), new THREE.MeshStandardMaterial({ color: C.text, emissive: C.text, emissiveIntensity: 0.3, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    lake.position.set(-5.2, 1.6, -0.2);
    g.add(lake);
    this.brain = orb(0.42, C.model, 1.2);
    g.add(this.brain);
    this.add(g);
    hide(g);
  }

  // ───────────── 多模态训练 ─────────────
  buildMM() {
    const g = (this.mmG = new THREE.Group());
    this.mmVis = glassBox(2.4, 2.0, 2.0, { color: C.image, opacity: 0.18, edge: 0.8, glow: 0.4 });
    this.mmVis.position.set(-4.6, 1.6, 0);
    this.mmProj = glassBox(1.0, 1.2, 1.2, { color: C.orange, opacity: 0.22, edge: 0.9, glow: 0.5 });
    this.mmProj.position.set(-1.9, 1.6, 0);
    this.mmLLM = makeTower({ layers: 6, w: 3.0, d: 2.2, gap: 0.55, y0: 0.9, title: '', sub: '' });
    this.mmLLM.position.set(2.2, 0, 0);
    const names = [
      [this.mmVis, '视觉编码器（ViT）', -4.6],
      [this.mmProj, '投影器', -1.9],
      [this.mmLLM, '大语言模型', 2.2],
    ];
    this.mmTags = names.map(([obj, n, x]) => {
      const l = label(n, 'tag', { anchor: 'bottom' });
      l.position.set(x, 4.6, 0);
      g.add(l);
      const st = label('', 'tag', { anchor: 'top' });
      st.position.set(x, 0.0, 1.6);
      g.add(st);
      return st;
    });
    g.add(this.mmVis, this.mmProj, this.mmLLM);
    g.add(flowPath([V3(-3.4, 1.6, 0), V3(-2.4, 1.6, 0)], { color: C.image, radius: 0.05 }));
    g.add(flowPath([V3(-1.4, 1.6, 0), V3(0.6, 1.6, 0)], { color: C.orange, radius: 0.05 }));
    this.mmData = label('', 'card', { anchor: 'bottom' });
    this.mmData.position.set(-1.2, 5.3, 0);
    g.add(this.mmData);
    this.mmStage = 1;
    this.add(g);
    hide(g);
  }
  setMMStage(s) {
    this.mmStage = s;
    const frozen = { vis: true, proj: false, llm: s === 1 };
    const setBox = (obj, isFrozen, base) => {
      obj.box.material.emissive.setHex(isFrozen ? 0x60a5fa : base);
      obj.box.material.color.setHex(isFrozen ? 0x60a5fa : base);
      obj.box.material.emissiveIntensity = isFrozen ? 0.25 : 0.7;
      obj.edges.material.color.setHex(isFrozen ? 0x93c5fd : base);
    };
    setBox(this.mmVis, frozen.vis, C.image);
    setBox(this.mmProj, frozen.proj, C.orange);
    this.mmLLM.userData.slabs.forEach((sl) => {
      sl.material.emissive.setHex(frozen.llm ? 0x60a5fa : C.orange);
      sl.material.emissiveIntensity = frozen.llm ? 0.2 : 0.6;
    });
    const st = (f) => (f ? '<span style="color:#93c5fd">❄ 冻结（参数不变）</span>' : '<span style="color:#fdba74">🔥 训练中</span>');
    this.mmTags[0].setHTML(st(frozen.vis));
    this.mmTags[1].setHTML(st(frozen.proj));
    this.mmTags[2].setHTML(st(frozen.llm));
    this.mmData.setHTML(
      s === 1
        ? '<b>阶段 1 · 对齐</b>：几十万~上亿对"图片 + 文字描述"<br>例：🖼 一只橘猫坐在草地上 → "一只橘猫坐在草地上"'
        : '<b>阶段 2 · 指令微调</b>：多模态对话数据<br>例：🖼 + "图里的猫在干什么？" → "它坐在房子前晒太阳"'
    );
  }

  go(step) {
    const tl = this.tl;
    this.fade(this.poemG, step === 0 ? 1 : 0, 0, 0.5);
    this.fade(this.curveG, step === 1 ? 1 : 0, step === 1 ? 0.3 : 0, 0.5);
    this.fade(this.landG, step === 2 ? 1 : 0, step === 2 ? 0.3 : 0, 0.6);
    this.fade(this.stageG, step === 3 ? 1 : 0, step === 3 ? 0.3 : 0, 0.6);
    this.fade(this.mmG, step === 4 ? 1 : 0, step === 4 ? 0.3 : 0, 0.6);
    this.gd.running = false;
    if (step === 0) {
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
      const saved = this.tl;
      this.tl = loop;
      loop.call(() => this.detail.setHTML(this.detailHTML(false)), null, 0);
      this.setPoemProbs(P_EARLY, loop, 0, '训练前（参数随机）');
      this.setPoemProbs(P_LATE, loop, 3.2, '训练后');
      loop.call(() => this.detail.setHTML(this.detailHTML(true)), null, 3.6);
      loop.to({}, { duration: 3 }, 4.2);
      this.tl = saved;
      tl.add(loop, 0.5);
    }
    if (step === 1) {
      tl.to(this.curve.p, { v: 0.9, duration: 1.4, ease: 'power2.inOut', onUpdate: () => this.placeCurve(this.curve.p.v) }, 0.6);
      tl.to(this.curve.p, { v: 0.05, duration: 2.0, ease: 'power2.inOut', onUpdate: () => this.placeCurve(this.curve.p.v) }, 2.4);
      tl.to(this.curve.p, { v: 0.5, duration: 1.4, ease: 'power2.inOut', onUpdate: () => this.placeCurve(this.curve.p.v) }, 4.8);
    }
    if (step === 2) tl.call(() => this.resetGD(-3.4, -3.2), null, 1.0);
    if (step === 3) {
      tl.set(this.brain.position, { x: -5.2, y: 2.6, z: 0 }, 0);
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
      this.stages.forEach((s, i) => {
        loop.to(this.brain.position, { x: s.x, y: s.y + 1.0, z: 0, duration: 1.2, ease: 'power2.inOut' }, i * 2.2);
        loop.to(s.p.material, { emissiveIntensity: 1.2, duration: 0.4, yoyo: true, repeat: 1 }, i * 2.2 + 1.0);
        loop.to(this.brain.scale, { x: 1 + i * 0.25, y: 1 + i * 0.25, z: 1 + i * 0.25, duration: 0.6 }, i * 2.2 + 1.0);
      });
      loop.to(this.brain.scale, { x: 1, y: 1, z: 1, duration: 0.4 }, 7.0);
      tl.add(loop, 0.6);
    }
    if (step === 4) tl.call(() => this.setMMStage(this.mmStage), null, 0);
  }
  detailHTML(late) {
    const rows = late ? DETAIL : [['光', 0.02], ['猫', 0.01], ['飞', 0.01], ['的', 0.01], ['乐', 0.01]];
    return `<b>看到"床前明月"，预测下一个字：</b><br>${rows.map(([t, p]) => `${t === '光' ? '<b style="color:#86efac">' + t + '（正确）</b>' : t} ${(p * 100).toFixed(p < 0.01 ? 1 : 0)}%`).join(' · ')}<br>损失 = −log(${rows[0][1]}) = <b>${(-Math.log(rows[0][1])).toFixed(2)}</b>`;
  }

  widget(step, el) {
    if (step === 1) {
      el.innerHTML = `<div class="w-title">拖动：模型给正确答案的概率 p</div>
        <div class="w-row"><label>p</label><input type="range" id="p" min="0.01" max="1" step="0.01" value="${this.curve.p.v.toFixed(2)}"><output id="pv">${this.curve.p.v.toFixed(2)}</output></div>`;
      const r = el.querySelector('#p');
      r.addEventListener('input', () => {
        this.newTimeline();
        this.tl.to(this.curveG, { opacity: 1, duration: 0.1 }, 0);
        this.curve.p.v = Number(r.value);
        el.querySelector('#pv').textContent = Number(r.value).toFixed(2);
        this.placeCurve(this.curve.p.v);
      });
      return null;
    }
    if (step === 2) {
      el.innerHTML = `<div class="w-title">梯度下降实验</div>
        <div class="w-row"><label>学习率</label><input type="range" id="lr" min="0.05" max="1.6" step="0.05" value="${this.gd.lr}"><output id="lrv">${this.gd.lr.toFixed(2)}</output></div>
        <div class="w-btns">
          <button class="w-btn primary" data-s="-3.4,-3.2">从左前方出发</button>
          <button class="w-btn" data-s="-3.6,3.4">从左后方出发</button>
          <button class="w-btn" data-s="3.8,3.6">从右后方出发</button>
          <button class="w-btn" data-s="rand">随机出发</button>
        </div>
        <div class="w-small">试试把学习率调到 1.2 以上，看看小球如何"刹不住车"；不同起点可能落入不同的山谷。</div>`;
      const lr = el.querySelector('#lr');
      lr.addEventListener('input', () => {
        this.gd.lr = Number(lr.value);
        el.querySelector('#lrv').textContent = Number(lr.value).toFixed(2);
      });
      el.querySelectorAll('[data-s]').forEach((b) =>
        b.addEventListener('click', () => {
          if (b.dataset.s === 'rand') this.resetGD(Math.random() * 8 - 4, Math.random() * 8 - 4);
          else {
            const [x, z] = b.dataset.s.split(',').map(Number);
            this.resetGD(x, z);
          }
        })
      );
      return null;
    }
    if (step === 4) {
      el.innerHTML = `<div class="w-title">训练阶段</div>
        <div class="w-btns"><button class="w-btn ${this.mmStage === 1 ? 'active' : ''}" data-st="1">阶段 1：对齐（只训投影器）</button><button class="w-btn ${this.mmStage === 2 ? 'active' : ''}" data-st="2">阶段 2：指令微调</button></div>`;
      el.querySelectorAll('[data-st]').forEach((b) =>
        b.addEventListener('click', () => {
          this.setMMStage(Number(b.dataset.st));
          el.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('active', x === b));
        })
      );
      return null;
    }
    return null;
  }

  update(dt, t) {
    if (this.step === 2 && this.gd.running) {
      this.gd.acc += dt;
      while (this.gd.acc > 0.06 && this.gd.running) {
        this.gd.acc -= 0.06;
        this.stepGD();
      }
    }
    if (this.step === 2) this.landG.rotation.y = Math.sin(t * 0.12) * 0.15;
    if (this.step === 4) this.mmLLM.rotation.y = Math.sin(t * 0.4) * 0.08;
  }
}
