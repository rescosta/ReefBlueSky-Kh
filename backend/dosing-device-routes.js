const express = require('express');
const router = express.Router();
const pool = require('./db-pool');

// aqui só /commands
router.get('/commands', async (req, res) => {
  let conn;
  try {
    const { esp_uid } = req.query;
    if (!esp_uid) {
      return res.status(400).json({ success: false, error: 'esp_uid required' });
    }

    conn = await pool.getConnection();

    const rows = await conn.query(
      `SELECT id, type, payload
         FROM device_commands
        WHERE deviceId = ? AND status = 'pending'
        ORDER BY id ASC`,
      [esp_uid]
    );

    if (rows.length) {
      const ids = rows.map(r => r.id);
      await conn.query(
        `UPDATE device_commands
           SET status = 'processed', processed_at = NOW()
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    const commands = rows.map(r => ({
      id: r.id,
      type: r.type,
      payload: JSON.parse(r.payload || '{}'),
    }));

    return res.json({ success: true, commands });
  } catch (err) {
    console.error('Error fetching device commands:', err);
    return res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;

