require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const https   = require('https');
const http    = require('http');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { runAllChecks } = require('./utils/systemCheck');
const { startEmbeddedPostgres, stopEmbeddedPostgres } = require('./db/embedded');
const { initDatabase } = require('./db/init');

const authRoutes     = require('./routes/auth');
const projectRoutes  = require('./routes/projects');
const scenarioRoutes = require('./routes/scenarios');
const runRoutes      = require('./routes/runs');

const app        = express();
const HTTP_PORT        = parseInt(process.env.HTTP_PORT        || '3001');
const HTTPS_PORT       = parseInt(process.env.HTTPS_PORT       || '3443');
// Public ports are what the browser sees (via netsh proxy 443→3443, 80→3001).
// When PUBLIC_HTTPS_PORT=443, the redirect omits the port from the URL entirely.
const PUBLIC_HTTPS_PORT = parseInt(process.env.PUBLIC_HTTPS_PORT || String(HTTPS_PORT));

// ── Cert paths ────────────────────────────────────────────────────────────────
const CERT_DIR = path.join(__dirname, '../../backend/certs');
const KEY_FILE  = path.join(CERT_DIR, 'server.key');
const CRT_FILE  = path.join(CERT_DIR, 'server.crt');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth',    authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/scenarios', scenarioRoutes);
app.use('/api/projects/:projectId/scenarios/:scenarioId/runs', runRoutes);

// Health check
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', version: '1.0.0', time: new Date().toISOString() })
);

// Serve built React frontend (production)
const frontendBuild = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendBuild)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) =>
    res.sendFile(path.join(frontendBuild, 'index.html'))
  );
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  try {
    await runAllChecks();

    const pgPort = await startEmbeddedPostgres();
    process.env.DB_HOST     = process.env.DB_HOST     || 'localhost';
    process.env.DB_PORT     = String(pgPort);
    process.env.DB_USER     = process.env.DB_USER     || 'postgres';
    process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
    process.env.DB_NAME     = process.env.DB_NAME     || 'jtl_super_app';

    await initDatabase();

    // ── HTTPS server (primary) ─────────────────────────────────────────────
    if (fs.existsSync(KEY_FILE) && fs.existsSync(CRT_FILE)) {
      const tlsOptions = {
        key:  fs.readFileSync(KEY_FILE),
        cert: fs.readFileSync(CRT_FILE),
      };

      https.createServer(tlsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        const publicBase = PUBLIC_HTTPS_PORT === 443
          ? `https://<your-hostname>`
          : `https://<your-hostname>:${PUBLIC_HTTPS_PORT}`;
        console.log(`\n✅  Prasanth's Performance Portal is running (HTTPS)`);
        console.log(`    Local  : https://localhost${PUBLIC_HTTPS_PORT === 443 ? '' : ':' + PUBLIC_HTTPS_PORT}`);
        console.log(`    Network: ${publicBase}`);
        console.log(`    Login  : admin / Admin@1234  (change after first login)\n`);
      });

      // ── HTTP → HTTPS redirect ──────────────────────────────────────────────
      http.createServer((req, res) => {
        const host = (req.headers.host || '').replace(/:\d+$/, '');
        // If public HTTPS is on standard port 443, omit the port from the URL
        const portSuffix = PUBLIC_HTTPS_PORT === 443 ? '' : `:${PUBLIC_HTTPS_PORT}`;
        res.writeHead(301, { Location: `https://${host}${portSuffix}${req.url}` });
        res.end();
      }).listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`    HTTP redirect active on port ${HTTP_PORT}`);
      });

    } else {
      // ── Fallback: plain HTTP if certs are missing ──────────────────────────
      console.warn('\n⚠️   TLS certificates not found. Running on plain HTTP.');
      console.warn(`    Run: node scripts/generate-cert.js  to enable HTTPS.\n`);

      app.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`\n✅  Prasanth's Performance Portal is running (HTTP)`);
        console.log(`    Local  : http://localhost:${HTTP_PORT}`);
        console.log(`    Network: http://<your-ip>:${HTTP_PORT}`);
        console.log(`    Login  : admin / Admin@1234  (change after first login)\n`);
      });
    }

    // Graceful shutdown
    process.on('SIGINT',  async () => { await stopEmbeddedPostgres(); process.exit(0); });
    process.on('SIGTERM', async () => { await stopEmbeddedPostgres(); process.exit(0); });

  } catch (err) {
    console.error('[FATAL] Startup failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

start();
