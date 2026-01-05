# 🏗️ Arquitetura do ReefBlueSky Server v2.0

Documentação completa da arquitetura modular.

---

## 📐 Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                   Cliente (Web/Mobile)                  │
│                   ou ESP32 (Dispositivo)                │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/HTTPS
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  Express Server                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  CORS | Compression | Body Parser | Static Files│   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Rate Limiter | Auth Middleware | Error Handler │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Router (7 módulos)                  │   │
│  │  Auth | Device | Command | Config | Telegram    │   │
│  │  System | Pages                                 │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Controllers (6 módulos)               │   │
│  │  AuthController | DeviceController              │   │
│  │  CommandController | ConfigController           │   │
│  │  TelegramController | SystemController          │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Services (6 módulos)                 │   │
│  │  AuthService | DeviceService                    │   │
│  │  MeasurementService | CommandService            │   │
│  │  MetricsService | TelegramService               │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │             Models (4 módulos)                  │   │
│  │  User | Device | Measurement | Command          │   │
│  └──────────────────────────────────────────────────┘   │
│                         ↓                               │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Utils & Helpers                     │   │
│  │  Logger | JWT | Validators | Helpers            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                  MariaDB Database                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │  users | devices | measurements | commands      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de Requisição

```
1. Cliente envia requisição HTTP
   ↓
2. Express recebe e aplica middlewares globais
   ├─ CORS
   ├─ Compression
   ├─ Body Parser
   └─ Static Files
   ↓
3. Rate Limiter verifica limite
   ↓
4. Auth Middleware valida JWT (se necessário)
   ↓
5. Router direciona para rota específica
   ↓
6. Controller processa requisição
   ├─ Valida entrada
   ├─ Chama Service
   └─ Formata resposta
   ↓
7. Service executa lógica de negócio
   ├─ Valida regras
   ├─ Chama Model
   └─ Retorna resultado
   ↓
8. Model acessa banco de dados
   ├─ Executa query
   ├─ Processa resultado
   └─ Retorna dados
   ↓
9. Resposta volta pela cadeia
   ↓
10. Error Handler (se houver erro)
    ├─ Formata erro
    ├─ Loga erro
    └─ Retorna resposta de erro
    ↓
11. Cliente recebe resposta JSON
```

---

## 📦 Módulos Principais

### 1. Config Module

**Responsabilidade:** Centralizar todas as configurações

**Arquivos:**
- `config/database.js` - Pool de conexões MariaDB
- `config/environment.js` - Variáveis de ambiente
- `config/constants.js` - Constantes globais

**Exemplo:**
```javascript
const { PORT, DB_HOST } = require('./config/environment');
const pool = require('./config/database');
```

### 2. Middleware Module

**Responsabilidade:** Interceptar e validar requisições

**Arquivos:**
- `middleware/auth.js` - Autenticação JWT
- `middleware/rateLimiter.js` - Rate limiting
- `middleware/errorHandler.js` - Tratamento de erros
- `middleware/cors.js` - CORS

**Exemplo:**
```javascript
app.use(authUserMiddleware);
app.use(rateLimiter);
```

### 3. Routes Module

**Responsabilidade:** Definir endpoints da API

**Arquivos:**
- `routes/auth.js` - Autenticação
- `routes/devices.js` - Dispositivos
- `routes/commands.js` - Comandos
- `routes/config.js` - Configuração
- `routes/telegram.js` - Telegram
- `routes/system.js` - Sistema
- `routes/pages.js` - Páginas

**Exemplo:**
```javascript
router.post('/auth/login', authLimiter, authController.login);
```

### 4. Controllers Module

**Responsabilidade:** Processar requisições e respostas

**Arquivos:**
- `controllers/authController.js`
- `controllers/deviceController.js`
- `controllers/commandController.js`
- `controllers/configController.js`
- `controllers/telegramController.js`
- `controllers/systemController.js`

**Exemplo:**
```javascript
async login(req, res) {
  const { email, password } = req.body;
  const result = await authService.login(email, password);
  res.json(result);
}
```

### 5. Services Module

**Responsabilidade:** Implementar lógica de negócio

**Arquivos:**
- `services/authService.js` - Lógica de autenticação
- `services/deviceService.js` - Lógica de dispositivos
- `services/measurementService.js` - Lógica de medições
- `services/commandService.js` - Lógica de comandos
- `services/metricsService.js` - Cálculo de métricas
- `services/telegramService.js` - Integração Telegram

**Exemplo:**
```javascript
async login(email, password) {
  // Validar email
  // Buscar usuário
  // Comparar senha
  // Gerar JWT
  // Retornar token
}
```

### 6. Models Module

**Responsabilidade:** Acesso aos dados

**Arquivos:**
- `models/User.js` - Modelo de usuário
- `models/Device.js` - Modelo de dispositivo
- `models/Measurement.js` - Modelo de medição
- `models/Command.js` - Modelo de comando

**Exemplo:**
```javascript
static async findById(id) {
  const rows = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0];
}
```

### 7. Utils Module

**Responsabilidade:** Funções reutilizáveis

**Arquivos:**
- `utils/logger.js` - Sistema de logs
- `utils/jwt.js` - Utilitários JWT
- `utils/validators.js` - Validadores
- `utils/helpers.js` - Funções auxiliares

**Exemplo:**
```javascript
logger.info('Login bem-sucedido', { userId: 123 });
```

---

## 🔐 Fluxo de Autenticação

```
1. Usuário envia email/senha
   ↓
2. authController.login() recebe
   ↓
3. authService.login() valida
   ├─ Busca usuário em banco
   ├─ Compara senha com bcrypt
   └─ Gera JWT
   ↓
4. Controller retorna token
   ↓
5. Cliente armazena token
   ↓
6. Próximas requisições incluem token no header
   Authorization: Bearer <token>
   ↓
7. authUserMiddleware valida token
   ├─ Extrai token do header
   ├─ Verifica assinatura JWT
   ├─ Obtém userId
   └─ Atualiza req.user
   ↓
8. Controller acessa req.user.id
```

---

## 📊 Estrutura de Dados

### Usuário
```javascript
{
  id: 1,
  email: 'user@example.com',
  password_hash: '$2b$10$...',
  role: 'user',
  telegram_bot_token: '123:ABC',
  telegram_chat_id: '456',
  telegram_enabled: true,
  created_at: '2024-01-01',
  last_login: '2024-01-15'
}
```

### Dispositivo
```javascript
{
  id: 1,
  user_id: 1,
  device_id: 'ESP32-001',
  name: 'Aquário Principal',
  status: 'online',
  last_seen: '2024-01-15 10:30:00',
  created_at: '2024-01-01'
}
```

### Medição
```javascript
{
  id: 1,
  device_id: 'ESP32-001',
  kh: 7.88,
  ph_ref: 7.0,
  ph_sample: 6.8,
  temperature: 25.3,
  status: 'success',
  created_at: '2024-01-15 10:30:00'
}
```

### Comando
```javascript
{
  id: 1,
  device_id: 'ESP32-001',
  type: 'pump_control',
  params: { pump_id: 1, duration: 60 },
  status: 'completed',
  result: { success: true },
  error: null,
  created_at: '2024-01-15 10:30:00'
}
```

---

## 🔄 Ciclo de Vida de uma Requisição

### Exemplo: POST /api/v1/auth/login

```
1. Cliente envia:
   POST /api/v1/auth/login
   Content-Type: application/json
   {
     "email": "user@example.com",
     "password": "senha123"
   }

2. Express recebe e aplica middlewares globais
   ├─ CORS middleware
   ├─ Compression middleware
   ├─ Body parser (JSON)
   └─ Static files middleware

3. Rate limiter verifica limite de requisições
   ├─ Se excedido: retorna 429 Too Many Requests
   └─ Se OK: continua

4. Router encontra rota /api/v1/auth/login
   └─ Direciona para authController.login()

5. Controller processa:
   ├─ Valida entrada (email, password)
   ├─ Chama authService.login()
   └─ Aguarda resultado

6. Service executa lógica:
   ├─ Busca usuário com User.findByEmail()
   ├─ Valida senha com bcrypt
   ├─ Gera JWT
   ├─ Atualiza last_login
   └─ Retorna { success: true, token: '...' }

7. Controller formata resposta:
   └─ res.json({ success: true, token: '...' })

8. Express aplica middlewares de resposta:
   ├─ Compression (comprime JSON)
   └─ CORS headers (adiciona headers)

9. Cliente recebe:
   HTTP/1.1 200 OK
   Content-Type: application/json
   {
     "success": true,
     "token": "eyJhbGc..."
   }
```

---

## 🧪 Testabilidade

Cada camada é independente e testável:

```javascript
// Testar Service sem Controller
const result = await authService.login('user@example.com', 'senha');

// Testar Model sem Service
const user = await User.findByEmail('user@example.com');

// Testar Controller com mocks
const req = { body: { email: '...', password: '...' } };
const res = { json: jest.fn() };
await authController.login(req, res);
```

---

## 🚀 Escalabilidade

A arquitetura modular permite:

1. **Adicionar novos endpoints** sem afetar existentes
2. **Refatorar módulos** independentemente
3. **Adicionar cache** em Services
4. **Adicionar queue** para jobs assíncronos
5. **Adicionar WebSocket** para real-time
6. **Adicionar GraphQL** sem remover REST

---

## 📈 Performance

- Connection pooling (MariaDB)
- Compression middleware
- Static file caching
- JWT validation rápido
- Índices no banco de dados

---

## 🔒 Segurança

- JWT com expiração
- Bcrypt para senhas
- Rate limiting
- CORS configurado
- Validação de entrada
- Proteção contra SQL injection
- Logs de segurança

---

## 📝 Convenções de Código

### Nomes de Arquivos
- Controllers: `*Controller.js`
- Services: `*Service.js`
- Models: `*.js` (PascalCase)
- Routes: `*.js` (lowercase)
- Middleware: `*.js` (lowercase)

### Estrutura de Resposta
```javascript
{
  success: true/false,
  data: { ... },
  message: "...",
  error: { ... }
}
```

### Tratamento de Erros
```javascript
try {
  // Lógica
} catch (err) {
  logger.error('Erro', { error: err.message });
  throw err;
}
```

---

## 🔄 Relacionamentos entre Módulos

```
Routes
  ↓ (chama)
Controllers
  ↓ (chama)
Services
  ↓ (chama)
Models
  ↓ (chama)
Database

Utils
  ↑ (usado por todos)

Middleware
  ↑ (intercepta todas as requisições)

Config
  ↑ (usado por todos)
```

---

## 📚 Referências

- [Express.js](https://expressjs.com/)
- [MariaDB Node.js](https://mariadb.com/docs/clients/mariadb-connector-nodejs/)
- [JWT](https://jwt.io/)
- [Bcrypt](https://www.npmjs.com/package/bcrypt)

---

**Arquitetura profissional, modular e escalável!**
