#!/usr/bin/env node
// new-episode.mjs — start an episode folder from the template.   node scripts/new-episode.mjs "VOR TO/FROM flag"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const topic = process.argv.slice(2).join(' ').trim();
if (!topic) { console.error('usage: node scripts/new-episode.mjs "<Topic>"'); process.exit(1); }
const existing = fs.readdirSync(path.join(ROOT, 'episodes')).filter(d => /^\d{2}-/.test(d)).map(d => +d.slice(0, 2));
const n = String((existing.length ? Math.max(...existing) : 0) + 1).padStart(2, '0');
const slug = `${n}-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
const dir = path.join(ROOT, 'episodes', slug);
if (fs.existsSync(dir)) { console.error('exists: ' + dir); process.exit(1); }
fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'episodes', '_template'))) {
  const s = fs.readFileSync(path.join(ROOT, 'episodes', '_template', f), 'utf8').replaceAll('{{TOPIC}}', topic).replaceAll('{{N}}', n).replaceAll('{{SLUG}}', slug);
  fs.writeFileSync(path.join(dir, f), s);
}
console.log(`episodes/${slug}/  ← script.md, lines.txt, episode.js, review_log.md`);
