/* CyberArena · cristais: geometria facetada (prisma hexagonal com ponta), material físico iridescente com brilho
   interno que pulsa, aglomerados instanciados e halos de luz aditivos. Usado na casona e no Mundo Cristal. */
import * as THREE from '../lib/three.module.min.js';

const PI = Math.PI, TAU = PI * 2;
let _geo = null;
/* prisma de 6 lados, levemente afunilado, com ponta piramidal; base em y=0, altura 1 */
export function crystalGeometry() {
  if (_geo) return _geo;
  const body = new THREE.CylinderGeometry(.16, .2, .72, 6, 3, false); body.translate(0, .36, 0);
  const tip = new THREE.ConeGeometry(.16, .28, 6, 1, false); tip.translate(0, .86, 0);
  const g = mergeSimple([body.toNonIndexed(), tip.toNonIndexed()]); g.computeVertexNormals();
  // facetas: normais por face (aparência lapidada)
  const n = g.attributes.normal, p = g.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); const nn = b.sub(a).cross(c.sub(a)).normalize(); for (let k = 0; k < 3; k++) n.setXYZ(i + k, nn.x, nn.y, nn.z); }
  return (_geo = g);
}
function mergeSimple(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); return g;
}

/* material com brilho interno (cor por instância), pulsação e brilho de borda */
export function crystalMaterial(uTime, opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .06, metalness: .05, clearcoat: 1, clearcoatRoughness: .04, iridescence: .9, iridescenceIOR: 1.6, specularIntensity: 1, envMapIntensity: 1, emissive: 0x000000, ior: 1.7 });
  const glow = opts.glow ?? 1.25;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime; sh.uniforms.uGlow = { value: glow }; m.userData.sh = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLY;varying float vPh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLY = position.y;\n#ifdef USE_INSTANCING\nvPh = instanceMatrix[3].x * .37 + instanceMatrix[3].z * .23;\n#else\nvPh = 0.;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;uniform float uGlow;varying float vLY;varying float vPh;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ vec3 cc = vec3(1.);
  #ifdef USE_COLOR
  cc = vColor.rgb;
  #endif
  float fr = pow(1. - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0., 1.), 2.);
  float pulse = .7 + .3 * sin(uTime * 1.7 + vPh * 6.2831) + .15 * sin(uTime * 4.3 + vLY * 9. + vPh * 3.);
  float core = smoothstep(.0, .9, vLY) * .55 + .45;
  totalEmissiveRadiance += cc * uGlow * (core * pulse * (.55 + (1. - fr) * .6) + fr * .5); }`);
  };
  m.customProgramCacheKey = () => 'crystal' + glow;
  return m;
}

/* halo aditivo (sprite com gradiente radial) */
let _haloTex = null;
export function haloTexture() {
  if (_haloTex) return _haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.18, 'rgba(255,255,255,.55)'); g.addColorStop(.5, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); _haloTex = new THREE.CanvasTexture(c); _haloTex.colorSpace = THREE.SRGBColorSpace; return _haloTex;
}
export function halo(color, size, opacity = .6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
  s.scale.setScalar(size); s.renderOrder = 5; return s;
}

/* lista de cristais de um aglomerado: [x, y, z, escala, altura, rotX, rotZ, rotY, cor] */
export function clusterSpec(rng, cx, cy, cz, n, size, palette) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const big = i === 0, a = rng() * TAU, d = big ? 0 : (.25 + rng() * .85) * size, s = size * (big ? 1 : .35 + rng() * .5), h = s * (big ? 3.2 : 1.8 + rng() * 1.6);
    const tilt = big ? (rng() - .5) * .2 : .25 + rng() * .55;
    out.push([cx + Math.cos(a) * d, cy - .05, cz + Math.sin(a) * d, s, h, Math.sin(a) * tilt, -Math.cos(a) * tilt, rng() * TAU, palette[(rng() * palette.length) | 0]]);
  }
  return out;
}
/* junta especificações em um InstancedMesh */
export function crystalMesh(specs, mat) {
  const im = new THREE.InstancedMesh(crystalGeometry(), mat, specs.length), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  specs.forEach((s, i) => { e.set(s[5], s[7], s[6], 'YXZ'); q.setFromEuler(e); m.compose(new THREE.Vector3(s[0], s[1], s[2]), q, new THREE.Vector3(s[3] * 5, s[4], s[3] * 5)); im.setMatrixAt(i, m); im.setColorAt(i, c.set(s[8])); });
  im.castShadow = true; im.receiveShadow = true; im.userData.dyn = true; im.computeBoundingSphere(); return im;
}
export const PALETTE = { amethyst: [0xb07bff, 0x9a5cff, 0xd6a8ff, 0x7c4dff], ice: [0x6fe8ff, 0x9ff4ff, 0x4ac0ff], mix: [0xb07bff, 0x6fe8ff, 0xff7ae0, 0x9a5cff, 0x7cffd8] };
