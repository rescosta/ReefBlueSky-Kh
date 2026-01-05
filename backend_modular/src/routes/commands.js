/**
 * Command Routes
 * Rotas de comandos
 */

const express = require('express');
const router = express.Router();
const commandController = require('../controllers/commandController');
const { authUserMiddleware, verifyToken } = require('../middleware/auth');

// Endpoints do dispositivo
router.post('/device/commands/poll', verifyToken, commandController.poll);
router.post('/device/commands/complete', verifyToken, commandController.complete);

// Endpoints do usuário
router.post('/user/devices/:deviceId/command', authUserMiddleware, commandController.create);
router.post('/user/devices/:deviceId/command/pump', authUserMiddleware, commandController.create);
router.post('/user/devices/:deviceId/command/kh-correction', authUserMiddleware, commandController.create);
router.post('/user/devices/:deviceId/commands', authUserMiddleware, commandController.getHistory);
router.delete('/user/devices/:deviceId/commands/:commandId', authUserMiddleware, commandController.cancel);

module.exports = router;
