/* CyberArena · API online: perfil, matchmaking, salas (batalha 16 / mundo aberto), sincronização por polling,
   eventos (dano, morte, efeitos, chat), resultados com troféus/XP e ranking. Tudo em Netlify Database (Postgres). */
import type { Config } from "@netlify/functions";
import { sql, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../../db/index.js";

const MAX_PLAYERS = 16;
const BATTLE_MS = 6 * 60 * 1000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });

async function q<T = any>(query: SQL): Promise<T[]> {
  const r: any = await db.execute(query);
  return (r?.rows ?? r ?? []) as T[];
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const isId = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(s);
const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 16) : "") || "";
const cleanSkin = (s: unknown) => (typeof s === "string" && /^[a-z0-9_]{1,16}$/.test(s) ? s : "");
const cleanCode = (s: unknown) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "") || null;

/* ---------- ranks / nível ---------- */
const RANKS: [number, string][] = [[0, "Bronze"], [200, "Prata"], [500, "Ouro"], [900, "Platina"], [1400, "Diamante"], [2000, "Mestre"], [2800, "Cyber Lenda"]];
function rankOf(t: number) {
  let i = 0; for (let k = 0; k < RANKS.length; k++) if (t >= RANKS[k][0]) i = k;
  const next = RANKS[i + 1]; const span = next ? next[0] - RANKS[i][0] : 400;
  const tier = next ? 3 - Math.min(2, Math.floor(((t - RANKS[i][0]) / span) * 3)) : 1;
  return { name: RANKS[i][1], tier, index: i, min: RANKS[i][0], next: next ? next[0] : null };
}
function levelOf(xp: number) {
  let lvl = 1, need = 250, left = xp;
  while (left >= need && lvl < 100) { left -= need; lvl++; need = 250 + (lvl - 1) * 50; }
  return { level: lvl, levelXp: left, levelNext: need };
}
function profileOut(p: any) {
  return { id: p.id, name: p.name, skin: p.skin, trophies: p.trophies, xp: p.xp, ...levelOf(p.xp), wins: p.wins, kills: p.kills, matches: p.matches, bestPlacement: p.best_placement ?? null, rank: rankOf(p.trophies) };
}
const TROPHY_TABLE = [0, 32, 24, 18, 13, 8, 8, 4, 4, 0, 0, -4, -4, -7, -7, -10, -10];

/* ---------- identidade ---------- */
async function auth(body: any) {
  const id = body?.playerId, secret = body?.secret;
  if (!isId(id) || typeof secret !== "string" || secret.length < 16 || secret.length > 128) throw new HttpError(400, "Identidade inválida");
  const name = cleanName(body.name), skin = cleanSkin(body.skin), h = sha(secret);
  const rows = await q(sql`
    insert into players (id, secret_hash, name, skin) values (${id}, ${h}, ${name || "Cyber" + Math.floor(1000 + Math.random() * 9000)}, ${skin || "cyber"})
    on conflict (id) do update set
      name = case when players.secret_hash = ${h} and ${name} <> '' then ${name} else players.name end,
      skin = case when players.secret_hash = ${h} and ${skin} <> '' then ${skin} else players.skin end,
      updated_at = now()
    returning *`);
  const p = rows[0];
  if (!p || p.secret_hash !== h) throw new HttpError(403, "Identidade não confere");
  return p;
}

/* ---------- salas ---------- */
async function roomView(roomId: string) {
  const [r] = await q(sql`select id, mode, code, seed, start_at, ended_at, bots, scores, deaths, extract(epoch from start_at)*1000 as start_ms,
      extract(epoch from ended_at)*1000 as end_ms, extract(epoch from now())*1000 as now_ms from rooms where id = ${roomId}`);
  return r;
}
async function hostOf(roomId: string) {
  const [h] = await q(sql`select player_id from room_members where room_id = ${roomId} and not "left" and last_seen > now() - interval '4 seconds' order by joined_at asc limit 1`);
  return h?.player_id ?? null;
}
async function membersOf(roomId: string) {
  return q(sql`select m.player_id as id, p.name, p.skin, p.trophies, m.state as s, m.alive,
      extract(epoch from (now() - m.last_seen))*1000 as age
    from room_members m join players p on p.id = m.player_id
    where m.room_id = ${roomId} and not m."left" and m.last_seen > now() - interval '10 seconds' order by m.joined_at`);
}
function roomInfo(r: any, hostId: string | null, players: any[]) {
  return {
    roomId: r.id, mode: r.mode, seed: r.seed, code: r.code, startAt: Number(r.start_ms),
    endAt: r.mode === "battle" ? Number(r.start_ms) + BATTLE_MS : null, serverNow: Number(r.now_ms), hostId,
    players: players.map((m) => ({ id: m.id, name: m.name, skin: m.skin, trophies: m.trophies })),
  };
}

async function cleanup() {
  if (Math.random() > 0.25) return;
  await q(sql`delete from events where id in (select id from events where created_at < now() - interval '2 minutes' limit 2000)`);
  await q(sql`delete from rooms where id in (select id from rooms where (ended_at is not null and ended_at < now() - interval '10 minutes')
     or (mode = 'open' and not exists (select 1 from room_members m where m.room_id = rooms.id and m.last_seen > now() - interval '10 minutes'))
     or (mode = 'battle' and start_at < now() - interval '20 minutes') limit 200)`);
}

async function queue(p: any, body: any) {
  const mode = body.mode === "open" ? "open" : "battle", code = cleanCode(body.code);
  await cleanup();
  // sai de qualquer sala anterior
  await q(sql`update room_members set "left" = true where player_id = ${p.id} and not "left"`);
  let roomId: string | null = null;
  if (mode === "battle") {
    const cand = await q(sql`select r.id, count(m.player_id) as n from rooms r
        left join room_members m on m.room_id = r.id and not m."left" and m.last_seen > now() - interval '8 seconds'
      where r.mode = 'battle' and r.ended_at is null and r.start_at > now() + interval '2 seconds' and r.code is not distinct from ${code}
      group by r.id, r.start_at having count(m.player_id) < ${MAX_PLAYERS}
      order by count(m.player_id) desc, r.start_at asc limit 1`);
    if (cand[0]) roomId = cand[0].id;
    if (!roomId) {
      const wait = code ? 30 : 25, seed = Math.floor(Math.random() * 2147483647);
      const [r] = await q(sql`insert into rooms (mode, code, seed, start_at) values ('battle', ${code}, ${seed}, now() + make_interval(secs => ${wait})) returning id`);
      roomId = r.id;
    }
  } else {
    const cand = await q(sql`select r.id, count(m.player_id) as n from rooms r
        left join room_members m on m.room_id = r.id and not m."left" and m.last_seen > now() - interval '10 seconds'
      where r.mode = 'open' and r.ended_at is null and r.code is not distinct from ${code}
      group by r.id having count(m.player_id) < ${MAX_PLAYERS} order by count(m.player_id) desc, r.created_at asc limit 1`);
    roomId = cand[0]?.id ?? null;
    if (!roomId) {
      const seed = Math.floor(Math.random() * 2147483647);
      const [r] = await q(sql`insert into rooms (mode, code, seed, start_at) values ('open', ${code}, ${seed}, now()) returning id`);
      roomId = r.id;
    }
  }
  await q(sql`insert into room_members (room_id, player_id) values (${roomId}, ${p.id})
    on conflict (room_id, player_id) do update set "left" = false, last_seen = now(), alive = true`);
  if (mode === "battle") {
    const [c] = await q(sql`select count(*) as n from room_members where room_id = ${roomId} and not "left" and last_seen > now() - interval '8 seconds'`);
    if (Number(c.n) >= MAX_PLAYERS) await q(sql`update rooms set start_at = least(start_at, now() + interval '3 seconds') where id = ${roomId}`);
  }
  const r = await roomView(roomId!);
  return roomInfo(r, await hostOf(roomId!), await membersOf(roomId!));
}

function cleanText(s: unknown) { return typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 120) : ""; }
const num = (v: unknown, a: number, b: number, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };

async function sync(p: any, body: any) {
  const roomId = body.roomId; if (!isId(roomId)) throw new HttpError(400, "Sala inválida");
  let r = await roomView(roomId); if (!r) throw new HttpError(404, "Sala não encontrada");
  const stateStr = JSON.stringify(body.state ?? null); const state = stateStr.length <= 1024 ? stateStr : "null";
  const up = await q(sql`update room_members set state = ${state}::jsonb, last_seen = now() where room_id = ${roomId} and player_id = ${p.id} and not "left" returning alive`);
  if (!up[0]) throw new HttpError(409, "Você não está nesta sala");
  const host = await hostOf(roomId);
  const isBattle = r.mode === "battle", running = isBattle && Number(r.now_ms) >= Number(r.start_ms) && !r.ended_at;
  if (host === p.id && Array.isArray(body.bots)) {
    const bots = JSON.stringify(body.bots.slice(0, MAX_PLAYERS)); if (bots.length < 16000) await q(sql`update rooms set bots = ${bots}::jsonb where id = ${roomId}`);
  }
  // eventos
  const evs: any[] = Array.isArray(body.events) ? body.events.slice(0, 30) : [];
  for (const e of evs) {
    const type = typeof e?.type === "string" ? e.type : "", d = e?.data && typeof e.data === "object" ? e.data : {};
    if (type === "chat") {
      const text = cleanText(d.text); if (!text) continue;
      const ok = await q(sql`update players set last_chat_at = now() where id = ${p.id} and (last_chat_at is null or last_chat_at < now() - interval '700 milliseconds') returning id`);
      if (!ok[0]) continue;
      await q(sql`insert into events (room_id, from_id, type, data) values (${roomId}, ${p.id}, 'chat', ${JSON.stringify({ text, name: p.name })}::jsonb)`);
    } else if (type === "hit") {
      if (!running) continue;
      const data = { target: String(d.target ?? "").slice(0, 64), dmg: num(d.dmg, 0, 60), kind: String(d.kind ?? "").slice(0, 12), x: num(d.x, -500, 500), y: num(d.y, -50, 100), z: num(d.z, -500, 500), by: String(d.by ?? p.id).slice(0, 64) };
      await q(sql`insert into events (room_id, from_id, type, data) values (${roomId}, ${p.id}, 'hit', ${JSON.stringify(data)}::jsonb)`);
    } else if (type === "death") {
      if (!isBattle || r.ended_at) continue;
      const victim = String(d.victim ?? "").slice(0, 64), killer = String(d.killer ?? "").slice(0, 64);
      if (victim !== p.id && host !== p.id) continue;           // só a própria vítima (ou o host, para bots)
      if (victim !== p.id && !/^b\d{1,2}$/.test(victim)) continue;
      const scores = r.scores || {}; if (scores[victim]?.p) continue;
      const alive = MAX_PLAYERS - Number(r.deaths); scores[victim] = { ...(scores[victim] || { k: 0 }), p: alive };
      if (killer && killer !== victim) scores[killer] = { ...(scores[killer] || { k: 0 }), k: (scores[killer]?.k || 0) + 1 };
      await q(sql`update rooms set scores = ${JSON.stringify(scores)}::jsonb, deaths = deaths + 1 where id = ${roomId}`);
      if (victim === p.id) await q(sql`update room_members set alive = false, placement = ${alive} where room_id = ${roomId} and player_id = ${p.id}`);
      await q(sql`insert into events (room_id, from_id, type, data) values (${roomId}, ${p.id}, 'death', ${JSON.stringify({ victim, killer, placement: alive, name: String(d.name ?? "").slice(0, 16), kname: String(d.kname ?? "").slice(0, 16) })}::jsonb)`);
      r.deaths = Number(r.deaths) + 1; r.scores = scores;
    } else if (type === "fx") {
      const s = JSON.stringify(d); if (s.length < 400) await q(sql`insert into events (room_id, from_id, type, data) values (${roomId}, ${p.id}, 'fx', ${s}::jsonb)`);
    }
  }
  // fim da batalha
  if (isBattle && !r.ended_at && Number(r.now_ms) >= Number(r.start_ms) && (Number(r.now_ms) > Number(r.start_ms) + BATTLE_MS + 15000 || MAX_PLAYERS - Number(r.deaths) <= 1)) {
    await q(sql`update rooms set ended_at = now() where id = ${roomId} and ended_at is null`);
  }
  r = await roomView(roomId);
  const since = Math.max(0, Math.floor(Number(body.since) || 0));
  const events = await q(sql`select id, from_id as "from", type, data from events where room_id = ${roomId} and id > ${since} and created_at > now() - interval '20 seconds' order by id asc limit 200`);
  const players = await membersOf(roomId);
  const status = r.mode === "open" ? "open" : r.ended_at ? "ended" : Number(r.now_ms) < Number(r.start_ms) ? "waiting" : "running";
  return {
    serverNow: Number(r.now_ms), status, startAt: Number(r.start_ms), endAt: r.mode === "battle" ? Number(r.start_ms) + BATTLE_MS : null,
    hostId: host, players: players.map((m) => ({ id: m.id, name: m.name, skin: m.skin, trophies: m.trophies, s: m.s, alive: m.alive, age: Math.round(Number(m.age)) })),
    bots: r.bots || [], events: events.map((e) => ({ id: Number(e.id), from: e.from, type: e.type, data: e.data })),
    cursor: events.length ? Number(events[events.length - 1].id) : since, scores: r.scores || {}, alive: MAX_PLAYERS - Number(r.deaths),
  };
}

async function finish(p: any, body: any) {
  const roomId = body.roomId; if (!isId(roomId)) throw new HttpError(400, "Sala inválida");
  const r = await roomView(roomId); if (!r || r.mode !== "battle") throw new HttpError(404, "Partida não encontrada");
  const [m] = await q(sql`select * from room_members where room_id = ${roomId} and player_id = ${p.id}`);
  if (!m) throw new HttpError(409, "Você não está nesta partida");
  if (m.rewarded && m.result) return { ...m.result, profile: profileOut(p) };
  if (Number(r.now_ms) < Number(r.start_ms) + 5000) throw new HttpError(409, "A partida ainda não começou");
  const alive = MAX_PLAYERS - Number(r.deaths);
  let placement = m.placement ?? (alive <= 1 ? 1 : alive);
  if (!m.placement && !r.ended_at) { // saiu antes do fim estando vivo: conta como eliminado agora
    placement = alive; await q(sql`update room_members set alive = false, placement = ${alive} where room_id = ${roomId} and player_id = ${p.id}`);
    const scores = r.scores || {}; scores[p.id] = { ...(scores[p.id] || { k: 0 }), p: alive };
    await q(sql`update rooms set scores = ${JSON.stringify(scores)}::jsonb, deaths = deaths + 1 where id = ${roomId}`);
  }
  placement = Math.max(1, Math.min(MAX_PLAYERS, placement));
  const kills = Math.min(15, Number(r.scores?.[p.id]?.k || 0));
  const trophiesDelta = TROPHY_TABLE[placement] + 2 * kills;
  const xpGain = 40 + 15 * kills + 6 * (17 - placement);
  const [np] = await q(sql`update players set trophies = greatest(0, trophies + ${trophiesDelta}), xp = xp + ${xpGain},
      wins = wins + ${placement === 1 ? 1 : 0}, kills = kills + ${kills}, matches = matches + 1,
      best_placement = least(coalesce(best_placement, 99), ${placement}), updated_at = now() where id = ${p.id} returning *`);
  const result = { placement, kills, trophiesDelta, xpGain };
  const claimed = await q(sql`update room_members set rewarded = true, result = ${JSON.stringify(result)}::jsonb, "left" = true where room_id = ${roomId} and player_id = ${p.id} and not rewarded returning player_id`);
  if (!claimed[0]) { // corrida: outra requisição já premiou — desfaz
    await q(sql`update players set trophies = greatest(0, trophies - ${trophiesDelta}), xp = xp - ${xpGain}, wins = wins - ${placement === 1 ? 1 : 0}, kills = kills - ${kills}, matches = matches - 1 where id = ${p.id}`);
    const [m2] = await q(sql`select result from room_members where room_id = ${roomId} and player_id = ${p.id}`);
    const [p2] = await q(sql`select * from players where id = ${p.id}`);
    return { ...(m2?.result || result), profile: profileOut(p2) };
  }
  return { ...result, profile: profileOut(np) };
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const route = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  try {
    if (route === "leaderboard" && req.method === "GET") {
      const rows = await q(sql`select id, name, skin, trophies, xp, wins from players order by trophies desc, xp desc limit 50`);
      return json({ players: rows.map((p, i) => ({ pos: i + 1, id: String(p.id).slice(0, 6), name: p.name, skin: p.skin, trophies: p.trophies, wins: p.wins, level: levelOf(p.xp).level, rank: rankOf(p.trophies).name })) });
    }
    if (route === "health") return json({ ok: true, gameApi: true });
    if (route === "online" && req.method === "GET") {
      const [o] = await q(sql`select count(distinct player_id) as n from room_members where not "left" and last_seen > now() - interval '12 seconds'`);
      const [b] = await q(sql`select count(distinct m.player_id) as n from room_members m join rooms r on r.id = m.room_id where r.mode = 'battle' and r.ended_at is null and r.start_at > now() and not m."left" and m.last_seen > now() - interval '12 seconds'`);
      return json({ online: Number(o?.n ?? 0), waitingBattle: Number(b?.n ?? 0) });
    }
    if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
    const text = await req.text(); if (text.length > 24000) throw new HttpError(413, "Requisição grande demais");
    let body: any; try { body = JSON.parse(text || "{}"); } catch { throw new HttpError(400, "JSON inválido"); }
    const p = await auth(body);
    switch (route) {
      case "profile": return json(profileOut(p));
      case "mm/queue": return json(await queue(p, body));
      case "room/sync": return json(await sync(p, body));
      case "room/leave": if (isId(body.roomId)) await q(sql`update room_members set "left" = true where room_id = ${body.roomId} and player_id = ${p.id}`); return json({ ok: true });
      case "match/finish": return json(await finish(p, body));
    }
    throw new HttpError(404, "Rota não encontrada");
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("api error", e);
    return json({ error: "Erro interno" }, 500);
  }
};

export const config: Config = { path: ["/api/*"] };
