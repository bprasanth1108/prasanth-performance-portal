/**
 * PostgreSQL connection pool.
 * The pool is created lazily on first use so that app.js has time
 * to start embedded-postgres and set DB_PORT before any query runs.
 */
const { Pool } = require('pg');

let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5433'),
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME     || 'jtl_super_app',
      max: 20,
      idleTimeoutMillis:    30000,
      connectionTimeoutMillis: 8000,
    });
    _pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err.message);
    });
  }
  return _pool;
}

const query     = (text, params) => getPool().query(text, params);
const getClient = ()             => getPool().connect();

module.exports = { query, getClient, get pool() { return getPool(); } };
