//CloudAuthDoser.h

#ifndef CLOUDAUTH_DOSER_H
#define CLOUDAUTH_DOSER_H
#include "DoserControl.h"

#include <Arduino.h>
#ifdef ESP8266
  #include <ESP8266WiFi.h>
#else

  #include <SPIFFS.h>
#endif

#include <ArduinoJson.h>
#include <time.h>

extern int32_t g_userUtcOffsetSec;

// Variável global do ESP UID (definida no .ino)
extern String espUid;

// [FIX] Classe para exponential backoff em caso de falhas
class ExponentialBackoff {
private:
  int failureCount = 0;
  unsigned long nextRetryTime = 0;
  unsigned long baseDelayMs = 2000;      // 2 segundos inicial
  unsigned long maxDelayMs = 300000;     // 5 minutos máximo

public:
  bool shouldRetry() {
    if (failureCount == 0) return true;
    return millis() >= nextRetryTime;
  }

  void recordFailure() {
    failureCount++;
    unsigned long delayMs = baseDelayMs * (1 << min(failureCount - 1, 7)); // 2^n com limite
    if (delayMs > maxDelayMs) delayMs = maxDelayMs;
    nextRetryTime = millis() + delayMs;
    Serial.printf("[Backoff] Falha #%d, próxima tentativa em %lu ms\n", failureCount, delayMs);
  }

  void recordSuccess() {
    if (failureCount > 0) {
      Serial.println("[Backoff] Sucesso, resetando contador");
      reset();
    }
  }

  void reset() {
    failureCount = 0;
    nextRetryTime = 0;
  }
};

class CloudAuthDoser {
private:
  String serverUrl;
  String username;
  String userPassword;

  String accessToken;
  String refreshToken;
  uint32_t tokenExpiresAt = 0;

  static constexpr uint32_t TOKENREFRESHBEFORES = 300;
  static constexpr uint32_t HTTP_TIMEOUT_MS = 10000;  // [FIX] 10 segundos timeout

  ExponentialBackoff backoff;  // [FIX] Controle de backoff

  bool fetchCommands(JsonDocument& outDoc);
  void handleCommand(JsonObject cmd, DoserControl* doser);

  bool performRegistration();
  bool refreshAccessToken();
  void saveCredentials();
  bool loadCredentials();

public:

  bool init(const String& sUrl, const String& uname, const String& upass);
  bool isAuthenticated() const { return accessToken.length() > 0; }

  // Novo: expõe o token para outros módulos (FwVersion, OTA, etc.)
  const String& getAccessToken() const { return accessToken; }

  void processCommands(DoserControl* doser);

  bool ensureTokenFresh();
  bool fetchDoserConfig(JsonDocument& outConfig);
  bool sendDoserStatus(uint32_t uptime, int8_t rssi, const JsonDocument& pumpsStatus);
  bool reportDosingExecution(uint32_t pumpId, uint16_t volumeMl, uint32_t scheduledAt, uint32_t executedAt, const char* status, const char* origin);

  String getAuthHeader() const;

  // [FIX] Expõe backoff para uso externo se necessário
  ExponentialBackoff& getBackoff() { return backoff; }

};

#endif
