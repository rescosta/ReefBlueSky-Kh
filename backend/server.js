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
//const mqtt = require('mqtt');
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
app.set('trust proxy', 1); 
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
  res.sendFile(__dirname + '/public/dashboard-main.html');
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
    max: 200, //200 req/min por IP
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
        console.log('[verifyToken] Falhou: header Authorization ausente ou sem Bearer');
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

//let mqttClient = null;

//function initMQTT() {
//   console.log('[MQTT] Conectando ao broker:', MQTT_BROKER);
//  
//    mqttClient = mqtt.connect(MQTT_BROKER, {
//        clientId: 'reefbluesky-server',
//        username: process.env.MQTT_USERNAME,
//        password: process.env.MQTT_PASSWORD,
//        reconnectPeriod: 5000,
//        connectTimeout: 10000
//    });
//    
//    mqttClient.on('connect', () => {
//        console.log('[MQTT] Conectado ao broker');
//        
//        // Subscrever a tópicos de interesse
//        mqttClient.subscribe('reefbluesky/+/measurement', (err) => {
//            if (!err) {
//                console.log('[MQTT] Inscrito em reefbluesky/+/measurement');
//            }
//        });
//        
//       mqttClient.subscribe('reefbluesky/+/health', (err) => {
//            if (!err) {
//                console.log('[MQTT] Inscrito em reefbluesky/+/health');
//            }
//        });
//    });
    
//    mqttClient.on('message', (topic, message) => {
//        console.log(`[MQTT] Mensagem recebida em ${topic}:`, message.toString());
        
//        try {
//            const data = JSON.parse(message.toString());
            
//            // Processar medição
//            if (topic.includes('measurement')) {
//                handleMQTTMeasurement(data);
//            }
//            
//            // Processar health metrics
//            if (topic.includes('health')) {
//                handleMQTTHealth(data);
//            }
//        } catch (error) {
//            console.error('[MQTT] Erro ao processar mensagem:', error.message);
//        }
//   });
//    
//    mqttClient.on('error', (error) => {
//        console.error('[MQTT] Erro:', error.message);
//    });
    
//    mqttClient.on('disconnect', () => {
//        console.log('[MQTT] Desconectado do broker');
//    });
//}

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


// ===== ENDPOINTS WEB: DISPOSITIVOS DO USUÁRIO =====
// Lista devices do usuário logado
app.get('/api/v1/user/devices', authUserMiddleware, async (req, res) => {
  console.log('API GET /api/v1/user/devices');
  const userId = req.user.userId;
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      `SELECT id,
              deviceId,
              name,
              local_ip AS localIp,
              last_seen AS lastSeen,
              createdAt,
              updatedAt
         FROM devices
        WHERE userId = ?
        ORDER BY createdAt DESC`,
      [userId]
    );

    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error('API /user/devices error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar dispositivos',
      error: err.message
    });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e) {
        console.error('DB release error /user/devices:', e.message);
      }
    }
  }
});

// Histórico de medições de um device do usuário
// Histórico de medições de um device do usuário
app.get('/api/v1/user/devices/:deviceId/measurements', authUserMiddleware, async (req, res) => {
  console.log('API GET /api/v1/user/devices/:deviceId/measurements');
  const userId = req.user.userId;
  const { deviceId } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();

    // Garante que o device pertence a este usuário
    const devRows = await conn.query(
      'SELECT id FROM devices WHERE deviceId = ? AND userId = ? LIMIT 1',
      [deviceId, userId]
    );
    if (!devRows || devRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Device não encontrado para este usuário'
      });
    }

    const { from, to } = req.query;

    let sql = `
      SELECT id,
             kh,
             phref,
             phsample,
             temperature,
             timestamp,
             status,
             confidence,
             createdAt
        FROM measurements
       WHERE deviceId = ?
    `;
    const params = [deviceId];

    if (from) {
      sql += ' AND timestamp >= ?';
      params.push(Number(from));
    }
    if (to) {
      sql += ' AND timestamp <= ?';
      params.push(Number(to));
    }

    sql += ' ORDER BY timestamp DESC LIMIT 500';

    const rows = await conn.query(sql, params);

    const safeRows = rows.map(r => ({
      ...r,
      timestamp: Number(r.timestamp)
    }));

    return res.json({
      success: true,
      data: safeRows
    });

  } catch (err) {
    console.error('API /user/devices/:deviceId/measurements error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Erro ao buscar medições',
      error: err.message
    });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e) {
        console.error('DB release error /user/measurements:', e.message);
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

    const deviceId = req.user.deviceId;
    const commands = deviceCommands.get(deviceId) || [];

    // opcional: limpar fila após envio
    deviceCommands.set(deviceId, []);
    
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

// ===== BLOCO 1: Config do dispositivo (INSERIR DEPOIS DAS ROTAS /api/v1/user/devices EXISTENTES) =====

// armazenamento em memória, depois você troca por DB
const deviceConfigs = new Map(); // key: deviceId

function getOrCreateDeviceConfig(deviceId) {
  if (!deviceConfigs.has(deviceId)) {
    deviceConfigs.set(deviceId, {
      khReference: 8.0,
      intervalHours: 1,
      levels: { A: true, B: true, C: false },
      pumps: {
        1: { running: false, direction: 'forward' },
        2: { running: false, direction: 'forward' },
        3: { running: false, direction: 'forward' },
      },
    });
  }
  return deviceConfigs.get(deviceId);
}

// GET /config - usado por apiLoadDeviceConfig em dashboard-config.js
app.get('/api/v1/user/devices/:deviceId/config', authUserMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;

    // TODO: validar se o device pertence ao userId
    const cfg = getOrCreateDeviceConfig(deviceId);

    return res.json({ success: true, data: cfg });
  } catch (err) {
    console.error('GET /config error', err);
    return res.status(500).json({ success: false, message: 'Erro ao carregar config' });
  }
});

// POST /config/interval - apiSetMeasurementInterval
app.post('/api/v1/user/devices/:deviceId/config/interval', authUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.params.deviceId;
    const { intervalHours } = req.body || {};

    const n = parseInt(intervalHours, 10);
    if (!Number.isFinite(n) || n < 1 || n > 24) {
      return res.status(400).json({ success: false, message: 'intervalHours inválido' });
    }

    const chk = await pool.query(
      'SELECT id FROM devices WHERE deviceId = ? AND userId = ? LIMIT 1',
      [deviceId, userId]
    );
    if (!chk.length) return res.status(404).json({ success:false, message:'Device não encontrado para este usuário' });

    const sql = `
      INSERT INTO device_status
        (deviceId, userId, interval_hours, updatedAt)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        interval_hours = VALUES(interval_hours),
        updatedAt = NOW()
    `;
    const result = await pool.query(sql, [deviceId, userId, n]);

    return res.json({ success: true, message: 'Intervalo atualizado.' });
  } catch (err) {
    console.error('Error updating interval', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// ===== BLOCO 2: Comandos para o dispositivo (DEPOIS DO BLOCO DE CONFIG) =====

const deviceCommands = new Map(); // key: deviceId, value: array de comandos

function enqueueCommand(deviceId, type, payload = {}) {
  if (!deviceCommands.has(deviceId)) {
    deviceCommands.set(deviceId, []);
  }
  const queue = deviceCommands.get(deviceId);
  const cmd = {
    id: Date.now() + '-' + Math.random().toString(16).slice(2),
    type,
    payload,
    createdAt: Date.now(),
  };
  queue.push(cmd);
  return cmd;
}

// POST /command/pump - usado em dashboard-config.js (apiManualPump)
app.post('/api/v1/user/devices/:deviceId/command/pump', authUserMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;
    const { pumpId, direction, seconds } = req.body;

    if (!pumpId || !seconds || seconds <= 0) {
      return res.status(400).json({ success: false, message: 'pumpId/seconds inválidos' });
    }
    const dir = direction === 'reverse' ? 'reverse' : 'forward';

    const cmd = enqueueCommand(deviceId, 'manual_pump', { pumpId, direction: dir, seconds });
    console.log('[CMD] manual_pump enfileirado', deviceId, cmd);

    return res.json({ success: true, data: { commandId: cmd.id } });
  } catch (err) {
    console.error('POST /command/pump error', err);
    return res.status(500).json({ success: false, message: 'Erro ao enviar comando de bomba' });
  }
});

// POST /command/kh-correction - usado em dashboard-config.js (apiKhCorrection)
app.post('/api/v1/user/devices/:deviceId/command/kh-correction', authUserMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;
    const { volume } = req.body;

    if (typeof volume !== 'number' || volume <= 0) {
      return res.status(400).json({ success: false, message: 'volume inválido' });
    }

    const cmd = enqueueCommand(deviceId, 'kh_correction', { volume });
    console.log('[CMD] kh_correction enfileirado', deviceId, cmd);

    return res.json({ success: true, data: { commandId: cmd.id } });
  } catch (err) {
    console.error('POST /command/kh-correction error', err);
    return res.status(500).json({ success: false, message: 'Erro ao enviar correção de KH' });
  }
});

// POST /command - usado em dashboard-sistema.js (restart, reset_kh, factory_reset)
app.post('/api/v1/user/devices/:deviceId/command', authUserMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.userId;
    const { type } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, message: 'type obrigatório' });
    }

    const allowed = new Set(['restart', 'reset_kh', 'factory_reset']);
    if (!allowed.has(type)) {
      return res.status(400).json({ success: false, message: 'type inválido' });
    }

    const cmd = enqueueCommand(deviceId, type, {});
    console.log('[CMD] comando enfileirado', deviceId, cmd);

    return res.json({ success: true, data: { commandId: cmd.id } });
  } catch (err) {
    console.error('POST /command error', err);
    return res.status(500).json({ success: false, message: 'Erro ao enviar comando' });
  }
});

// Atualizar nome (fake ID) do device
// Atualizar nome (fake ID) do device
app.put(
  '/api/v1/user/devices/:deviceId/name',
  authUserMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const { deviceId } = req.params;
      const { name } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Nome não pode ser vazio.',
        });
      }

      const sql = `
        UPDATE devices
        SET name = ?
        WHERE id = ? AND userId = ?;
      `;
      const params = [name.trim(), deviceId, userId];

      await pool.query(sql, params);

      return res.json({
        success: true,
        message: 'Nome atualizado.',
      });
    } catch (err) {
      console.error('Erro ao atualizar nome do device:', err);
      return res.status(500).json({
        success: false,
        message: 'Erro interno ao atualizar nome do device.',
      });
    }
  }
);



app.get('/api/v1/user/devices/:deviceId/kh-config', authUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.params.deviceId;

    const sql = `
      SELECT
        kh_target,
        kh_reference,
        kh_tolerance_daily,
        kh_alert_enabled,
        kh_alert_channel
      FROM devices
      WHERE deviceId = ? AND userId = ?
      LIMIT 1
    `;
    const rows = await pool.query(sql, [deviceId, userId]);


    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const cfg = rows[0];
    return res.json({
      success: true,
      data: {
        khTarget: cfg.kh_target,
        khReference: cfg.kh_reference,
        khToleranceDaily: cfg.kh_tolerance_daily,
        khAlertEnabled: cfg.kh_alert_enabled,
        khAlertChannel: cfg.kh_alert_channel,
      },
    });
  } catch (err) {
    console.error('Error fetching KH config', err);
    return res.status(500).json({ success: false, message: 'Internal server error', });
  }
});


app.put('/api/v1/user/devices/:deviceId/kh-config', authUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.params.deviceId;

    const {
      khTarget,
      khReference,
      khToleranceDaily,
      khAlertEnabled,
      khAlertChannel,
    } = req.body || {};

    if (khTarget != null && (isNaN(khTarget) || khTarget < 4 || khTarget > 15)) {
      return res.status(400).json({ success: false, message: 'khTarget inválido' });
    }
    if (khReference != null && (isNaN(khReference) || khReference < 3 || khReference > 20)) {
      return res.status(400).json({ success: false, message: 'khReference inválido' });
    }
    if (khToleranceDaily != null && (isNaN(khToleranceDaily) || khToleranceDaily < 0 || khToleranceDaily > 3)) {
      return res.status(400).json({ success: false, message: 'khToleranceDaily inválido' });
    }

    const sql = `
      UPDATE devices
      SET
        kh_target = COALESCE(?, kh_target),
        kh_reference = COALESCE(?, kh_reference),
        kh_tolerance_daily = COALESCE(?, kh_tolerance_daily),
        kh_alert_enabled = COALESCE(?, kh_alert_enabled),
        kh_alert_channel = COALESCE(?, kh_alert_channel)
      WHERE deviceId = ? AND userId = ?
    `;
    const params = [
      khTarget,
      khReference,
      khToleranceDaily,
      khAlertEnabled,
      khAlertChannel,
      deviceId,
      userId,
    ];
    const result = await pool.query(sql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    return res.json({ success: true, message: 'KH config atualizada.' });
  } catch (err) {
    console.error('Error updating KH config', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


app.get('/api/v1/user/devices/:deviceId/kh-metrics', authUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceInternalId = req.params.deviceId;

    // 1) pegar deviceId (string) + kh_target do banco
    const [devRows] = await pool.query(
      'SELECT deviceId, kh_target FROM devices WHERE id = ? AND userId = ?',
      [deviceInternalId, userId]
    );

    if (devRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const { deviceId, kh_target } = devRows[0];
    if (kh_target == null) {
      return res.status(400).json({ success: false, message: 'kh_target não configurado' });
    }

    const now = Math.floor(Date.now() / 1000); // timestamp em segundos
    const windows = {
      '24h': 24 * 3600,
      '3d': 3 * 24 * 3600,
      '7d': 7 * 24 * 3600,
      '15d': 15 * 24 * 3600,
    };

    const metrics = {};

    for (const [label, seconds] of Object.entries(windows)) {
      const fromTs = now - seconds;

      const [rows] = await pool.query(
        `SELECT MIN(kh) AS minKh, MAX(kh) AS maxKh
         FROM measurements
         WHERE deviceId = ? AND timestamp >= ?`,
        [deviceId, fromTs]
      );

      const r = rows[0] || {};
      if (r.minKh == null || r.maxKh == null) {
        metrics[label] = null;
        continue;
      }

      const minKh = parseFloat(r.minKh);
      const maxKh = parseFloat(r.maxKh);

      metrics[label] = {
        minKh,
        maxKh,
        // desvios em relação ao alvo
        maxPositiveDeviation: maxKh - kh_target,
        maxNegativeDeviation: minKh - kh_target,
      };
    }

    return res.json({
      success: true,
      data: {
        khTarget: kh_target,
        metrics,
      },
    });
  } catch (err) {
    console.error('Error fetching KH metrics', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/v1/user/devices/:deviceId/status', authUserMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.params.deviceId;

    const sql = `
      SELECT
        interval_hours,
        level_a,
        level_b,
        level_c,
        pump1_running,
        pump1_direction,
        pump2_running,
        pump2_direction,
        pump3_running,
        pump3_direction
      FROM device_status
      WHERE deviceId = ? AND userId = ?
      ORDER BY updatedAt DESC
      LIMIT 1
    `;
    const rows = await pool.query(sql, [deviceId, userId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Status não encontrado' });
    }

    const s = rows[0];
    return res.json({
      success: true,
      data: {
        intervalHours: s.interval_hours,
        levels: {
          A: !!s.level_a,
          B: !!s.level_b,
          C: !!s.level_c,
        },
        pumps: {
          1: { running: !!s.pump1_running, direction: s.pump1_direction || 'forward' },
          2: { running: !!s.pump2_running, direction: s.pump2_direction || 'forward' },
          3: { running: !!s.pump3_running, direction: s.pump3_direction || 'forward' },
        },
      },
    });
  } catch (err) {
    console.error('Error fetching device status', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
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
              enabled: false,
              connected: false,
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
    //initMQTT();
    
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
    // MQTT desativado temporariamente
    process.exit(0);
});
