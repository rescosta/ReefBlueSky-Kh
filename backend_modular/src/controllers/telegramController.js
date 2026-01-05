/**
 * Telegram Controller
 * Handlers para endpoints de Telegram
 */

const telegramService = require('../services/telegramService');
const logger = require('../utils/logger');

class TelegramController {
  /**
   * GET /api/v1/user/telegram-config
   */
  async getConfig(req, res) {
    try {
      const userId = req.user.id;
      const result = await telegramService.getConfig(userId);
      res.json(result);
    } catch (err) {
      logger.error('Get Telegram config error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PUT /api/v1/user/telegram-config
   */
  async updateConfig(req, res) {
    try {
      const userId = req.user.id;
      const { botToken, chatId, enabled } = req.body;

      const result = await telegramService.updateConfig(userId, botToken, chatId, enabled);
      res.json(result);
    } catch (err) {
      logger.error('Update Telegram config error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/user/telegram/test
   */
  async test(req, res) {
    try {
      const userId = req.user.id;
      const result = await telegramService.testConnection(userId);
      res.json(result);
    } catch (err) {
      logger.error('Telegram test error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new TelegramController();
