***

# 🌊 ReefBlueSky KH Monitor & Dosadora Balling

Sistema completo de monitoramento de alcalinidade (KH), display remoto (LCD) e automação de dosagem Balling para aquários marinhos, com firmware ESP32/ESP8266, backend Node.js, dashboards web e acesso remoto seguro via Cloudflare Tunnel.[1]

***

## 📋 Visão geral

O projeto hoje é formado por três blocos principais:

- **KH Monitor (ESP32)**  
  Unidade que mede KH, temperatura e estado do sistema, envia dados para a nuvem e recebe comandos.[2]
- **Display LCD remoto**  
  Módulo que consome um endpoint resumido do KH e exibe status em tempo real no aquário, com monitoramento de presença (ping).[3]
- **Dosadora Balling (ESP8266/ESP32)**  
  Controla até 6 bombas peristálticas, com agendamento inteligente, dose manual, calibração e alertas de nível baixo.[3]

Toda a comunicação passa por um **backend Node.js/Express**, protegido com JWT, rate limiting, Cloudflare Tunnel e monitor de _health_ dos devices.[1][3]

***

## ✨ Principais recursos

### KH Monitor

- Medição automática de KH com IA preditiva e histórico persistente em SPIFFS.[2]
- Controle de múltiplas bombas (amostragem, reagente, descarte).[2]
- Envio de métricas de saúde (heap, SPIFFS, WiFi RSSI, uptime) para o backend.[2]
- Modo AP (onboarding) com portal de configuração Web (WiFi + credenciais de nuvem).[4][5]

### Display LCD

- Consome um endpoint dedicado `/api/v1/devices/:id/display/kh-summary` (exemplo) com estado resumido: KH, pH, temperatura, última medição.[3]
- Envia pings periódicos para `/api/display/ping`, atualizando `lcd_last_seen` no backend.[3]
- Backend converte `lcd_last_seen` em status **online/offline** (`lcd_status`) e gera alertas por email/Telegram se o LCD ficar sem ping por mais de 5 minutos.[3]

### Dosadora Balling

- Até 6 bombas por dispositivo (`dosing_pumps`), com:
  - Nome configurável
  - Volume do reservatório
  - Volume atual
  - Percentual de alarme
  - Limite diário de dose (`max_daily_ml`).[3]
- Agendador por bomba (`dosing_schedules`):
  - Dias da semana (bitmask → array `days_of_week`)
  - Janela de horário (início/fim)
  - Número de doses por dia
  - Volume diário total
  - Intervalo mínimo entre doses de bombas diferentes (`min_gap_minutes`) com ajuste automático de horários e validação anti-conflito.[3]
- Execuções registradas em `dosing_executions` (origem: MANUAL / AGENDA / CALIBRATION).[3]
- Calibração de bomba com fluxo guiado (60 s de dosagem + cálculo de mL/s).[3]

### Alertas e monitoramento

- Monitor periódico em `server.js` que roda a cada 30 s:
  - **KH devices:** usa `devices.last_seen` para marcar offline/online, envia email + Telegram na transição.[3]
  - **Dosadora:** usa `dosing_devices.last_seen` e `offline_alert_sent` para controlar alertas de OFFLINE/ONLINE, além de refletir o status em `devices.dosing_status` para o dashboard geral.[3]
  - **LCD:** calcula `lcd_status` a partir de `lcd_last_seen` (string compacta `YYYYMMDDHHmmss`), envia alertas específicos para o display.[3]
- Alertas por:
  - Email (SMTP configurável via `.env`)
  - Telegram (por usuário, usando `telegram_bot_token` + `telegram_chat_id` guardados na tabela `users`).[3]

***

## 📁 Estrutura do projeto

Exemplo alinhado com o código atual:

```bash
ReefBlueSky/
├── esp32-kh/                     # Firmware KH Monitor (ESP32)
│   ├── ReefBlueSky_KH_Monitor_v3.ino
│   ├── WiFiSetup.h / WiFiSetup.cpp    # Portal AP + onboarding cloud
│   ├── CloudAuth.*                    # Auth + sync com backend
│   ├── SensorManager.*                # pH, temperatura, níveis
│   ├── PumpControl.*                  # bombas de medição
│   ├── KHAnalyzer.* / KHPredictor.*   # ciclo de teste + IA
│   └── ...
├── esp8266-doser/                # Firmware dosadora Balling
│   └── ... (status, agendador local, execução de fila)
├── backend/                      # Backend Node.js (Express)
│   ├── server.js                 # App principal, monitor OFFLINE, rotas LCD
│   ├── db-pool.js                # Pool MariaDB/MySQL
│   ├── dosing-user-routes.js     # Rotas web da dosadora (/api/v1/user/dosing)
│   ├── dosing-iot-routes.js      # Rotas IoT da dosadora (/api/v1/iot/dosing)
│   ├── display-endpoints.js      # Rotas para LCD e resumos KH
│   ├── public/                   # HTML/CSS/JS estáticos
│   │   ├── login.html
│   │   ├── dashboard-main.html   # Dashboard KH principal
│   │   └── dashboard-dosing.html # Dashboard dosadora Balling
│   ├── package.json
│   └── .env.example
└── docs/
    ├── DEPLOY_CLOUDFLARE_TUNNEL.md
    ├── SEGURANCA_REV06.md
    ├── GUIA_PRODUCAO.md
    └── ...
```

A dashboard da dosadora é um HTML estático (`public/dashboard-dosing.html`) com JS vanilla (`dashboard-dosing.js`) que consome as rotas `/api/v1/user/dosing/...` usando token JWT armazenado em `localStorage`.[3]

***

## 🔐 Autenticação, segurança e Cloudflare

### Fluxo de autenticação

- Login do usuário gera:
  - `accessToken` (JWT curto, assinado com `JWT_SECRET`)
  - `refreshToken` (mais longo, assinado com `JWT_REFRESH_SECRET`).[1][3]
- Backend usa:
  - `authUserMiddleware` para rotas web (`/api/v1/user/...`), verificando `Authorization: Bearer <token>` e populando `req.user.userId` / `req.user.role`.[3]
  - Tokens de device (CloudAuth) para endpoints IoT do KH e da dosadora.[2][3]

### Segurança no backend

- **JWT** para todas as rotas de usuário (`/api/v1/user/...`).[3]
- **Rate limiting** por IP em login e rotas sensíveis (limite configurável em `server.js`).[1]
- **CORS** restritivo (`ALLOWED_ORIGINS` no `.env`).[1]
- **Logs sem dados sensíveis** (tokens não são logados; apenas metadados).[1]
- **Validação de entrada** em rotas críticas (ex.: criação/edição de agendas de dosagem).[3]
- **Monitor online/offline** independente do frontend, para que alertas não dependam da UI.[3]

### Cloudflare Tunnel

Deploy recomendado para expor apenas o backend, mantendo todos os devices falando HTTPS:

- `cloudflared` roda na mesma máquina do backend e abre um túnel para um subdomínio (ex.: `iot.reefbluesky.com.br`).[1]
- O firmware ESP32/ESP8266 se conecta sempre via `https://iot.reefbluesky.com.br`, com certificado válido.[5][1]
- Cloudflare fornece:
  - TLS gerenciado
  - WAF básico
  - _Rate limiting_ adicional
  - Proteção de IP de origem (se desejar, o backend pode ficar atrás de firewall aceitando apenas Cloudflare).[1]

Mais detalhes em `docs/DEPLOY_CLOUDFLARE_TUNNEL.md`.[1]

***

## 🔌 Principais rotas HTTP

### Rotas IoT – Dosadora (`/api/v1/iot/dosing`)

- `POST /handshake`  
  Registra/atualiza a dosadora (`dosing_devices`), vinculando `esp_uid` ao usuário.[3]
- `POST /status`  
  Recebe heartbeat do device: uptime, RSSI, etc.  
  Atualiza `dosing_devices.last_seen`, `dosing_devices.online` e zera `offline_alert_sent` quando volta.[3]
- `POST /exec-result` (exemplo)  
  Reporta execução de dose (`dosing_executions`), erros de bomba, reservatório vazio etc. (se implementado no seu firmware atual).[3]

### Rotas Web – Dosadora (`/api/v1/user/dosing`)

Protegidas por JWT via `authUserMiddleware`.[3]

- `GET /devices`  
  Lista dosadoras do usuário.  
  Backend recalcula `online` com janela de 5 min sobre `last_seen` antes de responder.[3]
- `POST /devices`  
  Cria um registro de dosadora (antes do handshake físico associar o `esp_uid`).[3]
- `GET /devices/:deviceId/pumps`  
  Lista bombas da dosadora, auto-criando entradas faltantes para garantir 6 bombas.[3]
- `PUT /devices/:deviceId/pumps/:pumpIndex`  
  Atualiza nome, volume, limite e status (ON/OFF) de uma bomba.[3]
- `GET /devices/:deviceId/schedules`  
  Todas as agendas de todas as bombas, para exibição em tabela geral.[3]
- `GET /devices/:deviceId/pumps/:pumpIndex/schedules`  
  Agendas de uma bomba específica (para aba focada da UI).[3]
- `POST /devices/:deviceId/pumps/:pumpIndex/schedules`  
  Cria agenda com validação e ajuste automático de horários (`validateAndAdjustSchedule`).[3]
- `PUT /devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId`  
  Edita agenda (com revalidação) ou apenas liga/desliga (`enabled`).[3]
- `DELETE /devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId`  
  Remove agenda.[3]
- `POST /devices/:deviceId/pumps/:pumpIndex/manual`  
  Cria execução manual de dose em `dosing_executions` com status `PENDING`.[3]
- `POST /devices/:deviceId/pumps/:pumpIndex/calibrate/start`  
  Enfileira execução de calibração (60 s).[3]
- `POST /devices/:deviceId/pumps/:pumpIndex/calibrate/save`  
  Calcula e salva `calibration_rate_ml_s`.[3]
- `POST /pumps/:id/calibrate/abort`  
  Enfileira comando `ABORT_CALIBRATION` em `device_commands` se a dosadora estiver online.[3]

### Rotas LCD / KH

Essas rotas podem estar em `display-endpoints.js` ou diretamente em `server.js`:

- `GET /api/v1/devices/:deviceId/display/kh-summary`  
  Retorna JSON enxuto para o LCD: último KH, pH, temperatura, estado da medição e timestamp.[2][3]
- `POST /api/display/ping`  
  Atualiza `devices.lcd_last_seen` para o device KH correspondente.[3]

***

## 🔧 Configuração rápida

### Variáveis de ambiente principais (`backend/.env`)

Além das variáveis já listadas no README original, hoje são usadas:

```env
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=seu-secret-super-seguro
JWT_REFRESH_SECRET=seu-refresh-secret

# DB
DB_HOST=127.0.0.1
DB_USER=reef
DB_PASSWORD=senha
DB_NAME=reefbluesky

# Email
EMAIL_HOST=smtp.seu-dominio.com
EMAIL_PORT=587
EMAIL_USER=alerts@seu-dominio.com
EMAIL_PASS=senha-email
EMAIL_FROM="ReefBlueSky Alerts <alerts@seu-dominio.com>"

# Telegram (opcional global; por usuário fica na tabela users)
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=

# Cloudflare / URL pública
PUBLIC_BASE_URL=https://iot.seu-dominio.com.br
ALLOWED_ORIGINS=https://reefbluesky.seu-dominio.com.br
```
