/* CyberArena · AMIGOS + GRUPO no lobby (estilo Brawl Stars / Free Fire / Fortnite).
   - botão AMIGOS: seu código de amigo, adicionar por código, pedidos, lista com status e CONVIDAR
   - grupo de até 4: os personagens aparecem juntos no lobby, cada um com nome, líder, balão de chat e ícone de voz
   - chat de texto do grupo e chat de voz (WebRTC, voice.js)
   - o LÍDER aperta JOGAR e o grupo inteiro entra junto (mesma sala de Batalha / Mundo Aberto)
   Servidor: online-server/social.mjs (rotas /api/social/*). Em servidores sem essas rotas o botão avisa e o resto do jogo segue normal. */
import { VoiceMesh } from './voice.js';

const MODE_NAME = { battle: 'BATALHA', open: 'MUNDO ABERTO', space: 'TESTE DE PODERES' };
const STATUS = { lobby: ['on', 'ONLINE · LOBBY'], battle: ['play', 'EM PARTIDA · BATALHA'], open: ['play', 'EM PARTIDA · MUNDO ABERTO'], offline: ['off', 'OFFLINE'] };

export function initParty(C) {
  const { net, S, hooks, $, esc, toast, getIdentity, saveIdentity, SKINS, mountHero, openWorld, renderMode, refreshProfile } = C;
  const center = document.querySelector('#lobby .lobby-center'), safe = document.querySelector('#lobby .screen-safe'), leftCol = document.querySelector('#lobby .lobby-left');
  if (!center || !safe) return;
  const me = () => getIdentity().playerId;
  const worldOpen = () => document.body.classList.contains('world3d-open');
  const P = { fcode: '', friends: [], reqs: [], invites: [], party: null, cursor: 0, sigCursor: 0, out: [], unsupported: false, offline: false, fails: 0, busy: false, timer: 0, unread: 0, seen: {}, ownStart: false, dismissed: new Set(), joining: false, panel: false, chat: false, sig: '', now: 0 };

  /* ---------- voz ---------- */
  const speaking = new Set(), hear = new Set(); const ping = () => { for (const f of hear) { try { f(); } catch (_) { } } };   // o mundo (iframe) escuta aqui
  const voice = new VoiceMesh({
    get myId() { return me(); },
    send: (to, data) => { P.out.push({ to, data }); if (P.out.length > 80) P.out.splice(0, P.out.length - 80); poke(); },
    getIce: () => (P.party && P.party.ice) || [{ urls: 'stun:stun.l.google.com:19302' }],
    onSpeak: (id, on) => { on ? speaking.add(id) : speaking.delete(id); const s = slots.get(id); if (s) s.root.classList.toggle('speak', on); ping(); },
    onChange: () => { renderBar(); ping(); },
  });
  addEventListener('pagehide', () => { try { voice.leave(); } catch (_) { } });

  /* ---------- peças da tela ---------- */
  if (leftCol) {
    const b = document.createElement('button'); b.id = 'btnFriends'; b.innerHTML = '<svg class="ic"><use href="#i-users"/></svg><small>AMIGOS</small><b class="pf-badge hidden" id="pfBadge">0</b>'; b.onclick = openPanel; leftCol.appendChild(b);
  }
  const bar = document.createElement('div'); bar.id = 'pBar'; bar.className = 'pbar hidden';
  bar.innerHTML = `<span class="pb-count" id="pbCount">👥 1/4</span>
    <button id="pbVoice" title="Chat de voz"><span class="ic">🎧</span><small>VOZ</small></button>
    <button id="pbMic" class="hidden" title="Ligar/desligar seu microfone"><span class="ic">🎤</span><small>MIC</small></button>
    <button id="pbChat" title="Chat do grupo"><span class="ic">💬</span><small>CHAT</small><i class="pf-badge hidden" id="pbUnread">0</i></button>
    <button id="pbAdd" title="Convidar amigos"><span class="ic">＋</span><small>CONVIDAR</small></button>
    <button id="pbLeave" title="Sair do grupo"><span class="ic">✕</span><small>SAIR</small></button>`;
  safe.appendChild(bar);
  const stage = document.createElement('div'); stage.id = 'pStage'; center.appendChild(stage);
  const chat = document.createElement('div'); chat.id = 'pChat'; chat.className = 'pchat hidden';
  chat.innerHTML = '<div class="pc-head"><b>CHAT DO GRUPO</b><button id="pcClose">✕</button></div><div class="pc-list" id="pcList"></div><div class="pc-in"><input id="pcInput" maxlength="120" placeholder="Digite e aperte enviar" autocomplete="off"><button id="pcSend">ENVIAR</button></div>';
  safe.appendChild(chat);
  const inv = document.createElement('div'); inv.id = 'pInv'; safe.appendChild(inv);
  const plus = document.createElement('button'); plus.id = 'pPlus'; plus.className = 'pplus'; plus.innerHTML = '<span>＋</span><small>CONVIDAR</small>'; stage.appendChild(plus);
  plus.onclick = () => { if (P.unsupported) toast('Este servidor ainda não tem amigos e grupo'); else openPanel(); };
  const menu = document.createElement('div'); menu.id = 'pMenu'; menu.className = 'pmenu hidden'; stage.appendChild(menu);

  $('pbVoice').onclick = toggleVoice; $('pbMic').onclick = () => { voice.setMuted(!voice.muted); renderBar(); };
  $('pbChat').onclick = () => setChat(!P.chat); $('pcClose').onclick = () => setChat(false);
  $('pbAdd').onclick = openPanel; $('pbLeave').onclick = () => act('party/leave');
  const send = async () => { const i = $('pcInput'), t = i.value.trim(); if (!t) return; i.value = ''; await act('party/chat', { text: t }); };
  $('pcSend').onclick = send; $('pcInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  document.addEventListener('pointerdown', e => { if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !e.target.closest('.ptag')) menu.classList.add('hidden'); });

  async function act(path, body, quiet) {
    try { const r = await net.post('social/' + path, body || {}); poke(); return r; }
    catch (e) { if (!quiet) toast(e.status ? e.message : 'Sem conexão com o servidor'); return null; }
  }

  /* ---------- sincronização com o servidor ---------- */
  function poke() { clearTimeout(P.timer); P.timer = setTimeout(poll, 40); }
  function delay() {
    if (P.unsupported) return 60000;
    if (P.fails) return Math.min(10000, 1500 * 2 ** Math.min(P.fails, 3));
    const hid = document.hidden ? 4 : 1;
    if (P.party) return (voice.joined && voice.connecting ? 400 : worldOpen() ? 1200 : 700) * hid;
    return (worldOpen() ? 5000 : 2200) * hid;
  }
  async function poll() {
    clearTimeout(P.timer); if (P.busy) { P.timer = setTimeout(poll, 200); return; }
    P.busy = true; const id = getIdentity(), out = P.out.splice(0, 40), lead = P.party && P.party.leader === id.playerId;
    const body = { since: P.cursor, sigSince: P.sigCursor, name: id.name, skin: id.skin, char: ['cyber', 'nexus', 'atlas'].includes(id.char) ? id.char : 'nexus', out };
    if (lead) { body.mode = S.mode; body.code = S.code || null; }
    try { const r = await net.post('social/sync', body); P.fails = 0; P.offline = false; P.unsupported = false; apply(r); }
    catch (e) {
      P.out.unshift(...out);
      if (e.status === 404 || e.status === 405 || e.status === 501) { P.unsupported = true; } else { P.fails++; if (P.fails >= 2) P.offline = true; }
      layout(); renderPanel();
    } finally { P.busy = false; clearTimeout(P.timer); P.timer = setTimeout(poll, delay()); }
  }
  function apply(r) {
    P.now = r.serverNow; P.fcode = r.fcode; P.friends = r.friends; P.reqs = r.reqs; P.invites = r.invites; P.cursor = r.cursor; P.sigCursor = r.sigCursor;
    const prev = P.party, pt = r.party;
    if (prev && (!pt || pt.id !== prev.id)) { voice.leave(); S.party = ''; clearChat(); if (!pt) toast('Você saiu do grupo'); }
    if (pt && (!prev || pt.id !== prev.id)) { S.party = pt.id; P.seen[pt.id] = pt.start ? pt.start.n : 0; clearChat(); toast(pt.leader === me() && pt.members.length === 1 ? 'Grupo criado! Esperando seu amigo entrar…' : 'Você entrou no grupo!'); }
    P.party = pt;
    if (pt) {
      const mine = pt.members.find(m => m.id === me());
      if (mine && mine.voice && !voice.joined && !P.joining) act('party/voice', { on: false }, true);   // voz ficou ligada no servidor mas não aqui (recarregou a página)
      for (const m of r.msgs) addMsg(m, r.serverNow);
      if (voice.joined) voice.update(pt.members.filter(m => m.id !== me() && m.voice).map(m => m.id));
      for (const s of r.signals) voice.signal(s.from, s.data);
      handleStart(pt);
    }
    renderAll();
  }
  function handleStart(pt) {
    const st = pt.start; if (!st || st.n <= (P.seen[pt.id] || 0)) return; P.seen[pt.id] = st.n;
    if (P.ownStart) { P.ownStart = false; return; }                    // fui eu (líder) que iniciei: já abri a partida
    if (worldOpen() || P.now - st.t > 20000) return;
    const mode = st.mode === 'open' ? 'open' : st.mode === 'space' ? 'space' : 'battle'; toast(`O líder iniciou: ${MODE_NAME[mode]}`);
    openWorld(mode, '', st.code || '');
  }

  /* ---------- JOGAR em grupo: só o líder inicia, todos entram juntos ---------- */
  hooks.beforePlay = () => {
    const pt = P.party; if (!pt || pt.members.length < 2) return true;   // sem grupo (ou sozinho): jogo normal
    if (pt.leader !== me()) { toast('Só o líder do grupo inicia a partida'); return false; }
    P.ownStart = true;
    act('party/start', { mode: S.mode, code: S.code || null }).then(r => { if (r) openWorld(S.mode); else P.ownStart = false; });
    return false;
  };
  hooks.afterMode = () => {
    const pt = P.party, pb = document.querySelector('#lobby .play-button'), card = $('modeCard'), member = !!(pt && pt.members.length > 1 && pt.leader !== me());
    if (card) card.classList.toggle('pmember', member);
    if (pb) pb.classList.toggle('pwait', member);
    if (!member) return;
    if (pb) (pb.querySelector('.l2-lab') || pb).textContent = 'LÍDER INICIA';
    document.querySelectorAll('.mc-tabs button').forEach(b => b.classList.toggle('on', b.dataset.m === pt.mode));
    const d = $('mcDesc'); if (d) d.textContent = `O líder do grupo escolhe o modo (${MODE_NAME[pt.mode] || pt.mode}) e inicia a partida para todos.`;
  };

  /* ---------- voz ---------- */
  async function toggleVoice() {
    if (!P.party) return;
    if (voice.joined) { voice.leave(); await act('party/voice', { on: false }); renderBar(); return; }
    P.joining = true;
    try { await voice.join(); await act('party/voice', { on: true }); toast('Voz ligada! Fale com o grupo.'); }
    catch (e) { toast(e.message || 'Não consegui ligar a voz'); }
    P.joining = false; renderBar();
  }

  /* ---------- chat ---------- */
  function setChat(on) {
    P.chat = on && !!P.party; chat.classList.toggle('hidden', !P.chat);
    if (P.chat) { P.unread = 0; renderBar(); const l = $('pcList'); l.scrollTop = l.scrollHeight; if (!matchMedia('(pointer: coarse)').matches) $('pcInput').focus(); }
  }
  function clearChat() { $('pcList').innerHTML = ''; P.unread = 0; setChat(false); }
  function addMsg(m, now) {
    const row = document.createElement('div'), l = $('pcList'), stick = l.scrollTop + l.clientHeight >= l.scrollHeight - 30;
    row.className = 'pc-m' + (m.sys ? ' sys' : m.from === me() ? ' mine' : '');
    if (m.sys) row.textContent = m.text; else { const b = document.createElement('b'); b.textContent = m.name; row.append(b, ' ' + m.text); }
    l.appendChild(row); while (l.children.length > 80) l.firstChild.remove(); if (stick || m.from === me()) l.scrollTop = l.scrollHeight;
    if (!m.sys) { if (!P.chat && m.from !== me()) P.unread++; if (now - m.t < 8000) bubble(m.from, m.text); }
  }
  function bubble(id, text) {
    const s = slots.get(id); if (!s) return; const b = s.bub; b.textContent = text.length > 60 ? text.slice(0, 58) + '…' : text; b.classList.add('on');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('on'), 5000);
  }

  /* ---------- personagens do grupo no lobby ---------- */
  const slots = new Map();   // id do jogador -> { root, main, bub, host, key, mate }
  function slotFor(m, mine) {
    let s = slots.get(m.id); if (s) return s;
    const root = document.createElement('div'); root.className = 'pslot' + (mine ? ' me' : ''); root.innerHTML = '<div class="ptag"><div class="pt-main"></div><div class="pt-bub"></div></div>';
    s = { root, main: root.querySelector('.pt-main'), bub: root.querySelector('.pt-bub'), host: null, key: '', mine };
    if (!mine) {
      const h = document.createElement('div'); h.className = 'hero3d mate-hero'; h._mate = { char: m.char, skin: m.skin }; h._paused = worldOpen(); h.innerHTML = '<span class="hero3d-ld">…</span>';
      root.insertBefore(h, root.firstChild); s.host = h; if (!worldOpen()) mountHero(h);
    }
    root.querySelector('.ptag').onclick = e => { e.stopPropagation(); openMenu(m.id, root); };
    stage.appendChild(root); slots.set(m.id, s); return s;
  }
  function syncStage() {
    const pt = P.party, mem = pt ? pt.members : [], show = mem.length > 1, keep = new Set();
    if (show) for (const m of mem) {
      const mine = m.id === me(), s = slotFor(m, mine); keep.add(m.id);
      const key = `${m.name}|${m.lead}|${m.voice}|${m.rank}|${m.trophies}`;
      if (s.key !== key) { s.key = key; s.main.innerHTML = `<span class="pt-n">${m.lead ? '<em>👑</em>' : ''}${esc(m.name)}</span><small>${esc(m.rank)} · 🏆 ${m.trophies}</small>${m.voice ? '<span class="pt-v">🎧</span>' : ''}`; }
      if (s.host) {   // o colega trocou de visual/personagem
        const h = s.host, t = h._mate;
        if (t.char !== m.char) { t.char = m.char; t.skin = m.skin; if (h._p) { try { h._p.dispose(); } catch (_) { } h._p = null; h.innerHTML = '<span class="hero3d-ld">…</span>'; if (!worldOpen()) mountHero(h); } }
        else if (t.skin !== m.skin) { t.skin = m.skin; try { h._p && h._p.setSkin(m.skin); } catch (_) { } }
      }
    }
    for (const [id, s] of [...slots]) if (!keep.has(id)) { if (s.host && s.host._p) { try { s.host._p.dispose(); } catch (_) { } } s.root.remove(); slots.delete(id); }
    layout();
  }
  /* eu fico no meio; os colegas se distribuem ao lado (área à esquerda do cartão de modos) */
  function layout() {
    const hero = $('lobbyHero'), mem = P.party && P.party.members.length > 1 ? P.party.members : [], n = mem.length, max = P.party ? P.party.max : 4;
    $('lobby')?.classList.toggle('pgroup', n > 1);   // com grupo: some a oferta diária (cobria o nome) e o cartão de modos encolhe
    if (!hero) return;
    const W = center.clientWidth || innerWidth, showPlus = !P.unsupported && n < max;
    plus.classList.toggle('hidden', !showPlus);
    if (n < 2) {   // sozinho: herói no meio e o "＋" ao lado, como no Free Fire / Brawl Stars
      hero.style.left = hero.style.width = ''; plus.style.left = (W * .5 - Math.min(W * .21, 175)) + 'px'; return;
    }
    const others = mem.filter(m => m.id !== me());
    const ord = n === 4 ? [others[2], others[0], null, others[1]] : n === 3 ? [others[0], null, others[1]] : [null, others[0]];
    if (showPlus) ord.push('plus');
    const t = ord.length, pitch = Math.min(W * ({ 3: .2, 4: .155 }[t] || .2), 200), sw = Math.min(pitch * 2.1, 380), cx = W * (W > 560 ? .42 : .5);
    ord.forEach((m, i) => {
      const x = cx + (i - (t - 1) / 2) * pitch;
      if (m === 'plus') { plus.style.left = x + 'px'; return; }
      const s = slots.get(m ? m.id : me());
      if (s) { s.root.style.left = x + 'px'; s.root.style.width = sw + 'px'; }
      if (!m) { hero.style.left = x + 'px'; hero.style.width = sw + 'px'; }
    });
  }
  new ResizeObserver(() => layout()).observe(center);
  function openMenu(id, root) {
    const pt = P.party; if (!pt) return; const lead = pt.leader === me(), items = [];
    if (id === me()) items.push(['🚪 Sair do grupo', () => act('party/leave')]);
    else {
      const muted = voice.remoteMuted.has(id); items.push([muted ? '🔊 Ouvir a voz dele' : '🔇 Silenciar a voz dele', () => { voice.setRemoteMuted(id, !muted); toast(muted ? 'Voz ativada' : 'Voz silenciada só para você'); }]);
      if (lead) { items.push(['👑 Passar a liderança', () => act('party/lead', { id })]); items.push(['✖ Expulsar do grupo', () => act('party/kick', { id })]); }
    }
    menu.innerHTML = ''; items.forEach(([t, f]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { menu.classList.add('hidden'); f(); }; menu.appendChild(b); });
    menu.style.left = (root.offsetLeft + root.offsetWidth / 2) + 'px'; menu.classList.remove('hidden');
  }

  /* ---------- barra do grupo, convites e distintivos ---------- */
  function renderBar() {
    const pt = P.party; bar.classList.toggle('hidden', !pt); if (!pt) return;
    $('pbCount').textContent = `👥 ${pt.members.length}/${pt.max}`;
    const v = voice.joined; $('pbVoice').classList.toggle('on', v); $('pbVoice').querySelector('small').textContent = v ? 'SAIR VOZ' : 'VOZ';
    $('pbMic').classList.toggle('hidden', !v); $('pbMic').classList.toggle('muted', voice.muted); $('pbMic').querySelector('.ic').textContent = voice.muted ? '🔇' : '🎤';
    const u = $('pbUnread'); u.textContent = P.unread > 9 ? '9+' : P.unread; u.classList.toggle('hidden', !P.unread);
    $('pbAdd').classList.toggle('hidden', pt.members.length >= pt.max);
  }
  function renderInvites() {
    const list = P.invites.filter(i => !P.dismissed.has(i.partyId + ':' + Math.floor((P.now - i.ageMs) / 1000))), i = list[0], box = $('pInv');
    if (!i) { box.innerHTML = ''; return; }
    if (box.dataset.k === i.partyId) return; box.dataset.k = i.partyId;
    box.innerHTML = `<div class="pinv"><span><b>${esc(i.fromName)}</b> convidou você para um grupo (${i.size}/4)</span><button class="y">ENTRAR</button><button class="n">✕</button></div>`;
    try { window.playUISound?.('open'); } catch (_) { }
    box.querySelector('.y').onclick = async () => { box.innerHTML = ''; box.dataset.k = ''; const r = await act('party/join', { partyId: i.partyId }); if (r) toast('Entrando no grupo…'); };
    box.querySelector('.n').onclick = () => { box.innerHTML = ''; box.dataset.k = ''; P.dismissed.add(i.partyId + ':' + Math.floor((P.now - i.ageMs) / 1000)); act('party/decline', { partyId: i.partyId }, true); };
  }
  function renderBadge() { const n = P.reqs.length + P.invites.length, b = $('pfBadge'); if (b) { b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n); } }
  function renderAll() {
    renderBar(); syncStage(); renderInvites(); renderBadge(); renderPanel();
    const pt = P.party, sig = pt ? `${pt.leader === me()}|${pt.members.length}|${pt.mode}` : '';
    if (sig !== P.sig) { P.sig = sig; renderMode(); }
  }

  /* ---------- painel de amigos ---------- */
  function openPanel() {
    let m = $('pfPanel');
    if (!m) {
      m = document.createElement('div'); m.id = 'pfPanel'; m.className = 'l3d-modal hidden';
      m.innerHTML = `<div class="l3d-card panel pf-card">
        <div class="pf-head"><div><small class="l3d-k">SOCIAL</small><h2>Amigos e grupo</h2></div><button id="pfClose" class="pf-x">✕</button></div>
        <div id="pfNote" class="pf-note hidden"></div>
        <div class="pf-me">
          <div class="pf-code"><small>SEU CÓDIGO DE AMIGO</small><b id="pfCode">------</b><span><button id="pfCopy">COPIAR</button><button id="pfShare">ENVIAR</button></span></div>
          <div class="pf-name"><small>SEU NOME NO ONLINE</small><span><input id="pfName" maxlength="16" autocomplete="off"><button id="pfNameOk">SALVAR</button></span></div>
        </div>
        <div class="pf-add"><input id="pfAdd" maxlength="6" placeholder="CÓDIGO DO AMIGO" autocomplete="off"><button id="pfAddBtn" class="l3d-prim">ADICIONAR</button></div>
        <div id="pfLists"></div></div>`;
      document.body.appendChild(m);
      m.addEventListener('pointerdown', e => { if (e.target === m) closePanel(); });
      $('pfClose').onclick = closePanel;
      $('pfCopy').onclick = () => { if (!P.fcode) return; navigator.clipboard?.writeText(P.fcode); toast('Código copiado!'); };
      $('pfShare').onclick = () => { const t = `Me adiciona no CyberArena! Meu código de amigo: ${P.fcode}`; if (navigator.share) navigator.share({ title: 'CyberArena', text: t }).catch(() => { }); else { navigator.clipboard?.writeText(t); toast('Mensagem copiada!'); } };
      $('pfNameOk').onclick = async () => {
        const n = $('pfName').value.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16); if (n.length < 2) { toast('Nome muito curto'); return; }
        saveIdentity({ name: n }); await net.profile({ name: n }); refreshProfile(); poke(); toast('Nome salvo!');
      };
      const add = async () => {
        const c = $('pfAdd').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length < 6) { toast('O código tem 6 letras/números'); return; }
        const r = await act('friend/add', { code: c }); if (!r) return; $('pfAdd').value = '';
        toast(r.status === 'friends' ? `Agora você e ${r.name} são amigos!` : `Pedido enviado para ${r.name}`);
      };
      $('pfAddBtn').onclick = add; $('pfAdd').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
      $('pfLists').addEventListener('click', onListClick);
    }
    P.panel = true; m.classList.remove('hidden'); $('pfName').value = getIdentity().name || ''; renderPanel(); poke();
  }
  function closePanel() { P.panel = false; const m = $('pfPanel'); if (m) m.classList.add('hidden'); }
  let armed = '', armT = 0;
  async function onListClick(e) {
    const b = e.target.closest('button[data-a]'); if (!b || b.disabled) return; const a = b.dataset.a, id = b.dataset.id;
    if (a === 'inv') { const r = await act('party/invite', { id }); if (r) toast('Convite enviado!'); }
    else if (a === 'acc') { const r = await act('friend/accept', { id }); if (r) toast(`Agora você e ${r.name} são amigos!`); }
    else if (a === 'dec') await act('friend/decline', { id });
    else if (a === 'rm') { if (armed !== id) { armed = id; b.textContent = 'CERTEZA?'; clearTimeout(armT); armT = setTimeout(() => { armed = ''; renderPanel(); }, 3000); return; } armed = ''; await act('friend/remove', { id }); }
    else if (a === 'join') { const r = await act('party/join', { partyId: id }); if (r) { toast('Entrando no grupo…'); closePanel(); } }
    else if (a === 'no') await act('party/decline', { partyId: id }, true);
  }
  const av = id => { const s = SKINS.find(x => x.id === id) || SKINS[0]; return `<i class="pf-av" style="--c:${s.c};--a:${s.a}"></i>`; };
  function renderPanel() {
    if (!P.panel) return; const note = $('pfNote'), L = $('pfLists'); if (!L) return;
    $('pfCode').textContent = P.fcode || '------';
    const msg = P.unsupported ? 'Este servidor ainda não tem o sistema de amigos e grupo. Use o servidor próprio (online-server) para ativar.' : P.offline ? 'Sem conexão com o servidor. Tentando de novo…' : '';
    note.textContent = msg; note.classList.toggle('hidden', !msg);
    const pt = P.party, inGroup = new Set(pt ? pt.members.map(m => m.id) : []), full = pt && pt.members.length >= pt.max;
    const sec = (t, rows, empty) => `<div class="pf-sec"><small class="l3d-k">${t}</small>${rows || `<p class="pf-empty">${empty}</p>`}</div>`;
    let h = '';
    if (P.invites.length) h += sec('CONVITES PARA GRUPO', P.invites.map(i => `<div class="pf-row"><div class="pf-info"><b>${esc(i.fromName)}</b><small>Grupo com ${i.size} jogador(es)</small></div><button data-a="join" data-id="${i.partyId}" class="l3d-prim">ENTRAR</button><button data-a="no" data-id="${i.partyId}" class="sm">✕</button></div>`).join(''));
    if (P.reqs.length) h += sec('PEDIDOS DE AMIZADE', P.reqs.map(r => `<div class="pf-row">${av(r.skin)}<div class="pf-info"><b>${esc(r.name)}</b><small>🏆 ${r.trophies}</small></div><button data-a="acc" data-id="${r.id}" class="l3d-prim">ACEITAR</button><button data-a="dec" data-id="${r.id}" class="sm">✕</button></div>`).join(''));
    h += sec(`AMIGOS (${P.friends.length})`, P.friends.map(f => {
      const [cls, label] = STATUS[f.status] || STATUS.offline, here = inGroup.has(f.id);
      const btn = here ? '<button disabled>NO GRUPO</button>' : f.status === 'offline' ? '<button disabled>OFFLINE</button>' : (f.partyId && (f.partySize || 1) < 4) ? `<button data-a="join" data-id="${f.partyId}" class="l3d-prim">ENTRAR</button>` : full ? '<button disabled>GRUPO CHEIO</button>' : `<button data-a="inv" data-id="${f.id}" class="l3d-prim">CONVIDAR</button>`;
      return `<div class="pf-row">${av(f.skin)}<div class="pf-info"><b>${esc(f.name)}</b><small>${esc(f.rank)} · 🏆 ${f.trophies} · Nv ${f.level}</small></div><span class="pf-st ${cls}">● ${label}${f.party && !here ? ' · EM GRUPO' : ''}</span>${btn}<button data-a="rm" data-id="${f.id}" class="sm" title="Remover amigo">${armed === f.id ? 'CERTEZA?' : '✕'}</button></div>`;
    }).join(''), 'Você ainda não tem amigos. Passe o seu código ou digite o código de um amigo acima.');
    if (L._h !== h) { L._h = h; L.innerHTML = h; }   // só redesenha se mudou (senão o botão some debaixo do dedo a cada sincronização)
  }

  layout();
  /* começa a conversar com o servidor */
  setTimeout(poll, 1200);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poke(); });
  window.__party = { state: P, voice, speaking, hear, toggleVoice, toggleMic: () => { voice.setMuted(!voice.muted); renderBar(); ping(); } };   // para depuração no console
}
