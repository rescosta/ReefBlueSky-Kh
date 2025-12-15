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
  getDeviceMeasurements
} = require('../controllers/userController');

const router = express.Router();

// Perfil e dispositivos do usuário autenticado
router.get('/me', authUserMiddleware, getUserProfile);
router.get('/devices', authUserMiddleware, listUserDevices);
router.get('/devices/:deviceId/measurements', authUserMiddleware, getDeviceMeasurements);

const { getDeviceEvents } = require('../controllers/userController');

router.get('/devices/:deviceId/events', authUserMiddleware, getDeviceEvents);


module.exports = router;
