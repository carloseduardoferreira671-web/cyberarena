/* CyberArena · PRÉ-VENDA / ACESSO ANTECIPADO (módulo independente do server.mjs)
   Pix (QR novo por compra) e cartão pelo Mercado Pago, confirmação automática, código de acesso, devolução em 7 dias.
   Rotas (todas em /api/presale/...):
     GET  status                      vagas, preço, se o jogo exige código
     POST checkout {email,method,terms}   cria o pedido (method: "pix" | "card")
     GET  order?id=&k=                estado do pedido (+ QR enquanto espera, + código quando pago)
     POST webhook                     aviso do Mercado Pago (sempre conferimos o pagamento direto na API do MP)
     POST refund {id,k}               devolução automática se dentro do prazo
     GET  check?code=&dev=            o jogo pergunta se o código vale (limite de aparelhos por código)
     admin/*  (cabeçalho x-admin-key) list, confirm, refund, revoke, gift, export
   Variáveis de ambiente (painel do Render):
     MP_ACCESS_TOKEN     (obrigatória) Access Token de PRODUÇÃO do Mercado Pago
     ADMIN_KEY           (obrigatória p/ painel admin) senha longa que você inventa
     PUBLIC_URL          endereço público deste servidor (padrão: RENDER_EXTERNAL_URL)
     SITE_URL            endereço da página de pré-registro, p/ voltar do cartão (padrão: PUBLIC_URL/pre-registro/)
     PRESALE_PRICE_CENTS preço em centavos (padrão 299 = R$ 2,99)     PRESALE_APK_URL link do APK (só quem tem código baixa)       PRESALE_TOTAL vagas (padrão 500)
     PRESALE_GATE=1      o jogo só abre com código                       PRESALE_OPEN=0 fecha as vendas
     PRESALE_REFUND_DAYS (padrão 7)  PRESALE_MAX_DEVICES (padrão 3)  PRESALE_PENDING_MIN (padrão 35, mínimo 31)
     MP_WEBHOOK_SECRET   (opcional) assinatura secreta do webhook (veja o LEIA-ME)
   Guarda tudo no Redis Upstash (UPSTASH_REDIS_REST_URL/TOKEN, o mesmo do servidor); sem ele, usa um arquivo local. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E = (k, d = '') => (process.env[k] ?? d);
const N = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };
const cfg = () => ({
  token: E('MP_ACCESS_TOKEN'), mpBase: E('MP_API_BASE', 'https://api.mercadopago.com').replace(/\/$/, ''),
  adminKey: E('ADMIN_KEY'), secret: E('MP_WEBHOOK_SECRET'),
  pub: (E('PUBLIC_URL') || E('RENDER_EXTERNAL_URL')).replace(/\/$/, ''),
  site: E('SITE_URL').replace(/\/$/, ''),
  apkUrl: E('PRESALE_APK_URL'), cents: Math.round(N('PRESALE_PRICE_CENTS', 299)), total: Math.round(N('PRESALE_TOTAL', 500)),
  gate: E('PRESALE_GATE') === '1', open: E('PRESALE_OPEN', '1') !== '0',
  refundDays: N('PRESALE_REFUND_DAYS', 7), maxDev: Math.round(N('PRESALE_MAX_DEVICES', 3)), pendMin: Math.max(31, N('PRESALE_PENDING_MIN', 35)),   // o Pix do Mercado Pago exige validade mínima de 30 min
});
const PREFIX = () => E('PRESALE_PREFIX', 'cyberarena:presale:');
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const sha = s => createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const now = () => Date.now();
const DAY = 86400e3;

/* ---------------- armazenamento (Redis Upstash ou arquivo) ---------------- */
function makeStore() {
  const url = (E('UPSTASH_REDIS_REST_URL') || E('KV_REST_API_URL')).replace(/\/$/, ''), tok = E('UPSTASH_REDIS_REST_TOKEN') || E('KV_REST_API_TOKEN');
  if (url && tok) {
    const cmd = async c => {
      const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: JSON.stringify(c), signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('redis HTTP ' + r.status); const j = await r.json(); if (j.error) throw new Error('redis: ' + j.error); return j.result;
    };
    const P = PREFIX();
    return {
      kind: 'redis',
      get: async k => { const v = await cmd(['GET', P + k]); return v ? JSON.parse(v) : null; },
      set: async (k, o) => { await cmd(['SET', P + k, JSON.stringify(o)]); },
      sadd: async (s, m) => { await cmd(['SADD', P + s, m]); },
      smembers: async s => (await cmd(['SMEMBERS', P + s])) || [],
      mget: async ks => { const out = []; for (let i = 0; i < ks.length; i += 100) { const r = await cmd(['MGET', ...ks.slice(i, i + 100).map(k => P + k)]); out.push(...r.map(v => (v ? JSON.parse(v) : null))); } return out; },
    };
  }
  const file = path.join(E('DATA_DIR', path.join(__dirname, 'data')), 'presale.json');
  let db = { kv: {}, sets: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* primeira vez */ }
  let timer = null;
  const save = () => { if (timer) return; timer = setTimeout(() => { timer = null; try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); } catch (e) { console.error('presale: não salvou', e.message); } }, 300); };
  return {
    kind: 'file',
    get: async k => (db.kv[k] ? JSON.parse(db.kv[k]) : null),
    set: async (k, o) => { db.kv[k] = JSON.stringify(o); save(); },
    sadd: async (s, m) => { (db.sets[s] ||= []); if (!db.sets[s].includes(m)) db.sets[s].push(m); save(); },
    smembers: async s => db.sets[s] || [],
    mget: async ks => ks.map(k => (db.kv[k] ? JSON.parse(db.kv[k]) : null)),
  };
}
let _store = null; const store = () => (_store ||= makeStore());
export function __resetForTests() { _store = null; cache = null; chain = Promise.resolve(); rl.clear(); syncAt.clear(); }

let chain = Promise.resolve();   // fila: operações que mudam vagas/códigos acontecem uma de cada vez
const locked = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

/* ---------------- pedidos ---------------- */
let cache = null;
const invalidate = () => { cache = null; };
async function allOrders() {
  if (cache && now() - cache.t < 4000) return cache.list;
  const ids = await store().smembers('ids'); const list = (await store().mget(ids.map(i => 'o:' + i))).filter(Boolean);
  cache = { t: now(), list }; return list;
}
const saveOrder = async o => { await store().set('o:' + o.id, o); invalidate(); };
const counts = (list, c) => {
  const t = now(); let paid = 0, pending = 0, gift = 0, refunded = 0;
  for (const o of list) { if (o.status === 'paid') paid++; else if (o.status === 'gift') gift++; else if (o.status === 'refunded') refunded++; else if (o.status === 'pending' && o.expires > t) pending++; }
  return { paid, pending, gift, refunded, reserved: paid + pending, left: Math.max(0, c.total - paid - pending) };
};
const CODE_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
async function newCode() {
  for (let i = 0; i < 20; i++) {
    let s = ''; for (let j = 0; j < 8; j++) s += CODE_ALPHA[randomInt(CODE_ALPHA.length)];
    const code = s.slice(0, 4) + '-' + s.slice(4); if (!(await store().get('c:' + code))) return code;
  }
  throw new HttpError(500, 'Não consegui gerar código');
}
const normCode = s => { const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); return t.length === 8 ? t.slice(0, 4) + '-' + t.slice(4) : ''; };

async function issueCode(o, extra = {}) {            // chamar dentro de locked()
  if (o.code) return o;
  const code = await newCode();
  await store().set('c:' + code, { code, orderId: o.id, devices: [], revoked: false, created: now() });
  Object.assign(o, extra, { code }); await saveOrder(o); return o;
}
async function revoke(o, status) {
  if (o.code) { const c = await store().get('c:' + o.code); if (c) { c.revoked = true; await store().set('c:' + o.code, c); } }
  if (status) o.status = status; await saveOrder(o);
}

/* ---------------- Mercado Pago ---------------- */
async function mp(method, p, body, idem) {
  const c = cfg(); if (!c.token) throw new HttpError(503, 'Pagamentos ainda não configurados (falta MP_ACCESS_TOKEN)');
  const h = { authorization: 'Bearer ' + c.token, 'content-type': 'application/json' }; if (idem) h['x-idempotency-key'] = idem;
  let r; try { r = await fetch(c.mpBase + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) }); }
  catch (e) { throw new HttpError(502, 'Mercado Pago não respondeu. Tente de novo.'); }
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch { /* resposta não-JSON */ }
  if (!r.ok) { console.error('presale: MP', method, p, r.status, txt.slice(0, 300)); throw new HttpError(502, 'O Mercado Pago recusou o pedido (' + r.status + ')', { mp: j && (j.message || j.error) }); }
  return j;
}
const isoBR = ms => new Date(ms - 3 * 3600e3).toISOString().replace('Z', '-03:00');   // horário de Brasília (UTC-3, sem horário de verão)

async function applyPayment(o, pay) {                // sincroniza o pedido com o que o Mercado Pago diz
  const c = cfg(); if (!pay || !o) return o;
  const amountOk = Math.round(Number(pay.transaction_amount) * 100) === o.cents && (pay.currency_id || 'BRL') === 'BRL';
  return locked(async () => {
    o = (await store().get('o:' + o.id)) || o;
    if (pay.id && !o.mpId) o.mpId = String(pay.id);
    if (pay.status === 'approved') {
      if (!amountOk) { o.flag = 'valor_diferente'; await saveOrder(o); console.error('presale: valor diferente no pedido', o.id); return o; }
      if (o.status === 'refunded') return o;
      if (o.status !== 'paid') { o.status = 'paid'; o.paidAt = now(); o.mpId = String(pay.id); }
      await issueCode(o);
    } else if (['refunded', 'charged_back'].includes(pay.status)) { if (o.status === 'paid') await revoke(o, 'refunded'); }
    else if (['cancelled', 'rejected'].includes(pay.status) && o.status === 'pending') { o.status = pay.status === 'rejected' ? 'failed' : 'expired'; await saveOrder(o); }
    return o;
  });
}
const syncAt = new Map();
async function syncOrder(o) {                        // plano B quando o webhook demora: pergunta direto ao MP
  if (o.status !== 'pending' || now() - (syncAt.get(o.id) || 0) < 4000) return o;
  syncAt.set(o.id, now()); if (syncAt.size > 3000) syncAt.clear();
  try {
    let pay = null;
    if (o.mpId) pay = await mp('GET', '/v1/payments/' + encodeURIComponent(o.mpId));
    else { const r = await mp('GET', '/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(o.id)); pay = (r.results || []).find(p => p.status === 'approved') || (r.results || [])[0] || null; }
    if (pay) o = await applyPayment(o, pay);
    if (o.status === 'pending' && o.expires < now() - 60e3 && (o.method === 'pix' || o.prefId)) { o.status = 'expired'; }
    await saveOrder(o);
  } catch (e) { /* tenta de novo na próxima consulta */ }
  return o;
}

/* ---------------- util HTTP ---------------- */
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-admin-key', 'access-control-max-age': '600' };
function send(res, code, obj, extra = {}) { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra }); res.end(b); }
function readBody(req, max = 20000) {
  return new Promise((ok, no) => { let n = 0; const ch = []; req.on('data', d => { n += d.length; if (n > max) { no(new HttpError(413, 'Corpo grande demais')); req.destroy(); } else ch.push(d); }); req.on('end', () => { try { const t = Buffer.concat(ch).toString('utf8'); ok(t ? JSON.parse(t) : {}); } catch { no(new HttpError(400, 'JSON inválido')); } }); req.on('error', () => no(new HttpError(400, 'Falha ao ler'))); });
}
const rl = new Map();
function limit(req, name, max, ms) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() || '?'; const k = name + '|' + ip, t = now(); let b = rl.get(k);
  if (!b || b.r < t) { b = { n: 0, r: t + ms }; rl.set(k, b); } if (++b.n > max) throw new HttpError(429, 'Muitas tentativas. Espere um pouco.');
  if (rl.size > 5000) for (const [kk, v] of rl) if (v.r < t) rl.delete(kk);
}
const validEmail = s => typeof s === 'string' && s.length <= 120 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(s);
const isDev = s => typeof s === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(s);
const publicOrder = async (o, c) => {
  const out = { id: o.id, status: o.status, method: o.method, cents: o.cents, created: o.created, expires: o.expires, expired: o.status === 'pending' && o.expires < now() };
  if (o.status === 'pending') { if (o.method === 'pix' && o.expires > now()) out.pix = { code: o.pixCode, qr: o.qr }; if (o.method === 'card') out.url = o.url; }
  if (o.status === 'paid' || o.status === 'gift') { out.code = o.code; out.paidAt = o.paidAt; out.refundUntil = o.status === 'paid' ? o.paidAt + c.refundDays * DAY : null; }
  if (o.status === 'refunded') out.refundedAt = o.refundedAt; return out;
};
const getOrderAuth = async (id, k) => {
  if (!/^[a-f0-9]{16}$/.test(String(id || '')) || typeof k !== 'string') throw new HttpError(400, 'Pedido inválido');
  const o = await store().get('o:' + id); if (!o || !safeEq(o.kh, sha(k))) throw new HttpError(404, 'Pedido não encontrado'); return o;
};

/* ---------------- ações ---------------- */
async function doStatus() {
  const c = cfg(), cn = counts(await allOrders(), c);
  return { open: c.open && !!c.token, soldOut: cn.left === 0, price_cents: c.cents, total: c.total, sold: cn.paid, left: cn.left, gate: c.gate, apk: !!c.apkUrl, refund_days: c.refundDays, payments: !!c.token };
}
async function doCheckout(req, body) {
  limit(req, 'checkout', 15, 10 * 60e3);
  const c = cfg(); if (!c.open) throw new HttpError(403, 'As vendas estão fechadas no momento.');
  const email = String(body.email || '').trim().toLowerCase(); if (!validEmail(email)) throw new HttpError(400, 'Digite um e-mail válido.');
  if (body.terms !== true) throw new HttpError(400, 'Aceite os termos para continuar.');
  const method = body.method === 'card' ? 'card' : 'pix';
  if (!c.pub) throw new HttpError(503, 'Servidor sem PUBLIC_URL configurado');
  const k = randomBytes(12).toString('hex'), id = randomBytes(8).toString('hex');
  const o = await locked(async () => {
    const list = await allOrders(); const cn = counts(list, c); if (cn.left <= 0) throw new HttpError(409, 'As vagas acabaram!', { soldOut: true });
    const mine = list.filter(x => x.email === email && x.status === 'pending' && x.expires > now()).length; if (mine >= 3) throw new HttpError(429, 'Você já tem pedidos aguardando pagamento. Use um deles ou espere alguns minutos.');
    const t = now(); const ord = { id, kh: sha(k), email, method, status: 'pending', cents: c.cents, created: t, expires: t + c.pendMin * 60e3 };
    await store().set('o:' + id, ord); await store().sadd('ids', id); invalidate(); return ord;
  });
  try {
    const notif = c.pub + '/api/presale/webhook';
    if (method === 'pix') {
      const p = await mp('POST', '/v1/payments', { transaction_amount: o.cents / 100, description: 'CyberArena · acesso antecipado', payment_method_id: 'pix', payer: { email }, external_reference: id, notification_url: notif, date_of_expiration: isoBR(o.expires) }, 'pix-' + id);
      const td = p?.point_of_interaction?.transaction_data; if (!p?.id || !td?.qr_code) throw new HttpError(502, 'O Mercado Pago não devolveu o código Pix.');
      Object.assign(o, { mpId: String(p.id), pixCode: td.qr_code, qr: td.qr_code_base64 || '' });
    } else {
      const back = (c.site || c.pub + '/pre-registro') + '/?pedido=' + id;
      const pr = await mp('POST', '/checkout/preferences', {
        items: [{ id: 'acesso-antecipado', title: 'CyberArena · acesso antecipado', quantity: 1, unit_price: o.cents / 100, currency_id: 'BRL' }], payer: { email }, external_reference: id, notification_url: notif,
        back_urls: { success: back, pending: back, failure: back }, auto_return: 'approved', expires: true, expiration_date_to: isoBR(o.expires + 20 * 60e3),
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }, { id: 'atm' }], installments: 1 },
      }, 'pref-' + id);
      if (!pr?.init_point) throw new HttpError(502, 'O Mercado Pago não devolveu o link do cartão.');
      Object.assign(o, { prefId: String(pr.id || ''), url: pr.init_point }); o.expires += 20 * 60e3;
    }
    await saveOrder(o);
  } catch (e) { o.status = 'failed'; await saveOrder(o).catch(() => {}); throw e; }
  return { k, order: await publicOrder(o, c) };
}
async function doOrder(req, url) {
  limit(req, 'order', 180, 60e3);
  let o = await getOrderAuth(url.searchParams.get('id'), url.searchParams.get('k')); const c = cfg();
  o = await syncOrder(o); return await publicOrder(o, c);
}
function validSignature(req, dataId) {
  const c = cfg(); if (!c.secret) return true;
  const sig = String(req.headers['x-signature'] || ''), rid = String(req.headers['x-request-id'] || ''); const ts = /(?:^|,)\s*ts=([^,]+)/.exec(sig)?.[1], v1 = /(?:^|,)\s*v1=([^,]+)/.exec(sig)?.[1];
  if (!ts || !v1) return false; const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let m = ''; if (id) m += `id:${id};`; if (rid) m += `request-id:${rid};`; m += `ts:${ts};`;
  return safeEq(createHmac('sha256', c.secret).update(m).digest('hex'), v1);
}
async function doWebhook(req, res, url) {
  limit(req, 'webhook', 120, 60e3);
  let body = {}; try { body = await readBody(req, 8000); } catch { /* alguns avisos vêm sem corpo */ }
  const type = url.searchParams.get('type') || url.searchParams.get('topic') || body.type || body.topic || '';
  const dataId = String(url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id || '');
  if (!validSignature(req, dataId)) { console.error('presale: assinatura do webhook inválida'); return send(res, 401, { error: 'assinatura' }); }
  send(res, 200, { ok: true });                       // responde logo (o MP exige resposta em 22 s) e processa em seguida
  if (!/payment/.test(type) || !/^\d{3,20}$/.test(dataId)) return;
  try {
    const pay = await mp('GET', '/v1/payments/' + dataId); const id = String(pay?.external_reference || '');
    if (!/^[a-f0-9]{16}$/.test(id)) return; const o = await store().get('o:' + id); if (!o) return;
    await applyPayment(o, pay);
  } catch (e) { console.error('presale: webhook falhou', e.message); }
}
async function doRefund(req, body, force) {
  limit(req, 'refund', 6, 10 * 60e3); const c = cfg();
  const o = force ? await store().get('o:' + String(body.id || '')) : await getOrderAuth(body.id, body.k); if (!o) throw new HttpError(404, 'Pedido não encontrado');
  if (o.status === 'refunded') return { ok: true, already: true };
  if (o.status !== 'paid') throw new HttpError(409, 'Este pedido não está pago.');
  if (!force && now() - o.paidAt > c.refundDays * DAY) throw new HttpError(403, `O prazo de ${c.refundDays} dias para devolução já passou.`);
  if (o.mpId) await mp('POST', '/v1/payments/' + encodeURIComponent(o.mpId) + '/refunds', {}, 'refund-' + o.id);
  await locked(async () => { const f = await store().get('o:' + o.id); f.refundedAt = now(); await revoke(f, 'refunded'); });
  return { ok: true };
}
async function doCheck(req, url) {
  limit(req, 'check', 120, 60e3);
  const code = normCode(url.searchParams.get('code')), dev = url.searchParams.get('dev') || ''; if (!code) return { ok: false, reason: 'formato' };
  return locked(async () => {
    const r = await store().get('c:' + code); if (!r) return { ok: false, reason: 'invalido' }; if (r.revoked) return { ok: false, reason: 'cancelado' };
    if (isDev(dev) && !r.devices.includes(dev)) { if (r.devices.length >= cfg().maxDev) return { ok: false, reason: 'aparelhos', max: cfg().maxDev }; r.devices.push(dev); await store().set('c:' + code, r); }
    return { ok: true, devices: r.devices.length, max: cfg().maxDev };
  });
}

/* ---------------- admin ---------------- */
function adminAuth(req) {
  const c = cfg(); if (!c.adminKey || c.adminKey.length < 8) throw new HttpError(503, 'Defina ADMIN_KEY (8+ caracteres) no servidor.');
  limit(req, 'admin', 60, 60e3); if (!safeEq(sha(req.headers['x-admin-key'] || ''), sha(c.adminKey))) throw new HttpError(401, 'Chave de administrador errada.');
}
async function doAdmin(req, res, sub, url) {
  adminAuth(req); const c = cfg();
  if (sub === 'list') { const list = (await allOrders()).slice().sort((a, b) => b.created - a.created); return send(res, 200, { counts: counts(list, c), orders: list.map(o => ({ id: o.id, email: o.email, status: o.status, method: o.method, cents: o.cents, code: o.code || null, created: o.created, paidAt: o.paidAt || null, flag: o.flag || null, mpId: o.mpId || null })) }); }
  if (sub === 'export') { const list = (await allOrders()).filter(o => ['paid', 'gift'].includes(o.status)).sort((a, b) => a.paidAt - b.paidAt); const csv = 'email,codigo,status,pago_em,metodo\n' + list.map(o => [o.email, o.code, o.status, new Date(o.paidAt || o.created).toISOString(), o.method].join(',')).join('\n'); res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', ...CORS }); return res.end(csv); }
  const body = await readBody(req);
  if (sub === 'confirm') { const o = await store().get('o:' + String(body.id || '')); if (!o) throw new HttpError(404, 'Pedido não encontrado'); const r = await locked(async () => { const f = await store().get('o:' + o.id); if (f.status === 'refunded') throw new HttpError(409, 'Já devolvido'); if (f.status !== 'paid') { f.status = 'paid'; f.paidAt = now(); f.manual = true; } return issueCode(f); }); return send(res, 200, { ok: true, code: r.code }); }
  if (sub === 'refund') return send(res, 200, await doRefund(req, body, true));
  if (sub === 'revoke') { const code = normCode(body.code), r = code && (await store().get('c:' + code)); if (!r) throw new HttpError(404, 'Código não existe'); r.revoked = true; await store().set('c:' + code, r); return send(res, 200, { ok: true }); }
  if (sub === 'gift') {
    const email = String(body.email || 'presente').trim().toLowerCase().slice(0, 120);
    const o = await locked(async () => { const id = randomBytes(8).toString('hex'), t = now(); const ord = { id, kh: sha(randomBytes(8)), email, method: 'gift', status: 'gift', cents: 0, created: t, expires: t, paidAt: t, note: String(body.note || '').slice(0, 80) }; await store().set('o:' + id, ord); await store().sadd('ids', id); invalidate(); return issueCode(ord); });
    return send(res, 200, { ok: true, code: o.code });
  }
  throw new HttpError(404, 'Rota admin não existe');
}

export async function handlePresale(req, res, url) {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const sub = url.pathname.replace(/^\/api\/presale\/?/, '').replace(/\/$/, '');
    if (req.method === 'GET' && sub === 'status') return send(res, 200, await doStatus());
    if (req.method === 'GET' && sub === 'order') return send(res, 200, await doOrder(req, url));
    if (req.method === 'GET' && sub === 'download') { limit(req, 'dl', 30, 60e3); const c = cfg(), code = normCode(url.searchParams.get('code')), r = code && c.apkUrl && (await store().get('c:' + code)); if (!c.apkUrl) throw new HttpError(404, 'Download ainda não disponível.'); if (!r || r.revoked) throw new HttpError(403, 'Código inválido ou cancelado.'); res.writeHead(302, { location: c.apkUrl, 'cache-control': 'no-store' }); return res.end(); }
    if (req.method === 'GET' && sub === 'check') return send(res, 200, await doCheck(req, url));
    if (req.method === 'POST' && sub === 'webhook') return await doWebhook(req, res, url);
    if (req.method === 'POST' && sub === 'checkout') return send(res, 200, await doCheckout(req, await readBody(req)));
    if (req.method === 'POST' && sub === 'refund') return send(res, 200, await doRefund(req, await readBody(req), false));
    if (sub.startsWith('admin/')) return await doAdmin(req, res, sub.slice(6), url);
    return send(res, 404, { error: 'Rota não existe' });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
    console.error('presale: erro', e); return send(res, 500, { error: 'Erro interno' });
  }
}
