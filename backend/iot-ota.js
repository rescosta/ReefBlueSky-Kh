// iot-ota.js - OTA routes e utilitários

const fs = require('fs');
const path = require('path');
const express = require('express');
const pool = require('./db-pool');

// Base dos bins no GitHub (commit fixo ou branch/tag)
const GITHUB_FW_BASE =
  'https://raw.githubusercontent.com/rescosta/ReefBlueSky-Kh/' +
  '9c2fdb253076b4848f2dbfa7a99a39133c6142df/backend/firmware/';

// Diretório local (fallback opcional)
const FW_DIR = path.join(__dirname, 'firmware');

// ======== HELPERS ========

/**
 * Busca arquivo .bin mais recente para tipo de device
 */
function getLatestFirmwareForType(type /* 'KH' | 'LCD' | 'DOSER' */) {
  const files = fs.existsSync(FW_DIR) ? fs.readdirSync(FW_DIR) : [];
  const prefix = `RBS_${type}_`;
  const candidates = files.filter(
    (f) => f.startsWith(prefix) && f.endsWith('.bin')
  );

  if (!candidates.length) return null;

  const parseVer = (name) => {
    const base = name.replace('.bin', ''); // RBS_KH_260118
    const parts = base.split('_'); // ["RBS","KH","260118"]
    return parts[2] || '000000';
  };

  return candidates.reduce((acc, cur) => {
    const va = parseInt(parseVer(acc), 10) || 0;
    const vb = parseInt(parseVer(cur), 10) || 0;
    return vb > va ? cur : acc;
  });
}

/**
 * Monta URL do .bin no GitHub a partir do nome
 */
function buildGithubFirmwareUrl(filename) {
  return GITHUB_FW_BASE + filename;
}

// ======== OTA LOG DATABASE ========

/**
 * Criar tabela device_ota_events se não existir
 */
async function initOtaLogsTable() {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Tabela para rastrear eventos OTA
    await conn.query(`
      CREATE TABLE IF NOT EXISTS device_ota_events (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        device_id BIGINT NOT NULL,
        device_type VARCHAR(20),
        event_type VARCHAR(50),
        firmware_version VARCHAR(100),
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_device_id (device_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_event_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('[OTA] device_ota_events table ready');
  } catch (err) {
    console.error('[OTA] Erro ao criar tabela device_ota_events:', err.message);
  } finally {
    if (conn) try { conn.release(); } catch (e) {}
  }
}

/**
 * Log de evento OTA no banco
 */
async function logOtaEvent(
  deviceId,
  deviceType,
  eventType,
  fwVersion,
  errorMessage = null
) {
  let conn;
  try {
    conn = await pool.getConnection();
    
    const result = await conn.query(
      `INSERT INTO device_ota_events 
       (device_id, device_type, event_type, firmware_version, error_message, timestamp)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [deviceId, deviceType, eventType, fwVersion, errorMessage]
    );
    
    console.log(`[OTA] Event logged: device=${deviceId}, type=${eventType}, fw=${fwVersion}`);
    return result;
  } catch (err) {
    console.error('[OTA] Erro ao logar evento OTA:', err.message);
    throw err;
  } finally {
    if (conn) try { conn.release(); } catch (e) {}
  }
}

/**
 * Buscar histórico de OTA de um device
 */
async function getOtaHistory(deviceId, limit = 20) {
  let conn;
  try {
    conn = await pool.getConnection();
    
    const rows = await conn.query(
      `SELECT * FROM device_ota_events 
       WHERE device_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [deviceId, limit]
    );
    
    return rows;
  } catch (err) {
    console.error('[OTA] Erro ao buscar histórico OTA:', err.message);
    throw err;
  } finally {
    if (conn) try { conn.release(); } catch (e) {}
  }
}

/**
 * Retorna último status OTA de um device
 */
async function getLatestOtaStatus(deviceId) {
  let conn;
  try {
    conn = await pool.getConnection();
    
    const rows = await conn.query(
      `SELECT * FROM device_ota_events 
       WHERE device_id = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [deviceId]
    );
    
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('[OTA] Erro ao buscar último status OTA:', err.message);
    throw err;
  } finally {
    if (conn) try { conn.release(); } catch (e) {}
  }
}

// ======== EXPRESS ROUTES ========

const router = express.Router();

/**
 * POST /api/device/ota-log
 * 
 * Recebe eventos OTA do ESP32
 * 
 * Body:
 * {
 *   "device_type": "KH",
 *   "event": "started" | "success" | "failed",
 *   "firmware_version": "RBS_KH_260120.bin",
 *   "timestamp": 1705779600,
 *   "error": "..." (opcional, se failed)
 * }
 */
router.post('/api/device/ota-log', async (req, res) => {
  try {
    // Validar JWT (assumindo middleware de auth já passou)
    const userId = req.user?.id;
    const deviceId = req.device?.id;

    if (!userId || !deviceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { device_type, event, firmware_version, error } = req.body;

    if (!device_type || !event || !firmware_version) {
      return res.status(400).json({
        error: 'Missing required fields: device_type, event, firmware_version',
      });
    }

    // Validar event type
    const validEvents = ['started', 'success', 'failed', 'webota_started', 'webota_success', 'webota_failed'];
    if (!validEvents.includes(event)) {
      return res.status(400).json({
        error: `Invalid event type. Must be one of: ${validEvents.join(', ')}`,
      });
    }

    console.log(
      `[OTA] /ota-log - device=${deviceId}, type=${device_type}, event=${event}, fw=${firmware_version}`
    );

    // Log no banco
    await logOtaEvent(deviceId, device_type, event, firmware_version, error || null);

    // Se foi sucesso, atualizar versão de firmware no devices
    if (event === 'success' || event === 'webota_success') {
      let conn;
      try {
        conn = await pool.getConnection();
        await conn.query(
          `UPDATE devices SET firmware_version = ? WHERE id = ?`,
          [firmware_version, deviceId]
        );
        console.log(`[OTA] Firmware version updated: device=${deviceId}, fw=${firmware_version}`);
      } finally {
        if (conn) try { conn.release(); } catch (e) {}
      }
    }

    // Enviar notificação Telegram se configurado (opcional)
    const msg = `🔄 OTA ${event.toUpperCase()}\n` +
                `Device: ${device_type}\n` +
                `Firmware: ${firmware_version}\n` +
                `${error ? 'Erro: ' + error : 'OK'}`;
    
    // (Implementar se tiver função sendTelegramForUser no seu backend)
    // await sendTelegramForUser(userId, msg);

    res.json({
      success: true,
      message: `OTA event logged: ${event}`,
      device_id: deviceId,
      event,
    });

  } catch (err) {
    console.error('[OTA] Erro em /ota-log:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/device/:id/ota-history
 * 
 * Retorna histórico de OTA events de um device
 */
router.get('/api/device/:id/ota-history', async (req, res) => {
  try {
    const userId = req.user?.id;
    const deviceId = parseInt(req.params.id, 10);

    if (!userId || !deviceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validar que device pertence ao usuário
    let conn;
    let deviceRows;
    try {
      conn = await pool.getConnection();
      deviceRows = await conn.query(
        `SELECT id FROM devices WHERE id = ? AND user_id = ? LIMIT 1`,
        [deviceId, userId]
      );
    } finally {
      if (conn) try { conn.release(); } catch (e) {}
    }

    if (deviceRows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // Buscar histórico
    const history = await getOtaHistory(deviceId, 50);

    res.json({
      device_id: deviceId,
      total: history.length,
      events: history,
    });

  } catch (err) {
    console.error('[OTA] Erro em /ota-history:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/device/:id/ota-status
 * 
 * Retorna último status OTA de um device
 */
router.get('/api/device/:id/ota-status', async (req, res) => {
  try {
    const userId = req.user?.id;
    const deviceId = parseInt(req.params.id, 10);

    if (!userId || !deviceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validar que device pertence ao usuário
    let conn;
    let deviceRows;
    try {
      conn = await pool.getConnection();
      deviceRows = await conn.query(
        `SELECT firmware_version FROM devices WHERE id = ? AND user_id = ? LIMIT 1`,
        [deviceId, userId]
      );
    } finally {
      if (conn) try { conn.release(); } catch (e) {}
    }

    if (deviceRows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = deviceRows[0];
    const lastOta = await getLatestOtaStatus(deviceId);

    res.json({
      device_id: deviceId,
      current_firmware: device.firmware_version,
      last_ota_event: lastOta,
    });

  } catch (err) {
    console.error('[OTA] Erro em /ota-status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ota/:type/latest.bin
 * 
 * Endpoint que o ESP32 chama para download de firmware
 * type: 'kh' | 'doser' | 'lcd'
 */
router.get('/ota/:type/latest.bin', async (req, res) => {
  try {
    const type = req.params.type.toUpperCase(); // 'KH', 'DOSER', 'LCD'

    if (!['KH', 'DOSER', 'LCD'].includes(type)) {
      return res.status(400).json({ error: 'Invalid firmware type' });
    }

    // Tentar buscar arquivo local primeiro
    let localFile = null;
    try {
      localFile = getLatestFirmwareForType(type);
    } catch (e) {
      console.error('[OTA] getLatestFirmwareForType error:', e.message);
    }

    let downloadUrl;

    // Se não achou ou veio tipo inválido, cai direto pro fallback
    if (!localFile || typeof localFile !== 'string') {
      console.log(`[OTA] Nenhum arquivo local para type=${type}, usando fallback GitHub`);
      downloadUrl = GITHUB_FW_BASE + `RBS_${type}_latest.bin`;
      return res.status(404).json({
        error: 'Firmware not found locally',
        message: 'Check GitHub repository or upload firmware file',
        fallback_url: downloadUrl,
      });
    }

    // Servir arquivo local
    const filepath = path.join(FW_DIR, localFile);

    // Validar que arquivo existe
    if (!fs.existsSync(filepath)) {
      console.warn(`[OTA] Arquivo local não encontrado: ${filepath}`);
      downloadUrl = buildGithubFirmwareUrl(localFile);
      return res.redirect(downloadUrl);
    }

    console.log(`[OTA] Servindo firmware local: ${localFile}`);
    return res.download(filepath);

  } catch (err) {
    console.error('[OTA] Erro em /ota/:type/latest.bin:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ======== EXPORTS ========

module.exports = {
  router,
  otaInit: initOtaLogsTable,
  getLatestFirmwareForType,
  buildGithubFirmwareUrl,
  logOtaEvent,
  getOtaHistory,
  getLatestOtaStatus,
};
