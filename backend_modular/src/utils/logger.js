/**
• Logger Utility
• Sistema centralizado de logs
*/
const { LOG_LEVEL } = require('../config/environment');
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};
const colors = {
  error: '\x1b[31m', // Vermelho
  warn: '\x1b[33m', // Amarelo
  info: '\x1b[36m', // Ciano
  debug: '\x1b[35m', // Magenta
  reset: '\x1b[0m'
};
class Logger {
  constructor(level = LOG_LEVEL) {
  this.level = levels[level] || levels.info;
  this.isDevelopment = process.env.NODE_ENV === 'development';
}
log(level, message, data = {}) {
  if (levels[level] > this.level) return;
  const timestamp = new Date().toISOString();
  const color = this.isDevelopment ? (colors[level] || '') : '';
  const reset = colors.reset;

// Estrutura de log
const logEntry = {
  timestamp,
  level: level.toUpperCase(),
  message,
  ...data
};

// Desenvolvimento: colorido | Produção: JSON estruturado
if (this.isDevelopment) {
  const logMessage = `${color}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}`;
  if (Object.keys(data).length > 0) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
} else {
  console.log(JSON.stringify(logEntry));
}

}
error(message, data) {
  this.log('error', message, data);
  }
  warn(message, data) {
    this.log('warn', message, data);
  }
  info(message, data) {
    this.log('info', message, data);
  }
  debug(message, data) {
    this.log('debug', message, data);
  }
  http(req, res, message = 'Request completed') {
    this.info(message, {
    requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      userId: req.user?.id,
      deviceId: req.deviceId,
      duration: Date.now() - req.startTime
    });
  }
}
module.exports = new Logger();

