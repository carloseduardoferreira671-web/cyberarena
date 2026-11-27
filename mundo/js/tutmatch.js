/* CyberArena · primeira partida roteirizada (tutorial)
   O jogo conduz o jogador: andar → encontrar o inimigo → SOCO → CHUTE → LÂMINA Ω (forçada) → SUPER NOVA (forçada, derrota todos).
   - os bots NÃO usam poderes nesta partida
   - só o botão da vez funciona; o resto da tela fica escuro
   - cada passo só avança quando o jogador faz o que foi pedido */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initTutMatch(api) {
  const { banner, sfx, getMe, actors, getCam, placeAt, enemiesOf, kill } = api;
  let step = -1, steps = [], inst = null, done = false, t0 = 0, hits = { punch: 0, kick: 0 }, startPos = null, waitT = 0;
  let box, ring, arrow, hand, lastFocus = null;

  /* ---------- HUD ---------- */
  function build() {
    box = document.createElement('div'); box.id = 'tutBox'; box.className = 'hidden';
    box.innerHTML = '<div class="tb-dots"></div><b id="tbT"></b><span id="tbX"></span>';
    ring = document.createElement('div'); ring.id = 'tutRing'; ring.className = 'hidden';
    arrow = document.createElement('div'); arrow.id = 'tutArrow'; arrow.className = 'hidden'; arrow.innerHTML = '<i></i><em>INIMIGO</em>';
    hand = document.createElement('div'); hand.id = 'tutHand'; hand.className = 'hidden'; hand.textContent = '👆';
    document.body.append(ring, box, arrow, hand);
  }
  function setText(title, text) { $('tbT').textContent = title; $('tbX').textContent = text; box.classList.remove('hidden'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  function dots() { box.querySelector('.tb-dots').innerHTML = steps.map((s, i) => `<u class="${i < step ? 'ok' : i === step ? 'on' : ''}"></u>`).join(''); }

  /* foco: escurece tudo, menos o botão da vez */
  function focus(id) {
    document.querySelectorAll('.tut-focus').forEach(e => e.classList.remove('tut-focus'));
    lastFocus = id;
    if (!id) { ring.classList.add('hidden'); hand.classList.add('hidden'); document.body.classList.remove('tut-lock'); return; }
    document.body.classList.add('tut-lock');
    const el = id === 'joy' ? $('joyB') : $(id); if (!el) { ring.classList.add('hidden'); return; }
    el.classList.add('tut-focus'); placeRing();
  }
  function placeRing() {
    if (!lastFocus) return; const el = lastFocus === 'joy' ? $('joyB') : $(lastFocus); if (!el) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const s = Math.max(r.width, r.height) * 1.25, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    Object.assign(ring.style, { left: (cx - s / 2) + 'px', top: (cy - s / 2) + 'px', width: s + 'px', height: s + 'px' }); ring.classList.remove('hidden');
    Object.assign(hand.style, { left: (cx - 4) + 'px', top: (cy + s / 2 - 6) + 'px' }); hand.classList.remove('hidden');
  }

  /* ---------- roteiro ---------- */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const flat = () => { const me = getMe(); return { x: me.x, z: me.z }; };
  function setup() {
    const me = getMe();
    // A partida começa com todo mundo "caindo do céu" (drop) e enemiesOf() ignora quem está caindo: antes não achava NENHUM inimigo,
    // então não havia instrutor, nem seta, e o passo "INIMIGO À VISTA" nunca terminava (golpes ficavam bloqueados).
    // Por isso primeiro todos pousam no chão, e só depois escolhemos o instrutor.
    for (const a of actors.values()) { placeAt(a, [a.x, a.z], false); a.grounded = true; a.drop = 0; a.vy = 0; }
    const bots = enemiesOf(me);
    const yaw = getCam().yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
    bots.forEach((b, i) => {   // todos passivos: não atacam e não usam poderes; ficam longe e atrás para a tela ficar leve
      const ang = yaw + Math.PI + (i / bots.length - .5) * 2.4, r = 42 + (i % 4) * 10, p = [me.x + Math.sin(ang) * r, me.z + Math.cos(ang) * r];
      placeAt(b, p, false); b.brain.passive = true; b.brain.home = p.slice(); b.brain.mode = 'idle'; b.brain.target = null; b.energy = 0;
    });
    inst = bots[0]; if (inst) {   // instrutor: vem até o jogador e bate fraco (só soco e chute)
      const p = [me.x + fx * 26, me.z + fz * 26]; placeAt(inst, p, false);
      inst.maxHp = inst.hp = 600; inst.lvl = 1; const b = inst.brain; b.passive = true; b.home = p.slice(); b.melee = true; b.pref = 2; b.decide = () => { };
      inst.tutInstructor = true;
    }
    startPos = flat();
  }
  const releaseInstructor = () => { if (!inst) return; const b = inst.brain; b.passive = false; b.mode = 'fight'; b.target = getMe(); b.react = 1.2; };
  const nextTarget = () => enemiesOf(getMe()).filter(e => !e.tutInstructor).sort((a, b) => dist(a, getMe()) - dist(b, getMe()))[0];

  steps = [
    { id: 'move', focus: 'joy', allow: [], title: 'MOVIMENTO', text: 'Arraste o joystick para andar um pouco.', enter() { }, check() { return dist(flat(), startPos) > 9; } },
    { id: 'find', focus: null, allow: [], title: 'INIMIGO À VISTA', text: 'Um inimigo vem até você. Siga a seta vermelha!', arrow: () => inst, enter() { releaseInstructor(); }, check() { return !inst || dist(inst, getMe()) < 6; } },
    { id: 'punch', focus: 'bAtk', allow: ['punch'], title: 'SOCO', text: 'Toque em SOCO 3 vezes para atacar.', check() { return hits.punch >= 3; } },
    { id: 'kick', focus: 'bKick', allow: ['kick'], title: 'CHUTE', text: 'Agora toque em CHUTE 2 vezes.', check() { return hits.kick >= 2; } },
    { id: 'finish', focus: 'bAtk', allow: ['punch', 'kick'], title: 'DERROTE-O!', text: 'Continue com socos e chutes até derrotar o inimigo.', arrow: () => inst, check() { return !inst || !inst.alive; } },
    { id: 'omegaWait', focus: 'bVel', allow: [], title: 'LÂMINA Ω CARREGANDO', text: 'Os poderes têm tempo de recarga. Aguarde carregar…', arrow: nextTarget, enter() { getMe().cd.vel = 4.5; }, check() { return getMe().cd.vel <= 0; } },
    { id: 'omega', focus: 'bVel', allow: ['extra'], title: 'LÂMINA Ω', text: 'Pronta! Toque na LÂMINA Ω para usar.', arrow: nextTarget, check() { return getMe().cd.vel > 0; } },
    { id: 'novaWait', focus: 'bSup', allow: [], title: 'SUPER NOVA CARREGANDO', text: 'Seus golpes enchem a barra do SUPER. Carregando…', enter() { waitT = 0; }, tick(dt) { waitT += dt; const me = getMe(); if (!me.hero.isBusy()) me.energy = Math.min(100, me.energy + dt * 34); }, check() { return getMe().energy >= 100 && !getMe().hero.isBusy(); } },
    { id: 'nova', focus: 'bSup', allow: ['super'], title: 'SUPER NOVA!', text: 'O ataque mais forte do Cyber! Toque para usar.', check() { return !!getMe().novaSequence; } },
    { id: 'end', focus: null, allow: [], title: '', text: '', enter() { box.classList.add('hidden'); arrow.classList.add('hidden'); } }
  ];

  function go(i) {
    step = i; const s = steps[i]; if (!s) return;
    document.body.classList.toggle('tut-hide-box', !s.title);
    if (s.title) { setText(s.title, s.text); dots(); }
    focus(s.focus); if (s.enter) s.enter(); sfx && sfx('go');
  }

  /* ---------- ganchos chamados pelo jogo ---------- */
  const api2 = {
    active: true,
    begin() { if (step >= 0) return; setup(); build(); document.body.classList.add('tut-on'); go(0); },
    allow(name) { const s = steps[step]; if (!s) return true; if (name === 'dodge' || name === 'jump') return false; return s.allow.includes(name); },
    afterAct(name) { if (name === 'punch') hits.punch++; else if (name === 'kick') hits.kick++; },
    dmg(t, dmg, src, kind) {
      const me = getMe();
      if (t === me && src && src.kind === 'bot') return me.hp - Math.max(1, me.maxHp * .02) < me.maxHp * .4 ? 0 : Math.max(1, Math.round(me.maxHp * .02));   // o instrutor bate fraco e nunca derruba
      if (t === inst && src === me) {
        return Math.ceil(inst.maxHp / 7);   // morre no 7º golpe, para qualquer combinação de socos e chutes
      }
      return dmg;
    },
    update(dt) {
      if (step < 0 || done) return; const s = steps[step]; if (!s) return;
      if (s.tick) s.tick(dt);
      placeRing();
      const tg = s.arrow ? s.arrow() : null;
      if (tg && tg.alive) {
        const me = getMe(), cam = getCam(); let d = Math.atan2(tg.x - me.x, tg.z - me.z) - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        arrow.style.setProperty('--r', (-d * 180 / Math.PI) + 'deg'); arrow.dataset.d = Math.round(dist(tg, me)) + ' m'; arrow.classList.remove('hidden');
      } else arrow.classList.add('hidden');
      if (s.check && s.check()) { if (step === steps.length - 2) { go(step + 1); done = true; document.body.classList.remove('tut-lock'); focus(null); return; } api2.good(); go(step + 1); }
    },
    good() { banner('✔ MUITO BEM!', 900); }
  };
  return api2;
}
