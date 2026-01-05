/**
 * Telegram Routes
 * Rotas de Telegram
 */

const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');
const { authUserMiddleware } = require('../middleware/auth');

// Configuração de Telegram
router.get('/user/telegram-config', authUserMiddleware, telegramController.getConfig);
router.put('/user/telegram-config', authUserMiddleware, telegramController.updateConfig);

// Testar Telegram
router.post('/user/telegram/test', authUserMiddleware, telegramController.test);

module.exports = router;
