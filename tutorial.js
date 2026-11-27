/* CyberArena · tutorial de primeira vez (lobby)
   Parte 1: personagens → loja (gemas e caixas grátis) → modos (16 jogadores) → gráficos (ultra leve) → JOGAR (partida roteirizada)
   Parte 2 (ao voltar da partida): evoluir o Cyber → modos (o que cada um faz) → gráficos (perguntar se quer aumentar) → fim
   O jogador só consegue tocar no que o tutorial pede: o resto da tela fica escuro e bloqueado. */
const KEY0 = 'cyberarena.tut.v2';   // v2: zera o estado antigo; todos (inclusive quem já jogava) fazem o tutorial completo uma vez
const acct = () => (typeof activeCyberAccountId !== 'undefined' && activeCyberAccountId) || '';
const keyOf = () => KEY0 + (acct() ? '@' + acct() : '');   // o tutorial é por conta: conta nova = tutorial novo
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const load = () => { try { return JSON.parse(localStorage.getItem(keyOf()) || 'null') || {}; } catch (_) { return {}; } };
const save = s => { try { localStorage.setItem(keyOf(), JSON.stringify(s)); } catch (_) { } };
let st = load(), running = false, layer = null, cur = null;

/* ---------- utilidades ---------- */
const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.classList && e.classList.contains('hidden')) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
const OV = ['chestOpening', 'rewardModal', 'modal', 'offerReward', 'accountGate', 'evoUp', 'passTotalsModal'];
const overlayOpen = () => OV.some(id => { const e = $(id); if (!e) return false; if (id === 'evoUp') return e.classList.contains('on') && vis(e); return !e.classList.contains('hidden') && vis(e); });
async function waitFor(fn, ms = 9000) { const t0 = Date.now(); for (;;) { let v = null; try { v = fn(); } catch (_) { } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(100); } }
const find = sel => { try { const l = document.querySelectorAll(sel); for (const e of l) if (vis(e)) return e; } catch (_) { } return null; };
const navBtn = (screen, label) => [...document.querySelectorAll(`#${screen} .ca-nav button`)].find(b => (b.textContent || '').trim().toUpperCase().includes(label));
const waitClear = async () => { await sleep(450); await waitFor(() => !overlayOpen(), 60000); await sleep(350); };

/* ---------- camada escura com foco ---------- */
function build() {
  if (layer) return;
  layer = document.createElement('div'); layer.id = 'tutL'; layer.className = 'hidden';
  layer.innerHTML = '<i class="tl-p"></i><i class="tl-p"></i><i class="tl-p"></i><i class="tl-p"></i><div class="tl-ring"></div><div class="tl-hand">👆</div><div class="tl-card"><div class="tl-step"></div><b></b><span></span><div class="tl-btns"></div></div>';
  document.body.appendChild(layer);
  layer.addEventListener('pointerdown', e => { if (e.target.closest('.tl-card')) return; layer.querySelector('.tl-card').classList.remove('shake'); void layer.offsetWidth; layer.querySelector('.tl-card').classList.add('shake'); }, true);
}
let looping = false;
function startLoop() { if (looping) return; looping = true; (function loop() { frame(); if (running || cur) requestAnimationFrame(loop); else looping = false; })(); }
function frame() {
  if (!layer) return;
  const on = !!cur && !overlayOpen();    // se abriu uma recompensa/caixa, o tutorial se esconde e volta depois
  layer.classList.toggle('hidden', !on); if (!on) return;
  const W = innerWidth, H = innerHeight, P = layer.querySelectorAll('.tl-p'), ring = layer.querySelector('.tl-ring'), hand = layer.querySelector('.tl-hand'), card = layer.querySelector('.tl-card');
  const el = cur.el && vis(cur.el) ? cur.el : null;
  if (!el) { P[0].style.cssText = `left:0;top:0;width:${W}px;height:${H}px`; for (let i = 1; i < 4; i++) P[i].style.cssText = 'display:none'; ring.style.display = 'none'; hand.style.display = 'none'; card.style.cssText = ''; card.classList.add('center'); return; }
  card.classList.remove('center');
  const r = el.getBoundingClientRect(), pad = 8, x1 = Math.max(0, r.left - pad), y1 = Math.max(0, r.top - pad), x2 = Math.min(W, r.right + pad), y2 = Math.min(H, r.bottom + pad);
  P[0].style.cssText = `left:0;top:0;width:${W}px;height:${y1}px`; P[1].style.cssText = `left:0;top:${y2}px;width:${W}px;height:${Math.max(0, H - y2)}px`;
  P[2].style.cssText = `left:0;top:${y1}px;width:${x1}px;height:${y2 - y1}px`; P[3].style.cssText = `left:${x2}px;top:${y1}px;width:${Math.max(0, W - x2)}px;height:${y2 - y1}px`;
  Object.assign(ring.style, { display: 'block', left: x1 + 'px', top: y1 + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
  const below = (r.top + r.bottom) / 2 < H * .52;   // o texto fica do lado oposto ao botão para não cobrir
  card.style.top = below ? 'auto' : '10px'; card.style.bottom = below ? '10px' : 'auto'; card.style.left = '50%';
  Object.assign(hand.style, { display: cur.noHand ? 'none' : 'block', left: (r.left + r.width / 2 - 6) + 'px', top: (below ? r.bottom + 2 : r.top - 38) + 'px' });
}
function show(title, text, { el = null, buttons = null, step = '', noHand = false } = {}) {
  build(); cur = { el, noHand };
  const card = layer.querySelector('.tl-card'); card.querySelector('b').textContent = title; card.querySelector('span').textContent = text; card.querySelector('.tl-step').textContent = step;
  const bx = card.querySelector('.tl-btns'); bx.innerHTML = ''; card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
  if (buttons) buttons.forEach(b => { const x = document.createElement('button'); x.textContent = b.label; x.className = b.cls || ''; x.onclick = () => b.fn(); bx.appendChild(x); });
  layer.classList.remove('hidden');
}
const hide = () => { cur = null; layer && layer.classList.add('hidden'); };

/* diálogo: mostra o texto e espera o jogador escolher um botão */
function say(title, text, labels = ['CONTINUAR'], opt = {}) {
  return new Promise(res => show(title, text, { ...opt, buttons: labels.map((l, i) => ({ label: l, cls: i === 0 ? 'prim' : '', fn: () => { hide(); res(i); } })) }));
}
/* toque obrigatório: só o elemento destacado funciona. Depois de alguns segundos aparece "PULAR PASSO" para o jogador nunca ficar preso */
async function tap(sel, title, text, opt = {}) {
  const el = await waitFor(() => find(sel), opt.wait || 9000);
  if (!el) return false;                                   // não existe nesta versão/conta: segue sem travar
  if (el.disabled) return false;
  try { el.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) { }
  await sleep(120);
  return new Promise(res => {
    let fin = false, skipT = 0; const done = v => { if (fin) return; fin = true; clearTimeout(skipT); document.removeEventListener('click', h, true); hide(); setTimeout(() => res(v), v ? (opt.delay ?? 300) : 80); };
    const h = e => { if (!el.contains(e.target)) return; done(true); };
    show(title, text, { el, step: opt.step || '' });
    document.addEventListener('click', h, true);
    skipT = setTimeout(() => { if (fin || !layer) return; const bx = layer.querySelector('.tl-btns'); if (bx.querySelector('.skip')) return; const b = document.createElement('button'); b.className = 'skip'; b.textContent = 'PULAR PASSO'; b.onclick = () => done(false); bx.appendChild(b); }, opt.skipAfter ?? 6000);
  });
}
const gemDone = () => (typeof player !== 'undefined' && player.gem_offer_claimed) || !!($('gemOfferButton') && ($('gemOfferButton').disabled || /RECEBIDO|ENCERRADA/i.test($('gemOfferButton').textContent || '')));
/* pega as gemas de verdade: confere se coletou; se não coletou, deixa tentar de novo ou pular (nunca trava) */
async function claimGems() {
  for (let n = 0; n < 3; n++) {
    if (gemDone()) return;
    const clicked = await tap('#gemOfferButton', '30 GEMAS GRÁTIS', 'Presente de boas-vindas! Toque em COLETAR para pegar suas gemas.', { step: '2 · PRESENTES', wait: 2500 });
    if (!clicked) return;
    await waitFor(() => gemDone() || overlayOpen(), 6000);
    await waitClear();
    if (gemDone()) return;
    const c = await say('NÃO DEU CERTO', 'Não consegui coletar as gemas agora. Quer tentar de novo ou continuar o tutorial?', ['TENTAR DE NOVO', 'CONTINUAR'], { step: '2 · PRESENTES' });
    if (c === 1) return;
  }
}
/* abre a Mini Caixa de verdade: se não abrir, deixa tentar de novo ou pular */
async function openMini() {
  for (let n = 0; n < 3; n++) {
    const clicked = await tap('#box_mini .bx-go, #box_mini .box-action', 'MINI CAIXA GRÁTIS', 'Você tem caixas grátis todos os dias. Toque para abrir a primeira!', { step: '2 · PRESENTES', wait: 2500 });
    if (!clicked) return;
    const opened = await waitFor(() => overlayOpen(), 4500);
    await waitClear();
    if (opened) return;
    const c = await say('NÃO DEU CERTO', 'A caixa não abriu agora. Quer tentar de novo ou continuar o tutorial?', ['TENTAR DE NOVO', 'CONTINUAR'], { step: '2 · PRESENTES' });
    if (c === 1) return;
  }
}

/* destaca um elemento e espera o jogador tocar em "ENTENDI" */
async function point(sel, title, text, label = 'ENTENDI', opt = {}) {
  const el = await waitFor(() => find(sel), 9000); if (!el) return false;
  await sleep(120); await new Promise(res => show(title, text, { el, noHand: true, step: opt.step || '', buttons: [{ label, cls: 'prim', fn: () => { hide(); res(); } }] })); return true;
}

/* ---------- o tutorial concluído fica salvo na CONTA (servidor, ou neste aparelho se for conta local/convidado) ---------- */
const accDone = () => { try { return !!(window.tutorialIsDone && window.tutorialIsDone()); } catch (_) { return false; } };
async function finish() {
  st.stage = 'done'; st.done = true; st.redo = false; save(st);   // reserva neste aparelho caso o servidor não responda agora
  try { await window.markTutorialDone(); } catch (e) { console.warn('tutorial: não salvou na conta', e); }
}

/* ---------- PARTE 1 ---------- */
async function part1() {
  // espera o lobby (depois do login/avisos) sem desistir cedo: conta antiga também faz o tutorial completo
  if (!await waitFor(() => vis($('lobby')) && !overlayOpen(), 1800000)) return; await sleep(800);
  // a conta já concluiu (em qualquer aparelho)? então não repete, a menos que tenha tocado em REFAZER
  if (!st.redo && (accDone() || st.done)) { if (!accDone()) { try { window.markTutorialDone(); } catch (_) { } } st.stage = 'done'; st.done = true; save(st); return; }
  st.done = false; st.stage = 'new'; save(st);
  const w = await say('BEM-VINDO À CYBERARENA!', 'Vou te mostrar o básico em poucos passos e você já joga sua primeira partida. Vamos?', ['COMEÇAR', 'PULAR TUTORIAL'], { step: 'TUTORIAL' });
  if (w === 1) { await finish(); return; }
  // 1 · personagens
  await tap('.l2-chars', 'SEUS PERSONAGENS', 'Aqui ficam seus lutadores. Toque em PERSONAGENS.', { step: '1 · PERSONAGEM' });
  await waitFor(() => vis($('characters')));
  await tap('#characters .lc-chars button[data-char="cyber"]', 'ESCOLHA O CYBER', 'O Cyber será o seu lutador na primeira partida. Toque nele.', { step: '1 · PERSONAGEM' });
  await sleep(500);
  // 2 · loja
  const shopNav = await waitFor(() => navBtn('characters', 'LOJA'));
  if (shopNav) await tap('#characters .ca-nav button:nth-child(3)', 'LOJA', 'Agora vamos pegar seus presentes grátis. Toque em LOJA.', { step: '2 · PRESENTES' });
  else window.openScreen && window.openScreen('shop');
  await waitFor(() => vis($('shop')));
  await tap('.shop-sidebar button:nth-child(2)', 'CAIXAS', 'Toque em CAIXAS para ver as ofertas grátis.', { step: '2 · PRESENTES' });
  await sleep(600);
  await claimGems();
  await openMini();
  // 3 · lobby + mapas
  await tap('#shop .ca-nav button:nth-child(1)', 'VOLTAR AO LOBBY', 'Pronto! Agora volte ao lobby.', { step: '3 · MAPAS' });
  await waitFor(() => vis($('lobby')));
  await tap('#mcModeBtn', 'MAPAS', 'Toque aqui para escolher onde jogar.', { step: '3 · MAPAS' });
  await waitFor(() => vis($('modesScreen')));
  await tap('#modesScreen .mm-card[data-id="battle"] .mm-go', 'BATALHA · 16 JOGADORES', 'Esse é o modo principal: 16 jogadores, só um fica de pé. Toque em ESCOLHER.', { step: '3 · MAPAS' });
  await sleep(500);
  // 4 · gráficos
  await tap('.lobby-settings', 'CONFIGURAÇÕES', 'Vamos ajustar os gráficos para o jogo rodar liso. Toque na engrenagem.', { step: '4 · GRÁFICOS' });
  await waitFor(() => vis($('gfxQuality')));
  try { window.setGraphicsQuality('ultra'); window.syncGraphicsUI && window.syncGraphicsUI(); } catch (_) { }
  await point('#gfxQuality', 'GRÁFICOS: ULTRA LEVE', 'Deixei no ULTRA LEVE para rodar liso em qualquer aparelho. Se o seu aparelho for bom, você poderá aumentar os gráficos depois.', 'ENTENDI', { step: '4 · GRÁFICOS' });
  await tap('.settings-done', 'PRONTO', 'Toque em PRONTO para fechar.', { step: '4 · GRÁFICOS' });
  await sleep(500);
  await playStep();
}
async function playStep() {
  const goTut = () => { st.stage = 'inmatch'; st.matched = false; save(st); try { window.openWorldRaw('battle', '&tut=1&offline=1&perf=low', ''); } catch (e) { console.warn(e); } };
  const orig = window.startGame; window.startGame = () => { window.startGame = orig; goTut(); };
  const ok = await tap('.l2-play', 'SUA PRIMEIRA PARTIDA', 'Essa partida é guiada: eu vou te ensinar a lutar. Toque em JOGAR!', { step: '5 · JOGAR' });
  if (!ok) window.startGame = orig;
}

/* ---------- PARTE 2 (depois da partida) ---------- */
const MODE_INFO = {
  battle: 'BATALHA: 16 jogadores entram, só um fica de pé. Você ganha troféus, XP e recompensas.',
  open: 'MUNDO ABERTO: o mesmo vale, sem luta. Passeie, converse e encontre outros jogadores.',
  space: 'TREINO: uma plataforma no espaço para testar seus poderes sem pressa e sem risco.',
  soccer_gold: 'FUTEBOL: estádio ao pôr do sol, com bola de física real e pênaltis.',
  soccer_blue: 'FUTEBOL: o mesmo campo à noite, com luzes azuis.'
};
async function part2() {
  await waitFor(() => vis($('lobby')) && !overlayOpen(), 600000); await sleep(700);
  if (!st.matched) { await say('VAMOS TENTAR DE NOVO?', 'Você saiu antes de terminar a partida guiada. Ela é rápida e vale recompensas!', ['OK'], { step: '5 · JOGAR' }); await playStep(); return; }
  await say('PARTIDA CONCLUÍDA!', 'Você ganhou XP, moedas e fichas. Agora vamos usar tudo isso para EVOLUIR o Cyber e ficar mais forte.', ['VAMOS'], { step: 'EVOLUÇÃO' });
  await tap('.l2-chars', 'PERSONAGENS', 'Toque em PERSONAGENS.', { step: '6 · EVOLUIR' });
  await waitFor(() => vis($('characters')));
  await tap('#characters .lc-chars button[data-char="cyber"]', 'CYBER', 'Selecione o Cyber.', { step: '6 · EVOLUIR' });
  await sleep(700);
  if (await tap('#evoBox .ev-btn:not([disabled])', 'EVOLUIR!', 'Seu Cyber já tem XP e recursos suficientes. Toque em EVOLUIR para ficar mais forte!', { step: '6 · EVOLUIR', wait: 8000 })) await waitClear();
  else await say('EVOLUÇÃO', 'Evoluir gasta XP e recursos. Quando a barra estiver cheia, o botão EVOLUIR acende. Jogue partidas para juntar tudo!', ['OK'], { step: '6 · EVOLUIR' });
  await tap('#characters .ca-nav button:nth-child(1)', 'VOLTAR AO LOBBY', 'Agora volte ao lobby.', { step: '7 · MAPAS' });
  await waitFor(() => vis($('lobby')));
  await tap('#mcModeBtn', 'MAPAS', 'Vamos ver o que cada mapa faz. Toque em MAPAS.', { step: '7 · MAPAS' });
  await waitFor(() => vis($('modesScreen')));
  for (const id of ['battle', 'open', 'space', 'soccer_gold']) {
    const card = await waitFor(() => find(`#modesScreen .mm-card[data-id="${id}"]`), 4000); if (!card) continue;
    try { card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' }); } catch (_) { }
    await sleep(250);
    await point(`#modesScreen .mm-card[data-id="${id}"]`, card.querySelector('h3')?.textContent || id, MODE_INFO[id], id === 'soccer_gold' ? 'ENTENDI' : 'PRÓXIMO', { step: '7 · MAPAS' });
  }
  const bat = await waitFor(() => find('#modesScreen .mm-card[data-id="battle"]'), 3000);
  if (bat) { try { bat.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' }); } catch (_) { } await sleep(250); }
  await tap('#modesScreen .mm-card[data-id="battle"] .mm-go', 'SEU MAPA ESCOLHIDO', 'Vamos deixar a BATALHA como seu modo. Toque em ESCOLHER.', { step: '7 · MAPAS' });
  await sleep(500);
  await tap('.lobby-settings', 'CONFIGURAÇÕES', 'Última coisa: os gráficos. Toque na engrenagem.', { step: '8 · GRÁFICOS' });
  await waitFor(() => vis($('gfxQuality')));
  const gq = await waitFor(() => find('#gfxQuality'), 6000);
  if (gq) await new Promise(res => {
    const pick = v => () => { try { if (v) { window.setGraphicsQuality(v); window.syncGraphicsUI && window.syncGraphicsUI(); } } catch (_) { } hide(); res(); };
    show('QUER AUMENTAR A QUALIDADE?', 'Seus gráficos estão no ULTRA LEVE. Se o jogo rodou liso no seu aparelho, você pode subir a qualidade (vale na próxima partida). Se travar, é só voltar.', { el: gq, noHand: true, step: '8 · GRÁFICOS', buttons: [{ label: 'DEIXAR ASSIM', cls: 'prim', fn: pick(null) }, { label: 'AUMENTAR (LEVE)', fn: pick('low') }, { label: 'AUMENTAR (ALTO)', fn: pick('medium') }] });
  });
  await tap('.settings-done', 'PRONTO', 'Toque em PRONTO para fechar.', { step: '8 · GRÁFICOS' });
  await sleep(400);
  await say('TUTORIAL CONCLUÍDO!', 'Agora é com você. Evolua seus personagens, abra caixas e suba nos troféus. Boa sorte na arena!', ['JOGAR!'], { step: 'FIM' });
  await finish();
}

/* ---------- controle ---------- */
async function run() {
  if (running) return; running = true; build(); startLoop();
  try {
    if (st.stage === 'inmatch') await part2(); else if (!st.stage || st.stage === 'new') await part1();
  } catch (e) { console.warn('tutorial', e); hide(); }
  running = false;
}
function boot() {
  build();
  if (new URLSearchParams(location.search).get('tutorial') === '1') { st = { stage: 'new', redo: true }; save(st); }
  if (st.done && !st.redo) return;
  if (st.stage === 'inmatch') { run(); return; }
  st.stage = 'new'; run();   // quem decide se repete é a conta (part1)
}
/* volta da partida: continua o tutorial */
addEventListener('message', e => { if (e.data && e.data.type === 'cyberarena:match-result' && st.stage === 'inmatch') { st.matched = true; save(st); }
  if (e.data && e.data.type === 'cyberarena:exit-world' && st.stage === 'inmatch' && !running) setTimeout(run, 600); });
window.CATut = {
  restart() {
    if (running) return;
    try { window.closeSettings && window.closeSettings(); } catch (_) { }
    hide(); st = { stage: 'new', redo: true }; save(st); setTimeout(run, 350);
  },
  get state() { return st; }
};
if (document.readyState === 'complete') setTimeout(boot, 1200); else addEventListener('load', () => setTimeout(boot, 1200));
