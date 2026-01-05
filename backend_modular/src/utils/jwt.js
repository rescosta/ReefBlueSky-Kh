/**
• JWT Utility
• Funções para geração e verificação de tokens JWT
*/
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRY, REFRESH_TOKEN_EXPIRY } = require('../config/environment');
const { UnauthorizedError } = require('../middleware/errorHandler');
/**
• Gera token JWT com claims estruturados
*/
function generateToken(payload, expiresIn = JWT_EXPIRY) {
  const tokenPayload = {
    id: payload.id,
    email: payload.email,
    role: payload.role || 'user',
    type: 'user',
    iat: Math.floor(Date.now() / 1000)
};
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
}
/**
• Gera device token
*/
function generateDeviceToken(deviceId, userId, expiresIn = '365d') {
  const tokenPayload = {
    deviceId,
    userId,
    type: 'device',
    iat: Math.floor(Date.now() / 1000)
  };
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
}
/**
• Gera refresh token
*/
function generateRefreshToken(payload, expiresIn = REFRESH_TOKEN_EXPIRY) {
  const tokenPayload = {
    id: payload.id,
    type: 'refresh',
    iat: Math.floor(Date.now() / 1000)
};
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn });
}
/**
• Verifica token com erro estruturado
*/
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
  if (err.name === 'TokenExpiredError') {
    throw new UnauthorizedError('Token expirado');
  }
  if (err.name === 'JsonWebTokenError') {
    throw new UnauthorizedError('Token inválido');
  }
    throw new UnauthorizedError('Erro ao validar token');
  }
}
/**
• Decodifica token sem verificar assinatura
*/
function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch (err) {
    return null;
  }
}
module.exports = {
generateToken,
generateDeviceToken,
generateRefreshToken,
verifyToken,
decodeToken
};
