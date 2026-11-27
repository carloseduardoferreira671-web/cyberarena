/* CyberArena · lobby 3D: personagem no lobby, seleção de modo (Batalha 16 / Mundo Aberto), sala com amigos,
   tela de personagens, troféus, rank, nível e ranking global. */
import { Net, getIdentity, saveIdentity, rankOf, levelOf } from './mundo/js/net.js';
import { initParty } from './party.js';

/* Sem skins: existe só o visual padrão (mantido só porque o servidor e o jogo ainda recebem o campo 'skin'). */
const SKINS = [{ id: 'cyber', name: 'Cyber', lvl: 1, c: '#2a8cff', a: '#38f2ff' }];
const CHARS = [{ id: 'nexus', name: 'NEXUS', t: 'CONTROLE', d: 'Agente ciborgue que prende e puxa inimigos com buracos negros. A maior vida dos três, com dano um pouco menor.' },
  { id: 'cyber', name: 'CYBER', t: 'EQUILIBRADO', d: 'O original. A menor vida e o maior dano dos três, com feixe devastador de longo alcance e um super letal.' },
  { id: 'atlas', name: 'ATLAS', t: 'TANQUE', d: 'Combatente de força extrema semi-humano: o mais rápido dos três e o segundo em vida. Reflete dano e leva a luta ao abismo.' }];
const $ = id => document.getElementById(id);
const curChar = () => ['cyber', 'nexus', 'atlas'].includes(getIdentity().char) ? getIdentity().char : 'nexus';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const net = new Net(getIdentity());
const S = { mode: localStorage.getItem('cyberarena.mode') || 'battle', code: sessionStorage.getItem('cyberarena.code') || '', profile: null, party: '' };
const hooks = { afterMode: null, beforePlay: null };   // preenchidos por party.js

/* ---------- personagem no lobby ---------- */
/* O personagem 3D é desenhado direto nesta página (sem iframe): cada página dentro de um iframe
   recebia a sua própria cópia do selo da hospedagem, por isso apareciam vários. */
let heroMods = null;
const loadHeroMods = () => heroMods || (heroMods = Promise.all([import('./mundo/js/hero.js'), import('./mundo/js/classic.js')]));
/* pacotes baixáveis (ver mundo/js/packs.js): o essencial é exigido uma vez; os outros personagens são pedidos quando escolhidos */
const packsUI = () => import('./mundo/js/packs_ui.js');
/* v141: nada é forçado. Se o personagem ainda não foi baixado, o lobby mostra um aviso no lugar dele e o jogador
   baixa pela barra DOWNLOADS (ui2/boot.js). Ao terminar, __remountHero() monta o personagem. */
async function ensureChar(c) {
  let P; try { P = await import('./mundo/js/packs.js'); } catch (e) { console.warn('pacotes', e); return; }
  if (!P.PACKS_ON) return;
  if (!(await P.isInstalled(c))) { const e = new Error('personagem não baixado: ' + c); e.need = true; throw e; }
}
window.openPacksMenu = () => window.cyberOpenDownloads && window.cyberOpenDownloads();
window.__curChar = () => curChar();
async function heroFactory(c) {
  await ensureChar(c);
  const [{ Hero }, { loadClassic, makeCharacter }] = await loadHeroMods();
  if (c === 'cyber') { try { await loadClassic(); } catch (e) { console.error(e); } }
  if (c === 'atlas' || c === 'nexus' || c === 'cyber') { try { (await import('./mundo/js/classic.js')).loadAtlasGLB && await (await import('./mundo/js/classic.js')).loadAtlasGLB(); } catch (e) { console.warn('Atlas GLB', e); } }
  return id => makeCharacter(c, id);
}
async function mountHero(el) {
  if (el._p || el._busy || el._need) return; el._busy = true;
  try {
    const [{ createPortrait }] = await loadHeroMods();
    const m = el._mate;   // colega do grupo: usa o personagem/visual dele, em modo leve (30 FPS)
    const char = m ? m.char : curChar(), skin = m ? m.skin : (getIdentity().skin || 'cyber'), f = await heroFactory(char);
    if (el._paused) return;
    el.innerHTML = '<canvas></canvas>';
    el._p = createPortrait(el.firstChild, skin, m ? { factory: f, lite: true } : portraitOpts(f, char)); el._char = char; window.__heroMounted = true;
  } catch (e) { if (e && e.need) { el._need = true; el._needChar = curChar(); el.innerHTML = '<div class="hero3d-need" onclick="window.cyberOpenDownloads&&window.cyberOpenDownloads()"><b>⬇</b><span>PERSONAGEM NÃO BAIXADO</span><small>Toque aqui ou na barra DOWNLOADS</small></div>'; } else console.error(e); } finally { el._busy = false; }
}
window.__remountHero = () => { for (const el of document.querySelectorAll('.hero3d')) { if (el._mate || !el._need) continue; el._need = false; el.innerHTML = '<span class="hero3d-ld">CARREGANDO…</span>'; if (!el._paused) mountHero(el); } };
/* NEXUS no lobby: cria um mini buraco negro na palma da mão e fica parado segurando, só respirando */
window.__mountHero = mountHero;
let powersMod = null;
function portraitOpts(f, char) {
  // Todos os personagens do lobby usam a mesma pose neutra. Sem orbHold, gestos ou animação automática.
  return { factory: f };
}
function heroFrame(id, cls) { const el = document.createElement('div'); el.id = id; el.className = cls; el.innerHTML = '<span class="hero3d-ld">CARREGANDO…</span>'; mountHero(el); return el; }
function sendSkin(id) { for (const el of document.querySelectorAll('.hero3d')) if (!el._mate) try { el._p && el._p.setSkin(id); } catch (_) { } }
function setChar(c) { saveIdentity({ char: c }); for (const el of document.querySelectorAll('.hero3d')) { if (el._mate) continue; if (el._need) { el._need = false; el.innerHTML = '<span class="hero3d-ld">CARREGANDO…</span>'; mountHero(el); continue; } if (el._p && el._char !== c) { try { el._p.dispose(); } catch (_) { } el._p = null; el.innerHTML = '<span class="hero3d-ld">CARREGANDO…</span>'; mountHero(el); } } renderChars(); }
function playHero(id, name) { try { $(id)._p.play(name); } catch (_) { } }
window.cyberPreview = n => playHero('charHero', n);   // botão ▶ dos ataques na tela de personagens
function pauseHeroes(p) { for (const el of document.querySelectorAll('.hero3d')) { el._paused = p; if (p) { if (el._p) { try { el._p.dispose(); } catch (_) { } el._p = null; el.innerHTML = ''; } } else mountHero(el); } }

const center = document.querySelector('#lobby .lobby-center');
if (center) {
  center.classList.add('lc3d');
  center.innerHTML = '';
  center.appendChild(heroFrame('lobbyHero', 'hero3d lobby-hero'));
  const card = document.createElement('aside'); card.className = 'mode-card l2-modepanel'; card.id = 'modeCard';
  const IC = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
  card.innerHTML = `<div class="mc-top"><span class="mc-rank" id="mcRank">0 · Bronze</span><button class="mc-mini" id="mcRankBtn">${IC('trophy')}RANKING</button></div>
    <div class="mc-tabs l2-modes"><button class="l2-mode" data-m="battle"><span class="l2-mi">${IC('sword')}</span><span class="l2-mt"><b>BATALHA</b><small>16 JOGADORES</small></span><i class="l2-ck">${IC('check')}</i></button><button class="l2-mode" data-m="open"><span class="l2-mi">${IC('globe')}</span><span class="l2-mt"><b>MUNDO ABERTO</b><small>SOCIAL · CHAT</small></span><i class="l2-ck">${IC('check')}</i></button><button class="l2-mode" data-m="space"><span class="l2-mi">${IC('planet')}</span><span class="l2-mt"><b>TESTE DE PODERES</b><small>ONLINE · TREINO</small></span><i class="l2-ck">${IC('check')}</i></button></div>
    <p id="mcDesc"></p><div class="mc-bottom"><button class="mc-mini" id="mcFriends">${IC('key')}SALA POR CÓDIGO</button><span id="mcCode"></span></div><div id="mcOnline"></div>`;
  (document.querySelector('#lobby .screen-safe') || center).appendChild(card);
  card.querySelectorAll('.mc-tabs button').forEach(b => b.onclick = () => { S.mode = b.dataset.m; localStorage.setItem('cyberarena.mode', S.mode); renderMode(); });
  $('mcFriends').onclick = openFriends; $('mcRankBtn').onclick = openRanking;
  const refreshOnline = async () => { const el = $('mcOnline'); if (!el) return; const r = await net.onlineCount(); el.textContent = r ? '' : 'Sem conexão com o servidor (modo offline)'; el.classList.toggle('off', !r); };
  import('./modes.js').then(m => m.initModes({ S, renderMode, play: () => window.startGame() })).catch(e => console.warn('modos', e));
  refreshOnline(); setInterval(() => { if (!document.hidden) refreshOnline(); }, 10000);
}
function renderMode() {
  document.querySelectorAll('.mc-tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
  const d = $('mcDesc'); if (d) d.textContent = S.mode === 'space' ? 'Só você no mundo espacial com 4 bots que não atacam. Teste à vontade a habilidade, o super e os poderes novos: a energia recarrega rápido e não há recarga longa.' : S.mode === 'battle' ? 'Batalha até o último de pé (sem zona, 6 minutos): troféus e XP. Se faltar gente, bots inteligentes completam os 16.' : 'Explore o Vale da Casona com até 16 jogadores, converse no chat e use emotes. Sem combate, entre e saia quando quiser.';
  const c = $('mcCode'); if (c) c.innerHTML = S.code ? `Sala: <b>${esc(S.code)}</b> <button class="mc-x" id="mcLeave">✕</button>` : '<span style="opacity:.6">Partida pública</span>';
  if ($('mcLeave')) $('mcLeave').onclick = () => { S.code = ''; sessionStorage.removeItem('cyberarena.code'); renderMode(); };
  const pb = document.querySelector('#lobby .play-button'); if (pb) (pb.querySelector('.l2-lab') || pb).textContent = S.mode === 'battle' ? 'JOGAR' : S.mode === 'space' ? 'TESTAR' : 'ENTRAR';
  if (window.__modesRefresh) window.__modesRefresh();
  if (hooks.afterMode) hooks.afterMode();
}

/* ---------- abrir o mundo 3D ---------- */
function openWorld(mode, extra = '', code = S.code) {
  if (window.cyberNeedRes && !window.cyberNeedRes()) return;   // sem os recursos: abre a barra de downloads em vez de entrar
  if (window.cyberOfflineMode) {   // v153: modo offline = só contra bots e sem progresso; Mundo Aberto precisa de internet
    if (mode === 'open') { toast('Mundo Aberto precisa de internet.'); return; }
    code = ''; if (!extra.includes('offline=1')) extra += '&offline=1'; if (!extra.includes('noprog=1')) extra += '&noprog=1';
  }
  try { window.closeCharacterTestMenu?.(); } catch (_) { }
  let w = $('world3d'); if (!w) { w = document.createElement('iframe'); w.id = 'world3d'; w.className = 'world3d-frame'; w.setAttribute('allow', 'fullscreen; autoplay'); w.title = 'CyberArena · Mundo 3D'; document.body.appendChild(w); }
  const id = getIdentity(); w.src = `mundo/index.html?mode=${mode}&char=${curChar()}${code && mode !== 'train' && mode !== 'space' ? '&code=' + encodeURIComponent(code) : ''}${S.party && (mode === 'battle' || mode === 'open' || mode === 'space' || mode.startsWith('soccer')) && !extra.includes('offline') ? '&party=' + S.party : ''}${extra}`; w.classList.remove('hidden');
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); document.body.classList.add('world3d-open'); pauseHeroes(true);
  try { const m = $('lobbyMusic'); if (m && !m.paused) m.pause(); const m2 = $('lobbyMusicB'); if (m2 && !m2.paused) m2.pause(); } catch (_) { }
  try { window.playUISound?.('play'); } catch (_) { } setTimeout(() => { try { w.focus(); } catch (_) { } }, 300);
  if (window.top !== window.self) { try { parent.postMessage({ type: 'cyberarena:gesture' }, '*'); } catch (_) { } }
  else if (document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) document.documentElement.requestFullscreen().then(() => screen.orientation?.lock?.('landscape').catch(() => { })).catch(() => { });
}
window.openWorldRaw = openWorld;
window.openWorld3D = m => openWorld(m === 'solo' ? 'train' : m === 'bot' ? 'battle' : (m || 'battle'), m === 'bot' ? '&offline=1' : '');
window.startGame = () => { if (hooks.beforePlay && hooks.beforePlay() === false) return; openWorld(S.mode); };
window.startTraining = m => openWorld(m === 'solo' ? 'train' : 'battle', m === 'solo' ? '' : '&offline=1');
addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'cyberarena:exit-world') { pauseHeroes(false); setTimeout(refreshProfile, 400); }
  if (e.data.type === 'cyberarena:match-result' && !(e.data.result && e.data.result.noprog) && !window.cyberOfflineMode) { const r = e.data.result; if (r && r.profile) { S.profile = r.profile; renderProfile(); } toast(`Partida: #${r.placement} · ${r.kills} abates · ${r.trophiesDelta >= 0 ? '+' : ''}${r.trophiesDelta} 🏆 · +${r.xpGain} XP`); }
});

/* ---------- sala com amigos ---------- */
function modal(html) { let m = $('l3dModal'); if (!m) { m = document.createElement('div'); m.id = 'l3dModal'; m.className = 'l3d-modal'; document.body.appendChild(m); m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.add('hidden'); }); } m.innerHTML = `<div class="l3d-card panel">${html}</div>`; m.classList.remove('hidden'); return m; }
function openFriends() {
  const m = modal(`<div class="fr2"><div class="rk2-h"><div><small class="l3d-k">JOGAR COM AMIGOS</small><h2>Sala privada</h2></div><button id="fClose" class="rk2-x">✕</button></div>
    <div class="fr2-g"><div class="fr2-c"><b>1 · CRIE UM CÓDIGO</b><p>Mande para seus amigos. Quem usar o mesmo código entra na mesma partida (Batalha) ou no mesmo mundo (Mundo Aberto).</p>
      <div id="fShow" class="l3d-code hidden"></div><div class="l3d-row"><button id="fCreate" class="l3d-prim">CRIAR CÓDIGO</button></div></div>
    <div class="fr2-c"><b>2 · OU ENTRE COM UM CÓDIGO</b><p>Digite o código que seu amigo mandou e aperte JOGAR no lobby.</p>
      <div class="l3d-row"><input id="fIn" maxlength="8" placeholder="Código da sala" autocomplete="off"><button id="fJoin">ENTRAR</button></div></div></div>
    <details class="fr2-adv"><summary>Avançado: servidor próprio</summary><div class="l3d-row"><input id="fApi" placeholder="https://seu-servidor" autocomplete="off" value="${esc(localStorage.getItem('cyberarena.api') || '')}"><button id="fApiSave">SALVAR</button></div></details></div>`);
  m.classList.add('rk2-modal');
  $('fApiSave').onclick = () => { let v = $('fApi').value.trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//.test(v)) { toast('Use https://…'); return; } if (v && !/\/api$/.test(v)) v += '/api'; localStorage.setItem('cyberarena.api', v); toast(v ? 'Servidor salvo. Reiniciando…' : 'Servidor padrão restaurado. Reiniciando…'); setTimeout(() => location.reload(), 700); };
  const show = c => { const s = $('fShow'); s.classList.remove('hidden'); s.innerHTML = `<b>${esc(c)}</b><button id="fCopy">COPIAR</button>${navigator.share ? '<button id="fShare">COMPARTILHAR</button>' : ''}`; $('fCopy').onclick = () => { navigator.clipboard?.writeText(c); toast('Código copiado!'); }; if ($('fShare')) $('fShare').onclick = () => navigator.share({ title: 'CyberArena', text: `Entra na minha sala no CyberArena! Código: ${c}` }).catch(() => { }); };
  if (S.code) show(S.code);
  $('fCreate').onclick = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[(Math.random() * A.length) | 0]; setCode(c); show(c); };
  $('fJoin').onclick = () => { const c = $('fIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); if (c.length < 3) { toast('Código inválido'); return; } setCode(c); m.classList.add('hidden'); toast('Sala ' + c + ' selecionada. Aperte JOGAR!'); };
  $('fClose').onclick = () => m.classList.add('hidden');
}
function setCode(c) { S.code = c; sessionStorage.setItem('cyberarena.code', c); renderMode(); }

/* ---------- ranking ---------- */
async function openRanking() {
  const medal = ['🥇', '🥈', '🥉'];
  const m = modal(`<div class="rk2"><div class="rk2-h"><div><small class="l3d-k">RANKING GLOBAL</small><h2>Top 50 por troféus</h2></div><button id="rkClose" class="rk2-x">✕</button></div><div id="rkList" class="rk2-b"><p class="rk2-ld">Carregando…</p></div></div>`);
  m.classList.add('rk2-modal'); $('rkClose').onclick = () => m.classList.add('hidden');
  const load = async () => {
    const list = await net.leaderboard(); const idn = getIdentity(), me = (idn.playerId || '').slice(0, 6), pr = S.profile || {};
    const mt = +pr.trophies || 0, mr = rankOf(mt), mine = list && list.find(p => p.id === me);
    const meCard = `<div class="rk2-me"><div class="rk2-av">${esc((idn.name || 'CA').slice(0, 2).toUpperCase())}</div><div><b>${esc(idn.name || 'VOCÊ')}</b><small>${esc(mr.name)} · Nv ${(pr.level || (levelOf(+pr.xp || 0).level)) || 1}</small></div><div class="rk2-t">🏆 <b>${mt}</b></div><div class="rk2-pos">${mine ? '#' + mine.pos : list ? 'fora do Top 50' : 'sem conexão'}</div></div>`;
    if (!list) { $('rkList').innerHTML = meCard + '<div class="rk2-off"><b>Ranking indisponível</b><span>Sem conexão com o servidor. Seus troféus continuam salvos e entram no ranking quando ele voltar.</span><button id="rkRetry">TENTAR DE NOVO</button></div>'; $('rkRetry').onclick = () => { $('rkList').innerHTML = '<p class="rk2-ld">Carregando…</p>'; load(); }; return; }
    if (!list.length) { $('rkList').innerHTML = meCard + '<div class="rk2-off"><b>Ninguém no ranking ainda</b><span>Jogue uma partida e seja o primeiro!</span></div>'; return; }
    const top = list.slice(0, 3), rest = list.slice(3), order = [1, 0, 2];
    const pod = `<div class="rk2-pod">${order.filter(i => top[i]).map(i => { const p = top[i]; return `<div class="rk2-p pd${i + 1} ${p.id === me ? 'me' : ''}"><span class="rk2-md">${medal[i]}</span><div class="rk2-pav">${esc(String(p.name).slice(0, 2).toUpperCase())}</div><b>${esc(p.name)}</b><small>${esc(p.rank)}</small><em>🏆 ${p.trophies}</em></div>`; }).join('')}</div>`;
    $('rkList').innerHTML = meCard + pod + `<div class="rk2-ls">${rest.map(p => `<div class="rk ${p.id === me ? 'me' : ''}"><b>#${p.pos}</b><span>${esc(p.name)}</span><small>${esc(p.rank)} · Nv ${p.level}</small><em>🏆 ${p.trophies}</em></div>`).join('')}</div>`;
  };
  load();
}

/* ---------- tela de personagens ---------- */
function buildCharacters() {
  const page = document.querySelector('#characters .character-page'); if (!page) return;
  page.className = 'character-page l3d-char';
  page.innerHTML = `<div class="lc-view panel"></div><div class="lc-side panel"><small class="l3d-k" id="lcKind">PERSONAGEM</small><h2 id="lcName">NEXUS</h2>
    <div class="lc-chars">${CHARS.map(c => `<button data-char="${c.id}">${c.name}<small>${c.t}</small></button>`).join('')}</div>
    <p class="lc-desc" id="lcDesc"></p>
    <div class="lc-name"><input id="lcNameIn" maxlength="16" placeholder="Seu nome"><button id="lcNameOk">SALVAR NOME</button></div></div>`;
  page.querySelector('.lc-view').appendChild(heroFrame('charHero', 'hero3d char-hero'));
  page.querySelectorAll('.lc-chars button').forEach(b => b.onclick = () => setChar(b.dataset.char));
  $('lcNameOk').onclick = async () => { if (window.cyberOfflineMode) { toast('Indisponível no modo offline. Conecte-se à internet para usar.'); return; } const n = $('lcNameIn').value.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16); if (n.length < 2) { toast('Nome muito curto'); return; } saveIdentity({ name: n }); const p = await net.profile({ name: n }); S.profile = p; renderProfile(); toast('Nome salvo!'); };
}
function renderChars() {
  const c = curChar(), d = CHARS.find(x => x.id === c) || CHARS[0], set = (i, v) => { if ($(i)) $(i).textContent = v; };
  set('lcName', d.name); set('lcKind', d.t); set('lcDesc', d.d);
  document.querySelectorAll('.lc-chars button').forEach(b => b.classList.toggle('on', b.dataset.char === c));
}
function renderProfile() {
  const p = S.profile; if (!p) return; const r = p.rank || rankOf(p.trophies), tier = ['', 'I', 'II', 'III'][r.tier] || '';
  if ($('mcRank')) $('mcRank').textContent = `🏆 ${p.trophies} · ${r.name} ${tier} · Nv ${p.level}`;
  const set = (i, v) => { if ($(i)) $(i).textContent = v; };
  set('lcT', p.trophies); set('lcR', r.name + ' ' + tier); set('lcL', p.level); set('lcW', p.wins); set('lcK', p.kills); set('lcM', p.matches);
  if ($('lcXp')) $('lcXp').style.width = (p.levelXp / p.levelNext * 100) + '%'; set('lcXpT', `${p.levelXp} / ${p.levelNext} XP para o nível ${p.level + 1}` + (p.offline ? ' · offline' : ''));
  if ($('lcNameIn') && !$('lcNameIn').value) $('lcNameIn').value = p.name || '';
}
async function refreshProfile() { S.profile = await net.profile(); renderProfile(); }
let toastT = 0; function toast(t) { let el = $('l3dToast'); if (!el) { el = document.createElement('div'); el.id = 'l3dToast'; document.body.appendChild(el); } el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3200); }

try { if (getIdentity().skin !== 'cyber') saveIdentity({ skin: 'cyber' }); } catch (_) { }
buildCharacters(); renderMode(); renderChars(); refreshProfile();
initParty({ net, S, hooks, $, esc, toast, getIdentity, saveIdentity, SKINS, mountHero, openWorld, renderMode, refreshProfile });
