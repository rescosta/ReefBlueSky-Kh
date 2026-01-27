// user-timezone.js
const pool = require('./db-pool');

// Busca timezone do usuário (com fallback)
async function getUserTimezone(userId) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT timezone FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    if (!rows || rows.length === 0) return 'America/Sao_Paulo';
    return rows[0].timezone || 'America/Sao_Paulo';
  } finally {
    if (conn) try { conn.release(); } catch (e) {}
  }
}

// Offset UTC em segundos para o timezone do usuário
async function getUserUtcOffsetSec(userId) {
  const tz = await getUserTimezone(userId);
  const local = new Date().toLocaleString('en-US', { timeZone: tz });
  const asDate = new Date(local);
  const offsetMin = -asDate.getTimezoneOffset();
  const offsetSec = offsetMin * 60;
  console.log('TZ DEBUG', { userId, tz, local, offsetMin, offsetSec });
  return offsetSec;
}



// Monta Date.toLocaleString com timezone do usuário
async function formatWithUserTimezone(userId, date) {
  const tz = await getUserTimezone(userId);
  return date.toLocaleString('pt-BR', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Para dosadora: prioridade = timezone da dosadora > do usuário > default
async function formatDoserWithTimezone(dosingDeviceRow) {
  const tz =
    dosingDeviceRow.timezone ||      // timezone da dosadora (dosing_devices.timezone)
    dosingDeviceRow.userTimezone ||  // timezone do usuário (users.timezone em JOIN)
    'America/Sao_Paulo';

  const lastMs = dosingDeviceRow.last_seen
    ? new Date(dosingDeviceRow.last_seen).getTime()
    : 0;

  if (!lastMs) return { tz, text: 'desconhecido' };

  const text = new Date(lastMs).toLocaleString('pt-BR', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return { tz, text };
}

module.exports = {
  getUserTimezone,
  getUserUtcOffsetSec,
  formatWithUserTimezone,
  formatDoserWithTimezone,
};
