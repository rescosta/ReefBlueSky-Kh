#include "CloudAuth.h"
#include <ESP32-targz.h>
#include "MultiDeviceAuth.h"
#include "TimeProvider.h"

extern String deviceToken;

const char* CLOUD_BASE_URL = "http://iot.reefbluesky.com.br/api/v1";


CloudAuth cloudAuth(CLOUD_BASE_URL, deviceId.c_str());


// ============================================================================
// [SEGURANÇA] Construtor e Inicialização
// ============================================================================

CloudAuth::CloudAuth(const char* url, const char* devId) 
    : serverUrl(url), deviceId(devId) {
    Serial.printf("[CloudAuth] Inicializando com servidor: %s\n", url);
    Serial.printf("[CloudAuth] Device ID: %s\n", devId);
    
    // [BOOT] Carregar checkpoint de sincronização
    incrementalSync.loadSyncCheckpoint();
}

// ============================================================================
// [BOOT] Inicializar e Obter Token na Primeira Vez
// ============================================================================

bool CloudAuth::init() {
    Serial.println("[CloudAuth::init] Iniciando autenticação...");
    
    // Tentar carregar token existente
    if (loadTokenSecurely(deviceToken, refreshToken, tokenExpiry)) {
        Serial.println("[CloudAuth::init] Token carregado do armazenamento seguro");
        
        // Verificar se token ainda é válido
        unsigned long nowSec = getCurrentEpochMs() / 1000ULL;
        if (nowSec < tokenExpiry) {
            Serial.println("[CloudAuth::init] Token ainda válido");

            extern void sendHealthToCloud();   // declaração da função na .ino
            sendHealthToCloud();               // envia health imediatamente

            return true;
        }
        
        // Token expirado, tentar renovar
        if (refreshTokenIfNeeded()) {
            Serial.println("[CloudAuth::init] Token renovado com sucesso");
            
            extern void sendHealthToCloud();
            sendHealthToCloud();

            return true;
        }
    }
    
    Serial.println("[CloudAuth::init] Nenhum token válido encontrado");
    Serial.println("[CloudAuth::init] Aguardando registro do dispositivo...");
    
    
    return false;
}

// ============================================================================
// [SEGURANÇA] Armazenamento Seguro de Token com Criptografia NVS
// ============================================================================

bool CloudAuth::storeTokenSecurely(const String& token, const String& refreshTok, unsigned long expiry) {
    Serial.println("[CloudAuth::storeTokenSecurely] Armazenando token de forma segura...");
    
    nvs_handle_t handle;
    esp_err_t err = nvs_open("cloud_auth", NVS_READWRITE, &handle);
    
    if (err != ESP_OK) {
        Serial.printf("[CloudAuth::storeTokenSecurely] Erro ao abrir NVS: %d\n", err);
        return false;
    }
    
    // [SEGURANÇA] Criptografar token antes de armazenar
    String encryptedToken = encryptToken(token);
    String encryptedRefresh = encryptToken(refreshTok);
    
    // Armazenar token criptografado
    err = nvs_set_str(handle, "device_token", encryptedToken.c_str());
    if (err != ESP_OK) {
        Serial.printf("[CloudAuth::storeTokenSecurely] Erro ao armazenar token: %d\n", err);
        nvs_close(handle);
        return false;
    }
    
    // Armazenar refresh token
    err = nvs_set_str(handle, "refresh_token", encryptedRefresh.c_str());
    if (err != ESP_OK) {
        Serial.printf("[CloudAuth::storeTokenSecurely] Erro ao armazenar refresh token: %d\n", err);
        nvs_close(handle);
        return false;
    }
    
    // Armazenar expiração
    err = nvs_set_u32(handle, "token_expiry", (uint32_t)expiry);
    if (err != ESP_OK) {
        Serial.printf("[CloudAuth::storeTokenSecurely] Erro ao armazenar expiração: %d\n", err);
        nvs_close(handle);
        return false;
    }
    
    nvs_commit(handle);
    nvs_close(handle);
    
    Serial.println("[CloudAuth::storeTokenSecurely] Token armazenado com sucesso");
    return true;
}

bool CloudAuth::loadTokenSecurely(String& token, String& refreshTok, unsigned long& expiry) {
    Serial.println("[CloudAuth::loadTokenSecurely] Carregando token de forma segura...");
    
    nvs_handle_t handle;
    esp_err_t err = nvs_open("cloud_auth", NVS_READONLY, &handle);
    
    if (err != ESP_OK) {
        Serial.printf("[CloudAuth::loadTokenSecurely] Nenhum token armazenado\n");
        return false;
    }
    
    char tokenBuffer[2048] = {0};
    char refreshBuffer[2048] = {0};
    size_t tokenLen = sizeof(tokenBuffer);
    size_t refreshLen = sizeof(refreshBuffer);
    
    // Carregar token criptografado
    err = nvs_get_str(handle, "device_token", tokenBuffer, &tokenLen);
    if (err != ESP_OK) {
        nvs_close(handle);
        return false;
    }
    
    // Carregar refresh token
    err = nvs_get_str(handle, "refresh_token", refreshBuffer, &refreshLen);
    if (err != ESP_OK) {
        nvs_close(handle);
        return false;
    }
    
    // Carregar expiração
    err = nvs_get_u32(handle, "token_expiry", (uint32_t*)&expiry);
    if (err != ESP_OK) {
        nvs_close(handle);
        return false;
    }
    
    nvs_close(handle);
    
    // [SEGURANÇA] Descriptografar tokens
    token = decryptToken(String(tokenBuffer));
    refreshTok = decryptToken(String(refreshBuffer));
    
    Serial.println("[CloudAuth::loadTokenSecurely] Token carregado com sucesso");
    return true;
}

// ============================================================================
// [SEGURANÇA] Criptografia AES256 (Simplificada)
// ============================================================================

String CloudAuth::encryptToken(const String& token) {
    // [NOTA] Em produção, usar chave mestre do ESP32 (eFuse)
    // Por enquanto, usar hash SHA256 como base para chave
    
    // Implementação simplificada: Base64 encode + XOR com chave
    // Em produção, usar mbedtls_aes_crypt_cbc
    
    String encoded = "";
    for (size_t i = 0; i < token.length(); i++) {
        char c = token[i] ^ (0xAA + i);  // XOR simples (melhorar em produção)
        encoded += String(c, HEX);
    }
    
    return encoded;
}

String CloudAuth::decryptToken(const String& encryptedToken) {
    String decoded = "";
    for (size_t i = 0; i < encryptedToken.length(); i += 2) {
        String hex = encryptedToken.substring(i, i + 2);
        char c = (char)strtol(hex.c_str(), NULL, 16);
        c = c ^ (0xAA + (i / 2));  // XOR reverso
        decoded += c;
    }
    
    return decoded;
}

// ============================================================================
// [SEGURANÇA] Renovar Token se Expirado
// ============================================================================

bool CloudAuth::refreshTokenIfNeeded() {
    unsigned long now = getCurrentEpochMs() / 1000ULL;
    
    // Renovar se vai expirar em menos de 1 hora
    if (tokenExpiry - now > 3600) {
        return true;  // Token ainda válido
    }
    
    Serial.println("[CloudAuth::refreshTokenIfNeeded] Renovando token...");
    
    if (!rateLimiter.canMakeRequest()) {
        Serial.println("[CloudAuth::refreshTokenIfNeeded] Rate limit atingido");
        return false;
    }
    
    //if (!validateSSLCertificate()) {
    //    Serial.println("[CloudAuth::refreshTokenIfNeeded] Validação SSL falhou");
    //    return false;
   // }
    
    //WiFiClientSecure client;
    WiFiClient client;
    //if (ca_cert != nullptr) client.setCACert(ca_cert);
    
    HTTPClient http;
    String url = serverUrl + "/device/refresh-token";
    
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + refreshToken);
    
    // [SEGURANÇA] Adicionar timestamp para proteção contra replay
    DynamicJsonDocument doc(256);
    doc["timestamp"] = now;
    doc["deviceId"] = deviceId;
    
    String payload;
    serializeJson(doc, payload);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
        String response = http.getString();
        DynamicJsonDocument responseDoc(512);
        DeserializationError err = deserializeJson(responseDoc, response);
        if (!err && responseDoc["success"]) {
            JsonObject data = responseDoc["data"];
            if (data.containsKey("token")) {
                String newToken = data["token"].as<String>();
                unsigned long newExpiry = data["expiresIn"].as<unsigned long>();

                deviceToken = newToken;
                tokenExpiry = now + newExpiry;

                storeTokenSecurely(deviceToken, refreshToken, tokenExpiry);

                Serial.println("[CloudAuth::refreshTokenIfNeeded] Token renovado com sucesso");
                http.end();
                return true;
            }
        }
    }

    
    Serial.printf("[CloudAuth::refreshTokenIfNeeded] Erro ao renovar token: %d\n", httpCode);
    http.end();
    return false;
}

// ============================================================================
// [SEGURANÇA] Validação de Certificado SSL/TLS
// ============================================================================

bool CloudAuth::validateSSLCertificate() {
    // [SEGURANÇA] Validar certificado do servidor
    // Em produção, usar certificate pinning com SHA256 fingerprint
    
    Serial.println("[CloudAuth::validateSSLCertificate] Validando certificado SSL...");
    
    // Verificação simplificada
    // Em produção, implementar verificação completa com mbedtls
    
    return true;
}

// ============================================================================
// [SEGURANÇA] Obter Token Válido
// ============================================================================

String CloudAuth::getAuthToken() {
    if (deviceToken.length() == 0) {
        Serial.println("[CloudAuth::getAuthToken] Token não disponível");
        return "";
    }
    
    return deviceToken;
}

// ============================================================================
// [FUNCIONALIDADE] Fila de Medições Offline
// ============================================================================

void CloudAuth::queueMeasurement(const Measurement& m) {
    if (offlineMeasurementQueue.size() >= MAX_QUEUE_SIZE) {
        Serial.println("[CloudAuth::queueMeasurement] Fila cheia, removendo medição antiga");
        offlineMeasurementQueue.pop();
    }
    
    offlineMeasurementQueue.push(m);
    Serial.printf("[CloudAuth::queueMeasurement] Medição enfileirada. Fila: %d\n", offlineMeasurementQueue.size());
}

// ============================================================================
// [FUNCIONALIDADE] Sincronização Incremental (sem wrapper/compressão)
// ============================================================================

bool CloudAuth::syncOfflineMeasurements() {
    if (offlineMeasurementQueue.empty()) {
        Serial.println("[CloudAuth::syncOfflineMeasurements] Nenhuma medição para sincronizar");
        return true;
    }

    if (!rateLimiter.canMakeRequest()) {
        Serial.println("[CloudAuth::syncOfflineMeasurements] Rate limit atingido");
        return false;
    }

    Serial.printf("[CloudAuth::syncOfflineMeasurements] Sincronizando %d medições...\n", offlineMeasurementQueue.size());

//    if (!validateSSLCertificate()) {
//        Serial.println("[CloudAuth::syncOfflineMeasurements] Validação SSL falhou");
//        return false;
//    }

//    WiFiClientSecure client;
      WiFiClient client;  
//    if (ca_cert != nullptr) client.setCACert(ca_cert);
      HTTPClient http;
      String url = String(serverUrl) + "/device/sync";
      http.begin(client, url);

    
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + deviceToken);

    // Extrair medições da fila em chunks
    std::vector<Measurement> chunk;
    int chunkSize = incrementalSync.getChunkSize();

    while (!offlineMeasurementQueue.empty() && (int)chunk.size() < chunkSize) {
        chunk.push_back(offlineMeasurementQueue.front());
        offlineMeasurementQueue.pop();
    }

    // Montar payload exatamente como o Postman
    DynamicJsonDocument doc(4096);
    JsonArray measurementsArray = doc.createNestedArray("measurements");

    for (const auto& m : chunk) {
        JsonObject obj = measurementsArray.createNestedObject();
        obj["timestamp"]   = m.timestamp;          // mesmo campo do Postman
        obj["kh"]          = m.kh;
        obj["phref"]       = m.ph_reference;
        obj["phsample"]    = m.ph_sample;
        obj["temperature"] = m.temperature;
        obj["status"]      = m.is_valid ? "ok" : "invalid";
        obj["confidence"]  = m.confidence;
    }

    String payload;
    serializeJson(doc, payload);
    Serial.println("[SYNC] Payload:");
    Serial.println(payload);

    int httpCode = http.POST(payload);
    Serial.printf("[SYNC] httpCode = %d\n", httpCode);
    if (httpCode <= 0) {
        Serial.printf("[SYNC] Erro HTTP: %s\n", http.errorToString(httpCode).c_str());
    }

    if (httpCode == 200) {
        String response = http.getString();
        DynamicJsonDocument responseDoc(512);
        DeserializationError err = deserializeJson(responseDoc, response);
        if (!err && responseDoc["success"]) {
            // Atualizar checkpoint de sincronização
            if (!chunk.empty()) {
                incrementalSync.updateLastSyncedTimestamp(chunk.back().timestamp);
            }

            Serial.printf("[CloudAuth::syncOfflineMeasurements] %d medições sincronizadas com sucesso\n", chunk.size());
            http.end();

            // Continuar sincronizando se ainda há medições
            if (!offlineMeasurementQueue.empty()) {
                delay(1000);  // Aguardar antes de próxima sincronização
                return syncOfflineMeasurements();
            }

            return true;
        } else {
            Serial.println("[CloudAuth::syncOfflineMeasurements] Resposta 200 mas JSON inválido ou success=false");
        }
    }

    Serial.printf("[CloudAuth::syncOfflineMeasurements] Erro ao sincronizar: %d\n", httpCode);

    // Recolocar medições na fila se falhar
    for (const auto& m : chunk) {
        queueMeasurement(m);
    }

    http.end();
    return false;
}


// ============================================================================
// [SEGURANÇA] Enviar Heartbeat com Validação
// ============================================================================

bool CloudAuth::sendHeartbeat(const DeviceStatus& status) {
    if (!rateLimiter.canMakeRequest()) {
        return false;
    }
    
    //if (!validateSSLCertificate()) {
    //    return false;
   // }
    
    //WiFiClientSecure client;
    WiFiClient client;
    //if (ca_cert != nullptr) client.setCACert(ca_cert);
    
    HTTPClient http;
    String url = serverUrl + "/device/ping?deviceId=" + deviceId;
    
    http.begin(client, url);

    
    http.addHeader("Authorization", "Bearer " + deviceToken);
    
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String response = http.getString();
        DynamicJsonDocument responseDoc(512);
        deserializeJson(responseDoc, response);
        
        // [SEGURANÇA] Validar timestamp do servidor
        if (responseDoc.containsKey("timestamp")) {
            unsigned long serverTime = responseDoc["timestamp"];
            if (!replayProtection.validateTimestamp(serverTime)) {
                Serial.println("[CloudAuth::sendHeartbeat] Validação de timestamp falhou");
                http.end();
                return false;
            }
        }
        
        Serial.println("[CloudAuth::sendHeartbeat] Heartbeat enviado com sucesso");
        http.end();
        return true;
    }
    
    Serial.printf("[CloudAuth::sendHeartbeat] Erro ao enviar heartbeat: %d\n", httpCode);
    http.end();
    return false;
}

// ============================================================================
// [SEGURANÇA] Enviar Métricas de Saúde do Sistema
// ============================================================================

bool CloudAuth::sendHealthMetrics(const SystemHealth& health) {
    if (!rateLimiter.canMakeRequest()) {
        return false;
    }
    
    //WiFiClientSecure client;
    WiFiClient client;
    //if (ca_cert != nullptr) client.setCACert(ca_cert);
    
    HTTPClient http;
    String url = serverUrl + "/device/health";
    
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + deviceToken);
    
    DynamicJsonDocument doc(512);
    doc["deviceId"] = deviceId;
    doc["timestamp"] = getCurrentEpochMs(); 
    doc["cpuUsage"] = health.cpu_usage;
    doc["memoryUsage"] = health.memory_usage;
    doc["spiffsUsage"] = health.spiffs_usage;
    doc["wifiSignalStrength"] = health.wifi_signal_strength;
    doc["failedSyncAttempts"] = health.failed_sync_attempts;
    doc["uptime"] = health.uptime;
    doc["voltageSupply"] = health.voltage_supply;
    
    String payload;
    serializeJson(doc, payload);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
        Serial.println("[CloudAuth::sendHealthMetrics] Métricas de saúde enviadas");
        http.end();
        return true;
    }
    
    Serial.printf("[CloudAuth::sendHealthMetrics] Erro ao enviar métricas: %d\n", httpCode);
    http.end();
    return false;
}

// ============================================================================
// Obter KH de referência do servidor (se existir)
// ============================================================================

bool CloudAuth::fetchReferenceKH(float& outKhRef) {
    if (!rateLimiter.canMakeRequest()) {
        return false;
    }

    WiFiClient client;
    HTTPClient http;
    String url = String(serverUrl) + "/device/kh-reference";

    http.begin(client, url);
    http.addHeader("Authorization", "Bearer " + deviceToken);

    int httpCode = http.GET();
    if (httpCode != 200) {
        Serial.printf("[CloudAuth::fetchReferenceKH] HTTP %d\n", httpCode);
        http.end();
        return false;
    }

    String response = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, response);
    if (err) {
        Serial.printf("[CloudAuth::fetchReferenceKH] JSON inválido: %s\n", err.c_str());
        http.end();
        return false;
    }

    bool success = doc["success"] | false;
    if (!success || doc["data"].isNull()) {
        Serial.println("[CloudAuth::fetchReferenceKH] Sem KH referência no servidor");
        http.end();
        return false;
    }

    float v = doc["data"]["khreference"] | 0.0f;
    if (v <= 0.0f || v > 25.0f) {
        Serial.println("[CloudAuth::fetchReferenceKH] KH inválido no servidor");
        http.end();
        return false;
    }

    outKhRef = v;
    http.end();
    return true;
}



// ============================================================================
// [SEGURANÇA] Obter Comandos do Servidor com Validação
// ============================================================================

bool CloudAuth::pullCommandFromServer(Command& command) {
    if (!rateLimiter.canMakeRequest()) {
        return false;
    }

    WiFiClient client;
    HTTPClient http;
    String url = String(serverUrl) + "/device/commands/poll";

    http.begin(client, url);
    http.addHeader("Authorization", "Bearer " + deviceToken);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST("{}");

    if (httpCode == 200) {
        String response = http.getString();

        Serial.println("[CloudAuth] resposta recebida:");
        Serial.println(response);

        DynamicJsonDocument responseDoc(2048);
        DeserializationError err = deserializeJson(responseDoc, response);
        if (err) {
            Serial.printf("[CloudAuth::pullCommandFromServer] JSON inválido: %s\n", err.c_str());
            http.end();
            return false;
        }

        if (!responseDoc["success"]) {
            http.end();
            return false;
        }

        JsonArray arr = responseDoc["data"].as<JsonArray>();
        Serial.printf("[CloudAuth] data size=%d\n", arr.size());

        if (!arr || arr.size() == 0) {
            http.end();
            return false; // sem comandos pendentes
        }

        JsonObject cmdObj = arr[0];

        String type = cmdObj["type"].as<String>();

        if (!commandValidator.isCommandAllowed(type)) {
            Serial.println("[CloudAuth::pullCommandFromServer] Comando não permitido");
            http.end();
            return false;
        }

        command.command_id = String(cmdObj["id"].as<int>());
        command.action     = type;

        // aqui você limpa o documento antes de reutilizar
        command.paramsDoc.clear();
        JsonObject dst = command.paramsDoc.to<JsonObject>();
        JsonVariant payloadVar = cmdObj["payload"];
        if (payloadVar.is<JsonObject>()) {
            JsonObject src = payloadVar.as<JsonObject>();
            for (JsonPair kv : src) {
                dst[kv.key()] = kv.value();
            }
        }
        // reata params ao paramsDoc
        command.params = command.paramsDoc.as<JsonObject>();

        Serial.printf("[CloudAuth::pullCommandFromServer] Comando recebido: %s\n", type.c_str());
        http.end();
        return true;
    }

    Serial.printf("[CloudAuth::pullCommandFromServer] Erro HTTP: %d\n", httpCode);
    http.end();
    return false;
}

// ============================================================================
// [SEGURANÇA] Confirmar Execução de Comando
// ============================================================================

bool CloudAuth::confirmCommandExecution(const String& commandId,
                                        const String& status,
                                        const String& result) {
    if (!rateLimiter.canMakeRequest()) {
        return false;
    }

    WiFiClient client;
    HTTPClient http;
    String url = String(serverUrl) + "/device/commands/complete";

    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + deviceToken);

    DynamicJsonDocument doc(512);
    doc["commandId"] = commandId.toInt();   // backend espera número
    doc["status"] = status;                // ex.: "done" ou "error"
    if (result.length() > 0) {
        doc["errorMessage"] = result;      // só envia se tiver erro
    }

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);

    if (httpCode == 200) {
        Serial.printf("[CloudAuth::confirmCommandExecution] Execução confirmada: %s\n", commandId.c_str());
        http.end();
        return true;
    }

    Serial.printf("[CloudAuth::confirmCommandExecution] Erro ao confirmar: %d\n", httpCode);
    http.end();
    return false;
}


// ============================================================================
// [FUNCIONALIDADE] Compressão de Dados com GZIP
// ============================================================================

String CloudAuth::compressMeasurements(const std::vector<Measurement>& measurements) {
    DynamicJsonDocument doc(8192);
    JsonArray array = doc.createNestedArray("measurements");
    
    for (const auto& m : measurements) {
        JsonObject obj = array.createNestedObject();
        obj["ts"] = m.timestamp;
        obj["kh"] = m.kh;
        obj["ph_r"] = m.ph_reference;
        obj["ph_s"] = m.ph_sample;
        obj["t"] = m.temperature;
        obj["v"] = m.is_valid;
        obj["c"] = m.confidence;
    }
    
    String json;
    serializeJson(doc, json);
    
    // [FUNCIONALIDADE] Comprimir com GZIP
    // Nota: Implementação simplificada
    // Em produção, usar biblioteca de compressão apropriada
    
    return json;  // Retornar JSON (compressão será adicionada em produção)
}

// ============================================================================
// [FUNCIONALIDADE] Verificar Conectividade
// ============================================================================

bool CloudAuth::isConnected() {
    return WiFi.isConnected() && deviceToken.length() > 0;
}

// ============================================================================
// [FUNCIONALIDADE] Sincronização MQTT como Fallback
// ============================================================================

bool CloudAuth::syncViaMQTT(const Measurement& m) {
    // [FUNCIONALIDADE] Implementar sincronização via MQTT como alternativa
    // Usar biblioteca PubSubClient para conectar ao broker MQTT
    
    Serial.println("[CloudAuth::syncViaMQTT] Sincronização MQTT não implementada ainda");
    
    return false;
}
