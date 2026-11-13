const { Client } = require('pg');
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function runMigrations(client) {
  // Add test_name column if missing
  await client.query(`
    ALTER TABLE jtl.runs ADD COLUMN IF NOT EXISTS test_name VARCHAR(200)
  `);
  // Add run_charts table if missing
  await client.query(`
    CREATE TABLE IF NOT EXISTS jtl.run_charts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      run_id UUID UNIQUE REFERENCES jtl.runs(id) ON DELETE CASCADE,
      apdex JSONB,
      statistics JSONB,
      request_summary JSONB,
      response_times_over_time JSONB,
      percentiles_over_time JSONB,
      active_threads_over_time JSONB,
      bytes_over_time JSONB,
      latency_over_time JSONB,
      hits_per_second JSONB,
      codes_per_second JSONB,
      response_time_distribution JSONB,
      percentiles_per_label JSONB,
      top_errors JSONB,
      built_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Add run_insights table if missing
  await client.query(`
    CREATE TABLE IF NOT EXISTS jtl.run_insights (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      run_id UUID UNIQUE REFERENCES jtl.runs(id) ON DELETE CASCADE,
      health_score INTEGER,
      health_grade VARCHAR(2),
      health_label VARCHAR(50),
      summary TEXT,
      findings JSONB,
      analyzed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // ── User profile fields: name + one-time self-edit lock (idempotent) ──────
  await client.query(`ALTER TABLE jtl.users ADD COLUMN IF NOT EXISTS name VARCHAR(150)`);
  await client.query(`ALTER TABLE jtl.users ADD COLUMN IF NOT EXISTS profile_locked BOOLEAN DEFAULT false`);
  // token_version: incrementing this invalidates all of a user's existing JWTs
  // (used for logout-everywhere, password change, and admin disable/delete).
  await client.query(`ALTER TABLE jtl.users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);

  // Widen health_grade so fallback values like 'N/A' never overflow VARCHAR(2),
  // which previously caused analysis to be saved as a '0/100 (E) Error' record.
  await client.query(`ALTER TABLE jtl.run_insights ALTER COLUMN health_grade TYPE VARCHAR(5)`);
  // pending_approval: true for self-registered accounts awaiting admin approval.
  await client.query(`ALTER TABLE jtl.users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN DEFAULT false`);

  // ── Roles: move to the 6-role system (idempotent, safe on every startup) ──
  // Legacy 'viewer' accounts become 'developer' (also read-only) so the new
  // CHECK constraint does not reject existing rows.
  await client.query(`UPDATE jtl.users SET role = 'developer' WHERE role = 'viewer'`);
  await client.query(`ALTER TABLE jtl.users DROP CONSTRAINT IF EXISTS users_role_check`);
  await client.query(`ALTER TABLE jtl.users ALTER COLUMN role TYPE VARCHAR(30)`);
  await client.query(`ALTER TABLE jtl.users ALTER COLUMN role SET DEFAULT 'developer'`);
  await client.query(`
    ALTER TABLE jtl.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin','senior_test_engineer','manager','tester','project_manager','developer'))
  `);

  // ── Project membership table ──────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS jtl.project_members (
      project_id  UUID REFERENCES jtl.projects(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES jtl.users(id)    ON DELETE CASCADE,
      assigned_at TIMESTAMP DEFAULT NOW(),
      assigned_by UUID REFERENCES jtl.users(id)    ON DELETE SET NULL,
      PRIMARY KEY (project_id, user_id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_project_members_user    ON jtl.project_members(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_project_members_project ON jtl.project_members(project_id)`);

  // ── Clean up stale project memberships (Option B) ─────────────────────────
  // Only project_manager and developer are gated per-project. Global roles
  // (admin, senior_test_engineer, manager, tester) already see every project,
  // so any membership rows for them are redundant and should not exist. This
  // removes only rows in jtl.project_members — no user accounts or project data.
  const cleanup = await client.query(`
    DELETE FROM jtl.project_members pm
    USING jtl.users u
    WHERE pm.user_id = u.id
      AND u.role NOT IN ('project_manager', 'developer')
  `);
  if (cleanup.rowCount) {
    console.log(`[DB Init] Removed ${cleanup.rowCount} stale project membership row(s) for global-role users.`);
  }
}

async function initDatabase() {
  const cfg = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5433'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

  // ── Step 1: create the app database if it doesn't exist ──────────────────
  const adminClient = new Client({ ...cfg, database: 'postgres' });
  try {
    await adminClient.connect();
    const dbName = process.env.DB_NAME || 'jtl_super_app';
    const exists = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1', [dbName]
    );
    if (!exists.rowCount) {
      console.log(`[DB Init] Creating database "${dbName}"...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
    } else {
      console.log(`[DB Init] Database "${dbName}" already exists.`);
    }
  } finally {
    await adminClient.end();
  }

  // ── Step 2: apply schema ──────────────────────────────────────────────────
  const appClient = new Client({ ...cfg, database: process.env.DB_NAME || 'jtl_super_app' });
  try {
    await appClient.connect();

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await appClient.query(schema);
    console.log('[DB Init] Schema applied.');

    // Run incremental migrations for existing databases
    await runMigrations(appClient);
    console.log('[DB Init] Migrations applied.');

    // ── Step 3: create default admin on first run ─────────────────────────
    const { rows } = await appClient.query('SELECT COUNT(*) FROM jtl.users');
    if (parseInt(rows[0].count) === 0) {
      const defaultPassword = process.env.ADMIN_PASSWORD || 'Admin@1234';
      const hash = await bcrypt.hash(defaultPassword, 12);
      await appClient.query(
        `INSERT INTO jtl.users (username, password, role) VALUES ($1, $2, 'admin')`,
        ['admin', hash]
      );
      console.log('====================================================');
      console.log('[DB Init] Default admin account created:');
      console.log('  Username : admin');
      console.log(`  Password : ${defaultPassword}`);
      console.log('  ⚠  Change this password after first login!');
      console.log('====================================================');
    }
  } finally {
    await appClient.end();
  }
}

module.exports = { initDatabase };
