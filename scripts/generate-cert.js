#!/usr/bin/env node
/**
 * generate-cert.js
 * Generates a self-signed TLS certificate using OpenSSL.
 * Automatically finds OpenSSL (Git for Windows, system, etc.)
 *
 * Run: node scripts/generate-cert.js
 * Output: backend/certs/server.key  +  backend/certs/server.crt
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CERT_DIR = path.join(__dirname, '../backend/certs');
const KEY_FILE = path.join(CERT_DIR, 'server.key');
const CRT_FILE = path.join(CERT_DIR, 'server.crt');

// ── Find a working OpenSSL binary ─────────────────────────────────────────────
function findOpenSSL() {
  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'C:\\strawberry\\c\\bin\\openssl.exe',
    'openssl', // system PATH
  ];
  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['version'], { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
      // Reject ancient versions (< 1.1)
      const m = out.match(/OpenSSL (\d+)\.(\d+)/);
      if (m && (parseInt(m[1]) > 1 || (parseInt(m[1]) === 1 && parseInt(m[2]) >= 1))) {
        return bin;
      }
    } catch { /* try next */ }
  }
  return null;
}

// ── Build the SAN config file ─────────────────────────────────────────────────
function writeSanConfig(hostname, tmpDir) {
  const cfgPath = path.join(tmpDir, 'san.cnf');
  const cfg = `[req]
distinguished_name = req_dn
x509_extensions    = v3_req
prompt             = no

[req_dn]
CN = ${hostname}

[v3_req]
subjectAltName = @alt_names
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = ${hostname}
DNS.2 = localhost
IP.1  = 127.0.0.1
`;
  fs.writeFileSync(cfgPath, cfg);
  return cfgPath;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function generateCert(hostname) {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });

  const openssl = findOpenSSL();
  if (!openssl) {
    throw new Error(
      'OpenSSL not found. Install Git for Windows (https://git-scm.com) which includes OpenSSL, then re-run.'
    );
  }

  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'jtl-cert-'));
  const cfgFile = writeSanConfig(hostname, tmpDir);
  const tmpKey  = path.join(tmpDir, 'server.key');
  const tmpCrt  = path.join(tmpDir, 'server.crt');

  try {
    // Generate private key + self-signed cert in one command
    execFileSync(openssl, [
      'req', '-x509',
      '-newkey', 'rsa:2048',
      '-keyout', tmpKey,
      '-out',    tmpCrt,
      '-days',   '3650',       // 10 years
      '-nodes',                // no passphrase
      '-config', cfgFile,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    // Copy to final location
    fs.copyFileSync(tmpKey, KEY_FILE);
    fs.copyFileSync(tmpCrt, CRT_FILE);
    try { fs.chmodSync(KEY_FILE, 0o600); } catch { /* Windows: ignore */ }

    return { KEY_FILE, CRT_FILE, openssl };
  } finally {
    // Clean up temp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (require.main === module) {
  const hostname = os.hostname();
  console.log('\n  Prasanth\'s Performance Portal — TLS Certificate Generator');
  console.log('  ─────────────────────────────────────────────────────────\n');
  console.log(`  Hostname : ${hostname}`);
  console.log(`  SANs     : ${hostname}, localhost, 127.0.0.1`);
  console.log(`  Valid for: 10 years\n`);
  console.log('  Generating RSA-2048 certificate...');

  try {
    const { KEY_FILE, CRT_FILE, openssl } = generateCert(hostname);
    console.log(`  OpenSSL  : ${openssl}`);
    console.log(`\n  ✅  Certificate written:`);
    console.log(`       ${CRT_FILE}`);
    console.log(`       ${KEY_FILE}`);
    console.log('\n  Next step: restart the backend.\n');
  } catch (err) {
    console.error(`\n  ❌  ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { generateCert };
