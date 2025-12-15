/**
 * Configuração JWT - Geração e validação de tokens
 * Tokens de acesso (1h) e refresh (30d)
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || '...';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || '...';

const generateToken = (userId, deviceId) => {
  return jwt.sign(
    { userId, deviceId, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const generateRefreshToken = (userId, deviceId) => {
  return jwt.sign({ userId, deviceId, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
};

const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

module.exports = { generateToken, generateRefreshToken, verifyToken };
