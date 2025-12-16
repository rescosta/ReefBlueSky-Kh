/**
 * Rotas de Usuário v1 - Dashboard Web
 * Perfil, devices, histórico, eventos e config KH/status
 */

const express = require('express');
const { authUserMiddleware } = require('../middlewares/authMiddleware');

const {
  getUserProfile,
  listUserDevices,
  getDeviceMeasurements,
  getDeviceEvents,
  getDeviceKhConfig,
  updateDeviceKhConfig,
  getDeviceStatusForUser,
} = require('../controllers/userController');

const router = express.Router();

// Perfil do usuário logado
// GET /api/v1/users/me
router.get('/me', authUserMiddleware, getUserProfile);

// Lista devices do usuário (rota REST nova)
// GET /api/v1/users/devices
router.get('/devices', authUserMiddleware, listUserDevices);

// Histórico de medições
// GET /api/v1/users/devices/:deviceId/measurements
router.get(
  '/devices/:deviceId/measurements',
  authUserMiddleware,
  getDeviceMeasurements
);

// Eventos do device
// GET /api/v1/users/devices/:deviceId/events
router.get(
  '/devices/:deviceId/events',
  authUserMiddleware,
  getDeviceEvents
);

/**
 * Rotas compatíveis com o dashboard legado
 * (dashboard-config.js chama /api/v1/user/devices/:deviceId/...)
 */

// KH config do device selecionado
// GET /api/v1/user/devices/:deviceId/kh-config
router.get(
  '/user/devices/:deviceId/kh-config',
  authUserMiddleware,
  getDeviceKhConfig
);

// Atualizar KH config
// PUT /api/v1/user/devices/:deviceId/kh-config
router.put(
  '/user/devices/:deviceId/kh-config',
  authUserMiddleware,
  updateDeviceKhConfig
);

// Status do device na tela de config
// GET /api/v1/user/devices/:deviceId/status
router.get(
  '/user/devices/:deviceId/status',
  authUserMiddleware,
  getDeviceStatusForUser
);

module.exports = router;
