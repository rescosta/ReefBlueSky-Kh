const express = require('express');
const router = express.Router();

/**
 * Rotas para Logs da Dosadora
 */

// =============================================================================
// HELPER: Salvar log no banco
// =============================================================================

async function saveDosingLog(conn, {
  device_id,
  pump_id = null,
  schedule_id = null,
  log_type,
  log_level = 'INFO',
  message,
  details = null
}) {
  try {
    console.log('[Dosing Logs] Salvando log:', {
      device_id,
      pump_id,
      schedule_id,
      log_type,
      log_level,
      message
    });

    await conn.query(
      `INSERT INTO dosing_logs
       (device_id, pump_id, schedule_id, log_type, log_level, message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        device_id,
        pump_id,
        schedule_id,
        log_type,
        log_level,
        message,
        details ? JSON.stringify(details) : null
      ]
    );

    console.log('[Dosing Logs] ✅ Log salvo com sucesso!');
  } catch (err) {
    console.error('[Dosing Logs] ❌ Erro ao salvar log:', err);
    console.error('[Dosing Logs] Stack:', err.stack);
  }
}

// =============================================================================
// ROTAS
// =============================================================================

/**
 * GET /api/dosing-logs
 * Buscar logs da dosadora
 */
router.get('/', async (req, res) => {
  let conn;
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      device_id,
      pump_id,
      log_type,
      log_level,
      limit = 100,
      offset = 0
    } = req.query;

    conn = await req.db.getConnection();

    // Construir query dinamicamente
    let query = `
      SELECT
        l.id,
        l.device_id,
        l.pump_id,
        l.schedule_id,
        l.log_type,
        l.log_level,
        l.message,
        l.details,
        l.created_at,
        p.name as pump_name,
        d.esp_uid as device_identifier
      FROM dosing_logs l
      LEFT JOIN dosing_pumps p ON l.pump_id = p.id
      LEFT JOIN dosing_devices d ON l.device_id = d.id
      WHERE d.user_id = ?
    `;

    const params = [userId];

    if (device_id) {
      query += ` AND l.device_id = ?`;
      params.push(device_id);
    }

    if (pump_id) {
      query += ` AND l.pump_id = ?`;
      params.push(pump_id);
    }

    if (log_type) {
      query += ` AND l.log_type = ?`;
      params.push(log_type);
    }

    if (log_level) {
      query += ` AND l.log_level = ?`;
      params.push(log_level);
    }

    query += ` ORDER BY l.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const logs = await conn.query(query, params);

    // Parse JSON details (se for string; MariaDB pode já retornar como objeto)
    const logsFormatted = logs.map(log => ({
      ...log,
      details: log.details ? (typeof log.details === 'string' ? JSON.parse(log.details) : log.details) : null
    }));

    res.json({
      success: true,
      data: logsFormatted,
      count: logsFormatted.length
    });

  } catch (err) {
    console.error('[Dosing Logs] Erro ao buscar logs:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

/**
 * GET /api/dosing-logs/stats
 * Estatísticas dos logs
 */
router.get('/stats', async (req, res) => {
  let conn;
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { device_id, hours = 24 } = req.query;

    conn = await req.db.getConnection();

    let query = `
      SELECT
        l.log_type,
        l.log_level,
        COUNT(*) as count
      FROM dosing_logs l
      JOIN dosing_devices d ON l.device_id = d.id
      WHERE d.user_id = ?
        AND l.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    `;

    const params = [userId, parseInt(hours)];

    if (device_id) {
      query += ` AND l.device_id = ?`;
      params.push(device_id);
    }

    query += ` GROUP BY l.log_type, l.log_level`;

    const stats = await conn.query(query, params);

    res.json({
      success: true,
      data: stats,
      period_hours: parseInt(hours)
    });

  } catch (err) {
    console.error('[Dosing Logs] Erro ao buscar stats:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

/**
 * DELETE /api/dosing-logs
 * Limpar logs antigos (mais de 30 dias)
 */
router.delete('/cleanup', async (req, res) => {
  let conn;
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { days = 30 } = req.query;

    conn = await req.db.getConnection();

    const result = await conn.query(
      `DELETE l FROM dosing_logs l
       JOIN dosing_devices d ON l.device_id = d.id
       WHERE d.user_id = ?
         AND l.created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [userId, parseInt(days)]
    );

    res.json({
      success: true,
      message: `${result.affectedRows} logs removidos (mais de ${days} dias)`
    });

  } catch (err) {
    console.error('[Dosing Logs] Erro ao limpar logs:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  router,
  saveDosingLog
};
