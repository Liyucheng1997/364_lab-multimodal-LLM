// 第 4 章 位置编码：让模型知道"谁在前、谁在后"
import * as THREE from 'three';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, viridis, layoutRow, flowPath } from '../core/kit.js';

const THETAS = [0.9, 0.45, 0.2, 0.08]; // 每个"表盘"每前进一个位置转过的角度（弧度）：快 → 慢
const ROPE_TOKENS = ['猫', '追', '狗', '跑', '进', '院子'];
const DIAL_R = 0.34;
const Q_IDX = 4; // "进"
const K_IDX = 1; // "追"

function makeDial(r, color = C.model, { hands = 1 } = {}) {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color: 0x0b1222, transparent: true, opacity: 0.85 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.06, 8, 64), glowMat(color, { glow: 0.9 }));
  g.add(disc, ring);
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(r * 0.04, r * 0.14, 0.01), new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true }));
    const a = (i / 12) * Math.PI * 2;
    t.position.set(-Math.sin(a) * r * 0.86, Math.cos(a) * r * 0.86, 0.005);
    t.rotation.z = a;
    g.add(t);
  }
  g.hands = [];
  const colors = [C.q, C.k, C.white];
  for (let h = 0; h < hands; h++) {
    const pivot = new THREE.Group();
    const geo = new THREE.BoxGeometry(r * 0.09, r * 0.82, r * 0.05);
    geo.translate(0, (r * 0.82) / 2, 0);
    const hand = new THREE.Mesh(geo, glowMat(hands > 1 ? colors[h] : color, { glow: 0.95 }));
    hand.position.z = 0.02 + h * 0.01;
    pivot.add(hand);
    g.add(pivot);
    g.hands.push(pivot);
  }
  const hub = new THREE.Mesh(new THREE.CircleGeometry(Math.min(r * 0.1, 0.07), 16), new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true }));
  hub.position.z = 0.05;
  g.add(hub);
  return g;
}

export default class Position extends Chapter {
  static meta = {
    id: 'position',
    short: '位置',
    title: '位置编码：让模型知道"顺序"',
    subtitle: '注意力机制本身对顺序"视而不见"。位置编码给每个 token 打上位置的烙印。',
  };

  static steps = [
    {
      title: '顺序决定意思',
      cam: [0, 3.0, 11, 0, 2.6, 0],
      html: `
        <p>"猫追狗"和"狗追猫"，用的是<b>完全相同的三个 token</b>，意思却相反。</p>
        <p>中文尤其依赖语序："我打你"≠"你打我"，"不很好"≠"很不好"。</p>
        <div class="key">模型必须知道每个 token <b>在第几个位置</b>，否则它无法区分这些句子。</div>`,
    },
    {
      title: '注意力天生"看不见"顺序',
      cam: [0, 4.2, 11.5, 0, 1.6, 0],
      html: `
        <p>下一章要讲的<b>注意力机制</b>，计算方式是"每个 token 和其它所有 token 两两打分"。这个计算对顺序是<b>不敏感</b>的：把输入的 token 打乱，每个 token 得到的结果完全一样（只是跟着换了位置）。</p>
        <p>换句话说，如果不加位置信息，在模型眼里两句话就是<b>两袋一模一样的积木</b>。</p>
        <div class="analogy">就像把一句话的词抄在卡片上丢进袋子里——袋子里有什么一清二楚，但谁先谁后完全丢失了。</div>`,
    },
    {
      title: '方案一：正弦位置编码',
      cam: [0.5, 5.4, 11.8, 0.4, 1.5, 0.5],
      html: `
        <p>2017 年最初的 Transformer 论文，给每个位置生成一个<b>独一无二的"位置向量"</b>，直接<b>加</b>到词向量上：</p>
        <div class="formula">PE(pos, 2i)   = sin(pos / 10000^(2i/d))
PE(pos, 2i+1) = cos(pos / 10000^(2i/d))</div>
        <p>图中的曲面：横轴是<b>位置</b>，纵深是<b>维度</b>，高度是数值。靠前的维度变化快（像秒针），靠后的维度变化慢（像时针）。亮线是某一个位置的完整编码向量——每个位置的"指纹"都不同。</p>
        <div class="analogy">像用秒针、分针、时针一起报时：组合起来，每个时刻都独一无二。</div>`,
    },
    {
      title: '方案二：RoPE 旋转位置编码',
      cam: [-0.9, 3.4, 11.2, -0.9, 2.6, 0],
      html: `
        <p>如今主流大模型（Llama、Qwen、DeepSeek、Mistral 等）大多使用 <b>RoPE（Rotary Position Embedding，旋转位置编码）</b>。</p>
        <p>它不再"加"一个位置向量，而是把 Q、K 向量（下一章会讲）的每两个维度看成一个<b>平面上的小指针</b>，然后按位置<b>旋转</b>：</p>
        <ul>
          <li>位置每往后一格，指针就转一个固定角度 θ；</li>
          <li>不同的维度对，转速不同——上面的表盘转得快，下面的转得慢。</li>
        </ul>
        <p>看每个 token 头顶的 4 个表盘：越靠后的 token，指针转得越多。</p>`,
    },
    {
      title: '妙处：只关心"相隔多远"',
      cam: [0.3, 3.6, 13.2, 0.3, 3.0, 0],
      html: `
        <p>RoPE 最漂亮的性质：两个 token 的注意力打分，只取决于它们的<b>相对距离</b>。</p>
        <p>右边的大表盘把"进"（<span class="chip q">黄色 Q</span>）和"追"（<span class="chip k">蓝色 K</span>）的指针画在一起。现在整句话前面又插入了几个词，两个 token 的位置都在变：</p>
        <ul>
          <li>两根指针都在转（绝对位置变了）；</li>
          <li>但它们之间的<b>夹角始终不变</b>——因为夹角 = (m − n) × θ，只和间隔 m − n 有关。</li>
        </ul>
        <div class="key">这让模型学到的规律（比如"动词通常关注前面隔 1~2 个词的主语"）在句子的任何位置都能复用。</div>`,
    },
    {
      title: '长上下文：没见过的角度怎么办？',
      cam: [0, 3.2, 9.5, 0, 2.9, 0],
      html: `
        <p>如果模型训练时最长只见过 8 个位置，推理时却来了 16 个，会发生什么？</p>
        <p>慢速表盘上，第 9 个位置以后的指针会转到<b>训练时从未出现的角度</b>（红色），模型就"懵"了——这就是长度外推问题。</p>
        <p>解决办法之一是<b>位置插值</b>：把所有位置"压缩"回训练过的范围（转速放慢），指针重新落回熟悉的区域（绿色），再稍加微调即可。</p>
        <div class="note">实际中常用 NTK-aware 缩放、YaRN 等改进方法，正是它们让许多模型的上下文从 4K 扩展到 128K 甚至 1M token。</div>`,
    },
  ];

  build() {
    this.buildOrder();
    this.buildSurface();
    this.buildRope();
    this.buildLong();
  }

  // ───────────── 语序与"词袋" ─────────────
  buildOrder() {
    const g = (this.orderG = new THREE.Group());
    const rows = [
      [['猫', '追', '狗'], 3.6, '🐱 → 🐶 猫在追狗'],
      [['狗', '追', '猫'], 1.8, '🐶 → 🐱 狗在追猫'],
    ];
    this.orderRows = rows.map(([toks, y, mean], ri) => {
      const blocks = toks.map((t) => new TokenBlock(t, { color: t === '追' ? C.model : C.text, minW: 0.9, h: 0.8, textH: 0.46 }));
      const xs = layoutRow(blocks.map((b) => b.w), 0.3);
      blocks.forEach((b, i) => {
        b.userData.home = V3(xs[i] - 0.6, y, 0);
        b.position.copy(b.userData.home);
        const p = textPlane(`位置 ${i}`, 0.17, { color: '#94a3b8', weight: 500 });
        p.position.set(0, -0.56, 0.18);
        b.add(p);
        b.userData.posLabel = p;
        g.add(b);
      });
      const m = label(mean, 'tag', { anchor: 'left' });
      m.position.set(2.0, y, 0);
      g.add(m);
      return { blocks, mean: m, bagX: ri === 0 ? -3.0 : 3.0 };
    });
    // 两个"袋子"
    const profile = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 0.5;
      profile.push(new THREE.Vector2(Math.sin(a) * 1.5 + 0.05, -Math.cos(a) * 1.0 + 1.0));
    }
    this.bags = this.orderRows.map((r) => {
      const bag = new THREE.Mesh(
        new THREE.LatheGeometry(profile, 48),
        new THREE.MeshStandardMaterial({ color: 0x334155, emissive: C.model, emissiveIntensity: 0.15, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      bag.position.set(r.bagX, 0.05, 0);
      g.add(bag);
      return bag;
    });
    this.bagNote = label('两袋 token 一模一样 —— 顺序信息丢失了', 'tag red', { anchor: 'bottom' });
    this.bagNote.position.set(0, 3.0, 0);
    g.add(this.bagNote);
    this.add(g);
    hide(g);
  }

  // ───────────── 正弦位置编码曲面 ─────────────
  buildSurface() {
    const g = (this.surfG = new THREE.Group());
    const P = 64;
    const D = 32;
    const SX = 0.17;
    const SZ = 0.17;
    const geo = new THREE.PlaneGeometry((P - 1) * SX, (D - 1) * SZ, P - 1, D - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    this.pe = (p, d) => {
      const i = Math.floor(d / 2);
      const w = 1 / Math.pow(10000, (2 * i) / D);
      return d % 2 === 0 ? Math.sin(p * w) : Math.cos(p * w);
    };
    for (let k = 0; k < pos.count; k++) {
      const p = k % P;
      const d = D - 1 - Math.floor(k / P); // 低维（变化快）放在前排
      const v = this.pe(p, d);
      pos.setY(k, v * 0.45);
      viridis((v + 1) / 2, col);
      colors.set([col.r * 0.3, col.g * 0.3, col.b * 0.3], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0.0, transparent: true }));
    mesh.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 1.25;');
    };
    mesh.position.y = 1.6;
    g.add(mesh);
    this.surf = { P, D, SX, SZ, mesh };
    // 高亮的"某个位置的编码向量"
    this.sliceGroup = new THREE.Group();
    g.add(this.sliceGroup);
    this.slicePos = { p: 5 };
    this.makeSlice(5);
    const ax1 = label('位置 pos →', 'tag', { anchor: 'top' });
    ax1.position.set(0, 0.55, ((D - 1) * SZ) / 2 + 0.5);
    const ax2 = label('← 维度（前：变化快 · 后：变化慢）', 'tag', { anchor: 'right' });
    ax2.position.set(-((P - 1) * SX) / 2 - 0.3, 1.6, 0);
    this.sliceLabel = label('', 'tag q', { anchor: 'bottom' });
    g.add(ax1, ax2, this.sliceLabel);
    this.add(g);
    hide(g);
  }
  makeSlice(p) {
    if (p === this.sliceAt) return;
    this.sliceAt = p;
    const { D, SX, SZ, P } = this.surf;
    for (const c of [...this.sliceGroup.children]) {
      this.sliceGroup.remove(c);
      c.geometry.dispose();
      c.material.dispose();
    }
    const pts = [];
    for (let d = 0; d < D; d++) pts.push(V3(-((P - 1) * SX) / 2 + p * SX, 1.6 + this.pe(p, d) * 0.45 + 0.04, ((D - 1) * SZ) / 2 - d * SZ));
    this.sliceGroup.add(flowPath(pts, { color: C.q, radius: 0.035, base: 0.8, density: 3, speed: 0.4, tension: 0.1 }));
    if (this.sliceLabel) {
      this.sliceLabel.position.set(-((P - 1) * SX) / 2 + p * SX, 2.5, -((D - 1) * SZ) / 2);
      this.sliceLabel.setHTML(`位置 ${Math.round(p)} 的编码向量`);
    }
  }

  // ───────────── RoPE 表盘 ─────────────
  buildRope() {
    const g = (this.ropeG = new THREE.Group());
    this.ropeTokens = ROPE_TOKENS.map((t) => new TokenBlock(t, { color: C.text, minW: 0.9, h: 0.7, textH: 0.4 }));
    const xs = this.ropeTokens.map((_, i) => -4.3 + i * 1.45);
    this.ropeDials = [];
    this.ropeTokens.forEach((b, i) => {
      b.position.set(xs[i], 0.55, 0);
      const p = textPlane(`位置 ${i}`, 0.17, { color: '#94a3b8', weight: 500 });
      p.position.set(0, -0.5, 0.18);
      b.add(p);
      b.userData.posLabel = p;
      g.add(b);
      const stack = THETAS.map((th, k) => {
        const d = makeDial(DIAL_R, [C.pink, C.model, C.k, C.green][k]);
        d.position.set(xs[i], 1.55 + k * 0.85, 0);
        g.add(d);
        return d;
      });
      this.ropeDials.push(stack);
    });
    const speeds = ['转得快', '较快', '较慢', '转得慢'];
    THETAS.forEach((th, k) => {
      const l = label(`θ${k + 1}：${speeds[k]}`, 'dim', { anchor: 'right' });
      l.position.set(xs[0] - 0.65, 1.55 + k * 0.85, 0);
      g.add(l);
    });
    this.ropeOffset = { v: 0 };
    // 右侧对比表盘（相对位置）
    this.cmpDials = THETAS.map((th, k) => {
      const d = makeDial(0.62, [C.pink, C.model, C.k, C.green][k], { hands: 2 });
      d.position.set(4.75, 1.0 + k * 1.45, 0);
      const delta = (Q_IDX - K_IDX) * th;
      const sector = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48, Math.PI / 2, delta), new THREE.MeshBasicMaterial({ color: C.q, transparent: true, opacity: 0.28, depthWrite: false }));
      sector.position.z = 0.012;
      d.add(sector);
      d.sector = sector;
      g.add(d);
      return d;
    });
    this.cmpTitle = label('"进"(Q) 与 "追"(K) 的指针叠在一起', 'tag q', { anchor: 'bottom' });
    this.cmpTitle.position.set(4.75, 6.95, 0);
    this.offsetLabel = label('', 'tag', { anchor: 'top' });
    this.offsetLabel.position.set(4.75, 0.15, 0);
    g.add(this.cmpTitle, this.offsetLabel);
    this.add(g);
    hide(g);
    this.updateRope();
  }
  updateRope() {
    const off = this.ropeOffset.v;
    this.ropeDials.forEach((stack, i) => stack.forEach((d, k) => (d.hands[0].rotation.z = (i + off) * THETAS[k])));
    this.cmpDials.forEach((d, k) => {
      const aQ = (Q_IDX + off) * THETAS[k];
      const aK = (K_IDX + off) * THETAS[k];
      d.hands[0].rotation.z = aQ;
      d.hands[1].rotation.z = aK;
      d.sector.rotation.z = aK;
    });
    this.ropeTokens.forEach((b, i) => {
      const n = Math.round(i + off);
      if (b.userData.lastN !== n) {
        b.userData.lastN = n;
        b.remove(b.userData.posLabel);
        b.userData.posLabel.geometry.dispose();
        b.userData.posLabel.material.dispose();
        const p = textPlane(`位置 ${n}`, 0.17, { color: '#94a3b8', weight: 500 });
        p.position.set(0, -0.5, 0.18);
        b.add(p);
        b.userData.posLabel = p;
      }
    });
    if (this.offsetLabel) this.offsetLabel.setHTML(`句首插入了 <b>${off.toFixed(1)}</b> 个词 · 夹角保持不变`);
  }

  // ───────────── 长上下文 ─────────────
  buildLong() {
    const g = (this.longG = new THREE.Group());
    g.position.set(0, 2.9, 0);
    const R = 1.9;
    const TH = 0.35;
    const TRAIN = 8;
    const N = 16;
    const dial = makeDial(R, C.k, { hands: 0 });
    g.add(dial);
    const seen = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 64, Math.PI / 2, (TRAIN - 1) * TH), new THREE.MeshBasicMaterial({ color: C.green, transparent: true, opacity: 0.18, depthWrite: false }));
    seen.position.z = 0.01;
    g.add(seen);
    this.longHands = [];
    for (let p = 0; p < N; p++) {
      const pivot = new THREE.Group();
      const geo = new THREE.BoxGeometry(0.035, R * 0.86, 0.02);
      geo.translate(0, (R * 0.86) / 2, 0);
      const m = new THREE.Mesh(geo, glowMat(p < TRAIN ? C.green : C.red, { glow: 1.2 }));
      m.position.z = 0.03 + p * 0.001;
      pivot.add(m);
      const tag = textPlane(String(p), 0.2, { color: p < TRAIN ? '#86efac' : '#fca5a5', weight: 700 });
      tag.position.set(0, R * 0.98, 0.04);
      pivot.add(tag);
      pivot.userData = { p, mat: m.material, tag };
      g.add(pivot);
      this.longHands.push(pivot);
    }
    this.longScale = { s: 1 };
    this.longState = label('', 'tag', { anchor: 'top' });
    this.longState.position.set(0, -R - 0.25, 0);
    const seenL = label('训练时见过的角度范围', 'tag green', { anchor: 'left' });
    seenL.position.set(R * 0.55, R * 0.95, 0);
    g.add(this.longState, seenL);
    this.longTH = TH;
    this.longTrain = TRAIN;
    this.add(g);
    hide(g);
    this.updateLong();
  }
  updateLong() {
    const s = this.longScale.s;
    const maxSeen = (this.longTrain - 1) * this.longTH + 1e-6;
    let outside = 0;
    this.longHands.forEach((h) => {
      const a = h.userData.p * this.longTH * s;
      h.rotation.z = a;
      const ok = a <= maxSeen;
      if (!ok) outside++;
      h.userData.mat.emissive.setHex(ok ? C.green : C.red);
      h.userData.mat.color.setHex(ok ? C.green : C.red).multiplyScalar(0.3);
    });
    if (this.longState)
      this.longState.setHTML(
        s > 0.99 ? `直接外推：<b style="color:#fca5a5">${outside}</b> 个位置落在陌生角度` : `位置插值（转速 × ${s.toFixed(2)}）：陌生角度 <b style="color:${outside ? '#fca5a5' : '#86efac'}">${outside}</b> 个`
      );
  }

  go(step) {
    const tl = this.tl;
    this.fade(this.orderG, step <= 1 ? 1 : 0, 0, 0.5);
    this.fade(this.surfG, step === 2 ? 1 : 0, step === 2 ? 0.3 : 0, 0.6);
    this.fade(this.ropeG, step === 3 || step === 4 ? 1 : 0, step >= 3 ? 0.3 : 0, 0.6);
    this.fade(this.longG, step === 5 ? 1 : 0, step === 5 ? 0.3 : 0, 0.6);

    // 语序 / 词袋
    const toBag = step === 1;
    this.orderRows.forEach((r, ri) => {
      r.blocks.forEach((b, i) => {
        const h = b.userData.home;
        if (toBag) {
          const jx = [-0.55, 0.5, 0.0][(i + ri) % 3];
          const jz = [0.25, -0.2, 0.4][(i * 2 + ri) % 3];
          tl.to(b.position, { x: r.bagX + jx, y: 0.75 + i * 0.12, z: jz, duration: 0.9, ease: 'power2.in' }, 0.3 + i * 0.15);
          tl.to(b.rotation, { x: 0.2 * (i - 1), y: 0.5 * (i % 2 ? 1 : -1), z: 0.35 * (i - 1), duration: 0.9 }, 0.3 + i * 0.15);
        } else {
          tl.to(b.position, { x: h.x, y: h.y, z: 0, duration: 0.8, ease: 'power2.out' }, 0);
          tl.to(b.rotation, { x: 0, y: 0, z: 0, duration: 0.8 }, 0);
        }
        this.fade(b.userData.posLabel, toBag ? 0 : 1, 0, 0.3);
      });
      this.fade(r.mean, toBag ? 0 : 1, 0, 0.3);
    });
    this.bags.forEach((bag) => this.fade(bag, toBag ? 1 : 0, toBag ? 0.2 : 0, 0.5));
    this.fade(this.bagNote, toBag ? 1 : 0, toBag ? 1.6 : 0, 0.5);

    if (step === 2) {
      tl.set(this.slicePos, { p: 0 }, 0);
      const loop = tl.to(this.slicePos, { p: 63, duration: 12, ease: 'none', repeat: -1, yoyo: true, onUpdate: () => this.makeSlice(Math.round(this.slicePos.p)) }, 0.8);
      void loop;
    }
    if (step === 3) {
      tl.to(this.ropeOffset, { v: 0, duration: 0.6, onUpdate: () => this.updateRope() }, 0);
      this.cmpDials.forEach((d) => this.fade(d, 0, 0, 0.3));
      this.fade(this.cmpTitle, 0, 0, 0.3);
      this.fade(this.offsetLabel, 0, 0, 0.3);
      this.ropeTokens.forEach((b, i) => tl.to(b.box.material, { emissiveIntensity: 0.5, duration: 0.3 }, 0));
      // 依次点亮各 token 的表盘，强调"越靠后转得越多"
      this.ropeDials.forEach((stack, i) => stack.forEach((d) => tl.fromTo(d.scale, { x: 0.6, y: 0.6, z: 0.6 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.5)' }, 0.5 + i * 0.25)));
    }
    if (step === 4) {
      this.cmpDials.forEach((d, k) => tl.to(d, { opacity: 1, duration: 0.5 }, 0.4 + k * 0.1));
      tl.to(this.cmpTitle, { opacity: 1, duration: 0.5 }, 0.5);
      tl.to(this.offsetLabel, { opacity: 1, duration: 0.5 }, 0.6);
      this.ropeDials.forEach((stack) => stack.forEach((d) => tl.to(d.scale, { x: 1, y: 1, z: 1, duration: 0.3 }, 0)));
      this.ropeTokens.forEach((b, i) => tl.to(b.box.material, { emissiveIntensity: i === Q_IDX || i === K_IDX ? 1.6 : 0.35, duration: 0.4 }, 0.3));
      tl.to(this.ropeOffset, { v: 0, duration: 0.4, onUpdate: () => this.updateRope() }, 0);
      tl.to(this.ropeOffset, { v: 3, duration: 4, ease: 'sine.inOut', repeat: -1, yoyo: true, repeatDelay: 0.6, onUpdate: () => this.updateRope() }, 1.4);
    }
    if (step === 5) {
      tl.set(this.longScale, { s: 1 }, 0);
      tl.call(() => this.updateLong(), null, 0);
      this.longHands.forEach((h, i) => tl.fromTo(h.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(2)' }, 0.5 + i * 0.12));
      tl.to(this.longScale, { s: 7 / 15, duration: 2.0, ease: 'power2.inOut', onUpdate: () => this.updateLong() }, 4.2);
    }
  }
}
