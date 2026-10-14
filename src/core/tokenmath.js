// 多模态 token 计算公式（依据各家公开文档 / 论文 / 官方代码整理，核对日期 2026-10）。
// 注意：厂商会调整计费规则，这里的结果是"估算"，以官方文档和 API 返回的 usage 为准。

/** Claude（Anthropic）：每 28×28 像素块 = 1 个视觉 token；先按长边与 token 上限等比缩小（不放大） */
export function claudeImage(w, h, { maxEdge = 1568, maxTokens = 1568 } = {}) {
  const ok = (a, b) => Math.ceil(a / 28) * 28 <= maxEdge && Math.ceil(b / 28) * 28 <= maxEdge && Math.ceil(a / 28) * Math.ceil(b / 28) <= maxTokens;
  let w2 = w;
  let h2 = h;
  if (!ok(w, h)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ok(Math.max(1, Math.round(w * mid)), Math.max(1, Math.round(h * mid)))) lo = mid;
      else hi = mid;
    }
    w2 = Math.max(1, Math.round(w * lo));
    h2 = Math.max(1, Math.round(h * lo));
  }
  const cols = Math.ceil(w2 / 28);
  const rows = Math.ceil(h2 / 28);
  return { w2, h2, cols, rows, tokens: cols * rows, grid: { cols, rows, cellW: 28, cellH: 28 } };
}

/** Qwen2-VL / Qwen2.5-VL：ViT patch=14，2×2 合并 → 每 28×28 像素 1 个 token；smart_resize 保证边长为 28 的倍数 */
export function qwenImage(w, h, { minPixels = 4 * 784, maxPixels = 1280 * 784 } = {}) {
  const F = 28;
  let hb = Math.max(F, Math.round(h / F) * F);
  let wb = Math.max(F, Math.round(w / F) * F);
  if (hb * wb > maxPixels) {
    const beta = Math.sqrt((h * w) / maxPixels);
    hb = Math.max(F, Math.floor(h / beta / F) * F);
    wb = Math.max(F, Math.floor(w / beta / F) * F);
  } else if (hb * wb < minPixels) {
    const beta = Math.sqrt(minPixels / (h * w));
    hb = Math.ceil((h * beta) / F) * F;
    wb = Math.ceil((w * beta) / F) * F;
  }
  const cols = wb / F;
  const rows = hb / F;
  return { w2: wb, h2: hb, cols, rows, tokens: cols * rows + 2, grid: { cols, rows, cellW: F, cellH: F } };
}

/** OpenAI GPT-4o / GPT-4.1（high 细节）：缩放进 2048×2048，短边缩到 768（只缩不放），按 512 像素切块：85 + 170 × 块数 */
export function openaiTile(w, h, { detail = 'high', base = 85, tile = 170 } = {}) {
  if (detail === 'low') return { w2: w, h2: h, cols: 1, rows: 1, tokens: base, grid: null };
  let w2 = w;
  let h2 = h;
  const s1 = Math.min(1, 2048 / Math.max(w2, h2));
  w2 = Math.floor(w2 * s1);
  h2 = Math.floor(h2 * s1);
  const s2 = Math.min(1, 768 / Math.min(w2, h2));
  w2 = Math.floor(w2 * s2);
  h2 = Math.floor(h2 * s2);
  const cols = Math.ceil(w2 / 512);
  const rows = Math.ceil(h2 / 512);
  return { w2, h2, cols, rows, tokens: base + tile * cols * rows, grid: { cols, rows, cellW: 512, cellH: 512 } };
}

/** Gemini 2.x（文档给出的近似规则）：两边都 ≤384 → 258；否则按 ⌊短边/1.5⌋ 为单位切块，每块 258 */
export function geminiImage(w, h) {
  if (w <= 384 && h <= 384) return { w2: w, h2: h, cols: 1, rows: 1, tokens: 258, grid: { cols: 1, rows: 1, cellW: w, cellH: h } };
  const crop = Math.max(1, Math.floor(Math.min(w, h) / 1.5));
  const cols = Math.ceil(w / crop);
  const rows = Math.ceil(h / crop);
  return { w2: w, h2: h, cols, rows, tokens: 258 * cols * rows, grid: { cols, rows, cellW: crop, cellH: crop } };
}

/** 经典固定分辨率 ViT（如 LLaVA-1.5 用的 CLIP ViT-L/14@336）：任何图片都缩放成 336×336 → 24×24 = 576 */
export function vitFixed(w, h, { size = 336, patch = 14 } = {}) {
  const n = size / patch;
  return { w2: size, h2: size, cols: n, rows: n, tokens: n * n, grid: { cols: n, rows: n, cellW: w / n, cellH: h / n }, squash: true };
}

export const IMAGE_SCHEMES = [
  { id: 'claude', name: 'Claude（标准）', note: '28×28 像素/token，长边 ≤1568、≤1568 token', fn: (w, h) => claudeImage(w, h) },
  { id: 'claudeHi', name: 'Claude（高分辨率模型）', note: '28×28 像素/token，长边 ≤2576、≤4784 token', fn: (w, h) => claudeImage(w, h, { maxEdge: 2576, maxTokens: 4784 }) },
  { id: 'qwen', name: 'Qwen2.5-VL', note: '28×28 像素/token（patch 14 + 2×2 合并），max_pixels=1280×28²', fn: (w, h) => qwenImage(w, h) },
  { id: 'openai', name: 'GPT-4o（high）', note: '512 像素切块：85 + 170 × 块数', fn: (w, h) => openaiTile(w, h) },
  { id: 'gemini', name: 'Gemini 2.x（近似）', note: '≤384 像素 258；否则按块，每块 258', fn: (w, h) => geminiImage(w, h) },
  { id: 'vit', name: 'LLaVA-1.5（CLIP ViT-L/14@336）', note: '固定缩放到 336×336 → 576', fn: (w, h) => vitFixed(w, h) },
];

/** 音频：每秒 token 数 */
export const AUDIO_SCHEMES = [
  { id: 'whisper', name: 'Whisper 编码器输出', perSec: 50, note: '30 秒 → 3000 帧梅尔谱 → 1500 个向量（每个 20ms）' },
  { id: 'qwenAudio', name: 'Qwen2-Audio', perSec: 25, note: '在 Whisper 基础上再池化，每个 token ≈ 40ms' },
  { id: 'gemini', name: 'Gemini（文档）', perSec: 32, note: '每秒 32 token（1 分钟 = 1,920）；Gemini 3 文档另给出 25/秒' },
  { id: 'mimi', name: 'Mimi 编解码器（8 层码本）', perSec: 100, note: '12.5 帧/秒 × 8 个码本 ID（Moshi 中按 12.5 步/秒并行建模）' },
  { id: 'encodec', name: 'EnCodec 24kHz @6kbps', perSec: 600, note: '75 帧/秒 × 8 个码本 ID（展平后）' },
];

/** 视频（每秒 token） */
export function videoTokensPerSec(scheme, w = 1280, h = 720) {
  if (scheme === 'gemini') return 263; // 文档：约 263 token/秒（1 帧/秒采样 + 音频）
  if (scheme === 'qwen') {
    // 2 fps，两帧合为一个时间 patch；每"帧对"的 token 限制在 128~768
    const r = qwenImage(w, h, { minPixels: 128 * 784, maxPixels: 768 * 784 });
    return r.cols * r.rows; // 每秒 1 个时间 patch
  }
  return 0;
}

export function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}
