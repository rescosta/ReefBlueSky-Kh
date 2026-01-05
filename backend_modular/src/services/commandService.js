/**
 * Command Service
 * Lógica de gerenciamento de comandos para dispositivos
 */

const pool = require('../config/database');
const { COMMAND_STATUS, COMMAND_TYPES } = require('../config/constants');
const logger = require('../utils/logger');

class CommandService {
  /**
   * Cria novo comando
   */
  async createCommand(deviceId, userId, type, params = {}) {
    if (!Object.values(COMMAND_TYPES).includes(type)) {
      throw new Error('Tipo de comando inválido');
    }

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

      // Criar comando
      const result = await conn.query(
        `INSERT INTO commands (device_id, type, params, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [deviceId, type, JSON.stringify(params), COMMAND_STATUS.PENDING]
      );

      logger.info('Command created', { deviceId, userId, type });

      return {
        success: true,
        data: {
          id: result.insertId,
          deviceId,
          type,
          params,
          status: COMMAND_STATUS.PENDING
        }
      };
    } catch (err) {
      logger.error('Create command error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém comandos pendentes do dispositivo
   */
  async getCommands(deviceId, limit = 10) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT id, device_id, type, params, status, created_at, updated_at
         FROM commands WHERE device_id = ? AND status IN (?, ?)
         ORDER BY created_at ASC LIMIT ?`,
        [deviceId, COMMAND_STATUS.PENDING, COMMAND_STATUS.EXECUTING, limit]
      );

      // Parsear params
      const commands = rows.map(c => ({
        ...c,
        params: JSON.parse(c.params || '{}')
      }));

      return {
        success: true,
        data: commands
      };
    } catch (err) {
      logger.error('Get commands error', { deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Marca comando como executando
   */
  async startCommand(commandId, deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();

      await conn.query(
        `UPDATE commands SET status = ?, updated_at = NOW()
         WHERE id = ? AND device_id = ?`,
        [COMMAND_STATUS.EXECUTING, commandId, deviceId]
      );

      logger.info('Command started', { commandId, deviceId });

      return { success: true };
    } catch (err) {
      logger.error('Start command error', { commandId, deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Completa comando
   */
  async completeCommand(commandId, result, deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();

      await conn.query(
        `UPDATE commands SET status = ?, result = ?, updated_at = NOW()
         WHERE id = ? AND device_id = ?`,
        [COMMAND_STATUS.COMPLETED, JSON.stringify(result), commandId, deviceId]
      );

      logger.info('Command completed', { commandId, deviceId });

      return { success: true };
    } catch (err) {
      logger.error('Complete command error', { commandId, deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Falha em comando
   */
  async failCommand(commandId, error, deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();

      await conn.query(
        `UPDATE commands SET status = ?, error = ?, updated_at = NOW()
         WHERE id = ? AND device_id = ?`,
        [COMMAND_STATUS.FAILED, error, commandId, deviceId]
      );

      logger.info('Command failed', { commandId, deviceId, error });

      return { success: true };
    } catch (err) {
      logger.error('Fail command error', { commandId, deviceId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Cancela comando
   */
  async cancelCommand(commandId, userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se comando pertence ao usuário
      const command = await conn.query(
        `SELECT c.id FROM commands c
         JOIN devices d ON c.device_id = d.device_id
         WHERE c.id = ? AND d.user_id = ? AND c.status != ?`,
        [commandId, userId, COMMAND_STATUS.COMPLETED]
      );

      if (!command || command.length === 0) {
        throw new Error('Comando não encontrado ou já foi completado');
      }

      await conn.query(
        `UPDATE commands SET status = ?, updated_at = NOW()
         WHERE id = ?`,
        [COMMAND_STATUS.CANCELLED, commandId]
      );

      logger.info('Command cancelled', { commandId, userId });

      return { success: true };
    } catch (err) {
      logger.error('Cancel command error', { commandId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém histórico de comandos
   */
  async getCommandHistory(deviceId, userId, limit = 50, offset = 0) {
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
        `SELECT id, device_id, type, params, status, result, error, created_at, updated_at
         FROM commands WHERE device_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [deviceId, limit, offset]
      );

      // Parsear params e result
      const commands = rows.map(c => ({
        ...c,
        params: JSON.parse(c.params || '{}'),
        result: c.result ? JSON.parse(c.result) : null
      }));

      return {
        success: true,
        data: commands
      };
    } catch (err) {
      logger.error('Get command history error', { deviceId, userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = new CommandService();
