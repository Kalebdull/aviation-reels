/* props.js — reusable cartoon props. All drawn around their own origin; place them with D.at() or the x,y args.
 *   plane(g, x, y, o)      o: { view:'side'|'rear'|'top', s, rot, bank, t, flip, prop:true, gear:true, lights:true, stripe }
 *   person(g, x, y, o)     o: { s, facing:1|-1, arm: radians, t, shirt, skin, hair, walk }
 *   vorStation(g, x, y, o) o: { s, t, rings: 0..1 }
 *   vorSymbol(g, x, y, o)  chart symbol: hexagon in a compass rose. o: { r, rose:true, color }
 *   runway(g, x, y, o)     top-down. o: { len, wid, rot, num:'27' }
 *   approachView(g, t, o)  windshield view of a runway in fog with the rabbit. o: { reveal 0..1, fog 0..1, pal }
 *   compassRose(g, x, y, r, o) o: { rot, labels:true, color }
 */
(function () {
  const M = window.M, D = window.D, C = D.C;

  const PLANE = { body: '#FFFFFF', shade: '#D9E2EF', stripe: '#2F5BEA', pin: '#FF6A5C', glass: '#26375F', glassHi: '#5C7BB8', tire: '#2A3150', metal: '#B9C3D3' };

  function plane(g, x, y, o = {}) {
    const view = o.view || 'side', s = o.s || 1, t = o.t || 0, P = Object.assign({}, PLANE, o.colors || {});
    if (o.stripe) P.stripe = o.stripe;
    g.save(); g.translate(x, y); if (o.rot) g.rotate(o.rot); g.scale(s * (o.flip ? -1 : 1), s);
    if (view === 'side') side(g, P, t, o); else if (view === 'rear') rear(g, P, t, o); else top(g, P, t, o);
    g.restore();
  }

  function side(g, P, t, o) {
    // horizontal stabiliser (far side, darker)
    D.rr(g, -222, -16, 92, 14, 7); D.fill(g, P.shade);
    // fin
    g.beginPath(); g.moveTo(-150, -22); g.lineTo(-205, -124); g.quadraticCurveTo(-216, -130, -222, -118); g.lineTo(-214, -20); g.closePath(); D.fill(g, P.body);
    g.beginPath(); g.moveTo(-205, -124); g.quadraticCurveTo(-216, -130, -222, -118); g.lineTo(-219, -92); g.lineTo(-191, -98); g.closePath(); D.fill(g, P.stripe);
    // fuselage
    const body = () => {
      g.beginPath();
      g.moveTo(-214, -22);
      g.quadraticCurveTo(-120, -40, -60, -56);
      g.quadraticCurveTo(40, -62, 120, -40);
      g.quadraticCurveTo(206, -26, 208, 2);
      g.quadraticCurveTo(206, 34, 140, 40);
      g.quadraticCurveTo(20, 50, -60, 34);
      g.quadraticCurveTo(-150, 16, -214, -4);
      g.closePath();
    };
    body(); D.fill(g, P.body);
    g.save(); body(); g.clip();
    g.fillStyle = P.shade; g.fillRect(-230, 14, 460, 60);                 // belly shade
    g.fillStyle = P.stripe; g.beginPath(); g.moveTo(-216, -12); g.quadraticCurveTo(0, 2, 212, -4); g.lineTo(212, 10); g.quadraticCurveTo(0, 16, -216, 0); g.closePath(); g.fill();
    g.fillStyle = P.pin; g.beginPath(); g.moveTo(-216, 3); g.quadraticCurveTo(0, 19, 212, 13); g.lineTo(212, 17); g.quadraticCurveTo(0, 23, -216, 7); g.closePath(); g.fill();
    g.restore();
    // windows
    g.beginPath(); g.moveTo(40, -54); g.lineTo(104, -44); g.quadraticCurveTo(118, -40, 112, -26); g.lineTo(44, -26); g.closePath(); D.fill(g, P.glass);
    D.rr(g, -36, -50, 64, 24, 9); D.fill(g, P.glass);
    g.beginPath(); g.moveTo(50, -50); g.lineTo(66, -48); g.lineTo(56, -30); g.lineTo(46, -30); g.closePath(); D.fill(g, D.rgba(P.glassHi, 0.8));
    D.rr(g, -30, -46, 12, 16, 4); D.fill(g, D.rgba(P.glassHi, 0.7));
    // high wing (seen edge-on) + strut
    D.rr(g, -64, -78, 186, 20, 10); D.fill(g, P.body);
    D.rr(g, -64, -66, 186, 8, 4); D.fill(g, P.shade);
    g.strokeStyle = P.metal; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(66, -60); g.lineTo(10, 22); g.stroke();
    // gear
    if (o.gear !== false) {
      g.strokeStyle = P.metal; g.lineWidth = 8;
      g.beginPath(); g.moveTo(-4, 34); g.lineTo(-18, 70); g.moveTo(150, 30); g.lineTo(152, 66); g.stroke();
      [[-20, 76, 17], [152, 72, 13]].forEach(([cx, cy, r]) => { D.circle(g, cx, cy, r); D.fill(g, P.tire); D.circle(g, cx, cy, r * 0.42); D.fill(g, P.metal); });
    }
    // spinner + prop
    g.beginPath(); g.moveTo(204, -16); g.quadraticCurveTo(236, 0, 204, 16); g.closePath(); D.fill(g, P.pin);
    if (o.prop !== false) {
      const ph = t * 52;
      g.save(); g.globalAlpha *= 0.22; g.beginPath(); g.ellipse(222, 0, 9, 92, 0, 0, Math.PI * 2); D.fill(g, '#9FB0C8'); g.restore();
      for (let k = 0; k < 2; k++) { const a = ph + k * Math.PI; const len = 90 * Math.cos(a); D.rr(g, 218, Math.min(0, len), 8, Math.abs(len), 4); D.fill(g, D.rgba('#55627E', 0.55)); }
    }
    if (o.lights !== false) {
      D.circle(g, 118, -68, 5); D.fill(g, '#FF4D4D');
      if ((t * 1.1) % 1 < 0.08) { D.circle(g, -216, -120, 7); D.fill(g, '#FFFFFF'); D.circle(g, -216, -120, 18); D.fill(g, 'rgba(255,255,255,0.35)'); }
    }
  }

  function rear(g, P, t, o) {
    if (o.bank) g.rotate(o.bank);
    // wings
    D.rr(g, -330, -64, 660, 22, 11); D.fill(g, P.body); D.rr(g, -330, -50, 660, 8, 4); D.fill(g, P.shade);
    D.circle(g, -326, -54, 6); D.fill(g, '#FF4D4D'); D.circle(g, 326, -54, 6); D.fill(g, '#22D36B');
    // struts
    g.strokeStyle = P.metal; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-150, -48); g.lineTo(-34, 14); g.moveTo(150, -48); g.lineTo(34, 14); g.stroke();
    // horizontal tail
    D.rr(g, -120, -6, 240, 16, 8); D.fill(g, P.shade);
    // fuselage cross-section
    g.beginPath(); g.ellipse(0, 0, 50, 56, 0, 0, Math.PI * 2); D.fill(g, P.body);
    g.save(); g.beginPath(); g.ellipse(0, 0, 50, 56, 0, 0, Math.PI * 2); g.clip(); g.fillStyle = P.shade; g.fillRect(-60, 18, 120, 50); g.fillStyle = P.stripe; g.fillRect(-60, 0, 120, 12); g.restore();
    // fin
    g.beginPath(); g.moveTo(-10, -40); g.lineTo(-6, -150); g.quadraticCurveTo(0, -158, 6, -150); g.lineTo(10, -40); g.closePath(); D.fill(g, P.body);
    D.rr(g, -7, -152, 14, 28, 6); D.fill(g, P.stripe);
    if (o.gear !== false) {
      g.strokeStyle = P.metal; g.lineWidth = 8;
      g.beginPath(); g.moveTo(-30, 40); g.lineTo(-74, 92); g.moveTo(30, 40); g.lineTo(74, 92); g.stroke();
      [-78, 78].forEach(cx => { D.rr(g, cx - 10, 84, 20, 34, 9); D.fill(g, P.tire); });
    }
  }

  function top(g, P, t, o) {
    // nose points right (+x)
    D.rr(g, -60, -300, 110, 600, 40); D.fill(g, P.body);                 // wing
    D.rr(g, -60, -300, 30, 600, 15); D.fill(g, P.shade);
    D.circle(g, -10, -298, 7); D.fill(g, '#FF4D4D'); D.circle(g, -10, 298, 7); D.fill(g, '#22D36B');
    D.rr(g, -232, -88, 64, 176, 26); D.fill(g, P.body);                   // stabiliser
    g.beginPath(); g.moveTo(-230, -10); g.quadraticCurveTo(-60, -50, 120, -40); g.quadraticCurveTo(210, -30, 214, 0); g.quadraticCurveTo(210, 30, 120, 40); g.quadraticCurveTo(-60, 50, -230, 10); g.closePath(); D.fill(g, P.body);
    g.fillStyle = P.stripe; g.fillRect(-180, -4, 380, 8);
    D.rr(g, 70, -32, 60, 64, 22); D.fill(g, P.glass);
    D.rr(g, -236, -6, 40, 12, 6); D.fill(g, P.stripe);
    if (o.prop !== false) { g.save(); g.globalAlpha *= 0.25; g.beginPath(); g.ellipse(222, 0, 10, 86, 0, 0, Math.PI * 2); D.fill(g, '#9FB0C8'); g.restore(); }
    g.beginPath(); g.moveTo(210, -14); g.quadraticCurveTo(238, 0, 210, 14); g.closePath(); D.fill(g, P.pin);
  }

  function person(g, x, y, o = {}) {
    const s = o.s || 1, f = o.facing || 1, t = o.t || 0;
    const skin = o.skin || '#F2C29B', shirt = o.shirt || '#FF8A3D', pants = o.pants || '#2E3A66', hair = o.hair || '#2B2230';
    const bob = o.walk ? Math.abs(Math.sin(t * 7)) * 6 : Math.sin(t * 2.2) * 2;
    g.save(); g.translate(x, y - bob); g.scale(s * f, s);
    // legs
    const lw = o.walk ? Math.sin(t * 7) * 0.4 : 0;
    g.strokeStyle = pants; g.lineWidth = 22; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-10, -60); g.lineTo(-10 - 40 * Math.sin(lw), -6); g.moveTo(10, -60); g.lineTo(10 + 40 * Math.sin(lw), -6); g.stroke();
    // body
    D.rr(g, -36, -170, 72, 120, 34); D.fill(g, shirt);
    D.rr(g, -36, -86, 72, 34, 16); D.fill(g, D.rgba('#000000', 0.08));
    // arm (towards facing direction)
    const a = o.arm != null ? o.arm : 0.25;
    g.strokeStyle = shirt; g.lineWidth = 20;
    g.beginPath(); g.moveTo(14, -150); g.lineTo(14 + Math.sin(a) * 74, -150 + Math.cos(a) * 74); g.stroke();
    D.circle(g, 14 + Math.sin(a) * 82, -150 + Math.cos(a) * 82, 11); D.fill(g, skin);
    // head
    D.circle(g, 0, -206, 40); D.fill(g, skin);
    g.beginPath(); g.arc(-4, -212, 41, Math.PI * 0.95, Math.PI * 2.05); g.closePath(); D.fill(g, hair);
    D.circle(g, 18, -206, 5); D.fill(g, '#1C2A4D');
    g.restore();
  }

  function vorStation(g, x, y, o = {}) {
    const s = o.s || 1, t = o.t || 0;
    g.save(); g.translate(x, y); g.scale(s, s);
    if (o.rings) {
      for (let k = 0; k < 3; k++) {
        const u = ((t * 0.6 + k / 3) % 1);
        g.strokeStyle = D.rgba(C.amber, (1 - u) * 0.6 * o.rings); g.lineWidth = 6;
        g.beginPath(); g.ellipse(0, -60, 80 + u * 360, (80 + u * 360) * 0.35, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    g.beginPath(); g.ellipse(0, 0, 150, 40, 0, 0, Math.PI * 2); D.fill(g, '#E9EEF5');
    g.beginPath(); g.ellipse(0, -6, 150, 40, 0, 0, Math.PI * 2); D.fill(g, '#FFFFFF');
    // the classic white cone building
    g.beginPath(); g.moveTo(-70, -10); g.lineTo(-40, -110); g.lineTo(40, -110); g.lineTo(70, -10); g.closePath(); D.fill(g, '#FFFFFF');
    g.beginPath(); g.moveTo(-70, -10); g.lineTo(-40, -110); g.lineTo(-14, -110); g.lineTo(-30, -10); g.closePath(); D.fill(g, '#E2E8F1');
    D.rr(g, -46, -124, 92, 18, 8); D.fill(g, C.teal);
    g.strokeStyle = '#C8D2E0'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -124); g.lineTo(0, -170); g.stroke();
    D.circle(g, 0, -174, 9); D.fill(g, C.coral);
    g.restore();
  }

  function compassRose(g, x, y, r, o = {}) {
    const col = o.color || D.rgba('#FFFFFF', 0.75);
    g.save(); g.translate(x, y); g.rotate(o.rot || 0);
    g.strokeStyle = col; g.lineWidth = o.width || 4;
    D.circle(g, 0, 0, r); g.stroke();
    for (let d = 0; d < 360; d += 10) {
      const a = d * Math.PI / 180, l = d % 30 === 0 ? 26 : 13;
      g.beginPath(); g.moveTo(Math.sin(a) * r, -Math.cos(a) * r); g.lineTo(Math.sin(a) * (r - l), -Math.cos(a) * (r - l)); g.stroke();
    }
    if (o.labels !== false) {
      for (const [d, lab] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
        const a = d * Math.PI / 180;
        g.save(); g.translate(Math.sin(a) * (r - 56), -Math.cos(a) * (r - 56)); g.rotate(-(o.rot || 0) * (o.uprightLabels ? 1 : 0));
        D.text(g, lab, 0, 0, { size: o.labelSize || 36, weight: 800, color: col });
        g.restore();
      }
    }
    g.restore();
  }

  function vorSymbol(g, x, y, o = {}) {
    const r = o.r || 46, col = o.color || C.teal;
    g.save(); g.translate(x, y);
    if (o.rose) compassRose(g, 0, 0, o.roseR || 230, { color: o.roseColor || D.rgba('#FFFFFF', 0.5), rot: 0 });
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.lineWidth = 8; g.strokeStyle = col; g.lineJoin = 'round'; g.stroke(); D.fill(g, D.rgba(col, 0.18));
    D.circle(g, 0, 0, 8); D.fill(g, col);
    g.restore();
  }

  function runway(g, x, y, o = {}) {
    const len = o.len || 900, wid = o.wid || 130;
    g.save(); g.translate(x, y); g.rotate(o.rot || 0);
    D.rr(g, -len / 2, -wid / 2, len, wid, 14); D.fill(g, '#4A5068');
    g.fillStyle = '#FFFFFF';
    for (let k = -len / 2 + 200; k < len / 2 - 200; k += 80) g.fillRect(k, -4, 44, 8);
    for (const sgn of [-1, 1]) for (let i = 0; i < 4; i++) {
      g.fillRect(sgn * (len / 2 - 60) - 20, -wid / 2 + 14 + i * (wid - 28) / 4 + 2, 40, (wid - 28) / 4 - 6);
    }
    if (o.num) { g.save(); g.translate(-len / 2 + 130, 0); g.rotate(Math.PI / 2); D.text(g, o.num, 0, 0, { size: 46, weight: 900, color: '#FFFFFF' }); g.restore(); }
    g.restore();
  }

  /** Pilot's-eye windshield view of a precision approach. reveal 0 = all fog, 1 = clear. */
  function approachView(g, t, o = {}) {
    const W = 1080, H = 1920, hz = o.horizon || 900, fogA = o.fog != null ? o.fog : 1 - (o.reveal || 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = D.vgrad(g, 0, hz, ['#5E6F8E', '#9AA8BE']); g.fillRect(0, 0, W, hz);
    g.fillStyle = D.vgrad(g, hz, H, ['#55704F', '#2E4632']); g.fillRect(0, hz, W, H - hz);
    // perspective helpers: ground point at distance d (0 = near, 1 = horizon), lateral u (-1..1)
    const P = (u, d) => { const k = 1 / (1 + d * 18); return [540 + u * 900 * k, hz + (H - hz) * k * 0.95]; };
    // runway trapezoid
    const rw = 0.16;
    const a = P(-rw, 0.35), b = P(rw, 0.35), c = P(rw, 6), e = P(-rw, 6);
    g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.lineTo(...e); g.closePath(); D.fill(g, '#4B4F5E');
    // centre line
    g.fillStyle = '#E8ECF2';
    for (let d = 0.45; d < 6; d += 0.45) { const p1 = P(-0.006, d), p2 = P(0.006, d + 0.2); g.fillRect(p1[0], p2[1], p2[0] - p1[0], p1[1] - p2[1]); }
    // green threshold bar + edge lights
    for (let i = -8; i <= 8; i++) { const [lx, ly] = P(i * rw / 8, 0.35); D.circle(g, lx, ly, 7); D.fill(g, '#36F08A'); }
    for (let d = 0.5; d < 6; d += 0.35) for (const sgn of [-1, 1]) { const [lx, ly] = P(sgn * rw * 1.05, d); D.circle(g, lx, ly, Math.max(1.5, 7 / (1 + d * 2))); D.fill(g, '#FFF6D8'); }
    // approach light bars before the threshold + the rabbit racing toward it
    const rab = (t * 2.0) % 1;
    for (let i = 0; i < 12; i++) {
      const d = 0.33 - i * 0.025, [lx, ly] = P(0, d);
      const k = 1 / (1 + d * 18);
      for (let j = -2; j <= 2; j++) { D.circle(g, lx + j * 30 * k * 3, ly, 6 * k * 3); D.fill(g, '#FFF2C4'); }
      const on = Math.abs(rab - (1 - i / 11)) < 0.06;
      if (on) { D.circle(g, lx, ly, 26 * k * 3); D.fill(g, 'rgba(255,255,255,0.95)'); D.circle(g, lx, ly, 60 * k * 3); D.fill(g, 'rgba(255,255,255,0.25)'); }
    }
    // fog
    g.globalAlpha = M.clamp(fogA, 0, 1); g.fillStyle = D.vgrad(g, 0, H, ['#C9D2DD', '#D5DCE5', '#B7C2CF']); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    // glare shield
    if (o.glare !== false) {
      g.beginPath(); g.moveTo(0, 1500); g.quadraticCurveTo(540, 1380, 1080, 1500); g.lineTo(1080, H); g.lineTo(0, H); g.closePath(); D.fill(g, '#1B2238');
      g.beginPath(); g.moveTo(0, 1500); g.quadraticCurveTo(540, 1380, 1080, 1500); g.lineTo(1080, 1520); g.quadraticCurveTo(540, 1400, 0, 1520); g.closePath(); D.fill(g, '#2A3352');
    }
    g.restore();
  }

  window.PROPS = { PLANE, plane, person, vorStation, vorSymbol, compassRose, runway, approachView };
})();
