require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const https   = require('https');
const http    = require('http');
const cors    = require('cors');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');

// ── Fail fast on missing/weak JWT secret ────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET is missing or too short (min 32 chars). Set a strong secret in backend/.env.');
  process.exit(1);
}

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

// ── Security headers (helmet) ───────────────────────────────────────────────────
// CSP is disabled here because the SPA + inline styles would need a tailored
// policy; the other protections (HSTS, noSniff, frameguard, etc.) stay on.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
// Behind the netsh/proxy port-forward, trust the first proxy so rate-limit and
// protocol detection see the real client.
app.set('trust proxy', 1);

// ── CORS — same-origin by default, plus an optional allow-list ──────────────────
// This server serves its own frontend, so requests come from the SAME host the
// app was loaded from. Those are always safe to allow — we compare the request's
// Origin against its own Host header. CORS_ALLOWED_ORIGINS adds any EXTRA origins
// (e.g. a separate dev server or domain) as a comma-separated list.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

// Per-request CORS: a request is same-origin when the Origin's hostname matches
// the request's own Host header. That is always safe here because this server
// serves its own frontend. Port is ignored because public ports (443/80) are
// port-forwarded to the app's internal ports (3443/3001).
app.use(cors((req, cb) => {
  const origin = req.headers.origin;
  const options = {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin: false,
  };

  // Non-browser / same-origin requests have no Origin header.
  if (!origin) { options.origin = true; return cb(null, options); }

  // Explicit allow-list match.
  if (allowedOrigins.includes(origin)) { options.origin = true; return cb(null, options); }

  // Same-origin match: compare Origin hostname to the request's own Host.
  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const reqHost = String(req.headers.host || '').split(':')[0].toLowerCase();
    if (originHost && originHost === reqHost) { options.origin = true; return cb(null, options); }
  } catch { /* malformed origin */ }

  return cb(null, options); // origin stays false → CORS headers not set, request blocked
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ───────────────────────────────────────────────────────────────
// Global limiter: blunt abuse / scraping across the whole API.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// Stricter limiter for auth endpoints (brute-force protection).
const authLimiter = rateLimit({
  windowMs: (parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000,
  max: (parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5) * 4, // IP-level ceiling
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
app.use('/api/auth/login', authLimiter);

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
