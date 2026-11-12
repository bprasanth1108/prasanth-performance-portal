/**
 * Embedded PostgreSQL starter.
 * embedded-postgres is ESM-only so we use dynamic import().
 *
 * Logic:
 *  - If pgdata/PG_VERSION exists  → cluster already initialised → just start()
 *  - Otherwise                    → initialise() then start()
 *
 * Data is stored in <app-root>/pgdata and persists across restarts.
 */

const path = require('path');
const fs   = require('fs');

let _pg = null;

async function startEmbeddedPostgres() {
  const dataDir = path.resolve(__dirname, '../../../pgdata');
  const port    = parseInt(process.env.EMBEDDED_PG_PORT || '5433');
  const pgVersionFile = path.join(dataDir, 'PG_VERSION');
  const alreadyInitialised = fs.existsSync(pgVersionFile);

  console.log('[EmbeddedPG] Starting embedded PostgreSQL...');
  console.log(`[EmbeddedPG] Data dir     : ${dataDir}`);
  console.log(`[EmbeddedPG] Port         : ${port}`);
  console.log(`[EmbeddedPG] Already init : ${alreadyInitialised}`);

  // Remove stale postmaster.pid if present (left over from a crash)
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      fs.unlinkSync(pidFile);
      console.log('[EmbeddedPG] Removed stale postmaster.pid');
    } catch (e) {
      console.warn('[EmbeddedPG] Could not remove postmaster.pid:', e.message);
    }
  }

  // Dynamic import — embedded-postgres is ESM-only
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  _pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user:        'postgres',
    password:    'postgres',
    port,
    persistent:  true,
  });

  if (alreadyInitialised) {
    // Cluster exists — skip initdb, just start the server
    console.log('[EmbeddedPG] Cluster exists, skipping initdb...');
    await _pg.start();
  } else {
    // Fresh install — initialise then start
    console.log('[EmbeddedPG] Fresh install, running initdb...');
    await _pg.initialise();
    await _pg.start();
  }

  console.log('[EmbeddedPG] ✅ PostgreSQL ready.');
  return port;
}

async function stopEmbeddedPostgres() {
  if (_pg) {
    try {
      await _pg.stop();
      console.log('[EmbeddedPG] PostgreSQL stopped.');
    } catch (e) {
      console.warn('[EmbeddedPG] Stop warning:', e.message);
    }
    _pg = null;
  }
}

module.exports = { startEmbeddedPostgres, stopEmbeddedPostgres };
