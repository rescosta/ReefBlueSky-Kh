/**
 * Measurement Model
 * Acesso a dados de medições
 */

const pool = require('../config/database');

class Measurement {
  /**
   * Busca medição por ID
   */
  static async findById(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at FROM measurements WHERE id = ?',
        [id]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca medições do dispositivo
   */
  static async findByDeviceId(deviceId, limit = 100, offset = 0) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at
         FROM measurements WHERE device_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [deviceId, limit, offset]
      );
      return rows || [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca última medição
   */
  static async findLatest(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at
         FROM measurements WHERE device_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [deviceId]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Cria nova medição
   */
  static async create(deviceId, kh, phRef, phSample, temperature, status) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.query(
        `INSERT INTO measurements (device_id, kh, ph_ref, ph_sample, temperature, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [deviceId, kh, phRef, phSample, temperature, status]
      );
      return result.insertId;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Deleta medição
   */
  static async delete(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query('DELETE FROM measurements WHERE id = ?', [id]);
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Conta medições do dispositivo
   */
  static async countByDeviceId(deviceId) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT COUNT(*) as total FROM measurements WHERE device_id = ?',
        [deviceId]
      );
      return rows[0].total;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca medições por período
   */
  static async findByPeriod(deviceId, startDate, endDate) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT id, device_id, kh, ph_ref, ph_sample, temperature, status, created_at
         FROM measurements WHERE device_id = ?
         AND created_at BETWEEN ? AND ?
         ORDER BY created_at DESC`,
        [deviceId, startDate, endDate]
      );
      return rows || [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Calcula estatísticas de KH
   */
  static async getKhStats(deviceId, days = 7) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        `SELECT MIN(kh) as min, MAX(kh) as max, AVG(kh) as avg, COUNT(*) as count
         FROM measurements WHERE device_id = ?
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [deviceId, days]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = Measurement;
