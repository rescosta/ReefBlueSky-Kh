/**
 * Modelo Measurement - Gerencia medições KH/pH/Temp
 */
const pool = require('../config/database');

const bulkInsert = async (deviceId, measurements) => {
  const conn = await pool.getConnection();
  let insertedCount = 0;
  
  try {
    for (const m of measurements) {
      try {
        await conn.execute(
          `INSERT INTO measurements (deviceId, kh, phref, phsample, temperature, timestamp, status, confidence) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            deviceId,
            m.kh,
            m.phref || null,
            m.phsample || null,
            m.temperature || null,
            m.timestamp,
            m.status || null,
            m.confidence || null
          ]
        );
        insertedCount++;
      } catch (insertErr) {
        console.error(`Medição ${m.timestamp} falhou:`, insertErr.message);
      }
    }
    return insertedCount;
  } finally {
    conn.release();
  }
};

const findByDeviceId = async (deviceId, from, to) => {
  const conn = await pool.getConnection();
  try {
    let sql = `SELECT id, kh, phref, phsample, temperature, timestamp, status, confidence, createdAt 
               FROM measurements WHERE deviceId = ?`;
    const params = [deviceId];
    
    if (from) {
      sql += ' AND timestamp >= ?';
      params.push(Number(from));
    }
    if (to) {
      sql += ' AND timestamp <= ?';
      params.push(Number(to));
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT 500';
    
    const rows = await conn.query(sql, params);
    return rows.map(r => ({ ...r, timestamp: Number(r.timestamp) }));
  } finally {
    conn.release();
  }
};

module.exports = { bulkInsert, findByDeviceId };
