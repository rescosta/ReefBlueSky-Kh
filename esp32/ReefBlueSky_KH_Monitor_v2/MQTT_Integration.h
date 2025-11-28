/**
 * ReefBlueSky KH Monitor - Integração MQTT com Fallback
 * 
 * Funcionalidades:
 * - Conexão com broker MQTT
 * - Publicação de medições
 * - Recebimento de comandos
 * - Fallback para HTTPS se MQTT falhar
 * - Fila de mensagens offline
 * - Retry automático
 */

#ifndef MQTT_INTEGRATION_H
#define MQTT_INTEGRATION_H

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <queue>

// [MQTT] Configurações
#define MQTT_BROKER "mqtt.seu-dominio.com"
#define MQTT_PORT 8883
#define MQTT_USERNAME "seu-usuario"
#define MQTT_PASSWORD "sua-senha"
#define MQTT_CLIENT_ID "reefbluesky-esp32"
#define MQTT_KEEPALIVE 60
#define MQTT_RECONNECT_DELAY 5000  // 5 segundos
#define MQTT_MAX_QUEUE_SIZE 100

// [MQTT] Tópicos
#define MQTT_TOPIC_MEASUREMENT "reefbluesky/device/measurement"
#define MQTT_TOPIC_HEALTH "reefbluesky/device/health"
#define MQTT_TOPIC_COMMAND "reefbluesky/device/command"
#define MQTT_TOPIC_RESPONSE "reefbluesky/device/response"

/**
 * [MQTT] Estrutura para armazenar mensagens offline
 */
struct MQTTMessage {
    String topic;
    String payload;
    unsigned long timestamp;
};

/**
 * [MQTT] Classe para gerenciar integração MQTT com fallback
 */
class MQTTIntegration {
private:
    WiFiClientSecure wifiClient;
    PubSubClient mqttClient;
    
    // [MQTT] Fila de mensagens offline
    std::queue<MQTTMessage> messageQueue;
    
    // [MQTT] Estados
    bool connected = false;
    unsigned long lastReconnectAttempt = 0;
    int reconnectAttempts = 0;
    const int MAX_RECONNECT_ATTEMPTS = 10;
    
    // [MQTT] Callbacks
    void (*onMeasurementCallback)(const String& payload) = nullptr;
    void (*onCommandCallback)(const String& payload) = nullptr;
    
public:
    MQTTIntegration() : mqttClient(wifiClient) {}
    
    /**
     * [MQTT] Inicializar conexão MQTT
     */
    void begin() {
        Serial.println("[MQTT] Inicializando...");
        
        // [SEGURANÇA] Configurar certificado SSL/TLS
        wifiClient.setInsecure();  // TODO: Usar setCACert() com certificado válido
        
        // [MQTT] Configurar cliente
        mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
        mqttClient.setCallback([this](char* topic, byte* payload, unsigned int length) {
            this->handleMessage(topic, payload, length);
        });
        
        // [MQTT] Conectar
        connect();
    }
    
    /**
     * [MQTT] Conectar ao broker
     */
    void connect() {
        if (connected) return;
        
        unsigned long now = millis();
        if (now - lastReconnectAttempt < MQTT_RECONNECT_DELAY) {
            return;  // Aguardar antes de tentar novamente
        }
        
        lastReconnectAttempt = now;
        reconnectAttempts++;
        
        Serial.printf("[MQTT] Tentando conectar (tentativa %d)...\n", reconnectAttempts);
        
        if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
            Serial.println("[MQTT] Conectado com sucesso!");
            connected = true;
            reconnectAttempts = 0;
            
            // [MQTT] Subscrever a tópicos
            mqttClient.subscribe(MQTT_TOPIC_COMMAND);
            
            // [MQTT] Enviar fila de mensagens offline
            flushMessageQueue();
        } else {
            Serial.printf("[MQTT] Falha na conexão (código: %d)\n", mqttClient.state());
            
            // [MQTT] Se muitas tentativas falharem, usar fallback HTTPS
            if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                Serial.println("[MQTT] Limite de tentativas atingido, usando fallback HTTPS");
                fallbackToHTTPS();
                reconnectAttempts = 0;
            }
        }
    }
    
    /**
     * [MQTT] Publicar medição
     */
    void publishMeasurement(float kh, float ph, float temperature, float phRef) {
        String payload = "{";
        payload += "\"kh\":" + String(kh, 2) + ",";
        payload += "\"ph\":" + String(ph, 2) + ",";
        payload += "\"temperature\":" + String(temperature, 2) + ",";
        payload += "\"phRef\":" + String(phRef, 2) + ",";
        payload += "\"timestamp\":" + String(millis());
        payload += "}";
        
        publishMessage(MQTT_TOPIC_MEASUREMENT, payload);
    }
    
    /**
     * [MQTT] Publicar métricas de saúde
     */
    void publishHealth(int cpuUsage, int memoryUsage, int wifiSignal, unsigned long uptime) {
        String payload = "{";
        payload += "\"cpu_usage\":" + String(cpuUsage) + ",";
        payload += "\"memory_usage\":" + String(memoryUsage) + ",";
        payload += "\"wifi_signal\":" + String(wifiSignal) + ",";
        payload += "\"uptime\":" + String(uptime);
        payload += "}";
        
        publishMessage(MQTT_TOPIC_HEALTH, payload);
    }
    
    /**
     * [MQTT] Publicar resposta de comando
     */
    void publishCommandResponse(const String& commandId, bool success, const String& message) {
        String payload = "{";
        payload += "\"commandId\":\"" + commandId + "\",";
        payload += "\"success\":" + String(success ? "true" : "false") + ",";
        payload += "\"message\":\"" + message + "\"";
        payload += "}";
        
        publishMessage(MQTT_TOPIC_RESPONSE, payload);
    }
    
    /**
     * [MQTT] Registrar callback para medições
     */
    void onMeasurement(void (*callback)(const String&)) {
        onMeasurementCallback = callback;
    }
    
    /**
     * [MQTT] Registrar callback para comandos
     */
    void onCommand(void (*callback)(const String&)) {
        onCommandCallback = callback;
    }
    
    /**
     * [MQTT] Processar mensagens (chamar no loop)
     */
    void loop() {
        if (!connected) {
            connect();
        } else {
            mqttClient.loop();
        }
    }
    
    /**
     * [MQTT] Verificar se está conectado
     */
    bool isConnected() const {
        return connected && mqttClient.connected();
    }
    
    /**
     * [MQTT] Obter número de mensagens na fila
     */
    size_t getQueueSize() const {
        return messageQueue.size();
    }

private:
    /**
     * [MQTT] Publicar mensagem
     */
    void publishMessage(const String& topic, const String& payload) {
        if (isConnected()) {
            // [MQTT] Publicar imediatamente
            if (mqttClient.publish(topic.c_str(), payload.c_str())) {
                Serial.printf("[MQTT] Publicado em %s: %s\n", topic.c_str(), payload.c_str());
            } else {
                Serial.printf("[MQTT] Falha ao publicar em %s\n", topic.c_str());
                // [MQTT] Adicionar à fila
                addToQueue(topic, payload);
            }
        } else {
            // [MQTT] Desconectado, adicionar à fila
            Serial.printf("[MQTT] Desconectado, adicionando à fila: %s\n", topic.c_str());
            addToQueue(topic, payload);
        }
    }
    
    /**
     * [MQTT] Adicionar mensagem à fila offline
     */
    void addToQueue(const String& topic, const String& payload) {
        if (messageQueue.size() < MQTT_MAX_QUEUE_SIZE) {
            MQTTMessage msg;
            msg.topic = topic;
            msg.payload = payload;
            msg.timestamp = millis();
            messageQueue.push(msg);
            
            Serial.printf("[MQTT] Mensagem adicionada à fila (total: %d)\n", messageQueue.size());
        } else {
            Serial.println("[MQTT] Fila cheia, descartando mensagem");
        }
    }
    
    /**
     * [MQTT] Enviar fila de mensagens offline
     */
    void flushMessageQueue() {
        Serial.printf("[MQTT] Enviando fila (%d mensagens)...\n", messageQueue.size());
        
        while (!messageQueue.empty()) {
            MQTTMessage msg = messageQueue.front();
            
            if (mqttClient.publish(msg.topic.c_str(), msg.payload.c_str())) {
                messageQueue.pop();
                Serial.printf("[MQTT] Fila enviada: %s\n", msg.topic.c_str());
            } else {
                Serial.println("[MQTT] Falha ao enviar fila, tentando novamente");
                break;  // Parar se falhar
            }
        }
        
        if (messageQueue.empty()) {
            Serial.println("[MQTT] Fila vazia!");
        }
    }
    
    /**
     * [MQTT] Processar mensagem recebida
     */
    void handleMessage(char* topic, byte* payload, unsigned int length) {
        String topicStr(topic);
        String payloadStr;
        
        for (unsigned int i = 0; i < length; i++) {
            payloadStr += (char)payload[i];
        }
        
        Serial.printf("[MQTT] Mensagem recebida em %s: %s\n", topic, payloadStr.c_str());
        
        // [MQTT] Rotear para callback apropriado
        if (topicStr == MQTT_TOPIC_COMMAND) {
            if (onCommandCallback) {
                onCommandCallback(payloadStr);
            }
        }
    }
    
    /**
     * [FALLBACK] Fallback para HTTPS se MQTT falhar
     */
    void fallbackToHTTPS() {
        Serial.println("[FALLBACK] Usando HTTPS em vez de MQTT");
        
        // [FALLBACK] TODO: Implementar sincronização via HTTPS
        // Este é um placeholder para a lógica de fallback
        // A sincronização será feita via CloudAuth.h
    }
};

#endif  // MQTT_INTEGRATION_H
