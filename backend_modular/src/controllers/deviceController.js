/**
 * Device Controller
 * Handlers para endpoints de dispositivos
 */

const deviceService = require('../services/deviceService');
const measurementService = require('../services/measurementService');
const metricsService = require('../services/metricsService');
const logger = require('../utils/logger');

class DeviceController {
  /**
   * POST /api/v1/device/register
   */
  async register(req, res, next) {
    try {
      const { deviceId, deviceName } = req.body;

      // Validação
      if (!deviceId) {
        throw new ValidationError('Device ID é obrigatório');
      }

      validateDeviceId(deviceId);

      // ✅ OBRIGATÓRIO: Exigir autenticação (SEM fallback!)
      if (!req.user || !req.user.id) {
        throw new UnauthorizedError('Autenticação requerida');
      }

      const userId = req.user.id;
      const result = await deviceService.registerDevice(userId, deviceName, deviceId);
      
      logger.info('Device registrado', { deviceId, userId });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/device/refresh-token
   */
  async refreshToken(req, res) {
    try {
      const { deviceId } = req.body;

      if (!deviceId) {
        return res.status(400).json({
          success: false,
          message: 'Device ID é obrigatório'
        });
      }

      const result = await deviceService.refreshDeviceToken(deviceId);
      res.json(result);
    } catch (err) {
      logger.error('Refresh device token error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/device/sync
   */
  async sync(req, res) {
    try {
      const { measurements } = req.body;
      const deviceId = req.deviceId;

      if (!deviceId) {
        return res.status(401).json({
          success: false,
          message: 'Device não autenticado'
        });
      }

      if (!Array.isArray(measurements)) {
        return res.status(400).json({
          success: false,
          message: 'Measurements deve ser um array'
        });
      }

      const result = await measurementService.syncMeasurements(deviceId, measurements);
      res.json(result);
    } catch (err) {
      logger.error('Sync error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/device/health
   */
  async health(req, res) {
    try {
      const { status, uptime, freeMemory, rssi } = req.body;
      const deviceId = req.deviceId;

      if (!deviceId) {
        return res.status(401).json({
          success: false,
          message: 'Device não autenticado'
        });
      }

      // Atualizar status do device
      await deviceService.updateDeviceStatus(deviceId, status || 'online');

      res.json({
        success: true,
        message: 'Health check recebido'
      });
    } catch (err) {
      logger.error('Health check error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/device/kh-reference
   */
  async khReference(req, res) {
    try {
      const deviceId = req.deviceId;

      if (!deviceId) {
        return res.status(401).json({
          success: false,
          message: 'Device não autenticado'
        });
      }

      // Buscar configuração do device
      const config = await deviceService.getDeviceConfig(deviceId);

      res.json({
        success: true,
        data: {
          khTarget: config.data.khTarget || 7.8,
          measurementInterval: config.data.measurementInterval || 300
        }
      });
    } catch (err) {
      logger.error('Get KH reference error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices
   */
  async list(req, res) {
    try {
      const userId = req.user.id;
      const result = await deviceService.getDevices(userId);
      res.json(result);
    } catch (err) {
      logger.error('List devices error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices/:deviceId/measurements
   */
  async getMeasurements(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const result = await measurementService.getMeasurements(deviceId, userId, limit, offset);
      res.json(result);
    } catch (err) {
      logger.error('Get measurements error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices/:deviceId/status
   */
  async getStatus(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;

      const device = await deviceService.getDevice(deviceId, userId);
      res.json(device);
    } catch (err) {
      logger.error('Get device status error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * GET /api/v1/user/devices/:deviceId/health
   */
  async getHealth(req, res) {
    try {
      const { deviceId } = req.params;

      const result = await metricsService.calculateDeviceHealth(deviceId);
      res.json(result);
    } catch (err) {
      logger.error('Get device health error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new DeviceController();
