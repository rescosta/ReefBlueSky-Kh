/**
 * Rotas de Autenticação v1
 * Conecta rotas → middlewares → controllers
 */
/**
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
  meController
} = require('../controllers/authController');

const router = express.Router();

// Registro e login
router.post('/register', registerUser);
router.post('/login', loginUser);

// Fluxo de verificação / recuperação
router.post('/forgot-password', forgotPassword);
router.post('/verify-code', verifyCodeController);
router.post('/reset-password', resetPassword);

// Refresh token
router.post('/refresh-token', refreshTokenController);

// Dados do usuário autenticado
router.get('/me', authUserMiddleware, meController);

module.exports = router;
