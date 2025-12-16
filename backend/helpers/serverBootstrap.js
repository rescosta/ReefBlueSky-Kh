/**
 * Inicialização do Servidor + Monitor de Devices Offline
 * Executa automaticamente ao iniciar server.js
 */

const { mailTransporter, ALERT_FROM } = require('../config/mailer');
const pool = require('../config/database');

const OFFLINE_THRESHOLD_MINUTES = 5;
const CHECK_INTERVAL_MS = 30 * 1000; // 30s

async function checkDevicesOffline() {
  const conn = await pool.getConnection();

  try {
    const rows = await conn.query(`
      SELECT d.id, d.deviceId, d.userId, d.last_seen, d.offline_alert_sent, u.email
      FROM devices d
      JOIN users u ON u.id = d.userId
      WHERE d.last_seen IS NOT NULL
    `);

    const now = Date.now();
    const thresholdMs = OFFLINE_THRESHOLD_MINUTES * 60 * 1000;

    for (const row of rows) {
      const lastSeenMs = new Date(row.last_seen).getTime();
      const isOffline = now - lastSeenMs > thresholdMs;

      if (isOffline && !row.offline_alert_sent) {
        await mailTransporter.sendMail({
          from: ALERT_FROM,
          to: row.email,
          subject: `ReefBlueSky - Device ${row.deviceId} OFFLINE`,
          html: `O dispositivo **${row.deviceId}** está sem comunicação há mais de ${OFFLINE_THRESHOLD_MINUTES} minutos.`,
        });

        await conn.query('UPDATE devices SET offline_alert_sent = 1 WHERE id = ?', [
          row.id,
        ]);
      }
    }
  } catch (err) {
    console.error('[ALERT] Erro em checkDevicesOffline:', err.message);
  } finally {
    conn.release();
  }
}

const startServer = (app, PORT) => {
  // Inicia monitor offline
  setInterval(checkDevicesOffline, CHECK_INTERVAL_MS);
  console.log('[ALERT] Monitor de devices online/offline iniciado');

  // Inicia servidor HTTP
  app.listen(PORT, () => {
    console.log(`🚀 ReefBlueSky Server na porta ${PORT}`);
  });
};

module.exports = { startServer };
