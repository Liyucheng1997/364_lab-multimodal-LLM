// 第 2 章 分词：文字 → Token
import * as THREE from 'three';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, layoutRow, V3, hide, unitBoxBase, glowMat } from '../core/kit.js';
import { getEncoding, tokenize, displayText, trainBPE } from '../core/tokenizer.js';

const EXAMPLE = '我在学习Tokenization';
const BPE_CORPUS = [
  ['人工智能', 5],
  ['智能手机', 4],
  ['手机游戏', 3],
  ['游戏人生', 2],
  ['人工智能手机', 1],
  ['人工', 1],
];
const SHELF = ['的', '我们', '·the', 'ing', '人工', '智能', '手机', '游戏', '我', 'Token', 'ization', '·function', '😀', '模型', '在', '学习', '，', '。', '·is', '·and', '123', 'Hello', '数据', '图片', '·Python', 'def', '中国', '北京', 'の', '는'];
const ZH = '人工智能正在改变我们的生活方式。';
const EN = 'Artificial intelligence is changing the way we live.';
const PALETTE = [0x38bdf8, 0xa78bfa, 0x34d399, 0xfbbf24, 0xf472b6, 0x60a5fa];
const PRESETS = [
  ['中文', '大语言模型通过预测下一个词来生成文字，听起来简单，却能写诗、编程和回答问题。'],
  ['English', 'Large language models generate text by predicting the next token, one at a time.'],
  ['代码', 'def add(a, b):\n    return a + b  # 加法'],
  ['数字', '2026年10月14日，订单号 1234567890，总价 ¥99.90'],
  ['Emoji', '今天心情不错😀👍🎉'],
  ['生僻字', '龘靐齉齾爩鱻麤龗灪'],
];

export default class Tokenize extends Chapter {
  static meta = {
    id: 'tokenize',
    short: '分词',
    title: '分词：文字如何变成 Token',
    subtitle: '模型只认识数字。分词器把文字切成"常用片段"，再换成编号——这就是 token。',
  };

  static steps = [
    {
      title: '为什么不直接按"字"或按"词"切？',
      cam: [0, 3.4, 13.5, 0, 2.8, 0],
      html: `
        <p>同一句"我在学习Tokenization"，有三种切法：</p>
        <ul>
          <li><b>按字符切</b>：词表很小（几千个字符就够），但序列太长——英文单词被拆成一个个字母，模型要"读"更多步，算力浪费。</li>
          <li><b>按单词切</b>：序列短，但词表会爆炸（几百万个词），而且遇到没见过的新词只能变成 <code>[UNK]</code>（未知），信息直接丢失。</li>
          <li><b>按子词切（BPE 等）</b>：常见词整个保留，罕见词拆成更小的常见片段（Token + ization）。<b>两头兼顾</b>，这是今天几乎所有大模型的选择。</li>
        </ul>
        <div class="key">子词分词 = 用一个<b>大小适中</b>（10 万~20 万）的词表，表示<b>任意</b>文本，并让常见内容尽量短。</div>`,
    },
    {
      title: 'BPE：从单字开始，反复合并"最常见的一对"',
      cam: [-0.6, 3.0, 12.2, -0.6, 2.6, 0],
      html: `
        <p><b>BPE（Byte Pair Encoding，字节对编码）</b>是最常用的分词算法，训练过程非常朴素：</p>
        <ol>
          <li>先把语料拆成最小单位（真实分词器从<b>字节</b>开始，这里用汉字演示）；</li>
          <li>统计所有<b>相邻两个单位</b>一起出现的次数（按词频加权）；</li>
          <li>把出现最多的那一对<b>合并</b>成一个新单位，加入词表；</li>
          <li>重复第 2~3 步，直到词表达到目标大小（如 20 万）。</li>
        </ol>
        <p>看左边的动画：<b>智+能</b>最先被合并（出现 10 次），接着是<b>手+机</b>、<b>人+工</b>……最后"人工智能"整个变成了一个 token。</p>
        <div class="note">训练完成后，分词器会按<b>同样的合并顺序</b>去切任何新文本。所以词表和合并规则一旦确定，同一段文字的切法就是固定的。</div>`,
    },
    {
      title: '词表：每个 token 都有一个编号',
      cam: [0, 3.1, 12.5, 0, 2.6, -0.6],
      html: `
        <p>训练好的分词器拥有一张<b>词表（Vocabulary）</b>：每个 token 对应一个整数编号（Token ID）。</p>
        <p>后面的"货架"上是 GPT-4o 词表（o200k_base，约 20 万项）里的一些真实 token：有汉字、有英文片段（注意 <code>·the</code> 前面带空格）、有日韩文、也有 emoji。</p>
        <p>分词的最终结果，就是一串整数：</p>
        <div class="formula">"我在学习Tokenization"
→ [7522, 2178, 64550, 4421, 2860]</div>
        <div class="key">模型真正"吃"进去的只有这串编号。编号本身没有含义——7522 和 7523 之间毫无关系。下一章会讲，模型如何把编号变成有意义的向量。</div>`,
    },
    {
      title: '动手试试：实时分词',
      cam: [0, 3.6, 12.2, 0, 3.0, 0],
      html: `
        <p>在下面的输入框里随便打字，左侧 3D 区域会实时显示<b>真实分词结果</b>（使用 OpenAI 开源的分词表，与 GPT-4o 完全一致）。</p>
        <ul>
          <li>每个彩色方块 = 1 个 token，下方小字是编号；</li>
          <li><code>·</code> 表示空格——英文单词通常和<b>前面的空格</b>一起组成 token；</li>
          <li><span class="chip red">‹E9 BE›</span> 这种红色方块是<b>字节碎片</b>：生僻字在词表里没有，只能拆成 UTF-8 字节，一个字可能占 2~3 个 token。</li>
        </ul>
        <p class="note">试试切换"旧分词器 cl100k_base"，看看同一段中文 token 数的变化。</p>`,
    },
    {
      title: '中文更"贵"吗？分词器的效率差异',
      cam: [0, 3.0, 14, 0, 2.4, 0],
      html: `
        <p>同一句话，用不同分词器、不同语言，token 数可能差很多：</p>
        <div id="cmp-table"></div>
        <ul>
          <li><b>旧分词器（cl100k）</b>的词表以英文为主，很多汉字没有单独的 token，只能拆成字节碎片，所以中文特别"费 token"；</li>
          <li><b>新分词器（o200k）</b>词表扩大到 20 万，加入了大量中文词，中文效率提升近一倍；</li>
          <li>英文本来就高效，变化不大。</li>
        </ul>
        <div class="key">token 数直接决定<b>费用</b>、<b>速度</b>和<b>能塞进上下文的内容量</b>。估算经验：英文约 1 token ≈ 4 个字母（约 0.75 个单词）；中文在新分词器下约 1 token ≈ 1~2 个汉字——但最可靠的办法永远是用对应模型的分词器实际数一数。</div>
        <div class="note">不同厂商（OpenAI、Anthropic、Google、阿里等）的分词器各不相同，同一段文字的 token 数也会不同。</div>`,
    },
    {
      title: '特殊 token：对话是怎么拼起来的',
      cam: [0, 3.0, 13.5, 0, 2.6, 0],
      html: `
        <p>聊天时，你看到的是一条条消息；但模型看到的仍然是<b>一整条 token 序列</b>。系统提示、用户消息、助手回复之间，用<b>特殊 token</b> 隔开。</p>
        <p>左图是一种常见格式（ChatML，Qwen 等开源模型在用）：<span class="chip pink">&lt;|im_start|&gt;</span> 标记一条消息开始，后面跟角色名；<span class="chip pink">&lt;|im_end|&gt;</span> 标记结束。</p>
        <div class="key">所以每条消息都有几个 token 的"格式开销"；模型生成到 <code>&lt;|im_end|&gt;</code>（或类似的结束标记）时，就知道该停下了。</div>
        <div class="note">特殊 token 在词表里有专门的编号，普通文字无法"拼"出它们——这也是防止用户伪造系统消息的一道防线。</div>`,
    },
  ];

  async init() {
    [this.enc, this.encOld] = await Promise.all([getEncoding('o200k_base'), getEncoding('cl100k_base')]);
  }

  build() {
    this.groups = [this.buildCompare(), this.buildBPE(), this.buildVocab(), this.buildLive(), this.buildEfficiency(), this.buildChat()];
    this.groups.forEach((g) => {
      this.add(g);
      hide(g);
    });
    this.liveText = PRESETS[0][1];
    this.liveEnc = 'o200k_base';
  }

  // ───────────── Step 0：三种切法 ─────────────
  buildCompare() {
    const g = new THREE.Group();
    const rows = [
      { y: 4.7, toks: [...EXAMPLE].map((t) => [t, C.indigo]), tag: '按字符：16 个 token', note: '序列太长', cls: 'model' },
      { y: 2.9, toks: [['我', C.slate], ['在', C.slate], ['学习', C.slate], ['[UNK]', C.red]], tag: '按单词：4 个 token', note: '新词 → [UNK]，信息丢失', cls: 'red' },
      { y: 1.1, toks: tokenize(this.enc, EXAMPLE).map((t) => [displayText(t), C.text]), tag: '按子词（BPE）：5 个 token', note: '长度适中，任何文字都能表示', cls: 'text' },
    ];
    rows.forEach((r) => {
      const blocks = r.toks.map(([t, c]) => new TokenBlock(t, { color: c, minW: 0.52, textH: 0.34 }));
      const xs = layoutRow(blocks.map((b) => b.w), 0.12);
      blocks.forEach((b, i) => {
        b.position.set(xs[i] + 1.4, r.y, 0);
        g.add(b);
      });
      const left = xs[0] + 1.4 - blocks[0].w / 2;
      const tag = label(`${r.tag}<br><span class="lbl tiny">${r.note}</span>`, `tag ${r.cls}`, { anchor: 'right' });
      tag.position.set(left - 0.35, r.y, 0);
      g.add(tag);
    });
    return g;
  }

  // ───────────── Step 1：BPE 合并动画 ─────────────
  buildBPE() {
    const g = new THREE.Group();
    const { states, merges } = trainBPE(BPE_CORPUS, 6);
    this.bpe = { states, merges, lines: [] };
    const X0 = -5.4;
    const Y0 = 4.9;
    const DY = 0.92;
    const mk = (t) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.56, textH: 0.34, h: 0.6 });
      hide(b);
      g.add(b);
      return b;
    };
    // blocksByState[k][line] = TokenBlock[]（未变化的 token 复用同一个对象）
    let cur = states[0].map((line) => line.map((ch) => mk(ch)));
    const byState = [cur];
    const events = [];
    merges.forEach((m, k) => {
      const ev = [];
      const next = cur.map((blocks, l) => {
        const out = [];
        const toks = states[k][l];
        for (let i = 0; i < toks.length; i++) {
          if (i < toks.length - 1 && toks[i] === m.a && toks[i + 1] === m.b) {
            const nb = mk(m.merged);
            ev.push({ line: l, a: blocks[i], b: blocks[i + 1], nb });
            out.push(nb);
            i++;
          } else out.push(blocks[i]);
        }
        return out;
      });
      events.push(ev);
      byState.push(next);
      cur = next;
    });
    const posOf = (blocks, l) => {
      let x = X0;
      return blocks.map((b) => {
        const p = V3(x + b.w / 2, Y0 - l * DY, 0);
        x += b.w + 0.12;
        return p;
      });
    };
    this.bpe.byState = byState;
    this.bpe.events = events;
    this.bpe.posOf = posOf;
    BPE_CORPUS.forEach(([, f], l) => {
      const fl = label(`×${f}`, 'mono dim', { anchor: 'right' });
      fl.position.set(X0 - 0.3, Y0 - l * DY, 0);
      g.add(fl);
    });
    const head = label('训练语料（词 × 出现次数）', 'tag', { anchor: 'bottom' });
    head.position.set(X0 + 1.6, Y0 + 0.75, 0);
    g.add(head);
    this.bpeLog = label('', 'card', { anchor: 'left' });
    this.bpeLog.position.set(1.4, 3.0, 0);
    g.add(this.bpeLog);
    return g;
  }
  bpeLogHTML(k) {
    const { merges, states } = this.bpe;
    const vocab0 = new Set(states[0].flat()).size;
    const rows = merges
      .slice(0, k)
      .map((m, i) => `<div>${i + 1}. <b>${m.a} + ${m.b}</b> → <b style="color:#7dd3fc">${m.merged}</b> <span style="opacity:.6">（${m.count} 次）</span></div>`)
      .join('');
    const next = merges[k];
    const counting = next
      ? `<div style="margin-top:6px;opacity:.75">正在统计相邻组合：${next.top.map((t) => `${t.pair[0]}+${t.pair[1]}×${t.count}`).join('，')}</div>`
      : `<div style="margin-top:6px;color:#86efac">完成！最高频的组合都变成了独立 token</div>`;
    return `<b>合并规则（按顺序）</b>${rows || '<div style="opacity:.6">（还没有合并）</div>'}${counting}<div style="margin-top:6px">词表大小：<b>${vocab0}</b> 个单字 + <b>${k}</b> 个新 token = <b>${vocab0 + k}</b></div>`;
  }
  runBPE(at = 0.5) {
    const tl = this.tl;
    const { byState, events, posOf } = this.bpe;
    const all = new Set(byState.flat(2));
    // 复位到初始状态
    all.forEach((b) => {
      tl.set(b, { opacity: 0 }, 0);
      b.setGlow(b.baseGlow);
    });
    byState[0].forEach((blocks, l) =>
      posOf(blocks, l).forEach((p, i) => {
        tl.set(blocks[i].position, { x: p.x, y: p.y, z: 0 }, 0);
        tl.set(blocks[i].scale, { x: 1, y: 1, z: 1 }, 0);
        tl.to(blocks[i], { opacity: 1, duration: 0.4 }, at + l * 0.08 + i * 0.03);
      })
    );
    tl.call(() => this.bpeLog.setHTML(this.bpeLogHTML(0)), null, 0);
    let t = at + 1.2;
    events.forEach((ev, k) => {
      ev.forEach(({ a, b }) => {
        tl.to(a.box.material, { emissiveIntensity: 1.5, duration: 0.25 }, t);
        tl.to(b.box.material, { emissiveIntensity: 1.5, duration: 0.25 }, t);
      });
      ev.forEach(({ a, b, nb, line }) => {
        const pos = posOf(byState[k + 1][line], line);
        const idx = byState[k + 1][line].indexOf(nb);
        const mid = pos[idx];
        tl.to(a.position, { x: mid.x - 0.15, duration: 0.35, ease: 'power2.in' }, t + 0.7);
        tl.to(b.position, { x: mid.x + 0.15, duration: 0.35, ease: 'power2.in' }, t + 0.7);
        tl.to(a, { opacity: 0, duration: 0.2 }, t + 0.95);
        tl.to(b, { opacity: 0, duration: 0.2 }, t + 0.95);
        tl.set(nb.position, { x: mid.x, y: mid.y, z: 0 }, t + 0.9);
        tl.to(nb, { opacity: 1, duration: 0.25 }, t + 0.95);
        tl.fromTo(nb.scale, { x: 0.6, y: 0.6, z: 0.6 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(3)' }, t + 0.95);
        tl.set(nb.box.material, { emissiveIntensity: 1.5 }, t + 0.95);
        tl.to(nb.box.material, { emissiveIntensity: nb.baseGlow, duration: 0.8 }, t + 1.5);
      });
      byState[k + 1].forEach((blocks, l) =>
        posOf(blocks, l).forEach((p, i) => tl.to(blocks[i].position, { x: p.x, duration: 0.45, ease: 'power2.inOut' }, t + 1.25))
      );
      tl.call(() => this.bpeLog.setHTML(this.bpeLogHTML(k + 1)), null, t + 1.0);
      t += 2.3;
    });
    return t;
  }

  // ───────────── Step 2：词表货架 ─────────────
  buildVocab() {
    const g = new THREE.Group();
    const COLS = 6;
    this.shelf = new Map();
    SHELF.forEach((t, i) => {
      const raw = t.replace(/·/g, ' ');
      const ids = this.enc.encode(raw);
      const r = Math.floor(i / COLS);
      const c = i % COLS;
      const b = new TokenBlock(t, { color: C.indigo, minW: 1.1, w: 1.5, textH: 0.3, h: 0.52, d: 0.26, glow: 0.35 });
      b.position.set(-4.4 + c * 1.76, 5.0 - r * 0.92, -1.6);
      const id = textPlane(ids.length === 1 ? `#${ids[0]}` : '', 0.17, { color: '#9aa7bd', weight: 500 });
      id.position.set(0, -0.37, 0.14);
      b.add(id);
      g.add(b);
      this.shelf.set(raw, b);
    });
    const shelfTitle = label('词表（o200k_base，共约 20 万个 token）——这里只展示 30 个', 'tag', { anchor: 'bottom' });
    shelfTitle.position.set(0, 5.6, -1.6);
    g.add(shelfTitle);
    const toks = tokenize(this.enc, EXAMPLE);
    this.vocabRow = toks.map((t) => {
      const b = new TokenBlock(displayText(t), { color: C.text, minW: 0.6 });
      const id = label(`${t.id}`, 'pct', { anchor: 'top' });
      id.position.set(0, -0.45, 0);
      b.add(id);
      g.add(b);
      return b;
    });
    const xs = layoutRow(this.vocabRow.map((b) => b.w), 0.3);
    this.vocabRow.forEach((b, i) => (b.userData.home = V3(xs[i], 0.55, 1.4)));
    this.idArray = label(`[${toks.map((t) => t.id).join(', ')}]`, 'big mono', { anchor: 'top' });
    this.idArray.position.set(0, -0.45, 1.4);
    g.add(this.idArray);
    return g;
  }
  runVocab(at = 0.4) {
    const tl = this.tl;
    tl.set(this.idArray, { opacity: 0 }, 0);
    this.vocabRow.forEach((b, i) => {
      const src = this.shelf.get(b.text);
      const from = src ? src.position.clone() : V3(0, 6, -1.6);
      tl.set(b.position, { x: from.x, y: from.y, z: from.z + 0.3 }, 0);
      tl.set(b, { opacity: 0 }, 0);
      if (src) tl.to(src.box.material, { emissiveIntensity: 1.5, duration: 0.3, yoyo: true, repeat: 1 }, at + i * 0.45);
      tl.to(b, { opacity: 1, duration: 0.3 }, at + i * 0.45 + 0.2);
      const h = b.userData.home;
      tl.to(b.position, { x: h.x, y: h.y, z: h.z, duration: 0.9, ease: 'power2.inOut' }, at + i * 0.45 + 0.3);
    });
    tl.to(this.idArray, { opacity: 1, duration: 0.6 }, at + this.vocabRow.length * 0.45 + 1.0);
  }

  // ───────────── Step 3：实时分词 ─────────────
  buildLive() {
    const g = new THREE.Group();
    this.liveHolder = new THREE.Group();
    g.add(this.liveHolder);
    this.liveInfo = label('', 'tag', { anchor: 'bottom' });
    this.liveInfo.position.set(0, 5.75, 0);
    g.add(this.liveInfo);
    return g;
  }
  renderLive() {
    if (!this.liveHolder) return;
    const api = this.liveEnc === 'o200k_base' ? this.enc : this.encOld;
    const toks = tokenize(api, this.liveText || '');
    // 清理旧方块
    for (const c of [...this.liveHolder.children]) {
      this.liveHolder.remove(c);
      c.traverse((o) => {
        if (o.material) o.material.dispose();
        if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
      });
    }
    const MAX = 110;
    const shown = toks.slice(0, MAX);
    const MAXW = 13;
    let x = -MAXW / 2;
    let y = 4.6;
    shown.forEach((t, i) => {
      const color = t.partial ? C.red : PALETTE[i % PALETTE.length];
      const b = new TokenBlock(displayText(t), { color, minW: 0.42, h: 0.56, d: 0.26, textH: 0.3, pad: 0.18, glow: 0.55 });
      if (t.text === '\n') {
        x = -MAXW / 2;
        y -= 0.95;
      }
      if (x + b.w > MAXW / 2) {
        x = -MAXW / 2;
        y -= 0.95;
      }
      b.position.set(x + b.w / 2, y, 0);
      x += b.w + 0.1;
      const id = textPlane(String(t.id), 0.15, { color: '#9aa7bd', weight: 500 });
      id.position.set(0, -0.4, 0.14);
      b.add(id);
      b.scale.setScalar(0.01);
      this.liveHolder.add(b);
      this.tw(b.scale, { x: 1, y: 1, z: 1, duration: 0.35, delay: Math.min(i * 0.012, 0.8), ease: 'back.out(2)' });
    });
    const chars = [...(this.liveText || '')].length;
    this.liveInfo.setHTML(`${this.liveEnc}：<b>${chars}</b> 个字符 → <b>${toks.length}</b> 个 token${toks.length > MAX ? `（仅显示前 ${MAX} 个）` : ''}`);
    return toks;
  }

  // ───────────── Step 4：效率对比 ─────────────
  buildEfficiency() {
    const g = new THREE.Group();
    const zhNew = tokenize(this.enc, ZH);
    const zhOld = tokenize(this.encOld, ZH);
    const enNew = tokenize(this.enc, EN);
    const enOld = tokenize(this.encOld, EN);
    this.counts = { zhNew: zhNew.length, zhOld: zhOld.length, enNew: enNew.length, enOld: enOld.length };
    const mkRow = (toks, y, tag, cls) => {
      const blocks = toks.map((t, i) => new TokenBlock(displayText(t), { color: t.partial ? C.red : i % 2 ? 0x7dd3fc : C.text, minW: 0.4, h: 0.54, d: 0.26, textH: 0.28, pad: 0.16 }));
      const xs = layoutRow(blocks.map((b) => b.w), 0.08);
      const total = blocks.reduce((a, b) => a + b.w, 0) + 0.08 * (blocks.length - 1);
      blocks.forEach((b, i) => {
        b.position.set(xs[i] - 2.3 + total / 2 - 4.6, y, 0);
        g.add(b);
      });
      const lb = label(tag, `tag ${cls}`, { anchor: 'left' });
      lb.position.set(-6.9, y + 0.62, 0);
      g.add(lb);
      return blocks;
    };
    mkRow(zhOld, 4.3, `旧分词器 cl100k：<b>${zhOld.length}</b> 个 token（红色 = 字节碎片）`, 'red');
    mkRow(zhNew, 2.6, `新分词器 o200k：<b>${zhNew.length}</b> 个 token`, 'text');
    // 右侧柱状图
    const bars = [
      ['中文 · cl100k', zhOld.length, C.slate],
      ['中文 · o200k', zhNew.length, C.text],
      ['英文 · cl100k', enOld.length, C.slate],
      ['英文 · o200k', enNew.length, C.text],
    ];
    this.effBars = bars.map(([name, n, color], i) => {
      const grp = new THREE.Group();
      grp.position.set(3.0 + i * 1.05 + (i >= 2 ? 0.45 : 0), 0, 0);
      const m = new THREE.Mesh(unitBoxBase(), glowMat(color, { glow: 0.7 }));
      m.scale.set(0.72, n * 0.24, 0.72);
      grp.add(m);
      const v = label(`${n}`, 'pct', { anchor: 'bottom' });
      v.position.y = n * 0.24 + 0.1;
      grp.add(v);
      const nm = textPlane(name, 0.17, { color: '#cbd5e1', weight: 500 });
      nm.position.set(0, -0.3, 0.45);
      grp.add(nm);
      grp.userData.bar = m;
      grp.userData.h = n * 0.24;
      g.add(grp);
      return grp;
    });
    const bt = label('同一句话的 token 数', 'tag', { anchor: 'bottom' });
    bt.position.set(4.8, 4.4, 0);
    g.add(bt);
    // 生僻字字节回退示例
    const rare = tokenize(this.enc, '龘');
    const rb = rare.map((t) => new TokenBlock(displayText(t), { color: C.red, minW: 0.5, h: 0.54, textH: 0.26 }));
    const xs = layoutRow(rb.map((b) => b.w), 0.08);
    rb.forEach((b, i) => {
      b.position.set(xs[i] - 3.6, 0.7, 0);
      g.add(b);
    });
    const rl = label(`生僻字"龘"：词表里没有 → 拆成 <b>${rare.length}</b> 个 UTF-8 字节碎片`, 'tag red', { anchor: 'left' });
    rl.position.set(-6.9, 1.32, 0);
    g.add(rl);
    return g;
  }

  // ───────────── Step 5：对话模板 ─────────────
  buildChat() {
    const g = new THREE.Group();
    const segs = [
      ['<|im_start|>', 'sp'],
      ['system', 'role'],
      ['\n你是一个乐于助人的助手。', 'txt'],
      ['<|im_end|>', 'sp'],
      ['<|im_start|>', 'sp'],
      ['user', 'role'],
      ['\n你好！', 'txt'],
      ['<|im_end|>', 'sp'],
      ['<|im_start|>', 'sp'],
      ['assistant', 'role'],
      ['\n', 'txt'],
    ];
    const items = [];
    for (const [s, kind] of segs) {
      if (kind === 'sp') items.push({ text: s, color: C.pink });
      else tokenize(this.enc, s).forEach((t) => items.push({ text: displayText(t), color: kind === 'role' ? C.gold : C.text }));
    }
    this.chatBlocks = items.map((it) => new TokenBlock(it.text, { color: it.color, minW: 0.42, h: 0.56, d: 0.26, textH: it.text.length > 8 ? 0.24 : 0.3, pad: 0.18 }));
    const MAXW = 12.5;
    let x = -MAXW / 2;
    let y = 2.8;
    this.chatBlocks.forEach((b) => {
      if (x + b.w > MAXW / 2) {
        x = -MAXW / 2;
        y -= 0.85;
      }
      b.userData.home = V3(x + b.w / 2, y, 0);
      b.position.copy(b.userData.home);
      x += b.w + 0.08;
      g.add(b);
    });
    const sys = label('<b>系统</b>：你是一个乐于助人的助手。', 'card', { anchor: 'bottom' });
    sys.position.set(-3.2, 4.4, 0);
    const usr = label('<b>用户</b>：你好！', 'card', { anchor: 'bottom' });
    usr.position.set(2.2, 4.4, 0);
    const ast = label('<b>助手</b>：（从这里开始生成……）', 'card', { anchor: 'bottom' });
    ast.position.set(5.6, 4.4, 0);
    g.add(sys, usr, ast);
    this.chatCards = [sys, usr, ast];
    this.chatCount = label(`整段对话 = <b>${items.length}</b> 个 token，其中格式开销（特殊 token + 角色名 + 换行）约 <b>${items.filter((i) => i.color !== C.text).length + 3}</b> 个`, 'tag', { anchor: 'top' });
    this.chatCount.position.set(0, -0.3, 0);
    g.add(this.chatCount);
    return g;
  }
  runChat(at = 0.3) {
    const tl = this.tl;
    this.chatCards.forEach((c, i) => {
      tl.set(c, { opacity: 0 }, 0);
      tl.to(c, { opacity: 1, duration: 0.5 }, at + i * 0.25);
    });
    tl.set(this.chatCount, { opacity: 0 }, 0);
    this.chatBlocks.forEach((b, i) => {
      tl.set(b, { opacity: 0 }, 0);
      tl.set(b.position, { y: b.userData.home.y + 1.2 }, 0);
      tl.to(b, { opacity: 1, duration: 0.25 }, at + 1.0 + i * 0.07);
      tl.to(b.position, { y: b.userData.home.y, duration: 0.5, ease: 'back.out(1.6)' }, at + 1.0 + i * 0.07);
    });
    tl.to(this.chatCount, { opacity: 1, duration: 0.5 }, at + 1.4 + this.chatBlocks.length * 0.07);
  }

  // ───────────── 步骤切换 ─────────────
  go(step) {
    const tl = this.tl;
    this.groups.forEach((g, i) => {
      if (i !== step) this.fade(g, 0, 0, 0.4);
    });
    tl.to(this.groups[step], { opacity: 1, duration: 0.6 }, 0.3);
    if (step === 1) this.runBPE(0.5);
    if (step === 2) this.runVocab(0.6);
    if (step === 4) {
      this.effBars.forEach((grp, i) => {
        tl.fromTo(grp.userData.bar.scale, { y: 0.01 }, { y: grp.userData.h, duration: 0.9, ease: 'power2.out' }, 0.6 + i * 0.15);
      });
    }
    if (step === 5) this.runChat(0.4);
  }

  widget(step, el) {
    if (step === 1) {
      el.innerHTML = `<div class="w-title">BPE 训练演示</div><div class="w-btns"><button class="w-btn primary" id="bpe-replay">↻ 重新播放合并过程</button></div>`;
      el.querySelector('#bpe-replay').onclick = () => {
        this.newTimeline();
        this.tl.to(this.groups[1], { opacity: 1, duration: 0.2 }, 0);
        this.runBPE(0.2);
      };
      return null;
    }
    if (step === 3) return this.liveWidget(el);
    if (step === 4) {
      const c = this.counts;
      const zhChars = [...ZH].length;
      document.getElementById('cmp-table').innerHTML = `
        <table class="mini">
          <tr><th>句子</th><th>cl100k（旧）</th><th>o200k（新）</th></tr>
          <tr><td>${ZH}<br><small style="color:#64748b">${zhChars} 个字符</small></td><td class="num">${c.zhOld}</td><td class="num">${c.zhNew}</td></tr>
          <tr><td>${EN}<br><small style="color:#64748b">${EN.length} 个字符</small></td><td class="num">${c.enOld}</td><td class="num">${c.enNew}</td></tr>
        </table>`;
      return null;
    }
    return null;
  }

  liveWidget(el) {
    el.innerHTML = `
      <div class="w-title">实时分词器</div>
      <textarea class="w-text" id="tk-in" spellcheck="false"></textarea>
      <div class="w-btns" id="tk-presets"></div>
      <div class="w-row"><label>分词器</label>
        <select id="tk-enc">
          <option value="o200k_base">o200k_base（GPT-4o / GPT-5 等）</option>
          <option value="cl100k_base">cl100k_base（GPT-4 / 3.5，旧）</option>
        </select>
      </div>
      <div class="w-stats">
        <div class="w-stat"><b id="tk-chars">0</b><span>字符数</span></div>
        <div class="w-stat"><b id="tk-count">0</b><span>token 数</span></div>
        <div class="w-stat"><b id="tk-ratio">0</b><span>字符 / token</span></div>
      </div>
      <div class="tok-strip" id="tk-strip"></div>`;
    const input = el.querySelector('#tk-in');
    const sel = el.querySelector('#tk-enc');
    input.value = this.liveText;
    sel.value = this.liveEnc;
    const pre = el.querySelector('#tk-presets');
    PRESETS.forEach(([name, text]) => {
      const b = document.createElement('button');
      b.className = 'w-btn';
      b.textContent = name;
      b.onclick = () => {
        input.value = text;
        update();
      };
      pre.appendChild(b);
    });
    let timer = null;
    const update = () => {
      this.liveText = input.value;
      this.liveEnc = sel.value;
      const toks = this.renderLive();
      const chars = [...input.value].length;
      el.querySelector('#tk-chars').textContent = chars;
      el.querySelector('#tk-count').textContent = toks.length;
      el.querySelector('#tk-ratio').textContent = toks.length ? (chars / toks.length).toFixed(2) : '0';
      const css = PALETTE.map((c) => '#' + c.toString(16).padStart(6, '0'));
      el.querySelector('#tk-strip').innerHTML = toks
        .slice(0, 400)
        .map((t, i) => {
          const txt = t.partial ? `‹${t.hex}›` : t.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '↵');
          return `<span class="${t.partial ? 'partial' : ''}" style="background:${t.partial ? '#f87171' : css[i % css.length]}" title="ID ${t.id}${t.group ? ' · 组成：' + t.group : ''}">${txt}</span>`;
        })
        .join('');
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(update, 160);
    });
    sel.addEventListener('change', update);
    update();
    return () => clearTimeout(timer);
  }
}
