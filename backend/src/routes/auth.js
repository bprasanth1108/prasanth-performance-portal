const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { verifyToken, requireAdmin, requireUserAdmin } = require('../middleware/auth');

const router = express.Router();

const DEFAULT_PASSWORD = 'Test@123';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester', 'project_manager', 'developer'];

// ── Per-account login lockout (in-memory) ───────────────────────────────────────
// Complements the IP-level rate limiter in app.js. Locks a specific username
// after too many failed attempts, regardless of source IP.
const MAX_ATTEMPTS  = parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5;
const WINDOW_MS     = (parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000;
const failedLogins  = new Map(); // key: username -> { count, firstAt, lockedUntil }

function getLockState(key) {
  const rec = failedLogins.get(key);
  if (!rec) return { locked: false };
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return { locked: true, retryMs: rec.lockedUntil - Date.now() };
  }
  // Window expired — reset.
  if (Date.now() - rec.firstAt > WINDOW_MS) {
    failedLogins.delete(key);
    return { locked: false };
  }
  return { locked: false };
}

function recordFailure(key) {
  const now = Date.now();
  const rec = failedLogins.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - rec.firstAt > WINDOW_MS) { rec.count = 0; rec.firstAt = now; }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = now + WINDOW_MS;
  failedLogins.set(key, rec);
}

function clearFailures(key) { failedLogins.delete(key); }

// ── Password policy ─────────────────────────────────────────────────────────────
// Returns an error string if the password is too weak, or null if acceptable.
function validatePasswordStrength(pw) {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw))    return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(pw))    return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(pw))    return 'Password must contain a number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain a special character';
  return null;
}

// Normalise an email: trim + lowercase. Returns null if invalid.
function normaliseEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    // Usernames are emails stored lowercased — match case-insensitively.
    const loginName = username.trim().toLowerCase();

    // Per-account lockout check.
    const lock = getLockState(loginName);
    if (lock.locked) {
      const mins = Math.ceil(lock.retryMs / 60000);
      return res.status(429).json({ error: `Account temporarily locked due to failed attempts. Try again in ${mins} minute(s).` });
    }

    const result = await query(
      'SELECT * FROM jtl.users WHERE username = $1 AND is_active = true', [loginName]
    );
    if (!result.rows.length) {
      recordFailure(loginName);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      recordFailure(loginName);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearFailures(loginName);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0 },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id, username: user.username, name: user.name,
        role: user.role, profile_locked: user.profile_locked,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/register  (public) — self-registration, pending admin approval.
// Allowed roles exclude admin, senior_test_engineer, and manager.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const SELF_REGISTER_ROLES = ['tester', 'project_manager', 'developer'];

    if (!name || !email || !password || !role)
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    if (!SELF_REGISTER_ROLES.includes(role))
      return res.status(400).json({ error: 'Invalid role selection' });

    const normEmail = normaliseEmail(email);
    if (!normEmail) return res.status(400).json({ error: 'A valid email address is required' });

    const trimmedName = name.trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });

    const pwErr = validatePasswordStrength(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const hash = await bcrypt.hash(password, 12);
    // Inactive + pending until an admin approves. Profile locked immediately
    // since the user supplied their own name/email at registration.
    await query(
      `INSERT INTO jtl.users (username, name, password, role, is_active, pending_approval, profile_locked)
       VALUES ($1, $2, $3, $4, false, true, true)`,
      [normEmail, trimmedName, hash, role]
    );
    res.status(201).json({ message: 'Registration submitted. An administrator will review and approve your account.' });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with that email already exists' });
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/logout  — revoke the current session everywhere by bumping
// the user's token_version (all existing tokens become invalid immediately).
router.post('/logout', verifyToken, async (req, res) => {
  try {
    await query(
      'UPDATE jtl.users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1',
      [req.user.id]
    );
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log out' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, name, role, profile_locked, created_at FROM jtl.users WHERE id = $1', [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// PUT /api/auth/change-password  (any logged-in user changes their own password)
router.put('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) return res.status(400).json({ error: pwErr });
    if (currentPassword === newPassword)
      return res.status(400).json({ error: 'New password must be different from current password' });

    // Fetch current hash
    const result = await query('SELECT password FROM jtl.users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    // Bump token_version so any other active sessions for this user are revoked.
    await query(
      'UPDATE jtl.users SET password = $1, token_version = token_version + 1, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// PUT /api/auth/profile  (user sets their own name + email — ONCE only)
// Admins bypass the lock and can update their own profile any number of times.
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, email } = req.body;
    const isAdmin = req.user.role === 'admin';

    // Fetch current lock state
    const current = await query(
      'SELECT profile_locked FROM jtl.users WHERE id = $1', [req.user.id]
    );
    if (!current.rows.length) return res.status(404).json({ error: 'User not found' });

    if (current.rows[0].profile_locked && !isAdmin) {
      return res.status(403).json({
        error: 'Your name and email are already set and can only be changed by an administrator.',
      });
    }

    const trimmedName = (name || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });

    const normEmail = normaliseEmail(email);
    if (!normEmail) return res.status(400).json({ error: 'A valid email address is required' });

    // Non-admins lock their profile after the first successful save.
    const lock = isAdmin ? current.rows[0].profile_locked : true;

    const result = await query(
      `UPDATE jtl.users
         SET name = $1, username = $2, profile_locked = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, username, name, role, profile_locked`,
      [trimmedName, normEmail, lock, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already in use' });
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});
// GET /api/auth/users  (read-only list; full-access roles need it to assign project access)
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, name, role, is_active, profile_locked, created_at FROM jtl.users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// GET /api/auth/pending  (admin / senior test engineer) — self-registrations awaiting approval
router.get('/pending', verifyToken, requireUserAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, name, role, created_at
       FROM jtl.users
       WHERE pending_approval = true
       ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pending registrations' });
  }
});

// POST /api/auth/users/:id/approve  — activate a pending account
router.post('/users/:id/approve', verifyToken, requireUserAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE jtl.users
         SET is_active = true, pending_approval = false, updated_at = NOW()
       WHERE id = $1 AND pending_approval = true
       RETURNING id, username, name, role, is_active`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pending registration not found' });
    res.json({ message: 'User approved and activated', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve user' });
  }
});

// POST /api/auth/users/:id/reject  — delete a pending registration
router.post('/users/:id/reject', verifyToken, requireUserAdmin, async (req, res) => {
  try {
    const result = await query(
      `DELETE FROM jtl.users WHERE id = $1 AND pending_approval = true RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Pending registration not found' });
    res.json({ message: 'Registration rejected and removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject registration' });
  }
});

// POST /api/auth/users  (admin / senior test engineer only)
router.post('/users', verifyToken, requireUserAdmin, async (req, res) => {
  try {
    const { username, name, password, role } = req.body;
    if (!username || !name || !role)
      return res.status(400).json({ error: 'name, username (email), and role are required' });
    if (!VALID_ROLES.includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const email = normaliseEmail(username);
    if (!email) return res.status(400).json({ error: 'Username must be a valid email address' });

    const trimmedName = name.trim();
    if (!trimmedName) return res.status(400).json({ error: 'Name is required' });

    // Password is optional — defaults to Test@123 when left blank.
    const pwd = (password && password.length) ? password : DEFAULT_PASSWORD;
    const hash = await bcrypt.hash(pwd, 12);

    const result = await query(
      `INSERT INTO jtl.users (username, name, password, role, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, role, created_at`,
      [email, trimmedName, hash, role, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/auth/users/:id  (admin / senior test engineer only)
router.put('/users/:id', verifyToken, requireUserAdmin, async (req, res) => {
  try {
    const { name, username, role, is_active, password } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (role) {
      if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
      updates.push(`role = $${idx++}`); values.push(role);
    }
    if (name !== undefined) {
      const trimmedName = (name || '').trim();
      if (!trimmedName) return res.status(400).json({ error: 'Name cannot be empty' });
      updates.push(`name = $${idx++}`); values.push(trimmedName);
    }
    if (username !== undefined) {
      const email = normaliseEmail(username);
      if (!email) return res.status(400).json({ error: 'Username must be a valid email address' });
      updates.push(`username = $${idx++}`); values.push(email);
    }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password = $${idx++}`); values.push(hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    // Revoke the target user's existing sessions when an admin changes their
    // password or disables the account.
    if (password || is_active === false) {
      updates.push(`token_version = token_version + 1`);
    }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE jtl.users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, name, role, is_active`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    // If the role was changed to a global role (which already sees every
    // project), remove any now-redundant per-project membership rows so the
    // user no longer appears in Project Access.
    const GLOBAL = ['admin', 'senior_test_engineer', 'manager', 'tester'];
    if (role && GLOBAL.includes(role)) {
      await query('DELETE FROM jtl.project_members WHERE user_id = $1', [req.params.id]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already in use' });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/auth/users/:id  (admin / senior test engineer only, cannot delete self)
router.delete('/users/:id', verifyToken, requireUserAdmin, async (req, res) => {
  if (req.params.id === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    await query('DELETE FROM jtl.users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
