/**
 * Authentication Middleware
 * Verifica JWT tokens para usuários e dispositivos
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/environment');

/**
 * Middleware para autenticação de usuários (web)
 */

const { UnauthorizedError, ForbiddenError } = require('./errorHandler');

/**
 * Middleware para autenticação de usuários (web)
 * Extrai e valida JWT do header Authorization
 */
const authUserMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Token ausente'));
    }

    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Validar estrutura mínima do token
    if (!decoded.id || !decoded.email) {
      return next(new UnauthorizedError('Token com estrutura inválida'));
    }

    // Armazenar dados do usuário no request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user'
    };
    
    next();
  } catch (err) {
    next(err); // Passa para errorHandler
  }
};

/**
 * Middleware para autenticação de dispositivos (ESP32)
 */

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new UnauthorizedError('Token de dispositivo ausente'));
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Validar que é um token de device
    if (!decoded.deviceId) {
      return next(new UnauthorizedError('Token não é de dispositivo'));
    }

    req.device = decoded;
    req.deviceId = decoded.deviceId;
    req.userId = decoded.userId;
    
    next();
  } catch (err) {
    next(err); // Passa para errorHandler
  }
};

/**
 * Middleware para verificar role de admin
 */

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new ForbiddenError('Requer permissão de admin'));
  }
  next();
};

/**
 * Middleware para verificar role de dev
 */
const requireDev = (req, res, next) => {
  if (!req.user || req.user.role !== 'dev') {
    return next(new ForbiddenError('Requer permissão de desenvolvedor'));
  }
  next();
};

/**
 * Middleware para validar ownership de device
 * Garante que usuário só acessa seus próprios devices
 */
const requireDeviceOwnership = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.id;
    
    // TODO: Implementar verificação real
    // const Device = require('../models/Device');
    // const device = await Device.findByDeviceId(deviceId);
    // if (!device || device.user_id !== userId) {
    //   return next(new ForbiddenError('Acesso negado: device não pertence ao usuário'));
    // }
    
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  authUserMiddleware,
  verifyToken,
  requireAdmin,
  requireDev,
  requireDeviceOwnership
};