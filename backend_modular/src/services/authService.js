/**
 * Auth Service
 * Lógica de autenticação de usuários
 */

const bcrypt = require('bcrypt');
const pool = require('../config/database');
const { generateToken, generateRefreshToken } = require('../utils/jwt');
const { generateVerificationCode } = require('../utils/helpers');
const { validateEmail, validatePassword } = require('../utils/validators');
const logger = require('../utils/logger');

class AuthService {
  /**
   * Registra novo usuário
   */
  async register(email, password, verificationCode) {
    if (!validateEmail(email)) {
      throw new Error('Email inválido');
    }

    if (!validatePassword(password)) {
      throw new Error('Senha deve ter no mínimo 8 caracteres');
    }

    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se usuário já existe
      const existing = await conn.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (existing && existing.length > 0) {
        throw new Error('Email já cadastrado');
      }

      // Hash da senha
      const passwordHash = await bcrypt.hash(password, 10);

      // Inserir usuário
      const result = await conn.query(
        `INSERT INTO users (email, password_hash, created_at, updated_at)
         VALUES (?, ?, NOW(), NOW())`,
        [email, passwordHash]
      );

      const userId = result.insertId;

      // Gerar tokens
      const token = generateToken({ id: userId, email, role: 'user' });
      const refreshToken = generateRefreshToken({ id: userId, email });

      logger.info('User registered', { userId, email });

      return {
        success: true,
        data: {
          user: { id: userId, email, role: 'user' },
          token,
          refreshToken
        }
      };
    } catch (err) {
      logger.error('Register error', { email, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Login de usuário
   */
  async login(email, password) {
    if (!validateEmail(email)) {
      throw new Error('Email ou senha inválidos');
    }

    let conn;
    try {
      conn = await pool.getConnection();

      // Buscar usuário
      const rows = await conn.query(
        'SELECT id, email, password_hash, role FROM users WHERE email = ?',
        [email]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Email ou senha inválidos');
      }

      const user = rows[0];

      // Verificar senha
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      if (!passwordMatch) {
        throw new Error('Email ou senha inválidos');
      }

      // Atualizar lastLogin
      await conn.query(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [user.id]
      );

      // Gerar tokens
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role || 'user'
      });
      const refreshToken = generateRefreshToken({
        id: user.id,
        email: user.email
      });

      logger.info('User logged in', { userId: user.id, email });

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            role: user.role || 'user'
          },
          token,
          refreshToken
        }
      };
    } catch (err) {
      logger.error('Login error', { email, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Renova refresh token
   */
  async refreshToken(refreshToken) {
    try {
      const { verifyToken } = require('../utils/jwt');
      const decoded = verifyToken(refreshToken);

      const newToken = generateToken({
        id: decoded.id,
        email: decoded.email,
        role: decoded.role || 'user'
      });

      return {
        success: true,
        data: { token: newToken }
      };
    } catch (err) {
      logger.error('Refresh token error', { error: err.message });
      throw new Error('Refresh token inválido');
    }
  }

  /**
   * Envia código de verificação por email
   */
  async sendVerificationEmail(email) {
    const code = generateVerificationCode();
    
    let conn;
    try {
      conn = await pool.getConnection();

      // Armazenar código no banco
      await conn.query(
        `INSERT INTO verification_codes (email, code, expires_at, created_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), NOW())
         ON DUPLICATE KEY UPDATE code = ?, expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE)`,
        [email, code, code]
      );

      // TODO: Enviar email com código usando emailService
      logger.info('Verification code sent', { email, code });

      return {
        success: true,
        message: 'Código enviado para o email'
      };
    } catch (err) {
      logger.error('Send verification email error', { email, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Verifica código de verificação
   */
  async verifyCode(email, code) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT id FROM verification_codes 
         WHERE email = ? AND code = ? AND expires_at > NOW()`,
        [email, code]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Código inválido ou expirado');
      }

      // Deletar código após uso
      await conn.query(
        'DELETE FROM verification_codes WHERE email = ?',
        [email]
      );

      logger.info('Code verified', { email });

      return {
        success: true,
        message: 'Código verificado com sucesso'
      };
    } catch (err) {
      logger.error('Verify code error', { email, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Recupera senha
   */
  async forgotPassword(email) {
    const code = generateVerificationCode();
    
    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar se usuário existe
      const rows = await conn.query(
        'SELECT id FROM users WHERE email = ?',
        [email]
      );

      if (!rows || rows.length === 0) {
        // Não revelar se email existe
        return { success: true, message: 'Se o email existe, um código foi enviado' };
      }

      // Armazenar código
      await conn.query(
        `INSERT INTO password_reset_codes (email, code, expires_at, created_at)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NOW())
         ON DUPLICATE KEY UPDATE code = ?, expires_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)`,
        [email, code, code]
      );

      // TODO: Enviar email com código
      logger.info('Password reset requested', { email });

      return {
        success: true,
        message: 'Se o email existe, um código foi enviado'
      };
    } catch (err) {
      logger.error('Forgot password error', { email, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Reseta senha
   */
  async resetPassword(email, code, newPassword) {
    if (!validatePassword(newPassword)) {
      throw new Error('Senha deve ter no mínimo 8 caracteres');
    }

    let conn;
    try {
      conn = await pool.getConnection();

      // Verificar código
      const rows = await conn.query(
        `SELECT id FROM password_reset_codes 
         WHERE email = ? AND code = ? AND expires_at > NOW()`,
        [email, code]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Código inválido ou expirado');
      }

      // Hash da nova senha
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Atualizar senha
      await conn.query(
        'UPDATE users SET password_hash = ? WHERE email = ?',
        [passwordHash, email]
      );

      // Deletar código
      await conn.query(
        'DELETE FROM password_reset_codes WHERE email = ?',
        [email]
      );

      logger.info('Password reset', { email });

      return {
        success: true,
        message: 'Senha alterada com sucesso'
      };
    } catch (err) {
      logger.error('Reset password error', { email, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém dados do usuário
   */
  async getUserById(userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        'SELECT id, email, role, created_at, last_login FROM users WHERE id = ?',
        [userId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      return {
        success: true,
        data: rows[0]
      };
    } catch (err) {
      logger.error('Get user error', { userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }
}

module.exports = new AuthService();
