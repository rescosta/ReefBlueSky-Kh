//CloudAuth.h

#ifndef CLOUDAUTH_H
#define CLOUDAUTH_H

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <nvs_flash.h>
#include <nvs.h>
#include <ArduinoJson.h>
#include <vector>
#include <queue>
#include <mbedtls/aes.h>
#include <mbedtls/base64.h>
#include <stdint.h>

extern const char* CLOUD_BASE_URL;


// ============================================================================
// [SEGURANÇA] Estruturas de Dados para Autenticação e Comunicação
// ============================================================================

struct Measurement {
    uint64_t timestamp;
    uint64_t startedAt;   
    float kh;
    float ph_reference;
    float ph_sample;
    float temperature;
    bool is_valid;
    float confidence;
};

struct DeviceStatus {
    bool pump1_running;
    bool pump2_running;
    bool pump3_running;
    bool pump4_running;
    String sensor_ph_status;
    String sensor_temp_status;
    String sensor_level_status;
    int battery_level;
    int storage_used;
    unsigned long uptime;
};

struct SystemHealth {
    float cpu_usage;
    float memory_usage;
    float spiffs_usage;
    int wifi_signal_strength;
    int failed_sync_attempts;
    unsigned long uptime;
    float voltage_supply;

    // [FIX] Dados dos sensores em tempo real
    int level_a;
    int level_b;
    int level_c;
    float temperature;
    float ph;
};

struct Command {
    String command_id;
    String action;
    StaticJsonDocument<256> paramsDoc;
    JsonObject params;

    Command() : paramsDoc(), params() {}   // só zera, sem mexer no doc
};


// ============================================================================
// [SEGURANÇA] Rate Limiter para Proteção contra DoS
// ============================================================================

class RateLimiter {
private:
    unsigned long lastRequestTime = 0;
    unsigned long minIntervalMs = 500;  // Mínimo 500ms entre requisições
    int requestCount = 0;
    unsigned long windowStart = 0;
    static constexpr int MAX_REQUESTS_PER_MINUTE = 60;
    
public:
    bool canMakeRequest() {
        unsigned long now = millis();
        
        // Resetar janela se passou 1 minuto
        if (now - windowStart > 60000) {
            windowStart = now;
            requestCount = 0;
        }
        
        // Verificar limite de requisições por minuto
        if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
            Serial.printf("[RateLimiter] Limite de %d requisições/minuto atingido\n", MAX_REQUESTS_PER_MINUTE);
            return false;
        }
        
        // Verificar intervalo mínimo entre requisições
        if (now - lastRequestTime < minIntervalMs) {
            return false;
        }
        
        lastRequestTime = now;
        requestCount++;
        return true;
    }

    int getRequestCount() const { return requestCount; }
    int getMaxRequests() const { return MAX_REQUESTS_PER_MINUTE; }
};

// ============================================================================
// [SEGURANÇA] Exponential Backoff para Retentativas
// ============================================================================

class ExponentialBackoff {
private:
    int failureCount = 0;
    unsigned long nextRetryTime = 0;
    unsigned long baseDelayMs = 2000;      // 2 segundos inicial
    unsigned long maxDelayMs = 300000;     // 5 minutos máximo

public:
    bool shouldRetry() {
        unsigned long now = millis();
        if (now < nextRetryTime) {
            return false;
        }
        return true;
    }

    void recordFailure() {
        failureCount++;
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 300s (max)
        unsigned long delayMs = baseDelayMs * (1UL << min(failureCount - 1, 8));
        if (delayMs > maxDelayMs) {
            delayMs = maxDelayMs;
        }
        nextRetryTime = millis() + delayMs;
        Serial.printf("[Backoff] Falha #%d, próxima tentativa em %lu ms\n", failureCount, delayMs);
    }

    void recordSuccess() {
        if (failureCount > 0) {
            Serial.printf("[Backoff] Sucesso após %d falhas, resetando backoff\n", failureCount);
        }
        failureCount = 0;
        nextRetryTime = 0;
    }

    void reset() {
        failureCount = 0;
        nextRetryTime = 0;
    }

    int getFailureCount() const { return failureCount; }
    unsigned long getNextRetryTime() const { return nextRetryTime; }

    unsigned long getTimeUntilRetry() const {
        unsigned long now = millis();
        if (now >= nextRetryTime) return 0;
        return nextRetryTime - now;
    }
};

// ============================================================================
// [SEGURANÇA] Validador de Comandos com Whitelist
// ============================================================================




class CommandValidator {
private:
    static constexpr const char* ALLOWED_COMMANDS[] = {
        "startMeasurement",
        "stopMeasurement",
        "calibrateReference",
        "setMeasurementInterval",
        "factoryReset",
        "resetKH",
        "getStatus",
        "syncNow",
        "restart",      
        "factoryreset", 
        "manualpump",     
        "khcorrection",
        "setkhreference",
        "setintervalminutes",  
        "testmode",
        "testnow", 
        "abort",
        "pump4calibrate",
        "setpump4mlpersec",
        "setkhtarget",
        "fake_measurement",
        "otaupdate",
        "khcalibrate", 
        "testpump",   
        "systemflush",    
        "fillchamber"
    };
    static constexpr int ALLOWED_COUNT = 
        sizeof(ALLOWED_COMMANDS) / sizeof(ALLOWED_COMMANDS[0]);

    
public:
    bool isCommandAllowed(const String& command) {
        for (int i = 0; i < ALLOWED_COUNT; i++) {
            if (command == ALLOWED_COMMANDS[i]) {
                return true;
            }
        }
        Serial.printf("[CommandValidator] Comando não permitido: %s\n", command.c_str());
        return false;
    }
    
    bool validatePayload(const JsonDocument& payload) {
        // Validar estrutura JSON
        if (!payload.containsKey("commandId") || 
            !payload.containsKey("action") ||
            !payload.containsKey("params")) {
            Serial.println("[CommandValidator] Payload inválido: campos obrigatórios faltando");
            return false;
        }
        
        // Validar tipos de dados
        if (!payload["commandId"].is<String>() ||
            !payload["action"].is<String>() ||
            !payload["params"].is<JsonObject>()) {
            Serial.println("[CommandValidator] Payload inválido: tipos de dados incorretos");
            return false;
        }
        
        // Validar tamanho máximo do payload (1KB)
        size_t payloadSize = measureJson(payload);
        if (payloadSize > 1024) {
            Serial.printf("[CommandValidator] Payload muito grande: %d bytes\n", payloadSize);
            return false;
        }
        
        return true;
    }
};

// ============================================================================
// [SEGURANÇA] Proteção contra Replay Attacks
// ============================================================================

class ReplayProtection {
private:
    unsigned long lastRequestTimestamp = 0;
    static constexpr unsigned long MAX_TIME_SKEW = 60000;  // 1 minuto
    
public:
    bool validateTimestamp(unsigned long requestTimestamp) {
        unsigned long now = millis();
        
        // Verificar se timestamp está dentro de 1 minuto
        if (abs((long)(now - requestTimestamp)) > MAX_TIME_SKEW) {
            Serial.printf("[ReplayProtection] Timestamp fora do intervalo válido\n");
            return false;
        }
        
        // Verificar se timestamp é mais recente que última requisição
        if (requestTimestamp <= lastRequestTimestamp) {
            Serial.printf("[ReplayProtection] Possível replay attack detectado\n");
            return false;
        }
        
        lastRequestTimestamp = requestTimestamp;
        return true;
    }
};

// ============================================================================
// [SEGURANÇA] Sincronização Incremental com Checkpoint
// ============================================================================

class IncrementalSync {
private:
    unsigned long lastSyncedTimestamp = 0;
    static constexpr int CHUNK_SIZE = 100;  // Máximo 100 medições por chunk
    
public:
    unsigned long getLastSyncedTimestamp() const {
        return lastSyncedTimestamp;
    }
    
    void updateLastSyncedTimestamp(unsigned long timestamp) {
        lastSyncedTimestamp = timestamp;
        saveSyncCheckpoint();
    }
    
    void loadSyncCheckpoint() {
        nvs_handle_t handle;
        if (nvs_open("cloud_sync", NVS_READONLY, &handle) == ESP_OK) {
            nvs_get_u32(handle, "last_sync_ts", (uint32_t*)&lastSyncedTimestamp);
            nvs_close(handle);
            Serial.printf("[IncrementalSync] Checkpoint carregado: %lu\n", lastSyncedTimestamp);
        }
    }
    
    void saveSyncCheckpoint() {
        nvs_handle_t handle;
        if (nvs_open("cloud_sync", NVS_READWRITE, &handle) == ESP_OK) {
            nvs_set_u32(handle, "last_sync_ts", (uint32_t)lastSyncedTimestamp);
            nvs_commit(handle);
            nvs_close(handle);
        }
    }
    
    int getChunkSize() const {
        return CHUNK_SIZE;
    }
};

// ============================================================================
// [SEGURANÇA] Classe Principal de Autenticação e Comunicação Cloud
// ============================================================================

class CloudAuth {
private:
    String serverUrl;
    String deviceId;
    unsigned long tokenExpiry = 0;
    String refreshToken;
    
    RateLimiter rateLimiter;
    CommandValidator commandValidator;
    ReplayProtection replayProtection;
    IncrementalSync incrementalSync;
    ExponentialBackoff authBackoff;        // Backoff para falhas de autenticação
    ExponentialBackoff syncBackoff;        // Backoff para falhas de sincronização

    // [CONFIG] Timeout HTTP em milissegundos
    static constexpr int HTTP_TIMEOUT_MS = 10000;  // 10 segundos
    
    // [SEGURANÇA] Fila de medições offline
    std::queue<Measurement> offlineMeasurementQueue;
    static constexpr int MAX_QUEUE_SIZE = 1000;
    
    // [SEGURANÇA] Certificado raiz (usar setCACert() em vez de setFingerprint)
    // setFingerprint() foi deprecado no ESP32 v3.0+
    // Usar: client.setCACert(ca_cert_pem);
    const char* ca_cert = nullptr;  // Será carregado do SPIFFS ou hardcoded
    
    // [SEGURANÇA] Métodos privados
  

    String encryptToken(const String& token);
    String decryptToken(const String& encryptedToken);
    bool validateSSLCertificate();
    String compressMeasurements(const std::vector<Measurement>& measurements);
    
public:

    bool storeTokenSecurely(const String& token, const String& refreshTok, unsigned long expiry);
    bool loadTokenSecurely(String& token, String& refreshTok, unsigned long& expiry);
    void clearAllTokens();  // Limpar todos os tokens (RAM + NVS)

    void setDeviceId(const String& id) { deviceId = id; }

    CloudAuth(const char* url, const char* devId);
    
    // [BOOT] Inicializar e obter token na primeira vez
    bool init();
    
    // [SEGURANÇA] Renovar token se expirado
    bool refreshTokenIfNeeded();
    
    // [SEGURANÇA] Obter token válido para requisições
    String getAuthToken();
    String getDeviceJwt() const;
    
    // obter KH de referência do servidor, se existir
    bool fetchReferenceKH(float& outKhRef);

    // [FUNCIONALIDADE] Armazenar dados offline (se sem WiFi)
    void queueMeasurement(const Measurement& m);
    
    // [FUNCIONALIDADE] Sincronizar medições acumuladas (incremental)
    bool syncOfflineMeasurements();
    
    // [SEGURANÇA] Enviar heartbeat (ping a cada 30s)
    bool sendHeartbeat(const DeviceStatus& status);
    
    // [SEGURANÇA] Enviar métricas de saúde
    bool sendHealthMetrics(const SystemHealth& health);
    
    // [SEGURANÇA] Obter instrução do servidor (ex: start medição, calibrar)
    bool pullCommandFromServer(Command& command);
    
    // [SEGURANÇA] Confirmar execução de comando
    bool confirmCommandExecution(const String& commandId, const String& status, const String& result);
    
    // [SEGURANÇA] Verificar status de conectividade
    bool isConnected();
    
    // [SEGURANÇA] Obter estatísticas de sincronização
    int getQueueSize() const { return offlineMeasurementQueue.size(); }
    unsigned long getLastSyncTime() const { return incrementalSync.getLastSyncedTimestamp(); }

    // [BACKOFF] Métodos para controle de retentativas
    bool shouldRetryAuth() { return authBackoff.shouldRetry(); }
    bool shouldRetrySync() { return syncBackoff.shouldRetry(); }
    void resetAuthBackoff() { authBackoff.reset(); }
    void resetSyncBackoff() { syncBackoff.reset(); }
    int getAuthFailureCount() const { return authBackoff.getFailureCount(); }
    int getSyncFailureCount() const { return syncBackoff.getFailureCount(); }

    // [TEST SCHEDULE] Agendamento automático de testes
    // Verifica se deve executar teste agendado
    bool checkNextScheduledTest(bool& shouldTestNow, unsigned long& nextTestTime, int& intervalHours);

    // Reporta resultado do teste para o backend
    bool reportTestResult(bool success, const String& error, const Measurement* measurement = nullptr);

    // [DEVICE CONFIG] Buscar configurações do device (testMode, etc)
    bool fetchDeviceConfig(bool& testMode);
};

#endif // CLOUDAUTH_H
