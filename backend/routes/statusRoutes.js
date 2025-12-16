// routes/statusRoutes.js

const express = require('express');
const { getStatus, getHealth } = require('../controllers/statusController');

const router = express.Router();

router.get('/status', getStatus);
router.get('/health', getHealth);

module.exports = router;
