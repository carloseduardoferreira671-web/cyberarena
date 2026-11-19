/* CyberArena · API ONLINE para a VERCEL (função serverless + Redis Upstash via REST, sem dependências).
   Mesmas rotas do servidor próprio: /api/profile, mm/queue, room/sync, room/leave, match/finish, leaderboard, online, stats, health.
   Como a Vercel não mantém processo ligado, TODO o estado (perfis, salas, jogadores, eventos) fica no Redis:
   cada jogador escreve só o próprio campo da sala, então requisições simultâneas não se atropelam.
   Variáveis de ambiente (criadas sozinhas ao conectar o Upstash/Redis no painel da Vercel):
   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN   (ou KV_REST_API_URL + KV_REST_API_TOKEN) */
import { createHash, randomUUID } from 'node:crypto';

const RURL = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, ''), RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const MAX_PLAYERS = 16, BATTLE_MS = 6 * 60 * 1000, ROOM_TTL = 3600;
const TROPHY_TABLE = [0, 32, 24, 18, 13, 8, 8, 4, 4, 0, 0, -4, -4, -7, -7, -10, -10];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const sha = s => createHash('sha256').update(s).digest('hex');
const isId = s => typeof s === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(s);
const cleanName = s => (typeof s === 'string' ? s.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16) : '') || '';
const cleanPlat = s => (s === 'apk' ? 'apk' : 'web');
const cleanSkin = s => (typeof s === 'string' && /^[a-z0-9_]{1,16}$/.test(s) ? s : '');
const cleanCode = s => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '') || null;
const cleanText = s => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120) : '');
const num = (v, a, b, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
const RANKS = [[0, 'Bronze'], [200, 'Prata'], [500, 'Ouro'], [900, 'Platina'], [1400, 'Diamante'], [2000, 'Mestre'], [2800, 'Cyber Lenda']];
function rankOf(t) { let i = 0; RANKS.forEach((r, k) => { if (t >= r[0]) i = k; }); const next = RANKS[i + 1], span = next ? next[0] - RANKS[i][0] : 400; const tier = next ? 3 - Math.min(2, Math.floor((t - RANKS[i][0]) / span * 3)) : 1; return { name: RANKS[i][1], tier, index: i, min: RANKS[i][0], next: next ? next[0] : null }; }
function levelOf(xp) { let lvl = 1, need = 250, left = xp; while (left >= need && lvl < 100) { left -= need; lvl++; need = 250 + (lvl - 1) * 50; } return { level: lvl, levelXp: left, levelNext: need }; }
const profileOut = p => ({ id: p.id, name: p.name, skin: p.skin, trophies: p.trophies, xp: p.xp, ...levelOf(p.xp), wins: p.wins, kills: p.kills, matches: p.matches, bestPlacement: p.best_placement ?? null, rank: rankOf(p.trophies) });

/* ---------------- Redis (REST) ---------------- */
async function pipe(cmds) {
  if (!RURL || !RTOK) throw new HttpError(503, 'Redis não configurado (conecte o Upstash/Redis ao projeto na Vercel)');
  const r = await fetch(RURL + '/pipeline', { method: 'POST', headers: { authorization: 'Bearer ' + RTOK, 'content-type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error('redis: ' + x.error); return x.result; });
}
const cmd = async c => (await pipe([c]))[0];
const hobj = a => { if (!a) return {}; if (!Array.isArray(a)) return a; const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o; };
const K = { p: id => `ca:p:${id}`, meta: id => `ca:r:${id}:meta`, m: id => `ca:r:${id}:m`, e: id => `ca:r:${id}:e`, sc: id => `ca:r:${id}:sc`, seq: id => `ca:r:${id}:seq`, pr: id => `ca:pr:${id}`, lb: 'ca:lb', rooms: 'ca:rooms' };
const lbScore = p => p.trophies * 1e6 + Math.min(999999, p.xp);
const nowMs = () => Date.now();
const live = (m, ms) => !m.left && nowMs() - m.last_seen < ms;
const jparse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

/* ---------------- identidade ---------------- */
async function auth(body) {
  const id = body?.playerId, secret = body?.secret;
  if (!isId(id) || typeof secret !== 'string' || secret.length < 16 || secret.length > 128) throw new HttpError(400, 'Identidade inválida');
  const name = cleanName(body.name), skin = cleanSkin(body.skin), h = sha(secret);
  let p = jparse(await cmd(['GET', K.p(id)]), null);
  if (!p) {
    p = { id, secret_hash: h, name: name || 'Cyber' + Math.floor(1000 + Math.random() * 9000), skin: skin || 'cyber', trophies: 0, xp: 0, wins: 0, kills: 0, matches: 0, best_placement: null };
    await pipe([['SET', K.p(id), JSON.stringify(p)], ['ZADD', K.lb, lbScore(p), id]]);
  } else if (p.secret_hash !== h) throw new HttpError(403, 'Identidade não confere');
  else if ((name && name !== p.name) || (skin && skin !== p.skin)) { if (name) p.name = name; if (skin) p.skin = skin; await cmd(['SET', K.p(id), JSON.stringify(p)]); }
  return p;
}

/* ---------------- salas ---------------- */
async function loadRoom(id) {
  const [meta, mem] = await pipe([['HGETALL', K.meta(id)], ['HGETALL', K.m(id)]]); return buildRoom(id, hobj(meta), hobj(mem));
}
function buildRoom(id, meta, mem) {
  if (!meta || !meta.mode) return null;
  const members = new Map(); for (const [pid, v] of Object.entries(mem)) { const m = jparse(v, null); if (m) members.set(pid, m); }
  return { id, mode: meta.mode, code: meta.code || null, seed: +meta.seed, start_at: +meta.start_at, ended_at: +meta.ended_at || null, created_at: +meta.created_at, deaths: +meta.deaths || 0, bots: jparse(meta.bots, []), members };
}
const activeCount = (r, ms) => { let n = 0; for (const m of r.members.values()) if (live(m, ms)) n++; return n; };
const membersOf = r => [...r.members.values()].filter(m => live(m, 10000)).sort((a, b) => a.joined_at - b.joined_at).map(m => ({ id: m.pid, name: m.name, skin: m.skin, trophies: m.trophies, plat: m.plat || 'web', s: m.state, alive: m.alive, v: m.voice ? 1 : 0, age: nowMs() - m.last_seen }));
const hostOf = r => { const h = [...r.members.values()].filter(m => live(m, 4000)).sort((a, b) => a.joined_at - b.joined_at)[0]; return h ? h.pid : null; };
const roomInfo = (r, hostId, pl) => ({ roomId: r.id, mode: r.mode, seed: r.seed, code: r.code, startAt: r.start_at, endAt: r.mode === 'battle' ? r.start_at + BATTLE_MS : null, serverNow: nowMs(), hostId, players: pl.map(m => ({ id: m.id, name: m.name, skin: m.skin, trophies: m.trophies })) });
async function recentRooms(limit = 40) {
  const t = nowMs(); const ids = await cmd(['ZREVRANGEBYSCORE', K.rooms, '+inf', String(t - 1500000), 'LIMIT', '0', String(limit)]);
  if (!ids || !ids.length) return [];
  const res = await pipe(ids.flatMap(id => [['HGETALL', K.meta(id)], ['HGETALL', K.m(id)]]));
  return ids.map((id, i) => buildRoom(id, hobj(res[i * 2]), hobj(res[i * 2 + 1]))).filter(Boolean);
}
const rankIdx = t => { let i = 0; RANKS.forEach((r, k) => { if (t >= r[0]) i = k; }); return i; };
function bracketOk(r, p) {
  let sum = 0, n = 0; for (const m of r.members.values()) if (live(m, 8000)) { sum += rankIdx(m.trophies); n++; } if (!n) return true;
  const tol = 1 + Math.floor(Math.max(0, nowMs() - r.created_at) / 8000);
  return Math.abs(rankIdx(p.trophies) - sum / n) <= tol;
}
const newMember = (p, body, t) => ({ pid: p.id, name: p.name, skin: p.skin, trophies: p.trophies, plat: cleanPlat(body.platform), joined_at: t, last_seen: t, state: null, alive: true, left: false, placement: null, rewarded: false, result: null });

async function withLock(fn) {                 // evita que dois jogadores criem duas salas ao mesmo tempo
  let got = false; for (let i = 0; i < 20 && !got; i++) { got = (await cmd(['SET', 'ca:lock:q', '1', 'NX', 'PX', '4000'])) === 'OK'; if (!got) await new Promise(r => setTimeout(r, 50)); }
  try { return await fn(); } finally { if (got) await cmd(['DEL', 'ca:lock:q']).catch(() => { }); }
}

async function queue(p, body) {
  const mode = body.mode === 'open' ? 'open' : body.mode === 'train' ? 'train' : 'battle', code = cleanCode(body.code);   // 'train' = treino online (sala livre, separada do mundo aberto)
  return withLock(async () => {
    const t = nowMs();
    const prev = await cmd(['GET', K.pr(p.id)]);                       // sai da sala anterior
    if (prev) { const raw = await cmd(['HGET', K.m(prev), p.id]), pm = jparse(raw, null); if (pm && !pm.left) { pm.left = true; await cmd(['HSET', K.m(prev), p.id, JSON.stringify(pm)]); } }
    const rooms = await recentRooms(); let room = null, best = -1;
    if (mode === 'battle') {
      for (const r of rooms) {
        if (r.mode !== 'battle' || r.ended_at || r.start_at <= t + 2000 || (r.code || null) !== code) continue;
        const n = activeCount(r, 8000); if (n >= MAX_PLAYERS) continue;
        if (!code && !bracketOk(r, p)) continue;
        if (n > best || (n === best && room && r.start_at < room.start_at)) { best = n; room = r; }
      }
      if (!room) room = await makeRoom('battle', code, t + (code ? 30000 : 25000));
    } else {
      for (const r of rooms) {
        if (r.mode !== mode || r.ended_at || (r.code || null) !== code) continue;
        const n = activeCount(r, 10000); if (n >= MAX_PLAYERS) continue;
        if (n > best || (n === best && room && r.created_at < room.created_at)) { best = n; room = r; }
      }
      if (!room) room = await makeRoom(mode, code, t);
    }
    const m = newMember(p, body, t); const old = room.members.get(p.id); if (old) m.joined_at = old.joined_at;
    room.members.set(p.id, m);
    const w = [['HSET', K.m(room.id), p.id, JSON.stringify(m)], ['SET', K.pr(p.id), room.id, 'EX', String(ROOM_TTL)]];
    if (mode === 'battle' && activeCount(room, 8000) >= MAX_PLAYERS) { room.start_at = Math.min(room.start_at, t + 3000); w.push(['HSET', K.meta(room.id), 'start_at', String(room.start_at)]); }
    await pipe(w);
    return roomInfo(room, hostOf(room), membersOf(room));
  });
}
async function makeRoom(mode, code, startAt) {
  const id = randomUUID(), t = nowMs(), seed = Math.floor(Math.random() * 2147483647);
  await pipe([['HSET', K.meta(id), 'mode', mode, 'code', code || '', 'seed', String(seed), 'start_at', String(startAt), 'ended_at', '0', 'created_at', String(t), 'deaths', '0', 'bots', '[]'],
    ['EXPIRE', K.meta(id), String(ROOM_TTL)], ['ZADD', K.rooms, t, id], ['ZREMRANGEBYSCORE', K.rooms, '-inf', String(t - 3600000)]]);
  return { id, mode, code, seed, start_at: startAt, ended_at: null, created_at: t, deaths: 0, bots: [], members: new Map() };
}

async function sync(p, body) {
  const roomId = body.roomId; if (!isId(roomId)) throw new HttpError(400, 'Sala inválida');
  const since = Math.max(0, Math.floor(Number(body.since) || 0));
  const [meta, mem, scr, evr] = await pipe([['HGETALL', K.meta(roomId)], ['HGETALL', K.m(roomId)], ['HGETALL', K.sc(roomId)], ['LRANGE', K.e(roomId), '-250', '-1']]);
  const r = buildRoom(roomId, hobj(meta), hobj(mem)); if (!r) throw new HttpError(404, 'Sala não encontrada');
  const m = r.members.get(p.id); if (!m || m.left) throw new HttpError(409, 'Você não está nesta sala');
  const t = nowMs(), sc = hobj(scr); const stateStr = JSON.stringify(body.state ?? null); m.state = stateStr.length <= 1024 ? (body.state ?? null) : null; m.last_seen = t;
  const host = hostOf(r), isBattle = r.mode === 'battle', running = isBattle && t >= r.start_at && !r.ended_at;
  const w = [['HSET', K.m(roomId), p.id, JSON.stringify(m)]];
  if (host === p.id && Array.isArray(body.bots)) { const bots = body.bots.slice(0, MAX_PLAYERS); if (JSON.stringify(bots).length < 16000) { r.bots = bots; w.push(['HSET', K.meta(roomId), 'bots', JSON.stringify(bots)]); } }
  if (Math.random() < .03) w.push(['EXPIRE', K.meta(roomId), String(ROOM_TTL)], ['EXPIRE', K.m(roomId), String(ROOM_TTL)], ['EXPIRE', K.e(roomId), String(ROOM_TTL)], ['EXPIRE', K.sc(roomId), String(ROOM_TTL)]);
  // eventos novos → ids sequenciais atômicos
  const pend = []; let deaths = r.deaths;
  const evs = Array.isArray(body.events) ? body.events.slice(0, 30) : [];
  for (const e of evs) {
    const type = typeof e?.type === 'string' ? e.type : '', d = e?.data && typeof e.data === 'object' ? e.data : {};
    if (type === 'chat') {
      const text = cleanText(d.text); if (!text) continue;
      if ((await cmd(['SET', 'ca:chat:' + p.id, '1', 'NX', 'PX', '700'])) !== 'OK') continue;
      pend.push(['chat', { text, name: p.name }]);
    } else if (type === 'hit') {
      if (!running && r.mode !== 'train') continue;   // no treino online os jogadores podem treinar golpes uns nos outros
      pend.push(['hit', { target: String(d.target ?? '').slice(0, 64), dmg: num(d.dmg, 0, 60), kind: String(d.kind ?? '').slice(0, 12), x: num(d.x, -500, 500), y: num(d.y, -50, 100), z: num(d.z, -500, 500), by: String(d.by ?? p.id).slice(0, 64) }]);
    } else if (type === 'death') {
      if (!isBattle || r.ended_at) continue;
      const victim = String(d.victim ?? '').slice(0, 64), killer = String(d.killer ?? '').slice(0, 64);
      if (victim !== p.id && host !== p.id) continue;
      if (victim !== p.id && !/^b\d{1,2}$/.test(victim)) continue;
      if ((await cmd(['HSETNX', K.sc(roomId), 'p:' + victim, '0'])) !== 1) continue;      // já morreu
      const n = await cmd(['HINCRBY', K.meta(roomId), 'deaths', '1']), placement = MAX_PLAYERS - (n - 1); deaths = n;
      const ops = [['HSET', K.sc(roomId), 'p:' + victim, String(placement)]]; if (killer && killer !== victim) ops.push(['HINCRBY', K.sc(roomId), 'k:' + killer, '1']);
      await pipe(ops); sc['p:' + victim] = String(placement); if (killer && killer !== victim) sc['k:' + killer] = String((+sc['k:' + killer] || 0) + 1);
      if (victim === p.id) { m.alive = false; m.placement = placement; w[0] = ['HSET', K.m(roomId), p.id, JSON.stringify(m)]; }
      pend.push(['death', { victim, killer, placement, name: String(d.name ?? '').slice(0, 16), kname: String(d.kname ?? '').slice(0, 16) }]);
    } else if (type === 'fx') { const s = JSON.stringify(d); if (s.length < 400) pend.push(['fx', d]);
    } else if (type === 'vstate') {
      if (r.mode === 'battle') continue;                       // voz só no mundo aberto e no treino
      m.voice = !!d.on; w[0] = ['HSET', K.m(roomId), p.id, JSON.stringify(m)];
    } else if (type === 'voice') {
      if (r.mode === 'battle' || !m.voice) continue;
      const to = typeof d.to === 'string' ? d.to.slice(0, 64) : ''; const tm = r.members.get(to); if (!tm || !tm.voice || tm.left) continue;
      const s = JSON.stringify(d.d ?? null); if (s.length > 6000) continue;
      pend.push(['voice', { to, d: d.d }]);
    }
  }
  let list = (evr || []).map(s => jparse(s, null)).filter(Boolean);
  if (isBattle && !r.ended_at && t >= r.start_at && (t > r.start_at + BATTLE_MS + 15000 || MAX_PLAYERS - deaths <= 1)) { r.ended_at = t; w.push(['HSET', K.meta(roomId), 'ended_at', String(t)]); }
  if (pend.length) {
    const top = await cmd(['INCRBY', K.seq(roomId), String(pend.length)]), base = top - pend.length;
    const items = pend.map(([type, data], i) => ({ id: base + i + 1, from: p.id, type, data, t })); list = list.concat(items);
    w.push(['RPUSH', K.e(roomId), ...items.map(x => JSON.stringify(x))], ['LTRIM', K.e(roomId), '-600', '-1'], ['EXPIRE', K.seq(roomId), String(ROOM_TTL)]);
  }
  await pipe(w);
  const events = list.filter(e => e.id > since && t - e.t < 20000).sort((a, b) => a.id - b.id).slice(0, 200);
  const status = r.mode !== 'battle' ? 'open' : r.ended_at ? 'ended' : t < r.start_at ? 'waiting' : 'running';
  const scores = {}; for (const [k, v] of Object.entries(sc)) { const id = k.slice(2); scores[id] = scores[id] || { k: 0 }; if (k[0] === 'k') scores[id].k = +v; else scores[id].p = +v; }
  r.members.set(p.id, m);
  return { serverNow: t, status, startAt: r.start_at, endAt: isBattle ? r.start_at + BATTLE_MS : null, hostId: host, players: membersOf(r), bots: r.bots,
    events: events.map(e => ({ id: e.id, from: e.from, type: e.type, data: e.data })), cursor: events.length ? events[events.length - 1].id : since, scores, alive: MAX_PLAYERS - deaths };
}

async function finish(p, body) {
  const roomId = body.roomId; if (!isId(roomId)) throw new HttpError(400, 'Sala inválida');
  const [meta, mem, scr] = await pipe([['HGETALL', K.meta(roomId)], ['HGETALL', K.m(roomId)], ['HGETALL', K.sc(roomId)]]);
  const r = buildRoom(roomId, hobj(meta), hobj(mem)); if (!r || r.mode !== 'battle') throw new HttpError(404, 'Partida não encontrada');
  const m = r.members.get(p.id); if (!m) throw new HttpError(409, 'Você não está nesta partida');
  if (m.rewarded && m.result) return { ...m.result, profile: profileOut(p) };
  const t = nowMs(); if (t < r.start_at + 5000) throw new HttpError(409, 'A partida ainda não começou');
  const sc = hobj(scr); let deaths = r.deaths, placement = m.placement ?? (MAX_PLAYERS - deaths <= 1 ? 1 : MAX_PLAYERS - deaths);
  if (!m.placement && !r.ended_at) { const n = await cmd(['HINCRBY', K.meta(roomId), 'deaths', '1']); deaths = n; placement = MAX_PLAYERS - (n - 1); await cmd(['HSET', K.sc(roomId), 'p:' + p.id, String(placement)]); m.alive = false; m.placement = placement; }
  placement = Math.max(1, Math.min(MAX_PLAYERS, placement));
  const kills = Math.min(15, +sc['k:' + p.id] || 0);
  const trophiesDelta = TROPHY_TABLE[placement] + 2 * kills, xpGain = 40 + 15 * kills + 6 * (17 - placement);
  p.trophies = Math.max(0, p.trophies + trophiesDelta); p.xp += xpGain; p.wins += placement === 1 ? 1 : 0; p.kills += kills; p.matches++; p.best_placement = Math.min(p.best_placement ?? 99, placement);
  const result = { placement, kills, trophiesDelta, xpGain }; m.rewarded = true; m.result = result; m.left = true; m.trophies = p.trophies;
  await pipe([['SET', K.p(p.id), JSON.stringify(p)], ['ZADD', K.lb, lbScore(p), p.id], ['HSET', K.m(roomId), p.id, JSON.stringify(m)]]);
  return { ...result, profile: profileOut(p) };
}

/* ---------------- estatísticas (cache de 8 s para não gastar comandos do Redis) ---------------- */
async function stats() {
  const c = jparse(await cmd(['GET', 'ca:stats']), null); if (c) return c;
  const t = nowMs(), rooms = await recentRooms(60); let online = 0, battles = 0, open = 0, waiting = 0, apk = 0, web = 0; const on = new Set();
  for (const r of rooms) { const n = activeCount(r, 12000); if (!n) continue; for (const m of r.members.values()) if (live(m, 12000)) { on.add(m.pid); if (m.plat === 'apk') apk++; else web++; }
    online += n; if (r.mode !== 'battle') open += n; else if (!r.ended_at) { battles++; if (r.start_at > t) waiting += n; } }
  const registered = await cmd(['ZCARD', K.lb]); const out = { online, apk, web, battles, openWorld: open, waitingBattle: waiting, registered };
  await cmd(['SET', 'ca:stats', JSON.stringify(out), 'PX', '8000']); return out;
}

/* ---------------- roteador ---------------- */
export async function handle(method, route, body) {
  if (route === 'health') return [200, { ok: true, gameApi: true, redis: !!(RURL && RTOK), platform: 'vercel' }];
  if (route === 'stats' && method === 'GET') return [200, await stats()];
  if (route === 'online' && method === 'GET') { const s = await stats(); return [200, { online: s.online, waitingBattle: s.waitingBattle }]; }
  if (route === 'leaderboard' && method === 'GET') {
    const ids = await cmd(['ZREVRANGE', K.lb, '0', '49']); if (!ids || !ids.length) return [200, { players: [] }];
    const raw = await cmd(['MGET', ...ids.map(K.p)]);
    return [200, { players: raw.map(s => jparse(s, null)).filter(Boolean).map((p, i) => ({ pos: i + 1, id: String(p.id).slice(0, 6), name: p.name, skin: p.skin, trophies: p.trophies, wins: p.wins, level: levelOf(p.xp).level, rank: rankOf(p.trophies).name })) }];
  }
  if (method !== 'POST') throw new HttpError(405, 'Método não permitido');
  const p = await auth(body);
  switch (route) {
    case 'profile': return [200, profileOut(p)];
    case 'mm/queue': return [200, await queue(p, body)];
    case 'room/sync': return [200, await sync(p, body)];
    case 'room/leave': { if (isId(body.roomId)) { const raw = await cmd(['HGET', K.m(body.roomId), p.id]), m = jparse(raw, null); if (m) { m.left = true; await cmd(['HSET', K.m(body.roomId), p.id, JSON.stringify(m)]); } } return [200, { ok: true }]; }
    case 'match/finish': return [200, await finish(p, body)];
  }
  throw new HttpError(404, 'Rota não encontrada');
}

export default async function handler(req, res) {
  const send = (status, data) => { res.statusCode = status; for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v); res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(data)); };
  if (req.method === 'OPTIONS') return send(204, {});
  try {
    const u = new URL(req.url, 'http://x'); let route = u.searchParams.get('route'); if (route == null) route = u.pathname.replace(/^\/api\/?/, '');
    route = String(route).replace(/^\/+|\/+$/g, '');
    let body = {}; if (req.method === 'POST') { body = req.body; if (typeof body === 'string') body = jparse(body, null); else if (Buffer.isBuffer(body)) body = jparse(body.toString('utf8'), null); if (body == null) { let text = ''; for await (const c of req) text += c; body = jparse(text || '{}', null); } if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON inválido'); }
    const [status, data] = await handle(req.method, route, body); return send(status, data);
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message });
    console.error('api error', e); return send(500, { error: 'Erro interno' });
  }
}
