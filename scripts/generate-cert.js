#!/usr/bin/env node
/**
 * generate-cert.js
 * Generates a self-signed TLS certificate for this machine's hostname.
 *
 * Strategy (first one that works wins):
 *   1. OpenSSL >= 1.1 (system PATH, Git for Windows, Strawberry Perl)
 *   2. node-forge (pure JavaScript, installed with the backend dependencies)
 *      -> works on machines with no Git / no OpenSSL at all.
 *
 * Run:    node scripts/generate-cert.js
 * Output: backend/certs/server.key  +  backend/certs/server.crt
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const BACKEND  = path.join(__dirname, '../backend');
const CERT_DIR = path.join(BACKEND, 'certs');
const KEY_FILE = path.join(CERT_DIR, 'server.key');
const CRT_FILE = path.join(CERT_DIR, 'server.crt');
const VALID_DAYS = 3650; // 10 years

// ── Strategy 1: OpenSSL ───────────────────────────────────────────────────────
function findOpenSSL() {
  const candidates = [
    'openssl', // system PATH
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    path.join(os.homedir(), 'AppData\\Local\\Programs\\Git\\usr\\bin\\openssl.exe'),
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'C:\\strawberry\\c\\bin\\openssl.exe',
  ];
  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['version'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      // Reject ancient builds (< 1.1) — they can't do -config with SANs reliably
      const m = out.match(/OpenSSL (\d+)\.(\d+)/);
      if (m && (+m[1] > 1 || (+m[1] === 1 && +m[2] >= 1))) return bin;
    } catch { /* not present — try next */ }
  }
  return null;
}

function generateWithOpenSSL(openssl, hostname) {
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'ppp-cert-'));
  const cfgFile = path.join(tmpDir, 'san.cnf');
  const tmpKey  = path.join(tmpDir, 'server.key');
  const tmpCrt  = path.join(tmpDir, 'server.crt');

  fs.writeFileSync(cfgFile, `[req]
distinguished_name = req_dn
x509_extensions    = v3_req
prompt             = no

[req_dn]
CN = ${hostname}

[v3_req]
subjectAltName   = @alt_names
basicConstraints = CA:FALSE
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = ${hostname}
DNS.2 = localhost
IP.1  = 127.0.0.1
`);

  try {
    execFileSync(openssl, [
      'req', '-x509', '-newkey', 'rsa:2048',
      '-keyout', tmpKey, '-out', tmpCrt,
      '-days', String(VALID_DAYS), '-nodes', '-config', cfgFile,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    return { key: fs.readFileSync(tmpKey, 'utf8'), cert: fs.readFileSync(tmpCrt, 'utf8') };
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ── Strategy 2: node-forge (pure JS) ──────────────────────────────────────────
function loadForge() {
  try {
    return require(require.resolve('node-forge', { paths: [BACKEND, __dirname] }));
  } catch {
    return null;
  }
}

function generateWithForge(forge, hostname) {
  // Node's native keygen is fast; forge then builds + signs the certificate.
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  const fPriv = forge.pki.privateKeyFromPem(privateKey);
  const fPub  = forge.pki.publicKeyFromPem(publicKey);

  const cert = forge.pki.createCertificate();
  cert.publicKey    = fPub;
  // Leading '01' keeps the serial positive, as X.509 requires
  cert.serialNumber = '01' + crypto.randomBytes(15).toString('hex');
  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date(Date.now() + VALID_DAYS * 24 * 60 * 60 * 1000);

  const attrs = [{ name: 'commonName', value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [
      { type: 2, value: hostname },     // DNS
      { type: 2, value: 'localhost' },  // DNS
      { type: 7, ip: '127.0.0.1' },     // IP
    ] },
  ]);
  cert.sign(fPriv, forge.md.sha256.create());

  return { key: privateKey, cert: forge.pki.certificateToPem(cert) };
}

// ── Public API ────────────────────────────────────────────────────────────────
function generateCert(hostname = os.hostname()) {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });

  let result = null;
  let method = null;

  const openssl = findOpenSSL();
  if (openssl) {
    try {
      result = generateWithOpenSSL(openssl, hostname);
      method = `OpenSSL (${openssl})`;
    } catch (err) {
      console.warn(`  OpenSSL failed (${err.message.split('\n')[0]}), trying node-forge...`);
    }
  }

  if (!result) {
    const forge = loadForge();
    if (!forge) {
      throw new Error(
        'Cannot generate a certificate: OpenSSL was not found and the node-forge package is not installed.\n' +
        '       Fix: run "npm install" inside the backend folder, then: node scripts/generate-cert.js'
      );
    }
    result = generateWithForge(forge, hostname);
    method = 'node-forge (pure JavaScript)';
  }

  // Validate with the same TLS stack the server uses before writing anything
  require('tls').createSecureContext({ key: result.key, cert: result.cert });

  fs.writeFileSync(KEY_FILE, result.key);
  fs.writeFileSync(CRT_FILE, result.cert);
  try { fs.chmodSync(KEY_FILE, 0o600); } catch { /* Windows: ignore */ }

  return { KEY_FILE, CRT_FILE, method };
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (require.main === module) {
  const hostname = os.hostname();
  console.log("\n  Prasanth's Performance Portal — TLS Certificate Generator");
  console.log('  ─────────────────────────────────────────────────────────\n');
  console.log(`  Hostname : ${hostname}`);
  console.log(`  SANs     : ${hostname}, localhost, 127.0.0.1`);
  console.log('  Valid for: 10 years\n');

  try {
    const { KEY_FILE, CRT_FILE, method } = generateCert(hostname);
    console.log(`  Method   : ${method}`);
    console.log('\n  ✅  Certificate written:');
    console.log(`       ${CRT_FILE}`);
    console.log(`       ${KEY_FILE}`);
    console.log('\n  Next step: restart the backend.\n');
  } catch (err) {
    console.error(`\n  ❌  ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { generateCert, generateWithForge, loadForge };
