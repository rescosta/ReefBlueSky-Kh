/**
 * ReefBlueSky Server - Modular Architecture
 * Entry Point Principal
 */

require('dotenv').config();


const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

// Imports de configuração
const { PORT, NODE_ENV } = require('./config/environment');
const corsConfig = require('./middleware/cors');
const { errorHandler, notFoundHandler, AppError, ValidationError, UnauthorizedError } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Imports de rotas
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const commandRoutes = require('./routes/commands');
const configRoutes = require('./routes/config');
const telegramRoutes = require('./routes/telegram');
const systemRoutes = require('./routes/system');
const pageRoutes = require('./routes/pages');

// Inicializar Express
const app = express();

// Security headers
app.use(helmet());

// Request ID para rastreamento
app.use((req, res, next) => {
  req.id = require('crypto').randomUUID();
  req.startTime = Date.now();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ===== MIDDLEWARE GLOBAL =====

// Logging de requisições
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// CORS
app.use(cors(corsConfig));

// Compression
app.use(compression());

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));


const helmet = require('helmet'); // npm install helmet


// ===== ROTAS API =====

// Prefixo /api/v1
app.use('/api/v1', authRoutes);
app.use('/api/v1', deviceRoutes);
app.use('/api/v1', commandRoutes);
app.use('/api/v1', configRoutes);
app.use('/api/v1', telegramRoutes);
app.use('/api/v1', systemRoutes);

// Rotas de páginas (sem prefixo)
app.use('/', pageRoutes);

// ===== ERROR HANDLING =====

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// ===== START SERVER =====
const server = app.listen(PORT, () => {
  logger.info(`🚀 ReefBlueSky Server iniciado`);
  logger.info(`📍 Porta: ${PORT}`);
  logger.info(`🌐 Ambiente: ${NODE_ENV}`);
  logger.info(`🌐 URL: http://localhost:${PORT}`);
  logger.info(`📚 API: http://localhost:${PORT}/api/v1`);
});

// ===== GRACEFUL SHUTDOWN =====
const { closePool } = require('./config/database');

async function gracefulShutdown(signal) {
  logger.info(`${signal} recebido. Encerrando gracefully...`);
  
  server.close(async () => {
    try {
      // Fechar conexões de banco
      await closePool();
      
      // TODO: Fechar outras conexões (Redis, etc)
      
      logger.info('✓ Servidor encerrado com sucesso');
      process.exit(0);
    } catch (err) {
      logger.error('Erro durante shutdown', { error: err.message });
      process.exit(1);
    }
  });

  // Force shutdown após 10 segundos
  setTimeout(() => {
    logger.error('Force shutdown: timeout excedido');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Tratar uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { 
    error: err.message, 
    stack: err.stack 
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { 
    reason: reason?.message || reason,
    promise 
  });
});

module.exports = app;
