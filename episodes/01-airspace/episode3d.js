export const config = { world: { flat: { x: 0, z: 0, r: 1500, y: 0, treeFree: 0.8 }, clouds: 26, cartoon: true } };

// Ep 01: Airspace. One bubble over a big airport: gated neighbourhood, 10,000 ft (more than six Empire State
// Buildings), dome → upside-down wedding cake, small planes underneath, "you're inside the cake".
// Every change is tied to a word in Kaleb's CapCut voice (timing.js). Scale is cartoon: H = 600 units = 10,000 ft.
export default async function ({ THREE, scene, camera, world, load, props, T }) {
  const M = window.M, D = window.D, C = D.C, UI = window.UI;
  const H = 600, TIERS = [[380, 0], [640, 220], [900, 380]];
  const W = 1080, HH = 1920;

  // ---------------- world tuning for this episode
  scene.fog.near = 1800; scene.fog.far = 9500;
  Object.assign(world.sun.shadow.camera, { left: -1600, right: 1600, top: 1600, bottom: -1600, near: 10, far: 6000 });
  world.sun.shadow.camera.updateProjectionMatrix(); world.sun.shadow.mapSize.set(4096, 4096);
  world.sun.position.copy(world.sunDir).multiplyScalar(3000); world.sun.target.position.set(0, 0, 0);

  // keep the opening shot clean: no clouds between the camera and the RV-7 / the city
  world.clouds.children.forEach(c => { if (c.position.x < -600 && c.position.z > -1300) c.visible = false; });
  // ---------------- set: airport, city, tower
  const ap = props.airport({ len: 420 }); scene.add(ap.group);
  const city = props.city({ count: 260, inner: 430, outer: 1150, a0: 0.5, arc: 2.1, tall: 90 }); scene.add(city.group);   // the city sits off to the side, clear of the approach
  const tw = props.tower(); tw.group.scale.setScalar(2.4); tw.group.position.set(70, 0, -100); scene.add(tw.group);

  // ---------------- the bubble
  const bubble = props.airspace({ H, tiers: TIERS, color: '#4F8DFF', edge: '#CFE1FF' }); scene.add(bubble.group);

  // ---------------- the airliner we ride in, and our RV-7
  const { loadRV7 } = await import('/engine3d/lib/rv7.js');
  const R = await loadRV7(load); const rv = R.group, rvProp = R.prop; rv.scale.setScalar(5); scene.add(rv);

  // ---------------- gate, ruler, skyscrapers, wedding cake
  const gate = props.boomGate(); gate.group.scale.setScalar(12); gate.group.position.set(-905, 420, -118); gate.group.rotation.y = -Math.PI / 2; scene.add(gate.group);
  const RX = 935;
  const rul = props.ruler(H); rul.group.position.set(RX, 0, 0); scene.add(rul.group);
  const ESB_H = H / 6.88;                                                         // 1,454 ft each (to the antenna tip)
  const towers = []; for (let k = 0; k < 7; k++) { const s = props.skyscraper(ESB_H, { wide: 2.4 }); s.position.set(RX + 80, k * ESB_H, 0); scene.add(s); towers.push(s); }
  const cake = new THREE.Group(); scene.add(cake);
  const icing = new THREE.MeshPhysicalMaterial({ color: '#FFF8EE', roughness: 0.35, clearcoat: 0.6 }), trim = new THREE.MeshPhysicalMaterial({ color: '#F2B8C6', roughness: 0.4 });
  [[1.0, 0.0], [0.72, 0.36], [0.46, 0.68]].forEach(([r, y]) => {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.34, 48), icing); tier.position.y = y + 0.17; cake.add(tier);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 48), trim); band.rotation.x = Math.PI / 2; band.position.y = y + 0.02; cake.add(band);
  });
  cake.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });

  // ---------------- timing (all from the voice)
  const S = i => T.seg(i), Wd = (i, w) => T.word(i, w).t0;
  const tBubble = Wd(0, 'bubble'), tAir = Wd(1, 'airspace'), tGated = Wd(2, 'gated'), tPerm = Wd(3, 'permission');
  const tHuge = Wd(4, 'huge'), t10k = Wd(5, '10,000'), tSix = Wd(6, 'six'), tStack = Wd(6, 'stacked');
  const tDome = Wd(7, 'dome'), tShaped = Wd(7, 'shaped'), tUpside = Wd(7, 'upside'), tCake = Wd(7, 'cake');
  const tUnder = Wd(8, 'underneath'), tWin = S(9).t0 - 0.15, tInside = Wd(9, 'inside'), tEnd = S(10).t0 - 0.2;
  T.cue(tBubble, 'chime', 0.7); T.cue(tAir, 'pop', 0.6); T.cue(tGated, 'pop', 0.8); T.cue(tPerm, 'chime', 0.8); T.cue(tPerm + 0.35, 'tick', 0.6);
  T.cue(tHuge - 0.1, 'whoosh', 0.7); T.cue(t10k + 0.9, 'chime', 0.6);
  for (let k = 0; k < 7; k++) T.cue(tSix + k * 0.2, 'tick', 0.45);
  T.cue(tDome, 'whoosh', 0.5); T.cue(tUpside + 0.1, 'swish', 0.7); T.cue(tCake, 'chime', 0.8);
  T.cue(tUnder - 0.4, 'whoosh', 0.7); T.cue(tWin, 'whoosh', 0.6); T.cue(tInside, 'chime', 0.7); T.cue(tEnd, 'whoosh', 0.5); T.cue(S(10).t1, 'blip', 0.5);

  // landing path into the airport (used only for the window-seat camera at the end; no airliner on screen)
  const tGatePass = Math.max(tPerm + 1.2, S(3).t1 - 0.1);
  const jetAt = t => {
    const x0 = -2700, xg = -905;
    const v1 = (xg - x0) / tGatePass;
    let x, y;
    if (t < tGatePass) { x = x0 + v1 * t; y = 520 - 70 * (t / tGatePass); }
    else { const u = t - tGatePass; x = xg + 64 * u; y = Math.max(28, 450 - 17.5 * u); }
    return new THREE.Vector3(x, y, -30);
  };
  const rvUnder = t => { const u = t - (tUnder - 2.2); return new THREE.Vector3(-1350 + 150 * u, 150 + 6 * Math.sin(u * 1.3), 230 - 10 * u); };
  const rvOpen = t => new THREE.Vector3(-1900 + 78 * t, 470 - 5 * t + 3 * Math.sin(t * 0.9), 140);          // the opening: our RV-7 heading for the city
  // our RV-7 is the only airplane: it slows at the gate, waits for permission, then flies through into the bubble
  const G0 = new THREE.Vector3(-1010, 445, -40), tGo = tPerm + 0.4;
  const rvGate = t => {
    if (t < tGo) { const u = M.clamp((t - tGated) / (tGo - tGated), 0, 1), e = u * u * (3 - 2 * u); return rvOpen(tGated).lerp(G0, e); }
    const d = t - tGo; return G0.clone().add(new THREE.Vector3(30 * d + 45 * d * d, -4 * d, 0));
  };
  const rvAt = t => (t < tGated ? rvOpen(t) : t < tUnder - 3 ? rvGate(t) : rvUnder(t));

  // ---------------- camera choreography (smooth camera spring between keys; the window shot is a cut)
  const wide = { pos: [-2300, 1300, 2700], look: [-60, 260, 0], fov: 38 };
  const profile = { pos: [520, 330, 2500], look: [560, 300, 0], fov: 40 };
  const camKeys = [
    { t: -1, pos: [-2150, 560, 110], look: [-1300, 420, -30], fov: 40 },             // (overridden by the RV-7 chase)
    { t: tBubble - 0.6, pos: [-2250, 640, 260], look: [-700, 380, -30], fov: 42 },     // the bubble ahead
    { t: tAir - 0.3, pos: [-2600, 1100, 1700], look: [-300, 300, -30], fov: 40 },      // pull back: the whole bubble
    { t: tGated - 0.35, pos: [-1560, 520, 330], look: [-960, 440, -60], fov: 40 },     // the gate, the RV-7 rolling up to it
    { t: tHuge - 0.25, ...wide },                                                      // huge
    { t: t10k - 0.6, ...profile },                                                     // side view: ruler + skyscrapers
    { t: tDome - 0.4, pos: [-150, 420, 3300], look: [0, 330, 0], fov: 40 },            // the shape
    { t: tUnder - 4.2, pos: [-1500, 120, 420], look: [-1000, 300, 200], fov: 46, d: 3.6 },   // under the edge (slow glide)
    { t: tEnd, ...wide },                                                              // the end: the whole cake
  ];
  const v3 = a => new THREE.Vector3(...a);

  // ---------------- per-frame
  function update(t) {
    // the bubble: invisible until "bubble", dome for "not a dome", cake from "upside"
    const show = T.in(t, tBubble - 0.15, 'heavy');
    const morph = 1 - T.in(t, tDome - 0.1, 'heavy') + T.in(t, tUpside, 'heavy');
    const glow = 1 + 0.6 * T.win(t, tInside, tInside + 1.2, 'default');
    bubble.set(M.clamp(morph, 0, 1), show * glow);
    // gate: pops in on "gated", lifts after "permission", fades once the RV-7 is through
    const gIn = T.in(t, tGated, 'default') * T.out(t, tHuge - 0.3);
    gate.group.visible = gIn > 0.01; gate.group.scale.setScalar(12 * Math.max(0.01, gIn));
    gate.set(T.in(t, tPerm + 0.35, 'default'), t > tPerm ? 1 : 0);
    tw.cab(T.win(t, tPerm - 0.05, tPerm + 2.0), '#3BFF8E');
    // ruler + skyscrapers
    const ru = T.in(t, t10k - 0.5, 'heavy') * T.out(t, tDome - 0.5);
    rul.group.visible = ru > 0.01; rul.group.scale.set(1, Math.max(0.01, M.clamp(T.in(t, t10k - 0.5, 'heavy'), 0, 1)), 1); rul.material.opacity = 0.95 * ru;
    towers.forEach((s, k) => { const p = T.in(t, tSix + k * 0.2, 'default') * T.out(t, tDome - 0.3); s.visible = p > 0.01; s.scale.setScalar(Math.max(0.01, p)); });
    // wedding cake: appears beside the bubble on "shaped", flips on "upside", then dissolves into the bubble
    const cIn = T.in(t, tShaped - 0.1, 'default') * T.out(t, tCake + 0.9);
    cake.visible = cIn > 0.01;
    const flip = M.clamp(T.in(t, tUpside, 'default'), 0, 1.04);
    const merge = M.clamp(T.in(t, tCake + 0.15, 'heavy'), 0, 1);
    cake.rotation.x = Math.PI * flip;
    const cs = M.lerp(240, 900, merge) * Math.max(0.01, cIn);
    cake.scale.set(cs, M.lerp(330, H, merge) * Math.max(0.01, cIn), cs);
    cake.position.set(M.lerp(-380, 0, merge), M.lerp(700, flip > 0.5 ? H : 0, merge) + (flip > 0.5 ? M.lerp(330, 0, merge) : 0), M.lerp(300, 0, merge));
    cake.traverse(o => { if (o.isMesh) o.material.opacity = cIn * (1 - 0.85 * merge); });
    // RV-7 under the edge
    const rp = rvAt(t), rn = rvAt(t + 0.05); rv.position.copy(rp);
    const yaw = Math.atan2(-(rn.z - rp.z), Math.max(0.01, rn.x - rp.x));       // nose follows the flight path
    rv.rotation.set(Math.sin(t * 0.7) * 0.03, Math.PI + yaw, 0.08 + Math.sin(t * 0.9) * 0.05 - yaw * 0.6);
    rv.visible = t < tHuge + 1.2 || (t > tUnder - 3 && t < tWin + 0.2);
    if (rvProp) rvProp.rotation.x = t * 45;
    // camera
    if (t >= tWin && t < tEnd) {                                               // inside the cabin, looking out the window
      const p = jetAt(t); const c = p.clone().add(new THREE.Vector3(6, 6, 7));
      camera.position.copy(c); camera.lookAt(c.clone().add(new THREE.Vector3(40, 18 - 3 * (t - tWin), -100))); camera.fov = 58;
    } else {
      // camera: each move eases in and out (smootherstep: zero speed AND zero acceleration at both ends, so no jolts)
      const k = (() => { const P = new THREE.Vector3(...camKeys[0].pos), L = new THREE.Vector3(...camKeys[0].look); let f = camKeys[0].fov || 40;
        for (let i = 1; i < camKeys.length; i++) { const a = camKeys[i - 1], b = camKeys[i], d = b.d || 3.0; const u = M.clamp((t - b.t) / d, 0, 1), e = u * u * u * (u * (u * 6 - 15) + 10);
          P.addScaledVector(new THREE.Vector3(...b.pos).sub(new THREE.Vector3(...a.pos)), e); L.addScaledVector(new THREE.Vector3(...b.look).sub(new THREE.Vector3(...a.look)), e); f += ((b.fov || 40) - (a.fov || 40)) * e; }
        return { pos: P, look: L, fov: f }; })();
      let pos = k.pos, look = k.look;
      const ss = (a, b) => { const u = M.clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
      // every follow-shot fades in and out with a weight (no hard switches between shots)
      const wHero = 1 - ss(tGated - 0.7, tGated + 0.3), wGate = ss(tGated - 0.7, tGated + 0.3) * (1 - ss(tHuge - 0.8, tHuge + 0.5));
      { const base = pos.clone(), baseLook = look.clone();                 // hero chase: our RV-7 big in frame, then the bubble ahead of it
        const r = rvOpen(t), w = M.clamp((t - (tBubble - 0.9)) / 1.3, 0, 1), e = w * w * (3 - 2 * w);
        // hero 3/4 shot from behind and above the left wing, the city and the bubble ahead of the nose
        const HO = [-125, 30, 72, 28, -22, -22];             // framed by measuring the RV-7 on screen: big, above the caption
        const hero = r.clone().add(new THREE.Vector3(HO[0], HO[1], HO[2])), heroLook = r.clone().add(new THREE.Vector3(HO[3], HO[4], HO[5]));
        // reveal: rise up behind the RV-7, on the line from the plane to the airport, so the plane stays in the
        // foreground flying toward the bubble (lower third), the whole bubble ahead of it
        const target = new THREE.Vector3(-150, 200, -40), dir = r.clone().sub(target).normalize();
        const reveal = r.clone().addScaledVector(dir, 300).add(new THREE.Vector3(0, -20, 0)), revealLook = target.clone().add(new THREE.Vector3(0, -200, 0));
        const r2 = rvAt(t);                                               // close chase through the gate: RV-7 big, gate ahead
        const gate = r2.clone().add(new THREE.Vector3(-150, 34, 120)), gateLook = r2.clone().lerp(G0.clone().add(new THREE.Vector3(60, 0, -60)), 0.5).add(new THREE.Vector3(0, -40, 0));
        const hp = hero.lerp(reveal, e), hl = heroLook.lerp(revealLook, e);
        pos = base.clone().multiplyScalar(1 - wHero - wGate).addScaledVector(hp, wHero).addScaledVector(gate, wGate);
        look = baseLook.clone().multiplyScalar(1 - wHero - wGate).addScaledVector(hl, wHero).addScaledVector(gateLook, wGate);
      }
      if (t > tUnder - 2.6 && t < tWin) {                                // ride alongside the RV-7, looking up at the shelf
        const r = rvAt(t); const w = ss(tUnder - 2.6, tUnder - 1.4);
        pos = pos.clone().lerp(r.clone().add(new THREE.Vector3(-100, -10, 46)), w); look = look.clone().lerp(r.clone().add(new THREE.Vector3(40, 22, -6)), w);
      }
      pos = pos.clone().add(new THREE.Vector3(Math.sin(t * 0.21) * 25, Math.sin(t * 0.17) * 12, 0));   // the camera never stops
      camera.position.copy(pos); camera.lookAt(look); camera.fov = k.fov;
    }
  }

  // ---------------- 2D overlay
  const proj = v => { const p = v.clone().project(camera); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * HH, p.z]; };
  function overlay(g, t) {
    UI.slam(g, 'AIRSPACE', 540, 430, t, tAir, S(2).t0 - 0.2, { size: 52, bg: '#4F8DFF', color: '#FFFFFF' });
    if (t > tGated - 0.2 && t < tPerm + 0.1) UI.label(g, 'NO ENTRY WITHOUT PERMISSION', 540, 460, t, tGated + 0.2, { tOut: tPerm, bg: C.coral, color: '#FFFFFF', size: 32 });
    if (t > tPerm - 0.1 && t < tHuge) {
      const a = T.win(t, tPerm, tHuge - 0.3);
      g.save(); g.globalAlpha *= a; D.pill(g, 'CLEARED BY AIR TRAFFIC CONTROL', 540, 460, { size: 32, bg: C.teal, color: '#FFFFFF' }); g.restore();
      D.check(g, 540, 560, 48, T.in(t, tPerm + 0.1, 'default'));
    }
    UI.slam(g, 'HUGE', 540, 430, t, tHuge, t10k - 0.6, { size: 54, bg: '#4F8DFF', color: '#FFFFFF' });
    // altitude counter riding up the ruler
    const ru = T.in(t, t10k - 0.5, 'heavy') * T.out(t, tDome - 0.5);
    if (ru > 0.01) {
      const prog = M.clamp(T.in(t, t10k - 0.5, 'heavy'), 0, 1);
      const [x, y] = proj(new THREE.Vector3(RX, H * prog, 0));
      g.save(); g.globalAlpha *= M.clamp(ru, 0, 1);
      D.pill(g, `${(Math.round(prog * 100) * 100).toLocaleString('en-US')} FT`, Math.min(x - 120, 860), y, { size: 40, bg: '#FFFFFF', color: C.ink });
      g.restore();
    }
    if (t > tSix && t < tDome) {
      const [x, y] = proj(new THREE.Vector3(RX + 70, ESB_H * 3.5, 0));
      UI.label(g, 'EMPIRE STATE BUILDING × 6+', Math.min(x + 10, 770), Math.max(520, y), t, tStack - 0.1, { tOut: tDome - 0.4, size: 30 });
    }
    UI.slam(g, 'NOT A DOME', 540, 430, t, tDome, tShaped - 0.1, { size: 46, bg: C.coral, color: '#FFFFFF' });
    UI.slam(g, 'UPSIDE-DOWN WEDDING CAKE', 540, 430, t, tUpside, S(8).t0 - 0.2, { size: 40, bg: '#FFFFFF', color: C.ink });
    if (t > tUnder - 2.6 && t < tWin) {
      const [x, y] = proj(rvAt(t));
      UI.label(g, 'SMALL PLANES: UNDER THE EDGE', Math.max(260, Math.min(820, x)), Math.max(420, y - 170), t, tUnder - 0.3, { to: [x, y - 30], tOut: tWin - 0.25, bg: C.amber, color: C.ink, size: 30 });
    }
    // the window: cabin wall with a rounded window cut-out
    if (t >= tWin - 0.4 && t < tEnd + 0.45) {
      const sm = (a, b) => { const u = M.clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
      const a = sm(tWin - 0.4, tWin) * (1 - sm(tEnd, tEnd + 0.4));           // the cabin wall fades in, covering the camera switch
      const open = sm(tWin, tWin + 0.55) * (1 - sm(tEnd - 0.55, tEnd));     // then the window opens from nothing, and closes again
      const ww = 700 * open, wh = 960 * open, x0 = 540 - ww / 2, y0 = 820 - wh / 2;
      g.save(); g.globalAlpha *= a;
      const rad = Math.min(300, ww / 2);
      g.beginPath(); g.rect(0, 0, W, HH);
      if (open > 0.01) { g.moveTo(x0 + rad, y0); g.arcTo(x0 + ww, y0, x0 + ww, y0 + wh, rad); g.arcTo(x0 + ww, y0 + wh, x0, y0 + wh, rad); g.arcTo(x0, y0 + wh, x0, y0, rad); g.arcTo(x0, y0, x0 + ww, y0, rad); g.closePath(); }
      g.fillStyle = '#E9E4DA'; g.fill('evenodd');
      if (open > 0.01) {
      g.lineWidth = 34; g.strokeStyle = '#D3CCBF'; D.rr(g, x0 - 10, y0 - 10, ww + 20, wh + 20, 310); g.stroke();
      g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,0.12)'; D.rr(g, x0 + 6, y0 + 6, ww - 12, wh - 12, 296); g.stroke(); }
      g.restore();
      UI.slam(g, "YOU'RE INSIDE THE CAKE", 540, 470, t, tInside, tEnd - 0.2, { size: 38, bg: '#4F8DFF', color: '#FFFFFF' });
    }
  }

  window.__probe = t => { update(t); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const box = new THREE.Box3().setFromObject(rv), xs = [], ys = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) { const q = proj(new THREE.Vector3(x, y, z)); xs.push(q[0]); ys.push(q[1]); }
    return [Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys))];
  };
  return { topic: 'Airspace', update, overlay, tail: 1.6 };
}
