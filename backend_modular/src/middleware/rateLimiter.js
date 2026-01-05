/**
 * Rate Limiter Middleware
 * Controla limite de requisições por IP
 */

const rateLimit = require('express-rate-limit');
const { RATE_LIMITS } = require('../config/constants');

/**
 * Rate limiter para autenticação (login, registro)
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMITS.AUTH.windowMs,
  max: RATE_LIMITS.AUTH.max,
  message: 'Muitas tentativas de autenticação. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Não limitar em desenvolvimento
    return process.env.NODE_ENV === 'development';
  }
});

/**
 * Rate limiter para sincronização de dados
 */
const syncLimiter = rateLimit({
  windowMs: RATE_LIMITS.SYNC.windowMs,
  max: RATE_LIMITS.SYNC.max,
  message: 'Limite de sincronização excedido. Aguarde antes de sincronizar novamente.',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter geral
 */
const generalLimiter = rateLimit({
  windowMs: RATE_LIMITS.GENERAL.windowMs,
  max: RATE_LIMITS.GENERAL.max,
  message: 'Muitas requisições. Tente novamente mais tarde.',
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  authLimiter,
  syncLimiter,
  generalLimiter
};
