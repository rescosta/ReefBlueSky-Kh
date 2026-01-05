/**
 * Database Configuration
 * Pool de conexão MariaDB com configurações otimizadas
 */

const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'reefapp',
  password: process.env.DB_PASSWORD || 'reef',
  database: process.env.DB_NAME || 'reefbluesky',
  connectionLimit: 5,
  acquireTimeout: 10000,
  connectTimeout: 10000,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInterval: 30000
});

// Permitir BigInt em JSON
BigInt.prototype.toJSON = function() {
  return this.toString();
};

/**
 * Health check do banco
 */
async function healthCheck() {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query('SELECT 1 as alive');
    return { status: 'ok', timestamp: new Date() };
  } catch (err) {
    return { status: 'error', error: err.message };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Graceful shutdown
 */
async function closePool() {
  try {
    await pool.end();
    console.log('✓ Database connection pool closed');
  } catch (err) {
    console.error('✗ Error closing pool:', err.message);
  }
}

// Testar conexão ao iniciar
pool.getConnection()
  .then(conn => {
    console.log('✓ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('✗ Database connection failed:', err.message);
    console.error('Verifique: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
    process.exit(1);
  });

module.exports = pool;
module.exports.healthCheck = healthCheck;
module.exports.closePool = closePool;
