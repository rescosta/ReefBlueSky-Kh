// display-endpoints.js
const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Use as mesmas variáveis do server.js (ajuste se o nome for diferente)
const JWT_SECRET = process.env.JWT_SECRET || 'seu-secret-super-seguro-aqui-mude-em-producao';
const JWT_DISPLAY_EXPIRY = process.env.JWT_DISPLAY_EXPIRY || '30d'; // 30 dias
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '90d'; // 90 dias

// IMPORTAR POOL DO SERVER
// Se preferir, exporte o pool do server.js e faça require aqui.
// Para ficar simples, reimporte mariadb e crie um pool menor:
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'reefapp',
  password: process.env.DB_PASSWORD || 'reef',
  database: process.env.DB_NAME || 'reefbluesky',
  connectionLimit: 5
});

// Helper para gerar tokens do display
function generateDisplayToken(payload, expiresIn) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * POST /api/display/register
 * Body: { email, password, displayId, deviceType: "display", mainDeviceId }
 */
router.post('/register', async (req, res) => {
  console.log('[DISPLAY] POST /api/display/register');

  const { email, password, displayId, deviceType, mainDeviceId } = req.body;

  if (!email || !password || !displayId || deviceType !== 'display') {
    return res.status(400).json({
      success: false,
      message: 'Parâmetros inválidos'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // 1) Verificar usuário
    const users = await conn.query(
      'SELECT id, email, passwordHash, isVerified, timezone FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!users || users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas para display'
      });
    }

    const user = users[0];
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Conta ainda não verificada'
      });
    }

    // 2) Verificar senha
    const bcrypt = require('bcrypt');
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas para display'
      });
    }

    // 3) Opcional: registrar display em tabela própria (displays)
    // Ex.: INSERT IGNORE INTO displays (id, userId, mainDeviceId, createdAt) VALUES (...)
    // Aqui podemos só garantir que mainDeviceId veio ou deixar opcional
    const mainDevices = [];
    if (mainDeviceId) {
      mainDevices.push({ id: mainDeviceId, name: 'Main Device', local_ip: null });
    }

    // 4) Gerar tokens
    const displayPayload = {
      type: 'display',
      displayId,
      userId: Number(user.id)
    };

    const displayToken = generateDisplayToken(displayPayload, JWT_DISPLAY_EXPIRY);
    const refreshToken = generateDisplayToken(
      { ...displayPayload, type: 'refresh' },
      JWT_REFRESH_EXPIRY
    );

    // Tempo em segundos para o firmware
    const expiresInSeconds =
      typeof JWT_DISPLAY_EXPIRY === 'string' && JWT_DISPLAY_EXPIRY.endsWith('d')
        ? parseInt(JWT_DISPLAY_EXPIRY) * 24 * 60 * 60
        : 30 * 24 * 60 * 60;

    const userTimezone = user.timezone || 'UTC';

    return res.json({
      success: true,
      displayToken,
      refreshToken,
      expiresIn: expiresInSeconds,
      mainDevices,
      userTimezone,
    });
  } catch (err) {
    console.error('[DISPLAY] ERRO /register:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao registrar display'
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (e) {
        console.error('[DISPLAY] Erro ao liberar conexão:', e.message);
      }
    }
  }
});

/**
 * Middleware para autenticar token de display
 */
function authDisplayMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token não fornecido'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'display') {
      return res.status(401).json({
        success: false,
        message: 'Token inválido para display'
      });
    }
    req.display = decoded;
    next();
  } catch (err) {
    console.error('[DISPLAY] authDisplayMiddleware error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado'
    });
  }
}

/**
 * POST /api/display/ping
 * Cabeçalho: Authorization: Bearer <displayToken>
 * Body: { mainDeviceId }
 * Marca o LCD como online para o KH associado
 */
router.post('/ping', authDisplayMiddleware, async (req, res) => {
  console.log('[DISPLAY] POST /api/display/ping');

  const { mainDeviceId } = req.body || {};
  if (!mainDeviceId) {
    return res.status(400).json({
      success: false,
      message: 'mainDeviceId é obrigatório'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // monta timestamp YYYYMMDDHHMMSS usando o horário do servidor
    const now = new Date();
    const lcdTimestamp = now
      .toISOString()               // 2025-12-30T12:34:56.789Z
      .replace(/[-:TZ.]/g, '')     // 20251230123456789
      .slice(0, 14);               // 20251230123456

    const result = await conn.query(
      `UPDATE devices
         SET lcd_status   = 'online',
             lcd_last_seen = ?
       WHERE deviceId = ? AND type = 'KH'`,
      [lcdTimestamp, mainDeviceId]
    );

    console.log('[DISPLAY] ping', mainDeviceId, 'lcd_last_seen=', lcdTimestamp);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: 'Device principal não encontrado'
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[DISPLAY] ERRO /ping:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao registrar ping do display'
    });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e) {
        console.error('[DISPLAY] Erro ao liberar conexão:', e.message);
      }
    }
  }
});

/**
 * GET /api/display/latest?deviceId=...
 * Cabeçalho: Authorization: Bearer <displayToken>
 * Retorna última medição de KH para o deviceId
 */
router.get('/latest', authDisplayMiddleware, async (req, res) => {
  console.log('[DISPLAY] GET /api/display/latest');

  const deviceId = req.query.deviceId;
  if (!deviceId) {
    return res.status(400).json({
      success: false,
      message: 'deviceId não fornecido'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(
      `SELECT 
         kh,
         MIN(kh) OVER (PARTITION BY deviceId)       AS min,
         MAX(kh) OVER (PARTITION BY deviceId)       AS max,
         STDDEV(kh) OVER (
           PARTITION BY deviceId 
           ORDER BY timestamp DESC 
           ROWS BETWEEN 100 PRECEDING AND CURRENT ROW
         )                                         AS var,
         temperature AS temp,
         phref       AS ph_ref,
         phsample    AS ph_sample,
         timestamp,
         status,
         confidence,
         u.timezone    AS userTimezone
       FROM measurements
       JOIN devices d ON d.deviceId = measurements.deviceId
       JOIN users   u ON u.id = d.userId
       WHERE deviceId = ?
       ORDER BY timestamp DESC
       LIMIT 1`,
      [deviceId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Nenhuma medição encontrada para este deviceId'
      });
    }

    const m = rows[0];

    return res.json({
      success: true,
      kh: m.kh,
      min: m.min,
      max: m.max,
      var: m.var,
      temp: m.temp,
      ph_ref: m.ph_ref,
      ph_sample: m.ph_sample,
      timestamp: m.timestamp,
      status: m.status || 'unknown',
      confidence: m.confidence || 0,
      userTimezone: m.userTimezone || 'UTC', 

    });
  } catch (err) {
    console.error('[DISPLAY] ERRO /latest:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar última medição'
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (e) {
        console.error('[DISPLAY] Erro ao liberar conexão:', e.message);
      }
    }
  }
});

/**
 * POST /api/display/refresh
 * Body: { refreshToken }
 */
router.post('/refresh', authDisplayMiddleware, async (req, res) => {
  console.log('[DISPLAY] POST /api/display/refresh');

  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'refreshToken não fornecido'
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    if (decoded.type !== 'refresh' || !decoded.displayId) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token inválido'
      });
    }

    const newPayload = {
      type: 'display',
      displayId: decoded.displayId,
      userId: decoded.userId
    };

    const newToken = generateDisplayToken(newPayload, JWT_DISPLAY_EXPIRY);

    const expiresInSeconds =
      typeof JWT_DISPLAY_EXPIRY === 'string' && JWT_DISPLAY_EXPIRY.endsWith('d')
        ? parseInt(JWT_DISPLAY_EXPIRY) * 24 * 60 * 60
        : 30 * 24 * 60 * 60;

    return res.json({
      success: true,
      displayToken: newToken,
      expiresIn: expiresInSeconds
    });
  } catch (err) {
    console.error('[DISPLAY] ERRO /refresh:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Refresh token inválido ou expirado'
    });
  }
});

module.exports = router;
