// =================================================================================
// ReefBlueSky KH Monitor - Versão 3.0 com IA Preditiva e Reset
// Microcontrolador: ESP32 DevKit V1
// Framework: Arduino
// Versão: 3.0 (com IA preditiva, persistência e reset)
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
#include "NTP_DEBUG_HELPERS.h" 
#include <Preferences.h>


#include "PumpControl.h"
#include "SensorManager.h"
#include "Safety.h" 
#include "KH_Analyzer.h"
#include "KH_Predictor.h"
#include "MeasurementHistory.h"
#include "KH_Calibrator.h"

void wifiFactoryReset(); 
#include "MultiDeviceAuth.h"
#include "WiFiSetup.h"
#include "CloudAuth.h"
#include "HardwarePins.h"
#include "AiPumpControl.h"  
#include "OtaUpdate.h"


#include "FwVersion.h"



const char* FW_DEVICE_TYPE = "KH";
const char* FW_VERSION     = "RBS_KH_260201.bin";

extern CloudAuth cloudAuth;

extern const char* CLOUD_BASE_URL;

void reportFirmwareVersion(const String& baseUrl, const String& jwt);

extern String deviceToken;   // já usado em sendHealthToCloud()

PumpControl    pumpControl;
SensorManager  sensorManager(PH_PIN, ONE_WIRE_BUS);
KH_Analyzer    khAnalyzer(&pumpControl, &sensorManager);
KH_Calibrator  khCalibrator(&pumpControl, &sensorManager);

MeasurementHistory history;
WebServer webServer(80);

bool khCalibRunning = false;
unsigned long khCalibLastStepMs = 0;
const unsigned long KH_CALIB_STEP_INTERVAL_MS = 100; // quanto menor, mais "tempo real"

bool khAnalyzerRunning = false;
unsigned long khAnalyzerLastStepMs = 0;
const unsigned long KH_ANALYZER_STEP_INTERVAL_MS = 100;

// Intervalo de envio de progresso KH para o backend (a cada 1 s durante ciclo ativo)
static unsigned long khProgressLastSentMs = 0;
const unsigned long KH_PROGRESS_SEND_INTERVAL_MS = 1000;

// Dreno de câmaras (kh_drain): descarrega A+B+C de volta ao aquário
bool khDrainRunning = false;
unsigned long khDrainStartMs = 0;
const unsigned long KH_DRAIN_DURATION_MS = 30000UL; // 30 s de descarga simultânea

// System flush: limpeza inteligente com proteções de sensor
bool systemFlushRunning = false;
unsigned long systemFlushStartMs = 0;
unsigned long systemFlushDurationMs = 300000UL; // 5 min padrão (atualizado se calibrado)

// [NOVO] Teste de enchimento individual de câmaras
bool fillTestRunning = false;
unsigned long fillTestStartMs = 0;
unsigned long fillTestDurationMs = 10000UL;  // 10s padrão
char fillTestChamber = 'X';  // 'A', 'B' ou 'C'


void debugTestStatus() {
  WiFiClient client;
  HTTPClient http;
  String url = "http://iot.reefbluesky.com.br/api/v1/status";

  Serial.printf("[DEBUG] Testando URL status: %s\n", url.c_str());
  if (!http.begin(client, url)) {
    Serial.println("[DEBUG] http.begin falhou");
    return;
  }

  int code = http.GET();
  Serial.printf("[DEBUG] /status HTTP code = %d\n", code);
  if (code > 0) {
    String body = http.getString();
    Serial.println("[DEBUG] /status resp:");
    Serial.println(body);
  }
  http.end();
}

void sendOtaLogSuccess() {
  Serial.println("[DBG] sendOtaLogSuccess() ENTER");
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OTA-LOG] WiFi não conectado, abortando log OTA.");
    return;
  }
  if (deviceToken.length() == 0) {
    Serial.println("[OTA-LOG] Sem deviceToken, abortando log OTA.");
    return;
  }

  Serial.printf("[DBG] deviceToken len=%d\n", deviceToken.length());

  WiFiClient client;
  HTTPClient http;

  String url = String(CLOUD_BASE_URL) + "/device/ota-log";  // [FIX] URL correta

  String body = "{";
  body += "\"device_type\":\"" + String(FW_DEVICE_TYPE) + "\",";
  body += "\"event\":\"success\",";
  body += "\"firmware_version\":\"" + String(FW_VERSION) + "\",";
  body += "\"error\":null";
  body += "}";

  Serial.printf("[OTA-LOG] POST %s\n", url.c_str());
  Serial.println("[OTA-LOG] Body: " + body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  int code = http.POST(body);
  Serial.printf("[OTA-LOG] code=%d\n", code);
  if (code > 0) {
    String resp = http.getString();
    Serial.println("[OTA-LOG] resp=" + resp);
  }
  http.end();
}

Preferences fwPrefs;

void initFirmwarePrefs() {
  fwPrefs.begin("fw-info", false); // namespace "fw-info", RW
}

bool shouldReportOta() {
  String last = fwPrefs.getString("last_fw", "");
  Serial.printf("[OTA-LOG] last_fw='%s', current='%s'\n",
                last.c_str(), FW_VERSION);
  return last != String(FW_VERSION);
}

void markOtaReported() {
  fwPrefs.putString("last_fw", FW_VERSION);
}

void onCloudAuthOk() {
  Serial.println("[DBG] onCloudAuthOk() ENTER");
  Serial.println("[CLOUD] Auth OK, JWT valido.");

  // Aguardar deviceToken ser preenchido
  if (deviceToken.length() == 0) {
    Serial.println("[CLOUD] Aguardando deviceToken ser preenchido...");
    delay(500);
  }

  // loga FW que será enviado
  Serial.printf("[FW] onCloudAuthOk -> FWVERSION=%s, tokenLen=%d\n", FW_VERSION, deviceToken.length());

  // [FIX] Usar deviceToken global em vez de cloudAuth.getDeviceJwt()
  if (deviceToken.length() > 0) {
    reportFirmwareVersion(String(CLOUD_BASE_URL), deviceToken);
  } else {
    Serial.println("[FW] ERRO: deviceToken vazio, não reportando firmware");
  }

  if (shouldReportOta()) {
    Serial.println("[DBG] shouldReportOta() == true, chamando sendOtaLogSuccess");
    sendOtaLogSuccess();
    markOtaReported();
  } else {
    Serial.println("[OTA-LOG] Versão já reportada, não enviando novamente.");
  }
  Serial.println("[DBG] onCloudAuthOk() EXIT");
  debugTestStatus(); 
}

// =================================================================================
// Configurações de Comunicação
// =================================================================================

// Vazão calibrada da bomba 1 (mL/s). Ajuste após teste real.
const float PUMP1MLPERSEC = 0.8f;
const int   MAX_CORRECTION_SECONDS = 120;  // safety
// Vazão da bomba 4 (correção de KH) em mL/s, calibrável
float pump4MlPerSec = 0.8f;   // valor default até calibrar
bool pump4AbortRequested = false; 

//NTP
const char* ntpServer = "time.google.com";
const long  gmtOffset_sec = 0;          // UTC
const int   daylightOffset_sec = 0;     // sem horário de verão

//

// [FIX] Intervalos ajustados para reduzir requisições
const unsigned long CMD_INTERVAL_MS  = 5000;   // 5 s (era 1s - muito frequente)
const unsigned long SYNC_INTERVAL_MS = 30000;  // 30 s (era 10s)
const unsigned long TEST_SCHEDULE_CHECK_MS = 30000; // 30 s - polling de teste agendado
const unsigned long DEVICE_CONFIG_CHECK_MS = 30000; // 30 s - polling de configurações (testMode)

static unsigned long lastCmdPoll  = 0;
static unsigned long lastSyncTry  = 0;
static unsigned long lastTestScheduleCheck = 0;
static unsigned long lastDeviceConfigCheck = 0;

// [TEST SCHEDULE] Flag para indicar teste agendado em andamento
static bool isScheduledTestRunning = false;
static Measurement lastScheduledTestResult;

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

unsigned long long currentCycleStartMs = 0;  // novo: início do ciclo KH

WiFiSetup wifiSetup;

// teste forçando mediçao fake

void debugForceSync() {
  Measurement m;

  unsigned long long ts = getCurrentEpochMs();
  if (ts == 0) {
    Serial.println("[DEBUG] NTP ainda não ok, usando millis() para timestamp");
    ts = millis();
  }
  m.timestamp    = ts; 
  m.startedAt    = ts;          // só pra não ficar zero          
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
  m.startedAt    = ts;          // só pra não ficar zero          
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

// =================================================================================
// Sistema de Logging para Debug de Offline
// =================================================================================

#define LOG_BUFFER_SIZE 50        // Máximo de logs na RAM
#define LOG_FILE_PATH "/debug_log.txt"
#define LOG_MAX_FILE_SIZE 10240   // 10KB máximo no SPIFFS

struct LogEntry {
  unsigned long long timestamp;  // [FIX] 64 bits para epoch em ms
  char level[8];                 // DEBUG, INFO, WARN, ERROR
  char message[128];             // Mensagem do log
};

class DebugLogger {
private:
  LogEntry buffer[LOG_BUFFER_SIZE];
  int bufferIndex = 0;
  int bufferCount = 0;
  unsigned long lastSyncToServer = 0;
  const unsigned long SYNC_INTERVAL = 60000; // Enviar logs a cada 60s

public:
  void log(const char* level, const char* format, ...) {
    va_list args;
    va_start(args, format);

    LogEntry& entry = buffer[bufferIndex];

    // [FIX] Usar epoch timestamp se NTP estiver sincronizado
    unsigned long long epochMs = getCurrentEpochMs();
    if (epochMs > 0 && epochMs > 1000000000000ULL) {  // Validar que é epoch real (> ano 2001)
      entry.timestamp = epochMs;
    } else {
      // Fallback: millis() se NTP não estiver pronto
      entry.timestamp = millis();
    }

    strncpy(entry.level, level, sizeof(entry.level) - 1);
    vsnprintf(entry.message, sizeof(entry.message), format, args);

    va_end(args);

    // Print to Serial for real-time monitoring
    Serial.printf("[%s] %llu: %s\n", level, entry.timestamp, entry.message);

    // Update circular buffer
    bufferIndex = (bufferIndex + 1) % LOG_BUFFER_SIZE;
    if (bufferCount < LOG_BUFFER_SIZE) bufferCount++;

    // Auto-save to SPIFFS on ERROR
    if (strcmp(level, "ERROR") == 0) {
      saveToSPIFFS();
    }
  }

  void saveToSPIFFS() {
    if (!SPIFFS.begin(true)) return;

    // Open file in append mode
    File f = SPIFFS.open(LOG_FILE_PATH, FILE_APPEND);
    if (!f) {
      Serial.println("[Logger] Falha ao abrir arquivo de log");
      return;
    }

    // Check file size and rotate if needed
    if (f.size() > LOG_MAX_FILE_SIZE) {
      f.close();
      SPIFFS.remove(LOG_FILE_PATH);
      f = SPIFFS.open(LOG_FILE_PATH, FILE_WRITE);
    }

    // Write buffer to file
    for (int i = 0; i < bufferCount; i++) {
      int idx = (bufferIndex - bufferCount + i + LOG_BUFFER_SIZE) % LOG_BUFFER_SIZE;
      LogEntry& entry = buffer[idx];
      f.printf("[%s] %llu: %s\n", entry.level, entry.timestamp, entry.message);  // [FIX] %llu
    }

    f.close();
    Serial.printf("[Logger] %d logs salvos no SPIFFS\n", bufferCount);
  }

  String getLogsAsString() {
    String result = "";
    for (int i = 0; i < bufferCount; i++) {
      int idx = (bufferIndex - bufferCount + i + LOG_BUFFER_SIZE) % LOG_BUFFER_SIZE;
      LogEntry& entry = buffer[idx];
      result += "[" + String(entry.level) + "] " + String(entry.timestamp) + ": " + String(entry.message) + "\n";
    }
    return result;
  }

  void syncToServer() {
    if (WiFi.status() != WL_CONNECTED || deviceToken.length() == 0) return;
    if (millis() - lastSyncToServer < SYNC_INTERVAL) return;
    if (bufferCount == 0) return;

    String logs = getLogsAsString();
    if (sendLogsToCloud(logs)) {
      Serial.println("[Logger] Logs enviados ao servidor com sucesso");
      lastSyncToServer = millis();
      bufferCount = 0; // Clear buffer after successful send
      bufferIndex = 0;
    }
  }

  void loadFromSPIFFS() {
    if (!SPIFFS.begin(true)) return;
    if (!SPIFFS.exists(LOG_FILE_PATH)) return;

    File f = SPIFFS.open(LOG_FILE_PATH, FILE_READ);
    if (!f) return;

    Serial.println("[Logger] Logs salvos no SPIFFS:");
    while (f.available()) {
      String line = f.readStringUntil('\n');
      Serial.println(line);
    }
    f.close();
  }

  bool sendLogsToCloud(const String& logs) {
    WiFiClient client;
    HTTPClient http;
    String url = "http://iot.reefbluesky.com.br/api/v1/device/logs";

    if (!http.begin(client, url)) return false;

    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + deviceToken);

    DynamicJsonDocument doc(2048);
    doc["deviceId"] = deviceId;
    doc["logs"] = logs;
    doc["timestamp"] = millis();

    String payload;
    serializeJson(doc, payload);

    int code = http.POST(payload);
    http.end();

    return (code == 200 || code == 201);
  }

  // [NOVO] Enviar logs como alerta por email/Telegram após boot
  void sendLogsAsAlert() {
    if (!SPIFFS.begin(true)) return;
    if (!SPIFFS.exists(LOG_FILE_PATH)) return;

    File f = SPIFFS.open(LOG_FILE_PATH, FILE_READ);
    if (!f) return;

    // Ler últimas 10 linhas do log (ou todas se forem menos)
    String logContent = "";
    int lineCount = 0;
    const int MAX_LINES = 10;

    // Ler todas as linhas primeiro
    String allLines[50]; // Buffer temporário
    int totalLines = 0;
    while (f.available() && totalLines < 50) {
      allLines[totalLines++] = f.readStringUntil('\n');
    }
    f.close();

    // Pegar as últimas MAX_LINES
    int startIdx = (totalLines > MAX_LINES) ? (totalLines - MAX_LINES) : 0;
    for (int i = startIdx; i < totalLines; i++) {
      logContent += allLines[i] + "\n";
    }

    if (logContent.length() > 0) {
      // Truncar se muito grande (limite de 1000 chars para alertas)
      if (logContent.length() > 1000) {
        logContent = logContent.substring(logContent.length() - 1000);
      }

      String alertMsg = "🔄 BOOT DETECTED - Últimos logs:\n\n" + logContent;
      sendAlert("Device Boot", alertMsg, "medium");
      Serial.println("[Logger] Logs enviados por email/Telegram após boot");
    }
  }
};

DebugLogger debugLog;

// Watchdog de WiFi e Cloud
unsigned long lastWifiOkMs      = 0;
unsigned long firstNoTokenTime  = 0;

const unsigned long MAX_WIFI_DOWN_MS = 5UL * 60UL * 1000UL; // 5 min sem WiFi → reboot
const unsigned long MAX_NO_TOKEN_MS  = 5UL  * 60UL * 1000UL; // 5 min sem Cloud/token → reboot


unsigned long lastMeasurementTime = 0;
unsigned long measurementInterval = 3600000;  // 1 hora em ms
unsigned long lastResetButtonCheck = 0;
const unsigned long HEALTH_INTERVAL_MS = 2UL * 1000UL; // 2 segundos (atualização rápida dos sensores de nível)
unsigned long lastHealthSent = 0;

bool resetButtonPressed = false;

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
    debugLog.log("INFO", "NTP init: server=%s", ntpServer);
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
    debugLog.log("INFO", "NTP sync OK: %04d-%02d-%02d %02d:%02d:%02d",
                 timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                 timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  } else {
    static int retries = 0;
    retries++;
    Serial.println("[NTP] Aguardando sincronizar...");
    if (retries >= 15) {
      Serial.println("[NTP] Falha ao sincronizar (timeout), seguindo sem NTP.");
      debugLog.log("WARN", "NTP sync FAILED after 15 retries");
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

// [FIX] Backoff para reconexão - começa em 5s, máximo 5min
unsigned long reconnectDelayMs = 5000;
const unsigned long RECONNECT_MIN_DELAY_MS = 5000;      // 5 segundos
const unsigned long RECONNECT_MAX_DELAY_MS = 300000;    // 5 minutos
int reconnectFailureCount = 0;

// [FIX] Watchdog mais tolerante - 15 minutos em vez de 5
const unsigned long MAX_NO_TOKEN_GRACEFUL_MS = 15UL * 60UL * 1000UL;  // 15 min antes de reboot

void handleCloudReconnect(unsigned long now) {
  // Se já estamos conectados à nuvem, reseta tudo
  if (cloudAuth.isConnected()) {
    cloudConnected = true;
    firstNoTokenTime = 0;
    // Reset backoff on success
    if (reconnectFailureCount > 0) {
      Serial.printf("[Cloud] Reconectado após %d falhas, resetando backoff\n", reconnectFailureCount);
    }
    reconnectDelayMs = RECONNECT_MIN_DELAY_MS;
    reconnectFailureCount = 0;
    cloudAuth.resetAuthBackoff();
    return;
  }

  // Sem WiFi, não tenta e não conta tempo
  if (!WiFi.isConnected()) {
    cloudConnected = false;
    firstNoTokenTime = 0;  // não penaliza por falta de WiFi
    return;
  }

  // [FIX] Verificar backoff do CloudAuth
  if (!cloudAuth.shouldRetryAuth()) {
    // Ainda em backoff, apenas loga de vez em quando
    static unsigned long lastBackoffLog = 0;
    if (now - lastBackoffLog > 30000) {  // Log a cada 30s
      Serial.printf("[Cloud] Em backoff, falhas: %d, aguardando...\n",
                    cloudAuth.getAuthFailureCount());
      lastBackoffLog = now;
    }
    return;
  }

  // Respeita intervalo mínimo entre tentativas com backoff exponencial
  if (now - lastReconnectAttemptMs < reconnectDelayMs) {
    return;
  }
  lastReconnectAttemptMs = now;

  Serial.printf("[Cloud] Tentando (re)autenticar (tentativa #%d, delay atual: %lu ms)...\n",
                reconnectFailureCount + 1, reconnectDelayMs);
  debugLog.log("INFO", "Cloud auth attempt #%d, delay=%lu ms",
               reconnectFailureCount + 1, reconnectDelayMs);

  if (cloudAuth.init()) {
    Serial.println("[Cloud] Device autenticado, token disponível.");
    debugLog.log("INFO", "Cloud auth SUCCESS, token acquired");
    cloudConnected = true;
    firstNoTokenTime = 0;
    reconnectDelayMs = RECONNECT_MIN_DELAY_MS;
    reconnectFailureCount = 0;
    onCloudAuthOk();
  } else {
    Serial.println("[Cloud] Ainda sem token válido (aguardando registro ou erro).");
    debugLog.log("WARN", "Cloud auth FAILED, attempt #%d", reconnectFailureCount + 1);
    cloudConnected = false;
    reconnectFailureCount++;

    // [FIX] Exponential backoff para reconexão
    reconnectDelayMs = min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
    Serial.printf("[Cloud] Próxima tentativa em %lu ms\n", reconnectDelayMs);

    // [FIX] Watchdog mais gracioso - permite operação offline por mais tempo
    if (firstNoTokenTime == 0) {
      firstNoTokenTime = now;
      Serial.println("[Cloud][WDT] Iniciando contagem de watchdog (15 min)");
    } else {
      unsigned long elapsedNoToken = now - firstNoTokenTime;
      unsigned long remainingMs = MAX_NO_TOKEN_GRACEFUL_MS > elapsedNoToken ?
                                  MAX_NO_TOKEN_GRACEFUL_MS - elapsedNoToken : 0;

      // Log a cada 1 minuto
      static unsigned long lastWdtLog = 0;
      if (now - lastWdtLog > 60000) {
        Serial.printf("[Cloud][WDT] Sem token há %lu s, reboot em %lu s\n",
                      elapsedNoToken / 1000, remainingMs / 1000);
        lastWdtLog = now;
      }

      if (elapsedNoToken > MAX_NO_TOKEN_GRACEFUL_MS) {
        Serial.println("[Cloud][WDT] Tempo máximo sem token excedido. Reiniciando device...");
        debugLog.log("ERROR", "Cloud WDT timeout! No token for %lu s, RESTART!",
                     elapsedNoToken / 1000);
        debugLog.saveToSPIFFS();
        delay(2000);
        ESP.restart();
      }
    }
  }
}

// ============================================================================
// [TEST SCHEDULE] Verificar e executar teste agendado
// ============================================================================

void checkScheduledTest() {
  if (!cloudAuth.isConnected()) {
    // Sem conexão, não faz polling
    return;
  }

  // Se já estiver executando um teste agendado, aguardar completar
  if (isScheduledTestRunning) {
    Serial.println("[TestSchedule] Teste agendado ainda em execução, aguardando...");
    return;
  }

  bool shouldTestNow = false;
  unsigned long nextTestTime = 0;
  int intervalHours = 24;

  // Buscar próximo teste agendado do backend
  if (cloudAuth.checkNextScheduledTest(shouldTestNow, nextTestTime, intervalHours)) {
    Serial.printf("[TestSchedule] should_test_now=%d, next=%lu, interval=%dh\n",
                 shouldTestNow, nextTestTime, intervalHours);

    if (shouldTestNow) {
      Serial.println("[TestSchedule] ⏰ Hora do teste agendado! Iniciando medição...");
      debugLog.log("INFO", "Teste agendado iniciando (interval=%dh)", intervalHours);

      // Marcar teste agendado em andamento
      isScheduledTestRunning = true;
      memset(&lastScheduledTestResult, 0, sizeof(Measurement));

      // Iniciar medição não-bloqueante — resultado processado na seção 10 do loop
      Serial.println("[TestSchedule] Iniciando medição não-bloqueante...");
      debugLog.log("INFO", "Teste agendado iniciando (interval=%dh)", intervalHours);
      performMeasurement();
      systemState = MEASURING;

    } else {
      // Ainda não é hora - apenas informativo no debug
      static unsigned long lastInfoLog = 0;
      unsigned long now = millis();

      // Log a cada 5 minutos para não poluir
      if (now - lastInfoLog > 300000) {
        if (nextTestTime > now) {
          unsigned long remainingMs = nextTestTime - now;
          unsigned long remainingHours = remainingMs / (1000 * 60 * 60);
          unsigned long remainingMins = (remainingMs % (1000 * 60 * 60)) / (1000 * 60);
          Serial.printf("[TestSchedule] Próximo teste em %luh %lumin\n",
                       remainingHours, remainingMins);
        }
        lastInfoLog = now;
      }
    }
  } else {
    Serial.println("[TestSchedule] Erro ao buscar próximo teste agendado");
  }
}

void setup() {
  Serial.begin(115200); delay(1000);
  initFirmwarePrefs();
  lastHealthSent = millis() - HEALTH_INTERVAL_MS;

  Serial.println("\n\n========================================");
  Serial.println("ReefBlueSky KH Monitor - Inicializando");
  Serial.println("Versão: 2.0 com IA Preditiva");
  Serial.println("========================================\n");

  Serial.printf("[FW] DeviceType=%s, FWVERSION=%s\n", FW_DEVICE_TYPE, FW_VERSION);

  // [LOG] Boot info
  debugLog.log("INFO", "BOOT: FW=%s, Heap=%d, ResetReason=%d",
               FW_VERSION, ESP.getFreeHeap(), esp_reset_reason());

  // Carregar logs salvos do boot anterior (exibe no Serial)
  debugLog.loadFromSPIFFS();

  // 1️⃣ RESET botão (OK)
  //pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  // ⚠️ [CRITICAL] GPIO 2 NÃO DEVE SER TOCADO!
  // GPIO 2 é gerenciado internamente pelo módulo WiFi PHY do ESP32
  // NUNCA usar pinMode/digitalWrite/analogWrite no GPIO 2
  // PUMP_B_OUT (bit flag 0x02) NÃO é GPIO físico

  // 2️⃣ WIFI PRIMEIRO (CRÍTICO!)
  Serial.println("[Main] Iniciando WiFiSetup...");
  debugLog.log("INFO", "Iniciando WiFiSetup");
  bool wifiOk = wifiSetup.begin();

  if (wifiOk && WiFi.isConnected()) {  // ← + WiFi.isConnected()!
    Serial.println("[Main] WiFi STA conectado!");
    debugLog.log("INFO", "WiFi conectado, SSID=%s, RSSI=%d, IP=%s",
                 WiFi.SSID().c_str(), WiFi.RSSI(), WiFi.localIP().toString().c_str());
    lastWifiOkMs = millis();

    // Auth só com STA
    initMultiDeviceAuth();
    Serial.println("✓ Auth OK");
    cloudAuth.setDeviceId(deviceId);
    cloudAuth.init();

    // <<< AQUI inicializa OTA com a base URL dos firmwares >>>
    otaInit("http://iot.reefbluesky.com.br");

    //WiFi.softAPdisconnect(true);  // Desliga AP do setup
    //WiFi.mode(WIFI_STA);

    // [NOVO] Buscar config do backend (testMode e intervalHours)
    Serial.println("[Config] Tentando buscar config do backend...");
    debugLog.log("INFO", "Setup: Fetching config from backend");
    bool backendOk = fetchConfigFromBackend();
    if (backendOk) {
      fetchIntervalFromBackendStatus();  // Buscar intervalHours do /status
    } else {
      Serial.println("[Config] Falha ao buscar do backend, carregando do SPIFFS...");
      debugLog.log("WARN", "Setup: Backend fetch failed, loading from SPIFFS");
      loadConfigFromSPIFFS();
    }

    // [NOVO] Enviar logs salvos por email/Telegram após boot
    delay(2000);  // Aguardar 2s para garantir que auth está estável
    debugLog.sendLogsAsAlert();

    setupWebServer();
  } else {
    Serial.println("[Main] AP mode ativo. Configure WiFi em 192.168.4.1");
    // [IMPORTANTE] Sem WiFi, não carrega config - testMode fica false (não roda automático)
    Serial.println("[Config] Sem WiFi, testMode=false (não roda teste automático)");
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
  sensorManager.setSimulatePH(true, 8.2f, 8.0f); //Teste
  //sensorManager.setSimulatePH(false, 0, 0); // sensor real

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
// [SIMULAÇÃO] Funções para Modo Teste de Sensores de Nível
// =================================================================================

// Registrar ativação de bomba (chamado quando bomba é ligada)

// =================================================================================
// Loop Principal
// =================================================================================
static bool lastWifiConnected = false;

void loop() {
  unsigned long now = millis();
  tryNtpOnceNonBlocking();

  bool nowConnected = (WiFi.status() == WL_CONNECTED);
  IPAddress staIp = WiFi.localIP();

  if (nowConnected && !lastWifiConnected) {
    Serial.printf("[Main] WiFi reconectado (auto). STA IP=%s\n",
                  staIp.toString().c_str());
    debugLog.log("INFO", "WiFi reconectado: IP=%s, RSSI=%d",
                 staIp.toString().c_str(), WiFi.RSSI());

    // Só fecha portal se o IP NÃO for 0.0.0.0 e NÃO for 192.168.4.1
    if (staIp != IPAddress(0,0,0,0) && staIp != IPAddress(192,168,4,1)) {
      Serial.println("[Main] STA com IP válido diferente do AP. Fechando portal.");
      wifiSetup.closePortalIfActive();
    } else {
      Serial.println("[Main] STA sem IP válido ainda, mantendo portal aberto.");
    }
  }

  // [LOG] Detectar desconexão WiFi
  if (!nowConnected && lastWifiConnected) {
    debugLog.log("WARN", "WiFi desconectado! Uptime=%lu, Heap=%d",
                 now, ESP.getFreeHeap());
    debugLog.saveToSPIFFS(); // Salvar imediatamente
  }

  lastWifiConnected = nowConnected;

  // Watchdog de WiFi: se ficar muito tempo OFF, reinicia
  if (nowConnected) {
    lastWifiOkMs = now;
  } else {
    if (lastWifiOkMs > 0 && (now - lastWifiOkMs) > MAX_WIFI_DOWN_MS) {
      Serial.println("[WDT] WiFi OFF por muito tempo, reiniciando device...");
      debugLog.log("ERROR", "WiFi OFF > %lu ms, RESTART!", MAX_WIFI_DOWN_MS);
      debugLog.saveToSPIFFS();
      delay(2000);
      ESP.restart();
    }
  }

  if (!wifiSetup.isConfigured()) {
    wifiSetup.loopReconnect();  
    delay(100);
    return;
  }
/*
static unsigned long lastLevelDebug = 0;
if (now - lastLevelDebug > 1000) { // 1 s, ajuste se quiser
  lastLevelDebug = now;
  Serial.printf("[LEVEL] A=%d(%.0f) B=%d(%.0f) C=%d(%.0f)\n",
      sensorManager.getLevelA(), analogRead(LEVEL_A_PIN)*3.3/4095,
      sensorManager.getLevelB(), analogRead(LEVEL_B_PIN)*3.3/4095,
      sensorManager.getLevelC(), analogRead(LEVEL_C_PIN)*3.3/4095);
}
*/

  // 🔥 1. SERIAL DEBUG (ÚNICO BLOCO!)
  if (Serial.available()) {
    char c = Serial.read();
    
    if (c == 's') debugForceSync();
    if (c == 't') debugForceSync();
    if (c == 'k') { 
      Serial.println("🚀 [KH] Iniciando ciclo de medição SEM IA (serial)...");
      performMeasurement();
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
      digitalWrite(COMPRESSOR_PIN, HIGH); 
      delay(30000); 
      digitalWrite(COMPRESSOR_PIN, LOW);
    }

    // 🔧 Iniciar calibração completa de KH (FSM nova)
    if (c == 'K') {
      Serial.println("[KH_Calib] Iniciando calibração completa de KH...");
      float khRefUser = 8.0f;      // referência desejada
      bool assumeEmpty = false;    // true se câmaras vazias
      khCalibrator.start(khRefUser, assumeEmpty);
      khCalibRunning    = true;
      khCalibLastStepMs = millis();
      // Envia progresso imediatamente ao iniciar
      khProgressLastSentMs = millis();
      sendCalibProgress();
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
    int queueSize = cloudAuth.getQueueSize();
    if (queueSize > 0) {
      debugLog.log("DEBUG", "Syncing %d measurements to cloud", queueSize);
    }
    cloudAuth.syncOfflineMeasurements();
  }

  // 🔥 2.5 TEST SCHEDULE - Polling de teste agendado
  if (now - lastTestScheduleCheck >= TEST_SCHEDULE_CHECK_MS) {
    lastTestScheduleCheck = now;
    checkScheduledTest();
  }

  // 🔥 2.6 DEVICE CONFIG - Polling de configurações (intervalHours)
  if (now - lastDeviceConfigCheck >= DEVICE_CONFIG_CHECK_MS) {
    lastDeviceConfigCheck = now;
    bool unused = false;
    cloudAuth.fetchDeviceConfig(unused);
  }

  // 🔥 3. WEB SERVER
  webServer.handleClient();
/*
  // 🔥 4. AI PUMP CONTROL
  int aiAction = getFuzzyDecision();
  if (aiAction & PUMP_A_IN) { pumpControl.pumpA_fill(); Serial.println("🤖 AI → Pump A"); }
  if (aiAction & PUMP_B_OUT) { pumpControl.pumpB_discharge(); Serial.println("🤖 AI → Pump B"); }
  if (aiAction & PUMP_C_IN) { pumpControl.pumpC_fill(); Serial.println("🤖 AI → Pump C"); }

*/

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
        debugLog.log("INFO", "Manual measurement triggered");
        systemState = MEASURING;
      }
      break;

    case MEASURING:
      // FSM não-bloqueante gerenciada pela seção 10 do loop
      if (!khAnalyzerRunning) {
        performMeasurement();  // inicia o ciclo; define khAnalyzerRunning = true
      }
      break;

    case PREDICTING:
      //performPrediction();
      systemState = IDLE;
      lastMeasurementTime = now;
      break;

    case AI_KH_CALIBRATE_PH:  // ← MESMO NOME DO ENUM
      if (!isAiActive()) {
        Serial.println("🤖 CALIBRANDO IA DURANTE KH SETUP...");
        calibrateAiSensors();
      }
      
      if (sensorManager.getLevelB() == 1) {  // [FIX] getLevelB() retorna 0 ou 1
        systemState = AI_KH_RENEW_A;
        Serial.println("✅ pH calibrado + IA ATIVA! Renovando A...");
      }
      break;

    case AI_KH_RENEW_A:
      if (sensorManager.getLevelA() == 1) {  // [FIX] getLevelA() retorna 0 ou 1
        systemState = AI_KH_TEST_A_TO_B;
        Serial.println("✅ A renovado → Teste KH");
      }
      break;

    case AI_KH_TEST_A_TO_B:
      if (sensorManager.getLevelB() == 1) {  // [FIX] getLevelB() retorna 0 ou 1
        systemState = AI_KH_CLEAN_B_TO_C;
        Serial.println("✅ KH medido → Limpando");
        performMeasurement();
      }
      break;

    case AI_KH_CLEAN_B_TO_C:
      if (sensorManager.getLevelB() == 0) {  // [FIX] getLevelB() retorna 0 ou 1
        systemState = AI_PREP_NEW_TEST;
        Serial.println("✅ B limpo → Prep novo");
      }
      break;

    case AI_PREP_NEW_TEST:
      if (sensorManager.getLevelA() == 0 && sensorManager.getLevelB() == 0) {  // [FIX]
        systemState = IDLE;
        Serial.println("🎉 Pronto para novo teste!");
      }
      break;
  }

  // 🔥 6. DEBUG & HEALTH & LOG SYNC
  if (now - lastHealthSent >= HEALTH_INTERVAL_MS) {
    sendHealthToCloud();
    lastHealthSent = now;
  }

  // Periodic log sync (independent of health)
  debugLog.syncToServer();

  static unsigned long lastDebug = 0;
  if (now - lastDebug > 6000) {
    lastDebug = now;
      Serial.printf("[DEBUG] PH=%.2f Temp=%.1f State=%d\n",
              sensorManager.getPH(), sensorManager.getTemperature(),
              (int)systemState);
  }

  // Leitura rápida de sensores a cada 100ms para alimentar o debounce temporal (80ms)
  static unsigned long lastLevelDebug = 0;
  if (now - lastLevelDebug >= 100) {
    lastLevelDebug = now;
    int la = sensorManager.getLevelA();
    int lb = sensorManager.getLevelB();
    int lc = sensorManager.getLevelC();
    Serial.printf("[LEVEL] A=%d B=%d C=%d\n", la, lb, lc);
  }

  // 🔥 7. DIAG WiFi GERAL + MEMORY (a cada 30s)
  static unsigned long lastDiag = 0;
  if (now - lastDiag > 30000) {

    Serial.printf("[MAIN DIAG] WiFi.status=%s | SSID='%s' | IP=%s | RSSI=%d\n",
                  statusName(WiFi.status()),
                  WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI());

    // [LOG] Memory check - warn if low
    size_t freeHeap = ESP.getFreeHeap();
    if (freeHeap < 50000) {  // Alerta se menos de 50KB livre
      debugLog.log("WARN", "LOW HEAP! Free=%d bytes", freeHeap);
    }

    lastDiag = now;
  }

  // 🔁 8. FAILSAFE WiFi: se perdeu IP em runtime, deixa o WiFiSetup tentar reconectar / reabrir portal
  if (WiFi.status() != WL_CONNECTED) {
    wifiSetup.loopReconnect();
  }

  // 🔧 9. KH CALIBRATOR FSM
  if (khCalibRunning) {
    if (now - khCalibLastStepMs >= KH_CALIB_STEP_INTERVAL_MS) {
      khCalibLastStepMs = now;

      // [FIX] Verificar ANTES de processStep() para evitar race condition
      // (processStep muda estado de CAL_KH_TEST_START -> CAL_KH_TEST_WAIT na mesma chamada)
      bool needsTest = khCalibrator.needsKhTestCycle();
      Serial.printf("[DEBUG] ANTES processStep: needsKhTestCycle=%d khAnalyzerRunning=%d\n", needsTest, khAnalyzerRunning);

      bool stillRunning = khCalibrator.processStep();

      // Passo 5 da calibracao: inicia KH_Analyzer se necessário
      if (needsTest && !khAnalyzerRunning) {
        Serial.println("[KH_Calib] Passo 5: iniciando ciclo KH_Analyzer (medicao de referencia)...");

        // [FIX] Configurar KH de referência no KH_Analyzer antes de iniciar
        KH_Calibrator::Result calibResult = khCalibrator.getResult();
        Serial.printf("[DEBUG] kh_ref_user da calibracao: %.2f\n", calibResult.kh_ref_user);

        if (calibResult.kh_ref_user > 0) {
          Serial.printf("[KH_Calib] Configurando KH de referencia: %.2f dKH\n", calibResult.kh_ref_user);
          khAnalyzer.setReferenceKH(calibResult.kh_ref_user);
        } else {
          Serial.println("[KH_Calib] AVISO: kh_ref_user <= 0, pulando setReferenceKH");
        }

        Serial.println("[DEBUG] Tentando iniciar KH_Analyzer.startMeasurementCycle(true) [MODO CALIBRACAO]...");
        if (khAnalyzer.startMeasurementCycle(true)) {  // true = modo calibração (pula preparação)
          khAnalyzerRunning    = true;
          khAnalyzerLastStepMs = millis();
          Serial.println("[KH_Analyzer] INICIADO com sucesso durante calibracao (modo direto para compressor)");
        } else {
          Serial.println("[KH_Calib] ERRO: nao foi possivel iniciar KH_Analyzer no Passo 5");
          String errMsg = khAnalyzer.getErrorMessage();
          Serial.printf("[KH_Calib] Motivo: %s\n", errMsg.c_str());
          // [FIX] Sinaliza erro ao calibrador para não travar
          khCalibrator.onKhTestComplete(0.0f, 0.0f);  // força erro
        }
      } else if (!needsTest) {
        Serial.println("[DEBUG] needsKhTestCycle() retornou FALSE - pulando ciclo de teste");
      } else if (khAnalyzerRunning) {
        Serial.println("[DEBUG] khAnalyzerRunning já está TRUE");
      }

      // Enviar progresso ao backend a cada 1 s
      if (now - khProgressLastSentMs >= KH_PROGRESS_SEND_INTERVAL_MS) {
        khProgressLastSentMs = now;
        sendCalibProgress();
      }

      if (!stillRunning) {
        khCalibRunning = false;

        KH_Calibrator::Result res = khCalibrator.getResult();
        if (khCalibrator.hasError()) {
          Serial.printf("[KH_Calib] ERRO: %s\n", res.error.c_str());
          debugLog.log("ERROR", "KH Calibration FAILED: %s", res.error.c_str());
          sendAlert("Falha na Calibracao", res.error, "high");
          sendKhProgressToCloud(false, "calibration", "ERRO: " + res.error,
                                -1, 0,
                                sensorManager.getLevelA(), sensorManager.getLevelB(),
                                sensorManager.getLevelC(),
                                sensorManager.getPH(), sensorManager.getTemperature());
        } else {
          Serial.printf("[KH_Calib] OK: kh_ref=%.2f ph_ref=%.2f temp=%.2f b1=%.4f b2=%.4f b3=%.4f\n",
                        res.kh_ref_user, res.ph_ref_measured, res.temp_ref,
                        res.mlps_b1, res.mlps_b2, res.mlps_b3);
          sendKhProgressDone("calibration", "Calibracao concluida!");
        }
      }
    }
  }

  // 🔧 10. KH ANALYZER FSM (não-bloqueante)
  if (khAnalyzerRunning) {
    if (now - khAnalyzerLastStepMs >= KH_ANALYZER_STEP_INTERVAL_MS) {
      khAnalyzerLastStepMs = now;

      bool stillRunning = khAnalyzer.processNextPhase();

      // Enviar progresso ao backend a cada 1 s
      if (now - khProgressLastSentMs >= KH_PROGRESS_SEND_INTERVAL_MS) {
        khProgressLastSentMs = now;
        sendMeasureProgress();
      }

      if (!stillRunning) {
        khAnalyzerRunning = false;
        Serial.println("[KH_Analyzer] TERMINOU");

        if (khAnalyzer.hasError()) {
          String errMsg = khAnalyzer.getErrorMessage();
          Serial.printf("[KH_Measure] ERRO: %s\n", errMsg.c_str());
          debugLog.log("ERROR", "KH Measurement FAILED: %s", errMsg.c_str());
          sendAlert("Falha na Medicao de KH", errMsg, "high");
          sendKhProgressToCloud(false, "measurement", "ERRO: " + errMsg,
                                -1, 0,
                                sensorManager.getLevelA(), sensorManager.getLevelB(),
                                sensorManager.getLevelC(),
                                sensorManager.getPH(), sensorManager.getTemperature());

          if (isScheduledTestRunning) {
            cloudAuth.reportTestResult(false, errMsg);
            isScheduledTestRunning = false;
          }
          systemState = IDLE;

        } else if (khCalibRunning) {
          // Passo 5 da calibracao: passa pH_ref e temperatura para o calibrador
          float ph_ref  = khAnalyzer.getPhRef();
          float temp_ref = khAnalyzer.getTemperature();
          Serial.printf("[KH_Calib] Passo 5 concluido: ph_ref=%.2f temp=%.2f\n",
                        ph_ref, temp_ref);
          khCalibrator.onKhTestComplete(ph_ref, temp_ref);
          // khCalibRunning continua true; seção 9 continuará o FSM (CAL_SAVE → CAL_COMPLETE)

        } else {
          handleMeasurementResult();
          sendKhProgressDone("measurement", "Medicao concluida!");

          if (isScheduledTestRunning) {
            if (lastScheduledTestResult.kh > 0) {
              Serial.printf("[TestSchedule] ✓ Teste concluído: KH=%.2f\n",
                            lastScheduledTestResult.kh);
              debugLog.log("INFO", "Teste agendado concluído: KH=%.2f",
                           lastScheduledTestResult.kh);
              cloudAuth.reportTestResult(true, "", &lastScheduledTestResult);
            } else {
              Serial.println("[TestSchedule] ✗ Teste falhou (sem dados de KH)");
              cloudAuth.reportTestResult(false, "Measurement failed - no KH data");
              debugLog.log("ERROR", "Teste agendado falhou");
            }
            isScheduledTestRunning = false;
          }
          systemState = PREDICTING;
        }
      }
    }
  }

  // 🔧 11. KH DRAIN: descarrega câmaras A/B/C → aquário
  if (khDrainRunning) {
    if (now - khDrainStartMs >= KH_DRAIN_DURATION_MS) {
      pumpControl.pumpC_stop();
      pumpControl.pumpB_stop();
      pumpControl.pumpA_stop();
      khDrainRunning = false;
      Serial.println("[KH_Drain] Dreno concluido.");
    }
  }

  // 🔧 12. SYSTEM FLUSH: limpeza inteligente com proteções de sensor
  if (systemFlushRunning) {
    // Proteção A: se A cheio, pausa bomba B (B está enchendo A mais rápido que A drena)
    bool a = (sensorManager.getLevelA() == 1);
    bool b = (sensorManager.getLevelB() == 1);

    if (a && pumpControl.isPumpRunning(2)) {
      pumpControl.pumpB_stop();
      Serial.println("[FLUSH] Sensor A ativo - pausando bomba B");
    } else if (!a && !pumpControl.isPumpRunning(2)) {
      pumpControl.pumpB_discharge();
      Serial.println("[FLUSH] Sensor A inativo - retomando bomba B");
    }

    // Proteção B: se B cheio, pausa bomba C (C está enchendo B mais rápido que B drena)
    if (b && pumpControl.isPumpRunning(3)) {
      pumpControl.pumpC_stop();
      Serial.println("[FLUSH] Sensor B ativo - pausando bomba C");
    } else if (!b && !pumpControl.isPumpRunning(3)) {
      pumpControl.pumpC_discharge();
      Serial.println("[FLUSH] Sensor B inativo - retomando bomba C");
    }

    // Timeout: encerra após tempo calculado
    if (now - systemFlushStartMs >= systemFlushDurationMs) {
      pumpControl.stopAll();
      systemFlushRunning = false;
      Serial.printf("[FLUSH] Flush concluido (%.1f s).\n",
                    (now - systemFlushStartMs) / 1000.0f);
    }
  }

  // 🔧 13. FILL TEST: teste de enchimento individual de câmaras (não-bloqueante)
  if (fillTestRunning) {
    if (now - fillTestStartMs >= fillTestDurationMs) {
      // Para a bomba apropriada
      switch (fillTestChamber) {
        case 'A':
          pumpControl.pumpA_stop();
          Serial.println("[FILL_TEST] Câmara A: enchimento concluído");
          break;
        case 'B':
          pumpControl.pumpB_stop();
          Serial.println("[FILL_TEST] Câmara B: enchimento concluído");
          break;
        case 'C':
          pumpControl.pumpC_stop();
          Serial.println("[FILL_TEST] Câmara C: enchimento concluído");
          break;
      }
      fillTestRunning = false;
      fillTestChamber = 'X';
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
  debugLog.log("WARN", "FACTORY RESET initiated!");
  debugLog.saveToSPIFFS();

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
  debugLog.log("WARN", "WIFI FACTORY RESET - clearing credentials");
  debugLog.saveToSPIFFS();

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

void handleFactoryReset() {
  Serial.println("[WEB] Requisição: /factory_reset");
  factoryReset();
  webServer.send(200, "application/json",
                 "{\"status\":\"factory_reset_initiated\"}");
}

void handleResetKH() {
  Serial.println("[WEB] Requisição: /reset_kh");
  resetKHReference();
  webServer.send(200, "application/json",
                 "{\"status\":\"kh_reset_initiated\"}");
}

void handleSetKH() {
  Serial.println("[WEB] Requisição: /set_kh");
  if (webServer.hasArg("value")) {
    float kh = webServer.arg("value").toFloat();
    khAnalyzer.setReferenceKH(kh);
    webServer.send(200, "application/json",
                   "{\"status\":\"kh_configured\",\"value\":" +
                   String(kh, 2) + "}");
  } else {
    webServer.send(400, "application/json",
                   "{\"error\":\"missing_value_parameter\"}");
  }
}

void handleTestNow() {
  // Precisa ter KH de referência configurado
  if (!khAnalyzer.isReferenceKHConfigured()) {
    webServer.send(
      400,
      "application/json",
      "{\"success\":false,"
      "\"error\":\"kh_reference_not_configured\","
      "\"message\":\"KH de referência não configurado. Faça a calibração em Configurações > Calibração de KH.\"}"
    );
    return;
  }

  // 3) OK, dispara o teste agora
  forceImmediateMeasurement = true;
  webServer.send(
    200,
    "application/json",
    "{\"success\":true}"
  );
}

void handleStatus() {
  String json = "{";
  json += "\"state\":\"" + String(systemState) + "\",";
  json += "\"kh_configured\":" +
          String(khAnalyzer.isReferenceKHConfigured() ? "true" : "false") + ",";
  json += "\"kh_reference\":" + String(khAnalyzer.getReferenceKH(), 2) + ",";
  json += "\"measurements\":" + String(history.getCount());
  json += "}";
  webServer.send(200, "application/json", json);
}

void handleLcdState() {
  String json = "{";
  json += "\"device_id\":\"" + String(deviceId) + "\",";
  json += "\"state\":\"" + String(systemState) + "\",";
  json += "\"kh_configured\":" +
          String(khAnalyzer.isReferenceKHConfigured() ? "true" : "false") + ",";
  json += "\"kh_reference\":" + String(khAnalyzer.getReferenceKH(), 2) + ",";

  MeasurementHistory::Measurement m = history.getLastMeasurement();
  if (m.is_valid) {
    json += "\"kh\":" + String(m.kh, 2) + ",";
    json += "\"ph_ref\":" + String(m.ph_ref, 2) + ",";
    json += "\"ph_sample\":" + String(m.ph_sample, 2) + ",";
    json += "\"temperature\":" + String(m.temperature, 1) + ",";
    json += "\"timestamp\":" + String(m.timestamp) + ",";
    json += "\"valid\":true";
  } else {
    json += "\"kh\":0.0,\"ph_ref\":0.0,\"ph_sample\":0.0,"
            "\"temperature\":0.0,\"timestamp\":0,\"valid\":false";
  }
  json += "}";
  webServer.send(200, "application/json", json);
}

// =================================================================================
// [NOVO] Handlers para teste de enchimento de câmaras
// =================================================================================

void handleFillA() {
  Serial.println("[WEB] Comando recebido: encher câmara A (aquário→A)");

  // [PRIORIDADE] Rejeita se calibração ou teste KH estiver rodando
  if (khCalibRunning || khAnalyzerRunning) {
    webServer.send(409, "application/json",
      "{\"success\":false,\"error\":\"calibration_or_test_running\","
      "\"message\":\"Calibração ou teste de KH em andamento. Aguarde conclusão.\"}");
    Serial.println("[FILL_TEST] REJEITADO: calibração/teste em andamento");
    return;
  }

  if (fillTestRunning) {
    webServer.send(400, "application/json",
      "{\"success\":false,\"error\":\"test_already_running\"}");
    return;
  }

  int duration = 10000;  // padrão 10s
  if (webServer.hasArg("plain")) {
    DynamicJsonDocument doc(128);
    deserializeJson(doc, webServer.arg("plain"));
    duration = doc["duration"] | 10000;
  }

  fillTestRunning = true;
  fillTestStartMs = millis();
  fillTestDurationMs = duration;
  fillTestChamber = 'A';

  pumpControl.pumpA_fill();  // aquário → A

  webServer.send(200, "application/json",
    "{\"success\":true,\"message\":\"Enchendo câmara A por " + String(duration/1000) + "s\","
    "\"warning\":\"Será necessário recalibrar após este comando.\"}");

  Serial.printf("[FILL_TEST] Iniciando enchimento câmara A por %d ms\n", duration);
}

void handleFillB() {
  Serial.println("[WEB] Comando recebido: encher câmara B (A→B)");

  // [PRIORIDADE] Rejeita se calibração ou teste KH estiver rodando
  if (khCalibRunning || khAnalyzerRunning) {
    webServer.send(409, "application/json",
      "{\"success\":false,\"error\":\"calibration_or_test_running\","
      "\"message\":\"Calibração ou teste de KH em andamento. Aguarde conclusão.\"}");
    Serial.println("[FILL_TEST] REJEITADO: calibração/teste em andamento");
    return;
  }

  if (fillTestRunning) {
    webServer.send(400, "application/json",
      "{\"success\":false,\"error\":\"test_already_running\"}");
    return;
  }

  int duration = 10000;  // padrão 10s
  if (webServer.hasArg("plain")) {
    DynamicJsonDocument doc(128);
    deserializeJson(doc, webServer.arg("plain"));
    duration = doc["duration"] | 10000;
  }

  fillTestRunning = true;
  fillTestStartMs = millis();
  fillTestDurationMs = duration;
  fillTestChamber = 'B';

  pumpControl.pumpB_fill();  // A → B

  webServer.send(200, "application/json",
    "{\"success\":true,\"message\":\"Enchendo câmara B por " + String(duration/1000) + "s\","
    "\"warning\":\"Será necessário recalibrar após este comando.\"}");

  Serial.printf("[FILL_TEST] Iniciando enchimento câmara B por %d ms\n", duration);
}

void handleFillC() {
  Serial.println("[WEB] Comando recebido: encher câmara C (B→C)");

  // [PRIORIDADE] Rejeita se calibração ou teste KH estiver rodando
  if (khCalibRunning || khAnalyzerRunning) {
    webServer.send(409, "application/json",
      "{\"success\":false,\"error\":\"calibration_or_test_running\","
      "\"message\":\"Calibração ou teste de KH em andamento. Aguarde conclusão.\"}");
    Serial.println("[FILL_TEST] REJEITADO: calibração/teste em andamento");
    return;
  }

  if (fillTestRunning) {
    webServer.send(400, "application/json",
      "{\"success\":false,\"error\":\"test_already_running\"}");
    return;
  }

  int duration = 10000;  // padrão 10s
  if (webServer.hasArg("plain")) {
    DynamicJsonDocument doc(128);
    deserializeJson(doc, webServer.arg("plain"));
    duration = doc["duration"] | 10000;
  }

  fillTestRunning = true;
  fillTestStartMs = millis();
  fillTestDurationMs = duration;
  fillTestChamber = 'C';

  pumpControl.pumpC_fill();  // B → C

  webServer.send(200, "application/json",
    "{\"success\":true,\"message\":\"Enchendo câmara C por " + String(duration/1000) + "s\","
    "\"warning\":\"Será necessário recalibrar após este comando.\"}");

  Serial.printf("[FILL_TEST] Iniciando enchimento câmara C por %d ms\n", duration);
}

void handleFlushAll() {
  Serial.println("[WEB] Comando recebido: executar ciclo de limpeza completo");

  // [PRIORIDADE] Rejeita se calibração ou teste KH estiver rodando
  if (khCalibRunning || khAnalyzerRunning) {
    webServer.send(409, "application/json",
      "{\"success\":false,\"error\":\"calibration_or_test_running\","
      "\"message\":\"Calibração ou teste de KH em andamento. Aguarde conclusão.\"}");
    Serial.println("[FLUSH] REJEITADO: calibração/teste em andamento");
    return;
  }

  // Ativa o sistema de flush existente
  systemFlushRunning = true;
  systemFlushStartMs = millis();

  // Inicia bombas de drenagem em paralelo
  pumpControl.pumpA_discharge();  // A → aquário
  pumpControl.pumpB_discharge();  // B → A
  pumpControl.pumpC_discharge();  // C → B

  webServer.send(200, "application/json",
    "{\"success\":true,\"message\":\"Ciclo de limpeza iniciado (5 min)\","
    "\"warning\":\"Será necessário recalibrar após este comando.\"}");

  Serial.println("[FLUSH] Ciclo de limpeza iniciado via web");
}


void setupWebServer() {
  webServer.on("/factory_reset", HTTP_POST, handleFactoryReset);
  webServer.on("/reset_kh",     HTTP_POST, handleResetKH);
  webServer.on("/set_kh",       HTTP_POST, handleSetKH);
  webServer.on("/test_now",     HTTP_POST, handleTestNow);
  webServer.on("/status",       HTTP_GET,  handleStatus);
  webServer.on("/lcd_state",    HTTP_GET,  handleLcdState);

  // [NOVO] Endpoints para teste de enchimento de câmaras
  webServer.on("/fill_a",       HTTP_POST, handleFillA);
  webServer.on("/fill_b",       HTTP_POST, handleFillB);
  webServer.on("/fill_c",       HTTP_POST, handleFillC);
  webServer.on("/flush_all",    HTTP_POST, handleFlushAll);

  Serial.println("[WEB] Registrando endpoints KH e testes");
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

  // [FIX] Coletar dados dos sensores e adicionar ao health
  int lvlA = sensorManager.getLevelA();
  int lvlB = sensorManager.getLevelB();
  int lvlC = sensorManager.getLevelC();
  float temp = sensorManager.getTemperature();  // Ler temperatura ativa
  float ph = sensorManager.getPH();             // Ler pH ativo

  h.level_a     = lvlA;
  h.level_b     = lvlB;
  h.level_c     = lvlC;
  h.temperature = temp;
  h.ph          = ph;

  Serial.printf("[Health] Sensores: LevelA=%d LevelB=%d LevelC=%d Temp=%.1f pH=%.2f\n",
                lvlA, lvlB, lvlC, temp, ph);

  if (!cloudAuth.sendHealthMetrics(h)) {
    Serial.println("[Health] Falha ao enviar métricas via CloudAuth.");
    debugLog.log("ERROR", "Health send FAILED! WiFi=%d%%, Heap=%d",
                 wifiPercent, ESP.getFreeHeap());
  } else {
    Serial.println("[Health] Métricas enviadas com sucesso.");
    debugLog.log("DEBUG", "Health OK: Heap=%.1f%%, WiFi=%d%%, RSSI=%d",
                 heapPercent, wifiPercent, rssi);
  }

  // [NOVO] Sincronizar logs com servidor após health
  debugLog.syncToServer();
}

void sendFirmwareVersionToCloud() {
  if (WiFi.status() != WL_CONNECTED || deviceToken.length() == 0) return;

  WiFiClient client;
  HTTPClient http;
  String url = String(CLOUD_BASE_URL) + "/device/firmware";

  Serial.printf("[FW] Reportando versao %s para %s\n", FW_VERSION, url.c_str());

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  StaticJsonDocument<128> doc;
  doc["firmwareVersion"] = FW_VERSION;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  Serial.printf("[FW] POST /device/firmware code=%d\n", code);
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
  
  /*if (lastMeas.is_valid) {
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
  }*/
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
  debugLog.log("INFO", "CMD received: action=%s, id=%s",
               cmd.action.c_str(), cmd.command_id.c_str());

  bool ok = true;
  String errorMsg = "";

  if (cmd.action == "restart") {
    debugLog.log("WARN", "CMD restart - device restarting NOW!");
    debugLog.saveToSPIFFS();
    delay(500);
    ESP.restart();

  } else if (cmd.action == "factoryreset") {
    factoryReset();

  } else if (cmd.action == "resetkh") {
    resetKHReference();

  } else if (cmd.action == "ota_update") {
    Serial.println("[CMD] ota_update recebido, iniciando OTA...");
    debugLog.log("WARN", "OTA update START");
    debugLog.saveToSPIFFS();  // Save before OTA attempt
    otaSetCommandId(cmd.command_id.toInt());  // habilita reporte de progresso
    ok = otaUpdateKh();
    if (!ok) {
      errorMsg = "OTA failed";
      debugLog.log("ERROR", "OTA update FAILED");
    } else {
      debugLog.log("INFO", "OTA update SUCCESS - device will restart");
      debugLog.saveToSPIFFS();
    }

  } else if (cmd.action == "testnow") {
    Serial.println("[CMD] testnow recebido -> executando apenas performMeasurement() (sem IA).");

    // 1) Verifica se KH de referência existe
    if (!khAnalyzer.isReferenceKHConfigured()) {
      ok = false;
      errorMsg = "KH de referência não configurado. Faça a calibração em Configurações > Calibração de KH.";
    } else {
      // 2) Inicia o ciclo não-bloqueante de medição
      performMeasurement();
      systemState = MEASURING;
      ok = true;
    }
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
  }else if (cmd.action == "otaupdate") {
    Serial.println("[CMD] OTA KH iniciado via Telegram!");
    bool ok = otaUpdateKh();
    if (ok) {
      Serial.println("[CMD] OTA confirmado - reboot!");
    } else {
      errorMsg = "OTA falhou (WiFi/bin/server)";
    }
  }
  else if (cmd.action == "setkhtarget") {
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
          debugLog.log("INFO", "Interval changed: %d minutes (%lu hours)",
                       minutes, minutes / 60);
          saveConfigToSPIFFS();  // [NOVO] Salvar no SPIFFS para persistir após reboot
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
    // testMode removido - ignorar comando
    ok = true;

  } else if (cmd.action == "abort") {
    // Para qualquer ciclo em andamento e volta para IDLE
    khAnalyzer.stopMeasurement();
    forceImmediateMeasurement = false;
    khCalibRunning    = false;
    khAnalyzerRunning = false;
    khDrainRunning    = false;
    systemFlushRunning = false;
    pumpControl.pumpA_stop();
    pumpControl.pumpB_stop();
    pumpControl.pumpC_stop();
    pumpControl.pumpD_stop();
    systemState = IDLE;
    ok = true;

  } else if (cmd.action == "kh_drain") {
    // Descarrega câmaras A+B+C → aquário (30 s simultâneo)
    khAnalyzer.stopMeasurement();
    khCalibRunning    = false;
    khAnalyzerRunning = false;
    pumpControl.pumpD_stop();
    pumpControl.pumpC_discharge();  // C → B
    pumpControl.pumpB_discharge();  // B → A
    pumpControl.pumpA_discharge();  // A → aquário
    khDrainRunning = true;
    khDrainStartMs = millis();
    systemState = IDLE;
    ok = true;

  } else if (cmd.action == "fillchamber") {
    // Enchimento individual de câmaras (modo manutenção)
    String chamber = cmd.params["chamber"];
    Serial.printf("[CMD] fillchamber: requisitando enchimento de câmara %s\n", chamber.c_str());

    // [PRIORIDADE] Rejeita imediatamente se calibração ou teste KH estiver rodando
    if (khCalibRunning || khAnalyzerRunning) {
      errorMsg = "Calibração ou teste de KH em andamento. Comando descartado.";
      ok = false;
      Serial.println("[CMD] fillchamber REJEITADO: calibração/teste em andamento");
    } else if (fillTestRunning) {
      errorMsg = "Teste de enchimento já em andamento";
      ok = false;
    } else {
      // Para outros processos secundários antes de iniciar teste
      khDrainRunning = false;
      systemFlushRunning = false;
      pumpControl.stopAll();

      // Iniciar teste de enchimento
      fillTestRunning = true;
      fillTestStartMs = millis();
      fillTestDurationMs = 10000;  // 10s padrão
      fillTestChamber = chamber.charAt(0);  // 'A', 'B' ou 'C'

      if (chamber == "A") {
        pumpControl.pumpA_fill();  // aquário → A
      } else if (chamber == "B") {
        pumpControl.pumpB_fill();  // A → B
      } else if (chamber == "C") {
        pumpControl.pumpC_fill();  // B → C
      } else {
        errorMsg = "Câmara inválida (deve ser A, B ou C)";
        fillTestRunning = false;
        ok = false;
      }

      if (ok) {
        Serial.printf("[CMD] Enchimento câmara %s iniciado (10s). AVISO: Recalibração necessária.\n", chamber.c_str());
      }
    }

  } else if (cmd.action == "system_flush") {
    // Flush inteligente: usa tempo calibrado + 30% ou 5 min fixo
    Serial.println("[CMD] system_flush: requisitando flush inteligente");

    // [PRIORIDADE] Rejeita imediatamente se calibração ou teste KH estiver rodando
    if (khCalibRunning || khAnalyzerRunning) {
      errorMsg = "Calibração ou teste de KH em andamento. Comando descartado.";
      ok = false;
      Serial.println("[CMD] system_flush REJEITADO: calibração/teste em andamento");
    } else {
      // Para processos secundários
      khDrainRunning = false;
      pumpControl.stopAll();

      // Carrega calibração para calcular tempo inteligente
      if (SPIFFS.begin(true) && SPIFFS.exists("/kh_calib.json")) {
        File f = SPIFFS.open("/kh_calib.json", "r");
        if (f) {
          DynamicJsonDocument doc(768);
          DeserializationError error = deserializeJson(doc, f);
          f.close();

          if (!error) {
            unsigned long t_a = doc["time_fill_a_ms"] | 0;
            unsigned long t_b = doc["time_fill_b_ms"] | 0;
            unsigned long t_c = doc["time_fill_c_ms"] | 0;

            if (t_a > 0 && t_b > 0 && t_c > 0) {
              systemFlushDurationMs = (t_a + t_b + t_c) * 1.3;
              Serial.printf("[CMD] Flush inteligente: %.1f s (baseado em calibracao)\n",
                            systemFlushDurationMs / 1000.0f);
            } else {
              systemFlushDurationMs = 300000UL; // 5 min fixo
              Serial.println("[CMD] Flush fixo: 5 min (sem calibracao previa)");
            }
          }
        }
      } else {
        systemFlushDurationMs = 300000UL; // 5 min fixo
        Serial.println("[CMD] Flush fixo: 5 min (sem calibracao previa)");
      }

      // Inicia flush
      pumpControl.pumpC_discharge();  // C → B
      pumpControl.pumpB_discharge();  // B → A
      pumpControl.pumpA_discharge();  // A → aquário
      systemFlushRunning = true;
      systemFlushStartMs = millis();
      systemState = IDLE;
      ok = true;
      Serial.println("[CMD] Flush iniciado. AVISO: Recalibração necessária.");
    }

  } else if (cmd.action == "khcalibrate") {
      float khRefUser  = cmd.params["kh_ref_user"]  | 8.0f;
      bool assumeEmpty = cmd.params["assume_empty"] | false;

      Serial.printf("[CMD] khcalibrate: kh_ref=%.2f assumeEmpty=%d\n", khRefUser, assumeEmpty);

      khCalibrator.start(khRefUser, assumeEmpty);
      khCalibRunning    = true;
      khCalibLastStepMs = millis();
      // Envia progresso imediatamente ao iniciar
      khProgressLastSentMs = millis();
      sendCalibProgress();
      ok = true;
  }


  String statusStr = ok ? "done" : "error";
  cloudAuth.confirmCommandExecution(cmd.command_id, statusStr, errorMsg);

  // [LOG] Log command completion
  if (ok) {
    debugLog.log("DEBUG", "CMD %s completed OK", cmd.action.c_str());
  } else {
    debugLog.log("ERROR", "CMD %s FAILED: %s", cmd.action.c_str(), errorMsg.c_str());
  }
}

bool shouldMeasure() {
  return (millis() - lastMeasurementTime) >= measurementInterval;
}
// Envia status de progresso do ciclo KH para o backend (armazenado em memória no servidor)
// Chamado a cada KH_PROGRESS_SEND_INTERVAL_MS enquanto khCalibRunning ou khAnalyzerRunning
void sendKhProgressToCloud(bool active, const String& type,
                           const String& msg, int pct,
                           int compS,
                           int lvlA, int lvlB, int lvlC,
                           float ph, float temp) {
  // [DEBUG] Log de tentativa de envio
  static unsigned long send_count = 0;
  send_count++;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[KH_Progress] #%lu FALHOU: WiFi desconectado\n", send_count);
    return;
  }

  if (deviceToken.length() == 0) {
    Serial.printf("[KH_Progress] #%lu FALHOU: deviceToken vazio\n", send_count);
    return;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(CLOUD_BASE_URL) + "/device/kh-status";

  Serial.printf("[KH_Progress] #%lu Enviando: active=%d type=%s pct=%d msg='%s'\n",
                send_count, active, type.c_str(), pct, msg.c_str());

  if (!http.begin(client, url)) return;
  http.setTimeout(3000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  StaticJsonDocument<320> doc;
  doc["active"]                = active;
  doc["type"]                  = type;
  doc["msg"]                   = msg;
  doc["pct"]                   = pct;
  doc["compressor_remaining_s"]= compS;
  doc["level_a"]               = lvlA;
  doc["level_b"]               = lvlB;
  doc["level_c"]               = lvlC;
  doc["ph"]                    = serialized(String(ph, 2));
  doc["temperature"]           = serialized(String(temp, 1));

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  http.end();

  if (httpCode > 0) {
    Serial.printf("[KH_Progress] #%lu OK: HTTP %d\n", send_count, httpCode);
  } else {
    Serial.printf("[KH_Progress] #%lu FALHOU: HTTP erro %d (%s)\n",
                  send_count, httpCode, http.errorToString(httpCode).c_str());
  }
}

// Chama sendKhProgressToCloud com dados atuais do calibrador
void sendCalibProgress() {
  sendKhProgressToCloud(
    true,
    "calibration",
    khCalibrator.getProgressMessage(),
    khCalibrator.getProgressPercent(),
    (int)(khCalibrator.getCompressorRemainingMs() / 1000UL),
    sensorManager.getLevelA(), sensorManager.getLevelB(), sensorManager.getLevelC(),
    sensorManager.getPH(), sensorManager.getTemperature()
  );
}

// Chama sendKhProgressToCloud com dados atuais do analyzer
void sendMeasureProgress() {
  sendKhProgressToCloud(
    true,
    "measurement",
    khAnalyzer.getProgressMessage(),
    khAnalyzer.getProgressPercent(),
    (int)(khAnalyzer.getCompressorRemainingMs() / 1000UL),
    sensorManager.getLevelA(), sensorManager.getLevelB(), sensorManager.getLevelC(),
    sensorManager.getPH(), sensorManager.getTemperature()
  );
}

// Notifica o backend que o ciclo terminou (active=false)
void sendKhProgressDone(const String& type, const String& finalMsg) {
  sendKhProgressToCloud(false, type, finalMsg, 100, 0,
    sensorManager.getLevelA(), sensorManager.getLevelB(), sensorManager.getLevelC(),
    sensorManager.getPH(), sensorManager.getTemperature());
}

// Processa e salva o resultado após o ciclo KH completar (chamado pela seção 10 do loop)
void handleMeasurementResult() {
  KH_Analyzer::MeasurementResult result = khAnalyzer.getMeasurementResult();
  Serial.printf("[DEBUG] result.is_valid=%d kh=%.2f ph_ref=%.2f ph_sample=%.2f temp=%.1f\n",
                result.is_valid, result.kh_value,
                result.ph_reference, result.ph_sample, result.temperature);

  Serial.printf("[Main] Medição concluída: KH=%.2f dKH\n", result.kh_value);
  debugLog.log("INFO", "Measurement COMPLETE: KH=%.2f, pH_ref=%.2f, pH_sample=%.2f, temp=%.1f",
               result.kh_value, result.ph_reference, result.ph_sample, result.temperature);

  MeasurementHistory::Measurement mh;
  mh.kh          = result.kh_value;
  mh.ph_ref      = result.ph_reference;
  mh.ph_sample   = result.ph_sample;
  mh.temperature = result.temperature;

  unsigned long long ts = getCurrentEpochMs();
  if (ts == 0) {
    Serial.println("[Main] NTP falhou, usando millis()");
    ts = millis() / 1000ULL;
  }
  mh.timestamp = ts;
  mh.is_valid  = true;
  history.addMeasurement(mh);

  Measurement mc;
  mc.timestamp    = mh.timestamp;
  mc.startedAt    = currentCycleStartMs;
  mc.kh           = mh.kh;
  mc.ph_reference = mh.ph_ref;
  mc.ph_sample    = mh.ph_sample;
  mc.temperature  = mh.temperature;
  mc.is_valid     = mh.is_valid;
  mc.confidence   = 0.9f;

  if (isScheduledTestRunning) {
    lastScheduledTestResult = mc;
    Serial.println("[TestSchedule] Resultado da medição agendada salvo");
  }

  if (deviceToken.length() > 0) {
    cloudAuth.queueMeasurement(mc);
    debugLog.log("DEBUG", "Measurement queued for sync, queue size=%d",
                 cloudAuth.getQueueSize());
  } else {
    debugLog.log("WARN", "Measurement not synced - no token");
  }
}

// Inicia o ciclo de medição de KH (não-bloqueante)
// A FSM é avançada pela seção 10 do loop(); o resultado é processado em handleMeasurementResult()
void performMeasurement() {
  Serial.println("[Main] Iniciando ciclo de medição...");
  debugLog.log("INFO", "Measurement cycle START");

  currentCycleStartMs = getCurrentEpochMs();
  if (currentCycleStartMs == 0) {
    currentCycleStartMs = millis();
  }

  if (khAnalyzer.startMeasurementCycle()) {
    khAnalyzerRunning    = true;
    khAnalyzerLastStepMs = millis();
  } else {
    Serial.println("[Main] ERRO: Falha ao iniciar ciclo de medição");
    debugLog.log("ERROR", "Measurement cycle FAILED to start!");
    if (khAnalyzer.hasError()) {
      String errMsg = khAnalyzer.getErrorMessage();
      Serial.println("[Main] " + errMsg);
      debugLog.log("ERROR", "KH Analyzer error: %s", errMsg.c_str());
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

// =================================================================================
// Persistência de intervalHours (SPIFFS)
// =================================================================================

void saveConfigToSPIFFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println("[Config] Erro ao montar SPIFFS para salvar config");
    return;
  }

  File f = SPIFFS.open("/kh_config.json", FILE_WRITE);
  if (!f) {
    Serial.println("[Config] Erro ao abrir /kh_config.json para escrita");
    return;
  }

  DynamicJsonDocument doc(128);
  doc["intervalHours"] = measurementInterval / (60UL * 60UL * 1000UL);

  if (serializeJson(doc, f) == 0) {
    Serial.println("[Config] Erro ao serializar config JSON");
  } else {
    Serial.printf("[Config] Config salva: intervalHours=%lu\n",
                  measurementInterval / (60UL * 60UL * 1000UL));
  }
  f.close();
}

void loadConfigFromSPIFFS() {
  if (!SPIFFS.begin(true)) {
    Serial.println("[Config] Erro ao montar SPIFFS para ler config");
    return;
  }

  if (!SPIFFS.exists("/kh_config.json")) {
    Serial.println("[Config] Arquivo /kh_config.json não existe, usando defaults");
    return;
  }

  File f = SPIFFS.open("/kh_config.json", FILE_READ);
  if (!f) {
    Serial.println("[Config] Erro ao abrir /kh_config.json para leitura");
    return;
  }

  DynamicJsonDocument doc(128);
  DeserializationError err = deserializeJson(doc, f);
  f.close();

  if (err) {
    Serial.printf("[Config] Erro JSON config: %s\n", err.c_str());
    return;
  }

  unsigned long hours = doc["intervalHours"] | 1;
  measurementInterval = hours * 60UL * 60UL * 1000UL;

  Serial.printf("[Config] Config carregada do SPIFFS: intervalHours=%lu\n", hours);
  debugLog.log("INFO", "Config loaded from SPIFFS: interval=%lu h", hours);
}

// Busca config do backend (intervalHours)
bool fetchConfigFromBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Config] WiFi não conectado, não pode buscar config do backend");
    debugLog.log("WARN", "Config fetch skipped - no WiFi");
    return false;
  }

  if (deviceToken.length() == 0) {
    Serial.println("[Config] Sem deviceToken, não pode buscar config");
    debugLog.log("WARN", "Config fetch skipped - no token");
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String("http://iot.reefbluesky.com.br/api/v1/user/devices/") +
               deviceId + "/kh-config";

  Serial.printf("[Config] Buscando config do backend: %s\n", url.c_str());
  debugLog.log("INFO", "Fetching config from backend");

  if (!http.begin(client, url)) {
    Serial.println("[Config] http.begin falhou");
    debugLog.log("ERROR", "Config fetch: http.begin FAILED");
    return false;
  }

  http.addHeader("Authorization", "Bearer " + deviceToken);
  int code = http.GET();

  if (code != 200) {
    Serial.printf("[Config] GET config falhou com código %d\n", code);
    debugLog.log("ERROR", "Config fetch FAILED: HTTP %d", code);
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(2048);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[Config] Erro ao parsear JSON: %s\n", err.c_str());
    return false;
  }

  if (!doc["success"].as<bool>()) {
    Serial.println("[Config] Backend retornou success=false");
    return false;
  }

  JsonObject data = doc["data"];
  if (data.isNull()) {
    Serial.println("[Config] Backend sem campo 'data'");
    return false;
  }

  // Salvar no SPIFFS para próximo boot
  saveConfigToSPIFFS();

  Serial.println("[Config] ✓ Config do backend carregada e salva no SPIFFS");
  debugLog.log("INFO", "Config loaded from backend");
  return true;
}

// Busca intervalHours do endpoint /status
bool fetchIntervalFromBackendStatus() {
  if (WiFi.status() != WL_CONNECTED || deviceToken.length() == 0) {
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String("http://iot.reefbluesky.com.br/api/v1/user/devices/") +
               deviceId + "/status";

  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", "Bearer " + deviceToken);
  int code = http.GET();

  if (code != 200) {
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  DynamicJsonDocument doc(1024);
  if (deserializeJson(doc, payload)) return false;
  if (!doc["success"].as<bool>()) return false;

  JsonObject data = doc["data"];
  if (data.containsKey("intervalHours")) {
    unsigned long hours = data["intervalHours"].as<unsigned long>();
    if (hours > 0 && hours <= 24) {
      measurementInterval = hours * 60UL * 60UL * 1000UL;
      Serial.printf("[Config] intervalHours do backend: %lu\n", hours);
      saveConfigToSPIFFS();  // Salvar no SPIFFS
      return true;
    }
  }

  return false;
}

int rssiToPercent(int rssi) {
  if (rssi >= -50) return 100;
  if (rssi <= -100) return 0;
  return 2 * (rssi + 100);
}
