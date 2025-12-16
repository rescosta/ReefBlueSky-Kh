/**
 * Helper MQTT - Integração com broker para fallback de comandos
 * Enfileiramento e polling de comandos para ESP32 via tabela device_commands
 */

const pool = require('../config/database');

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

/**
 * Enfileira comando no banco (substitui Map em memória)
 *
 * @param {string} deviceId
 * @param {string} type
 * @param {object|null} payload
 * @returns {Promise<{id: number, type: string}>}
 */
const enqueueCommand = async (deviceId, type, payload = null) => {
  const conn = await pool.getConnection();

  try {
    const now = new Date();
    const jsonPayload = payload ? JSON.stringify(payload) : null;

    const result = await conn.query(
      `INSERT INTO device_commands (deviceId, type, payload, status, createdAt, updatedAt)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [deviceId, type, jsonPayload, now, now]
    );

    const cmd = { id: Number(result.insertId), type };
    console.log('[MQTT-QUEUE] comando enfileirado', { deviceId, type, payload, commandId: cmd.id });
    return cmd;
  } finally {
    conn.release();
  }
};

/**
 * ESP32 faz polling de comandos pendentes
 *
 * @param {string} deviceId
 * @returns {Promise<Array<{id: number, type: string, payload: any}>>}
 */
const pollCommands = async (deviceId) => {
  const conn = await pool.getConnection();

  try {
    const rows = await conn.query(
      `SELECT id, type, payload
       FROM device_commands
       WHERE deviceId = ? AND status = 'pending'
       ORDER BY createdAt ASC
       LIMIT 1`,
      [deviceId]
    );

    if (rows.length > 0) {
      // Marca como "in progress"
      await conn.query(
        `UPDATE device_commands
         SET status = 'inprogress', updatedAt = NOW()
         WHERE id = ?`,
        [rows[0].id]
      );

      // Normaliza payload
      let payload = null;
      if (rows[0].payload) {
        try {
          payload = JSON.parse(rows[0].payload);
        } catch (e) {
          console.error('Erro ao parsear payload MQTT:', e.message);
        }
      }

      const cmd = {
        id: Number(rows[0].id),
        type: rows[0].type,
        payload,
      };

      console.log('[MQTT-QUEUE] comando entregue para device', { deviceId, cmd });
      return [cmd];
    }

    // Sem comandos pendentes
    return [];
  } finally {
    conn.release();
  }
};

/**
 * Inicializa cliente MQTT (fallback comentado no original)
 */
const initMQTT = () => {
  // TODO: Descomentar quando MQTT estiver pronto
  console.log('[MQTT] Broker configurado:', MQTT_BROKER);
  // mqtt.connect(...)
};

module.exports = { enqueueCommand, pollCommands, initMQTT };
