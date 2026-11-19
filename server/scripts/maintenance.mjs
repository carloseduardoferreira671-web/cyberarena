import pg from 'pg';
const {Pool}=pg;
const db=process.env.DATABASE_URL;if(!db)throw new Error('DATABASE_URL is required');
const pool=new Pool({connectionString:db});
try{
  const r=await pool.query(`
    WITH s AS (DELETE FROM sessions WHERE expires_at<=NOW() OR revoked_at IS NOT NULL RETURNING 1),
         a AS (DELETE FROM admin_sessions WHERE expires_at<=NOW() OR revoked_at IS NOT NULL RETURNING 1),
         i AS (DELETE FROM idempotency_keys WHERE expires_at<=NOW() RETURNING 1)
    SELECT (SELECT count(*) FROM s) AS sessions_removed,
           (SELECT count(*) FROM a) AS admin_sessions_removed,
           (SELECT count(*) FROM i) AS idempotency_removed`);
  console.log(JSON.stringify(r.rows[0]));
}finally{await pool.end();}
