#include <Arduino.h>

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
const int  LED_STATUS = DOSER_LED_STATUS;

// ============================================================================
// OBJETOS GLOBAIS
// ============================================================================

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
  digitalWrite(LED_STATUS, HIGH);

  // 4. NTP Time sync
  setupTimeNTP();

  // 5. Cloud Authentication
  setupCloud();

  // 6. DoserControl init
  doser = new DoserControl();
  doser->initPins(PUMP_PINS);
  doser->onExecution([](uint32_t pumpId, uint16_t volumeMl, uint32_t scheduleId, uint32_t whenEpoch, const char* status) {
    handleExecution(pumpId, volumeMl, scheduleId, whenEpoch, status);
  });

  // 7. Handshake inicial e carregar config
  DynamicJsonDocument configDoc(8192);
  if (cloudAuth && cloudAuth->fetchDoserConfig(configDoc)) {
    doser->loadFromServer(configDoc);
    Serial.println("[SETUP] ✓ Dosadora pronta!");
  } else {
    Serial.println("[SETUP] Falha no handshake inicial, tentando no loop");
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
    digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));  // Pisca LED
    delay(100);
    return;
  }
  
  // 4) Botão de configuração
  handleConfigButton();

  // 5) Cloud
  if (cloudAuth) {
    if (cloudAuth->isAuthenticated()) {
      cloudAuth->ensureTokenFresh();

      // Status periódico (30s)
      if (now - lastStatus > 30000) {
        DynamicJsonDocument statusDoc(512);
        doser->buildPumpsStatusJson(statusDoc);
        cloudAuth->sendDoserStatus(now / 1000, WiFi.RSSI(), statusDoc);
        lastStatus = now;
      }

      // Handshake periódico (5min)
      if (now - lastHandshake > 300000) {
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
  }

  // 6) DoserControl loop
  if (doser) {
    time_t nowSec = time(nullptr);
    doser->loop(nowSec);
  }

  // 7) LED status
  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_STATUS, HIGH);
  } else {
    digitalWrite(LED_STATUS, LOW);
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
  pinMode(LED_STATUS, OUTPUT);
  pinMode(BTN_CONFIG, INPUT_PULLUP);
  digitalWrite(LED_STATUS, LOW);
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

void setupTimeNTP() {
  const long gmtOffset_sec      = -3 * 3600;  // UTC-3 (Brasil)
  const int  daylightOffset_sec = 0;          // sem horário de verão

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
    Serial.printf("[NTP] ✓ Time synced: %s\n", ctime(&now));
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
  Serial.println("[CLOUD] ✓ Authenticated");
}

void handleExecution(uint32_t pumpId, uint16_t volumeMl, uint32_t scheduleId, uint32_t whenEpoch, const char* status) {
  Serial.printf("[EXEC] Pump %lu Volume %u Status %s\n", pumpId, volumeMl, status);

  if (cloudAuth && cloudAuth->isAuthenticated()) {
    cloudAuth->reportDosingExecution(pumpId, volumeMl, scheduleId, whenEpoch, status, "AUTO");
  }
}
