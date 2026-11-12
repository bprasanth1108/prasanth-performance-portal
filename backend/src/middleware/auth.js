const jwt  = require('jsonwebtoken');
const { query } = require('../db');

// ── Role definitions ───────────────────────────────────────────────────────────
// Super access: everything, including creating / editing / deleting users
const USER_ADMIN_ROLES = ['admin', 'senior_test_engineer'];

// Full project access: see ALL projects, edit/delete projects, scenarios and runs,
// and assign users to projects. Everything except user management.
const GLOBAL_ROLES  = ['admin', 'senior_test_engineer', 'manager', 'tester'];
const ADMIN_ROLES   = GLOBAL_ROLES;

// Roles that can create projects / scenarios / upload runs
const CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester', 'project_manager'];

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

// Edit/delete projects, scenarios, runs; manage project membership
function requireAdmin(req, res, next) {
  if (!ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'You do not have permission to perform this action' });
  }
  next();
}

// Create / edit / delete user accounts
function requireUserAdmin(req, res, next) {
  if (!USER_ADMIN_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Only Administrators and Senior Test Engineers can manage users' });
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
  requireUserAdmin,
  requireManager,
  requireProjectAccess,
  GLOBAL_ROLES,
  CREATOR_ROLES,
};
