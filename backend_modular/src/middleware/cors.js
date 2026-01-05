/**
 * CORS Configuration
 * Configuração de Cross-Origin Resource Sharing
 */

const { CORS_ORIGIN, NODE_ENV } = require('../config/environment');

const corsConfig = {
  origin: function (origin, callback) {
    const allowedOrigins = Array.isArray(CORS_ORIGIN) ? CORS_ORIGIN : [CORS_ORIGIN];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS não permitido'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-Request-ID'],
  maxAge: NODE_ENV === 'production' ? 3600 : 86400,
  optionsSuccessStatus: 200
};

module.exports = corsConfig;