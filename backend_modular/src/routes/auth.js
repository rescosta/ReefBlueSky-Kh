/**
 * Auth Routes
 * Rotas de autenticação
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authUserMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

// Registrar usuário
router.post('/auth/register', authLimiter, authController.register);

// Login
router.post('/auth/login', authLimiter, authController.login);

// Refresh token
router.post('/auth/refresh-token', authController.refreshToken);

// Verificar código
router.post('/auth/verify-code', authLimiter, authController.verifyCode);

// Recuperar senha
router.post('/auth/forgot-password', authLimiter, authController.forgotPassword);

// Resetar senha
router.post('/auth/reset-password', authLimiter, authController.resetPassword);

// Obter dados do usuário
router.get('/auth/me', authUserMiddleware, authController.me);

module.exports = router;
