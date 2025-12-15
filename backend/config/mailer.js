/**
 * Configuração Nodemailer para envio de emails
 * Verificação SMTP automática na inicialização
 */
const nodemailer = require('nodemailer');

const mailTransporter = nodemailer.createTransporter({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Testa conexão SMTP
mailTransporter.verify((error) => {
  if (error) console.error('SMTP Error:', error);
  else console.log('SMTP pronto');
});

const ALERT_FROM = process.env.EMAIL_FROM || 'alerts@reefbluesky.com.br';

module.exports = { mailTransporter, ALERT_FROM };
