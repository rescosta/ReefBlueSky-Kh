/**
 * User Model
 * Acesso a dados de usuários
 */

const pool = require('../config/database');

class User {
  /**
   * Busca usuário por ID
   */
  static async findById(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, email, role, created_at, last_login FROM users WHERE id = ?',
        [id]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Busca usuário por email
   */
  static async findByEmail(email) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, email, password_hash, role, created_at FROM users WHERE email = ?',
        [email]
      );
      return rows && rows.length > 0 ? rows[0] : null;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Cria novo usuário
   */
  static async create(email, passwordHash) {
    let conn;
    try {
      conn = await pool.getConnection();
      const result = await conn.query(
        `INSERT INTO users (email, password_hash, role, created_at, updated_at)
         VALUES (?, ?, 'user', NOW(), NOW())`,
        [email, passwordHash]
      );
      return result.insertId;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza usuário
   */
  static async update(id, data) {
    let conn;
    try {
      conn = await pool.getConnection();
      const fields = [];
      const values = [];

      if (data.email !== undefined) {
        fields.push('email = ?');
        values.push(data.email);
      }
      if (data.passwordHash !== undefined) {
        fields.push('password_hash = ?');
        values.push(data.passwordHash);
      }
      if (data.role !== undefined) {
        fields.push('role = ?');
        values.push(data.role);
      }
      if (data.telegramBotToken !== undefined) {
        fields.push('telegram_bot_token = ?');
        values.push(data.telegramBotToken);
      }
      if (data.telegramChatId !== undefined) {
        fields.push('telegram_chat_id = ?');
        values.push(data.telegramChatId);
      }
      if (data.telegramEnabled !== undefined) {
        fields.push('telegram_enabled = ?');
        values.push(data.telegramEnabled);
      }

      if (fields.length === 0) return;

      fields.push('updated_at = NOW()');
      values.push(id);

      await conn.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Deleta usuário
   */
  static async delete(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query('DELETE FROM users WHERE id = ?', [id]);
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Lista todos os usuários
   */
  static async findAll(limit = 100, offset = 0) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, email, role, created_at, last_login FROM users LIMIT ? OFFSET ?',
        [limit, offset]
      );
      return rows || [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Conta total de usuários
   */
  static async count() {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query('SELECT COUNT(*) as total FROM users');
      return rows[0].total;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza último login
   */
  static async updateLastLogin(id) {
    let conn;
    try {
      conn = await pool.getConnection();
      await conn.query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [id]
      );
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = User;
