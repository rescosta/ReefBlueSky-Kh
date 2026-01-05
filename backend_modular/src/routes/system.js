/**
 * System Routes
 * Rotas de sistema
 */

const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const { authUserMiddleware, requireDev } = require('../middleware/auth');

// Status e health
router.get('/status', systemController.status);
router.get('/health', systemController.health);

// Dashboard exemplo
router.get('/dashboard/example', authUserMiddleware, systemController.dashboardExample);

// Development endpoints
router.get('/dev/logs', authUserMiddleware, requireDev, systemController.getLogs);
router.get('/dev/server-console', authUserMiddleware, requireDev, systemController.getServerConsole);
router.get('/dev/device-console/:deviceId', authUserMiddleware, requireDev, systemController.getDeviceConsole);

module.exports = router;
