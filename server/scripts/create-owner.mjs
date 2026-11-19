import pg from 'pg';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
const {Pool}=pg;
const db=process.env.DATABASE_URL;if(!db)throw new Error('DATABASE_URL is required');
const name=String(process.env.OWNER_NAME||'OWNER').trim().toUpperCase();
let password=process.env.OWNER_PASSWORD||'';
if(!password){const rl=readline.createInterface({input,output});password=await rl.question('Owner password (>=12 chars): ',{hideEchoBack:true});rl.close();}
if(password.length<12)throw new Error('Owner password must be at least 12 characters');
const pool=new Pool({connectionString:db});
const c=await pool.connect();
const b64=b=>Buffer.from(b).toString('base64url');
const id=async()=>{for(let i=0;i<20;i++){const x='CA-OWNER-'+b64(crypto.randomBytes(5)).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);const r=await c.query('SELECT 1 FROM accounts WHERE cyber_id=$1',[x]);if(!r.rowCount)return x;}throw new Error('ID allocation failed');};
const salt=crypto.randomBytes(16);const hash=await new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(e,k)=>e?reject(e):resolve(k)));
try{await c.query('BEGIN');const existing=await c.query('SELECT id FROM accounts WHERE is_owner=true LIMIT 1');if(existing.rowCount)throw new Error('An owner account already exists');const cyberId=await id();const state={player_name:name,coins:500,gems:50,cyber_fichas:0,level:1,xp:0,total_xp:0,pass_xp:0,pass_level:1,free_offer_claimed:false,gem_offer_claimed:false,gem_offer_start:null,name_changes:0,box_daily:{date:'',mini:0,cyber:0,mecha:0},pass_claimed:[],premium_pass:false,premium_claimed:[],account_claimed:[],inventory:{mini:0,cyber:0,mecha:0},offer_seed:0,missions:{character_created:false,first_match:false,character_claimed:false,first_match_claimed:false},inbox:[],redeemed_codes:[]};await c.query('INSERT INTO accounts(cyber_id,name,password_salt,password_hash,state,is_owner) VALUES($1,$2,$3,$4,$5,true)',[cyberId,name,salt,hash,state]);await c.query('INSERT INTO audit_log(action,metadata) VALUES($1,$2)', ['owner_created',{cyberId}]);await c.query('COMMIT');console.log(`Owner created: ${cyberId}`);}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
