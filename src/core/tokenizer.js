// 真实分词器（gpt-tokenizer）：按需懒加载编码表，并把 token 还原成可展示的片段（含"字节碎片"）。
const loaders = {
  o200k_base: () => import('gpt-tokenizer/encoding/o200k_base'),
  cl100k_base: () => import('gpt-tokenizer/encoding/cl100k_base'),
};
const cache = {};

export const ENCODINGS = {
  o200k_base: { name: 'o200k_base', desc: 'GPT-4o / GPT-4.1 / GPT-5 等', vocab: '约 20 万' },
  cl100k_base: { name: 'cl100k_base', desc: 'GPT-4 / GPT-3.5（旧）', vocab: '约 10 万' },
};

export function getEncoding(name = 'o200k_base') {
  if (!cache[name]) cache[name] = loaders[name]().then((m) => m.default);
  return cache[name];
}

const strict = new TextDecoder('utf-8', { fatal: true });
const hex = (bytes) => [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/**
 * 分词并返回每个 token 的展示信息：
 * { id, text, partial, bytes, hex }
 * partial=true 表示这个 token 只是某个字符 UTF-8 编码的一部分（字节碎片）。
 */
export function tokenize(api, text) {
  const ids = api.encode(text, { disallowedSpecial: new Set() });
  const core = api.bytePairEncodingCoreProcessor;
  const enc = new TextEncoder();
  const out = ids.map((id) => {
    const t = core.tryDecodeToken(id);
    if (typeof t === 'string') return { id, text: t, partial: false, bytes: enc.encode(t) };
    try {
      return { id, text: strict.decode(t), partial: false, bytes: t };
    } catch {
      return { id, text: null, partial: true, bytes: t, hex: hex(t) };
    }
  });
  // 把连续的字节碎片拼起来，看看它们合起来是哪个字
  for (let i = 0; i < out.length; i++) {
    if (!out[i].partial) continue;
    let j = i;
    const buf = [];
    while (j < out.length && out[j].partial) buf.push(...out[j++].bytes);
    let joined = null;
    try {
      joined = strict.decode(new Uint8Array(buf));
    } catch {
      joined = null;
    }
    for (let k = i; k < j; k++) out[k].group = joined;
    i = j - 1;
  }
  return out;
}

/** 给 token 一个适合显示的短文本：空格显示成 ·，换行显示成 ↵，字节碎片显示成十六进制 */
export function displayText(tok) {
  if (tok.partial) return `‹${tok.hex}›`;
  return tok.text.replace(/ /g, '·').replace(/\n/g, '↵').replace(/\t/g, '⇥');
}

/** 一个简单的 BPE 训练器（教学用：按字符起步，每次合并出现次数最多的相邻对） */
export function trainBPE(corpus, maxMerges = 8) {
  let lines = corpus.map(([w, f]) => ({ toks: [...w], f }));
  const states = [lines.map((l) => l.toks.slice())];
  const merges = [];
  for (let k = 0; k < maxMerges; k++) {
    const counts = new Map();
    const order = [];
    for (const l of lines) {
      for (let i = 0; i < l.toks.length - 1; i++) {
        const key = l.toks[i] + '\u0001' + l.toks[i + 1];
        if (!counts.has(key)) {
          counts.set(key, 0);
          order.push(key);
        }
        counts.set(key, counts.get(key) + l.f);
      }
    }
    if (!counts.size) break;
    let best = order[0];
    for (const key of order) if (counts.get(key) > counts.get(best)) best = key;
    if (counts.get(best) < 2) break;
    const [a, b] = best.split('\u0001');
    const top = [...counts.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 4)
      .map(([kk, v]) => ({ pair: kk.split('\u0001'), count: v }));
    merges.push({ a, b, merged: a + b, count: counts.get(best), top });
    lines = lines.map((l) => {
      const toks = [];
      for (let i = 0; i < l.toks.length; i++) {
        if (i < l.toks.length - 1 && l.toks[i] === a && l.toks[i + 1] === b) {
          toks.push(a + b);
          i++;
        } else toks.push(l.toks[i]);
      }
      return { toks, f: l.f };
    });
    states.push(lines.map((l) => l.toks.slice()));
  }
  return { states, merges };
}
