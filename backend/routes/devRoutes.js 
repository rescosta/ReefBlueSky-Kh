/**
 * Rotas DEV - Console, logs e debugging
 * Acesso restrito a role=dev
 */
const express = require('express');
const fs = require('fs').promises;
const { authUserMiddleware, requireDev } = require('../middlewares/authMiddleware');
const path = require('path');

const router = express.Router();

// Logs do servidor PM2
router.get('/logs', authUserMiddleware, requireDev, async (req, res) => {
  try {
    const logPath = '/home/reef/.pm2/logs/server-out.log';
    const stats = await fs.stat(logPath);
    const maxBytes = 200 * 1024; // 200KB
    const start = Math.max(0, stats.size - maxBytes);
    
    const fd = await fs.open(logPath, 'r');
    const buffer = Buffer.alloc(stats.size - start);
    await fd.read(buffer, 0, buffer.length, start);
    await fd.close();
    
    const lines = buffer.toString('utf8')
      .split('\n')
      .filter(l => l.trim().length > 0)
      .slice(-200); // Últimas 200 linhas
    
    res.json({ success: true, data: lines });
  } catch (err) {
    res.json({ success: false, message: 'Erro ao ler logs', data: [] });
  }
});

// Console do device (stub)
router.get('/device-console/:deviceId', authUserMiddleware, requireDev, (req, res) => {
  res.json({ 
    success: true, 
    data: [`[device ${req.params.deviceId}] Console ativo...`] 
  });
});

module.exports = router;
