/**
 * Controlador de Dispositivos - Lógica de sync, health, comandos e registro
 * Centraliza toda interação com devices e measurements
 */
/**
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Device = require('../models/Device');
const Measurement = require('../models/Measurement');
const { enqueueCommand, pollCommands: pollDbCommands } = require('../helpers/mqttHelper');
const pool = require('../config/database');
const { generateToken, generateRefreshToken } = require('../config/jwt');

/**
 * POST /api/v1/device/register
 * [SEGURANÇA] Registrar novo dispositivo (ESP32 → servidor)
 */
const registerDevice = async (req, res) => {
  console.log('[API] POST /api/v1/device/register');

  const { deviceId, username, password, local_ip } = req.body;

  if (!deviceId || !username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Campos obrigatórios: deviceId, username, password'
    });
  }

  // Validar formato de deviceId
  if (!/^[a-zA-Z0-9-]{10,50}$/.test(deviceId)) {
    return res.status(400).json({
      success: false,
      message: 'deviceId inválido'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Buscar usuário pelo email (username)
    const userRows = await conn.query(
      'SELECT id, email, passwordHash, isVerified FROM users WHERE email = ? LIMIT 1',
      [username]
    );
    if (!userRows || userRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Usuário não encontrado para este username'
      });
    }

    const user = userRows[0];
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Usuário ainda não verificado'
      });
    }

    // Validar senha enviada pelo device contra passwordHash do usuário
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas para este usuário'
      });
    }

    const now = new Date();

    // Criar/atualizar device já vinculando userId
    await conn.query(
      `INSERT INTO devices (deviceId, userId, name, local_ip, last_seen, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         userId = VALUES(userId),
         name = VALUES(name),
         local_ip = VALUES(local_ip),
         last_seen = VALUES(last_seen),
         updatedAt = VALUES(updatedAt)`,
      [deviceId, user.id, 'KH Auto-Register', local_ip || null, now, now, now]
    );

    // Gerar tokens
    const token = generateToken(user.id, deviceId);
    const refreshToken = generateRefreshToken(user.id, deviceId);

    console.log('[API] Dispositivo registrado com sucesso:', deviceId, user.id);
    return res.status(201).json({
      success: true,
      message: 'Dispositivo registrado com sucesso',
      data: {
        deviceId,
        userId: user.id,
        token,
        refreshToken,
        expiresIn: 3600 // 1 hora em segundos
      }
    });
  } catch (err) {
    console.error('DEVICE ERROR /device/register:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao registrar dispositivo',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
};

/**
 * POST /api/v1/device/refresh-token
 * [SEGURANÇA] Renovar token JWT do device
 */
const refreshDeviceToken = (req, res) => {
  console.log('[API] POST /api/v1/device/refresh-token');
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token não fornecido'
    });
  }

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Refresh token inválido ou expirado'
      });
    }

    const newToken = generateToken(decoded.userId, decoded.deviceId);
    return res.json({
      success: true,
      data: {
        token: newToken,
        expiresIn: 3600
      }
    });
  });
};

/**
 * POST /api/v1/device/sync
 * [PROTEGIDO] Sincronização de medições do device
 */
const syncMeasurements = async (req, res) => {
  console.log('SYNC BODY =>', JSON.stringify(req.body));

  const { measurements, local_ip } = req.body;
  const deviceId = req.user.deviceId;

  console.log('[API] POST /api/v1/device/sync - Device:', deviceId);

  // Validação básica
  if (!Array.isArray(measurements)) {
    return res.status(400).json({
      success: false,
      message: 'Medições devem ser um array'
    });
  }
  if (measurements.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Array de medições vazio'
    });
  }
  for (const m of measurements) {
    if (!m.timestamp || typeof m.kh !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Medição inválida: faltam timestamp ou kh'
      });
    }
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // 1) Auto‑registro do device
    await conn.query(
      `INSERT INTO devices (deviceId, name, createdAt, updatedAt)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE updatedAt = NOW()`,
      [deviceId, 'KH Auto-Register']
    );

    // 2) Atualizar IP local se veio no body
    if (local_ip) {
      await conn.query(
        'UPDATE devices SET local_ip = COALESCE(?, local_ip), last_seen = NOW(), updatedAt = NOW() WHERE deviceId = ?',
        [local_ip || null, deviceId]
      );
    }

    // 3) Gravar medições
    const insertedCount = await Measurement.bulkInsert(deviceId, measurements);

    console.log(`[DB] ✅ ${insertedCount}/${measurements.length} medições gravadas`);

    return res.json({
      success: true,
      message: `${insertedCount} medições sincronizadas com sucesso`,
      data: {
        synced: insertedCount,
        failed: measurements.length - insertedCount,
        nextSyncTime: Date.now() + 300000
      }
    });
  } catch (err) {
    console.error('[DB] Erro crítico ao sincronizar:', err.message, err.code);
    let statusCode = 503;
    let errorMsg = 'Erro ao conectar ao banco de dados';

    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      errorMsg = 'Credenciais do banco incorretas';
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      errorMsg = 'Banco de dados não existe';
    } else if (err.message.includes('timeout')) {
      errorMsg = 'Timeout ao conectar (MariaDB pode estar DOWN)';
    }

    return res.status(statusCode).json({
      success: false,
      message: errorMsg,
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
        console.log('[DB] Conexão liberada');
      } catch (releaseErr) {
        console.error('[DB] Erro ao liberar conexão:', releaseErr.message);
      }
    }
  }
};

/**
 * POST /api/v1/device/health
 * [PROTEGIDO] Métricas de saúde do device
 */
const deviceHealth = async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    const userId = req.user.userId; // assumindo que o token carrega userId
    console.log('[API] POST /api/v1/device/health - Device:', deviceId);

    const health = req.body || {};
    if (
      typeof health.cpu_usage !== 'number' ||
      typeof health.memory_usage !== 'number' ||
      typeof health.uptime !== 'number'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Métricas de saúde inválidas'
      });
    }

    console.log('[API] Health metrics:', {
      cpu: health.cpu_usage + '%',
      memory: health.memory_usage + '%',
      uptime: health.uptime + 's'
    });

    await pool.query(
      'UPDATE devices SET last_seen = NOW(), updatedAt = NOW() WHERE deviceId = ?',
      [deviceId]
    );

    await pool.query(
      `INSERT INTO device_health (userId, deviceId, cpu_usage, mem_usage, storage_usage, wifi_rssi, uptime_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        deviceId,
        health.cpu_usage,
        health.memory_usage,
        health.storage_usage ?? null,
        health.wifi_rssi ?? null,
        health.uptime
      ]
    );

    return res.json({
      success: true,
      message: 'Métricas de saúde recebidas'
    });
  } catch (err) {
    console.error('Error saving device health', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * GET /api/v1/device/kh-reference
 * [PROTEGIDO] Obtém KH de referência do device
 */
const getKhReference = async (req, res) => {
  try {
    const deviceId = req.user.deviceId;
    const conn = await pool.getConnection();
    try {
      const rows = await conn.query(
        'SELECT khreference FROM devices WHERE deviceId = ? LIMIT 1',
        [deviceId]
      );
      if (!rows.length || rows[0].khreference == null) {
        return res.json({ success: true, data: null });
      }
      return res.json({
        success: true,
        data: { khreference: rows[0].khreference }
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('GET /api/v1/device/kh-reference error', err.message);
    return res.status(500).json({
      success: false,
      error: 'servererror'
    });
  }
};

/**
 * POST /api/v1/device/commands/poll
 * [PROTEGIDO] ESP busca comandos pendentes
 */
const pollCommands = async (req, res) => {
  const deviceId = req.user.deviceId;
  try {
    const commands = await pollDbCommands(deviceId);
    return res.json({ success: true, data: commands });
  } catch (err) {
    console.error('POST /device/commands/poll error', err);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar comandos'
    });
  }
};

/**
 * POST /api/v1/user/devices/:deviceId/command/pump
 * Usuário enfileira comando manual de bomba
 */
const enqueuePumpCommand = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;
    const { pumpId, direction, seconds } = req.body;

    if (!pumpId || !seconds || seconds <= 0) {
      return res.status(400).json({
        success: false,
        message: 'pumpId/seconds inválidos'
      });
    }

    const chk = await pool.query(
      'SELECT id FROM devices WHERE deviceId = ? AND userId = ? LIMIT 1',
      [deviceId, userId]
    );
    if (!chk.length) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário'
      });
    }

    const dir = direction === 'reverse' ? 'reverse' : 'forward';
    const cmd = await enqueueCommand(deviceId, 'manualpump', {
      pumpId,
      direction: dir,
      seconds
    });

    console.log('[CMD] manualpump enfileirado', deviceId, cmd);
    return res.json({
      success: true,
      data: { commandId: cmd.id }
    });
  } catch (err) {
    console.error('POST /command/pump error', err);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enviar comando de bomba'
    });
  }
};

/**
 * POST /api/v1/user/devices/:deviceId/command/kh-correction
 * Usuário enfileira comando de correção de KH
 */
const enqueueKhCorrection = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;
    const { volume } = req.body;

    if (typeof volume !== 'number' || volume <= 0) {
      return res.status(400).json({
        success: false,
        message: 'volume inválido'
      });
    }

    const chk = await pool.query(
      'SELECT id FROM devices WHERE deviceId = ? AND userId = ? LIMIT 1',
      [deviceId, userId]
    );
    if (!chk.length) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário'
      });
    }

    const cmd = await enqueueCommand(deviceId, 'khcorrection', { volume });
    console.log('[CMD] khcorrection enfileirado', deviceId, cmd);

    return res.json({
      success: true,
      data: { commandId: cmd.id }
    });
  } catch (err) {
    console.error('POST /command/kh-correction error', err);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enviar correção de KH'
    });
  }
};

/**
 * POST /api/v1/user/devices/:deviceId/commands
 * Enfileira comando genérico (factoryreset, resetkh, testnow, etc.)
 */
const enqueueGenericCommand = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;
  const { type, value } = req.body;

  if (!type) {
    return res.status(400).json({
      success: false,
      message: 'type obrigatório'
    });
  }

  try {
    const chk = await pool.query(
      'SELECT id FROM devices WHERE deviceId = ? AND userId = ? LIMIT 1',
      [deviceId, userId]
    );
    if (!chk.length) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário'
      });
    }

    let dbType = type;
    let payload = null;

    switch (type) {
      case 'factoryreset':
      case 'resetkh':
      case 'testnow':
      case 'abort':
        dbType = type;
        break;
      case 'setkhreference':
        dbType = 'setkhreference';
        payload = value;
        break;
      case 'setkhtarget':
        dbType = 'setkhtarget';
        payload = value;
        break;
      case 'setintervalminutes':
        dbType = 'setintervalminutes';
        payload = { minutes: value };
        break;
      case 'khcorrection':
        dbType = 'khcorrection';
        payload = { volume: value };
        break;
      default:
        dbType = type;
        payload = value ?? null;
        break;
    }

    const cmd = await enqueueCommand(deviceId, dbType, payload);
    console.log('[CMD] comando enfileirado', deviceId, type, dbType, payload, 'commandId', cmd.id);

    return res.json({
      success: true,
      data: { commandId: cmd.id, type, dbType }
    });
  } catch (err) {
    console.error('POST /user/devices/:deviceId/commands error', err);
    return res.status(500).json({
      success: false,
      message: 'Erro ao enfileirar comando'
    });
  }
};

module.exports = {
  registerDevice,
  refreshDeviceToken,
  syncMeasurements,
  deviceHealth,
  getKhReference,
  pollCommands,
  enqueuePumpCommand,
  enqueueKhCorrection,
  enqueueGenericCommand
};
