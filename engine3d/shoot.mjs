// node engine3d/shoot.mjs <page.html> <out.png> [query] [t]  — one still from a 3D page
import { chromium } from 'playwright'; import fs from 'node:fs'; import { serve } from './serve.mjs';
const [page, out, query = '', t = '0'] = process.argv.slice(2);
const { server, port } = await serve();
const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto(`http://localhost:${port}/engine3d/${page}?${query}`); await p.waitForFunction(() => window.READY, null, { timeout: 180000 });
const t0 = Date.now(); await p.evaluate(tt => window.seek(tt), +t); const t1 = Date.now();
const shot = await (await p.context().newCDPSession(p)).send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64')); console.log(`render ${t1 - t0} ms → ${out}`);
await b.close(); server.close();
