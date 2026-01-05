/**
 * Environment Configuration
 * Centraliza todas as variáveis de ambiente
 */

require('dotenv').config();

// Validar variáveis críticas
const requiredEnvVars = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ ERRO: Variáveis ausentes: ${missingVars.join(', ')}`);
  process.exit(1);
}

module.exports = {
  PORT: parseInt(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME: process.env.DB_NAME,
  DB_PORT: parseInt(process.env.DB_PORT) || 3306,
  DB_CONN_LIMIT: parseInt(process.env.DB_CONN_LIMIT) || 5,
  
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '1h',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '30d',
  
  EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'gmail',
  EMAIL_USER: process.env.EMAIL_USER || '',
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD || '',
  
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  
  CORS_ORIGIN: process.env.CORS_ORIGIN ? 
    process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : 
    process.env.NODE_ENV === 'production' ? 
      ['https://iot.reefbluesky.com.br'] : 
      ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
  
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENABLE_TELEGRAM: process.env.ENABLE_TELEGRAM === 'true',
  ENABLE_EMAIL: process.env.ENABLE_EMAIL === 'true',
  MAX_REQUEST_SIZE: process.env.MAX_REQUEST_SIZE || '5mb',
  TOKEN_BLACKLIST_ENABLED: process.env.TOKEN_BLACKLIST_ENABLED !== 'false'
};