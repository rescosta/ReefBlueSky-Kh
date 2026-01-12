// dosing-user-routes.js - Rotas Frontend para Dosadora Balling
// Endpoints para dashboard-dosing.html - Integrado com ReefBlueSky

const express = require('express');
const router = express.Router();
const pool = require('./db-pool');

// ============================================
// MIDDLEWARE: Verificar JWT (deve estar antes de todas as rotas)
// ============================================
// Espera que server.js já tenha feito: app.use('/api/v1/user/dosing', authenticateJWT, dosingUserRoutes);

// ============================================
// DEVICES
// ============================================

// GET /api/v1/user/dosing/devices
// Lista todos os devices dosadora do usuário
router.get('/devices', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            console.error('[Dosing] GET /devices sem req.user');
            return res.status(401).json({ error: 'Unauthorized' });
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

        res.json({ data: devices || [] });
    } catch (err) {
        console.error('Error fetching dosing devices:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// POST /api/v1/user/dosing/devices
// Criar novo device dosadora
router.post('/devices', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { name, hw_type, timezone } = req.body;

        if (!name || !['ESP8266', 'ESP32', 'ESP32-C6'].includes(hw_type)) {
            return res.status(400).json({ error: 'Invalid input' });
        }

        conn = await pool.getConnection();

        // Criar device
        const result = await conn.query(
            `INSERT INTO dosing_devices (user_id, name, hw_type, timezone, esp_uid)
            VALUES (?, ?, ?, ?, ?)`,
            [userId, name, hw_type, timezone || 'America/Sao_Paulo', `pending-${Date.now()}`]
        );

        const deviceId = result.insertId;

        // Criar 6 bombas padrão (indices 0-5)
        const pumps = [];
        const pumpNames = ['KH', 'Cálcio', 'Magnésio', 'Iodo', 'Reserva 1', 'Reserva 2'];
        
        for (let i = 0; i < 6; i++) {
            pumps.push([
                deviceId,
                pumpNames[i],
                i,                      // index_on_device 0..5
                500,                    // container_volume_ml
                500,                    // current_volume_ml
                10,                     // alarm_threshold_pct
                1.0,                    // calibration_rate_ml_s
                100                     // max_daily_ml
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


        res.status(201).json({ data: { id: deviceId, name, hw_type } });
    } catch (err) {
        console.error('Error creating dosing device:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// PUT /api/v1/user/dosing/devices/:id
// Atualizar device (nome, timezone)
router.put('/devices/:id', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
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
            return res.status(404).json({ error: 'Device not found' });
        }

        await conn.query(
            `UPDATE dosing_devices SET name = ?, timezone = ? WHERE id = ?`,
            [name, timezone, id]
        );

        res.json({ data: { id, name, timezone } });
    } catch (err) {
        console.error('Error updating dosing device:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// DELETE /api/v1/user/dosing/devices/:id
router.delete('/devices/:id', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { id } = req.params;

        conn = await pool.getConnection();

        const dev = await conn.query(
            `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
            [id, userId]
        );

        if (!dev || dev.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        await conn.query(`DELETE FROM dosing_devices WHERE id = ?`, [id]);

        res.json({ data: { id } });
    } catch (err) {
        console.error('Error deleting dosing device:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// ============================================
// PUMPS
// ============================================

// GET /api/v1/user/dosing/devices/:deviceId/pumps
// Lista bombas de um device (NOVO PADRÃO)
router.get('/devices/:deviceId/pumps', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId } = req.params;

        conn = await pool.getConnection();

        // Verificar que o device pertence ao usuário
        const dev = await conn.query(
            `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
            [deviceId, userId]
        );

        if (!dev || dev.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Buscar todas as 6 bombas do device
        const pumps = await conn.query(
            `SELECT
                id, device_id, name, index_on_device, enabled,
                container_volume_ml, current_volume_ml,
                alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml,
                created_at
            FROM dosing_pumps
            WHERE device_id = ?
            ORDER BY index_on_device ASC`,
            [deviceId]
        );

        // Se retornou menos de 6, criar as faltantes (compatibilidade)
        if (pumps.length < 6) {
            const pumpNames = ['KH', 'Cálcio', 'Magnésio', 'Iodo', 'Reserva 1', 'Reserva 2'];
            const existingIndices = new Set(pumps.map(p => p.index_on_device));

            for (let i = 0; i < 6; i++) {
                if (!existingIndices.has(i)) {
                    const result = await conn.query(
                        `INSERT INTO dosing_pumps
                        (device_id, name, index_on_device,
                        container_volume_ml, current_volume_ml,
                        alarm_threshold_pct, calibration_rate_ml_s, max_daily_ml)
                        VALUES (?, ?, ?, 500, 500, 10, 1.0, 100)`,
                        [deviceId, pumpNames[i], i]
                    );

                    pumps.push({
                        id: result.insertId,
                        device_id: deviceId,
                        name: pumpNames[i],
                        index_on_device: i,
                        enabled: 1,
                        container_volume_ml: 500,
                        current_volume_ml: 500,
                        alarm_threshold_pct: 10,
                        calibration_rate_ml_s: 1.0,
                        max_daily_ml: 100,
                        created_at: new Date().toISOString()
                    });

                }
            }

            // Re-order
            pumps.sort((a, b) => a.index_on_device - b.index_on_device);
        }

        res.json({ data: pumps });
    } catch (err) {
        console.error('Error fetching pumps:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// PUT /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex
// Atualizar configuração de bomba pelo index (0-5)
router.put('/devices/:deviceId/pumps/:pumpIndex', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId, pumpIndex } = req.params;
        const {
            name, active, container_size, current_volume,
            alarm_percent, daily_max
        } = req.body;

        conn = await pool.getConnection();

        // Verificar device
        const dev = await conn.query(
            `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
            [deviceId, userId]
        );

        if (!dev || dev.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Buscar pump pelo index
        const pump = await conn.query(
            `SELECT id FROM dosing_pumps WHERE device_id = ? AND index_on_device = ? LIMIT 1`,
            [deviceId, pumpIndex]
        );

        if (!pump || pump.length === 0) {
            return res.status(404).json({ error: 'Pump not found' });
        }

        const pumpId = pump[0].id;

        // Atualizar
        await conn.query(
            `UPDATE dosing_pumps
            SET name = ?, enabled = ?, container_volume_ml = ?,
                current_volume_ml = ?, alarm_threshold_pct = ?, max_daily_ml = ?
            WHERE id = ?`,
            [name, active ? 1 : 0, container_size, current_volume, alarm_percent, daily_max, pumpId]
        );

        res.json({ data: { id: pumpId, name, active } });
    } catch (err) {
        console.error('Error updating pump:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// ============================================
// SCHEDULES
// ============================================

// GET /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules
// Lista agendas de uma bomba
router.get('/devices/:deviceId/pumps/:pumpIndex/schedules', async (req, res) => {
  let conn;
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.userId;
    const { deviceId, pumpIndex } = req.params;

    conn = await pool.getConnection();

    const dev = await conn.query(
      `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      [deviceId, userId]
    );
    if (!dev?.length) return res.status(404).json({ error: 'Device not found' });

    const pump = await conn.query(
      `SELECT id, name FROM dosing_pumps WHERE device_id = ? AND index_on_device = ? LIMIT 1`,
      [deviceId, pumpIndex]
    );
    if (!pump?.length) return res.status(404).json({ error: 'Pump not found' });

    const rows = await conn.query(
      `SELECT
         s.id, s.enabled, s.days_mask, s.doses_per_day,
         TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
         TIME_FORMAT(s.end_time,   '%H:%i') AS end_time,
         s.volume_per_day_ml, s.min_gap_minutes, s.adjusted_times
       FROM dosing_schedules s
       WHERE s.pump_id = ?
       ORDER BY s.start_time ASC`,
      [pump[0].id]
    );

    const data = rows.map(s => ({
      ...s,
      days_of_week: convertDaysMaskToArray(s.days_mask)
    }));

    res.json({ data });
  } catch (err) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});


// POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules
// Criar agenda
router.post('/devices/:deviceId/pumps/:pumpIndex/schedules', async (req, res) => {
  let conn;
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.userId;
    const { deviceId, pumpIndex } = req.params;
    const {
      doses_per_day,
      start_time,
      end_time,
      volume_per_day,
      days_of_week,
      min_gap_minutes = 30
    } = req.body;

    conn = await pool.getConnection();

    // Verificar device
    const dev = await conn.query(
      `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      [deviceId, userId]
    );
    if (!dev || dev.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Buscar pump
    const pump = await conn.query(
      `SELECT id, name FROM dosing_pumps WHERE device_id = ? AND index_on_device = ? LIMIT 1`,
      [deviceId, pumpIndex]
    );
    if (!pump || pump.length === 0) {
      return res.status(404).json({ error: 'Pump not found' });
    }

    const pumpRow = pump[0];

    // Montar dados para validação/ajuste
    const scheduleData = {
      pump_name: pumpRow.name,
      doses_per_day,
      start_time,
      end_time,
      volume_per_day_ml: volume_per_day,
      days_of_week,
      min_gap_minutes: parseInt(min_gap_minutes) || 30
    };

    const validatedSchedule = await validateAndAdjustSchedule(conn, deviceId, scheduleData);

    const daysMask = convertDaysArrayToMask(validatedSchedule.days_of_week || [0,1,2,3,4,5,6]);

    const result = await conn.query(
      `INSERT INTO dosing_schedules
       (pump_id, enabled, days_mask, doses_per_day, start_time, end_time,
        volume_per_day_ml, min_gap_minutes, adjusted_times)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pumpRow.id,
        daysMask,
        validatedSchedule.doses_per_day,
        validatedSchedule.start_time,
        validatedSchedule.end_time,
        validatedSchedule.volume_per_day_ml,
        validatedSchedule.min_gap_minutes,
        JSON.stringify(validatedSchedule.adjusted_times)
      ]
    );

    res.status(201).json({
      data: {
        id: result.insertId,
        ...validatedSchedule,
        days_of_week
      }
    });
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(400).json({ error: err.message || 'Validation failed' });
  } finally {
    if (conn) conn.release();
  }
});


router.put('/devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId, pumpIndex, scheduleId } = req.params;
        const { enabled, days_of_week, doses_per_day, start_time, end_time, volume_per_day_ml, min_gap_minutes } = req.body;

        conn = await pool.getConnection();

        // Verificar propriedade (código existente)
        const schedCheck = await conn.query(
            `SELECT s.id, p.name as pump_name
             FROM dosing_schedules s JOIN dosing_pumps p ON s.pump_id = p.id 
             JOIN dosing_devices d ON p.device_id = d.id
             WHERE s.id = ? AND p.index_on_device = ? AND d.id = ? AND d.user_id = ?`,
            [scheduleId, pumpIndex, deviceId, userId]
        );
        if (!schedCheck?.length) return res.status(404).json({ error: 'Schedule not found' });

        // ✅ REVALIDAR se alterou horários/doses
        if (doses_per_day || start_time || end_time || min_gap_minutes !== undefined) {
            const scheduleData = {
                pump_name: schedCheck[0].pump_name,
                id: scheduleId, // para excluir de conflitos
                doses_per_day,
                start_time,
                end_time,
                volume_per_day_ml,
                days_of_week,
                min_gap_minutes: parseInt(min_gap_minutes) || 30
            };
            const validatedSchedule = await validateAndAdjustSchedule(conn, deviceId, scheduleData);

            // Update completo
            const daysMask = convertDaysArrayToMask(validatedSchedule.days_of_week);
            await conn.query(
                `UPDATE dosing_schedules SET 
                   enabled = ?, days_mask = ?, doses_per_day = ?, start_time = ?, end_time = ?,
                   volume_per_day_ml = ?, min_gap_minutes = ?, adjusted_times = ?
                 WHERE id = ?`,
                [enabled ? 1 : 0, daysMask, validatedSchedule.doses_per_day, validatedSchedule.start_time,
                 validatedSchedule.end_time, validatedSchedule.volume_per_day_ml, validatedSchedule.min_gap_minutes,
                 JSON.stringify(validatedSchedule.adjusted_times), scheduleId]
            );

            res.json({ data: { id: scheduleId, ...validatedSchedule } });
        } else {
            // Apenas toggle enabled
            await conn.query(`UPDATE dosing_schedules SET enabled = ? WHERE id = ?`, [enabled ? 1 : 0, scheduleId]);
            res.json({ data: { id: scheduleId, enabled: enabled ? 1 : 0 } });
        }
    } catch (err) {
        console.error('Error updating schedule:', err);
        res.status(400).json({ error: err.message || 'Validation failed' });
    } finally {
        if (conn) conn.release();
    }
});


// DELETE /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId
// Deletar agenda
router.delete('/devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId, pumpIndex, scheduleId } = req.params;

        conn = await pool.getConnection();

        // Verificar propriedade
        const sched = await conn.query(
            `SELECT s.id FROM dosing_schedules s
            JOIN dosing_pumps p ON s.pump_id = p.id
            JOIN dosing_devices d ON p.device_id = d.id
            WHERE s.id = ? AND p.index_on_device = ? AND d.id = ? AND d.user_id = ? LIMIT 1`,
            [scheduleId, pumpIndex, deviceId, userId]
        );

        if (!sched || sched.length === 0) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        await conn.query(`DELETE FROM dosing_schedules WHERE id = ?`, [scheduleId]);

        res.json({ data: { id: scheduleId } });
    } catch (err) {
        console.error('Error deleting schedule:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// GET /api/v1/user/dosing/devices/:deviceId/schedules
// Lista todas as agendas de todas as bombas de um device
router.get('/devices/:deviceId/schedules', async (req, res) => {
  let conn;
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user.userId;
    const { deviceId } = req.params;

    conn = await pool.getConnection();

    // Garantir que o device é do usuário
    const dev = await conn.query(
      `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
      [deviceId, userId]
    );
    if (!dev || dev.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Buscar TODAS as agendas de TODAS as bombas desse device
    const rows = await conn.query(
      `SELECT
         s.id,
         s.pump_id,
         p.index_on_device   AS pump_index,
         p.name              AS pump_name,
         s.enabled,
         s.days_mask,
         s.doses_per_day,
         TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
         TIME_FORMAT(s.end_time,   '%H:%i') AS end_time,
         s.volume_per_day_ml,
         s.created_at
       FROM dosing_schedules s
       JOIN dosing_pumps p   ON s.pump_id = p.id
       WHERE p.device_id = ?
       ORDER BY p.index_on_device ASC, s.start_time ASC`,
      [deviceId]
    );

    const data = rows.map(s => ({
      ...s,
      days_of_week: convertDaysMaskToArray(s.days_mask)
    }));

    res.json({ data });
  } catch (err) {
    console.error('Error fetching all schedules:', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});



// ============================================
// MANUAL DOSE
// ============================================

// POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/manual
// Aplicar dose manual
router.post('/devices/:deviceId/pumps/:pumpIndex/manual', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId, pumpIndex } = req.params;
        const { volume } = req.body;

        if (!volume || volume <= 0) {
            return res.status(400).json({ error: 'Invalid volume' });
        }

        conn = await pool.getConnection();

        // Verificar device
        const dev = await conn.query(
            `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
            [deviceId, userId]
        );

        if (!dev || dev.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Buscar pump
        const pump = await conn.query(
            `SELECT id, name FROM dosing_pumps WHERE device_id = ? AND index_on_device = ? LIMIT 1`,
            [deviceId, pumpIndex]
        );

        if (!pump || pump.length === 0) {
            return res.status(404).json({ error: 'Pump not found' });
        }

        // Criar execução pendente
        const exec = await conn.query(
            `INSERT INTO dosing_executions
            (pump_id, scheduled_at, volume_ml, status, origin)
            VALUES (?, NOW(), ?, 'PENDING', 'MANUAL')`,
            [pump[0].id, volume]
        );

        res.json({
            data: {
                id: exec.insertId,
                pump_name: pump[0].name,
                volume,
                status: 'PENDING'
            }
        });
    } catch (err) {
        console.error('Error creating manual dose:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// ============================================
// CALIBRATION
// ============================================

// POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/calibrate/start
// Iniciar calibração (10s)
router.post('/devices/:deviceId/pumps/:pumpIndex/calibrate/start', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId, pumpIndex } = req.params;

        conn = await pool.getConnection();

        // Verificar device
        const dev = await conn.query(
            `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
            [deviceId, userId]
        );

        if (!dev || dev.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Buscar pump
        const pump = await conn.query(
            `SELECT id FROM dosing_pumps WHERE device_id = ? AND index_on_device = ? LIMIT 1`,
            [deviceId, pumpIndex]
        );

        if (!pump || pump.length === 0) {
            return res.status(404).json({ error: 'Pump not found' });
        }

        // Criar execução de calibração
      const exec = await conn.query(
        `INSERT INTO dosing_executions
         (pump_id, scheduled_at, volume_ml, status, origin)
         VALUES (?, NOW(), 60, 'PENDING', 'CALIBRATION')`,
        [pump[0].id]
      );

        res.json({ data: { executionId: exec.insertId, duration_s: 60 } });
    } catch (err) {
        console.error('Error starting calibration:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});

// POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/calibrate/save
// Salvar taxa de calibração
router.post('/devices/:deviceId/pumps/:pumpIndex/calibrate/save', async (req, res) => {
    let conn;
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = req.user.userId;
        const { deviceId, pumpIndex } = req.params;
        const { measured_volume } = req.body;

        if (!measured_volume || measured_volume <= 0) {
            return res.status(400).json({ error: 'Invalid measured volume' });
        }

        conn = await pool.getConnection();

        // Verificar device
        const dev = await conn.query(
            `SELECT id FROM dosing_devices WHERE id = ? AND user_id = ? LIMIT 1`,
            [deviceId, userId]
        );

        if (!dev || dev.length === 0) {
            return res.status(404).json({ error: 'Device not found' });
        }

        // Buscar pump
        const pump = await conn.query(
            `SELECT id FROM dosing_pumps WHERE device_id = ? AND index_on_device = ? LIMIT 1`,
            [deviceId, pumpIndex]
        );

        if (!pump || pump.length === 0) {
            return res.status(404).json({ error: 'Pump not found' });
        }

        // Calcular taxa: 10 segundos de dosagem = measured_volume mL
        const mlPerSecond = (measured_volume / 10).toFixed(2);

        // Atualizar pump com nova taxa
        await conn.query(
            `UPDATE dosing_pumps SET calibration_rate_ml_s = ? WHERE id = ?`,
            [mlPerSecond, pump[0].id]
        );

        res.json({ data: { ml_per_second: parseFloat(mlPerSecond) } });
    } catch (err) {
        console.error('Error saving calibration:', err);
        res.status(500).json({ error: 'Database error' });
    } finally {
        if (conn) conn.release();
    }
});


// POST /api/v1/user/dosing/pumps/:id/calibrate/abort
router.post('/pumps/:id/calibrate/abort', async (req, res) => {
  let conn;
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;
    const { id } = req.params;

    conn = await pool.getConnection();

    // Garantir que a bomba pertence ao usuário e pegar device
    const rows = await conn.query(
      `SELECT p.id, p.device_id, d.esp_uid, d.online
       FROM dosing_pumps p
       JOIN dosing_devices d ON p.device_id = d.id
       WHERE p.id = ? AND d.user_id = ? LIMIT 1`,
      [id, userId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pump not found' });
    }

    const pump = rows[0];

    if (!pump.online) {
      // ainda assim responde OK, só não enfileira comando
      return res.json({ success: true, info: 'Device offline, abort only local' });
    }

    // Enfileira comando de abortar calibração
    await conn.query(
      `INSERT INTO device_commands (deviceId, type, payload, status)
       VALUES (?, ?, ?, 'pending')`,
      [
        pump.esp_uid,
        'ABORT_CALIBRATION',
        JSON.stringify({ pump_id: pump.id })
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Error aborting calibration:', err);
    res.status(500).json({ success: false, error: 'Database error' });
  } finally {
    if (conn) conn.release();
  }
});


// ============================================
// HELPERS
// ============================================


async function validateAndAdjustSchedule(conn, deviceId, scheduleData) {
    const minGap = scheduleData.min_gap_minutes || 30;
    
    // Buscar agendas ativas EXCLUINDO esta (se update)
    const allSchedules = await conn.query(`
        SELECT s.*, p.name as pump_name, p.index_on_device
        FROM dosing_schedules s 
        JOIN dosing_pumps p ON s.pump_id = p.id 
        WHERE p.device_id = ? AND s.enabled = 1 
        ${scheduleData.id ? 'AND s.id != ?' : ''}
        ORDER BY p.index_on_device, s.start_time
    `, scheduleData.id ? [deviceId, scheduleData.id] : [deviceId]);
    
    // Calcular horários originais
    const originalTimes = calculateDoseTimes(scheduleData);
    let adjustedTimes = [...originalTimes];
    
    // Eventos existentes
    const existingEvents = [];
    allSchedules.forEach(s => {
        const times = JSON.parse(s.adjusted_times || '[]').length ? 
            JSON.parse(s.adjusted_times) : calculateDoseTimes(s);
        times.forEach(timeStr => {
            const minutes = parseTime(timeStr);
            existingEvents.push({ time: minutes, pump: s.pump_name });
        });
    });
    
    // Tentar ajustar
    if (tryAdjustIntermediateTimes(existingEvents, adjustedTimes, minGap)) {
        scheduleData.adjusted_times = adjustedTimes;
        return scheduleData;
    } else {
        throw new Error(`Impossível agendar sem intervalo ≥${minGap}min entre bombas. Sugestões: reduza doses, expanda horário ou aumente intervalo.`);
    }
}

//ok

function calculateDoseTimes(schedule) {
    const startMin = parseTime(schedule.start_time);
    const endMin = parseTime(schedule.end_time);
    const durationMin = Math.min((endMin - startMin + 1440) % 1440, 1440);
    const doses = parseInt(schedule.doses_per_day) || 1;
    
    const times = [startMin];
    if (doses >= 2) times.push(endMin);
    
    if (doses > 2) {
        const intermediateSlots = doses - 1;
        const gap = durationMin / intermediateSlots;
        for (let i = 1; i < doses - 1; i++) {
            times.splice(i, 0, startMin + gap * i);
        }
    }
    
    return times.map(t => formatTime(t % 1440));
}

function tryAdjustIntermediateTimes(existingEvents, newTimes, minGap) {
    const adjustableIndices = newTimes.length > 2 ? 
        Array.from({length: newTimes.length - 2}, (_, i) => 1 + i) : [];
    
    // Ordenar todos eventos
    const allEvents = [
        ...existingEvents.map(e => ({ time: e.time, isNew: false })),
        ...newTimes.map((t, i) => ({ time: parseTime(t), isNew: true, origIndex: i }))
    ].sort((a, b) => a.time - b.time);
    
    // Verificar conflitos atuais
    for (let i = 0; i < allEvents.length - 1; i++) {
        if (Math.abs(allEvents[i+1].time - allEvents[i].time) < minGap) {
            if (!allEvents[i].isNew && !allEvents[i+1].isNew) return false; // conflito fixo impossível
        }
    }
    
    // Se já ok, aceita
    return true;
    
    // TODO: implementar shifts iterativos se necessário (±10min steps)
}

function parseTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function formatTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

function convertDaysMaskToArray(mask) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        if (mask & (1 << i)) {
            days.push(i);
        }
    }
    return days;
}

function convertDaysArrayToMask(days) {
    let mask = 0;
    days.forEach(day => {
        mask |= (1 << day);
    });
    return mask;
}

module.exports = router;