/* scenery.js — cartoon-show set pieces and characters. Extends window.PROPS.
 *   P.tower(g, x, y, {s, t})                      control tower, cab glass, rotating beacon
 *   P.controller(g, x, y, {s, t, talk, look})     ATC controller bust with headset; talk 0..1 animates the mouth
 *   P.storm(g, pal, x, y, {w, t, rain, flash})    dark cloud + rain; flash 0..1 = lightning (bolt + sky flash)
 *   P.airport(g, x, y, {t, s, pal})               side-on airfield: runway, taxiway, terminal, hangar, windsock
 *   P.racetrack(L, R)  → { len, at(d) → {x, y, h} }   holding/traffic pattern path, right turns, d = distance flown
 *   P.drawTrack(g, track, view, {t, d, trail, color, dashed, fix})   draws it in an oblique view
 *   P.trackPlane(g, track, view, d, {s, t})       a top-view plane flying the track, banking in the turns
 *   view = { cx, cy, z, tilt, alt } — screen centre, zoom, tilt (1 = straight down, 0.35 = low 3/4 view), altitude offset px
 * UI.bubble(g, text, x, y, p, {side, size})       speech bubble (lives in ui.js)
 */
(function () {
  const M = window.M, D = window.D, C = D.C, P = window.PROPS;

  P.tower = function (g, x, y, o = {}) {
    const s = o.s || 1, t = o.t || 0;
    g.save(); g.translate(x, y); g.scale(s, s);
    // shaft
    g.beginPath(); g.moveTo(-46, 0); g.lineTo(-30, -420); g.lineTo(30, -420); g.lineTo(46, 0); g.closePath(); D.fill(g, '#EDEFF5');
    g.beginPath(); g.moveTo(-46, 0); g.lineTo(-30, -420); g.lineTo(-8, -420); g.lineTo(-14, 0); g.closePath(); D.fill(g, '#D3D8E4');
    for (let k = 1; k < 6; k++) { D.rr(g, -8, -k * 70, 16, 26, 5); D.fill(g, '#9DB0CF'); }
    // cab
    g.beginPath(); g.moveTo(-96, -420); g.lineTo(96, -420); g.lineTo(82, -470); g.lineTo(-82, -470); g.closePath(); D.fill(g, '#DDE2EC');
    g.beginPath(); g.moveTo(-104, -470); g.lineTo(104, -470); g.lineTo(120, -560); g.lineTo(-120, -560); g.closePath(); D.fill(g, '#2E4A7A');
    g.save(); g.beginPath(); g.moveTo(-104, -470); g.lineTo(104, -470); g.lineTo(120, -560); g.lineTo(-120, -560); g.closePath(); g.clip();
    g.fillStyle = 'rgba(160,220,255,0.35)'; g.beginPath(); g.moveTo(-60, -560); g.lineTo(-20, -560); g.lineTo(-50, -470); g.lineTo(-90, -470); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,214,140,0.55)'; g.fillRect(-120, -500, 240, 30);   // warm interior light
    for (const mx of [-58, 0, 58]) { g.fillStyle = '#20365E'; g.fillRect(mx - 3, -560, 6, 90); }
    g.restore();
    D.rr(g, -130, -584, 260, 28, 12); D.fill(g, '#F4F6FA');
    D.rr(g, -100, -600, 200, 20, 10); D.fill(g, '#C9D0DE');
    g.strokeStyle = '#C9D0DE'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, -600); g.lineTo(40, -660); g.stroke();
    // rotating beacon: alternating green / white
    const ph = (t * 0.5) % 1, col = ph < 0.5 ? '#5CFF9D' : '#FFFFFF', a = 0.5 + 0.5 * Math.cos(ph * Math.PI * 4);
    D.circle(g, -40, -612, 10); D.fill(g, col);
    g.globalAlpha = a * 0.5; D.circle(g, -40, -612, 30); D.fill(g, col); g.globalAlpha = 1;
    g.restore();
  };

  P.controller = function (g, x, y, o = {}) {
    const s = o.s || 1, t = o.t || 0, talk = o.talk || 0;
    const blink = (t * 0.37 + 0.3) % 1 < 0.035;
    g.save(); g.translate(x, y + Math.sin(t * 2.1) * 2); g.scale(s, s);
    // shoulders + shirt
    D.rr(g, -120, 40, 240, 140, 70); D.fill(g, '#3C5BA8');
    g.beginPath(); g.moveTo(-26, 40); g.lineTo(0, 92); g.lineTo(26, 40); g.closePath(); D.fill(g, '#FFFFFF');
    // neck + head
    D.rr(g, -22, 10, 44, 44, 16); D.fill(g, '#D9A47E');
    g.beginPath(); g.ellipse(0, -40, 74, 82, 0, 0, Math.PI * 2); D.fill(g, '#E8B48C');
    g.beginPath(); g.ellipse(0, -84, 78, 52, 0, Math.PI, Math.PI * 2); D.fill(g, '#3B2A28');
    D.rr(g, -78, -96, 156, 30, 15); D.fill(g, '#3B2A28');
    // eyes
    const lx = (o.look || 0) * 6;
    if (blink) { g.strokeStyle = '#1C2A4D'; g.lineWidth = 5; g.beginPath(); g.moveTo(-34 + lx, -42); g.lineTo(-16 + lx, -42); g.moveTo(16 + lx, -42); g.lineTo(34 + lx, -42); g.stroke(); }
    else { D.circle(g, -25 + lx, -42, 9); D.fill(g, '#1C2A4D'); D.circle(g, 25 + lx, -42, 9); D.fill(g, '#1C2A4D'); D.circle(g, -22 + lx, -45, 3); D.fill(g, '#FFFFFF'); D.circle(g, 28 + lx, -45, 3); D.fill(g, '#FFFFFF'); }
    // mouth: talk drives a soft open/close
    const open = talk * (0.5 + 0.5 * Math.abs(Math.sin(t * 13)));
    g.beginPath(); g.ellipse(0, -2, 18, 4 + open * 12, 0, 0, Math.PI * 2); D.fill(g, '#9C4A43');
    // cheeks
    D.circle(g, -48, -14, 12); D.fill(g, 'rgba(255,120,110,0.25)'); D.circle(g, 48, -14, 12); D.fill(g, 'rgba(255,120,110,0.25)');
    // headset
    g.strokeStyle = '#2A3150'; g.lineWidth = 12; g.lineCap = 'round';
    g.beginPath(); g.arc(0, -46, 84, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    D.rr(g, -96, -66, 30, 52, 14); D.fill(g, '#2A3150'); D.rr(g, 66, -66, 30, 52, 14); D.fill(g, '#2A3150');
    g.lineWidth = 6; g.beginPath(); g.moveTo(80, -20); g.quadraticCurveTo(70, 14, 24, 6); g.stroke();
    D.circle(g, 22, 6, 9); D.fill(g, '#2A3150');
    g.restore();
  };

  P.storm = function (g, pal, x, y, o = {}) {
    const w = o.w || 520, t = o.t || 0, rain = o.rain != null ? o.rain : 1, flash = o.flash || 0;
    const ground = o.ground != null ? o.ground : y + 700;
    // rain first (behind the cloud)
    if (rain > 0.01) {
      g.save(); g.strokeStyle = 'rgba(190,210,240,0.55)'; g.lineWidth = 4; g.lineCap = 'round'; g.globalAlpha *= rain;
      for (let i = 0; i < 46; i++) {
        const rx = x - w * 0.42 + M.hash01(41, i) * w * 0.84, sp = 900 + M.hash01(42, i) * 300;
        const L = ground - y;
        const ry = y + ((t * sp + M.hash01(43, i) * L) % L);
        g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 10, ry + 42); g.stroke();
      }
      g.restore();
    }
    if (flash > 0.01) {
      g.save(); g.globalAlpha *= M.clamp(flash, 0, 1);
      g.beginPath(); const bx = x + w * 0.08;
      const pts = [[bx, y + 40], [bx - 40, y + 200], [bx + 10, y + 210], [bx - 50, y + 400], [bx + 40, y + 180], [bx - 6, y + 172], [bx + 30, y + 40]];
      pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py)); g.closePath(); D.fill(g, '#FFF4A8');
      g.restore();
    }
    const dark = { cloud: o.color || '#5D6B8C', cloudShade: o.shade || '#46526F' };
    window.WORLD.cloud(g, dark, x, y, w, o.seed || 7);
    window.WORLD.cloud(g, dark, x + w * 0.38, y - w * 0.12, w * 0.6, (o.seed || 7) + 3);
    if (flash > 0.01) { g.save(); g.globalAlpha *= flash * 0.5; window.WORLD.cloud(g, { cloud: '#FFFFFF', cloudShade: '#FFFFFF' }, x, y, w, o.seed || 7); g.restore(); }
  };

  P.airport = function (g, x, y, o = {}) {
    const t = o.t || 0;
    g.save(); g.translate(x, y); g.scale(o.s || 1, o.s || 1);
    // grass apron
    D.rr(g, -900, -10, 1800, 140, 40); D.fill(g, o.grass || '#5FA36A');
    // runway (seen low, from the side): a long dark strip with dashes
    D.rr(g, -820, 30, 1640, 60, 20); D.fill(g, '#4A5068');
    g.fillStyle = '#FFFFFF'; for (let k = -760; k < 760; k += 110) g.fillRect(k, 57, 56, 6);
    for (let k = -800; k <= 800; k += 80) { D.circle(g, k, 30, 4); D.fill(g, '#FFE9A8'); }
    // terminal + hangar
    D.rr(g, -660, -150, 360, 140, 18); D.fill(g, '#F2F4F8'); D.rr(g, -660, -150, 360, 36, 18); D.fill(g, '#3D6FD8');
    for (let k = 0; k < 6; k++) { D.rr(g, -640 + k * 56, -96, 40, 56, 8); D.fill(g, '#9FC3EE'); }
    g.beginPath(); g.moveTo(320, -10); g.lineTo(320, -150); g.quadraticCurveTo(460, -260, 600, -150); g.lineTo(600, -10); g.closePath(); D.fill(g, '#DDE3EE');
    D.rr(g, 380, -110, 160, 100, 10); D.fill(g, '#8B97B0');
    // windsock (flaps with t)
    g.strokeStyle = '#B7C0D2'; g.lineWidth = 6; g.beginPath(); g.moveTo(760, -10); g.lineTo(760, -150); g.stroke();
    const fl = Math.sin(t * 6) * 6;
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(762 + k * 24, -150 + fl * k * 0.2); g.lineTo(786 + k * 24, -148 + fl * (k + 1) * 0.2); g.lineTo(786 + k * 24, -128 + fl * (k + 1) * 0.2 - k * 2); g.lineTo(762 + k * 24, -126 + fl * k * 0.2 - k * 2); g.closePath(); D.fill(g, k % 2 ? '#FFFFFF' : '#FF7A3D'); }
    g.restore();
  };

  /** Holding / traffic pattern: two straights of length L joined by right turns of radius R.
   *  d = 0 at the start of the inbound leg (top, heading right), the fix sits at d = L. */
  P.racetrack = function (L, R) {
    const T = Math.PI * R, len = 2 * L + 2 * T;
    return {
      L, R, len, fix: { x: L / 2, y: -R },
      at(d) {
        d = ((d % len) + len) % len;
        if (d < L) return { x: -L / 2 + d, y: -R, h: 0, turn: 0 };
        if (d < L + T) { const th = -Math.PI / 2 + (d - L) / R; return { x: L / 2 + R * Math.cos(th), y: R * Math.sin(th), h: th + Math.PI / 2, turn: 1 }; }
        if (d < 2 * L + T) return { x: L / 2 - (d - L - T), y: R, h: Math.PI, turn: 0 };
        const th = Math.PI / 2 + (d - 2 * L - T) / R; return { x: -L / 2 + R * Math.cos(th), y: R * Math.sin(th), h: th + Math.PI / 2, turn: 1 };
      },
    };
  };
  const proj = (v, x, y) => [v.cx + x * v.z, v.cy + y * v.z * v.tilt - (v.alt || 0)];

  P.drawTrack = function (g, tr, v, o = {}) {
    const col = o.color || C.amber, N = 220;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    // the full pattern, faint
    g.strokeStyle = D.rgba(o.base || '#FFFFFF', o.baseAlpha != null ? o.baseAlpha : 0.32); g.lineWidth = (o.width || 10) * 0.6;
    if (o.dashed !== false) g.setLineDash([2, 22]);
    g.beginPath(); for (let i = 0; i <= N; i++) { const p = tr.at(i / N * tr.len), [sx, sy] = proj(v, p.x, p.y); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); } g.closePath(); g.stroke();
    g.setLineDash([]);
    // the light trail behind the plane
    if (o.d != null && (o.trail || 0) > 0) {
      const tl = o.trail * tr.len, steps = 60;
      for (let i = 0; i < steps; i++) {
        const d0 = o.d - tl + (i / steps) * tl, d1 = o.d - tl + ((i + 1) / steps) * tl;
        const a = tr.at(d0), b = tr.at(d1), [ax, ay] = proj(v, a.x, a.y), [bx, by] = proj(v, b.x, b.y);
        const u = i / steps;
        g.strokeStyle = D.rgba(col, 0.15 + 0.75 * u); g.lineWidth = (o.width || 10) * (0.5 + 0.7 * u);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }
    }
    // the holding fix: a pulsing teal ring
    if (o.fix) {
      const [fx, fy] = proj(v, tr.fix.x, tr.fix.y), ph = ((o.t || 0) * 0.9) % 1;
      g.save(); g.translate(fx, fy); g.scale(1, Math.max(0.35, v.tilt));
      g.strokeStyle = D.rgba(C.teal, 1 - ph); g.lineWidth = 5; D.circle(g, 0, 0, 16 + ph * 46); g.stroke();
      D.circle(g, 0, 0, 14); D.fill(g, C.teal); D.circle(g, 0, 0, 6); D.fill(g, '#FFFFFF');
      g.restore();
    }
    g.restore();
  };

  P.trackPlane = function (g, tr, v, d, o = {}) {
    const p = tr.at(d), [sx, sy] = proj(v, p.x, p.y);
    // bank: the wings tilt into the turn (seen from above it reads as the wings narrowing on one side)
    const bank = p.turn ? 0.82 : 1;
    g.save(); g.translate(sx, sy);
    g.scale(1, v.tilt);
    g.rotate(p.h);
    g.scale(1, bank);
    // soft shadow on the "ground" under the plane at low tilt reads as height
    window.PROPS.plane(g, 0, 0, { view: 'top', s: (o.s || 0.32) * v.z, t: o.t, colors: o.colors });
    g.restore();
    return [sx, sy];
  };
})();
