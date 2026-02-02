// FwVersion.cpp
#include "FwVersion.h"
#include <WiFi.h>
#include <HTTPClient.h>

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

  // [FIX] Validar token antes de enviar
  if (deviceToken.length() == 0) {
    Serial.println("[FW] ERRO: Token vazio, não reportando");
    return;
  }

  String url = apiBase + "/device/firmware";  // [FIX] URL correta com /api/v1
  HTTPClient http;

  Serial.print("[FW] Reportando versão para: ");
  Serial.println(url);
  Serial.printf("[FW] Token length: %d chars\n", deviceToken.length());

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);
  Serial.println("[FW] Headers adicionados");

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
