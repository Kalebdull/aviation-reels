/* STYLE TEST: the opening of the holding-pattern reel (62K views) remade as a cartoon show.
 * One living world: the holding stack over the airport → the camera drops to the field and trucks across
 * busy airport → storm → tower (controller: "Please hold.") → back up to the racetrack. */
(function () {
  const M = window.M, D = window.D, C = D.C, WO = window.WORLD, P = window.PROPS, UI = window.UI;
  const TRACK = P.racetrack(520, 170);
  const SPEED = 470;                         // px/s along the pattern

  // the ground-level world for lines 2–4
  function ground(g, t, cam, palName) {
    const pal = D.PAL[palName];
    WO.sky(g, pal, cam); WO.sun(g, pal, cam, { x: 1400, y: -700, r: 110 });
    WO.cloudField(g, pal, t, cam, 0.12, { y: -1050, count: 2, w: 200, drift: 8, seed: 2, alpha: 0.75 });
    WO.cloudField(g, pal, t, cam, 0.25, { y: -800, count: 2, w: 280, drift: 12, seed: 5, alpha: 0.9 });
    WO.hills(g, pal, cam, 0.3, pal.hills[0], { amp: 120, base: -40, seed: 1.3 });
    WO.hills(g, pal, cam, 0.5, pal.hills[1], { amp: 80, base: -10, seed: 2.7, trees: true, treeSpacing: 150 });
    WO.view(g, cam, 1, () => {
      g.fillStyle = D.vgrad(g, 0, 1400, [pal.hills[2], pal.ground, pal.treeDark]); g.fillRect(cam.x - 3000, 0, 6000, 3000);
      for (let i = -12; i <= 12; i++) {                 // grass tufts give the ground scale and parallax
        const gx = Math.round(cam.x / 260) * 260 + i * 260 + M.hash01(61, i + Math.round(cam.x / 260)) * 120, gy = 160 + M.hash01(62, i + Math.round(cam.x / 260)) * 500;
        D.circle(g, gx, gy, 16); D.fill(g, D.rgba('#FFFFFF', 0.05)); D.circle(g, gx + 22, gy + 4, 11); D.fill(g, D.rgba('#FFFFFF', 0.05));
      }
    });
  }

  EPISODE({
    topic: 'Holding patterns', loop: false, tail: 1.2,
    setup(T) {
      T.cue(T.word(1, 'holding').t0, 'chime', 0.7);
      T.cue(T.word(2, 'busy').t0, 'blip', 0.6);
      T.cue(T.word(3, 'bad').t0, 'pop', 0.8);
      T.cue(T.word(4, 'wait').t0 - 0.05, 'blip', 0.7);
      T.cue(T.word(5, 'racetrack').t0, 'chime', 0.8);
    },
    shots: [
      { id: 'stack', draw(g, s) {
        const { t, T } = s;
        const cam = { x: 40 * t, y: -300, z: 1, rot: 0 };
        WO.backdrop(g, t, cam, 'golden', { sunAt: { x: -230, y: 130, r: 150 } });
        // the stack: three racetracks over the field, the camera slowly rising toward overhead
        const tilt = T.track(t, [{ t: 0, v: 0.34 }, { t: T.word(1, 'holding').t0, v: 0.46, s: 'heavy' }]);
        const z = T.track(t, [{ t: 0, v: 0.86 }, { t: T.word(1, 'holding').t0, v: 0.96, s: 'heavy' }]) + 0.01 * t;
        for (let k = 2; k >= 0; k--) {
          const v = { cx: 540, cy: 860, z: z * 1.08, tilt, alt: k * 150 };
          const d = SPEED * t + k * 700;
          P.drawTrack(g, TRACK, v, { t, d, trail: 0.3, fix: k === 0, baseAlpha: 0.22 });
          P.trackPlane(g, TRACK, v, d, { s: 0.3, t });
        }
        UI.slam(g, 'HOLDING PATTERN', 540, 420, t, T.word(1, 'holding').t0, null, { bg: C.amber, color: C.ink, size: 44 });
      } },

      { id: 'reasons', at: 'seg:2-0.2', trans: { type: 'flow', dir: 1 }, draw(g, s) {
        const { t, T } = s;
        const tw = T.word(3, 'weather').t0 - 0.5, ta = T.word(4, 'air').t0 - 0.5;
        const cam = T.cam(t, [
          { t: 0, x: -80, y: -110, z: 0.92 },
          { t: tw, x: 1520, y: -170, z: 0.95 },
          { t: ta, x: 3020, y: -250, z: 0.98 },
        ]);
        cam.x += 14 * t;                                  // never fully still
        ground(g, t, cam, 'golden');
        WO.view(g, cam, 1, () => {
          // 1. busy airport: a queue on the taxiway and a line of arrivals stacked on the approach
          P.airport(g, 0, 0, { t });
          for (let k = 0; k < 3; k++) P.plane(g, -380 + k * 170, -22 + Math.sin(t * 2 + k) * 1.5, { s: 0.32, t: t + k, gear: true });
          for (let k = 0; k < 4; k++) {
            const u = ((t * 0.08 + k * 0.25) % 1);
            P.plane(g, 1100 - u * 900, -520 + u * 420, { s: 0.36, rot: 0.32, flip: true, t: t + k });
          }
          // 2. bad weather: the storm parks over the field and flashes on "bad"
          const fl = T.win(t, T.word(3, 'bad').t0 - 0.05, T.word(3, 'bad').t0 + 0.12, 'snappy');
          P.storm(g, D.PAL.golden, 1520, -560, { w: 620, t, flash: fl, ground: 0 });
          // 3. the tower
          P.tower(g, 3000, 0, { s: 1, t });
          const u = M.clamp((t - ta) / 3.2, 0, 1);
          P.plane(g, 2600 + u * 900, -760 - u * 120, { s: 0.36, rot: -0.12, t });
        });
        // labels on each place, popping on their words
        UI.label(g, 'BUSY AIRPORT', 540, 470, t, T.word(2, 'busy').t0, { tOut: tw, size: 36 });
        UI.label(g, 'BAD WEATHER', 540, 360, t, T.word(3, 'bad').t0, { tOut: ta, bg: C.coral, color: C.white, size: 36 });
        // the controller pops out of the tower in a round inset and talks
        const pin = T.in(t, T.word(4, 'traffic').t0, 'default');
        if (pin > 0.01) {
          const [tx, ty] = WO.toScreen(cam, 3000, -520);
          const ix = 300, iy = 520, r = 150;
          g.save(); g.globalAlpha *= M.clamp(pin * 2, 0, 1);
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 5; g.setLineDash([2, 12]); g.lineCap = 'round';
          g.beginPath(); g.moveTo(tx - 60, ty); g.lineTo(ix + r * 0.7, iy + r * 0.7); g.stroke(); g.setLineDash([]);
          g.translate(ix, iy); g.scale(pin, pin);
          D.softShadow(g, 30, 14, 0.3); D.circle(g, 0, 0, r + 10); D.fill(g, '#FFFFFF'); D.noShadow(g);
          g.save(); D.circle(g, 0, 0, r); g.clip();
          g.fillStyle = D.vgrad(g, -r, r, ['#FFD9A8', '#F6B886']); g.fillRect(-r, -r, 2 * r, 2 * r);
          P.controller(g, 0, 40, { s: 0.95, t, talk: T.win(t, T.word(4, 'asks').t0, T.seg(4).t1 + 0.6), look: 0.6 });
          g.restore(); g.restore();
          UI.bubble(g, '"Please hold."', ix + 120, iy - 90, T.in(t, T.word(4, 'wait').t0 - 0.1, 'default'), { side: 'left', size: 48 });
        }
      } },

      { id: 'racetrack', at: 'seg:5-0.2', trans: { type: 'zoom', x: 540, y: 380 }, draw(g, s) {
        const { t, T } = s;
        const cam = { x: 30 * t, y: -650, z: 1, rot: 0 };
        WO.backdrop(g, t, cam, 'golden', { sunAt: { x: -230, y: 150, r: 150 } });
        const lt = s.lt;
        const tilt = T.track(t, [{ t: 0, v: 0.42 }, { t: T.word(5, 'racetrack').t0, v: 0.58, s: 'heavy' }]);
        const z = 1.1 + 0.02 * lt;
        const v = { cx: 540, cy: 760, z, tilt, alt: 0 };
        const d = SPEED * 1.1 * t;
        P.drawTrack(g, TRACK, v, { t, d, trail: 0.45, fix: true, width: 12 });
        P.trackPlane(g, TRACK, v, d, { s: 0.36, t });
        UI.slam(g, 'RACETRACK', 540, 420, t, T.word(5, 'racetrack').t0, null, { bg: C.amber, color: C.ink, size: 46 });
      } },
    ],
  });
})();
