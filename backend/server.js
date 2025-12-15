/**
 * ReefBlueSky KH Monitor - Servidor Principal Modularizado
 * Inicializa o servidor Express e registra rotas/middlewares
 */

// Carrega variáveis de ambiente
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

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Cloudflare / túnel)
app.set('trust proxy', 1);

// Middlewares globais
app.use(compression());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Arquivos estáticos
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/dashboard', (req, res) => res.sendFile(__dirname + '/public/dashboard-main.html'));

// Rotas de API
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/device', deviceRoutes);
app.use('/api/v1/dev', devRoutes);
app.use('/api/v1', statusRoutes); // /status e /health

// 404 - Rota não encontrada (equivalente ao server antigo)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// Middleware de erro global
app.use(errorHandler);

// Sobe servidor + monitor de devices offline
startServer(app, PORT);

module.exports = app;
