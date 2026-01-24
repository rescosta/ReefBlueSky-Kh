const express = require('express');
const router = express.Router();
const pool = require('./db-pool');

console.log('[DOSER-ROUTES] dosing-device-routes carregado');

router.get('/commands', async (req, res) => {
  console.log('[DOSER] /iot/dosing/commands hit', req.query);

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

    const commands = (rows || []).map(r => {
      let payload = {};

      if (r.payload == null) {
        payload = {};
      } else if (typeof r.payload === 'string') {
        try {
          payload = JSON.parse(r.payload || '{}');
        } catch (e) {
          console.error('[CMD] JSON.parse error payload=', r.payload, e.message);
          payload = {};
        }
      } else if (typeof r.payload === 'object') {
        payload = r.payload;
      }

      return {
        id: r.id,
        type: r.type,
        payload,
      };
    });

    // marcar todos como processed de uma vez
  if (commands.length) {
    await conn.query(
      `UPDATE device_commands
         SET status = 'done',
             processed = 1
       WHERE deviceId = ? AND status = 'pending'`,
      [esp_uid]
    );
  }

    return res.json({ success: true, commands });
  } catch (err) {
    console.error('Error fetching device commands:', err);
    return res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});


module.exports = router;
