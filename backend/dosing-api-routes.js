
// ============================================
// ReefBlueSky Dosing Module - API Routes
// ============================================

// dosing-api-routes.js
const express = require('express');
const router = express.Router();
const userRouter = express.Router();


// Dependências injetadas pelo server.js
let pool, mailTransporter, ALERT_FROM, sendTelegramForUser;
let routerAuthMiddleware = (req, res, next) => next();

function initDosingModule(deps) {
  pool = deps.pool;
  mailTransporter = deps.mailTransporter;
  ALERT_FROM = deps.ALERT_FROM;
  sendTelegramForUser = deps.sendTelegramForUser;
  routerAuthMiddleware = deps.authUserMiddleware || ((req, res, next) => next());

  console.log('[Dosing] initDosingModule: registrando auth em /v1/user/dosing');

  router.use('/v1/user/dosing', (req, res, next) => {
    console.log('[Dosing] middleware JWT em', req.method, req.originalUrl);
    routerAuthMiddleware(req, res, next);
  });
}




// ===== HELPER: Validar token IoT (para ESP) =====
async function verifyIoTToken(espUid) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT id FROM dosing_devices WHERE esp_uid = ? LIMIT 1`,
      [espUid]
    );
    return rows && rows.length > 0 ? rows[0] : null;
  } finally {
    if (conn) conn.release();
  }
}

// ===== HELPER: Registrar alerta =====
async function logDosingAlert(userId, deviceId, pumpId, type, message) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      `INSERT INTO dosing_alerts 
        (user_id, device_id, pump_id, type, message) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, deviceId, pumpId, type, message]
    );
    console.log(`Dosing alert logged: ${type} for user ${userId}`);
  } catch (err) {
    console.error('Error logging dosing alert:', err);
  } finally {
    if (conn) conn.release();
  }
}

// ===== HELPER: Atualizar status de device =====
async function updateDosingDeviceStatus(deviceId, online, lastIp = null) {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(
      `UPDATE dosing_devices 
       SET online = ?, last_seen = NOW(), last_ip = ? 
       WHERE id = ?`,
      [online ? 1 : 0, lastIp, deviceId]
    );
  } finally {
    if (conn) conn.release();
  }
}

// ===== HELPER: Enviar notificações de alerta =====
async function notifyDosingAlert(userId, alertType, message) {
  // Email
  try {
    const userRes = await pool.query(
      `SELECT email FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    if (userRes && userRes.length > 0) {
      await mailTransporter.sendMail({
        from: ALERT_FROM,
        to: userRes[0].email,
        subject: `[ReefBlueSky Dosadora] Alerta: ${alertType}`,
        html: `<p>${message}</p><p><a href="https://${process.env.DOMAIN}/dashboard?module=dosing">Ver detalhes</a></p>`,
      });
    }
  } catch (err) {
    console.error('Error sending dosing alert email:', err);
  }

  // Telegram (se configurado)
  try {
    await sendTelegramForUser(userId, `🚨 *Dosadora* - ${alertType}\n${message}`);
  } catch (err) {
    console.error('Error sending Telegram dosing alert:', err);
  }
}

// ============================================
// ROTAS FRONTEND (Requerem JWT)
// ============================================

// GET /v1/user/dosing/devices
// Lista todos os devices dosadora do usuário
router.get('/v1/user/dosing/devices', async (req, res) => {
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

// POST /v1/user/dosing/devices
// Criar novo device dosadora (metadata; handshake ESP atribui)
router.post('/v1/user/dosing/devices', async (req, res) => {
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
router.put('/v1/user/dosing/devices/:id', async (req, res) => {
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
router.delete('/v1/user/dosing/devices/:id', async (req, res) => {
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

// GET /v1/user/dosing/pumps?deviceId=X
router.get('/v1/user/dosing/pumps', async (req, res) => {
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

// POST /v1/user/dosing/pumps
// Criar bomba
router.post('/v1/user/dosing/pumps', async (req, res) => {
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

// PUT /v1/user/dosing/pumps/:id
router.put('/v1/user/dosing/pumps/:id', async (req, res) => {
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

// GET /v1/user/dosing/schedules?pumpId=X
router.get('/v1/user/dosing/schedules', async (req, res) => {
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

// POST /v1/user/dosing/schedules
router.post('/v1/user/dosing/schedules', async (req, res) => {
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

// PUT /v1/user/dosing/schedules/:id
router.put('/v1/user/dosing/schedules/:id', async (req, res) => {
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

// DELETE /v1/user/dosing/schedules/:id
router.delete('/v1/user/dosing/schedules/:id', async (req, res) => {
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

// POST /v1/user/dosing/pumps/:id/dose
// Disparar uma dose manual
router.post('/v1/user/dosing/pumps/:id/dose', async (req, res) => {
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

// POST /v1/user/dosing/pumps/:id/calibrate
router.post('/v1/user/dosing/pumps/:id/calibrate', async (req, res) => {
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

// ============================================
// ROTAS IoT (Para ESP - Sem JWT, com validação esp_uid)
// ============================================

// POST /v1/iot/dosing/handshake
// ESP contacta servidor pela primeira vez
router.post('/v1/iot/dosing/handshake', async (req, res) => {
  let conn;
  try {
    const { esp_uid, hw_type, firmware_version } = req.body;

    if (!esp_uid) {
      return res.status(400).json({ success: false, error: 'Missing esp_uid' });
    }

    conn = await pool.getConnection();
    
  // Buscar device por esp_uid
  let device = await conn.query(
    `SELECT id, user_id, online FROM dosing_devices WHERE esp_uid = ? LIMIT 1`,
    [esp_uid]
  );

  if (!device || device.length === 0) {
    // tentar descobrir dono na tabela principal (devices)
    const mainDev = await conn.query(
      `SELECT userId FROM devices WHERE deviceId = ? LIMIT 1`,
      [esp_uid]
    );
    if (!mainDev || mainDev.length === 0) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const userId = mainDev[0].userId;

    // cria dosing_device
    const devResult = await conn.query(
      `INSERT INTO dosing_devices (user_id, name, hw_type, timezone, esp_uid)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, `Dosadora ${esp_uid}`, hw_type || 'ESP32', 'America/Sao_Paulo', esp_uid]
    );
    const deviceId = devResult.insertId;

    // cria 5 bombas P01..P05
    const pumps = [];
    for (let i = 0; i < 5; i++) {
      pumps.push([
        deviceId,
        `P0${i + 1}`,
        i,
        500,
        500,
        10,
        1.0,
        100
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

    device = [{ id: deviceId, user_id: userId, online: 0 }];
  }

    const deviceId = device[0].id;
    const userId = device[0].user_id;

    // Atualizar firmware e status
    await conn.query(
      `UPDATE dosing_devices 
       SET firmware_version = ?, online = 1, last_seen = NOW()
       WHERE id = ?`,
      [firmware_version, deviceId]
    );

    // Buscar bombas e agendas
    const pumps = await conn.query(
      `SELECT 
        p.id, p.index_on_device, p.enabled, p.name, 
        p.calibration_rate_ml_s, p.current_volume_ml, p.max_daily_ml,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', s.id, 'enabled', s.enabled, 'days_mask', s.days_mask,
            'doses_per_day', s.doses_per_day, 'start_time', TIME_FORMAT(s.start_time, '%H:%i'),
            'end_time', TIME_FORMAT(s.end_time, '%H:%i'), 'volume_per_day_ml', s.volume_per_day_ml
          )
        ) as schedules
       FROM dosing_pumps p
       LEFT JOIN dosing_schedules s ON p.id = s.pump_id
       WHERE p.device_id = ?
       GROUP BY p.id
       ORDER BY p.index_on_device ASC`,
      [deviceId]
    );

    const pumpData = pumps.map(p => ({
      id: p.id,
      index_on_device: p.index_on_device,
      enabled: !!p.enabled,
      name: p.name,
      calibration_rate_ml_s: parseFloat(p.calibration_rate_ml_s),
      current_volume_ml: p.current_volume_ml,
      max_daily_ml: p.max_daily_ml,
      schedules: p.schedules ? JSON.parse(`[${p.schedules}]`) : []
    }));

    res.json({
      success: true,
      device_id: deviceId,
      server_time: new Date().toISOString(),
      poll_interval_s: 30,
      pumps: pumpData
    });
  } catch (err) {
    console.error('Error in dosing handshake:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /v1/iot/dosing/status
// ESP reporta status
router.post('/v1/iot/dosing/status', async (req, res) => {
  let conn;
  try {
    const { esp_uid, uptime_s, signal_dbm, pumps } = req.body;

    if (!esp_uid) {
      return res.status(400).json({ success: false, error: 'Missing esp_uid' });
    }

    conn = await pool.getConnection();
    
    const device = await verifyIoTToken(esp_uid);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    await updateDosingDeviceStatus(device.id, true, req.ip);

    // Atualizar volume atual de cada bomba
    if (pumps && Array.isArray(pumps)) {
      for (const p of pumps) {
        await conn.query(
          `UPDATE dosing_pumps SET current_volume_ml = ? WHERE id = ? AND device_id = ?`,
          [p.current_volume_ml, p.id, device.id]
        );

        // Verificar alarme de container baixo
        const pump = await conn.query(
          `SELECT container_volume_ml, alarm_threshold_pct, user_id 
           FROM dosing_pumps WHERE id = ? LIMIT 1`,
          [p.id]
        );
        if (pump && pump.length > 0) {
          const threshold = pump[0].container_volume_ml * pump[0].alarm_threshold_pct / 100;
          if (p.current_volume_ml <= threshold && p.current_volume_ml > 0) {
            // Registrar alerta (mas evitar spam)
            const recent = await conn.query(
              `SELECT id FROM dosing_alerts 
               WHERE pump_id = ? AND type = 'CONTAINER_LOW' AND resolved_at IS NULL
               AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR) LIMIT 1`,
              [p.id]
            );
            if (!recent || recent.length === 0) {
              await logDosingAlert(
                pump[0].user_id,
                device.id,
                p.id,
                'CONTAINER_LOW',
                `Bomba ${p.name}: nível do recipiente abaixo de ${pump[0].alarm_threshold_pct}%`
              );
              await notifyDosingAlert(pump[0].user_id, 'Container Low', `Bomba ${p.name} está com pouco volume.`);
            }
          }
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error in dosing status:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /v1/iot/dosing/execution
// ESP reporta execução de dose
router.post('/v1/iot/dosing/execution', async (req, res) => {
  let conn;
  try {
    const { esp_uid, pump_id, scheduled_at, executed_at, volume_ml, status, origin, error_code } = req.body;

    if (!esp_uid || !pump_id) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    conn = await pool.getConnection();
    
    const device = await verifyIoTToken(esp_uid);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // Registrar execução
    await conn.query(
      `INSERT INTO dosing_executions 
        (pump_id, scheduled_at, executed_at, volume_ml, status, origin, error_code)
       VALUES (?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?, ?, ?, ?)`,
      [pump_id, Math.floor(new Date(scheduled_at).getTime() / 1000), 
       executed_at ? Math.floor(new Date(executed_at).getTime() / 1000) : null,
       volume_ml, status, origin, error_code]
    );

    // Se falhou, log de erro
    if (status === 'FAILED') {
      const pump = await conn.query(
        `SELECT name, user_id FROM dosing_pumps WHERE id = ? LIMIT 1`,
        [pump_id]
      );
      if (pump && pump.length > 0) {
        await logDosingAlert(
          pump[0].user_id,
          device.id,
          pump_id,
          'PUMP_ERROR',
          `Bomba ${pump[0].name} falhou na dose: ${error_code || 'unknown error'}`
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error logging dosing execution:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});

console.log('[Dosing Module] Routes loaded successfully');

module.exports = {
  router,
  initDosingModule
};
