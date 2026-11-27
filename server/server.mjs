import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('DATABASE_URL is required');

const PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || '';
const TRUSTED_PROXY_HOPS = Math.max(0, Math.min(3, Number(process.env.TRUSTED_PROXY_HOPS || 1)));
const SESSION_TTL_DAYS = Math.max(1, Math.min(90, Number(process.env.SESSION_TTL_DAYS || 30)));
const SESSION_COOKIE_NAME = COOKIE_SECURE ? '__Host-cyberarena_session' : 'cyberarena_session';
const ADMIN_COOKIE_NAME = COOKIE_SECURE ? '__Host-cyberarena_admin' : 'cyberarena_admin';
const ADMIN_TTL_MINUTES = 10;
const MAX_STATE_BYTES = 96 * 1024;
const ACCOUNT_XP = 200;
const PASS_XP = 100;
const PREMIUM_PRICE = 100;
const PASS_LEVELS = 100;
const PASS_DAYS = 20;
const BOX_DAILY_LIMIT = 5;
const COMMUNITY_CODE = 'CYBERARENA001';
const CODE_REWARDS = { gems: 30, boxes: { mini: 2, cyber: 1, mecha: 1 } };

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined
});
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', TRUSTED_PROXY_HOPS);
app.set('etag', false);

function requestId() { return b64(crypto.randomBytes(12)); }
function b64(buf) { return Buffer.from(buf).toString('base64url'); }
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest(); }
function safeEqual(a, b) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function hashForLog(value) { return crypto.createHash('sha256').update(String(value || '')).digest(); }
function safeJsonSize(value) { try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); } catch { return MAX_STATE_BYTES + 1; } }
function requestFingerprint(req, operation) { return crypto.createHash('sha256').update(operation + '\n' + req.method + ' ' + req.originalUrl + '\n' + JSON.stringify(req.body || {})).digest(); }
function utcDayKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function utcMidnight(date = new Date()) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function normalizeName(name) {
  return String(name || '').trim().toLocaleUpperCase('pt-BR').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 32);
}
function validPassword(password) { return typeof password === 'string' && password.length >= 8 && password.length <= 128; }
function hashPassword(password, salt = crypto.randomBytes(16)) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve({ salt, hash: key })));
}
async function verifyPassword(password, salt, hash) { return safeEqual((await hashPassword(password, salt)).hash, hash); }
function newCyberId() { return 'CA-' + b64(crypto.randomBytes(7)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10); }
async function uniqueCyberId(client) {
  for (let i = 0; i < 20; i++) {
    const id = newCyberId();
    const r = await client.query('SELECT 1 FROM accounts WHERE cyber_id=$1', [id]);
    if (!r.rowCount) return id;
  }
  throw new Error('Could not allocate Cyber Account id');
}
function defaultState(name = 'CYBER') {
  return {
    player_name: name,
    coins: 300,
    gems: 20,
    cyber_fichas: 0,
    level: 1,
    xp: 0,
    total_xp: 0,
    pass_xp: 0,
    pass_level: 1,
    free_offer_claimed: false,
    gem_offer_claimed: false,
    gem_offer_start: null,
    name_changes: 0,
    box_daily: { date: '', mini: 0, cyber: 0, mecha: 0 },
    pass_claimed: [],
    premium_pass: false,
    premium_claimed: [],
    account_claimed: [],
    inventory: { mini: 0, cyber: 0, mecha: 0 },
    offer_seed: 0,
    missions: { character_created: false, first_match: false, character_claimed: false, first_match_claimed: false, tutorial_v2: false },
    inbox: [],
    redeemed_codes: []
  };
}
function normalizeState(input, fallbackName = 'CYBER') {
  const base = defaultState(fallbackName);
  const d = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const n = { ...base, ...d };
  n.player_name = normalizeName(n.player_name) || fallbackName;
  for (const k of ['coins', 'gems', 'cyber_fichas', 'level', 'xp', 'total_xp', 'pass_xp', 'pass_level', 'name_changes', 'offer_seed']) n[k] = Number.isFinite(Number(n[k])) ? Math.max(0, Math.floor(Number(n[k]))) : base[k];
  n.box_daily = { ...base.box_daily, ...(d.box_daily || {}) };
  for (const k of ['mini','cyber','mecha']) n.box_daily[k] = Math.max(0, Math.min(BOX_DAILY_LIMIT, Math.floor(Number(n.box_daily[k]) || 0)));
  n.inventory = { ...base.inventory, ...(d.inventory || {}) };
  for (const k of ['mini','cyber','mecha']) n.inventory[k] = Math.max(0, Math.floor(Number(n.inventory[k]) || 0));
  n.level = Math.max(1, Math.floor(Number(n.level) || 1));
  n.pass_level = Math.max(1, Math.min(PASS_LEVELS, Math.floor(Number(n.pass_level) || 1)));
  n.pass_claimed = Array.isArray(d.pass_claimed) ? d.pass_claimed : [];
  n.premium_claimed = Array.isArray(d.premium_claimed) ? d.premium_claimed : [];
  n.account_claimed = Array.isArray(d.account_claimed) ? d.account_claimed : [];
  n.missions = { ...base.missions, ...(d.missions || {}) };
  n.inbox = Array.isArray(d.inbox) ? d.inbox.filter(m => m && m.type === 'code' && Array.isArray(m.rewards)) : [];
  n.redeemed_codes = Array.isArray(d.redeemed_codes) ? d.redeemed_codes : [];
  n.free_offer_claimed = !!n.free_offer_claimed;
  n.gem_offer_claimed = !!n.gem_offer_claimed;
  n.premium_pass = !!n.premium_pass;
  return n;
}
function ensureDaily(state, now = new Date()) {
  const key = utcDayKey(now);
  if (!state.box_daily || state.box_daily.date !== key) state.box_daily = { date: key, mini: 0, cyber: 0, mecha: 0 };
  return state;
}
function addXP(state, amount) {
  const xp = Math.max(0, Math.floor(Number(amount) || 0));
  state.xp += xp; state.total_xp += xp;
  while (state.xp >= ACCOUNT_XP) { state.xp -= ACCOUNT_XP; state.level += 1; }
  state.pass_xp += xp * 3;
  while (state.pass_xp >= PASS_XP && state.pass_level < PASS_LEVELS) { state.pass_xp -= PASS_XP; state.pass_level += 1; }
  if (state.pass_level >= PASS_LEVELS) state.pass_xp = Math.min(state.pass_xp, PASS_XP - 1);
}
function passRewardFor(level){
  // v138: passe grátis enxuto (100 níveis ≈ 2.000 moedas, 120 fichas, 20 gemas e 15 caixas na temporada)
  const L=Math.max(1,Math.floor(Number(level)||1));
  if(L===100)return 'MECHA CAIXA';
  if(L%20===0)return 'CYBER CAIXA';
  if(L%10===5)return 'MINI CAIXA';
  if(L%10===0)return '4 GEMAS';
  if(L%2===0)return '3 FICHAS';
  return '50 MOEDAS';
}
function passPremiumRewardFor(level){
  // v138: trilha premium ≈ 3.000 moedas, 200 fichas, 50 gemas (devolve metade do preço) e 20 caixas
  const L=Math.max(1,Math.floor(Number(level)||1));
  if(L===100)return 'MECHA CAIXA';
  if(L%10===0)return 'CYBER CAIXA';
  if(L%10===5)return 'MINI CAIXA';
  if(L%10===7)return '5 GEMAS';
  if(L%2===0)return '5 FICHAS';
  return '100 MOEDAS';
}
function accountRewardFor(level){
  // v138: progressão da conta (1 a 1000) com recompensas pequenas por nível e caixas só nos marcos
  const L=Math.max(1,Math.floor(Number(level)||1));
  if(L%100===0)return 'MECHA CAIXA';
  if(L%50===0)return 'MECHA CAIXA';
  if(L%10===0)return 'CYBER CAIXA';
  if(L%25===0)return '5 GEMAS';
  if(L%5===0)return 'MINI CAIXA';
  if(L%2===0)return '3 FICHAS';
  return '40 MOEDAS';
}
const offerCatalog = [
  { id:'tokens500', price:15, reward:{tokens:100} }, { id:'tokens1200', price:35, reward:{tokens:250} }, { id:'tokens2500', price:75, reward:{tokens:550} },
  { id:'bundle300', price:12, reward:{coins:300,tokens:60} }, { id:'bundle600', price:26, reward:{coins:650,tokens:130} }, { id:'bundle1000', price:45, reward:{coins:1100,tokens:230} }
];
const boxData = {
  mini: { price:85, currency:'coins', coin:[8,18], tok:[1,2], lucky:[[19,'tokens',3,5],[3,'gems',1,3]] },
  cyber: { price:60, currency:'cyber_fichas', coin:[60,110], tok:[12,22], lucky:[[32,'tokens',16,32],[11,'gems',1,3],[2,'gems',5,10]] },
  mecha: { price:150, currency:'cyber_fichas', coin:[150,250], tok:[40,60], lucky:[[38,'tokens',66,102],[22,'gems',1,3],[5,'gems',5,10]] }
};
function randomInt(min, max) { return crypto.randomInt(min, max + 1); }
function grantReward(state, reward){
 // v138: lê qualquer texto de recompensa ("50 MOEDAS", "3 FICHAS", "5 GEMAS", "CYBER CAIXA", "1 MINI + 1 CYBER"...)
 let box=null;
 String(reward||'').split('+').forEach(part=>{
   const t=part.trim().toUpperCase();let q;
   if((q=t.match(/(\d+)\s*GEMAS/)))state.gems+=+q[1];
   else if((q=t.match(/(\d+)\s*(?:CYBER\s+)?FICHAS/)))state.cyber_fichas+=+q[1];
   else if((q=t.match(/(\d+)\s*MOEDAS/)))state.coins+=+q[1];
   else if(/CAIXA/.test(t)||/^\d+\s*(MINI|CYBER|MECHA)/.test(t)){
     const ty=/MECHA/.test(t)?'mecha':/CYBER/.test(t)?'cyber':'mini',n=(q=t.match(/^(\d+)/))?+q[1]:1;
     state.inventory[ty]=(state.inventory[ty]||0)+n;if(!box)box={type:ty,count:n};
   }
 });
 return box;
}
function grantRewardDelta(before, after) {
  return { coins: after.coins - before.coins, gems: after.gems - before.gems, cyber_fichas: after.cyber_fichas - before.cyber_fichas };
}
function rewardResult(state, before, result = {}) { return { state, delta: grantRewardDelta(before, state), result }; }

app.use(helmet({
  contentSecurityPolicy: { useDefaults:true, directives:{ 'default-src':["'self'"], 'img-src':["'self'",'data:','blob:'], 'media-src':["'self'"], 'script-src':["'self'", "'unsafe-inline'"], 'style-src':["'self'", "'unsafe-inline'"], 'connect-src':["'self'"], 'object-src':["'none'"], 'base-uri':["'self'"], 'frame-ancestors':["'none'"], 'form-action':["'self'"] } },
  hsts: PRODUCTION ? { maxAge:31536000, includeSubDomains:true, preload:true } : false
}));
app.use(express.json({ limit:'128kb' }));
app.use(cookieParser());
app.use('/api', (req,res,next)=>{ res.set('Cache-Control','no-store'); res.set('Pragma','no-cache'); next(); });
app.use((req,res,next)=>{ req.requestId=requestId(); res.set('X-Request-ID',req.requestId); next(); });
const authLimiter = rateLimit({ windowMs:15*60*1000, limit:25, standardHeaders:true, legacyHeaders:false });
const apiLimiter = rateLimit({ windowMs:60*1000, limit:120, standardHeaders:true, legacyHeaders:false });
const adminLimiter = rateLimit({ windowMs:15*60*1000, limit:20, standardHeaders:true, legacyHeaders:false });
app.use('/api', apiLimiter);
function originGuard(req,res,next) {
  if (!PUBLIC_ORIGIN || ['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  if (req.get('origin') !== PUBLIC_ORIGIN) return res.status(403).json({ error:'origin_forbidden' });
  next();
}
app.use('/api', originGuard);
async function securityEvent(client, accountId, eventType, req, metadata = {}) {
  await client.query('INSERT INTO security_events(account_id,event_type,ip_hash,user_agent_hash,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6)', [accountId,eventType,hashForLog(req.ip),hashForLog(req.get('user-agent') || ''),req.requestId,metadata]);
}
async function audit(client, actor, action, target = null, metadata = {}) {
  await client.query('INSERT INTO audit_log(actor_account_id,action,target_account_id,metadata) VALUES($1,$2,$3,$4)', [actor,action,target,metadata]);
}
async function idempotencyStart(client, accountId, key, operation, requestHash) {
  if (!key || typeof key !== 'string' || key.length < 16 || key.length > 200) throw Object.assign(new Error('idempotency_required'), { code:'IDEMPOTENCY_REQUIRED' });
  const keyHash = crypto.createHash('sha256').update(key).digest();
  const existing = await client.query('SELECT operation,request_hash,response_status,response_body FROM idempotency_keys WHERE account_id=$1 AND key_hash=$2 AND expires_at>NOW() FOR UPDATE', [accountId,keyHash]);
  if (existing.rowCount) {
    if (existing.rows[0].operation !== operation || !safeEqual(existing.rows[0].request_hash, requestHash)) throw Object.assign(new Error('idempotency_conflict'), { code:'IDEMPOTENCY_CONFLICT' });
    return { replay:true,status:existing.rows[0].response_status || 200,body:existing.rows[0].response_body };
  }
  await client.query("INSERT INTO idempotency_keys(account_id,key_hash,operation,request_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '24 hours')", [accountId,keyHash,operation,requestHash]);
  return { replay:false,keyHash };
}
async function idempotencyFinish(client, accountId, keyHash, status, body) {
  if (!keyHash) return;
  await client.query('UPDATE idempotency_keys SET response_status=$1,response_body=$2 WHERE account_id=$3 AND key_hash=$4', [status,body,accountId,keyHash]);
}
async function auth(req,res,next) {
  try {
    const raw=req.cookies[SESSION_COOKIE_NAME]; if(!raw)return res.status(401).json({error:'auth_required'});
    const r=await pool.query('SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND s.revoked_at IS NULL',[tokenHash(raw)]);
    if(!r.rowCount)return res.status(401).json({error:'session_invalid'});
    const a=r.rows[0]; if(a.banned)return res.status(403).json({error:'account_banned'});
    req.account=a; await pool.query('UPDATE accounts SET last_seen_at=NOW() WHERE id=$1',[a.id]); next();
  } catch(e) { next(e); }
}
async function adminOnly(req,res,next) {
  try {
    if(!req.account?.is_owner)return res.status(403).json({error:'owner_only'});
    const raw=req.cookies[ADMIN_COOKIE_NAME]; if(!raw)return res.status(401).json({error:'admin_step_up_required'});
    const r=await pool.query('SELECT 1 FROM admin_sessions WHERE account_id=$1 AND token_hash=$2 AND expires_at>NOW() AND revoked_at IS NULL',[req.account.id,tokenHash(raw)]);
    if(!r.rowCount)return res.status(401).json({error:'admin_step_up_required'});
    await pool.query('UPDATE admin_sessions SET last_used_at=NOW() WHERE account_id=$1 AND token_hash=$2',[req.account.id,tokenHash(raw)]); next();
  } catch(e) { next(e); }
}

app.get('/api/health',async(req,res)=>{ try { const r=await pool.query('SELECT 1 AS ok'); res.json({ok:true,db:r.rows[0].ok===1}); } catch { res.status(503).json({ok:false,db:false}); } });
app.get('/api/time',async(req,res,next)=>{ try { const r=await pool.query('SELECT season_start_utc,gem_offer_start_utc FROM game_config WHERE id=1'); const start=r.rows[0]?.season_start_utc || utcMidnight(); const offerStart=r.rows[0]?.gem_offer_start_utc || start; const now=new Date(); const elapsed=Math.max(0,now.getTime()-new Date(start).getTime()); const seasonDay=Math.min(PASS_DAYS,Math.floor(elapsed/86400000)+1); res.json({serverTime:now.toISOString(),dayKey:utcDayKey(now),seasonStart:new Date(start).toISOString(),seasonDay,seasonDays:PASS_DAYS,gemOfferStart:new Date(offerStart).toISOString(),gemOfferExpires:new Date(new Date(offerStart).getTime()+180*86400000).toISOString(),gemOfferAvailable:now.getTime()<=new Date(offerStart).getTime()+180*86400000}); } catch(e){next(e);} });

app.post('/api/auth/register',authLimiter,async(req,res,next)=>{
  const name=normalizeName(req.body?.name), password=req.body?.password;
  if(name.length<2)return res.status(400).json({error:'invalid_name'}); if(!validPassword(password))return res.status(400).json({error:'invalid_password'});
  const client=await pool.connect();
  try { await client.query('BEGIN'); const id=await uniqueCyberId(client); const ph=await hashPassword(password); const state=defaultState(name); const r=await client.query('INSERT INTO accounts(cyber_id,name,password_salt,password_hash,state) VALUES($1,$2,$3,$4,$5) RETURNING id,cyber_id,name,state,banned,is_owner,state_version',[id,name,ph.salt,ph.hash,state]); const a=r.rows[0]; const token=b64(crypto.randomBytes(32)); const exp=new Date(Date.now()+SESSION_TTL_DAYS*86400000); await client.query('INSERT INTO sessions(account_id,token_hash,expires_at) VALUES($1,$2,$3)',[a.id,tokenHash(token),exp]); await audit(client,a.id,'account_created',a.id,{}); await client.query('COMMIT'); res.cookie(SESSION_COOKIE_NAME,token,{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,maxAge:SESSION_TTL_DAYS*86400000,path:'/'}); res.json({account:{id:a.cyber_id,name:a.name,state:a.state,version:a.state_version,banned:false,isOwner:a.is_owner}}); }
  catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({error:'account_exists'});next(e);} finally{client.release();}
});
app.post('/api/auth/login',authLimiter,async(req,res,next)=>{
  try { const id=String(req.body?.cyberId||'').trim().toUpperCase(), password=String(req.body?.password||''); const r=await pool.query('SELECT * FROM accounts WHERE cyber_id=$1',[id]); if(!r.rowCount){const dummySalt=Buffer.alloc(16);const dummyHash=await hashPassword('invalid-login-placeholder',dummySalt);await verifyPassword(password,dummySalt,dummyHash.hash);await securityEvent(pool,null,'login_failed_unknown_account',req,{});return res.status(401).json({error:'invalid_credentials'});} const a=r.rows[0]; if(a.banned){await securityEvent(pool,a.id,'login_blocked_banned',req,{});return res.status(403).json({error:'account_banned'});} const ok=await verifyPassword(password,a.password_salt,a.password_hash); if(!ok){await securityEvent(pool,a.id,'login_failed_password',req,{});return res.status(401).json({error:'invalid_credentials'});} const token=b64(crypto.randomBytes(32)); const exp=new Date(Date.now()+SESSION_TTL_DAYS*86400000); await pool.query('DELETE FROM sessions WHERE account_id=$1 AND (expires_at<=NOW() OR revoked_at IS NOT NULL)',[a.id]); await pool.query('INSERT INTO sessions(account_id,token_hash,expires_at) VALUES($1,$2,$3)',[a.id,tokenHash(token),exp]); await securityEvent(pool,a.id,'login_success',req,{}); res.cookie(SESSION_COOKIE_NAME,token,{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,maxAge:SESSION_TTL_DAYS*86400000,path:'/'}); res.json({account:{id:a.cyber_id,name:a.name,state:a.state,version:a.state_version,banned:false,isOwner:a.is_owner}}); }
  catch(e){next(e);}
});
app.post('/api/auth/logout',auth,async(req,res,next)=>{try{const raw=req.cookies[SESSION_COOKIE_NAME];if(raw)await pool.query('UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1',[tokenHash(raw)]);res.clearCookie(SESSION_COOKIE_NAME,{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,path:'/'});res.clearCookie(ADMIN_COOKIE_NAME,{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,path:'/'});res.json({ok:true});}catch(e){next(e);}});
app.get('/api/auth/me',auth,async(req,res)=>res.json({account:{id:req.account.cyber_id,name:req.account.name,state:req.account.state,version:req.account.state_version,isOwner:req.account.is_owner}}));

function commandError(status, error, extra = {}) { const e = new Error(error); e.httpStatus = status; e.body = { error, ...extra }; return e; }

async function runCommand(req,res,next) {
  const operation = String(req.body?.operation || '').trim();
  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  const allowed = new Set(['claim_free_offer','claim_gem_offer','buy_offer','buy_gem_bundle','open_box','buy_premium','claim_pass_reward','claim_premium_reward','claim_account_reward','claim_mission','change_name','claim_inbox_reward','mark_character_created','mark_first_match','mark_tutorial_done']);
  if (!allowed.has(operation)) return res.status(400).json({error:'unknown_operation'});
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ar = await client.query('SELECT id,cyber_id,name,state,state_version,banned,is_owner FROM accounts WHERE id=$1 FOR UPDATE',[req.account.id]);
    if (!ar.rowCount || ar.rows[0].banned) throw commandError(403,'account_banned');
    const account = ar.rows[0];
    let state = normalizeState(account.state, account.name);
    ensureDaily(state);
    const idem = await idempotencyStart(client,account.id,req.get('Idempotency-Key') || '',operation,requestFingerprint(req,operation));
    if (idem.replay) { await client.query('ROLLBACK'); return res.status(idem.status).json(idem.body); }
    const before = structuredClone(state);
    let result = {};

    if (operation === 'claim_free_offer') {
      if (state.free_offer_claimed) throw commandError(409,'already_claimed');
      state.free_offer_claimed = true; state.coins += 100; addXP(state,10); result = {type:'free_offer',coins:100,xp:10};
    } else if (operation === 'claim_gem_offer') {
      if (state.gem_offer_claimed) throw commandError(409,'already_claimed');
      const cfg=await client.query('SELECT gem_offer_start_utc FROM game_config WHERE id=1'); const offerStart=cfg.rows[0]?.gem_offer_start_utc; if(offerStart && Date.now()>new Date(offerStart).getTime()+180*86400000) throw commandError(409,'offer_expired'); state.gem_offer_claimed = true; state.gems += 30; state.gem_offer_start = new Date(offerStart||Date.now()).toISOString(); result = {type:'gem_offer',gems:30,validDays:180};
    } else if (operation === 'buy_offer') {
      const o = offerCatalog.find(x => x.id === String(payload.id));
      if (!o) throw commandError(404,'offer_not_found');
      if (state.gems < o.price) throw commandError(409,'insufficient_gems');
      state.gems -= o.price; state.coins += o.reward.coins || 0; state.cyber_fichas += o.reward.tokens || 0; result = {type:'offer',id:o.id,price:o.price,reward:o.reward};
    } else if (operation === 'buy_gem_bundle') {
      const gems = Math.max(1,Math.min(20,Math.floor(Number(payload.gems) || 1)));
      if (state.gems < gems) throw commandError(409,'insufficient_gems');
      const coinsGot = gems * 25, tokensGot = gems * 5; state.gems -= gems; state.coins += coinsGot; state.cyber_fichas += tokensGot; result = {type:'gem_bundle',gems,coins:coinsGot,tokens:tokensGot};
    } else if (operation === 'open_box') {
      const type = String(payload.type || ''); const d = boxData[type];
      if (!d) throw commandError(400,'invalid_box');
      const used = Number(state.box_daily[type] || 0); let fromInventory = false;
      if (Number(state.inventory[type] || 0) > 0) { state.inventory[type] -= 1; fromInventory = true; }
      else if (type === 'mini') {
        if (used < BOX_DAILY_LIMIT) { state.box_daily[type] = used + 1; }
        else { if (state.coins < d.price) throw commandError(409,'insufficient_currency',{currency:'coins',price:d.price}); state.coins -= d.price; }
      } else {
        if (used >= BOX_DAILY_LIMIT) throw commandError(409,'daily_limit');
        if (state[d.currency] < d.price) throw commandError(409,'insufficient_currency',{currency:d.currency,price:d.price});
        state[d.currency] -= d.price; state.box_daily[type] = used + 1;
      }
      const guaranteedCoins = randomInt(d.coin[0],d.coin[1]), guaranteedTokens = randomInt(d.tok[0],d.tok[1]);
      state.coins += guaranteedCoins; state.cyber_fichas += guaranteedTokens;
      const roll = randomInt(1,100); let cumulative = 0, lucky = null;
      for (const [chance,kind,min,max] of d.lucky) { cumulative += chance; if (roll <= cumulative) { const amount = randomInt(min,max); if(kind==='coins')state.coins+=amount; if(kind==='tokens')state.cyber_fichas+=amount; if(kind==='gems')state.gems+=amount; lucky={kind,amount,chance}; break; } }
      addXP(state,10); result = {type:'box',boxType:type,fromInventory,guaranteedCoins,guaranteedTokens,lucky};
    } else if (operation === 'buy_premium') {
      if (state.premium_pass) throw commandError(409,'already_premium');
      if (state.gems < PREMIUM_PRICE) throw commandError(409,'insufficient_gems');
      state.gems -= PREMIUM_PRICE; state.premium_pass = true; result = {type:'premium',price:PREMIUM_PRICE};
    } else if (operation === 'claim_pass_reward') {
      const level = Math.floor(Number(payload.level) || 0);
      if (level < 1 || level > PASS_LEVELS) throw commandError(400,'invalid_level');
      if (level > state.pass_level) throw commandError(409,'locked');
      if (state.pass_claimed.includes(level)) throw commandError(409,'already_claimed');
      const reward = passRewardFor(level); state.pass_claimed.push(level); grantReward(state,reward); result = {type:'pass',level,reward};
    } else if (operation === 'claim_premium_reward') {
      const level = Math.floor(Number(payload.level) || 0);
      if (!state.premium_pass) throw commandError(403,'premium_required');
      if (level < 1 || level > PASS_LEVELS || level > state.pass_level) throw commandError(409,'locked');
      if (state.premium_claimed.includes(level)) throw commandError(409,'already_claimed');
      const reward = passPremiumRewardFor(level); state.premium_claimed.push(level); grantReward(state,reward); result = {type:'premium_reward',level,reward};
    } else if (operation === 'claim_account_reward') {
      const level = Math.floor(Number(payload.level) || 0);
      if (level < 1 || level > 1000 || level > state.level) throw commandError(409,'locked');
      if (state.account_claimed.includes(level)) throw commandError(409,'already_claimed');
      const reward = accountRewardFor(level); state.account_claimed.push(level); grantReward(state,reward); result = {type:'account_reward',level,reward};
    } else if (operation === 'claim_mission') {
      const id = String(payload.id || '');
      if (id === 'character') {
        if (!state.missions.character_created) throw commandError(409,'mission_not_complete');
        if (state.missions.character_claimed) throw commandError(409,'already_claimed');
        state.missions.character_claimed = true; state.gems += 20; addXP(state,100); result = {type:'mission',id,xp:100,gems:20};
      } else if (id === 'first_match') {
        if (!state.missions.first_match) throw commandError(409,'mission_not_complete');
        if (state.missions.first_match_claimed) throw commandError(409,'already_claimed');
        state.missions.first_match_claimed = true; addXP(state,100); result = {type:'mission',id,xp:100};
      } else throw commandError(400,'invalid_mission');
    } else if (operation === 'change_name') {
      const name = normalizeName(payload.name);
      if (name.length < 2) throw commandError(400,'invalid_name');
      if (name === state.player_name) throw commandError(409,'same_name');
      const cost = state.name_changes === 0 ? 10 : 50;
      if (state.gems < cost) throw commandError(409,'insufficient_gems');
      state.gems -= cost; state.player_name = name; state.name_changes += 1; result = {type:'name_change',name,cost};
    } else if (operation === 'claim_inbox_reward') {
      const messageId = String(payload.messageId || ''); const rewardIndex = Math.floor(Number(payload.rewardIndex));
      const msg = state.inbox.find(m => m.id === messageId);
      if (!msg || !Array.isArray(msg.rewards)) throw commandError(404,'inbox_not_found');
      if (rewardIndex < 0 || rewardIndex >= msg.rewards.length) throw commandError(409,'reward_not_found');
      const reward = msg.rewards[rewardIndex];
      if (!['gems','coins','tokens','box'].includes(reward.kind)) throw commandError(400,'invalid_reward');
      if (reward.kind === 'gems') state.gems += Math.max(0,Math.floor(Number(reward.amount)||0));
      else if (reward.kind === 'coins') state.coins += Math.max(0,Math.floor(Number(reward.amount)||0));
      else if (reward.kind === 'tokens') state.cyber_fichas += Math.max(0,Math.floor(Number(reward.amount)||0));
      else { const key = reward.boxType === 'mini' ? 'mini' : reward.boxType === 'cyber' ? 'cyber' : 'mecha'; state.inventory[key] += 1; }
      msg.rewards.splice(rewardIndex,1); if (msg.rewards.length === 0) state.inbox = state.inbox.filter(m => m.id !== messageId); result = {type:'inbox_reward',reward};
    } else if (operation === 'mark_character_created') {
      state.missions.character_created = true; result = {type:'mission_progress',id:'character'};
    } else if (operation === 'mark_first_match') {
      state.missions.first_match = true; result = {type:'mission_progress',id:'first_match'};
    } else if (operation === 'mark_tutorial_done') {
      state.missions.tutorial_v2 = true; result = {type:'tutorial_done'};   // tutorial concluído: fica salvo na conta (vale em qualquer aparelho)
    }

    state = normalizeState(state,account.name); ensureDaily(state);
    const updated = await client.query('UPDATE accounts SET state=$1,state_version=state_version+1,updated_at=NOW(),name=$2 WHERE id=$3 RETURNING state,state_version,name',[state,state.player_name,account.id]);
    const body = {ok:true,state:updated.rows[0].state,version:updated.rows[0].state_version,result};
    await idempotencyFinish(client,account.id,idem.keyHash,200,body);
    const delta = grantRewardDelta(before,updated.rows[0].state);
    await client.query('INSERT INTO economy_ledger(account_id,request_id,operation,delta,balance_after,metadata) VALUES($1,$2,$3,$4,$5,$6)',[account.id,req.requestId,operation,delta,{coins:updated.rows[0].state.coins,gems:updated.rows[0].state.gems,cyber_fichas:updated.rows[0].state.cyber_fichas},{result}]);
    await audit(client,account.id,operation,account.id,{result,delta});
    await client.query('COMMIT'); res.json(body);
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    if (e.code === 'IDEMPOTENCY_REQUIRED') return res.status(400).json({error:'idempotency_required'});
    if (e.code === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({error:'idempotency_conflict'});
    if (e.httpStatus) return res.status(e.httpStatus).json(e.body);
    next(e);
  } finally { client.release(); }
}
app.post('/api/game/command',auth,runCommand);

app.post('/api/codes/redeem',auth,async(req,res,next)=>{
  const code=String(req.body?.code||'').trim().toUpperCase();if(!code)return res.status(400).json({error:'invalid_code'});const client=await pool.connect();
  try { await client.query('BEGIN'); const ar=await client.query('SELECT id,state,state_version,banned FROM accounts WHERE id=$1 FOR UPDATE',[req.account.id]);if(!ar.rowCount||ar.rows[0].banned){await client.query('ROLLBACK');return res.status(403).json({error:'account_banned'});}const idem=await idempotencyStart(client,req.account.id,req.get('Idempotency-Key')||'','code_redeem',requestFingerprint(req,'code_redeem'));if(idem.replay){await client.query('ROLLBACK');return res.status(idem.status).json(idem.body);}const c=await client.query('SELECT * FROM community_codes WHERE code=$1 FOR UPDATE',[code]);if(!c.rowCount||!c.rows[0].active){await client.query('ROLLBACK');return res.status(400).json({error:'code_inactive'});}const row=c.rows[0];const existing=await client.query('SELECT 1 FROM code_redemptions WHERE account_id=$1 AND code_id=$2',[req.account.id,row.id]);if(existing.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'already_redeemed'});}const state=normalizeState(ar.rows[0].state);state.redeemed_codes.push(code);const rewardSpec=row.rewards||CODE_REWARDS;const rewards=[];if(Number(rewardSpec.gems)>0)rewards.push({kind:'gems',amount:Number(rewardSpec.gems)});for(const [boxType,count] of Object.entries(rewardSpec.boxes||{})){for(let i=0;i<Math.max(0,Math.min(100,Number(count)||0));i++)rewards.push({kind:'box',boxType});}state.inbox.push({id:'code-'+crypto.randomUUID(),type:'code',code,title:'CÓDIGO '+code,createdAt:new Date().toISOString(),rewards});await client.query('INSERT INTO code_redemptions(account_id,code_id) VALUES($1,$2)',[req.account.id,row.id]);const updated=await client.query('UPDATE accounts SET state=$1,state_version=state_version+1,updated_at=NOW() WHERE id=$2 RETURNING state,state_version',[state,req.account.id]);const body={ok:true,state:updated.rows[0].state,version:updated.rows[0].state_version};await idempotencyFinish(client,req.account.id,idem.keyHash,200,body);await audit(client,req.account.id,'code_redeemed',req.account.id,{code});await client.query('COMMIT');res.json(body); }
  catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='IDEMPOTENCY_REQUIRED')return res.status(400).json({error:'idempotency_required'});if(e.code==='IDEMPOTENCY_CONFLICT')return res.status(409).json({error:'idempotency_conflict'});if(e.code==='23505')return res.status(409).json({error:'already_redeemed'});next(e);} finally{client.release();}
});

app.post('/api/admin/unlock',adminLimiter,auth,async(req,res,next)=>{
  const password=String(req.body?.password||'');if(!password)return res.status(400).json({error:'password_required'});const client=await pool.connect();
  try {await client.query('BEGIN');const a=await client.query('SELECT * FROM accounts WHERE id=$1 AND is_owner=true FOR UPDATE',[req.account.id]);if(!a.rowCount){await client.query('ROLLBACK');return res.status(403).json({error:'owner_only'});}const ok=await verifyPassword(password,a.rows[0].password_salt,a.rows[0].password_hash);if(!ok){await securityEvent(client,req.account.id,'owner_step_up_failed',req,{});await client.query('COMMIT');return res.status(401).json({error:'invalid_owner_credentials'});}await client.query('DELETE FROM admin_sessions WHERE account_id=$1 AND (expires_at<=NOW() OR revoked_at IS NOT NULL)',[req.account.id]);const token=b64(crypto.randomBytes(32));await client.query("INSERT INTO admin_sessions(account_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')",[req.account.id,tokenHash(token)]);await securityEvent(client,req.account.id,'owner_step_up_success',req,{});await client.query('COMMIT');res.cookie(ADMIN_COOKIE_NAME,token,{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,maxAge:ADMIN_TTL_MINUTES*60000,path:'/'});res.json({ok:true,expiresInSeconds:ADMIN_TTL_MINUTES*60});}
  catch(e){await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client.release();}
});
app.post('/api/admin/lock',auth,async(req,res,next)=>{try{const raw=req.cookies[ADMIN_COOKIE_NAME];if(raw)await pool.query('UPDATE admin_sessions SET revoked_at=NOW() WHERE account_id=$1 AND token_hash=$2',[req.account.id,tokenHash(raw)]);res.clearCookie(ADMIN_COOKIE_NAME,{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,path:'/'});res.json({ok:true});}catch(e){next(e);}});
app.get('/api/admin/accounts',auth,adminOnly,async(req,res,next)=>{try{const r=await pool.query("SELECT cyber_id,name,banned,is_owner,created_at,updated_at,last_seen_at,state->>'level' AS level,state->>'coins' AS coins,state->>'gems' AS gems,state->>'cyber_fichas' AS cyber_fichas FROM accounts ORDER BY created_at DESC");res.json({accounts:r.rows});}catch(e){next(e);}});
app.post('/api/admin/accounts/:id/ban',adminLimiter,auth,adminOnly,async(req,res,next)=>{const banned=!!req.body?.banned,id=String(req.params.id).toUpperCase(),client=await pool.connect();try{await client.query('BEGIN');const idem=await idempotencyStart(client,req.account.id,req.get('Idempotency-Key')||'','admin_ban',requestFingerprint(req,'admin_ban'));if(idem.replay){await client.query('ROLLBACK');return res.status(idem.status).json(idem.body);}const r=await client.query('SELECT id,is_owner FROM accounts WHERE cyber_id=$1 FOR UPDATE',[id]);if(!r.rowCount)throw commandError(404,'not_found');if(r.rows[0].is_owner)throw commandError(403,'owner_protected');await client.query('UPDATE accounts SET banned=$1,updated_at=NOW() WHERE id=$2',[banned,r.rows[0].id]);await client.query('UPDATE sessions SET revoked_at=NOW() WHERE account_id=$1 AND revoked_at IS NULL',[r.rows[0].id]);await securityEvent(client,r.rows[0].id,banned?'account_banned':'account_unbanned',req,{actor:req.account.id});await audit(client,req.account.id,banned?'account_banned':'account_unbanned',r.rows[0].id,{});const body={ok:true,banned};await idempotencyFinish(client,req.account.id,idem.keyHash,200,body);await client.query('COMMIT');res.json(body);}catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.httpStatus)return res.status(e.httpStatus).json(e.body);if(e.code==='IDEMPOTENCY_REQUIRED')return res.status(400).json({error:'idempotency_required'});if(e.code==='IDEMPOTENCY_CONFLICT')return res.status(409).json({error:'idempotency_conflict'});next(e);}finally{client.release();}});
app.get('/api/admin/codes/:code',auth,adminOnly,async(req,res,next)=>{try{const code=String(req.params.code).toUpperCase();const r=await pool.query('SELECT code,active FROM community_codes WHERE code=$1',[code]);if(!r.rowCount)return res.status(404).json({error:'code_not_found'});res.json(r.rows[0]);}catch(e){next(e);}});
app.post('/api/admin/codes/:code/active',adminLimiter,auth,adminOnly,async(req,res,next)=>{const code=String(req.params.code).toUpperCase(),active=!!req.body?.active,client=await pool.connect();try{await client.query('BEGIN');const idem=await idempotencyStart(client,req.account.id,req.get('Idempotency-Key')||'','admin_code_status',requestFingerprint(req,'admin_code_status'));if(idem.replay){await client.query('ROLLBACK');return res.status(idem.status).json(idem.body);}const r=await client.query('UPDATE community_codes SET active=$1,updated_at=NOW() WHERE code=$2 RETURNING code,active',[active,code]);if(!r.rowCount)throw commandError(404,'code_not_found');await audit(client,req.account.id,'code_status_changed',null,{code,active});const body=r.rows[0];await idempotencyFinish(client,req.account.id,idem.keyHash,200,body);await client.query('COMMIT');res.json(body);}catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.httpStatus)return res.status(e.httpStatus).json(e.body);if(e.code==='IDEMPOTENCY_REQUIRED')return res.status(400).json({error:'idempotency_required'});if(e.code==='IDEMPOTENCY_CONFLICT')return res.status(409).json({error:'idempotency_conflict'});next(e);}finally{client.release();}});

app.use(express.static(ROOT,{extensions:['html'],index:'Index.html',fallthrough:true}));
app.use((req,res)=>res.status(404).json({error:'not_found'}));
app.use((err,req,res,next)=>{if(!PRODUCTION)console.error(err);res.status(500).json({error:'server_error',requestId:req.requestId});});

if(PRODUCTION){if(!COOKIE_SECURE)throw new Error('COOKIE_SECURE=true is required in production');if(!PUBLIC_ORIGIN.startsWith('https://'))throw new Error('PUBLIC_ORIGIN must use HTTPS in production');}
await pool.query('SELECT 1');
app.listen(PORT,()=>console.log(`CyberArena server listening on :${PORT}`));
