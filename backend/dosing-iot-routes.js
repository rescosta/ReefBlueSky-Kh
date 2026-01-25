
//dosing-iot-routes.js

const { mailTransporter, ALERT_FROM, sendTelegramForUser } =
  require('./alerts-helpers');



// dosing-iot-routes.js
const express = require('express');
const router = express.Router();
const pool = require('./db-pool'); 

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
        text: message,
      });
    }
  } catch (err) {
    console.error('Error sending dosing alert email:', err);
  }

  // Telegram
  try {
    await sendTelegramForUser(
      userId,
      `🚨 *Dosadora* - ${alertType}\n${message}`
    );
  } catch (err) {
    console.error('Error sending Telegram dosing alert:', err);
  }
}




// ============================================
// ROTAS IoT (Para ESP - Sem JWT, com validação esp_uid)
// ============================================

// POST /v1/iot/dosing/handshake
// ESP contacta servidor pela primeira vez
router.post('/v1/iot/dosing/handshake', async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const esp_uid          = body.esp_uid || body.espUid;
    const hw_type          = body.hw_type || body.hwType || 'ESP32';
    const firmware_version = body.firmware_version || body.firmwareVersion || '1.0.0';

    if (!esp_uid) {
      console.warn('[DOSING IOT] handshake sem esp_uid. Body=', body);
      return res.status(400).json({ success: false, error: 'Missing esp_uid' });
    }

    conn = await pool.getConnection();
    
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

    // cria 6 bombas padrão
    const pumps = [];
    const pumpNames = ['KH', 'Cálcio', 'Magnésio', 'Iodo', 'Reserva 1', 'Reserva 2'];

    for (let i = 0; i < 6; i++) {
      pumps.push([
        deviceId,
        pumpNames[i],
        i,      // index_on_device 0..5
        500,    // container_volume_ml
        500,    // current_volume_ml
        10,     // alarm_threshold_pct
        1.0,    // calibration_rate_ml_s
        100     // max_daily_ml
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
    const body = req.body || {};
    const espUid = body.esp_uid || body.espUid;
    const uptime_s   = body.uptime_s;
    const signal_dbm = body.signal_dbm;
    const pumps      = body.pumps;

  console.log('[DOSING IOT] /status recebido de', espUid, 'uptime=', uptime_s, 'signal=', signal_dbm);


    if (!espUid) {
      console.warn('[DOSING IOT] status sem esp_uid. Body=', body);
      return res
        .status(400)
        .json({ success: false, error: 'esp_uid obrigatório' });
    }

    conn = await pool.getConnection();
    
    const device = await verifyIoTToken(espUid);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    await updateDosingDeviceStatus(device.id, true, req.ip);
    console.log('[DOSING IOT] device', device.id, 'marcado ONLINE em', new Date().toISOString());    

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
               AND created_at > DATE_SUB(NOW(), INTERVAL 4 HOUR) LIMIT 1`,
              [p.id]
            );
            if (!recent || recent.length === 0) {
              const msg = `Bomba ${p.name}: nível do recipiente abaixo de ${pump[0].alarm_threshold_pct}%`;

              await logDosingAlert(
                pump[0].user_id,
                device.id,
                p.id,
                'CONTAINER_LOW',
                msg
              );

              await notifyDosingAlert(
                pump[0].user_id,
                'Container Low',
                msg
              );
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


// POST /v1/iot/dosing/commands
// ESP busca comandos pendentes (fila device_commands, device_id = esp_uid)
router.post('/iot/dosing/commands', async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const espUid = body.esp_uid || body.espUid;

    if (!espUid) {
      console.warn('[DOSING IOT] /commands sem esp_uid. Body=', body);
      return res.status(400).json({ success: false, error: 'esp_uid obrigatório' });
    }

    const device = await verifyIoTToken(espUid);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    conn = await pool.getConnection();

    // Buscar comandos pendentes para este esp_uid
    const rows = await conn.query(
      `SELECT id, type, payload
         FROM devicecommands
        WHERE deviceId = ?
          AND status = 'pending'
        ORDER BY createdAt ASC
        LIMIT 5`,
      [espUid]
    );


    if (!rows || rows.length === 0) {
      return res.json({ success: true, commands: [] });
    }

    // Parse de payload (JSON) e montagem da resposta
    const commands = rows.map((r) => {
      let payload = null;
      if (r.payload != null) {
        if (typeof r.payload === 'string') {
          try {
            payload = JSON.parse(r.payload);
          } catch (e) {
            console.error('[DOSING IOT] Erro JSON.parse payload comando', r.id, e.message, r.payload);
            payload = null;
          }
        } else if (typeof r.payload === 'object') {
          payload = r.payload;
        }
      }

      return {
        id: Number(r.id),
        type: r.type,
        payload,
      };
    });

  // Marcar como "inprogress" para evitar duplicidade
  const ids = rows.map((r) => r.id);
    await conn.query(
      `UPDATE devicecommands
          SET status = 'inprogress', updatedAt = NOW()
        WHERE id IN (${ids.map(() => '?').join(',')})
          AND status = 'pending'`,
      ids
    );


    return res.json({ success: true, commands });
  } catch (err) {
    console.error('Error in dosing commands poll:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});


// POST /v1/iot/dosing/commands/complete
// ESP confirma conclusão de um comando
router.post('/iot/dosing/commands/complete', async (req, res) => {
  let conn;
  try {
    const body = req.body || {};
    const espUid       = body.esp_uid || body.espUid;
    const commandId    = body.command_id || body.commandId;
    const status       = body.status;        // 'done' | 'failed' (ou similar)
    const errorMessage = body.error_message || body.errorMessage || null;

    if (!espUid || !commandId || !status) {
      return res.status(400).json({
        success: false,
        error: 'esp_uid, command_id e status são obrigatórios',
      });
    }

    const device = await verifyIoTToken(espUid);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    conn = await pool.getConnection();

    const result = await conn.query(
      `UPDATE devicecommands
          SET status = ?, errorMessage = ?, updatedAt = NOW()
        WHERE id = ?
          AND deviceId = ?`,
      [status, errorMessage, commandId, espUid]
    );


    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Comando não encontrado para este device',
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Error in dosing commands complete:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    if (conn) conn.release();
  }
});


// POST /v1/iot/dosing/execution
// ESP reporta execução de dose
router.post('/v1/iot/dosing/execution', async (req, res) => {
  let conn;
  try {
    const {
      esp_uid,
      pump_id,
      scheduled_at,  // epoch em segundos
      executed_at,   // epoch em segundos (ou null)
      volume_ml,
      status,
      origin,
      error_code
    } = req.body;

    if (!esp_uid || !pump_id) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    conn = await pool.getConnection();

    const device = await verifyIoTToken(esp_uid);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const schedEpoch    = Number.isFinite(scheduled_at) ? scheduled_at : null;
    const executedEpoch = Number.isFinite(executed_at)  ? executed_at  : null;

    // Registrar execução (epoch direto → FROM_UNIXTIME)
    await conn.query(
      `INSERT INTO dosing_executions 
         (pump_id, scheduled_at, executed_at, volume_ml, status, origin, error_code)
       VALUES (
         ?, 
         ${schedEpoch    != null ? 'FROM_UNIXTIME(?)' : 'NULL'},
         ${executedEpoch != null ? 'FROM_UNIXTIME(?)' : 'NULL'},
         ?, ?, ?, ?
       )`,
      [
        pump_id,
        ...(schedEpoch    != null ? [schedEpoch]    : []),
        ...(executedEpoch != null ? [executedEpoch] : []),
        volume_ml,
        status,
        origin,
        error_code || null
      ]
    );

    // Se executou com sucesso, descontar do reservatório
    if (status === 'OK') {
      await conn.query(
        `UPDATE dosing_pumps
            SET current_volume_ml = GREATEST(0, current_volume_ml - ?)
          WHERE id = ?`,
        [volume_ml, pump_id]
      );
    }

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
