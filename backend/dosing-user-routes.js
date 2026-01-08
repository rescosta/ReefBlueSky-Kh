// dosing-user-routes.js
const express = require('express');
const router = express.Router();
const pool = require('./db-pool'); // ou exporta o pool do server e importa aqui


// ============================================
// ROTAS FRONTEND (Requerem JWT)
// ============================================

// GET api/v1/user/dosing/devices
// Lista todos os devices dosadora do usuário
router.get('/devices', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    conn = await pool.getConnection();
    
    const devices = await conn.query(
      `SELECT 
        d.id, d.name, d.hw_type, d.esp_uid, d.firmware_version,
        d.online, d.last_seen, d.last_ip, d.timezone,
        (SELECT COUNT(*) FROM dosing_pumps WHERE device_id = d.id) as pump_count,
        (SELECT COUNT(*) FROM dosing_alerts WHERE device_id = d.id AND resolved_at IS NULL) as alert_count
       FROM dosing_devices d
       WHERE d.user_id = ?
       ORDER BY d.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: devices || []
    });
  } catch (err) {
    console.error('Error fetching dosing devices:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /devices
// Criar novo device dosadora (metadata; handshake ESP atribui)
router.post('/devices', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { name, hw_type, timezone } = req.body;


    if (!name || !['ESP8266', 'ESP32'].includes(hw_type)) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }

    conn = await pool.getConnection();

    // 1) cria o device
    const result = await conn.query(
      `INSERT INTO dosing_devices (user_id, name, hw_type, timezone, esp_uid)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, name, hw_type, timezone || 'America/Sao_Paulo', `pending-${Date.now()}`]
    );

    const deviceId = result.insertId;

    // 2) cria 5 bombas padrão P01..P05
    const pumps = [];
    for (let i = 0; i < 5; i++) {
      pumps.push([
        deviceId,
        `P0${i + 1}`, // nome inicial
        i,           // index_on_device 0..4
        500,         // container_volume_ml
        500,         // current_volume_ml
        10,          // alarm_threshold_pct
        1.0,         // calibration_rate_ml_s
        100          // max_daily_ml
      ]);
    }

    await conn.batch(
      `INSERT INTO dosing_pumps 
         (device_id, name, index_on_device,
          container_volume_ml, current_volume_ml,
          alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      pumps
    );

    res.status(201).json({
      success: true,
      data: { id: deviceId, name, hw_type }
    });
  } catch (err) {
    console.error('Error creating dosing device:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /v1/user/dosing/devices/:id
// Atualizar device (nome, timezone)
router.put('/devices/:id', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;    
    const { id } = req.params;
    const { name, timezone } = req.body;


    conn = await pool.getConnection();
    
    // Verificar propriedade
    const dev = await conn.query(
      `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!dev || dev.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    await conn.query(
      `UPDATE dosing_devices SET name = ?, timezone = ? WHERE id = ?`,
      [name, timezone, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating dosing device:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /v1/user/dosing/devices/:id
router.delete('/devices/:id', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { id } = req.params;

    conn = await pool.getConnection();
    const dev = await conn.query(
      `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!dev || dev.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    await conn.query(`DELETE FROM dosing_devices WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting dosing device:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== PUMPS =====

// GET /api/v1/user/dosing/pumps?deviceId=X
router.get('/pumps', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { deviceId } = req.query;

    conn = await pool.getConnection();
    
    const pumps = await conn.query(
      `SELECT p.*, d.user_id
       FROM dosing_pumps p
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE d.id = ? AND d.user_id = ?
       ORDER BY p.index_on_device ASC`,
      [deviceId, userId]
    );

    res.json({ success: true, data: pumps || [] });
  } catch (err) {
    console.error('Error fetching pumps:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/v1/user/dosing/pumps
// Criar bomba
router.post('/pumps', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;    
    const {
      device_id, name, index_on_device, container_volume_ml, 
      alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml
    } = req.body;

    conn = await pool.getConnection();
    
    // Verificar device
    const dev = await conn.query(
      `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      [device_id, userId]
    );
    if (!dev || dev.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const result = await conn.query(
      `INSERT INTO dosing_pumps 
        (device_id, name, index_on_device, container_volume_ml, current_volume_ml, 
         alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [device_id, name, index_on_device, container_volume_ml || 500, 
       container_volume_ml || 500, alarm_threshold_pct || 10, 
       calibration_rate_ml_s || 1.0, max_daily_ml || 1000]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Error creating pump:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/v1/user/dosing/pumps/:id
router.put('/pumps/:id', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { id } = req.params;
    const { 
      name, enabled, container_volume_ml, current_volume_ml, 
      alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml 
    } = req.body;


    conn = await pool.getConnection();
    
    // Verificar propriedade
    const pump = await conn.query(
      `SELECT p.id FROM dosing_pumps p
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE p.id = ? AND d.user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!pump || pump.length === 0) {
      return res.status(404).json({ success: false, error: 'Pump not found' });
    }

    await conn.query(
      `UPDATE dosing_pumps 
       SET name = ?, enabled = ?, container_volume_ml = ?, current_volume_ml = ?,
           alarm_threshold_pct = ?, calibration_rate_ml_s = ?, max_daily_ml = ?
       WHERE id = ?`,
      [name, enabled, container_volume_ml, current_volume_ml, 
       alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating pump:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== SCHEDULES =====

// GET /api/v1/user/dosing/schedules?pumpId=X
router.get('/schedules', async (req, res) => {
  let conn;
  try {
    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;


    const { pumpId } = req.query;


    conn = await pool.getConnection();
    
    const schedules = await conn.query(
      `SELECT s.* FROM dosing_schedules s
       JOIN dosing_pumps p ON s.pump_id = p.id
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE s.pump_id = ? AND d.user_id = ?
       ORDER BY s.start_time ASC`,
      [pumpId, userId]
    );

    res.json({ success: true, data: schedules || [] });
  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/v1/user/dosing/schedules
router.post('/schedules', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const {
      pump_id, enabled, days_mask, doses_per_day, 
      start_time, end_time, volume_per_day_ml
    } = req.body;

    conn = await pool.getConnection();
    
    // Verificar pump
    const pump = await conn.query(
      `SELECT p.id FROM dosing_pumps p
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE p.id = ? AND d.user_id = ? LIMIT 1`,
      [pump_id, userId]
    );
    if (!pump || pump.length === 0) {
      return res.status(404).json({ success: false, error: 'Pump not found' });
    }

    const result = await conn.query(
      `INSERT INTO dosing_schedules 
        (pump_id, enabled, days_mask, doses_per_day, start_time, end_time, volume_per_day_ml)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pump_id, enabled || 1, days_mask || 127, doses_per_day, 
       start_time, end_time, volume_per_day_ml]
    );

    res.status(201).json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/v1/user/dosing/schedules/:id
router.put('/schedules/:id', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { id } = req.params;
    const { enabled, days_mask, doses_per_day, start_time, end_time, volume_per_day_ml } = req.body;


    conn = await pool.getConnection();
    
    const sched = await conn.query(
      `SELECT s.id FROM dosing_schedules s
       JOIN dosing_pumps p ON s.pump_id = p.id
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE s.id = ? AND d.user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!sched || sched.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    await conn.query(
      `UPDATE dosing_schedules 
       SET enabled = ?, days_mask = ?, doses_per_day = ?, 
           start_time = ?, end_time = ?, volume_per_day_ml = ?
       WHERE id = ?`,
      [enabled, days_mask, doses_per_day, start_time, end_time, volume_per_day_ml, id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/v1/user/dosing/schedules/:id
router.delete('/schedules/:id', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;    
    const { id } = req.params;
  
    conn = await pool.getConnection();
    const sched = await conn.query(
      `SELECT s.id FROM dosing_schedules s
       JOIN dosing_pumps p ON s.pump_id = p.id
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE s.id = ? AND d.user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!sched || sched.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    await conn.query(`DELETE FROM dosing_schedules WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting schedule:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== MANUAL DOSE =====

// POST /api/v1/user/dosing/pumps/:id/dose
// Disparar uma dose manual
router.post('/pumps/:id/dose', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { id } = req.params;
    const { volume_ml } = req.body;


    if (!volume_ml || volume_ml <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid volume' });
    }

    conn = await pool.getConnection();
    
    // Buscar pump + device
    const pump = await conn.query(
      `SELECT p.id, p.device_id, p.calibration_rate_ml_s, d.online 
       FROM dosing_pumps p
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE p.id = ? AND d.user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!pump || pump.length === 0) {
      return res.status(404).json({ success: false, error: 'Pump not found' });
    }

    const p = pump[0];

    // Criar entry em dosing_executions
    const exec = await conn.query(
      `INSERT INTO dosing_executions 
        (pump_id, scheduled_at, volume_ml, status, origin)
       VALUES (?, NOW(), ?, 'PENDING', 'MANUAL')`,
      [id, volume_ml]
    );

    // Se device online, enviar comando via fila existente
    if (p.online) {
      await conn.query(
        `INSERT INTO device_commands (deviceId, type, payload, status)
         VALUES (?, ?, ?, 'pending')`,
        [
          (await conn.query(`SELECT esp_uid FROM dosing_devices WHERE id = ? LIMIT 1`, [p.device_id]))[0].esp_uid,
          'MANUAL_DOSE',
          JSON.stringify({ pump_id: p.id, volume_ml })
        ]
      );
    }

    res.json({ success: true, executionId: exec.insertId });
  } catch (err) {
    console.error('Error creating manual dose:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});

// ===== CALIBRAÇÃO =====

// POST /api/v1/user/dosing/pumps/:id/calibrate
router.post('/pumps/:id/calibrate', async (req, res) => {
  let conn;
  try {

    if (!req.user || !req.user.userId) {
      console.error('[Dosing] /devices sem req.user', req.user);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;

    const { id } = req.params;
    const { measured_volume_ml, run_seconds } = req.body;


    if (!measured_volume_ml || !run_seconds || measured_volume_ml <= 0 || run_seconds <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid calibration data' });
    }

    conn = await pool.getConnection();
    
    const pump = await conn.query(
      `SELECT p.id FROM dosing_pumps p
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE p.id = ? AND d.user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!pump || pump.length === 0) {
      return res.status(404).json({ success: false, error: 'Pump not found' });
    }

    const rateMLperSec = measured_volume_ml / run_seconds;

    await conn.query(
      `UPDATE dosing_pumps SET calibration_rate_ml_s = ? WHERE id = ?`,
      [rateMLperSec, id]
    );

    res.json({ success: true, calibration_rate_ml_s: rateMLperSec });
  } catch (err) {
    console.error('Error updating calibration:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});


module.exports = router;
