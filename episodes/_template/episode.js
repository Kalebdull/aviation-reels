/* Ep {{N}}: {{TOPIC}}. See brain/library.md for everything available. Tie every change to a word: T.word(line, 'word'). */
(function () {
  const M = window.M, D = window.D, C = D.C, WO = window.WORLD, P = window.PROPS, I = window.INST, UI = window.UI;

  EPISODE({
    topic: '{{TOPIC}}',
    loop: true,
    tail: 1.0,
    setup(T) {
      // T.cue(T.word(2, 'flip').t0, 'chime', 0.8);
    },
    shots: [
      { id: 'hook', draw(g, s) {
        const { t, T } = s;
        const cam = T.cam(t, [{ t: 0, x: 0, y: -400, z: 1.1 }, { t: T.seg(0).t1, x: 120, y: -460, z: 1.3 }]);
        WO.backdrop(g, t, cam, 'day');
        WO.view(g, cam, 1, () => { P.plane(g, 200 * t, -480, { s: 1, t }); });
      } },
    ],
  });
})();
