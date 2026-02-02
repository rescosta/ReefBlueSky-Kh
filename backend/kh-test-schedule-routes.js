// kh-test-schedule-routes.js
// Endpoints de agendamento automático de testes de KH
// Similar ao padrão de dosagem da dosadora

const express = require('express');
const router = express.Router();

// ==============================================================================
// HELPER: Calcular próximo teste baseado no intervalo
// ==============================================================================
function calculateNextTestTime(lastTestTime, intervalHours) {
  const now = Date.now();

  // Converter BigInt para Number se necessário
  const lastTestMs = lastTestTime ? Number(lastTestTime) : 0;

  if (!lastTestMs || lastTestMs <= 0) {
    // Se nunca testou, agendar para agora + intervalo
    return now + (intervalHours * 60 * 60 * 1000);
  }

  // Próximo teste = último teste + intervalo
  const nextTest = lastTestMs + (intervalHours * 60 * 60 * 1000);

  // Se o próximo teste já passou (intervalo foi aumentado), agendar para agora
  return nextTest < now ? now : nextTest;
}

// ==============================================================================
// HELPER: Buscar última medição de KH do device
// ==============================================================================
async function getLastMeasurement(pool, deviceId) {
  const rows = await pool.query(
    `SELECT timestamp, kh, status, confidence
     FROM measurements
     WHERE deviceId = ?
       AND status = 'ok'
     ORDER BY timestamp DESC
     LIMIT 1`,
    [deviceId]
  );

  if (rows.length > 0) {
    const row = rows[0];
    // Converter BigInt para Number
    return {
      timestamp: Number(row.timestamp),
      kh: row.kh,
      status: row.status,
      confidence: row.confidence
    };
  }

  return null;
}

module.exports = (pool, verifyToken, authUserMiddleware) => {

  // ============================================================================
  // USER ENDPOINTS - Configurar agendamento de testes
  // ============================================================================

  /**
   * GET /api/v1/user/devices/:deviceId/test-schedule
   * Buscar configuração de agendamento de testes
   */
  router.get('/api/v1/user/devices/:deviceId/test-schedule', authUserMiddleware, async (req, res) => {
    const { deviceId } = req.params;
    const userId = req.user.userId;

    try {
      // Verificar se device pertence ao usuário
      const devices = await pool.query(
        'SELECT * FROM devices WHERE deviceId = ? AND userId = ?',
        [deviceId, userId]
      );

      if (devices.length === 0) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }

      // Buscar configuração de agendamento
      const schedules = await pool.query(
        `SELECT
          interval_hours,
          next_test_time,
          last_test_time,
          last_test_status,
          last_test_error,
          auto_enabled
        FROM kh_test_schedule
        WHERE deviceId = ?`,
        [deviceId]
      );

      console.log('[TEST-SCHEDULE] Query result:', { deviceId, count: schedules ? schedules.length : 0 });

      if (!schedules || schedules.length === 0) {
        // Criar registro padrão se não existir
        console.log('[TEST-SCHEDULE] Creating default schedule for device:', deviceId);
        await pool.query(
          `INSERT INTO kh_test_schedule (deviceId, interval_hours, auto_enabled)
           VALUES (?, 24, 1)`,
          [deviceId]
        );

        return res.json({
          success: true,
          data: {
            interval_hours: 24,
            next_test_time: null,
            last_test_time: null,
            last_test_status: 'pending',
            last_test_error: null,
            auto_enabled: true
          }
        });
      }

      const schedule = schedules[0];

      if (!schedule) {
        console.error('[TEST-SCHEDULE] ERROR: schedule is undefined even though array has length:', schedules.length);
        throw new Error('Schedule data is malformed');
      }

      // Buscar última medição para exibir no frontend
      const lastMeasurement = await getLastMeasurement(pool, deviceId);

      res.json({
        success: true,
        data: {
          interval_hours: schedule.interval_hours,
          next_test_time: schedule.next_test_time ? Number(schedule.next_test_time) : null,
          last_test_time: schedule.last_test_time ? Number(schedule.last_test_time) : null,
          last_test_status: schedule.last_test_status,
          last_test_error: schedule.last_test_error,
          auto_enabled: !!schedule.auto_enabled,
          last_measurement: lastMeasurement ? {
            timestamp: lastMeasurement.timestamp,
            kh: lastMeasurement.kh,
            confidence: lastMeasurement.confidence
          } : null
        }
      });

    } catch (error) {
      console.error('Error fetching test schedule:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * PUT /api/v1/user/devices/:deviceId/test-schedule
   * Configurar intervalo de testes automáticos
   */
  router.put('/api/v1/user/devices/:deviceId/test-schedule', authUserMiddleware, async (req, res) => {
    const { deviceId } = req.params;
    const userId = req.user.userId;
    const { interval_hours, auto_enabled } = req.body;

    try {
      // Verificar se device pertence ao usuário
      const devices = await pool.query(
        'SELECT * FROM devices WHERE deviceId = ? AND userId = ?',
        [deviceId, userId]
      );

      if (devices.length === 0) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }

      // Validar intervalo (mínimo 1h, máximo 168h = 1 semana)
      if (interval_hours !== undefined) {
        if (typeof interval_hours !== 'number' || interval_hours < 1 || interval_hours > 168) {
          return res.status(400).json({
            success: false,
            message: 'interval_hours deve estar entre 1 e 168 horas'
          });
        }
      }

      // Buscar configuração atual
      const schedules = await pool.query(
        'SELECT * FROM kh_test_schedule WHERE deviceId = ?',
        [deviceId]
      );

      let nextTestTime = null;
      let lastTestTime = null;

      if (schedules.length > 0) {
        lastTestTime = schedules[0].last_test_time;
      }

      // Se não tem último teste, buscar última medição
      if (!lastTestTime) {
        const lastMeasurement = await getLastMeasurement(pool, deviceId);
        if (lastMeasurement) {
          lastTestTime = lastMeasurement.timestamp;
        }
      }

      // Recalcular próximo teste se intervalo mudou
      if (interval_hours !== undefined) {
        nextTestTime = calculateNextTestTime(lastTestTime, interval_hours);
      }

      // Montar update
      const updates = [];
      const values = [];

      if (interval_hours !== undefined) {
        updates.push('interval_hours = ?');
        values.push(interval_hours);

        if (nextTestTime !== null) {
          updates.push('next_test_time = ?');
          values.push(nextTestTime);
        }
      }

      if (auto_enabled !== undefined) {
        updates.push('auto_enabled = ?');
        values.push(auto_enabled ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum campo para atualizar'
        });
      }

      values.push(deviceId);

      // Atualizar ou inserir
      if (schedules.length > 0) {
        await pool.query(
          `UPDATE kh_test_schedule SET ${updates.join(', ')} WHERE deviceId = ?`,
          values
        );
      } else {
        // Criar novo registro
        const newInterval = interval_hours !== undefined ? interval_hours : 24;
        const newEnabled = auto_enabled !== undefined ? (auto_enabled ? 1 : 0) : 1;
        const newNextTest = nextTestTime || calculateNextTestTime(lastTestTime, newInterval);

        await pool.query(
          `INSERT INTO kh_test_schedule
           (deviceId, interval_hours, next_test_time, auto_enabled)
           VALUES (?, ?, ?, ?)`,
          [deviceId, newInterval, newNextTest, newEnabled]
        );
      }

      // Retornar configuração atualizada
      const updated = await pool.query(
        `SELECT
          interval_hours,
          next_test_time,
          last_test_time,
          last_test_status,
          auto_enabled
        FROM kh_test_schedule
        WHERE deviceId = ?`,
        [deviceId]
      );

      const result = updated[0];
      res.json({
        success: true,
        message: 'Test schedule updated successfully',
        data: {
          interval_hours: result.interval_hours,
          next_test_time: result.next_test_time ? Number(result.next_test_time) : null,
          last_test_time: result.last_test_time ? Number(result.last_test_time) : null,
          last_test_status: result.last_test_status,
          auto_enabled: !!result.auto_enabled
        }
      });

    } catch (error) {
      console.error('Error updating test schedule:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ============================================================================
  // DEVICE ENDPOINTS - ESP32 buscar/reportar testes
  // ============================================================================

  /**
   * GET /api/v1/device/next-test
   * ESP32 busca próximo teste agendado
   */
  router.get('/api/v1/device/next-test', verifyToken, async (req, res) => {
    const deviceId = req.device.deviceId;

    try {
      const schedules = await pool.query(
        `SELECT
          interval_hours,
          next_test_time,
          last_test_time,
          last_test_status,
          auto_enabled
        FROM kh_test_schedule
        WHERE deviceId = ?`,
        [deviceId]
      );

      if (schedules.length === 0) {
        // Criar registro padrão
        const now = Date.now();
        const nextTest = now + (24 * 60 * 60 * 1000); // 24h

        await pool.query(
          `INSERT INTO kh_test_schedule
           (deviceId, interval_hours, next_test_time, auto_enabled)
           VALUES (?, 24, ?, 1)`,
          [deviceId, nextTest]
        );

        return res.json({
          success: true,
          data: {
            should_test_now: false,
            next_test_time: nextTest,
            interval_hours: 24,
            auto_enabled: true
          }
        });
      }

      const schedule = schedules[0];
      const now = Date.now();

      // Converter BigInt para Number
      const nextTestTime = schedule.next_test_time ? Number(schedule.next_test_time) : null;

      // Verificar se deve testar agora
      const shouldTestNow =
        schedule.auto_enabled &&
        nextTestTime &&
        nextTestTime <= now &&
        schedule.last_test_status !== 'running';

      // Se deve testar, marcar status como 'running'
      if (shouldTestNow) {
        await pool.query(
          `UPDATE kh_test_schedule
           SET last_test_status = 'running'
           WHERE deviceId = ?`,
          [deviceId]
        );
      }

      res.json({
        success: true,
        data: {
          should_test_now: shouldTestNow,
          next_test_time: nextTestTime,
          interval_hours: schedule.interval_hours,
          auto_enabled: !!schedule.auto_enabled
        }
      });

    } catch (error) {
      console.error('Error fetching next test:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/device/test-result
   * ESP32 reporta resultado do teste (sucesso ou erro)
   */
  router.post('/api/v1/device/test-result', verifyToken, async (req, res) => {
    const deviceId = req.device.deviceId;
    const { success, error, timestamp, kh, phref, phsample, temperature, confidence } = req.body;

    try {
      const schedules = await pool.query(
        'SELECT interval_hours FROM kh_test_schedule WHERE deviceId = ?',
        [deviceId]
      );

      if (schedules.length === 0) {
        return res.status(404).json({ success: false, message: 'Test schedule not found' });
      }

      const intervalHours = schedules[0].interval_hours;
      const testTime = timestamp || Date.now();

      if (success) {
        // Teste bem-sucedido

        // Calcular próximo teste
        const nextTest = testTime + (intervalHours * 60 * 60 * 1000);

        // Atualizar agendamento
        await pool.query(
          `UPDATE kh_test_schedule
           SET last_test_time = ?,
               next_test_time = ?,
               last_test_status = 'success',
               last_test_error = NULL
           WHERE deviceId = ?`,
          [testTime, nextTest, deviceId]
        );

        // Se veio com dados da medição, inserir no banco
        if (kh !== undefined) {
          await pool.query(
            `INSERT INTO measurements
             (deviceId, timestamp, kh, phref, phsample, temperature, status, confidence)
             VALUES (?, ?, ?, ?, ?, ?, 'ok', ?)`,
            [deviceId, testTime, kh, phref || null, phsample || null, temperature || null, confidence || 1.0]
          );
        }

        res.json({
          success: true,
          message: 'Test result recorded successfully',
          data: {
            next_test_time: nextTest,
            interval_hours: intervalHours
          }
        });

      } else {
        // Teste falhou

        // Reagendar para daqui 1 hora (retry rápido em caso de erro)
        const nextTest = Date.now() + (1 * 60 * 60 * 1000);

        await pool.query(
          `UPDATE kh_test_schedule
           SET last_test_status = 'error',
               last_test_error = ?,
               next_test_time = ?
           WHERE deviceId = ?`,
          [error || 'Unknown error', nextTest, deviceId]
        );

        res.json({
          success: true,
          message: 'Error recorded, test rescheduled',
          data: {
            next_test_time: nextTest,
            retry_in_hours: 1
          }
        });
      }

    } catch (error) {
      console.error('Error recording test result:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * GET /api/v1/device/config
   * ESP32 busca configurações do device (incluindo testMode)
   */
  router.get('/api/v1/device/config', verifyToken, async (req, res) => {
    const deviceId = req.device.deviceId;

    try {
      const devices = await pool.query(
        'SELECT testMode FROM devices WHERE deviceId = ?',
        [deviceId]
      );

      if (devices.length === 0) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }

      const testMode = !!devices[0].testMode;

      res.json({
        success: true,
        data: {
          testMode: testMode
        }
      });

    } catch (error) {
      console.error('Error fetching device config:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  /**
   * POST /api/v1/device/command
   * Enviar comando para o device (ex: ativar modo teste)
   */
  router.post('/api/v1/device/command', authUserMiddleware, async (req, res) => {
    const { deviceId, action, params } = req.body;
    const userId = req.user.userId;

    try {
      // Validar entrada
      if (!deviceId || !action) {
        return res.status(400).json({
          success: false,
          message: 'deviceId e action são obrigatórios'
        });
      }

      // Verificar se device pertence ao usuário
      const devices = await pool.query(
        'SELECT * FROM devices WHERE deviceId = ? AND userId = ?',
        [deviceId, userId]
      );

      if (devices.length === 0) {
        return res.status(404).json({ success: false, message: 'Device not found' });
      }

      // Processar comando baseado na action
      if (action === 'testmode') {
        const enabled = params && params.enabled ? 1 : 0;

        // Salvar estado do modo teste no device
        await pool.query(
          `UPDATE devices SET testMode = ? WHERE deviceId = ?`,
          [enabled, deviceId]
        );

        console.log(`[DEVICE-COMMAND] Modo teste ${enabled ? 'ATIVADO' : 'DESATIVADO'} para device ${deviceId}`);

        return res.json({
          success: true,
          message: `Modo teste ${enabled ? 'ativado' : 'desativado'} com sucesso`,
          data: {
            deviceId,
            action,
            testMode: !!enabled
          }
        });
      }

      // Outras actions podem ser adicionadas aqui futuramente
      return res.status(400).json({
        success: false,
        message: `Action '${action}' não reconhecida`
      });

    } catch (error) {
      console.error('Error processing device command:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  return router;
};
