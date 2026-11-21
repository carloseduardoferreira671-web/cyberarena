/* CyberArena · rigcore (v147) — núcleo de animação procedural dos 3 personagens novos.
   Tudo aqui é calculado a partir do ESQUELETO e da MALHA de cada GLB (medidas reais do corpo), sem nenhum clipe pré-gravado:
   · buildTree  : monta a árvore de ossos (nós com `matrix`, frente +Z, esquerda +X, altura +Y — espaço "R")
   · measure    : comprimentos de osso, alturas das zonas de golpe (cabeça/peito/barriga/canela) e profundidades da superfície do corpo
   · solver     : IK de 2 ossos (braços/pernas), coluna/pescoço/cabeça por ângulos, punho fechado
   · bake       : transforma uma função de pose em clipe amostrado (quaternions locais) que o player (fightctl) mistura em camadas
   Roda igual no navegador e no Node (testes em tools/anim_tests). */
import * as THREE from '../lib/three.module.min.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), Q = () => new THREE.Quaternion();
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/* ---------- árvore de ossos ---------- */
export function buildTree(json) {
  const jset = new Set(json.skins[0].joints), objs = [];
  json.nodes.forEach((n, i) => {
    const o = jset.has(i) ? new THREE.Bone() : new THREE.Object3D(); o.name = n.name || ('n' + i);
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else { if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); }
    objs.push(o);
  });
  json.nodes.forEach((n, i) => (n.children || []).forEach(c => objs[i].add(objs[c])));
  const root = objs[json.scenes[0].nodes[0]], meshNode = json.nodes.findIndex(n => n.mesh !== undefined);
  const bones = json.skins[0].joints.map(j => objs[j]);
  return { root, objs, bones, meshObj: objs[meshNode] };
}

const ARM = s => [s + 'Arm', s + 'ForeArm', s + 'Hand'], LEG = s => [s + 'UpLeg', s + 'Leg', s + 'Foot'];
const FING = ['Index', 'Middle', 'Ring', 'Pinky'];

export class Rig {
  /* tree = buildTree(json); mesh = { pos: Float32Array, si: Uint16Array, sw: Float32Array } (espaço da malha) */
  constructor(tree, mesh, opt = {}) {
    this.tree = tree; this.root = tree.root; this.bones = tree.bones; this.by = {}; this.idx = {};
    this.bones.forEach((b, i) => { const n = b.name.replace(/^mixamorig:?/, ''); this.by[n] = b; this.idx[n] = i; b.userData.short = n; });
    this.bind = this.bones.map(b => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    this.root.updateMatrixWorld(true);
    this.P0 = {}; this.Q0 = {};
    for (const n in this.by) { this.P0[n] = V().setFromMatrixPosition(this.by[n].matrixWorld); this.Q0[n] = this.wq(this.by[n]); }
    this.curlSign = -1; this.hips = this.by.Hips; this.hipsParent = this.hips.parent;
    this.has = n => !!this.by[n];
    if (opt.shared) { this.M = opt.shared.M; this.zdef = opt.shared.zdef; } else this.measure(mesh);
    this._t = { a: V(), b: V(), c: V(), d: V(), q: Q(), q2: Q(), m: new THREE.Matrix4() };
  }
  wq(b, out = Q()) { const m = new THREE.Matrix4(); m.extractRotation(b.matrixWorld); return out.setFromRotationMatrix(m); }
  wp(b, out = V()) { return out.setFromMatrixPosition(b.matrixWorld); }
  reset() { this.bones.forEach((b, i) => { b.position.copy(this.bind[i].p); b.quaternion.copy(this.bind[i].q); }); this.root.updateMatrixWorld(true); }

  /* ---------- medidas ---------- */
  measure(mesh) {
    const P = this.P0, d = (a, b) => P[a].distanceTo(P[b]), M = this.M = {};
    M.thigh = d('LeftUpLeg', 'LeftLeg'); M.shin = d('LeftLeg', 'LeftFoot'); M.leg = M.thigh + M.shin;
    M.uarm = d('LeftArm', 'LeftForeArm'); M.farm = d('LeftForeArm', 'LeftHand'); M.arm = M.uarm + M.farm;
    M.hand = M.arm * .28;
    M.hipY = P.Hips.y; M.ankleY = P.LeftFoot.y;
    // pé em repouso: a ponta fica ABAIXO do tornozelo (≈35–41°). Pitch 0 tem de ser esse pé assentado, não um pé horizontal (que só apoia o calcanhar)
    M.footDrop = P.LeftToeBase ? Math.atan2(P.LeftFoot.y - P.LeftToeBase.y, Math.hypot(P.LeftToeBase.x - P.LeftFoot.x, P.LeftToeBase.z - P.LeftFoot.z)) : 0; M.footLen = Math.max(.05, d('LeftFoot', 'LeftToeBase') * 1.35);
    M.shoulderY = (P.LeftArm.y + P.RightArm.y) / 2; M.shoulderHalf = Math.abs(P.LeftArm.x - P.RightArm.x) / 2;
    M.hipHalf = Math.abs(P.LeftUpLeg.x - P.RightUpLeg.x) / 2;
    M.neckY = P.Neck.y; M.spine = d('Hips', 'Spine2');
    // medidas da malha (espaço R): topo da cabeça, centro e frente/trás do corpo em cada altura
    const m4 = this.tree.meshObj ? this.tree.meshObj.matrixWorld : new THREE.Matrix4(), v = V();
    this.root.updateMatrixWorld(true);
    let top = -1e9, bot = 1e9; const n = mesh.pos.length / 3, Y = new Float32Array(n), X = new Float32Array(n), Z = new Float32Array(n);
    for (let i = 0; i < n; i++) { v.set(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]).applyMatrix4(m4); X[i] = v.x; Y[i] = v.y; Z[i] = v.z; top = Math.max(top, v.y); bot = Math.min(bot, v.y); }
    M.top = top; M.bot = bot; M.H = top - bot;
    const slab = (y, h, xw) => { let f = -1e9, b = 1e9, c = 0, cn = 0, xl = 0, xr = 0; for (let i = 0; i < n; i++) { if (Math.abs(Y[i] - y) > h || Math.abs(X[i]) > xw) continue; f = Math.max(f, Z[i]); b = Math.min(b, Z[i]); c += X[i]; cn++; xl = Math.max(xl, X[i]); xr = Math.min(xr, X[i]); } return cn ? { front: f, back: b, ymid: y, w: (xl - xr) / 2 } : { front: .08, back: -.08, ymid: y, w: .1 }; };
    const hy = (Math.max(P.Head.y, P.Neck.y) + top) / 2 - .005;
    // HEAD: altura do centro do crânio; CHEST: entre ombro e coluna; BELLY: umbigo; SHIN: canela (rasteira)
    M.zone = {
      head: { y: hy, ...slab(hy, .035, .06) },
      chest: { y: lerp(P.Spine2.y, M.shoulderY, .45), ...slab(lerp(P.Spine2.y, M.shoulderY, .45), .04, .1) },
      belly: { y: lerp(P.Hips.y, P.Spine.y, .55) + .015, ...slab(lerp(P.Hips.y, P.Spine.y, .55) + .015, .035, .09) },
      shin: { y: M.ankleY + .045, ...slab(M.ankleY + .045, .03, .12) },
    };
    M.zone.head.r = Math.max(.05, (top - Math.max(P.Head.y, P.Neck.y)) * .5);
    // âncoras: cada zona fica presa a um osso (ponto da SUPERFÍCIE FRONTAL em coords locais do osso) → segue a pose real do corpo
    const anchor = { head: 'Head', chest: 'Spine2', belly: 'Spine', shin: 'LeftLeg' };
    this.zdef = {};
    for (const z in M.zone) { const Z = M.zone[z], bn = anchor[z], pw = P[bn], qi = this.Q0[bn].clone().invert(), zx = z === 'shin' ? pw.x : 0;
      this.zdef[z] = { bone: bn, off: V(zx, Z.y, Z.front - (z === 'head' ? Z.r * .35 : 0)).sub(pw).applyQuaternion(qi), ctr: V(zx, Z.y, (Z.front + Z.back) / 2).sub(pw).applyQuaternion(qi) }; }
  }

  /* ---------- helpers de rotação (espaço mundial R) ---------- */
  setLocalFromWorldQ(b, qw) { const pq = this.wq(b.parent, this._t.q2).invert(); b.quaternion.copy(pq.multiply(qw)); }
  rotW(b, dq, upd = true) { const q = this.wq(b, this._t.q).premultiply(dq); this.setLocalFromWorldQ(b, q); if (upd) b.updateMatrixWorld(true); }
  /* gira o osso `b` para que a direção b→c aponte em `dir` (rotação mínima) */
  aim(b, c, dir) {
    const t = this._t, pb = this.wp(b, t.a), pc = this.wp(c, t.b), cur = t.c.copy(pc).sub(pb); if (cur.lengthSq() < 1e-12) return; cur.normalize();
    this.rotW(b, t.q2.setFromUnitVectors(cur, dir.clone().normalize()));
  }
  roll(b, c, ang) { const ax = this.wp(c).sub(this.wp(b)).normalize(); this.rotW(b, Q().setFromAxisAngle(ax, ang)); }
  pose2(b) { return this.wp(b, V()); }
  /* pontos de impacto vivos (espaço do mundo dos ossos): frente do corpo em cada zona */
  zonePoint(z, out = V(), center = false) { const d = this.zdef[z], b = this.by[d.bone]; return out.copy(center ? d.ctr : d.off).applyQuaternion(this.wq(b, this._t.q)).add(this.wp(b, this._t.a)); }
  zones() { const o = {}; for (const z in this.zdef) o[z] = this.zonePoint(z, V()); return o; }

  /* IK de dois ossos: raiz a, meio m, ponta e → leva a ponta até `tgt` com o cotovelo/joelho voltado para `pole` */
  ik2(a, m, e, tgt, pole, slack = .004) {
    const A = this.wp(a, V()), l1 = this.wp(m, V()).distanceTo(A), l2 = this.wp(e, V()).distanceTo(this.wp(m, V()));
    const dv = tgt.clone().sub(A); let d = dv.length(); const dir = dv.clone().normalize();
    d = clamp(d, Math.abs(l1 - l2) + 1e-4, (l1 + l2) * (1 - slack));
    const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
    const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (pp.lengthSq() < 1e-8) pp.set(0, 0, 1).addScaledVector(dir, -dir.z); pp.normalize();
    const E = A.clone().addScaledVector(dir, aa).addScaledVector(pp, h), T = A.clone().addScaledVector(dir, d);
    this.aim(a, m, E.clone().sub(A));
    this.aim(m, e, T.clone().sub(this.wp(m, V())));
    return T;
  }
}

/* ---------- pose → ossos ----------
   p = {
     hip:[x,y,z]            posição do quadril em R (unidades do modelo; altura ≈ 1)
     hipR:[yaw,pitch,roll]  rotação do quadril (rad, eixos de R: yaw +Y = vira p/ esquerda, pitch +X = inclina p/ frente, roll +Z)
     sp:[yaw,pitch,roll]    coluna (distribuída em Spine/Spine1/Spine2) · nk, hd: pescoço e cabeça
     sh:{L:[elev,prot],R:[...]}  clavículas
     hand:{L:{p:[x,y,z], pole:[x,y,z], roll, fist},R:{}}  alvo do PULSO em R
     foot:{L:{p:[x,y,z], pitch, yaw, roll, pole},R:{}}   alvo do TORNOZELO em R
   } */
const WSP = [.28, .34, .38];
const _qa = Q(), _qb = Q(), _qc = Q();
const eul = (r, out) => out.setFromAxisAngle(AY, r[0] || 0).multiply(_qb.setFromAxisAngle(AX, r[1] || 0)).multiply(_qc.setFromAxisAngle(AZ, r[2] || 0));

export function applyPose(rig, p) {
  rig.reset(); const B = rig.by, M = rig.M;
  // quadril: translada e gira
  const hipW = V(...p.hip), pw = rig.hipsParent.matrixWorld.clone().invert(), lp = hipW.clone().applyMatrix4(pw);
  rig.hips.position.copy(lp); rig.hips.updateMatrixWorld(true);
  if (p.hipR) { rig.rotW(rig.hips, eul(p.hipR, Q())); }
  // coluna
  if (p.sp) ['Spine', 'Spine1', 'Spine2'].forEach((n, i) => { if (B[n]) rig.rotW(B[n], eul([p.sp[0] * WSP[i], p.sp[1] * WSP[i], p.sp[2] * WSP[i]], Q())); });
  if (p.nk && B.Neck) rig.rotW(B.Neck, eul(p.nk, Q())); if (p.hd && B.Head) rig.rotW(B.Head, eul(p.hd, Q()));
  // clavículas: elevação (+ = sobe) e protração (+ = para frente)
  for (const s of ['Left', 'Right']) { const c = p.sh && p.sh[s[0]], b = B[s + 'Shoulder']; if (c && b) { const sx = s === 'Left' ? 1 : -1; rig.rotW(b, Q().setFromAxisAngle(AZ, -sx * (c[0] || 0)).multiply(Q().setFromAxisAngle(AY, sx * (c[1] || 0)))); } }
  // pernas (primeiro: pés no alvo)
  for (const s of ['Left', 'Right']) {
    const f = p.foot && p.foot[s[0]]; if (!f) continue; const [a, m, e] = LEG(s).map(n => B[n]);
    const sx = s === 'Left' ? 1 : -1, pole = V(...(f.pole || [sx * .25, .05, 1]));
    let fp; if (f.rel) { const hy = p.hipR ? p.hipR[0] : 0; fp = rig.wp(a, V()).add(V(f.rel[0], f.rel[1], f.rel[2]).multiplyScalar(M.leg).applyAxisAngle(AY, hy)); } else fp = V(...f.p);
    if (f.floor !== undefined) fp.y = Math.max(fp.y, M.ankleY * (f.floor === true ? 1 : f.floor));
    rig.ik2(a, m, e, fp, pole);
    // pé: aponta a ponta para a frente (yaw), com pitch (calcanhar levanta) e roll
    const toe = B[s + 'ToeBase']; if (toe) {
      const yaw = f.yaw || 0, pit = (f.pitch || 0) + (rig.M.footDrop || 0), dir = f.dir ? V(...f.dir).normalize() : V(Math.sin(yaw), -Math.sin(pit), Math.cos(yaw) * Math.cos(pit)).normalize();
      rig.aim(e, toe, dir); if (f.roll) rig.rotW(e, Q().setFromAxisAngle(dir, f.roll));
    }
  }
  // braços
  for (const s of ['Left', 'Right']) {
    const h = p.hand && p.hand[s[0]]; if (!h) continue; const [a, m, e] = ARM(s).map(n => B[n]); const sx = s === 'Left' ? 1 : -1;
    let tp;
    if (h.rel) { // alvo relativo ao ombro, no referencial do tronco: [lat(+esq), alto, frente] em comprimentos de braço
      const ty = (p.hipR ? p.hipR[0] : 0) + (p.sp ? p.sp[0] : 0), r = V(h.rel[0], h.rel[1], h.rel[2]).multiplyScalar(M.arm).applyAxisAngle(AY, ty);
      tp = rig.wp(a, V()).add(r);
    } else tp = V(...h.p);
    const pole = V(...(h.pole || [sx * .6, -1, -.5])); if (h.rel) pole.applyAxisAngle(AY, (p.hipR ? p.hipR[0] : 0) + (p.sp ? p.sp[0] : 0));
    const T = rig.ik2(a, m, e, tp, pole);
    // mão: continua a direção do antebraço (com flexão opcional) e pronação
    const mid = B[s + 'HandMiddle1'];
    if (mid) { const fd = h.hdir ? V(...h.hdir).normalize() : rig.wp(e, V()).sub(rig.wp(m, V())).normalize(); if (h.flex) fd.applyAxisAngle(V().crossVectors(fd, V(0, 1, 0)).normalize(), h.flex); rig.aim(e, mid, fd); }
    if (h.roll) rig.roll(m, e, sx * h.roll);
    if (h.fist) closeFist(rig, s, h.fist);
  }
}

/* punho: dobra falanges de cada dedo em torno do eixo lateral da mão, em direção à palma */
const CURL = [1.25, 1.55, 1.1];
export function closeFist(rig, s, k) {
  const B = rig.by, hand = B[s + 'Hand']; if (!hand) return;
  const ixb = B[s + 'HandIndex1'], pk = B[s + 'HandPinky1']; if (!ixb || !pk) return;
  const lat = rig.wp(pk, V()).sub(rig.wp(ixb, V())).normalize(), sgn = rig.curlSign || 1;
  for (const f of FING) for (let j = 1; j <= 3; j++) { const b = B[`${s}Hand${f}${j}`]; if (!b) continue; rig.rotW(b, Q().setFromAxisAngle(lat, sgn * CURL[j - 1] * k * (f === 'Pinky' ? 1.05 : 1)), true); }
  const th = [B[s + 'HandThumb1'], B[s + 'HandThumb2'], B[s + 'HandThumb3']];
  if (th[0]) { const ax = lat.clone(); th.forEach((b, j) => { if (b) rig.rotW(b, Q().setFromAxisAngle(ax, sgn * [.35, .6, .5][j] * k), true); }); }
}

/* ---------- baking ---------- */
export const FPS = 30;
export class BakedClip {
  constructor(name, dur, loop, n, nb) { this.name = name; this.dur = dur; this.loop = loop; this.n = n; this.nb = nb; this.q = new Float32Array(n * nb * 4); this.h = new Float32Array(n * 3); this.meta = {}; }
  /* amostra no tempo t → escreve nos ossos reais (peso w: 0..1, máscara opcional por osso) */
  sample(t, bones, bindHips, w = 1, mask = null, hipsBone = bones[0]) {
    const f = this.loop ? ((t / this.dur) % 1 + 1) % 1 * this.n : clamp(t / this.dur, 0, 1) * (this.n - 1), i0 = Math.floor(f) % this.n, i1 = this.loop ? (i0 + 1) % this.n : Math.min(i0 + 1, this.n - 1), a = f - Math.floor(f);
    for (let b = 0; b < this.nb; b++) {
      const mw = (mask ? mask[b] : 1) * w; if (mw <= 0) continue;
      const o0 = (i0 * this.nb + b) * 4, o1 = (i1 * this.nb + b) * 4; _qa.fromArray(this.q, o0); _qb.fromArray(this.q, o1); _qa.slerp(_qb, a);
      if (mw >= .999) bones[b].quaternion.copy(_qa); else bones[b].quaternion.slerp(_qa, mw);
    }
    const mh = (mask ? mask.hips : 1) * w;
    if (mh > 0) { const p0 = i0 * 3, p1 = i1 * 3, x = lerp(this.h[p0], this.h[p1], a), y = lerp(this.h[p0 + 1], this.h[p1 + 1], a), z = lerp(this.h[p0 + 2], this.h[p1 + 2], a); hipsBone.position.x = lerp(hipsBone.position.x, x, mh); hipsBone.position.y = lerp(hipsBone.position.y, y, mh); hipsBone.position.z = lerp(hipsBone.position.z, z, mh); }
  }
}

/* fn(t) → pose; dur em segundos; loop: último quadro == primeiro (não repete o quadro final) */
export function bake(rig, name, dur, fn, { loop = false, fps = FPS } = {}) {
  const n = loop ? Math.max(2, Math.round(dur * fps)) : Math.max(2, Math.round(dur * fps) + 1), nb = rig.bones.length, c = new BakedClip(name, dur, loop, n, nb);
  for (let i = 0; i < n; i++) {
    const t = loop ? i / n * dur : i / (n - 1) * dur; applyPose(rig, fn(t, loop ? t / dur : t / dur));
    for (let b = 0; b < nb; b++) rig.bones[b].quaternion.toArray(c.q, (i * nb + b) * 4);
    rig.hips.position.toArray(c.h, i * 3);
  }
  rig.reset(); return c;
}

/* ---------- interpolação de keyframes de pose ---------- */
const lerpArr = (a, b, t) => a.map((v, i) => lerp(v, b[i] === undefined ? v : b[i], t));
export function lerpPose(a, b, t) {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? b[k], y = b[k] ?? a[k];
    if (Array.isArray(x)) o[k] = lerpArr(x, y, t);
    else if (typeof x === 'number') o[k] = lerp(x, y, t);
    else if (x && typeof x === 'object') { o[k] = {}; for (const kk of new Set([...Object.keys(x), ...Object.keys(y || {})])) { const xx = x[kk] ?? (y || {})[kk], yy = (y || {})[kk] ?? xx; o[k][kk] = lerpPose({ v: xx }, { v: yy }, t).v; } }
    else o[k] = t < .5 ? x : y;
  }
  return o;
}
/* keys: [[t, pose, easing?]]; easing = 'smooth' (padrão), 'snap' (rápido no fim: golpes), 'lin', 'out' */
const EASE = { smooth: t => t * t * (3 - 2 * t), lin: t => t, snap: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, out: t => 1 - (1 - t) * (1 - t), back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };
export function track(keys) {
  const K = keys.slice().sort((a, b) => a[0] - b[0]);
  return t => {
    if (t <= K[0][0]) return K[0][1]; if (t >= K[K.length - 1][0]) return K[K.length - 1][1];
    let i = 0; while (K[i + 1][0] < t) i++;
    const [t0, p0] = K[i], [t1, p1, e] = K[i + 1], u = (t - t0) / (t1 - t0);
    return lerpPose(p0, p1, (EASE[e || 'smooth'])(u));
  };
}
export const mix = (a, b) => { const o = Array.isArray(a) ? a.slice() : { ...a }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) ? mix(a[k], b[k]) : b[k]; return o; };
export const ease = { smooth: sstep, out: t => 1 - (1 - t) * (1 - t), in: t => t * t };
export { THREE, V, Q };
