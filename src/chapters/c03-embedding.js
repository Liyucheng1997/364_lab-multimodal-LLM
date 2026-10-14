// 第 3 章 嵌入：Token → 向量
import * as THREE from 'three';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, unitBoxBase, diverging, rng, arrow, flowPath, sphereGeo, slab } from '../core/kit.js';

const ROWS = 30;
const COLS = 24;
const CELL = 0.21;
const WALL = V3(0.6, 3.3, -1.2);
const HROW = 17; // "猫"所在的展示行
const ROW_LABELS = {
  0: '#0 "!"',
  1: '#1 "\\""',
  2: '#2 "#"',
  16: '#48090 " товар"',
  17: '#48091 "猫"',
  18: '#48092 " mia"',
  29: '#199997 " cocos"',
};

// 语义空间（示意坐标：真实向量有几千维，这里是"投影"到 3D 后的直观示意）
const WORDS = [
  ['猫', -4.4, 4.5, -0.6, 'animal'],
  ['狗', -3.6, 4.8, -1.0, 'animal'],
  ['老虎', -4.9, 3.7, -1.6, 'animal'],
  ['狮子', -4.1, 3.4, -2.1, 'animal'],
  ['兔子', -3.3, 4.0, -0.1, 'animal'],
  ['香蕉', -3.9, 1.5, 2.4, 'fruit'],
  ['西瓜', -3.0, 1.1, 2.0, 'fruit'],
  ['葡萄', -3.7, 2.1, 1.5, 'fruit'],
  ['橙子', -2.8, 1.8, 2.7, 'fruit'],
  ['手机', 3.3, 1.3, 2.3, 'tech'],
  ['电脑', 4.2, 1.8, 1.7, 'tech'],
  ['芯片', 2.9, 2.0, 1.4, 'tech'],
  ['软件', 4.0, 0.9, 2.7, 'tech'],
  ['男人', -0.6, 2.4, -2.6, 'people'],
  ['女人', 1.2, 2.4, -2.6, 'people'],
  ['国王', -0.6, 4.6, -2.6, 'people'],
  ['王后', 1.2, 4.6, -2.6, 'people'],
  ['中国', 3.6, 3.0, -0.6, 'place'],
  ['北京', 4.7, 4.3, -0.3, 'place'],
  ['日本', 4.7, 2.5, -1.7, 'place'],
  ['东京', 5.8, 3.8, -1.4, 'place'],
  ['法国', 2.7, 2.6, -2.4, 'place'],
  ['巴黎', 3.8, 3.9, -2.1, 'place'],
];
const APPLE = V3(-0.1, 1.6, 2.2);
const CLUSTERS = {
  animal: { color: C.green, name: '动物', c: V3(-4.1, 4.1, -1.0), r: 1.45 },
  fruit: { color: C.orange, name: '水果', c: V3(-3.35, 1.6, 2.15), r: 1.15 },
  tech: { color: C.k, name: '科技产品', c: V3(3.6, 1.5, 2.0), r: 1.2 },
  people: { color: C.pink, name: '人物', c: V3(0.3, 3.5, -2.6), r: 1.75 },
  place: { color: C.gold, name: '国家与首都', c: V3(4.2, 3.4, -1.3), r: 1.85 },
};

export default class Embedding extends Chapter {
  static meta = {
    id: 'embedding',
    short: '嵌入',
    title: '嵌入：Token 如何变成"有意义"的向量',
    subtitle: '编号本身没有意义。模型给每个 token 配一个高维向量，意思相近的词，向量也相近。',
  };

  static steps = [
    {
      title: 'Token ID 只是一个编号',
      cam: [0, 3.3, 13.8, 0, 2.1, 2.0],
      html: `
        <p>上一章得到的是一串整数，例如"猫"= <code>48091</code>、"狗"= <code>35182</code>。</p>
        <p>但编号只是<b>词表里的位置</b>，没有任何含义：</p>
        <ul>
          <li>"猫"旁边的 48090 是俄语" товар"（商品），48092 是" mia"——毫不相干；</li>
          <li>意思很接近的"猫"和"狗"，编号却相差一万多。</li>
        </ul>
        <div class="key">模型需要一种表示方式：让<b>意思相近</b>的 token，在数学上也<b>彼此靠近</b>。答案就是<b>向量</b>。</div>`,
    },
    {
      title: '查表：嵌入矩阵（Embedding Matrix）',
      cam: [-2.2, 3.6, 12, -0.6, 3.3, -0.6],
      html: `
        <p>模型内部有一张巨大的表格——<b>嵌入矩阵</b>：</p>
        <ul>
          <li><b>行数 = 词表大小</b>（约 10 万~20 万行），每个 token 一行；</li>
          <li><b>列数 = 向量维度</b>（几千列，例如 4096）。</li>
        </ul>
        <p>拿到 token 编号 48091，就去<b>取第 48091 行</b>——这一行几千个数字，就是"猫"的向量。</p>
        <div class="analogy">像一本巨大的字典，编号是页码。翻到对应页，那一页写着这个词的"数字档案"。</div>
        <div class="note">这张表里的数字一开始是随机的，在训练中被不断调整，最终学到了词的含义（第 8 章）。</div>`,
    },
    {
      title: '向量：一长串数字',
      cam: [-0.2, 3.0, 12.2, 0.2, 2.0, 1.8],
      html: `
        <p>取出来的这一行就是一个<b>向量</b>：一串实数，有正有负（图中青色向上为正，粉色向下为负）。</p>
        <div class="formula">"猫" → [ 0.12, −0.53, 0.88, 0.05, −0.31, … ]  （共 d 个数）</div>
        <p>这里只画了 24 个数；真实模型的维度 d 要大得多：</p>
        <table class="mini">
          <tr><th>模型</th><th>向量维度 d</th></tr>
          <tr><td>GPT-2 Small</td><td class="num">768</td></tr>
          <tr><td>Llama 3 8B</td><td class="num">4,096</td></tr>
          <tr><td>Llama 3 70B</td><td class="num">8,192</td></tr>
          <tr><td>GPT-3 175B</td><td class="num">12,288</td></tr>
        </table>
        <div class="note">单独看某一维通常说不出含义；含义藏在整个向量的"方向"里。</div>`,
    },
    {
      title: '语义空间：意思相近，距离就近',
      cam: [0.4, 6.5, 14.5, 0.2, 2.9, 0],
      html: `
        <p>把每个词的向量当成空间中的一个点，就得到了<b>语义空间</b>。训练之后，神奇的结构出现了：</p>
        <ul>
          <li><span class="chip green">动物</span> 聚在一起，<span class="chip" style="background:#fb923c">水果</span> 聚在一起，<span class="chip k">科技产品</span> 聚在一起；</li>
          <li>没有人告诉模型"猫和狗都是动物"——这是它在海量文本里看到它们出现在相似的上下文中，自己学出来的。</li>
        </ul>
        <div class="note">真实向量有几千维，人眼看不了。图里是"投影"到 3D 的示意，用来建立直觉。拖动鼠标旋转看看。</div>`,
    },
    {
      title: '向量运算：国王 − 男人 + 女人 ≈ 王后',
      cam: [2.0, 4.6, 10.5, 1.8, 3.4, -1.5],
      html: `
        <p>语义空间里的<b>方向</b>也有含义：</p>
        <ul>
          <li>从"男人"指向"国王"的箭头，和从"女人"指向"王后"的箭头<b>几乎平行</b>——这个方向代表"王室身份"；</li>
          <li>"中国→北京""日本→东京""法国→巴黎"也是一组平行箭头——代表"首都"关系。</li>
        </ul>
        <div class="formula">向量(国王) − 向量(男人) + 向量(女人) ≈ 向量(王后)</div>
        <div class="note">这个经典现象最早在 word2vec（2013）中被观察到。大模型内部的表示更复杂，但研究发现很多概念同样以"方向"的形式线性地编码在向量中。</div>`,
    },
    {
      title: '同一个词，不同语境',
      cam: [-0.2, 4.2, 12.5, -0.2, 2.2, 1.4],
      html: `
        <p>问题来了："<b>苹果</b>"到底是水果，还是科技公司？</p>
        <p>嵌入矩阵只能给"苹果"<b>一个固定向量</b>，它只好待在水果和科技产品<b>中间</b>。</p>
        <p>真正的区分发生在后面的<b>注意力层</b>：模型会结合上下文，把"苹果"的向量往正确的方向"推"：</p>
        <ul>
          <li>"我<b>吃</b>了一个苹果" → 推向水果；</li>
          <li>"苹果<b>发布</b>了新手机" → 推向科技。</li>
        </ul>
        <div class="key">嵌入层给出"字面意思"，Transformer 各层再根据上下文不断修正，得到<b>语境化</b>的表示。下两章就来看这是怎么做到的。</div>`,
    },
  ];

  build() {
    this.buildRuler();
    this.buildWall();
    this.buildSpace();
  }

  // ───────────── ID 数轴 ─────────────
  buildRuler() {
    const g = (this.ruler = new THREE.Group());
    g.position.set(0, 0.5, 2.0);
    const W = 14;
    const line = new THREE.Mesh(new THREE.BoxGeometry(W, 0.04, 0.04), glowMat(C.gray, { glow: 0.6 }));
    g.add(line);
    for (let i = 0; i <= 6; i++) {
      const x = -W / 2 + (i / 6) * W;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), glowMat(C.gray, { glow: 0.6 }));
      tick.position.x = x;
      g.add(tick);
      const n = textPlane(`${(i * 10000).toLocaleString()}`, 0.17, { color: '#64748b', weight: 500 });
      n.position.set(x, -0.32, 0);
      g.add(n);
    }
    const xOf = (id) => -W / 2 + (id / 60000) * W;
    const items = [
      ['猫', 48091, C.text, 1.35],
      ['狗', 35182, C.text, 1.35],
      ['" товар"', 48090, C.slate, 2.45],
      ['" mia"', 48092, C.slate, 3.45],
      ['苹果', 32176, C.indigo, 2.45],
      ['香蕉', 17745, C.indigo, 1.35],
      ['手机', 10485, C.indigo, 2.45],
    ];
    this.rulerItems = items.map(([t, id, color, y]) => {
      const b = new TokenBlock(t, { color, minW: 0.6, h: 0.56, textH: 0.3 });
      b.position.set(xOf(id), y, 0);
      b.userData.homeY = y;
      const idl = textPlane(`#${id}`, 0.17, { color: '#cbd5e1', weight: 600 });
      idl.position.set(0, -0.42, 0.14);
      b.add(idl);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.02, y - 0.62, 0.02), glowMat(color, { glow: 0.5, opacity: 0.6 }));
      stem.position.set(xOf(id), (y - 0.62) / 2 + 0.02, 0);
      g.add(b, stem);
      return b;
    });
    const t = label('Token ID 数轴（截取 0 ~ 60,000 这一段；整个词表约 20 万）', 'tag', { anchor: 'top' });
    t.position.set(0, -0.6, 0);
    g.add(t);
    const note = label('编号相邻 ≠ 意思相近', 'tag red', { anchor: 'bottom' });
    note.position.set(xOf(48091), 4.15, 0);
    g.add(note);
    this.add(g);
    hide(g);
  }

  // ───────────── 嵌入矩阵墙 ─────────────
  buildWall() {
    const g = (this.wall = new THREE.Group());
    g.position.copy(WALL);
    const R = rng(7);
    this.vals = [];
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.86, CELL * 0.86, 0.08), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.0, transparent: true }), ROWS * COLS);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = Math.max(-1, Math.min(1, (R() + R() + R() - 1.5) * 1.15));
        if (r === HROW) this.vals.push(v);
        m4.makeTranslation(-((COLS - 1) * CELL) / 2 + c * CELL, ((ROWS - 1) * CELL) / 2 - r * CELL, 0);
        mesh.setMatrixAt(r * COLS + c, m4);
        diverging(v, col);
        mesh.setColorAt(r * COLS + c, col);
      }
    }
    mesh.material.emissiveMap = null;
    // 让实例颜色也参与自发光：用 onBeforeCompile 把 vColor 加到 emissive
    mesh.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.55;');
    };
    g.add(mesh);
    this.wallMesh = mesh;
    const rowY = (r) => ((ROWS - 1) * CELL) / 2 - r * CELL;
    this.rowY = rowY;
    for (const [r, txt] of Object.entries(ROW_LABELS)) {
      const l = textPlane(txt, 0.15, { color: Number(r) === HROW ? '#7dd3fc' : '#94a3b8', weight: Number(r) === HROW ? 700 : 500 });
      l.position.set(-(COLS * CELL) / 2 - 0.15 - l.userData.width / 2, rowY(Number(r)), 0);
      g.add(l);
    }
    for (const r of [5, 23]) {
      const dots = textPlane('⋮', 0.3, { color: '#64748b' });
      dots.position.set(-(COLS * CELL) / 2 - 0.6, rowY(r), 0);
      g.add(dots);
    }
    const dimL = label('向量维度 d（真实模型约 4,096 列）→', 'tag', { anchor: 'bottom' });
    dimL.position.set(0, rowY(0) + 0.3, 0);
    const vocL = label('词表大小（约 20 万行）', 'tag', { anchor: 'left' });
    vocL.position.set((COLS * CELL) / 2 + 0.25, rowY(14), 0);
    g.add(dimL, vocL);
    // 扫描条
    this.scanner = slab(COLS * CELL + 0.25, CELL * 1.05, 0.14, C.q, { glow: 1.2, opacity: 0.35 });
    this.scanner.position.set(0, rowY(0), 0.06);
    g.add(this.scanner);
    // 被取出的一行（独立于矩阵墙，便于单独动画和调暗墙体）
    this.rowGroup = new THREE.Group();
    this.rowGroup.position.copy(WALL);
    this.rowCells = this.vals.map((v, c) => {
      const m = new THREE.Mesh(unitBoxBase(), glowMat(diverging(v).getHex(), { glow: 0.9, dark: 0.6 }));
      m.userData.home = V3(-((COLS - 1) * CELL) / 2 + c * CELL, rowY(HROW) - (CELL * 0.86) / 2, 0.06);
      m.position.copy(m.userData.home);
      m.scale.set(CELL * 0.86, CELL * 0.86, 0.1);
      this.rowGroup.add(m);
      return m;
    });
    // 输入 token 卡片
    this.catCard = new TokenBlock('猫', { color: C.text, minW: 0.9, h: 0.8, textH: 0.46 });
    this.catCard.position.set(-5.3, 3.6, 0.6);
    const idl = label('Token ID = 48091', 'tag text', { anchor: 'top' });
    idl.position.set(0, -0.55, 0);
    this.catCard.add(idl);
    this.lookupFlow = flowPath([V3(-4.7, 3.6, 0.6), V3(-3.9, 3.3, 0.2), V3(-3.4, WALL.y + rowY(HROW), WALL.z + 0.2), V3(-2.7, WALL.y + rowY(HROW), WALL.z + 0.1)], { color: C.q, radius: 0.04 });
    this.vecLabel = label('', 'tag text', { anchor: 'bottom' });
    this.dimLabel = label('← 共 d 个数（这里只画 24 个）→', 'dim', { anchor: 'top' });
    this.add(g, this.rowGroup, this.catCard, this.lookupFlow, this.vecLabel, this.dimLabel);
    hide(g, this.rowGroup, this.catCard, this.lookupFlow, this.vecLabel, this.dimLabel);
  }

  // ───────────── 语义空间 ─────────────
  buildSpace() {
    const g = (this.space = new THREE.Group());
    // 坐标轴
    const axMat = glowMat(C.slate, { glow: 0.5, opacity: 0.6 });
    for (const [sx, sy, sz, px, py, pz] of [
      [14, 0.02, 0.02, 0, 0.2, 0],
      [0.02, 6, 0.02, -7, 3.2, 0],
      [0.02, 0.02, 7, -7, 0.2, 0],
    ]) {
      const ax = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), axMat);
      ax.position.set(px, py, pz);
      g.add(ax);
    }
    // 聚类光晕
    this.halos = {};
    for (const [k, cl] of Object.entries(CLUSTERS)) {
      const h = new THREE.Mesh(sphereGeo(1, 32), new THREE.MeshBasicMaterial({ color: cl.color, transparent: true, opacity: 0.07, depthWrite: false }));
      h.position.copy(cl.c);
      h.scale.setScalar(cl.r);
      g.add(h);
      const nl = label(cl.name, 'tag', { anchor: 'bottom' });
      nl.element.style.color = '#' + new THREE.Color(cl.color).getHexString();
      nl.position.copy(cl.c).add(V3(0, cl.r + 0.1, 0));
      h.add(nl);
      nl.position.set(0, 1.05, 0);
      this.halos[k] = h;
    }
    // 词点
    this.points = {};
    for (const [w, x, y, z, k] of WORDS) {
      const p = new THREE.Group();
      p.position.set(x, y, z);
      const s = new THREE.Mesh(sphereGeo(0.13, 20), glowMat(CLUSTERS[k].color, { glow: 1.1, dark: 0.6 }));
      const l = label(w, 'lbl', { anchor: 'left' });
      l.position.set(0.18, 0, 0);
      p.add(s, l);
      g.add(p);
      this.points[w] = p;
    }
    // 苹果：两种语境
    this.apple = this.mkApple(APPLE, C.red);
    this.appleFruit = this.mkApple(APPLE, C.orange, '苹果（"我吃了一个苹果"）');
    this.appleTech = this.mkApple(APPLE, C.k, '苹果（"苹果发布了新手机"）');
    g.add(this.apple, this.appleFruit, this.appleTech);
    // 类比箭头
    const P = (w) => this.points[w].position;
    this.arrowsRoyal = [arrow(P('男人'), P('国王'), { color: C.pink }), arrow(P('女人'), P('王后'), { color: C.pink })];
    this.arrowsGender = [arrow(P('男人'), P('女人'), { color: C.q, radius: 0.025 }), arrow(P('国王'), P('王后'), { color: C.q, radius: 0.025 })];
    this.arrowsCap = [arrow(P('中国'), P('北京'), { color: C.gold }), arrow(P('日本'), P('东京'), { color: C.gold }), arrow(P('法国'), P('巴黎'), { color: C.gold })];
    this.calc = label('国王 − 男人 + 女人 = ？', 'tag pink', { anchor: 'bottom' });
    this.calc.position.copy(P('王后')).add(V3(-0.9, 0.9, 0));
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 12, 48), glowMat(C.q, { glow: 2.0 }));
    this.ring.position.copy(P('王后'));
    g.add(...this.arrowsRoyal, ...this.arrowsGender, ...this.arrowsCap, this.calc, this.ring);
    this.add(g);
    hide(g, ...this.arrowsRoyal, ...this.arrowsGender, ...this.arrowsCap, this.calc, this.ring, this.appleFruit, this.appleTech);
    // 推动方向箭头
    this.pushFruit = arrow(APPLE, V3(-2.6, 1.75, 2.25), { color: C.orange, radius: 0.03 });
    this.pushTech = arrow(APPLE, V3(2.4, 1.5, 2.2), { color: C.k, radius: 0.03 });
    g.add(this.pushFruit, this.pushTech);
    hide(this.pushFruit, this.pushTech);
  }
  mkApple(pos, color, text = '苹果（固定的嵌入向量）') {
    const p = new THREE.Group();
    p.position.copy(pos);
    const s = new THREE.Mesh(sphereGeo(0.17, 20), glowMat(color, { glow: 1.4, dark: 0.6 }));
    const l = label(text, 'tag red', { anchor: 'bottom' });
    l.position.set(0, 0.25, 0);
    p.add(s, l);
    return p;
  }

  go(step) {
    const tl = this.tl;
    this.fade(this.ruler, step === 0 ? 1 : 0, 0, 0.5);
    const wallOn = step === 1 || step === 2;
    this.fade(this.wall, step === 1 ? 1 : step === 2 ? 0.18 : 0, 0, 0.6);
    this.fade(this.rowGroup, wallOn ? 1 : 0, 0, 0.5);
    this.fade(this.catCard, wallOn ? 1 : 0, 0, 0.5);
    this.fade(this.lookupFlow, step === 1 ? 1 : 0, 0, 0.4);
    this.fade(this.space, step >= 3 ? 1 : 0, step >= 3 ? 0.3 : 0, 0.7);
    this.fade(this.vecLabel, 0, 0, 0.3);
    this.fade(this.dimLabel, 0, 0, 0.3);
    // 箭头 / 苹果默认隐藏
    for (const a of [...this.arrowsRoyal, ...this.arrowsGender, ...this.arrowsCap, this.calc, this.ring, this.appleFruit, this.appleTech, this.pushFruit, this.pushTech]) this.fade(a, 0, 0, 0.3);
    this.fade(this.apple, step >= 3 ? 1 : 0, 0.3, 0.5);

    if (step === 0) {
      this.rulerItems.forEach((b, i) => tl.fromTo(b.position, { y: b.userData.homeY + 1.2 }, { y: b.userData.homeY, duration: 0.7, ease: 'bounce.out' }, 0.3 + i * 0.12));
    }
    if (step === 1) {
      // 取出的一行回到墙上；扫描条从顶部扫到"猫"所在行
      this.rowCells.forEach((m) => {
        tl.to(m.position, { x: m.userData.home.x, y: m.userData.home.y, z: m.userData.home.z, duration: 0.6 }, 0);
        tl.to(m.scale, { x: CELL * 0.86, y: CELL * 0.86, z: 0.1, duration: 0.6 }, 0);
      });
      tl.set(this.scanner.position, { y: this.rowY(0) }, 0);
      tl.to(this.scanner, { opacity: 1, duration: 0.3 }, 0.6);
      tl.to(this.scanner.position, { y: this.rowY(HROW), duration: 1.6, ease: 'power2.inOut' }, 0.9);
      this.rowCells.forEach((m, i) => tl.to(m.material, { emissiveIntensity: 2.2, duration: 0.3, yoyo: true, repeat: 3 }, 2.5 + i * 0.01));
    }
    if (step === 2) {
      tl.to(this.scanner, { opacity: 0, duration: 0.3 }, 0);
      const W = 0.32;
      this.rowCells.forEach((m, i) => {
        const v = this.vals[i];
        const x = -WALL.x - ((COLS - 1) * W) / 2 + i * W + 0.2;
        const local = V3(x, -WALL.y + 1.8, -WALL.z + 2.4);
        tl.to(m.position, { x: m.userData.home.x, y: m.userData.home.y, z: 0.9, duration: 0.5, ease: 'power2.out' }, 0.2 + i * 0.015);
        tl.to(m.position, { x: local.x, y: local.y, z: local.z, duration: 1.0, ease: 'power2.inOut' }, 0.8 + i * 0.02);
        tl.to(m.scale, { x: 0.24, y: v * 1.6 || 0.02, z: 0.24, duration: 0.8, ease: 'back.out(1.6)' }, 1.9 + i * 0.02);
      });
      tl.call(() => {
        this.vecLabel.position.set(0.2, 3.65, 2.4);
        this.vecLabel.setHTML(`"猫"的向量：[${this.vals.slice(0, 5).map((v) => v.toFixed(2)).join(', ')}, …]`);
        this.dimLabel.position.set(0.2, 0.05, 2.4);
      }, null, 0);
      tl.to(this.vecLabel, { opacity: 1, duration: 0.5 }, 2.6);
      tl.to(this.dimLabel, { opacity: 1, duration: 0.5 }, 2.9);
    }
    if (step === 3) {
      Object.values(this.points).forEach((p, i) => tl.fromTo(p.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2)' }, 0.5 + i * 0.05));
      Object.values(this.halos).forEach((h, i) => tl.fromTo(h, { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.4 + i * 0.15));
    } else if (step > 3) {
      // 状态兜底：从任意步骤跳来时，词点和光晕都应完整可见
      Object.values(this.points).forEach((p) => tl.to(p.scale, { x: 1, y: 1, z: 1, duration: 0.4 }, 0));
      Object.values(this.halos).forEach((h) => tl.to(h, { opacity: 1, duration: 0.4 }, 0));
    }
    if (step === 4) {
      this.arrowsRoyal.forEach((a, i) => tl.to(a, { opacity: 1, duration: 0.5 }, 0.6 + i * 0.5));
      this.arrowsGender.forEach((a, i) => tl.to(a, { opacity: 0.8, duration: 0.5 }, 1.8 + i * 0.3));
      tl.to(this.calc, { opacity: 1, duration: 0.5 }, 2.6);
      tl.to(this.ring, { opacity: 1, duration: 0.4 }, 3.2);
      tl.fromTo(this.ring.scale, { x: 2.5, y: 2.5, z: 2.5 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'back.out(2)' }, 3.2);
      tl.call(() => this.calc.setHTML('国王 − 男人 + 女人 ≈ <b>王后</b> ✓'), null, 3.4);
      this.arrowsCap.forEach((a, i) => tl.to(a, { opacity: 1, duration: 0.5 }, 4.2 + i * 0.35));
      tl.call(() => this.calc.setHTML('国王 − 男人 + 女人 = ？'), null, 0);
    }
    if (step === 5) {
      tl.set(this.appleFruit.position, { x: APPLE.x, y: APPLE.y, z: APPLE.z }, 0);
      tl.set(this.appleTech.position, { x: APPLE.x, y: APPLE.y, z: APPLE.z }, 0);
      tl.to(this.apple.children[0].material, { emissiveIntensity: 2.4, duration: 0.3, yoyo: true, repeat: 3 }, 0.6);
      tl.to(this.pushFruit, { opacity: 1, duration: 0.4 }, 1.8);
      tl.to(this.pushTech, { opacity: 1, duration: 0.4 }, 1.8);
      tl.to(this.appleFruit, { opacity: 1, duration: 0.3 }, 2.4);
      tl.to(this.appleTech, { opacity: 1, duration: 0.3 }, 2.4);
      tl.to(this.appleFruit.position, { x: -2.9, y: 1.85, z: 2.3, duration: 1.4, ease: 'power2.inOut' }, 2.5);
      tl.to(this.appleTech.position, { x: 2.7, y: 1.5, z: 2.2, duration: 1.4, ease: 'power2.inOut' }, 2.5);
      tl.to(this.apple, { opacity: 0.35, duration: 0.6 }, 2.6);
      tl.to(this.pushFruit, { opacity: 0, duration: 0.4 }, 3.9);
      tl.to(this.pushTech, { opacity: 0, duration: 0.4 }, 3.9);
    }
  }

  update(dt, t) {
    if (this.ring.visible) this.ring.rotation.y = t * 1.5;
    if (this.step >= 3) this.space.rotation.y = Math.sin(t * 0.15) * 0.06;
  }
}
