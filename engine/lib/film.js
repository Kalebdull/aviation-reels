/* film.js — the runtime. Turns an episode (episodes/<slug>/episode.js) + its voice timing (timing.js)
 * into window.seek(t): a pure function of time that paints one frame on the canvas.
 *
 * An episode calls EPISODE({ ... }):
 *   title, topic          header text ("AVIATION REELS · <topic>")
 *   tail                  seconds after the last word (default 1.0)
 *   loop                  true → the last 0.5 s flows back into frame 0 so the reel loops
 *   setup(T)              optional, runs once (precompute, register cues with T.cue)
 *   shots: [ { id, at, draw(g, s), trans } ]
 *       at:    seconds, or 'seg:3' (start of spoken line 3), or 'seg:3+0.4', or 'word:3:escalator'
 *       draw:  paints the whole frame for this shot. s = { t, lt (time since shot start), dur, T, id }
 *       trans: how this shot ARRIVES: 'flow' (default, an organic wipe) | 'zoom' | 'iris' | 'whip' | 'cut' | 'fade'
 *              or { type, dur, x, y, dir }  — x,y = focus point for zoom/iris, dir = 1|-1 for flow/whip
 *
 * T (timeline helpers, all pure):
 *   T.seg(i) → { t0, t1, text, words:[{w,t0,t1}] }      T.word(i, 'escalator' | index) → { t0, t1 }
 *   T.at(spec) → seconds                                 T.dur → total duration
 *   T.in(t, t0, preset)  0→1 spring, clamped             T.out(t, t1, preset) 1→0
 *   T.win(t, t0, t1)     in × out                        T.track(t, keys, preset) — one spring per change
 *   T.cam(t, keys)       camera {x,y,z,rot} from keys [{t, x, y, z, rot}] on smooth springs
 *   T.cue(t, type, gain) add a sound effect: chime | whoosh | blip | beep2 | pop | tick | swish
 */
(function () {
  const M = window.M, D = window.D, UI = window.UI;
  const RENDER = /[?&]render\b/.test(location.search), NOCAPS = /[?&]nocaps\b/.test(location.search);
  const W = 1080, H = 1920;
  let EP = null;
  window.EPISODE = def => { EP = def; };

  const canvas = document.getElementById('c');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const bufA = document.createElement('canvas'), bufB = document.createElement('canvas');
  bufA.width = bufB.width = W; bufA.height = bufB.height = H;
  const gA = bufA.getContext('2d'), gB = bufB.getContext('2d');

  const CUES = [];
  let T = null, shots = [], DURATION = 10;

  function makeT(timing) {
    const segs = timing ? timing.segments : [];
    const T = {
      segs, dur: 0,
      seg(i) { const s = segs[Math.max(0, Math.min(segs.length - 1, i))]; return s || { t0: i * 2.5, t1: i * 2.5 + 2.2, text: '', words: [] }; },
      word(i, w) {
        const s = T.seg(i), ws = s.words || [];
        if (typeof w === 'number') return ws[Math.max(0, Math.min(ws.length - 1, w))] || { t0: s.t0, t1: s.t1 };
        const k = ws.findIndex(x => x.w.toLowerCase().replace(/[^a-z0-9°.-]/g, '').startsWith(String(w).toLowerCase()));
        return k >= 0 ? ws[k] : { t0: s.t0, t1: s.t1 };
      },
      at(spec) {
        if (typeof spec === 'number') return spec;
        let m = /^seg:(\d+)(?:([+-][\d.]+))?$/.exec(spec);
        if (m) return T.seg(+m[1]).t0 + (m[2] ? +m[2] : 0);
        m = /^end:(\d+)(?:([+-][\d.]+))?$/.exec(spec);
        if (m) return T.seg(+m[1]).t1 + (m[2] ? +m[2] : 0);
        m = /^word:(\d+):([^+-]+)(?:([+-][\d.]+))?$/.exec(spec);
        if (m) return T.word(+m[1], m[2]).t0 + (m[3] ? +m[3] : 0);
        throw new Error('bad time spec ' + spec);
      },
      in: (t, t0, p = 'default') => M.clamp(M.spring(t - t0, p), 0, p === 'snappy' || p === 'heavy' ? 1 : 1.08),
      out: (t, t1, p = 'snappy') => 1 - M.clamp(M.spring(t - t1, p), 0, 1),
      win: (t, t0, t1, p = 'snappy') => M.clamp(M.spring(t - t0, p), 0, 1) * (t1 == null ? 1 : 1 - M.clamp(M.spring(t - t1, p), 0, 1)),
      track: (t, keys, p) => M.track(t, keys, p),
      cam(t, keys) {
        const k = keys.map(k => ({ t: k.t, v: { x: k.x ?? 0, y: k.y ?? 0, z: k.z ?? 1, rot: k.rot ?? 0 }, s: k.s || { k: 38, c: 12.2 } }));
        return M.trackObj(t, k);
      },
      cue(t, type, gain = 1) { CUES.push({ t: +(+t).toFixed(4), type, gain }); },
    };
    return T;
  }

  // ---------- transitions ----------
  function blobPath(g, p, dir, t) {
    // an organic wave front sweeping across the frame
    const x0 = dir > 0 ? -300 : W + 300, x1 = dir > 0 ? W + 300 : -300;
    const fx = M.lerp(x0, x1, p);
    g.beginPath();
    g.moveTo(dir > 0 ? -400 : W + 400, -50);
    for (let y = -50; y <= H + 50; y += 40) {
      const wob = Math.sin(y * 0.006 + t * 3) * 90 + Math.sin(y * 0.013 + 1.7) * 45;
      g.lineTo(fx + wob * dir, y);
    }
    g.lineTo(dir > 0 ? -400 : W + 400, H + 50); g.closePath();
  }
  function composite(type, p, o, t) {
    const x = o.x != null ? o.x : 540, y = o.y != null ? o.y : 860, dir = o.dir || 1;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    switch (type) {
      case 'cut': g.drawImage(p < 0.5 ? bufA : bufB, 0, 0); break;
      case 'fade': g.drawImage(bufA, 0, 0); g.globalAlpha = M.clamp(p, 0, 1); g.drawImage(bufB, 0, 0); break;
      case 'iris': {
        g.drawImage(bufA, 0, 0);
        const r = Math.max(0, p) * 2300;
        g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip(); g.drawImage(bufB, 0, 0); g.restore();
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 14 * (1 - M.clamp(p, 0, 1)); if (g.lineWidth > 0.5) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); }
        break;
      }
      case 'zoom': {   // dive into (x,y): A scales up through the point, B grows out of it
        const q = M.clamp(p, 0, 1);
        g.save(); g.translate(x, y); g.scale(1 + q * 5, 1 + q * 5); g.translate(-x, -y); g.globalAlpha = 1 - M.clamp((q - 0.35) / 0.4, 0, 1); g.drawImage(bufA, 0, 0); g.restore();
        g.save(); g.globalAlpha = M.clamp((q - 0.3) / 0.45, 0, 1); const s = 0.55 + 0.45 * q; g.translate(x, y); g.scale(s, s); g.translate(-x, -y); g.drawImage(bufB, 0, 0); g.restore();
        break;
      }
      case 'whip': {
        const q = p;
        g.drawImage(bufA, -dir * W * q, 0); g.drawImage(bufB, dir * W * (1 - q), 0);
        break;
      }
      default: {     // 'flow'
        g.drawImage(bufA, 0, 0);
        g.save(); blobPath(g, M.clamp(p, 0, 1), dir, t); g.clip(); g.drawImage(bufB, 0, 0); g.restore();
        g.save(); blobPath(g, M.clamp(p, 0, 1), dir, t); g.lineWidth = 26; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke(); g.restore();
      }
    }
    g.restore();
  }
  const TRANS_DUR = { cut: 0.04, fade: 0.45, iris: 0.6, zoom: 0.7, whip: 0.42, flow: 0.65 };

  function drawShot(ctx, i, t) {
    const sh = shots[i];
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    sh.draw(ctx, { t, lt: t - sh.start, dur: sh.end - sh.start, T, id: sh.id, i });
    ctx.restore();
  }

  function seek(t) {
    // loop seam: the last LOOP seconds flow into the opening frame
    const LOOP = 0.5;
    let i = shots.length - 1;
    while (i > 0 && t < shots[i].start - shots[i].tdur / 2) i--;
    const sh = shots[i], next = shots[i + 1];
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (EP.loop && t > DURATION - LOOP) {
      drawShot(gA, i, t);
      const s0 = shots[0]; gB.setTransform(1, 0, 0, 1, 0, 0);
      s0.draw(gB, { t: 0, lt: 0, dur: s0.end - s0.start, T, id: s0.id, i: 0 });
      composite('fade', M.clamp((t - (DURATION - LOOP)) / LOOP, 0, 1) ** 1.5, {}, t);
    } else if (i > 0 && t < sh.start + sh.tdur / 2) {
      // arriving: blend previous → this
      const p = M.clamp(M.spring(t - (sh.start - sh.tdur / 2), { k: 90 / (sh.tdur * sh.tdur), c: 19 / sh.tdur }), 0, 1.0);
      drawShot(gA, i - 1, t); drawShot(gB, i, t);
      composite(sh.trans.type, p, sh.trans, t);
    } else {
      drawShot(g, i, t);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (window.BRAND && BRAND.header !== false && !EP.noHeader) UI.header(g, BRAND.series, EP.topic);
    if (!NOCAPS && !EP.noCaptions) UI.captions(g, t, window.TIMING, EP.captionStyle || {});
  }

  async function boot() {
    for (const [w, f] of [[500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [800, 'ExtraBold'], [900, 'Black']]) {
      try { const ff = new FontFace('Inter', `url(../assets/fonts/Inter-${f}.otf)`, { weight: String(w) }); document.fonts.add(await ff.load()); } catch (e) { console.warn('font', f, e.message); }
    }
    await document.fonts.ready;
    if (!EP) throw new Error('no EPISODE() registered');
    T = makeT(window.TIMING);
    if (EP.setup) EP.setup(T);
    shots = EP.shots.map((s, i) => {
      const tr = typeof s.trans === 'string' ? { type: s.trans } : Object.assign({ type: 'flow' }, s.trans || {});
      const start = i === 0 ? 0 : T.at(s.at);
      return Object.assign({}, s, { start, trans: tr, tdur: i === 0 ? 0 : (tr.dur || TRANS_DUR[tr.type] || 0.6) });
    });
    const lastWord = T.segs.length ? T.segs[T.segs.length - 1].t1 : 10;
    DURATION = EP.duration || +(lastWord + (EP.tail != null ? EP.tail : 1.0)).toFixed(3);
    T.dur = DURATION;
    shots.forEach((s, i) => { s.end = i + 1 < shots.length ? shots[i + 1].start : DURATION; });
    for (let i = 1; i < shots.length; i++) if (shots[i].trans.type !== 'cut') T.cue(shots[i].start, shots[i].trans.type === 'whip' ? 'swish' : 'whoosh', 0.55);
    CUES.sort((a, b) => a.t - b.t);
    window.DURATION = DURATION;
    window.SHOTS = shots.map(s => ({ id: s.id, start: +s.start.toFixed(3), end: +s.end.toFixed(3), trans: s.trans.type }));
    seek(0);
    return true;
  }

  window.CUES = CUES;
  window.seek = seek;
  window.RENDER_MODE = RENDER;
  window.FILM_BOOT = boot;
})();
