/**
 * Middlewares de autenticação JWT
 * Separa autenticação para usuários web e dispositivos ESP32
 */

const { verifyToken } = require('../config/jwt');

/**
 * Middleware para tokens de dispositivos (ESP32)
 * Usa Authorization: Bearer <token> e espera payload com deviceId (e opcional userId)
 */
const verifyDeviceToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token não fornecido' });
  }

  try {
    req.user = verifyToken(token);

    // Valida timestamp contra replay attacks (token do “futuro”)
    if (req.user.iat > Math.floor(Date.now() / 1000) + 60) {
      return res.status(403).json({ success: false, message: 'Token inválido' });
    }

    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Token inválido ou expirado' });
  }
};

/**
 * Middleware para usuários web (dashboard)
 * Usa Authorization: Bearer <token> com payload { userId, email, role, deviceId? }
 */
const authUserMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token não fornecido' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);

    if (!decoded.userId) {
      return res.status(401).json({ success: false, message: 'Token inválido para usuário' });
    }

    req.user = {
      userId: decoded.userId,
      deviceId: decoded.deviceId || null,
      role: decoded.role || 'user',
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
  }
};

/**
 * Restrição para rotas de desenvolvedor
 */
const requireDev = (req, res, next) => {
  if (req.user.role !== 'dev') {
    return res.status(403).json({ success: false, message: 'Acesso apenas para dev' });
  }
  next();
};

module.exports = { verifyDeviceToken, authUserMiddleware, requireDev };
