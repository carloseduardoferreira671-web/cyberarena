/* CyberArena · Vale da Casona — mundo 3D em three.js.
   Terreno suave com sombreamento procedural, água animada com reflexo/espuma/ondulações, céu com nuvens em movimento,
   vegetação instanciada com vento e que se afasta dos personagens, folhas caindo, casona com escadas e interior,
   acampamentos, ruínas com janelas para pular, pontes, colisão e superfícies caminháveis. */
import * as THREE from '../lib/three.module.min.js';
import { crystalMaterial, crystalMesh, clusterSpec, halo, PALETTE, crystalGeometry } from './crystals.js';
import { applyPBR } from './pbr.js';

const CW = window.CW, L = CW.LAYOUT, W = CW.W, T = L.temple, PI = Math.PI, TAU = PI * 2;
const { mulberry32, fbm, vnoise, smooth, clamp, lerp } = CW;
export const WATER_Y = W.WATER_Y;
const lin = c => [(c[0] / 255) ** 2.2, (c[1] / 255) ** 2.2, (c[2] / 255) ** 2.2];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ---------- uniforms globais (vento, empurrões, tempo) ---------- */
export const U = {
  uTime: { value: 0 }, uWind: { value: new THREE.Vector3(.8, .45, .55) },
  uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) },
  uSun: { value: new THREE.Vector3(-.5, .72, .42).normalize() },
};
const NOISE_GLSL = `
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 h22(vec2 p){float n=h21(p);return vec2(n,h21(p+n+17.));}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm3(vec2 p){return vn(p)*.5+vn(p*2.03+7.)*.3+vn(p*4.1+3.)*.2;}
`;

/* vento + empurrão aplicado depois da matriz de instância (espaço do mundo) */
function windify(mat, o) {
  const H = o.height || 3, amp = o.amp ?? .35, push = o.push ?? 0, flutter = o.flutter ?? 0, freq = o.freq || 1.6;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    Object.assign(sh.uniforms, { uTime: U.uTime, uWind: U.uWind, uPush: U.uPush });
    const vs = sh.vertexShader, dV = (vs.includes('uniform float uTime') ? '' : 'uniform float uTime;') + 'uniform vec3 uWind;uniform vec4 uPush[8];' + (vs.includes('varying vec3 vWP') ? '' : 'varying vec3 vWP;') + (vs.includes('float h21') ? '' : NOISE_GLSL);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + dV).replace('#include <project_vertex>', `
vec4 wp = vec4(transformed,1.0);
#ifdef USE_INSTANCING
wp = instanceMatrix * wp;
vec3 ib = (instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
#else
vec3 ib = vec3(0.);
#endif
wp = modelMatrix * wp;
#ifndef USE_INSTANCING
ib = (modelMatrix * vec4(0.,0.,0.,1.)).xyz;
#endif
float hk = clamp(transformed.y / ${H.toFixed(2)}, 0., 1.); hk *= hk;
float gust = .55 + .45 * sin(uTime * .63 + ib.x * .045 + ib.z * .03) * sin(uTime * 1.13 + ib.z * .05);
float sw = sin(uTime * ${freq.toFixed(2)} + ib.x * .37 + ib.z * .29) * .6 + .55;
vec2 disp = uWind.xy * uWind.z * gust * sw * ${amp.toFixed(3)} * hk;
${flutter ? `disp += vec2(sin(uTime*7.3+wp.x*2.1+wp.y*1.7), cos(uTime*6.1+wp.z*2.3+wp.y*1.3)) * ${flutter.toFixed(3)} * hk * (.4 + uWind.z);` : ''}
${push ? `for (int i = 0; i < 8; i++) { vec4 P = uPush[i]; vec2 d = ib.xz - P.xz; float dl = length(wp.xz - P.xz); float r = P.w + ${o.radius ? o.radius.toFixed(2) : '1.0'};
  if (dl < r && abs(wp.y - P.y) < 4.) { vec2 dir = normalize((wp.xz - P.xz) + vec2(1e-4)); float k = (1. - dl / r); k = k * k * (3. - 2. * k); disp += dir * k * ${push.toFixed(3)} * hk; wp.y -= k * ${(push * .35).toFixed(3)} * hk; } }` : ''}
wp.xz += disp; wp.y -= dot(disp, disp) * .15;
vWP = wp.xyz;
vec4 mvPosition = viewMatrix * wp;
gl_Position = projectionMatrix * mvPosition;`);
    { const fs = sh.fragmentShader, dF = (fs.includes('varying vec3 vWP') ? '' : 'varying vec3 vWP;') + (fs.includes('uniform float uTime') ? '' : 'uniform float uTime;') + (fs.includes('float h21') ? '' : NOISE_GLSL); sh.fragmentShader = fs.replace('#include <common>', '#include <common>\n' + dF); }
    if (o.frag) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + o.frag);
    if (o.nrm) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 q = vWP * ${(o.nrm).toFixed(2)}; vec3 pn = vec3(vn(q.xy + q.z * .7), vn(q.yz + 3.1), vn(q.zx + 7.7)) - .5; normal = normalize(normal + pn * 1.3); }`);
    if (o.emis) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + o.emis);
  };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey() : ''; mat.customProgramCacheKey = () => pk + 'wind' + H + amp + push + flutter + freq + (o.frag || '') + (o.emis || '') + (o.radius || 0) + (o.nrm || 0) + mat.type;
  return mat;
}
function depthFor(o) { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); return windify(m, Object.assign({}, o, { frag: null, emis: null })); }

/* ---------- utilitários de geometria ---------- */
function colorize(g, c, jitter = 0, rnd = Math.random, grad) {
  g = g.index ? g : g; const n = g.attributes.position.count, col = new Float32Array(n * 3), P = g.attributes.position.array;
  for (let i = 0; i < n; i++) { const k = 1 + (rnd() - .5) * jitter; let cc = c; if (grad) cc = grad(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); col[i * 3] = cc[0] * k; col[i * 3 + 1] = cc[1] * k; col[i * 3 + 2] = cc[2] * k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function merge(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const hasUv = list.every(g => g.attributes.uv), uvs = hasUv ? new Float32Array(nv * 2) : null;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count; pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); if (hasUv) uvs.set(g.attributes.uv.array, vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, vo * 3); else col.fill(1, vo * 3, (vo + n) * 3);
    if (g.index) { const I = g.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo; io += I.length; } else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (hasUv) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); return out;
}
const xf = (g, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)); g.applyMatrix4(m); return g; };
function displace(g, amp, freq, seed, keepBottom) {
  // desloca ao longo da normal suave (vértices soldados) — sem facetas
  const P = g.attributes.position, tmp = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    tmp.fromBufferAttribute(P, i); const l = tmp.length() || 1, n = tmp.clone().divideScalar(l);
    let d = (fbm(n.x * freq + seed, n.z * freq + n.y * freq * .7 + seed * .3, 3, seed | 0) - .5) * 2 * amp;
    if (keepBottom && n.y < -.2) d *= .3;
    tmp.addScaledVector(n, d); P.setXYZ(i, tmp.x, tmp.y, tmp.z);
  }
  g.computeVertexNormals(); return g;
}
/* LOD estático: agrupa vértices próximos (média de posição/normal/cor) e descarta triângulos degenerados.
   Árvores/pedras/arbustos distantes usam essa malha leve (≈10–25% dos triângulos). */
function lodGeo(geo, div) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.computeBoundingBox(); const bb = g.boundingBox, cs = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) / div;
  const names = Object.keys(g.attributes).filter(n => g.attributes[n].itemSize <= 4 && !g.attributes[n].normalized && g.attributes[n].array instanceof Float32Array), n = g.attributes.position.count, map = new Map(), remap = new Int32Array(n), cl = [];
  const P = g.attributes.position;
  for (let i = 0; i < n; i++) { const key = Math.floor((P.getX(i) - bb.min.x) / cs) + ',' + Math.floor((P.getY(i) - bb.min.y) / cs) + ',' + Math.floor((P.getZ(i) - bb.min.z) / cs); let id = map.get(key); if (id === undefined) { id = cl.length; map.set(key, id); cl.push({ n: 0, v: names.map(nm => new Float64Array(g.attributes[nm].itemSize)) }); } const c = cl[id]; c.n++; names.forEach((nm, k) => { const at = g.attributes[nm]; for (let j = 0; j < at.itemSize; j++) c.v[k][j] += at.array[i * at.itemSize + j]; }); remap[i] = id; }
  const out = new THREE.BufferGeometry();
  names.forEach((nm, k) => { const sz = g.attributes[nm].itemSize, arr = new Float32Array(cl.length * sz); cl.forEach((c, i) => { for (let j = 0; j < sz; j++) arr[i * sz + j] = c.v[k][j] / c.n; if (nm === 'normal') { const l = Math.hypot(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]) || 1; arr[i * 3] /= l; arr[i * 3 + 1] /= l; arr[i * 3 + 2] /= l; } }); out.setAttribute(nm, new THREE.BufferAttribute(arr, sz)); });
  const idx = []; for (let t = 0; t < n; t += 3) { const a = remap[t], b = remap[t + 1], c = remap[t + 2]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  if (idx.length < 12) return null;
  out.setIndex(idx); out.computeBoundingSphere(); out.userData = Object.assign({}, geo.userData); return out;
}
function welded(geo) { // remove a costura do UV para normais suaves
  const g = geo.clone(); g.deleteAttribute('uv'); const P = g.attributes.position, map = new Map(), rem = new Int32Array(P.count), keep = [];
  for (let i = 0; i < P.count; i++) { const k = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4); let j = map.get(k); if (j === undefined) { j = keep.length; map.set(k, j); keep.push(i); } rem[i] = j; }
  const pos = new Float32Array(keep.length * 3); keep.forEach((i, j) => { pos[j * 3] = P.getX(i); pos[j * 3 + 1] = P.getY(i); pos[j * 3 + 2] = P.getZ(i); });
  const I = g.index ? g.index.array : [...Array(P.count).keys()], idx = []; for (let i = 0; i < I.length; i += 3) { const a = rem[I[i]], b = rem[I[i + 1]], c = rem[I[i + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.BufferAttribute(pos, 3)); o.setIndex(idx); o.computeVertexNormals(); return o;
}
const blob = (r, detail, amp, freq, seed) => displace(welded(new THREE.IcosahedronGeometry(r, detail)), amp, freq, seed);

/* ---------- texturas procedurais (canvas) ---------- */
function canvasTex(w, h, draw, repeat) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (repeat) t.repeat.set(repeat[0], repeat[1]); return t; }

let FOLIAGE_SURFACE_MAPS = null;
function foliageSurfaceMaps() {
  if (FOLIAGE_SURFACE_MAPS) return FOLIAGE_SURFACE_MAPS;
  const make = (draw) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    draw(c.getContext('2d'), 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 2); t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  const normal = make((g, w, h) => {
    g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, w, h);
    for (let y = 12; y < h; y += 32) for (let x = 8; x < w; x += 32) {
      g.save(); g.translate(x, y); g.rotate(((x * 13 + y * 7) % 19) / 19 - .5);
      g.strokeStyle = 'rgba(142,126,248,.72)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 12); g.quadraticCurveTo(5, 1, 1, -12); g.stroke();
      g.strokeStyle = 'rgba(116,132,245,.52)'; g.lineWidth = 1;
      for (let k = -1; k <= 1; k++) {
        g.beginPath(); g.moveTo(1, k * 4); g.lineTo(8, k * 5 - 2); g.stroke();
        g.beginPath(); g.moveTo(1, k * 4); g.lineTo(-6, k * 5 - 2); g.stroke();
      }
      g.restore();
    }
  });
  const roughness = make((g, w, h) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    let seed = 9137;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 1800; i++) {
      const v = 178 + Math.floor(rnd() * 68);
      g.fillStyle = `rgba(${v},${v},${v},${.12 + rnd() * .25})`;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 5, 1 + rnd() * 2, rnd() * 3.14, 0, Math.PI * 2); g.fill();
    }
  });
  FOLIAGE_SURFACE_MAPS = { normal, roughness };
  return FOLIAGE_SURFACE_MAPS;
}

const woodTex = () => canvasTex(256, 256, (g, w, h) => { const r = mulberry32(7); g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { const y = i * 64; g.fillStyle = `hsl(28,${38 + r() * 10}%,${26 + r() * 8}%)`; g.fillRect(0, y + 2, w, 60); for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(40,22,10,${.12 + r() * .2})`; g.lineWidth = 1 + r() * 1.5; g.beginPath(); const yy = y + 4 + r() * 56; g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + (r() - .5) * 6, w * .6, yy + (r() - .5) * 6, w, yy + (r() - .5) * 4); g.stroke(); } g.fillStyle = 'rgba(20,10,4,.75)'; g.fillRect(0, y, w, 3); } g.strokeStyle = 'rgba(30,16,6,.8)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8); });
const clothTex = (base, stripe) => canvasTex(128, 128, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); g.fillStyle = stripe; for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 12, 0, 8, h); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); } });

/* ---------- materiais ---------- */
const STONE_FRAG = `
{ vec3 p = vWP; vec3 an = abs(normalize(vNormalW));
  vec2 uv = an.y > .7 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  float row = floor(uv.y / .55); float u = (uv.x + mod(row, 2.) * .55) / 1.1; vec2 f = vec2(fract(u), fract(uv.y / .55));
  float mort = 1. - smoothstep(0., .06, min(min(f.x, 1. - f.x) * 1.1, min(f.y, 1. - f.y) * .55));
  float tone = .82 + .3 * h21(vec2(floor(u), row)); float grit = .9 + .2 * vn(p.xz * 3. + p.y * 2.);
  float moss = smoothstep(.55, .9, vn(p.xz * .35 + p.y * .2)) * smoothstep(.2, .9, normalize(vNormalW).y + .3) * .7;
  diffuseColor.rgb *= tone * grit * (1. - .38 * mort);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.13, .2, .06), moss * .5); }`;
function stdMat(o, frag, extra) {
  const physical = !!o.physical, opts = Object.assign({}, o); delete opts.physical;
  const m = physical ? new THREE.MeshPhysicalMaterial(opts) : new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTime: U.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;varying vec3 vNormalW;').replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{ vec4 wpp = vec4(transformed,1.);
#ifdef USE_INSTANCING
wpp = instanceMatrix * wpp;
#endif
vWP = (modelMatrix * wpp).xyz; vNormalW = normalize(mat3(modelMatrix) * objectNormal); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;varying vec3 vNormalW;uniform float uTime;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (frag || ''));
    if (extra) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + extra);
  };
  m.customProgramCacheKey = () => 'std' + (frag || '') + (extra || '') + (o.vertexColors ? 1 : 0);
  return m;
}

/* ===================================================================================== */
export class World {
  constructor(renderer, scene, quality) {
    this.r = renderer; this.scene = scene; this.q = quality; this.obs = []; this.surf = []; this.grid = new Map(); this.GC = 8;
    this.trees = []; this.spots = []; this.time = 0; this.leaves = null; this.anim = [];
  }
  /* ---------- colisão: grade espacial ---------- */
  addObs(o) { // o: {type:'c', x,z,r} ou {type:'b', x,z,hx,hz,c,s}; y0,y1; vault: bool
    if (this._xf) { const X = this._xf, k = X.s; o.x = X.cx + (o.x - X.cx) * k; o.z = X.cz + (o.z - X.cz) * k; if (o.r != null) o.r *= k; if (o.hx != null) { o.hx *= k; o.hz *= k; } if (o.octR) o.octR *= k;
      o.y0 = X.y + (o.y0 - X.y) * k; o.y1 = X.y + (o.y1 - X.y) * k;
      if (o.topAt) { const f = o.topAt; o.topAt = (x, z) => X.y + (f(X.cx + (x - X.cx) / k, X.cz + (z - X.cz) / k) - X.y) * k; } }
    o.id = this.obs.length; this.obs.push(o); const R = o.type === 'c' ? o.r : Math.hypot(o.hx, o.hz);
    for (let gx = Math.floor((o.x - R) / this.GC); gx <= Math.floor((o.x + R) / this.GC); gx++) for (let gz = Math.floor((o.z - R) / this.GC); gz <= Math.floor((o.z + R) / this.GC); gz++) { const k = gx * 4096 + gz; let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(o); }
    return o;
  }
  addBox(x, z, hx, hz, ang, y0, y1, extra) { return this.addObs(Object.assign({ type: 'b', x, z, hx, hz, c: Math.cos(ang), s: Math.sin(ang), y0, y1 }, extra)); }
  near(x, z, r = 2) { const out = new Set(); for (let gx = Math.floor((x - r) / this.GC); gx <= Math.floor((x + r) / this.GC); gx++) for (let gz = Math.floor((z - r) / this.GC); gz <= Math.floor((z + r) / this.GC); gz++) { const l = this.grid.get(gx * 4096 + gz); if (l) for (const o of l) if (!o.gone) out.add(o); } return out; }
  /* destruição do cenário (poderes do CYBER): árvores, arbustos e pedras dentro do raio somem; devolve os pontos destruídos */
  destroyAlong(ax, az, bx, bz, R) {
    const out = [], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6, m0 = new THREE.Matrix4().makeScale(0, 0, 0), dirty = new Set();
    for (const v of this.veg || []) { if (v.gone) continue; const t = clamp(((v.x - ax) * dx + (v.z - az) * dz) / L2, 0, 1), d = Math.hypot(ax + dx * t - v.x, az + dz * t - v.z); if (d > R + v.r) continue;
      v.gone = true; if (v.ob) v.ob.gone = true; if (v.tr) v.tr.gone = true; if (v.h.b.im) { v.h.b.im.setMatrixAt(v.h.i, m0); dirty.add(v.h.b.im); } out.push(v); }
    for (const im of dirty) im.instanceMatrix.needsUpdate = true; return out;
  }
  /* distância com sinal ao obstáculo no plano XZ + vetor de saída */
  sd(o, x, z, out) {
    if (o.type === 'c') { const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz) || 1e-6; if (out) { out[0] = dx / d; out[1] = dz / d; } return d - o.r; }
    const px = x - o.x, pz = z - o.z, lx = px * o.c - pz * o.s, lz = px * o.s + pz * o.c, qx = Math.abs(lx) - o.hx, qz = Math.abs(lz) - o.hz;
    let d, nx = 0, nz = 0;
    if (qx > 0 || qz > 0) { const ox = Math.max(qx, 0), oz = Math.max(qz, 0), l = Math.hypot(ox, oz) || 1e-6; d = l; nx = Math.sign(lx) * ox / l; nz = Math.sign(lz) * oz / l; }
    else if (qx > qz) { d = qx; nx = Math.sign(lx); } else { d = qz; nz = Math.sign(lz); }
    if (out) { out[0] = nx * o.c + nz * o.s; out[1] = -nx * o.s + nz * o.c; } return d;
  }
  /* altura do terreno (grade pré-calculada, bilinear) */
  terrainAt(x, z) {
    const g = this.hg; if (!g) return CW.heightAt(x, z);
    const fx = clamp((x - g.x0) / g.cell, 0, g.nx - 1.001), fz = clamp((z - g.z0) / g.cell, 0, g.nz - 1.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, N = g.nx, H = g.h;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  /* superfície caminhável mais alta abaixo de (y + passo) */
  groundAt(x, z, y = 1e9, step = .75) {
    let h = this.terrainAt(x, z);
    for (const s of this.near(x, z, 1)) { if (!s.walk) continue; if (this.sd(s, x, z) > (s.type === 'c' ? 0 : 0)) continue; const top = s.topAt ? s.topAt(x, z) : s.y1; if (top > h && top <= y + step) h = top; }
    return h;
  }
  /* obstáculos que bloqueiam um corpo com os pés em y (altura do corpo 2.9) */
  blockers(x, z, y, rad, step = .75) {
    const out = []; for (const o of this.near(x, z, rad + 1)) { if (o.camOnly) continue; const top = o.topAt ? o.topAt(x, z) : o.y1; if (top <= y + step || o.y0 >= y + 2.9) continue; const d = this.sd(o, x, z); if (d < rad) out.push([o, d]); } return out;
  }
  /* empurra um círculo para fora dos obstáculos; devolve o obstáculo atingido mais baixo (para pular/escalar) */
  collide(p, rad, step) {
    let hit = null; const n = [0, 0];
    for (let it = 0; it < 3; it++) {
      let any = false;
      for (const o of this.near(p.x, p.z, rad + 1)) {
        if (o.camOnly) continue; const top = o.topAt ? o.topAt(p.x, p.z) : o.y1; if (top <= p.y + (step ?? .75) || o.y0 >= p.y + 2.9) continue;
        const d = this.sd(o, p.x, p.z, n); if (d < rad) { p.x += n[0] * (rad - d); p.z += n[1] * (rad - d); any = true; if (!hit || top < hit.top) hit = { o, top, nx: n[0], nz: n[1] }; }
      }
      if (!any) break;
    }
    const HX = W.HX - 1.5, HZ = W.HZ - 1.5; p.x = clamp(p.x, -HX, HX); p.z = clamp(p.z, -HZ, HZ);
    return hit;
  }
  /* linha de visão / tiro: true se algo bloqueia o segmento a 1.6 m de altura */
  rayBlocked(ax, ay, az, bx, by, bz, ignore) {
    const L2 = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L2 / .6));
    for (let i = 1; i < n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      if (this.terrainAt(x, z) > y + .1) return { t, x, y, z };
      for (const o of this.near(x, z, .5)) { if (o === ignore || o.noRay) continue; const top = o.topAt ? o.topAt(x, z) : o.y1; if (y > top || y < o.y0) continue; if (this.sd(o, x, z) < 0) return { t, x, y, z, o }; } }
    return null;
  }
  waterDepth(x, z) { return WATER_Y - this.terrainAt(x, z); }
  isFree(x, z, r = 1.2) { if (Math.abs(x) > W.HX - 4 || Math.abs(z) > W.HZ - 4) return false; if (this.waterDepth(x, z) > -.2) return false; for (const o of this.near(x, z, r + 1)) if (this.sd(o, x, z) < r) return false; return true; }

  /* =============================== construção =============================== */
  async build(onProgress) {
    const prog = (p, t) => onProgress && onProgress(p, t);
    prog(.02, 'Esculpindo o terreno...'); await frame();
    await this.buildTerrain(p => prog(.02 + p * .3, 'Esculpindo o terreno...'));
    prog(.34, 'Enchendo os rios...'); await frame(); this.buildWater();
    prog(.4, 'Pintando o céu...'); await frame(); this.buildSky();
    prog(.45, 'Erguendo a casona...'); await frame(); this.buildTemple();
    prog(.55, 'Montando acampamentos...'); await frame(); this.buildCamps(); this.buildBridges(); this.buildRuins(); this.buildTerraceStairs();
    prog(.65, 'Plantando a floresta...'); await frame(); this.buildVegetation();
    prog(.82, 'Semeando a grama...'); await frame(); this.buildGrass(); this.buildFields();
    prog(.9, 'Soltando as folhas...'); await frame(); this.buildLeaves(); this.buildBirds(); this.buildMinimap();
    prog(.96, 'Ajustando a iluminação...'); await frame();
    this.buildSpots(); this.mergeStatic(); this.buildCulling();
  }

  /* ---------- terreno ---------- */
  async buildTerrain(onP) {
    const cell = (this.q.terrainCell || .6) * 1.35, x0 = W.X0, z0 = W.Z0, x1 = W.X0 + W.NCX * W.CWID, z1 = W.Z0 + W.NCZ * W.CHGT;
    const nx = Math.round((x1 - x0) / cell) + 1, nz = Math.round((z1 - z0) / cell) + 1, H = new Float32Array(nx * nz), COL = new Float32Array(nx * nz * 3), MSK = new Float32Array(nx * nz * 4), GD = new Uint8Array(nx * nz);
    this.hg = null;
    for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) H[j * nx + i] = CW.heightAt(x0 + i * cell, z0 + j * cell); if (j % 40 === 0) { onP(j / nz * .45); await frame(); } }
    const GR1 = [58, 130, 46], GR2 = [108, 168, 52], GR3 = [160, 186, 64], FOREST = [40, 92, 38], ROCK1 = [128, 110, 92], ROCK2 = [170, 150, 120], SAND = [196, 176, 124], BED = [80, 104, 92], DIRT = [168, 128, 84], COBBLE = [160, 152, 140], SOIL = [116, 84, 50];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, x = x0 + i * cell, z = z0 + j * cell, h = H[k];
        const dx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) / (2 * cell), dz = (H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) / (2 * cell), ny = 1 / Math.hypot(dx, 1, dz);
        const ri = CW.riverInfo(x, z), ro = CW.roadInfo(x, z), n1 = fbm(x * .05 + 3, z * .05 + 8, 3, 21), n2 = fbm(x * .17, z * .17, 2, 22), fd = CW.forestDensity(x, z);
        let c = mix(GR1, GR2, smooth(.28, .62, n1)); c = mix(c, GR3, smooth(.52, .8, n2) * .5); c = mix(c, FOREST, fd * .6);
        const rk = Math.max(smooth(.25, .45, 1 - ny), smooth(8, 14, h + (n2 - .5) * 5)); c = mix(c, mix(ROCK1, ROCK2, n2), rk);
        let sand = ri && ri.t < 2.2 ? (1 - smooth(1, 2.2, ri.t)) * .85 : 0; sand = Math.max(sand, 1 - smooth(WATER_Y, WATER_Y + .7, h)) * (1 - rk * .6); c = mix(c, h < WATER_Y ? BED : SAND, sand);
        let mD = 0, mC = 0; if (ro && ro.d < .9) { const e = 1 - smooth(-.5, .9, ro.d + (vnoise(x * 1.3, z * 1.3, 24) - .5) * .6); if (ro.kind === 'cobble') mC = e; else mD = e; }
        mC = Math.max(mC, 1 - smooth(CW.PLAZA.r - 1.4, CW.PLAZA.r, Math.hypot(x - CW.PLAZA.x, z - CW.PLAZA.z)));
        const fm = 1 - smooth(0, .6, CW.fieldDist(x, z)); let camp = 0; for (const cp of L.camps) camp = Math.max(camp, 1 - smooth(CW.CAMP_R - 1, CW.CAMP_R + 6, Math.hypot(x - cp.x, z - cp.z) + (vnoise(x * .5, z * .5, 5) - .5) * 4));
        c = mix(c, DIRT, Math.max(mD * .95, camp * .7)); c = mix(c, COBBLE, mC); c = mix(c, SOIL, fm);
        const L3 = lin(c); COL[k * 3] = L3[0]; COL[k * 3 + 1] = L3[1]; COL[k * 3 + 2] = L3[2];
        MSK[k * 4] = mC; MSK[k * 4 + 1] = fm; MSK[k * 4 + 2] = rk; MSK[k * 4 + 3] = Math.max(mD, camp);
        const grassy = (1 - rk) * (1 - sand) * (1 - Math.max(mD, mC, fm, camp)) * smooth(.15, .45, ny > .85 ? 1 : 0) * (h > WATER_Y + .25 ? 1 : 0);
        GD[k] = clamp(grassy * (1 - fd * .35) * 255, 0, 255);
      }
      if (j % 30 === 0) { onP(.45 + j / nz * .4); await frame(); }
    }
    this.hg = { x0, z0, cell, nx, nz, h: H, gd: GD, col: COL };
    // malha em blocos para descarte por frustum
    const mat = stdMat({ vertexColors: true, roughness: .93, metalness: 0 }, `
{ vec3 p = vWP; vec4 m = vMsk;
  float g1 = vn(p.xz * 1.3), g2 = vn(p.xz * 5.2), g3 = h21(floor(p.xz * 9.));
  diffuseColor.rgb *= .86 + .26 * g1 + .12 * (g2 - .5) + .05 * (g3 - .5);
  float blade = vn(p.xz * vec2(18., 3.)) * vn(p.xz * vec2(3., 18.)); diffuseColor.rgb *= 1. - (1. - m.x) * (1. - m.z) * (1. - m.w) * (1. - m.y) * .18 * blade;
  if (m.x > .02) { vec2 q = p.xz * 1.1, fi = floor(q), ff = fract(q); float d1 = 8., d2 = 8.; vec2 cid = vec2(0.);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = h22(fi + g); vec2 r = g + o * .8 + .1 - ff; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; cid = fi + g; } else if (d < d2) d2 = d; }
    float edge = smoothstep(0., .1, sqrt(d2) - sqrt(d1)); vec3 sc = vec3(.36, .33, .29) * (.72 + .4 * h21(cid)) * (.88 + .24 * vn(p.xz * 2.6)); sc *= mix(.34, 1., edge);
    diffuseColor.rgb = mix(diffuseColor.rgb, sc, smoothstep(.1, .6, m.x)); }
  if (m.y > .02) { float row = .5 + .5 * sin(p.z * 5.2); diffuseColor.rgb *= mix(1., .62 + .38 * row, m.y); }
  if (m.w > .05) { diffuseColor.rgb *= mix(1., .8 + .35 * vn(p.xz * 3.1) + .1 * h21(floor(p.xz * 14.)), m.w); }
  if (m.z > .1) { float s = vn(vec2(p.x * .5 + p.z * .45, p.y * 2.4)); diffuseColor.rgb *= mix(1., .7 + .5 * s, m.z); }
  if (p.y < ${WATER_Y.toFixed(2)}) { float dep = ${WATER_Y.toFixed(2)} - p.y; vec2 cq = p.xz * .9 + vec2(uTime * .25, uTime * .18);
    float ca = pow(abs(sin(vn(cq) * 6.28 + uTime) * sin(vn(cq * 1.7 + 4.) * 6.28 - uTime * .8)), 6.); diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.55, .8, .85), clamp(dep * 1.4, 0., .8)); diffuseColor.rgb += ca * .35 * clamp(1. - dep * .6, 0., 1.); }
}`);
    const prevOBC = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => { prevOBC(sh, r); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aMsk;varying vec4 vMsk;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvMsk = aMsk;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vMsk;'); };
    mat.customProgramCacheKey = () => 'terrain';
    this.terrainMat = mat;
    const CX = 8, CZ = 5, sx = Math.ceil((nx - 1) / CX), sz = Math.ceil((nz - 1) / CZ);
    for (let bz = 0; bz < CZ; bz++) for (let bx = 0; bx < CX; bx++) {
      const i0 = bx * sx, i1 = Math.min(nx - 1, i0 + sx), j0 = bz * sz, j1 = Math.min(nz - 1, j0 + sz), w = i1 - i0 + 1, hgt = j1 - j0 + 1; if (w < 2 || hgt < 2) continue;
      const pos = new Float32Array(w * hgt * 3), nor = new Float32Array(w * hgt * 3), col = new Float32Array(w * hgt * 3), msk = new Float32Array(w * hgt * 4);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i, o = (j - j0) * w + (i - i0);
        pos[o * 3] = x0 + i * cell; pos[o * 3 + 1] = H[k]; pos[o * 3 + 2] = z0 + j * cell;
        const dx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) / (2 * cell), dz = (H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) / (2 * cell), l = Math.hypot(dx, 1, dz);
        nor[o * 3] = -dx / l; nor[o * 3 + 1] = 1 / l; nor[o * 3 + 2] = -dz / l;
        col[o * 3] = COL[k * 3]; col[o * 3 + 1] = COL[k * 3 + 1]; col[o * 3 + 2] = COL[k * 3 + 2]; msk.set(MSK.subarray(k * 4, k * 4 + 4), o * 4);
      }
      const idx = []; for (let j = 0; j < hgt - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, c = a + w, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMsk', new THREE.BufferAttribute(msk, 4)); g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.name = 'terrain'; this.scene.add(m);
    }
    // planície distante (além das montanhas)
    const far = new THREE.Mesh(new THREE.RingGeometry(150 * CW.SCALE, 1800 * CW.SCALE, 64, 1), new THREE.MeshStandardMaterial({ color: 0x3f6a3a, roughness: 1 })); far.rotation.x = -PI / 2; far.position.y = 12; this.scene.add(far);
    const ridge = []; const rr = mulberry32(55); for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, d = (175 + rr() * 60) * CW.SCALE, g = blob(1, 2, .25, 1.6, i); colorize(g, lin([96, 110, 96]), .1, rr, (x, y) => y > .5 ? lin([210, 214, 222]) : lin([92, 104, 90])); xf(g, Math.cos(a) * d, 4, Math.sin(a) * d * .85, (30 + rr() * 30) * CW.SCALE, (26 + rr() * 34) * CW.SCALE, (30 + rr() * 30) * CW.SCALE, rr() * 6); ridge.push(g); }
    const rm = new THREE.Mesh(merge(ridge), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: true })); this.scene.add(rm);
  }

  /* ---------- água ---------- */
  buildWater() {
    const cell = 1.0, x0 = W.X0, z0 = W.Z0, nx = Math.round(W.NCX * W.CWID / cell) + 1, nz = Math.round(W.NCZ * W.CHGT / cell) + 1;
    const D = new Float32Array(nx * nz); for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) D[j * nx + i] = WATER_Y - this.terrainAt(x0 + i * cell, z0 + j * cell);
    const pos = [], dep = [], flow = [], map = new Int32Array(nx * nz).fill(-1), idx = [];
    const vid = (i, j) => { const k = j * nx + i; if (map[k] < 0) { map[k] = pos.length / 3; const x = x0 + i * cell, z = z0 + j * cell; pos.push(x, WATER_Y, z); dep.push(D[k]); const ri = CW.riverInfo(x, z); let fx = 0, fz = 0; if (ri) { const rv = CW.rivers.find(r => r.id === ri.id); const a = rv.d[ri.i], b = rv.d[Math.min(rv.d.length - 1, ri.i + 1)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; fx = (b[0] - a[0]) / l; fz = (b[1] - a[1]) / l; } flow.push(fx, fz); } return map[k]; };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const k = j * nx + i; if (Math.max(D[k], D[k + 1], D[k + nx], D[k + nx + 1]) > -.35) { const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1); idx.push(a, c, b, b, c, d); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1)); g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2)); g.setIndex(idx); g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSun: { value: U.uSun.value }, uRip: { value: [] } }]),
      vertexShader: `attribute float aDepth;attribute vec2 aFlow;varying float vD;varying vec2 vF;varying vec3 vWP;
#include <fog_pars_vertex>
void main(){vD=aDepth;vF=aFlow;vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `uniform float uTime;uniform vec3 uSun;uniform vec4 uRip[8];varying float vD;varying vec2 vF;varying vec3 vWP;
#include <fog_pars_fragment>
${NOISE_GLSL}
void main(){
 vec2 p=vWP.xz;float t=uTime;vec2 fl=vF*t*.9;
 float e=.15;
 float h0=fbm3(p*.55-fl)+fbm3(p*1.3+vec2(t*.21,-t*.17)-fl*1.4)*.5;
 float hx=fbm3((p+vec2(e,0.))*.55-fl)+fbm3((p+vec2(e,0.))*1.3+vec2(t*.21,-t*.17)-fl*1.4)*.5;
 float hz=fbm3((p+vec2(0.,e))*.55-fl)+fbm3((p+vec2(0.,e))*1.3+vec2(t*.21,-t*.17)-fl*1.4)*.5;
 vec3 N=normalize(vec3((h0-hx)*1.4,1.,(h0-hz)*1.4));
 float ring=0.;
 for(int i=0;i<8;i++){vec4 R=uRip[i];float age=t-R.z;if(age<0.||age>2.2)continue;float d=length(p-R.xy);float rr=age*2.4*R.w+.2;float w=exp(-pow((d-rr)*5.,2.))*(1.-age/2.2);ring+=w;vec2 dir=(p-R.xy)/(d+1e-3);N.xz+=dir*w*.6*sin((d-rr)*18.);}
 N=normalize(N);
 vec3 V=normalize(cameraPosition-vWP);
 float fr=.04+.96*pow(1.-max(dot(N,V),0.),5.);
 vec3 R=reflect(-V,N);float sk=clamp(R.y,0.,1.);
 vec3 sky=mix(vec3(.62,.78,.92),vec3(.2,.44,.82),pow(sk,.6));
 vec3 shallow=vec3(.16,.52,.5),deep=vec3(.03,.2,.33);
 float dd=smoothstep(0.,1.1,vD);vec3 body=mix(shallow,deep,dd);
 float caust=pow(abs(sin(vn(p*1.1+t*.3)*6.28+t)),8.)*(1.-dd)*.25;body+=caust;
 vec3 c=mix(body,sky,fr*.75);
 vec3 H=normalize(uSun+V);float spec=pow(max(dot(N,H),0.),220.)*3.5+pow(max(dot(N,H),0.),30.)*.18;c+=vec3(1.,.95,.82)*spec;
 float sparkle=step(.985,h21(floor(p*7.+t*2.)))*pow(max(dot(N,H),0.),10.)*1.2;c+=sparkle;
 float foam=smoothstep(.28,0.,vD)*(.45+.55*vn(p*3.4+t*.6-fl*2.));foam+=ring*.55;
 float streak=smoothstep(.62,.9,vn(vec2(dot(p,vF)*.6-t*1.2,dot(p,vec2(-vF.y,vF.x))*3.)))*.25*length(vF);
 c=mix(c,vec3(.96,.98,1.),clamp(foam+streak,0.,1.));
 float a=smoothstep(-.3,.04,vD)*mix(.72,.94,dd);a=max(a,clamp(foam,0.,1.)*smoothstep(-.3,0.,vD));
 gl_FragColor=vec4(c,a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}` });
    mat.uniforms.uTime = U.uTime; mat.uniforms.uRip = U.uRip; mat.uniforms.uSun = U.uSun;
    const m = new THREE.Mesh(g, mat); m.renderOrder = 2; m.name = 'water'; this.scene.add(m); this.water = m;
  }

  /* ---------- céu com nuvens em movimento ---------- */
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: U.uTime, uSun: U.uSun },
      vertexShader: `varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
      fragmentShader: `uniform float uTime;uniform vec3 uSun;varying vec3 vD;${NOISE_GLSL}
float fb(vec2 p){float a=.5,r=0.;for(int i=0;i<5;i++){r+=a*vn(p);p=p*2.07+vec2(5.1,1.3);a*=.5;}return r;}
void main(){vec3 d=normalize(vD);float h=d.y;
 vec3 hor=vec3(.78,.88,.97),zen=vec3(.18,.42,.82);vec3 c=mix(hor,zen,pow(clamp(h,0.,1.),.45));c=mix(c,vec3(.55,.68,.72),smoothstep(0.,-.2,h));
 float sd=max(dot(d,uSun),0.);c+=vec3(1.,.86,.62)*(pow(sd,900.)*8.+pow(sd,12.)*.22+pow(sd,3.)*.06);
 if(h>0.){vec2 cp=d.xz/(h+.18)*1.15;vec2 w=vec2(uTime*.018,uTime*.007);
  float n=fb(cp+w),n2=fb(cp*1.9-w*1.6+3.);float cl=smoothstep(.46,.78,n*.75+n2*.35);
  float sh=fb(cp+w+uSun.xz*.08);float lit=clamp(1.-(sh-n)*3.,.35,1.1);
  vec3 cc=mix(vec3(.62,.66,.74),vec3(1.,.98,.95),lit)+vec3(1.,.8,.55)*pow(sd,6.)*.35;
  c=mix(c,cc,cl*smoothstep(0.,.12,h)*.95);}
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(950, 48, 24), mat); sky.renderOrder = -1; sky.frustumCulled = false; sky.name = 'sky'; this.scene.add(sky); this.sky = sky;
  }

  /* ---------- casona (templo de cúpula) ---------- */
  /* casona: construída no desenho original e ampliada (malhas, colisões, rampas, luzes, chamas e portal) */
  buildTemple() {
    const k = CW.TEMPLE_S || 1, X = { cx: T.x, cz: T.z, y: CW.TEMPLE_Y - .5, s: k }, before = new Set(this.scene.children), nf = (this.flames || []).length, nfi = (this.fires || []).length;
    this._xf = X; try { this.buildTempleRaw(); } finally { this._xf = null; }
    const pv = (x, y, z) => [X.cx + (x - X.cx) * k, X.y + (y - X.y) * k, X.cz + (z - X.cz) * k];
    for (const o of this.scene.children) { if (before.has(o)) continue; const q = pv(o.position.x, o.position.y, o.position.z); o.position.set(q[0], q[1], q[2]); o.scale.multiplyScalar(k); if (o.isLight && o.distance) { o.distance *= k; o.intensity *= k * .8; } }
    for (let i = nf; i < (this.flames || []).length; i++) { const f = this.flames[i], q = pv(f[0], f[1], f[2]); this.flames[i] = [q[0], q[1], q[2], f[3] * k]; }
    for (let i = nfi; i < (this.fires || []).length; i++) { const f = this.fires[i], q = pv(f[0], f[1], f[2]); this.fires[i] = q; }
    const P = this.portal; if (P) { const q = pv(P.x, P.y, P.z); this.portal = { x: q[0], y: q[1], z: q[2], r: P.r * k }; }
    const I = this.interior; if (I) { const q = pv(I.cx, I.y, I.cz); this.interior = { cx: q[0], cz: q[2], y: q[1], R: I.R * k, top: X.y + (I.top - X.y) * k }; }
    if (this.coreLight) { this.coreLight.shadow.camera.far *= k; }
    const ti = this.templeInfo; if (ti) Object.assign(ti, { y0: X.y + (ti.y0 - X.y) * k, top: X.y + (ti.top - X.y) * k, R: ti.R * k, A: ti.A * k, door: [ti.cx, ti.cz + (ti.door[1] - ti.cz) * k] });
  }
  buildTempleRaw() {
    const cx = T.x, cz = T.z, y0 = CW.TEMPLE_Y, rot = 22.5 * PI / 180, R = 18, A = R * Math.cos(PI / 8), S = this.scene;
    const stone = stdMat({ color: 0x9a948c, roughness: .88 }, STONE_FRAG), stoneD = stdMat({ color: 0x7c766f, roughness: .9 }, STONE_FRAG), pave = stdMat({ color: 0xb0a898, roughness: .85 }, STONE_FRAG);
    this.stoneMat = stone;
    const add = (g, m, x, y, z, ry = 0, cast = true) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = cast; o.receiveShadow = true; S.add(o); return o; };
    const oct = (r, h, m, yb) => add(new THREE.CylinderGeometry(r, r, h, 8, 1, false, rot), m, cx, yb + h / 2, cz);
    oct(20.4, 1.5, stoneD, y0 - .5); oct(R, 2.9, stone, y0 - .5);
    const octIn = (x, z, r) => { const dx = x - cx, dz = z - cz, Ar = r * Math.cos(PI / 8); for (let k = 0; k < 8; k++) { const a = k * PI / 4; if (dx * Math.sin(a) + dz * Math.cos(a) > Ar) return false; } return true; };
    const octObs = (r, top, walk) => this.addObs({ type: 'c', x: cx, z: cz, r: r, y0: y0 - 1, y1: top, walk, octR: r, topAt: null });
    // superfícies: anel inferior e plataforma (círculo inscrito aproximado + teste do octógono)
    const ring = octObs(20.4, y0 + 1, true), plat = octObs(R, y0 + 2.4, true);
    ring.sdf = plat.sdf = true;
    for (const o of [ring, plat]) { const r = o.octR; o.type = 'oct'; }
    // escadaria frontal (7 degraus) e laterais (5 degraus)
    for (let i = 0; i < 7; i++) { const top = y0 + 2.4 - (i + 1) * .32, d = (i + 1) * .95; add(new THREE.BoxGeometry(9, top - (y0 - .6), .97), pave, cx, (top + y0 - .6) / 2, cz + A + d - .475); }
    for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { const top = y0 + 2.4 - (i + 1) * .44, d = (i + 1) * .95; add(new THREE.BoxGeometry(.97, top - (y0 - .6), 6), pave, cx + sd * (A + d - .475), (top + y0 - .6) / 2, cz); }
    const rampF = this.addBox(cx, cz + A + 3.3, 4.5, 3.45, 0, y0 - 1, y0 + 2.4, { walk: true, topAt: (x, z) => y0 + 2.4 - clamp((z - (cz + A)) / 6.65, 0, 1) * 2.24 });
    for (const sd of [-1, 1]) this.addBox(cx + sd * (A + 2.4), cz, 2.45, 3, 0, y0 - 1, y0 + 2.4, { walk: true, topAt: (x) => y0 + 2.4 - clamp((sd * (x - cx) - A) / 4.75, 0, 1) * 2.2 });
    // paredes do tambor (oco, com porta ao sul)
    const Rw = 12.5, Aw = Rw * Math.cos(PI / 8), side = 2 * Rw * Math.sin(PI / 8), th = .9, wy0 = y0 + 2.4, wh = 8.5;
    for (let i = 0; i < 8; i++) {
      const am = rot + (i + .5) / 8 * TAU, nxv = Math.sin(am), nzv = Math.cos(am), fx = cx + nxv * (Aw - th / 2), fz = cz + nzv * (Aw - th / 2);
      if (i === 7) { // face sul: porta
        const gap = 4.4, seg = (side - gap) / 2;
        for (const u of [-1, 1]) { const ox = u * (gap / 2 + seg / 2); add(new THREE.BoxGeometry(seg + .4, wh, th), stone, fx + ox, wy0 + wh / 2, fz, am); this.addBox(fx + ox, fz, (seg + .4) / 2, th / 2, am, wy0 - .2, wy0 + wh); }
        add(new THREE.BoxGeometry(gap + .2, wh - 4.6, th), stone, fx, wy0 + 4.6 + (wh - 4.6) / 2, fz, am);
        const archS = new THREE.Shape(); archS.moveTo(-2.7, 0); archS.lineTo(-2.7, 4.2); archS.absarc(0, 4.2, 2.7, PI, 0, true); archS.lineTo(2.7, 0); archS.lineTo(2.2, 0); archS.lineTo(2.2, 4.2); archS.absarc(0, 4.2, 2.2, 0, PI, false); archS.lineTo(-2.2, 0);
        const ag = new THREE.ExtrudeGeometry(archS, { depth: .3, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 2, curveSegments: 20 }); add(ag, stoneD, fx, wy0, fz + th / 2 + .02, am);
        continue;
      }
      add(new THREE.BoxGeometry(side + .45, wh, th), stone, fx, wy0 + wh / 2, fz, am);
      this.addBox(fx, fz, (side + .45) / 2, th / 2, am, wy0 - .2, wy0 + wh);
      // janelas em arco com brilho roxo
      const tx = Math.cos(am), tz = -Math.sin(am);
      for (const u of [-2.4, 2.4]) {
        const ws = new THREE.Shape(); ws.moveTo(-.85, 0); ws.lineTo(-.85, 2.1); ws.absarc(0, 2.1, .85, PI, 0, true); ws.lineTo(.85, 0); ws.lineTo(-.85, 0);
        const wg = new THREE.ShapeGeometry(ws, 16); const wm = add(wg, this.glowMat || (this.glowMat = new THREE.MeshStandardMaterial({ color: 0x2a1050, emissive: 0x9a4dff, emissiveIntensity: 1.6, roughness: .3 })), fx + tx * u + nxv * (th / 2 + .02), wy0 + 2.4, fz + tz * u + nzv * (th / 2 + .02), am, false);
        const fr = new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); s.moveTo(-1.15, -.2); s.lineTo(-1.15, 2.1); s.absarc(0, 2.1, 1.15, PI, 0, true); s.lineTo(1.15, -.2); s.lineTo(-1.15, -.2); const h = new THREE.Path(); h.moveTo(-.85, 0); h.lineTo(-.85, 2.1); h.absarc(0, 2.1, .85, PI, 0, true); h.lineTo(.85, 0); h.lineTo(-.85, 0); s.holes.push(h); return s; })(), { depth: .18, bevelEnabled: false, curveSegments: 16 });
        add(fr, stoneD, fx + tx * u + nxv * (th / 2), wy0 + 2.4, fz + tz * u + nzv * (th / 2), am);
      }
    }
    // piso interno e cornijas
    add(new THREE.CylinderGeometry(Aw, Aw, .1, 8, 1, false, rot), pave, cx, wy0 + .03, cz, 0, false);
    add(new THREE.CylinderGeometry(13.3, 13.3, .8, 8, 1, false, rot), stoneD, cx, wy0 + wh + .1, cz);
    add(new THREE.CylinderGeometry(12.9, 13.5, .5, 8, 1, false, rot), stoneD, cx, wy0 + .25, cz, 0, false);
    // pilares nos vértices
    for (let i = 0; i < 8; i++) { const a = rot + i / 8 * TAU, x = cx + Math.sin(a) * 13.3, z = cz + Math.cos(a) * 13.3;
      add(new THREE.BoxGeometry(1.7, 10.8, 1.7), stone, x, wy0 + 5.4, z, a); add(new THREE.BoxGeometry(2.2, .5, 2.2), stoneD, x, wy0 + 11, z, a); add(new THREE.ConeGeometry(1.05, 2.9, 8), stone, x, wy0 + 12.7, z, a + PI / 8);
      this.addObs({ type: 'c', x, z, r: 1.15, y0: wy0 - .3, y1: wy0 + 11 }); }
    // cúpula com rachaduras de energia
    const domeMat = new THREE.MeshPhysicalMaterial({ color: 0x3f9a86, roughness: .35, metalness: .1, clearcoat: .8, clearcoatRoughness: .3 });
    domeMat.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;uniform float uTime;\n' + NOISE_GLSL + 'float crk;float cid;')
        .replace('#include <color_fragment>', `#include <color_fragment>
{ vec2 q = vec2(atan(vOP.x, vOP.z) * 3.2, vOP.y * .55); vec2 fi = floor(q), ff = fract(q); float d1 = 8., d2 = 8.; vec2 ci = vec2(0.);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = h22(fi + g); vec2 r = g + o * .85 + .07 - ff; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; ci = fi + g; } else if (d < d2) d2 = d; }
  crk = 1. - smoothstep(0., .07, sqrt(d2) - sqrt(d1)); cid = h21(ci);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.3, 1.25, 1.1), smoothstep(.0, 12., vOP.y)) * (.85 + .3 * cid) * (1. - .7 * crk); }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += crk * vec3(.6, .2, 1.2) * (.6 + .5 * sin(uTime * 2.1 + cid * 6.28)) * 1.6;'); };
    const dome = add(new THREE.SphereGeometry(12.2, 72, 28, 0, TAU, 0, PI / 2 * .985), domeMat, cx, wy0 + 8.4, cz); dome.scale.y = .95;
    add(new THREE.CylinderGeometry(.12, .55, 3.6, 16), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: .9, roughness: .25 }), cx, wy0 + 8.4 + 11.6 + 1.6, cz);
    add(new THREE.SphereGeometry(.45, 20, 14), new THREE.MeshStandardMaterial({ color: 0xffe28a, emissive: 0xffc040, emissiveIntensity: 1.5 }), cx, wy0 + 8.4 + 11.6 + 3.5, cz, 0, false);
    // raios roxos sobre a cúpula (tubos que piscam)
    const r = mulberry32(99), boltMat = new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: { uTime: U.uTime },
      vertexShader: 'attribute float aPh;varying float vPh;varying vec2 vUv;void main(){vPh=aPh;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime;varying float vPh;varying vec2 vUv;void main(){float f=step(.35,fract(sin(floor(uTime*9.+vPh*13.)*43.1+vPh)*917.3));float fl=.55+.45*sin(uTime*23.+vPh*7.);float run=smoothstep(.0,.15,fract(vUv.x-uTime*.8+vPh));gl_FragColor=vec4(vec3(.75,.45,1.)*(1.4+run),(.35+.65*f)*fl);}' });
    const bolts = [];
    for (let b = 0; b < 7; b++) { let th = b * TAU / 7 + .3; const pts = []; for (let j = 0; j <= 16; j++) { const ph = .05 + j / 16 * 1.42; th += (r() - .5) * .36; pts.push(new THREE.Vector3(Math.cos(ph) * Math.sin(th) * 12.32, Math.sin(ph) * 12.32 * .95, Math.cos(ph) * Math.cos(th) * 12.32)); }
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, .1, 5, false); const ph = new Float32Array(g.attributes.position.count).fill(b / 7); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); bolts.push(g); }
    const bm = new THREE.Mesh(merge(bolts.map(g => { g.deleteAttribute('uv'); return g; })), boltMat);
    // merge removeu aPh/uv: recria para os raios
    const bg = new THREE.BufferGeometry(); { let pos = [], uv = [], ph = [], idx = [], off = 0; bolts.forEach((g, b) => { const p = g.attributes.position.array; pos.push(...p); const n = p.length / 3; for (let i = 0; i < n; i++) { uv.push((i / n), 0); ph.push(b / 7); } for (const k of g.index.array) idx.push(k + off); off += n; }); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1)); bg.setIndex(idx); }
    bm.geometry.dispose(); bm.geometry = bg; bm.position.set(cx, wy0 + 8.4, cz); bm.scale.y = 1; S.add(bm);
    this.buildInterior(cx, cz, wy0, Aw, rot, stoneD, wh);
    // tochas ao redor
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < .5) continue; this.torch(cx + Math.sin(a) * 16.6, y0 + 2.4, cz + Math.cos(a) * 16.6, 1.7); }
    for (const sd of [-1, 1]) for (const z of [A + 1.6, A + 6.2]) this.torch(cx + sd * 5.6, this.terrainAt(cx + sd * 5.6, cz + z), cz + z, 1.7);
    this.templeInfo = { cx, cz, y0, top: y0 + 2.4, R, A, door: [cx, cz + Aw] };
    this.octOf = { ring, plat };
  }
  /* ---------- interior da casona: cristais, núcleo-portal, feixes de luz, poeira, folhas que entram pela porta ---------- */
  buildInterior(cx, cz, wy0, Aw, rot, stoneD, wh) {
    const S = this.scene, r = mulberry32(4242), cm = crystalMaterial(U.uTime, { glow: .75 }), specs = [];
    this.crystalMat = cm;
    // aglomerados nos cantos internos (menos os dois ao lado da porta)
    for (let i = 1; i <= 6; i++) { const a = rot + i / 8 * TAU - PI / 8 + PI / 8, x = cx + Math.sin(a) * 9.4, z = cz + Math.cos(a) * 9.4, sz = .8 + r() * .35;
      specs.push(...clusterSpec(r, x, wy0, z, 7 + ((r() * 4) | 0), sz, i % 2 ? PALETTE.amethyst : PALETTE.mix));
      this.addObs({ type: 'c', x, z, r: 1.25, y0: wy0 - .2, y1: wy0 + 3.2 });
      const h = halo(i % 2 ? 0x9a5cff : 0x6fe8ff, 5.5, .32); h.position.set(x, wy0 + 1.6, z); S.add(h); }
    // pequenos cristais espalhados no piso (fora do caminho porta → centro)
    for (let k = 0; k < 14; k++) { const a = r() * TAU, d = 4.2 + r() * 4.6, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d; if (Math.abs(Math.sin(a)) < .35 && Math.cos(a) > 0) continue; specs.push(...clusterSpec(r, x, wy0, z, 2 + ((r() * 3) | 0), .3 + r() * .2, PALETTE.mix)); }
    S.add(crystalMesh(specs, cm));
    // núcleo central: cristal grande que flutua, núcleo de luz, fragmentos orbitando, anéis rúnicos e coluna de energia
    { const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, .8, 24), stoneD); ped.position.set(cx, wy0 + .4, cz); ped.castShadow = ped.receiveShadow = true; S.add(ped);
      const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, .25, 32), stoneD); ped2.position.set(cx, wy0 + .12, cz); ped2.receiveShadow = true; S.add(ped2);
      this.addObs({ type: 'c', x: cx, z: cz, r: 1.9, y0: wy0 - .2, y1: wy0 + .8, walk: true }); }
    const core = new THREE.Group(); core.position.set(cx, wy0, cz); core.userData.dyn = true; S.add(core);
    const big = new THREE.Mesh(crystalGeometry(), crystalMaterial(U.uTime, { glow: 1.15 })); big.material.color.set(0xc9a0ff); big.scale.set(5.4, 3.4, 5.4); big.castShadow = true; core.add(big);
    const big2 = big.clone(); big2.rotation.x = PI; big2.scale.set(5.4, 1.6, 5.4); core.add(big2);
    const inner = halo(0xd8b8ff, 4.2, .9); core.add(inner); const outer = halo(0x8a4dff, 11, .35); core.add(outer);
    const shards = []; for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(crystalGeometry(), cm); m.scale.set(1.3, .8, 1.3); core.add(m); shards.push(m); }
    const runeMat = new THREE.MeshBasicMaterial({ color: 0xb98cff, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.3, .035, 8, 96), runeMat), ringB = new THREE.Mesh(new THREE.TorusGeometry(2.8, .025, 8, 96), runeMat.clone()); ringB.material.color.set(0x6fe8ff); core.add(ringA, ringB);
    const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: U.uTime },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime;varying vec2 vUv;void main(){float e=sin(vUv.x*3.14159);float f=pow(1.-vUv.y,1.6);float n=.6+.4*sin(vUv.y*30.-uTime*4.+vUv.x*12.);gl_FragColor=vec4(vec3(.62,.42,1.)*e*f*n*.55,1.);}' });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 9, 32, 1, true), beamMat); beam.position.y = 5.3; beam.renderOrder = 6; core.add(beam);
    // círculo rúnico no piso (textura desenhada)
    const rc = document.createElement('canvas'); rc.width = rc.height = 512; { const x = rc.getContext('2d'); x.translate(256, 256); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 240, 0, TAU); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 200, 0, TAU); x.stroke(); x.beginPath(); x.arc(0, 0, 120, 0, TAU); x.stroke();
      x.font = 'bold 30px serif'; x.textAlign = 'center'; const G = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'; for (let k = 0; k < 24; k++) { x.save(); x.rotate(k / 24 * TAU); x.fillText(G[k], 0, -212); x.restore(); }
      for (let k = 0; k < 8; k++) { x.save(); x.rotate(k / 8 * TAU); x.beginPath(); x.moveTo(0, -120); x.lineTo(0, -200); x.stroke(); x.restore(); } }
    const rtex = new THREE.CanvasTexture(rc); rtex.colorSpace = THREE.SRGBColorSpace;
    const runes = new THREE.Mesh(new THREE.CircleGeometry(4.6, 64), new THREE.MeshBasicMaterial({ map: rtex, color: 0xa070ff, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    runes.rotation.x = -PI / 2; runes.position.set(cx, wy0 + .09, cz); runes.renderOrder = 4; runes.userData.dyn = true; S.add(runes);
    this.anim.push(t => {
      big.position.y = big2.position.y = 3.4 + Math.sin(t * 1.1) * .3; big.rotation.y = t * .35; big2.rotation.y = -t * .35; big2.position.y = big.position.y + .02;
      inner.position.y = big.position.y + 1.4; inner.material.opacity = .7 + .25 * Math.sin(t * 2.3); outer.position.y = big.position.y + 1.4;
      shards.forEach((m, k) => { const a = t * (.6 + k * .05) + k / 7 * TAU, rr = 2.4 + Math.sin(t * .8 + k) * .3; m.position.set(Math.cos(a) * rr, 3.6 + Math.sin(t * 1.4 + k * 1.7) * .9, Math.sin(a) * rr); m.rotation.set(t + k, t * .7, k); });
      ringA.position.y = 1.2 + Math.sin(t * .9) * .4; ringA.rotation.set(PI / 2 + Math.sin(t * .5) * .3, 0, t * .8); ringB.position.y = 2.6 + Math.sin(t * .7 + 1) * .4; ringB.rotation.set(PI / 2 + Math.cos(t * .4) * .35, 0, -t * .6);
      runes.rotation.z = t * .08; runes.material.opacity = .55 + .25 * Math.sin(t * 1.6); });
    this.portal = { x: cx, z: cz, y: wy0, r: 3.2 };
    // luzes: núcleo (com sombra nas qualidades altas) e dois aglomerados
    const L = this.addLight(cx, wy0 + 4.2, cz, 0xa060ff, 3.2, 22);
    if (L && this.q.shadowMap >= 2048) { L.castShadow = true; L.shadow.mapSize.set(512, 512); L.shadow.camera.near = .3; L.shadow.camera.far = 16; L.shadow.bias = -.002; L.shadow.autoUpdate = false; this.coreLight = L; }
    if (this.q.lights) { this.addLight(cx + Math.sin(rot + 2 * PI / 4) * 8.6, wy0 + 1.8, cz + Math.cos(rot + 2 * PI / 4) * 8.6, 0x6fe8ff, 1.4, 10); this.addLight(cx + Math.sin(rot + 5 * PI / 4) * 8.6, wy0 + 1.8, cz + Math.cos(rot + 5 * PI / 4) * 8.6, 0xb07bff, 1.4, 10); }
    // feixes de luz entrando pelas janelas (volumétricos aditivos com poeira animada)
    const shaftMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: U.uTime, uK: { value: 1 } },
      vertexShader: 'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: 'uniform float uTime;uniform float uK;varying vec2 vUv;varying vec3 vW;float h(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}void main(){float e=pow(sin(vUv.x*3.14159),1.5);float f=smoothstep(1.,.75,vUv.y)*smoothstep(0.,.5,vUv.y);float d=.75+.25*sin(vW.x*1.7+vW.y*2.3-uTime*.6)*sin(vW.z*1.3+uTime*.4);gl_FragColor=vec4(vec3(.78,.62,1.)*e*f*d*.16*uK,1.);}' });
    this.shaftMat = shaftMat;
    for (let i = 0; i < 7; i++) { const am = rot + (i + .5) / 8 * TAU, nx = Math.sin(am), nz = Math.cos(am), tx = Math.cos(am), tz = -Math.sin(am);
      for (const u of [-2.4, 2.4]) { const sx = cx + nx * (Aw - 1) + tx * u, sz = cz + nz * (Aw - 1) + tz * u, sy = wy0 + 3.2, ex = sx - nx * 5.5, ez = sz - nz * 5.5, ey = wy0 + .05;
        const len = Math.hypot(ex - sx, ey - sy, ez - sz), g = new THREE.CylinderGeometry(.8, 1.9, len, 14, 1, true); g.translate(0, -len / 2, 0);
        const m = new THREE.Mesh(g, shaftMat); m.position.set(sx, sy, sz); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(ex - sx, ey - sy, ez - sz).normalize()); m.renderOrder = 7; m.userData.dyn = true; S.add(m); } }
    // poeira suspensa
    const DN = 420, dp = new Float32Array(DN * 3), dph = new Float32Array(DN); for (let i = 0; i < DN; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 10; dp.set([cx + Math.cos(a) * d, wy0 + .3 + r() * 7.5, cz + Math.sin(a) * d], i * 3); dph[i] = r() * 100; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aPh', new THREE.BufferAttribute(dph, 1));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime },
      vertexShader: 'uniform float uTime;attribute float aPh;varying float vA;void main(){vec3 p=position+vec3(sin(uTime*.13+aPh)*.6,sin(uTime*.09+aPh*1.3)*.5,cos(uTime*.11+aPh)*.6);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(36./-mv.z,1.,6.);vA=.35+.35*sin(uTime*.8+aPh);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vA;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vec3(1.,.9,1.)*smoothstep(.5,0.,d)*vA,1.);}' }));
    dust.frustumCulled = false; dust.userData.dyn = true; S.add(dust);
    // folhas que o vento traz pela porta, giram pelo salão e pousam no piso
    const LN = 36, lg = new THREE.PlaneGeometry(.22, .14); lg.translate(.11, 0, 0);
    const lm = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: .8, side: THREE.DoubleSide }), LN); lm.castShadow = true; lm.userData.dyn = true; lm.frustumCulled = false; S.add(lm);
    const lcols = [0xb8862e, 0x8a6a28, 0x6f8a2a, 0xa0522d, 0xc9a040], cc = new THREE.Color(); for (let i = 0; i < LN; i++) lm.setColorAt(i, cc.set(lcols[i % lcols.length]));
    const leaves = Array.from({ length: LN }, (_, i) => ({ t: -i * .45, life: 9 + r() * 6, sp: .7 + r() * .6, sw: r() * TAU, rest: 0, p: new THREE.Vector3() }));
    const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), E4 = new THREE.Euler(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(1, 1, 1); let lastT = 0;
    this.anim.push(t => { const dt = Math.min(.05, t - lastT); lastT = t;
      for (let i = 0; i < LN; i++) { const L1 = leaves[i]; L1.t += dt; if (L1.t < 0) { M4.makeScale(0, 0, 0); lm.setMatrixAt(i, M4); continue; }
        const u = L1.t / L1.life; if (u >= 1) { L1.t = 0; L1.life = 9 + r() * 6; continue; }
        // trajetória: entra pela porta (sul), espiral para dentro descendo até o chão
        const fly = Math.min(1, u * 1.6), ang = PI / 2 + fly * (2.2 + L1.sp) + L1.sw * .2, rad = lerp(Aw + 2, 2.8 + L1.sp * 4, Math.sqrt(fly));
        const x = cx + Math.cos(ang) * rad * (fly < .15 ? .3 + fly * 4.6 : 1), z = cz + Math.sin(ang) * rad, y = wy0 + .06 + Math.max(0, (1 - fly) * 3.2 + Math.sin(t * 2.4 + L1.sw) * .4 * (1 - fly));
        const k = u > .92 ? (1 - u) / .08 : Math.min(1, L1.t * 2);
        if (fly < 1) E4.set(t * 3 * L1.sp + L1.sw, t * 2.1 + L1.sw, Math.sin(t * 4 + L1.sw) * 1.2); else E4.set(-PI / 2, L1.sw, 0);
        Q4.setFromEuler(E4); V1.set(x, y, z); V2.setScalar(k); M4.compose(V1, Q4, V2); lm.setMatrixAt(i, M4); }
      lm.instanceMatrix.needsUpdate = true; });
    // destroços de pedra junto às paredes
    const rub = []; for (let k = 0; k < 18; k++) { const a = r() * TAU, d = 9.3 + r() * 1, s2 = .15 + r() * .35; if (Math.cos(a) > .85) continue; const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s2, 0), stoneD); m.position.set(cx + Math.sin(a) * d, wy0 + s2 * .5, cz + Math.cos(a) * d); m.rotation.set(r() * 3, r() * 3, r() * 3); m.castShadow = true; m.receiveShadow = true; S.add(m); }
    this.interior = { cx, cz, y: wy0, R: Aw - .6, top: wy0 + wh };
  }
  /* sd para obstáculos octogonais */
  sdOct(o, x, z, out) { const dx = x - o.x, dz = z - o.z, Ar = o.octR * Math.cos(PI / 8); let best = -1e9, bk = 0; for (let k = 0; k < 8; k++) { const a = k * PI / 4, d = dx * Math.sin(a) + dz * Math.cos(a) - Ar; if (d > best) { best = d; bk = a; } } if (out) { out[0] = Math.sin(bk); out[1] = Math.cos(bk); } return best; }

  torch(x, y, z, h) {
    const post = this._torchGeo || (this._torchGeo = merge([colorize(xf(new THREE.CylinderGeometry(.09, .12, h, 10), 0, h / 2, 0), lin([92, 64, 40])), colorize(xf(new THREE.CylinderGeometry(.28, .16, .3, 14), 0, h + .1, 0), lin([60, 52, 44]))]));
    const m = new THREE.Mesh(post, this._torchMat || (this._torchMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .2 }))); m.position.set(x, y, z); m.castShadow = true; this.scene.add(m);
    (this.flames || (this.flames = [])).push([x, y + h + .25, z, .8]);
    this.addObs({ type: 'c', x, z, r: .22, y0: y - .2, y1: y + h, noRay: true });
  }
  addLight(x, y, z, color, intensity, dist) { if (!this.q.lights) return; const l = new THREE.PointLight(color, intensity * 12, dist, 1.6); l.position.set(x, y, z); this.scene.add(l); (this.lights || (this.lights = [])).push(l); return l; }

  /* ---------- acampamentos ---------- */
  buildCamps() {
    const S = this.scene, wood = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: .85 }), metal = new THREE.MeshStandardMaterial({ color: 0x55504a, metalness: .7, roughness: .4 });
    const roofs = { red: ['#b8332c', '#e8d2a0'], teal: ['#2f8fa8', '#e8e0c8'], beige: ['#d8c49a', '#9c5a32'] };
    this.banners = [];
    const bannerMat = c => windify(new THREE.MeshStandardMaterial({ color: c, roughness: .8, side: THREE.DoubleSide }), { height: 1.8, amp: .9, flutter: .12, freq: 2.6 });
    const K = CW.TENT_S || 1, R = 3.1 * K, DR = CW.CAMP_R, WH = 1.35 * K, RH = 2.5 * K, NB = 10;
    const rug = new THREE.MeshStandardMaterial({ map: clothTex('#7a2a24', '#d8a040'), roughness: .95 }), lampM = new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffa040, emissiveIntensity: 2.2 });
    const add = (g, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; S.add(o); return o; };
    for (const c of L.camps) {
      const y0 = this.terrainAt(c.x, c.z), rr = mulberry32((c.x * 131 + c.z * 7) | 0), rc = roofs[c.roof] || roofs.beige, fa = rr() * TAU, yd = y0 + .35;
      const cloth = windify(new THREE.MeshStandardMaterial({ map: clothTex(rc[0], rc[1]), roughness: .9, side: THREE.DoubleSide }), { height: 18, amp: .05, flutter: .02 });
      // deck de madeira grande e baixo (caminhável)
      add(new THREE.CylinderGeometry(DR, DR + .2, .4, 64), wood, c.x, y0 + .15, c.z);
      this.addObs({ type: 'c', x: c.x, z: c.z, r: DR, y0: y0 - .5, y1: yd, walk: true, noRay: true });
      // telhado alto em cone (só bloqueia a câmera) e mastro central
      const roof = add(new THREE.ConeGeometry(R + .6, RH, 56, 8, true), cloth, c.x, yd + WH + RH / 2, c.z);
      add(new THREE.CylinderGeometry(.18, .24, WH + RH + .6, 12), wood, c.x, yd + (WH + RH + .6) / 2, c.z);
      this.addObs({ type: 'c', x: c.x, z: c.z, r: .3, y0: yd - .2, y1: yd + WH + RH });
      this.addObs({ type: 'c', x: c.x, z: c.z, r: R + .4, y0: yd + WH - .1, y1: yd + WH + RH, camOnly: true });
      add(new THREE.SphereGeometry(.45, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8c060, metalness: .9, roughness: .2 }), c.x, yd + WH + RH + .7, c.z);
      // paredes de lona curvas entre os postes, com duas portas largas (uma de frente para a fogueira)
      const door = Math.round(((fa % TAU) + TAU) % TAU / (TAU / NB)) % NB;
      for (let i = 0; i < NB; i++) {
        const a0 = i / NB * TAU, a1 = (i + 1) / NB * TAU, am = (a0 + a1) / 2, px = c.x + Math.cos(a0) * R, pz = c.z + Math.sin(a0) * R;
        add(new THREE.CylinderGeometry(.14, .17, WH + .2, 10), wood, px, yd + (WH + .2) / 2, pz); this.addObs({ type: 'c', x: px, z: pz, r: .22, y0: yd - .2, y1: yd + WH });
        if (i === door || i === (door + NB / 2) % NB) { // porta: cortina presa em cima
          add(new THREE.CylinderGeometry(R, R, WH * .18, 8, 1, true, PI / 2 - a1, a1 - a0), cloth, c.x, yd + WH * .91, c.z); continue; }
        add(new THREE.CylinderGeometry(R, R, WH, 8, 2, true, PI / 2 - a1, a1 - a0), cloth, c.x, yd + WH / 2, c.z);
        const bl = 2 * R * Math.sin(PI / NB), bx = c.x + Math.cos(am) * R * Math.cos(PI / NB), bz = c.z + Math.sin(am) * R * Math.cos(PI / NB);
        this.addBox(bx, bz, bl / 2, .16, Math.atan2(-Math.cos(am), -Math.sin(am)), yd - .2, yd + WH);
      }
      // interior: tapete, mesa, baús, sacos de dormir e lampião aceso
      const rg = new THREE.Mesh(new THREE.CircleGeometry(R * .72, 48), rug); rg.rotation.x = -PI / 2; rg.position.set(c.x, yd + .02, c.z); rg.receiveShadow = true; S.add(rg);
      const ta = fa + PI * .5, tx = c.x + Math.cos(ta) * R * .45, tz = c.z + Math.sin(ta) * R * .45;
      add(new THREE.BoxGeometry(2.6, .14, 1.4), wood, tx, yd + 1.05, tz, -ta); for (const u of [-1, 1]) for (const v of [-1, 1]) add(new THREE.BoxGeometry(.12, 1, .12), wood, tx + Math.cos(-ta) * u * 1.15 + Math.sin(-ta) * v * .55, yd + .5, tz - Math.sin(-ta) * u * 1.15 + Math.cos(-ta) * v * .55);
      this.addBox(tx, tz, 1.3, .7, -ta, yd - .1, yd + 1.12, { walk: true, vault: true });
      const lamp = add(new THREE.SphereGeometry(.22, 14, 10), lampM, tx, yd + 1.35, tz); lamp.castShadow = false; this.addLight(tx, yd + 2, tz, 0xffb060, 1.6, 14);
      for (let k = 0; k < 3; k++) { const a = fa + PI + (k - 1) * .55, x = c.x + Math.cos(a) * R * .7, z = c.z + Math.sin(a) * R * .7; const bed = add(new THREE.CapsuleGeometry(.42, 1.7, 6, 14), new THREE.MeshStandardMaterial({ color: [0x5a6a3a, 0x7a4a2a, 0x3a4a6a][k], roughness: .95 }), x, yd + .3, z, -a); bed.rotation.set(PI / 2, 0, a + PI / 2); }
      for (let k = 0; k < 2; k++) { const a = fa - PI * .5 + (k ? .35 : -.35), x = c.x + Math.cos(a) * R * .78, z = c.z + Math.sin(a) * R * .78; add(new THREE.BoxGeometry(1.2, .8, .8), wood, x, yd + .4, z, -a); this.addBox(x, z, .6, .4, -a, yd - .1, yd + .8, { walk: true, vault: true }); }
      // fogueira em frente à porta
      const fx = c.x + Math.cos(fa) * (DR + 5), fz = c.z + Math.sin(fa) * (DR + 5), fy = this.terrainAt(fx, fz);
      for (let i = 0; i < 11; i++) { const a = i / 11 * TAU; const st = new THREE.Mesh(this.rockGeo(i % 4), this.rockMat()); st.scale.setScalar(.36); st.position.set(fx + Math.cos(a) * 1, fy + .08, fz + Math.sin(a) * 1); st.castShadow = true; S.add(st); }
      for (let i = 0; i < 3; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(.11, .12, 1.4, 10), wood); lg.position.set(fx, fy + .2, fz); lg.rotation.set(PI / 2 - .25, i * TAU / 3, 0); S.add(lg); }
      this.flames.push([fx, fy + .15, fz, 2.8]); (this.fires || (this.fires = [])).push([fx, fy, fz]); this.addLight(fx, fy + 1.4, fz, 0xff8a3a, 2.6, 20);
      this.addObs({ type: 'c', x: fx, z: fz, r: 1.15, y0: fy - .2, y1: fy + .4, walk: true });
      // caixotes, barris, cerca
      for (let i = 0; i < 5; i++) { const a = fa + .7 + i * .12 + rr() * .05, d = DR + 2.5 + rr() * 1.5, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = this.terrainAt(x, z), s = .9 + rr() * .35, ry = rr() * PI;
        const bx = add(new THREE.BoxGeometry(s, s, s), wood, x, y + s / 2, z, ry); this.addBox(x, z, s / 2, s / 2, ry, y - .2, y + s, { walk: true, vault: true });
        if (i === 1) { const b2 = bx.clone(); b2.position.y = y + s * 1.5; b2.rotation.y = ry + .4; S.add(b2); this.addBox(x, z, s / 2 * .95, s / 2 * .95, ry + .4, y + s - .1, y + 2 * s, { walk: true }); } }
      for (let i = 0; i < 4; i++) { const a = fa - .7 - i * .1, d = DR + 2.2, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = this.terrainAt(x, z);
        const br = new THREE.Mesh(this._barrel || (this._barrel = new THREE.LatheGeometry([[0, 0], [.4, 0], [.48, .3], [.5, .6], [.48, .9], [.4, 1.2], [0, 1.2]].map(p => new THREE.Vector2(p[0], p[1])), 24)), wood); br.position.set(x, y, z); br.castShadow = true; S.add(br); this.addObs({ type: 'c', x, z, r: .5, y0: y - .2, y1: y + 1.2, walk: true, vault: true }); }
      const fenceA0 = fa + PI + .6;
      for (let k = 0; k < 3; k++) { const a0 = fenceA0 + k * 1.1, a1 = a0 + .55, Rf = DR + 11; const p0 = [c.x + Math.cos(a0) * Rf, c.z + Math.sin(a0) * Rf], p1 = [c.x + Math.cos(a1) * Rf, c.z + Math.sin(a1) * Rf]; this.fence(p0, p1, wood); }
      // bandeira alta
      const bxp = c.x + Math.cos(fa + .9) * (DR + 1.5), bzp = c.z + Math.sin(fa + .9) * (DR + 1.5), by = this.terrainAt(bxp, bzp);
      const bp = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 8, 10), metal); bp.position.set(bxp, by + 4, bzp); bp.castShadow = true; S.add(bp);
      const bg = new THREE.PlaneGeometry(2.4, 3.2, 12, 16); bg.translate(1.22, -1.6, 0); bg.rotateY(fa); const pos = bg.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 3.2);
      const flag = new THREE.Mesh(bg, bannerMat(new THREE.Color(rc[0]))); flag.position.set(bxp, by + 7.9 - 3.2, bzp); flag.castShadow = true; S.add(flag);
      this.addObs({ type: 'c', x: bxp, z: bzp, r: .18, y0: by, y1: by + 8, noRay: true });
      for (const a of [fa + .42, fa - .42]) this.torch(c.x + Math.cos(a) * (DR + .8), this.terrainAt(c.x + Math.cos(a) * (DR + .8), c.z + Math.sin(a) * (DR + .8)), c.z + Math.sin(a) * (DR + .8), 2.2);
      roof.userData.camp = c;
    }
  }
  fence(p0, p1, wood) {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz), ang = Math.atan2(dz, dx), n = Math.max(2, Math.round(len / 1.6)); const parts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, x = p0[0] + dx * t, z = p0[1] + dz * t, y = this.terrainAt(x, z); parts.push(colorize(xf(new THREE.CylinderGeometry(.08, .09, 1.15, 8), x, y + .55, z), [1, 1, 1])); }
    for (const hh of [.45, .9]) { const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, y = this.terrainAt(mx, mz); parts.push(colorize(xf(new THREE.BoxGeometry(len, .12, .07), mx, y + hh, mz, 1, 1, 1, -ang), [1, 1, 1])); }
    const m = new THREE.Mesh(merge(parts), wood); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, y = this.terrainAt(mx, mz); this.addBox(mx, mz, len / 2, .12, -ang, y - .3, y + 1.0, { vault: true, noRay: true });
  }

  /* ---------- pontes ---------- */
  buildBridges() {
    const st = this.stoneMat;
    for (const b of CW.bridges) {
      const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz), mx = (b.a[0] + b.b[0]) / 2, mz = (b.a[1] + b.b[1]) / 2;
      const hy = Math.max(this.terrainAt(b.a[0], b.a[1]), this.terrainAt(b.b[0], b.b[1]), WATER_Y + .55) + .1, hw = b.hw + .55, top = hy + .3;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, .6, len + 1.4), st); deck.position.set(mx, hy, mz); deck.rotation.y = ang; deck.castShadow = deck.receiveShadow = true; this.scene.add(deck);
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(len * .45, len * .45, hw * 2 - .1, 32, 1, false, -PI / 2 - .8, 1.6), st); arch.rotation.set(0, ang, PI / 2); arch.position.set(mx, hy - len * .45 + .05, mz); this.scene.add(arch);
      for (const s of [-1, 1]) { const ox = Math.cos(ang) * s * (hw - .15), oz = -Math.sin(ang) * s * (hw - .15); const rail = new THREE.Mesh(new THREE.BoxGeometry(.3, .55, len + 1.2), st); rail.position.set(mx + ox, top + .27, mz + oz); rail.rotation.y = ang; rail.castShadow = true; this.scene.add(rail);
        this.addBox(mx + ox, mz + oz, .16, (len + 1.2) / 2, ang, top - .1, top + .55, { vault: true, noRay: true }); }
      this.addBox(mx, mz, hw, (len + 1.4) / 2, ang, hy - 2, top, { walk: true, noRay: true });
    }
  }
  /* ---------- escadaria do terraço (decorativa, o terreno já tem a rampa) ---------- */
  buildTerraceStairs() {
    const TR = L.terrace; if (!TR) return; const ang = Math.atan2(TR.nx, TR.nz), N = 7, mat = this.stoneMat, at = d => [TR.x + TR.nx * d, TR.z + TR.nz * d];
    for (let i = 0; i < N; i++) { const d = -2.1 + (i + .5) * (4.2 / N), p = at(d), top = this.terrainAt(p[0], p[1]) + .1, bot = top - .9; const m = new THREE.Mesh(new THREE.BoxGeometry(5.4, top - bot, 4.2 / N + .03), mat); m.position.set(p[0], (top + bot) / 2, p[1]); m.rotation.y = ang; m.receiveShadow = true; m.castShadow = true; this.scene.add(m); }
    for (const sd of [-1, 1]) for (const e of [-2.6, 2.6]) { const ox = sd * 3.05, q = at(e), x = q[0] + ox * Math.cos(ang), z = q[1] - ox * Math.sin(ang); this.torch(x, this.terrainAt(x, z), z, 1.5); }
  }
  /* ---------- ruínas com janelas (cobertura e parkour) ---------- */
  buildRuins() {
    const r = mulberry32(2024), mat = this.stoneMat, spots = L.ruins;
    this.ruins = [];
    for (const [sx, sz] of spots) {
      let x = sx, z = sz, ok = false; for (let k = 0; k < 30 && !ok; k++) { x = sx + (r() - .5) * 10; z = sz + (r() - .5) * 10; ok = CW.freeness(x, z) > .8 && CW.slopeAt(x, z) < .35 && this.waterDepth(x, z) < -1 && CW.forestDensity(x, z) < .5; }
      if (!ok) continue; const ang = r() * PI, y = this.terrainAt(x, z) - .25; this.ruins.push([x, z]);
      const c = Math.cos(ang), s = Math.sin(ang), at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
      const parts = [], box = (u, v, w, h, d, yb, rot = 0) => { const p = at(u, v); parts.push(colorize(xf(new THREE.BoxGeometry(w, h, d), p[0], yb + h / 2, p[1], 1, 1, 1, ang + rot), [1, 1, 1], .1, r)); };
      // parede A com janela
      box(-2.4, 0, 1.8, 3.4, .6, y); box(2.4, 0, 1.8, 3.4, .6, y); box(0, 0, 3, 1.25, .6, y); box(0, 0, 3, .9, .6, y + 2.75 - .2);
      [[-2.4, 0, 1.8], [2.4, 0, 1.8]].forEach(([u, v, w]) => { const p = at(u, v); this.addBox(p[0], p[1], w / 2, .3, ang, y, y + 3.4); });
      { const p = at(0, 0); this.addBox(p[0], p[1], 1.5, .3, ang, y, y + 1.25, { vault: true, walk: true }); }
      // parede B (L) quebrada
      const brk = r() > .5; box(-3.3, 2.6, .6, brk ? 2.2 : 3.1, 4.6, y, 0);
      { const p = at(-3.3, 2.6); this.addBox(p[0], p[1], .3, 2.3, ang, y, y + (brk ? 2.2 : 3.1)); }
      if (r() > .4) { box(1.2, 4.8, 3.2, 1.1, .55, y); const p = at(1.2, 4.8); this.addBox(p[0], p[1], 1.6, .28, ang, y, y + 1.1, { vault: true, walk: true }); }
      // escombros
      for (let k = 0; k < 4; k++) { const u = (r() - .5) * 6, v = (r() - .5) * 6 + 2, p = at(u, v); parts.push(colorize(xf(new THREE.BoxGeometry(.5 + r() * .5, .3 + r() * .3, .4 + r() * .5), p[0], this.terrainAt(p[0], p[1]) + .1, p[1], 1, 1, 1, r() * 3, r() * .3, r() * .3), [1, 1, 1], .1, r)); }
      const m = new THREE.Mesh(merge(parts), mat); m.castShadow = m.receiveShadow = true; this.scene.add(m);
    }
  }

  /* ---------- geometrias de vegetação e rochas ---------- */
  rockGeo(v) { this._rocks = this._rocks || []; if (!this._rocks[v]) { const g = blob(1, 2, .3, 1.4 + v * .3, 11 + v * 7); const P = g.attributes.position; for (let i = 0; i < P.count; i++) { let y = P.getY(i); if (y < -.35) P.setY(i, -.35 + (y + .35) * .3); P.setY(i, P.getY(i) * .72); } g.computeVertexNormals(); colorize(g, [1, 1, 1], 0, Math.random, (x, y, z) => y > .3 ? lin([118, 130, 84]) : lin([150, 140, 128])); this._rocks[v] = g; } return this._rocks[v]; }
  rockMat() { return this._rockMat || (this._rockMat = stdMat({ vertexColors: true, roughness: .92 }, `{ vec3 p = vWP; float n = vn(p.xz * 1.7 + p.y * 1.3) * .6 + vn(p.xz * 6. + p.y * 5.) * .4; diffuseColor.rgb *= .72 + .5 * n; float st = vn(vec2(p.y * 3.5, p.x * .5 + p.z * .5)); diffuseColor.rgb *= .9 + .2 * st;
    float moss = smoothstep(.55, .95, normalize(vNormalW).y) * smoothstep(.4, .7, vn(p.xz * .8)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.12, .22, .06), moss * .7); }`)); }
  pineGeo(v) {
    const r = mulberry32(300 + v), parts = [], H = 7.5 + v * .8;
    parts.push(colorize(xf(new THREE.CylinderGeometry(.16, .32, H * .45, 8, 1), 0, H * .22, 0), lin([92, 64, 42]), .1, r));
    const tiers = 5; for (let i = 0; i < tiers; i++) {
      const t = i / tiers, rad = lerp(2.5, .7, t) * (1 + (r() - .5) * .1), h = lerp(2.8, 1.8, t), y = H * .2 + i * (H * .72 / tiers);
      const g = welded(new THREE.ConeGeometry(rad, h, 12, 3, false)); const P = g.attributes.position;
      for (let k = 0; k < P.count; k++) { const x = P.getX(k), yy = P.getY(k), z = P.getZ(k), a = Math.atan2(z, x), rr = Math.hypot(x, z); const droop = rr / rad; const n = (Math.sin(a * 8 + i) * .5 + .5) * .22 + (r() - .5) * .08; P.setXYZ(k, x * (1 + n), yy - droop * droop * .45 + (Math.sin(a * 8 + i) * .08), z * (1 + n)); }
      g.computeVertexNormals(); xf(g, 0, y + h / 2, 0, 1, 1, 1, r() * TAU);
      colorize(g, [1, 1, 1], .08, r, (x, yy, z) => { const e = Math.hypot(x, z) / rad; return mix3(lin([22, 66, 34]), lin([70, 132, 58]), clamp(e * .9 + t * .2, 0, 1)); }); parts.push(g);
    }
    const out = merge(parts); out.userData.H = H; return out;
  }
  oakGeo(v) {
    const r = mulberry32(500 + v), parts = [];
    const trunk = welded(new THREE.CylinderGeometry(.32, .52, 3.4, 12, 4)); const P = trunk.attributes.position; for (let k = 0; k < P.count; k++) { const y = P.getY(k); P.setX(k, P.getX(k) + Math.sin(y * 1.3) * .08); } trunk.computeVertexNormals();
    parts.push(colorize(xf(trunk, 0, 1.7, 0), lin([98, 72, 48]), .08, r));
    for (let b = 0; b < 4; b++) { const a = b / 4 * TAU + r(); parts.push(colorize(xf(new THREE.CylinderGeometry(.1, .2, 2, 8), Math.cos(a) * .6, 3.6, Math.sin(a) * .6, 1, 1, 1, -a, 0, .8 * (b % 2 ? 1 : -1)), lin([92, 66, 44]))); }
    const N = 7; for (let i = 0; i < N; i++) {
      const a = i / N * TAU + r() * .5, d = i === 0 ? 0 : 1.4 + r() * .8, s = i === 0 ? 2.1 : 1.3 + r() * .7;
      const g = blob(1, 2, .18, 2.2, 40 + v * 10 + i); xf(g, Math.cos(a) * d, 4.6 + (i === 0 ? .8 : (r() - .3) * 1.4), Math.sin(a) * d, s, s * .85, s);
      colorize(g, [1, 1, 1], .1, r, (x, y, z) => mix3(lin([38, 92, 30]), lin([118, 170, 62]), clamp((y - 3.2) / 4, 0, 1))); parts.push(g);
    }
    return merge(parts);
  }
  bushGeo(v) {
    const r = mulberry32(700 + v), parts = []; const N = 4 + v;
    for (let i = 0; i < N; i++) { const a = r() * TAU, d = i ? .45 + r() * .4 : 0, s = .55 + r() * .35; const g = blob(1, 2, .2, 2.4, 90 + v * 13 + i); xf(g, Math.cos(a) * d, .45 + s * .4, Math.sin(a) * d, s, s * .8, s);
      colorize(g, [1, 1, 1], .1, r, (x, y) => mix3(lin([34, 86, 30]), lin([104, 160, 56]), clamp(y / 1.3, 0, 1))); parts.push(g); }
    return merge(parts);
  }
  /* ---------- vegetação instanciada por regiões ---------- */
  buildVegetation() {
    const objs = []; for (let ix = Math.floor(W.X0 / CW.CS); ix <= Math.floor(-W.X0 / CW.CS); ix++) for (let iz = Math.floor(W.Z0 / CW.CS); iz <= Math.floor((W.Z0 + W.NCZ * W.CHGT) / CW.CS); iz++) for (const o of CW.cellObjects(ix, iz)) objs.push(o);
    for (const o of CW.crags) objs.push(Object.assign({ t: 'crag' }, o));
    // remove o que caiu dentro de estruturas
    const clear = (x, z, r) => { for (const ob of this.near(x, z, r + 1)) { const d = ob.type === 'oct' ? this.sdOct(ob, x, z) : this.sd(ob, x, z); if (d < r) return false; } return true; };
    const leafFrag = `{ float n = vn(vWP.xz * 2.2 + vWP.y * 1.7); diffuseColor.rgb *= .78 + .42 * n; float sp = h21(floor(vWP.xz * 7. + vWP.y * 5.)); diffuseColor.rgb *= .92 + .16 * sp; }`;
    const fm = foliageSurfaceMaps();
    const foliagePBR = { physical: true, metalness: 0, roughness: .84, roughnessMap: fm.roughness,
      normalMap: fm.normal, normalScale: new THREE.Vector2(.24, .24), clearcoat: .035, clearcoatRoughness: .92 };
    const pbrFoliage = (opts, key) => applyPBR(stdMat(Object.assign({}, foliagePBR, opts)), { key: 'world-' + key, detail: { scale: 24, k: .009 }, ao: .72 });
    const mats = {
      pine: windify(pbrFoliage({ vertexColors: true, roughness: .88 }, 'pine'), { height: 9, amp: .48, flutter: .065, push: .18, radius: 1.5, freq: 1.2, frag: leafFrag, nrm: 2.8 }),
      oak: windify(pbrFoliage({ vertexColors: true, roughness: .84 }, 'oak'), { height: 7, amp: .39, flutter: .09, push: .22, radius: 1.5, freq: 1.4, frag: leafFrag, nrm: 2.6 }),
      bush: windify(pbrFoliage({ vertexColors: true, roughness: .82 }, 'bush'), { height: 1.6, amp: .2, flutter: .09, push: 1.35, radius: 1.35, freq: 2.25, frag: leafFrag, nrm: 3.2 }),
      rock: this.rockMat(),
    };
    const depth = {
      pine: depthFor({ height: 9, amp: .48, push: .18, radius: 1.5, freq: 1.2 }),
      oak: depthFor({ height: 7, amp: .39, push: .22, radius: 1.5, freq: 1.4 }),
      bush: depthFor({ height: 1.6, amp: .2, push: 1.35, radius: 1.35, freq: 2.25 })
    };
    const variants = { pine: [0, 1, 2].map(v => this.pineGeo(v)), oak: [0, 1].map(v => this.oakGeo(v)), bush: [0, 1, 2].map(v => this.bushGeo(v)), rock: [0, 1, 2, 3].map(v => this.rockGeo(v)) };
    const RX = Math.max(6, Math.round(W.NCX * W.CWID / 45)), RZ = Math.max(3, Math.round(W.NCZ * W.CHGT / 45)), buckets = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
    const put = (kind, v, x, y, z, s, ry, sy, cast) => { const rx = clamp(Math.floor((x - W.X0) / (W.NCX * W.CWID) * RX), 0, RX - 1), rz = clamp(Math.floor((z - W.Z0) / (W.NCZ * W.CHGT) * RZ), 0, RZ - 1), k = kind + v + ':' + rx + ',' + rz; let b = buckets.get(k); if (!b) buckets.set(k, b = { kind, v, list: [], cast }); b.list.push([x, y, z, s, ry, sy || s]); return { b, i: b.list.length - 1 }; };
    this.veg = [];
    this.flowers = [];
    for (const o of objs) {
      const r = mulberry32(o.seed || 1);
      if (o.t === 'pine' || o.t === 'oak') { if (!clear(o.x, o.z, 1.2)) continue; const v = (r() * variants[o.t].length) | 0, s = o.s * (o.t === 'oak' ? 1.05 : .95); const h = put(o.t, v, o.x, this.terrainAt(o.x, o.z) - .15, o.z, s, r() * TAU, s * (.9 + r() * .25), true), tr = { x: o.x, z: o.z, y: this.terrainAt(o.x, o.z), s, oak: o.t === 'oak' }; this.trees.push(tr); const ob = this.addObs({ type: 'c', x: o.x, z: o.z, r: (o.t === 'oak' ? .5 : .36) * s, y0: -9, y1: 40 }); this.veg.push({ x: o.x, z: o.z, r: 1, h, ob, tr, kind: 'tree', s }); }
      else if (o.t === 'bush') { if (!clear(o.x, o.z, .8)) continue; const by = this.terrainAt(o.x, o.z); const hb = put('bush', (r() * 3) | 0, o.x, by - .1, o.z, o.s * .9, r() * TAU, o.s * .9, true); const vb = { x: o.x, z: o.z, r: .6, h: hb, kind: 'bush', s: o.s }; this.veg.push(vb); (this.bushes || (this.bushes = [])).push([o.x, o.z, o.s]);
        // arbusto é sólido: o corpo encosta e para; os baixos dá para pular por cima
        if (o.s > .5) vb.ob = this.addObs({ type: 'c', x: o.x, z: o.z, r: o.s * .78, y0: by - .5, y1: by + o.s * 1.25, vault: true, noRay: true, bush: true }); }
      else if (o.t === 'rock' || o.t === 'pebble' || o.t === 'crag') { const big = o.t === 'crag', s = big ? o.s * 1.6 : o.t === 'pebble' ? o.s * .7 : o.s * .9; if (!clear(o.x, o.z, s * .6)) continue; const y = this.terrainAt(o.x, o.z); const hr = put('rock', (r() * 4) | 0, o.x, y - s * .12, o.z, s * (1 + r() * .3), r() * TAU, s * (.8 + r() * .5), s > .6), vr = { x: o.x, z: o.z, r: s * .6, h: hr, kind: 'rock', s }; this.veg.push(vr);
        if (s > .45) vr.ob = this.addObs({ type: 'c', x: o.x, z: o.z, r: s * .85, y0: y - 1, y1: y + s * .62, walk: true, vault: s < 1.6 }); }
      else if (o.t === 'flowers') this.flowers.push(o);
    }
    for (const b of buckets.values()) {
      const g = variants[b.kind][b.v], im = new THREE.InstancedMesh(g, mats[b.kind], b.list.length); im.castShadow = b.cast && this.q.shadows; im.receiveShadow = true; if (depth[b.kind]) im.customDepthMaterial = depth[b.kind];
      b.list.forEach((it, i) => { e.set(0, it[4], 0); q.setFromEuler(e); m4.compose(pv.set(it[0], it[1], it[2]), q, sv.set(it[3], it[5], it[3])); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = 'veg-' + b.kind; this.scene.add(im); b.im = im;
      if (!g.userData.lo && g.userData.lo !== null) { try { g.userData.lo = lodGeo(g, 9); } catch (e) { g.userData.lo = null; } } if (g.userData.lo) im.userData.lod = { hi: g, lo: g.userData.lo };
    }
    // flores (caule + pétalas) instanciadas, com vento
    const petal = [], cols = [[250, 220, 70], [240, 110, 150], [255, 255, 255], [190, 120, 250], [255, 150, 60]];
    const stem = colorize(xf(new THREE.CylinderGeometry(.015, .02, .4, 4), 0, .2, 0), lin([60, 120, 40]));
    const head = new THREE.CircleGeometry(.09, 7); head.rotateX(-PI / 2); xf(head, 0, .41, 0); colorize(head, [1, 1, 1]);
    const ctr = colorize(xf(new THREE.SphereGeometry(.035, 4, 2), 0, .43, 0), lin([240, 190, 40]));
    const fgeo = merge([stem, head, ctr]); const fmat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, side: THREE.DoubleSide }), { height: .45, amp: .12, flutter: .03, push: .35, radius: .8, freq: 2.6 });
    const fl = []; for (const o of this.flowers) { const r = mulberry32(o.seed); for (let i = 0; i < o.n; i++) { const x = o.x + (r() - .5) * 2.6, z = o.z + (r() - .5) * 2.6; if (this.waterDepth(x, z) > -.3) continue; fl.push([x, this.terrainAt(x, z), z, .8 + r() * .6, r() * TAU, cols[(r() * cols.length) | 0]]); } }
    if (fl.length) { const im = new THREE.InstancedMesh(fgeo, fmat, fl.length); const c = new THREE.Color(); fl.forEach((f, i) => { m4.compose(pv.set(f[0], f[1], f[2]), q.setFromEuler(e.set(0, f[4], 0)), sv.set(f[3], f[3], f[3])); im.setMatrixAt(i, m4); c.setRGB(...lin(f[5])); im.setColorAt(i, c); }); im.computeBoundingSphere(); im.name = 'flowers'; this.scene.add(im); }
  }

  /* ---------- grama densa perto da câmera (reposicionada conforme o jogador anda) ---------- */
  buildGrass() {
    if (!this.q.grass) return;
    const blades = [], r = mulberry32(31);
    for (let b = 0; b < 9; b++) { const a = r() * TAU, d = r() * .4, h = .26 + r() * .3, w = .03 + r() * .018, lean = (r() - .5) * .5, segs = 4; const pos = [], idx = []; for (let s = 0; s <= segs; s++) { const t = s / segs, ww = w * (1 - t * .92), y = h * t, off = lean * t * t; pos.push(-ww, y, off, ww, y, off); } for (let s = 0; s < segs; s++) { const k = s * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); xf(g, Math.cos(a) * d, 0, Math.sin(a) * d, 1, 1, 1, r() * TAU);
      const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * .3, 1, n.getZ(i) * .3); n.needsUpdate = true;
      colorize(g, [1, 1, 1], 0, r, (x, y) => mix3(lin([62, 120, 40]), lin([156, 200, 84]), clamp(y / .5, 0, 1))); blades.push(g); }
    const geo = merge(blades);
    const mat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, side: THREE.DoubleSide }), { height: .55, amp: .22, flutter: .035, push: .7, radius: .8, freq: 2.4 });
    const N = this.q.grass; this.grass = new THREE.InstancedMesh(geo, mat, N); this.grass.count = 0; this.grass.frustumCulled = false; this.grass.receiveShadow = true; this.grass.name = 'grass'; this.scene.add(this.grass);
    this.grassCenter = [1e9, 1e9];
  }
  /* grama: a reconstrução (≈12 mil instâncias) era feita num único quadro a cada 5 m andados = travadinha periódica.
     Agora é fatiada (~1,2 ms por quadro) em um buffer de espera e trocada de uma vez quando termina. */
  setGrassScale(k) {
    if (!this.grass) return; k = Math.max(0, Math.min(1, k)); if (Math.abs(k - (this.grassK ?? 1)) < .01) return;
    this.grassK = k; this.grass.visible = k > 0; this.grassCenter = [1e9, 1e9]; this._gj = null;
  }
  updateGrass(x, z) {
    if (!this.grass || !this.grass.visible) return;
    let j = this._gj;
    if (!j) {
      if (Math.hypot(x - this.grassCenter[0], z - this.grassCenter[1]) < 5) return;
      const R = (this.q.grassR || 30) * (this.grassK ?? 1), step = .62, N = this.grass.instanceMatrix.count;
      if (!this._gst) { this._gst = new Float32Array(N * 16); this._gm4 = new THREE.Matrix4(); this._gq = new THREE.Quaternion(); this._ge = new THREE.Euler(); this._gp = new THREE.Vector3(); this._gs = new THREE.Vector3(); }
      j = this._gj = { x, z, R, step, N, n: 0, gz: Math.floor((z - R) / step), gz1: Math.floor((z + R) / step), gx0: Math.floor((x - R) / step), gx1: Math.floor((x + R) / step), sync: this.grass.count === 0 };
      this.grassCenter = [x, z];
    }
    const { R, step, N, x: cx, z: cz } = j, g = this.hg, m4 = this._gm4, q = this._gq, e = this._ge, pv = this._gp, sv = this._gs, st = this._gst, until = j.sync ? Infinity : performance.now() + 1.2;
    let n = j.n;
    while (j.gz <= j.gz1 && n < N) {
      const gz = j.gz;
      for (let gx = j.gx0; gx <= j.gx1 && n < N; gx++) {
        const hsh = CW.hash2(gx, gz, 91), px = (gx + hsh) * step, pz = (gz + CW.hash2(gx, gz, 92)) * step, d = Math.hypot(px - cx, pz - cz); if (d > R) continue;
        const fi = Math.round((px - g.x0) / g.cell), fj = Math.round((pz - g.z0) / g.cell); if (fi < 0 || fj < 0 || fi >= g.nx || fj >= g.nz) continue;
        const dens = g.gd[fj * g.nx + fi] / 255; if (CW.hash2(gx, gz, 93) > dens * .95) continue;
        const fade = 1 - smooth(R * .7, R, d), s = (.75 + CW.hash2(gx, gz, 94) * .6) * (.1 + .9 * fade);   // some a zero na borda: sem "pipocar" quando a grama se renova
        m4.compose(pv.set(px, this.terrainAt(px, pz) - .03, pz), q.setFromEuler(e.set(0, hsh * TAU, 0)), sv.set(s, s * (.8 + dens * .4), s)).toArray(st, n++ * 16);
      }
      j.gz++; if (performance.now() > until) break;
    }
    j.n = n;
    if (j.gz > j.gz1 || n >= N) { this.grass.instanceMatrix.array.set(st.subarray(0, n * 16)); this.grass.count = n; this.grass.instanceMatrix.needsUpdate = true; this._gj = null; }
  }
  /* ---------- plantações (trigo balançando) ---------- */
  buildFields() {
    const stalk = []; const r = mulberry32(77);
    for (let b = 0; b < 3; b++) { const h = 1.0 + r() * .3, ox = (r() - .5) * .18, oz = (r() - .5) * .18; stalk.push(colorize(xf(new THREE.CylinderGeometry(.012, .02, h, 3, 1, true), ox, h / 2, oz), lin([196, 170, 80]))); stalk.push(colorize(xf(new THREE.ConeGeometry(.04, .24, 4, 1), ox, h + .1, oz), lin([226, 196, 96]))); }
    const geo = merge(stalk), list = [];
    for (const f of L.fields) for (let z = f.z0 + .4; z < f.z1; z += .7) for (let x = f.x0 + .3; x < f.x1; x += .5) { const xx = x + (r() - .5) * .15, zz = z + (r() - .5) * .1; if (this.waterDepth(xx, zz) > -.4) continue; list.push([xx, this.terrainAt(xx, zz), zz]); }
    if (!list.length) return;
    const mat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), { height: 1.2, amp: .3, flutter: .03, push: .7, radius: .9, freq: 1.8 });
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((p, i) => { const s = .85 + r() * .3; m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q.setFromEuler(e.set(0, r() * TAU, 0)), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m4); });
    im.computeBoundingSphere(); im.receiveShadow = true; im.name = 'fields'; this.scene.add(im);
  }
  /* ---------- folhas caindo e voando ---------- */
  buildLeaves() {
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.quadraticCurveTo(.09, .07, 0, .2); shape.quadraticCurveTo(-.09, .07, 0, 0);
    const g = new THREE.ShapeGeometry(shape, 4); g.translate(0, -.1, 0);
    const N = this.q.leaves || 220, fm = foliageSurfaceMaps(), mat = applyPBR(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .78, metalness: 0, roughnessMap: fm.roughness, normalMap: fm.normal, normalScale: new THREE.Vector2(.16, .16), clearcoat: .025, clearcoatRoughness: .95, side: THREE.DoubleSide }), { key: 'world-falling-leaves', detail: { scale: 30, k: .006 }, ao: .5 });
    const im = new THREE.InstancedMesh(g, mat, N); im.frustumCulled = false; im.castShadow = false; im.name = 'leaves';
    const cols = [[120, 170, 50], [196, 170, 60], [210, 120, 40], [90, 150, 50], [170, 90, 40]], c = new THREE.Color();
    this.leafData = Array.from({ length: N }, (_, i) => { c.setRGB(...lin(cols[i % cols.length])); im.setColorAt(i, c); return { p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), rot: new THREE.Euler(), sp: new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4), life: -Math.random() * 6, ground: 0, ph: Math.random() * 10 }; });
    this.scene.add(im); this.leaves = im;
  }
  updateLeaves(dt, cx, cz) {
    if (!this.leaves) return; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), w = U.uWind.value, t = this.time;
    const near = this._nearTrees && this._ntT > t ? this._nearTrees : (this._ntT = t + 1.5, this._nearTrees = this.trees.filter(tr => !tr.gone && Math.abs(tr.x - cx) < 40 && Math.abs(tr.z - cz) < 40));
    const gust = .6 + .4 * Math.sin(t * .63) * Math.sin(t * 1.13);
    this.leafData.forEach((L1, i) => {
      L1.life -= dt;
      if (L1.life < 0) {
        if (L1.life > -.5 || !near.length) { L1.p.y = -99; } else {
          const tr = near[(Math.random() * near.length) | 0], a = Math.random() * TAU, d = Math.random() * 2.2 * tr.s;
          L1.p.set(tr.x + Math.cos(a) * d, tr.y + (tr.oak ? 4.5 : 5) * tr.s + Math.random() * 2, tr.z + Math.sin(a) * d); L1.v.set(0, -.6, 0); L1.life = 9 + Math.random() * 6; L1.ground = 0;
          if (Math.random() < .25) { L1.p.set(cx + (Math.random() - .5) * 50, this.terrainAt(cx, cz) + 1 + Math.random() * 5, cz + (Math.random() - .5) * 50); L1.v.set(w.x * 3, .3, w.y * 3); }
        }
      } else if (L1.ground > 0) { L1.ground += dt; if (L1.ground > 3.5) L1.life = Math.min(L1.life, .3); }
      else {
        const fl = Math.sin(t * 3 + L1.ph), fl2 = Math.cos(t * 2.3 + L1.ph * 1.3);
        L1.v.x += ((w.x * w.z * 5 * gust + fl * 1.2) - L1.v.x) * dt * 1.5; L1.v.z += ((w.y * w.z * 5 * gust + fl2 * 1.2) - L1.v.z) * dt * 1.5; L1.v.y += ((-.75 + Math.sin(t * 2 + L1.ph) * .5) - L1.v.y) * dt * 2;
        L1.p.addScaledVector(L1.v, dt); L1.rot.x += L1.sp.x * dt; L1.rot.y += L1.sp.y * dt; L1.rot.z += L1.sp.z * dt;
        const gy = this.terrainAt(L1.p.x, L1.p.z); if (L1.p.y < gy + .03) { L1.p.y = gy + (this.waterDepth(L1.p.x, L1.p.z) > 0 ? WATER_Y - gy + .02 : .03); L1.ground = .01; L1.rot.x = -PI / 2; }
      }
      if (L1.ground > 0 && this.waterDepth(L1.p.x, L1.p.z) > 0) { L1.p.x += w.x * dt * .3; L1.p.z += w.y * dt * .3; }
      q.setFromEuler(L1.rot); const k = L1.life < .3 ? Math.max(0, L1.life / .3) : 1; s1.setScalar(k * 1.3); m4.compose(L1.p, q, s1); this.leaves.setMatrixAt(i, m4);
    });
    this.leaves.instanceMatrix.needsUpdate = true;
  }
  /* ---------- pássaros (bandos ao longe) ---------- */
  buildBirds() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .25, -.9, 0, -.2, 0, 0, -.1, 0, 0, .25, 0, 0, -.1, .9, 0, -.2], 3)); g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x1d2430, side: THREE.DoubleSide }); this.birds = [];
    for (let f = 0; f < 3; f++) for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(g, mat); b.scale.setScalar(.9); this.scene.add(b); this.birds.push({ m: b, f, i, ph: Math.random() * TAU }); }
  }
  updateBirds(t) { if (!this.birds) return; for (const b of this.birds) { const R = 60 + b.f * 25, sp = .05 + b.f * .015, a = t * sp + b.f * 2.1, ox = Math.cos(b.i * 1.7) * (b.i * .9), oz = Math.sin(b.i * 2.3) * (b.i * .9); const x = Math.cos(a) * R + ox + b.f * 20 - 20, z = Math.sin(a) * R * .6 + oz - 10, y = 32 + b.f * 6 + Math.sin(t * .5 + b.i) * 1.5; b.m.position.set(x, y, z); b.m.rotation.set(0, -a + PI, 0); b.m.scale.y = 1; b.m.morph = 0; const flap = Math.sin(t * 9 + b.ph); b.m.scale.set(.9, .9 + flap * .6, .9); } }

  /* ---------- chamas (planos cruzados com shader) e brilhos ---------- */
  buildFlames() {
    if (!this.flames || !this.flames.length) return;
    const g1 = new THREE.PlaneGeometry(1, 1.6, 1, 1); g1.translate(0, .8, 0); const g2 = g1.clone().rotateY(PI / 2); const g = merge([g1, g2].map(x => { x.deleteAttribute('uv'); return x; }));
    const uv = []; const P = g.attributes.position; for (let i = 0; i < P.count; i++) uv.push(P.getX(i) + P.getZ(i) + .5, P.getY(i) / 1.6); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: U.uTime },
      vertexShader: 'varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vec4 wp=instanceMatrix*vec4(position,1.);vSeed=fract(wp.x*.37+wp.z*.71);gl_Position=projectionMatrix*viewMatrix*modelMatrix*wp;}',
      fragmentShader: `uniform float uTime;varying vec2 vUv;varying float vSeed;${NOISE_GLSL}void main(){vec2 p=vUv;float t=uTime*2.4+vSeed*10.;float n=fbm3(vec2(p.x*3.,p.y*2.5-t));float w=(1.-abs(p.x-.5)*2.);float sh=w*(1.-p.y)*1.6-p.y*.4+n*.6-.55;float a=smoothstep(0.,.35,sh);vec3 c=mix(vec3(1.,.25,.02),vec3(1.,.85,.35),smoothstep(.2,.9,sh));gl_FragColor=vec4(c*1.8,a);}` });
    const im = new THREE.InstancedMesh(g, mat, this.flames.length), m4 = new THREE.Matrix4(); this.flames.forEach((f, i) => { m4.compose(new THREE.Vector3(f[0], f[1], f[2]), new THREE.Quaternion(), new THREE.Vector3(f[3] * .55, f[3] * .7, f[3] * .55)); im.setMatrixAt(i, m4); }); im.computeBoundingSphere(); im.frustumCulled = false; im.renderOrder = 3; this.scene.add(im);
    // halos e brasas
    const N = this.flames.length, gp = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), sz = new Float32Array(N); this.flames.forEach((f, i) => { pos.set([f[0], f[1] + .5 * f[3], f[2]], i * 3); sz[i] = f[3] * 5; });
    gp.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gp.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uScale: { value: 400 } },
      vertexShader: 'attribute float aSize;uniform float uTime;uniform float uScale;varying float vF;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vF=.8+.2*sin(uTime*11.+position.x*3.)*sin(uTime*7.+position.z);gl_PointSize=aSize*uScale/-mv.z*vF;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vF;void main(){vec2 d=gl_PointCoord-.5;float a=exp(-dot(d,d)*14.)*.45*vF;gl_FragColor=vec4(vec3(1.,.55,.2)*a,a);}' });
    const pts = new THREE.Points(gp, pm); pts.frustumCulled = false; pts.renderOrder = 4; this.scene.add(pts); this.haloMat = pm;
    // brasas subindo das fogueiras
    const E = 40 * (this.fires ? this.fires.length : 0); if (!E) return; const ge = new THREE.BufferGeometry(), ep = new Float32Array(E * 3), es = new Float32Array(E); for (let i = 0; i < E; i++) { const f = this.fires[(i / 40) | 0]; ep.set([f[0], f[1], f[2]], i * 3); es[i] = Math.random(); }
    ge.setAttribute('position', new THREE.BufferAttribute(ep, 3)); ge.setAttribute('aSeed', new THREE.BufferAttribute(es, 1));
    const em = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uScale: { value: 400 } },
      vertexShader: 'attribute float aSeed;uniform float uTime;uniform float uScale;varying float vA;void main(){float t=fract(uTime*.35+aSeed);vec3 p=position+vec3(sin(aSeed*40.+uTime*2.)*.4*t,t*4.5,cos(aSeed*30.+uTime*1.7)*.4*t);vA=(1.-t)*smoothstep(0.,.1,t);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=.12*uScale/-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vA;void main(){vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,0.,length(d))*vA;gl_FragColor=vec4(vec3(1.,.6,.2)*a*2.,a);}' });
    const ems = new THREE.Points(ge, em); ems.frustumCulled = false; this.scene.add(ems); this.emberMat = em;
  }

  /* ---------- minimapa ---------- */
  buildMinimap() {
    const g = this.hg, sc = 2 / CW.SCALE, w = Math.round(W.HX * 2 * sc), h = Math.round(W.HZ * 2 * sc), cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const wx = -W.HX + (x + .5) / sc, wz = -W.HZ + (y + .5) / sc, i = clamp(Math.round((wx - g.x0) / g.cell), 0, g.nx - 1), j = clamp(Math.round((wz - g.z0) / g.cell), 0, g.nz - 1), k = j * g.nx + i;
      let r = g.col[k * 3] ** (1 / 2.2), gg = g.col[k * 3 + 1] ** (1 / 2.2), b = g.col[k * 3 + 2] ** (1 / 2.2); const hh = g.h[k], shade = clamp(1 + (hh - (g.h[k - 1] || hh)) * .6, .7, 1.3);
      if (hh < WATER_Y) { const d = clamp((WATER_Y - hh) / 1.2, 0, 1); r = lerp(.35, .1, d); gg = lerp(.7, .4, d); b = lerp(.8, .7, d); }
      const fd = CW.forestDensity(wx, wz); if (fd > .5 && hh > WATER_Y) { r *= .7; gg *= .8; b *= .7; }
      const o = (y * w + x) * 4; img.data[o] = r * 255 * shade; img.data[o + 1] = gg * 255 * shade; img.data[o + 2] = b * 255 * shade; img.data[o + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const P = (x, z) => [(x + W.HX) * sc, (z + W.HZ) * sc];
    for (const t of this.trees) { const p = P(t.x, t.z); ctx.fillStyle = 'rgba(18,60,22,.55)'; ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 * sc * t.s, 0, TAU); ctx.fill(); }
    const tp = P(T.x, T.z); ctx.fillStyle = '#8f8a82'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = 22.5 * PI / 180 + k * PI / 4; ctx.lineTo(tp[0] + Math.sin(a) * 18 * CW.TEMPLE_S * sc, tp[1] + Math.cos(a) * 18 * CW.TEMPLE_S * sc); } ctx.fill();
    ctx.fillStyle = '#3f9a86'; ctx.beginPath(); ctx.arc(tp[0], tp[1], 12 * CW.TEMPLE_S * sc, 0, TAU); ctx.fill(); ctx.strokeStyle = '#b07bff'; ctx.lineWidth = 2; ctx.stroke();
    for (const c of L.camps) { const p = P(c.x, c.z); ctx.fillStyle = c.roof === 'red' ? '#c0392b' : c.roof === 'teal' ? '#2f8fa8' : '#d8c49a'; ctx.beginPath(); ctx.arc(p[0], p[1], CW.CAMP_R * sc, 0, TAU); ctx.fill(); ctx.strokeStyle = '#2b1a0e'; ctx.lineWidth = 1.5; ctx.stroke(); }
    for (const r of this.ruins || []) { const p = P(r[0], r[1]); ctx.fillStyle = '#9a948c'; ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8); }
    this.minimap = cv; this.mapScale = sc;
  }
  buildSpots() { this.buildFlames(); }
  /* junta malhas estáticas que usam o mesmo material (menos chamadas de desenho) */
  /* ---------- descarte por distância (como os jogos grandes: só desenha o que importa de perto) ----------
     Campos e flores (12 mil + 10 mil instâncias) viram blocos de 36 m; todo InstancedMesh estático ganha raio de
     visibilidade por tipo. O teste roda a cada 4 quadros e custa microssegundos. */
  chunkInstanced(im, cell) {
    const a = im.instanceMatrix.array, col = im.instanceColor ? im.instanceColor.array : null, buckets = new Map();
    for (let i = 0; i < im.count; i++) { const k = Math.floor(a[i * 16 + 12] / cell) + ',' + Math.floor(a[i * 16 + 14] / cell); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(i); }
    const out = [];
    for (const idx of buckets.values()) {
      const c = new THREE.InstancedMesh(im.geometry, im.material, idx.length);
      idx.forEach((src, k) => { c.instanceMatrix.array.set(a.subarray(src * 16, src * 16 + 16), k * 16); });
      if (col) { c.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(idx.length * 3), 3); idx.forEach((src, k) => { c.instanceColor.array.set(col.subarray(src * 3, src * 3 + 3), k * 3); }); }
      c.instanceMatrix.needsUpdate = true; c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow; c.name = im.name;
      if (im.customDepthMaterial) c.customDepthMaterial = im.customDepthMaterial;
      c.computeBoundingSphere(); this.scene.add(c); out.push(c);
    }
    im.removeFromParent(); return out;
  }
  buildCulling() {
    for (const o of [...this.scene.children]) if (o.isInstancedMesh && (o.name === 'fields' || o.name === 'flowers') && o.count > 64) this.chunkInstanced(o, 36);
    const MAXD = { 'veg-pine': 560, 'veg-oak': 520, 'veg-bush': 190, 'veg-rock': 280, fields: 90, flowers: 70 };
    const LODD = { 'veg-pine': 70, 'veg-oak': 65, 'veg-bush': 45, 'veg-rock': 55 };
    this.cull = [];
    for (const o of this.scene.children) if (o.isInstancedMesh && MAXD[o.name] && o.boundingSphere) this.cull.push({ o, c: o.boundingSphere.center, r: o.boundingSphere.radius, d: MAXD[o.name], l: LODD[o.name] || 9e9, far: false });
    this.cullT = 0;
  }
  updateCulling(camPos) {
    if (!this.cull || this.cullHold || (this.cullT++ & 3)) return;
    const cx = camPos.x, cz = camPos.z;
    for (const e of this.cull) { const dx = e.c.x - cx, dz = e.c.z - cz, d2 = dx * dx + dz * dz, lim = e.d + e.r; e.o.visible = d2 < lim * lim;
      const L = e.o.userData.lod; if (L && e.o.visible) { const li = e.l + e.r, far = d2 > li * li; if (far !== e.far) { e.far = far; e.o.geometry = far ? L.lo : L.hi; } } }
  }
  mergeStatic() {
    const groups = new Map(), keep = [];
    this.scene.updateMatrixWorld(true);
    for (const o of [...this.scene.children]) {
      if (!o.isMesh || o.isInstancedMesh || o.userData.dyn || o.name === 'terrain' || o.name === 'water' || o.name === 'sky' || o.material.isShaderMaterial || Array.isArray(o.material) || String(o.material.customProgramCacheKey()).includes('wind')) continue;
      const k = o.material.uuid + (o.castShadow ? 's' : 'n'); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(o);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      // separa em células de 60 m para manter o descarte por frustum
      const cells = new Map(); for (const o of list) { const c = Math.floor(o.position.x / 60) + ',' + Math.floor(o.position.z / 60); let l = cells.get(c); if (!l) cells.set(c, l = []); l.push(o); }
      for (const l of cells.values()) {
        if (l.length < 2) continue;
        const geos = l.map(o => { let g = o.geometry.index ? o.geometry.clone() : o.geometry.clone(); const hasUv = !!g.attributes.uv; for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(n)) g.deleteAttribute(n); if (!g.attributes.normal) g.computeVertexNormals(); g.applyMatrix4(o.matrixWorld); return g; });
        const allUv = geos.every(g => g.attributes.uv); if (!allUv) geos.forEach(g => g.deleteAttribute('uv'));
        const m = new THREE.Mesh(merge(geos), l[0].material); m.castShadow = l[0].castShadow; m.receiveShadow = true; this.scene.add(m);
        for (const o of l) { o.removeFromParent(); }
        geos.forEach(g => g.dispose());
      }
    }
  }
  /* pontos livres aleatórios (para nascimento, itens) */
  randomSpot(rnd, opts = {}) {
    for (let k = 0; k < 400; k++) { const x = (rnd() * 2 - 1) * (W.HX - 8), z = (rnd() * 2 - 1) * (W.HZ - 8); if (opts.cx != null && Math.hypot(x - opts.cx, z - opts.cz) > opts.r) continue; if (this.terrainAt(x, z) > 14) continue; if (!this.isFree(x, z, 1.4)) continue; return [x, z]; }
    return [0, 6];
  }

  /* ---------- por quadro ---------- */
  /* pólen e vaga-lumes flutuando no ar perto do jogador (dão profundidade e vida ao vale) */
  updateMotes(f) {
    if (!this.motes) {
      const N = this.q.grass ? 520 : 220, pos = new Float32Array(N * 3), r = mulberry32(99); for (let i = 0; i < N * 3; i++) pos[i] = r();
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: U.uTime, uC: { value: new THREE.Vector3() }, uW: U.uWind },
        vertexShader: 'uniform float uT;uniform vec3 uC;uniform vec3 uW;varying float vA;varying float vK;void main(){vec3 s=position;float B=46.;vec3 p=s*B;p.xz+=uW.xy*uT*.6;p.y+=sin(uT*.7+s.x*40.)*.6;p.x+=sin(uT*.5+s.z*30.)*.8;p.xz=mod(p.xz-uC.xz+B*.5,B)-B*.5+uC.xz;p.y=uC.y+.4+s.y*7.;vK=step(.82,fract(s.x*91.7));vA=(.35+.65*sin(uT*(1.5+s.z*3.)+s.y*50.))*(1.-smoothstep(16.,23.,distance(p.xz,uC.xz)));vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(vK>.5?9.:4.5)*(30./-mv.z);gl_Position=projectionMatrix*mv;}',
        fragmentShader: 'varying float vA;varying float vK;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);vec3 c=mix(vec3(1.,.95,.7),vec3(.75,1.,.45),vK);gl_FragColor=vec4(c*a*a*max(vA,0.)*(vK>.5?1.3:.55),1.);}' });
      this.motes = new THREE.Points(g, m); this.motes.frustumCulled = false; this.motes.renderOrder = 7; this.scene.add(this.motes);
    }
    this.motes.material.uniforms.uC.value.set(f.x, f.y, f.z);
  }
  update(dt, camPos, focus) {
    this.time += dt; U.uTime.value = this.time;
    const t = this.time, w = U.uWind.value; const a = .5 + Math.sin(t * .05) * .6; w.x = Math.cos(a); w.y = Math.sin(a); w.z = .45 + .25 * Math.sin(t * .21) * Math.sin(t * .13 + 1);
    for (const f of this.anim) f(t);
    if (focus) { this.updateGrass(focus.x, focus.z); this.updateLeaves(dt, focus.x, focus.z); this.updateMotes(focus); }
    this.updateBirds(t);
    this.updateCulling(camPos);
    const sc = this.r.domElement.height / 2 / Math.tan(this.camFov / 2 || .6); if (this.haloMat) this.haloMat.uniforms.uScale.value = sc; if (this.emberMat) this.emberMat.uniforms.uScale.value = sc;
  }
}
/* corrige sd para octógonos usados na casona */
const _sd = World.prototype.sd; World.prototype.sd = function (o, x, z, out) { return o.type === 'oct' ? this.sdOct(o, x, z, out) : _sd.call(this, o, x, z, out); };
