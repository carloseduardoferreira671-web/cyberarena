/* CyberArena · cliente de rede (polling HTTP contra /api). Funciona offline com fallback local. */
// no app Android (APK) o jogo roda dentro do aparelho; o online usa o servidor publicado
// endereço do servidor: ?api=https://meu-servidor/api/ (fica salvo) · ou campo "Servidor" na tela Sala com amigos · padrão: mesmo site (ou Netlify no APK)
const API = (() => {
  try { const q = new URLSearchParams(location.search).get('api'); if (q) localStorage.setItem('cyberarena.api', q === 'reset' ? '' : q); } catch (_) { }
  let o = ''; try { o = localStorage.getItem('cyberarena.api') || ''; } catch (_) { }
  if (/^https?:\/\//.test(o)) return o.replace(/\/*$/, '/');
  // dentro de um app (APK/WebView/Capacitor/file://) não existe /api no próprio app: usa o servidor padrão (troque a linha abaixo ou use o campo "Servidor" no jogo)
  const DEFAULT_API = 'https://whimsical-kataifi-2407ec.netlify.app/api/';
  const inApp = location.hostname === 'appassets.androidplatform.net' || !/^https?:$/.test(location.protocol) || (location.hostname === 'localhost' && !location.port);
  return inApp ? DEFAULT_API : (/.pages.dev$/.test(location.hostname) ? 'https://cyberarena-jr3i.onrender.com/api/' : '/api/');
})();
const PLATFORM = location.hostname === 'appassets.androidplatform.net' ? 'apk' : 'web';   // APK e site entram nas MESMAS salas (cross-play)
const KEY = 'cyberarena.identity', LKEY = 'cyberarena.localProfile';
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join(''); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : rnd(8) + '-' + rnd(4) + '-' + rnd(4) + '-' + rnd(4) + '-' + rnd(12));

export function getIdentity() {
  let id = null; try { id = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { }
  if (!id || !id.playerId || !id.secret) { id = { playerId: uuid(), secret: rnd(32), name: 'Cyber' + Math.floor(1000 + Math.random() * 9000), skin: 'cyber' }; localStorage.setItem(KEY, JSON.stringify(id)); }
  return id;
}
export function saveIdentity(partial) { const id = Object.assign(getIdentity(), partial || {}); localStorage.setItem(KEY, JSON.stringify(id)); return id; }

const RANKS = [[0, 'Bronze'], [200, 'Prata'], [500, 'Ouro'], [900, 'Platina'], [1400, 'Diamante'], [2000, 'Mestre'], [2800, 'Cyber Lenda']];
export function rankOf(t) { let i = 0; RANKS.forEach((r, k) => { if (t >= r[0]) i = k; }); const nx = RANKS[i + 1], span = nx ? nx[0] - RANKS[i][0] : 400; return { name: RANKS[i][1], tier: nx ? 3 - Math.min(2, Math.floor((t - RANKS[i][0]) / span * 3)) : 1, index: i, min: RANKS[i][0], next: nx ? nx[0] : null }; }
export function levelOf(xp) { let lvl = 1, need = 250, left = xp; while (left >= need && lvl < 100) { left -= need; lvl++; need = 250 + (lvl - 1) * 50; } return { level: lvl, levelXp: left, levelNext: need }; }
const TROPHY = [0, 32, 24, 18, 13, 8, 8, 4, 4, 0, 0, -4, -4, -7, -7, -10, -10];
export function localResult(placement, kills) { return { placement, kills, trophiesDelta: TROPHY[placement] + 2 * kills, xpGain: 40 + 15 * kills + 6 * (17 - placement) }; }

function localProfile(id) {
  let p = null; try { p = JSON.parse(localStorage.getItem(LKEY) || 'null'); } catch (_) { }
  p = Object.assign({ trophies: 0, xp: 0, wins: 0, kills: 0, matches: 0, bestPlacement: null }, p || {}, { id: id.playerId, name: id.name, skin: id.skin });
  return Object.assign(p, levelOf(p.xp), { rank: rankOf(p.trophies), offline: true });
}
export const NOPROG = new URLSearchParams(location.search).get('noprog') === '1';
function saveLocal(p) { const { trophies, xp, wins, kills, matches, bestPlacement } = p; localStorage.setItem(LKEY, JSON.stringify({ trophies, xp, wins, kills, matches, bestPlacement })); }

export class Net {
  constructor(identity) {
    this.id = identity || getIdentity(); this.online = location.protocol !== 'file:' || API !== '/api/'; this.room = null; this.since = 0;
    this.offset = 0; this.hasOffset = false; this.outbox = []; this.timer = 0; this.inflight = false; this.fails = 0; this.host = false; this.running = false; this.last = null;
    addEventListener('pagehide', () => this._beaconLeave());
  }
  async _post(path, body) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    try {
      const t0 = Date.now();
      const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ playerId: this.id.playerId, secret: this.id.secret, name: this.id.name, skin: this.id.skin, char: this.id.char, platform: PLATFORM }, body || {})), signal: ctl.signal });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(data.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
      if (data.serverNow) { const est = data.serverNow + (Date.now() - t0) / 2 - Date.now(); this.offset = this.hasOffset ? this.offset * .8 + est * .2 : est; this.hasOffset = true; }
      return data;
    } finally { clearTimeout(to); }
  }
  serverNow() { return Date.now() + this.offset; }
  async profile(update) {
    if (update) this.id = saveIdentity(update);
    if (this.online) { try { const p = await this._post('profile', {}); p.offline = false; return p; } catch (e) { if (!e.status) this.online = false; } }
    return localProfile(this.id);
  }
  post(path, body) { return this._post(path, body); }   // chamadas avulsas (amigos/grupo do lobby)
  async queue({ mode, code, party }) {
    this.mode = mode;
    if (this.online) {
      try { const r = await this._post('mm/queue', { mode, code: code || null, party: party || null }); this.room = r; this.since = 0; this.host = r.hostId === this.id.playerId; return r; }
      catch (e) { if (!e.status) this.online = false; else throw e; }
    }
    const now = Date.now();
    this.room = { roomId: 'local', mode, seed: (Math.random() * 2147483647) | 0, startAt: now + (mode === 'battle' ? 3000 : 0), endAt: mode === 'battle' ? now + 3000 + 360000 : null, serverNow: now, hostId: this.id.playerId, code: null, players: [{ id: this.id.playerId, name: this.id.name, skin: this.id.skin, trophies: localProfile(this.id).trophies }], offline: true };
    this.offset = 0; this.host = true; return this.room;
  }
  isHost() { return !this.room || this.room.offline || this.host; }
  get offline() { return !this.room || this.room.offline; }
  start(h) {
    this.h = h; this.running = true; const rate = this.mode === 'open' ? 333 : 166;
    const loop = async () => {
      if (!this.running) return;
      if (this.offline) { this.timer = setTimeout(loop, 500); return; }
      if (this.inflight) { this.timer = setTimeout(loop, 30); return; }
      this.inflight = true; const evs = this.outbox.splice(0, 30), t0 = performance.now();
      try {
        const body = { roomId: this.room.roomId, since: this.since, state: h.getState(), events: evs };
        if (this.host && h.getBots) { const b = h.getBots(); if (b) body.bots = b; }
        const r = await this._post('room/sync', body);
        this.fails = 0; this.since = r.cursor; this.host = r.hostId === this.id.playerId; this.last = r;
        try { h.onSync(r); } catch (e) { console.error(e); }
      } catch (e) {
        this.outbox.unshift(...evs.filter(x => x.type !== 'fx')); this.fails++;
        if (e.status === 404 || e.status === 409 || this.fails === 6) { h.onOffline?.(e); if (e.status) { this.running = false; this.inflight = false; return; } }
      }
      this.inflight = false;
      const wait = this.fails ? Math.min(4000, rate * 2 ** this.fails) : Math.max(10, rate - (performance.now() - t0));
      this.timer = setTimeout(loop, wait);
    };
    loop();
  }
  send(type, data) {
    if (this.offline) { if (type === 'chat' && this.h) setTimeout(() => this.h.onSync({ local: true, events: [{ id: 0, from: this.id.playerId, type: 'chat', data: { text: data.text, name: this.id.name } }] }), 0); return; }
    this.outbox.push({ type, data }); if (this.outbox.length > 60) this.outbox.splice(0, this.outbox.length - 60);
  }
  chat(text) { text = String(text || '').trim().slice(0, 120); if (text) this.send('chat', { text }); }
  async finish(local) {
    if (!this.offline) {
      // envia eventos pendentes (morte) antes de pedir o resultado
      for (let i = 0; i < 20 && (this.inflight || this.outbox.length); i++) await new Promise(r => setTimeout(r, 150));
      try { return await this._post('match/finish', { roomId: this.room.roomId }); } catch (e) { console.warn('finish', e); }
    }
    const res = localResult(local.placement, local.kills), p = localProfile(this.id);
    if (NOPROG) return Object.assign(res, { trophiesDelta: 0, xpGain: 0, profile: p, offline: true, noprog: true });   // MODO OFFLINE: sem troféus, XP ou qualquer progresso
    if (false) {   // v146: o progresso offline antigo foi desligado (progresso só vem do servidor)
      p.trophies = Math.max(0, p.trophies + res.trophiesDelta); p.xp += res.xpGain; p.kills += local.kills; p.matches++; if (local.placement === 1) p.wins++;
      p.bestPlacement = Math.min(p.bestPlacement || 99, local.placement); saveLocal(p); Object.assign(p, levelOf(p.xp), { rank: rankOf(p.trophies) });
    }
    return Object.assign(res, { profile: p, offline: true });
  }
  async leave() { this.running = false; clearTimeout(this.timer); if (this.room && !this.offline) { try { await this._post('room/leave', { roomId: this.room.roomId }); } catch (_) { } } this.room = null; }
  _beaconLeave() { if (this.room && !this.offline && navigator.sendBeacon) navigator.sendBeacon(API + 'room/leave', new Blob([JSON.stringify({ playerId: this.id.playerId, secret: this.id.secret, roomId: this.room.roomId })], { type: 'application/json' })); }
  async onlineCount() { if (!this.online) return null; try { const r = await fetch(API + 'online'); return r.ok ? await r.json() : null; } catch (_) { return null; } }
  async leaderboard() { if (!this.online) return null; try { const r = await fetch(API + 'leaderboard'); return r.ok ? (await r.json()).players : null; } catch (_) { return null; } }
}
