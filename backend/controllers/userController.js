/**
 * Controlador de Usuários - Dashboard e listagem de dispositivos
 * Perfil, /user/devices, histórico, eventos e config KH/status
 */

const Device = require('../models/Device');
const Measurement = require('../models/Measurement');
const User = require('../models/User');
const DeviceEvent = require('../models/DeviceEvent');

/**
 * Dados do usuário autenticado (dashboard)
 */
const getUserProfile = async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'Usuário não encontrado' });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error('USER PROFILE ERROR:', err.message);
    res.status(500).json({ success: false, message: 'Erro ao buscar perfil' });
  }
};

/**
 * Lista dispositivos do usuário logado
 */
const listUserDevices = async (req, res) => {
  const userId = req.user.userId;

  try {
    const devices = await Device.findByUserId(userId);

    res.json({
      success: true,
      data: devices,
    });
  } catch (err) {
    console.error('USER DEVICES ERROR:', err.message);
    res
      .status(500)
      .json({ success: false, message: 'Erro ao listar dispositivos' });
  }
};

/**
 * Histórico de medições de um dispositivo específico
 */
const getDeviceMeasurements = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;
  const { from, to } = req.query;

  try {
    // Verifica se device pertence ao usuário
    const devices = await Device.findByUserId(userId);
    const userDevice = devices.find((d) => d.deviceId === deviceId);

    if (!userDevice) {
      return res.status(404).json({
        success: false,
        message: 'Dispositivo não encontrado para este usuário',
      });
    }

    const measurements = await Measurement.findByDeviceId(deviceId, from, to);

    res.json({
      success: true,
      data: measurements,
    });
  } catch (err) {
    console.error('MEASUREMENTS ERROR:', err.message);
    res
      .status(500)
      .json({ success: false, message: 'Erro ao buscar medições' });
  }
};

/**
 * Eventos de um dispositivo específico
 */
const getDeviceEvents = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;

  try {
    // garante que o device pertence ao user
    const devices = await Device.findByUserId(userId);
    const dev = devices.find((d) => d.deviceId === deviceId);

    if (!dev) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário',
      });
    }

    const events = await DeviceEvent.findEventsByDevice(deviceId, userId);
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error('Error fetching device events', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

/**
 * KH config de um device (rota usada pelo dashboard-config.js)
 * GET /api/v1/user/devices/:deviceId/kh-config
 */
const getDeviceKhConfig = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;

  try {
    const devices = await Device.findByUserId(userId);
    const dev = devices.find((d) => d.deviceId === deviceId);

    if (!dev) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário',
      });
    }

    // OBS: Device.findByUserId hoje não traz khreference/khtarget/interval,
    // então aqui devolvemos apenas o que está disponível;
    // se esses campos existirem na tabela, depois ajusta o SELECT do modelo.
    return res.json({
      success: true,
      data: {
        deviceId: dev.deviceId,
        name: dev.name,
        localIp: dev.localIp || null,
        lastSeen: dev.lastSeen || null,
        khReference: dev.khreference ?? null,
        khTarget: dev.khtarget ?? null,
        intervalMinutes: dev.interval_minutes ?? null,
      },
    });
  } catch (err) {
    console.error('KH CONFIG GET ERROR:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Erro ao carregar KH config' });
  }
};

/**
 * Atualiza KH config do device
 * PUT /api/v1/user/devices/:deviceId/kh-config
 */
const updateDeviceKhConfig = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;
  const { khReference, khTarget, intervalMinutes } = req.body;

  try {
    const devices = await Device.findByUserId(userId);
    const dev = devices.find((d) => d.deviceId === deviceId);

    if (!dev) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário',
      });
    }

    // Aqui ainda não existe Device.updateKhConfig no modelo.
    // No mínimo, você tem o deviceId e pode implementar depois
    // algo como UPDATE devices SET khreference=?, khtarget=?, interval_minutes=?.
    console.log('[KH CONFIG] update requested', {
      deviceId,
      khReference,
      khTarget,
      intervalMinutes,
    });

    // TODO: implementar de fato o update no modelo Device
    // await Device.updateKhConfig(deviceId, { khReference, khTarget, intervalMinutes });

    return res.json({ success: true, message: 'KH config recebida (TODO persistir)' });
  } catch (err) {
    console.error('KH CONFIG UPDATE ERROR:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Erro ao salvar KH config' });
  }
};

/**
 * Status do device para tela de config
 * GET /api/v1/user/devices/:deviceId/status
 */
const getDeviceStatusForUser = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;

  try {
    const devices = await Device.findByUserId(userId);
    const dev = devices.find((d) => d.deviceId === deviceId);

    if (!dev) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário',
      });
    }

    return res.json({
      success: true,
      data: {
        deviceId: dev.deviceId,
        name: dev.name,
        localIp: dev.localIp || null,
        lastSeen: dev.lastSeen || null,
      },
    });
  } catch (err) {
    console.error('DEVICE STATUS ERROR:', err);
    return res
      .status(500)
      .json({ success: false, message: 'Erro ao carregar status do device' });
  }
};

module.exports = {
  getUserProfile,
  listUserDevices,
  getDeviceMeasurements,
  getDeviceEvents,
  getDeviceKhConfig,
  updateDeviceKhConfig,
  getDeviceStatusForUser,
};
