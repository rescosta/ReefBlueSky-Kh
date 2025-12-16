/**
 * Rotas de Usuário v1 - Dashboard Web
 * Listagem devices + histórico medições
 */

const express = require('express');
const { authUserMiddleware } = require('../middlewares/authMiddleware');

const {
  getUserProfile,
  listUserDevices,
  getDeviceMeasurements,
  getDeviceEvents,
} = require('../controllers/userController');

const router = express.Router();

// GET /api/v1/users/me
router.get('/me', authUserMiddleware, getUserProfile);

// GET /api/v1/users/devices
router.get('/devices', authUserMiddleware, listUserDevices);

// GET /api/v1/users/devices/:deviceId/measurements
router.get(
  '/devices/:deviceId/measurements',
  authUserMiddleware,
  getDeviceMeasurements
);

// GET /api/v1/users/devices/:deviceId/events
router.get('/devices/:deviceId/events', authUserMiddleware, getDeviceEvents);

module.exports = router;
