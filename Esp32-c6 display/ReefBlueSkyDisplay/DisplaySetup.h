/**
 * ReefBlueSky Display - Setup via Access Point
 * 
 * Configuração inicial de WiFi e credenciais via portal web
 */

#ifndef DISPLAY_SETUP_H
#define DISPLAY_SETUP_H
#define NVS_EMAIL           "email"
#define NVS_ACCOUNT_PASS    "accPass"
#define NVS_MAIN_DEVICE_ID  "mainDev"


#include <Arduino.h>
#include <WiFi.h>
#include <FS.h>
using fs::FS;   // “alias” para compatibilizar com WebServer.h
#include <WebServer.h>
#include <nvs_flash.h>
#include <nvs.h>

// [CONFIG] Access Point
#define AP_SSID "ReefBlueSky-Display"
#define AP_PASSWORD "reefbluesky123"
#define AP_IP 192, 168, 4, 1
#define AP_GATEWAY 192, 168, 4, 1
#define AP_SUBNET 255, 255, 255, 0

// [NVS] Armazenamento
#define NVS_NAMESPACE "display"
#define NVS_SSID "ssid"
#define NVS_PASSWORD "password"

/**
 * [SETUP] Estrutura para credenciais
 */
struct DisplayCredentials {
    String ssid;
    String password;
    String email;
    String password_account;
    String mainDeviceId;
};

/**
 * [SETUP] Gerenciador de configuração
 */
class DisplaySetup {
private:
    WebServer server;
    bool setupComplete = false;
    DisplayCredentials credentials;
    
public:
    DisplaySetup() : server(80) {}
    
    /**
     * [INIT] Iniciar modo setup (Access Point)
     */
    void beginSetup() {
        Serial.println("[SETUP] Iniciando modo Setup...");
        
        // [AP] Criar Access Point
        WiFi.mode(WIFI_AP);
        WiFi.softAPConfig(
            IPAddress(AP_IP),
            IPAddress(AP_GATEWAY),
            IPAddress(AP_SUBNET)
        );
        
        if (WiFi.softAP(AP_SSID, AP_PASSWORD)) {
            Serial.printf("[SETUP] ✅ AP criado: %s\n", AP_SSID);
            Serial.printf("[SETUP] IP: %s\n", WiFi.softAPIP().toString().c_str());
        } else {
            Serial.println("[SETUP] ❌ Falha ao criar AP");
            return;
        }
        
        // [WEB] Configurar rotas
        setupWebServer();
        
        // [START] Iniciar servidor
        server.begin();
        Serial.println("[SETUP] Servidor web iniciado em http://192.168.4.1");
    }
    
    /**
     * [HANDLE] Processar requisições do cliente
     */
    void handleClient() {
        server.handleClient();
    }
    
    /**
     * [CHECK] Verificar se setup foi concluído
     */
    bool isSetupComplete() const {
        return setupComplete;
    }
    
    /**
     * [GET] Obter credenciais configuradas
     */
    DisplayCredentials getCredentials() const {
        return credentials;
    }
    
    /**
     * [SAVE] Salvar credenciais em NVS
     */
    void saveCredentials() {
        nvs_handle_t handle;
        esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
        if (err != ESP_OK) {
            Serial.printf("[SETUP] Erro ao abrir NVS (saveCredentials): %d\n", err);
            return;
        }

        nvs_set_blob(handle, NVS_SSID,
                    credentials.ssid.c_str(),
                    credentials.ssid.length() + 1);

        nvs_set_blob(handle, NVS_PASSWORD,
                    credentials.password.c_str(),
                    credentials.password.length() + 1);

        nvs_set_blob(handle, NVS_EMAIL,
                    credentials.email.c_str(),
                    credentials.email.length() + 1);

        nvs_set_blob(handle, NVS_ACCOUNT_PASS,
                    credentials.password_account.c_str(),
                    credentials.password_account.length() + 1);

        nvs_set_blob(handle, NVS_MAIN_DEVICE_ID,
                    credentials.mainDeviceId.c_str(),
                    credentials.mainDeviceId.length() + 1);

        nvs_commit(handle);
        nvs_close(handle);

        Serial.println("[SETUP] ✅ Credenciais salvas em NVS");
}

    
    /**
     * [LOAD] Carregar credenciais de NVS
     */
    bool loadCredentials() {
        nvs_handle_t handle;
        esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
        if (err != ESP_OK) {
            Serial.printf("[SETUP] Erro ao abrir NVS (loadCredentials): %d\n", err);
            return false;
        }

        size_t required_size = 0;
        // SSID
        nvs_get_blob(handle, NVS_SSID, NULL, &required_size);
        if (required_size > 0) {
            uint8_t* buffer = (uint8_t*)malloc(required_size);
            if (buffer) {
                nvs_get_blob(handle, NVS_SSID, buffer, &required_size);
                credentials.ssid = String((char*)buffer);
                free(buffer);
            }
        }

        // PASSWORD
        required_size = 0;
        nvs_get_blob(handle, NVS_PASSWORD, NULL, &required_size);
        if (required_size > 0) {
            uint8_t* buffer = (uint8_t*)malloc(required_size);
            if (buffer) {
                nvs_get_blob(handle, NVS_PASSWORD, buffer, &required_size);
                credentials.password = String((char*)buffer);
                free(buffer);
            }
        }

        // EMAIL (opcional)
        required_size = 0;
        nvs_get_blob(handle, NVS_EMAIL, NULL, &required_size);
        if (required_size > 0) {
            uint8_t* buffer = (uint8_t*)malloc(required_size);
            if (buffer) {
                nvs_get_blob(handle, NVS_EMAIL, buffer, &required_size);
                credentials.email = String((char*)buffer);
                free(buffer);
            }
        }

        // ACCOUNT PASSWORD (opcional)
        required_size = 0;
        nvs_get_blob(handle, NVS_ACCOUNT_PASS, NULL, &required_size);
        if (required_size > 0) {
            uint8_t* buffer = (uint8_t*)malloc(required_size);
            if (buffer) {
                nvs_get_blob(handle, NVS_ACCOUNT_PASS, buffer, &required_size);
                credentials.password_account = String((char*)buffer);
                free(buffer);
            }
        }

        // MAIN DEVICE ID (opcional)
        required_size = 0;
        nvs_get_blob(handle, NVS_MAIN_DEVICE_ID, NULL, &required_size);
        if (required_size > 0) {
            uint8_t* buffer = (uint8_t*)malloc(required_size);
            if (buffer) {
                nvs_get_blob(handle, NVS_MAIN_DEVICE_ID, buffer, &required_size);
                credentials.mainDeviceId = String((char*)buffer);
                free(buffer);
            }
        }

        nvs_close(handle);

        return (credentials.ssid.length() > 0 && credentials.password.length() > 0);
    }

    
    /**
     * [STOP] Parar modo setup
     */
    void endSetup() {
        server.stop();
        WiFi.softAPdisconnect(true);
        Serial.println("[SETUP] Modo setup finalizado");
    }

private:
    /**
     * [WEB] Configurar rotas do servidor web
     */
    void setupWebServer() {
        // [GET] Página inicial
        server.on("/", HTTP_GET, [this]() {
            handleRoot();
        });
        
        // [POST] Submissão do formulário
        server.on("/config", HTTP_POST, [this]() {
            handleConfig();
        });
        
        // [FALLBACK] 404
        server.onNotFound([this]() {
            server.send(404, "text/plain", "Not Found");
        });
    }
    
    /**
     * [HANDLER] Página inicial
     */
    void handleRoot() {
        String html = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReefBlueSky Display Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 400px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #0284c7;
            margin-bottom: 10px;
            font-size: 28px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 600;
            font-size: 14px;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #0284c7;
        }
        button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #0284c7 0%, #7c3aed 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
        }
        button:active {
            transform: translateY(0);
        }
        .info {
            background: #f0f9ff;
            border-left: 4px solid #0284c7;
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 13px;
            color: #0c4a6e;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🌊 ReefBlueSky</h1>
        <div class="subtitle">Display Setup</div>
        
        <div class="info">
            Configure seu display para conectar ao WiFi e ao servidor ReefBlueSky
        </div>
        
        <form action="/config" method="POST">
            <div class="form-group">
                <label for="ssid">SSID WiFi</label>
                <input type="text" id="ssid" name="ssid" placeholder="Seu WiFi" required>
            </div>
            
            <div class="form-group">
                <label for="password">Senha WiFi</label>
                <input type="password" id="password" name="password" placeholder="Senha" required>
            </div>
            
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" placeholder="seu-email@exemplo.com" required>
            </div>
            
            <div class="form-group">
                <label for="account_password">Senha Conta</label>
                <input type="password" id="account_password" name="account_password" placeholder="Senha da conta" required>
            </div>
            
            <div class="form-group">
                <label for="device_id">ID Dispositivo Principal (opcional)</label>
                <input type="text" id="device_id" name="device_id" placeholder="esp32-device-001">
            </div>
            
            <button type="submit">Configurar</button>
        </form>
    </div>
</body>
</html>
        )";
        
        server.send(200, "text/html; charset=utf-8", html);
    }
    
    /**
     * [HANDLER] Processar configuração
     */
    void handleConfig() {
        // [PARSE] Parâmetros
        if (server.hasArg("ssid")) {
            credentials.ssid = server.arg("ssid");
        }
        if (server.hasArg("password")) {
            credentials.password = server.arg("password");
        }
        if (server.hasArg("email")) {
            credentials.email = server.arg("email");
        }
        if (server.hasArg("account_password")) {
            credentials.password_account = server.arg("account_password");
        }
        if (server.hasArg("device_id")) {
            credentials.mainDeviceId = server.arg("device_id");
        }
        
        // [VALIDATE] Validar
        if (credentials.ssid.length() == 0 || credentials.password.length() == 0 ||
            credentials.email.length() == 0 || credentials.password_account.length() == 0) {
            
            String response = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Erro</title>
    <style>
        body { font-family: sans-serif; padding: 20px; text-align: center; }
        .error { color: #b91c1c; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>Erro</h1>
    <p class="error">Todos os campos são obrigatórios!</p>
    <a href="/">Voltar</a>
</body>
</html>
            )";
            server.send(400, "text/html; charset=utf-8", response);
            return;
        }
        
        // [SAVE] Salvar credenciais
        saveCredentials();
        setupComplete = true;
        
        // [RESPONSE] Resposta de sucesso
        String response = R"(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Sucesso</title>
    <style>
        body { font-family: sans-serif; padding: 20px; text-align: center; }
        .success { color: #10b981; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>✅ Configurado!</h1>
    <p class="success">Display será reiniciado em 3 segundos...</p>
</body>
</html>
        )";
        server.send(200, "text/html; charset=utf-8", response);
        
        // [DELAY] Aguardar e reiniciar
        delay(3000);
        ESP.restart();
    }
};

#endif  // DISPLAY_SETUP_H
