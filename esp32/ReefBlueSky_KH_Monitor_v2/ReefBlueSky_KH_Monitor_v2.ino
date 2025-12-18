// =================================================================================
// ReefBlueSky KH Monitor - Versão 2.0 com IA Preditiva e Reset
// Microcontrolador: ESP32 DevKit V1
// Framework: Arduino
// Versão: 2.0 (com IA preditiva, persistência e reset)
// =================================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
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
#include "KH_Analyzer.h"
#include "WiFi_MQTT.h"
#include "KH_Predictor.h"
#include "MeasurementHistory.h"
#include "MultiDeviceAuth.h"
#include "WiFiSetup.h"
#include "CloudAuth.h"



// teste forçando mediçao fake

extern CloudAuth cloudAuth;

void debugForceSync() {
  Measurement m;
  m.timestamp    = getCurrentEpochMs();
  m.kh           = 7.0;   // resultado da conta
  m.ph_reference = 8.2;   // puxar do sistema depois
  m.ph_sample    = 8.0;   // puxar da sonda de pH depois
  m.temperature  = 24.0;  // puxar do termômetro depois
  m.is_valid     = true;
  m.confidence   = 0.9;

  cloudAuth.queueMeasurement(m);
  Serial.printf("[DEBUG] Medição fake enfileirada. Fila: %d\n",
                cloudAuth.getQueueSize());

  // Forçar envio imediato para o backend
  cloudAuth.syncOfflineMeasurements();
  Serial.println("[DEBUG] Sync manual disparado.");
}

// fim do teste



// =================================================================================
// Definições de Hardware (Mapeamento de GPIO)
// =================================================================================

#define LEVEL_A_PIN 16
#define LEVEL_B_PIN 17
#define LEVEL_C_PIN 5
#define ONE_WIRE_BUS 4
#define PH_PIN 36
#define RESET_BUTTON_PIN 35  // [RESET] Botão físico para reset

// =================================================================================
// Configurações de Comunicação
// =================================================================================

const char* ssid = "CRB_Engenharia_2G";
const char* password = "crbengenharia2022";
const char* mqtt_server = "SEU_BROKER_MQTT_IP";

// Tópicos MQTT
const char* mqtt_topic_kh = "reefbluesky/kh_monitor/kh_value";
const char* mqtt_topic_ph = "reefbluesky/kh_monitor/ph_value";
const char* mqtt_topic_temp = "reefbluesky/kh_monitor/temperature";
const char* mqtt_topic_status = "reefbluesky/kh_monitor/status";
const char* mqtt_topic_prediction = "reefbluesky/kh_monitor/prediction";
const char* mqtt_topic_dosage = "reefbluesky/kh_monitor/dosage_adjustment";
const char* mqtt_topic_trend = "reefbluesky/kh_monitor/trend";

// [RESET] Tópicos MQTT para reset
const char* mqtt_topic_reset = "reefbluesky/kh_monitor/reset";
const char* mqtt_topic_reset_kh = "reefbluesky/kh_monitor/reset_kh";

// Vazão calibrada da bomba 1 (mL/s). Ajuste após teste real.
const float PUMP1MLPERSEC = 0.8f;
const int   MAX_CORRECTION_SECONDS = 120;  // safety
// Vazão da bomba 4 (correção de KH) em mL/s, calibrável
float pump4MlPerSec = 0.8f;   // valor default até calibrar

//NTP
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -3 * 3600;  // -03:00 Brasil (Brasília)
const int   daylightOffset_sec = 0;     // sem horário de verão

//

const unsigned long CMD_INTERVAL_MS  = 3000;   // 3 s
const unsigned long SYNC_INTERVAL_MS = 60000;  // 60 s

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


// =================================================================================
// Objetos Globais
// =================================================================================

PumpControl pumpControl;
SensorManager sensorManager(PH_PIN, ONE_WIRE_BUS);
KH_Analyzer khAnalyzer(&pumpControl, &sensorManager);
WiFi_MQTT wifiMqtt(ssid, password, mqtt_server, 1883);
MeasurementHistory history;
WebServer webServer(80); 


WiFiSetup wifiSetup;


// =================================================================================
// Estados e Variáveis Globais
// =================================================================================

enum SystemState {
  STARTUP,
  IDLE,
  MEASURING,
  PREDICTING,
  ERROR,
  WAITING_CALIBRATION  // [BOOT] Aguardando calibração inicial
};

SystemState systemState = STARTUP;
unsigned long lastMeasurementTime = 0;
unsigned long measurementInterval = 3600000;  // 1 hora em ms
unsigned long lastResetButtonCheck = 0;
const unsigned long HEALTH_INTERVAL_MS = 60UL * 1000UL; // 60 segundos
unsigned long lastHealthSent = 0;

bool resetButtonPressed = false;

bool testModeEnabled = true;        // ou false por padrão
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
}


// =================================================================================
// Setup
// =================================================================================

void setup() {
  // Inicializar Serial
  Serial.begin(115200);
  delay(1000);

  lastHealthSent = millis() - HEALTH_INTERVAL_MS;

  Serial.println("\n\n========================================");
  Serial.println("ReefBlueSky KH Monitor - Inicializando");
  Serial.println("Versão: 2.0 com IA Preditiva");
  Serial.println("========================================\n");

  // [RESET] Configurar botão de reset
  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  // Inicializar componentes
  pumpControl.begin();
  sensorManager.begin();
  khAnalyzer.begin();
  history.begin();

    // carregar calibração da bomba 4
  loadPump4CalibrationFromSPIFFS();


  // Iniciar sistema de configuração WiFi (STA ou AP)
  Serial.println("[Main] Iniciando WiFiSetup...");
  bool wifiOk = wifiSetup.begin();   // conecta com config salva ou cria AP

  if (wifiOk) {
    Serial.println("[Main] WiFi conectado..."); //iniciando MQTT...");
    //wifiMqtt.begin();

    // Inicializar autenticação multi-dispositivo (HTTP + NVS)
    initMultiDeviceAuth();
    cloudAuth.init();  
    Serial.print("[DEBUG] deviceToken tamanho = ");
    Serial.println(deviceToken.length());
    // configurar NTP DEPOIS que o Wi‑Fi estiver conectado
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  } else {
    Serial.println("[Main] WiFiSetup falhou. Rodando apenas em modo local/AP.");
  }

  // [BOOT] Verificar se KH referência foi configurado
//  if (!khAnalyzer.isReferenceKHConfigured()) {
//    Serial.println("\n[ATENÇÃO] ===================================");
//    Serial.println("[ATENÇÃO] Realizar calibração inicial do KH");
//    Serial.println("[ATENÇÃO] ===================================\n");
//    systemState = WAITING_CALIBRATION;
//  } else {
//    systemState = IDLE;
  

  khAnalyzer.begin();

  Serial.printf("[BOOT] kh_configured=%s, kh_reference=%.2f\n",
                khAnalyzer.isReferenceKHConfigured() ? "true" : "false",
                khAnalyzer.getReferenceKH());

  // Se vier false mas o valor for > 0, assume que está configurado
  if (!khAnalyzer.isReferenceKHConfigured() && khAnalyzer.getReferenceKH() > 0.0f) {
    Serial.println("[BOOT] Ajustando flag de KH configurado (valor > 0 detectado).");
    khAnalyzer.setReferenceKH(khAnalyzer.getReferenceKH());
  }


    // Permitir iniciar mesmo sem KH, só logando
  if (!khAnalyzer.isReferenceKHConfigured()) {
    Serial.println("[BOOT] KH ref não encontrado em SPIFFS. Tentando buscar do servidor...");

    float serverKh = 0.0f;
    if (cloudAuth.fetchReferenceKH(serverKh)) {
      Serial.printf("[BOOT] KH referência obtido da nuvem: %.2f dKH\n", serverKh);
      khAnalyzer.setReferenceKH(serverKh);
      systemState = IDLE;
    } else {
      Serial.println("[BOOT] KH referência indisponível. Aguardando configuração inicial.");
      systemState = WAITING_CALIBRATION;
    }
  } else {
    Serial.println("[BOOT] KH referência já configurado em SPIFFS.");
    systemState = IDLE;
  }

  // [RESET] Configurar endpoints web
  setupWebServer();

  // [RESET] Configurar callbacks MQTT para reset
  //setupMQTTCallbacks();
  Serial.printf("[BOOT] kh_configured=%s, kh_reference=%.2f\n",
              khAnalyzer.isReferenceKHConfigured() ? "true" : "false",
              khAnalyzer.getReferenceKH());

    // por enquanto, simular pH
    sensorManager.setSimulatePH(true, 8.2f, 8.0f);


}

// =================================================================================
// Loop Principal
// =================================================================================

void loop() {
  unsigned long now = millis();

if (Serial.available()) {
    char c = Serial.read();
    if (c == 's') {          // digitar s + Enter
      Serial.println("[DEBUG] Forçando sync manual...");
      debugForceSync();
    }
    if (c == 't') {          // digitar t + Enter para testar horário
      Serial.println("[DEBUG] Testando sincronização de horário...");
    debugForceSync();
    }

    // Toggle sensores de nível
    else if (c == 'a') {
      sensorManager.setLevelAEnabled(true);
      Serial.println("[DEBUG] Sensor de nível A ATIVADO");
    } else if (c == 'A') {
      sensorManager.setLevelAEnabled(false);
      Serial.println("[DEBUG] Sensor de nível A DESATIVADO");
    } else if (c == 'b') {
      sensorManager.setLevelBEnabled(true);
      Serial.println("[DEBUG] Sensor de nível B ATIVADO");
    } else if (c == 'B') {
      sensorManager.setLevelBEnabled(false);
      Serial.println("[DEBUG] Sensor de nível B DESATIVADO");
    } else if (c == 'c') {
      sensorManager.setLevelCEnabled(true);
      Serial.println("[DEBUG] Sensor de nível C ATIVADO");
    } else if (c == 'C') {
      sensorManager.setLevelCEnabled(false);
      Serial.println("[DEBUG] Sensor de nível C DESATIVADO");
    }

}


  handleCloudReconnect(now);

  // polling de comandos
  if (now - lastCmdPoll >= CMD_INTERVAL_MS) {

    lastCmdPoll = now;
    processCloudCommand();   // deixa essa função decidir se há comando
  }


  // sync de medições (só se tiver fila)
  if (now - lastSyncTry >= SYNC_INTERVAL_MS) {
    lastSyncTry = now;
    cloudAuth.syncOfflineMeasurements();
  }

  if (Serial.available()) {
      char c = Serial.read();
      if (c == 's') {          // digitar s + Enter no Serial Monitor
        Serial.println("[DEBUG] Forçando sync manual...");
        debugForceSync();
      }
    }
  
  // [RESET] Verificar botão físico de reset
 // checkResetButton();

  // Processar servidor web
  webServer.handleClient();
  
  // Processar portal de configuração WiFi (se AP ativo)
  wifiSetup.handleClient();


  // Processar MQTT
  //wifiMqtt.loop();

  // Menu/configuração de autenticação via Serial
  //handleSerialInput();


  // Máquina de estados
  switch (systemState) {
    case STARTUP:
      systemState = IDLE;
      break;

      case WAITING_CALIBRATION:
        // Se durante o runtime o KH passar a estar configurado, sai desse estado
        if (khAnalyzer.isReferenceKHConfigured()) {
          Serial.println("[Main] KH configurado durante o runtime. Indo para IDLE.");
          systemState = IDLE;
        } else {
          delay(1000);
          Serial.println("[Main] Aguardando calibração... Configure KH via web");
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
      lastMeasurementTime = millis();
      break;

    case ERROR:
      Serial.println("[Main] Sistema em estado de erro");
      delay(5000);
      break;
  }

// sensor PH FAKE
  static unsigned long lastDebug = 0;
  if (now - lastDebug > 2000) {
    lastDebug = now;
    float ph   = sensorManager.getPH();
    float temp = sensorManager.getTemperature();
    Serial.printf("[DEBUG] Idle PH=%.2f Temp=%.2f\n", ph, temp);
  }
// sensor PH FAKE

  if (now - lastHealthSent >= HEALTH_INTERVAL_MS) {
    sendHealthToCloud();
    lastHealthSent = now;
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

  // Publicar no MQTT
  //wifiMqtt.publish(mqtt_topic_status, "FACTORY_RESET_COMPLETE");
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

  // Publicar no MQTT
  //wifiMqtt.publish(mqtt_topic_status, "KH_RESET_COMPLETE");
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
// [RESET] Configurar Callbacks MQTT
// =================================================================================

void setupMQTTCallbacks() {
  // [RESET] Callback para reset de fábrica via MQTT
  // Publicar em: reefbluesky/kh_monitor/reset com payload "factory"

  // [RESET] Callback para reset de KH via MQTT
  // Publicar em: reefbluesky/kh_monitor/reset_kh com qualquer payload
}

// =================================================================================
// Funções Auxiliares
// =================================================================================

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
    Serial.printf("[DEBUG] result.is_valid=%d kh=%.2f ph_ref=%.2f ph_sample=%.2f temp=%.2f\n",
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

    // pega o timestamp “seguro”
    unsigned long long ts = getCurrentEpochMs();
    if (ts == 0) {
      Serial.println("[Main] Timestamp inválido (NTP não sincronizado), não vou salvar/enfileirar");
      return;  // sai da função sem salvar / enviar para a nuvem
    }
    mh.timestamp = ts;

    mh.is_valid   = true;
    history.addMeasurement(mh);


      // Publicar no MQTT
      //wifiMqtt.publish(mqtt_topic_kh, String(result.kh_value, 2).c_str());
      //wifiMqtt.publish(mqtt_topic_ph, String(result.ph_reference, 2).c_str());
      //wifiMqtt.publish(mqtt_topic_temp, String(result.temperature, 1).c_str());
   
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
        //cloudAuth.syncOfflineMeasurements();
        sendHealthToCloud(); 
      }

    } else {
      Serial.println("[Main] ERRO: Medição inválida");
      //wifiMqtt.publish(mqtt_topic_status, "MEASUREMENT_FAILED");
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
    forceImmediateMeasurement = true;

  } else if (cmd.action == "manualpump") {
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
    }
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

      // aqui assume que bomba 4 == pump A; se for outra, ajuste
      pumpControl.pumpA_fill();
      unsigned long endTime = millis() + (unsigned long)seconds * 1000UL;
      while (millis() < endTime) {
        delay(10);
      }
      pumpControl.pumpA_stop();
    }

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
