/* ATLAS com esqueleto de verdade (Mixamo, 60 ossos + cauda) e 51 animações vindas do GLB.
   A malha/pesos/animações são lidas do arquivo; a carne continua balançando na GPU (softbody.js). */
import * as THREE from '../lib/three.module.min.js';
import { loadGLBMesh } from './glbmesh.js';
import { addSoftShader } from './softbody.js';
import { packURL } from './packs.js';

const FILES = { atlas: '../models/atlas_rig.glb', nexus: '../models/nexus_rig.glb', cyber: '../models/cyber_rig.glb' };
const caches = {}, loads = {};
// Iluminação de estúdio compartilhada: as referências foram renderizadas com luzes grandes
// refletidas nas placas. Antes, só o Cyber recebia ambiente de reflexão; Atlas e Nexus ficavam
// quase pretos no render do jogo apesar de usarem as texturas corretas.
let studioEnv = null;
function getStudioEnv() {
  if (studioEnv) return studioEnv;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#f3f6ff'); gr.addColorStop(.28, '#c9d7f4');
  gr.addColorStop(.5, '#7888aa'); gr.addColorStop(.52, '#424c65');
  gr.addColorStop(1, '#202536'); g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
  // painéis de estúdio que criam reflexos largos e legíveis nas armaduras
  g.fillStyle = '#ffffff';
  [[28,18,72,88],[132,30,48,62],[225,12,86,105],[354,24,58,76],[438,10,45,108],
   [65,138,96,34],[272,148,112,26],[402,145,72,38]].forEach(r => g.fillRect(...r));
  const tx = new THREE.CanvasTexture(cv); tx.mapping = THREE.EquirectangularReflectionMapping;
  tx.colorSpace = THREE.SRGBColorSpace; tx.needsUpdate = true; studioEnv = tx; return tx;
}
export const riggedReady = (id = 'atlas') => !!caches[id];
export function loadRigged(id = 'atlas') {
  /* o arquivo vem do pacote baixado (ver packs.js); se ainda não foi baixado, falha sem "lembrar" o erro para tentar de novo depois */
  return loads[id] || (loads[id] = packURL(FILES[id].replace('../', '')).then(u => loadGLBMesh(u)).then(r => {
    const { json, acc } = r, clips = [];
    for (const a of json.animations || []) {
      const tr = [];
      for (const c of a.channels) {
        const nm = json.nodes[c.target.node].name, path = c.target.path, sm = a.samplers[c.sampler];
        if (path === 'scale') continue;
        const t = new Float32Array(acc(sm.input)), v = new Float32Array(acc(sm.output));
        if (path === 'translation') {
          if (/Hips$/.test(nm)) { const x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] -= x0; v[i + 2] -= z0; } }   // sem "root motion": o jogo move o corpo
          else continue;                                  // só o quadril translada; os outros ossos mantêm o comprimento
          tr.push(new THREE.VectorKeyframeTrack(nm + '.position', t, v));
        } else tr.push(new THREE.QuaternionKeyframeTrack(nm + '.quaternion', t, v));
      }
      clips.push(new THREE.AnimationClip(a.name, -1, tr));
    }
    r.clips = clips; computeLoose(r, id); return (caches[id] = r);
  }).catch(e => { delete loads[id]; throw e; }));
}

/* Partes soltas (fitas, capa, cabelo, roupa): vértices longe do "osso dono" ganham aLoose (0..1) e balançam na GPU. */
function pointSeg(p, a, b) { const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz; let t = l2 > 1e-12 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
function computeLoose(r, id) {
  if (r.geo.attributes.aLoose) { r.looseCount = 0; return; }   // física desenhada à mão no arquivo (_SOFT/_LOOSE/_HAIR)
  const { geo, json, acc } = r, sk = json.skins[0], J = sk.joints, ibm = acc(sk.inverseBindMatrices);
  const P = J.map((_, k) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, k * 16).invert()));
  const idx = {}; J.forEach((n, k) => idx[n] = k);
  const par = J.map(() => -1); json.nodes.forEach((n, i) => (n.children || []).forEach(c => { if (idx[c] !== undefined && idx[i] !== undefined) par[idx[c]] = idx[i]; }));
  const segs = J.map((_, k) => { const L = []; if (par[k] >= 0) L.push([P[par[k]], P[k]]); J.forEach((_, c) => { if (par[c] === k) L.push([P[k], P[c]]); }); if (!L.length) L.push([P[k], P[k]]); return L; });
  const pos = geo.attributes.position.array, si = geo.attributes.skinIndex.array, sw = geo.attributes.skinWeight.array, n = pos.length / 3;
  let y0 = 1e9, y1 = -1e9; for (let i = 0; i < n; i++) { y0 = Math.min(y0, pos[i * 3 + 1]); y1 = Math.max(y1, pos[i * 3 + 1]); } const H = y1 - y0;
  const dom = new Int16Array(n), dist = new Float32Array(n), p = new THREE.Vector3(), per = J.map(() => []);
  for (let i = 0; i < n; i++) { let bj = si[i * 4], bw = sw[i * 4]; for (let k = 1; k < 4; k++) if (sw[i * 4 + k] > bw) { bw = sw[i * 4 + k]; bj = si[i * 4 + k]; } dom[i] = bj; p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); let d = 1e9; for (const [a, b] of segs[bj]) d = Math.min(d, pointSeg(p, a, b)); dist[i] = d; per[bj].push(d); }
  const med = per.map(a => a.length > 12 ? a.sort((x, y) => x - y)[a.length >> 1] : 0), all = med.filter(x => x > 0).sort((x, y) => x - y), gm = all[all.length >> 1] || H * .05;
  const LO = new Float32Array(n), HAIR = new Float32Array(n); let cnt = 0;
  for (let i = 0; i < n; i++) { const nm = json.nodes[J[dom[i]]].name; if (/^(Tail|Cape)/.test(nm)) continue; const rr = Math.max(med[dom[i]] || gm, H * .02), q = dist[i] / rr; let v = Math.max(0, Math.min(1, (q - 1.15) / .95)); v = v * v * (3 - 2 * v); v *= (dist[i] > H * .022 ? 1 : 0); LO[i] = v; if (v > .05) cnt++; }
  // peças soltas de verdade: malha dividida em ilhas (soldando vértices na mesma posição); tudo que não é o corpo principal balança, com a raiz fixa
  { const key = new Map(), wid = new Int32Array(n), q = 1000 / Math.max(1e-6, H) * .5; for (let i = 0; i < n; i++) { const k = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q); let w = key.get(k); if (w === undefined) { w = key.size; key.set(k, w); } wid[i] = w; }
    const par2 = new Int32Array(key.size); for (let i = 0; i < par2.length; i++) par2[i] = i; const fd = x => { while (par2[x] !== x) { par2[x] = par2[par2[x]]; x = par2[x]; } return x; };
    const ix = geo.index.array; for (let t = 0; t < ix.length; t += 3) { const a = fd(wid[ix[t]]), b = fd(wid[ix[t + 1]]), c = fd(wid[ix[t + 2]]); par2[b] = a; par2[fd(c)] = fd(a); }
    const comps = new Map(); for (let i = 0; i < n; i++) { const c = fd(wid[i]); (comps.get(c) || comps.set(c, []).get(c)).push(i); }
    let big = null; for (const [c, L] of comps) if (!big || L.length > comps.get(big).length) big = c;
    for (const [c, L] of comps) { if (c === big || L.length < 12) continue; let ai = L[0], best = 1e9; for (const i of L) { const nm = json.nodes[J[dom[i]]].name; if (/^(Tail|Cape)/.test(nm)) continue; const rr = Math.max(med[dom[i]] || gm, H * .02), v = dist[i] / rr; if (v < best) { best = v; ai = i; } }
      const ax = pos[ai * 3], ay = pos[ai * 3 + 1], az = pos[ai * 3 + 2]; let ext = 0; for (const i of L) ext = Math.max(ext, Math.hypot(pos[i * 3] - ax, pos[i * 3 + 1] - ay, pos[i * 3 + 2] - az)); if (ext < H * .025) continue;
      for (const i of L) { const nm = json.nodes[J[dom[i]]].name; if (/^(Tail|Cape)/.test(nm)) continue; const t = Math.min(1, Math.hypot(pos[i * 3] - ax, pos[i * 3 + 1] - ay, pos[i * 3 + 2] - az) / (ext * .75)); LO[i] = Math.max(LO[i], Math.pow(t, 1.1)); } } }
  // Atlas: cabelo caído (o modelo vem com o cabelo em pé) + muito balanço
  if (false && id === 'atlas') {   // modelo novo já tem os dreads caídos: sem rebaixar o cabelo
    const hi2 = J.findIndex(k => /Head$/.test(json.nodes[k].name)), hp = J.findIndex(k => /Hips$/.test(json.nodes[k].name)), tL = J.findIndex(k => /LeftToeBase$/.test(json.nodes[k].name)), fL = J.findIndex(k => /LeftFoot$/.test(json.nodes[k].name)), tR = J.findIndex(k => /RightToeBase$/.test(json.nodes[k].name)), fR = J.findIndex(k => /RightFoot$/.test(json.nodes[k].name));
    const up = P[hi2].clone().sub(P[hp]).normalize(), fwd = P[tL].clone().sub(P[fL]).add(P[tR].clone().sub(P[fR])); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    r.dbg = { up: up.toArray(), fwd: fwd.toArray() }; const c0 = P[hi2].clone().addScaledVector(up, H * .045), hair = []; let Hh = 0, hr = 0;
    const hs0 = []; for (let i = 0; i < n; i++) if (dom[i] === hi2 && LO[i] < .02) { p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); hs0.push(p.clone().sub(c0).dot(up)); } hs0.sort((a, b) => a - b); const skull = hs0.length ? hs0[Math.floor(hs0.length * .97)] : H * .1;
    for (let i = 0; i < n; i++) { if (dom[i] !== hi2) continue; p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); const h = p.clone().sub(c0).dot(up); if (h < H * .01) continue; if (!(LO[i] > .08 || h > skull * 1.03)) continue; hair.push([i, h]); Hh = Math.max(Hh, h); }
    const nor = geo.attributes.normal.array, v = new THREE.Vector3(), rad = new THREE.Vector3(), ax2 = new THREE.Vector3(), nq = new THREE.Quaternion(), nn = new THREE.Vector3();
    for (const [i, h] of hair) { p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); v.copy(p).sub(c0); rad.copy(v).addScaledVector(up, -v.dot(up)); rad.multiplyScalar(.45).addScaledVector(fwd, -H * .07); if (rad.lengthSq() < 1e-10) rad.copy(fwd).negate(); rad.normalize();
      const phi = Math.min(1, h / Math.max(1e-6, Hh)) * 3.0; ax2.crossVectors(up, rad).normalize(); nq.setFromAxisAngle(ax2, phi);
      // eixo = up × radial; ângulo negativo leva o "para cima" na direção radial (cai para fora/trás)
      v.applyQuaternion(nq); p.copy(c0).add(v); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; nn.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]).applyQuaternion(nq); nor[i * 3] = nn.x; nor[i * 3 + 1] = nn.y; nor[i * 3 + 2] = nn.z;
      const s = Math.min(1, h / Math.max(1e-6, Hh)); LO[i] = Math.max(LO[i], .35 + .65 * s); HAIR[i] = s; }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true; geo.computeBoundingBox(); r.hairCount = hair.length;
  }
  geo.setAttribute('aLoose', new THREE.BufferAttribute(LO, 1)); geo.setAttribute('aHair', new THREE.BufferAttribute(HAIR, 1)); r.looseCount = cnt;
  // bind-pose da cabeça no espaço da malha (para endireitar a cabeça nas animações)
  const hi = J.findIndex(k => /Head$/.test(json.nodes[k].name)); r.headIdx = hi;
}

export function buildRigged(h, id = h.charId || 'atlas') {
  const cache = caches[id], { geo, maps, json, clips } = cache, skin = json.skins[0];
  // reconstrói a árvore de nós (cada personagem tem a sua cópia do esqueleto)
  const jset = new Set(skin.joints), objs = [];
  json.nodes.forEach((n, i) => { const o = jset.has(i) ? new THREE.Bone() : new THREE.Object3D(); o.name = n.name || ('n' + i); if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); objs[i] = o; });
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const root = objs[json.scenes[0].nodes[0]], meshNode = json.nodes.findIndex(n => n.mesh !== undefined);
  const ibm = cache.acc(skin.inverseBindMatrices), inv = skin.joints.map((_, k) => new THREE.Matrix4().fromArray(ibm, k * 16));
  const bones = skin.joints.map(j => objs[j]);
  // material PBR completo: cor + metal/rugosidade + relevo (normal)
  const mat = new THREE.MeshStandardMaterial({ map: maps.map, roughness: .78, metalness: .72, envMap: getStudioEnv(), envMapIntensity: 1.65, side: THREE.DoubleSide });
  if (maps.mr) { mat.metalnessMap = maps.mr; mat.roughnessMap = maps.mr; }
  if (maps.normalMap) { mat.normalMap = maps.normalMap; mat.normalScale.set(.72, .72); }
  if (!maps.mr) { mat.roughness = .72; mat.metalness = .28; }
  /* Cyber não traz mapa de relevo: gera um a partir da luminância da textura (placas, costuras, dobras ganham profundidade sob a luz) */
  if (id === 'cyber' && !maps.normalMap && !/[?&]nrm=0/.test(location.search)) { try { mat.normalMap = deriveNormal(maps.map, (navigator.deviceMemory || 4) >= 4 ? 1024 : 512); mat.normalScale.set(.7, .7); } catch (_) { } }
  if (id === 'cyber' && !maps.mr) { mat.roughness = .58; mat.metalness = .3; }
  const U = { uJig: { value: new THREE.Vector3() }, uSoftK: { value: 1 }, uGlow: { value: 1.6 }, uWind: { value: new THREE.Vector3() }, uT: { value: 0 }, uFlut: { value: 0 } };
  if (!geo.attributes.aSoft) { const n = geo.attributes.position.count, AS = new Float32Array(n * 2); for (let i = 0; i < n; i++) { AS[i * 2] = .8; AS[i * 2 + 1] = 0; } geo.setAttribute('aSoft', new THREE.BufferAttribute(AS, 2)); }
  if (/[?&]debugloose=1/.test(location.search)) { const L = geo.attributes.aLoose.array, C = new Float32Array(L.length * 3); for (let i = 0; i < L.length; i++) { C[i * 3] = .15 + L[i] * 2; C[i * 3 + 1] = .45 * (1 - L[i]); C[i * 3 + 2] = .6 * (1 - L[i]); } geo.setAttribute('color', new THREE.BufferAttribute(C, 3)); mat.vertexColors = true; mat.map = null; mat.metalness = 0; mat.roughness = 1; mat.metalnessMap = mat.roughnessMap = mat.normalMap = null; }
  addSoftShader(mat, U);
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = id + '-rig'; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  objs[meshNode].add(mesh);
  const wrap = new THREE.Group(); wrap.add(root); h.object.add(wrap);
  wrap.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
  // escala e apoio: altura 2.85, pés no chão, de frente para +z
  const mixer0 = new THREE.AnimationMixer(root); const a0 = mixer0.clipAction(clips.find(c => c.name === 'Idle')); a0.play(); mixer0.update(0); root.updateMatrixWorld(true); mesh.skeleton.update();
  const box = new THREE.Box3(); mesh.updateMatrixWorld(true); mesh.computeBoundingBox(); box.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld); mixer0.stopAllAction(); mixer0.uncacheRoot(root);
  const k = (h.rigHeight || 2.85) / Math.max(.01, box.max.y - box.min.y); wrap.scale.setScalar(k); wrap.position.y = -box.min.y * k;
  const mixer = new THREE.AnimationMixer(root), act = {};
  for (const c of clips) act[c.name] = mixer.clipAction(c);
  for (const o of h.object.children) if (o !== wrap && !o.isLight) o.traverse(m => { if (m.isMesh || m.isPoints || m.isLine) m.visible = false; });
  if (h.chainMeshes) h.chainMeshes.traverse(m => { m.visible = false; }); h.chainMeshes && (h.chainMeshes.visible = false);
  for (const j of Object.values(h.J)) j.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) o.visible = false; });
  const byName = n => bones.find(b => b.name === n);
  const handR = byName('mixamorigRightHand'), handL = byName('mixamorigLeftHand');
  const em = hand => { const o = new THREE.Object3D(); o.position.set(0, .12, 0); hand.add(o); return o; };
  const e = { R: em(handR), L: em(handL) };
  if (h.emitter) { for (const c of [...h.emitter.children]) e.R.add(c); h.emitter = e.R; }
  if (h.emitterL) h.emitterL = e.L;
  // cadeias de cauda/fita com mola própria (Tail_1..n, Tail2_1..n)
  const chains = {}; for (const b of bones) { const m = /^(Tail\d*|Cape\d*)_(\d+|End)$/.exec(b.name); if (m) (chains[m[1]] = chains[m[1]] || []).push(b); }
  const tails = Object.values(chains).map(c => { const a = c.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true })).map(b => ({ b, s: new THREE.Vector3(), v: new THREE.Vector3() })); a.cape = /^Cape/.test(c[0].name); a.amp = (id === 'atlas' && /^Tail/.test(c[0].name)) ? .28 : 1; return a; });   // v145: dreads do Atlas balançam bem menos que fita/capa
  // pose de descanso da cabeça (no espaço do objeto) para medir inclinação
  const head = byName('mixamorigHead'), neck = byName('mixamorigNeck');
  h.atlasRig = { id, wrap, mesh, mixer, act, cur: null, U, bones, jig: new THREE.Vector3(), jv: new THREE.Vector3(), wind: new THREE.Vector3(), prevP: new THREE.Vector3().copy(h.object.position), tails, head, neck, headFixW: 1, t: 0, hl: null };
  h.atlasRig.restQ = bones.map(b => b.quaternion.clone()); h.atlasRig.restP = bones[0].position.clone(); h.atlasRig.nW = 0;
  h.atlasSoft = { U, kick(dx, dz, F = 1) { const s = h.atlasRig; const l = Math.hypot(dx, dz) || 1; s.jv.x += dx / l * F * 3.4; s.jv.z += dz / l * F * 3.4; s.jv.y -= F * 1.1; } };
  // postura de descanso do osso da cabeça (T-pose) no espaço do objeto
  h.object.updateMatrixWorld(true); const qo = h.object.getWorldQuaternion(new THREE.Quaternion()).invert();
  h.atlasRig.headRest = head.getWorldQuaternion(new THREE.Quaternion()); h.atlasRig.neckRest = neck.getWorldQuaternion(new THREE.Quaternion()); h.atlasRig.headRestInvObj = qo;
  play(h, 'Idle', 0);
  return mesh;
}

const ALIAS = { 'Run 01': ['Run 01', 'Jog Forward', 'Run'], 'Walk': ['Walk', 'Walk Forward'], 'Melee Hook': ['Melee Hook', 'Punch Jab'], 'Melee Knee': ['Melee Knee', 'Kick'], 'Melee Uppercut': ['Melee Uppercut', 'Punch Cross'], 'Melee Combo': ['Melee Combo', 'Punch Cross'], 'Overhand Throw': ['Overhand Throw', 'Punch Cross'], 'Surprise': ['Surprise', 'Idle Shield Break', 'Idle'], 'Sprint Enter': ['Sprint Enter', 'Sprint'] };
function play(h, name, fade = .18, opt = {}) {
  const r = h.atlasRig; let a = r.act[name]; if (!a && ALIAS[name]) for (const n of ALIAS[name]) if (r.act[n]) { a = r.act[n]; break; } if (!a) return;
  if (r.cur === a && !opt.restart) { if (opt.speed) a.timeScale = opt.speed; return; }
  a.reset(); a.enabled = true; a.setLoop(opt.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = !!opt.once;
  a.timeScale = opt.speed || 1; if (opt.at) a.time = opt.at; a.setEffectiveWeight(1);
  if (r.cur) { a.crossFadeFrom(r.cur, fade, false); } else a.fadeIn(fade);
  a.play(); r.cur = a;
}
const HIT = ['Hit Chest', 'Hit Shoulder Left', 'Hit Stomach', 'Hit Shoulder Right', 'Hit Head'];
const ONCE = { punch0: ['Punch Cross', 1.15], punch1: ['Melee Hook', 1.1], punch2: ['Kick', 1.25], kick: ['Kick', 1.25], elbow: ['Melee Knee', 1.2], super: ['Melee Uppercut', 1], laser: ['Punch Cross', 1.3], flash: ['Melee Combo', 1], blitz: ['Sprint Enter', 1.2], omega: ['Overhand Throw', 1], channel: ['Surprise', 1], abyssCast: ['Overhand Throw', 1], singularity: ['Overhand Throw', 1], jump: ['Jump Start', 1.3], land: ['Jump Land', 1.6], landHard: ['Jump Land', 1.1], roll: ['Jump Land', 1.4], vault: ['Safety Vault Root Motion', 1.2], climb: ['Climb Up', 1.1], hit: null, revive: ['Hit Knockback', -1] };

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _e = new THREE.Euler(), _qo = new THREE.Quaternion();
export function stepRigged(h, dt, ac) {
  const r = h.atlasRig; if (!r || dt <= 0) return; dt = Math.min(dt, .05); r.t += dt;
  // estado do herói → animação
  const acts = h.actions, last = acts.length ? acts[acts.length - 1] : null;
  let want = null, opt = {};
  if (h.dead) { want = 'Hit Knockback'; opt = { once: true }; }
  else if (last && last.t < last.a.dur - .05 && last.name !== 'hit' && ONCE[last.key] !== undefined && ONCE[last.key]) {
    const [n, sp] = ONCE[last.key]; want = n; opt = { once: true, speed: sp, restart: r.lastRec !== last }; if (r.lastRec !== last) r.lastRec = last;
  } else if (last && last.name === 'hit' && last.t < .35) {
    if (r.lastRec !== last) { r.lastRec = last; r.hitN = ((r.hitN || 0) + 1) % HIT.length; play(h, HIT[r.hitN], .06, { once: true, restart: true, speed: 1.3 }); }
    want = null;
  } else if (h.air > .5) { want = r.cur === r.act['Jump Start'] && r.cur.time < .5 ? 'Jump Start' : 'Jump'; }
  else { const sp = h.spd; if (sp > 5.5) { want = 'Sprint'; opt = { speed: Math.min(1.5, .75 + sp / 12) }; } else if (sp > 2.6) { want = 'Run 01'; opt = { speed: .6 + sp / 8 }; } else if (sp > .5) { want = 'Walk'; opt = { speed: .5 + sp / 2.2 }; } else { want = 'Idle'; } }
  const hitActive = r.cur && /^Hit/.test(r.cur.getClip().name) && r.cur.isRunning() && r.cur.time < r.cur.getClip().duration - .05 && !h.dead;
  if (want && !hitActive) play(h, want, .16, opt);
  r.mixer.update(dt);
  r.wrap.updateMatrixWorld(true);
  const curName = r.cur ? r.cur.getClip().name : '';
  // ---- pose neutra (retrato do lobby/perfil): corpo reto, braços para baixo, sem contorção
  { const idleNow = h.neutral && r.id !== 'atlas' && want === 'Idle' && !hitActive && !h.dead; r.nW += ((idleNow ? 1 : 0) - r.nW) * Math.min(1, dt * 7);
    if (r.nW > .01) { const br = Math.sin(r.t * 1.6) * .012;
      const feet = r.bones.filter(b => /^mixamorig(Left|Right)(Foot|ToeBase)$/.test(b.name)), footY = () => feet.reduce((m, b) => Math.min(m, b.getWorldPosition(_v3).y), 1e9), fy0 = feet.length ? footY() : 0;
      r.bones.forEach((b, i) => { if (!/^mixamorig/.test(b.name)) return; const n = b.name.slice(9); if (/Arm$|Hand/.test(n) && !/^Left|^Right/.test(n)) return; if (/^(Left|Right)(Arm|ForeArm)$/.test(n)) return; _q.copy(r.restQ[i]); if (n === 'Spine1') _q.multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), br)); b.quaternion.slerp(_q, r.nW); });
      r.bones[0].updateWorldMatrix(false, true);   // o quadril fica onde a animação o colocou (o Atlas tem o quadril de repouso longe do eixo)
      h.object.updateMatrixWorld(true); const oq = h.object.getWorldQuaternion(new THREE.Quaternion());
      for (const side of ['Left', 'Right']) for (const part of ['Arm', 'ForeArm']) {
        const b = r.bones.find(x => x.name === 'mixamorig' + side + part), c = b && b.children.find(x => x.isBone); if (!c) continue;
        b.updateWorldMatrix(true, false); c.updateWorldMatrix(true, false);
        const nb = c.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
        const ob = nb.clone().applyQuaternion(oq.clone().invert()); const sx = ob.x >= 0 ? 1 : -1;
        const D = (part === 'Arm' ? new THREE.Vector3(sx * .16, -1, .04) : new THREE.Vector3(sx * .08, -1, .38)).normalize().applyQuaternion(oq);
        const cur = b.getWorldQuaternion(new THREE.Quaternion()), nw = new THREE.Quaternion().setFromUnitVectors(nb, D).multiply(cur);
        const loc = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(nw); b.quaternion.slerp(loc, r.nW); b.updateWorldMatrix(false, true); }
      r.wrap.updateMatrixWorld(true);
      if (feet.length) { const sc = r.bones[0].parent ? r.bones[0].parent.getWorldScale(_v2).y || 1 : 1; r.bones[0].position.y += (fy0 - footY()) / sc; r.bones[0].updateWorldMatrix(false, true); r.wrap.updateMatrixWorld(true); } } }
  // ---- cabeça: tira a inclinação (olhando pra baixo / torta) em relação à pose de descanso
  const want0 = (h.dead || hitActive || /Crawl|Crouch|Slide|Lay|Sit|Kip|Lift/.test(curName)) ? 0 : 1; r.headFixW += (want0 - r.headFixW) * Math.min(1, dt * 8);
  if (r.head && r.headFixW > .02 && !/[?&]headfix=0/.test(location.search)) {
    h.object.updateMatrixWorld(true); _qo.copy(h.object.getWorldQuaternion(_q3)).invert();
    const lev = (bone, rest, share, tp) => {
      bone.getWorldQuaternion(_q).premultiply(_qo);                  // osso no espaço do objeto
      _q2.copy(rest).premultiply(_qo).invert(); const d = _q.clone().multiply(_q2);
      _v.set(0, 0, 1).applyQuaternion(d); _v2.set(0, 1, 0).applyQuaternion(d);
      const pitch = Math.atan2(-_v.y, Math.hypot(_v.x, _v.z)), roll = Math.atan2(-_v2.x, _v2.y);
      const kP = Math.max(-.8, Math.min(.8, pitch - tp)) * share * r.headFixW, kR = Math.max(-.5, Math.min(.5, roll)) * share * r.headFixW;
      const corr = new THREE.Quaternion().setFromEuler(_e.set(-kP, 0, -kR)), qn = corr.multiply(_q);
      bone.parent.getWorldQuaternion(_q3).premultiply(_qo).invert(); bone.quaternion.copy(_q3.multiply(qn)); bone.updateWorldMatrix(false, true);
    };
    const HP = h.headPitch ?? -.2, NP = h.neckPitch ?? -.1;
    lev(r.neck, r.neckRest, .55, NP); lev(r.head, r.headRest, 1, HP);
  }
  // ---- vento / arrasto para roupa, fita e cabelo
  const pos = h.object.position, vx = (pos.x - r.prevP.x) / dt, vy = (pos.y - r.prevP.y) / dt, vz = (pos.z - r.prevP.z) / dt; r.prevP.copy(pos);
  const sp = Math.min(30, Math.hypot(vx, vy, vz));
  const wx = Math.max(-.6, Math.min(.6, -vx * .05)), wy = Math.max(-.5, Math.min(.5, -vy * .03)), wz = Math.max(-.6, Math.min(.6, -vz * .05));
  r.wind.x += (wx - r.wind.x) * Math.min(1, dt * 7); r.wind.y += (wy - r.wind.y) * Math.min(1, dt * 7); r.wind.z += (wz - r.wind.z) * Math.min(1, dt * 7);
  r.U.uWind.value.copy(r.wind); r.U.uT.value = r.t; r.U.uFlut.value = Math.min(1.5, sp / 8);
  // ---- caudas/fitas: molas encadeadas por cima da animação
  const K = [150, 120, 95, 75, 60], Cd = [10, 9, 8, 7, 6];
  // capa: só sobe e desce de leve (como vento vindo de baixo), sem molas nem torções
  { let ci = 0; for (const ch of r.tails) { if (!ch.cape) continue; ci++;
    _qo.copy(h.object.getWorldQuaternion(_q3)); const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(_qo);
    for (let i = 0; i < ch.length; i++) { const b = ch[i].b; b.updateWorldMatrix(true, false); b.getWorldQuaternion(_q);
      const ang = 0;   // capa sem física: só pende para baixo
      // a capa sempre pende para baixo (um pouco para trás), mesmo com o tronco inclinado/girando
      const bp = b.getWorldPosition(_v2), nb = ch[i + 1] ? ch[i + 1].b.getWorldPosition(_v3).sub(bp) : new THREE.Vector3(0, -1, 0).applyQuaternion(_q);
      if (nb.lengthSq() < 1e-10) continue; nb.normalize();
      const D = new THREE.Vector3(0, -1, -.22).applyQuaternion(_qo).normalize(); D.applyAxisAngle(ax, ang * 2);
      const to = nb.clone().lerp(D, .85).normalize();
      const nw = new THREE.Quaternion().setFromUnitVectors(nb, to).multiply(_q); b.parent.getWorldQuaternion(_q2).invert(); b.quaternion.copy(_q2.multiply(nw)); b.updateWorldMatrix(false, true); } } }
  for (const ch of r.tails) { if (ch.cape) continue; for (let i = 0; i < ch.length; i++) {
    const t = ch[i], b = t.b, kk = K[Math.min(i, 4)], cd = Cd[Math.min(i, 4)];
    const tgt = _v.set(r.wind.x * 1.4 + (-ac.x) * .006, r.wind.y * .8 + (-ac.y) * .004, r.wind.z * 1.4 + (-ac.z) * .006).multiplyScalar(.6 + i * .35);
    tgt.x += Math.sin(r.t * 2.2 + i * .9) * .05; tgt.z += Math.cos(r.t * 1.9 + i * .7) * .05; if (ch.cape) { tgt.multiplyScalar(.12); tgt.y = Math.min(0, tgt.y); }
    t.v.x += ((tgt.x - t.s.x) * kk - t.v.x * cd) * dt; t.v.y += ((tgt.y - t.s.y) * kk - t.v.y * cd) * dt; t.v.z += ((tgt.z - t.s.z) * kk - t.v.z * cd) * dt; t.s.addScaledVector(t.v, dt); t.s.clampLength(0, .9);
    const nxt = ch[i + 1] ? ch[i + 1].b : null; b.updateWorldMatrix(true, false);
    b.getWorldQuaternion(_q); const bp = b.getWorldPosition(_v2);
    const dir = nxt ? nxt.getWorldPosition(_v3).sub(bp) : new THREE.Vector3(0, -1, 0).applyQuaternion(_q); if (dir.lengthSq() < 1e-10) continue; dir.normalize();
    _qo.copy(h.object.getWorldQuaternion(_q3)); const sl = t.s.clone().applyQuaternion(_qo);
    const to = dir.clone().addScaledVector(sl, .9 * (ch.amp || 1)).normalize(); const rot = new THREE.Quaternion().setFromUnitVectors(dir, to);
    const nw = rot.multiply(_q); b.parent.getWorldQuaternion(_q2).invert(); b.quaternion.copy(_q2.multiply(nw)); b.updateWorldMatrix(false, true);
  } }
  // ---- balanço da carne
  const Kj = 190, Cj = 9.5, lim = .3, cl = x => Math.max(-lim, Math.min(lim, x));
  const tx = cl(-ac.x * .004), ty = cl(-ac.y * .0025), tz = cl(-ac.z * .004);
  r.jv.x += ((tx - r.jig.x) * Kj - r.jv.x * Cj) * dt; r.jv.y += ((ty - r.jig.y) * Kj - r.jv.y * Cj) * dt; r.jv.z += ((tz - r.jig.z) * Kj - r.jv.z * Cj) * dt;
  r.jig.addScaledVector(r.jv, dt); r.jig.clampLength(0, .55); r.U.uJig.value.copy(r.jig);
  r.U.uGlow.value = 1.5 + (h.glow || 0) * 1.6 + .25 * Math.sin((h.t || 0) * 4.4);
}
export const debugRig = id => caches[id];

/* mapa de relevo (normal) a partir da luminância: borrão leve + Sobel. Só roda uma vez por personagem, no carregamento. */
function deriveNormal(tex, size) {
  const src = tex.image, cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, size, size);
  const d = g.getImageData(0, 0, size, size).data, n = size * size, L = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = (d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11) / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let s = 0; for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) s += L[Math.min(size - 1, Math.max(0, y + k)) * size + Math.min(size - 1, Math.max(0, x + j))]; B[y * size + x] = s / 9; }
  const out = g.createImageData(size, size), o = out.data, K = 2.2, h = (x, y) => B[Math.min(size - 1, Math.max(0, y)) * size + Math.min(size - 1, Math.max(0, x))];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1)), dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
    let nx = -dx * K, ny = dy * K, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; o[i] = (nx * .5 + .5) * 255; o[i + 1] = (ny * .5 + .5) * 255; o[i + 2] = (nz * .5 + .5) * 255; o[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = 8; t.generateMipmaps = true; return t;
}
