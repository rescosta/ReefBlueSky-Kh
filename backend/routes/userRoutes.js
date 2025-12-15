/**
 * Rotas de Usuário v1 - Dashboard Web
 * Listagem devices + histórico medições
 */
/**
 */
const express = require('express');
const { authUserMiddleware } = require('../middlewares/authMiddleware');
const {
  getUserProfile,
  listUserDevices,
  getDeviceMeasurements,
  getDeviceEvents
} = require('../controllers/userController');

const router = express.Router();

router.get('/me', authUserMiddleware, getUserProfile);
router.get('/devices', authUserMiddleware, listUserDevices);
router.get('/devices/:deviceId/measurements', authUserMiddleware, getDeviceMeasurements);
router.get('/devices/:deviceId/events', authUserMiddleware, getDeviceEvents);

module.exports = router;
