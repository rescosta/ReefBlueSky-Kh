// db-pool.js
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'reefapp',
  password: process.env.DB_PASSWORD || 'reef',
  database: process.env.DB_NAME || 'reefbluesky',
  connectionLimit: 20,        // [FIX] Aumentado de 5 para 20 - suporta mais dispositivos simultâneos
  acquireTimeout: 30000,      // [FIX] Aumentado de 10s para 30s - mais tolerância em picos
  connectTimeout: 10000,
  idleTimeout: 60000,
});

// Monitoramento de pool (opcional - para debug)
pool.on('acquire', function (connection) {
  console.log('[DB Pool] Conexão %d adquirida', connection.threadId);
});

pool.on('release', function (connection) {
  console.log('[DB Pool] Conexão %d liberada', connection.threadId);
});

module.exports = pool;
