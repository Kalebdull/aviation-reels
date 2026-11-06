// world3d.js — cinematic countryside at golden hour: sky dome with sun glow, patchwork farmland terrain,
// instanced trees, soft cumulus, aerial-perspective haze, warm key light + cool sky fill.
// buildWorld(renderer, opts) → { scene, sun, update(t) }
import * as THREE from 'three';

export const LOOKS = {
  golden: { skyTop: '#3A64B0', skyMid: '#E59E7A', skyLow: '#FFD6A2', sun: '#FFD9A0', key: '#FFC98E', keyI: 3.6, fill: '#A9C2EE', fillI: 0.9, ground: '#B9A58C', fog: '#EDC3A0', fogNear: 300, fogFar: 3200, sunEl: 0.12, sunAz: 2.2, exposure: 1.0 },
  day:    { skyTop: '#2F7BD6', skyMid: '#8EC5F2', skyLow: '#DDEFFF', sun: '#FFF6E0', key: '#FFF3DC', keyI: 3.6, fill: '#BFD9FF', fillI: 1.3, ground: '#B3B09A', fog: '#CFE4F7', fogNear: 200, fogFar: 2400, sunEl: 0.75, sunAz: 2.6, exposure: 1.0 },
};

// deterministic value noise / fbm
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
export function terrainHeight(x, z) {
  const d = Math.hypot(x, z), ring = Math.max(0, Math.min(1, (d - 3000) / 1600));
  return 70 * fbm(x * 0.0016, z * 0.0016, 5) + 18 * fbm(x * 0.006 + 9, z * 0.006, 3) - 60 + ring * ring * (520 * fbm(x * 0.0009 + 3, z * 0.0009, 4) + 60);
}

// The cartoon look for the ground, computed per pixel (crisp at any distance): patchwork fields with crop rows and
// hedgerows, rounded forests, a winding river with sandy banks, a couple of roads, mown grass around the airport.
const TERRAIN_GLSL = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fb(vec2 p){ float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
vec3 cartoonGround(vec2 p, float flatR){
  vec3 pal[8];
  pal[0] = vec3(0.42, 0.66, 0.30); pal[1] = vec3(0.55, 0.73, 0.33); pal[2] = vec3(0.80, 0.70, 0.36); pal[3] = vec3(0.35, 0.58, 0.27);
  pal[4] = vec3(0.67, 0.76, 0.38); pal[5] = vec3(0.74, 0.55, 0.34); pal[6] = vec3(0.86, 0.78, 0.45); pal[7] = vec3(0.48, 0.70, 0.36);
  float c8 = cos(0.08), s8 = sin(0.08);
  vec2 r = vec2(c8 * p.x - s8 * p.y, s8 * p.x + c8 * p.y);
  vec2 q = r / vec2(150.0, 110.0) + 0.9 * vec2(fb(p * 0.0018), fb(p * 0.0018 + 7.0));
  vec2 cell = floor(q), f = fract(q);
  float hc = h21(cell);
  vec3 col = pal[int(hc * 7.99)];
  // crop rows in about half the fields
  float ang = h21(cell + 3.1) * 3.14159;
  float ph = (f.x * cos(ang) + f.y * sin(ang)) * 70.0;
  float aa = 1.0 - smoothstep(0.4, 1.6, fwidth(ph));            // fade the crop rows out where they'd shimmer
  col *= (h21(cell + 9.7) > 0.45) ? (1.0 - 0.06 * aa * (0.5 + 0.5 * sin(ph))) : 1.0;
  col *= 0.95 + 0.1 * vn(p * 0.05);
  // hedgerows between fields
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  col = mix(vec3(0.27, 0.47, 0.24), col, smoothstep(0.008, 0.022, e));
  // forests
  float fo = fb(p * 0.0024 + 3.0);
  col = mix(col, vec3(0.20, 0.42, 0.22) * (0.85 + 0.3 * vn(p * 0.03)), smoothstep(0.60, 0.63, fo));
  // mown grass around the airport
  float d0 = length(p);
  vec3 grass = vec3(0.50, 0.72, 0.34) * (0.96 + 0.04 * step(0.0, sin(r.x * 0.12)));
  col = mix(grass, col, smoothstep(flatR * 0.55, flatR * 0.75, d0));
  // river with sandy banks
  float rv = abs(p.y - (1750.0 + 380.0 * sin(p.x / 800.0) + 150.0 * sin(p.x / 310.0)));
  col = mix(vec3(0.90, 0.84, 0.64), col, smoothstep(44.0, 52.0, rv));
  vec3 water = mix(vec3(0.24, 0.55, 0.80), vec3(0.50, 0.78, 0.92), 0.5 + 0.5 * sin(p.x * 0.02 + p.y * 0.01));
  col = mix(water, col, smoothstep(34.0, 40.0, rv));
  // roads
  float rd = min(abs(dot(p, normalize(vec2(0.35, 1.0))) - 900.0), abs(dot(p, normalize(vec2(1.0, -0.2))) + 1300.0));
  col = mix(vec3(0.82, 0.79, 0.72), col, smoothstep(4.0, 6.0, rd));
  return col;
}`;

export function buildWorld(renderer, opts = {}) {
  const L = { ...LOOKS[opts.look || 'golden'], ...(opts.over || {}) };
  // optional flat area (airports, towns): terrain blends to height fy inside radius fr
  const F = opts.flat;
  const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const heightAt = (x, z) => { const h = terrainHeight(x, z); if (!F) return h; const d = Math.hypot(x - (F.x || 0), z - (F.z || 0)); return h + ((F.y || 0) - h) * (1 - ss(F.r * 0.75, F.r, d)); };
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = L.exposure; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
  const sunDir = new THREE.Vector3(Math.cos(L.sunAz) * Math.cos(L.sunEl), Math.sin(L.sunEl), Math.sin(L.sunAz) * Math.cos(L.sunEl)).normalize();

  // sky dome: three-stop gradient + a soft sun glow
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(L.skyTop) }, mid: { value: new THREE.Color(L.skyMid) }, low: { value: new THREE.Color(L.skyLow) }, sunC: { value: new THREE.Color(L.sun) }, sunD: { value: sunDir } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, mid, low, sunC, sunD; varying vec3 vd;
      void main(){ float h = vd.y; vec3 c = mix(low, mid, smoothstep(-0.02, 0.18, h)); c = mix(c, top, smoothstep(0.15, 0.75, h));
        float s = max(dot(normalize(vd), sunD), 0.); c += sunC * (pow(s, 12.) * 0.45 + pow(s, 900.) * 4.0);
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  sky.renderOrder = -1; scene.add(sky);
  // the same sky as an environment map: soft reflections in the paint and glass (the biggest "Pixar" cue)
  { const envScene = new THREE.Scene(); const s2 = sky.clone(); s2.material = sky.material.clone(); s2.material.uniforms = sky.material.uniforms; envScene.add(s2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(3000, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(L.ground).multiplyScalar(0.6) })); ground.position.y = -80; envScene.add(ground);
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(envScene, 0.02).texture; scene.environmentIntensity = opts.envI ?? 0.55; }

  const hemi = new THREE.HemisphereLight(L.fill, L.ground, L.fillI); scene.add(hemi);
  const sun = new THREE.DirectionalLight(L.key, L.keyI);
  sun.position.copy(sunDir).multiplyScalar(200); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 500 });
  scene.add(sun); scene.add(sun.target);

  // terrain: patchwork fields (vertex colours by cell), hedgerow darkening at cell edges
  const size = 9000, seg = 600;
  const tg = new THREE.PlaneGeometry(size, size, seg, seg); tg.rotateX(-Math.PI / 2);
  const P = tg.attributes.position, cols = [];
  const fieldCols = ['#79A84B', '#97B653', '#D1B865', '#5F9A45', '#B4B35A', '#88AE4E', '#D8A85E', '#4F8A3F', '#A9C266'].map(c => new THREE.Color(c));
  const forest = new THREE.Color('#2E5A30');
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), h = heightAt(x, z);
    P.setY(i, h);
    const cx = Math.floor((x + 13) / 60 + 0.35 * Math.sin(z * 0.004)), cz = Math.floor((z + 7) / 45 + 0.35 * Math.sin(x * 0.004));
    let c = fieldCols[Math.floor(hash(cx, cz) * fieldCols.length)].clone();
    if (fbm(x * 0.004 + 3, z * 0.004, 3) > 0.62) c.lerp(forest, 0.85);
    const ex = Math.abs(((x + 13) / 60 + 0.35 * Math.sin(z * 0.004)) % 1), ez = Math.abs(((z + 7) / 45 + 0.35 * Math.sin(x * 0.004)) % 1);
    if (Math.min(ex, 1 - ex, ez, 1 - ez) < 0.05) c.lerp(forest, 0.55);
    c.multiplyScalar(0.9 + 0.2 * vnoise(x * 0.05, z * 0.05));
    cols.push(c.r, c.g, c.b);
  }
  tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); tg.computeVertexNormals();
  const tmat = new THREE.MeshStandardMaterial({ vertexColors: !opts.cartoon, roughness: 0.92 });
  if (opts.cartoon) tmat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\n' + TERRAIN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb = pow(cartoonGround(vWorldP.xz, ${((F && F.r) || 1).toFixed(1)}), vec3(2.2));`);
  };
  const terrain = new THREE.Mesh(tg, tmat);
  terrain.receiveShadow = true; scene.add(terrain);

  // trees along the forests and hedgerows (instanced)
  // a canopy is three merged blobs, not an egg
  const treeG = (() => { const parts = [[0, 0, 0, 1], [0.55, -0.15, 0.2, 0.7], [-0.45, -0.1, -0.25, 0.75]].map(([x, y, z, r]) => { const gg = new THREE.IcosahedronGeometry(r, 2); gg.translate(x, y, z); return gg; });
    const pos = [], nor = []; parts.forEach(pg => { const ng = pg.toNonIndexed(); pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.scale(1, 0.8, 1); return out; })();
  const MAXT = 26000;
  const trees = new THREE.InstancedMesh(treeG, new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.9 }), MAXT);
  const m4 = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < 400000 && n < MAXT; i++) {
    const x = (hash(i, 1) - 0.5) * 5200, z = (hash(i, 2) - 0.5) * 5200;
    const forestHere = fbm(x * 0.004 + 3, z * 0.004, 3) > 0.62;
    const ex = Math.abs(((x + 13) / 60 + 0.35 * Math.sin(z * 0.004)) % 1), ez = Math.abs(((z + 7) / 45 + 0.35 * Math.sin(x * 0.004)) % 1), hedge = Math.min(ex, 1 - ex, ez, 1 - ez) < 0.025;
    if (!forestHere && !(hedge && hash(i, 3) < 0.6)) continue;
    if (F && Math.hypot(x - (F.x || 0), z - (F.z || 0)) < F.r * (F.treeFree ?? 0.9)) continue;
    const s = 2.4 + hash(i, 4) * 2.2;
    m4.compose(new THREE.Vector3(x, heightAt(x, z) + s * 0.5, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 7) * 6.28), new THREE.Vector3(s, s, s));
    trees.setMatrixAt(n++, m4);
    trees.setColorAt(n - 1, new THREE.Color().setHSL(0.26 + hash(i, 5) * 0.07, opts.cartoon ? 0.5 : 0.42, (opts.cartoon ? 0.16 : 0.11) + hash(i, 6) * 0.08));
  }
  trees.count = n; trees.receiveShadow = true; scene.add(trees);

  // soft cumulus: clusters of spheres, lit warm on top, shadowed blue underneath via hemisphere light
  const cloudM = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 1, emissive: new THREE.Color(L.skyLow), emissiveIntensity: 0.18 });
  const puff = new THREE.IcosahedronGeometry(1, 3);
  const clouds = new THREE.Group(); scene.add(clouds);
  for (let k = 0; k < (opts.clouds ?? 26); k++) {
    const c = new THREE.Group();
    const cx = (hash(k, 11) - 0.5) * 2600, cz = -200 - hash(k, 12) * 2200, cy = 260 + hash(k, 13) * 160, w = 60 + hash(k, 14) * 90;
    for (let j = 0; j < 14; j++) {
      const r = w * (0.25 + 0.3 * hash(k * 31 + j, 15)), u = (j / 13 - 0.5);
      const s = new THREE.Mesh(puff, cloudM);
      s.position.set(u * w * 1.6, Math.max(0, (1 - Math.abs(u) * 2)) * w * 0.45 + hash(k, j) * w * 0.15, (hash(k * 7 + j, 16) - 0.5) * w * 0.6);
      s.scale.set(r, r * 0.8, r); c.add(s);
    }
    c.position.set(cx, cy, cz); clouds.add(c);
  }
  return { scene, sun, sunDir, look: L, clouds, terrain, heightAt,
    update(t, target) {
      // keep the shadow camera on the hero
      if (target) { sun.position.copy(target).addScaledVector(sunDir, 200); sun.target.position.copy(target); }
      clouds.children.forEach((c, i) => { c.position.x += 0; });
    } };
}
