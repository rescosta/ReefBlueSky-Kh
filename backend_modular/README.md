# 🌊 ReefBlueSky Server - Modular Architecture v2.0

Servidor Node.js/Express refatorado em arquitetura modular profissional, mantendo 100% de compatibilidade com todos os endpoints existentes.

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Executar](#executar)
- [Endpoints](#endpoints)
- [Estrutura de Diretórios](#estrutura-de-diretórios)
- [Módulos](#módulos)
- [Desenvolvimento](#desenvolvimento)

---

## 🎯 Visão Geral

**ReefBlueSky Server v2.0** é uma refatoração completa do servidor original, transformando 3.400 linhas em uma arquitetura modular profissional com:

- ✅ **Modularização completa** - Separação clara de responsabilidades
- ✅ **100% compatibilidade** - Todos os endpoints funcionam identicamente
- ✅ **Fácil manutenção** - Código organizado e documentado
- ✅ **Escalabilidade** - Pronto para crescimento
- ✅ **Testes** - Estrutura pronta para testes unitários
- ✅ **Documentação** - Código auto-documentado

---

## 🏗️ Arquitetura

```
Requisição HTTP
    ↓
CORS Middleware
    ↓
Rate Limiter
    ↓
Auth Middleware (se necessário)
    ↓
Route Handler
    ↓
Controller (Lógica de Request/Response)
    ↓
Service (Lógica de Negócio)
    ↓
Model (Acesso a Dados)
    ↓
Database (MariaDB)
    ↓
Response JSON
```

### Camadas

1. **Config** - Configurações centralizadas
2. **Middleware** - Interceptação e validação
3. **Routes** - Definição de endpoints
4. **Controllers** - Handlers de requisições
5. **Services** - Lógica de negócio
6. **Models** - Acesso a dados
7. **Utils** - Funções auxiliares

---

## 📦 Instalação

### Pré-requisitos

- Node.js >= 14.0.0
- npm >= 6.0.0
- MariaDB >= 10.5

### Passos

1. **Clonar repositório**
```bash
git clone <repo-url>
cd reefbluesky-server-modular
```

2. **Instalar dependências**
```bash
npm install
```

3. **Configurar variáveis de ambiente**
```bash
cp .env.example .env
# Editar .env com suas credenciais
```

4. **Criar banco de dados**
```bash
mysql -u root -p < database.sql
```

---

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=127.0.0.1
DB_USER=reefapp
DB_PASSWORD=reef
DB_NAME=reefbluesky

# JWT
JWT_SECRET=seu-secret-aqui
JWT_EXPIRY=1h
REFRESH_TOKEN_EXPIRY=30d

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=seu-email@gmail.com
EMAIL_PASSWORD=sua-senha-app

# Telegram
TELEGRAM_TOKEN=seu-token-bot
TELEGRAM_CHAT_ID=seu-chat-id

# CORS
CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
```

---

## 🚀 Executar

### Desenvolvimento

```bash
npm run dev
```

Usa `nodemon` para auto-reload ao salvar arquivos.

### Produção

```bash
npm start
```

---

## 📚 Endpoints

### Autenticação

```
POST   /api/v1/auth/register          - Registrar usuário
POST   /api/v1/auth/login             - Login
POST   /api/v1/auth/refresh-token     - Renovar token
POST   /api/v1/auth/verify-code       - Verificar código
POST   /api/v1/auth/forgot-password   - Recuperar senha
POST   /api/v1/auth/reset-password    - Resetar senha
GET    /api/v1/auth/me                - Dados do usuário
```

### Dispositivos

```
POST   /api/v1/device/register        - Registrar ESP32
POST   /api/v1/device/refresh-token   - Renovar token device
POST   /api/v1/device/sync            - Sincronizar medições
POST   /api/v1/device/health          - Enviar saúde
GET    /api/v1/device/kh-reference    - Obter referência KH
GET    /api/v1/user/devices           - Listar dispositivos
GET    /api/v1/user/devices/:id/measurements - Medições
GET    /api/v1/user/devices/:id/status - Status device
GET    /api/v1/user/devices/:id/health - Saúde device
```

### Comandos

```
POST   /api/v1/device/commands/poll   - Buscar comandos
POST   /api/v1/device/commands/complete - Completar comando
POST   /api/v1/user/devices/:id/command - Criar comando
POST   /api/v1/user/devices/:id/commands - Histórico
DELETE /api/v1/user/devices/:id/commands/:id - Cancelar
```

### Configuração

```
GET    /api/v1/user/devices/:id/config - Config device
PUT    /api/v1/user/devices/:id/config - Atualizar config
GET    /api/v1/user/devices/:id/kh-config - Config KH
PUT    /api/v1/user/devices/:id/kh-config - Atualizar KH
GET    /api/v1/user/devices/:id/kh-metrics - Métricas KH
GET    /api/v1/user/devices/:id/display/kh-summary - Display KH
```

### Telegram

```
GET    /api/v1/user/telegram-config   - Config Telegram
PUT    /api/v1/user/telegram-config   - Atualizar config
POST   /api/v1/user/telegram/test     - Testar Telegram
```

### Sistema

```
GET    /api/v1/status                 - Status do servidor
GET    /api/v1/health                 - Health check
GET    /api/v1/dashboard/example      - Exemplo dashboard
GET    /api/v1/dev/logs               - Logs
GET    /api/v1/dev/server-console     - Console servidor
GET    /api/v1/dev/device-console/:id - Console device
```

---

## 📂 Estrutura de Diretórios

```
reefbluesky-server-modular/
├── src/
│   ├── index.js                    # Entry point
│   ├── config/
│   │   ├── database.js             # Pool MariaDB
│   │   ├── environment.js          # Variáveis de ambiente
│   │   └── constants.js            # Constantes globais
│   ├── middleware/
│   │   ├── auth.js                 # Autenticação JWT
│   │   ├── rateLimiter.js          # Rate limiting
│   │   ├── errorHandler.js         # Tratamento de erros
│   │   └── cors.js                 # CORS
│   ├── services/
│   │   ├── authService.js          # Lógica de autenticação
│   │   ├── deviceService.js        # Lógica de dispositivos
│   │   ├── measurementService.js   # Lógica de medições
│   │   ├── commandService.js       # Lógica de comandos
│   │   ├── metricsService.js       # Cálculo de métricas
│   │   └── telegramService.js      # Integração Telegram
│   ├── routes/
│   │   ├── auth.js                 # Rotas de autenticação
│   │   ├── devices.js              # Rotas de dispositivos
│   │   ├── commands.js             # Rotas de comandos
│   │   ├── config.js               # Rotas de configuração
│   │   ├── telegram.js             # Rotas de Telegram
│   │   ├── system.js               # Rotas de sistema
│   │   └── pages.js                # Rotas de páginas
│   ├── controllers/
│   │   ├── authController.js       # Controlador de auth
│   │   ├── deviceController.js     # Controlador de devices
│   │   ├── commandController.js    # Controlador de comandos
│   │   ├── configController.js     # Controlador de config
│   │   ├── telegramController.js   # Controlador de Telegram
│   │   └── systemController.js     # Controlador de sistema
│   ├── models/
│   │   ├── User.js                 # Modelo de usuário
│   │   ├── Device.js               # Modelo de dispositivo
│   │   ├── Measurement.js          # Modelo de medição
│   │   └── Command.js              # Modelo de comando
│   ├── utils/
│   │   ├── logger.js               # Sistema de logs
│   │   ├── jwt.js                  # Utilitários JWT
│   │   ├── validators.js           # Validadores
│   │   └── helpers.js              # Funções auxiliares
│   └── public/                      # Arquivos estáticos
├── .env.example                     # Exemplo de variáveis
├── package.json                     # Dependências
└── README.md                        # Este arquivo
```

---

## 🔧 Módulos

### Config Module
Centraliza todas as configurações da aplicação.

### Middleware Module
Autenticação, validação e tratamento de erros.

### Services Module
Implementa toda a lógica de negócio.

### Routes Module
Define os endpoints da API.

### Controllers Module
Processa requisições e respostas.

### Models Module
Acesso aos dados do banco.

### Utils Module
Funções reutilizáveis.

---

## 👨‍💻 Desenvolvimento

### Adicionar Novo Endpoint

1. **Criar rota** em `src/routes/`
2. **Criar controller** em `src/controllers/`
3. **Criar service** em `src/services/` (se necessário)
4. **Criar model** em `src/models/` (se necessário)
5. **Testar** com curl ou Postman

### Exemplo: Novo Endpoint

**1. Route** (`src/routes/example.js`)
```javascript
router.get('/example', authUserMiddleware, exampleController.get);
```

**2. Controller** (`src/controllers/exampleController.js`)
```javascript
async get(req, res) {
  const result = await exampleService.get(req.user.id);
  res.json(result);
}
```

**3. Service** (`src/services/exampleService.js`)
```javascript
async get(userId) {
  // Lógica de negócio
}
```

---

## 🧪 Testes

```bash
npm test
```

---

## 📝 Logging

Logs estruturados com níveis: error, warn, info, debug

```javascript
logger.info('Mensagem', { dados: 'adicionais' });
logger.error('Erro', { error: err.message });
```

---

## 🔒 Segurança

- ✅ JWT para autenticação
- ✅ Bcrypt para hash de senhas
- ✅ Rate limiting
- ✅ CORS configurado
- ✅ Validação de entrada
- ✅ Proteção contra SQL injection

---

## 📊 Performance

- ✅ Compression middleware
- ✅ Connection pooling
- ✅ Caching de queries
- ✅ Índices no banco de dados

---

## 🚀 Deploy

### Cloudflare Tunnel

```bash
cloudflared tunnel create reefbluesky
cloudflared tunnel route dns reefbluesky seu-dominio.com
cloudflared tunnel run reefbluesky
```

### Docker

```bash
docker build -t reefbluesky-server .
docker run -p 3000:3000 reefbluesky-server
```

---

## 📞 Suporte

Para dúvidas ou problemas, abra uma issue no repositório.

---

## 📄 Licença

MIT

---

**Desenvolvido com ❤️ para a comunidade de aquarismo marinho**
