/**
 * Telegram Service
 * Integração com Telegram Bot API
 */

const axios = require('axios');
const pool = require('../config/database');
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = require('../config/environment');
const logger = require('../utils/logger');

class TelegramService {
  /**
   * Envia mensagem para chat específico
   */
  async sendMessage(chatId, text) {
    if (!TELEGRAM_TOKEN || !chatId) {
      logger.warn('Telegram not configured or chatId missing');
      return { success: false, message: 'Telegram não configurado' };
    }

    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      });

      if (response.status !== 200) {
        throw new Error(`Telegram error: ${response.status}`);
      }

      logger.info('Telegram message sent', { chatId });
      return { success: true, messageId: response.data.result.message_id };
    } catch (err) {
      logger.error('Send Telegram message error', { chatId, error: err.message });
      return { success: false, message: err.message };
    }
  }

  /**
   * Envia mensagem para usuário
   */
  async sendMessageToUser(userId, text) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Buscar configuração Telegram do usuário
      const rows = await conn.query(
        `SELECT telegram_bot_token, telegram_chat_id, telegram_enabled
         FROM users WHERE id = ?`,
        [userId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      const user = rows[0];

      if (!user.telegram_enabled || !user.telegram_bot_token || !user.telegram_chat_id) {
        logger.warn('Telegram not configured for user', { userId });
        return { success: false, message: 'Telegram não configurado para este usuário' };
      }

      // Enviar mensagem
      const url = `https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: user.telegram_chat_id,
        text,
        parse_mode: 'Markdown'
      });

      logger.info('Telegram message sent to user', { userId });
      return { success: true, messageId: response.data.result.message_id };
    } catch (err) {
      logger.error('Send Telegram to user error', { userId, error: err.message });
      return { success: false, message: err.message };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Testa conexão Telegram
   */
  async testConnection(userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      // Buscar configuração
      const rows = await conn.query(
        `SELECT telegram_bot_token, telegram_chat_id FROM users WHERE id = ?`,
        [userId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      const user = rows[0];

      if (!user.telegram_bot_token || !user.telegram_chat_id) {
        return { success: false, message: 'Telegram não configurado' };
      }

      // Testar envio
      const url = `https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`;
      const response = await axios.post(url, {
        chat_id: user.telegram_chat_id,
        text: '✓ ReefBlueSky - Conexão Telegram OK!'
      });

      logger.info('Telegram test successful', { userId });
      return { success: true, message: 'Conexão Telegram funcionando!' };
    } catch (err) {
      logger.error('Telegram test error', { userId, error: err.message });
      return { success: false, message: `Erro: ${err.message}` };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Obtém configuração Telegram do usuário
   */
  async getConfig(userId) {
    let conn;
    try {
      conn = await pool.getConnection();

      const rows = await conn.query(
        `SELECT telegram_bot_token, telegram_chat_id, telegram_enabled FROM users WHERE id = ?`,
        [userId]
      );

      if (!rows || rows.length === 0) {
        throw new Error('Usuário não encontrado');
      }

      const user = rows[0];

      return {
        success: true,
        data: {
          enabled: user.telegram_enabled || false,
          botToken: user.telegram_bot_token ? '***' : null,
          chatId: user.telegram_chat_id || null
        }
      };
    } catch (err) {
      logger.error('Get Telegram config error', { userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Atualiza configuração Telegram
   */
  async updateConfig(userId, botToken, chatId, enabled) {
    let conn;
    try {
      conn = await pool.getConnection();

      await conn.query(
        `UPDATE users SET telegram_bot_token = ?, telegram_chat_id = ?, telegram_enabled = ?
         WHERE id = ?`,
        [botToken || null, chatId || null, enabled || false, userId]
      );

      logger.info('Telegram config updated', { userId });

      return { success: true, message: 'Configuração atualizada' };
    } catch (err) {
      logger.error('Update Telegram config error', { userId, error: err.message });
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Envia notificação de alerta
   */
  async sendAlert(userId, deviceId, alertType, value, threshold) {
    const messages = {
      kh_low: `⚠️ *Alerta KH Baixo*\nDispositive: ${deviceId}\nValor: ${value}\nMínimo: ${threshold}`,
      kh_high: `⚠️ *Alerta KH Alto*\nDispositive: ${deviceId}\nValor: ${value}\nMáximo: ${threshold}`,
      device_offline: `⚠️ *Dispositivo Offline*\nDispositive: ${deviceId}`,
      device_error: `❌ *Erro no Dispositivo*\nDispositive: ${deviceId}`
    };

    const message = messages[alertType] || `Alerta: ${alertType}`;
    return this.sendMessageToUser(userId, message);
  }
}

module.exports = new TelegramService();
