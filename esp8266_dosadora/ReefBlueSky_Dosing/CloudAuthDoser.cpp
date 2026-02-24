//CloudAuthDoser.cpp

#include "CloudAuthDoser.h"
#include "FwVersion.h"
#include "OtaUpdate.h"

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

int32_t g_userUtcOffsetSec = 0;

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

  // [FIX] Verificar backoff antes de tentar
  if (!backoff.shouldRetry()) {
    Serial.println("[CloudAuth] Aguardando backoff para registration");
    return false;
  }

  HTTPClient http;
  String url = serverUrl + "/device/register";  // serverUrl já inclui /api/v1

  DynamicJsonDocument payload(512);
  payload["deviceId"] = espUid;
  payload["type"] = "DOSER";
  payload["username"] = username;
  payload["password"] = userPassword;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client;
  http.begin(client, url);
  http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  if (httpCode != 200 && httpCode != 201) {
    Serial.printf("[CloudAuth] Registration failed: %d\n%s\n", httpCode, response.c_str());
    backoff.recordFailure();  // [FIX] Registrar falha
    return false;
  }

  // Parse response
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, response);

  if (!doc.containsKey("data")) {
    Serial.println("[CloudAuth] Resposta sem campo data");
    backoff.recordFailure();  // [FIX] Registrar falha
    return false;
  }

  JsonObject data = doc["data"];

  if (!data.containsKey("token")) {
    Serial.println("[CloudAuth] No token in response");
    backoff.recordFailure();  // [FIX] Registrar falha
    return false;
  }

  accessToken   = data["token"].as<String>();
  refreshToken  = data.containsKey("refreshToken") ? data["refreshToken"].as<String>() : "";
  tokenExpiresAt = data.containsKey("expiresIn")
                    ? millis() + (data["expiresIn"].as<uint32_t>() * 1000)
                    : 0;

  saveCredentials();
  backoff.recordSuccess();  // [FIX] Registrar sucesso
  Serial.printf("[CloudAuth] ✓ Registered: %s\n", espUid.c_str());
  return true;

}

// [FIX] performLogin removido - devices não fazem login, só registration

bool CloudAuthDoser::refreshAccessToken() {
  if (refreshToken.length() == 0) {
    Serial.println("[CloudAuth] Sem refresh token, fazendo novo registro");
    return performRegistration();
  }

  // [FIX] Verificar backoff antes de tentar
  if (!backoff.shouldRetry()) {
    Serial.println("[CloudAuth] Aguardando backoff para refresh");
    return false;
  }

  HTTPClient http;
  String url = serverUrl + "/device/refresh-token";  // serverUrl já inclui /api/v1

  DynamicJsonDocument payload(256);
  payload["refreshToken"] = refreshToken;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client;
  http.begin(client, url);
  http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  if (httpCode != 200) {
    Serial.printf("[CloudAuth] Refresh failed: %d, fazendo novo registro\n", httpCode);
    backoff.recordFailure();  // [FIX] Registrar falha
    return performRegistration();
  }

  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, response);
  if (err) {
    Serial.printf("[CloudAuth] JSON parse error: %s\n", err.c_str());
    backoff.recordFailure();
    return false;
  }

  // [FIX] Parse conforme formato correto do servidor
  if (!doc.containsKey("success") || !doc["success"].as<bool>()) {
    Serial.println("[CloudAuth] Refresh response: success != true");
    backoff.recordFailure();
    return false;
  }

  JsonObject data = doc["data"];
  if (!data.containsKey("token")) {
    Serial.println("[CloudAuth] Refresh response: sem token");
    backoff.recordFailure();
    return false;
  }

  accessToken = data["token"].as<String>();

  // [FIX] Salvar novo refresh token se vier na resposta
  if (data.containsKey("refreshToken")) {
    refreshToken = data["refreshToken"].as<String>();
    Serial.println("[CloudAuth] Novo refresh token recebido e salvo");
  }

  // [FIX] Atualizar tokenExpiresAt com o novo tempo de expiração
  if (data.containsKey("expiresIn")) {
    tokenExpiresAt = millis() + (data["expiresIn"].as<uint32_t>() * 1000);
    Serial.printf("[CloudAuth] Token expira em %lu segundos\n", data["expiresIn"].as<uint32_t>());
  }

  saveCredentials();
  backoff.recordSuccess();  // [FIX] Registrar sucesso
  Serial.println("[CloudAuth] ✓ Token refreshed");
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
  payload["firmware_version"] = FW_VERSION;

  String jsonPayload;
  serializeJson(payload, jsonPayload);
  Serial.print("[CloudAuth] Handshake payload: ");
  Serial.println(jsonPayload);

  WiFiClient client;
  http.begin(client, url);
  http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
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

  Serial.print("[CloudAuth] Handshake resp: ");
  Serial.println(response);

  deserializeJson(outConfig, response);

  if (outConfig.containsKey("user_utc_offset_sec")) {
    g_userUtcOffsetSec = outConfig["user_utc_offset_sec"].as<int32_t>();
    Serial.printf("[CloudAuth] user_utc_offset_sec=%ld\n", (long)g_userUtcOffsetSec);
  }


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
  http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", getAuthHeader());

  int httpCode = http.POST(jsonPayload);
  String response = http.getString();
  http.end();

  return (httpCode == 200 || httpCode == 201);
}
bool CloudAuthDoser::reportDosingExecution(
    uint32_t pumpId,
    float volumeMl,
    uint32_t scheduledAt,
    uint32_t executedAt,
    const char* status,
    const char* origin,
    uint32_t scheduleId,   
    uint8_t doseIndex
) {
  if (!isAuthenticated()) return false;

  HTTPClient http;
  String url = serverUrl + "/iot/dosing/execution";

  DynamicJsonDocument payload(512);
  payload["esp_uid"]      = espUid;
  payload["pump_id"]      = pumpId;
  payload["schedule_id"]  = scheduleId;  
  payload["volume_ml"]    = volumeMl;
  payload["scheduled_at"] = scheduledAt;
  payload["executed_at"]  = executedAt;
  payload["status"]       = status;
  payload["origin"]       = origin;
  payload["doseindex"]   = doseIndex; 

  // LOG AQUI
  String jsonPayload;
  serializeJson(payload, jsonPayload);
  Serial.print("[DosingExec] JSON: ");
  Serial.println(jsonPayload);

  WiFiClient client;
  http.begin(client, url);
  http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", getAuthHeader());

  int httpCode = http.POST(jsonPayload);
  String resp = http.getString();
  Serial.printf("[DosingExec] POST %s code=%d resp=%s\n",
                url.c_str(), httpCode, resp.c_str());

  http.end();

  return (httpCode == 200 || httpCode == 201);
}

bool CloudAuthDoser::fetchCommands(JsonDocument& outDoc) {
  if (!isAuthenticated()) return false;

  HTTPClient http;
  String url = serverUrl + "/iot/dosing/commands";

  DynamicJsonDocument payload(128);
  payload["esp_uid"] = espUid;

  String jsonPayload;
  serializeJson(payload, jsonPayload);

  WiFiClient client;
  http.begin(client, url);
  http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(jsonPayload);
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
  else if (type == "MANUAL_DOSE") {
    // NÃO depender de pump_id vindo do servidor
    uint8_t  pumpIndex   = payload["pump_index"]   | 0;
    uint16_t volumeMl    = payload["volume_ml"]    | 0;
    uint32_t execId      = payload["execution_id"] | 0;
    const char* origin   = payload["origin"] | "MANUAL";

    Serial.printf("[CMD] MANUAL_DOSE idx=%u vol=%u execId=%lu origin=%s\n",
                  pumpIndex, volumeMl, execId, origin);

    if (doser) {
      // usa só o índice; DoserControl pega pump.id da config
      doser->startManualDose(pumpIndex, volumeMl, execId);
    }
  }

  else if (type == "otaupdate") {
    Serial.println("[CMD] otaupdate recebido (DOSER), iniciando OTA...");
    int cmdId = cmd["id"] | 0;
    otaSetCommandId(cmdId);  // habilita reporte de progresso ao backend
    otaUpdateDoser();
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
