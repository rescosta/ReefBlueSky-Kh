/**
 * Rotas de Dispositivos v1
 * Sync, health, register, comandos (ESP32 + dashboard)
 */

const express = require('express');
const { verifyDeviceToken, authUserMiddleware } = require('../middlewares/authMiddleware');
const { syncLimiter } = require('../middlewares/rateLimit');

const {
  registerDevice,
  syncMeasurements,
  deviceHealth,
  refreshDeviceToken,
  getKhReference,
  pollCommands,
  enqueuePumpCommand,
  enqueueKhCorrection,
  enqueueGenericCommand,
} = require('../controllers/deviceController');

const router = express.Router();

/**
 * Rotas que o ESP32 usa
 * Prefixo final: /api/v1/device/...
 */

// Registrar device com usuário/senha
// POST /api/v1/device/register
router.post('/register', registerDevice);

// Renovar JWT do device
// POST /api/v1/device/refresh-token
router.post('/refresh-token', refreshDeviceToken);

// Sync de medições (protegid0 por verifyDeviceToken + rate limit)
// POST /api/v1/device/sync
router.post('/sync', verifyDeviceToken, syncLimiter, syncMeasurements);

// Métricas de saúde do device
// POST /api/v1/device/health
router.post('/health', verifyDeviceToken, deviceHealth);

// KH de referência para o device
// GET /api/v1/device/kh-reference
router.get('/kh-reference', verifyDeviceToken, getKhReference);

// Polling de comandos pelo ESP32
// POST /api/v1/device/commands/poll
router.post('/commands/poll', verifyDeviceToken, pollCommands);

/**
 * Rotas que o usuário (dashboard) usa para mandar comando para o device
 * Todas protegidas por authUserMiddleware (JWT do usuário web)
 */

// Comando manual de bomba
// POST /api/v1/device/user/devices/:deviceId/command/pump
router.post(
  '/user/devices/:deviceId/command/pump',
  authUserMiddleware,
  enqueuePumpCommand
);

// Comando de correção de KH
// POST /api/v1/device/user/devices/:deviceId/command/kh-correction
router.post(
  '/user/devices/:deviceId/command/kh-correction',
  authUserMiddleware,
  enqueueKhCorrection
);

// Comando genérico (factoryreset, resetkh, testnow, setkhreference, etc.)
// POST /api/v1/device/user/devices/:deviceId/commands
router.post(
  '/user/devices/:deviceId/commands',
  authUserMiddleware,
  enqueueGenericCommand
);

module.exports = router;
