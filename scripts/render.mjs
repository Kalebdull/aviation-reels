#!/usr/bin/env node
// render.mjs — drive window.seek(t) in headless Chromium, encode H.264.
//
//   node scripts/render.mjs <slug>                    final: 60 fps, 2 subframes of motion blur → episodes/<slug>/out/video.mp4
//   node scripts/render.mjs <slug> --draft            fast check: 30 fps, no blur, half size → out/draft.mp4
//   node scripts/render.mjs <slug> --stills shots     one PNG per shot + contact sheet → out/stills/, out/shots.png
//   node scripts/render.mjs <slug> --stills 0,1.6,3.2 PNGs at those times (+ sheet)
//   node scripts/render.mjs <slug> --stills every:1.7 one frame every 1.7 s (+ sheet)
//   node scripts/render.mjs <slug> --nocaps           no burned-in captions → out/video_nocaps.mp4
//   node scripts/render.mjs <slug> --cues-only        just write audio/cues.json
// Options: --fps 60 --sub 2 --shutter 0.5 --workers 6 --from s --to s --out file
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const slug = argv[0] && !argv[0].startsWith('--') ? argv[0].replace(/^episodes\//, '').replace(/\/$/, '') : null;
if (!slug) { console.error('usage: node scripts/render.mjs <episode-slug> [--draft|--stills shots|--nocaps|--cues-only]'); process.exit(1); }
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const EP = path.join(ROOT, 'episodes', slug);
if (!fs.existsSync(path.join(EP, 'episode.js'))) { console.error(`no ${EP}/episode.js`); process.exit(1); }
const draft = !!opt('draft', false), nocaps = !!opt('nocaps', false), stillsArg = opt('stills', null), cuesOnly = !!opt('cues-only', false);
const fps = +opt('fps', draft ? 30 : 60), sub = draft ? 1 : +opt('sub', 2), shutter = +opt('shutter', 0.5), workers = +opt('workers', 6);
const scale = draft ? 0.5 : 1;
const outFile = path.resolve(opt('out', path.join(EP, 'out', draft ? 'draft.mp4' : nocaps ? 'video_nocaps.mp4' : 'video.mp4')));
const url = pathToFileURL(path.join(ROOT, 'engine', 'index.html')).href + `?ep=${encodeURIComponent(slug)}&render${nocaps ? '&nocaps' : ''}`;

const browser = await chromium.launch();
async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.on('console', m => { if (['warning', 'error'].includes(m.type())) console.log(`  [page ${m.type()}] ${m.text()}`); });
  page.on('pageerror', e => console.error('  [page error]', e.message));
  await page.goto(url);
  await page.evaluate(() => window.READY);
  return { page, cdp: await ctx.newCDPSession(page) };
}
async function shoot(p, t, format = 'jpeg') {
  await p.page.evaluate(tt => window.seek(tt), t);
  const r = await p.cdp.send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 94 : undefined, optimizeForSpeed: true });
  return Buffer.from(r.data, 'base64');
}

const first = await openPage();
const info = await first.page.evaluate(() => ({ D: window.DURATION, cues: window.CUES, shots: window.SHOTS }));
fs.mkdirSync(path.join(EP, 'audio'), { recursive: true });
fs.writeFileSync(path.join(EP, 'audio', 'cues.json'), JSON.stringify({ duration: info.D, cues: info.cues }, null, 1));
console.log(`${slug}: ${info.D.toFixed(2)} s, ${info.shots.length} shots, ${info.cues.length} sfx cues`);
if (cuesOnly) { await browser.close(); process.exit(0); }

if (stillsArg) {
  const dir = path.join(EP, 'out', 'stills');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let times;
  if (stillsArg === 'shots') times = info.shots.map(s => Math.min(s.end - 0.05, s.start + Math.max(0.6, (s.end - s.start) * 0.6)));
  else if (String(stillsArg).startsWith('every:')) { const st = +stillsArg.slice(6); times = []; for (let t = 0; t < info.D; t += st) times.push(+t.toFixed(3)); }
  else times = String(stillsArg).split(',').map(Number);
  const files = [];
  for (const [i, t] of times.entries()) {
    const f = path.join(dir, `${String(i).padStart(2, '0')}_${t.toFixed(2)}s.png`);
    fs.writeFileSync(f, await shoot(first, t, 'png')); files.push(f);
  }
  await browser.close();
  const sheet = path.join(EP, 'out', stillsArg === 'shots' ? 'shots.png' : 'stills.png');
  spawnSync('python3', [path.join(ROOT, 'scripts', 'sheet.py'), sheet, ...files], { stdio: 'inherit' });
  process.exit(0);
}

const from = +opt('from', 0), to = Math.min(+opt('to', info.D), info.D);
const nFrames = Math.round((to - from) * fps);
const times = [];
for (let k = 0; k < nFrames; k++) {
  const t = from + k / fps;
  for (let j = 0; j < sub; j++) times.push(t - (sub - 1 - j) * shutter / (fps * sub));  // last subframe exactly on k/fps
}
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const vf = [];
if (sub > 1) vf.push(`tmix=frames=${sub}`, `select='eq(mod(n\\,${sub})\\,${sub - 1})'`, `setpts=N/(${fps}*TB)`);
vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps * sub), '-i', '-',
  '-vf', vf.join(','), '-r', String(fps), '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', draft ? '22' : '16',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
const write = b => new Promise(res => { if (!ff.stdin.write(b)) ff.stdin.once('drain', res); else res(); });
const pool = [first];
for (let i = 1; i < workers; i++) pool.push(await openPage());
const t0 = Date.now(), BATCH = pool.length * 8;
let lastPct = -1;
for (let i = 0; i < times.length; i += BATCH) {
  const slice = times.slice(i, i + BATCH), per = Math.ceil(slice.length / pool.length);
  const parts = await Promise.all(pool.map(async (p, w) => { const o = []; for (const t of slice.slice(w * per, (w + 1) * per)) o.push(await shoot(p, t)); return o; }));
  for (const b of parts.flat()) await write(b);
  const fr = Math.min(times.length, i + BATCH) / sub, el = (Date.now() - t0) / 1000, pct = Math.floor(fr / nFrames * 10);
  const line = `frame ${Math.round(fr)}/${nFrames}  ${(fr / el).toFixed(1)} fps  eta ${Math.round((nFrames - fr) / (fr / el))}s`;
  if (process.stdout.isTTY) process.stdout.write(`\r  ${line}   `); else if (pct !== lastPct) { console.log('  ' + line); lastPct = pct; }
}
ff.stdin.end(); await done; await browser.close();
console.log(`\nvideo → ${path.relative(ROOT, outFile)}  (${nFrames} frames @ ${fps} fps, ${sub} subframes, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
