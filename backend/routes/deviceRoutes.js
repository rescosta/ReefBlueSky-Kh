/**
 * Rotas de Dispositivos v1
 * Sync, health, register, comandos
 */
/**
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
  enqueueGenericCommand
} = require('../controllers/deviceController');

const router = express.Router();

// Rotas que o ESP32 usa
router.post('/register', registerDevice);
router.post('/refresh-token', refreshDeviceToken);
router.post('/sync', verifyDeviceToken, syncLimiter, syncMeasurements);
router.post('/health', verifyDeviceToken, deviceHealth);
router.get('/kh-reference', verifyDeviceToken, getKhReference);
router.post('/commands/poll', verifyDeviceToken, pollCommands);

// Rotas que o usuário (dashboard) usa para mandar comando para o device
router.post('/user/devices/:deviceId/command/pump', authUserMiddleware, enqueuePumpCommand);
router.post('/user/devices/:deviceId/command/kh-correction', authUserMiddleware, enqueueKhCorrection);
router.post('/user/devices/:deviceId/commands', authUserMiddleware, enqueueGenericCommand);

module.exports = router;
