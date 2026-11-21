/* CyberArena · fightlib (v147) — biblioteca de animações procedurais (100% nova).
   buildLib(rig, ctx) devolve { clips:{nome→BakedClip}, live:{...} } para UM personagem, usando as medidas reais do corpo dele.
   ctx = { id, sc (unid. de jogo por unid. do modelo), others:{id→{M,sc}} }  → os golpes são gerados 1x por oponente (3 variações). */
import { buildAttacks } from './fightatk.js';
import { buildReactions } from './fightrx.js';
import { bake, track, lerp, clamp, sstep, applyPose, V, Q, THREE, mix, ease } from './rigcore.js';

export const PI = Math.PI, TAU = Math.PI * 2;
const S = Math.sin, C = Math.cos;
export { mix };

export function makePoses(rig) {
  const M = rig.M, ay = M.ankleY, hy = M.hipY, hh = M.hipHalf * .9;
  /* ---------- poses-base ---------- */
  // guarda de luta (ortodoxa: esquerda à frente). hand.rel = [lateral(+esq), altura, frente] em comprimentos de braço, relativo ao ombro
  const guard = (o = {}) => mix({
    hip: [0, hy - .075, 0], hipR: [-.5, 0, 0], sp: [.1, .06, 0], nk: [0, .22, 0], hd: [.08, .12, 0],
    hand: { L: { rel: [-.12, .1, .62], pole: [.5, -1, -.1], fist: 1 }, R: { rel: [-.38, .04, .52], pole: [-.5, -1, -.1], fist: 1 } },
    foot: { L: { p: [hh + .0, ay, .12], pitch: 0 }, R: { p: [-hh - .045, ay, -.14], yaw: -.35 } },
  }, o);
  // em pé relaxado (lobby/emotes)
  const relax = (o = {}) => mix({
    hip: [0, hy - .012, 0], hipR: [0, 0, 0], sp: [0, .02, 0], nk: [0, 0, 0], hd: [0, 0, 0],
    hand: { L: { rel: [.2, -.88, .12], pole: [.6, -.3, -1], fist: .35 }, R: { rel: [.2, -.88, .12], pole: [-.6, -.3, -1], fist: .35 } },
    foot: { L: { p: [hh, ay, 0] }, R: { p: [-hh, ay, 0] } },
  }, o);

  const crouchBase = (o = {}) => guard(mix({ hip: [0, hy - .205, .0], hipR: [-.45, .12, 0], sp: [.1, .22, 0], nk: [0, .1, 0], hd: [.0, 0, 0], foot: { L: { p: [hh + .02, ay, .15] }, R: { p: [-hh - .06, ay, -.14], yaw: -.35 } },
    hand: { L: { rel: [-.1, .02, .6] }, R: { rel: [-.36, -.04, .5] } } }, o));
  return { guard, relax, crouch: crouchBase };
}

/* zonas de impacto do corpo na GUARDA (espaço do modelo, de frente para +Z) — usadas para gerar os golpes contra cada oponente */
export function zonesInGuard(rig, sc) { const g = makePoses(rig).guard(); applyPose(rig, g); const z = rig.zones(), o = { sc }; for (const k in z) o[k] = z[k].toArray(); rig.reset(); return o; }

export function buildLib(rig, ctx) {
  const M = rig.M, ay = M.ankleY, hy = M.hipY, L = M.leg, A = M.arm, hh = M.hipHalf * .9, sc = ctx.sc;
  const P = { M, ay, hy, L, A, hh };
  const clips = {}, add = (name, dur, fn, o) => { clips[name] = bake(rig, name, dur, fn, o); return clips[name]; };

  const { guard, relax, crouch: crouchBase } = makePoses(rig);
  P.guard = guard; P.relax = relax;

  /* ---------- parados ---------- */
  add('Idle', 1.9, (t, u) => { const b = S(u * TAU), b2 = S(u * TAU * 2);
    return guard({ hip: [.006 * S(u * TAU), hy - .075 - .006 * b2 * b2 - .004, 0], sp: [.1 + .012 * b, .06, .01 * S(u * TAU)], hd: [.08 - .01 * b, .12 + .02 * S(u * TAU), 0],
      hand: { L: { rel: [-.12, .1 + .015 * b2, .62 + .02 * b] }, R: { rel: [-.38, .04 - .012 * b2, .52] } }, foot: { L: { pitch: .02 * b }, R: {} } }); }, { loop: true });
  add('IdleRelax', 3.2, (t, u) => { const b = S(u * TAU); return relax({ hip: [.004 * S(u * TAU), hy - .012 - .004 * b * b, 0], sp: [.0, .02 + .008 * b, 0], hd: [-.02 * b, 0, 0] }); }, { loop: true });

  /* ---------- marchas parametrizadas ---------- */
  const gait = o => {
    const { T, step, lift, duty, drop, bounce, bsign = 1, lean, arm, yaw = .1, roll = .03, split = .02, toe = .5, spine = .15, kneeOut = .25 } = o;
    const footAt = (f, side) => {
      let z, y, pit;
      if (f < duty) { const s = f / duty; z = step / 2 * (1 - 2 * s); y = 0; pit = lerp(-.22, .0, ease.out(Math.min(1, s * 3))); if (s > .55) pit = lerp(0, toe, ease.smooth((s - .55) / .45)); }
      else { const s = (f - duty) / (1 - duty); z = -step / 2 + step * (s < .5 ? .5 * Math.pow(2 * s, 1.35) : 1 - .5 * Math.pow(2 - 2 * s, 1.35)); y = lift * Math.pow(S(PI * Math.min(1, s * 1.05)), .9); pit = lerp(toe, -.3, ease.smooth(Math.min(1, s * 1.25))); }
      const x = side * (hh - split * C(2 * PI * ((f + .25) % 1)) * (lift > .08 ? 1 : .3));
      return { p: [x, ay + y + M.footLen * .6 * S(Math.max(0, pit)) * (f < duty ? 1 : 0), z], pitch: pit, yaw: side > 0 ? .06 : -.06, pole: [side * kneeOut, .1, 1] };
    };
    return (t, u) => {
      const fL = u % 1, fR = (u + .5) % 1, ph = u * TAU, sw = S(ph);
      const hipY = hy - drop + bsign * bounce * C(4 * PI * u + (bsign > 0 ? PI : 0) * 0);
      const aL = { rel: [arm.lat, arm.up + arm.lift * Math.max(0, -sw), arm.fwd * -sw + arm.off], pole: [.5, -.6, -1], fist: arm.fist }, aR = { rel: [-arm.lat, arm.up + arm.lift * Math.max(0, sw), arm.fwd * sw + arm.off], pole: [-.5, -.6, -1], fist: arm.fist };
      return { hip: [-roll * .3 * sw, hipY, 0], hipR: [yaw * sw, lean * .5, roll * -sw], sp: [-yaw * sw * 1.9, lean + spine * 0, roll * sw * .8], nk: [yaw * sw * .8, .0, 0], hd: [.0, yaw * sw * .0, 0],
        hand: { L: aL, R: aR }, foot: { L: footAt(fL, 1), R: footAt(fR, -1) } };
    };
  };
  const spdG = { walk: 3.4, run: 7.2, sprint: 11.5 }; // velocidades de projeto (unid. de jogo/s)
  const mk = (name, T, o, v) => { const v0 = v / sc, step = v0 * o.duty * T; add(name, T, gait({ T, step, ...o }), { loop: true }); clips[name].meta = { v0, gameV: v, step }; };
  mk('Walk', .78, { duty: .62, lift: .055, drop: .035, bounce: .012, bsign: -1, lean: .05, yaw: .12, roll: .03, arm: { lat: .16, up: -.86, fwd: .38, lift: .1, off: .06, fist: .3 } }, spdG.walk);
  mk('Run', .6, { duty: .4, lift: .17, drop: .085, bounce: .02, bsign: 1, lean: .2, yaw: .2, roll: .04, split: .03, toe: .75, arm: { lat: .02, up: -.28, fwd: .55, lift: .22, off: .02, fist: 1 } }, spdG.run);
  mk('Sprint', .5, { duty: .33, lift: .24, drop: .11, bounce: .026, bsign: 1, lean: .34, yaw: .26, roll: .05, split: .035, toe: .9, arm: { lat: .0, up: -.22, fwd: .7, lift: .3, off: .0, fist: 1 } }, spdG.sprint);
  // agachado
  P.crouch = crouchBase;
  add('CrouchIdle', 1.8, (t, u) => { const b = S(u * TAU); return crouchBase({ hip: [0, hy - .205 + .004 * b, 0], sp: [.1, .22 + .01 * b, 0] }); }, { loop: true });
  add('CrouchDown', .26, track([[0, guard()], [.26, crouchBase(), 'out']]));
  add('CrouchUp', .28, track([[0, crouchBase()], [.28, guard(), 'smooth']]));
  { const g = gait({ T: .85, step: (1.6 / sc) * .62 * .85, lift: .08, duty: .62, drop: .205, bounce: .006, bsign: -1, lean: .2, yaw: .1, roll: .02, arm: { lat: .1, up: -.3, fwd: .15, lift: .0, off: .45, fist: 1 } });
    add('CrouchWalk', .85, (t, u) => { const p = g(t, u); const c = crouchBase(); p.hand = { L: { rel: [-.1, .02 + .03 * S(u * TAU), .6], pole: [.5, -1, -.1], fist: 1 }, R: { rel: [-.36, -.04 - .03 * S(u * TAU), .5], pole: [-.5, -1, -.1], fist: 1 } }; p.sp = [.1 - p.sp[0] * .3, .26, 0]; p.hipR = [-.45 + p.hipR[0] * .5, .12, 0]; p.nk = [0, .1, 0]; return p; }, { loop: true });
    clips.CrouchWalk.meta = { v0: 1.6 / sc, gameV: 1.6 }; }

  /* ---------- ar ---------- */
  const tuck = (k, o = {}) => guard(mix({ hip: [0, hy - .03 + .04 * k, .02], hipR: [-.15, .05 * k, 0], sp: [0, .12 + .08 * k, 0], nk: [0, 0, 0], hd: [-.06, 0, 0],
    hand: { L: { rel: [.3, .35, .35], pole: [.6, -.5, -.5], fist: .4 }, R: { rel: [-.35, .3, .4], pole: [-.6, -.5, -.5], fist: .4 } },
    foot: { L: { p: [hh, ay + .12 + .06 * k, .08 + .1 * k], pole: [.2, .2, 1] }, R: { p: [-hh, ay + .08 + .05 * k, -.1 + .02 * k], pole: [-.2, .2, 1] } } }, o));
  add('JumpStart', .3, track([[0, guard()], [.11, crouchBase({ hip: [0, hy - .17, .02], sp: [0, .3, 0], hand: { L: { rel: [.3, -.6, -.3] }, R: { rel: [-.3, -.6, -.3] } } }), 'out'], [.3, tuck(0, { hip: [0, hy + .02, .0], foot: { L: { p: [hh, ay + .05, .02] }, R: { p: [-hh, ay + .02, -.06] } } }), 'out']]));
  add('JumpAir', 1.2, (t, u) => tuck(.5 + .5 * S(u * TAU) * .3), { loop: true });
  add('Fall', .9, (t, u) => { const b = S(u * TAU); return guard({ hip: [0, hy - .01, 0], hipR: [-.1, .0, .04 * b], sp: [0, .05, 0], hd: [-.12, 0, 0],
    hand: { L: { rel: [.55 + .08 * b, .55, .1], pole: [.7, -.4, -.6], fist: 0 }, R: { rel: [-.55 - .08 * b, .5, .15], pole: [-.7, -.4, -.6], fist: 0 } },
    foot: { L: { p: [hh, ay + .1, .06 + .03 * b], pole: [.2, .2, 1] }, R: { p: [-hh, ay + .16, -.05 - .03 * b], pole: [-.2, .2, 1] } } }); }, { loop: true });
  add('Land', .42, track([[0, tuck(0, { hip: [0, hy - .02, 0] })], [.1, crouchBase({ hip: [0, hy - .21, .03], sp: [.1, .34, 0], hand: { L: { rel: [.35, -.1, .45] }, R: { rel: [-.4, -.1, .45] } } }), 'out'], [.42, guard(), 'smooth']]));
  add('LandHard', .75, track([[0, tuck(0, { hip: [0, hy - .02, 0] })], [.1, crouchBase({ hip: [0, hy - .28, .05], sp: [.1, .5, 0], hd: [.15, 0, 0], hand: { L: { rel: [.45, -.5, .45] }, R: { rel: [-.4, -.5, .4] } } }), 'out'], [.3, crouchBase({ hip: [0, hy - .27, .04], sp: [.1, .46, 0], hand: { L: { rel: [.45, -.5, .45] }, R: { rel: [-.4, -.5, .4] } } })], [.75, guard(), 'smooth']]));

  P.rig = rig; P.clips = clips; P.add = add; P.sc = sc; P.ctx = ctx; P.gait = gait; P.mix = mix;
  if (ctx.zones) P.attacks = buildAttacks(P, ctx);
  buildReactions(P);
  return P;
}

/* ---------- ESCALADA AO VIVO (qualquer parede/montanha) ----------
   phase = ciclos de agarre (frac) · H = altura subida por ciclo (unid. do modelo) · wall = distância do corpo à parede (modelo) · tilt = inclinação da parede (rad, 0 = vertical)
   Diagonal: mão D + pé E avançam juntos, depois mão E + pé D. Cada membro fica CRAVADO na parede enquanto o corpo sobe (desliza p/ baixo no ref. do corpo). */
export function climbPose(P, phase, H = .4, wall = .2, tilt = 0, k = {}) {
  const { M, ay, hy, A, L } = P, u = ((phase % 1) + 1) % 1, hh = P.hh;
  const hold = .56, mvT = 1 - hold; // fração do ciclo em que o membro está preso
  const limb = (off) => { const f = (u + off) % 1; if (f < hold) { const s = f / hold; return { y: -H * s, out: 0, s: 0 }; } const s = (f - hold) / mvT; return { y: -H + H * ease.smooth(s) * 1.0, out: S(PI * s) * .1, s }; };
  const rh = limb(0), lf = limb(.04), lh = limb(.5), rf = limb(.54);
  const body = { x: .018 * S(u * TAU), y: .012 * C(u * TAU * 2) };
  const zW = wall;                                  // plano da parede (z do modelo, frente do personagem)
  const hipZ = zW - .17, hipYc = hy - .02 + body.y;  // quadril rente à parede
  const ty = Math.tan(tilt) * 1;                    // inclinação: pontos de apoio recuam conforme sobem
  const gy = hy + .02;                               // altura de referência do quadril
  const handY = M.shoulderY + .1, footY = ay + .1;   // altura média das mãos/pés sobre o corpo
  const hand = (s, l) => ({ p: [s * (M.shoulderHalf * .95), handY + l.y + .02, zW - .005 + l.out * .5 - (handY - 0) * ty * 0], pole: [s * .9, -.6, -.6], fist: .55, roll: -.2 });
  const foot = (s, l) => ({ p: [s * (hh + .035), footY + l.y - .09, zW - .06 + l.out * .8], pitch: 1.0 - (M.footDrop || 0), pole: [s * .5, .2, .5] });
  return { hip: [body.x, hipYc, hipZ], hipR: [0, -.04, .04 * S(u * TAU)], sp: [0, -.05 + .04 * C(u * TAU * 2), -.05 * S(u * TAU)], nk: [0, -.55, 0], hd: [-.2, 0, 0],
    hand: { L: hand(1, lh), R: hand(-1, rh) }, foot: { L: foot(1, lf), R: foot(-1, rf) } };
}
/* mantle: da parede para cima do topo; k2 = 0..1 */
export function climbOverPose(P, k2, wall = .2) {
  const { M, ay, hy, A } = P, e = sstep(k2), e2 = sstep((k2 - .35) / .65), e3 = sstep((k2 - .6) / .4);
  const edgeY = M.shoulderY + .08;   // altura da borda em relação ao pé do personagem (na subida o corpo já está posicionado)
  const hipY = lerp(hy - .02, hy - .02 + .0, e) - .18 * Math.sin(PI * Math.min(1, k2 * 1.6)) * (1 - e3);
  return { hip: [0, lerp(hy - .02, hy - .06, e3) - .06 * Math.sin(PI * k2), lerp(wall - .17, 0, e2)], hipR: [0, lerp(-.02, 0, e), 0], sp: [0, lerp(-.05, .35, Math.sin(PI * Math.min(1, k2 * 1.3))) , 0], nk: [0, lerp(-.5, 0, e), 0], hd: [lerp(-.2, 0, e), 0, 0],
    hand: { L: { p: [M.shoulderHalf * .95, lerp(edgeY, .06, e2), lerp(wall, wall + .22, e2)], pole: [.9, -.6, -.6], fist: .4 }, R: { p: [-M.shoulderHalf * .95, lerp(edgeY, .06, e2), lerp(wall, wall + .22, e2)], pole: [-.9, -.6, -.6], fist: .4 } },
    foot: { L: { p: [P.hh + .03, lerp(ay + .22, ay, e3), lerp(wall - .06, .08, e2)], pitch: lerp(.9 - (M.footDrop || 0), 0, e3), pole: [.3, .3, 1] }, R: { p: [-P.hh - .03, lerp(ay + .1, ay, e3), lerp(wall - .08, -.1, e2)], pitch: lerp(1 - (M.footDrop || 0), 0, e3), pole: [-.3, .3, 1] } } };
}
