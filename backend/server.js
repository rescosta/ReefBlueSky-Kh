/**
 * ReefBlueSky KH Monitor - Servidor Principal Modularizado
 * Inicializa o servidor Express e registra rotas/middlewares
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const compression = require('compression');

const { globalLimiter } = require('./middlewares/rateLimit');
const errorHandler = require('./middlewares/errorHandler');
const { startServer } = require('./helpers/serverBootstrap');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const devRoutes = require('./routes/devRoutes');
const statusRoutes = require('./routes/statusRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Cloudflare / túnel)
app.set('trust proxy', 1);

// Middlewares globais (equivalente ao server antigo)
app.use(compression());

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(globalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Arquivos estáticos + páginas principais (login/dashboard)
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard-main.html');
});

// =======================
// Rotas de API v1
// =======================

// Auth (login, register, verify-code, reset-password, refresh, me)
// -> /api/v1/auth/...
app.use('/api/v1/auth', authRoutes);

// Usuário (REST “users”) -> /api/v1/users/...
// Não conflita com o antigo /api/v1/user/devices
app.use('/api/v1/users', userRoutes);

// Dispositivos (ESP + comandos do dashboard)
// Mantém compatibilidade com o server antigo:
//   /api/v1/device/register
//   /api/v1/device/sync
//   /api/v1/device/health
//   /api/v1/device/kh-reference
//   /api/v1/device/commands/poll
//   /api/v1/device/user/devices/:deviceId/command/pump
//   /api/v1/device/user/devices/:deviceId/command/kh-correction
//   /api/v1/device/user/devices/:deviceId/commands
app.use('/api/v1/device', deviceRoutes);

// Rotas DEV (logs, console, etc.) -> /api/v1/dev/...
app.use('/api/v1/dev', devRoutes);

// Status/health (igual ao antigo) -> /api/v1/status, /api/v1/health
app.use('/api/v1', statusRoutes);

// Dashboard helper: lista devices do usuário logado
// Exposto como /api/v1/user/devices (como no server antigo)
app.use('/api/v1', dashboardRoutes);

// =======================
// 404 + erro global
// =======================

// 404 - Rota não encontrada
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    path: req.path,
    method: req.method,
  });
});

// Middleware de erro global
app.use(errorHandler);

// =======================
// Boot: servidor + monitor offline
// =======================

startServer(app, PORT);

module.exports = app;
