/* world.js — one continuous cartoon world with parallax. The camera flies through it.
 *
 * Camera: { x, y, z, rot }  (world point at screen centre, zoom, roll in radians)
 * World coordinates: x → right, y → down. The horizon sits at y = 0. Positive y is the ground, negative is sky.
 * Layers have a depth factor f: 0 = infinitely far (moves with the screen), 1 = the action plane.
 */
(function () {
  const M = window.M, D = window.D;
  const W = 1080, H = 1920, CX = 540, CY = 880;

  /** Apply the camera for depth f and run fn in world coordinates. */
  function view(g, cam, f, fn) {
    const z = 1 + (cam.z - 1) * f;
    g.save();
    g.translate(CX, CY);
    if (cam.rot) g.rotate(cam.rot);
    g.scale(z, z);
    g.translate(-cam.x * f, -cam.y * f);
    fn(z);
    g.restore();
  }
  /** World → screen for depth f (for placing UI on top of world things). */
  function toScreen(cam, x, y, f = 1) {
    const z = 1 + (cam.z - 1) * f;
    let sx = (x - cam.x * f) * z, sy = (y - cam.y * f) * z;
    if (cam.rot) { const c = Math.cos(cam.rot), s = Math.sin(cam.rot); [sx, sy] = [sx * c - sy * s, sx * s + sy * c]; }
    return [CX + sx, CY + sy];
  }

  function sky(g, pal, cam) {
    // the gradient slides a little with altitude so climbing feels like climbing
    const shift = M.clamp(-cam.y * 0.08, -500, 500);
    g.fillStyle = D.vgrad(g, -400 + shift, H + 200 + shift, pal.sky);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillRect(0, 0, W, H); g.restore();
  }

  function stars(g, pal, t, cam, n = 160) {
    if (!pal.stars) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < n; i++) {
      const x = ((M.hash01(11, i) * W * 1.3 - cam.x * 0.03) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15;
      const y = M.hash01(12, i) * 1000 - cam.y * 0.03;
      const tw = 0.55 + 0.45 * Math.sin(t * (1.5 + M.hash01(13, i) * 2.5) + i);
      g.globalAlpha = tw * pal.stars * (0.4 + 0.6 * M.hash01(14, i));
      D.circle(g, x, y, 1.4 + M.hash01(15, i) * 2.2); D.fill(g, '#FFFFFF');
    }
    g.restore();
  }

  function sun(g, pal, cam, o = {}) {
    const [x, y] = toScreen(cam, o.x != null ? o.x : 260, o.y != null ? o.y : -520, 0.06);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    const r = o.r || 120;
    const gr = g.createRadialGradient(x, y, r * 0.4, x, y, r * 4.5);
    gr.addColorStop(0, D.rgba(pal.sun, 0.55)); gr.addColorStop(1, D.rgba(pal.sun, 0));
    g.fillStyle = gr; g.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    D.circle(g, x, y, r); D.fill(g, pal.sun);
    D.circle(g, x, y, r * 0.72); D.fill(g, pal.sunCore);
    g.restore();
  }

  /** A puffy flat cloud centred at (x,y), width w. seed shapes it. */
  function cloud(g, pal, x, y, w, seed = 1, o = {}) {
    const n = 4 + Math.floor(M.hash01(seed, 0) * 3), puffs = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), r = w * (0.16 + 0.13 * Math.sin(u * Math.PI) + 0.05 * M.hash01(seed, i + 1));
      puffs.push([x - w / 2 + w * (0.12 + 0.76 * u), y - r * 0.55 - w * 0.04 * Math.sin(u * Math.PI), r]);
    }
    const base = y + w * 0.06;
    const shape = (dy) => {
      g.beginPath();
      puffs.forEach(([px, py, r]) => { g.moveTo(px + r, py + dy); g.arc(px, py + dy, r, 0, Math.PI * 2); });
      D.rr(g, x - w * 0.46, base - w * 0.12 + dy, w * 0.92, w * 0.12, w * 0.06);
    };
    g.save();
    if (o.alpha != null) g.globalAlpha *= o.alpha;
    shape(w * 0.035); g.fillStyle = o.shade || pal.cloudShade; g.fill('nonzero');
    shape(0); g.fillStyle = o.color || pal.cloud; g.fill('nonzero');
    g.restore();
  }

  /** A tiled field of clouds for depth f, drifting with time. */
  function cloudField(g, pal, t, cam, f, o = {}) {
    const span = o.span || 1800, count = o.count || 4, seed = o.seed || 3, drift = o.drift != null ? o.drift : 14;
    view(g, cam, f, (z) => {
      const left = cam.x * f - CX / z - span, right = cam.x * f + CX / z + span;
      const k0 = Math.floor(left / span), k1 = Math.ceil(right / span);
      for (let k = k0; k <= k1; k++) {
        for (let i = 0; i < count; i++) {
          const s = seed * 100 + ((k % 97) + 97) % 97 * 10 + i;
          const x = k * span + M.hash01(s, 1) * span + t * drift * (0.5 + M.hash01(s, 2));
          const y = (o.y != null ? o.y : -700) + (M.hash01(s, 3) - 0.5) * (o.yRange || 500);
          const w = (o.w || 380) * (0.7 + 0.6 * M.hash01(s, 4));
          cloud(g, pal, x, y, w, s, o);
        }
      }
    });
  }

  /** Rolling hills for depth f. base = y of the hill line in world units at that depth. */
  function hills(g, pal, cam, f, color, o = {}) {
    const amp = o.amp || 90, base = o.base || 0, seed = o.seed || 5, freq = o.freq || 1;
    view(g, cam, f, (z) => {
      const left = cam.x * f - CX / z - 40, right = cam.x * f + CX / z + 40;
      const step = 14 / z;
      const hgt = x => base - amp * (0.55 + 0.45 * Math.sin(x * 0.0021 * freq + seed) * Math.sin(x * 0.0009 * freq + seed * 2.1) + 0.18 * Math.sin(x * 0.006 * freq + seed * 3));
      g.beginPath(); g.moveTo(left, base + 6000);
      for (let x = left; x <= right + step; x += step) g.lineTo(x, hgt(x));
      g.lineTo(right + step, base + 6000); g.closePath();
      g.fillStyle = color; g.fill();
      if (o.trees) {
        const sp = o.treeSpacing || 120;
        for (let x = Math.floor(left / sp) * sp; x <= right; x += sp) {
          const h = M.hash01(seed + 40, Math.round(x / sp));
          if (h > (o.treeDensity || 0.45)) continue;
          const tx = x + h * sp * 0.6, ty = hgt(tx) + 6, s = 0.7 + h * 0.8;
          D.rr(g, tx - 5 * s, ty - 30 * s, 10 * s, 34 * s, 4 * s); D.fill(g, pal.treeDark);
          D.circle(g, tx, ty - 44 * s, 26 * s); D.fill(g, pal.tree);
          D.circle(g, tx - 8 * s, ty - 52 * s, 12 * s); D.fill(g, D.rgba('#FFFFFF', 0.12));
        }
      }
    });
  }

  /** The standard backdrop: sky, sun, stars, far clouds, three hill layers. */
  function backdrop(g, t, cam, palName = 'day', o = {}) {
    const pal = D.PAL[palName] || palName;
    sky(g, pal, cam);
    stars(g, pal, t, cam);
    if (o.sun !== false) sun(g, pal, cam, o.sunAt || {});
    cloudField(g, pal, t, cam, 0.1, { y: -900, count: 3, w: 300, drift: 6, seed: 2, alpha: 0.75 });
    cloudField(g, pal, t, cam, 0.22, { y: -650, count: 3, w: 420, drift: 10, seed: 4 });
    if (o.hills !== false) {
      hills(g, pal, cam, 0.3, pal.hills[0], { amp: 110, base: 60, seed: 1.3 });
      hills(g, pal, cam, 0.45, pal.hills[1], { amp: 95, base: 150, seed: 2.7, trees: true, treeSpacing: 160 });
      hills(g, pal, cam, 0.65, pal.hills[2], { amp: 70, base: 260, seed: 4.1, trees: true, treeSpacing: 120, treeDensity: 0.35 });
    }
    // haze over the far layers: depth without blur
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    const [, hy] = toScreen(cam, 0, 0, 0.3);
    const gr = g.createLinearGradient(0, hy - 400, 0, hy + 200);
    gr.addColorStop(0, D.rgba('#FFFFFF', 0)); gr.addColorStop(1, pal.haze);
    g.fillStyle = gr; g.fillRect(0, hy - 400, W, 600);
    g.restore();
  }

  /** Near clouds that pass in FRONT of the action (call after drawing the action). */
  function foreground(g, t, cam, palName = 'day', o = {}) {
    const pal = D.PAL[palName] || palName;
    cloudField(g, pal, t, cam, 1.4, { y: o.y != null ? o.y : -200, count: o.count || 1, span: 2600, w: 900, drift: 30, seed: 9, alpha: o.alpha != null ? o.alpha : 0.92, yRange: 1400 });
  }

  /** Full-screen cloud whiteout (IMC). amount 0..1 */
  function fog(g, amount, palName = 'imc') {
    if (amount <= 0.001) return;
    const pal = D.PAL[palName] || palName;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = M.clamp(amount, 0, 1);
    g.fillStyle = D.vgrad(g, 0, H, pal.sky); g.fillRect(0, 0, W, H);
    g.restore();
  }

  window.WORLD = { W, H, CX, CY, view, toScreen, sky, stars, sun, cloud, cloudField, hills, backdrop, foreground, fog };
})();
