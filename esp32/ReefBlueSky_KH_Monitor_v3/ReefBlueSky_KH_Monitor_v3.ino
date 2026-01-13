// =================================================================================
// ReefBlueSky KH Monitor - Versão 2.0 com IA Preditiva e Reset
// Microcontrolador: ESP32 DevKit V1
// Framework: Arduino
// Versão: 2.0 (com IA preditiva, persistência e reset)
// =================================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WebServer.h>
#include <SPIFFS.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "TimeProvider.h"
#include <time.h>
#include "NTP_DEBUG_HELPERS.h"  // ← Adicionar APÓS os outros includes

// Incluir módulos de controle
#include "PumpControl.h"
#include "SensorManager.h"
#include "Safety.h" 
#include "KH_Analyzer.h"
#include "KH_Predictor.h"
#include "MeasurementHistory.h"
void wifiFactoryReset(); 
#include "MultiDeviceAuth.h"
#include "WiFiSetup.h"
#include "CloudAuth.h"
#include "HardwarePins.h"
#include "AiPumpControl.h"  

extern CloudAuth cloudAuth;

extern const char* CLOUD_BASE_URL;

// =================================================================================
// Configurações de Comunicação
// =================================================================================

//const char* ssid = "";
//const char* password = "";




// Vazão calibrada da bomba 1 (mL/s). Ajuste após teste real.
const float PUMP1MLPERSEC = 0.8f;
const int   MAX_CORRECTION_SECONDS = 120;  // safety
// Vazão da bomba 4 (correção de KH) em mL/s, calibrável
float pump4MlPerSec = 0.8f;   // valor default até calibrar
bool pump4AbortRequested = false; 

//NTP
const char* ntpServer = "time.google.com";
const long  gmtOffset_sec = -3 * 3600;  // -03:00 Brasil (Brasília)
const int   daylightOffset_sec = 0;     // sem horário de verão

//

const unsigned long CMD_INTERVAL_MS  = 1000;   // 1 s
const unsigned long SYNC_INTERVAL_MS = 10000;  // 10 s

static unsigned long lastCmdPoll  = 0;
static unsigned long lastSyncTry  = 0;

float khTarget = 8.0f;  // default

float getHeapUsagePercent() {
  size_t total = ESP.getHeapSize();
  size_t free  = ESP.getFreeHeap();
  if (total == 0) return 0.0f;
  float used = (float)(total - free);
  return (used / (float)total) * 100.0f;
}

float getSpiffsUsagePercent() {
  if (!SPIFFS.begin(true)) {
    return 0.0f;
  }
  size_t total = SPIFFS.totalBytes();
  size_t used  = SPIFFS.usedBytes();
  if (total == 0) return 0.0f;
  return ((float)used / (float)total) * 100.0f;
}


unsigned long firstNoTokenTime = 0;
const unsigned long MAX_NO_TOKEN_MS = 10UL * 60UL * 1000UL; // ex: 10 minutos

// =================================================================================
// Objetos Globais
// =================================================================================

PumpControl pumpControl;
SensorManager sensorManager(PH_PIN, ONE_WIRE_BUS);
KH_Analyzer khAnalyzer(&pumpControl, &sensorManager);
MeasurementHistory history;
WebServer webServer(80); 


WiFiSetup wifiSetup;

// teste forçando mediçao fake

void debugForceSync() {
  Measurement m;

  unsigned long long ts = getCurrentEpochMs();
  if (ts == 0) {
    Serial.println("[DEBUG] NTP ainda não ok, usando millis() para timestamp");
    ts = millis() / 1000ULL;
  }
  m.timestamp    = ts;              // ← usa o ts já tratado
  m.kh           = 7.5;
  m.ph_reference = 8.2;
  m.ph_sample    = 8.0;
  m.temperature  = sensorManager.getTemperature();
  m.is_valid     = true;
  m.confidence   = 0.9;

  cloudAuth.queueMeasurement(m);
  Serial.printf("[DEBUG] Medição fake enfileirada. Fila: %d\n",
                cloudAuth.getQueueSize());

  cloudAuth.syncOfflineMeasurements();
  Serial.println("[DEBUG] Sync manual disparado.");
}

void debugForceSyncWithKH(float kh) {
  Measurement m;

  unsigned long long ts = getCurrentEpochMs();
  if (ts == 0) {
    Serial.println("[DEBUG] NTP ainda não ok, usando millis() para timestamp");
    ts = millis() / 1000ULL;
  }
  m.timestamp    = ts;           
  m.kh           = kh;
  m.ph_reference = 8.2;
  m.ph_sample    = 8.0;
  m.temperature  = sensorManager.getTemperature();
  m.is_valid     = true;
  m.confidence   = 0.9;

  cloudAuth.queueMeasurement(m);
  Serial.printf("[DEBUG] Medição fake (KH=%.2f) enfileirada. Fila: %d\n",
                kh, cloudAuth.getQueueSize());
}


// fim do teste fake


// =================================================================================
// Estados e Variáveis Globais
// =================================================================================

enum SystemState {
  STARTUP, IDLE, MEASURING, PREDICTING, ERROR, WAITING_CALIBRATION,
  AI_KH_CALIBRATE_PH,      // C→B (calibra pH)
  AI_KH_RENEW_A,           // Aquário→A + CO2
  AI_KH_TEST_A_TO_B,       // A→B (mede KH)
  AI_KH_CLEAN_B_TO_C,      // B→C (limpa)
  AI_PREP_NEW_TEST         // A+B→Aquário (prepara novo)
};


SystemState systemState = STARTUP;

unsigned long lastMeasurementTime = 0;
unsigned long measurementInterval = 3600000;  // 1 hora em ms
unsigned long lastResetButtonCheck = 0;
const unsigned long HEALTH_INTERVAL_MS = 120UL * 1000UL; // 120 segundos
unsigned long lastHealthSent = 0;

bool resetButtonPressed = false;

bool testModeEnabled = true;   

// 🔥 COMPRESSOR NON-BLOCKING
bool compressorActive = false;
unsigned long compressorStartTime = 0;
const unsigned long COMPRESSOR_TIME = 30000;  // 30s

// topo do arquivo
bool ntpInitialized = false;
bool ntpSynced = false;
unsigned long ntpLastAttempt = 0;

void tryNtpOnceNonBlocking() {
  if (!WiFi.isConnected()) return;
  if (ntpSynced) return; // já sincronizado
  if (!ntpInitialized) {
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    Serial.printf("[NTP] configTime chamado, servidor=%s\n", ntpServer);
    ntpInitialized = true;
    ntpLastAttempt = millis();
    return;
  }

  if (millis() - ntpLastAttempt < 1000) return; // 1s entre checagens
  ntpLastAttempt = millis();

  struct tm timeinfo;
  if (getLocalTime(&timeinfo)) {
    ntpSynced = true;
    Serial.println("[NTP] NTP sincronizado com sucesso.");
  } else {
    static int retries = 0;
    retries++;
    Serial.println("[NTP] Aguardando sincronizar...");
    if (retries >= 15) {
      Serial.println("[NTP] Falha ao sincronizar (timeout), seguindo sem NTP.");
      ntpSynced = false; // segue vida, tenta de novo mais tarde se quiser
    }
  }
}

#include <nvs_flash.h>
#include <nvs.h>

void wifiResetButtonTask(void *arg) {
  gpio_config_t io_conf = {};
  io_conf.pin_bit_mask = 1ULL << WIFI_RESET_BTN_GPIO;
  io_conf.mode = GPIO_MODE_INPUT;
  io_conf.pull_up_en = GPIO_PULLUP_ENABLE;
  io_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;
  io_conf.intr_type = GPIO_INTR_DISABLE;
  gpio_config(&io_conf);

  const TickType_t checkInterval = pdMS_TO_TICKS(50);
  const TickType_t holdTime      = pdMS_TO_TICKS(5000); // 5s

  TickType_t pressedSince = 0;
  bool wasPressed = false;

  while (true) {
    int level = gpio_get_level(WIFI_RESET_BTN_GPIO); // 0 = pressionado (pull-up)

    if (level == 0) {
      if (!wasPressed) {
        wasPressed = true;
        pressedSince = xTaskGetTickCount();
        Serial.println("[WiFiReset] Botão BOOT pressionado...");
      } else {
        TickType_t now = xTaskGetTickCount();
        if ((now - pressedSince) >= holdTime) {
          Serial.println("[WiFiReset] BOOT segurado 5s. Limpando Wi‑Fi e reiniciando...");
          wifiFactoryReset();  
        }
      }
    } else {
      wasPressed = false;
    }

    vTaskDelay(checkInterval);
  }
}



bool forceImmediateMeasurement = false;

// Estado da conexão com a nuvem
bool cloudConnected = true;
unsigned long lastReconnectAttemptMs = 0;
String accessToken;  
String refreshToken; 

const unsigned long RECONNECT_INTERVAL_MS = 30UL * 1000UL; // ex: 30s

void handleCloudReconnect(unsigned long now) {
  // Se já estamos conectados à nuvem, nada a fazer
  if (cloudAuth.isConnected()) {
    cloudConnected = true;
    return;
  }

  // Sem WiFi, nem tenta
  if (!WiFi.isConnected()) {
    cloudConnected = false;
    return;
  }

  // Respeita intervalo mínimo entre tentativas
  if (now - lastReconnectAttemptMs < RECONNECT_INTERVAL_MS) {
    return;
  }
  lastReconnectAttemptMs = now;

  Serial.println("[Cloud] Tentando (re)autenticar device via CloudAuth::init()...");

  // init() tenta: loadTokenSecurely -> checa expiração -> refreshTokenIfNeeded
  if (cloudAuth.init()) {
    Serial.println("[Cloud] Device autenticado, token disponível.");
    cloudConnected = true;
  } else {
    Serial.println("[Cloud] Ainda sem token válido (aguardando registro ou erro).");
    cloudConnected = false;
  }

  // Watchdog para estado "sem token" por muito tempo
  if (cloudConnected) {
    // reset do timer se conectou à nuvem
    firstNoTokenTime = 0;
  } else {
    // só conta se WiFi estiver conectado
    if (WiFi.isConnected()) {
      if (firstNoTokenTime == 0) {
        firstNoTokenTime = now;
      } else if (now - firstNoTokenTime > MAX_NO_TOKEN_MS) {
        Serial.println("[Cloud] Sem token válido há muito tempo. Reiniciando device...");
        delay(2000);
        ESP.restart();
      }
    } else {
      // se WiFi caiu, reseta o timer; reconexão já é tratada pelo WiFiSetup
      firstNoTokenTime = 0;
    }
  }
}
void setup() {
  Serial.begin(115200); delay(1000);
  lastHealthSent = millis() - HEALTH_INTERVAL_MS;

  Serial.println("\n\n========================================");
  Serial.println("ReefBlueSky KH Monitor - Inicializando");
  Serial.println("Versão: 2.0 com IA Preditiva");
  Serial.println("========================================\n");

  // 1️⃣ RESET botão (OK)
  //pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  // 2️⃣ WIFI PRIMEIRO (CRÍTICO!)
    Serial.println("[Main] Iniciando WiFiSetup...");
  bool wifiOk = wifiSetup.begin();

  if (wifiOk && WiFi.isConnected()) {  // ← + WiFi.isConnected()!
    Serial.println("[Main] WiFi STA conectado!");
    
    // Auth só com STA
    initMultiDeviceAuth();
    Serial.println("✓ Auth OK");
    cloudAuth.setDeviceId(deviceId);
    cloudAuth.init();
    
    //WiFi.softAPdisconnect(true);  // Desliga AP do setup
    //WiFi.mode(WIFI_STA);
    
    setupWebServer();  
  } else {
    Serial.println("[Main] AP mode ativo. Configure WiFi em 192.168.4.1");
  }

  // 4️⃣ HARDWARE DEPOIS auth (1x SÓ!)
  pumpControl.begin();
  sensorManager.begin();
  khAnalyzer.begin();                       // ← 1x SÓ!
  history.begin();
  loadPump4CalibrationFromSPIFFS();
  pinMode(COMPRESSOR_PIN, OUTPUT);
  digitalWrite(COMPRESSOR_PIN, LOW);

  pinMode(PUMP4_IN1, OUTPUT); pinMode(PUMP4_IN2, OUTPUT); pinMode(PUMP4_PWM, OUTPUT);
  digitalWrite(PUMP4_IN1, LOW); digitalWrite(PUMP4_IN2, LOW); analogWrite(PUMP4_PWM, 0);

  // 5️⃣ Config final
  sensorManager.setSimulatePH(true, 8.2f, 8.0f);
  setupWebServer();

  // 6️⃣ Task WiFiReset (OK)
  xTaskCreate(wifiResetButtonTask, "wifi_reset_btn", 4096, nullptr, 5, nullptr);

  // 7️⃣ KH ref check (FINAL)
  Serial.printf("[BOOT] kh_configured=%s, kh_ref=%.2f\n",
                khAnalyzer.isReferenceKHConfigured() ? "true" : "false",
                khAnalyzer.getReferenceKH());
  
  if (!khAnalyzer.isReferenceKHConfigured()) {
    Serial.println("[BOOT] KH ref indisponível. Configure via web.");
    systemState = WAITING_CALIBRATION;
  } else {
    Serial.println("[BOOT] KH ref OK. IDLE.");
    systemState = IDLE;
  }
 
  initAiPumpControl();
}


// =================================================================================
// Loop Principal
// =================================================================================
static bool lastWifiConnected = false;

void loop() {
  unsigned long now = millis();
  tryNtpOnceNonBlocking();

  bool nowConnected = (WiFi.status() == WL_CONNECTED);
  if (nowConnected && !lastWifiConnected) {
    Serial.println("[Main] WiFi reconectado (auto). Fechando portal se ainda ativo.");
    wifiSetup.closePortalIfActive();
  }
  lastWifiConnected = nowConnected;

  if (!wifiSetup.isConfigured()) {
    wifiSetup.loopReconnect();  
    delay(100);
    return;
  }

  Serial.printf("[LEVEL] A=%d(%.0f) B=%d(%.0f) C=%d(%.0f)\n",
    sensorManager.getLevelA(), analogRead(LEVEL_A_PIN)*3.3/4095,
    sensorManager.getLevelB(), analogRead(LEVEL_B_PIN)*3.3/4095,
    sensorManager.getLevelC(), analogRead(LEVEL_C_PIN)*3.3/4095);


  // 🔥 1. SERIAL DEBUG (ÚNICO BLOCO!)
  if (Serial.available()) {
    char c = Serial.read();
    
    if (c == 's') debugForceSync();
    if (c == 't') debugForceSync();
    if (c == 'k') { 
      Serial.println("🚀 [AI-KH] Iniciando fluxo teste KH...");
      systemState = AI_KH_CALIBRATE_PH;
    }
    if (c == '4') { 
      Serial.println("💉 Teste Bomba 4 KH (10s)");
      digitalWrite(PUMP4_IN1, HIGH); 
      digitalWrite(PUMP4_IN2, LOW); 
      analogWrite(PUMP4_PWM, 180);
      delay(10000); 
      digitalWrite(PUMP4_IN1, LOW); 
      digitalWrite(PUMP4_IN2, LOW); 
      analogWrite(PUMP4_PWM, 0);
    }
    if (c == 'c') { 
      Serial.println("💨 Compressor ON (30s)");
      digitalWrite(COMPRESSOR_PIN, HIGH); delay(30000); digitalWrite(COMPRESSOR_PIN, LOW);
    }
    
    // Toggle sensores nível
    if (c == 'a') sensorManager.setLevelAEnabled(true);
    if (c == 'A') sensorManager.setLevelAEnabled(false);
    if (c == 'b') sensorManager.setLevelBEnabled(true);
    if (c == 'B') sensorManager.setLevelBEnabled(false);
    if (c == 'l') sensorManager.setLevelCEnabled(true);
    if (c == 'L') sensorManager.setLevelCEnabled(false);
  }

  // 🔥 2. CLOUD & COMMANDS
  handleCloudReconnect(now);
  
  if (now - lastCmdPoll >= CMD_INTERVAL_MS) {
    lastCmdPoll = now;
    processCloudCommand();
  }
  
  if (now - lastSyncTry >= SYNC_INTERVAL_MS) {
    lastSyncTry = now;
    cloudAuth.syncOfflineMeasurements();
  }

  // 🔥 3. WEB SERVER
  webServer.handleClient();
  wifiSetup.loopReconnect();

  // 🔥 4. AI PUMP CONTROL
  int aiAction = getFuzzyDecision();
  if (aiAction & PUMP_A_IN) { pumpControl.pumpA_fill(); Serial.println("🤖 AI → Pump A"); }
  if (aiAction & PUMP_B_OUT) { pumpControl.pumpB_discharge(); Serial.println("🤖 AI → Pump B"); }
  if (aiAction & PUMP_C_IN) { pumpControl.pumpC_fill(); Serial.println("🤖 AI → Pump C"); }

  //checkResetButton();

  // 🔥 5. MÁQUINA DE ESTADOS
  switch (systemState) {
    case STARTUP: systemState = IDLE; break;

    case WAITING_CALIBRATION:
      if (khAnalyzer.isReferenceKHConfigured()) {
        systemState = IDLE;
      } else {
        delay(1000);
      }
      break;

    case IDLE:
      if (forceImmediateMeasurement) {
        forceImmediateMeasurement = false;
        systemState = MEASURING;
      } else if (testModeEnabled && shouldMeasure()) {
        systemState = MEASURING;
      }
      break;

    case MEASURING:
      performMeasurement();
      systemState = PREDICTING;
      break;

    case PREDICTING:
      performPrediction();
      systemState = IDLE;
      lastMeasurementTime = now;
      break;

    case AI_KH_CALIBRATE_PH:  // ← MESMO NOME DO ENUM
      if (!isAiActive()) {
        Serial.println("🤖 CALIBRANDO IA DURANTE KH SETUP...");
        calibrateAiSensors();
      }
      
      if (sensorManager.getLevelB() > 70) {
        systemState = AI_KH_RENEW_A;  // ← TAMBÉM UNDERSCORE
        Serial.println("✅ pH calibrado + IA ATIVA! Renovando A...");
      }
      break;

    case AI_KH_RENEW_A:
      if (sensorManager.getLevelA() > 80) {
        systemState = AI_KH_TEST_A_TO_B;
        Serial.println("✅ A renovado → Teste KH");
      }
      break;

    case AI_KH_TEST_A_TO_B:
      if (sensorManager.getLevelB() > 70) {
        systemState = AI_KH_CLEAN_B_TO_C;
        Serial.println("✅ KH medido → Limpando");
        performMeasurement();
      }
      break;

    case AI_KH_CLEAN_B_TO_C:
      if (sensorManager.getLevelB() < 20) {
        systemState = AI_PREP_NEW_TEST;
        Serial.println("✅ B limpo → Prep novo");
      }
      break;

    case AI_PREP_NEW_TEST:
      if (sensorManager.getLevelA() < 10 && sensorManager.getLevelB() < 10) {
        systemState = IDLE;
        Serial.println("🎉 Pronto para novo teste!");
      }
      break;
  }

  // 🔥 6. DEBUG & HEALTH
  if (now - lastHealthSent >= HEALTH_INTERVAL_MS) {
    sendHealthToCloud();
    lastHealthSent = now;
  }


  static unsigned long lastDebug = 0;
  if (now - lastDebug > 6000) {
    lastDebug = now;
      Serial.printf("[DEBUG] PH=%.2f Temp=%.1f State=%d\n", 
              sensorManager.getPH(), sensorManager.getTemperature(),
              (int)systemState);
  }

  static unsigned long lastLevelDebug = 0;
  if (now - lastLevelDebug > 2000) {
    lastLevelDebug = now;
    Serial.printf("[LEVEL] A=%d B=%d C=%d\n",
                  sensorManager.getLevelA(), sensorManager.getLevelB(), 
                  sensorManager.getLevelC());
  }
}


// =================================================================================
// [RESET] Funções de Reset
// =================================================================================

/**
   [RESET] Reset de fábrica - Remove todos os dados
   - Histórico de medições
   - KH de referência
   - Configurações salvas
*/
void factoryReset() {
  Serial.println("\n[RESET] ===================================");
  Serial.println("[RESET] Iniciando RESET DE FÁBRICA");
  Serial.println("[RESET] ===================================\n");

  // Parar qualquer ciclo em andamento
  khAnalyzer.stopMeasurement();

  // Limpar histórico
  history.clearHistory();
  Serial.println("[RESET] Histórico de medições apagado");

  // Resetar KH referência
  khAnalyzer.resetReferenceKHOnly();
  Serial.println("[RESET] KH de referência apagado");

  // Limpar SPIFFS completamente (opcional)
  // SPIFFS.format();

  // Retornar ao estado inicial
  systemState = WAITING_CALIBRATION;

  Serial.println("\n[RESET] Reset de fábrica concluído");
  Serial.println("[RESET] Configure o KH de referência antes de usar");
  Serial.println("[RESET] ===================================\n");
}

void wifiFactoryReset() {
  Serial.println("\n[WiFiReset] ===================================");
  Serial.println("[WiFiReset] Reset de Wi‑Fi + Credenciais Cloud");
  Serial.println("[WiFiReset] ===================================\n");

  // 1) Limpa NVS 'wifi' (já existe na task)
  nvs_handle_t nvs;
  if (nvs_open("wifi", NVS_READWRITE, &nvs) == ESP_OK) {
    nvs_erase_all(nvs);
    nvs_commit(nvs);
    nvs_close(nvs);
    Serial.println("[WiFiReset] NVS 'wifi' apagado.");
  } else {
    Serial.println("[WiFiReset] Falha ao abrir NVS 'wifi'.");
  }

  // 2) Limpa arquivo de WiFi (wifi_config.json)
  if (!SPIFFS.begin(true)) {
    Serial.println("[WiFiReset] ERRO: não conseguiu inicializar SPIFFS");
  } else {
    const char* wifiConfigPath = "/spiffs/wifi_config.json";
    if (SPIFFS.exists(wifiConfigPath)) {
      if (SPIFFS.remove(wifiConfigPath)) {
        Serial.println("[WiFiReset] wifi_config.json removido com sucesso.");
      } else {
        Serial.println("[WiFiReset] ERRO ao remover wifi_config.json.");
      }
    } else {
      Serial.println("[WiFiReset] wifi_config.json não existe.");
    }
  }

  Serial.println("[WiFiReset] Reiniciando para voltar ao modo AP...");
  delay(1000);
  esp_restart();
}

/**
   [RESET] Reset apenas de KH referência
   - Remove KH de referência salvo
   - Mantém histórico de medições
   - Requer nova calibração antes de medir
*/
void resetKHReference() {
  Serial.println("\n[RESET] ===================================");
  Serial.println("[RESET] Resetando KH de Referência");
  Serial.println("[RESET] ===================================\n");

  // Parar qualquer ciclo em andamento
  khAnalyzer.stopMeasurement();

  // Resetar apenas KH
  if (khAnalyzer.resetReferenceKHOnly()) {
    Serial.println("[RESET] KH de referência resetado com sucesso");
    systemState = WAITING_CALIBRATION;
  } else {
    Serial.println("[RESET] ERRO ao resetar KH de referência");
  }

  Serial.println("[RESET] Configure novo KH de referência");
  Serial.println("[RESET] ===================================\n");

  
}

// =================================================================================
// [RESET] Verificar Botão Físico
// =================================================================================

/**
   [RESET] Detectar pressão do botão de reset
   - Pressão curta (< 3s): Reset de KH
   - Pressão longa (> 5s): Reset de fábrica
*/
void checkResetButton() {
  bool buttonState = digitalRead(RESET_BUTTON_PIN);

  if (buttonState == LOW && !resetButtonPressed) {
    // Botão pressionado
    resetButtonPressed = true;
    lastResetButtonCheck = millis();
    Serial.println("[RESET] Botão pressionado...");
  }

  if (buttonState == HIGH && resetButtonPressed) {
    // Botão liberado
    unsigned long pressDuration = millis() - lastResetButtonCheck;

    if (pressDuration > 5000) {
      // Pressão longa - Reset de fábrica
      Serial.println("[RESET] Pressão longa detectada - RESET DE FÁBRICA");
      factoryReset();
    } else if (pressDuration > 1000) {
      // Pressão média - Reset de KH
      Serial.println("[RESET] Pressão média detectada - RESET DE KH");
      resetKHReference();
    }

    resetButtonPressed = false;
  }
}

// =================================================================================
// [RESET] Configurar Servidor Web
// =================================================================================

void setupWebServer() {
  // [RESET] Endpoint para reset de fábrica
  webServer.on("/factory_reset", HTTP_POST, []() {
    Serial.println("[WEB] Requisição: /factory_reset");
    factoryReset();
    webServer.send(200, "application/json", "{\"status\":\"factory_reset_initiated\"}");
  });

  // [RESET] Endpoint para reset de KH
  webServer.on("/reset_kh", HTTP_POST, []() {
    Serial.println("[WEB] Requisição: /reset_kh");
    resetKHReference();
    webServer.send(200, "application/json", "{\"status\":\"kh_reset_initiated\"}");
  });

  // [BOOT] Endpoint para configurar KH referência
  webServer.on("/set_kh", HTTP_POST, []() {
    Serial.println("[WEB] Requisição: /set_kh");
    if (webServer.hasArg("value")) {
      float kh = webServer.arg("value").toFloat();
      khAnalyzer.setReferenceKH(kh);
      webServer.send(200, "application/json", "{\"status\":\"kh_configured\",\"value\":" + String(kh, 2) + "}");
    } else {
      webServer.send(400, "application/json", "{\"error\":\"missing_value_parameter\"}");
    }
  });
  
  webServer.on("/test_mode", HTTP_POST, []() {
    if (!webServer.hasArg("enabled")) {
      webServer.send(400, "application/json", "{\"error\":\"missing_enabled_param\"}");
      return;
    }
    String v = webServer.arg("enabled");
    testModeEnabled = (v == "1" || v == "true");
    webServer.send(200, "application/json",
                  String("{\"success\":true,\"testModeEnabled\":") +
                  (testModeEnabled ? "true" : "false") + "}");
  });

  webServer.on("/test_now", HTTP_POST, []() {
    if (!testModeEnabled) {
      webServer.send(400, "application/json", "{\"error\":\"test_mode_disabled\"}");
      return;
    }
    forceImmediateMeasurement = true;
    webServer.send(200, "application/json", "{\"success\":true}");
  });

  // Endpoint para status
  webServer.on("/status", HTTP_GET, []() {
    String json = "{";
    json += "\"state\":\"" + String(systemState) + "\",";
    json += "\"kh_configured\":" + String(khAnalyzer.isReferenceKHConfigured() ? "true" : "false") + ",";
    json += "\"kh_reference\":" + String(khAnalyzer.getReferenceKH(), 2) + ",";
    json += "\"measurements\":" + String(history.getCount());
    json += "}";
    webServer.send(200, "application/json", json);
  });

  // Endpoint para status resumido para LCD
  webServer.on("/lcd_state", HTTP_GET, []() {
    String json = "{";
    json += "\"device_id\":\"" + String(deviceId) + "\",";          // se já tiver
    json += "\"state\":\"" + String(systemState) + "\",";
    json += "\"kh_configured\":" + String(khAnalyzer.isReferenceKHConfigured() ? "true" : "false") + ",";
    json += "\"kh_reference\":" + String(khAnalyzer.getReferenceKH(), 2) + ",";

   // última medição, se existir
    MeasurementHistory::Measurement m = history.getLastMeasurement();
    if (m.is_valid) {
      json += "\"kh\":" + String(m.kh, 2) + ",";
      json += "\"ph_ref\":" + String(m.ph_ref, 2) + ",";
      json += "\"ph_sample\":" + String(m.ph_sample, 2) + ",";
      json += "\"temperature\":" + String(m.temperature, 1) + ",";
      json += "\"timestamp\":" + String(m.timestamp) + ",";
      json += "\"valid\":true";
    } else {
      json += "\"kh\":0.0,\"ph_ref\":0.0,\"ph_sample\":0.0,\"temperature\":0.0,\"timestamp\":0,\"valid\":false";
    }
  
    json += "}";
    webServer.send(200, "application/json", json);
  }); 

  Serial.println("[WEB] Registrando endpoint /set_kh");
  webServer.begin();
  Serial.println("[WEB] Servidor web iniciado na porta 80");
}


// =================================================================================
// Funções Auxiliares
// =================================================================================



// Usa CloudAuth::sendHealthMetrics
void sendHealthToCloud() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Health] WiFi não conectado, pulando envio.");
    return;
  }
  if (deviceToken.length() == 0) {
    Serial.println("[Health] Sem deviceToken, pulando envio.");
    return;
  }

  float heapPercent = getHeapUsagePercent();
  float spiffsPercent = getSpiffsUsagePercent();
  int rssi = WiFi.RSSI();
  int wifiPercent = rssiToPercent(rssi); 
  unsigned long uptime = millis() / 1000;

  Serial.printf("[Health] Métricas coletadas: CPU=0.0%% MEM=%.2f%% SPIFFS=%.2f%% WiFi=%d%% RSSI=%d dBm UPTIME=%lu s\n",
                heapPercent, spiffsPercent, wifiPercent, rssi, uptime);

  SystemHealth h;
  h.cpu_usage            = 0.0f;
  h.memory_usage         = heapPercent;
  h.spiffs_usage         = spiffsPercent;
  h.wifi_signal_strength = wifiPercent;  // ← agora é % em vez de dBm
  h.uptime               = uptime;

  if (!cloudAuth.sendHealthMetrics(h)) {
    Serial.println("[Health] Falha ao enviar métricas via CloudAuth.");
  } else {
    Serial.println("[Health] Métricas enviadas com sucesso.");
  }
}

// =================================================================================
// Logs para o backend
// =================================================================================
void sendLogsToCloud(const String &message, const char *level = "INFO") {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Logs] WiFi não conectado, pulando envio.");
    return;
  }
  if (deviceToken.length() == 0) {
    Serial.println("[Logs] Sem deviceToken, pulando envio.");
    return;
  }

  unsigned long long ts = getCurrentEpochMs();
  if (ts == 0) {
    ts = millis();  // ainda assim garante ordenação
  }

  // aqui só usa
  String url = String(CLOUD_BASE_URL) + "/device/logs";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);

  StaticJsonDocument<256> doc;
  JsonArray arr = doc.createNestedArray("lines");
  JsonObject line = arr.createNestedObject();
  line["ts"]      = ts;
  line["level"]   = level;
  line["message"] = message;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  String resp = http.getString();
  http.end();

  Serial.printf("[Logs] POST /device/logs code=%d\n", code);
  if (code < 200 || code >= 300) {
    Serial.println("[Logs] Falha ao enviar log para nuvem: " + resp);
  }
}

void performPrediction() {
  Serial.println("[Main] Realizando predição de KH...");
  
  // Obter última medição adicionada ao histórico
  MeasurementHistory::Measurement lastMeas = history.getLastMeasurement();
  
  if (lastMeas.is_valid) {
    // ✅ USAR O TIMESTAMP EPOCH CORRETO, NÃO MILLIS()
    Serial.printf("[Main] Adicionando ao preditor: KH=%.2f, Timestamp=%llu (epoch)\n",
                  lastMeas.kh, lastMeas.timestamp);
    
    // ✅ USAR getPredictor() GETTER (não acesso direto a _predictor)
    khAnalyzer.getPredictor()->addMeasurement(
        lastMeas.kh,
        lastMeas.timestamp,           // ← EPOCH EM MS (correto!)
        lastMeas.temperature
    );
    
    Serial.println("[Main] Medição adicionada ao preditor com sucesso");
  } else {
    Serial.println("[Main] Última medição inválida, pulando predição");
  }
}

void processCloudCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (deviceToken.length() == 0) return;

  Command cmd;
  // nada aqui ainda, só pra garantir
  if (!cloudAuth.pullCommandFromServer(cmd)) {
    return; // sem comando ou erro
  }

  // DEBUG extra
  Serial.printf("[CMD] action='%s'\n", cmd.action.c_str());
  if (!cmd.params.isNull()) {
    Serial.print("[CMD] params=");
    serializeJson(cmd.params, Serial);
    Serial.println();
  } else {
    Serial.println("[CMD] params is NULL/empty");
  }

  Serial.printf("[CMD] Recebido comando %s (id=%s)\n",
                cmd.action.c_str(), cmd.command_id.c_str());

  bool ok = true;
  String errorMsg = "";

  if (cmd.action == "restart") {
    ESP.restart();

  } else if (cmd.action == "factoryreset") {
    factoryReset();

  } else if (cmd.action == "resetkh") {
    resetKHReference();

  } else if (cmd.action == "testnow") {
    Serial.println("🤖 WEB 'Calibrar KH' → FORÇANDO KH CYCLE + IA!");
    systemState = AI_KH_CALIBRATE_PH;      // ← FORCE KH CYCLE!
    forceImmediateMeasurement = true;      // ← MANTÉM
    ok = true;                             // ← CONFIRMA
  }
     else if (cmd.action == "manualpump") {
    if (cmd.params.isNull()) {
      ok = false;
      errorMsg = "missing payload";
    } else {
      Serial.println("[CMD] manualpump - inicio");
      int pumpId = cmd.params["pumpId"] | 0;
      const char* dirStr = cmd.params["direction"] | "forward";
      int seconds = cmd.params["seconds"] | 0;
      Serial.printf("[CMD] manualpump params: pumpId=%d dir=%s sec=%d\n",
                    pumpId, dirStr, seconds);

      if (pumpId < 1 || pumpId > 3 || seconds <= 0) {
        ok = false;
        errorMsg = "invalid pumpId/seconds";
      } else {
        bool reverse = String(dirStr) == "reverse";
        Serial.printf("[CMD] manualpump executando: pump=%d reverse=%d sec=%d\n",
                      pumpId, reverse, seconds);

        // ligar bomba
        if (pumpId == 1) {
          if (!reverse) pumpControl.pumpA_fill();
          else          pumpControl.pumpA_discharge();
        } else if (pumpId == 2) {
          if (!reverse) pumpControl.pumpB_fill();
          else          pumpControl.pumpB_discharge();
        } else if (pumpId == 3) {
          if (!reverse) pumpControl.pumpC_fill();
          else          pumpControl.pumpC_discharge();
        }

        unsigned long endTime = millis() + (unsigned long)seconds * 1000UL;
        while (millis() < endTime) {
          delay(10);
        }

        // desligar bomba
        if (pumpId == 1)      pumpControl.pumpA_stop();
        else if (pumpId == 2) pumpControl.pumpB_stop();
        else if (pumpId == 3) pumpControl.pumpC_stop();
      }
    }                                    // <-- fecha o else de manualpump

  } else if (cmd.action == "pump4calibrate") {
    // Espera payload opcional: { "seconds": 60 }
    int seconds = 60;
    if (!cmd.params.isNull()) {
      seconds = cmd.params["seconds"] | 60;
    }

    if (seconds <= 0 || seconds > 300) {
      ok = false;
      errorMsg = "invalid seconds";
    } else {
      Serial.printf("[CMD] pump4calibrate: %d s\n", seconds);

      pump4AbortRequested = false;          // zera flag antes de iniciar
      pumpControl.pumpA_fill();
      unsigned long endTime = millis() + (unsigned long)seconds * 1000UL;

      while (millis() < endTime) {
        if (pump4AbortRequested) {          // checa abort
          Serial.println("[CMD] pump4calibrate: abort recebido, parando bomba 4");
          break;
        }
        delay(10);
      }
      pumpControl.pumpA_stop();
    }

  } else if (cmd.action == "pump4abort") {
    Serial.println("[CMD] pump4abort: flag de abort acionada");
    pump4AbortRequested = true;


  } else if (cmd.action == "setpump4mlpersec") {
    if (cmd.params.isNull()) {
      ok = false;
      errorMsg = "missing payload";
    } else {
      float v = cmd.params["ml_per_sec"] | 0.0f;
      if (v <= 0.0f || v > 10.0f) {
        ok = false;
        errorMsg = "invalid ml_per_sec";
      } else {
        pump4MlPerSec = v;
        Serial.printf("[CMD] setpump4mlpersec: %.4f mL/s\n", pump4MlPerSec);
        savePump4CalibrationToSPIFFS();
      }
    }

  } else if (cmd.action == "khcorrection") {
    if (cmd.params.isNull()) {
      ok = false;
      errorMsg = "missing payload";
    } else {
      float volume = cmd.params["volume"] | 0.0f;  // mL desejados
      if (volume <= 0) {
        ok = false;
        errorMsg = "invalid volume";
      } else {
        float secondsF = volume / pump4MlPerSec;
        int seconds = (int)roundf(secondsF);

        if (seconds <= 0) {
          ok = false;
          errorMsg = "volume too small";
        } else if (seconds > MAX_CORRECTION_SECONDS) {
          ok = false;
          errorMsg = "volume too large";
        } else {
          int pumpId = 1;
          bool reverse = false;
          Serial.printf("[CMD] khcorrection: volume=%.2f mL -> pump=%d, sec=%d\n",
                        volume, pumpId, seconds);

          pumpControl.pumpA_fill();
          unsigned long endTime = millis() + (unsigned long)seconds * 1000UL;
          while (millis() < endTime) {
            delay(10);
          }
          pumpControl.pumpA_stop();
        }
      }
    }
  } else if (cmd.action == "setkhreference") {
    if (cmd.params.isNull()) {
      ok = false;
      errorMsg = "missing payload";
    } else {
      float v = cmd.params["value"] | 0.0f;
      if (v <= 0.0f || v > 25.0f) {
        ok = false;
        errorMsg = "invalid value";
      } else {
        Serial.printf("[CMD] setkhreference: %.2f dKH\n", v);
        khAnalyzer.setReferenceKH(v);
        systemState = IDLE;
      }
    }

} else if (cmd.action == "setkhtarget") {
  if (cmd.params.isNull()) {
    ok = false;
    errorMsg = "missing payload";
  } else {
    float v = cmd.params["value"] | 0.0f;
    if (v <= 0.0f || v > 25.0f) {
      ok = false;
      errorMsg = "invalid value";
    } else {
      Serial.printf("[CMD] setkhtarget: %.2f dKH\n", v);
      khTarget = v;
      // se tiver criado funções de persistência:
      // saveKhTargetToSPIFFS();
    }
  }

  } else if (cmd.action == "setintervalminutes") {
    Serial.println("[CMD] setintervalminutes handler entrou");

    if (cmd.params.isNull()) {
      Serial.println("[CMD] setintervalminutes: params NULL");
      ok = false;
      errorMsg = "missing payload";
    } else {
      // debug bruto do JSON
      Serial.print("[CMD] raw params: ");
      serializeJson(cmd.params, Serial);
      Serial.println();

      if (!cmd.params.containsKey("minutes")) {
        Serial.println("[CMD] setintervalminutes: key 'minutes' ausente");
        ok = false;
        errorMsg = "missing minutes";
      } else {
        int minutes = cmd.params["minutes"] | 0;
        Serial.printf("[CMD] minutes lido=%d\n", minutes);

        if (minutes <= 0 || minutes > 24 * 60) {
          ok = false;
          errorMsg = "invalid minutes";
        } else {
          unsigned long ms = (unsigned long)minutes * 60UL * 1000UL;
          measurementInterval = ms;
          Serial.printf("[CMD] setintervalminutes: %d min (interval=%lu ms)\n", minutes, ms);
        }
      }
    }

  } else if (cmd.action == "fake_measurement") {
    float kh = 7.5f; // default
    if (!cmd.params.isNull()) {
      float v = cmd.params["kh"] | 0.0f;
      if (v > 0.0f && v < 25.0f) {
        kh = v;
      }
    }
    Serial.printf("[CMD] fake_measurement - KH=%.2f\n", kh);
    debugForceSyncWithKH(kh);


  } else if (cmd.action == "testmode") {
    if (cmd.params.isNull()) {
      ok = false;
      errorMsg = "missing payload";
    } else {
      bool enabled = cmd.params["enabled"] | false;
      testModeEnabled = enabled;
      Serial.printf("[CMD] testmode: %s\n", enabled ? "ON" : "OFF");
    }

  } else if (cmd.action == "abort") {
    // Para qualquer ciclo em andamento e volta para IDLE
    khAnalyzer.stopMeasurement();
    forceImmediateMeasurement = false;   // opcional, mas recomendado
    systemState = IDLE;
  }

  String statusStr = ok ? "done" : "error";
  cloudAuth.confirmCommandExecution(cmd.command_id, statusStr, errorMsg);
}

bool shouldMeasure() {
  return (millis() - lastMeasurementTime) >= measurementInterval;
}

void performMeasurement() {
  Serial.println("[Main] Iniciando ciclo de medição...");

  if (khAnalyzer.startMeasurementCycle()) {
    // Processar fases do ciclo
    while (khAnalyzer.processNextPhase()) {
      delay(100);
    }

    // Obter resultado
    KH_Analyzer::MeasurementResult result = khAnalyzer.getMeasurementResult();
    Serial.printf("[DEBUG] result.is_valid=%d kh=%.2f ph_ref=%.2f ph_sample=%.2f temp=%.1f\n",
                  result.is_valid, result.kh_value,
                  result.ph_reference, result.ph_sample, result.temperature);

    if (result.is_valid) {
      Serial.printf("[Main] Medição concluída: KH=%.2f dKH\n", result.kh_value);

    // 1) Medição para histórico
    MeasurementHistory::Measurement mh;
    mh.kh         = result.kh_value;
    mh.ph_ref     = result.ph_reference;
    mh.ph_sample  = result.ph_sample;
    mh.temperature= result.temperature;

    unsigned long long ts = getCurrentEpochMs();
    if (ts == 0) {
      Serial.println("[Main] NTP falhou, usando millis()");
      ts = millis() / 1000ULL; 
    }
    mh.timestamp = ts; 
    mh.is_valid   = true;
    history.addMeasurement(mh);

      // 2) Medição para CloudAuth (struct diferente)
      Measurement mc;
      mc.timestamp    = mh.timestamp;
      mc.kh           = mh.kh;
      mc.ph_reference = mh.ph_ref;
      mc.ph_sample    = mh.ph_sample;
      mc.temperature  = mh.temperature;
      mc.is_valid     = mh.is_valid;
      mc.confidence   = 0.9f;   // ou outro valor

      if (deviceToken.length() > 0) {
        cloudAuth.queueMeasurement(mc);
        cloudAuth.syncOfflineMeasurements();
        //sendHealthToCloud(); 
        sendLogsToCloud("log de teste do ESP", "INFO");
        
      }

    } else {
      Serial.println("[Main] ERRO: Medição inválida");

    }
  } else {
    Serial.println("[Main] ERRO: Falha ao iniciar ciclo de medição");
    if (khAnalyzer.hasError()) {
      Serial.println("[Main] " + khAnalyzer.getErrorMessage());
    }
  }
}

// =================================================================================
// Calibração da bomba 4 (correção de KH)
// =================================================================================

void savePump4CalibrationToSPIFFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println("[Pump4] Erro ao montar SPIFFS para salvar calibração");
    return;
  }

  File f = SPIFFS.open("/pump4_calib.json", FILE_WRITE);
  if (!f) {
    Serial.println("[Pump4] Erro ao abrir /pump4_calib.json para escrita");
    return;
  }

  StaticJsonDocument<128> doc;
  doc["ml_per_sec"] = pump4MlPerSec;

  if (serializeJson(doc, f) == 0) {
    Serial.println("[Pump4] Erro ao serializar JSON de calibração");
  } else {
    Serial.printf("[Pump4] Calibração salva: %.4f mL/s\n", pump4MlPerSec);
  }
  f.close();
}

void loadPump4CalibrationFromSPIFFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println("[Pump4] Erro ao montar SPIFFS para ler calibração");
    return;
  }

  if (!SPIFFS.exists("/pump4_calib.json")) {
    Serial.println("[Pump4] Sem calibração de bomba 4, usando default");
    return;
  }

  File f = SPIFFS.open("/pump4_calib.json", FILE_READ);
  if (!f) {
    Serial.println("[Pump4] Erro ao abrir /pump4_calib.json para leitura");
    return;
  }

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();

  if (err) {
    Serial.printf("[Pump4] Erro JSON calibração: %s\n", err.c_str());
    return;
  }

  float v = doc["ml_per_sec"] | 0.0f;
  if (v > 0.0f && v < 10.0f) {
    pump4MlPerSec = v;
    Serial.printf("[Pump4] Calibração carregada: %.4f mL/s\n", pump4MlPerSec);
  } else {
    Serial.println("[Pump4] Calibração inválida em arquivo, mantendo default");
  }
}

int rssiToPercent(int rssi) {
  if (rssi >= -50) return 100;
  if (rssi <= -100) return 0;
  return 2 * (rssi + 100);
}
