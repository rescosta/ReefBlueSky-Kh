/**
 * Rotas de Autenticação v1
 * Conecta rotas → middlewares → controllers
 */

const express = require('express');
const { authUserMiddleware } = require('../middlewares/authMiddleware');

const {
  registerUser,
  loginUser,
  forgotPassword,
  verifyCodeController,
  resetPassword,
  refreshTokenController,
  meController,
} = require('../controllers/authController');

const router = express.Router();

// Registro e login
// POST /api/v1/auth/register
router.post('/register', registerUser);

// POST /api/v1/auth/login
router.post('/login', loginUser);

// Fluxo de verificação / recuperação
// POST /api/v1/auth/forgot-password
router.post('/forgot-password', forgotPassword);

// POST /api/v1/auth/verify-code
router.post('/verify-code', verifyCodeController);

// POST /api/v1/auth/reset-password
router.post('/reset-password', resetPassword);

// Refresh token
// POST /api/v1/auth/refresh-token
router.post('/refresh-token', refreshTokenController);

// Dados do usuário autenticado
// GET /api/v1/auth/me
router.get('/me', authUserMiddleware, meController);

module.exports = router;
