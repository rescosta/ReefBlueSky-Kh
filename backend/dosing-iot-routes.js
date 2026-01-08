// dosing-iot-routes.js
const express = require('express');
const router = express.Router();
const pool = require('./db-pool'); 

/
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
/*async function notifyDosingAlert(userId, alertType, message) {
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
*/


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
              /*await notifyDosingAlert(pump[0].user_id, 'Container Low', `Bomba ${p.name} está com pouco volume.`);*/
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

module.exports = router;
