/* CyberArena · status dos personagens (fonte única de verdade)
   Usado pelo lobby (tela PERSONAGEM, ui2/econ.js) e pelo jogo (mundo/js/game.js).
   Script comum (sem import/export) para carregar nas duas páginas e expor window.CYBER_STATS.

   Como funciona
   - Cada personagem tem VIDA, VELOCIDADE e DANO próprios no nível 1.
   - Todos os números sobem em PASSOS INTEIROS e parecidos entre si (a diferença entre um nível e o
     próximo é sempre pequena: ver CYBER_STATS.table('cyber')). Vão do nível 1 ao 20.
   - O dano de cada ataque é  round(dano-base-do-ataque × multiplicador-do-nível).  O jogo usa a
     MESMA conta, então o número mostrado na tela é exatamente o que o ataque causa.
   - "Dano base" é a unidade interna dos ataques (soco 10/12/20, super 42...). Ela só existe aqui e
     no game.js; o jogador sempre vê o dano final. */
(function (root) {
  'use strict';
  const MAXLV = 20, NORM = 40;          // NORM: dano "típico" por unidade base (efeitos de impacto são calibrados nele)
  const GROW = { hp: .40, dmg: .30, spd: .08 };   // ganho total do nível 1 ao 20
  /* passo k (nível k → k+1) pesa 1 + .015·(k−10): vai de .865 a 1.135, ou seja, os passos são quase iguais */
  const W = []; for (let k = 1; k < MAXLV; k++) W.push(1 + .015 * (k - 10));
  const WSUM = W.reduce((a, b) => a + b, 0);
  const CUM = [0]; for (let k = 1; k < MAXLV; k++) CUM.push(CUM[k - 1] + W[k - 1] / WSUM);   // CUM[L-1] ∈ [0,1]
  const clampL = L => Math.max(1, Math.min(MAXLV, L | 0 || 1));
  const cum = L => CUM[clampL(L) - 1];

  /* ---- personagens ---- */
  const CHARS = {
    nexus: {
      name: 'NEXUS', role: 'CONTROLE', hp0: 4600, spd0: 740, mul0: 39, pw: .95,
      combo: [10, 12, 20],
      skill: { name: 'SINGULARIDADE', cd: 6, hits: [['Implosão (centro)', 45], ['Sucção a cada 0,4 s', 4]], info: 'Buraco negro teleguiado que puxa e prende.' },
      super: { name: 'ABISMO ESTELAR', hits: [['Estrela', 1], ['Planeta', 4], ['Buraco negro', 6], ['Impacto final', 14]], info: 'Leva o alvo para outra dimensão por 30 s.' },
      extra: { name: 'BLITZ', cd: 10, hits: [['Golpe', 24], ['Explosão final', 10]], info: 'Ataque relâmpago em linha.' },
      prev: { combo: 'punch', skill: 'singularity', super: 'abyssCast' }
    },
    cyber: {
      name: 'CYBER', role: 'EQUILIBRADO', hp0: 4000, spd0: 720, mul0: 42, pw: .90,
      combo: [10, 12, 20],
      skill: { name: 'FLASH ÔMEGA', cd: 7, hits: [['1º acerto do feixe', 42], ['Pulso do feixe (até 4)', 6]], info: 'Feixe gigante que atravessa tudo.' },
      super: { name: 'SUPERNOVA', hits: [['Explosão', 'LETAL']], info: 'Ascensão ao espaço e projétil colossal.' },
      extra: { name: 'ÔMEGA', cd: 14, hits: [['Golpe 1', 13], ['Golpe 2', 13], ['Golpe 3', 17], ['Fechamento', 12]], info: 'Sequência de 4 golpes no alvo.' },
      prev: { combo: 'punch', skill: 'flash', super: 'super' }
    },
    atlas: {
      name: 'ATLAS', role: 'TANQUE', hp0: 4300, spd0: 770, mul0: 40, pw: .85,
      combo: [10, 12, 20],
      skill: { name: 'CONTRA-IMPACTO', cd: 6, hits: [['Pulso (se não for atingido)', 27]], info: 'Escudo de 1,15 s: reflete 62% do dano recebido.' },
      super: { name: 'ABISMO ETERNO', hits: [['Soco', 2], ['Chute', 4], ['Cotovelada', 5], ['Golpe final', 68]], info: 'Leva a luta ao espaço e termina no abismo.' },
      extra: { name: 'FENDA SÍSMICA', cd: 14, hits: [['Fenda', 18]], info: 'Três ondas de choque à frente.' },
      prev: { combo: 'punch', skill: 'laser', super: 'super' }
    }
  };
  /* Regras gerais (valem para todos, escalam com a vida máxima) */
  const RULES = { regenPct: .04, kitPct: .45, kitSecs: 1.6, regenDelay: 6, orbPower: 40 };

  const idOf = c => (CHARS[c] ? c : 'nexus');
  const round10 = n => Math.round(n / 10) * 10;
  const hpAt = (c, L) => round10(CHARS[idOf(c)].hp0 * (1 + GROW.hp * cum(L)));
  const spdAt = (c, L) => Math.round(CHARS[idOf(c)].spd0 * (1 + GROW.spd * cum(L)));
  const mulAt = (c, L) => CHARS[idOf(c)].mul0 * (1 + GROW.dmg * cum(L));
  const dmgOf = (c, L, base) => Math.max(1, Math.round(base * mulAt(c, L)));
  const powerOf = (c, base) => Math.round(Math.min(70, base) * CHARS[idOf(c)].pw);   // poder (de 100) gerado por um golpe de dano-base 'base'

  function at(c, L) {
    c = idOf(c); L = clampL(L); const d = CHARS[c], mul = mulAt(c, L), hp = hpAt(c, L);
    const fmt = h => h.map(x => ({ n: x[0], v: typeof x[1] === 'number' ? dmgOf(c, L, x[1]) : x[1], base: x[1] }));
    return {
      id: c, lvl: L, name: d.name, role: d.role, hp, spd: spdAt(c, L), mul, pw: d.pw,
      regen: Math.round(hp * RULES.regenPct), kit: Math.round(hp * RULES.kitPct),
      combo: d.combo.map((b, i) => ({ n: 'Soco ' + (i + 1), v: dmgOf(c, L, b), base: b, pw: powerOf(c, b) })),
      comboTotal: d.combo.reduce((s, b) => s + dmgOf(c, L, b), 0),
      comboPower: d.combo.reduce((s, b) => s + powerOf(c, b), 0),
      skill: Object.assign({}, d.skill, { hits: fmt(d.skill.hits) }),
      super: Object.assign({}, d.super, { hits: fmt(d.super.hits) }),
      extra: Object.assign({}, d.extra, { hits: fmt(d.extra.hits) }),
      prev: d.prev
    };
  }
  /* tabela completa (para conferir o quanto cada nível sobe) */
  function table(c) { const out = []; for (let L = 1; L <= MAXLV; L++) { const s = at(c, L); out.push({ lvl: L, hp: s.hp, spd: s.spd, soco3: s.combo[2].v, combo: s.comboTotal }); } return out; }

  root.CYBER_STATS = { MAXLV, NORM, GROW, CHARS, RULES, at, table, hpAt, spdAt, mulAt, dmgOf, powerOf, idOf, clampL };
})(typeof window !== 'undefined' ? window : globalThis);
