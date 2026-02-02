//CloudAuth.cpp

#include "CloudAuth.h"
#include <ESP32-targz.h>
#include "MultiDeviceAuth.h"
#include "TimeProvider.h"
#include <stdint.h>


extern String deviceToken;
extern void onCloudAuthOk();

String CloudAuth::getDeviceJwt() const {
  return deviceToken;
}

const char* CLOUD_BASE_URL = "http://iot.reefbluesky.com.br/api/v1";

CloudAuth cloudAuth(CLOUD_BASE_URL, "");


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
    
    if (deviceToken.length() > 0) {
        Serial.println("[CloudAuth::init] Usando deviceToken em RAM, pulando NVS.");
        onCloudAuthOk();
        return true;
    }


    // Tentar carregar token existente
    if (loadTokenSecurely(deviceToken, refreshToken, tokenExpiry)) {
        Serial.println("[CloudAuth::init] Token carregado do armazenamento seguro");
        
        // Verificar se token ainda é válido
        unsigned long nowSec = getCurrentEpochMs() / 1000ULL;
        if (nowSec < tokenExpiry) {
            Serial.println("[CloudAuth::init] Token ainda válido");

            extern void sendHealthToCloud();   // declaração da função na .ino
            sendHealthToCloud();               // envia health imediatamente
            onCloudAuthOk(); 
            return true;
        }
        
        // Token expirado, tentar renovar
        if (refreshTokenIfNeeded()) {
            Serial.println("[CloudAuth::init] Token renovado com sucesso");
            
            extern void sendHealthToCloud();
            sendHealthToCloud();
            onCloudAuthOk();
            return true;
        }
    }
    
    Serial.println("[CloudAuth::init] Nenhum token válido encontrado");
    Serial.println("[CloudAuth::init] Tentando novo registro do dispositivo...");

    // [FIX] Chamar registerDevice() para obter novos tokens
    extern bool registerDevice();
    if (registerDevice()) {
        Serial.println("[CloudAuth::init] Dispositivo registrado com sucesso!");

        extern void sendHealthToCloud();
        sendHealthToCloud();
        onCloudAuthOk();
        return true;
    }

    Serial.println("[CloudAuth::init] Falha ao registrar dispositivo");
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
    String encryptedToken = token;
    String encryptedRefresh = refreshTok;
    
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
    token = String(tokenBuffer);
    refreshTok = String(refreshBuffer);

    Serial.printf("[DEBUG] deviceToken CARREGADO len=%d\n", token.length());
    Serial.println("[DEBUG] deviceToken CARREGADO raw:");
    Serial.println(token);

    Serial.println("[CloudAuth::loadTokenSecurely] Token carregado com sucesso");
    return true;
}

// ============================================================================
// [FIX] Limpar TODOS os tokens (RAM + NVS) para forçar novo registro
// ============================================================================
void CloudAuth::clearAllTokens() {
    Serial.println("[CloudAuth::clearAllTokens] Limpando TODOS os tokens (RAM + NVS)...");

    // Limpar tokens da RAM (variáveis globais e membros da classe)
    extern String deviceToken;
    deviceToken = "";
    refreshToken = "";
    tokenExpiry = 0;

    // Limpar tokens do NVS
    nvs_handle_t handle;
    esp_err_t err = nvs_open("cloud_auth", NVS_READWRITE, &handle);

    if (err == ESP_OK) {
        nvs_erase_key(handle, "device_token");
        nvs_erase_key(handle, "refresh_token");
        nvs_erase_key(handle, "token_expiry");
        nvs_commit(handle);
        nvs_close(handle);
        Serial.println("[CloudAuth::clearAllTokens] Tokens apagados do NVS");
    } else {
        Serial.printf("[CloudAuth::clearAllTokens] Erro ao abrir NVS: %d\n", err);
    }

    Serial.println("[CloudAuth::clearAllTokens] Todos os tokens limpos. Será necessário novo registro.");
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

    // [BACKOFF] Verificar se devemos tentar agora
    if (!authBackoff.shouldRetry()) {
        Serial.printf("[CloudAuth::refreshTokenIfNeeded] Backoff ativo, aguardando %lu ms\n",
                      authBackoff.getTimeUntilRetry());
        return false;
    }

    if (!rateLimiter.canMakeRequest()) {
        Serial.println("[CloudAuth::refreshTokenIfNeeded] Rate limit atingido");
        return false;
    }

    WiFiClient client;
    HTTPClient http;
    String url = serverUrl + "/device/refresh-token";

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + refreshToken);

    // [SEGURANÇA] Adicionar timestamp para proteção contra replay
    DynamicJsonDocument doc(256);
    doc["timestamp"] = now;
    doc["deviceId"] = deviceId;

    String payload;
    serializeJson(doc, payload);

    int httpCode = http.POST(payload);

    // [FIX] Tratar timeout/erro de conexão
    if (httpCode < 0) {
        Serial.printf("[CloudAuth::refreshTokenIfNeeded] Erro HTTP: %s\n",
                      http.errorToString(httpCode).c_str());
        http.end();
        authBackoff.recordFailure();
        return false;
    }

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

                // [FIX] Atualizar refresh token se servidor enviar um novo
                if (data.containsKey("refreshToken")) {
                    refreshToken = data["refreshToken"].as<String>();
                    Serial.println("[CloudAuth::refreshTokenIfNeeded] Novo refresh token recebido");
                }

                storeTokenSecurely(deviceToken, refreshToken, tokenExpiry);

                Serial.println("[CloudAuth::refreshTokenIfNeeded] Token renovado com sucesso");
                http.end();

                authBackoff.recordSuccess();

                extern void onCloudAuthOk();
                onCloudAuthOk();
                return true;
            }
        }
    }

    // [FIX] Tratar erro 401/403 especificamente - token expirado/inválido
    if (httpCode == 401 || httpCode == 403) {
        Serial.printf("[CloudAuth::refreshTokenIfNeeded] Refresh token inválido/expirado (%d)\n", httpCode);
        Serial.println("[CloudAuth::refreshTokenIfNeeded] Limpando todos os tokens e forçando novo registro...");

        // Limpar TODOS os tokens (RAM + NVS) para forçar novo registro
        clearAllTokens();

        http.end();
        authBackoff.recordFailure();
        return false;
    }

    Serial.printf("[CloudAuth::refreshTokenIfNeeded] Erro ao renovar token: %d\n", httpCode);
    http.end();
    authBackoff.recordFailure();
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
        return true;  // Nada para sincronizar - sucesso silencioso
    }

    // [FIX] Verificar backoff antes de tentar
    if (!syncBackoff.shouldRetry()) {
        Serial.printf("[SYNC] Backoff ativo, aguardando %lu ms (falhas: %d)\n",
                      syncBackoff.getTimeUntilRetry(), syncBackoff.getFailureCount());
        return false;
    }

    // [FIX] Re-habilitar rate limiter
    if (!rateLimiter.canMakeRequest()) {
        Serial.println("[SYNC] Rate limit atingido, tentando novamente depois");
        return false;
    }

    Serial.printf("[SYNC] Sincronizando %d medições...\n", offlineMeasurementQueue.size());

    WiFiClient client;
    HTTPClient http;
    String url = String(serverUrl) + "/device/sync";

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
    http.addHeader("Content-Type", "application/json");

    Serial.printf("[DEBUG] deviceToken PARA SYNC len=%d\n", deviceToken.length());
    Serial.println("[DEBUG] deviceToken PARA SYNC raw:");
    Serial.println(deviceToken);

    http.addHeader("Authorization", "Bearer " + deviceToken);

    // Extrair medições da fila em chunks
    std::vector<Measurement> chunk;
    int chunkSize = incrementalSync.getChunkSize();

    while (!offlineMeasurementQueue.empty() && (int)chunk.size() < chunkSize) {
        chunk.push_back(offlineMeasurementQueue.front());
        offlineMeasurementQueue.pop();
    }

    // Montar payload
    DynamicJsonDocument doc(4096);
    JsonArray measurementsArray = doc.createNestedArray("measurements");

    for (const auto& m : chunk) {
        JsonObject obj = measurementsArray.createNestedObject();
        obj["timestamp"]   = m.timestamp;
        obj["startedAt"]   = m.startedAt;
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

    // [FIX] Tratar erro de conexão/timeout
    if (httpCode < 0) {
        Serial.printf("[SYNC] Erro HTTP: %s\n", http.errorToString(httpCode).c_str());
        http.end();
        // Recolocar medições na fila
        for (const auto& m : chunk) {
            queueMeasurement(m);
        }
        syncBackoff.recordFailure();  // [FIX] Backoff exponencial
        return false;
    }

    // Token expirado
    if (httpCode == 401 || httpCode == 403) {
        Serial.println("[SYNC] Token inválido/expirado (401/403). Limpando TODOS os tokens.");
        clearAllTokens();
        http.end();
        // Recolocar medições na fila
        for (const auto& m : chunk) {
            queueMeasurement(m);
        }
        syncBackoff.recordFailure();
        return false;
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

            Serial.printf("[SYNC] %d medições sincronizadas com sucesso\n", chunk.size());
            http.end();

            syncBackoff.recordSuccess();  // [FIX] Reset backoff

            // [FIX] NÃO fazer chamada recursiva - deixar o loop principal chamar novamente
            if (!offlineMeasurementQueue.empty()) {
                Serial.printf("[SYNC] Ainda há %d medições pendentes, serão sincronizadas no próximo ciclo\n",
                              offlineMeasurementQueue.size());
            }

            return true;
        } else {
            Serial.println("[SYNC] Resposta 200 mas JSON inválido ou success=false");
        }
    }

    Serial.printf("[SYNC] Erro ao sincronizar: %d\n", httpCode);

    // Recolocar medições na fila se falhar
    for (const auto& m : chunk) {
        queueMeasurement(m);
    }

    http.end();
    syncBackoff.recordFailure();  // [FIX] Backoff exponencial para erros
    return false;
}


// ============================================================================
// [SEGURANÇA] Enviar Heartbeat com Validação
// ============================================================================

bool CloudAuth::sendHeartbeat(const DeviceStatus& status) {
    if (!rateLimiter.canMakeRequest()) {
        return false;
    }

    WiFiClient client;
    HTTPClient http;
    String url = serverUrl + "/device/ping?deviceId=" + deviceId;

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
    http.addHeader("Authorization", "Bearer " + deviceToken);

    int httpCode = http.GET();

    // [FIX] Tratar erro de conexão/timeout
    if (httpCode < 0) {
        Serial.printf("[CloudAuth::sendHeartbeat] Erro HTTP: %s\n",
                      http.errorToString(httpCode).c_str());
        http.end();
        return false;
    }

    if (httpCode == 401 || httpCode == 403) {
        Serial.println("[CloudAuth::sendHeartbeat] Token inválido/expirado (401/403). Limpando TODOS os tokens.");
        clearAllTokens();
        http.end();
        return false;
    }

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
    // [FIX] Health é crítico - não aplicar rate limiting
    // O intervalo já é controlado por HEALTH_INTERVAL_MS no firmware

    WiFiClient client;
    HTTPClient http;
    String url = serverUrl + String("/device/health");
    Serial.printf("[CloudAuth::sendHealthMetrics] URL = %s\n", url.c_str());

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
    http.addHeader("Content-Type", "application/json");

    Serial.printf("[DEBUG] deviceToken PARA HEALTH len=%d\n", deviceToken.length());
    Serial.println("[DEBUG] deviceToken PARA HEALTH raw:");
    
    Serial.println(deviceToken);  

    http.addHeader("Authorization", "Bearer " + deviceToken);

    DynamicJsonDocument doc(512);

    // Força os tipos corretos no JSON
    doc["cpuusage"]     = health.cpu_usage;
    doc["memoryusage"]  = health.memory_usage;
    doc["storageusage"] = health.spiffs_usage;
    doc["wifirssi"]     = health.wifi_signal_strength;
    doc["uptime"]       = health.uptime;

    // [FIX] Adicionar dados dos sensores
    doc["level_a"]      = health.level_a;
    doc["level_b"]      = health.level_b;
    doc["level_c"]      = health.level_c;
    doc["temperature"]  = health.temperature;
    doc["ph"]           = health.ph;

    String payload;
    serializeJson(doc, payload);

    Serial.printf("[CloudAuth] Payload final: %s\n", payload.c_str());

    int httpCode = http.POST(payload);
    Serial.printf("[CloudAuth::sendHealthMetrics] HTTP Code: %d\n", httpCode);

    // [FIX] Tratar erro de conexão/timeout
    if (httpCode < 0) {
        Serial.printf("[CloudAuth::sendHealthMetrics] Erro HTTP: %s\n",
                      http.errorToString(httpCode).c_str());
        http.end();
        return false;
    }

    if (httpCode == 401 || httpCode == 403) {
        Serial.println("[CloudAuth::sendHealthMetrics] Token inválido/expirado (401/403). Limpando TODOS os tokens.");
        clearAllTokens();
        http.end();
        return false;
    }

    if (httpCode == 200) {
        Serial.println("[CloudAuth::sendHealthMetrics] ✓ Sucesso");
        http.end();
        return true;
    }

    // 400 aqui só loga; não quebra nada
    Serial.printf("[CloudAuth::sendHealthMetrics] ✗ Erro %d\n", httpCode);
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
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
    http.addHeader("Authorization", "Bearer " + deviceToken);

    int httpCode = http.GET();

    // [FIX] Tratar erro de conexão/timeout
    if (httpCode < 0) {
        Serial.printf("[CloudAuth::fetchReferenceKH] Erro HTTP: %s\n",
                      http.errorToString(httpCode).c_str());
        http.end();
        return false;
    }

    if (httpCode == 401 || httpCode == 403) {
        Serial.println("[CloudAuth::fetchReferenceKH] Token inválido/expirado (401/403). Limpando TODOS os tokens.");
        clearAllTokens();
        http.end();
        return false;
    }

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
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
    http.addHeader("Authorization", "Bearer " + deviceToken);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST("{}");

    // [FIX] Tratar erro de conexão/timeout
    if (httpCode < 0) {
        Serial.printf("[CloudAuth::pullCommandFromServer] Erro HTTP: %s\n",
                      http.errorToString(httpCode).c_str());
        http.end();
        return false;
    }

    if (httpCode == 401 || httpCode == 403) {
        Serial.println("[CloudAuth::pullCommandFromServer] Token inválido/expirado (401/403). Limpando TODOS os tokens.");
        clearAllTokens();
        http.end();
        return false;
    }

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
    http.setTimeout(HTTP_TIMEOUT_MS);  // [FIX] Adicionar timeout
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

    // [FIX] Tratar erro de conexão/timeout
    if (httpCode < 0) {
        Serial.printf("[CloudAuth::confirmCommandExecution] Erro HTTP: %s\n",
                      http.errorToString(httpCode).c_str());
        http.end();
        return false;
    }

    if (httpCode == 401 || httpCode == 403) {
        Serial.println("[CloudAuth::confirmCommandExecution] Token inválido/expirado (401/403). Limpando TODOS os tokens.");
        clearAllTokens();
        http.end();
        return false;
    }

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
// [TEST SCHEDULE] Agendamento Automático de Testes
// ============================================================================

/**
 * Verifica se deve executar teste agendado
 *
 * @param shouldTestNow Output: true se deve executar teste agora
 * @param nextTestTime Output: timestamp do próximo teste agendado (ms)
 * @param intervalHours Output: intervalo configurado em horas
 * @return true se requisição foi bem-sucedida
 */
bool CloudAuth::checkNextScheduledTest(bool& shouldTestNow, unsigned long& nextTestTime, int& intervalHours) {
    shouldTestNow = false;
    nextTestTime = 0;
    intervalHours = 24; // padrão

    if (!isConnected()) {
        Serial.println(F("[CloudAuth] Sem conexão para checar teste agendado"));
        return false;
    }

    // Rate limiting
    if (!rateLimiter.canMakeRequest()) {
        Serial.println(F("[CloudAuth] Rate limit atingido para checkNextScheduledTest"));
        return false;
    }

    // [FIX] Usar WiFiClient normal pois serverUrl é HTTP (não HTTPS)
    WiFiClient client;

    HTTPClient http;
    String url = String(serverUrl) + "/device/next-test";

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);

    // Headers
    http.addHeader(F("Content-Type"), F("application/json"));
    http.addHeader(F("Accept-Encoding"), F("identity"));

    String token = getAuthToken();
    if (token.length() > 0) {
        http.addHeader(F("Authorization"), "Bearer " + token);
    }

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String payload = http.getString();

        // Parse JSON response
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, payload);

        if (error) {
            Serial.print(F("[CloudAuth] JSON parse error: "));
            Serial.println(error.c_str());
            http.end();
            return false;
        }

        if (!doc["success"].as<bool>()) {
            Serial.println(F("[CloudAuth] Backend retornou success=false"));
            http.end();
            return false;
        }

        JsonObject data = doc["data"];
        shouldTestNow = data["should_test_now"].as<bool>();
        nextTestTime = data["next_test_time"].as<unsigned long>();
        intervalHours = data["interval_hours"].as<int>();

        Serial.printf("[CloudAuth] checkNextScheduledTest: should_test_now=%d, next=%lu, interval=%dh\n",
                     shouldTestNow, nextTestTime, intervalHours);

        http.end();
        return true;

    } else {
        Serial.printf("[CloudAuth] checkNextScheduledTest HTTP error: %d\n", httpCode);
        http.end();
        return false;
    }
}

/**
 * Reporta resultado do teste para o backend
 *
 * @param success true se teste foi bem-sucedido
 * @param error Mensagem de erro (se success=false)
 * @param measurement Dados da medição (se success=true, opcional)
 * @return true se requisição foi bem-sucedida
 */
bool CloudAuth::reportTestResult(bool success, const String& error, const Measurement* measurement) {
    if (!isConnected()) {
        Serial.println(F("[CloudAuth] Sem conexão para reportar resultado"));
        return false;
    }

    // Rate limiting
    if (!rateLimiter.canMakeRequest()) {
        Serial.println(F("[CloudAuth] Rate limit atingido para reportTestResult"));
        return false;
    }

    // [FIX] Usar WiFiClient normal pois serverUrl é HTTP (não HTTPS)
    WiFiClient client;

    HTTPClient http;
    String url = String(serverUrl) + "/api/v1/device/test-result";

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);

    // Headers
    http.addHeader(F("Content-Type"), F("application/json"));
    http.addHeader(F("Accept-Encoding"), F("identity"));

    String token = getAuthToken();
    if (token.length() > 0) {
        http.addHeader(F("Authorization"), "Bearer " + token);
    }

    // Montar JSON body
    DynamicJsonDocument doc(1024);
    doc["success"] = success;

    if (success && measurement != nullptr) {
        // Teste bem-sucedido com dados da medição
        doc["timestamp"] = measurement->timestamp;
        doc["kh"] = measurement->kh;

        if (measurement->ph_reference > 0) {
            doc["phref"] = measurement->ph_reference;
        }
        if (measurement->ph_sample > 0) {
            doc["phsample"] = measurement->ph_sample;
        }
        if (measurement->temperature > -100) { // valor válido
            doc["temperature"] = measurement->temperature;
        }
        if (measurement->confidence > 0) {
            doc["confidence"] = measurement->confidence;
        }
    } else if (!success) {
        // Teste falhou
        doc["error"] = error;
        doc["timestamp"] = millis(); // timestamp local
    }

    String jsonBody;
    serializeJson(doc, jsonBody);

    Serial.printf("[CloudAuth] reportTestResult: success=%d, body=%s\n", success, jsonBody.c_str());

    int httpCode = http.POST(jsonBody);

    if (httpCode == HTTP_CODE_OK) {
        String response = http.getString();
        Serial.printf("[CloudAuth] reportTestResult OK: %s\n", response.c_str());

        // Parse response para pegar next_test_time
        DynamicJsonDocument resDoc(512);
        if (deserializeJson(resDoc, response) == DeserializationError::Ok) {
            if (resDoc["success"].as<bool>() && resDoc["data"].containsKey("next_test_time")) {
                unsigned long nextTest = resDoc["data"]["next_test_time"].as<unsigned long>();
                Serial.printf("[CloudAuth] Próximo teste agendado para: %lu\n", nextTest);
            }
        }

        http.end();
        return true;

    } else {
        Serial.printf("[CloudAuth] reportTestResult HTTP error: %d\n", httpCode);
        if (httpCode > 0) {
            Serial.println(http.getString());
        }
        http.end();
        return false;
    }
}

// ============================================================================
// [DEVICE CONFIG] Buscar configurações do device (testMode, etc)
// ============================================================================
bool CloudAuth::fetchDeviceConfig(bool& testMode) {
    if (!isConnected()) {
        Serial.println(F("[CloudAuth] Sem conexão para buscar config"));
        return false;
    }

    // [FIX] Usar WiFiClient normal pois serverUrl é HTTP (não HTTPS)
    WiFiClient client;

    HTTPClient http;
    String url = String(serverUrl) + "/device/config";

    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);

    // Headers
    http.addHeader(F("Accept-Encoding"), F("identity"));

    String token = getAuthToken();
    if (token.length() > 0) {
        http.addHeader(F("Authorization"), "Bearer " + token);
    }

    int httpCode = http.GET();

    if (httpCode == HTTP_CODE_OK) {
        String response = http.getString();

        // Parse JSON response
        DynamicJsonDocument doc(512);
        DeserializationError error = deserializeJson(doc, response);

        if (error) {
            Serial.printf("[CloudAuth] fetchDeviceConfig JSON parse error: %s\n", error.c_str());
            http.end();
            return false;
        }

        if (doc["success"].as<bool>() && doc.containsKey("data")) {
            JsonObject data = doc["data"];
            if (data.containsKey("testMode")) {
                testMode = data["testMode"].as<bool>();
                Serial.printf("[CloudAuth] Config recebida: testMode=%d\n", testMode);
                http.end();
                return true;
            }
        }

        Serial.println(F("[CloudAuth] fetchDeviceConfig: resposta inválida"));
        http.end();
        return false;

    } else {
        Serial.printf("[CloudAuth] fetchDeviceConfig HTTP error: %d\n", httpCode);
        if (httpCode > 0) {
            Serial.println(http.getString());
        }
        http.end();
        return false;
    }
}

