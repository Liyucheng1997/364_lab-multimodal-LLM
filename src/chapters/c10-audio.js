// 第 10 章 听觉：语音如何变成 token
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, flowPath, glassBox, magma, sphereGeo, roundedBoxGeo, unitBoxBase, rng } from '../core/kit.js';
import { makeTower, makeWaveTube } from '../core/props.js';
import { synthSpeech, melSpectrogram, play, record, SR } from '../core/audio.js';
import { AUDIO_SCHEMES, fmt } from '../core/tokenmath.js';

const WW = 12; // 时间轴长度（场景单位）
const WAVE_Y = 3.4;
const TER_D = 4.8; // 梅尔轴深度
const TER_H = 1.7;
const BUCKETS = 520;

export default class Audio extends Chapter {
  static meta = {
    id: 'audio',
    short: '听觉',
    title: '听觉：语音如何变成 token',
    subtitle: '声波 → 采样 → 频谱图 → 音频编码器 → token。也可以反过来：模型输出音频 token，再还原成声音。',
  };

  static steps = [
    {
      title: '声音 = 空气的振动',
      cam: [0, 4.2, 12.5, 0, 2.8, 0],
      html: `
        <p>说话时，声带振动推动空气，形成忽疏忽密的<b>声波</b>。麦克风把它记录成一条上下起伏的曲线——<b>波形</b>。</p>
        <p>图中是一段合成的"类语音"声音（约 2 秒）。点下方按钮可以<b>播放</b>，也可以<b>录一段你自己的声音</b>，后面每一步都会用它来演示。</p>
        <div class="note">录音只在你的浏览器本地处理，不会上传。</div>`,
    },
    {
      title: '采样：每秒 16,000 个数字',
      cam: [0, 3.0, 10.5, 0, 2.2, 1.0],
      html: `
        <p>计算机无法存储连续的曲线，只能每隔一小段时间<b>测一次</b>声波的高度——这叫<b>采样</b>。</p>
        <p>语音模型通常用 <b>16 kHz</b> 采样率：每秒测 16,000 次。前面的"棒棒糖"就是放大后的 5 毫秒，一共 80 个采样点。</p>
        <div class="key">1 分钟语音 = 960,000 个数字。直接当 token 显然太多了——需要先"浓缩"。</div>`,
    },
    {
      title: '频谱图：把声音拆成频率',
      cam: [0, 7.5, 11.5, 0, 0.8, 0.2],
      html: `
        <p>人耳听到的音高和音色，取决于声音里包含哪些<b>频率</b>。用<b>短时傅里叶变换</b>，可以算出每一小段时间里各个频率的能量。</p>
        <p>把结果画出来，就是一座"<b>声音山脉</b>"：</p>
        <ul>
          <li>左右方向：<b>时间</b>；</li>
          <li>前后方向：<b>频率</b>（前低后高）；</li>
          <li>高度/亮度：<b>能量</b>。</li>
        </ul>
        <p>元音部分能看到一条条平行的"山脊"——那是声带振动产生的<b>谐波</b>；"嘶嘶"的摩擦音则是高频区的一片雾。</p>`,
    },
    {
      title: '分帧 + 梅尔刻度',
      cam: [-2.5, 5.2, 9.5, -1.8, 1.0, 0],
      html: `
        <p>具体做法（以 Whisper 为例）：</p>
        <ul>
          <li>用 <b>25 毫秒</b>的窗口截取一小段，每次向后滑动 <b>10 毫秒</b>——每秒得到 100 帧；</li>
          <li>每帧的频率按<b>梅尔刻度</b>分成 80（或 128）个通道。</li>
        </ul>
        <p>梅尔刻度模仿人耳：我们对低频的变化很敏感（100Hz 和 200Hz 差别明显），对高频不敏感（7000Hz 和 7100Hz 几乎听不出）。所以低频分得细，高频分得粗。</p>
        <div class="formula">30 秒音频 → 3000 帧 × 80 个梅尔通道</div>`,
    },
    {
      title: '音频编码器：每 40 毫秒一个 token',
      cam: [0, 6.2, 12.5, 0, 1.6, 0],
      html: `
        <p>梅尔频谱接着送进<b>音频编码器</b>（例如 Whisper 的编码器，本身也是 Transformer）：</p>
        <ul>
          <li>开头的卷积层把时间分辨率减半：3000 帧 → <b>1500</b> 个向量（每个代表 20ms）；</li>
          <li>Qwen2-Audio 等模型再做一次池化：每个 token 约代表 <b>40ms</b>，即每秒 <b>25</b> 个音频 token。</li>
        </ul>
        <p>绿色方块就是这些音频 token。和图片一样，它们再经过投影器，进入 LLM 的嵌入空间，与文字 token 拼在一起。</p>
        <div class="key">这样的音频 token 是"连续向量"，适合<b>听懂</b>语音（转写、理解语气、识别声音事件）。</div>`,
    },
    {
      title: '离散音频 token：神经编解码器',
      cam: [0, 4.6, 12.5, 0, 2.2, 0],
      html: `
        <p>如果模型要<b>说话</b>（输出语音），通常需要<b>离散</b>的音频 token——由<b>神经音频编解码器</b>产生（如 EnCodec、SoundStream、Mimi）：</p>
        <ul>
          <li>编码器把每一小段音频压成一个向量（Mimi：每 80ms 一帧，即 12.5 帧/秒）；</li>
          <li>用<b>残差向量量化（RVQ）</b>把向量变成<b>多层编号</b>：第 1 层编号描述大致轮廓（含语义），之后每层只编码"上一层没说清的残差"，逐层补充细节；</li>
          <li>解码器能把这些编号<b>还原成声音</b>。</li>
        </ul>
        <div class="formula">Mimi：12.5 帧/秒 × 8 层码本 = 每秒 100 个编号
EnCodec(24kHz, 6kbps)：75 帧/秒 × 8 层 = 每秒 600 个编号</div>`,
    },
    {
      title: '端到端语音对话',
      cam: [0, 5.2, 15.5, 0, 2.4, 0],
      html: `
        <p>把两者合起来，就得到能"听"也能"说"的模型：</p>
        <ol>
          <li><span class="chip audio">输入</span> 你的语音 → 音频 token；</li>
          <li><span class="chip model">LLM</span> 理解并思考，生成回答；</li>
          <li><span class="chip text">输出</span> 文字 token，和/或 <span class="chip v">音频编码 token</span>；</li>
          <li>编解码器的<b>解码器</b>把音频 token 还原成声音。</li>
        </ol>
        <p>例如 Qwen2.5-Omni 采用 "Thinker（思考、出文字）+ Talker（出语音 token）" 结构；Kyutai 的 Moshi 同时建模文字流和多路音频流，实现边听边说。</p>
        <div class="note">传统的语音助手是"语音识别 → 文字 LLM → 语音合成"三段拼接；端到端模型能保留语气、情绪等文字之外的信息，延迟也更低。</div>`,
    },
    {
      title: '音频 Token 计算器',
      cam: [0, 4.4, 13, 0, 2.6, 0],
      html: `
        <p>音频的 token 数主要取决于<b>时长</b>，与说了多少字关系不大（静音也要算）。</p>
        <div id="aud-calc-table"></div>
        <div class="key">1 分钟语音，按每秒 25~50 个 token 算，约 1,500~3,000 个 token——和一篇几千字的文章处在同一量级。</div>
        <div class="note">各模型的具体编码方式不同；云端 API 的计费以官方文档为准（如 Gemini 文档给出每秒 32 个 token）。</div>`,
    },
  ];

  build() {
    this.samples = synthSpeech();
    this.isUser = false;
    this.calcSec = 60;
    this.waveG = new THREE.Group();
    this.zoomG = new THREE.Group();
    this.terrG = new THREE.Group();
    this.tokG = new THREE.Group();
    this.codecG = new THREE.Group();
    this.pipeG = new THREE.Group();
    this.calcG = new THREE.Group();
    this.add(this.waveG, this.zoomG, this.terrG, this.tokG, this.codecG, this.pipeG, this.calcG);
    this.rebuildAll();
    this.buildPipeline();
    this.buildCalc();
    hide(this.zoomG, this.terrG, this.tokG, this.codecG, this.pipeG, this.calcG);
  }

  clearGroup(g) {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
        if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    }
  }

  rebuildAll() {
    this.duration = this.samples.length / SR;
    this.mel = melSpectrogram(this.samples);
    this.buildWave();
    this.buildZoom();
    this.buildTerrain();
    this.buildTokens();
    this.buildCodec();
  }

  // ───────────── 波形 ─────────────
  buildWave() {
    const g = this.waveG;
    this.clearGroup(g);
    const geo = new THREE.BoxGeometry(1, 1, 0.06);
    const mesh = new THREE.InstancedMesh(geo, glowMat(C.audio, { glow: 0.9, dark: 0.5 }), BUCKETS);
    const per = this.samples.length / BUCKETS;
    const m4 = new THREE.Matrix4();
    const bw = (WW / BUCKETS) * 0.7;
    for (let b = 0; b < BUCKETS; b++) {
      let mx = 0;
      for (let i = Math.floor(b * per); i < Math.floor((b + 1) * per); i++) mx = Math.max(mx, Math.abs(this.samples[i] || 0));
      m4.compose(V3(-WW / 2 + (b + 0.5) * (WW / BUCKETS), WAVE_Y, 0), new THREE.Quaternion(), V3(bw, Math.max(0.02, mx * 2.6), 1));
      mesh.setMatrixAt(b, m4);
    }
    g.add(mesh);
    this.waveMesh = mesh;
    this.playhead = new THREE.Mesh(new THREE.BoxGeometry(0.04, 3.0, 0.08), glowMat(C.white, { glow: 1.5 }));
    this.playhead.position.set(-WW / 2, WAVE_Y, 0.05);
    this.playhead.visible = false;
    g.add(this.playhead);
    const t = label(`${this.isUser ? '你的录音' : '合成语音'} · ${this.duration.toFixed(1)} 秒`, 'tag audio', { anchor: 'top' });
    t.position.set(0, WAVE_Y - 1.6, 0);
    g.add(t);
    const ax = label('时间 →', 'dim', { anchor: 'left' });
    ax.position.set(WW / 2 + 0.2, WAVE_Y, 0);
    g.add(ax);
  }

  // ───────────── 采样点放大 ─────────────
  buildZoom() {
    const g = this.zoomG;
    this.clearGroup(g);
    // 找一段能量较大的浊音（周期性强）区域
    let best = 0;
    let bestE = 0;
    for (let i = 0; i + 80 < this.samples.length; i += 160) {
      let e = 0;
      for (let k = 0; k < 80; k++) e += this.samples[i + k] ** 2;
      if (e > bestE) {
        bestE = e;
        best = i;
      }
    }
    this.zoomStart = best;
    const N = 80;
    const DX = 0.1;
    let peak = 0;
    for (let k = 0; k < N; k++) peak = Math.max(peak, Math.abs(this.samples[best + k]));
    const amp = 1.0 / Math.max(peak, 1e-3);
    const stems = new THREE.InstancedMesh(unitBoxBase(), glowMat(C.audio, { glow: 0.7 }), N);
    const dots = new THREE.InstancedMesh(sphereGeo(0.045, 10), glowMat(C.q, { glow: 1.3 }), N);
    const m4 = new THREE.Matrix4();
    const pts = [];
    for (let k = 0; k < N; k++) {
      const v = this.samples[best + k] * amp;
      const x = -((N - 1) * DX) / 2 + k * DX;
      m4.compose(V3(x, 1.6, 2.2), new THREE.Quaternion(), V3(0.018, v || 0.001, 0.018));
      stems.setMatrixAt(k, m4);
      m4.compose(V3(x, 1.6 + v, 2.2), new THREE.Quaternion(), V3(1, 1, 1));
      dots.setMatrixAt(k, m4);
      pts.push(V3(x, 1.6 + v, 2.2));
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(N * DX, 0.015, 0.015), glowMat(C.gray, { glow: 0.5 }));
    base.position.set(0, 1.6, 2.2);
    g.add(stems, dots, base, flowPath(pts, { color: C.audio, radius: 0.012, base: 0.3, opacity: 0.6, tension: 0.5 }));
    const l = label('放大 5 毫秒：80 个采样点（每 1/16000 秒测一次）', 'tag audio', { anchor: 'top' });
    l.position.set(0, 0.35, 2.2);
    g.add(l);
    // 在波形上标出放大区域
    const x0 = -WW / 2 + (best / this.samples.length) * WW;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.06, (80 / this.samples.length) * WW), 2.8, 0.1), glowMat(C.q, { glow: 1.0, opacity: 0.45 }));
    mark.position.set(x0, WAVE_Y, 0.05);
    g.add(mark);
    g.add(flowPath([V3(x0, WAVE_Y - 1.4, 0.05), V3(x0 * 0.5, 2.6, 1.2), V3(0, 2.75, 2.2)], { color: C.q, radius: 0.02, base: 0.4 }));
  }

  // ───────────── 梅尔频谱"山脉" ─────────────
  buildTerrain() {
    const g = this.terrG;
    this.clearGroup(g);
    const { frames, nFrames, nMels } = this.mel;
    const geo = new THREE.PlaneGeometry(WW, TER_D, nFrames - 1, nMels - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const f = k % nFrames;
      const row = Math.floor(k / nFrames); // 0 = 最后排
      const m = row; // 后排 = 高频
      const v = frames[f][nMels - 1 - m] ?? 0;
      pos.setY(k, Math.pow(v, 1.6) * TER_H);
      magma(0.08 + v * 0.92, col);
      colors.set([col.r * 0.32, col.g * 0.32, col.b * 0.32], k * 3);
    }
    // 让前排是低频：上面 row=0 对应 z=-D/2（后排）→ 取 nMels-1-row，使后排为高频
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide, transparent: true });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 1.15;');
    };
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.position.y = 0.05;
    g.add(this.terrain);
    // 坐标标签
    const tl = label('时间 →', 'dim', { anchor: 'left' });
    tl.position.set(WW / 2 + 0.2, 0.1, TER_D / 2);
    const fl = label('频率（梅尔刻度）：前低后高', 'dim', { anchor: 'right' });
    fl.position.set(-WW / 2 - 0.2, 0.1, 0);
    g.add(tl, fl);
    // 梅尔刻度：几个频率的位置
    this.hzTags = [];
    for (const hz of [250, 500, 1000, 2000, 4000, 7000]) {
      let m = 0;
      while (m < nMels - 1 && this.mel.melHz(m) < hz) m++;
      const z = TER_D / 2 - (m / (nMels - 1)) * TER_D;
      const t = textPlane(hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`, 0.2, { color: '#fda4af', weight: 600 });
      t.rotation.x = -Math.PI / 2;
      t.position.set(-WW / 2 - 0.55, 0.06, z);
      g.add(t);
      const line = new THREE.Mesh(new THREE.BoxGeometry(WW, 0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0xfda4af, transparent: true, opacity: 0.25 }));
      line.position.set(0, 0.04, z);
      g.add(line);
      this.hzTags.push(t, line);
    }
    // 滑动窗口
    const winW = (0.025 / this.duration) * WW;
    this.win = new THREE.Mesh(new THREE.BoxGeometry(Math.max(winW, 0.06), 2.0, TER_D + 0.3), new THREE.MeshStandardMaterial({ color: C.q, emissive: C.q, emissiveIntensity: 0.6, transparent: true, opacity: 0.22, depthWrite: false }));
    this.win.position.set(-WW / 2, 1.0, 0);
    g.add(this.win);
    this.winLabel = label('25ms 窗口，每次滑动 10ms → 1 帧 = 80 个数', 'tag q', { anchor: 'bottom' });
    this.winLabel.position.set(0, 2.2, -TER_D / 2);
    g.add(this.winLabel);
  }

  // ───────────── 编码器输出的音频 token ─────────────
  buildTokens() {
    const g = this.tokG;
    this.clearGroup(g);
    const n = Math.max(1, Math.floor(this.mel.nFrames / 4));
    this.nTok = n;
    const sp = WW / n;
    const s = Math.min(0.24, sp * 0.82);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.4, transparent: true });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.55;');
    };
    this.tokMesh = new THREE.InstancedMesh(roundedBoxGeo(s, s, s, Math.min(0.05, s / 3)), mat, n);
    this.tokMesh.frustumCulled = false;
    const col = new THREE.Color();
    this.tokHome = [];
    for (let i = 0; i < n; i++) {
      // 亮度跟随该段能量
      let e = 0;
      for (let f = i * 4; f < i * 4 + 4; f++) e += this.mel.frames[f]?.reduce((a, b) => a + b, 0) || 0;
      e /= 4 * this.mel.nMels;
      col.set(C.audio).multiplyScalar(0.35 + e * 1.1);
      this.tokMesh.setColorAt(i, col);
      this.tokHome.push(V3(-WW / 2 + (i + 0.5) * sp, 2.75, 0));
    }
    this.tokMesh.instanceColor.needsUpdate = true;
    this.tokT = { t: 1 };
    this.placeTokens(1);
    g.add(this.tokMesh);
    this.tokLabel = label(`${this.duration.toFixed(1)} 秒 → ${this.mel.nFrames} 帧 → 编码器 → <b>${n}</b> 个音频 token（每个 ≈ 40ms）`, 'tag audio', { anchor: 'bottom' });
    this.tokLabel.position.set(0, 3.3, 0);
    g.add(this.tokLabel);
    this.tokEnc = glassBox(WW + 0.6, 0.5, TER_D + 0.4, { color: C.audio, opacity: 0.025, edge: 0.5, glow: 0.08 });
    this.tokEnc.position.set(0, 2.05, 0);
    g.add(this.tokEnc);
    const el = label('音频编码器（Transformer）+ 池化', 'tag audio', { anchor: 'right' });
    el.position.set(-WW / 2 - 0.4, 2.05, 0);
    g.add(el);
  }
  placeTokens(t) {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < this.nTok; i++) {
      const k = Math.min(1, Math.max(0, t * 1.6 - (i / this.nTok) * 0.6));
      const p = V3(this.tokHome[i].x, 0.8 + (this.tokHome[i].y - 0.8) * k, 0);
      m4.compose(p, q, V3(1, 1, 1).multiplyScalar(0.01 + k * 0.99));
      this.tokMesh.setMatrixAt(i, m4);
    }
    this.tokMesh.instanceMatrix.needsUpdate = true;
  }

  // ───────────── 编解码器：RVQ 多层编号 ─────────────
  buildCodec() {
    const g = this.codecG;
    this.clearGroup(g);
    const frames = Math.max(1, Math.round(this.duration * 12.5));
    const LAYERS = 8;
    const sp = WW / frames;
    const s = Math.min(0.36, sp * 0.8);
    this.codecCols = frames;
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.4, transparent: true });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.6;');
    };
    const mesh = new THREE.InstancedMesh(roundedBoxGeo(s, 0.3, s, 0.05), mat, frames * LAYERS);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    const R = rng(77);
    this.codecIds = [];
    for (let f = 0; f < frames; f++) {
      // 用该时刻的频谱能量决定"第 1 层"编号，让相似的声音得到相近的颜色
      const fi = Math.min(this.mel.nFrames - 1, Math.round((f / frames) * this.mel.nFrames));
      const fr = this.mel.frames[fi];
      let cen = 0;
      let tot = 0;
      fr.forEach((v, m) => {
        cen += v * m;
        tot += v;
      });
      const ids = [];
      for (let l = 0; l < LAYERS; l++) {
        const id = l === 0 ? Math.round((cen / Math.max(tot, 1e-3) / this.mel.nMels) * 2047) : Math.floor(R() * 2048);
        ids.push(id);
        const hue = l === 0 ? 0.55 + (id / 2048) * 0.5 : (id / 2048) % 1;
        col.setHSL(hue % 1, l === 0 ? 0.85 : 0.6, l === 0 ? 0.6 : 0.42 - l * 0.02);
        m4.compose(V3(-WW / 2 + (f + 0.5) * sp, 0.45 + l * 0.4, 0), new THREE.Quaternion(), V3(1, 1, 1));
        mesh.setMatrixAt(f * LAYERS + l, m4);
        mesh.setColorAt(f * LAYERS + l, col);
      }
      this.codecIds.push(ids);
    }
    mesh.instanceColor.needsUpdate = true;
    g.add(mesh);
    this.codecMesh = mesh;
    const l1 = label('第 1 层：大致轮廓（含语义）', 'tag audio', { anchor: 'right' });
    l1.position.set(-WW / 2 - 0.3, 0.45, 0);
    const l2 = label('第 2~8 层：逐层补充细节（残差）', 'tag', { anchor: 'right' });
    l2.position.set(-WW / 2 - 0.3, 0.45 + 4 * 0.4, 0);
    const t = label(`${this.duration.toFixed(1)} 秒 × 12.5 帧/秒 = ${frames} 帧；每帧 8 个编号（0~2047）`, 'tag', { anchor: 'bottom' });
    t.position.set(0, 0.45 + 8 * 0.4 + 0.2, 0);
    const ids = label(`第 1 帧的编号：[${this.codecIds[0].join(', ')}]`, 'dim mono', { anchor: 'top' });
    ids.position.set(0, 0.0, 0.6);
    g.add(l1, l2, t, ids);
  }

  // ───────────── 端到端流水线 ─────────────
  buildPipeline() {
    const g = this.pipeG;
    const mic = label('🎤 你的语音', 'tag audio', { anchor: 'bottom' });
    mic.position.set(-8.6, 2.6, 0);
    const wav = makeWaveTube({ width: 2.4, height: 0.5, seed: 5 });
    wav.position.set(-8.6, 1.6, 0);
    g.add(mic, wav);
    const mkRow = (n, x0, y, color, s = 0.28) =>
      Array.from({ length: n }, (_, i) => {
        const b = new TokenBlock('', { color, minW: s, w: s, h: s, d: s, glow: 0.5 });
        b.position.set(x0 + i * (s + 0.06), y, 0);
        g.add(b);
        return b;
      });
    this.pipeIn = mkRow(8, -6.6, 1.6, C.audio);
    const tower = makeTower({ layers: 6, w: 3.0, d: 2.2, gap: 0.55, y0: 0.8, title: 'LLM', sub: '理解 + 思考' });
    tower.position.set(-1.0, 0, 0);
    g.add(tower);
    this.pipeTower = tower;
    const textOut = ['这', '是', '一只', '猫'].map((t, i) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.5, h: 0.46, d: 0.24, textH: 0.26 });
      b.position.set(2.4 + i * 0.66, 3.6, 0);
      g.add(b);
      return b;
    });
    this.pipeText = textOut;
    const codec = [];
    for (let f = 0; f < 6; f++) {
      for (let l = 0; l < 4; l++) {
        const b = new TokenBlock('', { color: C.v, minW: 0.24, w: 0.24, h: 0.2, d: 0.24, glow: 0.35 + (l === 0 ? 0.3 : 0) });
        b.position.set(2.4 + f * 0.34, 0.6 + l * 0.26, 0);
        g.add(b);
        codec.push(b);
      }
    }
    this.pipeCodec = codec;
    const tl = label('文字 token（可显示字幕）', 'tag text', { anchor: 'bottom' });
    tl.position.set(3.4, 4.0, 0);
    const cl = label('音频编码 token', 'tag v', { anchor: 'top' });
    cl.position.set(3.2, 0.3, 0);
    const dec = glassBox(1.2, 1.4, 1.2, { color: C.v, opacity: 0.15, edge: 0.8, glow: 0.5 });
    dec.position.set(5.7, 1.1, 0);
    const dl = label('解码器', 'tag v', { anchor: 'top' });
    dl.position.set(5.7, 0.2, 0);
    const out = makeWaveTube({ width: 2.0, height: 0.45, seed: 9, color: C.v });
    out.position.set(7.8, 1.1, 0);
    const sp = label('🔊 语音回答', 'tag v', { anchor: 'bottom' });
    sp.position.set(7.8, 2.0, 0);
    g.add(tl, cl, dec, dl, out, sp);
    g.add(flowPath([V3(-7.3, 1.6, 0), V3(-6.8, 1.6, 0)], { color: C.audio, radius: 0.04 }));
    g.add(flowPath([V3(-4.1, 1.6, 0), V3(-3.0, 1.4, 0)], { color: C.audio, radius: 0.04 }));
    g.add(flowPath([V3(0.6, 3.4, 0), V3(1.4, 3.6, 0), V3(2.1, 3.6, 0)], { color: C.text, radius: 0.04 }));
    g.add(flowPath([V3(0.6, 1.0, 0), V3(1.4, 0.95, 0), V3(2.1, 1.0, 0)], { color: C.v, radius: 0.04 }));
    g.add(flowPath([V3(4.3, 1.0, 0), V3(5.1, 1.1, 0)], { color: C.v, radius: 0.04 }));
    g.add(flowPath([V3(6.3, 1.1, 0), V3(6.8, 1.1, 0)], { color: C.v, radius: 0.04 }));
  }

  // ───────────── 计算器柱状图 ─────────────
  buildCalc() {
    const g = this.calcG;
    this.calcBars = AUDIO_SCHEMES.map((s, i) => {
      const grp = new THREE.Group();
      grp.position.set(-4.4 + i * 2.2, 0, 0);
      const m = new THREE.Mesh(unitBoxBase(), glowMat([C.audio, C.green, C.k, C.v, C.pink][i], { glow: 0.6 }));
      m.scale.set(1.0, 0.1, 1.0);
      const v = label('', 'pct', { anchor: 'bottom' });
      const n = label(`${s.name}<br><span class="lbl tiny">${s.perSec} token/秒</span>`, 'tag', { anchor: 'top' });
      n.position.set(0, -0.15, 0.6);
      grp.add(m, v, n);
      grp.userData = { m, v, s };
      g.add(grp);
      return grp;
    });
    this.calcTitle = label('', 'title', { anchor: 'bottom' });
    this.calcTitle.position.set(0, 6.2, 0);
    g.add(this.calcTitle);
  }
  updateCalc(animate = true) {
    const sec = this.calcSec;
    const maxLog = Math.log10(600 * 3600 + 1);
    this.calcBars.forEach((grp) => {
      const { m, v, s } = grp.userData;
      const n = s.perSec * sec;
      const h = 0.15 + (Math.log10(n + 1) / maxLog) * 5.2;
      if (animate) this.tw(m.scale, { y: h, duration: 0.5 });
      else m.scale.y = h;
      this.tw(v.position, { y: h + 0.1, duration: animate ? 0.5 : 0 });
      v.setHTML(fmt(n));
    });
    const durTxt = sec >= 60 ? `${(sec / 60).toFixed(sec % 60 ? 1 : 0)} 分钟` : `${sec} 秒`;
    this.calcTitle.setHTML(`${durTxt}音频的 token 数（柱高为对数刻度）`);
    const tbl = document.getElementById('aud-calc-table');
    if (tbl)
      tbl.innerHTML = `<table class="mini"><tr><th>方案（${durTxt}）</th><th>token</th></tr>${AUDIO_SCHEMES.map((s) => `<tr><td>${s.name}<br><small style="color:#64748b">${s.note}</small></td><td class="num">${fmt(s.perSec * sec)}</td></tr>`).join('')}</table>`;
  }

  // ───────────── 步骤 ─────────────
  go(step) {
    const tl = this.tl;
    this.fade(this.waveG, step <= 1 ? 1 : 0, 0, 0.5);
    this.fade(this.zoomG, step === 1 ? 1 : 0, step === 1 ? 0.4 : 0, 0.5);
    this.fade(this.terrG, step >= 2 && step <= 4 ? 1 : 0, step === 2 ? 0.3 : 0, 0.6);
    this.fade(this.tokG, step === 4 ? 1 : 0, 0, 0.5);
    this.fade(this.codecG, step === 5 ? 1 : 0, step === 5 ? 0.3 : 0, 0.5);
    this.fade(this.pipeG, step === 6 ? 1 : 0, step === 6 ? 0.3 : 0, 0.5);
    this.fade(this.calcG, step === 7 ? 1 : 0, step === 7 ? 0.3 : 0, 0.5);
    const winOn = step === 3;
    this.fade(this.win, winOn ? 1 : 0, 0, 0.3);
    this.fade(this.winLabel, winOn ? 1 : 0, 0, 0.3);
    this.hzTags.forEach((t) => this.fade(t, step === 3 ? 1 : 0, 0, 0.3));
    if (step === 2) {
      tl.fromTo(this.terrain.scale, { y: 0.01 }, { y: 1, duration: 1.6, ease: 'power2.out' }, 0.4);
    } else if (step >= 3 && step <= 4) {
      tl.to(this.terrain.scale, { y: 1, duration: 0.4 }, 0);
    }
    if (step === 3) {
      const hopW = (0.01 / this.duration) * WW;
      tl.set(this.win.position, { x: -WW / 2 + 0.1 }, 0);
      tl.to(this.win.position, { x: -WW / 2 + 0.1 + hopW * 60, duration: 6, ease: `steps(60)`, repeat: -1, repeatDelay: 0.5 }, 0.6);
    }
    if (step === 4) {
      tl.set(this.tokT, { t: 0 }, 0);
      tl.call(() => this.placeTokens(0), null, 0);
      tl.to(this.tokT, { t: 1, duration: 2.2, ease: 'power1.inOut', onUpdate: () => this.placeTokens(this.tokT.t) }, 0.6);
      tl.to(this.terrain, { opacity: 0.5, duration: 0.8 }, 1.0);
    } else {
      tl.to(this.terrain, { opacity: 1, duration: 0.3 }, 0);
    }
    if (step === 5) {
      tl.fromTo(this.codecMesh.scale, { y: 0.01 }, { y: 1, duration: 1.0, ease: 'back.out(1.4)' }, 0.5);
    }
    if (step === 6) {
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 1 });
      this.pipeIn.forEach((b, i) => loop.fromTo(b.box.material, { emissiveIntensity: 1.6 }, { emissiveIntensity: 0.5, duration: 0.5 }, 0.2 + i * 0.08));
      const end = this.pipeTower.pulse(loop, 1.0, 0.08);
      this.pipeText.forEach((b, i) => loop.fromTo(b.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'back.out(2)' }, end + i * 0.25));
      this.pipeCodec.forEach((b, i) => loop.fromTo(b.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.3 }, end + 0.2 + Math.floor(i / 4) * 0.25 + (i % 4) * 0.04));
      loop.to({}, { duration: 1.5 }, end + 2.2);
      tl.add(loop, 0.5);
    }
    if (step === 7) tl.call(() => this.updateCalc(true), null, 0.3);
  }

  widget(step, el) {
    if (step <= 5) {
      el.innerHTML = `
        <div class="w-title">声音</div>
        <div class="w-btns">
          <button class="w-btn primary" id="au-play">▶ 播放</button>
          <button class="w-btn" id="au-rec">🎤 录 3 秒我的声音</button>
          ${this.isUser ? '<button class="w-btn" id="au-reset">↺ 换回合成语音</button>' : ''}
        </div>
        <div class="w-small" id="au-msg">${this.isUser ? '当前使用：你的录音' : '当前使用：合成的"类语音"声音'}</div>`;
      el.querySelector('#au-play').onclick = () => {
        const h = play(this.samples);
        this.playing = h;
      };
      el.querySelector('#au-rec').onclick = async () => {
        const btn = el.querySelector('#au-rec');
        const msg = el.querySelector('#au-msg');
        btn.disabled = true;
        try {
          const data = await record(3, (t) => (msg.textContent = `录音中… ${t.toFixed(1)} / 3.0 秒`));
          this.samples = data;
          this.isUser = true;
          this.rebuildAll();
          this.app.toast('已使用你的录音重新计算波形、频谱和 token');
          this.app.open(9, this.step);
        } catch (e) {
          msg.textContent = '录音失败：' + (e.message || e.name) + '（需要允许麦克风权限）';
          btn.disabled = false;
        }
      };
      el.querySelector('#au-reset')?.addEventListener('click', () => {
        this.samples = synthSpeech();
        this.isUser = false;
        this.rebuildAll();
        this.app.open(9, this.step);
      });
      return () => this.playing?.stop?.();
    }
    if (step === 7) {
      const steps = [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600];
      const idx = Math.max(0, steps.indexOf(this.calcSec));
      el.innerHTML = `
        <div class="w-title">音频时长</div>
        <div class="w-row"><label>时长</label><input type="range" id="dur" min="0" max="${steps.length - 1}" step="1" value="${idx}"><output id="durv"></output></div>`;
      const r = el.querySelector('#dur');
      const upd = () => {
        this.calcSec = steps[Number(r.value)];
        el.querySelector('#durv').textContent = this.calcSec >= 60 ? `${this.calcSec / 60} 分钟` : `${this.calcSec} 秒`;
        this.updateCalc(true);
      };
      r.addEventListener('input', upd);
      upd();
      return null;
    }
    return null;
  }

  update(dt, t) {
    if (this.playing && this.playhead) {
      const p = (performance.now() - this.playing.startedAt) / 1000 / this.playing.duration;
      if (p >= 0 && p <= 1) {
        this.playhead.visible = this.waveG.visible;
        this.playhead.position.x = -WW / 2 + p * WW;
      } else {
        this.playhead.visible = false;
        if (p > 1) this.playing = null;
      }
    }
  }

  onDispose() {
    this.playing?.stop?.();
  }
}
