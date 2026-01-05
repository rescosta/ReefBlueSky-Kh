/**
 * Config Routes
 * Rotas de configuração
 */

const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authUserMiddleware } = require('../middleware/auth');

// Configuração geral do device
router.get('/user/devices/:deviceId/config', authUserMiddleware, configController.getConfig);
router.put('/user/devices/:deviceId/config', authUserMiddleware, configController.updateConfig);
router.post('/user/devices/:deviceId/config/interval', authUserMiddleware, configController.setInterval);

// Configuração de KH
router.get('/user/devices/:deviceId/kh-config', authUserMiddleware, configController.getKhConfig);
router.put('/user/devices/:deviceId/kh-config', authUserMiddleware, configController.updateKhConfig);

// Métricas de KH
router.get('/user/devices/:deviceId/kh-metrics', authUserMiddleware, configController.getKhMetrics);

// Display KH Summary
router.get('/user/devices/:deviceId/display/kh-summary', authUserMiddleware, configController.getDisplayKhSummary);

module.exports = router;
