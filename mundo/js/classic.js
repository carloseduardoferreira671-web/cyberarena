/* CyberArena · CYBER (o personagem original) aprimorado.
   Usa a malha esculpida original (≈60 mil triângulos) com 21 ossos principais + 8 helpers musculares ponderados:
   textura em alta, mapa de rugosidade derivado da textura (placas brancas brilham, tecido preto é fosco),
   luzes laranjas emissivas, reflexo especular e brilho de borda. É animado pelo mesmo sistema procedural do NEXUS
   (molas, passada contínua, ações com quadros-chave) e ganha cabos/faixa com física de vento. */
import * as THREE from '../lib/three.module.min.js';
import { Hero, SKINS, heroEnv, cosmicify, applyCinematicToon } from './hero.js';
import { applyPBR } from './pbr.js';
import { DreadHair, FaceRig } from './anatomy.js';
import { loadAtlasGLB, atlasGLBReady, buildAtlasGLB } from './atlasglb.js';
import { riggedReady, buildRigged } from './riggedglb.js';
export { loadAtlasGLB, atlasGLBReady };
import { loadRigged } from './riggedglb.js';
export const loadNexusRig = () => loadRigged('nexus');

const BASE = new URL('../../cyber_viewer/assets/', import.meta.url).href;
const MAP = { hips: 'pelvis', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head' };
for (const s of ['L', 'R']) Object.assign(MAP, { ['sh' + s]: 'clav_' + s, ['ua' + s]: 'uarm_' + s, ['fa' + s]: 'farm_' + s, ['hd' + s]: 'hand_' + s, ['th' + s]: 'thigh_' + s, ['shn' + s]: 'shin_' + s, ['ft' + s]: 'foot_' + s });
const S = 1.6; // escala: o modelo tem 1,9 m de altura; o mundo usa personagens de 3 m

// Regiões musculares seguem coordenadas da malha original (antes da escala S).
// Cada helper bone recebe peso real de skinning nos vértices da sua região.
const ANATOMY = [
  { name: 'pec_L', parent: 'chest', center: [.13, .49, .12], radius: [.16, .13, .10] },
  { name: 'pec_R', parent: 'chest', center: [-.13, .49, .12], radius: [.16, .13, .10] },
  { name: 'bicep_L', parent: 'uarm_L', center: [.30, .37, .045], radius: [.095, .145, .105] },
  { name: 'bicep_R', parent: 'uarm_R', center: [-.30, .37, .045], radius: [.095, .145, .105] },
  { name: 'quad_L', parent: 'thigh_L', center: [.15, -.23, .055], radius: [.115, .205, .125] },
  { name: 'quad_R', parent: 'thigh_R', center: [-.15, -.23, .055], radius: [.115, .205, .125] },
  { name: 'calf_L', parent: 'shin_L', center: [.17, -.64, .02], radius: [.095, .19, .115] },
  { name: 'calf_R', parent: 'shin_R', center: [-.17, -.64, .02], radius: [.095, .19, .115] },
];
function addAnatomyWeights(geometry) {
  const pos = geometry.attributes.position.array, oldI = geometry.attributes.skinIndex.array, oldW = geometry.attributes.skinWeight.array;
  const n = geometry.attributes.position.count, indices = new Uint16Array(n * 4), weights = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let best = -1, bestW = 0;
    for (let r = 0; r < ANATOMY.length; r++) {
      const a = ANATOMY[r], dx = (x - a.center[0]) / a.radius[0], dy = (y - a.center[1]) / a.radius[1], dz = (z - a.center[2]) / a.radius[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= 2.35) continue;
      const w = .24 * Math.pow(1 - d2 / 2.35, 1.65);
      if (w > bestW) { bestW = w; best = r; }
    }
    const base = [];
    for (let k = 0; k < 4; k++) { const w = oldW[v * 4 + k] / 255; if (w > 0) base.push([oldI[v * 4 + k], w]); }
    base.sort((a, b) => b[1] - a[1]);
    const useMuscle = best >= 0 && bestW > .012;
    const keep = base.slice(0, useMuscle ? 3 : 4), sum = keep.reduce((s, p) => s + p[1], 0) || 1;
    const final = keep.map(p => [p[0], p[1] / sum * (useMuscle ? 1 - bestW : 1)]);
    if (useMuscle) final.push([21 + best, bestW]);
    const total = final.reduce((s, p) => s + p[1], 0) || 1;
    let acc = 0;
    final.forEach((p, k) => { indices[v * 4 + k] = p[0]; const q = k === final.length - 1 ? 255 - acc : Math.round(p[1] / total * 255); weights[v * 4 + k] = q; acc += q; });
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4, true));
}

let shared = null, loading = null;

/* LOD do personagem: agrupamento de vértices por célula 3D + osso dominante (mantém a animação por esqueleto).
   De ≈60 mil triângulos cai para poucos milhares, usado a partir de ~20 m, onde a diferença não aparece. */
function decimateSkinned(g, cells) {
  const P = g.attributes.position.array, N = g.attributes.normal.array, UV = g.attributes.uv.array, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, IDX = g.index.array, n = g.attributes.position.count;
  g.computeBoundingBox(); const bb = g.boundingBox, size = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z), cs = size / cells;
  const map = new Map(), remap = new Int32Array(n), cl = [];
  for (let i = 0; i < n; i++) {
    let bi = 0, bw = -1; for (let k = 0; k < 4; k++) if (SW[i * 4 + k] > bw) { bw = SW[i * 4 + k]; bi = SI[i * 4 + k]; }
    const key = Math.floor((P[i * 3] - bb.min.x) / cs) + ',' + Math.floor((P[i * 3 + 1] - bb.min.y) / cs) + ',' + Math.floor((P[i * 3 + 2] - bb.min.z) / cs) + ',' + bi;
    let id = map.get(key); if (id === undefined) { id = cl.length; map.set(key, id); cl.push({ n: 0, p: [0, 0, 0], nr: [0, 0, 0], uv: [0, 0], w: new Map() }); }
    const c = cl[id]; c.n++; for (let k = 0; k < 3; k++) { c.p[k] += P[i * 3 + k]; c.nr[k] += N[i * 3 + k]; } c.uv[0] += UV[i * 2]; c.uv[1] += UV[i * 2 + 1];
    for (let k = 0; k < 4; k++) if (SW[i * 4 + k]) c.w.set(SI[i * 4 + k], (c.w.get(SI[i * 4 + k]) || 0) + SW[i * 4 + k]);
    remap[i] = id;
  }
  const m = cl.length, pos = new Float32Array(m * 3), nor = new Float32Array(m * 3), uv = new Float32Array(m * 2), si = new Uint16Array(m * 4), sw = new Uint8Array(m * 4);
  cl.forEach((c, i) => {
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = c.p[k] / c.n; const l = Math.hypot(...c.nr) || 1; for (let k = 0; k < 3; k++) nor[i * 3 + k] = c.nr[k] / l;
    uv[i * 2] = c.uv[0] / c.n; uv[i * 2 + 1] = c.uv[1] / c.n;
    const top = [...c.w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((t, e) => t + e[1], 0) || 1; let acc = 0;
    top.forEach((e, k) => { si[i * 4 + k] = e[0]; const v = k === top.length - 1 ? 255 - acc : Math.round(e[1] / sum * 255); sw[i * 4 + k] = Math.max(0, v); acc += sw[i * 4 + k]; });
  });
  const idx = []; for (let t = 0; t < IDX.length; t += 3) { const a = remap[IDX[t]], b = remap[IDX[t + 1]], c = remap[IDX[t + 2]]; if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); o.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  o.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); o.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  o.setIndex(new THREE.BufferAttribute(m > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1)); o.boundingSphere = g.boundingSphere ? g.boundingSphere.clone() : null; if (!o.boundingSphere) o.computeBoundingSphere();
  return o;
}

export function classicReady() { return !!shared; }
export function loadClassic() {
  if (loading) return loading;
  loading = (async () => {
    const [meta, buf, img] = await Promise.all([
      fetch(BASE + 'cyber.json').then(r => r.json()), fetch(BASE + 'cyber.bin').then(r => r.arrayBuffer()),
      new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = BASE + 'cyber_tex.webp'; })]);
    const L = meta.layout, g = new THREE.BufferGeometry();
    const view = (n, C) => new C(buf, L[n].offset, L[n].bytes / C.BYTES_PER_ELEMENT);
    g.setAttribute('position', new THREE.BufferAttribute(view('pos', Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(view('nrm', Float32Array), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(view('uv', Float32Array), 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(view('si', Uint8Array)), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(view('sw', Uint8Array), 4, true));
    g.setIndex(new THREE.BufferAttribute(view('idx', Uint16Array), 1)); g.computeBoundingSphere();
    addAnatomyWeights(g);
    // texturas: cor, rugosidade (derivada do brilho) e emissão (luzes laranjas/âmbar)
    const W = img.width, H = img.height, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const sw = 1024, sh = 1024, c2 = document.createElement('canvas'); c2.width = sw; c2.height = sh; const x2 = c2.getContext('2d'); x2.drawImage(img, 0, 0, sw, sh);
    const d = x2.getImageData(0, 0, sw, sh), rough = x2.createImageData(sw, sh), emi = x2.createImageData(sw, sh);
    for (let i = 0; i < d.data.length; i += 4) {
      const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2], lum = (r * .3 + gg * .59 + b * .11) / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), sat = mx ? (mx - mn) / mx : 0;
      const rr = Math.round((lum > .7 ? .28 : lum > .35 ? .5 : .82) * 255 - sat * 40); rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = Math.max(30, rr); rough.data[i + 3] = 255;
      const glow = r > 170 && gg > 80 && b < 110 && r - b > 110 && gg < r * .85 ? 1 : 0; emi.data[i] = r * glow; emi.data[i + 1] = gg * glow; emi.data[i + 2] = b * glow; emi.data[i + 3] = 255;
    }
    const mkT = (data, srgb) => { const c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').putImageData(data, 0, 0); const t = new THREE.CanvasTexture(c); t.flipY = false; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const map = new THREE.CanvasTexture(cv); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    let geoLow = g, geoMid = g; try { geoLow = decimateSkinned(g, 34); geoMid = decimateSkinned(g, 110); if (location.search.includes('debug')) console.log('LOD cyber', g.index.count / 3, '->', geoMid.index.count / 3, '->', geoLow.index.count / 3); } catch (e) { console.warn('LOD do Cyber indisponível', e); }
    shared = { meta, geo: g, geoMid, geoLow, map, rough: mkT(rough, false), emi: mkT(emi, true) };
    return shared;
  })();
  return loading;
}

export class CyberClassic extends Hero {
  constructor(skinId = 'cyber') { if (!shared) throw new Error('modelo do Cyber ainda não carregado'); super(skinId); this.charId = 'cyber'; }
  build() {
    const M = this.M, J = this.J, sk = shared.meta.skeleton, Sk = SKINS[this.skin] || SKINS.cyber;
    // material físico realista com brilho de borda e flash de dano por shader
    const tint = this.skin === 'cyber' ? new THREE.Color(1, 1, 1) : Sk.cosmic ? new THREE.Color(.3, .26, .62) : new THREE.Color(Sk.primary).lerp(new THREE.Color(1, 1, 1), .55);
    // metal escovado de verdade (reflete o ambiente), verniz fino: deixa de parecer plástico
    const mat = new THREE.MeshPhysicalMaterial({ map: shared.map, roughnessMap: shared.rough, roughness: .82, metalness: Sk.cosmic ? .42 : .2, clearcoat: .1, clearcoatRoughness: .62, emissiveMap: shared.emi, emissive: 0xffffff, emissiveIntensity: 1.6, color: tint, sheen: .12, sheenColor: new THREE.Color(Sk.accent), specularIntensity: .55 });
    const env = heroEnv(); if (env) { mat.envMap = env; mat.envMapIntensity = .48; }
    const U = this.cu = { uFlash: { value: 0 }, uRim: { value: new THREE.Color(Sk.accent) }, uRimK: { value: .55 } };
    mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlash;uniform vec3 uRim;uniform float uRimK;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float fr = pow(1. - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0., 1.), 3.); totalEmissiveRadiance += uRim * fr * uRimK + vec3(1., .25, .2) * uFlash * .9; }'); };
    mat.customProgramCacheKey = () => 'cyberClassic';
    if (Sk.cosmic) cosmicify(mat, 1.6, .5);
    applyCinematicToon(mat, { outline: true, ink: .82, key: 'cyber-classic' });
    this.cmat = mat;
    // versão leve para ≥ ~28 m: MeshStandard (sem verniz/sheen = bem menos custo por pixel), mesmos mapas, cor, emissão, rim e flash
    const lite = new THREE.MeshStandardMaterial({ map: shared.map, roughnessMap: shared.rough, roughness: .92, metalness: Sk.cosmic ? .7 : .55, emissiveMap: shared.emi, emissive: 0xffffff, emissiveIntensity: 1.6, color: tint });
    if (env) { lite.envMap = env; lite.envMapIntensity = 1.15; }
    lite.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlash;uniform vec3 uRim;uniform float uRimK;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float fr = pow(1. - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0., 1.), 3.); totalEmissiveRadiance += uRim * fr * uRimK + vec3(1., .25, .2) * uFlash * .9; }'); };
    lite.customProgramCacheKey = () => 'cyberClassicLite';
    if (Sk.cosmic) cosmicify(lite, 1.6, .5);
    this.lmat = lite;
    // os campos que o Hero anima: glow/armor/visor viram parâmetros do shader acima
    M.glow = { emissiveIntensity: 2.2 }; M.armor = { emissive: new THREE.Color(0, 0, 0) }; M.visor = { emissiveIntensity: .9 };
    const rig = new THREE.Group(); rig.scale.setScalar(S); rig.position.y = .9495 * S; this.body.add(rig); this.rig = rig;
    const bones = sk.names.map((n, i) => { const b = new THREE.Bone(); b.name = n; const h = sk.head[i], p = sk.parent[i]; if (p < 0) b.position.set(h[0], h[1], h[2]); else { const hp = sk.head[p]; b.position.set(h[0] - hp[0], h[1] - hp[1], h[2] - hp[2]); } return b; });
    bones.forEach((b, i) => { const p = sk.parent[i]; (p < 0 ? rig : bones[p]).add(b); });
    this.anatomyBones = {};
    for (let i = 0; i < ANATOMY.length; i++) {
      const spec = ANATOMY[i], pi = sk.names.indexOf(spec.parent), parentHead = sk.head[pi], b = new THREE.Bone();
      b.name = 'muscle_' + spec.name; b.position.set(spec.center[0] - parentHead[0], spec.center[1] - parentHead[1], spec.center[2] - parentHead[2]);
      bones[pi].add(b); bones.push(b); this.anatomyBones[spec.name.replace('muscle_', '')] = b;
    }
    for (const k in MAP) J[k] = bones[sk.names.indexOf(MAP[k])];
    this.pelvisRest = bones[0].position.y;
    const sm = new THREE.SkinnedMesh(shared.geo, mat); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false; rig.add(sm);
    this.object.updateMatrixWorld(true); const skeleton = new THREE.Skeleton(bones); sm.bind(skeleton); this.skeleton = skeleton; this.skinned = [sm]; this.sm = sm; this.tris = shared.geo.index.count / 3;
    // pontos de ancoragem (espaço local dos ossos, antes da escala)
    const at = (bone, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); bone.add(o); return o; };
    this.headMesh = J.head;
    this.anchorScarf = at(J.chest, 0, .2, -.13); this.anchorScarf2 = at(J.chest, .05, .19, -.12);
    this.anchorCables = [-.05, 0, .05].map(x => at(J.head, x, .2 - Math.abs(x), -.12));
    this.emitter = at(J.hdR, .02, -.17, .05); this.emitterL = at(J.hdL, -.02, -.17, .05);
    // dedos mecânicos articulados: 5 por mão, duas falanges cada, como ossos auxiliares ligados ao rig original.
    this.fingers = []; this.fingerGeometries = []; this.fingerMaterials = [];
    const fingerMat = new THREE.MeshPhysicalMaterial({ color: 0xe6ecf3, metalness: .18, roughness: .55, clearcoat: .2 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0xb9c6d4, metalness: .25, roughness: .5 });
    applyCinematicToon(fingerMat, { outline: true, ink: .65, key: 'cyber-finger' }); applyCinematicToon(jointMat, { outline: true, ink: .65, key: 'cyber-joint' });
    this.fingerMaterials.push(fingerMat, jointMat);
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? 1 : -1, hand = J['hd' + side];
      for (let f = 0; f < 5; f++) {
        const thumb = f === 4, x = thumb ? sign * .071 : ([-.052, -.018, .018, .052][f] * (side === 'L' ? 1 : -1));
        const y = thumb ? -.055 : -.105, z = thumb ? .025 : .055;
        const la = thumb ? .066 : [.066, .075, .07, .057][f], lb = thumb ? .055 : [.052, .06, .055, .045][f], rr = thumb ? .014 : .0125;
        const a = new THREE.Bone(); a.name = `cyber_finger_${side}_${f}_a`; a.position.set(x, y, z); hand.add(a);
        const ga = new THREE.CapsuleGeometry(rr, Math.max(.012, la - rr * 2), 4, 8); this.fingerGeometries.push(ga);
        const ma = new THREE.Mesh(ga, fingerMat); ma.position.y = -la * .5; ma.castShadow = true; ma.receiveShadow = true; a.add(ma);
        const cuffGeo = new THREE.SphereGeometry(rr * 1.28, 10, 8); this.fingerGeometries.push(cuffGeo); const cuff = new THREE.Mesh(cuffGeo, jointMat); cuff.position.y = -la; a.add(cuff);
        const b = new THREE.Bone(); b.name = `cyber_finger_${side}_${f}_b`; b.position.set(0, -la, 0); a.add(b);
        const gb = new THREE.CapsuleGeometry(rr * .9, Math.max(.01, lb - rr * 1.8), 4, 8); this.fingerGeometries.push(gb);
        const mb = new THREE.Mesh(gb, fingerMat); mb.position.y = -lb * .5; mb.castShadow = true; mb.receiveShadow = true; b.add(mb);
        const lc = thumb ? .035 : [.038, .043, .04, .032][f], c = new THREE.Bone(); c.name = `cyber_finger_${side}_${f}_c`; c.position.set(0, -lb, 0); b.add(c);
        const gc = new THREE.CapsuleGeometry(rr * .78, Math.max(.012, lc - rr * 1.45), 4, 8); this.fingerGeometries.push(gc);
        const mc = new THREE.Mesh(gc, fingerMat); mc.position.y = -lc * .5; mc.castShadow = true; mc.receiveShadow = true; c.add(mc);
        this.fingers.push({ a, b, c, side, f, thumb, st: { x: .02, v: 0 }, st2: { x: .02, v: 0 } });
      }
    }
    // faixa vermelha (2 pontas) e 3 cabos traseiros com física verlet
    const scarf = new THREE.MeshStandardMaterial({ color: this.skin === 'cyber' ? 0x9a1c16 : Sk.scarf, roughness: .8, side: THREE.DoubleSide });
    if (Sk.cosmic) { scarf.emissive = new THREE.Color(Sk.scarf); scarf.emissiveIntensity = .35; cosmicify(scarf, 2, .9); }
    const cable = new THREE.MeshStandardMaterial({ color: 0x15171c, emissive: Sk.accent, emissiveIntensity: .35, roughness: .65, metalness: .22, side: THREE.DoubleSide });
    applyCinematicToon(scarf, { outline: true, ink: .62, key: 'cyber-scarf' }); applyCinematicToon(cable, { outline: true, ink: .55, key: 'cyber-cable' });
    M.scarf = scarf; M.cable = cable;
    const Chain = this.constructor.Chain;
    this.chains = [new Chain(7, .14, .085, scarf, false), new Chain(6, .13, .07, scarf, false)]; for (let i = 0; i < 3; i++) this.chains.push(new Chain(6, .09, .05, cable, true));
    this.chainMeshes = new THREE.Group(); this.chainMeshes.name = 'hero-cloth'; for (const c of this.chains) this.chainMeshes.add(c.mesh);
    this.knuckleGlow = new THREE.Mesh(new THREE.SphereGeometry(.06, 16, 12), new THREE.MeshBasicMaterial({ color: Sk.accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.knuckleGlow.visible = false;
    this.emitter.add(this.knuckleGlow);
  }
  /* 0 = malha completa (60 mil) · 1 = média · 2 = leve · 3 = leve sem sombra */
  setLOD(l) { if (l === this.lod) return; this.lod = l; this.sm.geometry = l === 0 ? shared.geo : l === 1 ? shared.geoMid : shared.geoLow; this.sm.material = l >= 2 ? this.lmat : this.cmat; this.sm.castShadow = l < 3; }
  setHipY(v) { this.J.hips.position.y = this.pelvisRest + (v - 1.5) / S; }
  update(dt, s) {
    super.update(dt, s);
    const e = this.M.armor.emissive; this.cu.uFlash.value = Math.max(e.r, 0) * 1.1;
    this.cu.uRimK.value = .4 + (this.M.glow.emissiveIntensity - 2.2) * .25;
    this.lmat.emissiveIntensity = this.cmat.emissiveIntensity = 1.2 + (this.M.glow.emissiveIntensity - 2.2) * .5 + this.M.visor.emissiveIntensity * .5;
  }
  dispose() { this.detach(); for (const c of this.chains) c.geo.dispose(); if (this.impactMark) { for (const c of this.impactMark.children) { c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); } } for (const g of this.fingerGeometries || []) g.dispose(); for (const m of this.fingerMaterials || []) m.dispose(); if(this.softMeshGeometry && this.softMeshGeometry!==shared.geo && this.softMeshGeometry!==shared.geoMid && this.softMeshGeometry!==shared.geoLow) this.softMeshGeometry.dispose(); this.cmat.dispose(); this.lmat.dispose(); this.M.scarf.dispose(); this.M.cable.dispose(); this.knuckleGlow.geometry.dispose(); this.knuckleGlow.material.dispose(); }
}

/* cria o personagem certo; NEXUS se o Cyber ainda não carregou */
export function makeCharacter(charId, skinId) {
  if (charId === 'cyber' && riggedReady('cyber') && !/[?&]rig=0/.test(location.search)) {
    // CYBER novo (GLB com PBR + esqueleto): corpo escaneado preso aos ossos do Hero
    const h = new Hero(skinId); h.charId = 'cyber';
    for (const mesh of h.skinned || []) mesh.visible = false;
    if (h.softShell) h.softShell.visible = false; if (h.chainMeshes) h.chainMeshes.visible = false; if (h.knuckleGlow) h.knuckleGlow.visible = false;
    for (const f of h.fingers || []) { f.a.visible = false; }
    h.headPitch = -.3; h.neckPitch = -.15; buildRigged(h, 'cyber'); return h;
  }
  if (charId === 'cyber' && shared) return new CyberClassic(skinId);
  const atlas = charId === 'atlas', h = new Hero(atlas && skinId === 'cyber' ? 'ouro' : skinId); h.charId = atlas ? 'atlas' : 'nexus';
  if (!atlas && riggedReady('nexus') && !/[?&]rig=0/.test(location.search)) {
    for (const mesh of h.skinned || []) mesh.visible = false;
    if (h.softShell) h.softShell.visible = false; if (h.chainMeshes) h.chainMeshes.visible = false; if (h.knuckleGlow) h.knuckleGlow.visible = false;
    for (const f of h.fingers || []) { f.a.visible = false; }
    h.headPitch = -.38; h.neckPitch = -.2; buildRigged(h, 'nexus'); return h;
  }
  if (atlas && (riggedReady('atlas') || atlasGLBReady()) && !(typeof location !== 'undefined' && /[?&]atlasglb=0/.test(location.search))) {
    // ATLAS (modelo GLB com texturas PBR): esconde a malha do Nexus e usa o corpo escaneado, preso aos mesmos ossos.
    for (const mesh of h.skinned || []) mesh.visible = false;
    if (h.softShell) h.softShell.visible = false; if (h.chainMeshes) h.chainMeshes.visible = false; if (h.knuckleGlow) h.knuckleGlow.visible = false;
    for (const f of h.fingers || []) { f.a.visible = false; }
    if (riggedReady('atlas') && !/[?&]rig=0/.test(location.search)) { h.headPitch = -.5; h.neckPitch = -.28; buildRigged(h, 'atlas'); return h; }
    if (atlasGLBReady()) { buildAtlasGLB(h); return h; }
  }
  if (atlas) {
    // Remove a malha mecânica herdada do Hero/Nexus: Atlas usa somente a malha humana própria abaixo.
    for (const mesh of h.skinned || []) mesh.visible = false;
    if (h.softShell) h.softShell.visible = false;
    if (h.chainMeshes) h.chainMeshes.visible = false;
    if (h.knuckleGlow) h.knuckleGlow.visible = false;
    // Paleta própria do ATLAS: grafite orgânico e energia violeta.
    h.M.armor.color.set(0x92704b); h.M.armor.metalness = .18; h.M.armor.roughness = .52; h.M.armor.flatShading = false; h.M.armor.needsUpdate = true;
    h.M.suit.color.set(0x211d2c); h.M.suit.roughness = .82; h.M.suit.flatShading = false; h.M.suit.needsUpdate = true;
    h.M.trim.color.set(0xc4a36b); h.M.trim.metalness = .48; h.M.trim.needsUpdate = true;
    h.M.glow.color.set(0x9b65ff); h.M.glow.emissive.set(0x6d35df); h.M.glow.emissiveIntensity = 1.7;
    h.M.visor.emissive.set(0xb99aff); h.M.visor.emissiveIntensity = 1.1;
    h.M.scarf.color.set(0x241735); h.M.scarf.emissive.set(0x32105e); h.M.scarf.emissiveIntensity = .18;
    h.M.cable.color.set(0x17131e); h.M.cable.emissive.set(0x6b39bd); h.M.cable.emissiveIntensity = .28;
    // ATLAS: identidade própria inspirada na referência enviada (não é apenas uma skin do NEXUS).
    h.M.armor.color.set(0x17151f); h.M.armor.metalness = .12; h.M.armor.roughness = .72;
    h.M.suit.color.set(0x080a12); h.M.suit.roughness = .9;
    h.M.trim.color.set(0xb58a42); h.M.trim.metalness = .42;
    h.M.glow.color.set(0xc14aff); h.M.glow.emissive.set(0x8d20ed); h.M.glow.emissiveIntensity = 2.25;
    h.M.visor.color.set(0x080611); h.M.visor.emissive.set(0x9e32ff); h.M.visor.emissiveIntensity = 1.45;
    // ATLAS: corpo humano em uma única superfície orgânica (isosuperfície),
    // com skinning próprio. Não reutiliza as placas nem as primitivas do Nexus.
    // Pele escura quase preta (referência): albedo baixo, rugosidade média para o suor brilhar, "sheen" violeta de contorno e SSS arroxeado.
    const atlasSkin = new THREE.MeshPhysicalMaterial({ color: 0x1a1522, roughness: .5, metalness: 0, sheen: .95, sheenRoughness: .42, sheenColor: new THREE.Color(0x8a46ff), clearcoat: .22, clearcoatRoughness: .38, specularIntensity: .9, side: THREE.DoubleSide });
    applyPBR(atlasSkin, { key: 'atlas-skin', sss: [.30, .07, .44], detail: { scale: 60, k: .012 }, body: true });
    const atlasPants = new THREE.MeshPhysicalMaterial({ color: 0x0b0a14, roughness: .92, metalness: 0, sheen: .7, sheenRoughness: .7, sheenColor: new THREE.Color(0x3b2a66), side: THREE.DoubleSide });
    applyPBR(atlasPants, { key: 'atlas-pants', detail: { scale: 110, k: .02 }, body: true });
    const atlasShadow = new THREE.MeshStandardMaterial({ color: 0x100d19, roughness: .96, metalness: 0 });
    h.object.updateMatrixWorld(true);
    const boneNames = ['hips','spine','chest','neck','head','shL','uaL','faL','hdL','thL','shnL','ftL','shR','uaR','faR','hdR','thR','shnR','ftR'];
    const bodyBones = boneNames.map(n => h.J[n]).filter(Boolean);
    for (const f of h.fingers || []) { f.a.visible = false; }   // Atlas: mãos são punhos de luva; os dedos do Nexus (pretos) somem
    const bonePos = bodyBones.map(b => h.object.worldToLocal(b.getWorldPosition(new THREE.Vector3()).clone()));
    const wp = (name, off=[0,0,0]) => { const v=h.J[name].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(...off)); return h.object.worldToLocal(v); };
    const boneIdx = new Map(boneNames.filter(n => h.J[n]).map((n, i) => [n, i]));
    const segNext = { hips: ['spine'], spine: ['chest'], chest: ['neck'], neck: ['head'], head: [null, [0,.45,0]], shL: ['uaL'], uaL: ['faL'], faL: ['hdL'], hdL: [null, [0,-.2,0]], thL: ['shnL'], shnL: ['ftL'], ftL: [null, [0,-.02,.22]], shR: ['uaR'], uaR: ['faR'], faR: ['hdR'], hdR: [null, [0,-.2,0]], thR: ['shnR'], shnR: ['ftR'], ftR: [null, [0,-.02,.22]] };
    const segs = boneNames.filter(n => h.J[n]).map((n, i) => { const nx = segNext[n]; const A = bonePos[i].clone(); const B = nx[0] ? h.object.worldToLocal(h.J[nx[0]].getWorldPosition(new THREE.Vector3())) : wp(n, nx[1]); return { A, B, AB: B.clone().sub(A), L2: Math.max(1e-6, B.distanceToSquared(A)) }; });
    const distSeg = (q, p) => { const t = Math.max(0, Math.min(1, p.clone().sub(q.A).dot(q.AB) / q.L2)); return p.distanceTo(q.A.clone().addScaledVector(q.AB, t)); };
    const ell = (name, off, rad, softness=.095) => ({ n:name, c:wp(name,off), r:new THREE.Vector3(...rad), k:softness });
    const shapes = [
      ell('hips',[0,-.035,0],[.31,.25,.235],.10),
      ell('spine',[0,.015,0],[.285,.34,.205],.12),
      ell('chest',[0,.075,0],[.405,.43,.245],.12),
      ell('chest',[0,.29,0],[.365,.22,.225],.10),
      ell('neck',[0,.075,0],[.115,.19,.12],.07),
      ell('head',[0,.19,0],[.225,.285,.205],.07),
      ell('shL',[.015,.015,0],[.19,.175,.18],.09), ell('shR',[-.015,.015,0],[.19,.175,.18],.09),
      ell('uaL',[0,-.245,0],[.112,.255,.115],.09), ell('uaR',[0,-.245,0],[.112,.255,.115],.09),
      ell('faL',[0,-.225,0],[.095,.245,.095],.08), ell('faR',[0,-.225,0],[.095,.245,.095],.08),
      ell('hdL',[0,-.075,.015],[.092,.12,.07],.06), ell('hdR',[0,-.075,.015],[.092,.12,.07],.06),
      ell('thL',[0,-.31,0],[.155,.34,.145],.11), ell('thR',[0,-.31,0],[.155,.34,.145],.11),
      ell('shnL',[0,-.31,0],[.105,.32,.105],.09), ell('shnR',[0,-.31,0],[.105,.32,.105],.09),
      ell('ftL',[0,-.055,.07],[.12,.075,.20],.06), ell('ftR',[0,-.055,.07],[.12,.075,.20],.06)
    ];
    const smoothMin=(a,b,k)=>{const hh=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-hh*hh*k*.25;};
    const field=(x,y,z)=>{let d=1e3;for(const q of shapes){const dx=(x-q.c.x)/q.r.x,dy=(y-q.c.y)/q.r.y,dz=(z-q.c.z)/q.r.z;const k0=Math.hypot(dx,dy,dz),k1=Math.hypot(dx/q.r.x,dy/q.r.y,dz/q.r.z);const sd=k1>1e-7?k0*(k0-1)/k1: -Math.min(q.r.x,q.r.y,q.r.z);d=smoothMin(d,sd,q.k);}return d;};
    // Grade adaptativa em torno da silhueta humana: triangulação tetraédrica sem costuras entre peças.
    const nx=42, ny=92, nz=38, minX=-.78,maxX=.78,minY=-.14,maxY=3.12,minZ=-.52,maxZ=.52;
    const dx=(maxX-minX)/nx,dy=(maxY-minY)/ny,dz=(maxZ-minZ)/nz, idx=(i,j,k)=>(i*(ny+1)+j)*(nz+1)+k;
    const values=new Float32Array((nx+1)*(ny+1)*(nz+1));
    for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++)for(let k=0;k<=nz;k++)values[idx(i,j,k)]=field(minX+i*dx,minY+j*dy,minZ+k*dz);
    const positions=[], skinIndices=[], skinWeights=[], surfaceSkinIndices=[], surfacePantsIndices=[], edgeCache=new Map();
    const corners=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
    const tets=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]], edges=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
    const addVertex=(a,b,pa,pb,va,vb)=>{const key=a<b?a+':'+b:b+':'+a;let id=edgeCache.get(key);if(id!==undefined)return id;const t=va/(va-vb),p=pa.clone().lerp(pb,t);id=positions.length/3;positions.push(p.x,p.y,p.z);const bw=new Map();for(const q of shapes){const dx=(p.x-q.c.x)/q.r.x,dy=(p.y-q.c.y)/q.r.y,dz=(p.z-q.c.z)/q.r.z;const k0=Math.hypot(dx,dy,dz),k1=Math.hypot(dx/q.r.x,dy/q.r.y,dz/q.r.z);const sd=k1>1e-7?k0*(k0-1)/k1:-1;const bi=boneIdx.get(q.n);if(bi===undefined)continue;bw.set(bi,(bw.get(bi)||0)+1/Math.pow(Math.max(sd,0)+.02,3));}
      const ranked=[...bw.entries()].map(([i,w])=>({i,w})).sort((u,v)=>v.w-u.w).slice(0,3);const sum=ranked.reduce((u,v)=>u+v.w,0);for(let n=0;n<4;n++){if(n<ranked.length){skinIndices.push(ranked[n].i);skinWeights.push(ranked[n].w/sum);}else{skinIndices.push(0);skinWeights.push(0);}}edgeCache.set(key,id);return id;};
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++){
      const ids=corners.map(c=>idx(i+c[0],j+c[1],k+c[2])), vals=ids.map(v=>values[v]);let mn=Infinity,mx=-Infinity;for(const v of vals){mn=Math.min(mn,v);mx=Math.max(mx,v);}if(mn>0||mx<0)continue;
      const pts=corners.map(c=>new THREE.Vector3(minX+(i+c[0])*dx,minY+(j+c[1])*dy,minZ+(k+c[2])*dz));
      for(const tet of tets){const tv=tet.map(v=>vals[v]);if(Math.min(...tv)>0||Math.max(...tv)<0)continue;const hits=[];for(const [ea,eb] of edges){const ca=tet[ea],cb=tet[eb],va=vals[ca],vb=vals[cb];if((va<0)!==(vb<0))hits.push(addVertex(ids[ca],ids[cb],pts[ca],pts[cb],va,vb));}const tris=hits.length===3?[[hits[0],hits[1],hits[2]]]:hits.length===4?[[hits[0],hits[1],hits[3]],[hits[0],hits[3],hits[2]]]:[];for(const tri of tris){const cy=(positions[tri[0]*3+1]+positions[tri[1]*3+1]+positions[tri[2]*3+1])/3;(cy<1.48?surfacePantsIndices:surfaceSkinIndices).push(...tri);}}
    }
    const bodyGeo=new THREE.BufferGeometry();bodyGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));bodyGeo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndices,4));bodyGeo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeights,4));{ const nm=new Float32Array(positions.length), e=.012; for(let v=0;v<positions.length/3;v++){const x=positions[v*3],y=positions[v*3+1],z=positions[v*3+2];let gx=field(x+e,y,z)-field(x-e,y,z),gy=field(x,y+e,z)-field(x,y-e,z),gz=field(x,y,z+e)-field(x,y,z-e);const l=Math.hypot(gx,gy,gz)||1;nm[v*3]=gx/l;nm[v*3+1]=gy/l;nm[v*3+2]=gz/l;}
      const fix=arr=>{for(let t=0;t<arr.length;t+=3){const a=arr[t],b=arr[t+1],c=arr[t+2];const ux=positions[b*3]-positions[a*3],uy=positions[b*3+1]-positions[a*3+1],uz=positions[b*3+2]-positions[a*3+2],vx=positions[c*3]-positions[a*3],vy=positions[c*3+1]-positions[a*3+1],vz=positions[c*3+2]-positions[a*3+2];const fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx;if(fx*(nm[a*3]+nm[b*3]+nm[c*3])+fy*(nm[a*3+1]+nm[b*3+1]+nm[c*3+1])+fz*(nm[a*3+2]+nm[b*3+2]+nm[c*3+2])<0){arr[t+1]=c;arr[t+2]=b;}}};fix(surfaceSkinIndices);fix(surfacePantsIndices);
      bodyGeo.setAttribute('normal',new THREE.Float32BufferAttribute(nm,3)); }
    bodyGeo.setIndex([...surfaceSkinIndices,...surfacePantsIndices]);bodyGeo.addGroup(0,surfaceSkinIndices.length,0);bodyGeo.addGroup(surfaceSkinIndices.length,surfacePantsIndices.length,1);
    const atlasSkeleton=new THREE.Skeleton(bodyBones);const atlasBody=new THREE.SkinnedMesh(bodyGeo,[atlasSkin,atlasPants]);atlasBody.name='atlas-human-organic-body';atlasBody.castShadow=true;atlasBody.receiveShadow=true;atlasBody.frustumCulled=false;h.object.add(atlasBody);atlasBody.bind(atlasSkeleton);h.atlasBody=atlasBody;
    // Face humano: mandíbula, nariz, maçãs do rosto, orelhas, boca e sobrancelhas.
    const face=(geo,mat,pos,scale,rot)=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);if(rot)m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;h.J.head.add(m);return m;};
    face(new THREE.SphereGeometry(1,24,16),atlasSkin,[0,.065,.115],[.155,.115,.13]);
    // mandíbula articulada: queixo filho de um pivô; boca = fenda escura que abre com a expressão
    const jaw=new THREE.Group(); jaw.position.set(0,.13,.06); h.J.head.add(jaw);
    const chin=face(new THREE.SphereGeometry(1,20,14),atlasSkin,[0,-.125,.13],[.105,.055,.075]); jaw.add(chin); chin.position.set(0,-.125,.13);
    const mouth=face(new THREE.SphereGeometry(1,18,12),atlasShadow,[0,.105,.205],[.055,.018,.018]);
    const brows={}, ears=[];
    for(const side of [-1,1]){ears.push(face(new THREE.SphereGeometry(1,18,12),atlasSkin,[side*.22,.16,0],[.045,.075,.055]));brows[side]=face(new THREE.SphereGeometry(1,18,12),atlasSkin,[side*.105,.235,.155],[.075,.035,.035]);}
    h.M.scarf.color.set(0x170b25); h.M.scarf.emissive.set(0x5b168d); h.M.scarf.emissiveIntensity = .32;
    // Dreadlocks longos e soltos (referência): 42 mechas × 4 ossos numa única SkinnedMesh, com mola por segmento (anatomy.js).
    const matHair = new THREE.MeshPhysicalMaterial({ color: 0x0d0914, roughness: .6, metalness: .04, sheen: .85, sheenRoughness: .5, sheenColor: new THREE.Color(0x7a3cff), side: THREE.DoubleSide });
    applyPBR(matHair, { key: 'atlas-dread', detail: { scale: 70, k: .03 }, body: true });
    const hair = new THREE.Group(); hair.name = 'atlas-hair-legacy'; h.J.head.add(hair); h.atlasHair = hair;
    const curves = [];
    for (let i=0;i<42;i++) {
      const side=(i%7-3)*.067, row=Math.floor(i/7), startY=.49-row*.027;
      const start=new THREE.Vector3(side,startY,-.025+(row*.035));
      const end=new THREE.Vector3(side*2.1+Math.sin(i*2.1)*.24,.0-(i%4)*.06,-.98-(i%5)*.09);
      const mid=new THREE.Vector3(side*1.55+Math.sin(i*1.7)*.15,.42-row*.08,-.56-(i%4)*.06);
      curves.push({ pts:[start, start.clone().add(new THREE.Vector3(side*.25,.14,-.12)), mid, end] });
    }
    h.dread = new DreadHair(h.J.head, matHair, curves, .046);
    // Linha dourada na testa e olhos violeta visíveis por baixo da sobrancelha.
    const gold = new THREE.MeshStandardMaterial({color:0xd9ad58, metalness:1, roughness:.28, emissive:0x3a2208, emissiveIntensity:.18}); applyPBR(gold,{key:'atlas-gold',detail:{scale:90,k:.01}});
    const mark = new THREE.Mesh(new THREE.BoxGeometry(.025,.31,.018),gold); mark.position.set(0,.39,.263); mark.rotation.z=-.08; h.J.head.add(mark);
    const eyeMat = new THREE.MeshBasicMaterial({color:0xc66aff}); eyeMat.color.setRGB(2.6,.8,3.4);
    const eyes={}; for (const x of [-.105,.105]) { const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,16,10),eyeMat); eye.scale.set(1.45,.42,.5); eye.position.set(x,.225,.258); h.J.head.add(eye); eyes[x<0?'L':'R']=eye; }
    h.face = new FaceRig({ browL:brows[-1], browR:brows[1], eyeL:eyes.L, eyeR:eyes.R, jaw, mouth });
    // Núcleo violeta no esterno, assinatura visual de Atlas.
    const coreMat=new THREE.MeshStandardMaterial({color:0x6d19a8,emissive:0xb12cff,emissiveIntensity:2.8,roughness:.22,metalness:.18}); applyCinematicToon(coreMat,{outline:false,key:'atlas-core'}); const core = new THREE.Mesh(new THREE.SphereGeometry(.105,24,18),coreMat);
    core.position.set(0,.265,.292); h.J.chest.add(core); h.atlasCore=core;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.145,.018,8,36),gold); halo.position.copy(core.position); h.J.chest.add(halo);
    // Veios de energia assimétricos atravessam o peitoral: assinatura gráfica exclusiva de Atlas.
    const veinMat=new THREE.MeshStandardMaterial({color:0x5a1c9a,emissive:0x8a2cf0,emissiveIntensity:1.25,roughness:.4}); applyCinematicToon(veinMat,{outline:false,key:'atlas-veins'});
    const veins=[[[0,.34,.265],[-.12,.29,.28],[-.23,.20,.27],[-.34,.08,.22]],[[0,.34,.265],[.13,.28,.28],[.24,.18,.27],[.35,.05,.22]],[[0,.18,.285],[-.10,.10,.28],[-.19,-.02,.25],[-.27,-.12,.22]],[[0,.18,.285],[.10,.08,.28],[.20,-.03,.25],[.29,-.14,.22]],[[0,-.02,.28],[-.09,-.13,.26],[-.18,-.23,.23]],[[0,-.02,.28],[.08,-.13,.26],[.17,-.23,.23]]];
    for(const pts of veins){const curve=new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v)));const line=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.021,7,false),veinMat);h.J.chest.add(line);}
    // Cinto cruzado de metal e placas de antebraço violetas para quebrar a silhueta herdada do rig-base.
    const beltMat=new THREE.MeshStandardMaterial({color:0x241b28,metalness:.5,roughness:.5}); applyCinematicToon(beltMat,{outline:true,ink:.6,key:'atlas-belt'});
    for(const sign of [-1,1]){const strap=new THREE.Mesh(new THREE.BoxGeometry(.09,.56,.045),gold);strap.position.set(sign*.13,.0,.255);strap.rotation.z=sign*.48;h.J.hips.add(strap);}
    const buckle=new THREE.Mesh(new THREE.BoxGeometry(.19,.13,.055),gold);buckle.position.set(0,.04,.29);h.J.hips.add(buckle);
    // Manoplas violeta com espinhos (referência): vambrace metálico + espigões no dorso do antebraço + luva roxa na mão.
    const gaunt=new THREE.MeshPhysicalMaterial({color:0x1d0a35,metalness:.72,roughness:.3,clearcoat:1,clearcoatRoughness:.2,emissive:0x4a0f9a,emissiveIntensity:.5}); applyPBR(gaunt,{key:'atlas-gauntlet',detail:{scale:70,k:.02}});
    const glove=new THREE.MeshPhysicalMaterial({color:0x2c0f52,metalness:.2,roughness:.45,sheen:.8,sheenColor:new THREE.Color(0x9a58ff),sheenRoughness:.4,emissive:0x2a0a60,emissiveIntensity:.35}); applyPBR(glove,{key:'atlas-glove',detail:{scale:90,k:.02},body:true});
    for(const side of ['L','R']){const arm=h.J['fa'+side];
      const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.152,.122,.36,10,1),gaunt);cuff.position.set(0,-.24,.015);cuff.castShadow=true;arm.add(cuff);
      const edge=new THREE.Mesh(new THREE.TorusGeometry(.128,.02,8,24),gold);edge.rotation.x=Math.PI/2;edge.position.set(0,-.07,0);arm.add(edge);
      for(let i=0;i<5;i++){const sp=new THREE.Mesh(new THREE.ConeGeometry(.032-i*.003,.15-i*.012,6),gaunt);sp.position.set((i%2?.04:-.04),-.1-i*.065,-.135);sp.rotation.set(-1.25,0,(i%2?.2:-.2));sp.castShadow=true;arm.add(sp);}
      const hd=h.J['hd'+side]; if(hd){const g=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),glove);g.scale.set(.108,.145,.088);g.position.set(0,-.075,.015);g.castShadow=true;hd.add(g);
        const plate=new THREE.Mesh(new THREE.BoxGeometry(.15,.05,.03),gaunt);plate.position.set(0,-.14,.06);hd.add(plate);}
    }
    // Colar de corrente dourada com pingente violeta + correntes soltas no cinto (balançam com a aceleração do corpo).
    const link=(curve,n,r,parent)=>{for(let i=0;i<n;i++){const t=i/(n-1),pt=curve.getPointAt(t),tg=curve.getTangentAt(t);const lk=new THREE.Mesh(new THREE.TorusGeometry(r,r*.32,6,10),gold);lk.position.copy(pt);lk.rotation.order='ZXY';lk.rotation.z=Math.atan2(tg.y,tg.x);lk.rotation.x=(i%2)*Math.PI/2;lk.scale.x=1.5;lk.castShadow=true;parent.add(lk);}};
    link(new THREE.CatmullRomCurve3([new THREE.Vector3(-.17,.49,.12),new THREE.Vector3(-.12,.40,.26),new THREE.Vector3(0,.34,.305),new THREE.Vector3(.12,.40,.26),new THREE.Vector3(.17,.49,.12)]),22,.017,h.J.chest);
    const gemMat=new THREE.MeshStandardMaterial({color:0x6d19a8,emissive:0xb12cff,emissiveIntensity:2.4,roughness:.15,metalness:.1}); const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.04,0),gemMat);gem.position.set(0,.305,.315);gem.scale.set(.8,1.3,.8);h.J.chest.add(gem);
    const chains=new THREE.Group();chains.position.set(.3,.02,.14);h.J.hips.add(chains);h.atlasChains=chains;
    link(new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.07,-.18,.0),new THREE.Vector3(.1,-.36,-.02),new THREE.Vector3(.08,-.52,-.04)]),16,.02,chains);
    link(new THREE.CatmullRomCurve3([new THREE.Vector3(-.06,.01,0),new THREE.Vector3(-.02,-.14,.03),new THREE.Vector3(.0,-.26,.05)]),9,.018,chains);
    // Duas abas longas de casaco atrás da cintura, com balanço secundário em corrida e giro.
    const coatMat=new THREE.MeshPhysicalMaterial({color:0x0b0914,roughness:.9,sheen:.9,sheenRoughness:.5,sheenColor:new THREE.Color(0x5a2fa0),side:THREE.DoubleSide});applyPBR(coatMat,{key:'atlas-coat',detail:{scale:110,k:.03},body:true});
    const coat=new THREE.Group();coat.name='atlas-coat-tails';h.J.hips.add(coat);h.atlasCoat=coat;
    for(const side of [-1,1]){const shape=new THREE.Shape();shape.moveTo(0,0);shape.quadraticCurveTo(side*.18,-.25,side*.2,-.58);shape.lineTo(side*.34,-1.28);shape.quadraticCurveTo(side*.05,-1.18,-side*.08,-.82);shape.lineTo(0,0);const panel=new THREE.Mesh(new THREE.ShapeGeometry(shape,8),coatMat);panel.position.set(side*.12,-.12,-.28);panel.rotation.y=side*.08;coat.add(panel);}
    h.M.armor.needsUpdate=true; h.M.suit.needsUpdate=true; h.M.glow.needsUpdate=true; h.M.visor.needsUpdate=true;
  }
  return h;
}
