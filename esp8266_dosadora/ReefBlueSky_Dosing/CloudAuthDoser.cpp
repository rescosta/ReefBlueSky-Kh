#include "CloudAuthDoser.h"

#ifdef ESP8266
  #include <ESP8266HTTPClient.h>
  #include <WiFiClient.h>
  static constexpr const char* HW_TYPE = "ESP8266";
#else
  #include <HTTPClient.h>
  #include <WiFiClient.h>
  #include <WiFi.h>
  static constexpr const char* HW_TYPE = "ESP32";
#endif

#ifndef DOSER_FW_VERSION
  #define DOSER_FW_VERSION "0.0.0"
#endif

bool CloudAuthDoser::init(const String& sUrl, const String& uname, const String& upass) {
  serverUrl = sUrl;
  username = uname;
  userPassword = upass;

  // Tentar carregar credenciais do SPIFFS
  if (loadCredentials()) {
    Serial.println("[CloudAuth] Credenciais carregadas do SPIFFS");
    return true;
  }

  // Registrar novo device
  Serial.println("[CloudAuth] Registrando novo device...");
  return performRegistration();
}

bool CloudAuthDoser::performRegistration() {
  if (!WiFi.isConnected()) {
    Serial.println("[CloudAuth] WiFi não conectado para registration");
    return false;
  }

  HTTPClient http;
  String url = serverUrl + "/device/register";

  DynamicJsonDocument payload(512);
  payload["deviceId"] = espUid;
  payload["type"] = "DOSER";
  payload["username"] = username;
  payload["password"] = userPassword;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client;
  http.begin(client, url);                   
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  if (httpCode != 200 && httpCode != 201) {
    Serial.printf("[CloudAuth] Registration failed: %d\n%s\n", httpCode, response.c_str());
    return false;
  }

  // Parse response
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, response);

  if (!doc.containsKey("data")) {
    Serial.println("[CloudAuth] Resposta sem campo data");
    return false;
  }

  JsonObject data = doc["data"];

  if (!data.containsKey("token")) {
    Serial.println("[CloudAuth] No token in response");
    return false;
  }

  accessToken   = data["token"].as<String>();
  refreshToken  = data.containsKey("refreshToken") ? data["refreshToken"].as<String>() : "";
  tokenExpiresAt = data.containsKey("expiresIn")
                    ? millis() + (data["expiresIn"].as<uint32_t>() * 1000)
                    : 0;

  saveCredentials();
  Serial.printf("[CloudAuth] ✓ Registered: %s\n", espUid.c_str());
  return true;

}

bool CloudAuthDoser::performLogin() {
  HTTPClient http;
  String url = serverUrl + "/auth/login";

  DynamicJsonDocument payload(256);
  payload["username"] = username;
  payload["password"] = userPassword;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  
  WiFiClient client; 
  http.begin(client, url);   
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  if (httpCode != 200) {
    Serial.printf("[CloudAuth] Login failed: %d\n", httpCode);
    return false;
  }

  DynamicJsonDocument doc(1024);
  deserializeJson(doc, response);

  accessToken = doc["accessToken"].as<String>();
  refreshToken = doc.containsKey("refreshToken") ? doc["refreshToken"].as<String>() : "";

  saveCredentials();
  return true;
}

bool CloudAuthDoser::refreshAccessToken() {
  if (refreshToken.length() == 0) {
    return performLogin();
  }

  HTTPClient http;
  String url = serverUrl + "/auth/refresh";

  DynamicJsonDocument payload(256);
  payload["refreshToken"] = refreshToken;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client; 
  http.begin(client, url);   
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  if (httpCode != 200) {
    Serial.printf("[CloudAuth] Refresh failed: %d, doing login\n", httpCode);
    return performLogin();
  }

  DynamicJsonDocument doc(1024);
  deserializeJson(doc, response);

  accessToken = doc["accessToken"].as<String>();
  if (doc.containsKey("refreshToken")) {
    refreshToken = doc["refreshToken"].as<String>();
  }

  saveCredentials();
  return true;
}

bool CloudAuthDoser::ensureTokenFresh() {
  if (accessToken.length() == 0) return false;

  uint32_t now = millis();
  if (tokenExpiresAt > 0 && now + TOKENREFRESHBEFORES > tokenExpiresAt) {
    Serial.println("[CloudAuth] Token near expiry, refreshing...");
    return refreshAccessToken();
  }

  return true;
}

bool CloudAuthDoser::fetchDoserConfig(JsonDocument& outConfig) {
  if (!isAuthenticated()) return false;

  HTTPClient http;
  String url = serverUrl + "/iot/dosing/handshake"; 

  DynamicJsonDocument payload(256);
  payload["esp_uid"] = espUid;
  payload["hw_type"] = HW_TYPE;
  payload["firmware_version"] = DOSER_FW_VERSION;     

  String jsonPayload;
  serializeJson(payload, jsonPayload);
  Serial.print("[CloudAuth] Handshake payload: ");
  Serial.println(jsonPayload);

  WiFiClient client;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  if (httpCode == 404) {
    Serial.println("[CloudAuth] Handshake: doser ainda não cadastrado/configurado no servidor");
    Serial.println(response);  // {"success":false,"error":"Device not found"}
    return false;              // deixa o loop tentar mais tarde
  }

  if (httpCode != 200) {
    Serial.printf("[CloudAuth] Handshake failed: %d\n%s\n",
                  httpCode, response.c_str());
    return false;
  }


  deserializeJson(outConfig, response);
  return outConfig.containsKey("pumps");
}


bool CloudAuthDoser::sendDoserStatus(uint32_t uptime, int8_t rssi, const JsonDocument& pumpsStatus) {
  if (!isAuthenticated()) return false;

  HTTPClient http;
  String url = serverUrl + "/iot/dosing/status";

  DynamicJsonDocument payload(1024);
  payload["esp_uid"]    = espUid;
  payload["uptime_s"]   = uptime;
  payload["signal_dbm"] = rssi;
  payload["pumps"]      = pumpsStatus;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client; 
  http.begin(client, url);   
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", getAuthHeader());

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  return (httpCode == 200 || httpCode == 201);
}

bool CloudAuthDoser::reportDosingExecution(uint32_t pumpId, uint16_t volumeMl, uint32_t scheduledAt, uint32_t executedAt, const char* status, const char* origin) {
  if (!isAuthenticated()) return false;

  HTTPClient http;
  String url = serverUrl + "/iot/dosing/execution";

  DynamicJsonDocument payload(512);
  payload["esp_uid"]      = espUid;
  payload["pump_id"]      = pumpId;
  payload["volume_ml"]    = volumeMl;
  payload["scheduled_at"] = scheduledAt;
  payload["executed_at"]  = executedAt;
  payload["status"]       = status;
  payload["origin"]       = origin;


  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client; 
  http.begin(client, url);   
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", getAuthHeader());

  int httpCode = http.POST(jsonPayload);
  http.end();

  return (httpCode == 200 || httpCode == 201);
}

bool CloudAuthDoser::fetchCommands(JsonDocument& outDoc) {
  if (!isAuthenticated()) return false;

  HTTPClient http;
  String url = serverUrl + "/iot/dosing/commands?esp_uid=" + espUid;
  //Serial.print("[CloudAuth] fetchCommands URL: ");
  //Serial.println(url);

  WiFiClient client;
  http.begin(client, url);
  http.addHeader("Authorization", getAuthHeader());

  int httpCode = http.GET();
  String response = http.getString();
  http.end();

  if (httpCode != 200) {
    Serial.printf("[CloudAuth] fetchCommands httpCode=%d\n", httpCode);
    Serial.println(response);
    return false;
  }

  DeserializationError err = deserializeJson(outDoc, response);
  if (err) {
    Serial.printf("[CloudAuth] JSON error in commands: %s\n", err.c_str());
    return false;
  }

  // loga só quando vier algo
  JsonArray cmds = outDoc["commands"].as<JsonArray>();
  if (!cmds.isNull() && cmds.size() > 0) {
    Serial.printf("[CloudAuth] %d command(s) received\n", cmds.size());
  }

  return true;
}

void CloudAuthDoser::handleCommand(JsonObject cmd, DoserControl* doser) {
  String type = cmd["type"].as<String>();
  JsonObject payload = cmd["payload"].as<JsonObject>();

  if (type == "STOP_MANUAL") {
    uint32_t pumpId = payload["pump_id"] | 0;
    Serial.printf("[CMD] STOP_MANUAL pump %lu\n", pumpId);
    if (doser) {
      doser->stopManualDose(pumpId);
    }
  }
}

void CloudAuthDoser::processCommands(DoserControl* doser) {
  DynamicJsonDocument doc(2048);
  if (!fetchCommands(doc)) return;

  if (!doc.containsKey("commands")) return;
  JsonArray cmds = doc["commands"].as<JsonArray>();

  for (JsonObject cmd : cmds) {
    handleCommand(cmd, doser);
  }
}


String CloudAuthDoser::getAuthHeader() const {
  return "Bearer " + accessToken;
}

void CloudAuthDoser::saveCredentials() {
  DynamicJsonDocument doc(512);
  doc["token"] = accessToken;
  doc["refreshToken"] = refreshToken;
  doc["saved_at"] = time(nullptr);

  File file = SPIFFS.open("/doser_auth.json", "w");
  if (!file) return;

  serializeJson(doc, file);
  file.close();
}

bool CloudAuthDoser::loadCredentials() {
  if (!SPIFFS.exists("/doser_auth.json")) return false;

  File file = SPIFFS.open("/doser_auth.json", "r");
  if (!file) return false;

  DynamicJsonDocument doc(512);
  if (deserializeJson(doc, file).code() != DeserializationError::Ok) {
    file.close();
    return false;
  }

  file.close();

  accessToken = doc["token"].as<String>();
  refreshToken = doc["refreshToken"].as<String>();

  return accessToken.length() > 0;
}
