/* CyberArena · riggedglb (v154) — os 3 personagens (Nexus, Atlas, Cyber) com esqueleto e ANIMAÇÕES GRAVADAS dentro do próprio arquivo.
   O corpo é tocado por clipctl.js (mistura de clipes). A API continua a mesma para o resto do jogo: loadRigged / buildRigged / stepRigged. */
import * as THREE from '../lib/three.module.min.js';
import { loadGLBMesh } from './glbmesh.js';
import { addSoftShader } from './softbody.js';
import { packURL } from './packs.js';
import { buildTree } from './rigcore.js';
import { ClipCtl, buildClips } from './clipctl.js';
import { FIGHT, ANIM } from './fightdata.js';
import { makeProps } from './props.js';
export { MOVES } from './moves.js';

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
    r.clips = buildClips(r.json, r.acc); r.meta = ANIM[id] || {};
    const p = r.geo.attributes.position.array; let lo = 1e9, hi = -1e9; for (let i = 1; i < p.length; i += 3) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; }
    r.M = { H: Math.max(.01, hi - lo), bot: lo };
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
  const by = {}; bones.forEach(b => { by[b.name.replace(/^mixamorig:?/, '')] = b; }); const rig = { by, M: cache.M, bones };
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
  const ctl = new ClipCtl(root, cache.clips, id, k, cache.meta);
  const props = makeProps(THREE, by, id, k, wrap);
  h.atlasRig = { id, wrap, mesh, U, bones, rig, ctl, props, jig: new THREE.Vector3(), jv: new THREE.Vector3(), wind: new THREE.Vector3(), t: 0, lastRec: null, k };
  h.atlasSoft = { U, kick() { } };   // sem balanço de carne: a reação vem das animações por região
  ctl.update(.016, { spd: 0, neutral: !!h.neutral });
  return mesh;
}

/* ação do Hero → semântica do clipe (clipctl.js escolhe o clipe que o personagem realmente tem) */
const ONCE = { elbow: 'Uppercut', super: 'Super', laser: 'Cast_Fwd', flash: 'Flash', omega: 'Omega', abyssCast: 'Cast_Slam', singularity: 'Cast_Slam', solar: 'Cast_Up', channel: 'Channel', blitz: 'Dash', chain: 'Chain',
  jump: 'JumpStart', djump: 'DoubleJump', land: 'Land', landHard: 'LandHard', roll: 'Roll', flip: 'Flip', vault: 'Vault', wave: 'Wave', revive: 'GetUp_Back', pickup: 'PickUp', plant: 'Plant' };
const HOLD = { channel: 1, solar: 1, orbPose: 1 };
const MOVE_KEY = { punch0: 'Punch_L', punch1: 'Punch_R', punch2: 'Kick_R', kick: 'Kick_L', cpunch: 'CrouchPunch', sweep: 'Sweep' };
export const moveOf = key => MOVE_KEY[key] || null;

export function stepRigged(h, dt, ac) {
  const r = h.atlasRig; if (!r || dt <= 0) return; dt = Math.min(dt, .05); r.t += dt;
  const ctl = r.ctl, acts = h.actions, last = acts.length ? acts[acts.length - 1] : null;
  // morte: cai e fica no chão; reviver: levanta
  if (h.dead && !r.wasDead) { r.wasDead = true; if (!ctl.lying) ctl.fall('back'); }
  else if (!h.dead && r.wasDead) { r.wasDead = false; ctl.getUp(); }
  // nova ação do Hero → clipe
  if (last && last !== r.lastRec && last.t < .1) {
    r.lastRec = last; r.holdRec = null;
    const mv = MOVE_KEY[last.key];
    if (mv) { const t = h.fightTarget; ctl.strike(mv, t && t.atlasRig ? t.atlasRig.id : r.id, t, last.key); r.props && r.props.show(null); }
    else if (last.name && last.name.startsWith('emote_')) { r.emoting = last; }
    else if (last.key === 'slide') { ctl.doSlide(last.a.dur || .9); }
    else if (ONCE[last.key]) {
      const m = ONCE[last.key], dur = last.a.dur, hold = !!HOLD[last.key];
      const ev = ctl.once(m); if (ev && dur > .05 && !hold && !ev.loop) { const want = Math.max(.35, dur); const sp = clamp01(ev.end / want, .7, 2.2); ev.ts = sp * Math.sign(ev.ts || 1); }
      if (hold || (ev && (ev.loop || ev.hold))) r.holdRec = last;
      r.props && r.props.forAction(last.key);
    }
  }
  if (r.holdRec && !acts.includes(r.holdRec)) { ctl.cancel(); r.holdRec = null; }
  let cl = h.climbCycle || null;     // quem escala localmente tem a fase real (game.js); jogadores remotos usam um ciclo por tempo
  if (!cl && h.t < h.climbUntil) { r.cph = (r.cph || 0) + dt * .85; const s = r.wrap.scale.x; cl = { phase: r.cph, H: 1.15 / s, wall: .2, tilt: 0, over: 0 }; } else if (!h.climbUntil || h.t >= h.climbUntil) r.cph = 0;
  const yw = h.object.rotation.y; let dy = yw - (r.lastYaw ?? yw); dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.lastYaw = yw; r.yr = (r.yr || 0) + (dy / dt - (r.yr || 0)) * Math.min(1, dt * 10);
  ctl.update(dt, { yr: r.yr, spd: r.forceSpd != null ? r.forceSpd : (h.spd || 0), air: h.air > .5, vy: h.vy || 0, crouch: !!h.crouch && !h.dead, neutral: !!h.neutral, dancing: !!h.dancing, climb: cl, lv: h.lv, water: h.water || 0 });
  r.props && r.props.update(dt, ctl);
  if (r.layer) r.layer(dt, r);   // camada procedural por cima do clipe (futebol: chute, passe, goleiro…)
  r.wrap.updateMatrixWorld(true);
}
const clamp01 = (x, a, b) => Math.max(a, Math.min(b, x));
export const debugRig = id => caches[id];
