#include "WiFiSetupDoser.h"

const char* statusName(wl_status_t st) {
  switch (st) {
    case WL_IDLE_STATUS:     return "IDLE";
    case WL_NO_SSID_AVAIL:   return "NO_SSID";
    case WL_SCAN_COMPLETED:  return "SCAN_DONE";
    case WL_CONNECTED:       return "CONNECTED";
    case WL_CONNECT_FAILED:  return "CONNECT_FAILED";
    case WL_CONNECTION_LOST: return "CONNECTION_LOST";
    case WL_DISCONNECTED:    return "DISCONNECTED";
    default:                 return "UNKNOWN";
  }
}


// ============================================================================
// ONBOARDING: Inicializar sistema WiFi
// ============================================================================

bool WiFiSetupDoser::begin() {
  Serial.println("[WiFiSetupDoser] Iniciando sistema de configuração...");

#ifdef ESP8266
  if (!SPIFFS.begin()) {
    Serial.println("[WiFiSetupDoser] ERRO: Falha ao inicializar SPIFFS");
    return false;
  }
#else
  if (!SPIFFS.begin(true)) {
    Serial.println("[WiFiSetupDoser] ERRO: Falha ao inicializar SPIFFS");
    return false;
  }
#endif

  // 1) Tenta carregar config
  if (loadConfigFromSPIFFS()) {
    Serial.println("[WiFiSetupDoser] Configuração carregada do SPIFFS");
    configured = true;

    // 2) Tenta conectar nas redes salvas
    if (connectToWiFi()) {
      return true;
    } else {
      Serial.println("[WiFiSetupDoser] Falha ao conectar em todas as redes salvas.");
      // mantém configured = true (tem config válida, só não tem rede agora)
      return createAccessPoint();
    }
  }

  // 3) Nenhuma config válida → AP direto
  Serial.println("[WiFiSetupDoser] Nenhuma configuração encontrada, criando AP...");
  return createAccessPoint();
}


// ============================================================================
// Criar Access Point com captive portal
// ============================================================================

bool WiFiSetupDoser::createAccessPoint() {
  Serial.printf("[WiFiSetupDoser] Criando Access Point: %s\n", AP_SSID);

  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.println("[WiFiSetupDoser] ERRO: Falha ao criar AP");
    return false;
  }

  IPAddress apIP = WiFi.softAPIP();
  Serial.printf("[WiFiSetupDoser] AP criado com sucesso!\n");
  Serial.printf("[WiFiSetupDoser] IP do AP: %s\n", apIP.toString().c_str());
  Serial.printf("[WiFiSetupDoser] Acesse http://%s para configurar\n", apIP.toString().c_str());

  // Iniciar DNS server para captive portal
  dnsServer.start(DNS_PORT, "*", apIP);

  // Registrar rotas HTTP (igual WiFiSetup do KH)
  server.on("/", HTTP_GET, [this]() {
    server.send(200, "text/html; charset=utf-8", getConfigHTML());
  });

  server.on("/apisetup", HTTP_POST, [this]() {
    handleConfigSubmit();
  });

  server.on("/apistatus", HTTP_GET, [this]() {
    handleStatus();
  });

  server.on("/apiscan", HTTP_GET, [this]() {
    handleScan();
  });

  server.onNotFound([this]() {
    server.send(200, "text/html; charset=utf-8", getConfigHTML());
  });

  server.begin();
  Serial.println("[WiFiSetupDoser] Servidor web iniciado na porta 80");
  portalActive = true;
  Serial.println("[WiFiSetupDoser] Portal ativo + reconexão em background");
  return true;
}

// ============================================================================
// Conectar ao WiFi em modo STA
// ============================================================================

bool WiFiSetupDoser::connectToWiFi() {
  Serial.println("[WiFiSetupDoser] Conectando usando lista de redes...");

  WiFi.mode(WIFI_STA);

  // Abre o arquivo bruto
  File file = SPIFFS.open(CONFIG_FILE, "r");
  if (!file) {
    Serial.println("[WiFiSetupDoser] ERRO abrindo config para multi-WiFi");
    return false;
  }

  DynamicJsonDocument doc(2048);
  DeserializationError err = deserializeJson(doc, file);
  file.close();
  if (err) {
    Serial.printf("[WiFiSetupDoser] ERRO ao desserializar (multi-WiFi): %s\n", err.c_str());
    return false;
  }

  // ----- DEBUG: imprimir config completa -----
  Serial.println("[WiFiSetupDoser] Conteúdo de doser_wifi_config.json:");
  String raw;
  serializeJsonPretty(doc, raw);
  Serial.println(raw);

  JsonArray nets = doc["networks"].as<JsonArray>();

  // Fallback: formato antigo, sem "networks"
  if (nets.isNull() || nets.size() == 0) {
    Serial.printf("[WiFiSetupDoser] Nenhuma lista de redes, usando ssid único: %s\n", ssid.c_str());
    WiFi.begin(ssid.c_str(), password.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        WiFi.setAutoReconnect(true);       
    #ifdef ESP8266
        WiFi.persistent(true);
    #endif

      Serial.printf("[WiFiSetupDoser] Conectado ao WiFi! IP: %s\n",
                    WiFi.localIP().toString().c_str());
      Serial.printf("[WiFiSetupDoser] RSSI: %d dBm\n", WiFi.RSSI());
      return true;
    }

    Serial.println("[WiFiSetupDoser] ERRO: Falha ao conectar ao WiFi");
    return false;
  }

  // Tenta cada rede salva

  for (JsonObject net : nets) {
    String s = net["ssid"].as<String>();
    String p = net["password"].as<String>();
    if (s.isEmpty()) continue;

    Serial.printf("[WiFiSetupDoser] Rede salva: %s\n", s.c_str());
    Serial.printf("[WiFiSetupDoser] Tentando SSID: %s\n", s.c_str());
    WiFi.begin(s.c_str(), p.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      WiFi.setAutoReconnect(true);
  #ifdef ESP8266
      WiFi.persistent(true);
  #endif
      Serial.printf("[WiFiSetupDoser] Conectado ao WiFi: %s\n", s.c_str());
      ssid     = s;
      password = p;
      Serial.printf("[WiFiSetupDoser] IP: %s\n",
                    WiFi.localIP().toString().c_str());
      Serial.printf("[WiFiSetupDoser] RSSI: %d dBm\n", WiFi.RSSI());
      return true;
    }
  }

  // Se chegou aqui, nenhuma conectou
  Serial.println("[WiFiSetupDoser] Nenhuma rede conectou na inicialização.");
  return false;

}

// ============================================================================
// Processar requisições HTTP no AP mode
// ============================================================================

void WiFiSetupDoser::handleClient() {
  dnsServer.processNextRequest();
  server.handleClient();
}

// ============================================================================
// HTML do Formulário de Configuração (igual KH)
// ============================================================================

String WiFiSetupDoser::getConfigHTML() {
  return R"(
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReefBlueSky Dosadora - Configuração Inicial</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
    .logo { text-align: center; margin-bottom: 30px; }
    .logo h1 { color: #333; font-size: 28px; margin-bottom: 10px; }
    .logo p { color: #666; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label { display: block; margin-bottom: 8px; color: #333; font-weight: 500; font-size: 14px; }
    input, select {
      width: 100%;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 14px;
      transition: border-color 0.3s;
    }
    input:focus, select:focus {
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
    button:hover { transform: translateY(-2px); box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    button:active { transform: translateY(0); }
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 5px;
      text-align: center;
      font-size: 14px;
      display: none;
    }
    .status.success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    .status.error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    .loading { display: none; text-align: center; margin-top: 20px; }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .help-text { font-size: 12px; color: #666; margin-top: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>ReefBlueSky</h1>
      <p>🚰 Dosadora Balling - Configuração Inicial</p>
    </div>

    <form id="configForm">
      <div class="section-title">WiFi da Casa</div>
      
      <div class="form-group">
        <label for="ssidSelect">Redes WiFi disponíveis</label>
        <select id="ssidSelect"></select>
      </div>

      <div class="form-group">
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
        <div class="help-text">Senha da sua rede WiFi não será exibida</div>
      </div>

      <div class="section-title">Credenciais do Servidor RBS</div>

      <div class="form-group">
        <label for="serverUsername">Usuário / Email</label>
        <input type="email" id="serverUsername" name="serverUsername" required placeholder="seu@email.com">
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

      <button type="submit">Conectar e Registrar</button>
    </form>

    <div id="status" class="status"></div>
    <div id="loading" class="loading">
      <div class="spinner"></div>
      <p>Conectando ao WiFi e registrando no servidor...</p>
    </div>
  </div>

  <script>
    // Carregar redes WiFi disponíveis
    async function loadNetworks() {
      try {
        const res = await fetch('/apiscan');
        const data = await res.json();
        const select = document.getElementById('ssidSelect');
        select.innerHTML = '';
        data.networks.forEach(ssid => {
          const opt = document.createElement('option');
          opt.value = ssid;
          opt.textContent = ssid;
          select.appendChild(opt);
        });
        select.addEventListener('change', function() {
          document.getElementById('ssid').value = this.value;
        });
      } catch (e) {
        console.error('Erro ao carregar redes:', e);
      }
    }

    // Mostrar/ocultar senhas
    document.getElementById('showPassWifi').addEventListener('change', (e) => {
      const pass = document.getElementById('password');
      pass.type = e.target.checked ? 'text' : 'password';
    });

    document.getElementById('showPassServer').addEventListener('change', (e) => {
      const pass = document.getElementById('serverPassword');
      pass.type = e.target.checked ? 'text' : 'password';
    });

    // Envio do formulário
    document.getElementById('configForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const config = {
        ssid: document.getElementById('ssid').value,
        password: document.getElementById('password').value,
        serverUsername: document.getElementById('serverUsername').value,
        serverPassword: document.getElementById('serverPassword').value
      };

      document.getElementById('configForm').style.display = 'none';
      document.getElementById('loading').style.display = 'block';

      try {
        const response = await fetch('/apisetup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const statusDiv = document.getElementById('status');
          statusDiv.className = 'status success';
          statusDiv.innerHTML = 'Configuração salva! Reiniciando em 5 segundos...';
          statusDiv.style.display = 'block';
          setTimeout(() => { window.location.href = '/'; }, 5000);
        } else {
          throw new Error(result.message || 'Erro ao salvar configuração');
        }
      } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('configForm').style.display = 'block';
        const statusDiv = document.getElementById('status');
        statusDiv.className = 'status error';
        statusDiv.innerHTML = 'Erro: ' + err.message;
        statusDiv.style.display = 'block';
      }
    });

    // Carregar redes ao abrir a página
    window.addEventListener('DOMContentLoaded', loadNetworks);
  </script>
</body>
</html>
  )";
}

// ============================================================================
// Handlers HTTP
// ============================================================================
void WiFiSetupDoser::handleConfigSubmit() {
  Serial.println("[WiFiSetupDoser] Recebendo configuração do cliente...");

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Nenhum dado recebido\"}");
    return;
  }

  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, server.arg("plain"));

  if (error) {
    Serial.printf("[WiFiSetupDoser] ERRO ao desserializar JSON: %s\n", error.c_str());
    server.send(400, "application/json", "{\"success\":false,\"message\":\"JSON inválido\"}");
    return;
  }

  // Validar campos obrigatórios
  if (!doc.containsKey("ssid") || !doc.containsKey("password") ||
      !doc.containsKey("serverUsername") || !doc.containsKey("serverPassword")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Campos obrigatórios faltando\"}");
    return;
  }

  // Extrair campos do POST
  String newSsid  = doc["ssid"].as<String>();
  String newPass  = doc["password"].as<String>();
  String newUser  = doc["serverUsername"].as<String>();
  String newPwd   = doc["serverPassword"].as<String>();

  ssid           = newSsid;
  password       = newPass;
  serverUsername = newUser;
  serverPassword = newPwd;

  // ----- montar documento "full" com lista de redes -----
  DynamicJsonDocument full(2048);

  // Se já existe config, carrega para preservar redes antigas
  if (SPIFFS.exists(CONFIG_FILE)) {
    File f = SPIFFS.open(CONFIG_FILE, "r");
    if (f) {
      DeserializationError e2 = deserializeJson(full, f);
      if (e2) {
        Serial.printf("[WiFiSetupDoser] Aviso: config antiga inválida (%s), recriando\n", e2.c_str());
      }
      f.close();
    }
  }

  // Atualiza credenciais do servidor (únicas)
  full["serverUsername"] = newUser;
  full["serverPassword"] = newPwd;

  // Garante que existe array "networks"
  JsonArray nets = full["networks"].to<JsonArray>();

  // Atualiza ou adiciona SSID
  bool exists = false;
  for (JsonObject n : nets) {
    if (n["ssid"].as<String>() == newSsid) {
      n["password"] = newPass;
      exists = true;
      break;
    }
  }
  if (!exists) {
    JsonObject n = nets.createNestedObject();
    n["ssid"]     = newSsid;
    n["password"] = newPass;
  }

  // Salvar em SPIFFS
  if (!saveConfigToSPIFFS(full)) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Erro ao salvar configuração\"}");
    return;
  }

  server.send(200, "application/json", "{\"success\":true,\"message\":\"Configuração salva com sucesso\"}");
  Serial.println("[WiFiSetupDoser] Configuração salva, reiniciando...");
  delay(2000);
  ESP.restart();
}


void WiFiSetupDoser::handleStatus() {
  DynamicJsonDocument doc(256);
  doc["configured"] = isConfigured();
  doc["ssid"] = ssid;
  doc["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void WiFiSetupDoser::handleScan() {
  int n = WiFi.scanNetworks();
  DynamicJsonDocument doc(1024);
  JsonArray arr = doc.createNestedArray("networks");

  for (int i = 0; i < n; i++) {
    arr.add(WiFi.SSID(i));
  }

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

// ============================================================================
// Persistência em SPIFFS
// ============================================================================

bool WiFiSetupDoser::loadConfigFromSPIFFS() {
  Serial.printf("[WiFiSetupDoser] Carregando configuração de %s\n", CONFIG_FILE);

  if (!SPIFFS.exists(CONFIG_FILE)) {
    Serial.println("[WiFiSetupDoser] Arquivo de configuração não encontrado");
    return false;
  }

  File file = SPIFFS.open(CONFIG_FILE, "r");
  if (!file) {
    Serial.println("[WiFiSetupDoser] ERRO: Não foi possível abrir arquivo de configuração");
    return false;
  }

  DynamicJsonDocument doc(2048);
  DeserializationError error = deserializeJson(doc, file);
  file.close();

  if (error) {
    Serial.printf("[WiFiSetupDoser] ERRO ao desserializar JSON: %s\n", error.c_str());
    return false;
  }

  // Formato novo: networks[ ] + serverUsername/serverPassword
  if (doc.containsKey("networks")) {
    JsonArray nets = doc["networks"].as<JsonArray>();
    if (!nets.isNull() && nets.size() > 0) {
      numNetworks = nets.size();
      networks = new WiFiCred[numNetworks];
      for (int i = 0; i < numNetworks; i++) {
        JsonObject n = nets[i];
        networks[i].ssid = n["ssid"].as<String>();
        networks[i].password = n["password"].as<String>();
      }
      Serial.printf("[WiFiSetupDoser] %d redes carregadas para reconexão BG\n", numNetworks);
    }
    if (!nets.isNull() && nets.size() > 0) {
      JsonObject first = nets[0];
      ssid     = first["ssid"].as<String>();
      password = first["password"].as<String>();
    }
  } else {
    // Formato antigo: ssid/password no root
    ssid     = doc["ssid"].as<String>();
    password = doc["password"].as<String>();
  }

  serverUsername = doc["serverUsername"].as<String>();
  serverPassword = doc["serverPassword"].as<String>();

  if (ssid.isEmpty()) {
    Serial.println("[WiFiSetupDoser] Configuração incompleta");
    return false;
  }

  Serial.println("[WiFiSetupDoser] Configuração carregada com sucesso");
  return true;
}

bool WiFiSetupDoser::saveConfigToSPIFFS(const DynamicJsonDocument& config) {
  Serial.printf("[WiFiSetupDoser] Salvando configuração em %s\n", CONFIG_FILE);

  File file = SPIFFS.open(CONFIG_FILE, "w");
  if (!file) {
    Serial.println("[WiFiSetupDoser] ERRO: Não foi possível criar arquivo de configuração");
    return false;
  }

  size_t bytesWritten = serializeJson(config, file);
  file.close();

  if (bytesWritten == 0) {
    Serial.println("[WiFiSetupDoser] ERRO: Falha ao serializar JSON");
    return false;
  }

  Serial.printf("[WiFiSetupDoser] Configuração salva com sucesso (%d bytes)\n", bytesWritten);
  return true;
}

void WiFiSetupDoser::tryReconnect() {


  if (!configured || numNetworks == 0) return;

  if (portalActive && WiFi.status() != WL_CONNECTED && millis() < 30000) { // 30s após boot
    return;
  }

  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastReconnectTry < RECONNECT_INTERVAL) return;
  
  wl_status_t st = WiFi.status();
  Serial.printf("[WiFiSetupDoser] tryReconnect: configured=%d numNetworks=%d status=%d (%s)\n",
                configured, numNetworks, st, statusName(st));

  // Mantém AP+STA se portal ativo; senão apenas STA
  if (portalActive) {
    WiFi.mode(WIFI_AP_STA);
  } else {
    WiFi.mode(WIFI_STA);
  }

  // (opcional, mas ajuda no 8266)
  WiFi.disconnect();
  delay(100);

  String ssidTry = networks[currentNetworkIndex].ssid;
  String passTry = networks[currentNetworkIndex].password;

  Serial.printf("[WiFiSetupDoser] BG: Tentando %s (%d/%d)\n",
                ssidTry.c_str(), currentNetworkIndex + 1, numNetworks);

  WiFi.begin(ssidTry.c_str(), passTry.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) { // 15s
    delay(100);
    if (portalActive) {
      dnsServer.processNextRequest();
      server.handleClient();
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFiSetupDoser] BG RECONECTADO! IP: %s RSSI: %d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    ssid     = ssidTry;
    password = passTry;

    if (portalActive) {
      dnsServer.stop();
      WiFi.softAPdisconnect(true);
      portalActive = false;
      Serial.println("[WiFiSetupDoser] Portal fechado apos reconectar");
    }

    currentNetworkIndex = 0;

    Serial.println("[WiFiSetupDoser] WiFi recuperado em BG, reiniciando device para fluxo limpo...");
    delay(1000);
    ESP.restart();
  } else {
    currentNetworkIndex = (currentNetworkIndex + 1) % numNetworks;
    Serial.println("[WiFiSetupDoser] BG: falhou, próxima rede na fila");
  }

  lastReconnectTry = millis();

}


void WiFiSetupDoser::loopReconnect() {
  // Mantém portal/DNS se estiver ativo
  handleClient();

  // Sempre verifica se precisa reconectar
  tryReconnect();
}


