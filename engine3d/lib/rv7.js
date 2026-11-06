// rv7.js — load the show's RV-7 and restore its livery in three.js.
// Blender paints the swoosh and the tail slash with node shaders that glTF can't carry, so we repaint them here with
// the same formulas (assets/blender/build_rv7.py → livery_material / fin_material), in the model's own coordinates.
// glTF axes: Blender X → x, Blender Z → y, Blender Y → -z.
import * as THREE from 'three';

const BLUE = new THREE.Color('#1F4FC4'), WHITE = new THREE.Color('#F7F8FA'), BLACK = new THREE.Color('#15171C'), AMBER = new THREE.Color('#FFB23F');

function paint(material, glsl) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', roughness: 0.24, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uBlue: { value: BLUE }, uWhite: { value: WHITE }, uBlack: { value: BLACK }, uAmber: { value: AMBER } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;\nuniform vec3 uBlue, uWhite, uBlack, uAmber;\nfloat band(float v, float lo, float hi, float s){ return smoothstep(lo - s, lo + s, v) * (1.0 - smoothstep(hi - s, hi + s, v)); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + glsl);
  };
  m.name = material.name + '_restored';
  return m;
}

// fuselage: blue above a split line that sweeps up toward the tail; thin white, bold black, amber pinstripe below it
const LIVERY = `
  float x = vLocal.x, z = vLocal.y;
  float split = -0.15 + 0.09 * x - max(0.9 - x, 0.0) * 0.10;
  float dz = z - split;
  vec3 c = mix(uWhite, uBlue, smoothstep(-0.004, 0.004, dz));
  c = mix(c, uBlack, band(dz, -0.095, -0.020, 0.003));
  c = mix(c, uAmber, band(dz, -0.142, -0.108, 0.002));
  diffuseColor.rgb = c;
  metalnessFactor = 0.45 * smoothstep(-0.004, 0.004, dz);`;
// fin + rudder: blue with the black + amber slash rising toward the back (offset for the hinged rudder)
const fin = (ox, oz) => `
  float d = (vLocal.y + ${oz.toFixed(3)}) - 1.15 * ((vLocal.x + ${ox.toFixed(3)}) - 5.0) - 0.42;
  vec3 c = mix(uBlue, uBlack, band(d, 0.0, 0.11, 0.004));
  c = mix(c, uAmber, band(d, 0.135, 0.175, 0.004));
  diffuseColor.rgb = c;`;

export async function loadRV7(load, url = '/assets/models/rv7.glb') {
  const rv = await load(url);
  rv.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    const n = o.material && o.material.name;
    if (n === 'Livery') o.material = paint(o.material, LIVERY);
    else if (n === 'FinLivery') {
      const inRudder = (() => { let p = o.parent; while (p) { if (p.name === 'Rudder') return true; p = p.parent; } return false; })();
      o.material = paint(o.material, inRudder ? fin(5.86, 0.12) : fin(0, 0));
    } else if (n === 'CanopyTint') {
      o.material = new THREE.MeshPhysicalMaterial({ color: '#2B3340', roughness: 0.02, metalness: 0.2, transparent: true, opacity: 0.55, clearcoat: 1 });
    }
  });
  return { group: rv, prop: rv.getObjectByName('Prop') };
}
