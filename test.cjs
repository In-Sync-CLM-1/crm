const { Client } = require('pg');
(async () => {
  for (const cfg of [
    { label: 'pooler-tx-6543', port: 6543 },
    { label: 'pooler-session-5432', port: 5432 }
  ]) {
    const c = new Client({
      host: 'aws-1-ap-south-1.pooler.supabase.com',
      port: cfg.port,
      user: 'postgres.ejzjrvazegaxrhqizgaa',
      password: process.env.PG_PWD,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000
    });
    try {
      await c.connect();
      const r = await c.query('SELECT current_user, version()');
      console.log(cfg.label, 'OK as', r.rows[0].current_user);
      await c.end();
    } catch (e) {
      console.log(cfg.label, 'ERR', e.code || '', (e.message || '').substring(0,100));
    }
  }
})();