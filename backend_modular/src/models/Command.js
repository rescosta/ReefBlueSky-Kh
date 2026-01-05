/**
 * Command Model
 * Acesso a dados de comandos
 */

const pool = require('../config/database');

class Command {
  /**
   * Busca comando por ID
   */
  static async findById(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, device_id, type, params, status, result, error, created_at, updated_at FROM commands WHERE id = ?',
        [id]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca comandos pendentes do dispositivo
   */
  static async findPending(deviceId, limit = 10) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT id, device_id, type, params, status, created_at FROM commands
         WHERE device_id = ? AND status IN ('pending', 'executing')
         ORDER BY created_at ASC LIMIT ?`,
        [deviceId, limit]
      );
      return rows || [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca histórico de comandos
   */
  static async findHistory(deviceId, limit = 50, offset = 0) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT id, device_id, type, params, status, result, error, created_at, updated_at
         FROM commands WHERE device_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [deviceId, limit, offset]
      );
      return rows || [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Cria novo comando
   */
  static async create(deviceId, type, params, status) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.query(
        `INSERT INTO commands (device_id, type, params, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [deviceId, type, JSON.stringify(params), status]
      );
      return result.insertId;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza comando
   */
  static async update(id, data) {
    let conn;
    try {
      conn = await pool.getConnection();
      const fields = [];
      const values = [];

      if (data.status !== undefined) {
        fields.push('status = ?');
        values.push(data.status);
      }
      if (data.result !== undefined) {
        fields.push('result = ?');
        values.push(JSON.stringify(data.result));
      }
      if (data.error !== undefined) {
        fields.push('error = ?');
        values.push(data.error);
      }

      if (fields.length === 0) return;

      fields.push('updated_at = NOW()');
      values.push(id);

      await conn.query(
        `UPDATE commands SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Deleta comando
   */
  static async delete(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query('DELETE FROM commands WHERE id = ?', [id]);
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Conta comandos do dispositivo
   */
  static async countByDeviceId(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT COUNT(*) as total FROM commands WHERE device_id = ?',
        [deviceId]
      );
      return rows[0].total;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = Command;
