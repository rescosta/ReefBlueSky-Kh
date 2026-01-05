/**
 * Device Service
 * Lógica de gerenciamento de dispositivos
 */

const pool = require('../config/database');
const { generateToken } = require('../utils/jwt');
const { generateRandomToken } = require('../utils/helpers');
const { validateDeviceId } = require('../utils/validators');
const logger = require('../utils/logger');

class DeviceService {
  /**
   * Registra novo dispositivo
   */
  async registerDevice(userId, deviceName, deviceId) {
    if (!validateDeviceId(deviceId)) {
      throw new Error('Device ID inválido');
    }

    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se device já existe
      const existing = await conn.query(
        'SELECT id FROM devices WHERE device_id = ?',
        [deviceId]
      );

      if (existing && existing.length > 0) {
        throw new Error('Device ID já registrado');
      }

      // Inserir device
      const result = await conn.query(
        `INSERT INTO devices (user_id, device_id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'offline', NOW(), NOW())`,
        [userId, deviceId, deviceName || deviceId]
      );

      const deviceDbId = result.insertId;

      // Gerar token para device
      const deviceToken = generateToken({
        deviceId: deviceId,
        userId: userId,
        type: 'device'
      });

      logger.info('Device registered', { userId, deviceId, deviceDbId });

      return {
        success: true,
        data: {
          device: {
            id: deviceDbId,
            deviceId,
            name: deviceName || deviceId,
            status: 'offline'
          },
          token: deviceToken
        }
      };
    } catch (err) {
      logger.error('Register device error', { userId, deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Lista dispositivos do usuário
   */
  async getDevices(userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT id, device_id, name, status, last_seen, created_at, updated_at
         FROM devices WHERE user_id = ? ORDER BY created_at DESC`,
        [userId]
      );

      // Determinar status baseado em lastSeen
      const devices = rows.map(d => ({
        ...d,
        lcdStatus: this.getLcdStatus(d.last_seen)
      }));

      return {
        success: true,
        data: devices
      };
    } catch (err) {
      logger.error('Get devices error', { userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém dispositivo específico
   */
  async getDevice(deviceId, userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT id, device_id, name, status, last_seen, created_at, updated_at
         FROM devices WHERE device_id = ? AND user_id = ?`,
        [deviceId, userId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      const device = rows[0];
      device.lcdStatus = this.getLcdStatus(device.last_seen);

      return {
        success: true,
        data: device
      };
    } catch (err) {
      logger.error('Get device error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza status do dispositivo
   */
  async updateDeviceStatus(deviceId, status) {
    let conn;
    try {
      conn = await pool.getConnection();

      await conn.query(
        `UPDATE devices SET status = ?, last_seen = NOW(), updated_at = NOW()
         WHERE device_id = ?`,
        [status, deviceId]
      );

      logger.info('Device status updated', { deviceId, status });

      return { success: true };
    } catch (err) {
      logger.error('Update device status error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Deleta dispositivo
   */
  async deleteDevice(deviceId, userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const result = await conn.query(
        'DELETE FROM devices WHERE device_id = ? AND user_id = ?',
        [deviceId, userId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      logger.info('Device deleted', { deviceId, userId });

      return { success: true };
    } catch (err) {
      logger.error('Delete device error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Determina status do LCD baseado em lastSeen
   */
  getLcdStatus(lastSeen) {
    if (!lastSeen) return 'never';

    const now = Date.now();
    const last = new Date(lastSeen).getTime();
    const diffMs = now - last;
    const diffMin = diffMs / 60000;

    if (diffMin <= 5) return 'online';
    if (diffMin <= 60) return 'offline';
    return 'offline';
  }

  /**
   * Renova token do dispositivo
   */
  async refreshDeviceToken(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        'SELECT user_id FROM devices WHERE device_id = ?',
        [deviceId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Dispositivo não encontrado');
      }

      const userId = rows[0].user_id;

      const newToken = generateToken({
        deviceId: deviceId,
        userId: userId,
        type: 'device'
      });

      return {
        success: true,
        data: { token: newToken }
      };
    } catch (err) {
      logger.error('Refresh device token error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém configuração do dispositivo
   */
  async getDeviceConfig(deviceId, userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT id, measurement_interval, kh_target, auto_enabled, last_calibration
         FROM device_configs WHERE device_id = ? AND user_id = ?`,
        [deviceId, userId]
      );

      if (!rows || rows.length === 0) {
        // Retornar config padrão
        return {
          success: true,
          data: {
            measurementInterval: 300,
            khTarget: 7.8,
            autoEnabled: false,
            lastCalibration: null
          }
        };
      }

      return {
        success: true,
        data: rows[0]
      };
    } catch (err) {
      logger.error('Get device config error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza configuração do dispositivo
   */
  async updateDeviceConfig(deviceId, userId, config) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se config existe
      const existing = await conn.query(
        'SELECT id FROM device_configs WHERE device_id = ? AND user_id = ?',
        [deviceId, userId]
      );

      if (existing && existing.length > 0) {
        // Update
        await conn.query(
          `UPDATE device_configs SET 
           measurement_interval = COALESCE(?, measurement_interval),
           kh_target = COALESCE(?, kh_target),
           auto_enabled = COALESCE(?, auto_enabled),
           updated_at = NOW()
           WHERE device_id = ? AND user_id = ?`,
          [config.measurementInterval, config.khTarget, config.autoEnabled, deviceId, userId]
        );
      } else {
        // Insert
        await conn.query(
          `INSERT INTO device_configs (device_id, user_id, measurement_interval, kh_target, auto_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [deviceId, userId, config.measurementInterval || 300, config.khTarget || 7.8, config.autoEnabled || false]
        );
      }

      logger.info('Device config updated', { deviceId, userId, config });

      return { success: true };
    } catch (err) {
      logger.error('Update device config error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = new DeviceService();
