***

```md
# ReefBlueSky KH Monitor & Dosadora Balling 🌊

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Arduino](https://img.shields.io/badge/Platform-ESP32%2FESP8266-blue)](https://www.espressif.com/en/products/socs/esp32)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20Express-green)]()
[![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)]()

**Ecossistema completo de monitoramento e automação para aquários marinhos: medição automática de KH, display LCD remoto e dosagem Balling inteligente, com backend único em Node.js/Express e acesso seguro via Cloudflare Tunnel.**

---

## 📋 Visão geral

O **ReefBlueSky** hoje é mais do que um monitor de KH isolado: é um sistema integrado formado por três dispositivos físicos e um backend central.

- **KH Monitor (ESP32)**  
  Faz o ciclo completo de medição de KH, pH e temperatura, com compensação de temperatura, histórico em SPIFFS e envio de dados para a nuvem. [file:170]
- **Display LCD remoto**  
  Módulo leve que consome um endpoint resumido do backend e exibe, no aquário, KH/pH/temperatura/estado da última medição, além de enviar pings de presença. [file:108]
- **Dosadora Balling (ESP8266/ESP32)**  
  Controla até 6 bombas peristálticas, com agendador avançado, calibração, execução manual e detecção de reservatório baixo, sempre sincronizada com o backend. [file:108]

Toda a lógica de autenticação, dashboards, APIs, alertas e monitoramento de status roda em um **único backend Node.js/Express**, exposto com segurança por **Cloudflare Tunnel**. [file:108][file:189]

---

## ✨ Funcionalidades principais

### KH Monitor (ESP32)

- Ciclo de medição em 5 fases totalmente automatizado (descarte, calibração, coleta, saturação, manutenção). [file:191][file:170]
- Método científico de saturação de CO₂ atmosférico com precisão típica de ±0.1 dKH após calibração. [file:191][file:194]
- Compensação de temperatura automática com coeficiente \( \alpha = 0.002 \) em relação a 25 °C. [file:194]
- Histórico de até ~1000 medições em SPIFFS, com envio periódico ao backend. [file:189][file:170]
- Modo AP para onboarding (configuração inicial de WiFi e credenciais de nuvem via portal web). [file:171][file:172]
- Telemetria completa: KH, pH referência, pH amostra, temperatura, erros de ciclo, uso de memória, RSSI, uptime. [file:170]

### Display LCD remoto

- Endpoint dedicado de resumo (`/api/v1/devices/:id/display/kh-summary`, nome sugerido) com KH/pH/temperatura/última medição/estado para reduzir tráfego. [file:108]
- Ping periódico para `/api/display/ping`, atualizando `lcd_last_seen` no registro do device e permitindo cálculo de `lcd_status` (online/offline). [file:108]
- Integração com sistema de alertas: se o LCD ficar sem ping por mais que o limiar configurado (ex.: 5 minutos), o backend aciona alerta por email/Telegram. [file:108]

### Dosadora Balling

- Arquitetura baseada em três tabelas principais:  
  `dosing_devices`, `dosing_pumps`, `dosing_schedules` + `dosing_executions` para histórico de doses. [file:108]
- Até **6 bombas** por dosadora, com:
  - Nome, volume total, volume atual estimado
  - Percentual de alarme (ex.: alerta quando <20%)  
  - Limite de dose diária (`max_daily_ml`) para proteção. [file:108]
- **Agendador inteligente**:
  - Dias da semana por agenda (bitmask -> lista `days_of_week`)  
  - Janela de horário (início/fim do dia)  
  - Volume diário total e número de doses por dia  
  - Cálculo automático dos horários das doses e validação de conflitos com `min_gap_minutes` entre doses de bombas diferentes. [file:108]
- **Execuções e calibração**:
  - Execuções registradas em `dosing_executions` com origem `MANUAL`, `AGENDA` ou `CALIBRATION`. [file:108]
  - Fluxo guiado de calibração com dose contínua por 60 s e cálculo de `calibration_rate_ml_s`. [file:108]
  - Comando de abortar calibração enfileirado em `device_commands` quando o usuário clica em “Abortar”. [file:108]
- Integração futura/atual com IA preditiva do KH Monitor para ajuste automático de dosagem (documentada no arquivo de IA). [file:192]

### Backend, dashboard e alertas

- **Backend único** em Node.js + Express, usando `server.js` como entrypoint e `db-pool.js` para pool MariaDB/MySQL. [file:108]
- Dashboards e páginas em **HTML/JS estático** dentro de `backend/public`, incluindo:
  - `login.html`
  - `dashboard-main.html` (KH)
  - `dashboard-dosing.html` (dosadora) [file:108]
- Autenticação via JWT e middleware `authUserMiddleware` para proteger rotas de usuário (`/api/v1/user/...`). [file:108]
- Monitor de **status online/offline**:
  - KH: baseado em `devices.last_seen`  
  - Dosadora: `dosing_devices.last_seen` + `offline_alert_sent`  
  - LCD: `devices.lcd_last_seen` e campo derivado `lcd_status` [file:108]
- Sistema de alertas:
  - Email via SMTP configurável no `.env`  
  - Telegram por usuário com `telegram_bot_token` e `telegram_chat_id` gravados na tabela `users` [file:108]

---

## 🧱 Arquitetura e estrutura de pastas

Estrutura sugerida do repositório monolítico:

```bash
ReefBlueSky/
├── esp32-kh/                         # Firmware KH Monitor (ESP32)
│   ├── ReefBlueSky_KH_Monitor_v3.ino
│   ├── WiFiSetup.h / WiFiSetup.cpp   # Onboarding WiFi + portal AP
│   ├── CloudAuth.*                   # Autenticação com backend
│   ├── SensorManager.*               # pH, temperatura, nível
│   ├── PumpControl.*                 # Bombas do sistema de medição
│   ├── KHAnalyzer.*                  # Cálculo de KH
│   ├── KHPredictor.*                 # IA preditiva (tendência de KH)
│   └── MeasurementHistory.*          # Histórico em SPIFFS
├── esp8266-doser/                    # Firmware dosadora Balling
│   ├── main.ino
│   └── ...                           # Lógica de fila, execução, heartbeat
├── lcd-display/                      # Firmware do display LCD remoto
│   ├── lcd_main.ino
│   └── ...                           # Consumo do endpoint resumo + ping
├── backend/                          # Backend Node.js / Express
│   ├── server.js                     # Servidor principal + cron de monitor
│   ├── db-pool.js                    # Pool MariaDB/MySQL
│   ├── dosing-user-routes.js         # Rotas web (dashboard dosadora)
│   ├── dosing-iot-routes.js          # Rotas IoT da dosadora
│   ├── display-endpoints.js          # Rotas LCD + resumos KH
│   ├── public/                       # Frontend estático
│   │   ├── login.html
│   │   ├── dashboard-main.html
│   │   ├── dashboard-dosing.html
│   │   ├── js/
│   │   │   ├── dashboard-main.js
│   │   │   └── dashboard-dosing.js
│   │   └── css/
│   ├── package.json
│   └── .env.example
└── docs/                             # Documentação em Markdown/PDF
    ├── ReefBlueSky-KH-Monitor.md
    ├── ReefBlueSky-KH-Monitor-Manual-de-Operacao.md
    ├── ReefBlueSky-KH-Monitor-Manual-de-Montagem-Completo.md
    ├── ReefBlueSky-KH-Monitor-Guia-Completo-de-Fiacao-e-Fonte-de-Alimentacao.md
    ├── ReefBlueSky-KH-Monitor-Guia-Completo-de-Calibracao.md
    ├── ReefBlueSky-KH-Monitor-Sistema-de-IA-Preditiva-para-Correcao-Automatica-de-KH.md
    ├── ...
```

---

## 🔐 Autenticação, rotas e segurança

### Autenticação de usuário (dashboard)

- Fluxo baseado em **JWT**:
  - `accessToken` curto, assinado com `JWT_SECRET`
  - `refreshToken` mais longo, assinado com `JWT_REFRESH_SECRET` [file:189][file:108]
- Middleware `authUserMiddleware`:
  - Lê `Authorization: Bearer <token>`
  - Valida assinatura e expiração
  - Injeta `req.user.userId` e `req.user.role` nas rotas [file:108]

Principais rotas web (todas sob `/api/v1/user/...`):

- Autenticação
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout` [file:189][file:108]
- KH Monitor
  - `GET /api/v1/user/devices` – lista dispositivos KH do usuário
  - `GET /api/v1/user/devices/:id/measurements` – histórico paginado [file:108]
- Dosadora Balling  
  (em `dosing-user-routes.js`):
  - `GET /api/v1/user/dosing/devices`
  - `POST /api/v1/user/dosing/devices`
  - `GET /api/v1/user/dosing/devices/:deviceId/pumps`
  - `PUT /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex`
  - `GET /api/v1/user/dosing/devices/:deviceId/schedules`
  - `GET /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules`
  - `POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules`
  - `PUT /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId`
  - `DELETE /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/schedules/:scheduleId`
  - `POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/manual`
  - `POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/calibrate/start`
  - `POST /api/v1/user/dosing/devices/:deviceId/pumps/:pumpIndex/calibrate/save`
  - `POST /api/v1/user/dosing/pumps/:id/calibrate/abort` [file:108]

### Autenticação de dispositivos (IoT)

- KH Monitor e dosadora usam um token de dispositivo / segredo configurado no onboarding via `CloudAuth` ou rota de handshake. [file:170][file:108]
- Rotas IoT típicas (em `dosing-iot-routes.js` e rotas KH equivalentes):
  - `POST /api/v1/iot/dosing/handshake`
  - `POST /api/v1/iot/dosing/status`
  - `POST /api/v1/iot/dosing/exec-result`
  - `POST /api/v1/iot/kh/telemetry`
  - `POST /api/v1/iot/kh/health` [file:108][file:170]

### Rotas LCD

- `GET /api/v1/devices/:deviceId/display/kh-summary` – resumo enxuto para o LCD. [file:108]
- `POST /api/display/ping` – ping periódico do LCD (atualiza `lcd_last_seen`). [file:108]

### Camadas de segurança

- **Criptografia**:
  - Tokens e segredos criptografados no NVS do ESP32 (AES) [file:189]
  - Comunicação entre devices e backend sempre via HTTPS (Cloudflare Tunnel) [file:189]
- **HTTPS obrigatório**:
  - Redirecionamento HTTP → HTTPS no backend
  - Cloudflare fornece TLS de ponta a ponta até o túnel [file:189]
- **Rate limiting**:
  - Login e rotas sensíveis com limite de requisições por IP/intervalo
  - Cloudflare pode aplicar rate limiting adicional na borda [file:189]
- **Proteções lógicas**:
  - Command whitelist para comandos que o backend envia ao device
  - Validação robusta de payloads das rotas de dosagem (volumes, horários, dias da semana etc.)
  - Logs de auditoria sem dados sensíveis (sem tokens/senhas em log) [file:189][file:108]
- **Monitor de integridade**:
  - Tarefa em `server.js` rodando a cada X segundos:
    - Atualiza status online/offline por `last_seen`
    - Envia alertas na transição de estado
    - Garante que o dash sempre reflita o estado real, mesmo se o frontend não estiver aberto [file:108]

---

## ☁️ Cloudflare Tunnel e deploy

O deploy recomendado é manter o backend em uma máquina ou VPS atrás de firewall, expondo-o para a internet **apenas** através de um túnel Cloudflare.

Fluxo simplificado:

1. Instalar `cloudflared` no servidor que roda o backend. [file:189]
2. Autenticar com sua conta Cloudflare (`cloudflared login`). [file:189]
3. Criar um túnel apontando para `http://localhost:3000` (ou porta configurada do Express). [file:189]
4. Vincular o túnel a um subdomínio (por exemplo, `iot.seu-dominio.com.br`). [file:189]
5. Configurar como serviço `systemd` para iniciar com o sistema (túnel + backend). [file:189]

No firmware (KH Monitor, dosadora, LCD), o endpoint passa a ser sempre algo como:

```cpp
#define CLOUD_SERVER   "iot.seu-dominio.com.br"
#define CLOUD_PORT     443
#define CLOUD_ENDPOINT "/api/v1/iot/kh/telemetry"   // ou rotas da dosadora
```

Dessa forma, todos os devices usam TLS válido, com proteção extra de WAF e rate limiting na borda da Cloudflare. [file:172][file:189]

---

## ⚙️ Configuração rápida

### Backend (`backend/.env`)

Exemplo de `.env` consolidando as variáveis usadas hoje:

```env
PORT=3000
NODE_ENV=production

# JWT
JWT_SECRET=seu-secret-super-seguro
JWT_REFRESH_SECRET=seu-refresh-secret

# DB (MariaDB/MySQL)
DB_HOST=127.0.0.1
DB_USER=reef
DB_PASSWORD=senha
DB_NAME=reefbluesky

# Email Alerts
EMAIL_HOST=smtp.seu-dominio.com
EMAIL_PORT=587
EMAIL_USER=alerts@seu-dominio.com
EMAIL_PASS=sua-senha
EMAIL_FROM="ReefBlueSky Alerts <alerts@seu-dominio.com>"

# Cloud / Frontend
PUBLIC_BASE_URL=https://iot.seu-dominio.com.br
ALLOWED_ORIGINS=https://reefbluesky.seu-dominio.com.br

# (Opcional) Telegram global
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

Os detalhes extras de deploy e segurança fina estão nos documentos específicos em `docs/`. [file:189]

### Firmware KH Monitor

- Código principal em `esp32-kh/ReefBlueSky_KH_Monitor_v3.ino`. [file:170]
- WiFi/AP/Cloud configurados em `WiFiSetup.h / WiFiSetup.cpp`. [file:171][file:172]
- Ao iniciar pela primeira vez, o ESP32 abre um AP temporário com página de configuração para:
  - SSID/senha WiFi
  - URL/host do backend
  - Token/segredo do dispositivo [file:171][file:172]

---

## 📚 Documentação complementar

Os seguintes arquivos em `docs/` detalham cada parte do sistema:

- `ReefBlueSky-KH-Monitor-Manual-de-Operacao.md` – uso diário, dashboards, interpretação dos dados. [file:195]
- `ReefBlueSky-KH-Monitor-Manual-de-Montagem-Completo.md` – montagem mecânica/eletrônica/hidráulica completa. [file:196]
- `ReefBlueSky-KH-Monitor-Guia-Completo-de-Fiacao-e-Fonte-de-Alimentacao.md` – dimensionamento de fontes, fiação, pinagem e consumo. [file:197]
- `ReefBlueSky-KH-Monitor-Guia-Completo-de-Calibracao.md` – calibração de KH, pH, temperatura e sensores de nível. [file:198]
- `ReefBlueSky-KH-Monitor-Sistema-de-IA-Preditiva-para-Correcao-Automatica-de-KH.md` – arquitetura da IA, métricas e roadmap. [file:192]
- Artigo técnico: `ReefBlueSky-KH-Monitor_-Um-Sistema-Automatizado-de-Codigo-Aberto-para-Monitoramento-Continuo-de-Alcalinidade-em-Aquarios-Marinhos.md`. [file:194]

---
