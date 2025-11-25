#include "WiFi_MQTT.h"

WiFi_MQTT::WiFi_MQTT(const char* ssid, const char* password, const char* mqtt_server, int mqtt_port)
    : _ssid(ssid), _password(password), _mqtt_server(mqtt_server), _mqtt_port(mqtt_port),
      _mqttClient(_wifiClient), _last_reconnect_attempt(0) {
}

void WiFi_MQTT::begin() {
    Serial.println("[WiFi_MQTT] Inicializando WiFi e MQTT...");
    
    connectWiFi();
    connectMQTT();
    
    Serial.println("[WiFi_MQTT] Inicialização concluída");
}

bool WiFi_MQTT::connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[WiFi_MQTT] Já conectado ao WiFi");
        return true;
    }

    Serial.printf("[WiFi_MQTT] Conectando ao WiFi: %s\n", _ssid);
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(_ssid, _password);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WiFi_MQTT] WiFi conectado!");
        logWiFiStatus();
        return true;
    } else {
        Serial.println("\n[WiFi_MQTT] Falha ao conectar ao WiFi");
        return false;
    }
}

bool WiFi_MQTT::connectMQTT() {
    if (!isWiFiConnected()) {
        Serial.println("[WiFi_MQTT] WiFi não conectado");
        return false;
    }

    _mqttClient.setServer(_mqtt_server, _mqtt_port);

    Serial.printf("[WiFi_MQTT] Conectando ao MQTT: %s:%d\n", _mqtt_server, _mqtt_port);

    if (_mqttClient.connect("ReefBlueSky_KH_Monitor")) {
        Serial.println("[WiFi_MQTT] MQTT conectado!");
        return true;
    } else {
        Serial.printf("[WiFi_MQTT] Falha ao conectar ao MQTT (código: %d)\n", _mqttClient.state());
        return false;
    }
}

void WiFi_MQTT::loop() {
    // Verificar conexão WiFi
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (now - _last_reconnect_attempt > RECONNECT_INTERVAL) {
            Serial.println("[WiFi_MQTT] WiFi desconectado, tentando reconectar...");
            connectWiFi();
            _last_reconnect_attempt = now;
        }
    }

    // Manter conexão MQTT
    if (!_mqttClient.connected()) {
        unsigned long now = millis();
        if (now - _last_reconnect_attempt > RECONNECT_INTERVAL) {
            reconnect();
            _last_reconnect_attempt = now;
        }
    } else {
        _mqttClient.loop();
    }
}

bool WiFi_MQTT::publish(const char* topic, const char* message) {
    if (!isMQTTConnected()) {
        Serial.printf("[WiFi_MQTT] MQTT não conectado, não é possível publicar em %s\n", topic);
        return false;
    }

    bool result = _mqttClient.publish(topic, message);
    
    if (result) {
        Serial.printf("[WiFi_MQTT] Publicado em %s: %s\n", topic, message);
    } else {
        Serial.printf("[WiFi_MQTT] Falha ao publicar em %s\n", topic);
    }

    return result;
}

void WiFi_MQTT::publishFloat(const char* topic, float value) {
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "%.2f", value);
    publish(topic, buffer);
}

void WiFi_MQTT::publishInt(const char* topic, int value) {
    char buffer[16];
    snprintf(buffer, sizeof(buffer), "%d", value);
    publish(topic, buffer);
}

void WiFi_MQTT::subscribe(const char* topic) {
    if (!isMQTTConnected()) {
        Serial.printf("[WiFi_MQTT] MQTT não conectado, não é possível inscrever em %s\n", topic);
        return;
    }

    if (_mqttClient.subscribe(topic)) {
        Serial.printf("[WiFi_MQTT] Inscrito em %s\n", topic);
    } else {
        Serial.printf("[WiFi_MQTT] Falha ao inscrever em %s\n", topic);
    }
}

bool WiFi_MQTT::isWiFiConnected() {
    return WiFi.status() == WL_CONNECTED;
}

bool WiFi_MQTT::isMQTTConnected() {
    return _mqttClient.connected();
}

int WiFi_MQTT::getRSSI() {
    if (isWiFiConnected()) {
        return WiFi.RSSI();
    }
    return 0;
}

void WiFi_MQTT::setMessageCallback(void (*callback)(char*, uint8_t*, unsigned int)) {
    _mqttClient.setCallback(callback);
}

// ===== Métodos Privados =====

void WiFi_MQTT::setupWiFi() {
    delay(10);
    Serial.printf("\n[WiFi_MQTT] Conectando a %s\n", _ssid);

    WiFi.mode(WIFI_STA);
    WiFi.begin(_ssid, _password);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        logWiFiStatus();
    }
}

void WiFi_MQTT::reconnect() {
    if (!isWiFiConnected()) {
        Serial.println("[WiFi_MQTT] WiFi desconectado, reconectando...");
        connectWiFi();
        return;
    }

    Serial.println("[WiFi_MQTT] MQTT desconectado, reconectando...");
    
    if (_mqttClient.connect("ReefBlueSky_KH_Monitor")) {
        Serial.println("[WiFi_MQTT] MQTT reconectado!");
    } else {
        Serial.printf("[WiFi_MQTT] Falha na reconexão MQTT (código: %d)\n", _mqttClient.state());
    }
}

void WiFi_MQTT::logWiFiStatus() {
    Serial.println("\n========== WiFi Status ==========");
    Serial.printf("SSID: %s\n", WiFi.SSID().c_str());
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("Gateway: %s\n", WiFi.gatewayIP().toString().c_str());
    Serial.printf("DNS: %s\n", WiFi.dnsIP().toString().c_str());
    Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
    Serial.println("================================\n");
}
