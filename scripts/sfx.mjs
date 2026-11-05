#!/usr/bin/env node
// sfx.mjs — synthesize UI sounds from audio/cues.json into audio/sfx.wav. No samples, all code, seeded.
//
//   node sfx.mjs --project .
//
// cues.json is written by render.mjs from the film itself: { duration, cues: [{ t, type, gain }] }
//   click  cursor press / line of type landing     pop    item, badge or ring appearing
//   thump  big landing (stat, logo, CTA)           whoosh container morph — PEAKS at t (the landing)
//   tick   tiny tick (counters)          chime  soft bell (reveal, lock)   blip  UI blip   beep2  gentle two-tone warning
//   swish  short pass (whip pans)
// Add your own cues to audio/cues.extra.json in the same format; they are merged in.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const project = path.resolve(opt('project', '.'));
const SR = 48000;
const cuesFile = path.join(project, 'audio', 'cues.json');
if (!fs.existsSync(cuesFile)) { console.error('no audio/cues.json — run render.mjs --cues-only first'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(cuesFile, 'utf8'));
let cues = data.cues;
const extra = path.join(project, 'audio', 'cues.extra.json');
if (fs.existsSync(extra)) cues = cues.concat(JSON.parse(fs.readFileSync(extra, 'utf8')).cues || []);
const dur = +opt('duration', data.duration);
const N = Math.ceil(dur * SR);
const L = new Float32Array(N), R = new Float32Array(N);

function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// RBJ biquad, coefficients may change per sample (for sweeps)
function biquad(type, f, q) {
  const w = 2 * Math.PI * f / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }  // band-pass
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function filterRun(x, coefAt) {
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const [b0, b1, b2, a1, a2] = coefAt(i);
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const noise = (n, rnd) => Float32Array.from({ length: n }, () => rnd() * 2 - 1);

const SYN = {
  click(rnd) {
    const n = Math.round(0.03 * SR), x = noise(n, rnd), c = biquad('bp', 3200, 2.5);
    const y = filterRun(x, () => c);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = y[i] * Math.exp(-t / 0.004) * 1.4 + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t / 0.006) * 0.35; }
    return { y, peak: 0 };
  },
  tick(rnd) {
    const n = Math.round(0.015 * SR), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] = Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t / 0.003) * 0.4; }
    return { y, peak: 0 };
  },
  pop(rnd) {
    const n = Math.round(0.12 * SR), y = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const f = 380 + 520 * Math.exp(-t / 0.018); ph += 2 * Math.PI * f / SR; y[i] = Math.sin(ph) * Math.exp(-t / 0.035) * 0.7 * Math.min(1, t / 0.001); }
    const nz = filterRun(noise(n, rnd), () => biquad('hp', 4000, 0.7));
    for (let i = 0; i < n; i++) y[i] += nz[i] * Math.exp(-i / SR / 0.003) * 0.25;
    return { y, peak: 0 };
  },
  thump(rnd) {
    const n = Math.round(0.6 * SR), y = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; const f = 42 + 90 * Math.exp(-t / 0.04); ph += 2 * Math.PI * f / SR; y[i] = Math.tanh(Math.sin(ph) * 1.8) * Math.exp(-t / 0.18) * 0.8; }
    const nz = filterRun(noise(n, rnd), () => biquad('lp', 900, 0.7));
    for (let i = 0; i < n; i++) y[i] += nz[i] * Math.exp(-i / SR / 0.05) * 0.35;
    return { y, peak: 0 };
  },
  chime(rnd) {
    // soft two-partial bell for reveals and "locked in" moments
    const n = Math.round(1.4 * SR), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; const e = Math.min(1, t / 0.004) * Math.exp(-t / 0.42);
      y[i] = (Math.sin(2 * Math.PI * 1318.5 * t) * 0.5 + Math.sin(2 * Math.PI * 1975.5 * t) * 0.22 + Math.sin(2 * Math.PI * 2637 * t) * 0.08 * Math.exp(-t / 0.1)) * e * 0.55; }
    return { y, peak: 0 };
  },
  blip(rnd) {
    const n = Math.round(0.09 * SR), y = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR; ph += 2 * Math.PI * (880 + 440 * Math.min(1, t / 0.03)) / SR; y[i] = Math.sin(ph) * Math.exp(-t / 0.03) * 0.45 * Math.min(1, t / 0.002); }
    return { y, peak: 0 };
  },
  beep2(rnd) {
    // gentle two-tone warning (high-low), not an alarm
    const n = Math.round(0.42 * SR), y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR, f = t < 0.19 ? 988 : 740, lt = t < 0.19 ? t : t - 0.21;
      const e = lt < 0 ? 0 : Math.min(1, lt / 0.008) * Math.exp(-lt / 0.09); y[i] = (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(4 * Math.PI * f * t)) * e * 0.32; }
    return { y, peak: 0 };
  },
  swish(rnd) {
    // short airy pass for whip pans
    const pre = 0.14, post = 0.12, n = Math.round((pre + post) * SR), x = noise(n, rnd);
    const y = filterRun(x, i => biquad('bp', 900 + 3000 * Math.sin(Math.PI * Math.min(1, i / n)), 1.4));
    for (let i = 0; i < n; i++) { const t = i / SR; y[i] *= (t < pre ? Math.pow(t / pre, 2) : Math.exp(-(t - pre) / 0.04)) * 0.7; }
    return { y, peak: Math.round(pre * SR) };
  },
  whoosh(rnd) {
    // filtered noise sweeping up into the landing, peak at 0.32 s, short tail
    const pre = 0.32, post = 0.16, n = Math.round((pre + post) * SR), x = noise(n, rnd);
    const y = filterRun(x, i => { const u = Math.min(1, i / (pre * SR)); return biquad('bp', 350 + 3800 * u * u, 1.1); });
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const e = t < pre ? Math.pow(t / pre, 2.4) : Math.exp(-(t - pre) / 0.05);
      y[i] *= e * 0.6;
    }
    return { y, peak: Math.round(pre * SR) };
  },
};

let seed = 11;
for (const c of cues) {
  const fn = SYN[c.type];
  if (!fn) { console.warn('unknown cue type', c.type); continue; }
  const rnd = mulberry32(seed++ * 7919);
  const { y, peak } = fn(rnd);
  const pan = (rnd() - 0.5) * 0.5, gl = Math.cos((pan + 1) * Math.PI / 4) * 1.414, gr = Math.sin((pan + 1) * Math.PI / 4) * 1.414;
  const g = (c.gain ?? 1) * 0.8;
  const start = Math.round(c.t * SR) - peak;
  for (let i = 0; i < y.length; i++) {
    const k = start + i;
    if (k < 0 || k >= N) continue;
    L[k] += y[i] * g * gl; R[k] += y[i] * g * gr;
  }
}

// write 24-bit WAV
let peakAbs = 1e-9;
for (let i = 0; i < N; i++) peakAbs = Math.max(peakAbs, Math.abs(L[i]), Math.abs(R[i]));
const norm = peakAbs > 0.95 ? 0.95 / peakAbs : 1;
const buf = Buffer.alloc(44 + N * 6);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 6, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34); buf.write('data', 36); buf.writeUInt32LE(N * 6, 40);
for (let i = 0; i < N; i++) {
  for (const [ch, arr] of [[0, L], [1, R]]) {
    const v = Math.max(-1, Math.min(1, arr[i] * norm));
    buf.writeIntLE(Math.round(v * 8388607), 44 + i * 6 + ch * 3, 3);
  }
}
const out = path.join(project, 'audio', 'sfx.wav');
fs.writeFileSync(out, buf);
console.log(`sfx → audio/sfx.wav  (${cues.length} cues: ${Object.entries(cues.reduce((m, c) => (m[c.type] = (m[c.type] || 0) + 1, m), {})).map(([k, v]) => `${v} ${k}`).join(', ')})`);
