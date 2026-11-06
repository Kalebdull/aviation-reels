// runtime.js — 3D episode runtime. episode.html?ep=<slug>[&render][&nocaps]
// Loads episodes/<slug>/timing.js (window.TIMING) and episodes/<slug>/episode3d.js, whose default export is
//   async function (ctx) → { update(t, T), overlay?(g, t, T), tail?, noHeader? }
// ctx = { THREE, scene, camera, renderer, world, load(url) → glTF scene, props (props3d), aircraft (glb loader) }
// window.seek(t) renders one frame: 3D, then the 2D overlay (episode overlay → header → captions). Pure in t.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildWorld } from './lib/world3d.js';
import * as props from './lib/props3d.js';

const q = new URLSearchParams(location.search), slug = q.get('ep');
const RENDER = q.has('render'), NOCAPS = q.has('nocaps');
const W = 1080, H = 1920;
if (RENDER) document.body.classList.add('render');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.domElement.id = 'gl'; document.getElementById('wrap').appendChild(renderer.domElement);
const overlay = document.createElement('canvas'); overlay.width = W; overlay.height = H; overlay.id = 'ov';
document.getElementById('wrap').appendChild(overlay);
const g2 = overlay.getContext('2d');

const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('missing ' + src)); document.head.appendChild(s); });
const CUES = [];

function makeT(timing) {
  const M = window.M, segs = timing ? timing.segments : [];
  const T = {
    segs, dur: 0,
    seg(i) { return segs[Math.max(0, Math.min(segs.length - 1, i))] || { t0: i * 3, t1: i * 3 + 2.5, words: [] }; },
    word(i, w) {
      const s = T.seg(i), ws = s.words || [];
      if (typeof w === 'number') return ws[Math.max(0, Math.min(ws.length - 1, w))] || { t0: s.t0, t1: s.t1 };
      const k = ws.findIndex(x => x.w.toLowerCase().replace(/[^a-z0-9,.-]/g, '').startsWith(String(w).toLowerCase()));
      if (k < 0) console.warn(`word "${w}" not found in line ${i}`);
      return k >= 0 ? ws[k] : { t0: s.t0, t1: s.t1 };
    },
    in: (t, t0, p = 'default') => M.clamp(M.spring(t - t0, p), 0, p === 'default' ? 1.08 : 1),
    out: (t, t1, p = 'snappy') => 1 - M.clamp(M.spring(t - t1, p), 0, 1),
    win: (t, t0, t1, p = 'snappy') => M.clamp(M.spring(t - t0, p), 0, 1) * (t1 == null ? 1 : 1 - M.clamp(M.spring(t - t1, p), 0, 1)),
    track: (t, keys, p) => M.track(t, keys, p),
    /** camera from keys [{t, pos:[x,y,z], look:[x,y,z], fov}] on the smooth camera spring */
    cam(t, keys) {
      const k = keys.map(k => ({ t: k.t, s: k.s || { k: 30, c: 10.9 }, v: { px: k.pos[0], py: k.pos[1], pz: k.pos[2], lx: k.look[0], ly: k.look[1], lz: k.look[2], f: k.fov || 40 } }));
      const v = M.trackObj(t, k);
      return { pos: new THREE.Vector3(v.px, v.py, v.pz), look: new THREE.Vector3(v.lx, v.ly, v.lz), fov: v.f };
    },
    cue(t, type, gain = 1) { CUES.push({ t: +(+t).toFixed(4), type, gain }); },
  };
  return T;
}

window.READY = (async () => {
  for (const s of ['/engine/lib/motion.js', '/engine/lib/draw.js', '/engine/lib/ui.js', '/engine/lib/brand.js']) await loadScript(s);
  for (const [w, f] of [[500, 'Medium'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black']]) {
    try { const ff = new FontFace('Inter', `url(/assets/fonts/Inter-${f}.otf)`, { weight: String(w) }); document.fonts.add(await ff.load()); } catch (e) { console.warn('font', f); }
  }
  try { await loadScript(`/episodes/${slug}/timing.js`); } catch (e) { window.TIMING = null; console.warn('no timing.js'); }
  const mod = await import(`/episodes/${slug}/episode3d.js`);
  const world = buildWorld(renderer, { look: 'golden', clouds: 22, ...((mod.config && mod.config.world) || {}) });
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 9000);
  const gltf = new GLTFLoader();
  const load = url => new Promise((res, rej) => gltf.load(url, g => res(g.scene), undefined, rej));
  const T = makeT(window.TIMING);
  const ep = await mod.default({ THREE, scene: world.scene, camera, renderer, world, load, props, T });
  const last = T.segs.length ? T.segs[T.segs.length - 1].t1 : 10;
  const D = +(last + (ep.tail ?? 1.2)).toFixed(3); T.dur = D;
  CUES.sort((a, b) => a.t - b.t);
  window.DURATION = D; window.CUES = CUES;
  window.SHOTS = T.segs.map((s, i) => ({ id: 'line' + i, start: s.t0, end: T.segs[i + 1] ? T.segs[i + 1].t0 : D }));
  window.seek = t => {
    ep.update(t, T);
    camera.updateProjectionMatrix();
    renderer.render(world.scene, camera);
    g2.setTransform(1, 0, 0, 1, 0, 0); g2.clearRect(0, 0, W, H);
    if (ep.overlay) ep.overlay(g2, t, T);
    if (window.BRAND && BRAND.header !== false && !ep.noHeader) UI.header(g2, BRAND.series, ep.topic);
    if (!NOCAPS) UI.captions(g2, t, window.TIMING, ep.captionStyle || {});
  };
  window.seek(0);
  return true;
})();
window.READY.catch(e => { document.getElementById('err').textContent = e.stack || e.message; console.error(e); });
