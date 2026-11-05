/* motion.js — closed-form springs. Every function here is a pure function of time.
 * Never restart a spring, never carry state between frames.
 * Loaded as a classic script (works from file://). Everything lives on window.M.
 */
(function () {
  // stiffness k, damping c, mass 1. zeta = c / (2*sqrt(k)).
  const PRESETS = {
    snappy:  { k: 420, c: 39 },  // zeta ≈ 0.95  buttons, toggles, leading edges
    default: { k: 220, c: 27 },  // zeta ≈ 0.91  cards, containers, camera (tiny overshoot)
    heavy:   { k: 130, c: 25 },  // zeta ≈ 1.10  big type, logo lockups (no overshoot)
    playful: { k: 260, c: 15 },  // zeta ≈ 0.47  visible overshoot. Mascots only.
  };

  function cfg(p) { return typeof p === 'string' ? (PRESETS[p] || PRESETS.default) : (p || PRESETS.default); }

  /** Step response 0 → 1 of a damped spring, released at dt = 0. dt < 0 → 0. */
  function spring(dt, preset) {
    if (dt <= 0) return 0;
    const { k, c } = cfg(preset);
    const w0 = Math.sqrt(k), z = c / (2 * w0);
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * dt) * (Math.cos(wd * dt) + (z * w0 / wd) * Math.sin(wd * dt));
    }
    if (z === 1) return 1 - Math.exp(-w0 * dt) * (1 + w0 * dt);
    const s = w0 * Math.sqrt(z * z - 1), r1 = -z * w0 + s, r2 = -z * w0 - s;
    return 1 - (r2 * Math.exp(r1 * dt) - r1 * Math.exp(r2 * dt)) / (r2 - r1);
  }

  /** Velocity of the step response (units of 1/s). Handy for motion-blur and squash. */
  function springVel(dt, preset) {
    const h = 1 / 2400;
    return (spring(dt + h, preset) - spring(dt - h, preset)) / (2 * h);
  }

  /**
   * A value with several targets: the sum of one spring per change, each released at its own time.
   * keys: [{ t, v, s? }]  — the first key is the starting value (its t is ignored).
   */
  function track(t, keys, preset) {
    let v = keys[0].v;
    for (let i = 1; i < keys.length; i++) {
      v += (keys[i].v - keys[i - 1].v) * spring(t - keys[i].t, keys[i].s || preset);
    }
    return v;
  }

  /** track() for objects of numbers: keys [{t, v:{x,y,w,...}}] → {x,y,w,...} */
  function trackObj(t, keys, preset) {
    const out = {};
    for (const name of Object.keys(keys[0].v)) {
      out[name] = track(t, keys.map(k => ({ t: k.t, v: k.v[name], s: k.s })), preset);
    }
    return out;
  }

  /**
   * Tab / progress indicator. stops: [{t, a, b}] (a = left edge, b = right edge).
   * The edge in the direction of travel rides the snappy spring, the other one lags on default,
   * so the bar stretches while it moves.
   */
  function indicator(t, stops) {
    let a = stops[0].a, b = stops[0].b;
    for (let i = 1; i < stops.length; i++) {
      const p = stops[i - 1], q = stops[i];
      const right = (q.a + q.b) >= (p.a + p.b);
      a += (q.a - p.a) * spring(t - q.t, right ? 'default' : 'snappy');
      b += (q.b - p.b) * spring(t - q.t, right ? 'snappy' : 'default');
    }
    return { a, b };
  }

  /**
   * Alpha for content inside a morphing container. Enters `lead` after the morph starts (tIn),
   * fully gone `lead` before the next morph (tOut). Returns 0..1 (no overshoot).
   */
  function swapAlpha(t, tIn, tOut, lead = 0.08) {
    const a = clamp(spring(t - (tIn + lead), 'snappy'), 0, 1);
    if (tOut == null) return a;
    const out = clamp(spring(t - (tOut - lead - 0.16), 'snappy'), 0, 1);
    return a * (1 - out);
  }

  /** Pin the last frame to the first. */
  function loopT(t, dur) { return ((t % dur) + dur) % dur; }

  /** Seeded PRNG. Never Math.random. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Deterministic noise value for (seed, i) without carrying state. */
  function hash01(seed, i) { return mulberry32((seed * 2654435761 + i * 40503) >>> 0)(); }

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function ramp(t, t0, t1) { return clamp((t - t0) / (t1 - t0), 0, 1); }

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixColor(c1, c2, u) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    const m = a.map((x, i) => Math.round(lerp(x, b[i], clamp(u, 0, 1))));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  }

  window.M = { PRESETS, spring, springVel, track, trackObj, indicator, swapAlpha, loopT,
    mulberry32, hash01, clamp, lerp, ramp, hexToRgb, mixColor };
})();
