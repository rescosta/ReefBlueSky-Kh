/**
 * Helper de Email - Funções reutilizáveis para envio de emails
 * Código de verificação, alertas offline, recuperação de senha
 */
const { mailTransporter, ALERT_FROM } = require('../config/mailer');

/**
 * Envia código de verificação (register/verify-code)
 */
const sendVerificationEmail = async (email, code) => {
  try {
    await mailTransporter.sendMail({
      from: ALERT_FROM,
      to: email,
      subject: 'ReefBlueSky - Código de Verificação',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8B00FF">ReefBlueSky</h2>
          <p>Seu código de verificação de 6 dígitos:</p>
          <div style="background: #8B00FF; color: #ffffff; padding: 16px; font-size: 24px; 
                      font-weight: bold; text-align: center; border-radius: 8px; 
                      letter-spacing: 6px;">
            <code>${code}</code>
          </div>
          <p style="color: #666;">Ele expira em 10 minutos.</p>
          <p style="font-size: 12px; color: #999;">
            Se você não solicitou este código, pode ignorar este email.
          </p>
        </div>
      `
    });
    console.log(`✅ Código de verificação enviado para ${email}`);
  } catch (err) {
    console.error('❌ Erro ao enviar email de verificação:', err.message);
    throw err;
  }
};

/**
 * Alerta de dispositivo offline
 */
const sendOfflineAlert = async (email, deviceId, lastSeen) => {
  try {
    await mailTransporter.sendMail({
      from: ALERT_FROM,
      to: email,
      subject: `ReefBlueSky - Device ${deviceId} OFFLINE`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #FF4444">⚠️ ALERTA - Dispositivo Offline</h2>
          <p>O dispositivo <strong>${deviceId}</strong> está sem comunicação há mais de 5 minutos.</p>
          <p><strong>Último contato:</strong> ${new Date(lastSeen).toLocaleString()}</p>
        </div>
      `
    });
    console.log(`✅ Alerta offline enviado para ${email} (${deviceId})`);
  } catch (err) {
    console.error('❌ Erro ao enviar alerta offline:', err.message);
  }
};

module.exports = { sendVerificationEmail, sendOfflineAlert };
