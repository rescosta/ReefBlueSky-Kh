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
  m.timestamp   = getCurrentEpochMs(); 
  m.kh          = 7.0; // resultado da conta
  m.ph_reference= 8.2; //puxar do sistema
  m.ph_sample   = 8.0; // puxar da sonda de ph
  m.temperature = 24.0; // puxar do termometro
  m.is_valid    = true; // criar validação
  m.confidence  = 0.9; // criar desvio esperado

  cloudAuth.queueMeasurement(m);
  cloudAuth.syncOfflineMeasurements();
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
const unsigned long SYNC_INTERVAL_MS = 60UL * 1000UL; // 1 minuto
unsigned long lastSyncAttempt = 0;                    // global

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

//NTP

const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -3 * 3600;  // fuso -03
const int   daylightOffset_sec = 0;


// =================================================================================
// Objetos Globais
// =================================================================================

PumpControl pumpControl;
SensorManager sensorManager(PH_PIN, ONE_WIRE_BUS);
KH_Analyzer khAnalyzer(&pumpControl, &sensorManager);
WiFi_MQTT wifiMqtt(ssid, password, mqtt_server, 1883);
MeasurementHistory history;
WebServer webServer(80);  // [RESET] Servidor web na porta 80
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
const unsigned long HEALTH_INTERVAL_MS = 5UL * 60UL * 1000UL; // 5 minutos
unsigned long lastHealthSent = 0;

bool resetButtonPressed = false;

bool testModeEnabled = true;        // ou false por padrão
bool forceImmediateMeasurement = false;


// =================================================================================
// Setup
// =================================================================================

void setup() {
  // Inicializar Serial
  Serial.begin(115200);
  delay(1000);

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
  
    // Permitir iniciar mesmo sem KH, só logando
    if (!khAnalyzer.isReferenceKHConfigured()) {
      Serial.println("[BOOT] KH de referência ainda não configurado (servidor vai enviar depois).");
    }
    systemState = IDLE;

  // [RESET] Configurar endpoints web
  setupWebServer();

  // [RESET] Configurar callbacks MQTT para reset
  //setupMQTTCallbacks();

}

// =================================================================================
// Loop Principal
// =================================================================================

void loop() {

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
      //if (khAnalyzer.isReferenceKHConfigured()) {
      //  Serial.println("[Main] KH configurado durante o runtime. Indo para IDLE.");
        systemState = IDLE;
        break;

      // [BOOT] Aguardar configuração de KH
      delay(1000);
      Serial.println("[Main] Aguardando calibração... Configure KH via web");
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

  unsigned long now = millis();
  if (now - lastHealthSent >= HEALTH_INTERVAL_MS) {
    sendHealthToCloud();
    lastHealthSent = now;
  }

  // processar comandos da nuvem
  processCloudCommand();
  if (now - lastSyncAttempt >= SYNC_INTERVAL_MS) {
    lastSyncAttempt = now;
    if (cloudAuth.getQueueSize() > 0) {
      cloudAuth.syncOfflineMeasurements();
    }
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
  wifiMqtt.publish(mqtt_topic_status, "FACTORY_RESET_COMPLETE");
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
  wifiMqtt.publish(mqtt_topic_status, "KH_RESET_COMPLETE");
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

    if (result.is_valid) {
      Serial.printf("[Main] Medição concluída: KH=%.2f dKH\n", result.kh_value);

      // 1) Medição para histórico
      MeasurementHistory::Measurement mh;
      mh.kh         = result.kh_value;
      mh.ph_ref     = result.ph_reference;
      mh.ph_sample  = result.ph_sample;
      mh.temperature= result.temperature;
      mh.timestamp = getCurrentEpochMs();
      mh.is_valid   = true;
      history.addMeasurement(mh);

      // Publicar no MQTT
      wifiMqtt.publish(mqtt_topic_kh, String(result.kh_value, 2).c_str());
      wifiMqtt.publish(mqtt_topic_ph, String(result.ph_reference, 2).c_str());
      wifiMqtt.publish(mqtt_topic_temp, String(result.temperature, 1).c_str());
   
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
        sendHealthToCloud(); 
      }

    } else {
      Serial.println("[Main] ERRO: Medição inválida");
      wifiMqtt.publish(mqtt_topic_status, "MEASUREMENT_FAILED");
    }
  } else {
    Serial.println("[Main] ERRO: Falha ao iniciar ciclo de medição");
    if (khAnalyzer.hasError()) {
      Serial.println("[Main] " + khAnalyzer.getErrorMessage());
    }
  }
}

void sendHealthToCloud() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Health] WiFi não conectado, pulando envio.");
    return;
  }
  if (deviceToken.length() == 0) {
    Serial.println("[Health] Sem deviceToken, pulando envio.");
    return;
  }

  // Coleta de métricas
  float cpuUsage     = 0.0f;                 // placeholder, se tiver cálculo de CPU coloca aqui
  float memUsage     = 0.0f;                 // idem
  float storageUsage = 0.0f;                 // idem
  int   wifiRssi     = WiFi.RSSI();
  unsigned long uptime = millis() / 1000;    // segundos

  StaticJsonDocument<256> doc;
  doc["cpu_usage"]     = cpuUsage;
  doc["memory_usage"]  = memUsage;
  doc["storage_usage"] = storageUsage;
  doc["wifi_rssi"]     = wifiRssi;
  doc["uptime"]        = uptime;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  String url = String(CLOUD_BASE_URL) + "/device/health";  // já inclui /api/v1
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  int code = http.POST(body);
  Serial.printf("[Health] POST %s -> %d\n", url.c_str(), code);
  if (code != 200) {
    String resp = http.getString();
    Serial.printf("[Health] Resposta: %s\n", resp.c_str());
  }
  http.end();
}

void performPrediction() {
  Serial.println("[Main] Realizando predição de KH...");
  // Implementar predição usando KH_Predictor
}

void processCloudCommand() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (deviceToken.length() == 0) return;

  Command cmd;
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
        float secondsF = volume / PUMP1MLPERSEC;
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
  } else if (cmd.action == "setintervalminutes") {      // <<< AQUI
    if (cmd.params.isNull()) {
      ok = false;
      errorMsg = "missing payload";
    } else {
      int minutes = cmd.params["minutes"] | 0;
      if (minutes <= 0 || minutes > 24 * 60) {
        ok = false;
        errorMsg = "invalid minutes";
      } else {
        unsigned long ms = (unsigned long)minutes * 60UL * 1000UL;
        measurementInterval = ms;
        Serial.printf("[CMD] setintervalminutes: %d min (interval=%lu ms)\n", minutes, ms);
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


