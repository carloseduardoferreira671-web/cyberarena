/* CyberArena · soccerrig (v155) — animações de futebol por código, em CAMADA por cima do clipe que estiver tocando
   (parado, correndo…). Cada animação é uma sequência de poses (graus) nos ossos do esqueleto: chute, passe, lançamento,
   cruzamento, voleio, cabeceio, domínio, toque de condução, lateral, e as do goleiro (posição, mergulho, encaixe, soco, arremesso).
   Eixos "do personagem" (de frente para +Z): x = balançar para frente/trás (negativo = frente, joelho: positivo dobra),
   y = girar (positivo = para a esquerda), z = abrir/fechar para o lado (positivo = para a esquerda).
   O jogo chama layer.update(dt) logo depois do clipe (gancho `r.layer` em riggedglb.js). */
import * as THREE from '../lib/three.module.min.js';

const D2R = Math.PI / 180, AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const ORDER = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightShoulder', 'RightArm', 'RightForeArm', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'];
const ss = k => k * k * (3 - 2 * k);
const mir = n => n.startsWith('Right') ? 'Left' + n.slice(5) : n.startsWith('Left') ? 'Right' + n.slice(4) : n;
const mirrorPose = p => { const o = {}; for (const n in p) { const v = p[n]; o[mir(n)] = [v[0], -v[1], -v[2]]; } return o; };

/* ---------------------------------------------------------------------------------------------------------------
   Biblioteca (versão pé DIREITO; o pé esquerdo é espelhado). Cada quadro: [tempo(s), { osso: [x, y, z] }].
   ev = momentos de evento (impact = pé toca a bola, release = solta a bola da mão…)
--------------------------------------------------------------------------------------------------------------- */
const LIB = {
  shot: { dur: .66, ev: { impact: .2 }, keys: [
    [0, {}],
    [.11, { Hips: [4, -7, 0], Spine: [6, -11, 0], Spine1: [4, -6, 0], RightUpLeg: [32, 0, -3], RightLeg: [76, 0, 0], RightFoot: [18, 0, 0], LeftUpLeg: [-8, 0, 0], LeftLeg: [20, 0, 0], RightArm: [24, 0, -14], RightForeArm: [20, 0, 0], LeftArm: [-38, 0, 26], LeftForeArm: [30, 0, 0] }],
    [.2, { Hips: [8, 9, 0], Spine: [14, 11, 0], Spine1: [8, 6, 0], RightUpLeg: [-66, 0, -2], RightLeg: [8, 0, 0], RightFoot: [-26, 0, 0], LeftUpLeg: [-10, 0, 0], LeftLeg: [26, 0, 0], RightArm: [-24, 0, -34], LeftArm: [8, 0, 52], LeftForeArm: [18, 0, 0] }],
    [.34, { Hips: [12, 14, 0], Spine: [20, 14, 0], Spine1: [10, 8, 0], RightUpLeg: [-94, 0, -2], RightLeg: [22, 0, 0], RightFoot: [-14, 0, 0], LeftUpLeg: [-6, 0, 0], LeftLeg: [30, 0, 0], RightArm: [-30, 0, -40], LeftArm: [14, 0, 56] }],
    [.66, {}]] },
  pass: { dur: .5, ev: { impact: .15 }, keys: [
    [0, {}],
    [.08, { Hips: [2, -4, 0], Spine: [4, -5, 0], RightUpLeg: [24, 0, -3], RightLeg: [52, 0, 0], LeftUpLeg: [-6, 0, 0], LeftLeg: [16, 0, 0], LeftArm: [-18, 0, 32], RightArm: [10, 0, -20] }],
    [.15, { Hips: [4, 5, 0], Spine: [8, 5, 0], RightUpLeg: [-58, 0, -3], RightLeg: [16, 0, 0], RightFoot: [-8, 0, 0], LeftUpLeg: [-8, 0, 0], LeftLeg: [22, 0, 0], LeftArm: [0, 0, 42], RightArm: [-10, 0, -28] }],
    [.27, { Hips: [6, 8, 0], Spine: [10, 8, 0], RightUpLeg: [-74, 0, -3], RightLeg: [26, 0, 0], LeftLeg: [24, 0, 0], LeftArm: [4, 0, 44], RightArm: [-14, 0, -30] }],
    [.5, {}]] },
  chip: { dur: .72, ev: { impact: .24 }, keys: [   // lançamento / bola longa por cima
    [0, {}],
    [.13, { Hips: [-2, -8, 0], Spine: [-4, -12, 0], Spine1: [-2, -6, 0], RightUpLeg: [34, 0, -4], RightLeg: [76, 0, 0], RightFoot: [10, 0, 0], LeftUpLeg: [-10, 0, 0], LeftLeg: [26, 0, 0], RightArm: [30, 0, -18], LeftArm: [-44, 0, 40], LeftForeArm: [20, 0, 0] }],
    [.24, { Hips: [-4, 10, 0], Spine: [-10, 12, 0], Spine1: [-8, 6, 0], RightUpLeg: [-74, 0, -3], RightLeg: [10, 0, 0], RightFoot: [-30, 0, 0], LeftUpLeg: [-12, 0, 0], LeftLeg: [30, 0, 0], RightArm: [-20, 0, -48], LeftArm: [8, 0, 62] }],
    [.4, { Hips: [-6, 14, 0], Spine: [-16, 16, 0], Spine1: [-10, 8, 0], RightUpLeg: [-116, 0, -4], RightLeg: [30, 0, 0], RightFoot: [-10, 0, 0], LeftUpLeg: [-6, 0, 0], LeftLeg: [34, 0, 0], RightArm: [-24, 0, -54], LeftArm: [14, 0, 68] }],
    [.72, {}]] },
  cross: { dur: .74, ev: { impact: .24 }, keys: [
    [0, {}],
    [.13, { Hips: [2, -16, 0], Spine: [2, -22, 0], Spine1: [0, -12, 0], RightUpLeg: [36, 0, -4], RightLeg: [82, 0, 0], RightFoot: [14, 0, 0], LeftUpLeg: [-10, 0, 0], LeftLeg: [28, 0, 0], RightArm: [28, 0, -16], LeftArm: [-40, 0, 36] }],
    [.24, { Hips: [-2, 20, 8], Spine: [-6, 22, 0], Spine1: [-4, 12, 0], RightUpLeg: [-70, 0, -4], RightLeg: [12, 0, 0], RightFoot: [-26, 0, 0], LeftUpLeg: [-12, 0, 0], LeftLeg: [32, 0, 0], RightArm: [-18, 0, -50], LeftArm: [10, 0, 64] }],
    [.4, { Hips: [-2, 30, 8], Spine: [-8, 30, 0], Spine1: [-6, 16, 0], RightUpLeg: [-104, 0, -4], RightLeg: [28, 0, 0], LeftLeg: [34, 0, 0], RightArm: [-24, 0, -56], LeftArm: [14, 0, 70] }],
    [.74, {}]] },
  volley: { dur: .62, ev: { impact: .2 }, keys: [
    [0, {}],
    [.1, { Hips: [-4, -8, -10], Spine: [-8, -12, -8], RightUpLeg: [-30, 0, -14], RightLeg: [70, 0, 0], LeftUpLeg: [-12, 0, 0], LeftLeg: [34, 0, 0], RightArm: [10, 0, -40], LeftArm: [-10, 0, 56] }],
    [.2, { Hips: [-6, 14, -14], Spine: [-12, 16, -10], RightUpLeg: [-92, 0, -22], RightLeg: [12, 0, 0], RightFoot: [-20, 0, 0], LeftUpLeg: [-14, 0, 0], LeftLeg: [38, 0, 0], RightArm: [-10, 0, -62], LeftArm: [12, 0, 72] }],
    [.34, { Hips: [-8, 22, -10], Spine: [-14, 22, -6], RightUpLeg: [-70, 0, -20], RightLeg: [30, 0, 0], LeftLeg: [40, 0, 0], RightArm: [-8, 0, -50], LeftArm: [12, 0, 60] }],
    [.62, {}]] },
  header: { dur: .5, ev: { impact: .17 }, keys: [
    [0, {}],
    [.09, { Hips: [-6, 0, 0], Spine: [-18, 0, 0], Spine1: [-12, 0, 0], Neck: [-14, 0, 0], Head: [-10, 0, 0], RightArm: [34, 0, -30], LeftArm: [34, 0, 30], RightUpLeg: [10, 0, 0], LeftUpLeg: [10, 0, 0], RightLeg: [30, 0, 0], LeftLeg: [30, 0, 0] }],
    [.17, { Hips: [8, 0, 0], Spine: [26, 0, 0], Spine1: [18, 0, 0], Neck: [16, 0, 0], Head: [12, 0, 0], RightArm: [-30, 0, -34], LeftArm: [-30, 0, 34], RightLeg: [20, 0, 0], LeftLeg: [20, 0, 0] }],
    [.5, {}]] },
  trap: { dur: .42, ev: { }, keys: [      // domínio: recebe e amortece com o pé
    [0, {}],
    [.1, { RightUpLeg: [-34, 0, -8], RightLeg: [42, 0, 0], RightFoot: [-10, 0, 0], LeftLeg: [18, 0, 0], Spine: [8, 0, 0], LeftArm: [0, 0, 30], RightArm: [0, 0, -30] }],
    [.2, { RightUpLeg: [-18, 0, -6], RightLeg: [56, 0, 0], LeftLeg: [22, 0, 0], Spine: [10, 0, 0], LeftArm: [0, 0, 24], RightArm: [0, 0, -24] }],
    [.42, {}]] },
  touch: { dur: .26, ev: { impact: .08 }, keys: [   // toque de condução (corrida com a bola)
    [0, {}],
    [.08, { RightUpLeg: [-34, 0, -2], RightLeg: [20, 0, 0], RightFoot: [-16, 0, 0], Spine: [6, 4, 0] }],
    [.26, {}]] },
  throwin: { dur: 1.0, ev: { release: .52 }, keys: [   // lateral com as duas mãos
    [0, {}],
    [.14, { Spine: [-6, 0, 0], RightArm: [-160, 0, -14], LeftArm: [-160, 0, 14], RightForeArm: [30, 0, 0], LeftForeArm: [30, 0, 0], RightUpLeg: [6, 0, 0], LeftUpLeg: [-10, 0, 0] }],
    [.36, { Hips: [-4, 0, 0], Spine: [-26, 0, 0], Spine1: [-14, 0, 0], Head: [-8, 0, 0], RightArm: [-150, 0, -14], LeftArm: [-150, 0, 14], RightForeArm: [70, 0, 0], LeftForeArm: [70, 0, 0], RightLeg: [26, 0, 0], LeftLeg: [18, 0, 0] }],
    [.52, { Hips: [8, 0, 0], Spine: [28, 0, 0], Spine1: [14, 0, 0], RightArm: [-96, 0, -10], LeftArm: [-96, 0, 10], RightForeArm: [10, 0, 0], LeftForeArm: [10, 0, 0], LeftUpLeg: [-14, 0, 0], RightLeg: [22, 0, 0] }],
    [.68, { Spine: [22, 0, 0], RightArm: [-60, 0, -10], LeftArm: [-60, 0, 10] }],
    [1.0, {}]] },
  // ----- goleiro -----
  catch: { dur: .5, ev: {}, hold: .22, keys: [
    [0, {}],
    [.12, { Spine: [24, 0, 0], Spine1: [10, 0, 0], RightArm: [-70, 0, -10], LeftArm: [-70, 0, 10], RightForeArm: [76, 0, 0], LeftForeArm: [76, 0, 0], Hips: [8, 0, 0], RightLeg: [24, 0, 0], LeftLeg: [24, 0, 0] }],
    [.5, { Spine: [20, 0, 0], RightArm: [-52, 0, -12], LeftArm: [-52, 0, 12], RightForeArm: [86, 0, 0], LeftForeArm: [86, 0, 0] }]] },
  punch: { dur: .46, ev: { impact: .12 }, keys: [
    [0, {}],
    [.06, { Spine: [6, -14, 0], RightArm: [60, 0, -20], RightForeArm: [90, 0, 0], LeftArm: [-50, 0, 40] }],
    [.12, { Spine: [14, 18, 0], RightArm: [-110, 0, -12], RightForeArm: [8, 0, 0], LeftArm: [-20, 0, 50] }],
    [.46, {}]] },
  gkthrow: { dur: .9, ev: { release: .34 }, keys: [   // arremesso por cima do ombro
    [0, {}],
    [.2, { Hips: [0, -18, 0], Spine: [-6, -30, 0], Spine1: [-4, -14, 0], RightArm: [120, 0, -20], RightForeArm: [100, 0, 0], LeftArm: [-70, 0, 40], LeftUpLeg: [-14, 0, 0], RightLeg: [16, 0, 0] }],
    [.34, { Hips: [4, 22, 0], Spine: [14, 28, 0], Spine1: [8, 12, 0], RightArm: [-150, 0, -14], RightForeArm: [12, 0, 0], LeftArm: [-10, 0, 56], LeftLeg: [22, 0, 0] }],
    [.52, { Spine: [18, 22, 0], RightArm: [-70, 0, -16], LeftArm: [0, 0, 40] }],
    [.9, {}]] },
  getup: { dur: .7, ev: {}, keys: [
    [0, { Spine: [34, 0, 0], Spine1: [14, 0, 0], RightUpLeg: [-70, 0, 0], RightLeg: [80, 0, 0], LeftUpLeg: [-50, 0, 0], LeftLeg: [60, 0, 0], RightArm: [-30, 0, -30], LeftArm: [-30, 0, 30] }],
    [.36, { Spine: [20, 0, 0], RightUpLeg: [-36, 0, 0], RightLeg: [46, 0, 0], LeftUpLeg: [-24, 0, 0], LeftLeg: [34, 0, 0], RightArm: [-14, 0, -24], LeftArm: [-14, 0, 24] }],
    [.7, {}]] },
};
// postura de goleiro (contínua): joelhos dobrados, tronco inclinado, braços na frente
const READY = { Hips: [10, 0, 0], Spine: [12, 0, 0], Spine1: [6, 0, 0], RightUpLeg: [-34, 0, -8], LeftUpLeg: [-34, 0, 8], RightLeg: [58, 0, 0], LeftLeg: [58, 0, 0], RightFoot: [-14, 0, 0], LeftFoot: [-14, 0, 0], RightArm: [-30, 0, -30], LeftArm: [-30, 0, 30], RightForeArm: [34, 0, 0], LeftForeArm: [34, 0, 0], Head: [-8, 0, 0] };
// mergulho: braços esticados e pernas para trás (o corpo todo inclina pelo "tilt")
const DIVE = {
  mid: { Spine: [-4, 0, 0], RightArm: [-168, 0, -10], LeftArm: [-168, 0, 10], RightForeArm: [4, 0, 0], LeftForeArm: [4, 0, 0], RightUpLeg: [14, 0, -4], LeftUpLeg: [14, 0, 4], RightLeg: [30, 0, 0], LeftLeg: [30, 0, 0], Head: [-14, 0, 0] },
  low: { Spine: [6, 0, 0], RightArm: [-150, 0, -10], LeftArm: [-150, 0, 10], RightUpLeg: [20, 0, -4], LeftUpLeg: [6, 0, 4], RightLeg: [46, 0, 0], LeftLeg: [20, 0, 0], Head: [-10, 0, 0] },
  high: { Spine: [-8, 0, 0], RightArm: [-176, 0, -6], LeftArm: [-176, 0, 6], RightUpLeg: [10, 0, -6], LeftUpLeg: [16, 0, 6], RightLeg: [20, 0, 0], LeftLeg: [24, 0, 0], Head: [-20, 0, 0] },
  up: { Spine: [-8, 0, 0], RightArm: [-176, 0, -14], LeftArm: [-176, 0, 14], RightUpLeg: [-14, 0, -4], LeftUpLeg: [-14, 0, 4], RightLeg: [20, 0, 0], LeftLeg: [20, 0, 0], Head: [-16, 0, 0] },
};

export const SOCCER_ANIMS = Object.keys(LIB);
const tmpQp = new THREE.Quaternion(), tmpQw = new THREE.Quaternion(), tmpRw = new THREE.Quaternion(), tmpInv = new THREE.Quaternion(), tmpV = new THREE.Vector3();

export class SoccerLayer {
  constructor(r) {   // r = hero.atlasRig
    this.r = r; this.by = r.rig.by; this.anims = []; this.ready = 0; this.readyT = 0; this.shuffle = 0; this.shufflePh = 0; this.shuffleDir = 0;
    this.tilt = { a: 0, aT: 0, y: 0, yT: 0, k: 8, pose: null, poseW: 0, poseT: 0 }; this.onEvent = null; this.preview = null; this.base = null; this.crouchY = 0; this.lean = 0;
    this.handP = new THREE.Vector3(); r.layer = (dt) => this.update(dt);
  }
  /* ---- comandos ---- */
  play(name, o = {}) {
    const def = LIB[name]; if (!def) return null; const foot = o.foot === 'L' ? 'L' : 'R';
    const keys = foot === 'L' ? def.keys.map(([t, p]) => [t, mirrorPose(p)]) : def.keys, sc = o.scale || 1;
    const a = { name, t: 0, dur: def.dur * sc, sc, keys, ev: def.ev, fired: {}, hold: def.hold, foot };
    if (name !== 'touch') this.anims = []; else this.anims = this.anims.filter(x => x.name !== 'touch');   // um movimento por vez (o toque de condução é à parte)
    this.anims.push(a); return a;
  }
  busy(name) { return this.anims.some(a => name ? a.name === name : a.name !== 'touch'); }
  stop() { this.anims.length = 0; }
  setReady(on) { this.readyT = on ? 1 : 0; }
  setShuffle(vx, speed) { this.shuffleDir = vx; this.shuffle = Math.min(1, speed / 3.5); }
  setTilt(angleDeg, gnd = false, k = 9) { this.tilt.aT = angleDeg; this.tilt.gnd = !!gnd; this.tilt.k = k; }
  setDivePose(kind) { this.tilt.pose = DIVE[kind] || null; this.tilt.poseT = kind ? 1 : 0; if (kind) this.tilt.kind = kind; }
  setCrouch(y) { this.crouchY = y; }
  handsPos(out) { const b = this.by; const a = b.RightHand, c = b.LeftHand; a.getWorldPosition(tmpV); out.copy(tmpV); c.getWorldPosition(tmpV); out.add(tmpV).multiplyScalar(.5); return out; }
  footPos(side, out) { const b = this.by[side === 'L' ? 'LeftFoot' : 'RightFoot']; b.getWorldPosition(out); return out; }
  /* ---- avaliação ---- */
  poseAt(a) {
    const k = a.keys; let t = a.t / a.sc; if (a.hold && t > k[k.length - 1][0]) t = k[k.length - 1][0];
    let i = 0; while (i < k.length - 2 && t > k[i + 1][0]) i++; const [t0, p0] = k[i], [t1, p1] = k[Math.min(i + 1, k.length - 1)], u = t1 > t0 ? ss(Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))) : 1, out = {};
    for (const n in p0) { const v = p0[n], w = p1[n] || [0, 0, 0]; out[n] = [v[0] + (w[0] - v[0]) * u, v[1] + (w[1] - v[1]) * u, v[2] + (w[2] - v[2]) * u]; }
    for (const n in p1) if (!out[n]) { const w = p1[n]; out[n] = [w[0] * u, w[1] * u, w[2] * u]; }
    return out;
  }
  rot(bone, ax, deg) {
    if (Math.abs(deg) < .01) return; const r = this.r; r.wrap.getWorldQuaternion(tmpQw).invert(); bone.parent.getWorldQuaternion(tmpQp).premultiply(tmpQw);
    tmpRw.setFromAxisAngle(AX[ax], deg * D2R); tmpInv.copy(tmpQp).invert(); bone.quaternion.premultiply(tmpQp).premultiply(tmpRw).premultiply(tmpInv);
  }
  update(dt) {
    const r = this.r; if (!this.base) this.base = r.wrap.position.clone();
    // 1) limpa o desvio do quadro anterior e propaga a pose do clipe
    r.wrap.rotation.set(0, 0, 0); r.wrap.position.copy(this.base); r.wrap.updateMatrixWorld(true);
    // 2) avança as animações e dispara eventos
    const acc = {}, add = (p, w) => { for (const n in p) { const v = p[n], o = acc[n] || (acc[n] = [0, 0, 0]); o[0] += v[0] * w; o[1] += v[1] * w; o[2] += v[2] * w; } };
    if (this.preview) { const pv = this.preview; if (!pv.anim) pv.anim = this.play(pv.name, { foot: pv.foot, exclusive: true }); pv.anim.t = pv.t; }
    for (const a of this.anims) {
      if (!this.preview) { a.t += dt; for (const e in a.ev) if (!a.fired[e] && a.t / a.sc >= a.ev[e]) { a.fired[e] = 1; this.onEvent && this.onEvent(e, a); } }
      add(this.poseAt(a), 1);
    }
    if (!this.preview) this.anims = this.anims.filter(a => a.t < a.dur);
    // 3) posturas contínuas: goleiro pronto, pose de mergulho, balanço lateral
    this.ready += (this.readyT - this.ready) * Math.min(1, dt * 8); if (this.ready > .01) add(READY, this.ready * (1 - Math.min(1, this.tilt.poseW)));
    const T = this.tilt; T.poseW += (T.poseT - T.poseW) * Math.min(1, dt * 14); if (T.pose && T.poseW > .01) add(T.pose, T.poseW);
    if (this.shuffle > .02 && this.ready > .3) {   // passinhos laterais
      this.shufflePh += dt * (5 + this.shuffle * 3) * this.shuffleDir; const s = Math.sin(this.shufflePh * 2), w = this.shuffle * this.ready;
      add({ RightUpLeg: [-6 * (s > 0 ? s : 0), 0, -9 * s], LeftUpLeg: [-6 * (s < 0 ? -s : 0), 0, -9 * s], RightLeg: [10 * (s > 0 ? s : 0), 0, 0], LeftLeg: [10 * (s < 0 ? -s : 0), 0, 0], Hips: [0, 0, 3 * s] }, w);
    }
    // 4) aplica em ordem pai → filho
    for (const n of ORDER) { const v = acc[n]; if (!v) continue; const b = this.by[n]; if (!b) continue; this.rot(b, 'y', v[1]); this.rot(b, 'z', v[2]); this.rot(b, 'x', v[0]); b.updateMatrixWorld(true); }
    // 5) inclinação do corpo (mergulho) e abaixar do quadril
    T.a += (T.aT - T.a) * Math.min(1, dt * T.k);
    const crouch = this.ready * (.30 * (1 - Math.min(1, T.poseW))) + this.crouchY, H = (r.rig.M.H || 1) * r.k * .5;
    T.yT = T.gnd ? (H - crouch) * Math.cos(Math.abs(T.a) * D2R) + .34 - (H - crouch) : 0; T.y += (T.yT - T.y) * Math.min(1, dt * T.k);
    r.wrap.position.y = this.base.y - crouch + T.y;
    if (Math.abs(T.a) > .1) { const th = T.a * D2R, c = Math.cos(th), s = Math.sin(th), Py = H - crouch; r.wrap.rotation.z = th; r.wrap.position.x = this.base.x + Py * s; r.wrap.position.y = this.base.y - crouch + T.y + Py * (1 - c); }
  }
}
