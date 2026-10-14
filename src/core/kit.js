// 3D 积木库：Token 方块、文字贴图、标签、箭头、流光管线、向量柱、玻璃盒、淡入淡出等可复用元素。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import gsap from 'gsap';
import { globalUniforms } from './engine.js';

/** 统一配色：每种模态 / 概念一个颜色，全书一致 */
export const C = {
  text: 0x38bdf8,
  image: 0xf59e0b,
  audio: 0x34d399,
  video: 0xf472b6,
  model: 0xa78bfa,
  q: 0xfacc15,
  k: 0x60a5fa,
  v: 0xc084fc,
  pink: 0xf472b6,
  red: 0xf87171,
  green: 0x4ade80,
  white: 0xe2e8f0,
  gray: 0x64748b,
  slate: 0x334155,
  gold: 0xfbbf24,
  cyan: 0x22d3ee,
  orange: 0xfb923c,
  indigo: 0x818cf8,
};

export const FONT = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Hiragino Sans GB",system-ui,sans-serif';

// ───────────────────────── 透明度（可被 GSAP 直接补间） ─────────────────────────
// 给所有 Object3D 增加 opacity 访问器：gsap.to(obj, { opacity: 0 }) 会自动作用于整棵子树。
function parentFactor(obj) {
  let f = 1;
  let p = obj.parent;
  while (p) {
    if (p.userData.opacity !== undefined) f *= p.userData.opacity;
    p = p.parent;
  }
  return f;
}
function applyOpacity(obj, factor) {
  const f = factor * (obj.userData.opacity ?? 1);
  if (obj.material) {
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      const u = m.uniforms?.uOpacity;
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = u ? u.value : m.opacity;
      if (u) u.value = m.userData.baseOpacity * f;
      else m.opacity = m.userData.baseOpacity * f;
    }
  }
  if (obj.isCSS2DObject) obj.element.style.opacity = f;
  for (const c of obj.children) applyOpacity(c, f);
}
export function setOpacity(obj, a) {
  obj.userData.opacity = a;
  obj.visible = a > 0.003;
  if (obj.visible) applyOpacity(obj, parentFactor(obj));
}
Object.defineProperty(THREE.Object3D.prototype, 'opacity', {
  get() {
    return this.visible ? (this.userData.opacity ?? 1) : 0;
  },
  set(v) {
    setOpacity(this, v);
  },
  configurable: true,
});

/** 立即隐藏/显示（不补间） */
export function hide(...objs) {
  for (const o of objs) setOpacity(o, 0);
}
export function show(...objs) {
  for (const o of objs) setOpacity(o, 1);
}

// ───────────────────────── 文字贴图 ─────────────────────────
const texCache = new Map();
export function textTexture(text, { size = 72, color = '#ffffff', weight = 700, font = FONT } = {}) {
  const key = `${text}|${size}|${color}|${weight}|${font}`;
  let hit = texCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${weight} ${size}px ${font}`;
  const w = Math.max(8, Math.ceil(ctx.measureText(text).width + size * 0.2));
  const h = Math.ceil(size * 1.32);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.userData.cached = true;
  hit = { texture: tex, aspect: w / h };
  texCache.set(key, hit);
  return hit;
}

/** 面向 +Z 的文字平面（真 3D，会被遮挡、随距离缩放） */
export function textPlane(text, height = 0.4, opts = {}) {
  const { texture, aspect } = textTexture(text, opts);
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    color: new THREE.Color(opts.tint ?? 0xe8eef8),
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.width = height * aspect;
  mesh.renderOrder = 2;
  return mesh;
}

// ───────────────────────── 几何缓存 ─────────────────────────
const geoCache = new Map();
function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}
export function roundedBoxGeo(w, h, d, r = 0.1) {
  const q = (v) => Math.round(v * 100) / 100;
  return cachedGeo(`rb${q(w)}|${q(h)}|${q(d)}|${q(r)}`, () => new RoundedBoxGeometry(q(w), q(h), q(d), 3, Math.min(q(r), q(h) / 2 - 0.001, q(w) / 2 - 0.001)));
}
export const unitBox = () => cachedGeo('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
export const unitBoxBase = () =>
  cachedGeo('unitboxbase', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    return g;
  });
export const sphereGeo = (r = 1, seg = 24) => cachedGeo(`sph${r}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)));

// ───────────────────────── 材质 ─────────────────────────
export function glowMat(color, { glow = 0.45, opacity = 0.95, rough = 0.38, metal = 0.12, dark = 0.3 } = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c.clone().multiplyScalar(dark),
    emissive: c,
    emissiveIntensity: glow,
    roughness: rough,
    metalness: metal,
    transparent: true,
    opacity,
  });
}

/** 流光材质：沿管线 uv.x 方向移动的光脉冲，表示"数据在流动" */
export function flowMaterial(color, { speed = 0.5, density = 3, base = 0.18, opacity = 0.9, width = 0.12, axis = 0 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: globalUniforms.uTime,
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSpeed: { value: speed },
      uDensity: { value: density },
      uBase: { value: base },
      uWidth: { value: width },
      uAxis: { value: axis },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity, uSpeed, uDensity, uBase, uWidth, uAxis; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float t = fract(mix(vUv.x, vUv.y, uAxis) * uDensity - uTime * uSpeed);
        float p = smoothstep(0.0, uWidth * 0.4, t) * (1.0 - smoothstep(uWidth * 0.4, uWidth * 3.0, t));
        float a = clamp(uBase + p, 0.0, 1.0) * uOpacity;
        gl_FragColor = vec4(uColor * (0.8 + p * 2.2), a);
      }`,
  });
}

// ───────────────────────── Token 方块 ─────────────────────────
export class TokenBlock extends THREE.Group {
  constructor(text, opts = {}) {
    super();
    const {
      color = C.text,
      h = 0.66,
      d = 0.34,
      minW = 0.66,
      pad = 0.28,
      textH = 0.38,
      glow = 0.5,
      opacity = 0.96,
      textColor = '#ffffff',
      w = null,
      back = true,
    } = opts;
    this.text = text;
    this.h = h;
    this.d = d;
    this.baseGlow = glow;
    this.color = new THREE.Color(color);
    let face = null;
    let width = w ?? minW;
    if (text !== '' && text != null) {
      face = textPlane(String(text), textH, { color: textColor });
      if (w == null) width = Math.max(minW, face.userData.width + pad);
      else if (face.userData.width > w - 0.08) face.scale.setScalar((w - 0.08) / face.userData.width);
    }
    this.w = width;
    this.box = new THREE.Mesh(roundedBoxGeo(width, h, d, Math.min(0.12, h * 0.22)), glowMat(color, { glow, opacity }));
    this.add(this.box);
    if (face) {
      face.position.z = d / 2 + 0.006;
      this.face = face;
      this.add(face);
      if (back) {
        const b = face.clone();
        b.rotation.y = Math.PI;
        b.position.z = -d / 2 - 0.006;
        this.add(b);
      }
    }
  }
  glowTo(v, duration = 0.4) {
    return gsap.to(this.box.material, { emissiveIntensity: v, duration, overwrite: 'auto' });
  }
  highlight(on = true, duration = 0.35) {
    return this.glowTo(on ? 1.6 : this.baseGlow, duration);
  }
  setGlow(v) {
    this.box.material.emissiveIntensity = v;
  }
  colorTo(color, duration = 0.5) {
    const c = new THREE.Color(color);
    const m = this.box.material;
    const tl = gsap.timeline();
    tl.to(m.emissive, { r: c.r, g: c.g, b: c.b, duration }, 0);
    tl.to(m.color, { r: c.r * 0.3, g: c.g * 0.3, b: c.b * 0.3, duration }, 0);
    return tl;
  }
}

// ───────────────────────── CSS2D 标签 ─────────────────────────
export function label(html, cls = '', { anchor = 'center', onClick = null } = {}) {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.innerHTML = html;
  const obj = new CSS2DObject(el);
  if (anchor === 'bottom') obj.center.set(0.5, 1);
  else if (anchor === 'top') obj.center.set(0.5, 0);
  else if (anchor === 'left') obj.center.set(0, 0.5);
  else if (anchor === 'right') obj.center.set(1, 0.5);
  if (onClick) {
    el.classList.add('click');
    el.addEventListener('click', onClick);
  }
  obj.setHTML = (h) => (el.innerHTML = h);
  return obj;
}

// ───────────────────────── 箭头 / 光束 ─────────────────────────
const UP = new THREE.Vector3(0, 1, 0);
export function arrow(from, to, { color = C.white, radius = 0.035, head = 0.24, headR = 0.1, glow = 0.8 } = {}) {
  const g = new THREE.Group();
  const mat = glowMat(color, { glow, dark: 0.5 });
  const shaft = new THREE.Mesh(cachedGeo(`cyl${radius}`, () => new THREE.CylinderGeometry(radius, radius, 1, 12)), mat);
  const cone = new THREE.Mesh(cachedGeo(`cone${headR}|${head}`, () => new THREE.ConeGeometry(headR, head, 18)), mat);
  g.add(shaft, cone);
  g.setEnds = (a, b) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = Math.max(dir.length(), 1e-4);
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
    const sl = Math.max(len - head, 0.001);
    shaft.scale.set(1, sl, 1);
    shaft.position.copy(a).addScaledVector(dir, sl / 2);
    shaft.quaternion.copy(q);
    cone.position.copy(a).addScaledVector(dir, sl + head / 2);
    cone.quaternion.copy(q);
  };
  g.setEnds(from, to);
  return g;
}

/** 两点之间的弧形流光管（如注意力连线） */
export function beam(a, b, { height = 1.5, radius = 0.04, color = C.text, speed = 0.6, density = 2, base = 0.2, opacity = 0.9, segments = 48, width = 0.12 } = {}) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  mid.y += height;
  const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
  const geo = new THREE.TubeGeometry(curve, segments, radius, 8, false);
  const mesh = new THREE.Mesh(geo, flowMaterial(color, { speed, density, base, opacity, width }));
  mesh.userData.curve = curve;
  mesh.renderOrder = 3;
  return mesh;
}

/** 沿任意折线/曲线的流光管 */
export function flowPath(points, { radius = 0.05, color = C.text, speed = 0.5, density = 4, base = 0.18, opacity = 0.85, closed = false, tension = 0.2, width = 0.12 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', tension);
  const geo = new THREE.TubeGeometry(curve, Math.max(32, points.length * 24), radius, 8, closed);
  const mesh = new THREE.Mesh(geo, flowMaterial(color, { speed, density, base, opacity, width }));
  mesh.userData.curve = curve;
  mesh.renderOrder = 3;
  return mesh;
}

// ───────────────────────── 向量柱状图 ─────────────────────────
/** 一个向量 = 一排小柱子（正值向上，负值向下） */
export class VectorBars extends THREE.Group {
  constructor(values, { w = 0.12, gap = 0.04, d = 0.12, maxH = 1, pos = C.text, neg = C.pink, glow = 0.7 } = {}) {
    super();
    this.maxH = maxH;
    this.matPos = glowMat(pos, { glow });
    this.matNeg = glowMat(neg, { glow });
    this.bars = [];
    const n = values.length;
    this.width = n * w + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(unitBoxBase(), values[i] >= 0 ? this.matPos : this.matNeg);
      m.scale.set(w, Math.max(Math.abs(values[i]) * maxH, 0.02) * Math.sign(values[i] || 1), d);
      m.position.x = -this.width / 2 + w / 2 + i * (w + gap);
      this.bars.push(m);
      this.add(m);
    }
    this.values = values.slice();
  }
  setValues(values, duration = 0.6, tl = null) {
    const anims = [];
    values.forEach((v, i) => {
      const m = this.bars[i];
      if (!m) return;
      const sy = Math.max(Math.abs(v) * this.maxH, 0.02) * Math.sign(v || 1);
      const tw = gsap.to(m.scale, { y: sy, duration, ease: 'power2.inOut', onStart: () => (m.material = v >= 0 ? this.matPos : this.matNeg) });
      anims.push(tw);
      if (tl) tl.add(tw, 0);
    });
    this.values = values.slice();
    return anims;
  }
}

// ───────────────────────── 玻璃盒 / 面板 ─────────────────────────
export function glassBox(w, h, d, { color = C.model, opacity = 0.1, edge = 0.55, radius = 0.12, glow = 0.25 } = {}) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const mat = new THREE.MeshStandardMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: glow,
    transparent: true,
    opacity,
    roughness: 0.2,
    metalness: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const box = new THREE.Mesh(roundedBoxGeo(w, h, d, radius), mat);
  box.renderOrder = 1;
  const edges = new THREE.LineSegments(
    cachedGeo(`edges${w}|${h}|${d}`, () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d))),
    new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: edge })
  );
  g.add(box, edges);
  g.box = box;
  g.edges = edges;
  return g;
}

/** 薄平板（如 Transformer 层） */
export function slab(w, h, d, color, { glow = 0.35, opacity = 0.55 } = {}) {
  const m = new THREE.Mesh(roundedBoxGeo(w, h, d, Math.min(0.1, h / 2.2)), glowMat(color, { glow, opacity, rough: 0.25 }));
  return m;
}

/** 发光小球 */
export function orb(r, color, glow = 1.6) {
  return new THREE.Mesh(sphereGeo(r, 20), glowMat(color, { glow, dark: 0.6 }));
}

// ───────────────────────── 颜色映射 ─────────────────────────
const VIRIDIS = [
  [0.267, 0.005, 0.329],
  [0.283, 0.141, 0.458],
  [0.254, 0.265, 0.53],
  [0.207, 0.372, 0.553],
  [0.164, 0.471, 0.558],
  [0.128, 0.567, 0.551],
  [0.135, 0.659, 0.518],
  [0.267, 0.749, 0.441],
  [0.478, 0.821, 0.318],
  [0.741, 0.873, 0.15],
  [0.993, 0.906, 0.144],
];
const MAGMA = [
  [0.001, 0.0, 0.014],
  [0.078, 0.054, 0.21],
  [0.232, 0.06, 0.437],
  [0.39, 0.1, 0.502],
  [0.55, 0.161, 0.506],
  [0.716, 0.215, 0.475],
  [0.869, 0.288, 0.409],
  [0.967, 0.439, 0.359],
  [0.994, 0.624, 0.427],
  [0.997, 0.807, 0.565],
  [0.987, 0.991, 0.75],
];
function ramp(stops, t, target) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const a = stops[i];
  const b = stops[i + 1];
  return (target || new THREE.Color()).setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, THREE.SRGBColorSpace);
}
export const viridis = (t, target) => ramp(VIRIDIS, t, target);
export const magma = (t, target) => ramp(MAGMA, t, target);
/** 发散色：负值粉，正值青 */
export function diverging(v, target) {
  const c = target || new THREE.Color();
  const t = Math.max(-1, Math.min(1, v));
  if (t >= 0) return c.setRGB(0.1 + 0.12 * t, 0.15 + 0.6 * t, 0.25 + 0.72 * t, THREE.SRGBColorSpace);
  return c.setRGB(0.25 + 0.7 * -t, 0.12 + 0.2 * -t, 0.25 + 0.45 * -t, THREE.SRGBColorSpace);
}

// ───────────────────────── 其它工具 ─────────────────────────
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** 可复现的伪随机数 */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e6) / 1e6;
  };
}

/** 排成一行时每个方块的 x 坐标（居中） */
export function layoutRow(widths, gap = 0.18) {
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let x = -total / 2;
  return widths.map((w) => {
    const cx = x + w / 2;
    x += w + gap;
    return cx;
  });
}

export function softmax(arr, T = 1) {
  const m = Math.max(...arr);
  const ex = arr.map((v) => Math.exp((v - m) / T));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map((v) => v / s);
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.isCSS2DObject) o.element.remove();
    if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const k of ['map', 'alphaMap', 'emissiveMap']) {
          const t = m[k];
          if (t && !t.userData.cached) t.dispose();
        }
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture && !u.value.userData.cached) u.value.dispose();
        m.dispose();
      }
    }
  });
}
