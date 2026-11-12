/**
 * System Check — validates Node.js version only.
 * PostgreSQL is embedded, so no external installation is required.
 */

const MIN_NODE_MAJOR = 18;

function checkNodeVersion() {
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    return {
      ok: false,
      message: `Node.js ${version} is too old. Minimum required: v${MIN_NODE_MAJOR}. Download: https://nodejs.org`
    };
  }
  return { ok: true, message: `Node.js ${version} ✓` };
}

async function runAllChecks() {
  console.log('\n========================================');
  console.log('  JTL Super App — System Check');
  console.log('========================================');

  const nodeCheck = checkNodeVersion();
  console.log(`  Node.js    : ${nodeCheck.message}`);
  if (!nodeCheck.ok) {
    console.error('\n[FATAL] System check failed. Exiting.');
    process.exit(1);
  }

  console.log('  PostgreSQL : embedded (no install needed) ✓');
  console.log('========================================\n');
}

module.exports = { runAllChecks };
