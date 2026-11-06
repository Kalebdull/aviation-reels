// props3d.js — reusable 3D set pieces for episodes (three.js). All built procedurally; units are "scene metres".
//   airliner()            stylised twin-jet (white + blue), nose → -X, up +Y, left wing +Z. { group, set(t) }
//   tower()               control tower with a cab whose light can glow { group, cab(light 0..1, colour) }
//   airport(opts)         runways + taxiways + terminal + apron, centred on the origin
//   city(opts)            instanced blocks of buildings with lit windows, around a centre
//   skyscraper(h)         art-deco tower silhouette with setbacks and a spire, height h (base at y = 0)
//   airspace(opts)        the bubble: a lathe that morphs dome → upside-down wedding cake. { group, set(morph, opacity) }
//   boomGate()            a gated-community barrier arm { group, set(lift 0..1) }
//   ruler(h)              vertical altitude ruler with ticks (overlay draws the numbers)
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, ...o });
const shadow = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

export function airliner() {
  const g = new THREE.Group();
  const white = phys('#F4F6F9'), blue = phys('#1F4FC4'), grey = phys('#B7C0CC', { metalness: 0.4 }), dark = std('#20283A', { roughness: 0.3 });
  // fuselage: a lathe along X (nose at -X)
  const prof = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40; let r;
    if (u < 0.12) r = 1.0 * Math.sqrt(1 - ((0.12 - u) / 0.12) ** 2);
    else if (u < 0.78) r = 1.0;
    else r = 1.0 - 0.75 * ((u - 0.78) / 0.22) ** 1.4;
    prof.push(new THREE.Vector2(Math.max(0.02, r), u * 20));
  }
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), white); fus.rotation.z = Math.PI / 2; fus.position.x = 10; g.add(fus);
  // blue belly stripe + cheatline
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.012, 1.012, 14, 48, 1, true, Math.PI * 0.62, Math.PI * 0.76), blue);
  stripe.rotation.z = Math.PI / 2; stripe.position.x = 0.5; g.add(stripe);
  // cockpit windows
  const cw = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 12, Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.32, Math.PI * 0.12), dark); cw.position.x = -7.55; cw.scale.set(1.01, 1.01, 1.01); g.add(cw);
  // passenger windows: a dotted dark band along both sides
  const wg = new THREE.CapsuleGeometry(0.07, 0.06, 4, 8);
  for (const z of [1.0, -1.0]) for (let k = 0; k < 24; k++) { const w = new THREE.Mesh(wg, dark); w.position.set(-5 + k * 0.55, 0.28, z * 0.985); w.rotation.x = Math.PI / 2; g.add(w); }
  // swept wings
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.lineTo(3.6, 0); wingShape.lineTo(6.6, 11); wingShape.lineTo(5.4, 11); wingShape.lineTo(0, 1.4); wingShape.closePath();
  const wingG = new THREE.ExtrudeGeometry(wingShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(wingG, white); w.rotation.x = s * Math.PI / 2; w.position.set(-1.6, -0.45, 0); w.rotation.z = 0; if (s < 0) w.scale.z = -1;
    w.rotation.set(-Math.PI / 2 * s, 0, 0.05 * s); g.add(w);
    // engine under each wing
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 2.6, 32), grey); eng.rotation.z = Math.PI / 2; eng.position.set(-0.4, -1.15, s * 4.3); g.add(eng);
    const inlet = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.05, 32), dark); inlet.rotation.z = Math.PI / 2; inlet.position.set(-1.72, -1.15, s * 4.3); g.add(inlet);
    // stabiliser
    const st = new THREE.Shape(); st.moveTo(0, 0); st.lineTo(1.8, 0); st.lineTo(3.4, 4.2); st.lineTo(2.6, 4.2); st.lineTo(0, 0.8); st.closePath();
    const stab = new THREE.Mesh(new THREE.ExtrudeGeometry(st, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }), white);
    stab.rotation.set(-Math.PI / 2 * s, 0, 0); stab.position.set(7.4, 0.35, 0); g.add(stab);
  }
  // tail fin (blue)
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(3.4, 0); fs.lineTo(4.6, 5.2); fs.lineTo(3.3, 5.2); fs.lineTo(0, 0.6); fs.closePath();
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }), blue);
  fin.position.set(6.2, 0.7, -0.08); g.add(fin);
  // landing gear (for the landing shot)
  const gear = new THREE.Group(); g.add(gear);
  for (const [x, z] of [[-6, 0], [0.6, 1.6], [0.6, -1.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), grey); leg.position.set(x, -1.4, z); gear.add(leg);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16), std('#15171C')); wh.rotation.x = Math.PI / 2; wh.position.set(x, -2.0, z); gear.add(wh);
  }
  // nav lights + a strobe that blinks with t
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: '#FF3B3B' })); red.position.set(5.1, -0.4, 11.2); g.add(red);
  const grn = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: '#2BFF7A' })); grn.position.set(5.1, -0.4, -11.2); g.add(grn);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.18), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })); strobe.position.set(-0.2, 1.05, 0); g.add(strobe);
  shadow(g);
  return { group: g, set(t, o = {}) { strobe.visible = (t * 1.1) % 1 < 0.08; gear.visible = o.gear !== false; } };
}

export function tower() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 22, 24), std('#EEF0F4')); shaft.position.y = 11; g.add(shaft);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.2, 1.6, 8), std('#DDE2EA')); deck.position.y = 22.8; g.add(deck);
  const cabM = new THREE.MeshStandardMaterial({ color: '#2B4A78', roughness: 0.08, metalness: 0.3, emissive: new THREE.Color('#000000') });
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.8, 3.6, 8), cabM); cab.position.y = 25.4; g.add(cab);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.9, 0.9, 8), std('#F4F6FA')); roof.position.y = 27.6; g.add(roof);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), std('#B8C0CC')); mast.position.y = 30; g.add(mast);
  shadow(g);
  return { group: g, cab(light, color = '#3BFF8E') { cabM.emissive.set(color); cabM.emissiveIntensity = light * 2.2; }, top: 28 };
}

export function airport(o = {}) {
  const g = new THREE.Group();
  const tarmac = std('#3B4052', { roughness: 0.9 }), concrete = std('#9CA3AF', { roughness: 0.95 }), paint = new THREE.MeshBasicMaterial({ color: '#E9ECF1' });
  const rw = (len, w, x, z, rot) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, w), tarmac); r.position.set(x, 0.1, z); r.rotation.y = rot; g.add(r);
    for (let k = -len / 2 + 30; k < len / 2 - 30; k += 22) { const d = new THREE.Mesh(new THREE.BoxGeometry(10, 0.05, 0.9), paint); d.position.set(x + Math.cos(rot) * k, 0.24, z - Math.sin(rot) * k); d.rotation.y = rot; g.add(d); }
    for (const e of [-1, 1]) for (let s = -3; s <= 3; s++) { const b = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 2.2), paint); const k = e * (len / 2 - 10); b.position.set(x + Math.cos(rot) * k - Math.sin(rot) * s * 3.4, 0.24, z - Math.sin(rot) * k - Math.cos(rot) * s * 3.4); b.rotation.y = rot; g.add(b); }
  };
  rw(o.len || 420, 26, 0, -30, 0.08); rw((o.len || 420) * 0.85, 24, 10, 60, 0.08);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(220, 0.15, 60), concrete); apron.position.set(-20, 0.08, 15); apron.rotation.y = 0.08; g.add(apron);
  const term = new THREE.Mesh(new THREE.BoxGeometry(160, 12, 22), phys('#DCE3EC')); term.position.set(-20, 6, 2); term.rotation.y = 0.08; g.add(term);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(158, 6, 0.4), std('#5D86C2', { roughness: 0.1, metalness: 0.4, emissive: new THREE.Color('#2A3B5A'), emissiveIntensity: 0.4 })); glass.position.set(-20 - 0.0, 7, 13.3); glass.rotation.y = 0.08; g.add(glass);
  shadow(g);
  return { group: g };
}

export function skyscraper(h, o = {}) {
  // art-deco setbacks: base, three set-back blocks, a crown, a spire (≈ Empire State proportions; spire ≈ 14 % of the total)
  const g = new THREE.Group(), m = o.material || phys('#D9D2C3', { roughness: 0.6 }), wf = o.wide || 1;
  const parts = [[0.30, 0.42, 0.06], [0.36, 0.30, 0.07], [0.62, 0.24, 0.55], [0.74, 0.17, 0.12], [0.80, 0.11, 0.06], [0.86, 0.07, 0.06]];
  let y = 0;
  for (const [, w, f] of parts) { const hh = f * h; const b = new THREE.Mesh(new THREE.BoxGeometry(w * h * 0.5 * wf, hh, w * h * 0.5 * wf), m); b.position.y = y + hh / 2; g.add(b); y += hh; }
  const sp = new THREE.Mesh(new THREE.ConeGeometry(0.012 * h * wf, h - y, 8), m); sp.position.y = y + (h - y) / 2; g.add(sp);
  shadow(g);
  return g;
}

export function city(o = {}) {
  const n = o.count || 600, R0 = o.inner || 280, R1 = o.outer || 900;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, color: '#FFFFFF' });
  mat.onBeforeCompile = sh => {      // window bands on the walls, a lighter roof, a warm glint in some windows
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wall = 1.0 - step(0.6, abs(vWN.y));
        float band = step(0.45, fract(vWP.y / 5.5)) * step(2.5, vWP.y);
        float col = step(0.3, fract((vWP.x + vWP.z) / 4.0));
        vec3 glass = mix(vec3(0.20, 0.30, 0.45), vec3(1.0, 0.82, 0.55), step(0.93, fract(sin(dot(floor(vWP.xz / 4.0) + floor(vWP.y / 5.5), vec2(12.9, 78.2))) * 43758.5)));
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, wall * band * col * 0.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12 + 0.05, step(0.6, vWN.y));`);
  };
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const h = (i, k) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
  let k = 0;
  for (let i = 0; k < n && i < n * 4; i++) {
    const a = (o.a0 ?? 0.5) + h(i, 1) * (o.arc ?? 2.2), r = R0 + (R1 - R0) * Math.sqrt(h(i, 2));
    const x = (o.cx || 0) + Math.cos(a) * r, z = (o.cz || 0) + Math.sin(a) * r;
    const core = 1 - Math.min(1, (r - R0) / (R1 - R0));
    const w = 10 + h(i, 3) * 16, ht = 8 + Math.pow(h(i, 4), 2.6) * (25 + (o.tall ?? 110) * core);
    m4.compose(new THREE.Vector3(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.round(h(i, 5) * 4) * Math.PI / 2 + 0.08), new THREE.Vector3(w, ht, w * (0.7 + 0.6 * h(i, 6))));
    inst.setMatrixAt(k, m4); inst.setColorAt(k, c.setHSL(0.07 + h(i, 7) * 0.06, 0.18 + h(i, 9) * 0.12, 0.62 + h(i, 8) * 0.2)); k++;
  }
  inst.count = k; inst.castShadow = true; inst.receiveShadow = true;
  return { group: inst };
}

/** Airspace bubble. Profile morphs from a dome (morph 0) to an upside-down wedding cake (morph 1).
 *  H = top, tiers: [r, floor] from the centre out. The cake's bottom tier touches the ground; outer tiers float. */
export function airspace(o = {}) {
  const H = o.H || 100, tiers = o.tiers || [[60, 0], [100, 30], [145, 55]];
  const N = 120;
  // cake outline as a closed path (r, y), walked from the centre bottom out and up to the top
  const cake = [[0, 0]];
  tiers.forEach(([r, f], i) => { if (i) cake.push([tiers[i - 1][0], f]); cake.push([r, f]); });
  cake.push([tiers[tiers.length - 1][0], H]); cake.push([0, H]);
  const resample = (pts, n) => {   // equal-length resample of a polyline
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const out = []; for (let k = 0; k < n; k++) { const d = L[L.length - 1] * k / (n - 1); let i = 1; while (i < L.length - 1 && L[i] < d) i++; const u = (d - L[i - 1]) / (L[i] - L[i - 1] || 1); out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]); } return out;
  };
  const C = resample(cake, N);
  const Rd = tiers[tiers.length - 1][0];
  const dome = []; for (let k = 0; k < N; k++) {           // a dome over the same footprint, walked the same way (bottom centre → rim → top centre)
    const u = k / (N - 1);
    if (u < 0.3) dome.push([Rd * (u / 0.3), 0]);
    else { const a = (u - 0.3) / 0.7 * Math.PI / 2; dome.push([Rd * Math.cos(a), H * 1.05 * Math.sin(a)]); }
  }
  const mat = new THREE.MeshPhysicalMaterial({ color: o.color || '#4F8DFF', transparent: true, opacity: 0.30, roughness: 0.15, metalness: 0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(o.color || '#4F8DFF'), emissiveIntensity: 0.45 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: o.edge || '#BFD7FF', transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  const g = new THREE.Group(); let mesh = null, rims = new THREE.Group(); g.add(rims);
  function set(morph = 1, opacity = 1) {
    const pts = C.map((c, k) => new THREE.Vector2(Math.max(0.01, dome[k][0] + (c[0] - dome[k][0]) * morph), dome[k][1] + (c[1] - dome[k][1]) * morph));
    if (mesh) { mesh.geometry.dispose(); g.remove(mesh); }
    mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 128), mat); mesh.renderOrder = 5; g.add(mesh);
    mat.opacity = 0.30 * Math.min(1, opacity); mat.emissiveIntensity = 0.45 * opacity;
    // glowing rings at each tier edge (top and bottom of every step), fade with the morph
    rims.clear();
    const rings = morph > 0.02 ? tiers.flatMap(([r, f]) => [[r, f], [r, H]]) : [[Rd, 0]];
    for (const [r, y] of rings) {
      const rr = morph > 0.02 ? r : Rd, yy = morph > 0.02 ? y : 0;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, o.edgeW || 4, 8, 160), edgeMat); ring.rotation.x = Math.PI / 2; ring.position.y = yy; ring.renderOrder = 6; rims.add(ring);
    }
    edgeMat.opacity = Math.min(1, 0.95 * opacity) * Math.max(0.3, morph);
  }
  set(1, 1);
  return { group: g, set, H, tiers };
}

export function boomGate() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 1.4), phys('#F2F2F2')); post.position.y = 1.6; g.add(post);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.5, 1.42), phys('#E8574A')); stripe.position.y = 2.6; g.add(stripe);
  const pivot = new THREE.Group(); pivot.position.set(0, 2.9, 0); g.add(pivot);
  for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.35), phys(k % 2 ? '#E8574A' : '#FFFFFF')); s.position.x = 1.3 + k * 2.2; pivot.add(s); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({ color: '#FF4040', emissive: new THREE.Color('#FF2020'), emissiveIntensity: 1.5 })); lamp.position.y = 3.6; g.add(lamp);
  shadow(g);
  return { group: g, set(lift, ok = 0) { pivot.rotation.z = lift * Math.PI * 0.45; lamp.material.color.set(ok > 0.5 ? '#2BFF7A' : '#FF4040'); lamp.material.emissive.set(ok > 0.5 ? '#20FF60' : '#FF2020'); } };
}

export function ruler(h) {
  const g = new THREE.Group(); const m = new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.95 });
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h, 0)]), m));
  for (let k = 0; k <= 10; k++) { const w = k % 5 === 0 ? 6 : 3; g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, h * k / 10, 0), new THREE.Vector3(w, h * k / 10, 0)]), m)); }
  return { group: g, material: m };
}
