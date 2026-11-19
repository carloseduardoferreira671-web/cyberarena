import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=async p=>fs.readFile(path.join(root,p),'utf8');
const server=await read('server.mjs');
const env=await read('.env.production.example');
const schema=await read('db/schema.sql');
const compose=await read('docker-compose.prod.yml');
const dockerfile=await read('Dockerfile');
const migrate=await read('scripts/migrate.mjs');
const pkg=JSON.parse(await read('package.json'));
const failures=[];
const must=(ok,msg)=>{if(!ok)failures.push(msg);};

const serverChecks=[
 ['revoked session check',/revoked_at IS NULL/],
 ['secure host session cookie',/__Host-cyberarena_session/],
 ['secure host admin cookie',/__Host-cyberarena_admin/],
 ['origin validation',/originGuard/],
 ['request id',/X-Request-ID/],
 ['state size limit',/MAX_STATE_BYTES/],
 ['mandatory idempotency',/idempotency_required/],
 ['idempotency payload binding',/idempotency_conflict/],
 ['economy command endpoint',/app\.post\('\/api\/game\/command'/],
 ['cryptographic box randomness',/crypto\.randomInt/],
 ['row locking',/FOR UPDATE/],
 ['security events',/security_events/],
 ['economy ledger',/economy_ledger/],
 ['UTC game clock',/game_config/],
 ['admin step-up',/admin_step_up_required/],
 ['generic production errors',/server_error/]
];
for(const [name,re] of serverChecks)must(re.test(server),name);
must(!/app\.put\('\/api\/state'/.test(server),'generic mutable /api/state endpoint still present');
for(const [name,re] of [['production mode',/NODE_ENV=production/],['secure cookie',/COOKIE_SECURE=true/],['origin',/PUBLIC_ORIGIN=/]])must(re.test(env),`.env ${name}`);
for(const [name,re] of [['private backend network',/backend:\s*\n\s*internal:\s*true/],['migration service',/\n\s*migrate:/],['app waits for migration',/condition: service_completed_successfully/],['caddy service',/\n\s*caddy:/],['db has no published ports',/db:[\s\S]*?networks: \[backend\]/],['db secret',/db_password:/]])must(re.test(compose),`compose ${name}`);
for(const [name,re] of [['migrate script',/"migrate":"node scripts\/migrate\.mjs"/],['security audit script',/"security:audit":"node scripts\/security-audit\.mjs"/],['full audit script',/"audit":"node scripts\/full-audit\.mjs"/]])must(re.test(JSON.stringify(pkg.scripts)),`package ${name}`);
for(const [name,re] of [['idempotency table',/CREATE TABLE IF NOT EXISTS idempotency_keys/],['ledger table',/CREATE TABLE IF NOT EXISTS economy_ledger/],['security events table',/CREATE TABLE IF NOT EXISTS security_events/],['admin sessions table',/CREATE TABLE IF NOT EXISTS admin_sessions/],['UTC game config',/CREATE TABLE IF NOT EXISTS game_config/]])must(re.test(schema),`schema ${name}`);
must(/schema_migrations/.test(migrate),'migration script does not track applied migrations');
must(!/project\.godot/.test(dockerfile),'legacy Godot project copied into production image');
must(/npm run audit/.test(dockerfile),'production app image does not run full audit before startup');must(/command:\s*\["npm", "run", "migrate"\]/.test((await read('docker-compose.prod.yml'))),'production compose has no migration job');

if(failures.length){console.error('CyberArena security audit: FAIL');for(const x of failures)console.error('- '+x);process.exit(1);}
console.log('CyberArena security audit: PASS');
