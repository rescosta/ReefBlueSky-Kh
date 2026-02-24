// alerts-helpers.js
const axios = require('axios');
const nodemailer = require('nodemailer');
const pool = require('./db-pool');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// === EMAIL ===
console.log('[SMTP Config]', {
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  user: process.env.EMAIL_USER,
  from: process.env.EMAIL_FROM
});

const mailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const ALERT_FROM = process.env.EMAIL_FROM || 'alerts@reefbluesky.com.br';

// === TELEGRAM (por usuário) ===
async function sendTelegramForUser(userId, text) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT telegram_bot_token, telegram_chat_id, telegram_enabled
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      console.warn('sendTelegramForUser: user não encontrado', userId);
      return;
    }

    const u = rows[0];
    if (!u.telegram_enabled || !u.telegram_bot_token || !u.telegram_chat_id) {
      console.log(
        'sendTelegramForUser: Telegram desabilitado ou config incompleta para user',
        userId
      );
      return;
    }

    let chatId = u.telegram_chat_id;
    if (typeof chatId === 'bigint') chatId = chatId.toString();

    const url = `https://api.telegram.org/bot${u.telegram_bot_token}/sendMessage`;
    console.log('sendTelegramForUser: url=', url, 'chat_id=', chatId);

    await axios.post(
      url,
      { chat_id: chatId, text, parse_mode: 'Markdown' },
      { timeout: 30000 }
    );

    console.log('sendTelegramForUser: mensagem enviada para user', userId);
  } catch (err) {
    console.error('sendTelegramForUser error:', err.message);
  } finally {
    if (conn) try { conn.release(); } catch {}
  }
}

// === EMAIL (por usuário) ===
async function sendEmailForUser(userId, subject, htmlBody) {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT email, email_enabled
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) {
      const error = new Error('Usuário não encontrado');
      error.code = 'USER_NOT_FOUND';
      console.warn('sendEmailForUser: user não encontrado', userId);
      throw error;
    }

    const u = rows[0];
    if (!u.email_enabled || !u.email) {
      const error = new Error('Email desabilitado ou não configurado');
      error.code = 'EMAIL_DISABLED';
      console.log(
        'sendEmailForUser: Email desabilitado ou não configurado para user',
        userId
      );
      throw error;
    }

    await mailTransporter.sendMail({
      from: ALERT_FROM,
      to: u.email,
      subject: subject,
      html: htmlBody
    });

    console.log('sendEmailForUser: email enviado para user', userId, u.email);
  } catch (err) {
    console.error('sendEmailForUser error:', err.message);
    throw err; // Re-lançar a exceção para o código chamador tratar
  } finally {
    if (conn) try { conn.release(); } catch {}
  }
}

module.exports = {
  mailTransporter,
  ALERT_FROM,
  sendTelegramForUser,
  sendEmailForUser,
};
