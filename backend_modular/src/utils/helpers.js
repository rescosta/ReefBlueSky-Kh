/**
• Helpers Utility
• Funções auxiliares gerais
*/
const crypto = require('crypto');
/**
• Gera código de verificação aleatório
*/
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
/**
• Gera token aleatório
*/
function generateRandomToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}
/**
• Formata data para string legível
*/
function formatDateTime(date) {
  if (!date) return '--';
    const d = new Date(date);
  if (isNaN(d.getTime())) return '--';
    return d.toLocaleString('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short'
  });
}
/**
• Calcula diferença de tempo em minutos
*/
function getMinutesDifference(date1, date2) {
  const diff = Math.abs(new Date(date1) - new Date(date2));
    return Math.floor(diff / 60000);
}
/**
• Calcula diferença de tempo em horas
*/
function getHoursDifference(date1, date2) {
  const diff = Math.abs(new Date(date1) - new Date(date2));
    return Math.floor(diff / 3600000);
}
/**
• Calcula diferença de tempo em dias
*/
function getDaysDifference(date1, date2) {
  const diff = Math.abs(new Date(date1) - new Date(date2));
    return Math.floor(diff / 86400000);
}
/**
• Calcula estatísticas de um array de números
*/
function calculateStats(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return null;
}
const sorted = [...numbers].sort((a, b) => a - b);
const sum = sorted.reduce((a, b) => a + b, 0);
const avg = sum / sorted.length;
const min = sorted[0];
const max = sorted[sorted.length - 1];
// Desvio padrão
const variance = sorted.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / sorted.length;
const stdDev = Math.sqrt(variance);
  return {
    min,
    max,
    avg,
    stdDev,
    sum,
    count: sorted.length
  };
}
/**
• Calcula tendência (up, down, stable)
*/
function calculateTrend(values) {
  if (!Array.isArray(values) || values.length < 2) {
    return 'stable';
  }
  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;
  if (diff > 0.1) return 'up';
  if (diff < -0.1) return 'down';
  return 'stable';
}
/**
• Pagina array de dados
*/
function paginate(items, limit, offset) {
  const start = offset || 0;
  const end = start + (limit || 100);
  return {
    data: items.slice(start, end),
    total: items.length,
    limit,
    offset: start
  };
}
/**
• Sanitiza string removendo caracteres especiais
*/
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
  .replace(/[<>]/g, '') // Tags HTML
  .replace(/["']/g, '') // Quotes
  .replace(/[\x00-\x1F\x7F]/g, '') // Control chars
  .trim()
  .substring(0, 1000); // Limite de tamanho
}
/**
• Sanitiza payload para log removendo dados sensíveis
*/
function sanitizePayloadForLog(data) {
  if (!data || typeof data !== 'object') return data;
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'telegram_bot_token'];
  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
    sanitized[key] = 'REDACTED';
  }
}
return sanitized;
}
module.exports = {
generateVerificationCode,
generateRandomToken,
formatDateTime,
getMinutesDifference,
getHoursDifference,
getDaysDifference,
calculateStats,
calculateTrend,
paginate,
sanitizeString,
sanitizePayloadForLog
};

