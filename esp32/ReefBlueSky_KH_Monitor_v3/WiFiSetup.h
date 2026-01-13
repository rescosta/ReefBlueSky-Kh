#ifndef WIFISETUP_H
#define WIFISETUP_H

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <DNSServer.h>


// ============================================================================
// [ONBOARDING] Sistema de Configuração Inicial via Access Point (AP) WiFi
// ============================================================================

/**
 * WiFiSetup: Sistema completo de onboarding para ESP32
 * 
 * Funcionalidades:
 * 1. Na primeira inicialização, cria um Access Point (AP) WiFi
 * 2. Exibe página HTML com formulário de configuração
 * 3. Usuário insere: SSID/senha do WiFi + credenciais do servidor
 * 4. ESP32 conecta ao WiFi e registra no servidor
 * 5. Armazena configuração em SPIFFS de forma segura
 * 
 * Fluxo:
 * [Primeira vez] → Criar AP "ReefBlueSkyKH-Setup" → Usuário acessa 192.168.4.1
 *              → Preenche formulário → Conecta ao WiFi → Registra no servidor
 * [Próximas vezes] → Carregar configuração → Conectar ao WiFi automaticamente
 */

class WiFiSetup {
private:
    WebServer server;
    DNSServer dnsServer;
    static constexpr byte DNS_PORT = 53;

    // Multi‑SSID + reconexão em background
    struct WiFiCred { String ssid; String password; };
    WiFiCred* networks = nullptr;
    int numNetworks = 0;
    int currentNetworkIndex = 0;
    bool portalActive = false;
    unsigned long lastReconnectTry = 0;
    static constexpr unsigned long RECONNECT_INTERVAL = 30000; // 30s
    static constexpr int CONNECT_TIMEOUT = 15000;              // 15s

    String ssid;
    String password;
    static constexpr const char* FIXED_SERVER_URL = "https://iot.reefbluesky.com.br/api/v1"; 
    String serverUsername;
    String serverPassword;
    bool configured = false;
    
    // [SEGURANÇA] Arquivo de configuração criptografado
    static constexpr const char* CONFIG_FILE = "/spiffs/wifi_config.json";
    static constexpr const char* AP_SSID = "ReefBlueSkyKH-Setup";
    static constexpr const char* AP_PASSWORD = "12345678";
    
    // [ONBOARDING] Página HTML do formulário de configuração
    String getConfigHTML() {
        return R"(
        
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReefBlueSky KH Monitor - Configuração Inicial</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            max-width: 500px;
            width: 100%;
            padding: 40px;
        }
        
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        
        .logo h1 {
            color: #333;
            font-size: 28px;
            margin-bottom: 10px;
        }
        
        .logo p {
            color: #666;
            font-size: 14px;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: 500;
            font-size: 14px;
        }
        
        input[type="text"],
        input[type="password"],
        input[type="url"] {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 5px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        
        input[type="text"]:focus,
        input[type="password"]:focus,
        input[type="url"]:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .section-title {
            font-size: 16px;
            font-weight: 600;
            color: #333;
            margin-top: 25px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }
        
        button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 30px;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 5px;
            text-align: center;
            font-size: 14px;
            display: none;
        }
        
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
            display: block;
        }
        
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
            display: block;
        }
        
        .loading {
            display: none;
            text-align: center;
            margin-top: 20px;
        }
        
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .help-text {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>🐠 ReefBlueSky</h1>
            <p>KH Monitor - Configuração Inicial</p>
        </div>
        
        <form id="configForm">
            <!-- Seção: WiFi da Casa -->
            <div class="section-title">📡 WiFi da Casa</div>
            
            <div class="form-group">
                <label for="ssidSelect">Redes WiFi disponíveis</label>
                <select id="ssidSelect"></select>
                <label for="ssid">Nome da Rede WiFi (SSID)</label>
                <input type="text" id="ssid" name="ssid" required placeholder="Ex: Meu-WiFi">
                <div class="help-text">Nome exato da sua rede WiFi</div>
            </div>
            
            <div class="form-group">
                <label for="password">Senha do WiFi</label>
                <input type="password" id="password" name="password" required placeholder="Sua senha WiFi">
                <label>
                    <input type="checkbox" id="showPassWifi"> Mostrar senha
                </label>
                <div class="help-text">Senha da sua rede WiFi (não será exibida)</div>
            </div>
            
            <div class="form-group">
                <label for="serverUsername">Usuário/Email</label>
                <input type="text" id="serverUsername" name="serverUsername" required placeholder="seu@email.com">
                <div class="help-text">Usuário ou email registrado no servidor</div>
            </div>
            
            <div class="form-group">
                <label for="serverPassword">Senha do Servidor</label>
                <input type="password" id="serverPassword" name="serverPassword" required placeholder="Sua senha">
                <label>
                    <input type="checkbox" id="showPassServer"> Mostrar senha
                </label>
                <div class="help-text">Senha da sua conta no servidor</div>
            </div>
            
            <!-- Botão de Envio -->
            <button type="submit">✓ Conectar e Registrar</button>
            
            <!-- Status -->
            <div id="status" class="status"></div>
            
            <!-- Loading -->
            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>Conectando ao WiFi e registrando no servidor...</p>
            </div>
        </form>
    </div>
    
<script>
  // Envio do formulário
  document.getElementById('configForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusDiv = document.getElementById('status');
    const loadingDiv = document.getElementById('loading');
    const button = document.querySelector('button');

    const config = {
      ssid: document.getElementById('ssid').value,
      password: document.getElementById('password').value,
      serverUsername: document.getElementById('serverUsername').value,
      serverPassword: document.getElementById('serverPassword').value
    };

    loadingDiv.style.display = 'block';
    button.disabled = true;
    statusDiv.style.display = 'none';

    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      loadingDiv.style.display = 'none';

      if (response.ok && result.success) {
        statusDiv.className = 'status success';
        statusDiv.innerHTML = '✓ Configuração salva! Reiniciando em 5 segundos...';
        statusDiv.style.display = 'block';
        setTimeout(() => { window.location.href = '/'; }, 5000);
      } else {
        statusDiv.className = 'status error';
        statusDiv.innerHTML = '✗ Erro: ' + (result.message || 'Falha na configuração');
        statusDiv.style.display = 'block';
        button.disabled = false;
      }
    } catch (error) {
      loadingDiv.style.display = 'none';
      statusDiv.className = 'status error';
      statusDiv.innerHTML = '✗ Erro de conexão: ' + error.message;
      statusDiv.style.display = 'block';
      button.disabled = false;
    }
  });

  // Mostrar/ocultar senhas + carregar redes
  document.addEventListener('DOMContentLoaded', () => {
    const passWifi = document.getElementById('password');
    const passServer = document.getElementById('serverPassword');

    document.getElementById('showPassWifi').addEventListener('change', (e) => {
      passWifi.type = e.target.checked ? 'text' : 'password';
    });

    document.getElementById('showPassServer').addEventListener('change', (e) => {
      passServer.type = e.target.checked ? 'text' : 'password';
    });

    loadNetworks();
  });

  // Buscar redes WiFi disponíveis
  async function loadNetworks() {
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      const select = document.getElementById('ssidSelect');
      select.innerHTML = '';
      data.networks.forEach(ssid => {
        const opt = document.createElement('option');
        opt.value = ssid;
        opt.textContent = ssid;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => {
        document.getElementById('ssid').value = select.value;
      });
    } catch (e) {
      console.error(e);
    }
  }
</script>

</body>
</html>
        )";
    }
    
    // [SEGURANÇA] Métodos privados
    bool saveConfigToSPIFFS(const DynamicJsonDocument& config);
    bool loadConfigFromSPIFFS();
    void handleConfigSubmit();
    void handleStatus();
    void tryReconnect();
    
public:
    WiFiSetup() : server(80) {}
    
    // [ONBOARDING] Inicializar sistema de configuração
    bool begin();
    
    // [ONBOARDING] Criar Access Point para configuração inicial
    bool createAccessPoint();
    
    // [ONBOARDING] Conectar ao WiFi usando configuração salva
    bool connectToWiFi();
    
    // [ONBOARDING] Processar requisições HTTP do servidor web
    void handleClient();
    void loopReconnect();  
    
    // [ONBOARDING] Verificar se dispositivo já foi configurado
    bool isConfigured() const { return configured; }
    
    // [ONBOARDING] Obter configurações
    String getSSID() const { return ssid; }
    String getPassword() const { return password; }
    String getServerUsername() const { return serverUsername; }
    String getServerPassword() const { return serverPassword; }

    bool isPortalActive() const { return portalActive; }
    void closePortalIfActive() {
    if (!portalActive) return;
    dnsServer.stop();
    WiFi.softAPdisconnect(true);
    portalActive = false;
    Serial.println("[WiFiSetup] Portal fechado (auto, detectado pelo main).");
    }


};

#endif // WIFISETUP_H
