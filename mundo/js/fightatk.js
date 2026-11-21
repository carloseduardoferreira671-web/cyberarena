/* CyberArena · fightatk (v147) — golpes: soco E/D, chute E/D, soco agachado, rasteira.
   Cada golpe é gerado UMA VEZ POR OPONENTE (3 variações por golpe): o alvo (cabeça/peito/barriga/canela) é o ponto real da
   superfície do corpo do oponente, medido na guarda dele, na altura e distância certas; um ajuste automático de alcance
   (avanço do quadril + elevação) garante que punho/pé chegue exatamente no ponto (erro < 1 cm do modelo). */
import { applyPose, bake, track, V, lerp, clamp, mix } from './rigcore.js';

const S = Math.sin, C = Math.cos;
/* tabela de golpes (usada também pelo jogo): zone = zona que o golpe ATINGE no oponente; Sg = distância entre raízes no impacto (unid. de jogo) */
export const MOVES = {
  Punch_L:     { zone: 'head',  Sg: 2.15, dur: .46, imp: .15, limb: 'handL', dmg: .8,  kb: 2.2, stun: .28, label: 'Soco esquerdo (jab → cabeça)' },
  Punch_R:     { zone: 'chest', Sg: 2.30, dur: .52, imp: .18, limb: 'handR', dmg: 1.0, kb: 3.4, stun: .38, label: 'Soco direito (direto → peito)' },
  Kick_R:      { zone: 'head',  Sg: 2.85, dur: .85, imp: .30, limb: 'footR', dmg: 1.5, kb: 7.5, stun: 1.0, knock: 'head', label: 'Chute direito (alto → cabeça)' },
  Kick_L:      { zone: 'belly', Sg: 2.55, dur: .72, imp: .26, limb: 'footL', dmg: 1.2, kb: 5.5, stun: 1.25, label: 'Chute esquerdo (frontal → barriga)' },
  CrouchPunch: { zone: 'belly', Sg: 2.20, dur: .50, imp: .16, limb: 'handR', dmg: .9,  kb: 3.0, stun: 1.35, crouch: true, label: 'Soco agachado (→ barriga)' },
  Sweep:       { zone: 'shin',  Sg: 2.05, dur: .85, imp: .30, limb: 'footR', dmg: .9,  kb: 2.5, stun: 1.0, knock: 'sweep', crouch: true, label: 'Rasteira (→ pernas)' },
};

/* efetor de contato da pose atual (posição do soco/pé que toca o alvo) */
export function effector(rig, mv, dirv) {
  const B = rig.by, M = rig.M;
  if (mv.limb[0] === 'h') { const s = mv.limb === 'handL' ? 'Left' : 'Right', w = rig.wp(B[s + 'Hand'], V()), m = rig.wp(B[s + 'HandMiddle1'], V()); return w.add(m.sub(w).normalize().multiplyScalar(M.hand)); }
  const s = mv.limb === 'footL' ? 'Left' : 'Right', a = rig.wp(B[s + 'Foot'], V()); return a.add(mv.contact.clone());
}

export function buildAttacks(P, ctx) {
  const { rig, M, ay, hy, hh } = P, guard = P.guard, crouch = P.crouch, add = P.clips;
  const hand = M.hand;
  const wristFor = (pose, side, T) => { // pulso que leva o punho (articulações) ao ponto T, a partir do ombro real da pose
    const q = mix(pose, {}); delete q.hand; applyPose(rig, q); const sh = rig.wp(rig.by[(side === 'L' ? 'Left' : 'Right') + 'Arm'], V()); const d = T.clone().sub(sh).normalize(); return { p: T.clone().addScaledVector(d, -hand).toArray(), hdir: d.toArray() };
  };
  const targets = {};
  /* ponto-alvo no espaço do atacante (unid. do modelo do atacante) */
  const targetFor = (def, mv, Z) => { const zp = Z[def][mv.zone], k = Z[def].sc / ctx.sc; return V(-zp[0] * k, zp[1] * k, mv.Sg / ctx.sc - zp[2] * k); };

  const defs = {
    Punch_L: {
      imp: (p, T) => { const b = guard({ hip: [0, hy - .075 + p.lift, p.dz], hipR: [-.55, .02, 0], sp: [-.3, .17, 0], nk: [0, .3, 0], hd: [.12, .2, 0], hand: { R: { rel: [-.36, .1, .5] } }, foot: { L: { p: [hh, ay, .12 + p.dz * .9 + .03] }, R: { p: [-hh - .045, ay + .01, -.14 + p.dz * .5], yaw: -.35, pitch: .2 } } }); b.hand.L = { ...wristFor(b, 'L', T), pole: [.7, -1, -.1], fist: 1, roll: .55 }; return b; },
      keys: (p, im, T) => [[0, guard()], [.05, guard({ hip: [0, hy - .08, -.012], sp: [.14, .08, 0], hand: { L: { rel: [-.12, .02, .36] } } }), 'out'], [.15, im, 'snap'], [.19, im], [.34, guard({ hand: { L: { rel: [-.12, .08, .5] } }, sp: [.1, .1, 0] }), 'smooth'], [.46, guard(), 'smooth']],
    },
    Punch_R: {
      imp: (p, T) => { const b = guard({ hip: [0, hy - .085 + p.lift, p.dz], hipR: [.12, .04, 0], sp: [.4, .2, 0], nk: [0, -.28, 0], hd: [.1, -.25, 0], hand: { L: { rel: [-.1, .14, .5] } }, foot: { L: { p: [hh, ay, .12 + p.dz * .75] }, R: { p: [-hh - .03, ay + .02, -.12 + p.dz * .55], yaw: .4, pitch: .65 } } }); b.hand.R = { ...wristFor(b, 'R', T), pole: [-.7, -1, -.1], fist: 1, roll: .5 }; return b; },
      keys: (p, im, T) => [[0, guard()], [.07, guard({ hipR: [-.8, 0, 0], sp: [-.12, .1, 0], hip: [0, hy - .09, -.01], hand: { R: { rel: [-.42, .0, .3] } }, foot: { R: { pitch: .15 } } }), 'out'], [.18, im, 'snap'], [.23, im], [.38, guard({ hand: { R: { rel: [-.38, .08, .5] } }, hipR: [-.3, 0, 0] }), 'smooth'], [.52, guard(), 'smooth']],
    },
    Kick_R: {
      contactK: .4,
      imp: (p, T, kd) => { const b = guard({ hip: [0, hy + .02 + p.lift, p.dz], hipR: [.55, -.08, -.32], sp: [-.35, -.1, -.4], nk: [0, -.2, 0.1], hd: [-.05, -.2, .25], hand: { L: { rel: [-.2, .2, .45] }, R: { rel: [-.75, .12, -.15], fist: .6 } }, foot: { L: { p: [hh + .035, ay, .06 + p.dz * .55], yaw: .95 } } });
        const dir = kd; b.foot.R = { p: T.clone().addScaledVector(V(...dir).normalize(), -M.footLen * .4).toArray(), dir, pole: [-.3, .6, 1] }; return b; },
      keys: (p, im, T) => { const ch = guard({ hip: [0, hy - .04, .03], hipR: [.2, 0, -.12], sp: [-.12, .05, -.15], hand: { L: { rel: [-.15, .15, .55] }, R: { rel: [-.4, .1, .4] } }, foot: { L: { p: [hh + .03, ay, .08], yaw: .6 }, R: { p: [-hh - .06, hy - .2, .08], pole: [-.5, .8, 1], dir: [.2, -.5, 1] } } });
        return [[0, guard()], [.12, ch, 'out'], [.3, im, 'snap'], [.36, im], [.54, ch, 'smooth'], [.7, guard({ hip: [0, hy - .08, 0] }), 'smooth'], [.85, guard(), 'smooth']]; },
    },
    Kick_L: {
      contact: V(0, 0, .075),
      imp: (p, T) => { const b = guard({ hip: [0, hy - .03 + p.lift, p.dz * .8 - .02], hipR: [-.2, -.22, 0], sp: [.1, -.18, 0], nk: [0, .1, 0], hd: [.05, .1, 0], hand: { L: { rel: [-.25, .28, .4] }, R: { rel: [-.4, .22, .35] } }, foot: { R: { p: [-hh - .05, ay, -.07 + p.dz * .5], yaw: -.25 } } });
        b.foot.L = { p: T.clone().add(V(0, 0, -.075)).toArray(), dir: [0, .9, .3], pole: [.15, .5, 1] }; return b; },
      keys: (p, im, T) => { const ch = guard({ hip: [0, hy - .05, 0], hipR: [-.3, -.1, 0], sp: [.1, -.05, 0], foot: { L: { p: [hh + .02, hy - .22, .22], pole: [.1, .6, 1], dir: [0, -.3, 1] }, R: { p: [-hh - .05, ay, -.09], yaw: -.25 } } });
        return [[0, guard()], [.11, ch, 'out'], [.26, im, 'snap'], [.31, im], [.46, ch, 'smooth'], [.6, guard({ hip: [0, hy - .08, 0] }), 'smooth'], [.72, guard(), 'smooth']]; },
    },
    CrouchPunch: {
      imp: (p, T) => { const b = crouch({ hip: [0, hy - .215 + p.lift, p.dz], hipR: [.1, .1, 0], sp: [.45, .3, 0], nk: [0, -.3, 0], hd: [.05, -.25, 0], hand: { L: { rel: [-.1, -.1, .45] } }, foot: { L: { p: [hh + .02, ay, .15 + p.dz * .8] }, R: { p: [-hh - .06, ay + .02, -.12 + p.dz * .6], yaw: .3, pitch: .5 } } }); b.hand.R = { ...wristFor(b, 'R', T), pole: [-.7, -1, -.1], fist: 1, roll: .4 }; return b; },
      keys: (p, im, T) => [[0, crouch()], [.07, crouch({ hipR: [-.85, .1, 0], sp: [-.1, .25, 0], hand: { R: { rel: [-.4, -.4, .15] } } }), 'out'], [.17, im, 'snap'], [.22, im], [.38, crouch({ hand: { R: { rel: [-.36, -.04, .45] } } }), 'smooth'], [.5, crouch(), 'smooth']],
    },
    Sweep: {
      contact: V(0, .05, .03),
      imp: (p, T) => { const hp = [0, .245 + p.lift, p.dz]; const b = crouch({ hip: hp, hipR: [.2, .25, 0], sp: [.15, .55, 0], nk: [0, -.1, 0], hd: [-.1, 0, 0], hand: { L: { p: [hh + .12, .03, .17 + p.dz], pole: [.6, 0, -.3], fist: 0 }, R: { rel: [-.8, .35, -.25], fist: .5 } }, foot: { L: { p: [hh + .03, ay, .02 + p.dz * .55], pole: [.25, .3, 1] } } });
        b.foot.R = { p: T.clone().sub(defs.Sweep.contact).toArray(), dir: [.95, 0, .3], pole: [-.2, .6, 1] }; return b; },
      keys: (p, im, T) => { const hz = p.dz, R = Math.hypot(im.foot.R.p[2] - hz, im.foot.R.p[0]);
        const arc = th => ({ p: [Math.sin(th) * R * .98, ay + .005 + .02 * Math.max(0, S(th * 2)), hz + Math.cos(th) * R * .98], dir: [Math.cos(th), 0, -Math.sin(th) * .3 + .2], pole: [-.2, .6, 1] });
        const dn = crouch({ hip: [0, .26, hz * .6], hipR: [.0, .2, 0], sp: [.1, .5, 0], hand: { L: { p: [hh + .12, .03, .17 + hz * .6], fist: 0, pole: [.6, 0, -.3] }, R: { rel: [-.7, .3, -.2] } }, foot: { L: { p: [hh + .03, ay, .02 + hz * .3], pole: [.25, .3, 1] }, R: { p: [-hh - .12, ay, -.25] } } });
        const mid = mix(im, { foot: { R: arc(-.75) } }), end = mix(im, { foot: { R: arc(.55) } });
        return [[0, crouch()], [.13, dn, 'out'], [.2, mix(im, { foot: { R: arc(-1.15) } }), 'lin'], [.245, mid, 'lin'], [.3, im, 'lin'], [.36, end, 'out'], [.44, end], [.62, crouch({ hip: [0, hy - .21, 0] }), 'smooth'], [.85, guard(), 'smooth']]; },
    },
  };

  const KD = { Kick_R: [.75, .1, .65] };
  // avanço máximo de quadril por golpe (unid. do modelo) e limites de elevação — o resto do alcance vem da DISTÂNCIA, resolvida por par
  const DZ = { Punch_L: .17, Punch_R: .2, Kick_R: .16, Kick_L: .15, CrouchPunch: .17, Sweep: .26 };
  const LIFT = { Sweep: [-.1, 0], Kick_R: [-.05, .1], Kick_L: [-.05, .05] };
  const out = [];
  for (const def in ctx.zones) {
    for (const name in MOVES) {
      const mv = { ...MOVES[name] }, d = defs[name];
      if (d.contact) mv.contact = d.contact; if (name === 'Kick_R') mv.contact = V(...KD.Kick_R).normalize().multiplyScalar(M.footLen * .4);
      const lim = LIFT[name] || [-.06, .06], cached = ctx.params && ctx.params[`${name}@${def}`];
      if (cached) { mv.Sg = cached.Sg; const T = targetFor(def, mv, ctx.zones), p = { dz: cached.dz, lift: cached.lift }, im = d.imp(p, T, KD[name]);
        const clipName = `${name}@${def}`, c = bake(rig, clipName, mv.dur, track(d.keys(p, im, T)));
        c.meta = { move: name, vs: def, zone: mv.zone, limb: mv.limb, imp: mv.imp, Sg: mv.Sg, dz: p.dz, lift: p.lift, err: cached.err || 0, T: T.toArray(), crouch: !!mv.crouch, contact: mv.contact ? mv.contact.toArray() : null }; add[clipName] = c; out.push(c.meta); continue; }
      // ajuste para uma distância Sg: devolve o erro mínimo alcançável
      const fit = Sg => { mv.Sg = Sg; const T = targetFor(def, mv, ctx.zones), p = { dz: 0, lift: 0 }; let err = 9, im;
        for (let it = 0; it < 12; it++) { im = d.imp(p, T, KD[name]); applyPose(rig, im); const e = T.clone().sub(effector(rig, mv)); err = e.length(); if (err < .003) break;
          p.dz = clamp(p.dz + e.z * .75, 0, DZ[name]); p.lift = clamp(p.lift + e.y * .4, lim[0], lim[1]); }
        return { err, p, im, T }; };
      // bisseção: maior Sg (mais longe) cujo erro < 3 mm; Sg_min garante que os corpos não se sobreponham
      // varre de longe para perto (a região viável NÃO é monotônica: perto demais o braço/perna não dobra) e refina a borda do maior alcance
      let feas = null, prev = MOVES[name].Sg + 1.0;
      for (let g = prev; g >= 1.2; g -= .06) { const r = fit(g); if (r.err < .006) { feas = g; break; } prev = g; }
      if (feas !== null) { let lo = feas, hi = prev; for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fit(mid).err < .006) lo = mid; else hi = mid; } mv.Sg = lo; } else { let bg = 1.5, be = 9; for (let g = 1.2; g < 3; g += .05) { const r = fit(g); if (r.err < be) { be = r.err; bg = g; } } mv.Sg = bg; }
      const fin = fit(mv.Sg); const { p, im, T } = fin, err = fin.err;
      const clipName = `${name}@${def}`; const c = bake(rig, clipName, mv.dur, track(d.keys(p, im, T)));
      c.meta = { move: name, vs: def, zone: mv.zone, limb: mv.limb, imp: mv.imp, Sg: mv.Sg, dz: p.dz, lift: p.lift, err, T: T.toArray(), crouch: !!mv.crouch, contact: mv.contact ? mv.contact.toArray() : null };
      add[clipName] = c; out.push(c.meta);
    }
  }
  return out;
}
