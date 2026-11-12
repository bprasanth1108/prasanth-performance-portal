const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required' });

    const result = await query(
      'SELECT * FROM jtl.users WHERE username = $1 AND is_active = true', [username]
    );
    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, role, created_at FROM jtl.users WHERE id = $1', [req.user.id]
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
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    if (currentPassword === newPassword)
      return res.status(400).json({ error: 'New password must be different from current password' });

    // Fetch current hash
    const result = await query('SELECT password FROM jtl.users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, result.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE jtl.users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hash, req.user.id]
    );
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});
// GET /api/auth/users  (admin only)
router.get('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, username, role, is_active, created_at FROM jtl.users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// POST /api/auth/users  (admin creates user)
router.post('/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ error: 'username, password, role required' });
    if (!['admin', 'senior_test_engineer', 'manager', 'tester', 'project_manager', 'developer'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO jtl.users (username, password, role, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, username, role, created_at`,
      [username, hash, role, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/auth/users/:id  (admin edits user role or status)
router.put('/users/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { role, is_active, password } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (role) { updates.push(`role = $${idx++}`); values.push(role); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      updates.push(`password = $${idx++}`); values.push(hash);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE jtl.users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, role, is_active`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/auth/users/:id  (admin only, cannot delete self)
router.delete('/users/:id', verifyToken, requireAdmin, async (req, res) => {
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
