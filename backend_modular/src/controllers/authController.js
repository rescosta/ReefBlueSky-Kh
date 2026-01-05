/**
 * Auth Controller
 * Handlers para endpoints de autenticação
 */

const authService = require('../services/authService');
const logger = require('../utils/logger');
const { validateEmail, validatePassword } = require('../utils/validators');
const { ValidationError } = require('../middleware/errorHandler');


class AuthController {
  /**
   * POST /api/v1/auth/register
   */
  async register(req, res, next) {
    try {
      const { email, password } = req.body;

      // Validação usando validators
      if (!email || !password) {
        throw new ValidationError('Email e senha são obrigatórios', {
          email: !email ? 'Obrigatório' : null,
          password: !password ? 'Obrigatório' : null
        });
      }

      validateEmail(email);
      validatePassword(password);

      const result = await authService.register(email, password);
      
      logger.info('Usuário registrado', { userId: result.user.id, email });
      res.status(201).json(result);
    } catch (err) {
      next(err); // ErrorHandler processa
    }
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email e senha são obrigatórios'
        });
      }

      const result = await authService.login(email, password);
      res.json(result);
    } catch (err) {
      logger.error('Login error', { error: err.message });
      res.status(401).json({
        success: false,
        message: 'Email ou senha inválidos'
      });
    }
  }

  /**
   * POST /api/v1/auth/refresh-token
   */
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token é obrigatório'
        });
      }

      const result = await authService.refreshToken(refreshToken);
      res.json(result);
    } catch (err) {
      logger.error('Refresh token error', { error: err.message });
      res.status(401).json({
        success: false,
        message: 'Refresh token inválido'
      });
    }
  }

  /**
   * POST /api/v1/auth/verify-code
   */
  async verifyCode(req, res) {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message: 'Email e código são obrigatórios'
        });
      }

      const result = await authService.verifyCode(email, code);
      res.json(result);
    } catch (err) {
      logger.error('Verify code error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/auth/forgot-password
   */
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email é obrigatório'
        });
      }

      const result = await authService.forgotPassword(email);
      res.json(result);
    } catch (err) {
      logger.error('Forgot password error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/auth/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;

      if (!email || !code || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Email, código e nova senha são obrigatórios'
        });
      }

      const result = await authService.resetPassword(email, code, newPassword);
      res.json(result);
    } catch (err) {
      logger.error('Reset password error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  async me(req, res) {
    try {
      const result = await authService.getUserById(req.user.id);
      res.json(result);
    } catch (err) {
      logger.error('Get user error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new AuthController();
