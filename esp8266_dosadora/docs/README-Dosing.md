# ReefBlueSky Dosing Firmware - Estrutura Modular

## 📦 Arquivos do Projeto

```
esp_dosadora/
├── ReefBlueSky_Dosing.ino          (Main - orquestrador)
├── WiFiSetupDoser.h                (Header - onboarding WiFi)
├── WiFiSetupDoser.cpp              (Impl - onboarding WiFi + AP captive)
├── CloudAuthDoser.h                (Header - autenticação JWT)
├── CloudAuthDoser.cpp              (Impl - device registration + sync)
├── DoserControl.h                  (Header - lógica de bombas)
├── DoserControl.cpp                (Impl - scheduler + executor)
└── platformio.ini                  (Config - veja abaixo)
```

## 🔧 platformio.ini

```ini
[platformio]
default_envs = esp8266, esp32

[env:esp8266]
platform = espressif8266
board = nodemcuv2
framework = arduino
upload_speed = 921600
monitor_speed = 115200
lib_deps =
    ArduinoJson@^6.21.0
    ESP8266WiFi
    LittleFS
build_flags =
    -Wl,-Teagle.flash.4m1m.ld

[env:esp32]
platform = espressif32
board = esp32
framework = arduino
upload_speed = 921600
monitor_speed = 115200
lib_deps =
    ArduinoJson@^6.21.0
    WiFi
    SPIFFS
```

## 🚀 Como Usar

### 1. Primeira Inicialização

1. **Carregar firmware** no ESP8266/ESP32
2. **Monitor serial** (115200 baud) mostrará:
   ```
   ╔════════════════════════════════════════════════════════╗
   ║   ReefBlueSky Balling Dosing v1.0.0                    ║
   ║   ESP8266 / ESP32 Compatible                           ║
   ╚════════════════════════════════════════════════════════╝
   ESP UID: RBS-DOSER-XXXXX
   [SETUP] WiFi Setup iniciado em AP mode
   [SETUP] Acesse: http://192.168.4.1 para configurar
   ```

3. **Conectar ao AP**:
   - SSID: `ReefBlueSkyDoser-Setup`
   - Senha: `dosing2024`
   - Abrir navegador: `http://192.168.4.1`

4. **Preencher formulário**:
   - WiFi SSID (sua rede)
   - Senha WiFi
   - Servidor URL (padrão: `https://iot.reefbluesky.com.br/api/v1`)
   - Email RBS (seu usuário)
   - Senha RBS (sua senha)

5. **Clicar "Conectar e Registrar"**
   - ESP vai conectar ao WiFi
   - Registrar como device tipo "DOSER"
   - Receber JWT token
   - Salvar credenciais em SPIFFS
   - **Reiniciar automaticamente**

### 2. Operação Normal

- **LED STATUS**: 
  - 🔴 Vermelho (LOW) = WiFi desconectado
  - 🟢 Verde (HIGH) = WiFi conectado
  - Pisca = Modo AP

- **Botão CONFIG (3+ segundos)**:
  - Volta ao AP para reconfiguração
  - Limpa credenciais salvas
  - Reinicia

- **Fluxo automático**:
  1. WiFi conecta automaticamente
  2. Token refrescado automaticamente (12h de validade)
  3. Handshake a cada 5 min: baixa config de bombas/agendas
  4. Status enviado a cada 30s (volume, sinal WiFi)
  5. Doses executadas no horário programado
  6. Cada execução reportada ao servidor

### 3. Configurar Bombas e Agendas

**No Dashboard RBS** (`dashboard-dosing.html`):
- Criar device (ESP aparecerá automaticamente após handshake)
- Adicionar bombas (índice 0-3, volume, taxa calibração)
- Criar agendas (horários, doses por dia, dias da semana)

**No ESP**: Configuração é baixada automaticamente via handshake

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────┐
│         ReefBlueSky_Dosing.ino          │  Main orchestrator
│     (setup + loop principal)            │
└────────┬────────────┬────────────┬──────┘
         │            │            │
    ┌────▼─────┐  ┌───▼──────┐  ┌──▼──────────┐
    │ WiFiSetup│  │CloudAuth │  │DoserControl │
    │         │  │          │  │             │
    │- AP Mode  │  │- JWT Token │  │- Scheduler  │
    │- Portal   │  │- Device Reg │  │- Pump Exec  │
    │- SSID/Pass│  │- Handshake │  │- Job Queue  │
    └──────────┘  │- Status    │  │- Volume Mgmt│
                  └────────────┘  └─────────────┘
                       │ HTTP Calls (JWT)
                       │
            ┌──────────▼──────────┐
            │  Backend (Node.js)  │
            │  /api/v1/device/*   │
            │  /api/v1/iot/dosing│
            └─────────────────────┘
```

## 📡 Endpoints Utilizados

### Registration (WiFi Setup → Backend)
```
POST /api/v1/device/register
{
  deviceId: "RBS-DOSER-XXXXX",
  username: "email@usuario",
  password: "senha",
  localip: "192.168.x.x",
  type: "DOSER"
}
→ Retorna: accessToken, refreshToken
```

### Handshake (Doser → Backend, a cada 5min)
```
POST /api/v1/iot/dosing/handshake
Authorization: Bearer <token>
{
  esp_uid: "RBS-DOSER-XXXXX",
  hw_type: "ESP8266" | "ESP32",
  firmware_version: "1.0.0"
}
→ Retorna: pumps[], schedules[]
```

### Status (Doser → Backend, a cada 30s)
```
POST /api/v1/iot/dosing/status
Authorization: Bearer <token>
{
  esp_uid: "RBS-DOSER-XXXXX",
  uptime_s: 3600,
  signal_dbm: -45,
  pumps: [
    { id: 1, current_volume_ml: 450, enabled: true },
    ...
  ]
}
```

### Execution Report (Doser → Backend, após cada dose)
```
POST /api/v1/iot/dosing/execution
Authorization: Bearer <token>
{
  esp_uid: "RBS-DOSER-XXXXX",
  pump_id: 1,
  scheduled_at: 1704700800,
  executed_at: 1704700805,
  volume_ml: 36,
  status: "OK" | "FAILED" | "SKIPPED",
  origin: "AUTO"
}
```

### Token Refresh (Automático, antes de expirar)
```
POST /api/v1/device/refresh-token
{
  refreshToken: "..."
}
→ Retorna: newAccessToken
```

## 🔐 Segurança

- ✅ JWT tokens com validade de 12 horas
- ✅ Refresh token automático (5min antes de expirar)
- ✅ Credenciais salvas em SPIFFS (não em RAM)
- ✅ HTTPS para comunicação com servidor
- ✅ Isolamento por usuário (backend valida)
- ✅ Rate limiting no servidor

## 📊 Estruturas de Dados

### PumpConfig
```cpp
struct PumpConfig {
  uint32_t id;
  uint8_t index;
  bool enabled;
  float calibMlPerSec;       // Taxa de vazão
  uint16_t maxDailyMl;       // Limite diário
  uint16_t currentVolumeMl;  // Volume atual
  uint16_t containerVolumeMl;// Volume total
  uint8_t alarmThresholdPct; // Alerta em %
  String name;
};
```

### Schedule
```cpp
struct Schedule {
  uint32_t id;
  bool enabled;
  uint8_t daysMask;          // 0b01111111 = todos dias
  uint8_t dosesPerDay;       // 1-24
  uint32_t startSecSinceMidnight;
  uint32_t endSecSinceMidnight;
  uint16_t volumePerDayMl;
};
```

### DoseJob
```cpp
struct DoseJob {
  uint32_t pumpId;
  uint32_t scheduleId;
  uint32_t whenEpoch;        // Hora agendada (epoch)
  uint16_t volumeMl;
  bool executed;
  uint8_t retries;
};
```

## 🐛 Debug / Troubleshooting

### Serial Monitor
Todos os módulos usam `Serial.println("[MODULE] message")`:
- `[WiFiSetup]` - Onboarding WiFi
- `[CloudAuth]` - Autenticação JWT
- `[DoserControl]` - Lógica de dosagem
- `[LOOP]`, `[HW]`, `[BTN]`, `[NTP]` - Sistema geral

### SPIFFS
- `/doser_config.json` - Credenciais WiFi
- `/doser_auth.json` - Token JWT

Limpar tudo (hard reset):
```cpp
SPIFFS.format();
ESP.restart();
```

### Modo AP
- Acesso: `http://192.168.4.1`
- DNS redirecionado (captive portal)
- Serve formulário de configuração
- POST `/save` grava e reinicia

## 📝 Melhorias Futuras

- [ ] OTA (Over-The-Air) firmware updates
- [ ] Suporte a múltiplos users/devices por ESP
- [ ] LCD/OLED display local
- [ ] Botão para dose manual
- [ ] Backup de agendas em SPIFFS (fallback offline)
- [ ] Webhook customizado para alertas
- [ ] Calibração de bomba via API
- [ ] Histórico local antes de sincronizar

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar serial monitor
2. Confirmar config.json com dados corretos
3. Verificar WiFi conectado
4. Confirmar credenciais RBS (email/senha corretos)
5. Testar handshake manualmente com `curl`

---

**Desenvolvido para ReefBlueSky - Sistema IoT de Aquarismo Marinho**
