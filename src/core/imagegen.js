// 默认示例图片（程序绘制的"小猫与房子"）以及用户上传图片的读取。
import * as THREE from 'three';

/** 画一张 448×448 的示例插画：蓝天、太阳、山、房子、树和一只橘猫 */
export function drawScene(size = 448) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.scale(size / 448, size / 448);

  const sky = g.createLinearGradient(0, 0, 0, 290);
  sky.addColorStop(0, '#3d8fe0');
  sky.addColorStop(1, '#bfe3ff');
  g.fillStyle = sky;
  g.fillRect(0, 0, 448, 448);

  // 太阳
  const glow = g.createRadialGradient(365, 78, 10, 365, 78, 90);
  glow.addColorStop(0, 'rgba(255,240,150,0.95)');
  glow.addColorStop(1, 'rgba(255,240,150,0)');
  g.fillStyle = glow;
  g.fillRect(260, 0, 188, 190);
  g.fillStyle = '#ffd43b';
  circle(g, 365, 78, 34);

  // 云
  g.fillStyle = 'rgba(255,255,255,0.95)';
  for (const [x, y, r] of [[92, 70, 24], [122, 58, 30], [156, 70, 24], [118, 80, 22], [210, 112, 16], [232, 104, 20], [254, 113, 15]]) circle(g, x, y, r);

  // 远山
  g.fillStyle = '#7b8fd8';
  poly(g, [[0, 250], [70, 160], [130, 225], [205, 140], [290, 230], [360, 170], [448, 240], [448, 300], [0, 300]]);
  g.fillStyle = '#9aaaf0';
  poly(g, [[205, 140], [228, 165], [214, 162], [200, 175], [190, 158]]);

  // 草地
  const grass = g.createLinearGradient(0, 240, 0, 448);
  grass.addColorStop(0, '#79c94f');
  grass.addColorStop(1, '#3f9a36');
  g.fillStyle = grass;
  g.beginPath();
  g.moveTo(0, 270);
  g.quadraticCurveTo(140, 236, 260, 262);
  g.quadraticCurveTo(360, 282, 448, 254);
  g.lineTo(448, 448);
  g.lineTo(0, 448);
  g.closePath();
  g.fill();

  // 树
  g.fillStyle = '#8a5a32';
  g.fillRect(70, 205, 20, 80);
  g.fillStyle = '#2f8f4e';
  for (const [x, y, r] of [[80, 180, 42], [52, 205, 30], [108, 206, 32], [80, 150, 30]]) circle(g, x, y, r);
  g.fillStyle = '#3aa65c';
  circle(g, 68, 168, 18);

  // 房子
  g.fillStyle = '#f5e6c8';
  g.fillRect(262, 212, 112, 82);
  g.fillStyle = '#d64545';
  poly(g, [[250, 216], [318, 160], [386, 216]]);
  g.fillStyle = '#8b5a2b';
  g.fillRect(302, 248, 28, 46);
  g.fillStyle = '#9fd6ff';
  g.fillRect(340, 232, 24, 22);
  g.fillRect(272, 232, 22, 22);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.strokeRect(340, 232, 24, 22);
  g.strokeRect(272, 232, 22, 22);

  // 橘猫
  drawCat(g, 196, 300);
  return c;
}

function drawCat(g, cx, cy) {
  const orange = '#f08c2e';
  const dark = '#c4621a';
  // 尾巴
  g.strokeStyle = orange;
  g.lineWidth = 16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx + 40, cy + 92);
  g.quadraticCurveTo(cx + 110, cy + 90, cx + 92, cy + 30);
  g.stroke();
  // 身体
  g.fillStyle = orange;
  ellipse(g, cx, cy + 72, 56, 64);
  g.fillStyle = '#fff3e0';
  ellipse(g, cx, cy + 88, 30, 40);
  // 前爪
  g.fillStyle = orange;
  ellipse(g, cx - 22, cy + 132, 16, 10);
  ellipse(g, cx + 22, cy + 132, 16, 10);
  // 头
  g.fillStyle = orange;
  poly(g, [[cx - 40, cy - 14], [cx - 34, cy - 62], [cx - 6, cy - 36]]);
  poly(g, [[cx + 40, cy - 14], [cx + 34, cy - 62], [cx + 6, cy - 36]]);
  g.fillStyle = '#ffb3c1';
  poly(g, [[cx - 32, cy - 24], [cx - 30, cy - 50], [cx - 14, cy - 34]]);
  poly(g, [[cx + 32, cy - 24], [cx + 30, cy - 50], [cx + 14, cy - 34]]);
  g.fillStyle = orange;
  ellipse(g, cx, cy, 46, 40);
  // 花纹
  g.strokeStyle = dark;
  g.lineWidth = 5;
  for (const dx of [-12, 0, 12]) {
    g.beginPath();
    g.moveTo(cx + dx, cy - 38);
    g.lineTo(cx + dx * 0.8, cy - 24);
    g.stroke();
  }
  for (const dy of [50, 70, 90]) {
    g.beginPath();
    g.moveTo(cx - 54, cy + dy);
    g.quadraticCurveTo(cx - 44, cy + dy + 4, cx - 36, cy + dy - 2);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + 54, cy + dy);
    g.quadraticCurveTo(cx + 44, cy + dy + 4, cx + 36, cy + dy - 2);
    g.stroke();
  }
  // 眼睛
  g.fillStyle = '#ffffff';
  ellipse(g, cx - 16, cy - 4, 10, 11);
  ellipse(g, cx + 16, cy - 4, 10, 11);
  g.fillStyle = '#2e7d32';
  ellipse(g, cx - 16, cy - 3, 6.5, 9);
  ellipse(g, cx + 16, cy - 3, 6.5, 9);
  g.fillStyle = '#111';
  ellipse(g, cx - 16, cy - 3, 2.6, 7);
  ellipse(g, cx + 16, cy - 3, 2.6, 7);
  g.fillStyle = '#fff';
  circle(g, cx - 18, cy - 7, 2);
  circle(g, cx + 14, cy - 7, 2);
  // 鼻子与嘴
  g.fillStyle = '#ff7b9c';
  poly(g, [[cx - 5, cy + 10], [cx + 5, cy + 10], [cx, cy + 16]]);
  g.strokeStyle = '#7a3b12';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy + 16);
  g.quadraticCurveTo(cx - 6, cy + 24, cx - 12, cy + 19);
  g.moveTo(cx, cy + 16);
  g.quadraticCurveTo(cx + 6, cy + 24, cx + 12, cy + 19);
  g.stroke();
  // 胡须
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      g.beginPath();
      g.moveTo(cx + s * 14, cy + 14 + k * 4);
      g.lineTo(cx + s * 50, cy + 10 + k * 9);
      g.stroke();
    }
  }
}

function circle(g, x, y, r) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function ellipse(g, x, y, rx, ry) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}
function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath();
  g.fill();
}

/** 读取用户选择的图片文件 → { canvas(正方形居中裁剪), width, height(原始尺寸) } */
export function loadImageFile(file, size = 448) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      // 另存一张保持原始宽高比的缩略图（长边 ≤ 1024），供计算器预览
      const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
      const full = document.createElement('canvas');
      full.width = Math.max(1, Math.round(img.naturalWidth * k));
      full.height = Math.max(1, Math.round(img.naturalHeight * k));
      full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
      URL.revokeObjectURL(url);
      resolve({ canvas: c, width: img.naturalWidth, height: img.naturalHeight, full });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取这张图片'));
    };
    img.src = url;
  });
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 读取画布上某个区域的平均颜色（0~1） */
export function averageColor(canvas, x, y, w, h) {
  const d = canvas.getContext('2d').getImageData(x, y, w, h).data;
  let r = 0;
  let gg = 0;
  let b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    gg += d[i + 1];
    b += d[i + 2];
  }
  return [r / n / 255, gg / n / 255, b / n / 255];
}
