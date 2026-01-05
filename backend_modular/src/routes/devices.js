/**
 * Device Routes
 * Rotas de dispositivos
 */

const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');
const { authUserMiddleware, verifyToken } = require('../middleware/auth');
const { authLimiter, syncLimiter } = require('../middleware/rateLimiter');

// Endpoints do ESP32 (sem autenticação de usuário)
router.post('/device/register', authLimiter, deviceController.register);
router.post('/device/refresh-token', deviceController.refreshToken);
router.post('/device/sync', verifyToken, syncLimiter, deviceController.sync);
router.post('/device/health', verifyToken, deviceController.health);
router.get('/device/kh-reference', verifyToken, deviceController.khReference);

// Endpoints do usuário (web)
router.get('/user/devices', authUserMiddleware, deviceController.list);
router.get('/user/devices/:deviceId/measurements', authUserMiddleware, deviceController.getMeasurements);
router.get('/user/devices/:deviceId/status', authUserMiddleware, deviceController.getStatus);
router.get('/user/devices/:deviceId/health', authUserMiddleware, deviceController.getHealth);

module.exports = router;
