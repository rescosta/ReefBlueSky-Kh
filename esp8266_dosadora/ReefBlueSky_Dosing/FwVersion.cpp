// FwVersion.cpp
#include "FwVersion.h"

#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClient.h>
#else
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WiFiClient.h>
#endif


const char* getFirmwareVersion() {
  return FW_VERSION;
}

const char* getFirmwareDeviceType() {
  return FW_DEVICE_TYPE;
}

void reportFirmwareVersion(const String& apiBase, const String& deviceToken) {
  if (!WiFi.isConnected()) {
    Serial.println("[FW] WiFi não conectado, não reportando versão.");
    return;
  }

  String url = apiBase + "/device/firmware";
  HTTPClient http;
  WiFiClient client;

  Serial.print("[FW] Reportando versão para: ");
  Serial.println(url);

  http.begin(client, url);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  String body = String("{\"firmwareVersion\":\"") + FW_VERSION + "\"}";
  int code = http.POST(body);

  Serial.printf("[FW] POST /device/firmware code=%d\n", code);
  if (code > 0) {
    String resp = http.getString();
    Serial.println("[FW] resp: " + resp);
  } else {
    Serial.printf("[FW] erro HTTP: %s\n", http.errorToString(code).c_str());
  }

  http.end();
}
