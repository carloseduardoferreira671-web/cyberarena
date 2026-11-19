import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const failures=[];
const warn=[];
const read=async rel=>fs.readFile(path.join(root,rel),'utf8');
const exists=rel=>existsSync(path.join(root,rel));
const must=(ok,msg)=>{if(!ok)failures.push(msg);};

const html=await read('Index.html');
const js=await read('main.js');
const server=await read('server/server.mjs');
const css=await read('style.css');
const pkg=JSON.parse(await read('server/package.json'));
const policy=JSON.parse(await read('server/security/security-policy.json'));
const loot=JSON.parse(await read('data/loot_table.json'));
const playerData=JSON.parse(await read('data/player_data.json'));

const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const dupIds=ids.filter((x,i)=>ids.indexOf(x)!==i);
must(!dupIds.length,`duplicate HTML ids: ${[...new Set(dupIds)].join(', ')}`);
const funcs=new Set([...js.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const onclick=[...html.matchAll(/onclick="\s*([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
must(onclick.every(x=>funcs.has(x)),`onclick function missing: ${[...new Set(onclick.filter(x=>!funcs.has(x)))].join(', ')}`);
const fnNames=[...js.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
const dupFns=fnNames.filter((x,i)=>fnNames.indexOf(x)!==i);
must(!dupFns.length,`duplicate JS functions: ${[...new Set(dupFns)].join(', ')}`);

for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
  const ref=m[1];
  if(/^(https?:|data:|#|mailto:|javascript:)/i.test(ref))continue;
  must(exists(ref),`missing HTML asset: ${ref}`);
}
for(const ref of ['assests/ui/coin_logo.svg','assests/ui/gem_logo.svg','assests/ui/token_logo.svg','assests/ui/Mini_box.png','assests/ui/Cyber_box.png','assests/ui/Mecha_box.png','sounds/lobby_theme.mp3'])must(exists(ref),`missing required asset: ${ref}`);

must((css.match(/\{/g)||[]).length===(css.match(/\}/g)||[]).length,'CSS braces are unbalanced');
must(pkg.scripts?.migrate==='node scripts/migrate.mjs','package script migrate missing');
must(pkg.scripts?.['security:audit']==='node scripts/security-audit.mjs','package script security:audit missing');
must(pkg.scripts?.maintenance==='node scripts/maintenance.mjs','package script maintenance missing');
must(!server.includes("app.put('/api/state'"),'generic mutable /api/state endpoint still present');
must(server.includes("app.post('/api/game/command'"),'server-authoritative game command endpoint missing');
must(server.includes('idempotency_required'),'mandatory idempotency enforcement missing');
must(server.includes('randomInt(min, max)'), 'cryptographic random helper missing');
must(server.includes("FOR UPDATE"),'row locking missing from command path');
must(server.includes('revoked_at IS NULL'),'revoked session check missing');
must(server.includes('__Host-cyberarena_session'),'secure host session cookie missing');
must(server.includes('__Host-cyberarena_admin'),'secure host admin cookie missing');
must(server.includes('originGuard'),'origin validation missing');
must(server.includes('X-Request-ID'),'request id missing');
must(server.includes('security_events'),'security event logging missing');
must(server.includes('economy_ledger'),'economy ledger missing');
must(server.includes('game_config'),'shared UTC game clock missing');
must(policy.production?.serverAuthoritativeEconomy===true,'security policy does not require server-authoritative economy');
must(policy.codeInboxOnly===true,'security policy codeInboxOnly missing');
for(const key of ['mini_caixa','cyber_caixa','mecha_caixa']){const l=loot[key];must(l && l.chance_moedas+l.chance_cyber_fichas+l.chance_gemas===100,`loot probabilities invalid for ${key}`);}
for(const key of ['player_name','coins','gems','cyber_fichas','level','xp','total_xp','pass_xp','pass_level','inventory','missions','inbox','redeemed_codes'])must(Object.prototype.hasOwnProperty.call(playerData,key),`default player data missing ${key}`);
must(exists('server/db/migrations/002_security.sql'),'security migration missing');
must(exists('server/Dockerfile'),'production Dockerfile missing');
must(exists('server/docker-compose.prod.yml'),'production compose missing');
const prodCompose=await read('server/docker-compose.prod.yml');
must(/\n  migrate:/.test(prodCompose),'production migration service missing');
must(/service_completed_successfully/.test(prodCompose),'application does not wait for successful migrations');
must(/  migrate:[\s\S]*?depends_on:\n      db:\n        condition: service_healthy/.test(prodCompose),'migration service does not wait for healthy database');
const migrateBlock=prodCompose.split('\n  app:')[0];
must(!/depends_on:\n      migrate:/.test(migrateBlock),'migration service depends on itself');
must(!/project\.godot/.test(await read('server/Dockerfile')),'legacy Godot project copied into production image');

const extractMap=text=>{const m=text.match(/const rewards = \{([\s\S]*?)\n  \};/);if(!m)return null;return Object.fromEntries([...m[1].matchAll(/(\d+):'([^']+)'/g)].map(x=>[x[1],x[2]]));};
const cm=extractMap(js),sm=extractMap(server);
must(JSON.stringify(cm)===JSON.stringify(sm),'client/server Pass reward maps differ');
must(cm?.['97']==='MECHA CAIXA'&&cm?.['98']==='MECHA CAIXA'&&cm?.['99']==='MECHA CAIXA'&&cm?.['100']==='MECHA CAIXA','final four Pass tiers are not all Mecha');
let boxCount=0,mini=0,cyber=0,mecha=0;
for(let i=1;i<=100;i++){const r=cm?.[String(i)]||'200 FICHAS';if(r==='MINI CAIXA'){boxCount++;mini++;}if(r==='CYBER CAIXA'){boxCount++;cyber++;}if(r==='MECHA CAIXA'){boxCount++;mecha++;}}
must(boxCount===20&&mini===9&&cyber===7&&mecha===4,`Pass box distribution mismatch: total=${boxCount}, mini=${mini}, cyber=${cyber}, mecha=${mecha}`);

for(const rel of ['legacy/original-godot/project.godot','legacy/original-godot/AndroidManifest.xml','legacy/original-godot/scr'])must(exists(rel),`legacy artifact unexpectedly missing: ${rel}`);
const emptyActive=[];
for(const rel of ['Index.html','main.js','style.css','README.md','server/server.mjs','server/package.json','server/db/schema.sql','server/db/migrations/002_security.sql']){const st=await fs.stat(path.join(root,rel));if(st.size===0)emptyActive.push(rel);}
must(!emptyActive.length,`empty active file(s): ${emptyActive.join(', ')}`);

try{execFileSync(process.execPath,['--check',path.join(root,'main.js')],{stdio:'ignore'});execFileSync(process.execPath,['--check',path.join(root,'server/server.mjs')],{stdio:'ignore'});for(const f of ['migrate.mjs','maintenance.mjs','security-audit.mjs','create-owner.mjs'])execFileSync(process.execPath,['--check',path.join(root,'server/scripts',f)],{stdio:'ignore'});}catch{failures.push('Node syntax check failed');}

if(exists('sounds/lobby_theme_loop.mp3'))failures.push('invalid/obsolete lobby_theme_loop.mp3 still present');
try{const out=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',path.join(root,'sounds/lobby_theme.mp3')],{encoding:'utf8'}).trim();must(Number(out)>0,'lobby_theme.mp3 is not readable');}catch{failures.push('ffprobe could not validate lobby_theme.mp3');}

if(failures.length){console.error('CyberArena FULL AUDIT: FAIL');for(const x of failures)console.error('- '+x);process.exit(1);}
console.log('CyberArena FULL AUDIT: PASS');
console.log(`HTML ids: ${ids.length}; JS functions: ${funcs.size}; Pass boxes: ${boxCount} (Mini ${mini}, Cyber ${cyber}, Mecha ${mecha})`);
if(warn.length)for(const x of warn)console.warn('WARN - '+x);
