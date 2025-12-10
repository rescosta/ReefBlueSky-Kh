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

#define MQTT_TOPIC_EVENT "reefbluesky/device/event"

#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>
#include <queue>

#include <ArduinoJson.h>

extern KH_Analyzer khAnalyzer;
extern MeasurementHistory history;
extern PumpControl pumpControl;
extern SystemState systemState;       // enum do .ino
extern WiFi_MQTT wifiMqtt;

void factoryReset();
void resetKHReference();

// Tópicos MQTT (já existem no .ino; declare como extern aqui)
extern const char* mqtt_topic_status;
extern const char* mqtt_topic_kh;
extern const char* mqtt_topic_ph;
extern const char* mqtt_topic_temp;
extern const char* mqtt_topic_prediction;
extern const char* mqtt_topic_dosage;
extern const char* mqtt_topic_trend;
extern const char* mqtt_topic_reset;
extern const char* mqtt_topic_reset_kh;

void handleMqttCommand(const String& topic, const String& payload);

void publishEvent(const char* type, const char* severity, const String& message);


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
            handleMqttCommand(topicStr, payloadStr);
            
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



// ======================================================================
// Implementação de comandos MQTT em JSON
// ======================================================================

void publishEvent(const char* type, const char* severity, const String& message) {
    StaticJsonDocument<256> doc;
    doc["type"]      = type;
    doc["severity"]  = severity;          // INFO, WARN, ERROR
    doc["message"]   = message;
    doc["timestamp"] = millis();

    String payload;
    serializeJson(doc, payload);

    Serial.printf("[EVENT] %s | %s | %s\n", type, severity, message.c_str());

    if (wifiMqtt.isMQTTConnected()) {
        wifiMqtt.publish(MQTT_TOPIC_EVENT, payload.c_str());
    } else {
        Serial.println("[EVENT] MQTT offline, evento não publicado");
    }
}


void handleMqttCommand(const String& topic, const String& payload) {
    Serial.println("[MQTT] Comando recebido em " + topic + ": " + payload);

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.printf("[MQTT] ERRO: JSON inválido (%s)\n", err.c_str());
        publishEvent("mqtt_cmd_error", "WARN", "JSON invalido no comando");
        return;
    }

    String cmd = doc["cmd"] | "";
    if (cmd.length() == 0) {
        publishEvent("mqtt_cmd_error", "WARN", "Campo cmd ausente");
        return;
    }

    // 1) Configurar KH de referência
    if (cmd == "set_kh_reference") {
        float kh = doc["kh_reference"] | 0.0f;
        khAnalyzer.setReferenceKH(kh);
        publishEvent("set_kh_reference", "INFO", "KH referencia atualizado via MQTT");
    }

    // 2) Controle manual de bomba
    else if (cmd == "pump_control") {
        String target = doc["target"] | "kh_pump";   // por enquanto, vamos mapear manualmente
        String action = doc["action"] | "";
        String pump   = doc["pump"]   | "A";         // A, B, C, D
        int speed     = doc["speed"]  | 200;         // opcional
        int pumpId    = 1;
    
        if      (pump == "A") pumpId = 1;
        else if (pump == "B") pumpId = 2;
        else if (pump == "C") pumpId = 3;
        else if (pump == "D") pumpId = 4;
    
        // permitir ajuste de velocidade
        pumpControl.setPumpSpeed(pumpId, speed);
    
        if (pump == "A") {
            if (action == "fill")      pumpControl.pumpA_fill();
            else if (action == "discharge") pumpControl.pumpA_discharge();
            else if (action == "stop") pumpControl.pumpA_stop();
        } else if (pump == "B") {
            if (action == "fill")      pumpControl.pumpB_fill();
            else if (action == "discharge") pumpControl.pumpB_discharge();
            else if (action == "stop") pumpControl.pumpB_stop();
        } else if (pump == "C") {
            if (action == "fill")      pumpControl.pumpC_fill();
            else if (action == "stop") pumpControl.pumpC_stop();
        } else if (pump == "D") {
            if (action == "start")     pumpControl.pumpD_start();
            else if (action == "stop") pumpControl.pumpD_stop();
        } else {
            publishEvent("pump_control", "WARN", "Bomba desconhecida");
            return;
        }
    
        publishEvent("pump_control", "INFO", "Comando de bomba executado");
    }


    // 3) Iniciar ciclo de teste
    else if (cmd == "start_test") {
        String mode = doc["mode"] | "full_cycle";
        if (systemState == IDLE || systemState == WAITING_CALIBRATION) {
            if (!khAnalyzer.isReferenceKHConfigured()) {
                publishEvent("start_test", "WARN", "KH nao configurado");
            } else {
                systemState = MEASURING;
                publishEvent("start_test", "INFO", "Ciclo de medicao iniciado via MQTT");
            }
        } else {
            publishEvent("start_test", "WARN", "Sistema ocupado, nao iniciou teste");
        }
    }

    // 4) Abort test
    else if (cmd == "abort_test") {
        khAnalyzer.stopMeasurement();
        systemState = IDLE;
        publishEvent("abort_test", "INFO", "Teste abortado via MQTT");
    }

    // 5) Reset de fábrica
    else if (cmd == "factory_reset") {
        factoryReset();
        publishEvent("factory_reset", "INFO", "Factory reset via MQTT");
    }

    // 6) Reset só de KH
    else if (cmd == "reset_kh_reference") {
        resetKHReference();
        publishEvent("reset_kh_reference", "INFO", "Reset de KH via MQTT");
    }

    // 7) Programação de testes (intervalo)
    else if (cmd == "set_schedule") {
        int intervalMin = doc["interval_minutes"] | 60;
        intervalMin = constrain(intervalMin, 60, 24 * 60);  // 1h a 24h
        history.setMeasurementInterval(intervalMin);
        publishEvent("set_schedule", "INFO", "Intervalo de medicao ajustado");
    }

    // 8) Etapas de calibração de bomba

    else if (cmd == "calibration_step") {
        String step  = doc["step"]  | "";
        publishEvent("calibration_step", "WARN",
                     "API de calibracao ainda nao implementada: " + step);
    }
  
//    else if (cmd == "calibration_step") {
//        String step  = doc["step"]  | "";
//        String target = doc["target"] | "kh_pump";
//        float refVol  = doc["reference_volume_ml"] | 0.0f;
//        float measVol = doc["measured_volume_ml"]   | 0.0f;
//
//        if (step == "start_pump_calibration") {
//            pumpControl.startCalibration(refVol);
//            publishEvent("calibration_step", "INFO", "Calibracao de bomba iniciada");
//       } else if (step == "save_pump_factor") {
//            pumpControl.finishCalibration(measVol);
//            publishEvent("calibration_step", "INFO", "Calibracao de bomba concluida");
//        } else {
//            publishEvent("calibration_step", "WARN", "Step de calibracao desconhecido");
//        }
//    }

    else {
        publishEvent("mqtt_cmd_error", "WARN", "Comando desconhecido: " + cmd);
    }
}  
    
#endif  // MQTT_INTEGRATION_H
