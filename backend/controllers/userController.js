/**
 * Controlador de Usuários - Dashboard e listagem de dispositivos
 * Lógica para /auth/me, /user/devices, histórico de medições
 */
const Device = require('../models/Device');
const Measurement = require('../models/Measurement');
const User = require('../models/User');

/**
 * Dados do usuário autenticado (dashboard)
 */
const getUserProfile = async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
    }
    
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
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
      data: devices
    });
  } catch (err) {
    console.error('USER DEVICES ERROR:', err.message);
    res.status(500).json({ success: false, message: 'Erro ao listar dispositivos' });
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
    const userDevice = devices.find(d => d.deviceId === deviceId);
    if (!userDevice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Dispositivo não encontrado para este usuário' 
      });
    }
    
    const measurements = await Measurement.findByDeviceId(deviceId, from, to);
    res.json({
      success: true,
      data: measurements
    });
  } catch (err) {
    console.error('MEASUREMENTS ERROR:', err.message);
    res.status(500).json({ success: false, message: 'Erro ao buscar medições' });
  }
};

const DeviceEvent = require('../models/DeviceEvent');

const getDeviceEvents = async (req, res) => {
  const userId = req.user.userId;
  const { deviceId } = req.params;

  try {
    // garante que o device pertence ao user
    const devices = await Device.findByUserId(userId);
    const dev = devices.find(d => d.deviceId === deviceId);
    if (!dev) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário'
      });
    }

    const events = await DeviceEvent.findEventsByDevice(deviceId, userId);
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error('Error fetching device events', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};



module.exports = { 
  getUserProfile, 
  listUserDevices, 
  getDeviceMeasurements,
  getDeviceEvents
};
