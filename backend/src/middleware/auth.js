const jwt  = require('jsonwebtoken');
const { query } = require('../db');

// ── Role definitions ───────────────────────────────────────────────────────────
// Roles that can see ALL projects (bypass per-project membership checks)
const GLOBAL_ROLES  = ['admin', 'senior_test_engineer'];

// Roles that can create projects / scenarios / upload runs
const CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester', 'project_manager'];

// Roles that can edit / delete (destructive)
const ADMIN_ROLES   = ['admin', 'senior_test_engineer'];

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireManager(req, res, next) {
  if (!CREATOR_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Insufficient role to perform this action' });
  }
  next();
}

// Middleware: user must have access to req.params.projectId
// Global roles (admin, senior_test_engineer) always pass.
// Others must be in jtl.project_members for this project.
async function requireProjectAccess(req, res, next) {
  const { role, id: userId } = req.user || {};
  const projectId = req.params.projectId || req.params.id;

  if (GLOBAL_ROLES.includes(role)) return next();

  try {
    const result = await query(
      'SELECT 1 FROM jtl.project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (!result.rows.length) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Access check failed' });
  }
}

module.exports = {
  verifyToken,
  requireAdmin,
  requireManager,
  requireProjectAccess,
  GLOBAL_ROLES,
  CREATOR_ROLES,
};
