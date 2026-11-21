/* CyberArena · fightctl (v147) — player de animação em camadas de um personagem.
   Camadas (de baixo p/ cima): LOCOMOÇÃO (mistura andar/correr/sprint/agachado/ar) → AÇÃO (golpe/poder/pulo, corpo inteiro)
   → REAÇÃO (parcial: só os ossos da região atingida) → QUEDA/LEVANTAR (corpo inteiro, segura no chão) → ESCALADA (ao vivo)
   e, por cima de tudo, IK de CONTATO: no instante do impacto o punho/pé é puxado até o ponto REAL do corpo do oponente. */
import { THREE, V, Q, applyPose, clamp, lerp, sstep } from './rigcore.js';
import { climbPose, climbOverPose } from './fightlib.js';
import { MOVES } from './fightatk.js';
import { maskFor } from './fightrx.js';

const ss = sstep, _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class FightCtl {
  constructor(rig, P, id, scale) {
    this.rig = rig; this.P = P; this.clips = P.clips; this.id = id; this.s = scale;   // s = escala mundo/modelo
    this.nb = rig.bones.length; this.t = 0;
    this.w = { Idle: 1 }; this.ph = {}; this.u = 0;   // pesos suavizados da locomoção, fases
    this.act = null; this.rx = []; this.down = null; this.climb = null; this.climbW = 0;
    this.masks = {}; this.hipsBind = rig.hips.position.clone();
    this.pend = null; this.last = null; this.crouched = false; this.lastCrouch = false; this.pre = new Float32Array(this.nb * 4);
    this.contact = null;
  }
  mask(g) { return this.masks[g] || (this.masks[g] = maskFor(this.rig, g)); }
  clip(n) { return this.clips[n]; }
  get busyDown() { return !!this.down; }
  get lying() { return !!(this.down && this.down.phase !== 'up'); }

  /* ---------- API usada pelo Hero/jogo ---------- */
  /* golpe: name = 'Punch_L'..., vs = id do oponente (escolhe a variação), target = Hero do oponente (IK de contato) */
  strike(name, vs, target) {
    const c = this.clips[`${name}@${vs}`] || this.clips[`${name}@${this.id}`] || Object.values(this.clips).find(k => k.meta && k.meta.move === name); if (!c) return false;
    this.act = { c, t: 0, sp: 1, fi: .06, fo: .16, hold: false, strike: c.meta, target, once: true }; this.rx.length = 0; return true;
  }
  once(name, sp = 1, opt = {}) { const c = this.clips[name]; if (!c) return false; this.act = { c, t: 0, sp, fi: opt.fi ?? .08, fo: opt.fo ?? .15, hold: !!opt.hold, once: true, strike: null }; return true; }
  cancel() { this.act = null; }
  /* reação localizada: zone = head|chest|belly ; strength 0..1 ; resist = aguentou */
  react(zone, o = {}) {
    if (this.down) return;
    const nm = (o.resist ? 'Resist_' : 'Hit_') + ({ head: 'Head', chest: 'Chest', belly: 'Belly' }[zone] || 'Chest'), c = this.clips[nm]; if (!c) return;
    this.act = this.act && this.act.strike ? null : this.act;   // golpe em andamento é interrompido
    const g = c.meta.group; this.rx = this.rx.filter(r => r.c.meta.group !== g);
    this.rx.push({ c, t: 0, sp: o.sp || 1, mask: this.mask(g), fi: .03, fo: .22 });
  }
  /* queda: kind = 'sweep' | 'head' | 'back' */
  fall(kind) {
    const nm = { sweep: 'Fall_Sweep', head: 'KO_Head', back: 'Fall_Back' }[kind] || 'Fall_Back', c = this.clips[nm]; if (!c) return;
    this.down = { c, t: 0, phase: 'fall', kind, pose: c.meta.pose }; this.act = null; this.rx.length = 0;
  }
  getUp() { if (!this.down || this.down.phase === 'up') return; const c = this.clips[this.down.pose === 'prone' ? 'GetUp_Prone' : 'GetUp_Back']; this.down = { c, t: 0, phase: 'up', pose: this.down.pose }; }
  dodge(k) { return this.once({ l: 'Dodge_L', r: 'Dodge_R', b: 'Dodge_B', d: 'Duck' }[k] || 'Dodge_B', 1, { fi: .05, fo: .15 }); }
  /* pontos de impacto reais (mundo) do corpo atual */
  zoneWorld(z, out = new THREE.Vector3()) { (this.rig.root.parent || this.rig.root).updateWorldMatrix(true, true); return this.rig.zonePoint(z, out); }

  /* ---------- quadro ---------- */
  update(dt, st) {
    const rig = this.rig, bones = rig.bones, hb = rig.hips; this.t += dt;
    /* 1) LOCOMOÇÃO */
    const sp = st.spd || 0, tw = {};
    if (st.air) { const k = clamp((st.vy ?? 0) < -2 ? 1 : 0, 0, 1); tw.JumpAir = 1 - k; tw.Fall = k; }
    else if (st.crouch) { if (sp > .4) tw.CrouchWalk = 1; else tw.CrouchIdle = 1; }
    else if (st.neutral) tw.IdleRelax = 1;
    else if (sp > 8.4) { tw.Sprint = 1; }
    else if (sp > 6.0) { const k = clamp((sp - 6.0) / 2.4, 0, 1); tw.Run = 1 - k; tw.Sprint = k; }
    else if (sp > 3.0) { const k = clamp((sp - 3.0) / 3.0, 0, 1); tw.Walk = 1 - k; tw.Run = k; }
    else if (sp > .4) { const k = clamp((sp - .4) / 2.6, 0, 1); tw.Idle = 1 - k; tw.Walk = k; }
    else tw.Idle = 1;
    for (const n of new Set([...Object.keys(this.w), ...Object.keys(tw)])) { const c = this.w[n] || 0, t = tw[n] || 0; this.w[n] = c + (t - c) * Math.min(1, dt * 11); if (this.w[n] < .004 && !t) delete this.w[n]; }
    // fase compartilhada entre marchas (pés sincronizados) — velocidade de ciclo ∝ velocidade real / velocidade de projeto
    const gaitN = ['Walk', 'Run', 'Sprint', 'CrouchWalk'].filter(n => this.w[n]); let cyc = 0, ws = 0;
    for (const n of gaitN) { const c = this.clips[n]; cyc += this.w[n] * (sp / (c.meta.gameV || 5)) / c.dur; ws += this.w[n]; }
    if (ws) this.u = (this.u + dt * cyc / ws) % 1;
    let acc = 0; const names = Object.keys(this.w).sort((a, b) => this.w[b] - this.w[a]);
    const tot = names.reduce((s, n) => s + this.w[n], 0) || 1;
    for (const n of names) {
      const c = this.clips[n]; if (!c) continue; const g = ['Walk', 'Run', 'Sprint', 'CrouchWalk'].includes(n);
      if (!g) { this.ph[n] = ((this.ph[n] || 0) + dt) % c.dur; }
      const tt = g ? this.u * c.dur : this.ph[n], wn = this.w[n] / tot; acc += wn;
      c.sample(tt, bones, null, acc >= .999 || names[0] === n ? 1 : wn / acc, null, hb);
    }
    this._moveFeel(st, dt);

    /* 2) AÇÃO (corpo inteiro) */
    const A = this.act;
    if (A) { A.t += dt * A.sp; const c = A.c, w = Math.min(ss(A.t / A.fi), A.hold ? 1 : ss((c.dur - A.t) / A.fo)); if (A.t >= c.dur && !A.hold) this.act = null; else { c.sample(Math.min(A.t, c.dur), bones, null, w, null, hb); } }
    /* 3) REAÇÕES parciais */
    for (const r of this.rx) { r.t += dt * r.sp; const c = r.c, w = Math.min(ss(r.t / r.fi), ss((c.dur - r.t) / r.fo)); c.sample(Math.min(r.t, c.dur), bones, null, w, r.mask, hb); }
    this.rx = this.rx.filter(r => r.t < r.c.dur);
    /* 4) QUEDA / LEVANTAR */
    const D = this.down;
    if (D) { D.t += dt; const c = D.c, w = D.phase === 'up' ? Math.min(1, ss(D.t / .05)) * ss((c.dur - D.t) / .2) : Math.min(1, ss(D.t / .04)); c.sample(Math.min(D.t, c.dur), bones, null, D.phase === 'up' ? w : 1, null, hb); if (D.phase === 'up' && D.t >= c.dur) { this.down = null; } if (D.phase === 'fall' && D.t >= c.dur) D.phase = 'lie'; }
    /* 5) ESCALADA ao vivo */
    const cl = st.climb; this.climbW += ((cl ? 1 : 0) - this.climbW) * Math.min(1, dt * 14);
    if (this.climbW > .01 && cl) {
      for (let i = 0; i < this.nb; i++) bones[i].quaternion.toArray(this.pre, i * 4); const hp0 = hb.position.clone();
      applyPose(rig, cl.over != null && cl.over > 0 ? climbOverPose(this.P, cl.over, cl.wall) : climbPose(this.P, cl.phase, cl.H, cl.wall, cl.tilt || 0));
      const w = this.climbW; for (let i = 0; i < this.nb; i++) { _q.fromArray(this.pre, i * 4); bones[i].quaternion.slerp(_q, 1 - w); } hb.position.lerp(hp0, 1 - w);
    }
    /* 6) IK de contato no impacto */
    rig.root.updateMatrixWorld(true);
    if (A && A.strike && this.act === A) this._contact(A);
  }
  /* inclinação sutil do tronco nas curvas/freadas */
  _moveFeel(st, dt) { }

  _contact(A) {
    const m = A.strike, T0 = A.target; if (!T0 || !T0.atlasRig || !T0.atlasRig.ctl) return;
    const k = (A.t - m.imp) / .1, w = k < -1 ? 0 : k < 0 ? ss(1 + k) : ss(1 - k * .8);   // sobe até o impacto, solta logo depois
    if (w <= .01) return;
    const rig = this.rig, s = this.s, B = rig.by, tgt = T0.atlasRig.ctl.zoneWorld(m.zone, _v), mv = MOVES[m.move];
    const Tw = tgt.clone();
    if (m.limb[0] === 'h') {
      const side = m.limb === 'handL' ? 'Left' : 'Right', a = B[side + 'Arm'], f = B[side + 'ForeArm'], h = B[side + 'Hand'], mid = B[side + 'HandMiddle1'];
      const sh = rig.wp(a, _v2).clone(), dir = Tw.clone().sub(sh), dist = dir.length(); dir.normalize();
      const reach = (rig.M.arm + rig.M.hand) * s; if (dist > reach * 1.25) return;     // longe demais: deixa o golpe passar (errou)
      const wrist = Tw.clone().addScaledVector(dir, -rig.M.hand * s), cur = rig.wp(h, _v3).clone(), tgtW = cur.lerp(wrist, w);
      rig.ik2(a, f, h, tgtW, V(...(side === 'Left' ? [.7, -1, -.1] : [-.7, -1, -.1])).applyQuaternion(this._yawQ()));
      if (mid) rig.aim(h, mid, dir);
    } else {
      const side = m.limb === 'footL' ? 'Left' : 'Right', a = B[side + 'UpLeg'], kn = B[side + 'Leg'], fo = B[side + 'Foot'], rq = rig.wq(rig.root, new THREE.Quaternion());
      const off = V(...(m.contact || [0, 0, 0])).multiplyScalar(s).applyQuaternion(rq), ankle = Tw.clone().sub(off), cur = rig.wp(fo, _v3).clone(); if (cur.distanceTo(ankle) > .9 * s) return;
      rig.ik2(a, kn, fo, cur.lerp(ankle, w), V(0, .6, 1).applyQuaternion(rq));
    }
  }
  _yawQ() { return this.rig.wq(this.rig.root, new THREE.Quaternion()); }
}
