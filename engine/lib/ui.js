/* ui.js — screen-space layer drawn over the film: karaoke captions, keyword slams, labels, header.
 * Instagram Reels 1080x1920 safe zones: keep must-read visuals inside x 70–910, y 220–1200 (captions live at y≈1350).
 * Instagram covers the bottom ~420 px (username, caption) and the right rail (x > 920, y 900–1500).
 */
(function () {
  const M = window.M, D = window.D, C = D.C;
  const SAFE = { left: 70, right: 910, top: 220, bottom: 1200, capY: 1350 };

  /** "*word*" → highlighted amber (permanently, not just while spoken) */
  function parse(text) {
    let em = false;
    return String(text).split(/\s+/).filter(Boolean).map(raw => {
      let w = raw, s = false, e = false;
      if (w.startsWith('*')) { s = true; w = w.slice(1); }
      if (w.replace(/[.,!?;:]+$/, '').endsWith('*')) { e = true; w = w.replace(/\*([.,!?;:]*)$/, '$1'); }
      if (s) em = true; const out = { w, em }; if (e) em = false; return out;
    });
  }

  /** Karaoke captions from TIMING. Segment caption = seg.caption (override) or seg.text. "" = no caption. */
  function captions(g, t, timing, o = {}) {
    if (!timing) return;
    const segs = timing.segments;
    // exactly one caption on screen: the latest line that has started. The outgoing one is gone before the next lands.
    let cur = -1;
    for (let i = 0; i < segs.length; i++) if (i === 0 || t >= segs[i].t0 - 0.04) cur = i;
    for (let i = Math.max(0, cur); i <= cur; i++) {
      const s = segs[i], next = segs[i + 1];
      const cap = s.caption != null ? s.caption : s.text;
      if (!cap) continue;
      const tIn = i === 0 ? -1 : s.t0 - 0.04, tOut = next ? Math.min(next.t0 - 0.2, s.t1 + 0.6) : s.t1 + 0.9;
      if (t > tOut + 0.3) continue;
      const a = M.clamp(M.spring(t - tIn, 'snappy'), 0, 1) * (1 - M.clamp(M.spring(t - tOut, 'snappy'), 0, 1));
      if (a < 0.002) continue;
      const toks = parse(cap);
      const maxW = o.maxW || 760;   // 160–920: clear of the right action rail
      let size = o.size || 60, lines = D.balance(g, toks.map(k => k.w), maxW, size, 800, 3);
      for (const [sz, ml] of [[54, 3], [50, 4], [44, 4]]) {          // long lines: shrink a little rather than overflow
        if (Math.max(...lines.map(l => D.measure(g, l.join(' '), size, 800))) <= maxW + 1) break;
        size = sz; lines = D.balance(g, toks.map(k => k.w), maxW, size, 800, ml);
      }
      const lh = size * 1.22, padX = 36, padY = 22;
      const widths = lines.map(l => D.measure(g, l.join(' '), size, 800));
      const bw = Math.max(...widths) + padX * 2, bh = lines.length * lh + padY * 2;
      const cy = (o.y || SAFE.capY) - (lines.length === 3 ? 40 : 0);
      // word timings: map caption words onto the spoken words by position
      const words = s.words || [];
      const wt = k => words.length ? words[Math.min(words.length - 1, Math.round(k * (words.length - 1) / Math.max(1, toks.length - 1)))] : null;
      g.save();
      g.globalAlpha = a;
      g.translate(540, cy + (1 - a) * 14);
      D.rr(g, -bw / 2, -bh / 2, bw, bh, 30); D.fill(g, o.bg || 'rgba(12,20,40,0.55)');
      let k = 0;
      lines.forEach((line, li) => {
        const y = -bh / 2 + padY + lh * (li + 0.5);
        let x = -widths[li] / 2;
        line.forEach(w => {
          const tk = toks[k], tm = wt(k); k++;
          const ww = D.measure(g, w, size, 800), sp = D.measure(g, ' ', size, 800);
          const live = tm && t >= tm.t0 - 0.02 && t < tm.t1 - 0.02;
          const pop = tm ? M.clamp(M.spring(t - tm.t0 + 0.03, 'snappy'), 0, 1) * (1 - M.clamp(M.spring(t - tm.t1 - 0.06, 'snappy'), 0, 1)) : 0;
          g.save(); g.translate(x + ww / 2, y); g.scale(1 + 0.06 * pop, 1 + 0.06 * pop);
          D.text(g, w, 0, 2, { size, weight: 800, color: tk.em || live ? C.amber : C.white, align: 'center' });
          g.restore();
          x += ww + sp;
        });
      });
      g.restore();
    }
  }

  /** A big keyword that slams in (scale 1.35 → 1 on a snappy spring) and pops out. */
  function slam(g, str, x, y, t, tIn, tOut, o = {}) {
    const a = M.clamp(M.spring(t - tIn, 'snappy') * 1.8, 0, 1);
    const out = tOut != null ? M.clamp(M.spring(t - tOut, 'snappy'), 0, 1) : 0;
    if (a * (1 - out) < 0.002) return;
    const sc = 1 + 0.35 * (1 - M.clamp(M.spring(t - tIn, 'default'), 0, 1.04)) - 0.25 * out;
    g.save(); g.globalAlpha *= a * (1 - out); g.translate(x, y); g.scale(sc, sc);
    if (o.pill === false) {
      D.text(g, str, 0, 0, { size: o.size || 120, weight: 900, color: o.color || C.white, track: -2 });
    } else {
      D.pill(g, str, 0, 0, { size: o.size || 44, bg: o.bg || C.white, color: o.color || C.ink, track: 2 });
    }
    g.restore();
  }

  /** Small label with a leader line to (px,py). Pops in at tIn. */
  function label(g, str, x, y, t, tIn, o = {}) {
    const p = M.clamp(M.spring(t - tIn, 'default'), 0, 1.06);
    if (p <= 0.002) return;
    const out = o.tOut != null ? 1 - M.clamp(M.spring(t - o.tOut, 'snappy'), 0, 1) : 1;
    g.save(); g.globalAlpha *= M.clamp(p * 1.5, 0, 1) * out;
    if (o.to) {
      g.strokeStyle = o.line || D.rgba('#FFFFFF', 0.8); g.lineWidth = 4; g.setLineDash([2, 10]); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(M.lerp(x, o.to[0], M.clamp(p, 0, 1)), M.lerp(y, o.to[1], M.clamp(p, 0, 1))); g.stroke(); g.setLineDash([]);
    }
    g.translate(x, y); g.scale(0.7 + 0.3 * p, 0.7 + 0.3 * p);
    D.pill(g, str, 0, 0, { size: o.size || 34, bg: o.bg || C.white, color: o.color || C.ink, shadow: o.shadow, track: 1 });
    g.restore();
  }

  function header(g, series, topic, o = {}) {
    if (!series) return;
    const str = topic ? `${series} · ${topic}`.toUpperCase() : series.toUpperCase();
    const y = o.y || 262, w = D.measure(g, str, 28, 800, 4) + 48;
    g.save();
    D.rr(g, 540 - w / 2, y - 25, w, 50, 25); D.fill(g, 'rgba(14,24,52,0.32)');
    D.text(g, str, 540, y + 1, { size: 28, weight: 800, color: o.color || D.rgba('#FFFFFF', 0.96), track: 4 });
    g.restore();
  }

  /** Speech bubble that pops from its tail point (x,y). p = 0..1 (use T.in). side: 'left' tail on the left, 'right'. */
  function bubble(g, str, x, y, p, o = {}) {
    if (p <= 0.002) return;
    const size = o.size || 46, padX = 34, h = size * 1.9, side = o.side || 'left';
    const w = D.measure(g, str, size, 800) + padX * 2;
    const bx = side === 'left' ? x + 30 : x - 30 - w, by = y - h - 34;
    g.save(); g.translate(x, y); g.scale(M.clamp(p, 0, 1.1), M.clamp(p, 0, 1.1)); g.translate(-x, -y);
    g.globalAlpha *= M.clamp(p * 2, 0, 1);
    D.softShadow(g, 24, 10, 0.22);
    D.rr(g, bx, by, w, h, h / 2); D.fill(g, o.bg || '#FFFFFF');
    g.beginPath(); g.moveTo(x, y); g.lineTo(bx + (side === 'left' ? 34 : w - 34), by + h - 6); g.lineTo(bx + (side === 'left' ? 84 : w - 84), by + h - 6); g.closePath(); D.fill(g, o.bg || '#FFFFFF');
    D.noShadow(g);
    D.text(g, str, bx + w / 2, by + h / 2 + 2, { size, weight: 800, color: o.color || C.ink });
    g.restore();
  }

  window.UI = { SAFE, parse, captions, slam, label, header, bubble };
})();
