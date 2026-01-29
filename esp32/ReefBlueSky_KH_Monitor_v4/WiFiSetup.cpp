
//WiFiSetup.cpp

#include "WiFiSetup.h" 
#include <WiFi.h> 

const int MAX_NETS = 10;


// Declaração da função implementada em MultiDeviceAuth.h
bool saveCredentialsToNVS(String email, String password);


// ============================================================================
// [ONBOARDING] Implementação do Sistema de Configuração Inicial
// ============================================================================

bool WiFiSetup::begin() {
  Serial.println("[WiFiSetup] Iniciando sistema de configuração...");

  if (!SPIFFS.begin(true)) {
    Serial.println("[WiFiSetup] ERRO: Falha ao inicializar SPIFFS");
    return false;
  }

  // 1) Tenta carregar config
  if (loadConfigFromSPIFFS()) {
    Serial.println("[WiFiSetup] Configuração carregada do SPIFFS");
    configured = true;

    if (connectToWiFi()) {
      return true;
    } else {
      Serial.println("[WiFiSetup] Falha ao conectar em todas as redes salvas.");
      // NÃO zera configured aqui
      // configured = false;  // <- remove isso
      return createAccessPoint();
    }
  }


  // 4) Nenhuma config válida → AP direto
  Serial.println("[WiFiSetup] Nenhuma configuração encontrada, criando AP...");
  return createAccessPoint();
}

bool WiFiSetup::createAccessPoint() {
    Serial.printf("[WiFiSetup] Criando Access Point: %s\n", AP_SSID);
    
    // Desligar WiFi station
    WiFi.mode(WIFI_AP);
    
    // Criar AP
    if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
        Serial.println("[WiFiSetup] ERRO: Falha ao criar AP");
        return false;
    }
    
    // Obter IP do AP
    IPAddress apIP = WiFi.softAPIP();
    Serial.printf("[WiFiSetup] AP criado com sucesso!\n");
    Serial.printf("[WiFiSetup] IP do AP: %s\n", apIP.toString().c_str());
    Serial.printf("[WiFiSetup] Acesse: http://%s para configurar\n", apIP.toString().c_str());
    
    dnsServer.start(DNS_PORT, "*", apIP);
    
    // Configurar rotas HTTP
    server.on("/", HTTP_GET, [this]() {
        server.send(200, "text/html; charset=utf-8", getConfigHTML());
    });
    
    server.on("/api/setup", HTTP_POST, [this]() {
        handleConfigSubmit();
    });
    
    server.on("/api/status", HTTP_GET, [this]() {
        handleStatus();
    });

    server.on("/api/scan", HTTP_GET, [this]() {
    
        WiFi.mode(WIFI_AP_STA);
        WiFi.disconnect();      
        int n = WiFi.scanNetworks(false);
        DynamicJsonDocument doc(1024);
        JsonArray arr = doc.createNestedArray("networks");
        for (int i = 0; i < n; i++) {
          arr.add(WiFi.SSID(i));
        }
        String out;
        serializeJson(doc, out);
        server.send(200, "application/json", out);
      });
        
    server.onNotFound([this]() {
    server.send(200, "text/html; charset=utf-8", getConfigHTML());
    });

    // Iniciar servidor web
    server.begin();
    Serial.println("[WiFiSetup] Servidor web iniciado na porta 80");
    portalActive = true;
    Serial.println("[WiFiSetup] Portal ativo + reconexão em background");
    return true;
}

bool WiFiSetup::connectToWiFi() {
  Serial.println("[WiFiSetup] Conectando usando lista de redes...");

  WiFi.mode(WIFI_STA);

  File file = SPIFFS.open(CONFIG_FILE, "r");
  if (!file) {
    Serial.println("[WiFiSetup] ERRO abrindo config para multi-WiFi");
    return false;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, file);
  file.close();
  if (err) {
    Serial.printf("[WiFiSetup] ERRO ao desserializar (multi-WiFi): %s\n", err.c_str());
    return false;
  }

  // Debug: imprime JSON completo
  Serial.println("[WiFiSetup] Conteúdo de wifi_config.json:");
  String raw;
  serializeJsonPretty(doc, raw);
  Serial.println(raw);

  JsonArray nets = doc["networks"].as<JsonArray>();

  if (nets.isNull() || nets.size() == 0) {
    Serial.printf("[WiFiSetup] Nenhuma lista de redes, usando ssid único: %s\n", ssid.c_str());
    WiFi.begin(ssid.c_str(), password.c_str());
    Serial.printf("[WiFiSetup] Status após begin: %s (SSID: %s)\n", statusName(WiFi.status()), ssid.c_str());  // ssid, não 's'


    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[WiFiSetup] Conectado ao WiFi! IP: %s\n",
                    WiFi.localIP().toString().c_str());
      Serial.printf("[WiFiSetup] RSSI: %d dBm\n", WiFi.RSSI());
      return true;
    }

    Serial.println("[WiFiSetup] ERRO: Falha ao conectar ao WiFi");
    return false;
  }


  // 1) Sempre tenta primeiro a ÚLTIMA rede conhecida (ssid/password atuais)
  if (!ssid.isEmpty()) {
    Serial.printf("[WiFiSetup] Tentando última rede conhecida primeiro: %s\n", ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true);
    delay(500);
    WiFi.begin(ssid.c_str(), password.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) { // ~10s
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[WiFiSetup] Conectado à última rede: %s\n", ssid.c_str());
      Serial.printf("[WiFiSetup] IP: %s\n", WiFi.localIP().toString().c_str());
      Serial.printf("[WiFiSetup] RSSI: %d dBm\n", WiFi.RSSI());
      return true;
    }

    Serial.println("[WiFiSetup] Falhou na última rede, tentando demais salvas...");
  }

  // 2) Se falhou, Multi‑WiFi: tentar cada rede salva (como já fazia)
  for (JsonObject net : nets) {
    String s = net["ssid"].as<String>();
    String p = net["password"].as<String>();
    if (s.isEmpty()) continue;

    Serial.printf("[WiFiSetup] Rede salva: %s\n", s.c_str());
    Serial.printf("[WiFiSetup] Tentando SSID: %s\n", s.c_str());

    WiFi.disconnect(true);
    delay(500);
    WiFi.begin(s.c_str(), p.c_str());
    Serial.printf("[WiFiSetup] Status após begin: %s (SSID: %s, len=%d/%d)\n",
                  statusName(WiFi.status()), s.c_str(), s.length(), p.length());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[WiFiSetup] Conectado ao WiFi: %s\n", s.c_str());
      ssid     = s;
      password = p;
      Serial.printf("[WiFiSetup] IP: %s\n", WiFi.localIP().toString().c_str());
      Serial.printf("[WiFiSetup] RSSI: %d dBm\n", WiFi.RSSI());

      // Garante que essa vire a “primeira” também para BG
      if (networks && numNetworks > 0) {
        networks[0].ssid     = s;
        networks[0].password = p;
        currentNetworkIndex  = 0;
      }
      return true;
    }
  }

Serial.println("[WiFiSetup] ERRO: Nenhuma das redes conectou");
return false;

}

bool WiFiSetup::loadConfigFromSPIFFS() {
  Serial.printf("[WiFiSetup] Carregando configuração de %s\n", CONFIG_FILE);

  if (!SPIFFS.exists(CONFIG_FILE)) {
    Serial.println("[WiFiSetup] Arquivo de configuração não encontrado");
    return false;
  }

  File file = SPIFFS.open(CONFIG_FILE, "r");
  if (!file) {
    Serial.println("[WiFiSetup] ERRO: Não foi possível abrir arquivo de configuração");
    return false;
  }

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, file);
  file.close();

  if (error) {
    Serial.printf("[WiFiSetup] ERRO ao desserializar JSON: %s\n", error.c_str());
    return false;
  }

  if (doc.containsKey("networks")) {
    JsonArray nets = doc["networks"].as<JsonArray>();
    if (!nets.isNull() && nets.size() > 0) {

      if (!networks) {
        networks = new WiFiCred[MAX_NETS];
      }
      numNetworks = 0;

      for (int i = 0; i < (int)nets.size() && i < MAX_NETS; i++) {
        JsonObject n = nets[i];
        networks[numNetworks].ssid     = n["ssid"].as<String>();
        networks[numNetworks].password = n["password"].as<String>();
        numNetworks++;
      }

      Serial.printf("[WiFiSetup] %d redes carregadas para reconexão BG\n", numNetworks);

      ssid     = networks[0].ssid;
      password = networks[0].password;
    }
  } else {
    // Formato antigo
    ssid     = doc["ssid"].as<String>();
    password = doc["password"].as<String>();
  }

  serverUsername = doc["serverUsername"].as<String>();
  serverPassword = doc["serverPassword"].as<String>();

  saveCredentialsToNVS(serverUsername, serverPassword);

  if (ssid.isEmpty()) {
    Serial.println("[WiFiSetup] Configuração incompleta");
    return false;
  }

  Serial.println("[WiFiSetup] Configuração carregada com sucesso");
  return true;
}

bool WiFiSetup::saveConfigToSPIFFS(const DynamicJsonDocument& config) {
    Serial.printf("[WiFiSetup] Salvando configuração em %s\n", CONFIG_FILE);
    
    File file = SPIFFS.open(CONFIG_FILE, "w");
    if (!file) {
        Serial.println("[WiFiSetup] ERRO: Não foi possível criar arquivo de configuração");
        return false;
    }
    
    size_t bytesWritten = serializeJson(config, file);
    file.close();
    
    if (bytesWritten == 0) {
        Serial.println("[WiFiSetup] ERRO: Falha ao serializar JSON");
        return false;
    }
    
    Serial.printf("[WiFiSetup] Configuração salva com sucesso (%d bytes)\n", bytesWritten);
    return true;
}

void WiFiSetup::handleConfigSubmit() {
  Serial.println("[WiFiSetup] Recebendo configuração do cliente...");

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Nenhum dado recebido\"}");
    return;
  }

  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, server.arg("plain"));

  if (error) {
    Serial.printf("[WiFiSetup] ERRO ao desserializar: %s\n", error.c_str());
    server.send(400, "application/json", "{\"success\":false,\"message\":\"JSON inválido\"}");
    return;
  }

  // Validar campos obrigatórios
  if (!doc.containsKey("ssid") || !doc.containsKey("password") ||
      !doc.containsKey("serverUsername") || !doc.containsKey("serverPassword")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Campos obrigatórios faltando\"}");
    return;
  }

  // Extrair do POST
  String newSsid = doc["ssid"].as<String>();
  String newPass = doc["password"].as<String>();
  String newUser = doc["serverUsername"].as<String>();
  String newPwd  = doc["serverPassword"].as<String>();

  ssid           = newSsid;
  password       = newPass;
  serverUsername = newUser;
  serverPassword = newPwd;

  // Também já grava em NVS
  saveCredentialsToNVS(serverUsername, serverPassword);

  // ======== ATUALIZA VETOR EM RAM (networks[]) ========
  if (!networks) {
    networks = new WiFiCred[MAX_NETS];
    numNetworks = 0;
  }

  // procura SSID igual
  int idx = -1;
  for (int i = 0; i < numNetworks; i++) {
    if (networks[i].ssid == newSsid) {
      idx = i;
      break;
    }
  }

  if (idx >= 0) {
    // Atualiza senha da rede existente
    networks[idx].password = newPass;
  } else {
    // Insere novo SSID
    if (numNetworks < MAX_NETS) {
      networks[numNetworks].ssid     = newSsid;
      networks[numNetworks].password = newPass;
      numNetworks++;
    } else {
      // política simples: sobrescreve a posição 0
      networks[0].ssid     = newSsid;
      networks[0].password = newPass;
    }
  }

  // ======== RECONSTRÓI JSON A PARTIR DO VETOR ========
  DynamicJsonDocument full(4096);
  full["serverUsername"] = newUser;
  full["serverPassword"] = newPwd;

  JsonArray nets = full.createNestedArray("networks");
  for (int i = 0; i < numNetworks; i++) {
    if (networks[i].ssid.length() == 0) continue;
    JsonObject n = nets.createNestedObject();
    n["ssid"]     = networks[i].ssid;
    n["password"] = networks[i].password;
  }

  // DEBUG: ver JSON antes de gravar
  String dbg;
  serializeJsonPretty(full, dbg);
  Serial.println("[WiFiSetup] FULL antes de salvar:");
  Serial.println(dbg);

  if (!saveConfigToSPIFFS(full)) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Erro ao salvar configuração\"}");
    return;
  }

  server.send(200, "application/json", "{\"success\":true,\"message\":\"Configuração salva com sucesso\"}");
  Serial.println("[WiFiSetup] Reiniciando em 2 segundos...");
  delay(2000);
  ESP.restart();
}

void WiFiSetup::handleStatus() {
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

void WiFiSetup::handleClient() {
    dnsServer.processNextRequest();
    server.handleClient();
}


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

void WiFiSetup::tryReconnect() {
  wl_status_t st = WiFi.status();
  Serial.printf("[WiFiSetup] tryReconnect: configured=%d numNetworks=%d status=%d (%s)\n",
                configured, numNetworks, st, statusName(st));
  if (!configured || numNetworks == 0) return;
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastReconnectTry < RECONNECT_INTERVAL) return;

  // Se ainda está com portal aberto, mantém AP+STA.
  // Se já está só em STA, não precisa religar AP.
  if (portalActive) {
    WiFi.mode(WIFI_AP_STA);
  } else {
    WiFi.mode(WIFI_STA);
  }

  String ssidTry = networks[currentNetworkIndex].ssid;
  String passTry = networks[currentNetworkIndex].password;

  Serial.printf("[WiFiSetup] BG: Tentando %s (%d/%d)\n",
                ssidTry.c_str(), currentNetworkIndex + 1, numNetworks);

  WiFi.disconnect(true);
  delay(500);
  WiFi.begin(ssidTry.c_str(), passTry.c_str());
  Serial.printf("[WiFiSetup] BG Status após begin: %s (SSID: %s, len=%d/%d)\n",
              statusName(WiFi.status()), ssidTry.c_str(), ssidTry.length(), passTry.length());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < CONNECT_TIMEOUT) {
    delay(100);
    if (portalActive) {
      dnsServer.processNextRequest();
      server.handleClient();
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFiSetup] BG RECONECTADO! IP: %s RSSI: %d\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    ssid     = ssidTry;
    password = passTry;

    if (portalActive) {
      dnsServer.stop();
      WiFi.softAPdisconnect(true);
      portalActive = false;
      Serial.println("[WiFiSetup] Portal fechado apos reconectar");
    }
    currentNetworkIndex = 0;

    Serial.println("[WiFiSetup] WiFi recuperado em BG, reiniciando device para fluxo limpo...");
    delay(1000);
    esp_restart();   // ESP32
  } else {
    currentNetworkIndex = (currentNetworkIndex + 1) % numNetworks;
    Serial.println("[WiFiSetup] BG: falhou, próxima rede na fila");
  }

  lastReconnectTry = millis();
}

void WiFiSetup::loopReconnect() {
  // Mantém portal/DNS se estiver ativo
  handleClient();

  // Sempre verifica se precisa reconectar
  tryReconnect();
}
