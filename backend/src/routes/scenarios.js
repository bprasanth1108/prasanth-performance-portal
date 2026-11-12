const express = require('express');
const { query } = require('../db');
const { verifyToken, requireAdmin, requireManager, requireProjectAccess } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/scenarios
router.get('/', verifyToken, requireProjectAccess, async (req, res) => {
  try {
    const result = await query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM jtl.runs r WHERE r.scenario_id = s.id) AS run_count,
        (SELECT r.uploaded_at FROM jtl.runs r WHERE r.scenario_id = s.id ORDER BY r.uploaded_at DESC LIMIT 1) AS last_run_at
      FROM jtl.scenarios s
      WHERE s.project_id = $1
      ORDER BY s.created_at DESC
    `, [req.params.projectId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

// GET /api/projects/:projectId/scenarios/:id
router.get('/:id', verifyToken, requireProjectAccess, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM jtl.scenarios WHERE id = $1 AND project_id = $2',
      [req.params.id, req.params.projectId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Scenario not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch scenario' });
  }
});

// POST /api/projects/:projectId/scenarios  (manager+)
router.post('/', verifyToken, requireManager, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Scenario name is required' });
    const result = await query(
      `INSERT INTO jtl.scenarios (name, description, project_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || null, req.params.projectId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Scenario name already exists in this project' });
    res.status(500).json({ error: 'Failed to create scenario' });
  }
});

// PUT /api/projects/:projectId/scenarios/:id  (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await query(
      `UPDATE jtl.scenarios SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        updated_at = NOW()
       WHERE id = $3 AND project_id = $4 RETURNING *`,
      [name?.trim() || null, description !== undefined ? description : null, req.params.id, req.params.projectId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Scenario not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update scenario' });
  }
});

// DELETE /api/projects/:projectId/scenarios/:id  (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await query(
      'DELETE FROM jtl.scenarios WHERE id = $1 AND project_id = $2',
      [req.params.id, req.params.projectId]
    );
    res.json({ message: 'Scenario deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete scenario' });
  }
});

module.exports = router;
