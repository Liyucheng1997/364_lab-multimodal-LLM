// 第 9 章 视觉：图片如何变成 token
import * as THREE from 'three';
import gsap from 'gsap';
import { Chapter } from '../core/chapter.js';
import { C, TokenBlock, label, textPlane, V3, hide, glowMat, beam, flowPath, glassBox, rng, roundedBoxGeo } from '../core/kit.js';
import { makeTower } from '../core/props.js';
import { drawScene, loadImageFile, canvasTexture } from '../core/imagegen.js';
import { IMAGE_SCHEMES, fmt } from '../core/tokenmath.js';

const N = 14; // 每边 patch 数（224 / 16）
const NP = N * N;
const PS = 0.4; // patch 在场景中的边长
const IMG_Y = 3.4;
const CUBE = 0.3;
const VG = 0.42; // ViT 网格间距
const ZOOM_R = 9;
const ZOOM_C = 6;

const ease = gsap.parseEase('power2.inOut');

/** 管理一个 InstancedMesh 的位置/缩放，并支持带错峰的补间 */
class InstAnim {
  constructor(mesh, n) {
    this.mesh = mesh;
    this.n = n;
    this.pos = Array.from({ length: n }, () => new THREE.Vector3());
    this.scl = Array.from({ length: n }, () => new THREE.Vector3(1, 1, 1));
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
  }
  set(fn) {
    for (let i = 0; i < this.n; i++) {
      const r = fn(i);
      this.pos[i].copy(r.p);
      this.scl[i].setScalar(r.s ?? 1);
    }
    this.apply();
  }
  apply() {
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.m4.compose(this.pos[i], this.q, this.scl[i]));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** 在时间轴 tl 的 at 时刻开始，从当前状态补间到 fn(i) */
  to(tl, at, fn, { duration = 1, stagger = 0.6, order = (i) => i / Math.max(1, this.n - 1) } = {}) {
    const st = { t: 0 };
    let from = null;
    let fromS = null;
    const tgt = Array.from({ length: this.n }, (_, i) => fn(i));
    const total = duration + stagger;
    tl.to(
      st,
      {
        t: 1,
        duration: total,
        ease: 'none',
        onStart: () => {
          from = this.pos.map((p) => p.clone());
          fromS = this.scl.map((s) => s.clone());
        },
        onUpdate: () => {
          if (!from) return;
          const now = st.t * total;
          for (let i = 0; i < this.n; i++) {
            const k = Math.min(1, Math.max(0, (now - order(i) * stagger) / duration));
            const e = ease(k);
            this.pos[i].lerpVectors(from[i], tgt[i].p, e);
            const s = tgt[i].s ?? 1;
            this.scl[i].set(fromS[i].x + (s - fromS[i].x) * e, fromS[i].y + (s - fromS[i].y) * e, fromS[i].z + (s - fromS[i].z) * e);
          }
          this.apply();
        },
      },
      at
    );
  }
}

const L = {
  grid: (i) => V3(((i % N) - 6.5) * PS, IMG_Y + (6.5 - Math.floor(i / N)) * PS, 0),
  explode: (i) => V3(((i % N) - 6.5) * PS * 1.34, IMG_Y + (6.5 - Math.floor(i / N)) * PS * 1.34, Math.sin(i * 12.9898) * 0.22),
  // 196 个 token 排成一条序列（卷成螺旋，方便在屏幕里看全）
  line: (i) => {
    const a = -Math.PI / 2 - (i / NP) * Math.PI * 2 * 3.2;
    return V3(Math.cos(a) * 3.9, 0.7 + i * 0.019, -Math.sin(a) * 3.9 - 0.6);
  },
  vit: (i) => V3(((i % N) - 6.5) * VG, IMG_Y + 0.2 + (6.5 - Math.floor(i / N)) * VG, 0.3),
};
const mergedPos = (k) => {
  const R = Math.floor(k / 7);
  const Cc = k % 7;
  return V3((2 * Cc + 0.5 - 6.5) * VG, IMG_Y + 0.2 + (6.5 - (2 * R + 0.5)) * VG, 0.3);
};
const SEQ_X0 = -6.9;
const SEQ_DX = 0.235;
const seqPos = (k) => V3(SEQ_X0 + k * SEQ_DX, 0.55, 1.2);

export default class Vision extends Chapter {
  static meta = {
    id: 'vision',
    short: '视觉',
    title: '视觉：图片如何变成 token',
    subtitle: '把图片切成小方块，每块变成一个向量，再"翻译"进语言模型的空间——图片就成了一串 token。',
  };

  static steps = [
    {
      title: '图片 = 一大张数字表',
      cam: [2.0, 4.2, 13.8, 1.0, 2.6, -0.4],
      html: `
        <p>对计算机来说，一张图片就是一个<b>数字矩阵</b>：每个像素由红、绿、蓝（RGB）三个 0~255 的数组成。</p>
        <p>一张 224×224 的小图，就有 224 × 224 × 3 = <b>150,528</b> 个数字；一张 4000 万像素的手机照片则有上亿个。</p>
        <p>右边是把图片中一个 16×16 的小方块"放大"：每根柱子是一个像素，颜色是它本身的颜色，高度是亮度。</p>
        <div class="key">如果把每个像素都当成一个 token，序列会长到无法计算。所以第一步是<b>"打包"</b>：把相邻像素合成一块。</div>
        <p class="note">可以在下方上传你自己的图片，后续每一步都会用它来演示。</p>`,
    },
    {
      title: '切块：Patch',
      cam: [0.6, 4.4, 12.5, 0, 3.3, 0],
      html: `
        <p>视觉 Transformer（<b>ViT</b>）的做法非常直接：把图片切成一个个<b>固定大小的小方块</b>（patch），比如 16×16 像素。</p>
        <p>224×224 的图片，每边切 14 刀，得到 <b>14 × 14 = 196</b> 个 patch。</p>
        <div class="analogy">就像把一幅拼图拆成 196 块。每一块就是图像里的一个"词"。</div>
        <div class="note">不同模型的 patch 大小不同：ViT-B/16 用 16 像素，CLIP ViT-L/14 和 Qwen2-VL 用 14 像素。</div>`,
    },
    {
      title: '展平 + 线性投影：每块变成一个向量',
      cam: [0, 7.2, 12.5, 0, 2.0, -0.4],
      html: `
        <p>196 个 patch 按"从左到右、从上到下"的顺序<b>排成一列</b>——图像变成了一个序列，就像一句话。</p>
        <p>每个 patch 有 16 × 16 × 3 = <b>768</b> 个数，经过一个<b>线性层</b>（矩阵乘法）变成一个向量，这就是<b>图像 token</b>（橙色方块）。</p>
        <p>和文字一样，还要加上<b>位置编码</b>——不过这次是二维的：记录每块在第几行、第几列。</p>
        <div class="key">对比文字：分词器把文字切成 token → 嵌入表查出向量；视觉这边是"切 patch → 线性层算出向量"。</div>`,
    },
    {
      title: '视觉编码器：patch 之间互相"看"',
      cam: [0.4, 4.6, 12.2, 0, 3.4, 0],
      html: `
        <p>图像 token 接着进入<b>视觉编码器</b>——它本身就是一个 Transformer（例如 24 层的 ViT）。</p>
        <p>通过注意力，每个 patch 都能"看到"其它 patch：猫耳朵所在的 patch 会关注猫脸、猫身，于是它"知道"自己是一只猫的一部分。</p>
        <div class="note">常用的视觉编码器（如 CLIP、SigLIP）事先在数亿对"图片-文字"上训练过：让图片向量和对应描述的文字向量在空间中靠近。所以它输出的向量天然带有"语义"。</div>`,
    },
    {
      title: '压缩与投影：翻译成 LLM 的"语言"',
      cam: [0.4, 4.6, 12.2, 0, 3.4, 0],
      html: `
        <p>两件事：</p>
        <ul>
          <li><b>压缩</b>：图片 token 太多会占满上下文、拖慢速度。Qwen2-VL 把相邻的 <b>2×2</b> 个 token 合并成 1 个（本例 196 → 49）；也有模型用 Q-Former / Resampler 压到固定的 32 或 64 个。</li>
          <li><b>投影</b>：视觉编码器的向量和 LLM 的词向量"说的不是一种语言"。一个小小的<b>投影器</b>（通常是 2 层 MLP）负责把它们映射到 LLM 的嵌入空间。</li>
        </ul>
        <div class="key">投影之后，在 LLM 眼里，这 49 个向量就像 49 个"外语单词"——它不知道它们来自图片，只知道它们携带着某些含义。</div>`,
    },
    {
      title: '和文字拼在一起，送进 LLM',
      cam: [0.2, 6.2, 15.5, 0.2, 2.2, -1.5],
      html: `
        <p>图像 token 用特殊标记（如 <span class="chip pink">&lt;img&gt;</span> … <span class="chip pink">&lt;/img&gt;</span>）包起来，和你的问题拼成<b>一条序列</b>：</p>
        <div class="formula">&lt;img&gt; [49 个图像 token] &lt;/img&gt; 图里 有 什么 ？</div>
        <p>LLM 像处理普通文字一样处理整条序列：文字 token 通过注意力去"看"图像 token，然后一个字一个字地生成回答。</p>
        <div class="note">这就是 LLaVA、Qwen-VL、InternVL 等主流开源多模态模型的基本结构："视觉编码器 + 投影器 + LLM"。GPT-4o、Gemini、Claude 等闭源模型的内部细节未完全公开。</div>`,
    },
    {
      title: '另一条路：离散的"视觉单词"',
      cam: [2.2, 4.2, 12.5, 1.6, 3.3, 0],
      html: `
        <p>上面的图像 token 是<b>连续向量</b>，适合"看图理解"。如果还想让模型<b>画图</b>，一种思路是把图像也变成<b>离散的编号</b>：</p>
        <ul>
          <li>训练一个<b>码本（codebook）</b>：几千到几万个"标准小图块"；</li>
          <li>每个 patch 找码本里<b>最像</b>的那一项，用它的编号代替（右侧色块就是一个 16 项的迷你码本）；</li>
          <li>图片于是变成一串整数——和文字 token 一模一样，模型可以像写字一样"写"出图片。</li>
        </ul>
        <div class="note">这类方法叫 VQ（向量量化），Chameleon、Emu3 等模型采用了类似思路。真实码本项是带纹理的小图块，这里用纯色示意。</div>`,
    },
    {
      title: '图片 Token 计算器',
      cam: [0, 3.6, 11.5, 0, 3.2, 0],
      html: `
        <p>不同厂商的计费规则不同，但核心思路一样：<b>图片越大、像素越多，token 越多</b>；超过上限会被先缩小。</p>
        <div id="img-calc-table"></div>
        <div class="key">实用建议：如果不需要看清细节，把图片缩小再发送，能省下大量 token。例如一张 1920×1080 的截图，在标准分辨率的 Claude 上约 1,560 个 token；缩到 960×540 约只要 700 个。</div>
        <div class="note">以上为按公开文档实现的估算，厂商可能调整规则；准确数字以 API 返回的 usage 为准。</div>`,
    },
  ];

  build() {
    this.canvas = drawScene(448);
    this.origW = 1920;
    this.origH = 1080;
    this.calcW = 1920;
    this.calcH = 1080;
    this.scheme = 'claude';
    this.tex = canvasTexture(this.canvas);
    this.buildImage();
    this.buildPatches();
    this.buildCubes();
    this.buildMerged();
    this.buildSequence();
    this.buildCodebook();
    this.buildCalc();
    this.computeColors();
  }

  // ───────────── 原图 + RGB 分层 + 像素放大 ─────────────
  buildImage() {
    const g = (this.imgG = new THREE.Group());
    const S = N * PS;
    this.imgPlane = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, side: THREE.DoubleSide, color: 0xdcdcdc }));
    this.imgPlane.position.set(0, IMG_Y, 0);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(S + 0.08, S + 0.08)), new THREE.LineBasicMaterial({ color: C.image, transparent: true }));
    frame.position.copy(this.imgPlane.position);
    g.add(this.imgPlane, frame);
    this.imgCaption = label('224 × 224 像素 × RGB 3 个通道', 'tag image', { anchor: 'top' });
    this.imgCaption.position.set(0, IMG_Y - S / 2 - 0.2, 0);
    g.add(this.imgCaption);
    // RGB 三层
    const chan = (mask) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { map: { value: this.tex }, uMask: { value: new THREE.Vector3(...mask) }, uOpacity: { value: 0.85 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D map; uniform vec3 uMask; uniform float uOpacity; varying vec2 vUv;
          void main(){ vec3 c = texture2D(map, vUv).rgb; float v = dot(c, uMask); gl_FragColor = vec4(uMask * v * 1.1, uOpacity); }`,
      });
    this.rgb = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ].map((m, k) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(S, S), chan(m));
      p.position.set(0, IMG_Y, -0.02 * (k + 1));
      g.add(p);
      return p;
    });
    this.rgbLabels = ['R 红色通道', 'G 绿色通道', 'B 蓝色通道'].map((t, k) => {
      const l = label(t, ['tag red', 'tag green', 'tag k'][k], { anchor: 'bottom' });
      this.rgb[k].add(l);
      l.position.set(0, S / 2 + 0.1, 0);
      return l;
    });
    // 像素放大：16×16 根柱子
    this.zoomG = new THREE.Group();
    this.zoomG.position.set(5.6, 0.05, 0.6);
    const geo = new THREE.BoxGeometry(0.16, 1, 0.16);
    geo.translate(0, 0.5, 0);
    this.zoomMesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.5, color: 0x555555 }), 256);
    this.zoomMesh.material.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.42;');
    };
    this.zoomG.add(this.zoomMesh);
    const zl = label('放大一个 16×16 的 patch<br><span class="lbl tiny">256 个像素 × 3 = 768 个数字</span>', 'tag image', { anchor: 'bottom' });
    zl.position.set(0, 2.2, 0);
    this.zoomG.add(zl);
    // 指示框 + 连线
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PS, PS)), new THREE.LineBasicMaterial({ color: 0xfde047, transparent: true }));
    box.position.copy(L.grid(ZOOM_R * N + ZOOM_C)).add(V3(0, 0, 0.02));
    this.zoomBox = box;
    this.zoomLink = flowPath([box.position.clone(), V3(3.2, 2.4, 0.4), V3(5.0, 1.5, 0.6)], { color: C.q, radius: 0.025, base: 0.5 });
    g.add(this.zoomG, box, this.zoomLink);
    this.add(g);
  }

  // ───────────── patch 实例 ─────────────
  buildPatches() {
    const geo = new THREE.PlaneGeometry(PS * 0.97, PS * 0.97);
    const uvOff = new Float32Array(NP * 2);
    for (let i = 0; i < NP; i++) {
      uvOff[i * 2] = (i % N) / N;
      uvOff[i * 2 + 1] = 1 - (Math.floor(i / N) + 1) / N;
    }
    geo.setAttribute('aUvOff', new THREE.InstancedBufferAttribute(uvOff, 2));
    this.quantAttr = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3);
    geo.setAttribute('aQ', this.quantAttr);
    this.patchMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: { map: { value: this.tex }, uOpacity: { value: 1 }, uQuant: { value: 0 } },
      vertexShader: `attribute vec2 aUvOff; attribute vec3 aQ; varying vec2 vUv; varying vec3 vQ;
        void main(){ vUv = aUvOff + uv / ${N.toFixed(1)}; vQ = aQ; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float uOpacity; uniform float uQuant; varying vec2 vUv; varying vec3 vQ;
        void main(){ vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(mix(c, vQ, uQuant) * 0.86, uOpacity); }`,
    });
    this.patches = new THREE.InstancedMesh(geo, this.patchMat, NP);
    this.patches.frustumCulled = false;
    this.pAnim = new InstAnim(this.patches, NP);
    this.pAnim.set((i) => ({ p: L.grid(i) }));
    this.patchLabel = label('', 'tag image', { anchor: 'bottom' });
    this.add(this.patches, this.patchLabel);
    hide(this.patches, this.patchLabel);
  }

  // ───────────── 图像 token（橙色方块） ─────────────
  buildCubes() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.35, metalness: 0.1, transparent: true });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.5;');
    };
    this.cubes = new THREE.InstancedMesh(roundedBoxGeo(CUBE, CUBE, CUBE, 0.05), mat, NP);
    this.cubes.frustumCulled = false;
    this.cAnim = new InstAnim(this.cubes, NP);
    this.cAnim.set((i) => ({ p: L.grid(i), s: 1 }));
    this.add(this.cubes);
    hide(this.cubes);
    // ViT 编码器外壳与注意力连线
    this.vitBox = glassBox(N * VG + 0.6, N * VG + 0.6, 1.4, { color: C.image, opacity: 0.06, edge: 0.5, glow: 0.3 });
    this.vitBox.position.set(0, IMG_Y + 0.2, 0.3);
    this.vitLabel = label('视觉编码器 ViT（24 层 Transformer）', 'tag image', { anchor: 'bottom' });
    this.vitLabel.position.set(0, IMG_Y + 0.2 + (N * VG) / 2 + 0.45, 0.3);
    this.vitBeams = new THREE.Group();
    const R = rng(21);
    const ear = 2 * N + 5;
    for (let k = 0; k < 16; k++) {
      const a = k < 8 ? ear : Math.floor(R() * NP);
      const b = Math.floor(R() * NP);
      if (a === b) continue;
      this.vitBeams.add(beam(L.vit(a).add(V3(0, 0, 0.3)), L.vit(b).add(V3(0, 0, 0.3)), { height: 0.6, radius: 0.02, color: C.image, opacity: 0.9, base: 0.2, speed: -0.8 }));
    }
    this.add(this.vitBox, this.vitLabel, this.vitBeams);
    hide(this.vitBox, this.vitLabel, this.vitBeams);
  }

  // ───────────── 2×2 合并后的 49 个 token ─────────────
  buildMerged() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.35, metalness: 0.1, transparent: true });
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * 0.5;');
    };
    this.merged = new THREE.InstancedMesh(roundedBoxGeo(0.62, 0.62, 0.36, 0.08), mat, 49);
    this.merged.frustumCulled = false;
    this.mAnim = new InstAnim(this.merged, 49);
    this.mAnim.set((k) => ({ p: mergedPos(k), s: 1 }));
    const col = new THREE.Color(C.image);
    for (let k = 0; k < 49; k++) this.merged.setColorAt(k, col);
    this.proj = glassBox(N * VG + 0.8, N * VG + 0.8, 0.1, { color: C.cyan, opacity: 0.1, edge: 0.9, glow: 0.3 });
    this.proj.position.set(0, IMG_Y + 0.2, 1.5);
    this.projLabel = label('投影器（2 层 MLP）：视觉空间 → 语言空间', 'tag', { anchor: 'top' });
    this.projLabel.position.set(0, IMG_Y + 0.2 - (N * VG) / 2 - 0.55, 1.5);
    this.mergeLabel = label('', 'tag image', { anchor: 'bottom' });
    this.mergeLabel.position.set(0, IMG_Y + 0.2 + (N * VG) / 2 + 0.45, 0.3);
    this.add(this.merged, this.proj, this.projLabel, this.mergeLabel);
    hide(this.merged, this.proj, this.projLabel, this.mergeLabel);
  }
  setMergedColor(t) {
    const a = new THREE.Color(C.image);
    const b = new THREE.Color(C.cyan);
    const c = new THREE.Color();
    for (let k = 0; k < 49; k++) {
      const local = Math.min(1, Math.max(0, t * 1.6 - (Math.floor(k / 7) / 6) * 0.6));
      c.lerpColors(a, b, local * 0.75);
      this.merged.setColorAt(k, c);
    }
    this.merged.instanceColor.needsUpdate = true;
  }

  // ───────────── 拼接序列 + LLM ─────────────
  buildSequence() {
    const g = (this.seqG = new THREE.Group());
    const sp = (t, x) => {
      const b = new TokenBlock(t, { color: C.pink, minW: 0.5, h: 0.5, d: 0.26, textH: 0.24, pad: 0.12 });
      b.position.set(x, 0.55, 1.2);
      g.add(b);
      return b;
    };
    this.imgOpen = sp('<img>', SEQ_X0 - 0.62);
    this.imgClose = sp('</img>', SEQ_X0 + 49 * SEQ_DX + 0.42);
    let x = SEQ_X0 + 49 * SEQ_DX + 1.25;
    this.qToks = ['图里', '有', '什么', '？'].map((t) => {
      const b = new TokenBlock(t, { color: C.text, minW: 0.5, h: 0.5, d: 0.26, textH: 0.28, pad: 0.18 });
      b.position.set(x + b.w / 2, 0.55, 1.2);
      x += b.w + 0.1;
      g.add(b);
      return b;
    });
    this.seqTower = makeTower({ layers: 7, w: 4.2, d: 2.4, gap: 0.6, y0: 1.2, title: '大语言模型', sub: '' });
    this.seqTower.position.set(0.6, 0, -4.2);
    g.add(this.seqTower);
    g.add(flowPath([V3(0, 0.9, 1.0), V3(0.3, 1.0, -1.5), V3(0.6, 1.2, -3.4)], { color: C.model, radius: 0.06 }));
    this.answer = label('', 'card', { anchor: 'bottom' });
    this.answer.position.set(0.6, 6.6, -4.2);
    g.add(this.answer);
    const seqL = label('一条序列：&lt;img&gt; + 49 个图像 token + &lt;/img&gt; + 文字问题', 'tag', { anchor: 'top' });
    seqL.position.set(0, 0.0, 1.9);
    g.add(seqL);
    this.add(g);
    hide(g);
  }

  // ───────────── 码本（VQ） ─────────────
  buildCodebook() {
    const g = (this.cbG = new THREE.Group());
    g.position.set(4.9, IMG_Y + 1.2, 0);
    this.cbCells = Array.from({ length: 16 }, (_, k) => {
      const m = new THREE.Mesh(roundedBoxGeo(0.5, 0.5, 0.2, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, transparent: true }));
      m.position.set((k % 4) * 0.64, -Math.floor(k / 4) * 0.74, 0);
      const id = textPlane(`#${k}`, 0.16, { color: '#cbd5e1', weight: 600 });
      id.position.set(0, -0.36, 0.11);
      m.add(id);
      g.add(m);
      return m;
    });
    const t = label('码本（16 个"标准色块"）', 'tag', { anchor: 'bottom' });
    t.position.set(0.96, 0.5, 0);
    g.add(t);
    this.cbSeq = label('', 'tag image', { anchor: 'top' });
    this.cbSeq.position.set(-6.3, -4.3, 0);
    g.add(this.cbSeq);
    this.add(g);
    hide(g);
  }

  // ───────────── 计算器 ─────────────
  buildCalc() {
    const g = (this.calcG = new THREE.Group());
    this.calcPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, color: 0xd6d6d6 }));
    this.calcPlane.position.set(0, 3.3, 0);
    g.add(this.calcPlane);
    this.calcGrid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.85 }));
    this.calcGrid.position.set(0, 3.3, 0.01);
    g.add(this.calcGrid);
    this.calcInfo = label('', 'tag q', { anchor: 'bottom' });
    g.add(this.calcInfo);
    this.calcDims = label('', 'dim', { anchor: 'top' });
    g.add(this.calcDims);
    this.add(g);
    hide(g);
  }
  /** 按目标宽高比"居中裁剪"出一张预览图（不拉伸变形） */
  drawCalcTexture(ar) {
    const src = this.fullCanvas || this.canvas;
    const W = ar >= 1 ? 640 : Math.max(8, Math.round(640 * ar));
    const H = ar >= 1 ? Math.max(8, Math.round(640 / ar)) : 640;
    const key = `${src.width}x${src.height}|${W}x${H}|${this.texVersion || 0}`;
    if (this._calcKey === key) return;
    this._calcKey = key;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const sAr = src.width / src.height;
    let sw = src.width;
    let sh = src.height;
    if (sAr > ar) sw = sh * ar;
    else sh = sw / ar;
    c.getContext('2d').drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
    this.calcPlane.material.map?.dispose?.();
    this.calcPlane.material.map = canvasTexture(c);
    this.calcPlane.material.needsUpdate = true;
  }
  updateCalc() {
    const sch = IMAGE_SCHEMES.find((s) => s.id === this.scheme);
    const r = sch.fn(this.calcW, this.calcH);
    // 平面尺寸（保持原图宽高比；ViT 方案显示为被压成正方形）
    const ar = r.squash ? 1 : this.calcW / this.calcH;
    const MAX = 6.4;
    const w = ar >= 1 ? MAX : MAX * ar;
    const h = ar >= 1 ? MAX / ar : MAX;
    this.calcPlane.scale.set(w, h, 1);
    this.drawCalcTexture(ar);
    const pts = [];
    if (r.grid) {
      const { cols, rows } = r.grid;
      // 每个网格单元在场景中的尺寸（网格可能略超出图片：Claude 会在右/下方补齐到 28 的倍数）
      const sx = r.squash ? w / cols : r.grid.cellW * (w / r.w2);
      const sy = r.squash ? h / rows : r.grid.cellH * (h / r.h2);
      const x0 = -w / 2;
      const y0 = h / 2;
      const maxLines = 160;
      const stepC = Math.max(1, Math.ceil(cols / maxLines));
      const stepR = Math.max(1, Math.ceil(rows / maxLines));
      for (let c = 0; c <= cols; c += stepC) pts.push(x0 + c * sx, y0, 0, x0 + c * sx, y0 - rows * sy, 0);
      for (let rr = 0; rr <= rows; rr += stepR) pts.push(x0, y0 - rr * sy, 0, x0 + cols * sx, y0 - rr * sy, 0);
    }
    this.calcGrid.geometry.dispose();
    this.calcGrid.geometry = new THREE.BufferGeometry();
    this.calcGrid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.calcInfo.position.set(0, 3.3 + h / 2 + 0.25, 0);
    this.calcInfo.setHTML(`${sch.name}：<b>${fmt(r.tokens)}</b> 个 token${r.grid ? `（网格 ${r.grid.cols} × ${r.grid.rows}${sch.id === 'qwen' ? ' + 2 个特殊 token' : sch.id === 'openai' ? '，+85 基础' : ''}）` : ''}`);
    this.calcDims.position.set(0, 3.3 - h / 2 - 0.2, 0);
    this.calcDims.setHTML(`原图 ${this.calcW}×${this.calcH} → 计算时 ${r.w2}×${r.h2}${r.squash ? '（被拉伸成正方形）' : ''}`);
    return r;
  }

  // ───────────── 颜色相关（依赖图片内容） ─────────────
  computeColors() {
    const c = document.createElement('canvas');
    c.width = c.height = 224;
    const g = c.getContext('2d');
    g.drawImage(this.canvas, 0, 0, 224, 224);
    const d = g.getImageData(0, 0, 224, 224).data;
    // 每个 patch 的平均色
    const avg = [];
    for (let i = 0; i < NP; i++) {
      const r0 = Math.floor(i / N) * 16;
      const c0 = (i % N) * 16;
      let r = 0;
      let gg = 0;
      let b = 0;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const o = ((r0 + y) * 224 + c0 + x) * 4;
          r += d[o];
          gg += d[o + 1];
          b += d[o + 2];
        }
      avg.push([r / 256 / 255, gg / 256 / 255, b / 256 / 255]);
    }
    this.avg = avg;
    // 方块颜色：橙色 + 一点 patch 本身的颜色
    const orange = new THREE.Color(C.image);
    const tmp = new THREE.Color();
    avg.forEach((a, i) => {
      tmp.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      this.cubes.setColorAt(i, orange.clone().lerp(tmp, 0.35));
    });
    this.cubes.instanceColor.needsUpdate = true;
    // 简易 k-means：16 个码本
    const R = rng(3);
    let cent = Array.from({ length: 16 }, () => avg[Math.floor(R() * avg.length)].slice());
    let assign = new Array(avg.length).fill(0);
    for (let it = 0; it < 12; it++) {
      assign = avg.map((a) => {
        let best = 0;
        let bd = Infinity;
        cent.forEach((cc, k) => {
          const dd = (a[0] - cc[0]) ** 2 + (a[1] - cc[1]) ** 2 + (a[2] - cc[2]) ** 2;
          if (dd < bd) {
            bd = dd;
            best = k;
          }
        });
        return best;
      });
      cent = cent.map((cc, k) => {
        const mem = avg.filter((_, i) => assign[i] === k);
        if (!mem.length) return avg[Math.floor(R() * avg.length)].slice();
        return [0, 1, 2].map((ch) => mem.reduce((s, m) => s + m[ch], 0) / mem.length);
      });
    }
    this.assign = assign;
    const lin = new THREE.Color();
    avg.forEach((_, i) => {
      const cc = cent[assign[i]];
      lin.setRGB(cc[0], cc[1], cc[2], THREE.SRGBColorSpace);
      this.quantAttr.setXYZ(i, lin.r, lin.g, lin.b);
    });
    this.quantAttr.needsUpdate = true;
    this.cbCells.forEach((m, k) => m.material.color.setRGB(cent[k][0], cent[k][1], cent[k][2], THREE.SRGBColorSpace));
    this.cbSeq.setHTML(`图片 → 196 个编号：[${assign.slice(0, 14).join(', ')}, …]`);
    // 像素放大柱
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const o = ((ZOOM_R * 16 + y) * 224 + ZOOM_C * 16 + x) * 4;
        const lum = (0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]) / 255;
        m4.compose(V3((x - 7.5) * 0.2, 0, (y - 7.5) * 0.2), new THREE.Quaternion(), V3(1, 0.1 + lum * 1.6, 1));
        this.zoomMesh.setMatrixAt(y * 16 + x, m4);
        col.setRGB(d[o] / 255, d[o + 1] / 255, d[o + 2] / 255, THREE.SRGBColorSpace);
        this.zoomMesh.setColorAt(y * 16 + x, col);
      }
    this.zoomMesh.instanceMatrix.needsUpdate = true;
    this.zoomMesh.instanceColor.needsUpdate = true;
  }

  async useImage(file) {
    const { canvas, width, height, full } = await loadImageFile(file, 448);
    this.canvas = canvas;
    this.fullCanvas = full;
    this.origW = width;
    this.origH = height;
    this.calcW = width;
    this.calcH = height;
    const old = this.tex;
    this.tex = canvasTexture(canvas);
    this.imgPlane.material.map = this.tex;
    this.texVersion = (this.texVersion || 0) + 1;
    this.rgb.forEach((p) => (p.material.uniforms.map.value = this.tex));
    this.patchMat.uniforms.map.value = this.tex;
    old.dispose();
    this.computeColors();
    this.app.toast(`已载入图片（${width}×${height}），后续步骤都会使用它`);
    this.app.open(8, this.step);
  }

  // ───────────── 步骤 ─────────────
  go(step) {
    const tl = this.tl;
    const imgOn = step === 0 || step === 1;
    this.fade(this.imgG, imgOn ? 1 : 0, 0, 0.5);
    this.fade(this.zoomG, step === 0 ? 1 : 0, 0, 0.4);
    this.fade(this.zoomBox, step === 0 ? 1 : 0, 0, 0.4);
    this.fade(this.zoomLink, step === 0 ? 1 : 0, 0, 0.4);
    this.rgb.forEach((p) => this.fade(p, step === 0 ? 1 : 0, 0, 0.4));
    this.fade(this.imgCaption, step === 0 ? 1 : 0, 0, 0.3);
    this.fade(this.imgPlane, step === 0 ? 1 : 0, 0, 0.3);
    this.fade(this.patches, step === 1 || step === 2 || step === 6 ? 1 : 0, 0, 0.4);
    this.fade(this.patchLabel, step === 1 || step === 2 ? 1 : 0, 0, 0.4);
    this.fade(this.cubes, step === 2 || step === 3 || step === 4 ? 1 : 0, 0, 0.4);
    this.fade(this.vitBox, step === 3 ? 1 : 0, 0, 0.5);
    this.fade(this.vitLabel, step === 3 ? 1 : 0, 0, 0.5);
    this.fade(this.vitBeams, step === 3 ? 1 : 0, step === 3 ? 1.2 : 0, 0.5);
    this.fade(this.merged, step === 4 || step === 5 ? 1 : 0, 0, 0.4);
    this.fade(this.proj, step === 4 ? 1 : 0, 0, 0.4);
    this.fade(this.projLabel, step === 4 ? 1 : 0, 0, 0.4);
    this.fade(this.mergeLabel, step === 4 ? 1 : 0, 0, 0.4);
    this.fade(this.seqG, step === 5 ? 1 : 0, step === 5 ? 0.3 : 0, 0.5);
    this.fade(this.cbG, step === 6 ? 1 : 0, step === 6 ? 0.3 : 0, 0.5);
    this.fade(this.calcG, step === 7 ? 1 : 0, step === 7 ? 0.3 : 0, 0.5);
    tl.to(this.patchMat.uniforms.uQuant, { value: 0, duration: 0.3 }, 0);

    if (step === 0) {
      // RGB 三层先叠在一起，再像扇子一样展开
      this.rgb.forEach((p, k) => {
        tl.set(p.position, { x: 0, z: -0.02 * (k + 1) }, 0);
        tl.to(p.position, { x: -2.6 + k * 0.5, z: -1.2 - k * 1.1, duration: 1.4, ease: 'power2.inOut' }, 1.0 + k * 0.15);
      });
      tl.set(this.imgPlane.position, { x: 0 }, 0);
    }
    if (step === 1) {
      tl.call(() => this.pAnim.set((i) => ({ p: L.grid(i) })), null, 0);
      tl.call(() => {
        this.patchLabel.position.set(0, IMG_Y + (N * PS) / 2 + 0.9, 0);
        this.patchLabel.setHTML('14 × 14 = <b>196</b> 个 patch（每块 16×16 像素）');
      }, null, 0);
      this.pAnim.to(tl, 0.8, (i) => ({ p: L.explode(i) }), { duration: 1.0, stagger: 0.8, order: (i) => (Math.floor(i / N) + (i % N)) / 26 });
    }
    if (step === 2) {
      tl.call(() => {
        this.pAnim.set((i) => ({ p: L.explode(i) }));
        this.cAnim.set((i) => ({ p: L.line(i), s: 0.01 }));
        this.patchLabel.position.copy(L.line(0)).add(V3(0, 0.6, 0));
        this.patchLabel.setHTML('按顺序排成一列（卷成螺旋）：第 1 个 → 第 196 个');
      }, null, 0);
      this.pAnim.to(tl, 0.4, (i) => ({ p: L.line(i), s: 0.45 }), { duration: 1.3, stagger: 1.4 });
      // patch → 方块（线性投影）
      this.cAnim.to(tl, 3.2, (i) => ({ p: L.line(i), s: 0.55 }), { duration: 0.5, stagger: 1.4 });
      this.pAnim.to(tl, 3.2, (i) => ({ p: L.line(i).add(V3(0, 0.5, 0)), s: 0.01 }), { duration: 0.5, stagger: 1.4 });
      tl.call(() => this.patchLabel.setHTML('每个 patch（768 个数）→ 线性层 → 1 个向量 = 1 个图像 token'), null, 3.4);
    }
    if (step === 3) {
      tl.call(() => this.cAnim.set((i) => ({ p: this.cAnim.pos[i].clone(), s: 1 })), null, 0);
      this.cAnim.to(tl, 0.1, (i) => ({ p: L.vit(i), s: 1 }), { duration: 1.2, stagger: 0.8 });
    }
    if (step === 4) {
      tl.call(() => {
        this.cAnim.set((i) => ({ p: L.vit(i), s: 1 }));
        this.mAnim.set((k) => ({ p: mergedPos(k), s: 0.01 }));
        this.setMergedColor(0);
        this.mergeLabel.setHTML('2×2 合并：196 个 → <b>49</b> 个 token');
      }, null, 0);
      // 每 4 个 token 向组中心收拢
      this.cAnim.to(
        tl,
        0.6,
        (i) => {
          const r = Math.floor(i / N);
          const c = i % N;
          return { p: mergedPos(Math.floor(r / 2) * 7 + Math.floor(c / 2)), s: 0.4 };
        },
        { duration: 1.0, stagger: 0.5 }
      );
      tl.to(this.cubes, { opacity: 0, duration: 0.4 }, 1.9);
      this.mAnim.to(tl, 1.8, (k) => ({ p: mergedPos(k), s: 1 }), { duration: 0.6, stagger: 0.4 });
      // 向前穿过投影器"薄膜"：颜色从"视觉橙"变为"语言青"
      this.mAnim.to(tl, 3.2, (k) => ({ p: mergedPos(k).add(V3(0, 0, 2.4)), s: 1 }), { duration: 1.2, stagger: 0.6, order: (k) => Math.floor(k / 7) / 6 });
      const prog = { t: 0 };
      tl.to(prog, { t: 1, duration: 1.6, onUpdate: () => this.setMergedColor(prog.t) }, 3.5);
      tl.call(() => this.mergeLabel.setHTML('投影后：49 个"LLM 能读懂"的视觉 token'), null, 5.0);
    }
    if (step === 5) {
      tl.call(() => {
        this.setMergedColor(1);
        this.answer.setHTML(
          this.userImage
            ? '<b>模型回答：</b>（这里会是模型对你这张图片的描述——本页面只演示流程，并未真正运行模型）'
            : '<b>模型回答：</b>图里有一只橘猫坐在草地上，后面是一座红屋顶的房子和一棵树，天上有太阳和白云。'
        );
      }, null, 0);
      this.mAnim.to(tl, 0.4, (k) => ({ p: seqPos(k), s: 0.34 }), { duration: 1.2, stagger: 1.0 });
      [this.imgOpen, this.imgClose, ...this.qToks].forEach((b, i) => tl.fromTo(b.scale, { x: 0.01, y: 0.01, z: 0.01 }, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'back.out(2)' }, 2.4 + i * 0.1));
      tl.set(this.answer, { opacity: 0 }, 0);
      tl.to(this.answer, { opacity: 1, duration: 0.6 }, this.seqTower.pulse(tl, 3.4, 0.08));
    }
    if (step === 6) {
      tl.call(() => this.pAnim.set((i) => ({ p: L.grid(i).add(V3(-1.4, 0, 0)), s: 1 })), null, 0);
      tl.to(this.patchMat.uniforms.uQuant, { value: 1, duration: 1.4, ease: 'power2.inOut' }, 1.2);
      tl.to(this.patchMat.uniforms.uQuant, { value: 0, duration: 0.8, ease: 'power2.inOut', repeat: -1, yoyo: true, repeatDelay: 2.5 }, 4.5);
    }
    if (step === 7) tl.call(() => this.updateCalc(), null, 0);
  }

  widget(step, el) {
    const upload = `<div class="w-btns"><label class="w-btn" style="display:inline-block">📷 上传自己的图片<input type="file" accept="image/*" id="img-up" style="display:none"></label></div>`;
    const bindUpload = () => {
      const inp = el.querySelector('#img-up');
      if (!inp) return;
      inp.addEventListener('change', async () => {
        const f = inp.files?.[0];
        if (!f) return;
        try {
          this.userImage = true;
          await this.useImage(f);
        } catch (e) {
          this.app.toast(e.message);
        }
      });
    };
    if (step === 0) {
      el.innerHTML = `<div class="w-title">用你的图片演示</div>${upload}<div class="w-small">图片只在你的浏览器本地处理，不会上传到任何服务器。</div>`;
      bindUpload();
      return null;
    }
    if (step === 7) {
      el.innerHTML = `
        <div class="w-title">图片 Token 计算器</div>
        <div class="w-row"><label>宽 × 高</label><input type="number" id="cw" min="1" max="20000" value="${this.calcW}"> × <input type="number" id="ch" min="1" max="20000" value="${this.calcH}"></div>
        <div class="w-btns" id="presets"></div>
        <div class="w-row"><label>3D 显示</label><select id="sch">${IMAGE_SCHEMES.map((s) => `<option value="${s.id}" ${s.id === this.scheme ? 'selected' : ''}>${s.name}</option>`).join('')}</select></div>
        ${upload}`;
      const presets = [
        ['手机照片', 4032, 3024],
        ['1080p 截图', 1920, 1080],
        ['正方形', 1024, 1024],
        ['小图', 512, 512],
        ['长截图', 1080, 4000],
      ];
      const pre = el.querySelector('#presets');
      presets.forEach(([n, w, h]) => {
        const b = document.createElement('button');
        b.className = 'w-btn';
        b.textContent = `${n} ${w}×${h}`;
        b.onclick = () => {
          el.querySelector('#cw').value = w;
          el.querySelector('#ch').value = h;
          upd();
        };
        pre.appendChild(b);
      });
      const upd = () => {
        this.calcW = Math.max(1, Math.min(20000, Number(el.querySelector('#cw').value) || 1));
        this.calcH = Math.max(1, Math.min(20000, Number(el.querySelector('#ch').value) || 1));
        this.scheme = el.querySelector('#sch').value;
        this.updateCalc();
        const rows = IMAGE_SCHEMES.map((s) => {
          const r = s.fn(this.calcW, this.calcH);
          return `<tr class="${s.id === this.scheme ? 'hl' : ''}"><td>${s.name}<br><small style="color:#64748b">${s.note}</small></td><td class="num">${fmt(r.tokens)}</td></tr>`;
        });
        const tbl = document.getElementById('img-calc-table');
        if (tbl) tbl.innerHTML = `<table class="mini"><tr><th>方案（${this.calcW}×${this.calcH}）</th><th>token</th></tr>${rows.join('')}</table>`;
      };
      el.querySelectorAll('input[type=number], select').forEach((x) => x.addEventListener('input', upd));
      bindUpload();
      upd();
      return null;
    }
    return null;
  }

  update(dt, t) {
    if (this.step === 3) this.vitBeams.rotation.z = Math.sin(t * 0.5) * 0.002;
  }
}
