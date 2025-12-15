/**
 * Modelo Device - CRUD completo para tabela devices
 */
const pool = require('../config/database');

const findByUserId = async (userId) => {
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(
      `SELECT id, deviceId, name, local_ip AS localIp, last_seen AS lastSeen, 
              createdAt, updatedAt 
       FROM devices WHERE userId = ? ORDER BY createdAt DESC`,
      [userId]
    );
    return rows.map(r => ({
      ...r,
      lastSeen: r.lastSeen ? new Date(r.lastSeen).getTime() : null
    }));
  } finally {
    conn.release();
  }
};

const findUserByCredentials = async (email) => {
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(
      'SELECT id, email, passwordHash, isVerified FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0];
  } finally {
    conn.release();
  }
};

const createOrUpdate = async (deviceId, userId, name, local_ip) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO devices (deviceId, userId, name, local_ip, last_seen, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, NOW(), NOW(), NOW()) 
       ON DUPLICATE KEY UPDATE 
       userId = VALUES(userId), name = VALUES(name), local_ip = VALUES(local_ip),
       last_seen = NOW(), updatedAt = NOW()`,
      [deviceId, userId, name, local_ip || null]
    );
  } finally {
    conn.release();
  }
};

const updateLastSeen = async (deviceId, local_ip) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'UPDATE devices SET local_ip = COALESCE(?, local_ip), last_seen = NOW(), updatedAt = NOW() WHERE deviceId = ?',
      [local_ip || null, deviceId]
    );
  } finally {
    conn.release();
  }
};

const updateHealth = async (deviceId, health) => {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO device_health (deviceId, cpu_usage, mem_usage, storage_usage, wifi_rssi, uptime_seconds) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [deviceId, health.cpu_usage, health.memory_usage, health.storage_usage ?? null, 
       health.wifi_rssi ?? null, health.uptime]
    );
  } finally {
    conn.release();
  }
};

module.exports = {
  findByUserId,
  findUserByCredentials,
  createOrUpdate,
  updateLastSeen,
  updateHealth
};
