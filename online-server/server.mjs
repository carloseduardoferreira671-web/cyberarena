/* CyberArena · servidor ONLINE próprio (sem Netlify, sem banco de dados, sem dependências).
   Serve o site (arquivos da pasta do jogo) + a mesma API do Netlify em /api/*:
   perfil, matchmaking, salas (batalha 16 / mundo aberto), sync, resultado, ranking e "online agora".
   Rodar:  node online-server/server.mjs   (PORT=3000 por padrão)
   Perfis (troféus/XP) ficam em online-server/data/players.json. Salas ficam só na memória. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSocial } from './social.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS = 16, BATTLE_MS = 6 * 60 * 1000;
const TROPHY_TABLE = [0, 32, 24, 18, 13, 8, 8, 4, 4, 0, 0, -4, -4, -7, -7, -10, -10];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };

/* ---------------- util ---------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const sha = s => createHash('sha256').update(s).digest('hex');
const isId = s => typeof s === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(s);
const cleanName = s => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) : '') || '';
const cleanPlat = s => (s === 'apk' ? 'apk' : 'web');
const cleanSkin = s => (typeof s === 'string' && /^[a-z0-9_]{1,16}$/.test(s) ? s : '');
const cleanChar = s => (['cyber', 'nexus', 'atlas'].includes(s) ? s : '');
const cleanCode = s => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '') || null;
const cleanText = s => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120) : '');
const num = (v, a, b, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

const RANKS = [[0, 'Bronze'], [200, 'Prata'], [500, 'Ouro'], [900, 'Platina'], [1400, 'Diamante'], [2000, 'Mestre'], [2800, 'Cyber Lenda']];
function rankOf(t) { let i = 0; RANKS.forEach((r, k) => { if (t >= r[0]) i = k; }); const next = RANKS[i + 1], span = next ? next[0] - RANKS[i][0] : 400; const tier = next ? 3 - Math.min(2, Math.floor((t - RANKS[i][0]) / span * 3)) : 1; return { name: RANKS[i][1], tier, index: i, min: RANKS[i][0], next: next ? next[0] : null }; }
function levelOf(xp) { let lvl = 1, need = 250, left = xp; while (left >= need && lvl < 100) { left -= need; lvl++; need = 250 + (lvl - 1) * 50; } return { level: lvl, levelXp: left, levelNext: need }; }
const profileOut = p => ({ id: p.id, name: p.name, skin: p.skin, trophies: p.trophies, xp: p.xp, ...levelOf(p.xp), wins: p.wins, kills: p.kills, matches: p.matches, bestPlacement: p.best_placement ?? null, rank: rankOf(p.trophies) });

/* ---------------- estado ---------------- */
const players = new Map();   // id -> perfil (persistido)
const rooms = new Map();     // id -> sala (memória)
let eventSeq = 0, dirty = false;

fs.mkdirSync(DATA_DIR, { recursive: true });
const PFILE = path.join(DATA_DIR, 'players.json');
try { for (const p of JSON.parse(fs.readFileSync(PFILE, 'utf8'))) players.set(p.id, p); console.log('perfis carregados:', players.size); } catch { /* primeira execução */ }
/* Persistência externa opcional (Redis Upstash via REST, grátis): sobrevive a reinícios/deploys em hospedagens sem disco (ex.: Render grátis).
   Variáveis: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (ou KV_REST_API_URL + KV_REST_API_TOKEN). Sem elas, só o arquivo local é usado. */
const RURL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, ''), RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const RKEY = process.env.REDIS_KEY || 'cyberarena:players';
const remoteOn = !!(RURL && RTOK);
async function redisCmd(cmd, ms = 5000) {
  const r = await fetch(RURL, { method: 'POST', headers: { authorization: 'Bearer ' + RTOK, 'content-type': 'application/json' }, body: JSON.stringify(cmd), signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error('redis HTTP ' + r.status);
  const j = await r.json(); if (j.error) throw new Error('redis: ' + j.error);
  return j.result;
}
let remoteReady = false, remoteBusy = false, remoteDirty = false;
function mergeRemote(raw) {   // remoto vale, exceto jogadores que só existem aqui ou têm mais partidas aqui
  for (const p of JSON.parse(raw)) { const l = players.get(p.id); if (!l || (p.matches || 0) >= (l.matches || 0)) players.set(p.id, p); }
}
async function loadRemote() {
  try {
    const raw = await redisCmd(['GET', RKEY], 8000);
    if (raw) { mergeRemote(raw); console.log('perfis carregados do Redis:', players.size); }
    else console.log('Redis ligado (ainda vazio); perfis locais:', players.size);
    remoteReady = true; remoteDirty = true;   // só grava depois de ler com sucesso: nunca apaga o que está no Redis
  } catch (e) { console.error('AVISO: não consegui ler o Redis (tento de novo em 10 s; nada será gravado lá antes disso):', e.message); }
}
async function saveRemote(force = false) {
  if (!remoteOn || !remoteReady || (remoteBusy && !force)) return;
  remoteBusy = true;
  try { remoteDirty = false; await redisCmd(['SET', RKEY, JSON.stringify([...players.values()])], 8000); }
  catch (e) { console.error('AVISO: falha ao salvar no Redis (tento de novo):', e.message); remoteDirty = true; }
  finally { remoteBusy = false; }
}
if (remoteOn) await loadRemote();
function savePlayers() {
  if (remoteOn && !remoteReady) { loadRemote(); }
  if (dirty) { dirty = false; remoteDirty = remoteOn; try { fs.writeFileSync(PFILE + '.tmp', JSON.stringify([...players.values()])); fs.renameSync(PFILE + '.tmp', PFILE); } catch (e) { console.error('salvar perfis', e); dirty = true; } }
  if (remoteDirty) saveRemote();
}
setInterval(savePlayers, remoteOn ? 10000 : 20000).unref();
let leaving = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { if (leaving) return; leaving = true; dirty = true; savePlayers(); if (remoteOn) await saveRemote(true); process.exit(0); });

/* Anti-sono: hospedagens grátis (Render) dormem sem tráfego. O servidor chama o próprio endereço público a cada 10 min.
   Usa KEEPALIVE_URL, ou RENDER_EXTERNAL_URL (Render cria sozinho), ou RAILWAY_PUBLIC_DOMAIN. */
const SELF_URL = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/$/, '');
if (SELF_URL) {
  setInterval(() => { fetch(SELF_URL + '/api/health', { signal: AbortSignal.timeout(15000) }).catch(e => console.error('anti-sono falhou:', e.message)); }, 10 * 60 * 1000).unref();
  console.log('anti-sono ligado:', SELF_URL);
}

/* ---------------- identidade ---------------- */
function auth(body) {
  const id = body?.playerId, secret = body?.secret;
  if (!isId(id) || typeof secret !== 'string' || secret.length < 16 || secret.length > 128) throw new HttpError(400, 'Identidade inválida');
  const name = cleanName(body.name), skin = cleanSkin(body.skin), char = cleanChar(body.char), h = sha(secret);
  let p = players.get(id);
  if (!p) { p = { id, secret_hash: h, name: name || 'Cyber' + Math.floor(1000 + Math.random() * 9000), skin: skin || 'cyber', char: char || 'nexus', trophies: 0, xp: 0, wins: 0, kills: 0, matches: 0, best_placement: null, last_chat_at: 0 }; players.set(id, p); dirty = true; }
  else if (p.secret_hash !== h) throw new HttpError(403, 'Identidade não confere');
  else { if (name && name !== p.name) { p.name = name; dirty = true; } if (skin && skin !== p.skin) { p.skin = skin; dirty = true; } if (char && char !== p.char) { p.char = char; dirty = true; } }
  return p;
}

/* ---------------- salas ---------------- */
const nowMs = () => Date.now();
const live = (m, ms) => !m.left && nowMs() - m.last_seen < ms;
const activeCount = (r, ms) => { let n = 0; for (const m of r.members.values()) if (live(m, ms)) n++; return n; };
/* amigos + grupo + chat + voz do lobby (online-server/social.mjs) */
const social = createSocial({ players, rooms, live, rankOf, levelOf, markDirty: () => { dirty = true; }, HttpError, cleanText, cleanCode });
function membersOf(r) { return [...r.members.values()].filter(m => live(m, 10000)).sort((a, b) => a.joined_at - b.joined_at).map(m => { const p = players.get(m.pid); return { id: m.pid, name: p.name, skin: p.skin, trophies: p.trophies, plat: m.plat || 'web', s: m.state, alive: m.alive, age: nowMs() - m.last_seen }; }); }
function hostOf(r) { const h = [...r.members.values()].filter(m => live(m, 4000)).sort((a, b) => a.joined_at - b.joined_at)[0]; return h ? h.pid : null; }
function roomInfo(r, hostId, pl) { return { roomId: r.id, mode: r.mode, seed: r.seed, code: r.code, startAt: r.start_at, endAt: r.mode === 'battle' ? r.start_at + BATTLE_MS : null, serverNow: nowMs(), hostId, players: pl.map(m => ({ id: m.id, name: m.name, skin: m.skin, trophies: m.trophies })) }; }
function pushEvent(r, from, type, data) { r.events.push({ id: ++eventSeq, from, type, data, t: nowMs() }); if (r.events.length > 600) r.events.splice(0, r.events.length - 600); }

let lastClean = 0;
function cleanup() {
  const t = nowMs(); if (t - lastClean < 15000) return; lastClean = t;
  for (const [id, r] of rooms) {
    r.events = r.events.filter(e => t - e.t < 120000);
    const anySeen = [...r.members.values()].some(m => t - m.last_seen < 600000);
    if ((r.ended_at && t - r.ended_at > 600000) || (r.mode !== 'battle' && !anySeen) || (r.mode === 'battle' && t - r.start_at > 1200000)) rooms.delete(id);
  }
}

function queue(p, body) {
  const mode = body.mode === 'open' ? 'open' : body.mode === 'space' ? 'space' : body.mode === 'train' ? 'train' : 'battle', code = cleanCode(body.code);   // 'open' = mundo aberto, 'space' = teste de poderes online, 'train' = treino online (sala livre, separada do mundo aberto)
  cleanup();
  for (const r of rooms.values()) { const m = r.members.get(p.id); if (m && !m.left) m.left = true; }
  let room = null, best = -1;
  const t = nowMs();
  /* grupo: quem entra depois cai na MESMA sala do primeiro membro (se ainda der: não começou e não está cheia) */
  const partyId = typeof body.party === 'string' && /^[A-Z0-9]{8}$/.test(body.party) ? body.party : null;
  const pr = social.roomFor(p.id, partyId, mode, code);
  const prOk = pr && (mode !== 'battle' ? activeCount(pr, 10000) < MAX_PLAYERS : pr.start_at > t + 1000 && activeCount(pr, 8000) < MAX_PLAYERS);
  if (prOk) room = pr;
  if (room) { /* sala do grupo */ }
  else if (mode === 'battle') {
    for (const r of rooms.values()) {
      if (r.mode !== 'battle' || r.ended_at || r.start_at <= t + 2000 || r.code !== code) continue;
      const n = activeCount(r, 8000); if (n >= MAX_PLAYERS) continue;
      if (!code && !bracketOk(r, p, t)) continue;   // matchmaking por habilidade (só em partidas públicas)
      if (n > best || (n === best && room && r.start_at < room.start_at)) { best = n; room = r; }
    }
    if (!room) room = makeRoom('battle', code, t + (code ? 30000 : 25000));
  } else {
    for (const r of rooms.values()) {
      if (r.mode !== mode || r.ended_at || r.code !== code) continue;
      const n = activeCount(r, 10000); if (n >= MAX_PLAYERS) continue;
      if (n > best || (n === best && room && r.created_at < room.created_at)) { best = n; room = r; }
    }
    if (!room) room = makeRoom(mode, code, t);
  }
  const old = room.members.get(p.id);
  if (old) { old.left = false; old.last_seen = t; old.alive = true; old.plat = cleanPlat(body.platform); }
  else room.members.set(p.id, { pid: p.id, plat: cleanPlat(body.platform), joined_at: t, last_seen: t, state: null, alive: true, left: false, placement: null, rewarded: false, result: null });
  if (mode === 'battle' && activeCount(room, 8000) >= MAX_PLAYERS) room.start_at = Math.min(room.start_at, t + 3000);
  social.setRoom(p.id, partyId, room);
  return roomInfo(room, hostOf(room), membersOf(room));
}
/* Matchmaking por faixa: o jogador entra numa sala pública se a diferença de rank (Bronze…Cyber Lenda)
   para a média da sala for pequena. A tolerância cresce conforme a sala se aproxima do início (sala quase
   vazia aceita qualquer um, para ninguém ficar esperando sozinho). */
function roomAvgRank(r, t) { let sum = 0, n = 0; for (const m of r.members.values()) if (live(m, 8000)) { sum += rankOf(players.get(m.pid).trophies).index; n++; } return n ? sum / n : null; }
function bracketOk(r, p, t) {
  const avg = roomAvgRank(r, t); if (avg === null) return true;
  const waited = Math.max(0, t - r.created_at), tol = 1 + Math.floor(waited / 8000);   // 1 faixa, +1 a cada 8s da sala
  return Math.abs(rankOf(p.trophies).index - avg) <= tol;
}
function makeRoom(mode, code, startAt) {
  const r = { id: randomUUID(), mode, code, seed: Math.floor(Math.random() * 2147483647), start_at: startAt, ended_at: null, bots: [], scores: {}, deaths: 0, created_at: nowMs(), members: new Map(), events: [] };
  rooms.set(r.id, r); return r;
}

function sync(p, body) {
  const roomId = body.roomId; if (!isId(roomId)) throw new HttpError(400, 'Sala inválida');
  const r = rooms.get(roomId); if (!r) throw new HttpError(404, 'Sala não encontrada');
  const m = r.members.get(p.id); if (!m || m.left) throw new HttpError(409, 'Você não está nesta sala');
  const stateStr = JSON.stringify(body.state ?? null); m.state = stateStr.length <= 1024 ? (body.state ?? null) : null; m.last_seen = nowMs();
  const host = hostOf(r), t = nowMs();
  const isBattle = r.mode === 'battle', running = isBattle && t >= r.start_at && !r.ended_at;
  if (host === p.id && Array.isArray(body.bots)) { const bots = body.bots.slice(0, MAX_PLAYERS); if (JSON.stringify(bots).length < 16000) r.bots = bots; }
  const evs = Array.isArray(body.events) ? body.events.slice(0, 30) : [];
  for (const e of evs) {
    const type = typeof e?.type === 'string' ? e.type : '', d = e?.data && typeof e.data === 'object' ? e.data : {};
    if (type === 'chat') {
      const text = cleanText(d.text); if (!text) continue;
      if (t - (p.last_chat_at || 0) < 700) continue; p.last_chat_at = t;
      pushEvent(r, p.id, 'chat', { text, name: p.name });
    } else if (type === 'hit') {
      if (!running && r.mode !== 'space' && r.mode !== 'train') continue;   // no teste de poderes e no treino online os jogadores podem se acertar
      pushEvent(r, p.id, 'hit', { target: String(d.target ?? '').slice(0, 64), dmg: num(d.dmg, 0, 60), kind: String(d.kind ?? '').slice(0, 12), x: num(d.x, -500, 500), y: num(d.y, -50, 100), z: num(d.z, -500, 500), by: String(d.by ?? p.id).slice(0, 64) });
    } else if (type === 'death') {
      if (!isBattle || r.ended_at) continue;
      const victim = String(d.victim ?? '').slice(0, 64), killer = String(d.killer ?? '').slice(0, 64);
      if (victim !== p.id && host !== p.id) continue;
      if (victim !== p.id && !/^b\d{1,2}$/.test(victim)) continue;
      if (r.scores[victim]?.p) continue;
      const alive = MAX_PLAYERS - r.deaths; r.scores[victim] = { ...(r.scores[victim] || { k: 0 }), p: alive };
      if (killer && killer !== victim) r.scores[killer] = { ...(r.scores[killer] || { k: 0 }), k: (r.scores[killer]?.k || 0) + 1 };
      r.deaths++;
      if (victim === p.id) { m.alive = false; m.placement = alive; }
      pushEvent(r, p.id, 'death', { victim, killer, placement: alive, name: String(d.name ?? '').slice(0, 16), kname: String(d.kname ?? '').slice(0, 16) });
    } else if (type === 'fx') {
      const s = JSON.stringify(d); if (s.length < 400) pushEvent(r, p.id, 'fx', d);
    }
  }
  if (isBattle && !r.ended_at && t >= r.start_at && (t > r.start_at + BATTLE_MS + 15000 || MAX_PLAYERS - r.deaths <= 1)) r.ended_at = t;
  const since = Math.max(0, Math.floor(Number(body.since) || 0));
  const events = r.events.filter(e => e.id > since && t - e.t < 20000).slice(0, 200);
  const status = r.mode !== 'battle' ? 'open' : r.ended_at ? 'ended' : t < r.start_at ? 'waiting' : 'running';
  return {
    serverNow: nowMs(), status, startAt: r.start_at, endAt: isBattle ? r.start_at + BATTLE_MS : null, hostId: host,
    players: membersOf(r), bots: r.bots, events: events.map(e => ({ id: e.id, from: e.from, type: e.type, data: e.data })),
    cursor: events.length ? events[events.length - 1].id : since, scores: r.scores, alive: MAX_PLAYERS - r.deaths,
  };
}

function finish(p, body) {
  const roomId = body.roomId; if (!isId(roomId)) throw new HttpError(400, 'Sala inválida');
  const r = rooms.get(roomId); if (!r || r.mode !== 'battle') throw new HttpError(404, 'Partida não encontrada');
  const m = r.members.get(p.id); if (!m) throw new HttpError(409, 'Você não está nesta partida');
  if (m.rewarded && m.result) return { ...m.result, profile: profileOut(p) };
  const t = nowMs(); if (t < r.start_at + 5000) throw new HttpError(409, 'A partida ainda não começou');
  const alive = MAX_PLAYERS - r.deaths;
  let placement = m.placement ?? (alive <= 1 ? 1 : alive);
  if (!m.placement && !r.ended_at) { placement = alive; m.alive = false; m.placement = alive; r.scores[p.id] = { ...(r.scores[p.id] || { k: 0 }), p: alive }; r.deaths++; }
  placement = Math.max(1, Math.min(MAX_PLAYERS, placement));
  const kills = Math.min(15, Number(r.scores?.[p.id]?.k || 0));
  const trophiesDelta = TROPHY_TABLE[placement] + 2 * kills, xpGain = 40 + 15 * kills + 6 * (17 - placement);
  p.trophies = Math.max(0, p.trophies + trophiesDelta); p.xp += xpGain; p.wins += placement === 1 ? 1 : 0; p.kills += kills; p.matches++;
  p.best_placement = Math.min(p.best_placement ?? 99, placement); dirty = true;
  const result = { placement, kills, trophiesDelta, xpGain };
  m.rewarded = true; m.result = result; m.left = true;
  return { ...result, profile: profileOut(p) };
}

/* ---------------- HTTP ---------------- */
const send = (res, status, data) => { const b = JSON.stringify(data); res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS }); res.end(b); };

async function api(req, res, route) {
  try {
    if (route === 'health') return send(res, 200, { ok: true, gameApi: true, social: true, rooms: rooms.size, players: players.size, ...social.stats() });
    if (route === 'leaderboard' && req.method === 'GET') {
      const top = [...players.values()].sort((a, b) => b.trophies - a.trophies || b.xp - a.xp).slice(0, 50);
      return send(res, 200, { players: top.map((p, i) => ({ pos: i + 1, id: String(p.id).slice(0, 6), name: p.name, skin: p.skin, trophies: p.trophies, wins: p.wins, level: levelOf(p.xp).level, rank: rankOf(p.trophies).name })) });
    }
    if (route === 'stats' && req.method === 'GET') {
      const t = nowMs(); let online = 0, battles = 0, open = 0, waiting = 0, apk = 0, web = 0;
      for (const r of rooms.values()) { const n = activeCount(r, 12000); if (!n) continue; for (const m of r.members.values()) if (live(m, 12000)) { if (m.plat === 'apk') apk++; else web++; }
        online += n; if (r.mode !== 'battle') open += n; else if (!r.ended_at) { battles++; if (r.start_at > t) waiting += n; } }
      return send(res, 200, { online, apk, web, battles, openWorld: open, waitingBattle: waiting, registered: players.size });
    }
    if (route === 'online' && req.method === 'GET') {
      const on = new Set(), wait = new Set(), t = nowMs();
      for (const r of rooms.values()) for (const m of r.members.values()) if (live(m, 12000)) { on.add(m.pid); if (r.mode === 'battle' && !r.ended_at && r.start_at > t) wait.add(m.pid); }
      return send(res, 200, { online: on.size, waitingBattle: wait.size });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido');
    let text = ''; for await (const c of req) { text += c; if (text.length > 24000) throw new HttpError(413, 'Requisição grande demais'); }
    let body; try { body = JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'JSON inválido'); }
    const p = auth(body);
    switch (route) {
      case 'profile': return send(res, 200, profileOut(p));
      case 'mm/queue': return send(res, 200, queue(p, body));
      case 'room/sync': return send(res, 200, sync(p, body));
      case 'room/leave': { const r = isId(body.roomId) ? rooms.get(body.roomId) : null; const m = r?.members.get(p.id); if (m) m.left = true; return send(res, 200, { ok: true }); }
      case 'match/finish': return send(res, 200, finish(p, body));
    }
    if (route.startsWith('social/')) return send(res, 200, social.handle(route, p, body));
    throw new HttpError(404, 'Rota não encontrada');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error('api error', e); return send(res, 500, { error: 'Erro interno' });
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream', '.apk': 'application/vnd.android.package-archive', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const BLOCK = /^\/(online-server|server|netlify|db|legacy|character_sources|tools|\.github|node_modules)(\/|$)|\/\.|^\/(package(-lock)?\.json|drizzle\.config\.ts|server_tmp\.txt)$/i;
const gz = new Map();

function serveStatic(req, res, pathname) {
  let rel; try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel === '/') rel = '/index.html';
  if (BLOCK.test(rel)) { res.writeHead(404); return res.end('404'); }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404'); }
    const ext = path.extname(file).toLowerCase(), type = MIME[ext] || 'application/octet-stream';
    const heavy = st.size > 400000 || ['.png', '.jpg', '.webp', '.mp3', '.wav', '.bin', '.apk'].includes(ext);
    const cache = ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=86400';
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range && st.size) {
      let a = range[1] === '' ? Math.max(0, st.size - Number(range[2])) : Number(range[1]), b = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1;
      b = Math.min(b, st.size - 1);
      if (a > b) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${b}/${st.size}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1, 'cache-control': cache });
      return fs.createReadStream(file, { start: a, end: b }).pipe(res);
    }
    const canGz = !heavy && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.txt'].includes(ext);
    if (canGz) {
      const key = file + st.mtimeMs; let buf = gz.get(key);
      if (!buf) { buf = zlib.gzipSync(fs.readFileSync(file)); gz.set(key, buf); }
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', 'content-length': buf.length, vary: 'accept-encoding', 'cache-control': cache });
      return res.end(buf);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': st.size, 'accept-ranges': 'bytes', 'cache-control': cache });
    fs.createReadStream(file).pipe(res);
  });
}

/* limite simples por IP (anti-abuso): 40 req/s por IP no /api (o jogo faz ~6/s) */
const hits = new Map();
setInterval(() => hits.clear(), 1000).unref();
const limited = req => { const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); return n > 40; };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if ((url.pathname.startsWith('/api/') || url.pathname === '/api') && req.method !== 'OPTIONS' && limited(req)) return send(res, 429, { error: 'Muitas requisições' });
  if (url.pathname === '/sobre') return serveStatic(req, res, '/site/index.html');   // página de apresentação (opcional); o jogo É o site em "/"
  if (url.pathname === '/jogar') { res.writeHead(302, { location: '/' }); return res.end(); }
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return api(req, res, url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, ''));
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url.pathname);
}).listen(PORT, '0.0.0.0', () => console.log(`CyberArena online em http://localhost:${PORT}  (site + API /api)`));
