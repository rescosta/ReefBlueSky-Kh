# Integração dos Módulos de Monitoramento e Relatórios

## Arquivos Adicionados ao Projeto

✅ **current_monitor.h** - Monitoramento de corrente (ajustado para ESP8266)
✅ **current_monitor.cpp** - Implementação do monitoramento
✅ **dosing_reports.h** - Relatórios de dosagem (ajustado para LittleFS)
✅ **dosing_reports.cpp** - Implementação dos relatórios

## Modificações Necessárias no ReefBlueSky_Dosing.ino

### 1. Adicionar Includes (após linha 28)

```cpp
// Módulos da dosadora
#include "WiFiSetupDoser.h"
#include "CloudAuthDoser.h"
#include "DoserControl.h"

// ADICIONAR AQUI:
#include "current_monitor.h"
#include "dosing_reports.h"
```

### 2. Criar Instâncias Globais (após linha 46)

```cpp
WiFiSetupDoser* wifiSetup = nullptr;
CloudAuthDoser* cloudAuth = nullptr;
DoserControl* doser = nullptr;

// ADICIONAR AQUI:
CurrentMonitor* currentMonitor = nullptr;
DosingReports* dosingReports = nullptr;
```

### 3. Inicializar no setup() (após linha 100 - depois de WiFi conectar)

```cpp
  Serial.println("[SETUP] WiFi conectado!");

  // ADICIONAR AQUI:
  // Inicializar módulo de relatórios
  Serial.println("[SETUP] Inicializando relatórios...");
  dosingReports = new DosingReports();
  dosingReports->begin();

  // Configurar bombas (ajustar nomes conforme suas bombas)
  dosingReports->setPumpName(0, "KH");
  dosingReports->setPumpName(1, "Ca");
  dosingReports->setPumpName(2, "Mg");
  dosingReports->setPumpName(3, "Trace");

  // Configurar custos (R$ por litro) - ajustar conforme seus reagentes
  dosingReports->setCostPerLiter(0, 45.00);  // KH
  dosingReports->setCostPerLiter(1, 38.00);  // Ca
  dosingReports->setCostPerLiter(2, 42.00);  // Mg
  dosingReports->setCostPerLiter(3, 120.00); // Trace

  // Configurar capacidade dos recipientes (litros)
  dosingReports->setContainerCapacity(0, 2.0);  // 2L
  dosingReports->setContainerCapacity(1, 2.0);
  dosingReports->setContainerCapacity(2, 2.0);
  dosingReports->setContainerCapacity(3, 1.0);  // 1L

  // Definir volumes restantes atuais (ajustar conforme estado atual)
  dosingReports->setContainerRemaining(0, 1.5);  // 1.5L restante
  dosingReports->setContainerRemaining(1, 1.8);
  dosingReports->setContainerRemaining(2, 0.8);
  dosingReports->setContainerRemaining(3, 0.5);

  // Inicializar monitoramento de corrente (desabilitado por enquanto)
  Serial.println("[SETUP] Inicializando monitoramento de corrente...");
  currentMonitor = new CurrentMonitor();
  currentMonitor->begin();
  // currentMonitor->setEnabled(true);  // Habilitar quando instalar sensor

  Serial.println("[SETUP] Módulos de monitoramento e relatórios inicializados!");

  // ... resto do código existente ...
```

### 4. Adicionar no loop() (no início, antes de tudo)

```cpp
void loop() {
  // ADICIONAR AQUI:
  // Atualizar monitoramento de corrente (se habilitado)
  if (currentMonitor) {
    currentMonitor->update();
  }

  // ... resto do código existente ...
```

### 5. Modificar DoserControl.cpp (ou onde faz a dosagem)

**IMPORTANTE:** Precisa modificar a função que executa a dosagem para integrar o monitoramento e registro.

Exemplo de como deve ficar a função de dosagem:

```cpp
void executarDosagem(int pumpIndex, float volumeML, float mlPerSecond) {
    Serial.printf("[Dosing] Bomba %d: %.2f ml\n", pumpIndex, volumeML);

    // Calcular duração esperada
    unsigned long expectedDuration = (volumeML / mlPerSecond) * 1000;  // ms

    // Iniciar monitoramento de corrente
    if (currentMonitor && currentMonitor->isEnabled()) {
        currentMonitor->startMonitoring(pumpIndex, expectedDuration);
    }

    // Ligar motor
    unsigned long startTime = millis();
    digitalWrite(PUMP_PINS[pumpIndex], HIGH);

    // Loop de dosagem
    unsigned long elapsed = 0;
    while (elapsed < expectedDuration) {
        // Atualizar monitoramento
        if (currentMonitor && currentMonitor->isEnabled()) {
            currentMonitor->update();

            // Verificar se watchdog interrompeu
            if (!currentMonitor->isDosingActive()) {
                Serial.println("[Dosing] WATCHDOG interrompeu dosagem!");
                digitalWrite(PUMP_PINS[pumpIndex], LOW);

                // Registrar dose com falha
                if (dosingReports) {
                    float partialVolume = volumeML * (elapsed / (float)expectedDuration);
                    dosingReports->addDoseRecord(
                        pumpIndex,
                        partialVolume,
                        elapsed,
                        expectedDuration,
                        false,  // Falha
                        "Watchdog: corrente anormal"
                    );
                }
                return;
            }
        }

        delay(100);
        elapsed = millis() - startTime;
    }

    // Desligar motor
    digitalWrite(PUMP_PINS[pumpIndex], LOW);
    unsigned long actualDuration = millis() - startTime;

    // Parar monitoramento
    if (currentMonitor && currentMonitor->isEnabled()) {
        currentMonitor->stopMonitoring();
    }

    // Registrar dose bem sucedida
    if (dosingReports) {
        dosingReports->addDoseRecord(
            pumpIndex,
            volumeML,
            actualDuration,
            expectedDuration,
            true,  // Sucesso
            ""
        );
    }

    Serial.printf("[Dosing] Concluído em %lu ms\n", actualDuration);
}
```

## Adicionar Endpoints HTTP

Se o projeto já tem um servidor web (AsyncWebServer), adicionar estas rotas:

```cpp
// GET /api/dosing/status
server.on("/api/dosing/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!dosingReports) {
        request->send(503, "application/json", "{\"error\":\"Reports not initialized\"}");
        return;
    }
    String json = dosingReports->getAllPumpsStatusJSON();
    request->send(200, "application/json", json);
});

// GET /api/dosing/report/daily
server.on("/api/dosing/report/daily", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!dosingReports) {
        request->send(503, "application/json", "{\"error\":\"Reports not initialized\"}");
        return;
    }

    int daysAgo = 0;
    if (request->hasParam("days_ago")) {
        daysAgo = request->getParam("days_ago")->value().toInt();
    }

    String json = dosingReports->getDailyReportJSON(daysAgo);
    request->send(200, "application/json", json);
});

// GET /api/dosing/report/monthly
server.on("/api/dosing/report/monthly", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!dosingReports) {
        request->send(503, "application/json", "{\"error\":\"Reports not initialized\"}");
        return;
    }

    String json = dosingReports->getMonthlyReportJSON();
    request->send(200, "application/json", json);
});

// GET /api/dosing/history.csv
server.on("/api/dosing/history.csv", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!dosingReports) {
        request->send(503, "text/plain", "Reports not initialized");
        return;
    }

    int days = 30;
    if (request->hasParam("days")) {
        days = request->getParam("days")->value().toInt();
    }

    String csv = dosingReports->getHistoryCSV(days);
    request->send(200, "text/csv", csv);
});

// POST /api/dosing/container/refill
server.on("/api/dosing/container/refill", HTTP_POST, [](AsyncWebServerRequest *request) {},
    NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (!dosingReports) {
            request->send(503, "application/json", "{\"error\":\"Reports not initialized\"}");
            return;
        }

        // Parse JSON
        StaticJsonDocument<200> doc;
        DeserializationError error = deserializeJson(doc, (char*)data);

        if (error) {
            request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        int pump = doc["pump"];
        float liters = doc["liters"];

        dosingReports->setContainerRemaining(pump, liters);

        request->send(200, "application/json", "{\"success\":true}");
    }
);

// POST /api/dosing/config
server.on("/api/dosing/config", HTTP_POST, [](AsyncWebServerRequest *request) {},
    NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
        if (!dosingReports) {
            request->send(503, "application/json", "{\"error\":\"Reports not initialized\"}");
            return;
        }

        StaticJsonDocument<300> doc;
        DeserializationError error = deserializeJson(doc, (char*)data);

        if (error) {
            request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
            return;
        }

        int pump = doc["pump"];

        if (doc.containsKey("cost_per_liter")) {
            dosingReports->setCostPerLiter(pump, doc["cost_per_liter"]);
        }

        if (doc.containsKey("capacity")) {
            dosingReports->setContainerCapacity(pump, doc["capacity"]);
        }

        request->send(200, "application/json", "{\"success\":true}");
    }
);

// GET /api/current/status
server.on("/api/current/status", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!currentMonitor) {
        request->send(503, "application/json", "{\"error\":\"Monitor not initialized\"}");
        return;
    }
    String json = currentMonitor->getStatusJSON();
    request->send(200, "application/json", json);
});

// GET /api/current/anomalies
server.on("/api/current/anomalies", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!currentMonitor) {
        request->send(503, "application/json", "{\"error\":\"Monitor not initialized\"}");
        return;
    }
    String json = currentMonitor->getAnomaliesJSON();
    request->send(200, "application/json", json);
});

// DELETE /api/current/anomalies
server.on("/api/current/anomalies", HTTP_DELETE, [](AsyncWebServerRequest *request) {
    if (!currentMonitor) {
        request->send(503, "application/json", "{\"error\":\"Monitor not initialized\"}");
        return;
    }
    currentMonitor->clearAnomalies();
    request->send(200, "application/json", "{\"success\":true}");
});
```

## Diferenças ESP8266 vs ESP32

### ADC
- **ESP8266**: 10 bits (0-1023), apenas pino A0, range 0-1.0V
- **ESP32**: 12 bits (0-4095), vários pinos ADC, range 0-3.3V
- ✅ Código já ajustado automaticamente com `#ifdef ESP8266`

### Sistema de Arquivos
- **ESP8266**: LittleFS (SPIFFS deprecated)
- **ESP32**: SPIFFS
- ✅ Código já ajustado com `#define SPIFFS LittleFS`

### Pino do Sensor de Corrente
- **ESP8266**: A0 (único pino ADC)
- **ESP32**: GPIO34 ou qualquer ADC1
- ✅ Código já ajustado automaticamente

## Hardware - Conexões para ESP8266

```
Sensor ACS712:
  VCC → 3.3V
  GND → GND
  OUT → A0 (pino ADC do ESP8266)

MOSFET IRF540N:
  Gate → D5 (GPIO14) ou outro pino digital livre
  Drain → Linha 12V dos motores
  Source → GND

Fusível:
  Linha 12V → Fusível 1A → ACS712 IN → ACS712 OUT → MOSFET Drain
```

## Testar Compilação

1. Abrir `ReefBlueSky_Dosing.ino`
2. Verificar → Compilar
3. Verificar se não há erros
4. Fazer upload para ESP8266

## Verificar Funcionamento

1. Abrir Serial Monitor (115200 baud)
2. Procurar por:
   ```
   [SETUP] Inicializando relatórios...
   [Reports] Sistema de relatórios inicializado
   [SETUP] Inicializando monitoramento de corrente...
   [Current] Sensor de corrente DESABILITADO (hardware não instalado)
   [SETUP] Módulos de monitoramento e relatórios inicializados!
   ```

3. Testar endpoints:
   ```bash
   curl http://IP_DO_ESP8266/api/dosing/status
   ```

## Próximos Passos

1. ✅ Arquivos copiados e ajustados para ESP8266
2. [ ] Adicionar includes e instâncias no .ino
3. [ ] Inicializar no setup()
4. [ ] Adicionar update() no loop()
5. [ ] Modificar função de dosagem
6. [ ] Adicionar endpoints HTTP
7. [ ] Compilar e testar
8. [ ] Instalar hardware (futuro)

## Arquivos de Referência

- **current_monitor.h/cpp** - Monitoramento de corrente
- **dosing_reports.h/cpp** - Sistema de relatórios
- **dosing-reports-routes.js** - Rotas no backend Node.js
- **RESUMO_IMPLEMENTACAO.md** - Guia completo (no diretório ESP32)
