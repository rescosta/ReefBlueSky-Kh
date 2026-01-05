/**
 * Command Controller
 * Handlers para endpoints de comandos
 */

const commandService = require('../services/commandService');
const logger = require('../utils/logger');

class CommandController {
  /**
   * POST /api/v1/user/devices/:deviceId/command
   */
  async create(req, res) {
    try {
      const { deviceId } = req.params;
      const { type, params } = req.body;
      const userId = req.user.id;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de comando é obrigatório'
        });
      }

      const result = await commandService.createCommand(deviceId, userId, type, params);
      res.json(result);
    } catch (err) {
      logger.error('Create command error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/device/commands/poll
   */
  async poll(req, res) {
    try {
      const deviceId = req.deviceId;
      const limit = parseInt(req.query.limit) || 10;

      if (!deviceId) {
        return res.status(401).json({
          success: false,
          message: 'Device não autenticado'
        });
      }

      const result = await commandService.getCommands(deviceId, limit);
      res.json(result);
    } catch (err) {
      logger.error('Poll commands error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * POST /api/v1/device/commands/complete
   */
  async complete(req, res, next) {
    try {
      const { commandId, result, error } = req.body;
      const deviceId = req.deviceId;

      if (!commandId) {
        throw new ValidationError('Command ID é obrigatório');
      }

      if (!deviceId) {
        throw new UnauthorizedError('Device não autenticado');
      }

      const commandResult = await commandService.completeCommand(
        commandId, 
        { result, error }, 
        deviceId
      );

      logger.info('Comando completado', { 
        commandId, 
        deviceId, 
        status: error ? 'failed' : 'completed' 
      });
      res.json(commandResult);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/user/devices/:deviceId/commands
   */
  async getHistory(req, res) {
    try {
      const { deviceId } = req.params;
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const result = await commandService.getCommandHistory(deviceId, userId, limit, offset);
      res.json(result);
    } catch (err) {
      logger.error('Get command history error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  /**
   * DELETE /api/v1/user/devices/:deviceId/commands/:commandId
   */
  async cancel(req, res) {
    try {
      const { deviceId, commandId } = req.params;
      const userId = req.user.id;

      const result = await commandService.cancelCommand(commandId, userId);
      res.json(result);
    } catch (err) {
      logger.error('Cancel command error', { error: err.message });
      res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new CommandController();
