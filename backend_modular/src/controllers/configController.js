/**
 * Config Controller
 * Handlers para endpoints de configuração
 */

const deviceService = require('../services/deviceService');
const metricsService = require('../services/metricsService');
const logger = require('../utils/logger');

class ConfigController {
  /**
   * GET /api/v1/user/devices/:deviceId/config
   */
  async getConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;

      const result = await deviceService.getDeviceConfig(deviceId, userId);
      res.json(result);
    } catch (err) {
      logger.error('Get device config error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PUT /api/v1/user/devices/:deviceId/config
   */
  async updateConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;
      const config = req.body;

      const result = await deviceService.updateDeviceConfig(deviceId, userId, config);
      res.json(result);
    } catch (err) {
      logger.error('Update device config error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/user/devices/:deviceId/config/interval
   */
  async setInterval(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;
      const { interval } = req.body;

      if (!interval || interval < 60 || interval > 86400) {
        return res.status(400).json({
          success: false,
          message: 'Intervalo deve estar entre 60 e 86400 segundos'
        });
      }

      const result = await deviceService.updateDeviceConfig(deviceId, userId, {
        measurementInterval: interval
      });

      res.json(result);
    } catch (err) {
      logger.error('Set interval error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices/:deviceId/kh-config
   */
  async getKhConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;

      const result = await deviceService.getDeviceConfig(deviceId, userId);
      res.json({
        success: true,
        data: {
          khTarget: result.data.khTarget || 7.8,
          autoEnabled: result.data.autoEnabled || false
        }
      });
    } catch (err) {
      logger.error('Get KH config error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * PUT /api/v1/user/devices/:deviceId/kh-config
   */
  async updateKhConfig(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;
      const { khTarget, autoEnabled } = req.body;

      const result = await deviceService.updateDeviceConfig(deviceId, userId, {
        khTarget,
        autoEnabled
      });

      res.json(result);
    } catch (err) {
      logger.error('Update KH config error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices/:deviceId/kh-metrics
   */
  async getKhMetrics(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;
      const days = parseInt(req.query.days) || 7;

      const result = await metricsService.getKhMetrics(deviceId, userId, days);
      res.json(result);
    } catch (err) {
      logger.error('Get KH metrics error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices/:deviceId/display/kh-summary
   */
  async getDisplayKhSummary(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;

      const result = await metricsService.getDisplayKhSummary(deviceId, userId);
      res.json(result);
    } catch (err) {
      logger.error('Get display KH summary error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new ConfigController();
