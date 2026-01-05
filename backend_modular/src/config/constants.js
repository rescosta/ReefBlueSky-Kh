/**
 * Global Constants
 * Constantes utilizadas em toda a aplicação
 */

module.exports = {
  // Rate Limiting
  RATE_LIMITS: {
    AUTH: { windowMs: 15 * 60 * 1000, max: 5 },
    SYNC: { windowMs: 60 * 1000, max: 10 },
    GENERAL: { windowMs: 15 * 60 * 1000, max: 100 }
  },

  // JWT
  JWT_EXPIRY: '1h',
  REFRESH_TOKEN_EXPIRY: '30d',

  // Verification
  VERIFICATION_CODE_EXPIRY: 10 * 60 * 1000, // 10 minutos
  VERIFICATION_CODE_LENGTH: 6,
  MAX_VERIFICATION_ATTEMPTS: 3,

  // Device
  DEVICE_STATUS: {
    ONLINE: 'online',
    OFFLINE: 'offline',
    ERROR: 'error'
  },

  // Command Status
  COMMAND_STATUS: {
    PENDING: 'pending',
    EXECUTING: 'executing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  },

  // Command Types
  COMMAND_TYPES: {
    PUMP: 'pump',
    KH_CORRECTION: 'kh_correction',
    CALIBRATION: 'calibration',
    TEST: 'test',
    RESTART: 'restart'
  },

  // Measurement Status
  MEASUREMENT_STATUS: {
    SUCCESS: 'success',
    ERROR: 'error',
    TIMEOUT: 'timeout',
    INVALID: 'invalid'
  },

  // KH Health Thresholds
  KH_HEALTH: {
    GREEN_MAX_DEV: 0.2,
    YELLOW_MAX_DEV: 0.5
  },

  // Timeouts (em ms)
  TIMEOUTS: {
    DB_QUERY: 10000,
    API_REQUEST: 5000,
    DEVICE_SYNC: 30000
  },

  // Pagination
  PAGINATION: {
    DEFAULT_LIMIT: 100,
    MAX_LIMIT: 1000,
    DEFAULT_OFFSET: 0
  },

  // User Roles
  USER_ROLES: {
    ADMIN: 'admin',
    USER: 'user',
    DEV: 'dev'
  }
};

// Limites de entrada (novos)
module.exports.LIMITS = {
  MAX_MEASUREMENTS_PER_REQUEST: 1000,
  MAX_DEVICE_ID_LENGTH: 50,
  MAX_DEVICE_NAME_LENGTH: 100,
  MAX_COMMAND_PARAMS_SIZE: 5000,
  MIN_MEASUREMENT_INTERVAL: 60,
  MAX_MEASUREMENT_INTERVAL: 86400
};

// Timeouts adicionados
module.exports.SECURITY = {
  PASSWORD_MIN_LENGTH: 8,
  VERIFICATION_CODE_LENGTH: 6,
  TOKEN_BLACKLIST_CHECK_INTERVAL: 3600000, // 1 hora
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_ATTEMPT_WINDOW: 15 * 60 * 1000 // 15 minutos
};
