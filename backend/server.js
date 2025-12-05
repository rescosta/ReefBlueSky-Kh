/**
 * ReefBlueSky KH Monitor - Backend Node.js
 * Servidor com endpoints protegidos, autenticação JWT e integração com Cloudflare Tunnel
 * 
 * Funcionalidades:
 * - Autenticação JWT com refresh tokens
 * - Endpoints protegidos para sincronização de dados
 * - Armazenamento de medições em banco de dados
 * - Integração com MQTT para fallback
 * - Métricas de saúde do sistema
 * - Compatibilidade com Cloudflare Tunnel
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const dotenv = require('dotenv');
const mqtt = require('mqtt');
const compression = require('compression');
const rateLimit = require('express-rate-limit');


const mariadb = require('mariadb');
const nodemailer = require('nodemailer');
const displayRoutes = require('./display-endpoints');

const pool = mariadb.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'reefapp',
  password: process.env.DB_PASSWORD || 'reef',
  database: process.env.DB_NAME || 'reefbluesky',
  connectionLimit: 5,
  acquireTimeout: 10000,
  connectTimeout: 10000,
  idleTimeout: 60000
});


// Carregar variáveis de ambiente
dotenv.config();

const mailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: false, // use true se mudar para porta 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// (opcional) testar conexão SMTP ao subir o servidor
mailTransporter.verify((error, success) => {
  if (error) {
    console.error('Erro ao conectar no SMTP:', error);
  } else {
    console.log('SMTP pronto para enviar emails');
  }
});

async function sendVerificationEmail(email, code) {
  try {
    await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'ReefBlueSky - Código de Verificação',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8B00FF;">ReefBlueSky</h2>
          <p>Seu código de verificação de 6 dígitos é:</p>
          <div style="
            background: #8B00FF;
            color: #ffffff;
            padding: 16px;
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            border-radius: 8px;
            letter-spacing: 6px;
          ">
            ${code}
          </div>
          <p style="color: #666;">Ele expira em 10 minutos.</p>
          <p style="font-size: 12px; color: #999;">
            Se você não solicitou este código, pode ignorar este email.
          </p>
        </div>
      `,
    });

    console.log('Código de verificação enviado para', email);
  } catch (err) {
    console.error('Erro ao enviar email de verificação:', err.message);
    // Não lança erro para não quebrar o /auth/register
  }
}


const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'seu-secret-super-seguro-aqui-mude-em-producao';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'seu-refresh-secret-aqui';
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

// ===== SERVIR ARQUIVOS ESTÁTICOS ===== ← ADICIONAR AQUI
app.use(express.static('public'));

// ===== PÁGINA DE LOGIN (Rota raiz) ===== ← ADICIONAR AQUI
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

// Dashboard (proteção via JWT no frontend)
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

// ============================================================================
// [SEGURANÇA] Middlewares de Proteção
// ============================================================================

// Compressão de resposta
app.use(compression());

// CORS configurado
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting global (10 requisições por minuto)
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minuto
    max: 10,
    message: 'Muitas requisições, tente novamente mais tarde',
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiting para autenticação (5 tentativas por 15 minutos)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Muitas tentativas de login, tente novamente mais tarde',
    skipSuccessfulRequests: true
});

// Rate limiting para sincronização (100 requisições por hora)
const syncLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: 'Limite de sincronização atingido'
});

app.use(globalLimiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/api/display', displayRoutes);


// ============================================================================
// [SEGURANÇA] Autenticação JWT
// ============================================================================

/**
 * Middleware para verificar JWT
 * [SEGURANÇA] Valida token e extrai dados do usuário
 */
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];  // Bearer TOKEN
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token não fornecido'
        });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('[Auth] Erro ao verificar token:', err.message);
            return res.status(403).json({
                success: false,
                message: 'Token inválido ou expirado'
            });
        }
        
        // [SEGURANÇA] Validar timestamp do token (proteção contra replay)
        const now = Math.floor(Date.now() / 1000);
        if (decoded.iat > now + 60) {  // Token do futuro (possível ataque)
            return res.status(403).json({
                success: false,
                message: 'Token inválido'
            });
        }
        
        req.user = decoded;
        next();
    });
}

/**
 * Gerar JWT com expiração
 * [SEGURANÇA] Token válido por 1 hora
 */
function generateToken(userId, deviceId) {
    return jwt.sign(
        {
            userId,
            deviceId,
            iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

/**
 * Gerar Refresh Token
 * [SEGURANÇA] Token válido por 30 dias
 */
function generateRefreshToken(userId, deviceId) {
    return jwt.sign(
        {
            userId,
            deviceId,
            type: 'refresh'
        },
        JWT_REFRESH_SECRET,
        { expiresIn: '30d' }
    );
}

// ===== Middleware de autenticação de usuário (JWT - web) =====
function authUserMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Token não fornecido'
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido para usuário'
      });
    }

    req.user = {
      userId: decoded.userId,
      deviceId: decoded.deviceId || null
    };

    next();
  } catch (err) {
    console.error('authUserMiddleware error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado'
    });
  }
}


// ============================================================================
// [MQTT] Integração com MQTT Broker
// ============================================================================

let mqttClient = null;

function initMQTT() {
    console.log('[MQTT] Conectando ao broker:', MQTT_BROKER);
    
    mqttClient = mqtt.connect(MQTT_BROKER, {
        clientId: 'reefbluesky-server',
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        reconnectPeriod: 5000,
        connectTimeout: 10000
    });
    
    mqttClient.on('connect', () => {
        console.log('[MQTT] Conectado ao broker');
        
        // Subscrever a tópicos de interesse
        mqttClient.subscribe('reefbluesky/+/measurement', (err) => {
            if (!err) {
                console.log('[MQTT] Inscrito em reefbluesky/+/measurement');
            }
        });
        
        mqttClient.subscribe('reefbluesky/+/health', (err) => {
            if (!err) {
                console.log('[MQTT] Inscrito em reefbluesky/+/health');
            }
        });
    });
    
    mqttClient.on('message', (topic, message) => {
        console.log(`[MQTT] Mensagem recebida em ${topic}:`, message.toString());
        
        try {
            const data = JSON.parse(message.toString());
            
            // Processar medição
            if (topic.includes('measurement')) {
                handleMQTTMeasurement(data);
            }
            
            // Processar health metrics
            if (topic.includes('health')) {
                handleMQTTHealth(data);
            }
        } catch (error) {
            console.error('[MQTT] Erro ao processar mensagem:', error.message);
        }
    });
    
    mqttClient.on('error', (error) => {
        console.error('[MQTT] Erro:', error.message);
    });
    
    mqttClient.on('disconnect', () => {
        console.log('[MQTT] Desconectado do broker');
    });
}

function handleMQTTMeasurement(data) {
    console.log('[MQTT] Medição recebida:', data);
    // TODO: Salvar em banco de dados
}

function handleMQTTHealth(data) {
    console.log('[MQTT] Health metrics recebidos:', data);
    // TODO: Salvar em banco de dados
}

// ============================================================================
// [API] Endpoints de Autenticação (v1)
// ============================================================================

// Registro de novo usuário (para painel web)
app.post('/api/v1/auth/register', authLimiter, async (req, res) => {
  console.log('API POST /api/v1/auth/register');

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email e senha são obrigatórios'
    });
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'Email inválido'
    });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Senha deve ter pelo menos 6 caracteres'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const existing = await conn.query(
      'SELECT id, isVerified FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing && existing.length > 0) {
      const existingUser = existing[0];

      // Se já está verificado, bloqueia novo cadastro
      if (existingUser.isVerified) {
        return res.status(409).json({
          success: false,
          message: 'Já existe um usuário verificado com este email'
        });
      }

      // Usuário existe mas ainda NÃO foi verificado:
      // apenas gera novo código e nova expiração (reenviar código)
      const now = new Date();
      const verificationCode = String(
        Math.floor(100000 + Math.random() * 900000)
      );
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      await conn.query(
        'UPDATE users SET verificationCode = ?, verificationExpiresAt = ?, updatedAt = ? WHERE id = ?',
        [verificationCode, expiresAt, now, existingUser.id]
      );

      console.log('API /auth/register - Reenviando código para usuário não verificado', email, 'code:', verificationCode);

      await sendVerificationEmail(email, verificationCode);

      return res.status(200).json({
        success: true,
        message: 'Já existe um cadastro pendente para este email. Reenviamos um novo código de verificação.',
        data: {
          userId: existingUser.id,
          email: email,
          requiresVerification: true
        }
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    // Gera código de 6 dígitos
    const verificationCode = String(
      Math.floor(100000 + Math.random() * 900000)
    );

    // Expira em 10 minutos
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    const result = await conn.query(
      'INSERT INTO users (email, passwordHash, createdAt, updatedAt, verificationCode, verificationExpiresAt, isVerified) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [email, passwordHash, now, now, verificationCode, expiresAt, 0]
    );

    const newUserId = Number(result.insertId);

    console.log('API /auth/register - Novo usuário criado (aguardando verificação)', email, 'code:', verificationCode);

    // enviar email real com verificationCode para o usuário.
    
    await sendVerificationEmail(email, verificationCode);

    return res.status(201).json({
      success: true,
      message: 'Usuário criado. Enviamos um código de verificação para seu email.',
      data: {
        userId: newUserId,
        email: email,
        requiresVerification: true
      }
    });

  } catch (err) {
    console.error('AUTH ERROR /auth/register:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao registrar usuário',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
});

// Esqueci minha senha - enviar código de recuperação
app.post('/api/v1/auth/forgot-password', authLimiter, async (req, res) => {
  console.log('API POST /api/v1/auth/forgot-password');

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'Email é obrigatório'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Verifica se usuário existe
    const rows = await conn.query(
      'SELECT id, email FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows || rows.length === 0) {
      // Resposta genérica para não vazar se email existe
      return res.json({
        success: true,
        message: 'Se o email existir, um código de recuperação foi enviado.'
      });
    }

    const user = rows[0];

    // Gera novo código de 6 dígitos
    const verificationCode = String(
      Math.floor(100000 + Math.random() * 900000)
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 min

    // Atualiza código e expiração no banco
    await conn.query(
      'UPDATE users SET verificationCode = ?, verificationExpiresAt = ?, updatedAt = ? WHERE id = ?',
      [verificationCode, expiresAt, now, user.id]
    );

    console.log('API /auth/forgot-password - Código gerado para', user.email, 'code:', verificationCode);

    // Envia email com o código (mesma função de verificação)
    await sendVerificationEmail(user.email, verificationCode);

    return res.json({
      success: true,
      message: 'Se o email existir, um código de recuperação foi enviado.'
    });
  } catch (err) {
    console.error('AUTH ERROR /auth/forgot-password:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao solicitar recuperação de senha',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
});


// Verificar código de 6 dígitos
app.post('/api/v1/auth/verify-code', authLimiter, async (req, res) => {
  console.log('API POST /api/v1/auth/verify-code');

  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'Email e código são obrigatórios'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(
      'SELECT id, email, verificationCode, verificationExpiresAt, isVerified FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    const user = rows[0];

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Usuário já está verificado'
      });
    }

    if (!user.verificationCode || !user.verificationExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum código de verificação ativo para este usuário'
      });
    }

    const now = new Date();
    const expiresAt = new Date(user.verificationExpiresAt);

    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Código expirado, solicite um novo registro'
      });
    }

    if (String(code).trim() !== String(user.verificationCode).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido'
      });
    }

    // Marca como verificado e limpa o código
    await conn.query(
      'UPDATE users SET isVerified = 1, verificationCode = NULL, verificationExpiresAt = NULL, updatedAt = ? WHERE id = ?',
      [now, user.id]
    );

    const userIdNumber = Number(user.id);
    const token = generateToken(userIdNumber, null);
    const refreshToken = generateRefreshToken(userIdNumber, null);

    console.log('API /auth/verify-code - Usuário verificado', user.email);

    return res.json({
      success: true,
      message: 'Código verificado com sucesso',
      data: {
        userId: userIdNumber,
        email: user.email,
        token,
        refreshToken
      }
    });
  } catch (err) {
    console.error('AUTH ERROR /auth/verify-code:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao verificar código',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
});

// Redefinir senha com código (para fluxo "Esqueci minha senha")
app.post('/api/v1/auth/reset-password', authLimiter, async (req, res) => {
  console.log('API POST /api/v1/auth/reset-password');

  const { email, code, newPassword } = req.body;

  if (!email || !code || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Email, código e nova senha são obrigatórios'
    });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Nova senha deve ter pelo menos 6 caracteres'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(
      'SELECT id, email, verificationCode, verificationExpiresAt FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    const user = rows[0];

    if (!user.verificationCode || !user.verificationExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Nenhum código de recuperação ativo para este usuário'
      });
    }

    const now = new Date();
    const expiresAt = new Date(user.verificationExpiresAt);

    if (now > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Código expirado, solicite uma nova recuperação de senha'
      });
    }

    if (String(code).trim() !== String(user.verificationCode).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Código inválido'
      });
    }

    // Atualiza a senha e limpa o código
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await conn.query(
      'UPDATE users SET passwordHash = ?, verificationCode = NULL, verificationExpiresAt = NULL, updatedAt = ? WHERE id = ?',
      [passwordHash, now, user.id]
    );

    console.log('API /auth/reset-password - Senha redefinida para', user.email);

    return res.json({
      success: true,
      message: 'Senha redefinida com sucesso. Você já pode entrar com a nova senha.'
    });
  } catch (err) {
    console.error('AUTH ERROR /auth/reset-password:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao redefinir senha',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
});


// Login de usuário (para painel web)
app.post('/api/v1/auth/login', authLimiter, async (req, res) => {
  console.log('API POST /api/v1/auth/login');

  const { email, password } = req.body;

  // Validação básica
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email e senha são obrigatórios'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Buscar usuário pelo email
    const rows = await conn.query(
      'SELECT id, email, passwordHash, isVerified FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    const user = rows[0];

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Conta ainda não verificada. Verifique o código enviado para seu email.'
      });
    }

    // Comparar senha com bcrypt
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // Gerar tokens JWT (reaproveitando as funções existentes)
    const token = generateToken(user.id, null);          // deviceId = null para login web
    const refreshToken = generateRefreshToken(user.id, null);

    console.log('API /auth/login - Login OK para usuário', user.email);

    return res.json({
      success: true,
      message: 'Login bem-sucedido',
      data: {
        token,
        refreshToken,
        userId: user.id,
        email: user.email
      }
    });
  } catch (err) {
    console.error('AUTH ERROR /auth/login:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao fazer login',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
});

// Dados do usuário autenticado
app.get('/api/v1/auth/me', authUserMiddleware, async (req, res) => {
  console.log('API GET /api/v1/auth/me');

  const userId = req.user.userId;

  let conn;
  try {
    conn = await pool.getConnection();

    const rows = await conn.query(
      'SELECT id, email, createdAt, updatedAt FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    const user = rows[0];

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('AUTH ERROR /auth/me:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao buscar dados do usuário',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }
});

/**
 * POST /api/v1/device/register
 * [SEGURANÇA] Registrar novo dispositivo
 */
app.post('/api/v1/device/register', authLimiter, async (req, res) => {
    console.log('[API] POST /api/v1/device/register');
    
    const { deviceId, username, password, local_ip } = req.body;
    
    // Validar entrada
    if (!deviceId || !username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios: deviceId, username, password'
        });
    }
    
    // [SEGURANÇA] Validar formato de deviceId (apenas alfanuméricos e hífens)
    if (!/^[a-zA-Z0-9-]{10,50}$/.test(deviceId)) {
        return res.status(400).json({
            success: false,
            message: 'deviceId inválido'
        });
    }
    
    let conn;
    try {
      conn = await pool.getConnection();

      // 1) Buscar usuário pelo email (username)
      const userRows = await conn.query(
        'SELECT id, email, passwordHash, isVerified FROM users WHERE email = ? LIMIT 1',
        [username]
      );

      if (!userRows || userRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Usuário não encontrado para este username'
        });
      }

      const user = userRows[0];

      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: 'Usuário ainda não verificado'
        });
      }

      // 2) Validar senha enviada pelo device contra passwordHash do usuário
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({
          success: false,
          message: 'Credenciais inválidas para este usuário'
        });
      }

      const now = new Date();

      // 3) Criar/atualizar device já vinculando userId
      await conn.query(
        `INSERT INTO devices (deviceId, userId, name, local_ip, last_seen, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           userId = VALUES(userId),
           name = VALUES(name),
           local_ip = VALUES(local_ip),
           last_seen = VALUES(last_seen),
           updatedAt = VALUES(updatedAt)`,
        [
          deviceId,
          user.id,
          'KH Auto-Register',
          local_ip || null,
          now,
          now,
          now
        ]
      );


    // TODO: Verificar se dispositivo já existe
    // TODO: Criar usuário no banco de dados
    // TODO: Hash da senha com bcrypt
    
    // Gerar tokens
    const token = generateToken(user.id, deviceId);
    const refreshToken = generateRefreshToken(user.id, deviceId);
    
    console.log('[API] Dispositivo registrado com sucesso:', deviceId, 'userId');
    
    res.status(201).json({
        success: true,
        message: 'Dispositivo registrado com sucesso',
        data: {
            deviceId,
            userId: user.id,
            token,
            refreshToken,
            expiresIn: 3600  // 1 hora em segundos
        }
    });
  } catch (err) {
    console.error('DEVICE ERROR /device/register:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao registrar dispositivo',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch (releaseErr) {
        console.error('DB release error:', releaseErr.message);
      }
    }
  }     
});



/**
 * POST /api/v1/device/refresh-token
 * [SEGURANÇA] Renovar token JWT
 */
app.post('/api/v1/device/refresh-token', (req, res) => {
    console.log('[API] POST /api/v1/device/refresh-token');
    
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: 'Refresh token não fornecido'
        });
    }
    
    jwt.verify(refreshToken, JWT_REFRESH_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Refresh token inválido ou expirado'
            });
        }
        
        // Gerar novo token
        const newToken = generateToken(decoded.userId, decoded.deviceId);
        
        res.json({
            success: true,
            data: {
                token: newToken,
                expiresIn: 3600
            }
        });
    });
});

// ============================================================================
// [API] Endpoints de Sincronização (v1) - Protegidos
// ============================================================================

/**
 * GET /api/v1/device/ping
 * [SEGURANÇA] Heartbeat do dispositivo
 */
app.post('/api/v1/device/sync', verifyToken, syncLimiter, async (req, res) => {
  console.log('SYNC BODY =>', JSON.stringify(req.body));
  const { measurements, lastSyncTimestamp, local_ip } = req.body;
  console.log('local_ip extraído =>', local_ip);

  console.log('[API] POST /api/v1/device/sync - Device:', req.user.deviceId);

  // Validar input
  if (!Array.isArray(measurements)) {
    return res.status(400).json({
      success: false,
      message: 'Medições devem ser um array'
    });
  }

  if (measurements.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Array de medições vazio'
    });
  }

  for (const m of measurements) {
    if (!m.timestamp || typeof m.kh !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Medição inválida: faltam timestamp ou kh'
      });
    }
  }

  console.log(`[API] Sincronizando ${measurements.length} medições do deviceId: ${req.user.deviceId}`);

  let conn;
  try {
    conn = await pool.getConnection();

    // 1) Auto‑registro do device
    await conn.query(
      `INSERT INTO devices (deviceId, name, createdAt, updatedAt)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE updatedAt = NOW()`,
      [req.user.deviceId, 'KH Auto-Register']
    );

    // 2) Atualizar IP local se veio no body
    if (local_ip) {
      await conn.query(
        'UPDATE devices SET local_ip = ?, last_seen = NOW() WHERE deviceId = ?',
        [local_ip, req.user.deviceId]
      );
    }

    // 3) Gravar medições
    let insertedCount = 0;
    for (const m of measurements) {
      try {
        await conn.execute(
          'INSERT INTO measurements (deviceId, kh, phref, phsample, temperature, timestamp, status, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            req.user.deviceId,
            m.kh,
            m.phref || null,
            m.phsample || null,
            m.temperature || null,
            m.timestamp,
            m.status || null,
            m.confidence || null
          ]
        );
        insertedCount++;
      } catch (insertErr) {
        console.error(`[DB] Erro ao inserir medição ${m.timestamp}:`, insertErr.message);
      }
    }

    console.log(`[DB] ✅ ${insertedCount}/${measurements.length} medições gravadas`);

    return res.json({
      success: true,
      message: `${insertedCount} medições sincronizadas com sucesso`,
      data: {
        synced: insertedCount,
        failed: measurements.length - insertedCount,
        nextSyncTime: Date.now() + 300000
      }
    });

  } catch (err) {
    console.error('[DB] Erro crítico ao sincronizar:', err.message, err.code);

    let statusCode = 503;
    let errorMsg = 'Erro ao conectar ao banco de dados';

    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      errorMsg = 'Credenciais do banco incorretas';
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      errorMsg = 'Banco de dados não existe';
    } else if (err.message.includes('timeout')) {
      errorMsg = 'Timeout ao conectar (MariaDB pode estar DOWN)';
    }

    return res.status(statusCode).json({
      success: false,
      message: errorMsg,
      error: err.message
    });

  } finally {
    if (conn) {
      try {
        conn.release();
        console.log('[DB] Conexão liberada');
      } catch (releaseErr) {
        console.error('[DB] Erro ao liberar conexão:', releaseErr.message);
      }
    }
  }
});


/**
 * POST /api/v1/device/health
 * [SEGURANÇA] Enviar métricas de saúde
 */
app.post('/api/v1/device/health', verifyToken, (req, res) => {
    console.log('[API] POST /api/v1/device/health - Device:', req.user.deviceId);
    
    const health = req.body;
    
    // [SEGURANÇA] Validar métricas
    if (typeof health.cpu_usage !== 'number' || 
        typeof health.memory_usage !== 'number' ||
        typeof health.uptime !== 'number') {
        return res.status(400).json({
            success: false,
            message: 'Métricas de saúde inválidas'
        });
    }
    
    console.log('[API] Health metrics:', {
        cpu: health.cpu_usage + '%',
        memory: health.memory_usage + '%',
        uptime: health.uptime + 's'
    });
    
    // TODO: Salvar métricas em banco de dados
    
    res.json({
        success: true,
        message: 'Métricas de saúde recebidas'
    });
});

/**
 * GET /api/v1/device/commands
 * [SEGURANÇA] Obter comandos pendentes
 */
app.get('/api/v1/device/commands', verifyToken, (req, res) => {
    console.log('[API] GET /api/v1/device/commands - Device:', req.user.deviceId);
    
    // TODO: Buscar comandos pendentes do banco de dados
    
    const commands = [];  // Exemplo vazio
    
    res.json({
        success: true,
        data: {
            commands
        }
    });
});

/**
 * POST /api/v1/device/command-result
 * [SEGURANÇA] Confirmar execução de comando
 */
app.post('/api/v1/device/command-result', verifyToken, (req, res) => {
    console.log('[API] POST /api/v1/device/command-result - Device:', req.user.deviceId);
    
    const { commandId, status, result } = req.body;
    
    if (!commandId || !status) {
        return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios: commandId, status'
        });
    }
    
    console.log(`[API] Comando ${commandId} executado com status: ${status}`);
    
    // TODO: Salvar resultado em banco de dados
    
    res.json({
        success: true,
        message: 'Resultado do comando recebido'
    });
});


// Endpoint protegido para teste do token de usuário (dashboard web)
app.get('/api/v1/dashboard/example', authUserMiddleware, (req, res) => {
  return res.json({
    success: true,
    message: 'Acesso autorizado ao dashboard (usuário)',
    data: {
      userId: req.user.userId,
      deviceId: req.user.deviceId
    }
  });
});


// ============================================================================
// [API] Endpoints de Status (v1)
// ============================================================================

/**
 * GET /api/v1/status
 * [SEGURANÇA] Status geral do servidor
 */
app.get('/api/v1/status', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'online',
            version: '2.0-rev06',
            timestamp: new Date().toISOString(),
            mqtt: {
                connected: mqttClient ? mqttClient.connected : false,
                broker: MQTT_BROKER
            },
            uptime: process.uptime()
        }
    });
});

/**
 * GET /api/v1/health
 * [SEGURANÇA] Saúde do servidor
 */
app.get('/api/v1/health', (req, res) => {
    const memUsage = process.memoryUsage();
    
    res.json({
        success: true,
        data: {
            memory: {
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB'
            },
            uptime: process.uptime() + ' segundos',
            timestamp: new Date().toISOString()
        }
    });
});

// ============================================================================
// [CLOUDFLARE] Integração com Cloudflare Tunnel
// ============================================================================

/**
 * Cloudflare Tunnel detecta automaticamente a porta
 * Nenhuma configuração especial necessária
 * O tunnel encaminha tráfego HTTPS para http://localhost:PORT
 */

// ============================================================================
// [ERRO] Tratamento de Erros
// ============================================================================

// 404 - Rota não encontrada
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada',
        path: req.path,
        method: req.method
    });
});

// Erro global
app.use((err, req, res, next) => {
    console.error('[ERROR] Erro não tratado:', err);
    
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ============================================================================
// [BOOT] Inicialização do Servidor
// ============================================================================

function startServer() {
    // Inicializar MQTT
    initMQTT();
    
    // Iniciar servidor HTTP
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════════╗
║     ReefBlueSky KH Monitor - Backend Node.js (Rev06)      ║
╚════════════════════════════════════════════════════════════╝

[SERVER] Servidor iniciado com sucesso
[SERVER] Porta: ${PORT}
[SERVER] Ambiente: ${process.env.NODE_ENV || 'development'}
[SERVER] URL: http://localhost:${PORT}

[CLOUDFLARE] Tunnel: https://seu-dominio.com
[CLOUDFLARE] Status: Aguardando configuração

[ENDPOINTS] Disponíveis:
  POST   /api/v1/device/register
  POST   /api/v1/device/refresh-token
  GET    /api/v1/device/ping
  POST   /api/v1/device/sync
  POST   /api/v1/device/health
  GET    /api/v1/device/commands
  POST   /api/v1/device/command-result
  GET    /api/v1/status
  GET    /api/v1/health

[MQTT] Broker: ${MQTT_BROKER}
[SECURITY] Rate Limiting: Ativo (10 req/min global)
[SECURITY] CORS: Configurado
[SECURITY] Compression: Ativo

Pressione Ctrl+C para parar o servidor
        `);
    });
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SERVER] Encerrando servidor...');
    if (mqttClient) {
        mqttClient.end();
    }
    process.exit(0);
});
