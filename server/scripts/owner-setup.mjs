import pg from 'pg';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const { Pool } = pg;
const db = process.env.DATABASE_URL;
if (!db) throw new Error('DATABASE_URL is required');

const pool = new Pool({ connectionString: db });
const client = await pool.connect();
const rl = readline.createInterface({ input, output });

function clean(v){ return String(v ?? '').trim(); }
function b64(v){ return Buffer.from(v).toString('base64url'); }
async function question(label, hidden=false){ return rl.question(label, hidden ? { hideEchoBack: true } : undefined); }
async function makeCyberId(){
  for(let i=0;i<30;i++){
    const id='CA-OWNER-'+b64(crypto.randomBytes(6)).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);
    const r=await client.query('SELECT 1 FROM accounts WHERE cyber_id=$1',[id]);
    if(!r.rowCount) return id;
  }
  throw new Error('Could not allocate a unique owner Cyber ID');
}
async function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const hash=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,k)=>e?reject(e):resolve(k)));
  return {salt,hash};
}

try{
  const existing=await client.query('SELECT cyber_id,name FROM accounts WHERE is_owner=true LIMIT 1');
  if(existing.rowCount){
    console.log(`Owner já configurado: ${existing.rows[0].cyber_id} (${existing.rows[0].name})`);
    console.log('Este procedimento é somente para a primeira configuração.');
    process.exitCode=2;
  }else{
    const name=clean(await question('Nome do dono: ')).toUpperCase();
    if(!name || name.length>24) throw new Error('Owner name must be 1-24 characters');
    const password=await question('Senha do dono (mínimo 16 caracteres): ',true);
    if(password.length<16) throw new Error('Owner password must be at least 16 characters');
    const confirm=await question('Confirme a senha: ',true);
    if(password!==confirm) throw new Error('Passwords do not match');
    const {salt,hash}=await hashPassword(password);
    const cyberId=await makeCyberId();
    const state={player_name:name,coins:500,gems:50,cyber_fichas:0,level:1,xp:0,total_xp:0,pass_xp:0,pass_level:1,free_offer_claimed:false,gem_offer_claimed:false,gem_offer_start:null,name_changes:0,box_daily:{date:'',mini:0,cyber:0,mecha:0},pass_claimed:[],premium_pass:false,premium_claimed:[],account_claimed:[],inventory:{mini:0,cyber:0,mecha:0},offer_seed:0,missions:{character_created:false,first_match:false,character_claimed:false,first_match_claimed:false},inbox:[],redeemed_codes:[]};
    await client.query('BEGIN');
    await client.query('INSERT INTO accounts(cyber_id,name,password_salt,password_hash,state,is_owner) VALUES($1,$2,$3,$4,$5,true)',[cyberId,name,salt,hash,state]);
    await client.query('INSERT INTO audit_log(action,metadata) VALUES($1,$2)',['owner_created',{cyberId,method:'interactive_first_run'}]);
    await client.query('COMMIT');
    console.log('OWNER CONFIGURADO COM SUCESSO');
    console.log(`Cyber Account: ${cyberId}`);
    console.log('Guarde a senha fora do servidor.');
    console.log('O bootstrap de Owner não deve ser executado novamente.');
  }
}catch(e){
  try{await client.query('ROLLBACK')}catch{}
  console.error(`Owner setup failed: ${e.message}`);
  process.exitCode=1;
}finally{
  rl.close(); client.release(); await pool.end();
}
