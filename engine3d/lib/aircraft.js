// aircraft.js — the series airplane in 3D: a high-wing four-seat trainer with real proportions, lightly stylised.
// Units are metres. Nose points +x (spinner tip at x = -0.35), up +y, the left wing is +z.
// buildTrainer(opts) → { group, parts, set(t, o) }   o: { prop: true, rudder, aileron, elevator, flaps }
import * as THREE from 'three';

export const LIVERY = { body: '#F7F8FA', stripe: '#1E3A7A', pin: '#E8574A', glass: '#22324F', tire: '#23262E', metal: '#BFC6D1', spinner: '#E8574A' };

const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, ...o });

// fuselage stations: x, half-width, top, bottom (metres)
const ST = [
  [0.00, 0.30, 0.22, -0.32], [0.25, 0.46, 0.40, -0.48], [0.80, 0.54, 0.52, -0.56], [1.45, 0.57, 0.60, -0.58],
  [2.05, 0.60, 1.00, -0.58], [2.60, 0.61, 1.08, -0.56], [3.40, 0.59, 1.06, -0.50], [4.30, 0.48, 0.88, -0.28],
  [5.40, 0.33, 0.70, -0.02], [6.60, 0.20, 0.56, 0.18], [7.60, 0.10, 0.50, 0.30], [8.05, 0.04, 0.48, 0.38],
];
function station(x) {
  let i = 0; while (i < ST.length - 2 && x > ST[i + 1][0]) i++;
  const p0 = ST[Math.max(0, i - 1)], p1 = ST[i], p2 = ST[i + 1], p3 = ST[Math.min(ST.length - 1, i + 2)];
  const u = (x - p1[0]) / (p2[0] - p1[0]);
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return { hw: cr(p0[1], p1[1], p2[1], p3[1]), top: cr(p0[2], p1[2], p2[2], p3[2]), bot: cr(p0[3], p1[3], p2[3], p3[3]) };
}
// superellipse cross-section: boxy but soft, like a real cabin
function ring(x, th, n = 2.5) {
  const s = station(x), c = Math.cos(th), sn = Math.sin(th);
  const z = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * s.hw;
  const mid = (s.top + s.bot) / 2, hh = (s.top - s.bot) / 2;
  const y = mid + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * hh;
  return new THREE.Vector3(x, y, z);
}
/** Loft a patch of the fuselage surface: x0..x1, th0..th1 (θ = 0 is the left side, π/2 the roof). inflate pushes it out. */
function loft(x0, x1, th0, th1, nx, nt, inflate = 0, color = null) {
  const pos = [], col = [], idx = [];
  const cA = color ? new THREE.Color(color) : null;
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nt; j++) {
    const x = x0 + (x1 - x0) * i / nx, th = th0 + (th1 - th0) * j / nt;
    const p = ring(x, th);
    if (inflate) { const s = station(x), mid = (s.top + s.bot) / 2; const d = new THREE.Vector3(0, p.y - mid, p.z).normalize(); p.addScaledVector(d, inflate); }
    pos.push(p.x, p.y, p.z);
    if (cA) col.push(cA.r, cA.g, cA.b);
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
    const a = i * (nt + 1) + j, b = a + nt + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (cA) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function airfoilShape(chord, t = 0.13) {
  // NACA-ish 2412 outline in the x/y plane, leading edge at x = 0
  const s = new THREE.Shape(), N = 28, up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const xc = (1 - Math.cos(Math.PI * i / N)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
    const yc = xc < 0.4 ? 0.02 / 0.16 * (0.8 * xc - xc * xc) : 0.02 / 0.36 * (0.2 + 0.8 * xc - xc * xc);
    up.push([xc * chord, (yc + yt) * chord]); lo.push([xc * chord, (yc - yt) * chord]);
  }
  s.moveTo(up[0][0], up[0][1]); up.forEach(([x, y]) => s.lineTo(x, y)); lo.reverse().forEach(([x, y]) => s.lineTo(x, y));
  return s;
}
function wingMesh(chord, span, m, t = 0.13) {
  const g = new THREE.ExtrudeGeometry(airfoilShape(chord, t), { depth: span, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.03, bevelSegments: 6, curveSegments: 4, steps: 1 });
  g.translate(0, 0, -span / 2); g.rotateY(Math.PI); g.computeVertexNormals();   // leading edge → +x
  return new THREE.Mesh(g, m);
}

// a cylinder from point a to point b
function rod(a, b, r0, r1, m) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 10), m);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return mesh;
}

export function buildTrainer(livery = {}) {
  const L = { ...LIVERY, ...livery };
  const M = { body: mat(L.body), stripe: mat(L.stripe), pin: mat(L.pin), glass: mat(L.glass, { roughness: 0.04, clearcoat: 1, metalness: 0.2 }),
    tire: new THREE.MeshStandardMaterial({ color: L.tire, roughness: 0.75 }), metal: mat(L.metal, { metalness: 0.6, roughness: 0.3 }), spinner: mat(L.spinner) };
  const g = new THREE.Group();
  const add = (mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // fuselage body
  add(new THREE.Mesh(loft(0, 8.05, -Math.PI, Math.PI, 90, 64), M.body));
  // stripe: a band along each side, plus a coral pinstripe under it
  for (const sgn of [1, -1]) {
    const a = sgn > 0 ? 0 : Math.PI;
    add(new THREE.Mesh(loft(0.3, 7.9, a - 0.10 * sgn, a + 0.05 * sgn, 80, 3, 0.004), M.stripe));
    add(new THREE.Mesh(loft(0.3, 7.9, a - 0.17 * sgn, a - 0.13 * sgn, 80, 2, 0.004), M.pin));
  }
  // windshield + side windows: patches of the same surface, pushed out a hair
  add(new THREE.Mesh(loft(1.55, 2.15, 0.62, Math.PI - 0.62, 14, 24, 0.006), M.glass));
  for (const sgn of [1, -1]) {
    const a = sgn > 0 ? 0.0 : Math.PI;
    add(new THREE.Mesh(loft(2.25, 2.95, a + 0.30 * sgn, a + 0.95 * sgn, 10, 8, 0.006), M.glass));
    add(new THREE.Mesh(loft(3.05, 3.65, a + 0.30 * sgn, a + 0.90 * sgn, 10, 8, 0.006), M.glass));
  }
  // cowling seam (a thin dark ring) and exhaust stub
  add(new THREE.Mesh(loft(1.32, 1.36, -Math.PI, Math.PI, 2, 64, 0.003), new THREE.MeshStandardMaterial({ color: '#9AA3B2', roughness: 0.6 })));
  // high wing on the cabin roof (constant chord, slight dihedral), struts
  const wing = add(wingMesh(1.55, 11.0, M.body)); wing.position.set(3.25, 1.12, 0);
  for (const sgn of [1, -1]) {
    const tip = add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), M.pin)); tip.position.set(2.55, 1.18, sgn * 5.55); tip.scale.set(2.6, 0.7, 0.6);
    add(rod([2.85, -0.32, sgn * 0.56], [2.55, 1.06, sgn * 2.75], 0.05, 0.035, M.metal));   // fuselage → wing
  }
  // tail: horizontal stabiliser + swept fin with a stripe
  const stab = add(wingMesh(0.95, 3.5, M.body, 0.1)); stab.position.set(8.0, 0.42, 0);
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(1.35, 0); fs.quadraticCurveTo(1.45, 0.9, 1.25, 1.55); fs.lineTo(0.95, 1.6); fs.quadraticCurveTo(0.55, 0.6, 0, 0);
  const finG = new THREE.ExtrudeGeometry(fs, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 4 });
  finG.translate(0, 0, -0.045); const fin = add(new THREE.Mesh(finG, M.body)); fin.position.set(6.75, 0.48, 0);
  const finStripe = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.14), M.stripe)); finStripe.position.set(7.82, 1.62, 0); finStripe.rotation.z = -0.25;
  // gear: spring-steel legs, wheel pants, nose gear
  for (const sgn of [1, -1]) {
    add(rod([3.0, -0.5, sgn * 0.42], [2.95, -1.12, sgn * 1.2], 0.06, 0.045, M.metal));      // spring-steel leg
    const pant = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), M.body)); pant.position.set(2.95, -1.2, sgn * 1.25); pant.scale.set(2.0, 0.95, 0.55);
    const tire = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.09, 12, 24), M.tire)); tire.position.set(2.95, -1.3, sgn * 1.25);
  }
  const nleg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 10), M.metal)); nleg.position.set(0.55, -0.85, 0);
  const npant = add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), M.body)); npant.position.set(0.55, -1.22, 0); npant.scale.set(1.8, 0.9, 0.5);
  // spinner + prop (blades for stills, a soft disc for motion)
  const sp = []; for (let i = 0; i <= 16; i++) { const u = i / 16; sp.push(new THREE.Vector2(0.27 * Math.sin(Math.PI / 2 * Math.pow(u, 0.6)), -0.38 + u * 0.4)); }
  const spinner = add(new THREE.Mesh(new THREE.LatheGeometry(sp.reverse(), 32), M.spinner)); spinner.rotation.z = Math.PI / 2; spinner.position.set(0.02, -0.04, 0);
  const prop = new THREE.Group(); prop.position.set(-0.12, -0.04, 0); g.add(prop);
  for (const s of [1, -1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.95, 0.12), M.tire); b.position.y = s * 0.5; b.castShadow = true; prop.add(b); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.98, 48), new THREE.MeshBasicMaterial({ color: '#C8D0DC', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.y = Math.PI / 2; prop.add(disc);
  // nav lights
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#FF3B3B' })); navL.position.set(2.5, 1.2, 5.68); g.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#2BFF7A' })); navR.position.set(2.5, 1.2, -5.68); g.add(navR);
  // centre the model on the wing's centre of lift
  g.children.forEach(c => c.position.x -= 3.0);
  prop.position.x = -3.12;

  function set(t, o = {}) {
    prop.rotation.x = o.prop === false ? 0.4 : t * 52;
    prop.children.forEach(c => { if (c !== disc && c.material) { c.visible = true; } });
  }
  return { group: g, set };
}
