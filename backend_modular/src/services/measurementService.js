/**
 * Measurement Service
 * Lógica de gerenciamento de medições
 */

const pool = require('../config/database');
const { validateKhValue, validatePh, validateTemperature } = require('../utils/validators');
const { calculateStats, calculateTrend, getDaysDifference } = require('../utils/helpers');
const logger = require('../utils/logger');

class MeasurementService {
  /**
   * Salva nova medição
   */
  async saveMeasurement(deviceId, khValue, phRef, phSample, temp, status = 'success') {
    if (!validateKhValue(khValue)) {
      throw new Error('Valor de KH inválido');
    }

    if (phRef !== null && !validatePh(phRef)) {
      throw new Error('Valor de pH referência inválido');
    }

    if (phSample !== null && !validatePh(phSample)) {
      throw new Error('Valor de pH amostra inválido');
    }

    if (temp !== null && !validateTemperature(temp)) {
      throw new Error('Valor de temperatura inválido');
    }

    let conn;
    try {
      conn = await pool.getConnection();

      const result = await conn.query(
        `INSERT INTO measurements (device_id, kh, ph_ref, ph_sample, temperature, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [deviceId, khValue, phRef, phSample, temp, status]
      );

      logger.info('Measurement saved', { deviceId, khValue, status });

      return {
        success: true,
        data: {
          id: result.insertId,
          deviceId,
          kh: khValue,
          phRef,
          phSample,
          temperature: temp,
          status
        }
      };
    } catch (err) {
      logger.error('Save measurement error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém medições do dispositivo
   */
  async getMeasurements(deviceId, userId, limit = 100, offset = 0) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se device pertence ao usuário
      const device = await conn.query(
        'SELECT id FROM devices WHERE device_id = ? AND user_id = ?',
        [deviceId, userId]
      );

      if (!device || device.length === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      // Buscar medições
      const rows = await conn.query(
        `SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at
         FROM measurements WHERE device_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [deviceId, limit, offset]
      );

      // Contar total
      const countRows = await conn.query(
        'SELECT COUNT(*) as total FROM measurements WHERE device_id = ?',
        [deviceId]
      );

      const total = countRows[0].total;

      return {
        success: true,
        data: rows,
        pagination: {
          limit,
          offset,
          total
        }
      };
    } catch (err) {
      logger.error('Get measurements error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém última medição
   */
  async getLatestMeasurement(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at
         FROM measurements WHERE device_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [deviceId]
      );

      if (!rows || rows.length === 0) {
        return {
          success: true,
          data: null
        };
      }

      return {
        success: true,
        data: rows[0]
      };
    } catch (err) {
      logger.error('Get latest measurement error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Calcula métricas de KH
   */
  async getKhMetrics(deviceId, userId, days = 7) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se device pertence ao usuário
      const device = await conn.query(
        'SELECT id FROM devices WHERE device_id = ? AND user_id = ?',
        [deviceId, userId]
      );

      if (!device || device.length === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      // Buscar medições dos últimos N dias
      const rows = await conn.query(
        `SELECT kh, created_at FROM measurements WHERE device_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY created_at DESC`,
        [deviceId, days]
      );

      if (!rows || rows.length === 0) {
        return {
          success: true,
          data: {
            min: null,
            max: null,
            avg: null,
            stdDev: null,
            trend: null,
            count: 0
          }
        };
      }

      const khValues = rows.map(r => r.kh);
      const stats = calculateStats(khValues);
      const trend = calculateTrend(khValues);

      return {
        success: true,
        data: {
          ...stats,
          trend,
          period: `${days} dias`
        }
      };
    } catch (err) {
      logger.error('Get KH metrics error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém medições de um período específico
   */
  async getMeasurementsByPeriod(deviceId, userId, startDate, endDate) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se device pertence ao usuário
      const device = await conn.query(
        'SELECT id FROM devices WHERE device_id = ? AND user_id = ?',
        [deviceId, userId]
      );

      if (!device || device.length === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      const rows = await conn.query(
        `SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at
         FROM measurements WHERE device_id = ?
         AND created_at BETWEEN ? AND ?
         ORDER BY created_at DESC`,
        [deviceId, startDate, endDate]
      );

      return {
        success: true,
        data: rows
      };
    } catch (err) {
      logger.error('Get measurements by period error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Deleta medição
   */
  async deleteMeasurement(measurementId, userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se medição pertence ao usuário
      const measurement = await conn.query(
        `SELECT m.id FROM measurements m
         JOIN devices d ON m.device_id = d.device_id
         WHERE m.id = ? AND d.user_id = ?`,
        [measurementId, userId]
      );

      if (!measurement || measurement.length === 0) {
        throw new Error('Medição não encontrada');
      }

      await conn.query('DELETE FROM measurements WHERE id = ?', [measurementId]);

      logger.info('Measurement deleted', { measurementId, userId });

      return { success: true };
    } catch (err) {
      logger.error('Delete measurement error', { measurementId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Sincroniza múltiplas medições (para ESP32)
   */
  async syncMeasurements(deviceId, measurements) {
    if (!Array.isArray(measurements) || measurements.length === 0) {
      throw new Error('Nenhuma medição para sincronizar');
    }

    let conn;
    try {
      conn = await pool.getConnection();

      let savedCount = 0;

      for (const m of measurements) {
        try {
          if (!validateKhValue(m.kh)) continue;

          await conn.query(
            `INSERT INTO measurements (device_id, kh, ph_ref, ph_sample, temperature, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [deviceId, m.kh, m.phRef || null, m.phSample || null, m.temperature || null, m.status || 'success', m.timestamp || new Date()]
          );

          savedCount++;
        } catch (err) {
          logger.warn('Failed to save measurement', { deviceId, measurement: m, error: err.message });
        }
      }

      // Atualizar lastSeen do device
      await conn.query(
        'UPDATE devices SET last_seen = NOW() WHERE device_id = ?',
        [deviceId]
      );

      logger.info('Measurements synced', { deviceId, count: savedCount });

      return {
        success: true,
        data: {
          synced: savedCount,
          total: measurements.length
        }
      };
    } catch (err) {
      logger.error('Sync measurements error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = new MeasurementService();
