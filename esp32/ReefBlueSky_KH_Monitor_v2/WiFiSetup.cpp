#include "WiFiSetup.h"

// ============================================================================
// [ONBOARDING] Implementação do Sistema de Configuração Inicial
// ============================================================================

bool WiFiSetup::begin() {
    Serial.println("[WiFiSetup] Iniciando sistema de configuração...");
    
    // Inicializar SPIFFS
    if (!SPIFFS.begin(true)) {
        Serial.println("[WiFiSetup] ERRO: Falha ao inicializar SPIFFS");
        return false;
    }
    
    // Tentar carregar configuração salva
    if (loadConfigFromSPIFFS()) {
        Serial.println("[WiFiSetup] Configuração carregada do SPIFFS");
        configured = true;
        return connectToWiFi();
    }
    
    // Se não houver configuração, criar AP para onboarding
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
    
    // Iniciar servidor web
    server.begin();
    Serial.println("[WiFiSetup] Servidor web iniciado na porta 80");
    
    return true;
}

bool WiFiSetup::connectToWiFi() {
    Serial.printf("[WiFiSetup] Conectando ao WiFi: %s\n", ssid.c_str());
    
    // Modo station
    WiFi.mode(WIFI_STA);
    
    // Conectar
    WiFi.begin(ssid.c_str(), password.c_str());
    
    // Aguardar conexão (máximo 20 segundos)
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFiSetup] Conectado ao WiFi!\n");
        Serial.printf("[WiFiSetup] IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WiFiSetup] RSSI: %d dBm\n", WiFi.RSSI());
        return true;
    } else {
        Serial.println("\n[WiFiSetup] ERRO: Falha ao conectar ao WiFi");
        return false;
    }
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
    
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, file);
    file.close();
    
    if (error) {
        Serial.printf("[WiFiSetup] ERRO ao desserializar JSON: %s\n", error.c_str());
        return false;
    }
    
    // Extrair configurações
    ssid = doc["ssid"].as<String>();
    password = doc["password"].as<String>();
    serverUrl = doc["serverUrl"].as<String>();
    serverUsername = doc["serverUsername"].as<String>();
    serverPassword = doc["serverPassword"].as<String>();
    
    if (ssid.isEmpty() || serverUrl.isEmpty()) {
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
    
    // Verificar se há dados POST
    if (!server.hasArg("plain")) {
        server.send(400, "application/json", "{\"success\":false,\"message\":\"Nenhum dado recebido\"}");
        return;
    }
    
    // Desserializar JSON
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, server.arg("plain"));
    
    if (error) {
        Serial.printf("[WiFiSetup] ERRO ao desserializar: %s\n", error.c_str());
        server.send(400, "application/json", "{\"success\":false,\"message\":\"JSON inválido\"}");
        return;
    }
    
    // Validar campos obrigatórios
    if (!doc.containsKey("ssid") || !doc.containsKey("password") || 
        !doc.containsKey("serverUrl") || !doc.containsKey("serverUsername") || 
        !doc.containsKey("serverPassword")) {
        server.send(400, "application/json", "{\"success\":false,\"message\":\"Campos obrigatórios faltando\"}");
        return;
    }
    
    // Extrair e salvar configuração
    ssid = doc["ssid"].as<String>();
    password = doc["password"].as<String>();
    serverUrl = doc["serverUrl"].as<String>();
    serverUsername = doc["serverUsername"].as<String>();
    serverPassword = doc["serverPassword"].as<String>();
    
    // Salvar em SPIFFS
    if (!saveConfigToSPIFFS(doc)) {
        server.send(500, "application/json", "{\"success\":false,\"message\":\"Erro ao salvar configuração\"}");
        return;
    }
    
    // Responder sucesso
    server.send(200, "application/json", "{\"success\":true,\"message\":\"Configuração salva com sucesso\"}");
    
    // Aguardar 2 segundos e reiniciar
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
    server.handleClient();
}
