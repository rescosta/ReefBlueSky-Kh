
//dosing-iot-routes.js

const { mailTransporter, ALERT_FROM, sendTelegramForUser, sendEmailForUser } =
  require('./alerts-helpers');
const { getUserTimezone, getUserUtcOffsetSec, formatWithUserTimezone } = require('./user-timezone');
const { saveDosingLog } = require('./dosing-logs-routes');


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

// updateDosingDeviceStatus(deviceId, online, lastIp)
// - Atualiza dosing_devices.last_seen com NOW() em UTC.
// - last_seen é sempre UTC no banco; o dashboard converte para timezone
//   do usuário/device na hora de exibir (usando epoch ou helper de timezone).


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
async function notifyDosingAlert(userId, alertType, message, pumpId = null) {
  let conn;
  try {
    conn = await pool.getConnection();

    // Verificar se há alguma agenda desta bomba com notificações habilitadas
    let notify_email = false;
    let notify_telegram = false;

    if (pumpId) {
      const schedules = await conn.query(
        `SELECT notify_email, notify_telegram
         FROM dosing_schedules
         WHERE pump_id = ? AND enabled = 1
         LIMIT 10`,
        [pumpId]
      );

      // Se pelo menos UMA agenda tem notificação habilitada, enviar
      if (schedules && schedules.length > 0) {
        notify_email = schedules.some(s => s.notify_email === 1);
        notify_telegram = schedules.some(s => s.notify_telegram === 1);
      }
    } else {
      // Se não passou pumpId, assume que deve enviar (comportamento antigo)
      notify_email = true;
      notify_telegram = true;
    }

    // Email - enviar apenas se configurado
    if (notify_email) {
      try {
        await sendEmailForUser(
          userId,
          `[ReefBlueSky Dosadora] Alerta: ${alertType}`,
          `<p>${message}</p>`
        );
        console.log(`[Dosing Alert] Email enviado - User ${userId}, Pump ${pumpId}`);
      } catch (err) {
        console.error('Error sending dosing alert email:', err);
      }
    } else {
      console.log(`[Dosing Alert] Email NÃO enviado (desabilitado) - User ${userId}, Pump ${pumpId}`);
    }

    // Telegram - enviar apenas se configurado
    if (notify_telegram) {
      try {
        await sendTelegramForUser(
          userId,
          `🚨 *Dosadora* - ${alertType}\n${message}`
        );
        console.log(`[Dosing Alert] Telegram enviado - User ${userId}, Pump ${pumpId}`);
      } catch (err) {
        console.error('Error sending Telegram dosing alert:', err);
      }
    } else {
      console.log(`[Dosing Alert] Telegram NÃO enviado (desabilitado) - User ${userId}, Pump ${pumpId}`);
    }
  } catch (err) {
    console.error('Error in notifyDosingAlert:', err);
  } finally {
    if (conn) conn.release();
  }
}





// ============================================
// ROTAS IoT (Para ESP - Sem JWT, com validação esp_uid)
// ============================================

// POST /v1/iot/dosing/handshake
// - ESP envia esp_uid, hw_type, firmware_version.
// - Resposta:
//   - server_time: ISO 8601 em UTC (ex: "2026-01-26T21:04:07.976Z").
//   - device_id: ID interno da dosadora no backend.
//   - poll_interval_s: intervalo (segundos) para /status e /commands.
//   - pumps[].schedules[].start_time / end_time: strings "HH:MM" em horário LOCAL do aquário,
//     sem fuso; o firmware interpreta no timezone configurado no próprio device.

// ESP contacta servidor pela primeira vez
router.post('/handshake', async (req, res) => {
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

    // Buscar timezone e offset do usuário
    const userTimezone     = await getUserTimezone(userId);
    const userUtcOffsetSec = await getUserUtcOffsetSec(userId);


    // Buscar bombas e agendas
    const pumps = await conn.query(
      `SELECT 
        p.id, p.index_on_device, p.enabled, p.name, 
        p.calibration_rate_ml_s, p.current_volume_ml, p.max_daily_ml,
        GROUP_CONCAT(
          JSON_OBJECT(
            'id', s.id, 'enabled', s.enabled, 'days_mask', s.days_mask,
            'doses_per_day', s.doses_per_day, 'start_time', TIME_FORMAT(s.start_time, '%H:%i'),
            'end_time', TIME_FORMAT(s.end_time, '%H:%i'), 'volume_per_day_ml', s.volume_per_day_ml,
            'min_gap_minutes', s.min_gap_minutes, 'adjusted_times', s.adjusted_times
          )
        ) as schedules
       FROM dosing_pumps p
       LEFT JOIN dosing_schedules s ON p.id = s.pump_id AND s.enabled = 1
       WHERE p.device_id = ?
       GROUP BY p.id
       ORDER BY p.index_on_device ASC`,
      [deviceId]
    );

    const pumpData = pumps.map(p => {
      const schedules = p.schedules ? JSON.parse(`[${p.schedules}]`) : [];

      // [FIX] Calcular volumes individuais por dose para garantir total exato
      schedules.forEach(s => {
        const totalVolume = s.volume_per_day_ml || 0;
        const dosesPerDay = s.doses_per_day || 1;

        if (dosesPerDay > 0 && totalVolume > 0) {
          const doses = [];
          const base = totalVolume / dosesPerDay;      // 16.6666...
          let sum = 0;

          // N-1 doses arredondadas
          for (let i = 0; i < dosesPerDay - 1; i++) {
            const v = Math.round(base * 100) / 100;   // 2 casas (16.67)
            doses.push(v);
            sum += v;
          }

          // Última dose ajusta o resto para fechar totalVolume
          const lastDose = Math.round((totalVolume - sum) * 100) / 100; // 16.65
          doses.push(lastDose);

          s.dose_volumes = doses;
        } else {
          s.dose_volumes = [];
        }
      });


      return {
        id: p.id,
        index_on_device: p.index_on_device,
        enabled: !!p.enabled,
        name: p.name,
        calibration_rate_ml_s: parseFloat(p.calibration_rate_ml_s),
        current_volume_ml: p.current_volume_ml,
        max_daily_ml: p.max_daily_ml,
        schedules: schedules
      };
    });

    res.json({
      success: true,
      device_id: deviceId,
      server_time: new Date().toISOString(),
      poll_interval_s: 30,
      user_timezone: userTimezone,
      user_utc_offset_sec: userUtcOffsetSec,
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
router.post('/status', async (req, res) => {
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
                msg,
                p.id  // Passar pump_id
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
router.post('/commands', async (req, res) => {
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
router.post('/commands/complete', async (req, res) => {
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
// - ESP SEMPRE envia horários como EPOCH em segundos (UTC).
//   - scheduled_at: epoch do horário planejado da dose (ou null para MANUAL).
//   - executed_at: epoch do horário real da execução (ou null se não executou).
// - Backend grava em dosing_executions:
//   - scheduled_at / executed_at: DATETIME em UTC via FROM_UNIXTIME(epoch).
// - Campos adicionais:
//   - status: 'OK' | 'FAILED' | ... (estado final da dose).
//   - origin: 'AUTO' (agenda) | 'MANUAL' (front) | 'CALIBRATION' etc.
//   - error_code: string opcional com motivo da falha.

// ESP reporta execução de dose
router.post('/execution', async (req, res) => {
  let conn;
  try {
    const {
      esp_uid,
      pump_id,
      schedule_id,   
      scheduled_at,  // epoch em segundos
      executed_at,   // epoch em segundos (ou null)
      volume_ml,
      status,
      origin,
      error_code,
      doseindex
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
    const doseIndexNum = Number.isFinite(Number(doseindex))
      ? Number(doseindex)
      : null;

    await conn.query(
      `INSERT INTO dosing_executions 
         (pump_id, schedule_id, scheduled_at, executed_at,
          volume_ml, status, origin, error_code, doseindex)
       VALUES (
         ?, ?,
         ${schedEpoch    != null ? 'FROM_UNIXTIME(?)' : 'NULL'},
         ${executedEpoch != null ? 'FROM_UNIXTIME(?)' : 'NULL'},
         ?, ?, ?, ?, ?
       )`,
      [
        pump_id,
        schedule_id,
        ...(schedEpoch    != null ? [schedEpoch]    : []),
        ...(executedEpoch != null ? [executedEpoch] : []),
        volume_ml,
        status,
        origin,
        error_code || null,
        doseIndexNum              
      ]
    );

    // Salvar log da execução
    await saveDosingLog(conn, {
      device_id: device.id,
      pump_id: pump_id,
      schedule_id: schedule_id,
      log_type: 'EXECUTION',
      log_level: status === 'OK' ? 'INFO' : 'WARNING',
      message: `Dosagem ${status === 'OK' ? 'concluída' : status}: ${volume_ml}ml`,
      details: {
        status,
        volume_ml,
        origin,
        error_code,
        doseindex: doseIndexNum,
        scheduled_at: schedEpoch,
        executed_at: executedEpoch
      }
    });

    if (status === 'GUARD_VOLUME' || status === 'GUARD_DURATION') {
      const pumpInfo = await conn.query(
        `SELECT dp.name AS pump_name, dp.device_id, dd.user_id
           FROM dosing_pumps dp
           JOIN dosing_devices dd ON dp.device_id = dd.id
          WHERE dp.id = ?
          LIMIT 1`,
        [pump_id]
      );

      if (pumpInfo && pumpInfo.length > 0) {
        const info = pumpInfo[0];
        const msg =
          `Proteção de segurança acionada na bomba ${info.pump_name}. ` +
          `status=${status}, volume=${volume_ml} mL, ` +
          `schedule_id=${schedule_id || 'null'}, doseindex=${doseIndexNum || 'null'}, ` +
          `error_code=${error_code || 'none'}.`;

        await logDosingAlert(
          info.user_id,
          info.device_id,
          pump_id,
          status,           // tipo = 'GUARD_VOLUME' ou 'GUARD_DURATION'
          msg
        );

        await notifyDosingAlert(
          info.user_id,
          `Dosing ${status}`,
          msg,
          pump_id  // Passar pump_id
        );
      }

      // não tenta refazer dose aqui; apenas alerta e segue
    }


    // Se executou com sucesso, descontar do reservatório
    if (status === 'OK') {
      // 1) desconta volume
      await conn.query(
        `UPDATE dosing_pumps
            SET current_volume_ml = GREATEST(0, current_volume_ml - ?)
          WHERE id = ?`,
        [volume_ml, pump_id]
      );

      // 2) lê volume restante + dados do pump para alarme
      const pumpRow = await conn.query(
        `SELECT dp.current_volume_ml,
                dp.container_volume_ml,
                dp.alarm_threshold_pct,
                dp.name,
                dd.user_id
           FROM dosing_pumps dp
           JOIN dosing_devices dd ON dp.device_id = dd.id
          WHERE dp.id = ?
          LIMIT 1`,
        [pump_id]
      );

      let remainingVolume = null;
      if (pumpRow && pumpRow.length > 0) {
        const pInfo     = pumpRow[0];
        remainingVolume = pInfo.current_volume_ml;

        const threshold = pInfo.container_volume_ml * pInfo.alarm_threshold_pct / 100;
        if (remainingVolume <= threshold && remainingVolume > 0) {
          // Registrar alerta (mas evitar spam, igual /status)
          const recent = await conn.query(
            `SELECT id FROM dosing_alerts 
               WHERE pump_id = ?
                 AND type = 'CONTAINER_LOW'
                 AND resolved_at IS NULL
                 AND created_at > DATE_SUB(NOW(), INTERVAL 4 HOUR)
               LIMIT 1`,
            [pump_id]
          );

          if (!recent || recent.length === 0) {
            const msg = `Bomba ${pInfo.name}: nível do recipiente abaixo de ${pInfo.alarm_threshold_pct}%`;

            await logDosingAlert(
              pInfo.user_id,
              device.id,
              pump_id,
              'CONTAINER_LOW',
              msg
            );

            await notifyDosingAlert(
              pInfo.user_id,
              'Container Low',
              msg,
              pump_id  // Passar pump_id
            );
          }
        }
      }

      const remainingText = remainingVolume != null
        ? `\nVolume Reservatório: ${Number(remainingVolume).toFixed(2).replace('.', ',')} mL`
        : '';


      // [NOVO] Enviar notificações se habilitado na agenda
      if (origin === 'AUTO' && schedEpoch) {
        try {
          // Buscar pump e schedule info
          const pumpInfo = await conn.query(
            `SELECT dp.name as pump_name, dd.user_id,
                    ds.id as schedule_id, ds.doses_per_day,
                    ds.notify_telegram, ds.notify_email
             FROM dosing_pumps dp
             JOIN dosing_devices dd ON dp.device_id = dd.id
             LEFT JOIN dosing_schedules ds
                    ON ds.pump_id = dp.id
                   AND ds.id = ?
             WHERE dp.id = ?
             LIMIT 1`,
            [schedule_id, pump_id]
          );


          if (pumpInfo && pumpInfo.length > 0) {
            const info = pumpInfo[0];
            const userId = info.user_id;
            const shouldNotifyTelegram = !!info.notify_telegram;
            const shouldNotifyEmail = !!info.notify_email;

            if (shouldNotifyTelegram || shouldNotifyEmail) {
          


              const dosesPerDay = info.doses_per_day || 1;

              let doseNumber = doseIndexNum && doseIndexNum > 0
                ? Math.min(doseIndexNum, dosesPerDay)
                : 1;

              let doseInfo = `Dose ${doseNumber}/${dosesPerDay}`;

              if (!doseIndexNum || doseIndexNum <= 0) {
                try {
                  const rows = await conn.query(
                    `SELECT COUNT(*) AS count
                       FROM dosing_executions
                      WHERE pump_id = ?
                        AND schedule_id = ?
                        AND executed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
                        AND executed_at <= UTC_TIMESTAMP()
                        AND status = 'OK'
                        AND origin = 'AUTO'`,
                    [pump_id, schedule_id]
                  );
                  const rawCount = Number(rows?.[0]?.count ?? 0) + 1;
                  doseNumber = Math.min(rawCount, dosesPerDay);
                  doseInfo   = `Dose ${doseNumber}/${dosesPerDay}`;
                } catch (err) {
                  console.error('[NOTIFY] Erro ao contar doses:', err);
                }
              }





              // Buscar dados do usuário
              const userRows = await conn.query(
                `SELECT email, telegram_chat_id, telegram_bot_token, telegram_enabled, email_enabled
                 FROM users WHERE id = ? LIMIT 1`,
                [userId]
              );

              if (userRows && userRows.length > 0) {
                const user = userRows[0];
                const volumeText = Number(volume_ml).toFixed(2).replace('.', ',');
                const remainingText = remainingVolume != null
                  ? `\nVolume Reservatório: ${Number(remainingVolume).toFixed(2).replace('.', ',')} mL`
                  : '';

                // [FIX TIMEZONE] executedEpoch agora vem em UTC do ESP
                // Converter UTC → timezone do usuário para exibição
                const executedDate = new Date(executedEpoch * 1000);
                const executedTimeFormatted = await formatWithUserTimezone(userId, executedDate);

                console.log(`[NOTIFY] Timezone conversion: epoch=${executedEpoch}, UTC=${executedDate.toISOString()}, Local=${executedTimeFormatted}`);

                const message = `✅ Dosagem concluída!\n\n` +
                  `Bomba: ${info.pump_name}\n` +
                  `${doseInfo}\n` +
                  `Volume: ${volumeText} mL` +
                  `${remainingText}\n` +
                  `Horário: ${executedTimeFormatted}`;


                // Telegram
                if (shouldNotifyTelegram && user.telegram_enabled && user.telegram_chat_id && user.telegram_bot_token) {
                  try {
                    const telegramUrl = `https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`;
                    await fetch(telegramUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: user.telegram_chat_id,
                        text: message
                      })
                    });
                    console.log(`[NOTIFY] Telegram enviado para user ${userId} - ${executedTimeFormatted}`);

                    // Log: notificação telegram enviada
                    await saveDosingLog(conn, {
                      device_id: device.id,
                      pump_id: pump_id,
                      schedule_id: schedule_id,
                      log_type: 'NOTIFICATION',
                      log_level: 'INFO',
                      message: `Telegram enviado: ${doseInfo}`,
                      details: { channel: 'telegram', user_id: userId }
                    });
                  } catch (err) {
                    console.error('[NOTIFY] Erro ao enviar Telegram:', err);

                    // Log: erro ao enviar telegram
                    await saveDosingLog(conn, {
                      device_id: device.id,
                      pump_id: pump_id,
                      schedule_id: schedule_id,
                      log_type: 'ERROR',
                      log_level: 'ERROR',
                      message: `Erro ao enviar Telegram: ${err.message}`,
                      details: { channel: 'telegram', error: err.message }
                    });
                  }
                } else if (!shouldNotifyTelegram) {
                  // Log: telegram desabilitado na agenda
                  await saveDosingLog(conn, {
                    device_id: device.id,
                    pump_id: pump_id,
                    schedule_id: schedule_id,
                    log_type: 'NOTIFICATION',
                    log_level: 'DEBUG',
                    message: `Telegram NÃO enviado (desabilitado na agenda)`,
                    details: { channel: 'telegram', reason: 'disabled_in_schedule' }
                  });
                } else {
                  // Log: telegram não enviado por falta de configuração do usuário
                  const reasons = [];
                  if (!user.telegram_enabled) reasons.push('telegram_enabled=false');
                  if (!user.telegram_chat_id) reasons.push('chat_id ausente');
                  if (!user.telegram_bot_token) reasons.push('bot_token ausente');

                  await saveDosingLog(conn, {
                    device_id: device.id,
                    pump_id: pump_id,
                    schedule_id: schedule_id,
                    log_type: 'NOTIFICATION',
                    log_level: 'DEBUG',
                    message: `Telegram NÃO enviado (configuração incompleta do usuário)`,
                    details: { channel: 'telegram', reason: 'user_config_incomplete', missing: reasons.join(', ') }
                  });
                }

                // Email
                if (shouldNotifyEmail && user.email_enabled) {
                  try {
                    const emailSubject = `✅ Dosagem Concluída - ${info.pump_name} -> ${doseInfo} - ReefBlueSky`;

                    const volumeTextEmail = Number(volume_ml).toFixed(2).replace('.', ',');
                    const remainingHtml = remainingVolume != null
                      ? `<p style="margin: 10px 0;"><strong>Volume reservatório:</strong> ${Number(remainingVolume).toFixed(2).replace('.', ',')} mL</p>`
                      : '';

                    const emailBody = `
                      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #22c55e;">✅ Dosagem Concluída com Sucesso!</h2>
                        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                          <p style="margin: 10px 0;"><strong>Bomba:</strong> ${info.pump_name}</p>
                          <p style="margin: 10px 0;"><strong>${doseInfo}</strong></p>
                          <p style="margin: 10px 0;"><strong>Volume:</strong> ${volumeTextEmail} mL</p>
                          ${remainingHtml}
                          <p style="margin: 10px 0;"><strong>Horário:</strong> ${executedTimeFormatted}</p>
                        </div>
                        <p style="color: #6b7280; font-size: 12px;">
                          Esta é uma notificação automática do sistema ReefBlueSky.
                        </p>
                      </div>
                    `;

                    await sendEmailForUser(userId, emailSubject, emailBody);
                    console.log(`[NOTIFY] Email enviado para user ${userId} - ${doseInfo} - ${executedTimeFormatted}`);

                    // Log: notificação email enviada
                    await saveDosingLog(conn, {
                      device_id: device.id,
                      pump_id: pump_id,
                      schedule_id: schedule_id,
                      log_type: 'NOTIFICATION',
                      log_level: 'INFO',
                      message: `Email enviado: ${doseInfo}`,
                      details: { channel: 'email', user_id: userId, email: user.email }
                    });
                  } catch (err) {
                    console.error('[NOTIFY] Erro ao enviar Email:', err);

                    // Log: erro ao enviar email
                    await saveDosingLog(conn, {
                      device_id: device.id,
                      pump_id: pump_id,
                      schedule_id: schedule_id,
                      log_type: 'ERROR',
                      log_level: 'ERROR',
                      message: `Erro ao enviar Email: ${err.message}`,
                      details: { channel: 'email', error: err.message }
                    });
                  }
                } else if (shouldNotifyEmail && !user.email_enabled) {
                  console.log(`[NOTIFY] Email não enviado - email_enabled=0 para user ${userId}`);

                  // Log: email desabilitado no usuário
                  await saveDosingLog(conn, {
                    device_id: device.id,
                    pump_id: pump_id,
                    schedule_id: schedule_id,
                    log_type: 'NOTIFICATION',
                    log_level: 'DEBUG',
                    message: `Email NÃO enviado (desabilitado no usuário)`,
                    details: { channel: 'email', reason: 'disabled_in_user_settings' }
                  });
                } else if (!shouldNotifyEmail) {
                  // Log: email desabilitado na agenda
                  await saveDosingLog(conn, {
                    device_id: device.id,
                    pump_id: pump_id,
                    schedule_id: schedule_id,
                    log_type: 'NOTIFICATION',
                    log_level: 'DEBUG',
                    message: `Email NÃO enviado (desabilitado na agenda)`,
                    details: { channel: 'email', reason: 'disabled_in_schedule' }
                  });
                }
              }
            }
          }
        } catch (err) {
          console.error('[NOTIFY] Erro ao processar notificações:', err);
          // Não bloqueia o response principal
        }
      }
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
