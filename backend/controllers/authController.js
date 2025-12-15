/**
 * Controlador de Autenticação - registro, login, verificação, recuperação de senha
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateToken, generateRefreshToken } = require('../config/jwt');
const User = require('../models/User');
const { sendVerificationEmail } = require('../helpers/emailHelper');

/**
 * POST /api/v1/auth/register
 * Cria usuário novo ou reenvia código para usuário não verificado
 */
const registerUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password || typeof password !== 'string' || password.length < 6 || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'Email e senha (mín. 6 caracteres) são obrigatórios'
    });
  }

  try {
    const existingUser = await User.findByEmail(email);

    if (existingUser) {
      if (existingUser.isVerified) {
        return res.status(409).json({
          success: false,
          message: 'Já existe um usuário verificado com este email'
        });
      }

      const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await User.updateVerificationCode(existingUser.id, verificationCode, expiresAt);
      await sendVerificationEmail(email, verificationCode);

      return res.status(200).json({
        success: true,
        message: 'Já existe um cadastro pendente. Novo código enviado.',
        data: { userId: existingUser.id, email, requiresVerification: true }
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const userId = await User.create(email, passwordHash, verificationCode, expiresAt);
    await sendVerificationEmail(email, verificationCode);

    return res.status(201).json({
      success: true,
      message: 'Usuário criado. Enviamos um código de verificação para seu email.',
      data: { userId, email, requiresVerification: true }
    });
  } catch (err) {
    console.error('AUTH REGISTER ERROR:', err.message);
    return res.status(500).json({ success: false, message: 'Erro interno ao registrar usuário' });
  }
};

/**
 * POST /api/v1/auth/login
 * Login do painel web
 */
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email e senha são obrigatórios' });
  }

  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Conta ainda não verificada. Verifique o código enviado para seu email.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    const payload = { userId: user.id, email: user.email, role: user.role || 'user' };
    const token = generateToken(user.id, null);
    const refreshToken = generateRefreshToken(user.id, null);

    return res.json({
      success: true,
      message: 'Login bem-sucedido',
      data: { token, refreshToken, userId: user.id, email: user.email, role: payload.role }
    });
  } catch (err) {
    console.error('AUTH LOGIN ERROR:', err.message);
    return res.status(500).json({ success: false, message: 'Erro interno ao fazer login' });
  }
};

/**
 * POST /api/v1/auth/forgot-password
 * Gera código de recuperação (resposta genérica)
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email é obrigatório' });
  }

  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return res.json({
        success: true,
        message: 'Se o email existir, um código de recuperação foi enviado.'
      });
    }

    const verificationCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await User.updateVerificationCode(user.id, verificationCode, expiresAt);
    await sendVerificationEmail(user.email, verificationCode);

    return res.json({
      success: true,
      message: 'Se o email existir, um código de recuperação foi enviado.'
    });
  } catch (err) {
    console.error('AUTH FORGOT-PASSWORD ERROR:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao solicitar recuperação de senha'
    });
  }
};

/**
 * POST /api/v1/auth/verify-code
 * Verifica código de 6 dígitos e marca usuário como verificado
 */
const verifyCodeController = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'Email e código são obrigatórios'
    });
  }

  try {
    const user = await User.verifyCode(email, code);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido ou expirado'
      });
    }

    const userIdNumber = Number(user.id);
    const token = generateToken(userIdNumber, null);
    const refreshToken = generateRefreshToken(userIdNumber, null);

    return res.json({
      success: true,
      message: 'Código verificado com sucesso',
      data: {
        userId: userIdNumber,
        email: user.email,
        token,
        refreshToken
      }
    });
  } catch (err) {
    console.error('AUTH VERIFY-CODE ERROR:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao verificar código'
    });
  }
};

/**
 * POST /api/v1/auth/reset-password
 * Redefine senha usando código (fluxo "esqueci minha senha")
 */
const resetPassword = async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Email, código e nova senha são obrigatórios'
    });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Nova senha deve ter pelo menos 6 caracteres'
    });
  }

  try {
    const user = await User.verifyCode(email, code);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido ou expirado'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.updatePassword(user.id, passwordHash);

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso. Você já pode entrar com a nova senha.'
    });
  } catch (err) {
    console.error('AUTH RESET-PASSWORD ERROR:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao redefinir senha'
    });
  }
};

/**
 * POST /api/v1/auth/refresh-token
 * Gera novo access token a partir de refresh token
 */
const refreshTokenController = (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token não fornecido'
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const payload = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });

    return res.json({
      success: true,
      data: { token: newAccessToken }
    });
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Refresh token inválido ou expirado'
    });
  }
};

/**
 * GET /api/v1/auth/me
 * Dados do usuário autenticado
 */
const meController = async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('AUTH ME ERROR:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao buscar dados do usuário'
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  forgotPassword,
  verifyCodeController,
  resetPassword,
  refreshTokenController,
  meController
};
