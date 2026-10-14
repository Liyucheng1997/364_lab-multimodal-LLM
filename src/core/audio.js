// 音频工具：合成一段"像说话"的声音、STFT + 梅尔频谱、麦克风录音、播放。
export const SR = 16000;

// 元音的前三个共振峰（Hz，近似值）
const VOWELS = {
  a: [800, 1200, 2500],
  o: [500, 900, 2400],
  e: [500, 1800, 2500],
  i: [300, 2300, 3000],
  u: [330, 800, 2300],
  er: [450, 1300, 1700],
};

/** 共振峰合成：用谐波叠加 + 共振峰包络，生成约 2 秒"像语音"的声音 */
export function synthSpeech(sr = SR) {
  // [类型, 时长(s), 参数]：v=元音(元音名, 起始f0, 结束f0)；f=摩擦音(中心频率)；s=静音
  const plan = [
    ['s', 0.12],
    ['f', 0.07, 4800],
    ['v', 0.2, 'i', 235, 205],
    ['s', 0.04],
    ['v', 0.24, 'a', 165, 225],
    ['v', 0.12, 'o', 225, 200],
    ['s', 0.09],
    ['f', 0.09, 3600],
    ['v', 0.22, 'e', 210, 160],
    ['s', 0.05],
    ['v', 0.16, 'er', 190, 220],
    ['f', 0.06, 5600],
    ['v', 0.26, 'u', 215, 150],
    ['s', 0.12],
  ];
  const total = plan.reduce((a, p) => a + p[1], 0);
  const n = Math.round(total * sr);
  const out = new Float32Array(n);
  const K = 40;
  const phase = new Float64Array(K + 1);
  let t0 = 0;
  let lastF = VOWELS.a;
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  // 二阶带通（摩擦音用）
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let si = 0; si < plan.length; si++) {
    const [type, dur, a, b, c] = plan[si];
    const ns = Math.round(dur * sr);
    const start = Math.round(t0 * sr);
    if (type === 'v') {
      const F = VOWELS[a];
      for (let j = 0; j < ns && start + j < n; j++) {
        const u = j / ns;
        const f0 = b + (c - b) * u + 6 * Math.sin(2 * Math.PI * 5.5 * (j / sr));
        const mix = Math.min(1, u * 4); // 前 25% 从上一个元音过渡
        const fm = F.map((f, k) => lastF[k] + (f - lastF[k]) * mix);
        const env = Math.min(1, j / (0.025 * sr)) * Math.min(1, (ns - j) / (0.04 * sr));
        let s = 0;
        for (let k = 1; k <= K; k++) {
          const fk = k * f0;
          if (fk > 7600) break;
          let amp = 0;
          for (let q = 0; q < 3; q++) {
            const bw = 60 + q * 50;
            amp += [1, 0.6, 0.35][q] / (1 + ((fk - fm[q]) / bw) ** 2);
          }
          amp *= 1 / Math.pow(k, 0.55);
          phase[k] += (2 * Math.PI * fk) / sr;
          s += amp * Math.sin(phase[k]);
        }
        out[start + j] += s * env * 0.16;
      }
      lastF = F;
    } else if (type === 'f') {
      const fc = a;
      const w = (2 * Math.PI * fc) / sr;
      const r = 0.92;
      const b1 = 2 * r * Math.cos(w);
      const b2 = -r * r;
      for (let j = 0; j < ns && start + j < n; j++) {
        const env = Math.sin((Math.PI * j) / ns) ** 1.5;
        const x = rnd();
        const y = x - x2 + b1 * y1 + b2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        out[start + j] += y * env * 0.05;
      }
    }
    t0 += dur;
  }
  // 归一化
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / m) * 0.85;
  return out;
}

// ───────────── FFT / 梅尔频谱 ─────────────
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}
const hz2mel = (f) => 2595 * Math.log10(1 + f / 700);
const mel2hz = (m) => 700 * (Math.pow(10, m / 2595) - 1);

/** 和 Whisper 相同的参数：25ms 窗、10ms 步长、nMels 个梅尔通道；返回 0~1 归一化的 [帧][通道] */
export function melSpectrogram(samples, { sr = SR, nMels = 80, win = 400, hop = 160, nfft = 512, range = 5 } = {}) {
  const nFrames = Math.max(1, Math.floor((samples.length - win) / hop) + 1);
  const nBins = nfft / 2 + 1;
  // 梅尔滤波器组
  const mMin = hz2mel(0);
  const mMax = hz2mel(sr / 2);
  const pts = Array.from({ length: nMels + 2 }, (_, i) => mel2hz(mMin + ((mMax - mMin) * i) / (nMels + 1)));
  const bin = pts.map((f) => (f / (sr / 2)) * (nBins - 1));
  const hann = Float32Array.from({ length: win }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win));
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const out = [];
  let gmax = -Infinity;
  for (let f = 0; f < nFrames; f++) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < win; i++) re[i] = (samples[f * hop + i] || 0) * hann[i];
    fft(re, im);
    const pow = new Float64Array(nBins);
    for (let k = 0; k < nBins; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
    const mel = new Float32Array(nMels);
    for (let m = 0; m < nMels; m++) {
      let s = 0;
      const l = bin[m];
      const c = bin[m + 1];
      const r = bin[m + 2];
      for (let k = Math.floor(l); k <= Math.ceil(r) && k < nBins; k++) {
        const w = k < c ? (k - l) / Math.max(c - l, 1e-6) : (r - k) / Math.max(r - c, 1e-6);
        if (w > 0) s += w * pow[k];
      }
      mel[m] = Math.log10(Math.max(s, 1e-10));
      gmax = Math.max(gmax, mel[m]);
    }
    out.push(mel);
  }
  // 与 Whisper 类似：截断到 (最大值 − 8)，再线性映射到 0~1
  // 与 Whisper 类似：低于 (最大值 − range) 的截断，再线性映射到 0~1（Whisper 用 range=8；这里为了看清谐波，默认取 5）
  const floor = gmax - range;
  for (const fr of out) for (let m = 0; m < nMels; m++) fr[m] = (Math.max(fr[m], floor) - floor) / range;
  return { frames: out, nFrames, nMels, hopSec: hop / sr, melHz: (m) => mel2hz(mMin + ((mMax - mMin) * (m + 1)) / (nMels + 1)) };
}

// ───────────── 录音与播放 ─────────────
let ctx = null;
function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

/** 播放 16kHz 单声道样本，返回 { startedAt, duration, stop } */
export function play(samples, sr = SR) {
  const c = audioCtx();
  if (c.state === 'suspended') c.resume();
  const buf = c.createBuffer(1, samples.length, sr);
  buf.copyToChannel(samples, 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start();
  return { startedAt: performance.now(), duration: samples.length / sr, stop: () => src.stop() };
}

/** 录音 seconds 秒，返回 16kHz 单声道 Float32Array */
export async function record(seconds = 3, onTick) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持录音');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start();
  const t0 = performance.now();
  await new Promise((res) => {
    const iv = setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      onTick?.(Math.min(t, seconds));
      if (t >= seconds) {
        clearInterval(iv);
        res();
      }
    }, 100);
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
  const decoded = await audioCtx().decodeAudioData(await blob.arrayBuffer());
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SR), SR);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  const data = rendered.getChannelData(0);
  let m = 0;
  for (const v of data) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i] / m) * 0.85;
  return data;
}
