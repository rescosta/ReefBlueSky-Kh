/**
 * Middlewares de Rate Limiting
 * Proteção contra brute force e spam de sincronização
 */
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 1000, // 1000 req/min por IP
  message: { success: false, message: 'Muitas requisições, tente novamente mais tarde' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 tentativas
  message: { success: false, message: 'Muitas tentativas de login, tente mais tarde' },
  skipSuccessfulRequests: true
});

const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 100, // 100 syncs/hora
  message: { success: false, message: 'Limite de sincronização atingido' }
});

module.exports = { globalLimiter, authLimiter, syncLimiter };
