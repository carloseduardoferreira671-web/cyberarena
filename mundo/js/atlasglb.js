/* ATLAS a partir do modelo GLB (Tripo, malha estática + texturas PBR).
   O GLB não tem esqueleto: aqui o esqueleto do Hero é ENCAIXADO no modelo (as juntas vão para as articulações da malha)
   e os pesos de skinning são calculados pela distância de cada vértice aos ossos. As animações do jogo (correr, socar, cair…)
   continuam rodando nesses mesmos ossos. A carne/cabelo/tecido balançam na GPU (softbody.js). */
import * as THREE from '../lib/three.module.min.js';
import { loadGLBMesh } from './glbmesh.js';
import { SOFT, addSoftShader } from './softbody.js';
import { loadRigged } from './riggedglb.js';

const URL_GLB = new URL('../models/atlas.glb', import.meta.url).href;
let cache = null, loading = null;
export const atlasGLBReady = () => !!cache;
export function loadAtlasGLB() { return Promise.all([cache ? cache : loadGLBMesh(URL_GLB).then(r => (cache = r)).catch(() => null), loadRigged('atlas').catch(e => console.warn('Atlas rig', e.message)), loadRigged('nexus').catch(e => console.warn('Nexus rig', e.message)), loadRigged('cyber').catch(e => console.warn('Cyber rig', e.message))]).then(() => cache); }

const S = 2.85;                         // altura do herói no jogo (unidades) / altura do GLB (1.0)
const C = [-0.02, 0, 0.10];             // centro do corpo no GLB (x, -, z) → vira a origem do herói
// articulações medidas na malha (x, y, z) — esquerda do personagem = +x, frente = +z
const LAND = {
  hips: [-.02, .53, .10], spine: [-.02, .58, .10], chest: [-.02, .68, .10], neck: [-.03, .84, .10], head: [-.03, .88, .10],
  shL: [.11, .77, .10], uaL: [.15, .75, .10], faL: [.20, .58, .13], hdL: [.18, .50, .18],
  shR: [-.16, .77, .10], uaR: [-.19, .75, .10], faR: [-.23, .58, .13], hdR: [-.21, .50, .18],
  thL: [.05, .50, .10], shnL: [.09, .27, .12], ftL: [.19, .04, .12],
  thR: [-.09, .50, .10], shnR: [-.15, .27, .12], ftR: [-.20, .04, .12],
};
// segmentos de osso (início → fim) e "raio" do tecido que cada osso governa; f = quanto a carne dele balança
const BONES = [
  ['hips', 'spine', .17, .6], ['spine', 'chest', .15, .9], ['chest', 'neck', .17, 1], ['neck', 'head', .06, .15], ['head', [0, .12, 0], .11, .08],
  ['shL', 'uaL', .07, 1], ['uaL', 'faL', .06, 1], ['faL', 'hdL', .05, .6], ['hdL', [0, -.07, .02], .05, .15],
  ['shR', 'uaR', .07, 1], ['uaR', 'faR', .06, 1], ['faR', 'hdR', .05, .6], ['hdR', [0, -.07, .02], .05, .15],
  ['thL', 'shnL', .08, .8], ['shnL', 'ftL', .06, .45], ['ftL', [0, -.02, .1], .06, .1],
  ['thR', 'shnR', .08, .8], ['shnR', 'ftR', .06, .45], ['ftR', [0, -.02, .1], .06, .1],
];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildAtlasGLB(h) {
  const { geo: src, maps } = cache;
  // 1) encaixa o esqueleto do herói nas articulações da malha
  h.object.updateMatrixWorld(true);
  const rest0 = {}; for (const [k, j] of Object.entries(h.J)) rest0[k] = h.object.worldToLocal(j.getWorldPosition(new THREE.Vector3()));
  const T = {}; for (const k in LAND) T[k] = new THREE.Vector3((LAND[k][0] - C[0]) * S, LAND[k][1] * S, (LAND[k][2] - C[2]) * S);
  h.object.traverse(o => {
    const name = Object.keys(h.J).find(k => h.J[k] === o); if (!name || !o.parent) return;
    let tgt = T[name];
    if (!tgt) { const hand = name.startsWith('fgL') ? 'hdL' : name.startsWith('fgR') ? 'hdR' : null; if (!hand) return; tgt = T[hand].clone().add(rest0[name].clone().sub(rest0[hand]).multiplyScalar(.55)); }
    o.parent.updateWorldMatrix(true, false);
    o.position.copy(o.parent.worldToLocal(h.object.localToWorld(tgt.clone()))); o.updateMatrixWorld(true);
  });
  h.object.updateMatrixWorld(true);
  // 2) geometria própria (cópia) escalada para o herói + pesos de skinning
  const geo = src.clone(), P = geo.attributes.position, n = P.count;
  for (let i = 0; i < n; i++) P.setXYZ(i, (P.getX(i) - C[0]) * S, P.getY(i) * S, (P.getZ(i) - C[2]) * S);
  const segs = BONES.map(([a, b, rad, f]) => {
    const A = T[a], B = Array.isArray(b) ? A.clone().add(new THREE.Vector3(...b).multiplyScalar(S)) : T[b];
    return { A, AB: B.clone().sub(A), L2: Math.max(1e-6, B.distanceToSquared(A)), rad: rad * S, f, idx: 0 };
  });
  const names = BONES.map(b => b[0]), bones = names.map(k => h.J[k]);
  const SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4), AS = new Float32Array(n * 2), v = new THREE.Vector3(), q = new THREE.Vector3();
  const headSeg = segs[4], rank = new Array(segs.length);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    let dnMin = 1e9, dMinHead = 1e9;
    for (let s = 0; s < segs.length; s++) {
      const g = segs[s], t = Math.max(0, Math.min(1, v.clone().sub(g.A).dot(g.AB) / g.L2)); q.copy(g.A).addScaledVector(g.AB, t);
      const d = v.distanceTo(q), dn = d / g.rad; rank[s] = { s, w: 1 / Math.pow(dn + .12, 4), dn };
      if (dn < dnMin) dnMin = dn; if (s === 4) dMinHead = d;
    }
    rank.sort((a, b) => b.w - a.w); let sum = 0, fl = 0; for (let k = 0; k < 4; k++) sum += rank[k].w;
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = rank[k].s; SW[i * 4 + k] = rank[k].w / sum; fl += segs[rank[k].s].f * rank[k].w / sum; }
    // carne = músculo (balança com a massa); "flex" = o que é solto no ar (dreads e tecido do casaco)
    const hair = v.y > .78 * S && dMinHead > .13 * S ? sstep(.13 * S, .32 * S, dMinHead) : 0;
    const loose = sstep(1.7, 3.3, dnMin);
    AS[i * 2] = fl * (1 - Math.max(hair, loose)); AS[i * 2 + 1] = Math.max(hair, loose * .8);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4)); geo.setAttribute('aSoft', new THREE.BufferAttribute(AS, 2));
  // 3) material PBR com as texturas do GLB (cor + metal/rugosidade + normal)
  const mat = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.mr, metalnessMap: maps.mr, roughness: 1, metalness: 1, envMapIntensity: 1.1 });
  const U = { uJig: { value: new THREE.Vector3() }, uSoftK: { value: 1 }, uGlow: { value: 1.6 } };
  addSoftShader(mat, U);
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = 'atlas-glb'; mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  h.object.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
  h.atlasGLB = mesh;
  // esconde TUDO que o herói (Nexus) pendura nos ossos: cachecol, cabos, placas… só o corpo do GLB aparece
  for (const j of Object.values(h.J)) j.traverse(o => { if ((o.isMesh || o.isPoints || o.isLine) && o !== mesh) o.visible = false; });
  // 4) estado do balanço (mola por personagem)
  h.atlasSoft = {
    U, jig: new THREE.Vector3(), jv: new THREE.Vector3(),
    kick(dx, dz, F = 1) { const l = Math.hypot(dx, dz) || 1; this.jv.x += dx / l * F * 3.4; this.jv.z += dz / l * F * 3.4; this.jv.y -= F * 1.1; },
  };
  return mesh;
}

const _t = new THREE.Vector3();
export function stepAtlasSoft(h, dt, ac) {
  const s = h.atlasSoft; if (!s || dt <= 0) return; dt = Math.min(dt, .05);
  const K = 190, Cd = 9.5, lim = .3;
  _t.set(-ac.x * .004, -ac.y * .0025, -ac.z * .004); _t.x = Math.max(-lim, Math.min(lim, _t.x)); _t.y = Math.max(-lim, Math.min(lim, _t.y)); _t.z = Math.max(-lim, Math.min(lim, _t.z));
  s.jv.x += ((_t.x - s.jig.x) * K - s.jv.x * Cd) * dt; s.jv.y += ((_t.y - s.jig.y) * K - s.jv.y * Cd) * dt; s.jv.z += ((_t.z - s.jig.z) * K - s.jv.z * Cd) * dt;
  s.jig.addScaledVector(s.jv, dt); s.jig.clampLength(0, .55);
  s.U.uJig.value.copy(s.jig);
  s.U.uGlow.value = 1.5 + (h.glow || 0) * 1.6 + .25 * Math.sin((h.t || 0) * 4.4);
}
