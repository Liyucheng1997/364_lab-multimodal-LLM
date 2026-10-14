// 复合道具：LLM 模型塔、图片平面/切块、声波管线等，在多个章节中复用。
import * as THREE from 'three';
import { C, slab, glassBox, flowMaterial, label, flowPath, V3 } from './kit.js';
import { canvasTexture } from './imagegen.js';

/** 大语言模型"塔"：N 层半透明平板 + 玻璃外壳 + 中心光柱 */
export function makeTower({ layers = 9, w = 4.6, d = 3.2, gap = 0.7, y0 = 1.2, color = C.model, title = '大语言模型 LLM', sub = 'Transformer × N 层' } = {}) {
  const g = new THREE.Group();
  const slabs = [];
  for (let i = 0; i < layers; i++) {
    const s = slab(w, 0.22, d, color, { glow: 0.28, opacity: 0.5 });
    s.position.y = y0 + i * gap;
    g.add(s);
    slabs.push(s);
  }
  const h = (layers - 1) * gap + 1.4;
  const cy = y0 + ((layers - 1) * gap) / 2;
  const glass = glassBox(w + 0.6, h, d + 0.6, { color, opacity: 0.05, edge: 0.4, glow: 0.2 });
  glass.position.y = cy;
  g.add(glass);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h - 0.3, 12, 1, true), flowMaterial(0xc4b5fd, { axis: 1, speed: 0.35, density: 3, base: 0.25, opacity: 0.8 }));
  core.position.y = cy;
  g.add(core);
  if (title) {
    const t = label(`${title}${sub ? `<div class="lbl dim" style="text-align:center">${sub}</div>` : ''}`, 'title', { anchor: 'bottom' });
    t.position.set(0, y0 + (layers - 1) * gap + 1.1, 0);
    g.add(t);
    g.userData.title = t;
  }
  g.userData.slabs = slabs;
  g.userData.top = y0 + (layers - 1) * gap;
  g.userData.bottom = y0;
  g.userData.width = w;
  /** 在时间轴上让各层自下而上依次亮起 */
  g.pulse = (tl, at = 0, stagger = 0.09, peak = 2.4) => {
    slabs.forEach((s, i) => {
      tl.to(s.material, { emissiveIntensity: peak, duration: 0.16, ease: 'power2.out' }, at + i * stagger);
      tl.to(s.material, { emissiveIntensity: 0.28, duration: 0.55, ease: 'power2.in' }, at + i * stagger + 0.16);
    });
    return at + slabs.length * stagger + 0.7;
  };
  return g;
}

/** 带边框的图片平面 */
export function makeImagePlane(canvas, size = 2.4, { frame = C.image } = {}) {
  const g = new THREE.Group();
  const tex = canvasTexture(canvas);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(size * 1.04, size * 1.04)),
    new THREE.LineBasicMaterial({ color: frame, transparent: true, opacity: 0.9 })
  );
  g.add(plane, border);
  g.plane = plane;
  g.texture = tex;
  return g;
}

/** 把图片切成 rows×cols 个小平面（每块只显示对应区域的纹理） */
export function makeTiles(texture, size, rows, cols, gapRatio = 0) {
  const tiles = [];
  const tw = size / cols;
  const th = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const geo = new THREE.PlaneGeometry(tw * (1 - gapRatio), th * (1 - gapRatio));
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        uv.setXY(i, (c + u) / cols, 1 - (r + 1 - v) / rows);
      }
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
      m.userData.home = V3(-size / 2 + tw * (c + 0.5), size / 2 - th * (r + 0.5), 0);
      m.position.copy(m.userData.home);
      tiles.push(m);
    }
  }
  return tiles;
}

/** 合成一段"像语音"的波形，返回发光管线 */
export function makeWaveTube({ width = 3.2, height = 0.7, n = 260, color = C.audio, radius = 0.025, seed = 3 } = {}) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const env = Math.pow(Math.sin(Math.PI * t), 0.6) * (0.55 + 0.45 * Math.sin(t * 9 + seed));
    const y = env * (Math.sin(t * 90) * 0.6 + Math.sin(t * 213 + seed) * 0.3 + Math.sin(t * 41) * 0.25) * height;
    pts.push(V3(-width / 2 + t * width, y, 0));
  }
  return flowPath(pts, { radius, color, density: 2, speed: 0.4, base: 0.55, tension: 0.5 });
}
