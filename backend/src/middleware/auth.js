const jwt  = require('jsonwebtoken');
const { query } = require('../db');

// ── Role definitions ───────────────────────────────────────────────────────────
// Super access: everything, including creating / editing / deleting users
const USER_ADMIN_ROLES = ['admin', 'senior_test_engineer'];

// Full project access: see ALL projects, edit/delete projects, scenarios and runs,
// and assign users to projects. Everything except user management.
const GLOBAL_ROLES  = ['admin', 'senior_test_engineer', 'manager', 'tester'];
const ADMIN_ROLES   = GLOBAL_ROLES;

// Roles that can create scenarios / upload runs / trigger analysis.
// NOTE: project_manager is read-only (client access), so it is excluded.
const CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester'];

// Roles that can create new projects. Tester is excluded (can work inside
// projects but not create them). project_manager is read-only.
const PROJECT_CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager'];

async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Server-side validation: the account must still exist, be active, and the
  // token's version must match the current one in the DB. Bumping the user's
  // token_version (logout, password change, admin disable/delete) revokes
  // every previously-issued token immediately.
  try {
    const result = await query(
      'SELECT role, is_active, token_version FROM jtl.users WHERE id = $1',
      [decoded.id]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Session no longer valid' });
    }
    const row = result.rows[0];
    if (!row.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    if ((decoded.tv ?? 0) !== row.token_version) {
      return res.status(401).json({ error: 'Session has been revoked. Please log in again.' });
    }
    // Keep role fresh from the DB in case it changed since the token was issued.
    req.user = { ...decoded, role: row.role };
    next();
  } catch (err) {
    console.error('[Auth] Token validation error:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
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

// Create new projects (admin / senior_test_engineer / manager only)
function requireProjectCreator(req, res, next) {
  if (!PROJECT_CREATOR_ROLES.includes(req.user?.role)) {
    return res.status(403).json({ error: 'You do not have permission to create projects' });
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
  requireProjectCreator,
  requireProjectAccess,
  GLOBAL_ROLES,
  CREATOR_ROLES,
  PROJECT_CREATOR_ROLES,
};
