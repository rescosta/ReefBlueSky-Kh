// models/DeviceEvent.js
const pool = require('../config/database');

const findEventsByDevice = async (deviceId, userId) => {
  const conn = await pool.getConnection();
  try {
    const rows = await conn.query(
      `SELECT timestamp, level, type, message
       FROM device_events
       WHERE deviceId = ? AND userId = ?
       ORDER BY timestamp DESC
       LIMIT 500`,
      [deviceId, userId]
    );
    return rows;
  } finally {
    conn.release();
  }
};

module.exports = { findEventsByDevice };
