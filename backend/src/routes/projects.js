const express = require('express');
const { query } = require('../db');
const {
  verifyToken, requireAdmin, requireManager,
  requireProjectAccess, GLOBAL_ROLES,
} = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

// Returns all project IDs accessible to a user (used in GET /)
async function getAccessibleProjectIds(userId, role) {
  if (GLOBAL_ROLES.includes(role)) return null; // null = all projects
  const result = await query(
    'SELECT project_id FROM jtl.project_members WHERE user_id = $1',
    [userId]
  );
  return result.rows.map(r => r.project_id);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/projects
router.get('/', verifyToken, async (req, res) => {
  try {
    const ids = await getAccessibleProjectIds(req.user.id, req.user.role);

    let sql, params;
    if (ids === null) {
      // Global roles: return all projects
      sql = `
        SELECT p.*, u.username AS created_by_name,
          (SELECT COUNT(*) FROM jtl.scenarios s WHERE s.project_id = p.id) AS scenario_count
        FROM jtl.projects p
        LEFT JOIN jtl.users u ON u.id = p.created_by
        ORDER BY p.created_at DESC
      `;
      params = [];
    } else if (ids.length === 0) {
      return res.json([]); // no access to any project
    } else {
      sql = `
        SELECT p.*, u.username AS created_by_name,
          (SELECT COUNT(*) FROM jtl.scenarios s WHERE s.project_id = p.id) AS scenario_count
        FROM jtl.projects p
        LEFT JOIN jtl.users u ON u.id = p.created_by
        WHERE p.id = ANY($1::uuid[])
        ORDER BY p.created_at DESC
      `;
      params = [ids];
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /projects error:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id
router.get('/:id', verifyToken, requireProjectAccess, async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, u.username AS created_by_name
      FROM jtl.projects p
      LEFT JOIN jtl.users u ON u.id = p.created_by
      WHERE p.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects  (creator roles only)
router.post('/', verifyToken, requireManager, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });
    const result = await query(
      `INSERT INTO jtl.projects (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || null, req.user.id]
    );
    const project = result.rows[0];

    // Auto-assign creator to the project (unless global role — they already see all)
    if (!GLOBAL_ROLES.includes(req.user.role)) {
      await query(
        `INSERT INTO jtl.project_members (project_id, user_id, assigned_by)
         VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
        [project.id, req.user.id]
      );
    }

    res.status(201).json(project);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project name already exists' });
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id  (admin/senior_test_engineer)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await query(
      `UPDATE jtl.projects SET name = COALESCE($1, name),
        description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [name?.trim() || null, description !== undefined ? description : null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project name already exists' });
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id  (admin/senior_test_engineer)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM jtl.projects WHERE id = $1', [req.params.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// ── Project Member Management ─────────────────────────────────────────────────

// GET /api/projects/:id/members  — list users assigned to this project
router.get('/:id/members', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT u.id, u.username, u.role, u.is_active, pm.assigned_at,
             ab.username AS assigned_by_name
      FROM jtl.project_members pm
      JOIN jtl.users u  ON u.id  = pm.user_id
      LEFT JOIN jtl.users ab ON ab.id = pm.assigned_by
      WHERE pm.project_id = $1
      ORDER BY pm.assigned_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch project members' });
  }
});

// POST /api/projects/:id/members  — assign a user to this project
router.post('/:id/members', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });

    // Verify the user exists
    const userCheck = await query('SELECT id, username, role FROM jtl.users WHERE id = $1', [user_id]);
    if (!userCheck.rows.length) return res.status(404).json({ error: 'User not found' });

    await query(
      `INSERT INTO jtl.project_members (project_id, user_id, assigned_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [req.params.id, user_id, req.user.id]
    );
    res.status(201).json({ message: 'User assigned to project', user: userCheck.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign user' });
  }
});

// DELETE /api/projects/:id/members/:userId  — remove a user from this project
router.delete('/:id/members/:userId', verifyToken, requireAdmin, async (req, res) => {
  try {
    await query(
      'DELETE FROM jtl.project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'User removed from project' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove user from project' });
  }
});

module.exports = router;
