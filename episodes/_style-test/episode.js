/* STYLE TEST: pitot tube → airspeed needle. Proves the look: one flowing world, a camera that dives into the mechanism,
 * real working parts, karaoke captions, loop seam. Not a real episode. */
(function () {
  const M = window.M, D = window.D, C = D.C, WO = window.WORLD, P = window.PROPS, I = window.INST, UI = window.UI;
  const SPEED = 420;                                  // world px/s the plane flies at
  const planeAt = t => ({ x: SPEED * t, y: -520 + D.noise1(3, t * 0.6) * 14, rot: D.noise1(4, t * 0.5) * 0.025 });

  // the pitot close-up, shared by two shots (so the movie returns to the same place)
  function tubeScene(g, t, T, o) {
    const cam = { x: 2600 * t, y: -600, z: 1.6, rot: 0 };
    const wy = o.wingY != null ? o.wingY : 420, ty = o.tubeY != null ? o.tubeY : 1000;
    WO.backdrop(g, t, cam, 'day', { hills: false, sunAt: { x: 900, y: -700 } });
    // wind streaks: the air we're about to catch
    const fast = o.flow;
    g.save(); g.globalAlpha = 0.5 * M.clamp(fast, 0, 1);
    for (let i = 0; i < 14; i++) {
      const y = wy + 260 + M.hash01(21, i) * (ty - wy + 140), len = 120 + M.hash01(22, i) * 200, sp = (900 + M.hash01(23, i) * 700) * (0.6 + fast);
      const x = 1200 - ((t * sp + M.hash01(24, i) * 1600) % 1600);
      g.strokeStyle = '#FFFFFF'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
    }
    g.restore();
    // wing underside
    g.save(); D.softShadow(g, 50, 24, 0.18);
    // the wing seen from below-front: leading edge curve, underside shade, stripe, strut
    g.beginPath(); g.moveTo(-100, wy - 160); g.lineTo(1200, wy - 160); g.lineTo(1200, wy + 40); g.quadraticCurveTo(1150, wy + 130, 1040, wy + 130); g.lineTo(-100, wy + 130); g.closePath(); D.fill(g, '#FFFFFF');
    D.noShadow(g);
    g.beginPath(); g.moveTo(-100, wy + 60); g.lineTo(1100, wy + 60); g.quadraticCurveTo(1150, wy + 100, 1040, wy + 130); g.lineTo(-100, wy + 130); g.closePath(); D.fill(g, P.PLANE.shade);
    g.fillStyle = P.PLANE.stripe; g.fillRect(-100, wy - 110, 1300, 16);
    g.strokeStyle = P.PLANE.metal; g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(120, wy + 120); g.lineTo(-60, ty + 500); g.stroke();
    g.restore();
    // the pitot tube: mast down from the wing, then forward into the wind (wind comes from the right)
    const path = [[1090, ty], [800, ty], [420, ty], [420, wy + 120]];
    const ice = o.ice || 0;
    I.tube(g, [[810, ty], [420, ty], [420, wy + 120]], t, { width: 46, flow: o.flow * (1 - ice), speed: 260 + 520 * o.flow });
    D.rr(g, 790, ty - 36, 40, 72, 14); D.fill(g, '#C9D3E3');           // the mouth
    // incoming ram air: dots flying at the mouth
    D.flowLine(g, [[1150, ty], [826, ty]], t, { color: C.amber, lineAlpha: 0, dot: 11, gap: 80 - 30 * o.flow, speed: (260 + 900 * o.flow) * (1 - ice) + 1 });
    if (ice > 0.01) {     // ice cap over the opening
      g.save(); g.globalAlpha = M.clamp(ice * 1.4, 0, 1);
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2, r = 34 + 22 * M.hash01(31, k);
        g.beginPath(); g.moveTo(840, ty);
        g.lineTo(840 + Math.cos(a) * r * ice * 1.4, ty + Math.sin(a) * r * ice * 1.4);
        g.lineTo(840 + Math.cos(a + 0.35) * r * 0.6 * ice, ty + Math.sin(a + 0.35) * r * 0.6 * ice); g.closePath();
        D.fill(g, k % 2 ? '#E8F7FF' : '#BFE6FF');
      }
      D.circle(g, 836, ty, 40 * ice); D.fill(g, '#D9F2FF');
      g.restore();
    }
    return path;
  }

  EPISODE({
    title: 'Style test', topic: 'Style test', loop: true, tail: 1.2,
    setup(T) {
      T.cue(T.word(0, 'fast').t0, 'pop', 0.6);
      T.cue(T.word(1, 'tube').t0, 'blip', 0.6);
      T.cue(T.word(3, 'swings').t0 + 0.15, 'chime', 0.8);
      T.cue(T.word(4, 'ice').t0, 'tick', 0.7);
      T.cue(T.word(4, 'zero').t0, 'beep2', 0.7);
    },
    shots: [
      { id: 'hook', draw(g, s) {
        const { t, T } = s, p = planeAt(t);
        // camera rides with the plane, then pushes in toward the pitot tube under the wing
        const cam = T.cam(t, [{ t: 0, x: p.x - 40, y: p.y + 60, z: 1.25 }, { t: T.seg(0).t1 - 1.4, x: p.x + 40, y: p.y - 50, z: 2.1 }]);
        cam.x = p.x + (cam.x - SPEED * t);   // keep the plane locked in frame while the camera eases
        WO.backdrop(g, t, cam, 'day');
        WO.view(g, cam, 1, () => {
          // speed lines behind the plane
          g.save(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineCap = 'round';
          for (let i = 0; i < 5; i++) { const y = p.y - 60 + i * 34, l = 120 + 60 * Math.sin(t * 6 + i); g.lineWidth = 5; g.beginPath(); g.moveTo(p.x - 260 - l, y); g.lineTo(p.x - 260, y); g.stroke(); }
          g.restore();
          P.plane(g, p.x, p.y, { s: 1.1, rot: p.rot, t });
          D.at(g, p.x, p.y, p.rot, 1.1, () => { g.fillStyle = '#C9D3E3'; g.fillRect(36, -60, 7, 18); D.rr(g, 36, -46, 38, 9, 4); D.fill(g, '#C9D3E3'); });
        });
        WO.foreground(g, t, cam, 'day', { y: -300, alpha: 0.85 });
        UI.slam(g, 'HOW FAST?', 540, 470, t, T.word(0, 'fast').t0, T.seg(0).t1 + 0.1, { size: 46 });
      } },
      { id: 'tube', at: 'seg:1-0.15', trans: { type: 'zoom', x: 600, y: 790 }, draw(g, s) {
        const { t, T } = s;
        const flow = T.track(t, [{ t: 0, v: 0.25 }, { t: T.word(2, 'faster').t0, v: 1, s: 'heavy' }]);
        tubeScene(g, t, T, { flow });
        UI.label(g, 'PITOT TUBE', 640, 880, t, T.word(1, 'tube').t0, { to: [560, 990], size: 36 });
        UI.slam(g, 'RAM AIR', 900, 1120, t, T.word(2, 'rams').t0, null, { bg: C.amber, color: C.ink, size: 40 });
      } },
      { id: 'needle', at: 'seg:3-0.2', trans: { type: 'flow', dir: -1 }, draw(g, s) {
        const { t, T } = s;
        g.fillStyle = D.vgrad(g, 0, 1920, ['#2A3766', '#1C2648', '#141B36']); g.fillRect(0, 0, 1080, 1920);
        // the panel and the air line feeding the back of the gauge
        I.panel(g, 90, 380, 900, 820, { r: 70 });
        const v = T.track(t, [{ t: 0, v: 0 }, { t: T.word(3, 'swings').t0, v: 110, s: 'default' }]);
        const push = T.in(t, T.seg(3).t0 - 0.1, 'default');
        I.gauge(g, 'asi', 540, 790, 300, v, { s: 0.9 + 0.1 * push });
        UI.slam(g, `${Math.round(v)} KT`, 540, 330, t, T.word(3, 'swings').t0 + 0.2, null, { bg: C.teal, color: C.white, size: 44 });
      } },
      { id: 'ice', at: 'seg:4-0.15', trans: { type: 'iris', x: 830, y: 620 }, draw(g, s) {
        const { t, T } = s;
        const ice = T.in(t, T.word(4, 'ice').t0, 'heavy');
        tubeScene(g, t, T, { flow: 1, ice, wingY: 300, tubeY: 620 });
        // the same needle, falling
        const drop = T.in(t, T.word(4, 'drops').t0 - 0.1, 'heavy');
        const card = T.in(t, T.word(4, 'needle').t0 - 0.3, 'default');
        if (card > 0.01) {
          g.save(); g.globalAlpha = M.clamp(card * 1.5, 0, 1); g.translate(540, 960); g.scale(0.7 + 0.3 * card, 0.7 + 0.3 * card);
          I.panel(g, -230, -230, 460, 460, { r: 60 });
          I.gauge(g, 'asi', 0, 0, 190, 110 * (1 - drop));
          g.restore();
          D.warn(g, 800, 790, 0.9, T.in(t, T.word(4, 'zero').t0, 'default'));
        }
      } },
    ],
  });
})();
