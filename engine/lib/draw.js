/* draw.js — the look. Palettes, shapes, type. Canvas 2D, 1080x1920. Everything is a pure function of its inputs.
 * Style: modern flowy cartoon. Flat fills, two-tone shading, no outlines, rounded everything, soft shadows.
 */
(function () {
  const M = window.M;

  // ---------- palettes ----------
  const PAL = {
    day: {
      sky: ['#3E9BEA', '#7FC3F5', '#CDEBFF'], sun: '#FFF1BF', sunCore: '#FFFBEA',
      cloud: '#FFFFFF', cloudShade: '#D3E7F8',
      hills: ['#A9DC92', '#7DC77C', '#5BB072'], ground: '#4E9E66', tree: '#3F8F5B', treeDark: '#2F7A4C',
      haze: 'rgba(214,238,255,0.55)', stars: 0,
    },
    golden: {
      sky: ['#3F57A6', '#E4917A', '#FFD49A'], sun: '#FFE1A8', sunCore: '#FFF6DE',
      cloud: '#FFE9D6', cloudShade: '#E9A99A',
      hills: ['#B98AA0', '#8E6F96', '#5E5383'], ground: '#4A4475', tree: '#3E3A68', treeDark: '#2F2C55',
      haze: 'rgba(255,214,170,0.45)', stars: 0,
    },
    night: {
      sky: ['#0C1430', '#1B2C5C', '#34508A'], sun: '#E8EEFF', sunCore: '#FFFFFF',
      cloud: '#3A4E86', cloudShade: '#283A6C',
      hills: ['#2C3E70', '#22325E', '#18244A'], ground: '#141E3E', tree: '#101935', treeDark: '#0B1229',
      haze: 'rgba(60,90,150,0.35)', stars: 1,
    },
    imc: {   // inside a cloud
      sky: ['#B9C6D3', '#CBD5DF', '#DCE3EA'], sun: '#FFFFFF', sunCore: '#FFFFFF',
      cloud: '#EEF2F6', cloudShade: '#C3CEDA',
      hills: ['#AEB9C4', '#A1ADB9', '#94A1AE'], ground: '#8C99A7', tree: '#808E9C', treeDark: '#738190',
      haze: 'rgba(225,232,239,0.8)', stars: 0,
    },
  };
  // meaning colours: identical in every palette
  const C = {
    ink: '#1C2A4D', inkSoft: '#47567A', white: '#FFFFFF', cream: '#FFF8EC',
    amber: '#FFB23F', amberSoft: '#FFD48A',     // signal, air, attention, the spoken word
    teal: '#1FC3A3', tealDark: '#139A80',       // good, locked, correct
    coral: '#FF6A5C', coralDark: '#E04B3F',     // error, warning, wrong
    blue: '#2F5BEA', sky: '#5BB4F5',
    panel: '#1D2643', panelEdge: '#2D3860', panelHi: '#3A4775',
  };

  // ---------- primitives ----------
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, Math.PI * 2); }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function softShadow(g, blur = 40, y = 18, a = 0.18, color = '20,30,60') {
    g.shadowColor = `rgba(${color},${a})`; g.shadowBlur = blur; g.shadowOffsetY = y; g.shadowOffsetX = 0;
  }
  function noShadow(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; g.shadowOffsetX = 0; }
  function vgrad(g, y0, y1, stops) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
    return gr;
  }
  function rgba(hex, a) { const [r, gg, b] = M.hexToRgb(hex); return `rgba(${r},${gg},${b},${a})`; }
  /** Run fn with a local transform; restores afterwards. */
  function at(g, x, y, rot, s, fn) {
    g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (s != null && s !== 1) g.scale(s, s); fn(); g.restore();
  }
  function alpha(g, a, fn) { if (a <= 0.001) return; g.save(); g.globalAlpha *= M.clamp(a, 0, 1); fn(); g.restore(); }

  // ---------- type ----------
  const FONT = 'Inter';
  function font(size, weight = 700) { return `${weight} ${size}px ${FONT}`; }
  /** text(g, str, x, y, {size, weight, color, align, base, track, alpha}) */
  function text(g, str, x, y, o = {}) {
    g.font = font(o.size || 48, o.weight || 700);
    g.fillStyle = o.color || C.ink;
    g.textAlign = o.align || 'center';
    g.textBaseline = o.base || 'middle';
    if ('letterSpacing' in g) g.letterSpacing = (o.track || 0) + 'px';
    g.fillText(str, x, y);
    if ('letterSpacing' in g) g.letterSpacing = '0px';
  }
  function measure(g, str, size, weight = 700, track = 0) {
    g.font = font(size, weight);
    if ('letterSpacing' in g) g.letterSpacing = track + 'px';
    const w = g.measureText(str).width;
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    return w;
  }
  /** Balanced wrap: brute-force line breaks that minimise the widest line. Returns array of word arrays. */
  function balance(g, words, maxW, size, weight = 700, maxLines = 3) {
    const n = words.length, wd = words.map(w => measure(g, w, size, weight)), sp = measure(g, ' ', size, weight);
    const lineW = (a, b) => wd.slice(a, b).reduce((s, v) => s + v, 0) + sp * (b - a - 1);
    let best = null;
    function rec(start, lines, acc) {
      if (start === n) { const m = Math.max(...acc.map(([a, b]) => lineW(a, b))); if (m <= maxW && (!best || m < best.m - 0.5 || (Math.abs(m - best.m) < 0.5 && acc.length < best.l.length))) best = { m, l: acc.slice() }; return; }
      if (lines === maxLines) return;
      for (let e = start + 1; e <= n; e++) { if (lineW(start, e) > maxW) break; acc.push([start, e]); rec(e, lines + 1, acc); acc.pop(); }
    }
    rec(0, 0, []);
    if (!best) return [words];
    return best.l.map(([a, b]) => words.slice(a, b));
  }

  // ---------- shapes the episodes reuse ----------
  /** Arrow from (x1,y1) to (x2,y2), drawn to progress p (0..1). */
  function arrow(g, x1, y1, x2, y2, p = 1, o = {}) {
    if (p <= 0) return;
    const w = o.width || 12, col = o.color || C.amber, head = o.head || 34;
    const x = M.lerp(x1, x2, p), y = M.lerp(y1, y2, p), a = Math.atan2(y2 - y1, x2 - x1);
    g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w; g.lineCap = 'round';
    const hb = Math.min(head * 0.8, Math.hypot(x - x1, y - y1));
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x - Math.cos(a) * hb, y - Math.sin(a) * hb); g.stroke();
    const hs = head * M.clamp(p * 3, 0, 1);
    g.beginPath(); g.moveTo(x + Math.cos(a) * hs * 0.25, y + Math.sin(a) * hs * 0.25);
    g.lineTo(x - Math.cos(a - 0.5) * hs, y - Math.sin(a - 0.5) * hs);
    g.lineTo(x - Math.cos(a + 0.5) * hs, y - Math.sin(a + 0.5) * hs); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 6; g.stroke(); g.fill();
    g.restore();
  }
  /** A line with dots travelling along it (signal / airflow). speed in px/s, t = global time. */
  function flowLine(g, pts, t, o = {}) {
    const col = o.color || C.amber, gap = o.gap || 60, speed = o.speed || 220, r = o.dot || 7;
    g.save(); g.strokeStyle = rgba(col, o.lineAlpha != null ? o.lineAlpha : 0.35); g.lineWidth = o.width || 6; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    const segs = []; let L = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push([L, l, i]); L += l; }
    g.fillStyle = col;
    for (let d = ((t * speed) % gap + gap) % gap; d < L; d += gap) {
      const s = segs.find(([s0, l]) => d >= s0 && d <= s0 + l); if (!s) continue;
      const u = (d - s[0]) / s[1], a = pts[s[2] - 1], b = pts[s[2]];
      const fade = M.clamp(Math.min(d, L - d) / 40, 0, 1);
      g.globalAlpha = fade; circle(g, M.lerp(a[0], b[0], u), M.lerp(a[1], b[1], u), r); g.fill();
    }
    g.restore();
  }
  /** Rounded pill with text. Returns its width. */
  function pill(g, str, x, y, o = {}) {
    const size = o.size || 40, pad = o.pad || size * 0.62, h = size * 1.7;
    const w = measure(g, str, size, o.weight || 800, o.track || 1) + pad * 2;
    g.save();
    if (o.shadow !== false) softShadow(g, 24, 10, 0.2);
    rr(g, x - w / 2, y - h / 2, w, h, h / 2); fill(g, o.bg || C.white); noShadow(g);
    text(g, str, x, y + 1, { size, weight: o.weight || 800, color: o.color || C.ink, track: o.track || 1 });
    g.restore();
    return w;
  }
  /** Glass card (rounded panel) */
  function card(g, x, y, w, h, o = {}) {
    g.save(); softShadow(g, o.blur || 50, o.dy || 22, o.shadow || 0.22);
    rr(g, x, y, w, h, o.r || 34); fill(g, o.color || 'rgba(255,250,242,0.94)'); noShadow(g); g.restore();
  }
  function check(g, x, y, r, p = 1, o = {}) {
    if (p <= 0) return;
    at(g, x, y, 0, 0.6 + 0.4 * M.clamp(p, 0, 1.1), () => {
      circle(g, 0, 0, r); fill(g, o.color || C.teal);
      g.strokeStyle = C.white; g.lineWidth = r * 0.22; g.lineCap = 'round'; g.lineJoin = 'round';
      const q = M.clamp((p - 0.3) / 0.7, 0, 1);
      g.beginPath(); g.moveTo(-r * 0.42, r * 0.02);
      const k1 = M.clamp(q * 2, 0, 1); g.lineTo(-r * 0.42 + r * 0.3 * k1, r * 0.02 + r * 0.3 * k1);
      if (q > 0.5) { const k2 = (q - 0.5) * 2; g.lineTo(-r * 0.12 + r * 0.56 * k2, r * 0.32 - r * 0.62 * k2); }
      g.stroke();
    });
  }
  function cross(g, x, y, r, p = 1) {
    if (p <= 0) return;
    at(g, x, y, 0, 0.6 + 0.4 * M.clamp(p, 0, 1.1), () => {
      circle(g, 0, 0, r); fill(g, C.coral);
      g.strokeStyle = C.white; g.lineWidth = r * 0.22; g.lineCap = 'round';
      const k = r * 0.36;
      g.beginPath(); g.moveTo(-k, -k); g.lineTo(k, k); g.moveTo(k, -k); g.lineTo(-k, k); g.stroke();
    });
  }
  function warn(g, x, y, s, p = 1) {
    if (p <= 0) return;
    at(g, x, y, 0, s * (0.6 + 0.4 * M.clamp(p, 0, 1.1)), () => {
      g.beginPath(); g.moveTo(0, -46); g.lineTo(52, 40); g.lineTo(-52, 40); g.closePath();
      g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = C.coral; g.stroke(); fill(g, C.coral);
      text(g, '!', 0, 10, { size: 64, weight: 900, color: C.white });
    });
  }
  /** Seeded value noise in 1D (smooth), for organic wobble without Math.random */
  function noise1(seed, x) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return M.lerp(M.hash01(seed, i), M.hash01(seed, i + 1), u) * 2 - 1;
  }

  window.D = { PAL, C, rr, circle, fill, softShadow, noShadow, vgrad, rgba, at, alpha, font, text, measure, balance,
    arrow, flowLine, pill, card, check, cross, warn, noise1 };
})();
