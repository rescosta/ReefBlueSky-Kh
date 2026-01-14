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

// Variável global do ESP UID (definida no .ino)
extern String espUid;

class CloudAuthDoser {
private:
  String serverUrl;
  String username;
  String userPassword;

  String accessToken;
  String refreshToken;
  uint32_t tokenExpiresAt = 0;

  static constexpr uint32_t TOKENREFRESHBEFORES = 300;

  bool fetchCommands(JsonDocument& outDoc);
  void handleCommand(JsonObject cmd, DoserControl* doser);

  bool performRegistration();
  bool performLogin();
  bool refreshAccessToken();
  void saveCredentials();
  bool loadCredentials();

public:
  bool init(const String& sUrl, const String& uname, const String& upass);
  bool isAuthenticated() const { return accessToken.length() > 0; }
  void processCommands(DoserControl* doser);

  bool ensureTokenFresh();
  bool fetchDoserConfig(JsonDocument& outConfig);
  bool sendDoserStatus(uint32_t uptime, int8_t rssi, const JsonDocument& pumpsStatus);
  bool reportDosingExecution(uint32_t pumpId, uint16_t volumeMl, uint32_t scheduledAt, uint32_t executedAt, const char* status, const char* origin);

  String getAuthHeader() const;
};

#endif
