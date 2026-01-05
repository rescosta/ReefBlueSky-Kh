/**
 * Metrics Service
 * Lógica de cálculo de métricas e saúde do sistema
 */

const pool = require('../config/database');
const { getHoursDifference, calculateStats } = require('../utils/helpers');
const logger = require('../utils/logger');

class MetricsService {
  /**
   * Calcula saúde do dispositivo
   */
  async calculateDeviceHealth(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Buscar informações do device
      const deviceRows = await conn.query(
        'SELECT status, last_seen FROM devices WHERE device_id = ?',
        [deviceId]
      );

      if (!deviceRows || deviceRows.length === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      const device = deviceRows[0];

      // Calcular saúde
      let health = 100;
      let status = 'ok';

      // Verificar se está online
      if (device.status === 'offline') {
        health -= 30;
        status = 'warning';
      }

      // Verificar lastSeen
      if (device.last_seen) {
        const hoursDiff = getHoursDifference(new Date(), device.last_seen);
        if (hoursDiff > 24) {
          health -= 40;
          status = 'error';
        } else if (hoursDiff > 6) {
          health -= 20;
          if (status === 'ok') status = 'warning';
        }
      }

      // Buscar últimas medições
      const measurementRows = await conn.query(
        `SELECT status FROM measurements WHERE device_id = ?
         ORDER BY created_at DESC LIMIT 10`,
        [deviceId]
      );

      if (measurementRows && measurementRows.length > 0) {
        const errorCount = measurementRows.filter(m => m.status !== 'success').length;
        const errorRate = errorCount / measurementRows.length;

        if (errorRate > 0.5) {
          health -= 20;
          if (status === 'ok') status = 'warning';
        }
      }

      // Garantir que health fica entre 0 e 100
      health = Math.max(0, Math.min(100, health));

      if (health < 50) status = 'error';
      else if (health < 80) status = 'warning';
      else status = 'ok';

      return {
        success: true,
        data: {
          health,
          status,
          lastSeen: device.last_seen,
          deviceStatus: device.status
        }
      };
    } catch (err) {
      logger.error('Calculate device health error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém saúde geral do sistema
   */
  // Obtém saúde geral do sistema
 
  async getSystemHealth() {
    let conn;

    try {
      conn = await pool.getConnection();

      // Contar devices online/offline usando last_seen
      const [deviceStats] = await conn.query(`
        SELECT 
          SUM(CASE 
                WHEN last_seen IS NOT NULL 
                 AND last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
              THEN 1 ELSE 0 END) AS online,
          SUM(CASE 
                WHEN last_seen IS NULL 
                 OR last_seen <= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
              THEN 1 ELSE 0 END) AS offline
        FROM devices
      `);

      // Contar medições recentes (usa createdAt, que é o nome da coluna)
      const [measurementStats] = await conn.query(`
        SELECT COUNT(*) as total,
               SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
               SUM(CASE WHEN createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END) as lastHour
        FROM measurements
      `);

      // Contar usuários
      const [userStats] = await conn.query(`
        SELECT COUNT(*) as total FROM users
      `);

      const onlineDevices = deviceStats.online || 0;
      const offlineDevices = deviceStats.offline || 0;
      const totalDevices = onlineDevices + offlineDevices;

      const measurements = measurementStats;
      const successRate =
        measurements.total > 0
          ? parseFloat(((measurements.success / measurements.total) * 100).toFixed(2))
          : 0;

      return {
        success: true,
        data: {
          devices: {
            online: onlineDevices,
            offline: offlineDevices,
            total: totalDevices
          },
          measurements: {
            total: measurements.total,
            successRate,
            lastHour: measurements.lastHour || 0
          },
          users: {
            total: userStats.total
          },
          timestamp: new Date()
        }
      };
    } catch (err) {
      logger.error('Get system health error', { error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }


  /**
   * Obtém métricas de KH
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

      // Buscar medições
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
            count: 0,
            period: `${days} dias`
          }
        };
      }

      const khValues = rows.map(r => r.kh);
      const stats = calculateStats(khValues);

      return {
        success: true,
        data: {
          ...stats,
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
   * Obtém tendência de KH
   */
  async getKhTrend(deviceId, userId, days = 7) {
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
        `SELECT kh, created_at FROM measurements WHERE device_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY created_at ASC`,
        [deviceId, days]
      );

      if (!rows || rows.length < 2) {
        return {
          success: true,
          data: {
            trend: 'stable',
            rate: 0,
            dataPoints: rows ? rows.length : 0
          }
        };
      }

      // Calcular tendência usando regressão linear simples
      const khValues = rows.map(r => r.kh);
      const n = khValues.length;
      const indices = Array.from({ length: n }, (_, i) => i);

      const sumX = indices.reduce((a, b) => a + b, 0);
      const sumY = khValues.reduce((a, b) => a + b, 0);
      const sumXY = indices.reduce((sum, x, i) => sum + x * khValues[i], 0);
      const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

      let trend = 'stable';
      if (slope > 0.05) trend = 'up';
      else if (slope < -0.05) trend = 'down';

      return {
        success: true,
        data: {
          trend,
          rate: parseFloat(slope.toFixed(4)),
          dataPoints: n,
          period: `${days} dias`
        }
      };
    } catch (err) {
      logger.error('Get KH trend error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém resumo de saúde para display LCD
   */
  async getDisplayKhSummary(deviceId, userId) {
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

      // Última medição
      const latestRows = await conn.query(
        `SELECT kh, temperature, created_at FROM measurements WHERE device_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [deviceId]
      );

      // Estatísticas de 24h
      const statsRows = await conn.query(
        `SELECT MIN(kh) as min, MAX(kh) as max, AVG(kh) as avg FROM measurements
         WHERE device_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [deviceId]
      );

      const latest = latestRows && latestRows.length > 0 ? latestRows[0] : null;
      const stats = statsRows && statsRows.length > 0 ? statsRows[0] : null;

      // Calcular variação
      let variation = 0;
      if (stats && stats.avg) {
        variation = latest ? latest.kh - stats.avg : 0;
      }

      return {
        success: true,
        data: {
          current: latest ? latest.kh : null,
          temperature: latest ? latest.temperature : null,
          min: stats ? stats.min : null,
          max: stats ? stats.max : null,
          avg: stats ? stats.avg : null,
          variation: parseFloat(variation.toFixed(2)),
          timestamp: latest ? latest.created_at : null
        }
      };
    } catch (err) {
      logger.error('Get display KH summary error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = new MetricsService();
