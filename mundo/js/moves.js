/* CyberArena · moves (v154) — tabela de golpes (zona atingida, dano, empurrão). Os movimentos em si são clipes gravados (clipctl.js). */
export const MOVES = {
  Punch_L:     { zone: 'head',  Sg: 2.15, dur: .46, imp: .15, limb: 'handL', dmg: .8,  kb: 2.2, stun: .28, label: 'Soco esquerdo (jab → cabeça)' },
  Punch_R:     { zone: 'chest', Sg: 2.30, dur: .52, imp: .18, limb: 'handR', dmg: 1.0, kb: 3.4, stun: .38, label: 'Soco direito (direto → peito)' },
  Kick_R:      { zone: 'head',  Sg: 2.85, dur: .85, imp: .30, limb: 'footR', dmg: 1.5, kb: 7.5, stun: 1.0, knock: 'head', label: 'Chute direito (alto → cabeça)' },
  Kick_L:      { zone: 'belly', Sg: 2.55, dur: .72, imp: .26, limb: 'footL', dmg: 1.2, kb: 5.5, stun: 1.25, label: 'Chute esquerdo (frontal → barriga)' },
  CrouchPunch: { zone: 'belly', Sg: 2.20, dur: .50, imp: .16, limb: 'handR', dmg: .9,  kb: 3.0, stun: 1.35, crouch: true, label: 'Soco agachado (→ barriga)' },
  Sweep:       { zone: 'shin',  Sg: 2.05, dur: .85, imp: .30, limb: 'footR', dmg: .9,  kb: 2.5, stun: 1.0, knock: 'sweep', crouch: true, label: 'Rasteira (→ pernas)' },
};
