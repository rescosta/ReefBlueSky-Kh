//ReefBlueSky_Dosing.ino

#include <Arduino.h>
#include "FwVersion.h"
#include "OtaUpdate.h"

const char* FW_DEVICE_TYPE = "DOSER";
const char* FW_VERSION     = "RBS_DOSER_260130.bin";

#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <LittleFS.h>
  #define SPIFFS LittleFS
#else
  #include <WiFi.h>
  #include <SPIFFS.h>
#endif

#include <ArduinoJson.h>
#include <time.h>



// Módulos da dosadora
#include "WiFiSetupDoser.h"
#include "CloudAuthDoser.h"
#include "DoserControl.h"

// ============================================================================
// CONFIGURAÇÃO DE HARDWARE
// ============================================================================

#include "HardwarePinsDoser.h"

const int* PUMP_PINS = DOSER_PUMP_PINS;
const int  BTN_CONFIG = DOSER_BTN_CONFIG;


// ============================================================================
// OBJETOS GLOBAIS
// ============================================================================
String deviceToken;
String espUid;
WiFiSetupDoser* wifiSetup = nullptr;
CloudAuthDoser* cloudAuth = nullptr;
DoserControl* doser = nullptr;

uint32_t lastConfigButton = 0;
bool configButtonPressed = false;

uint32_t lastStatus = 0;
uint32_t lastHandshake = 0;

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1500);

  #ifdef ESP8266
    if (!SPIFFS.begin()) {
      Serial.println("SPIFFS init failed");
    }
  #else
    if (!SPIFFS.begin(true)) {
      Serial.println("SPIFFS init failed");
    }
  #endif

  // APENAS PARA LIMPAR UMA VEZ
  //SPIFFS.remove("/doser_wifi_config.json");
  //SPIFFS.remove("/doser_auth.json");
  //SPIFFS.remove("/doser_config.json");
  //Serial.println("CONFIG WiFi/ AUTH / DOSER apagada!");


  Serial.println();
  Serial.println();
  Serial.println("ReefBlueSky Balling Dosing v1.0.0");
  Serial.println("ESP8266 / ESP32 Compatible");
  Serial.println();

  // 1. Gerar ESP UID
  generateEspUid();
  Serial.printf("[SETUP] ESP UID: %s\n", espUid.c_str());

  // 2. Inicializar hardware
  initHardware();

  // 3. WiFi Setup (onboarding)
  wifiSetup = new WiFiSetupDoser();
  if (!wifiSetup->begin()) {
    Serial.println("[SETUP] AP mode ativo. Configure em http://192.168.4.1");
    return;
  }

  Serial.println("[SETUP] WiFi conectado!");

  // 4. NTP Time sync
  setupTimeNTP();

  time_t dbgNow = time(nullptr);
  Serial.printf("[MAIN] After NTP, now=%lu\n", (unsigned long)dbgNow);


  // 5. Cloud Authentication
  setupCloud();

  // 6. DoserControl init
  doser = new DoserControl();
  doser->initPins(PUMP_PINS);
  doser->onExecution([](uint32_t pumpId, uint16_t volumeMl,
                        uint32_t scheduleId, uint32_t whenEpoch,
                        const char* status, const char* origin) {
    handleExecution(pumpId, volumeMl, scheduleId, whenEpoch, status, origin);
  });

  // 7. Handshake inicial: SEMPRE tentar config do servidor primeiro
  bool configLoaded = false;
  DynamicJsonDocument configDoc(8192);

  if (cloudAuth && cloudAuth->fetchDoserConfig(configDoc)) {
    Serial.println("[SETUP] Config do servidor recebida, carregando doser...");
    doser->loadFromServer(configDoc);
    configLoaded = true;
    Serial.println("[SETUP] ✓ Dosadora pronta com config do servidor!");
  } else {
    Serial.println("[SETUP] Falha no handshake inicial, tentando config local...");
  }

  // 7.1 Se handshake falhar, tenta config local (modo offline)
  if (!configLoaded && SPIFFS.exists("/doser_config.json")) {
    File f = SPIFFS.open("/doser_config.json", "r");
    if (f) {
      DynamicJsonDocument localDoc(8192);
      DeserializationError err = deserializeJson(localDoc, f);
      f.close();
      if (!err && localDoc.containsKey("pumps")) {
        Serial.println("[SETUP] Config local encontrada, carregando doser (offline)...");
        doser->loadFromServer(localDoc);
        configLoaded = true;
      } else {
        Serial.printf("[SETUP] Falha ao ler config local: %s\n", err.c_str());
      }
    } else {
      Serial.println("[SETUP] Erro ao abrir /doser_config.json");
    }
  }

  if (!configLoaded) {
    Serial.println("[SETUP] Nenhuma config válida (server nem local); aguardando próximo handshake...");
  }

}

void generateEspUid() {
  espUid = generateDoserId();
}
// ============================================================================
// MAIN LOOP
// ============================================================================
static bool lastWifiConnected = false;

void loop() {
  uint32_t now = millis();

  // Detecta auto-reconexão (stack) e fecha portal
  bool nowConnected = (WiFi.status() == WL_CONNECTED);
  if (nowConnected && !lastWifiConnected && wifiSetup) {
    Serial.println("[Main] WiFi reconectado (auto). Fechando portal se ainda ativo.");
    wifiSetup->closePortalIfActive();
  }
  lastWifiConnected = nowConnected;

  // Modo "portal / AP" (igual KH)
  if (!wifiSetup || !wifiSetup->isConfigured()) {
    if (wifiSetup) {
      wifiSetup->loopReconnect(); // mantém portal e DNS
    }
    delay(100);
    return;
  }

  // 4) Botão de configuração
  handleConfigButton();

  // 5) Cloud
  static uint32_t lastCmdCheck = 0;

  if (cloudAuth && cloudAuth->isAuthenticated()) {
    cloudAuth->ensureTokenFresh();

    // comandos a cada 1s
    if (doser && (now - lastCmdCheck > 1000)) {
      cloudAuth->processCommands(doser);
      lastCmdCheck = now;
    }

    // Status periódico (30s)
    if (now - lastStatus > 30000) {
      DynamicJsonDocument statusDoc(512);
      doser->buildPumpsStatusJson(statusDoc);
      cloudAuth->sendDoserStatus(now / 1000, WiFi.RSSI(), statusDoc);
      lastStatus = now;
    }

    // Handshake periódico (5min)
    if (now - lastHandshake > 60000) {
      DynamicJsonDocument configDoc(8192);
      if (cloudAuth->fetchDoserConfig(configDoc)) {
        doser->loadFromServer(configDoc);
      }
      lastHandshake = now;
    }
  } else {
    // Tentar autenticar se ainda não estiver
    if (WiFi.status() == WL_CONNECTED) {
      cloudAuth->init(
        wifiSetup->getServerUrl(),
        wifiSetup->getServerUsername(),
        wifiSetup->getServerPassword());
    }
  }

  // 6) DoserControl loop
  if (doser) {
    time_t nowUtc = time(nullptr);
    time_t nowUsr = nowUtc + g_userUtcOffsetSec;

    doser->loop(nowUsr);  // usa horário local do usuário
  }



  // Reconexão leve em STA, com portal normalmente fechado
  if (wifiSetup) {
    wifiSetup->loopReconnect();
  }

  yield();
  delay(50);
}



// ============================================================================
// HELPERS
// ============================================================================

String generateDoserId() {
#if defined(ESP8266)
  // ESP8266 não tem getEfuseMac(), usa getChipId() mesmo
  uint32_t chipId = ESP.getChipId();
  char buffer[20];
  sprintf(buffer, "RBS-DOSER-%08X", chipId);
  return String(buffer);
#else
  // ESP32: igual ao KH, mas com prefixo DOSER
  uint64_t chipid = ESP.getEfuseMac();  // ID único do chip [web:259]
  uint16_t chipHigh = (uint16_t)(chipid >> 32);
  uint32_t chipLow  = (uint32_t)chipid;

  char buffer[24]; // maior pra caber prefixo + 4 + 8 + '\0'
  sprintf(buffer, "RBS-DOSER-%04X%08X", chipHigh, chipLow);
  return String(buffer);
#endif
}


void initHardware() {
  pinMode(BTN_CONFIG, INPUT_PULLUP);
  Serial.println("[HW] GPIO initialized");
}

void handleConfigButton() {
  bool btnState = digitalRead(BTN_CONFIG) == LOW;

  if (btnState && !configButtonPressed) {
    configButtonPressed = true;
    lastConfigButton = millis();
    Serial.println("[BTN] Button pressed");
  }

  if (!btnState && configButtonPressed) {
    uint32_t duration = millis() - lastConfigButton;

    if (duration > 3000) {
      Serial.println("[BTN] Long press (3s) - Resetting WiFi config");
      SPIFFS.remove("/doser_wifi_config.json");
      SPIFFS.remove("/doser_auth.json");
      delay(500);
      ESP.restart();
    }

    configButtonPressed = false;
  }
}

/*
void setupTimeNTP() {
  const long gmtOffset_sec      = 0;  // UTC
  const int  daylightOffset_sec = 0;

  configTime(gmtOffset_sec, daylightOffset_sec, "time.google.com");
  Serial.println("[NTP] Syncing time...");

  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 24 * 3600 && attempts < 20) {
    delay(500);
    now = time(nullptr);
    attempts++;
    Serial.print(".");
  }
  Serial.println();

  if (now > 24 * 3600) {
    Serial.printf("[NTP] ✓ Time synced (UTC): %s\n", ctime(&now));
  } else {
    Serial.println("[NTP] Time sync failed, continuing anyway");
  }
}
*/
void setupTimeNTP() {
  const long gmtOffset_sec      = 0;  // UTC
  const int  daylightOffset_sec = 0;

  configTime(gmtOffset_sec, daylightOffset_sec, "time.google.com");
  Serial.println("[NTP] Syncing time...");

  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 24 * 3600 && attempts < 20) {
    delay(500);
    now = time(nullptr);
    attempts++;
    Serial.print(".");
  }
  Serial.println();

  if (now > 24 * 3600) {
    Serial.printf("[NTP] ✓ Time synced (UTC): %s\n", ctime(&now));
  } else {
    Serial.println("[NTP] Time sync failed, continuing anyway");
  }
}



void setupCloud() {
  cloudAuth = new CloudAuthDoser();
  if (!cloudAuth->init(
        wifiSetup->getServerUrl(),
        wifiSetup->getServerUsername(),
        wifiSetup->getServerPassword())) {
    Serial.println("[CLOUD] Initial authentication failed");
    Serial.println("[CLOUD] Will retry in loop...");
    return;
  }
  deviceToken = cloudAuth->getAccessToken();

  Serial.println("[CLOUD] ✓ Authenticated");

  // Após autenticar, reporta versão de firmware da doser
  String apiBase = "http://iot.reefbluesky.com.br/api/v1";

  otaInit("http://iot.reefbluesky.com.br", nullptr, nullptr);

  reportFirmwareVersion(apiBase, cloudAuth->getAccessToken());
}


void handleExecution(uint32_t pumpId, uint16_t volumeMl,
                     uint32_t scheduleId, uint32_t whenEpoch,
                     const char* status, const char* origin) {
  Serial.printf("[EXEC] PumpId=%lu Volume=%u Sched=%lu When=%lu Status=%s Origin=%s\n",
                pumpId, volumeMl, scheduleId, whenEpoch, status, origin);

  if (cloudAuth && cloudAuth->isAuthenticated()) {
    uint32_t scheduledAt = 0;

    if (strcmp(origin, "AUTO") == 0) {
      scheduledAt = scheduleId;      // whenEpoch do job automático
    } else {
      scheduledAt = 0;               // MANUAL → sem agendamento
    }

    cloudAuth->reportDosingExecution(
      pumpId,
      volumeMl,
      scheduledAt,
      whenEpoch,
      status,
      origin
    );
  }
}



