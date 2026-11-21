/* CyberArena · fightrx (v147) — reações localizadas, quedas, levantadas, esquivas, poderes e emotes.
   Cada reação mexe SÓ na parte atingida (máscara de ossos); quedas/levantadas são corpo inteiro.
   Tudo é gerado do corpo real de cada personagem (medidas do esqueleto), então cada um reage no seu tamanho/formato. */
import { track, lerpPose, mix, lerp, V, Q } from './rigcore.js';

const S = Math.sin, C = Math.cos, PI = Math.PI, TAU = PI * 2;

/* máscaras de ossos por grupo de reação (peso 0..1 por osso; `hips` = peso da translação do quadril) */
export const MASKS = {
  head:  { hips: 0, w: n => /^(Neck|Head)$/.test(n) ? 1 : /^Spine2$/.test(n) ? .55 : /^Spine1$/.test(n) ? .25 : /Shoulder$/.test(n) ? .35 : /^(Left|Right)(Arm|ForeArm)$/.test(n) ? .3 : 0 },
  chest: { hips: .55, w: n => /^(Neck|Head|Spine1|Spine2)$/.test(n) ? 1 : /^Spine$/.test(n) ? .8 : /Shoulder$|Arm$|ForeArm$|Hand/.test(n) ? 1 : /^Hips$/.test(n) ? .5 : /UpLeg$|Leg$|Foot$|Toe/.test(n) ? .55 : 0 },
  belly: { hips: 1, w: () => 1 },
  full:  { hips: 1, w: () => 1 },
  arms:  { hips: 0, w: n => /Shoulder$|Arm$|ForeArm$|Hand/.test(n) ? 1 : /^Spine[12]?$/.test(n) ? .5 : 0 },
};
export const maskFor = (rig, group) => { const g = MASKS[group] || MASKS.full, m = new Float32Array(rig.bones.length); rig.bones.forEach((b, i) => { m[i] = g.w(b.userData.short); }); m.hips = g.hips; return m; };

export function buildReactions(P) {
  const { rig, M, ay, hy, hh, guard, crouch, relax, clips } = P, add = P.add;
  const G = guard, k0 = (o = {}) => G(o);
  const set = (name, dur, keys, meta = {}, o = {}) => { const c = add(name, dur, typeof keys === 'function' ? keys : track(keys), o); Object.assign(c.meta, meta); return c; };
  const amp = (p, k) => lerpPose(G(), p, k); // diminui a reação (resistir): interpola p/ a guarda

  /* ============ REAÇÕES LOCALIZADAS (corpo parcial) ============ */
  // CABEÇA — jab: cabeça vira de lado, tronco recua, guarda quase se mantém
  const headHit = k => {
    const p1 = G({ hip: [0, hy - .085, -.03 * k], sp: [.1 + .22 * k, .06 - .14 * k, .09 * k], nk: [-.3 * k, .55 * k, .1 * k], hd: [-.28 * k, .55 * k, .28 * k], hand: { L: { rel: [-.12, .16 * k + .1, .5] }, R: { rel: [-.4, -.1 * k, .42] } } });
    const p2 = G({ hip: [0, hy - .08, -.012 * k], sp: [.1 - .08 * k, .06 + .08 * k, -.03 * k], nk: [.05 * k, -.18 * k, -.03 * k], hd: [.12 * k, -.14 * k, -.06 * k] });
    return [[0, G()], [.07, p1, 'snap'], [.17, p1], [.34, p2, 'smooth'], [.5, G(), 'smooth']];
  };
  set('Hit_Head', .5, headHit(1), { group: 'head', zone: 'head' });
  set('Resist_Head', .42, headHit(.4).map(([t, p, e]) => [t * .85, p, e]), { group: 'head', zone: 'head' });

  // PEITO — direto: peito afunda, braços abrem, dobra o tronco, recompõe
  const chestHit = k => {
    const p1 = G({ hip: [0, hy - .09, -.05 * k], hipR: [-.5 + .15 * k, -.08 * k, 0], sp: [.1 - .02 * k, .06 - .26 * k, 0], nk: [-.2 * k, 0, 0], hd: [-.18 * k, .12, 0], hand: { L: { rel: [.1 * k - .12, .3 * k + .1, .35] }, R: { rel: [-.38 - .15 * k, .25 * k, .3] } }, foot: { L: { p: [hh, ay, .12 - .1 * k] }, R: { p: [-hh - .045, ay, -.14 - .12 * k] } } });
    const p2 = G({ hip: [0, hy - .115, -.06 * k], sp: [.1, .06 + .48 * k, 0], nk: [0, .2 * k, 0], hd: [.1 + .2 * k, .12, 0], hand: { L: { rel: [-.2, -.15 * k + .1, .4] }, R: { rel: [-.36, -.2 * k, .38] } }, foot: { L: { p: [hh, ay, .12 - .12 * k] }, R: { p: [-hh - .045, ay, -.14 - .14 * k] } } });
    return [[0, G()], [.07, p1, 'snap'], [.15, p1], [.3, p2, 'smooth'], [.5, G({ foot: { L: { p: [hh, ay, .1] }, R: { p: [-hh - .045, ay, -.16] } } }), 'smooth'], [.68, G(), 'smooth']];
  };
  set('Hit_Chest', .68, chestHit(1), { group: 'chest', zone: 'chest' });
  set('Resist_Chest', .5, chestHit(.4).map(([t, p, e]) => [t * .75, p, e]), { group: 'chest', zone: 'chest' });

  // BARRIGA — dobra sobre as mãos, recua, MANTÉM as mãos na barriga protegendo; só depois levanta a guarda e se recompõe
  const bellyHands = (dy = 0) => ({ L: { rel: [-.3, -.8 + dy, .3], pole: [.9, -.2, -.5], fist: .7 }, R: { rel: [-.52, -.78 + dy, .28], pole: [-.9, -.2, -.5], fist: .7 } });
  const bellyPose = (f, sway = 0, br = 0) => G({ hip: [.012 * sway, hy - .13 * f - .075 * (1 - f) - .006 * br, -.07 * f], hipR: [-.5 + .1 * f, .25 * f, 0], sp: [.1 + .12 * f * 0 + .75 * f + .035 * br, .06 * (1 - f) - .04 * sway * f, .06 * sway * f], nk: [0, .28 * f, 0], hd: [.08 + .3 * f, .12 - .1 * f * sway, 0],
    hand: f > .01 ? mix(G().hand, bellyHands()) : G().hand, foot: { L: { p: [hh, ay, .12 - .02 * f] }, R: { p: [-hh - .045, ay, -.14 - .12 * f] } } });
  const bellyKeys = k => [[0, G()], [.08, bellyPose(.85 * k, 0, 0), 'snap'], [.2, bellyPose(1 * k, .6, .5), 'smooth'], [.45, bellyPose(.95 * k, -.5, 1), 'smooth'], [.75, bellyPose(1 * k, .5, 0), 'smooth'], [1.05, bellyPose(.95 * k, -.4, 1), 'smooth'], [1.3, bellyPose(.9 * k, .3, 0), 'smooth'],
    // mantém a mão de trás na barriga, levanta a da frente (tenta não baixar a guarda), depois endireita
    [1.55, mix(bellyPose(.55 * k, 0, 0), { hand: { L: { rel: [-.12, .08, .56], fist: 1 } } }), 'smooth'], [1.8, mix(G(), { hip: [0, hy - .09, -.02] }), 'smooth'], [1.95, G(), 'smooth']];
  set('Hit_Belly', 1.95, bellyKeys(1), { group: 'belly', zone: 'belly', holdA: .2, holdB: 1.3 });
  set('Resist_Belly', 1.1, bellyKeys(.45).map(([t, p, e]) => [t * .56, p, e]), { group: 'belly', zone: 'belly' });

  /* ============ POSES DEITADAS ============ */
  const spine = M.shoulderY - hy;
  const supine = (o = {}) => mix({ hip: [0, .1, -.1], hipR: [0, -1.52, 0], sp: [0, .02, 0], nk: [0, .12, 0], hd: [0, .05, 0],
    hand: { L: { p: [.26, .092, -.1 - spine - .12], pole: [.5, .6, 0], fist: .3 }, R: { p: [-.26, .092, -.1 - spine - .1], pole: [-.5, .6, 0], fist: .3 } },
    foot: { L: { p: [.11, ay, -.1 + M.leg * .93], pole: [.1, 1, 0], dir: [.2, .85, .45] }, R: { p: [-.1, ay + .02, -.1 + M.leg * .86], pole: [-.1, 1, 0], dir: [-.2, .85, .45] } } }, o);
  const prone = (o = {}) => mix({ hip: [0, .105, -.12], hipR: [0, 1.52, 0], sp: [0, -.02, 0], nk: [0, -.1, 0], hd: [0, -.1, .0],
    hand: { L: { p: [.22, .092, -.12 + spine + .14], pole: [.9, .5, 0], fist: .2 }, R: { p: [-.24, .092, -.12 + spine + .1], pole: [-.9, .5, 0], fist: .2 } },
    foot: { L: { p: [.1, ay, -.12 - M.leg * .92], pole: [.1, 1, 0], dir: [.1, -.5, -.85] }, R: { p: [-.09, ay + .01, -.12 - M.leg * .86], pole: [-.1, 1, 0], dir: [-.1, -.5, -.85] } } }, o);
  P.supine = supine; P.prone = prone;

  /* ============ QUEDAS ============ */
  // RASTEIRA: pernas varridas, corpo gira para trás e bate de costas
  const sw1 = G({ hip: [0, hy - .03, -.03], hipR: [-.3, -.3, -.14], sp: [.0, -.15, 0], nk: [0, -.1, 0], hd: [-.12, 0, 0], hand: { L: { rel: [.5, .55, .1], fist: 0 }, R: { rel: [-.5, .5, .15], fist: 0 } }, foot: { L: { p: [hh, ay + .16, .24] }, R: { p: [-hh, ay + .3, .16] } } });
  const sw2 = G({ hip: [0, .34, -.1], hipR: [0, -1.0, 0], sp: [0, -.1, 0], nk: [0, -.2, 0], hd: [-.1, 0, 0], hand: { L: { rel: [.6, .45, -.3], fist: 0 }, R: { rel: [-.6, .5, -.25], fist: 0 } }, foot: { L: { p: [hh, .5, .26], pole: [.1, .3, 1] }, R: { p: [-hh, .56, .2], pole: [-.1, .3, 1] } } });
  const land = supine({ hip: [0, .105, -.16], nk: [0, .32, 0], hd: [0, .25, 0], foot: { L: { p: [.11, ay + .3, -.16 + M.leg * .62], pole: [.1, 1, 0] }, R: { p: [-.1, ay + .36, -.16 + M.leg * .55], pole: [-.1, 1, 0] } }, hand: { L: { p: [.34, .092, -.16 - spine - .06] }, R: { p: [-.34, .092, -.16 - spine - .04] } } });
  const rest = supine({ hip: [0, .1, -.16], nk: [0, .1, 0], hand: { L: { p: [.3, .092, -.16 - spine - .13] }, R: { p: [-.3, .092, -.16 - spine - .1] } } });
  set('Fall_Sweep', 1.5, [[0, G()], [.1, sw1, 'out'], [.27, sw2, 'in'], [.42, land, 'snap'], [.54, supine({ hip: [0, .125, -.16], nk: [0, -.05, 0], hd: [-.1, 0, 0], foot: { L: { p: [.11, ay + .22, -.16 + M.leg * .66] }, R: { p: [-.1, ay + .26, -.16 + M.leg * .6] } } }), 'out'], [.8, rest, 'smooth'], [1.5, supine({ hip: [0, .1 + .004, -.16], sp: [0, .025, 0], nk: [0, .11, 0], hand: rest.hand, foot: rest.foot }), 'smooth']], { group: 'full', pose: 'supine', down: true });
  // QUEDA PARA TRÁS (golpe forte / morte): recua, perde o equilíbrio, desaba de costas
  const fb1 = G({ hip: [0, hy - .09, -.06], hipR: [-.4, -.05, 0], sp: [.1, -.28, 0], nk: [0, -.2, 0], hd: [-.2, .1, 0], hand: { L: { rel: [.3, .35, .3], fist: 0 }, R: { rel: [-.5, .3, .3], fist: 0 } }, foot: { L: { p: [hh, ay, .0] }, R: { p: [-hh, ay, -.2] } } });
  const fb2 = G({ hip: [0, hy - .12, -.16], hipR: [-.1, -.42, 0], sp: [0, -.22, 0], nk: [0, -.15, 0], hd: [-.1, 0, 0], hand: { L: { rel: [.5, .55, .1], fist: 0 }, R: { rel: [-.55, .5, .1], fist: 0 } }, foot: { L: { p: [hh, ay + .05, -.14] }, R: { p: [-hh, ay, -.36] } } });
  const fb3 = G({ hip: [0, .32, -.26], hipR: [0, -1.0, 0], sp: [0, -.1, 0], nk: [0, -.1, 0], hd: [-.1, 0, 0], hand: { L: { rel: [.55, .45, -.2], fist: 0 }, R: { rel: [-.55, .45, -.15], fist: 0 } }, foot: { L: { p: [hh, .3, -.1], pole: [.1, .5, 1] }, R: { p: [-hh, .12, -.38], pole: [-.1, .5, 1] } } });
  set('Fall_Back', 1.45, [[0, G()], [.1, fb1, 'out'], [.3, fb2, 'smooth'], [.48, fb3, 'in'], [.62, supine({ hip: [0, .105, -.28], nk: [0, .3, 0], hd: [0, .2, 0], foot: { L: { p: [.11, ay + .28, -.28 + M.leg * .6] }, R: { p: [-.1, ay + .2, -.28 + M.leg * .55] } }, hand: { L: { p: [.34, .092, -.28 - spine - .06] }, R: { p: [-.34, .092, -.28 - spine - .04] } } }), 'snap'], [.8, supine({ hip: [0, .1, -.28], hand: { L: { p: [.3, .092, -.28 - spine - .13] }, R: { p: [-.3, .092, -.28 - spine - .1] } }, foot: { L: { p: [.11, ay, -.28 + M.leg * .78] }, R: { p: [-.1, ay + .08, -.28 + M.leg * .6] } } }), 'smooth'], [1.45, supine({ hip: [0, .1, -.28], hand: { L: { p: [.3, .092, -.28 - spine - .13] }, R: { p: [-.3, .092, -.28 - spine - .1] } }, foot: { L: { p: [.11, ay, -.28 + M.leg * .78] }, R: { p: [-.1, ay + .08, -.28 + M.leg * .6] } } }), 'smooth']], { group: 'full', pose: 'supine', down: true });
  // NOCAUTE NA CABEÇA (chute alto): cabeça chicoteia, corpo gira, joelhos cedem e cai de bruços
  const ko1 = G({ hip: [0, hy - .085, -.04], hipR: [.35, -.04, .06], sp: [.1, .5, .1], nk: [-.2, 1.0, .2], hd: [-.2, .85, .4], hand: { L: { rel: [.35, .3, .3], fist: .2 }, R: { rel: [-.6, .2, .2], fist: .2 } } });
  const ko2 = G({ hip: [0, hy - .16, -.07], hipR: [1.9, .1, .1], sp: [.2, .35, 0], nk: [0, .3, 0], hd: [.05, .3, .1], hand: { L: { rel: [.7, .15, .2], fist: 0 }, R: { rel: [-.7, .25, .15], fist: 0 } }, foot: { L: { p: [hh + .04, ay, .06] }, R: { p: [-hh + .02, ay, -.22], pitch: .4 } } });
  const ko3 = G({ hip: [0, .3, -.12], hipR: [4.6, .8, .15], sp: [0, .1, 0], nk: [0, .1, 0], hd: [.1, 0, 0], hand: { L: { rel: [.5, -.2, .6], fist: 0 }, R: { rel: [-.4, -.1, .6], fist: 0 } }, foot: { L: { p: [hh, .12, -.2] }, R: { p: [-hh, .08, -.3] } } });
  const kolay = prone({ hip: [0, .105, -.12], hipR: [TAU, 1.52, 0] }), kolay0 = prone();
  set('KO_Head', 2.3, [[0, G()], [.08, ko1, 'snap'], [.24, ko2, 'smooth'], [.46, ko3, 'in'], [.62, kolay, 'snap'], [.78, prone({ hip: [0, .125, -.12], hipR: [TAU, 1.52, 0], nk: [0, -.2, 0] }), 'out'], [1.0, kolay, 'smooth'], [2.3, mix(kolay, { hip: [0, .108, -.12], sp: [0, -.015, 0] }), 'smooth']], { group: 'full', pose: 'prone', down: true });

  /* ============ LEVANTAR ============ */
  const kneelHands = (z) => ({ L: { p: [.15, .092, z], pole: [.7, .4, -.2], fist: .2 }, R: { p: [-.15, .092, z], pole: [-.7, .4, -.2], fist: .2 } });
  const sit = supine({ hip: [0, .12, -.16], hipR: [0, -.55, 0], sp: [0, .45, 0], nk: [0, .1, 0], hd: [.05, 0, 0], hand: { L: { p: [.24, .092, -.38], pole: [.6, .5, 0] }, R: { p: [-.24, .092, -.38], pole: [-.6, .5, 0] } }, foot: { L: { p: [.14, ay, .12], pole: [.2, 1, .3] }, R: { p: [-.13, ay, .1], pole: [-.2, 1, .3] } } });
  const squatHands = crouch({ hip: [0, hy - .26, -.04], hipR: [-.3, .2, 0], sp: [.0, .5, 0], nk: [0, .0, 0], hd: [-.05, 0, 0], hand: { L: { p: [.18, .092, .26], fist: .3 }, R: { p: [-.22, .092, .22], fist: .3 } }, foot: { L: { p: [hh + .05, ay, .12] }, R: { p: [-hh - .05, ay, -.04] } } });
  set('GetUp_Back', 1.55, [[0, rest], [.22, supine({ hip: [0, .105, -.16], sp: [0, .22, 0], nk: [0, .3, 0], hand: { L: { p: [.26, .092, -.16 - spine + .06] }, R: { p: [-.26, .092, -.16 - spine + .08] } }, foot: { L: { p: [.12, ay, -.16 + M.leg * .45], pole: [.1, 1, 0] }, R: { p: [-.11, ay, -.16 + M.leg * .42], pole: [-.1, 1, 0] } } }), 'smooth'], [.55, sit, 'smooth'], [.85, squatHands, 'smooth'], [1.15, crouch({ hip: [0, hy - .21, 0], sp: [.1, .22, 0] }), 'smooth'], [1.55, G(), 'smooth']], { group: 'full', up: true });
  const pushup = prone({ hip: [0, .22, -.1], hipR: [0, 1.15, 0], sp: [0, -.05, 0], nk: [0, -.3, 0], hd: [-.1, 0, 0], hand: { L: { p: [.17, .092, -.1 + spine * .9], pole: [.9, .4, -.2], fist: .1 }, R: { p: [-.17, .092, -.1 + spine * .9], pole: [-.9, .4, -.2], fist: .1 } }, foot: { L: { p: [.1, ay, -.1 - M.leg * .92], pole: [.1, 1, 0], dir: [.1, -.5, -.85] }, R: { p: [-.1, ay, -.1 - M.leg * .92], pole: [-.1, 1, 0], dir: [-.1, -.5, -.85] } } });
  const tuckp = squatHands;
  set('GetUp_Prone', 1.75, [[0, kolay0], [.3, pushup, 'smooth'], [.7, mix(squatHands, { hip: [0, hy - .3, -.12], hipR: [0, .6, 0], sp: [0, .4, 0], hand: { L: { p: [.16, .092, .12] }, R: { p: [-.16, .092, .1] } } }), 'smooth'], [1.0, squatHands, 'smooth'], [1.35, crouch({ hip: [0, hy - .21, 0] }), 'smooth'], [1.75, G(), 'smooth']], { group: 'full', up: true });

  /* ============ ESQUIVAS ============ */
  set('Dodge_L', .5, [[0, G()], [.1, G({ hip: [.13, hy - .1, -.02], sp: [.1, .15, -.4], nk: [0, .1, .25], hd: [0, .1, .2], foot: { L: { p: [hh + .12, ay, .12] }, R: { p: [-hh + .02, ay, -.14] } } }), 'out'], [.26, G({ hip: [.13, hy - .1, -.02], sp: [.1, .15, -.4], foot: { L: { p: [hh + .12, ay, .12] }, R: { p: [-hh + .02, ay, -.14] } } })], [.5, G(), 'smooth']], { group: 'full' });
  set('Dodge_R', .5, [[0, G()], [.1, G({ hip: [-.13, hy - .1, -.02], sp: [.1, .15, .4], nk: [0, .1, -.25], hd: [0, .1, -.2], foot: { L: { p: [hh - .02, ay, .12] }, R: { p: [-hh - .13, ay, -.14] } } }), 'out'], [.26, G({ hip: [-.13, hy - .1, -.02], sp: [.1, .15, .4], foot: { L: { p: [hh - .02, ay, .12] }, R: { p: [-hh - .13, ay, -.14] } } })], [.5, G(), 'smooth']], { group: 'full' });
  set('Dodge_B', .52, [[0, G()], [.1, G({ hip: [0, hy - .06, -.16], sp: [.1, -.28, 0], nk: [0, -.1, 0], hd: [-.1, .12, 0], hand: { L: { rel: [-.12, .2, .45] }, R: { rel: [-.38, .12, .4] } }, foot: { L: { p: [hh, ay + .02, -.04] }, R: { p: [-hh - .045, ay, -.3] } } }), 'out'], [.28, G({ hip: [0, hy - .07, -.12], sp: [.1, -.2, 0], foot: { L: { p: [hh, ay, -.02] }, R: { p: [-hh - .045, ay, -.28] } } })], [.52, G(), 'smooth']], { group: 'full' });
  set('Duck', .55, [[0, G()], [.1, crouch({ hip: [0, hy - .25, 0], sp: [.1, .5, 0], nk: [0, .2, 0], hd: [.2, .12, 0], hand: { L: { rel: [-.1, .3, .5] }, R: { rel: [-.36, .22, .45] } } }), 'out'], [.32, crouch({ hip: [0, hy - .25, 0], sp: [.1, .5, 0], hand: { L: { rel: [-.1, .3, .5] }, R: { rel: [-.36, .22, .45] } } })], [.55, G(), 'smooth']], { group: 'full' });

  /* ============ PODERES / EMOTES / ESPECIAIS ============ */
  const open = (rl, rr, o = {}) => ({ L: { rel: rl, pole: [.5, -.6, -.3], fist: 0, ...o }, R: { rel: rr, pole: [-.5, -.6, -.3], fist: 0, ...o } });
  const wide = { L: { p: [hh + .06, ay, .16] }, R: { p: [-hh - .08, ay, -.12], yaw: -.3 } };
  set('Cast_Fwd', .9, [[0, G()], [.15, G({ hip: [0, hy - .09, -.03], sp: [.1, -.1, 0], hand: open([-.1, -.25, .25], [-.2, -.25, .25], { fist: .5 }) }), 'out'], [.3, G({ hip: [0, hy - .085, .03], hipR: [-.25, 0, 0], sp: [.0, .15, 0], hand: open([.0, .2, 1.0], [-.12, .2, 1.0]), foot: wide }), 'snap'], [.9, G({ hip: [0, hy - .09, .02], hipR: [-.25, 0, 0], sp: [.0, .12, 0], hand: open([.0, .2, .96], [-.12, .2, .96]), foot: wide }), 'smooth']], { group: 'full' });
  set('Cast_Up', 1.1, [[0, G()], [.2, G({ hip: [0, hy - .12, 0], sp: [.1, .3, 0], hand: open([.3, -.5, .3], [-.3, -.5, .3], { fist: .6 }), foot: wide }), 'smooth'], [.5, G({ hip: [0, hy - .02, 0], hipR: [0, -.05, 0], sp: [0, -.25, 0], nk: [0, -.3, 0], hd: [-.3, 0, 0], hand: open([.35, 1.15, .1], [-.35, 1.15, .1]), foot: { L: { p: [hh + .04, ay, .06] }, R: { p: [-hh - .04, ay, -.06] } } }), 'out'], [1.1, G({ hip: [0, hy - .02, 0], sp: [0, -.25, 0], nk: [0, -.3, 0], hd: [-.3, 0, 0], hand: open([.35, 1.1, .1], [-.35, 1.1, .1]), foot: { L: { p: [hh + .04, ay, .06] }, R: { p: [-hh - .04, ay, -.06] } } }), 'smooth']], { group: 'full' });
  set('Cast_Slam', .95, [[0, G()], [.22, G({ hip: [0, hy - .0, -.02], sp: [-.05, -.2, 0], nk: [0, -.2, 0], hand: open([.35, 1.1, .0], [-.35, 1.1, .0], { fist: 1 }), foot: { L: { p: [hh + .04, ay, .06] }, R: { p: [-hh - .04, ay, -.06] } } }), 'out'], [.4, G({ hip: [0, hy - .2, .1], hipR: [-.2, .2, 0], sp: [.1, .6, 0], nk: [0, .2, 0], hd: [.2, 0, 0], hand: open([-.05, -.4, .8], [-.15, -.45, .8], { fist: 1 }), foot: wide }), 'in'], [.95, G({ hip: [0, hy - .2, .1], hipR: [-.2, .2, 0], sp: [.1, .55, 0], hand: open([-.05, -.4, .8], [-.15, -.45, .8], { fist: 1 }), foot: wide }), 'smooth']], { group: 'full' });
  set('Channel', 1.8, (() => { const f = u => G({ hip: [0, hy - .03 + .008 * S(u * TAU), 0], hipR: [0, 0, 0], sp: [0, -.12, 0], nk: [0, -.2, 0], hd: [-.15 + .03 * S(u * TAU), 0, 0], hand: open([.95, .2 + .04 * S(u * TAU), .2], [-.95, .2 + .04 * S(u * TAU + 1), .2]), foot: { L: { p: [hh + .05, ay, .04] }, R: { p: [-hh - .05, ay, -.04] } } }); return t => f(t / 1.8); })(), {}, { loop: true });
  set('Uppercut', .8, [[0, G()], [.18, crouch({ hip: [0, hy - .22, -.02], hipR: [-.9, .2, 0], sp: [-.2, .35, 0], hand: { R: { rel: [-.35, -.5, .2], fist: 1 }, L: { rel: [-.1, -.1, .5] } }, foot: { L: { p: [hh + .02, ay, .12] }, R: { p: [-hh - .06, ay, -.2], yaw: -.35 } } }), 'out'], [.32, G({ hip: [0, hy + .03, .08], hipR: [.3, -.1, 0], sp: [.4, -.3, 0], nk: [0, -.3, 0], hd: [-.1, -.3, 0], hand: { R: { rel: [-.25, 1.0, .35], fist: 1 }, L: { rel: [-.12, .1, .5] } }, foot: { L: { p: [hh, ay + .1, .2] }, R: { p: [-hh - .04, ay + .0, -.12], pitch: .6 } } }), 'snap'], [.45, G({ hip: [0, hy + .03, .08], hipR: [.3, -.1, 0], sp: [.4, -.3, 0], hand: { R: { rel: [-.25, 1.0, .35], fist: 1 }, L: { rel: [-.12, .1, .5] } } })], [.8, G(), 'smooth']], { group: 'full' });
  set('Dance', 2.4, (() => { const f = u => { const b = S(u * TAU * 2), s = S(u * TAU); return relax({ hip: [.04 * s, hy - .05 - .02 * Math.abs(b), 0], hipR: [.3 * s, 0, .1 * s], sp: [-.25 * s, .05 + .05 * b, -.08 * s], nk: [0, .15 * s, 0], hand: { L: { rel: [.45, .55 + .3 * S(u * TAU * 2), .25], pole: [.6, -.5, -.5], fist: 0 }, R: { rel: [-.45, .55 + .3 * S(u * TAU * 2 + PI), .25], pole: [-.6, -.5, -.5], fist: 0 } }, foot: { L: { p: [hh + .07 + .03 * s, ay + .04 * Math.max(0, b), .02] }, R: { p: [-hh - .07 + .03 * s, ay + .04 * Math.max(0, -b), -.02] } } }); }; return t => f(t / 2.4); })(), {}, { loop: true });
  { const env = t => Math.min(1, t / .3, (1.9 - t) / .3); add('Wave', 1.9, (t) => lerpPose(relax(), relax({ hand: { R: { rel: [-.45 + .2 * S(t * TAU * 2.2), .85, .35], pole: [-.8, -.2, -.5], fist: 0 } }, hd: [0, -.1, 0] }), Math.max(0, env(t))), {}); }

  /* rolamento (frente) e vault */
  const rotX = (v, th) => { const c = C(th), s = S(th); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
  add('Roll', .72, (t, u) => { const th = u * TAU, h = .27 + .04 * S(u * PI), hp = [0, h, .05]; const rel = v => { const r = rotX(v, th); return [hp[0] + r[0], hp[1] + r[1], hp[2] + r[2]]; };
    return G({ hip: hp, hipR: [0, th, 0], sp: [0, .9, 0], nk: [0, .5, 0], hd: [.1, 0, 0], hand: { L: { p: rel([.1, .12, .2]), fist: .6 }, R: { p: rel([-.1, .12, .2]), fist: .6 } }, foot: { L: { p: rel([.08, -.2, .12]), pole: [0, .5, 1] }, R: { p: rel([-.08, -.2, .1]), pole: [0, .5, 1] } } }); });
  set('Vault', .75, [[0, G({ hip: [0, hy - .08, 0] })], [.2, G({ hip: [0, hy - .02, .08], sp: [.1, .35, 0], hand: { L: { rel: [.2, -.5, .75], fist: .3 }, R: { rel: [-.2, -.5, .75], fist: .3 } }, foot: { L: { p: [hh, ay + .1, .04] }, R: { p: [-hh, ay + .05, -.1] } } }), 'out'], [.42, G({ hip: [.12, hy + .06, .22], hipR: [0, -.1, -.5], sp: [.1, .5, .0], hand: { L: { rel: [.1, -.7, .65], fist: .3 }, R: { rel: [-.1, -.7, .65], fist: .3 } }, foot: { L: { p: [hh + .1, hy - .1, .25], pole: [.5, .5, 1] }, R: { p: [-hh + .16, hy - .05, .18], pole: [.5, .5, 1] } } }), 'smooth'], [.75, G({ hip: [0, hy - .06, .2] }), 'smooth']], { group: 'full' });
}
