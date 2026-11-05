/* instruments.js — real-looking, working flight instruments in the flat cartoon style.
 *   gauge(g, type, x, y, r, v, o)
 *     'asi'  v = knots                 'alt' v = feet (o.baro = '29.92')   'vsi' v = feet/min
 *     'ai'   v = { pitch (deg), bank (deg, right +) }                       'hi'  v = heading (deg)
 *     'cdi'  v = { obs (deg), dev (-1..1 = full scale), flag: 'TO'|'FROM'|'OFF' }
 *   Mechanisms for "show the inside":
 *     tube(g, pts, t, o)        a pipe with air dots flowing (o.flow 0..1, o.color, o.width)
 *     capsule(g, x, y, s, k)    aneroid wafer stack, k = expansion 0..1
 *     panel(g, x, y, w, h)      the dark panel slab the gauges sit in
 * Colours follow the meaning rules: amber = air/signal, teal = good, coral = warning.
 */
(function () {
  const M = window.M, D = window.D, C = D.C;
  const rad = d => d * Math.PI / 180;

  function face(g, r) {
    D.softShadow(g, 40, 18, 0.35);
    D.circle(g, 0, 0, r * 1.12); D.fill(g, C.panelEdge); D.noShadow(g);
    g.beginPath(); g.arc(0, 0, r * 1.12, Math.PI * 1.1, Math.PI * 1.9); g.arc(0, 0, r * 1.04, Math.PI * 1.9, Math.PI * 1.1, true); g.closePath(); D.fill(g, C.panelHi);
    D.circle(g, 0, 0, r); D.fill(g, '#141B33');
  }
  function glass(g, r) {
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
    g.beginPath(); g.ellipse(-r * 0.25, -r * 0.55, r * 0.9, r * 0.45, -0.35, 0, Math.PI * 2); D.fill(g, 'rgba(255,255,255,0.05)');
    g.restore();
  }
  function ticks(g, r, a0, a1, n, len, w, col = '#FFFFFF') {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
    for (let i = 0; i <= n; i++) {
      const a = rad(M.lerp(a0, a1, i / n));
      g.beginPath(); g.moveTo(Math.sin(a) * r, -Math.cos(a) * r); g.lineTo(Math.sin(a) * (r - len), -Math.cos(a) * (r - len)); g.stroke();
    }
  }
  function arcBand(g, r, a0, a1, w, col) {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'butt';
    g.beginPath(); g.arc(0, 0, r, rad(a0 - 90), rad(a1 - 90)); g.stroke();
  }
  function needle(g, a, len, o = {}) {
    g.save(); g.rotate(rad(a));
    D.softShadow(g, 10, 4, 0.4);
    g.beginPath(); g.moveTo(-(o.w || 9), 0); g.lineTo(-(o.w || 9) * 0.35, -len); g.lineTo((o.w || 9) * 0.35, -len); g.lineTo(o.w || 9, 0); g.lineTo(0, len * 0.18); g.closePath(); D.fill(g, o.color || '#FFFFFF');
    D.noShadow(g);
    if (o.tip !== false) { g.beginPath(); g.moveTo(-(o.w || 9) * 0.5, -len * 0.78); g.lineTo(-(o.w || 9) * 0.35, -len); g.lineTo((o.w || 9) * 0.35, -len); g.lineTo((o.w || 9) * 0.5, -len * 0.78); g.closePath(); D.fill(g, o.tipColor || C.amber); }
    g.restore();
  }
  function hub(g, r) { D.circle(g, 0, 0, r * 0.09); D.fill(g, '#2B3458'); D.circle(g, 0, 0, r * 0.04); D.fill(g, '#9AA6C4'); }
  function label(g, s, x, y, size, col = '#FFFFFF', weight = 800) { D.text(g, s, x, y, { size, weight, color: col }); }

  const asiAngle = v => v <= 40 ? (v / 40) * 24 : 24 + ((Math.min(v, 210) - 40) / 170) * 316;

  function asi(g, r, v) {
    arcBand(g, r * 0.9, asiAngle(33), asiAngle(85), r * 0.06, '#FFFFFF');
    arcBand(g, r * 0.84, asiAngle(44), asiAngle(129), r * 0.07, '#2BD37A');
    arcBand(g, r * 0.84, asiAngle(129), asiAngle(163), r * 0.07, '#FFD23F');
    g.save(); g.rotate(rad(asiAngle(163))); g.fillStyle = '#FF4B4B'; g.fillRect(-r * 0.025, -r * 0.93, r * 0.05, r * 0.16); g.restore();
    for (let k = 40; k <= 200; k += 10) {
      const a = rad(asiAngle(k)), l = k % 20 === 0 ? r * 0.16 : r * 0.09;
      g.strokeStyle = '#FFFFFF'; g.lineWidth = r * 0.025; g.beginPath(); g.moveTo(Math.sin(a) * r * 0.97, -Math.cos(a) * r * 0.97); g.lineTo(Math.sin(a) * (r * 0.97 - l), -Math.cos(a) * (r * 0.97 - l)); g.stroke();
      if (k % 20 === 0) label(g, String(k), Math.sin(a) * r * 0.62, -Math.cos(a) * r * 0.62, r * 0.15);
    }
    label(g, 'KNOTS', 0, r * 0.34, r * 0.1, '#AAB6D6', 700);
    needle(g, asiAngle(Math.max(0, v)), r * 0.86);
    hub(g, r);
  }

  function alt(g, r, v, o) {
    ticks(g, r * 0.97, 0, 360, 50, r * 0.08, r * 0.018);
    ticks(g, r * 0.97, 0, 360, 10, r * 0.16, r * 0.035);
    for (let i = 0; i < 10; i++) { const a = rad(i * 36); label(g, String(i), Math.sin(a) * r * 0.68, -Math.cos(a) * r * 0.68, r * 0.2); }
    // Kollsman window
    D.rr(g, r * 0.3, -r * 0.09, r * 0.42, r * 0.18, r * 0.04); D.fill(g, '#0B1024');
    label(g, o.baro || '29.92', r * 0.51, 0, r * 0.1, '#FFFFFF', 700);
    label(g, 'ALT', 0, -r * 0.3, r * 0.1, '#AAB6D6', 700);
    needle(g, ((v % 10000) / 10000) * 360, r * 0.5, { w: 13, tip: false, color: '#E4E9F4' });
    needle(g, ((v % 1000) / 1000) * 360, r * 0.84);
    hub(g, r);
  }

  function vsi(g, r, v) {
    const ang = f => -90 + M.clamp(f / 2000, -1, 1) * 170;  // 0 at 9 o'clock, up = clockwise
    for (let f = -2000; f <= 2000; f += 100) {
      const a = rad(ang(f)), l = f % 500 === 0 ? r * 0.16 : r * 0.08;
      g.strokeStyle = '#FFFFFF'; g.lineWidth = f % 500 === 0 ? r * 0.035 : r * 0.018;
      g.beginPath(); g.moveTo(Math.sin(a) * r * 0.97, -Math.cos(a) * r * 0.97); g.lineTo(Math.sin(a) * (r * 0.97 - l), -Math.cos(a) * (r * 0.97 - l)); g.stroke();
      if (f % 500 === 0 && f !== 0) label(g, String(Math.abs(f / 100)), Math.sin(a) * r * 0.66, -Math.cos(a) * r * 0.66, r * 0.15);
    }
    label(g, '0', -r * 0.66, 0, r * 0.17);
    label(g, 'UP', -r * 0.3, -r * 0.3, r * 0.11, '#AAB6D6', 800);
    label(g, 'DN', -r * 0.3, r * 0.3, r * 0.11, '#AAB6D6', 800);
    label(g, 'FT/MIN ×100', r * 0.12, r * 0.44, r * 0.08, '#7F8BAE', 700);
    needle(g, ang(v), r * 0.86);
    hub(g, r);
  }

  function ai(g, r, v) {
    const pitch = v.pitch || 0, bank = v.bank || 0;
    g.save(); g.beginPath(); g.arc(0, 0, r * 0.98, 0, Math.PI * 2); g.clip();
    g.rotate(rad(-bank)); g.translate(0, pitch * r * 0.025);
    g.fillStyle = '#3FA0EE'; g.fillRect(-r * 2, -r * 2, r * 4, r * 2);
    g.fillStyle = '#B9773F'; g.fillRect(-r * 2, 0, r * 4, r * 2);
    g.fillStyle = '#FFFFFF'; g.fillRect(-r * 2, -r * 0.012, r * 4, r * 0.024);
    for (const p of [-20, -10, 10, 20]) { const y = -p * r * 0.025, w = (Math.abs(p) === 10 ? 0.22 : 0.34) * r; g.fillRect(-w / 2, y - 2, w, 4); }
    g.restore();
    // bank scale (fixed) and pointer (moves with the horizon)
    for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const a = rad(b), l = (b % 30 === 0) ? r * 0.14 : r * 0.08;
      g.strokeStyle = '#FFFFFF'; g.lineWidth = r * 0.03;
      g.beginPath(); g.moveTo(Math.sin(a) * r * 0.96, -Math.cos(a) * r * 0.96); g.lineTo(Math.sin(a) * (r * 0.96 - l), -Math.cos(a) * (r * 0.96 - l)); g.stroke();
    }
    g.save(); g.rotate(rad(-bank));
    g.beginPath(); g.moveTo(0, -r * 0.8); g.lineTo(-r * 0.06, -r * 0.7); g.lineTo(r * 0.06, -r * 0.7); g.closePath(); D.fill(g, C.amber);
    g.restore();
    // miniature airplane (fixed)
    g.fillStyle = C.amber;
    D.rr(g, -r * 0.5, -r * 0.03, r * 0.32, r * 0.06, r * 0.03); g.fill();
    D.rr(g, r * 0.18, -r * 0.03, r * 0.32, r * 0.06, r * 0.03); g.fill();
    D.circle(g, 0, 0, r * 0.05); g.fill();
  }

  function hi(g, r, v) {
    g.save(); g.rotate(rad(-v));
    ticks(g, r * 0.97, 0, 360, 72, r * 0.07, r * 0.02);
    ticks(g, r * 0.97, 0, 360, 36, r * 0.13, r * 0.03);
    const labs = { 0: 'N', 30: '3', 60: '6', 90: 'E', 120: '12', 150: '15', 180: 'S', 210: '21', 240: '24', 270: 'W', 300: '30', 330: '33' };
    for (const [d, s] of Object.entries(labs)) {
      g.save(); g.rotate(rad(+d)); label(g, s, 0, -r * 0.68, r * (s.length > 1 && !isNaN(s) ? 0.15 : 0.19), /[NESW]/.test(s) ? C.amber : '#FFFFFF'); g.restore();
    }
    g.restore();
    g.beginPath(); g.moveTo(0, -r * 0.98); g.lineTo(-r * 0.06, -r * 0.86); g.lineTo(r * 0.06, -r * 0.86); g.closePath(); D.fill(g, C.amber);
    g.save(); g.scale(r / 300, r / 300); g.fillStyle = '#FFFFFF';
    D.rr(g, -12, -90, 24, 170, 12); g.fill(); D.rr(g, -110, -20, 220, 26, 13); g.fill(); D.rr(g, -50, 60, 100, 18, 9); g.fill();
    g.restore();
  }

  function cdi(g, r, v) {
    const obs = v.obs || 0, dev = M.clamp(v.dev || 0, -1.2, 1.2), flag = v.flag || 'TO';
    g.save(); g.rotate(rad(-obs));
    ticks(g, r * 0.97, 0, 360, 72, r * 0.07, r * 0.02);
    ticks(g, r * 0.97, 0, 360, 36, r * 0.13, r * 0.03);
    for (let d = 0; d < 360; d += 30) { g.save(); g.rotate(rad(d)); label(g, String(d / 10), 0, -r * 0.72, r * 0.15); g.restore(); }
    g.restore();
    // course index (top) and reciprocal (bottom)
    g.beginPath(); g.moveTo(0, -r * 0.99); g.lineTo(-r * 0.07, -r * 0.85); g.lineTo(r * 0.07, -r * 0.85); g.closePath(); D.fill(g, C.amber);
    g.fillStyle = '#FFFFFF'; g.fillRect(-r * 0.02, r * 0.86, r * 0.04, r * 0.12);
    // dots
    for (let i = -5; i <= 5; i++) { if (!i) continue; D.circle(g, i * r * 0.1, 0, r * 0.022); D.fill(g, '#FFFFFF'); }
    D.circle(g, 0, 0, r * 0.11); g.strokeStyle = '#FFFFFF'; g.lineWidth = r * 0.02; g.stroke();
    // TO/FROM flag: a triangle pointing up (TO) or down (FROM)
    if (flag !== 'OFF') {
      g.save(); g.translate(r * 0.34, flag === 'TO' ? -r * 0.26 : r * 0.26);
      g.beginPath();
      if (flag === 'TO') { g.moveTo(0, -r * 0.1); g.lineTo(-r * 0.1, r * 0.07); g.lineTo(r * 0.1, r * 0.07); }
      else { g.moveTo(0, r * 0.1); g.lineTo(-r * 0.1, -r * 0.07); g.lineTo(r * 0.1, -r * 0.07); }
      g.closePath(); D.fill(g, '#FFFFFF');
      g.restore();
    } else {
      D.rr(g, r * 0.22, -r * 0.08, r * 0.28, r * 0.16, r * 0.03); D.fill(g, C.coral);
      label(g, 'OFF', r * 0.36, 0, r * 0.09, '#FFFFFF', 900);
    }
    // the needle
    D.softShadow(g, 8, 3, 0.4);
    g.fillStyle = '#FFFFFF'; g.fillRect(dev * r * 0.5 - r * 0.018, -r * 0.62, r * 0.036, r * 1.24);
    D.noShadow(g);
    // OBS knob
    D.circle(g, -r * 0.88, r * 0.88, r * 0.17); D.fill(g, C.panelHi);
    label(g, 'OBS', -r * 0.88, r * 0.88, r * 0.07, '#AAB6D6', 800);
  }

  const DRAW = { asi, alt, vsi, ai, hi, cdi };
  function gauge(g, type, x, y, r, v, o = {}) {
    g.save(); g.translate(x, y); if (o.s) g.scale(o.s, o.s);
    face(g, r);
    DRAW[type](g, r, v, o);
    glass(g, r);
    g.restore();
  }

  function panel(g, x, y, w, h, o = {}) {
    g.save(); D.softShadow(g, 60, 30, 0.35);
    D.rr(g, x, y, w, h, o.r || 48); D.fill(g, o.color || C.panel); D.noShadow(g);
    D.rr(g, x, y, w, 10, 5); D.fill(g, D.rgba('#FFFFFF', 0.06));
    g.restore();
  }

  function tube(g, pts, t, o = {}) {
    const w = o.width || 34, col = o.color || C.amber, flow = o.flow != null ? o.flow : 1;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = o.wall || '#C9D3E3'; g.lineWidth = w + 14;
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.strokeStyle = o.inside || '#2A3456'; g.lineWidth = w;
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    g.restore();
    if (flow > 0.01) { g.save(); g.globalAlpha *= M.clamp(flow, 0, 1); D.flowLine(g, pts, t, { color: col, lineAlpha: 0, dot: w * 0.22, gap: w * 1.6, speed: (o.speed || 260) * flow }); g.restore(); }
  }

  function capsule(g, x, y, s, k) {
    g.save(); g.translate(x, y); g.scale(s, s);
    const n = 3, gap = 18 + 22 * k;
    for (let i = 0; i < n; i++) {
      const cy = -i * (34 + gap);
      g.beginPath(); g.ellipse(0, cy, 120, 18 + 12 * k, 0, 0, Math.PI * 2); D.fill(g, '#E7B659');
      g.beginPath(); g.ellipse(0, cy - 6, 120, 18 + 12 * k, 0, Math.PI, Math.PI * 2); D.fill(g, '#F7D58A');
      if (i < n - 1) { g.fillStyle = '#C99543'; g.fillRect(-14, cy - 34 - gap, 28, 34 + gap); }
    }
    g.restore();
  }

  window.INST = { gauge, panel, tube, capsule, asiAngle };
})();
