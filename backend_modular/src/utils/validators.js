/**
• validators.js
• Validações de entrada centralizadas
*/
const { ValidationError } = require('../middleware/errorHandler');
/**
• Valida email
*/
function validateEmail(email) {
  const re = /[\s@]+@[\s@]+.[\s@]+$/;
  if (!re.test(email)) {
    throw new ValidationError('Email inválido', { email: 'Formato inválido' });
  }
  return true;
}
/**
• Valida senha (mínimo 8 caracteres, maiúscula, número)
*/
function validatePassword(password) {
  if (!password) {
    throw new ValidationError('Senha é obrigatória');
  }
  if (password.length < 8) {
    throw new ValidationError('Senha deve ter no mínimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    throw new ValidationError('Senha deve conter letra maiúscula');
  }
  if (!/[0-9]/.test(password)) {
    throw new ValidationError('Senha deve conter número');
  }
  return true;
}
/**
• Valida KH (0-20 dKH)
*/
function validateKhValue(kh) {
  if (typeof kh !== 'number') {
    throw new ValidationError('KH deve ser número');
  }
  if (kh < 0 || kh > 20) {
    throw new ValidationError('KH deve estar entre 0 e 20');
  }
  return true;
}
/**
• Valida pH (0-14)
*/
function validatePh(ph) {
  if (typeof ph !== 'number') {
    throw new ValidationError('pH deve ser número');
  }
  if (ph < 0 || ph > 14) {
    throw new ValidationError('pH deve estar entre 0 e 14');
  }
  return true;
}
/**
• Valida temperatura (-10 a 50°C)
*/
function validateTemperature(temp) {
  if (typeof temp !== 'number') {
    throw new ValidationError('Temperatura deve ser número');
  }
  if (temp < -10 || temp > 50) {
   throw new ValidationError('Temperatura entre -10 e 50°C');
  }
  return true;
}
/**
• Valida deviceId (5-50 caracteres)
*/
function validateDeviceId(deviceId) {
  if (!deviceId || typeof deviceId !== 'string') {
   throw new ValidationError('Device ID inválido');
  }
  if (deviceId.length < 5 || deviceId.length > 50) {
   throw new ValidationError('Device ID: 5-50 caracteres');
  }
  return true;
}
/**
• Valida userId
*/
function validateUserId(userId) {
  if (!userId || (typeof userId !== 'number' && typeof userId !== 'string')) {
    throw new ValidationError('User ID inválido');
  }
  return true;
}
/**
• Valida código (6 dígitos)
*/
function validateVerificationCode(code) {
  if (!code || !/^\d{6}$/.test(code.toString())) {
    throw new ValidationError('Código deve ter 6 dígitos');
  }
  return true;
}
/**
• Valida intervalo de medição (60s a 24h)
*/
function validateMeasurementInterval(interval) {
  if (typeof interval !== 'number') {
    throw new ValidationError('Intervalo deve ser número');
  }
  if (interval < 60 || interval > 86400) {
    throw new ValidationError('Intervalo: 60-86400 segundos');
  }
  return true;
}
/**
• Valida array de medições
*/
function validateMeasurements(measurements) {
  if (!Array.isArray(measurements)) {
    throw new ValidationError('Medições deve ser array');
  }
  if (measurements.length === 0) {
   throw new ValidationError('Array não pode estar vazio');
  }
  if (measurements.length > 1000) {
   throw new ValidationError('Máximo 1000 medições por request');
  }
  return true;
}
/**
• Valida comando por tipo
*/
function validateCommand(type, params = {}) {
  const validTypes = ['pump', 'kh_correction', 'calibration', 'test', 'restart'];
  if (!validTypes.includes(type)) {
    throw new ValidationError(Tipo inválido: ${type});
  }
  // Validação por tipo
  switch (type) {
    case 'pump':
    if (typeof params.volume !== 'number' || params.volume <= 0) {
      throw new ValidationError('Pump requer volume > 0');
  }
  break;
    case 'kh_correction':
      if (typeof params.target !== 'number') {
        throw new ValidationError('KH correction requer target');
  }
  break;
  }
  return true;
}
module.exports = {
validateEmail,
validatePassword,
validateKhValue,
validatePh,
validateTemperature,
validateDeviceId,
validateUserId,
validateVerificationCode,
validateMeasurementInterval,
validateMeasurements,
validateCommand
};
