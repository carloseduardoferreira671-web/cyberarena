/* CyberArena · amigos, grupo (party) do lobby, chat do grupo e sinalização da voz (WebRTC).
   Usado por server.mjs. Sem dependências e sem banco: amigos/código de amigo ficam no perfil do jogador
   (players.json / Redis, como troféus e XP); grupos, convites e mensagens ficam só na memória.
   Tudo funciona por polling (POST /api/social/sync a cada ~0,7 s no grupo), igual ao resto do jogo. */
import { randomUUID } from 'node:crypto';

export const PARTY_MAX = 4;
const SEEN_MS = 15000;       // "online no lobby" = falou com o servidor nos últimos 15 s
const MEMBER_MS = 45000;     // quem some por 45 s sai do grupo
const INVITE_MS = 60000;
const FRIENDS_MAX = 100, REQ_MAX = 30, KEEP_MSGS = 60;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const isMode = m => m === 'battle' || m === 'open' || m === 'train' || m === 'space';

export function createSocial({ players, rooms, live, rankOf, levelOf, markDirty, HttpError, cleanText, cleanCode }) {
  /* servidores STUN/TURN para a voz. TURN é opcional (TURN_URL, TURN_USER, TURN_PASS) mas recomendado: sem ele,
     algumas redes de celular (NAT simétrico) não conseguem ligar a voz entre si. ICE_SERVERS (JSON) substitui tudo. */
  const ICE = (() => {
    try { if (process.env.ICE_SERVERS) { const j = JSON.parse(process.env.ICE_SERVERS); if (Array.isArray(j) && j.length) return j; } } catch { /* usa o padrão */ }
    const s = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    if (process.env.TURN_URL) s.push({ urls: process.env.TURN_URL.split(',').map(x => x.trim()).filter(Boolean), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
    return s;
  })();

  const byCode = new Map();             // código de amigo -> id
  const seen = new Map();               // id -> último contato (ms)
  const parties = new Map();            // id do grupo -> grupo
  const partyOf = new Map();            // id do jogador -> id do grupo
  const invites = new Map();            // id de quem recebe -> Map(id do grupo -> convite)
  const lastChat = new Map();           // id -> ms da última mensagem
  let msgSeq = 0, sigSeq = 0, lastSweep = 0, pc = { t: 0, m: new Map() };

  const now = () => Date.now();
  const fail = (s, m) => { throw new HttpError(s, m); };
  const isId = s => typeof s === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(s);

  /* ---------- perfil social ---------- */
  function ensure(p) {
    if (!Array.isArray(p.friends)) p.friends = [];
    if (!Array.isArray(p.reqIn)) p.reqIn = [];
    if (!p.fcode || !/^[A-Z0-9]{6}$/.test(p.fcode)) {
      let c; do { c = ''; for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; } while (findByCode(c));
      p.fcode = c; markDirty();
    }
    byCode.set(p.fcode, p.id);
    return p;
  }
  function findByCode(code) {
    const id = byCode.get(code), p = id && players.get(id);
    if (p && p.fcode === code) return p;
    for (const q of players.values()) if (q.fcode === code) { byCode.set(code, q.id); return q; }
    return null;
  }
  const pub = p => ({ id: p.id, name: p.name, skin: p.skin, char: p.char || 'nexus', trophies: p.trophies, level: levelOf(p.xp).level, rank: rankOf(p.trophies).name });
  function inGame(id) {   // id -> modo da partida em que está (cache de 1 s)
    const t = now();
    if (t - pc.t > 1000) { const m = new Map(); for (const r of rooms.values()) for (const [pid, mem] of r.members) if (live(mem, 12000)) m.set(pid, r.mode); pc = { t, m }; }
    return pc.m.get(id) || null;
  }
  function statusOf(id) { const g = inGame(id); if (g) return g === 'open' ? 'open' : 'battle'; return now() - (seen.get(id) || 0) < SEEN_MS ? 'lobby' : 'offline'; }
  const online = id => statusOf(id) !== 'offline';

  /* ---------- amigos ---------- */
  function friendAdd(p, body) {
    const code = cleanCode(body.code), target = code && findByCode(code);
    if (!target) fail(404, 'Código de amigo não encontrado');
    if (target.id === p.id) fail(400, 'Esse é o seu próprio código');
    ensure(target);
    if (p.friends.includes(target.id)) fail(409, `${target.name} já é seu amigo`);
    if (p.friends.length >= FRIENDS_MAX) fail(409, 'Sua lista de amigos está cheia');
    const mine = p.reqIn.indexOf(target.id);
    if (mine >= 0) { p.reqIn.splice(mine, 1); makeFriends(p, target); return { ok: true, status: 'friends', name: target.name }; }   // ele já tinha pedido: vira amizade
    if (target.friends.length >= FRIENDS_MAX) fail(409, 'A lista de amigos dessa pessoa está cheia');
    if (!target.reqIn.includes(p.id)) { if (target.reqIn.length >= REQ_MAX) fail(409, 'Essa pessoa tem pedidos demais pendentes'); target.reqIn.push(p.id); markDirty(); }
    return { ok: true, status: 'sent', name: target.name };
  }
  function makeFriends(a, b) {
    if (!a.friends.includes(b.id)) a.friends.push(b.id);
    if (!b.friends.includes(a.id)) b.friends.push(a.id);
    for (const [x, y] of [[a, b], [b, a]]) { const i = x.reqIn.indexOf(y.id); if (i >= 0) x.reqIn.splice(i, 1); }
    markDirty();
  }
  function friendAccept(p, body) {
    const id = body.id, i = p.reqIn.indexOf(id), o = players.get(id);
    if (i < 0 || !o) fail(404, 'Pedido não encontrado');
    if (p.friends.length >= FRIENDS_MAX) fail(409, 'Sua lista de amigos está cheia');
    ensure(o); makeFriends(p, o); return { ok: true, name: o.name };
  }
  function friendDecline(p, body) { const i = p.reqIn.indexOf(body.id); if (i >= 0) { p.reqIn.splice(i, 1); markDirty(); } return { ok: true }; }
  function friendRemove(p, body) {
    const o = players.get(body.id);
    p.friends = p.friends.filter(x => x !== body.id); if (o) { ensure(o); o.friends = o.friends.filter(x => x !== p.id); }
    markDirty(); return { ok: true };
  }

  /* ---------- grupo ---------- */
  function sys(party, text) { party.msgs.push({ id: ++msgSeq, from: null, name: '', text, t: now(), sys: true }); if (party.msgs.length > KEEP_MSGS) party.msgs.shift(); }
  function newParty(leaderId) {
    const id = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    const party = { id, leader: leaderId, members: new Map(), msgs: [], sig: new Map(), mode: 'battle', code: null, start: null, startN: 0, room: null, created: now() };
    parties.set(id, party); return party;
  }
  function joinParty(party, p) {
    leaveParty(p.id);
    party.members.set(p.id, { pid: p.id, joined: now(), seen: now(), voice: false });
    partyOf.set(p.id, party.id); sys(party, `${p.name} entrou no grupo.`);
  }
  function leaveParty(pid) {
    const id = partyOf.get(pid); if (!id) return; partyOf.delete(pid);
    const party = parties.get(id); if (!party) return;
    const name = players.get(pid)?.name || 'Alguém';
    party.members.delete(pid); party.sig.delete(pid);
    if (!party.members.size) { parties.delete(id); return; }
    if (party.leader === pid) {
      const next = [...party.members.values()].sort((a, b) => a.joined - b.joined)[0]; party.leader = next.pid;
      sys(party, `${name} saiu. ${players.get(next.pid)?.name || 'Alguém'} agora é o líder.`);
    } else sys(party, `${name} saiu do grupo.`);
  }
  function sweep(t) {
    if (t - lastSweep < 3000) return; lastSweep = t;
    for (const party of [...parties.values()]) for (const m of [...party.members.values()]) if (t - m.seen > MEMBER_MS) leaveParty(m.pid);
    for (const [to, mm] of invites) { for (const [pid, inv] of mm) if (t - inv.t > INVITE_MS || !parties.has(pid)) mm.delete(pid); if (!mm.size) invites.delete(to); }
  }
  const myParty = p => { const id = partyOf.get(p.id); return id ? parties.get(id) || null : null; };
  const needParty = p => myParty(p) || fail(409, 'Você não está em um grupo');
  const needLeader = p => { const party = needParty(p); if (party.leader !== p.id) fail(403, 'Só o líder do grupo pode fazer isso'); return party; };

  function invite(p, body) {
    const o = players.get(body.id);
    if (!o || !p.friends.includes(o.id)) fail(403, 'Você só pode convidar amigos');
    if (!online(o.id)) fail(409, `${o.name} está offline`);
    let party = myParty(p);
    if (party && party.members.has(o.id)) fail(409, `${o.name} já está no grupo`);
    if (party && party.members.size >= PARTY_MAX) fail(409, 'O grupo está cheio');
    if (!party) { party = newParty(p.id); joinParty(party, p); }
    let mm = invites.get(o.id); if (!mm) invites.set(o.id, mm = new Map());
    const old = mm.get(party.id); if (old && now() - old.t < 4000) return { ok: true };
    mm.set(party.id, { partyId: party.id, from: p.id, fromName: p.name, t: now() });
    return { ok: true };
  }
  function join(p, body) {
    const mm = invites.get(p.id), inv = mm && mm.get(body.partyId), party = parties.get(body.partyId);
    // entra com convite válido OU direto no grupo de um amigo (como "entrar" no Free Fire/Brawl Stars)
    const friendIn = party && p.friends.some(id => party.members.has(id));
    if (!party || !((inv && now() - inv.t <= INVITE_MS) || friendIn)) fail(404, 'Esse convite expirou');
    if (party.members.size >= PARTY_MAX) fail(409, 'O grupo está cheio');
    if (mm) mm.delete(party.id); joinParty(party, p); return { ok: true };
  }
  function decline(p, body) { const mm = invites.get(p.id); if (mm) { mm.delete(body.partyId); if (!mm.size) invites.delete(p.id); } return { ok: true }; }
  function kick(p, body) {
    const party = needLeader(p), o = players.get(body.id);
    if (!o || body.id === p.id || !party.members.has(body.id)) fail(404, 'Jogador não está no grupo');
    leaveParty(body.id); sys(party, `${o.name} foi removido do grupo.`); return { ok: true };
  }
  function lead(p, body) {
    const party = needLeader(p), o = players.get(body.id);
    if (!o || !party.members.has(body.id)) fail(404, 'Jogador não está no grupo');
    party.leader = body.id; sys(party, `${o.name} agora é o líder.`); return { ok: true };
  }
  function chat(p, body) {
    const party = needParty(p), text = cleanText(body.text); if (!text) return { ok: true };
    const t = now(); if (t - (lastChat.get(p.id) || 0) < 500) fail(429, 'Devagar! Espere um instante para enviar de novo');
    lastChat.set(p.id, t);
    party.msgs.push({ id: ++msgSeq, from: p.id, name: p.name, text, t }); if (party.msgs.length > KEEP_MSGS) party.msgs.shift();
    return { ok: true };
  }
  function voice(p, body) { const party = needParty(p), m = party.members.get(p.id); if (m) m.voice = !!body.on; return { ok: true }; }
  function start(p, body) {
    const party = needLeader(p);
    if (isMode(body.mode)) party.mode = body.mode;           // o líder manda o modo/código junto, sem esperar o próximo sync
    if ('code' in body) party.code = cleanCode(body.code);
    party.start = { n: ++party.startN, mode: party.mode, code: party.code, t: now() }; party.room = null;
    return { ok: true };
  }
  function pushSig(party, from, s) {
    const to = s && s.to, data = s && s.data;
    if (!isId(to) || to === from || !party.members.has(to) || !data || typeof data !== 'object') return;
    const str = JSON.stringify(data); if (str.length > 8000) return;
    let arr = party.sig.get(to); if (!arr) party.sig.set(to, arr = []);
    arr.push({ id: ++sigSeq, from, data }); if (arr.length > 200) arr.splice(0, arr.length - 200);
  }

  /* o jogo pede esta sala quando um membro do grupo entra numa partida: todos caem na mesma sala */
  function roomFor(pid, partyId, mode, code) {
    if (!partyId || partyOf.get(pid) !== partyId) return null;
    const party = parties.get(partyId), r = party && party.room && rooms.get(party.room);
    return r && !r.ended_at && r.mode === mode && r.code === code ? r : null;
  }
  function setRoom(pid, partyId, room) { if (partyId && partyOf.get(pid) === partyId) { const party = parties.get(partyId); if (party) party.room = room.id; } }

  /* ---------- sincronização (polling) ---------- */
  function sync(p, body) {
    const t = now(); seen.set(p.id, t); sweep(t);
    const party = myParty(p);
    if (party) {
      const m = party.members.get(p.id); if (m) m.seen = t;
      if (party.leader === p.id) { if (isMode(body.mode)) party.mode = body.mode; if ('code' in body) party.code = cleanCode(body.code); }
      if (Array.isArray(body.out)) for (const s of body.out.slice(0, 40)) pushSig(party, p.id, s);
    }
    const friends = p.friends.map(id => players.get(id)).filter(Boolean).map(f => ({ ...pub(f), fcode: f.fcode, status: statusOf(f.id), party: partyOf.has(f.id), partyId: partyOf.get(f.id) || null, partySize: (parties.get(partyOf.get(f.id))?.members.size) || 0 }))
      .sort((a, b) => (a.status === 'offline') - (b.status === 'offline') || a.name.localeCompare(b.name));
    const reqs = p.reqIn.map(id => players.get(id)).filter(Boolean).map(o => ({ id: o.id, name: o.name, trophies: o.trophies, skin: o.skin }));
    const inv = [...(invites.get(p.id)?.values() || [])].filter(i => t - i.t < INVITE_MS && parties.has(i.partyId)).map(i => ({ partyId: i.partyId, from: i.from, fromName: i.fromName, ageMs: t - i.t, size: parties.get(i.partyId).members.size }));
    const out = { serverNow: t, fcode: p.fcode, friends, reqs, invites: inv, party: null, msgs: [], signals: [], cursor: Math.max(0, Math.floor(Number(body.since) || 0)), sigCursor: Math.max(0, Math.floor(Number(body.sigSince) || 0)) };
    if (party) {
      out.party = {
        id: party.id, leader: party.leader, max: PARTY_MAX, mode: party.mode, code: party.code, start: party.start, ice: ICE,
        members: [...party.members.values()].sort((a, b) => a.joined - b.joined).map(m => ({ ...pub(players.get(m.pid)), voice: m.voice, lead: m.pid === party.leader })),
      };
      out.msgs = party.msgs.filter(x => x.id > out.cursor).slice(-40);
      if (out.msgs.length) out.cursor = out.msgs[out.msgs.length - 1].id;
      let arr = party.sig.get(p.id) || [];
      if (arr.length) { arr = arr.filter(s => s.id > out.sigCursor); party.sig.set(p.id, arr); }
      out.signals = arr.slice(0, 80); if (out.signals.length) out.sigCursor = out.signals[out.signals.length - 1].id;
    }
    return out;
  }

  function handle(route, p, body) {
    ensure(p);
    switch (route) {
      case 'social/sync': return sync(p, body);
      case 'social/friend/add': return friendAdd(p, body);
      case 'social/friend/accept': return friendAccept(p, body);
      case 'social/friend/decline': return friendDecline(p, body);
      case 'social/friend/remove': return friendRemove(p, body);
      case 'social/party/invite': return invite(p, body);
      case 'social/party/join': return join(p, body);
      case 'social/party/decline': return decline(p, body);
      case 'social/party/leave': leaveParty(p.id); return { ok: true };
      case 'social/party/kick': return kick(p, body);
      case 'social/party/lead': return lead(p, body);
      case 'social/party/chat': return chat(p, body);
      case 'social/party/voice': return voice(p, body);
      case 'social/party/start': return start(p, body);
    }
    throw new HttpError(404, 'Rota não encontrada');
  }
  return { handle, roomFor, setRoom, ensure, stats: () => ({ parties: parties.size, inParty: partyOf.size }) };
}
