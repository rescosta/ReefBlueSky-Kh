/**
 * Device Model
 * Acesso a dados de dispositivos
 */

const pool = require('../config/database');

class Device {
  /**
   * Busca dispositivo por ID
   */
  static async findById(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, user_id, device_id, name, status, last_seen, created_at FROM devices WHERE id = ?',
        [id]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca dispositivo por device_id
   */
  static async findByDeviceId(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, user_id, device_id, name, status, last_seen, created_at FROM devices WHERE device_id = ?',
        [deviceId]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca dispositivos do usuário
   */
  static async findByUserId(userId, limit = 100, offset = 0) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, user_id, device_id, name, status, last_seen, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [userId, limit, offset]
      );
      return rows || [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Cria novo dispositivo
   */
  static async create(userId, deviceId, name) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.query(
        `INSERT INTO devices (user_id, device_id, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'offline', NOW(), NOW())`,
        [userId, deviceId, name || deviceId]
      );
      return result.insertId;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza dispositivo
   */
  static async update(id, data) {
    let conn;
    try {
      conn = await pool.getConnection();
      const fields = [];
      const values = [];

      if (data.name !== undefined) {
        fields.push('name = ?');
        values.push(data.name);
      }
      if (data.status !== undefined) {
        fields.push('status = ?');
        values.push(data.status);
      }
      if (data.lastSeen !== undefined) {
        fields.push('last_seen = ?');
        values.push(data.lastSeen);
      }

      if (fields.length === 0) return;

      fields.push('updated_at = NOW()');
      values.push(id);

      await conn.query(
        `UPDATE devices SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Deleta dispositivo
   */
  static async delete(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query('DELETE FROM devices WHERE id = ?', [id]);
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza status
   */
  static async updateStatus(deviceId, status) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(
        'UPDATE devices SET status = ?, last_seen = NOW(), updated_at = NOW() WHERE device_id = ?',
        [status, deviceId]
      );
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Conta dispositivos do usuário
   */
  static async countByUserId(userId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT COUNT(*) as total FROM devices WHERE user_id = ?',
        [userId]
      );
      return rows[0].total;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = Device;
