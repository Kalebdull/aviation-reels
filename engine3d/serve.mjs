// tiny static server for the 3D engine (ES modules can't load from file://)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.otf': 'font/otf', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
export function serve(port = 0) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
    }).listen(port, () => res({ server: s, port: s.address().port }));
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) serve(+process.argv[2] || 8765).then(({ port }) => console.log(`http://localhost:${port}/engine3d/`));
