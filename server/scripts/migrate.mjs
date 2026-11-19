import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const {Pool}=pg;
const here=path.dirname(fileURLToPath(import.meta.url));
const dir=path.resolve(here,'../db/migrations');
const db=process.env.DATABASE_URL;if(!db)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:db});
const c=await pool.connect();
try{
 await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const files=(await fs.readdir(dir)).filter(x=>x.endsWith('.sql')).sort();
 for(const file of files){const done=await c.query('SELECT 1 FROM schema_migrations WHERE version=$1',[file]);if(done.rowCount)continue;const sql=await fs.readFile(path.join(dir,file),'utf8');await c.query('BEGIN');try{await c.query(sql);await c.query('INSERT INTO schema_migrations(version) VALUES($1)',[file]);await c.query('COMMIT');console.log('Applied',file);}catch(e){await c.query('ROLLBACK');throw e;}}
}finally{c.release();await pool.end();}
