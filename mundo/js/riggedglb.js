/* CyberArena · riggedglb (v147) — os 3 personagens NOVOS (Nexus, Atlas, Cyber) com esqueleto próprio.
   Nada vem de clipes gravados: as animações são geradas do corpo de cada personagem (rigcore/fightlib/fightatk/fightrx)
   e tocadas por camadas (fightctl). A API continua a mesma para o resto do jogo: loadRigged / buildRigged / stepRigged. */
import * as THREE from '../lib/three.module.min.js';
import { loadGLBMesh } from './glbmesh.js';
import { addSoftShader } from './softbody.js';
import { packURL } from './packs.js';
import { buildTree, Rig } from './rigcore.js';
import { buildLib } from './fightlib.js';
import { FightCtl } from './fightctl.js';
import { FIGHT } from './fightdata.js';
export { MOVES } from './fightatk.js';

const FILES = { atlas: '../models/atlas_rig.glb', nexus: '../models/nexus_rig.glb', cyber: '../models/cyber_rig.glb' };
const caches = {}, loads = {};
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
    // mestre: um esqueleto próprio só para gerar (assar) os clipes deste personagem — as instâncias em jogo reaproveitam os clipes
    const tree = buildTree(r.json), mesh = { pos: r.geo.attributes.position.array };
    tree.root.updateMatrixWorld(true);
    r.master = new Rig(tree, mesh); r.sc = FIGHT.sc[id];
    r.lib = buildLib(r.master, { id, sc: r.sc, zones: FIGHT.zones, params: FIGHT.params[id] });
    return (caches[id] = r);
  }).catch(e => { delete loads[id]; throw e; }));
}

export function buildRigged(h, id = h.charId || 'atlas') {
  const cache = caches[id], { geo, maps, json } = cache, skin = json.skins[0];
  const tree = buildTree(json), { root, bones, meshObj } = tree;
  const ibm = cache.acc(skin.inverseBindMatrices), inv = skin.joints.map((_, k) => new THREE.Matrix4().fromArray(ibm, k * 16));
  const mat = new THREE.MeshStandardMaterial({ map: maps.map, roughness: .72, metalness: .3, envMap: getStudioEnv(), envMapIntensity: 1.25, side: THREE.DoubleSide });
  if (maps.mr) { mat.metalnessMap = maps.mr; mat.roughnessMap = maps.mr; mat.roughness = 1; mat.metalness = 1; }
  if (maps.normalMap) { mat.normalMap = maps.normalMap; mat.normalScale.set(.8, .8); }
  const U = { uJig: { value: new THREE.Vector3() }, uSoftK: { value: 0 }, uGlow: { value: 1.6 }, uWind: { value: new THREE.Vector3() }, uT: { value: 0 }, uFlut: { value: 0 } };
  const n = geo.attributes.position.count;   // corpo rígido e realista: sem balanço de "carne"
  if (!geo.attributes.aSoft) geo.setAttribute('aSoft', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!geo.attributes.aLoose) geo.setAttribute('aLoose', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!geo.attributes.aHair) geo.setAttribute('aHair', new THREE.BufferAttribute(new Float32Array(n), 1));
  addSoftShader(mat, U);
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.name = id + '-rig'; mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  meshObj.add(mesh);
  const wrap = new THREE.Group(); wrap.add(root); h.object.add(wrap); wrap.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
  // escala e apoio: cada personagem tem a SUA altura (FIGHT.H), pés no chão, de frente para +z
  const rig = new Rig(tree, null, { shared: cache.master });
  const rigHeight = h.rigHeight || FIGHT.H[id] || 2.85, k = rigHeight / Math.max(.01, rig.M.H);
  wrap.scale.setScalar(k); wrap.position.y = -rig.M.bot * k;
  for (const o of h.object.children) if (o !== wrap && !o.isLight) o.traverse(m => { if (m.isMesh || m.isPoints || m.isLine) m.visible = false; });
  if (h.chainMeshes) h.chainMeshes.traverse(m => { m.visible = false; }); h.chainMeshes && (h.chainMeshes.visible = false);
  for (const j of Object.values(h.J)) j.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) o.visible = false; });
  const handR = rig.by.RightHand, handL = rig.by.LeftHand;
  const em = hand => { const o = new THREE.Object3D(); o.position.set(0, .12, 0); hand.add(o); return o; };
  const e = { R: em(handR), L: em(handL) };
  if (h.emitter) { for (const c of [...h.emitter.children]) e.R.add(c); h.emitter = e.R; }
  if (h.emitterL) h.emitterL = e.L;
  const ctl = new FightCtl(rig, cache.lib, id, k);
  h.atlasRig = { id, wrap, mesh, U, bones, rig, ctl, jig: new THREE.Vector3(), jv: new THREE.Vector3(), wind: new THREE.Vector3(), t: 0, lastRec: null, k };
  h.atlasSoft = { U, kick() { } };   // sem balanço de carne: a reação vem das animações por região
  ctl.update(.016, { spd: 0, neutral: !!h.neutral });
  return mesh;
}

/* animações do poder/ação → clipe (corpo inteiro). hit/climb/death tratados à parte */
const ONCE = { elbow: ['Uppercut', 1], super: ['Uppercut', 1], laser: ['Cast_Fwd', 1.1], flash: ['Cast_Fwd', 1.2], omega: ['Cast_Slam', 1], abyssCast: ['Cast_Slam', 1], singularity: ['Cast_Slam', 1], solar: ['Cast_Up', 1], channel: ['Channel', 1],
  jump: ['JumpStart', 1.1], land: ['Land', 1], landHard: ['LandHard', 1], roll: ['Roll', 1.05], vault: ['Vault', 1], wave: ['Wave', 1], revive: ['GetUp_Back', 1] };
const MOVE_KEY = { punch0: 'Punch_L', punch1: 'Punch_R', punch2: 'Kick_R', kick: 'Kick_L', cpunch: 'CrouchPunch', sweep: 'Sweep' };
export const moveOf = key => MOVE_KEY[key] || null;

const _w = new THREE.Vector3();
export function stepRigged(h, dt, ac) {
  const r = h.atlasRig; if (!r || dt <= 0) return; dt = Math.min(dt, .05); r.t += dt;
  const ctl = r.ctl, acts = h.actions, last = acts.length ? acts[acts.length - 1] : null;
  // morte: cai e fica no chão; reviver: levanta
  if (h.dead && !r.wasDead) { r.wasDead = true; if (!ctl.lying) ctl.fall('back'); }
  else if (!h.dead && r.wasDead) { r.wasDead = false; ctl.getUp(); }
  // nova ação do Hero → clipe (golpes usam a variação do oponente: h.fightTarget)
  if (last && last !== r.lastRec && last.t < .1) {
    r.lastRec = last;
    const mv = MOVE_KEY[last.key];
    if (mv) { const t = h.fightTarget; ctl.strike(mv, t && t.atlasRig ? t.atlasRig.id : r.id, t); }
    else if (ONCE[last.key]) { const [n, sp] = ONCE[last.key]; ctl.once(n, sp, { hold: last.key === 'channel' }); }
  }
  if (r.lastRec && r.lastRec.name === 'channel' && !acts.includes(r.lastRec)) ctl.cancel();
  let cl = h.climbCycle || null;     // quem escala localmente tem a fase real (game.js); jogadores remotos usam um ciclo por tempo
  if (!cl && h.t < h.climbUntil) { r.cph = (r.cph || 0) + dt * .85; const s = r.wrap.scale.x; cl = { phase: r.cph, H: 1.15 / s, wall: .2, tilt: 0, over: 0 }; } else if (!h.climbUntil || h.t >= h.climbUntil) r.cph = 0;
  const wasDown = ctl.lying;
  ctl.update(dt, { spd: h.spd || 0, air: h.air > .5, vy: h.vy || 0, crouch: !!h.crouch && !h.dead, neutral: !!h.neutral, dancing: !!h.dancing, climb: cl });
  r.wrap.updateMatrixWorld(true);
}
export const debugRig = id => caches[id];
