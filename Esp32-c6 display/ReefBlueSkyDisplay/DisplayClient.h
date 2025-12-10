/**
 * ReefBlueSky Display - Cliente de Comunicação
 * 
 * Gerencia comunicação HTTPS com servidor backend
 * Autenticação JWT, renovação de tokens e busca de dados KH
 */

#ifndef DISPLAY_CLIENT_H
#define DISPLAY_CLIENT_H
#define NVS_MAIN_DEVICE_IP "mainDeviceIp"


#include "idf_compat.h"

#include <Arduino.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <nvs_flash.h>
#include <nvs.h>

// [CONFIG] Servidor
#define DISPLAY_SERVER "seu-dominio.com"
#define DISPLAY_PORT 443
#define DISPLAY_TIMEOUT 10000  // 10 segundos

// [CONFIG] NVS
#define NVS_NAMESPACE "display"
#define NVS_DISPLAY_TOKEN "displayToken"
#define NVS_REFRESH_TOKEN "refreshToken"
#define NVS_TOKEN_EXPIRY "tokenExpiry"
#define NVS_MAIN_DEVICE_ID "mainDeviceId"
#define NVS_USER_ID "userId"

/**
 * [DISPLAY] Estrutura para dados de medição
 */
struct KHMeasurement {
    float kh;
    float min_kh;
    float max_kh;
    float variance;
    float temperature;
    float ph_ref;
    float ph_sample;
    unsigned long timestamp;
    String status;
    float confidence;
};

/**
 * [DISPLAY] Cliente de comunicação com servidor
 */
class DisplayClient {
private:
    WiFiClientSecure wifiClient;
    HTTPClient http;
    
    // [AUTH] Tokens
    String displayToken;
    String refreshToken;
    unsigned long tokenExpiry;
    
    // [CONFIG] Dispositivo
    String mainDeviceId;
    String mainDeviceIp; 
    uint32_t userId;
    
    // [STATUS] Conexão
    bool connected = false;
    unsigned long lastSyncTime = 0;
    
    // [CACHE] Última medição
    KHMeasurement lastMeasurement;
    bool hasCachedData = false;
    
public:
        DisplayClient()
        :   displayToken(""),
            refreshToken(""),
            tokenExpiry(0),
            mainDeviceId(""),
            mainDeviceIp(""),
            userId(0),
            connected(false),
            lastSyncTime(0),
            hasCachedData(false)
        {}


    /**
     * [INIT] Inicializar cliente
     */
    void begin() {
        Serial.println("[DISPLAY] Inicializando DisplayClient...");
        
        // [CONFIG] SSL/TLS
        wifiClient.setInsecure();  // TODO: Usar setCACert() com certificado válido
        
        // [NVS] Carregar tokens
        loadTokensFromNVS();
        
        Serial.println("[DISPLAY] DisplayClient pronto");
    }
    
    /**
     * [AUTH] Registrar display no servidor
     */
    bool registerDisplay(const String& email, const String& password, 
                        const String& displayId, const String& mainDevice = "") {
        Serial.printf("[DISPLAY] Registrando display: %s\n", displayId.c_str());
        
        // [JSON] Preparar payload
        DynamicJsonDocument doc(512);
        doc["email"] = email;
        doc["password"] = password;
        doc["displayId"] = displayId;
        doc["deviceType"] = "display";
        if (mainDevice.length() > 0) {
            doc["mainDeviceId"] = mainDevice;
        }
        
        String payload;
        serializeJson(doc, payload);
        
        // [HTTPS] Fazer requisição
        String url = String("https://") + DISPLAY_SERVER + "/api/display/register";
        http.begin(wifiClient, url);
        http.setTimeout(DISPLAY_TIMEOUT);
        http.addHeader("Content-Type", "application/json");
        
        int httpCode = http.POST(payload);
        
        if (httpCode == 200) {
            // [PARSE] Resposta
            String response = http.getString();
            DynamicJsonDocument responseDoc(1024);
            deserializeJson(responseDoc, response);
            
            // [STORE] Tokens
            displayToken = responseDoc["displayToken"].as<String>();
            refreshToken = responseDoc["refreshToken"].as<String>();
            unsigned long expiresIn = responseDoc["expiresIn"].as<unsigned long>();
            
            // [CALC] Tempo de expiração
            tokenExpiry = millis() / 1000 + expiresIn;
            
            // [SAVE] Em NVS
            saveTokensToNVS();
            
            // [STORE] Dispositivo principal
            if (responseDoc["mainDevices"].size() > 0) {
                mainDeviceId = responseDoc["mainDevices"][0]["id"].as<String>();
                saveMainDeviceToNVS();
            }
            
            connected = true;
            Serial.println("[DISPLAY] ✅ Registrado com sucesso!");
            http.end();
            return true;
        } else {
            Serial.printf("[DISPLAY] ❌ Erro no registro: %d\n", httpCode);
            String response = http.getString();
            Serial.printf("[DISPLAY] Resposta: %s\n", response.c_str());
            http.end();
            return false;
        }
    }
    
    /**
     * [FETCH] Obter última medição de KH
     */
    bool getLatestKH(KHMeasurement& measurement) {
        // [AUTH] Verificar token
        if (isTokenExpired()) {
            if (!refreshTokenIfNeeded()) {
                Serial.println("[DISPLAY] ❌ Token expirado e renovação falhou");
                return false;
            }
        }
        
        if (mainDeviceId.length() == 0) {
            Serial.println("[DISPLAY] ❌ mainDeviceId não configurado");
            return false;
        }
        
        // [HTTPS] Fazer requisição
        String url = String("https://") + DISPLAY_SERVER + "/api/display/latest?deviceId=" + mainDeviceId;
        http.begin(wifiClient, url);
        http.setTimeout(DISPLAY_TIMEOUT);
        http.addHeader("Authorization", "Bearer " + displayToken);
        
        int httpCode = http.GET();
        
        if (httpCode == 200) {
            // [PARSE] Resposta
            String response = http.getString();
            DynamicJsonDocument doc(512);
            deserializeJson(doc, response);
            
            // [EXTRACT] Dados
            measurement.kh = doc["kh"].as<float>();
            measurement.min_kh = doc["min"].as<float>();
            measurement.max_kh = doc["max"].as<float>();
            measurement.variance = doc["var"].as<float>();
            measurement.temperature = doc["temp"].as<float>();
            measurement.ph_ref = doc["ph_ref"].as<float>();
            measurement.ph_sample = doc["ph_sample"].as<float>();
            measurement.timestamp = doc["timestamp"].as<unsigned long>();
            measurement.status = doc["status"].as<String>();
            measurement.confidence = doc["confidence"].as<float>();
            
            // [CACHE] Guardar
            lastMeasurement = measurement;
            hasCachedData = true;
            lastSyncTime = millis();
            
            Serial.printf("[DISPLAY] ✅ KH: %.2f\n", measurement.kh);
            http.end();
            return true;
        } else {
            Serial.printf("[DISPLAY] ❌ Erro ao buscar KH: %d\n", httpCode);
            http.end();
            return false;
        }
    }
    
    /**
     * [CACHE] Obter última medição em cache
     */
    bool getCachedMeasurement(KHMeasurement& measurement) {
        if (hasCachedData) {
            measurement = lastMeasurement;
            return true;
        }
        return false;
    }
    
    /**
     * [AUTH] Renovar token se expirado
     */
    bool refreshTokenIfNeeded() {
        if (!isTokenExpired()) {
            return true;  // Token ainda válido
        }
        
        Serial.println("[DISPLAY] Renovando token...");
        
        // [JSON] Preparar payload
        DynamicJsonDocument doc(256);
        doc["refreshToken"] = refreshToken;
        
        String payload;
        serializeJson(doc, payload);
        
        // [HTTPS] Fazer requisição
        String url = String("https://") + DISPLAY_SERVER + "/api/display/refresh";
        http.begin(wifiClient, url);
        http.setTimeout(DISPLAY_TIMEOUT);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " + displayToken);
        
        int httpCode = http.POST(payload);
        
        if (httpCode == 200) {
            // [PARSE] Resposta
            String response = http.getString();
            DynamicJsonDocument responseDoc(512);
            deserializeJson(responseDoc, response);
            
            // [UPDATE] Token
            displayToken = responseDoc["displayToken"].as<String>();
            unsigned long expiresIn = responseDoc["expiresIn"].as<unsigned long>();
            tokenExpiry = millis() / 1000 + expiresIn;
            
            // [SAVE] Em NVS
            saveTokensToNVS();
            
            Serial.println("[DISPLAY] ✅ Token renovado!");
            http.end();
            return true;
        } else {
            Serial.printf("[DISPLAY] ❌ Erro ao renovar token: %d\n", httpCode);
            http.end();
            return false;
        }
    }
    
    /**
     * [STATUS] Verificar se está conectado
     */
    bool isConnected() const {
        return connected && WiFi.status() == WL_CONNECTED;
    }
    
    /**
     * [STATUS] Obter tempo desde última sincronização
     */
    unsigned long getTimeSinceLastSync() const {
        if (lastSyncTime == 0) return 0;
        return (millis() - lastSyncTime) / 1000;
    }
    
    /**
     * [CONFIG] Definir dispositivo principal
     */
    void setMainDeviceId(const String& deviceId) {
        mainDeviceId = deviceId;
        saveMainDeviceToNVS();
    }
 
    /**
     * [CONFIG] Obter dispositivo principal
     */
    String getMainDeviceId() const {
        return mainDeviceId;
    }

    void setMainDeviceIp(const String& ip) {
      mainDeviceIp = ip;
      saveMainDeviceToNVS();
    }
  
    String getMainDeviceIp() const {
      return mainDeviceIp;
    }

private:
    /**
     * [AUTH] Verificar se token está expirado
     */
    bool isTokenExpired() {
        if (tokenExpiry == 0) return true;
        unsigned long currentTime = millis() / 1000;
        return currentTime > tokenExpiry;
    }
    
    /**
     * [NVS] Carregar tokens de armazenamento
     */
void loadTokensFromNVS() {
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        Serial.printf("[DISPLAY] Erro ao abrir NVS (loadTokensFromNVS): %d\n", err);
        return;
    }

    // [NVS] Carregar token
    size_t required_size = 0;
    nvs_get_blob(handle, NVS_DISPLAY_TOKEN, NULL, &required_size);
    if (required_size > 0) {
        uint8_t* buffer = (uint8_t*)malloc(required_size);
        if (buffer) {
            nvs_get_blob(handle, NVS_DISPLAY_TOKEN, buffer, &required_size);
            displayToken = String((char*)buffer);
            free(buffer);
        }
    }

    // [NVS] Carregar mainDeviceIp
    size_t ipSize = 0;
    nvs_get_blob(handle, NVS_MAIN_DEVICE_IP, NULL, &ipSize);
    if (ipSize > 0) {
        uint8_t* buffer = (uint8_t*)malloc(ipSize);
        if (buffer) {
            nvs_get_blob(handle, NVS_MAIN_DEVICE_IP, buffer, &ipSize);
            mainDeviceIp = String((char*)buffer);
            free(buffer);
        }
    }

    // [NVS] Carregar refresh token
    required_size = 0;
    nvs_get_blob(handle, NVS_REFRESH_TOKEN, NULL, &required_size);
    if (required_size > 0) {
        uint8_t* buffer = (uint8_t*)malloc(required_size);
        if (buffer) {
            nvs_get_blob(handle, NVS_REFRESH_TOKEN, buffer, &required_size);
            refreshToken = String((char*)buffer);
            free(buffer);
        }
    }

    // [NVS] Carregar tempo de expiração
    nvs_get_u32(handle, NVS_TOKEN_EXPIRY, &tokenExpiry);

    // [NVS] Carregar dispositivo principal
    size_t mainDeviceSize = 0;
    nvs_get_blob(handle, NVS_MAIN_DEVICE_ID, NULL, &mainDeviceSize);
    if (mainDeviceSize > 0) {
        uint8_t* buffer = (uint8_t*)malloc(mainDeviceSize);
        if (buffer) {
            nvs_get_blob(handle, NVS_MAIN_DEVICE_ID, buffer, &mainDeviceSize);
            mainDeviceId = String((char*)buffer);
            free(buffer);
        }
    }

    // [NVS] Carregar user ID
    nvs_get_u32(handle, NVS_USER_ID, &userId);

    nvs_close(handle);

    if (displayToken.length() > 0) {
        Serial.println("[DISPLAY] ✅ Tokens carregados de NVS");
        connected = true;
    }
}

    
    /**
     * [NVS] Salvar tokens em armazenamento
     */
    void saveTokensToNVS() {
        nvs_handle_t handle;
        esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
        if (err != ESP_OK) {
            Serial.printf("[DISPLAY] Erro ao abrir NVS (saveTokensToNVS): %d\n", err);
            return;
        }

        if (displayToken.length() > 0) {
            nvs_set_blob(handle,
                        NVS_DISPLAY_TOKEN,
                        (const void*)displayToken.c_str(),
                        displayToken.length() + 1); // inclui terminador
        }

        if (refreshToken.length() > 0) {
            nvs_set_blob(handle,
                        NVS_REFRESH_TOKEN,
                        (const void*)refreshToken.c_str(),
                        refreshToken.length() + 1);
        }

        nvs_set_u32(handle, NVS_TOKEN_EXPIRY, tokenExpiry);

        nvs_commit(handle);
        nvs_close(handle);

        Serial.println("[DISPLAY] ✅ Tokens salvos em NVS");
    }

    
    /**
     * [NVS] Salvar dispositivo principal
     */
    void saveMainDeviceToNVS() {
        nvs_handle_t handle;
        esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
        if (err != ESP_OK) {
            Serial.printf("[DISPLAY] Erro ao abrir NVS (saveMainDeviceToNVS): %d\n", err);
            return;
        }

        if (mainDeviceId.length() > 0) {
            nvs_set_blob(handle,
                        NVS_MAIN_DEVICE_ID,
                        (const void*)mainDeviceId.c_str(),
                        mainDeviceId.length() + 1);
        }

        if (mainDeviceIp.length() > 0) {
            nvs_set_blob(handle,
                        NVS_MAIN_DEVICE_IP,
                        (const void*)mainDeviceIp.c_str(),
                        mainDeviceIp.length() + 1);
        }

        nvs_commit(handle);
        nvs_close(handle);
    }

};

#endif  // DISPLAY_CLIENT_H
