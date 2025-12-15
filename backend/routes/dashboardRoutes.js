// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();

const { authUserMiddleware } = require('../middlewares/auth');
const userController = require('../controllers/userController');

// Endpoint usado pelo dashboard-common.js
// GET /api/v1/user/devices
router.get('/user/devices', authUserMiddleware, userController.getUserDevices);

module.exports = router;
