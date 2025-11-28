// =================================================================================
// ReefBlueSky KH Monitor - Versão 2.0 com IA Preditiva e Reset
// Microcontrolador: ESP32 DevKit V1
// Framework: Arduino
// Versão: 2.0 (com IA preditiva, persistência e reset)
// =================================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WebServer.h>
#include <SPIFFS.h>

// Incluir módulos de controle
#include "PumpControl.h"
#include "SensorManager.h"
#include "KH_Analyzer.h"
#include "WiFi_MQTT.h"
#include "KH_Predictor.h"
#include "MeasurementHistory.h"

// =================================================================================
// Definições de Hardware (Mapeamento de GPIO)
// =================================================================================

#define LEVEL_A_PIN 16
#define LEVEL_B_PIN 17
#define LEVEL_C_PIN 5
#define ONE_WIRE_BUS 4
#define PH_PIN 36
#define RESET_BUTTON_PIN 35  // [RESET] Botão físico para reset

// =================================================================================
// Configurações de Comunicação
// =================================================================================

const char* ssid = "SEU_WIFI_SSID";
const char* password = "SUA_SENHA_WIFI";
const char* mqtt_server = "SEU_BROKER_MQTT_IP";

// Tópicos MQTT
const char* mqtt_topic_kh = "reefbluesky/kh_monitor/kh_value";
const char* mqtt_topic_ph = "reefbluesky/kh_monitor/ph_value";
const char* mqtt_topic_temp = "reefbluesky/kh_monitor/temperature";
const char* mqtt_topic_status = "reefbluesky/kh_monitor/status";
const char* mqtt_topic_prediction = "reefbluesky/kh_monitor/prediction";
const char* mqtt_topic_dosage = "reefbluesky/kh_monitor/dosage_adjustment";
const char* mqtt_topic_trend = "reefbluesky/kh_monitor/trend";

// [RESET] Tópicos MQTT para reset
const char* mqtt_topic_reset = "reefbluesky/kh_monitor/reset";
const char* mqtt_topic_reset_kh = "reefbluesky/kh_monitor/reset_kh";

// =================================================================================
// Objetos Globais
// =================================================================================

PumpControl pumpControl;
SensorManager sensorManager(PH_PIN, ONE_WIRE_BUS);
KH_Analyzer khAnalyzer(&pumpControl, &sensorManager);
WiFi_MQTT wifiMqtt(ssid, password, mqtt_server, 1883);
MeasurementHistory history;
WebServer webServer(80);  // [RESET] Servidor web na porta 80

// =================================================================================
// Estados e Variáveis Globais
// =================================================================================

enum SystemState {
    STARTUP,
    IDLE,
    MEASURING,
    PREDICTING,
    ERROR,
    WAITING_CALIBRATION  // [BOOT] Aguardando calibração inicial
};

SystemState systemState = STARTUP;
unsigned long lastMeasurementTime = 0;
unsigned long measurementInterval = 3600000;  // 1 hora em ms
unsigned long lastResetButtonCheck = 0;
bool resetButtonPressed = false;

// =================================================================================
// Setup
// =================================================================================

void setup() {
    // Inicializar Serial
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n\n========================================");
    Serial.println("ReefBlueSky KH Monitor - Inicializando");
    Serial.println("Versão: 2.0 com IA Preditiva");
    Serial.println("========================================\n");

    // [RESET] Configurar botão de reset
    pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

    // Inicializar componentes
    pumpControl.begin();
    sensorManager.begin();
    khAnalyzer.begin();
    history.begin();

    // Conectar WiFi e MQTT
    Serial.println("[Main] Conectando à rede...");
    wifiMqtt.begin();

    // [BOOT] Verificar se KH referência foi configurado
    if (!khAnalyzer.isReferenceKHConfigured()) {
        Serial.println("\n[ATENÇÃO] ===================================");
        Serial.println("[ATENÇÃO] Realizar calibração inicial do KH");
        Serial.println("[ATENÇÃO] ===================================\n");
        systemState = WAITING_CALIBRATION;
    } else {
        systemState = IDLE;
    }

    // [RESET] Configurar endpoints web
    setupWebServer();

    // [RESET] Configurar callbacks MQTT para reset
    setupMQTTCallbacks();
}

// =================================================================================
// Loop Principal
// =================================================================================

void loop() {
    // [RESET] Verificar botão físico de reset
    checkResetButton();

    // Processar servidor web
    webServer.handleClient();

    // Processar MQTT
    wifiMqtt.loop();

    // Máquina de estados
    switch (systemState) {
        case STARTUP:
            systemState = IDLE;
            break;

        case WAITING_CALIBRATION:
            // [BOOT] Aguardar configuração de KH
            delay(1000);
            Serial.println("[Main] Aguardando calibração... Configure KH via web ou MQTT");
            break;

        case IDLE:
            // Verificar se é hora de fazer medição
            if (shouldMeasure()) {
                systemState = MEASURING;
            }
            delay(1000);
            break;

        case MEASURING:
            performMeasurement();
            systemState = PREDICTING;
            break;

        case PREDICTING:
            performPrediction();
            systemState = IDLE;
            lastMeasurementTime = millis();
            break;

        case ERROR:
            Serial.println("[Main] Sistema em estado de erro");
            delay(5000);
            break;
    }
}

// =================================================================================
// [RESET] Funções de Reset
// =================================================================================

/**
 * [RESET] Reset de fábrica - Remove todos os dados
 * - Histórico de medições
 * - KH de referência
 * - Configurações salvas
 */
void factoryReset() {
    Serial.println("\n[RESET] ===================================");
    Serial.println("[RESET] Iniciando RESET DE FÁBRICA");
    Serial.println("[RESET] ===================================\n");

    // Parar qualquer ciclo em andamento
    khAnalyzer.stopMeasurement();

    // Limpar histórico
    history.clearHistory();
    Serial.println("[RESET] Histórico de medições apagado");

    // Resetar KH referência
    khAnalyzer.resetReferenceKHOnly();
    Serial.println("[RESET] KH de referência apagado");

    // Limpar SPIFFS completamente (opcional)
    // SPIFFS.format();

    // Retornar ao estado inicial
    systemState = WAITING_CALIBRATION;

    Serial.println("\n[RESET] Reset de fábrica concluído");
    Serial.println("[RESET] Configure o KH de referência antes de usar");
    Serial.println("[RESET] ===================================\n");

    // Publicar no MQTT
    wifiMqtt.publish(mqtt_topic_status, "FACTORY_RESET_COMPLETE");
}

/**
 * [RESET] Reset apenas de KH referência
 * - Remove KH de referência salvo
 * - Mantém histórico de medições
 * - Requer nova calibração antes de medir
 */
void resetKHReference() {
    Serial.println("\n[RESET] ===================================");
    Serial.println("[RESET] Resetando KH de Referência");
    Serial.println("[RESET] ===================================\n");

    // Parar qualquer ciclo em andamento
    khAnalyzer.stopMeasurement();

    // Resetar apenas KH
    if (khAnalyzer.resetReferenceKHOnly()) {
        Serial.println("[RESET] KH de referência resetado com sucesso");
        systemState = WAITING_CALIBRATION;
    } else {
        Serial.println("[RESET] ERRO ao resetar KH de referência");
    }

    Serial.println("[RESET] Configure novo KH de referência");
    Serial.println("[RESET] ===================================\n");

    // Publicar no MQTT
    wifiMqtt.publish(mqtt_topic_status, "KH_RESET_COMPLETE");
}

// =================================================================================
// [RESET] Verificar Botão Físico
// =================================================================================

/**
 * [RESET] Detectar pressão do botão de reset
 * - Pressão curta (< 3s): Reset de KH
 * - Pressão longa (> 5s): Reset de fábrica
 */
void checkResetButton() {
    bool buttonState = digitalRead(RESET_BUTTON_PIN);

    if (buttonState == LOW && !resetButtonPressed) {
        // Botão pressionado
        resetButtonPressed = true;
        lastResetButtonCheck = millis();
        Serial.println("[RESET] Botão pressionado...");
    }

    if (buttonState == HIGH && resetButtonPressed) {
        // Botão liberado
        unsigned long pressDuration = millis() - lastResetButtonCheck;

        if (pressDuration > 5000) {
            // Pressão longa - Reset de fábrica
            Serial.println("[RESET] Pressão longa detectada - RESET DE FÁBRICA");
            factoryReset();
        } else if (pressDuration > 1000) {
            // Pressão média - Reset de KH
            Serial.println("[RESET] Pressão média detectada - RESET DE KH");
            resetKHReference();
        }

        resetButtonPressed = false;
    }
}

// =================================================================================
// [RESET] Configurar Servidor Web
// =================================================================================

void setupWebServer() {
    // [RESET] Endpoint para reset de fábrica
    webServer.on("/factory_reset", HTTP_POST, []() {
        Serial.println("[WEB] Requisição: /factory_reset");
        factoryReset();
        webServer.send(200, "application/json", "{\"status\":\"factory_reset_initiated\"}");
    });

    // [RESET] Endpoint para reset de KH
    webServer.on("/reset_kh", HTTP_POST, []() {
        Serial.println("[WEB] Requisição: /reset_kh");
        resetKHReference();
        webServer.send(200, "application/json", "{\"status\":\"kh_reset_initiated\"}");
    });

    // [BOOT] Endpoint para configurar KH referência
    webServer.on("/set_kh", HTTP_POST, []() {
        Serial.println("[WEB] Requisição: /set_kh");
        if (webServer.hasArg("value")) {
            float kh = webServer.arg("value").toFloat();
            khAnalyzer.setReferenceKH(kh);
            webServer.send(200, "application/json", "{\"status\":\"kh_configured\",\"value\":" + String(kh, 2) + "}");
        } else {
            webServer.send(400, "application/json", "{\"error\":\"missing_value_parameter\"}");
        }
    });

    // Endpoint para status
    webServer.on("/status", HTTP_GET, []() {
        String json = "{";
        json += "\"state\":\"" + String(systemState) + "\",";
        json += "\"kh_configured\":" + String(khAnalyzer.isReferenceKHConfigured() ? "true" : "false") + ",";
        json += "\"kh_reference\":" + String(khAnalyzer.getReferenceKH(), 2) + ",";
        json += "\"measurements\":" + String(history.getCount());
        json += "}";
        webServer.send(200, "application/json", json);
    });

    webServer.begin();
    Serial.println("[WEB] Servidor web iniciado na porta 80");
}

// =================================================================================
// [RESET] Configurar Callbacks MQTT
// =================================================================================

void setupMQTTCallbacks() {
    // [RESET] Callback para reset de fábrica via MQTT
    // Publicar em: reefbluesky/kh_monitor/reset com payload "factory"
    
    // [RESET] Callback para reset de KH via MQTT
    // Publicar em: reefbluesky/kh_monitor/reset_kh com qualquer payload
}

// =================================================================================
// Funções Auxiliares
// =================================================================================

bool shouldMeasure() {
    return (millis() - lastMeasurementTime) >= measurementInterval;
}

void performMeasurement() {
    Serial.println("[Main] Iniciando ciclo de medição...");

    if (khAnalyzer.startMeasurementCycle()) {
        // Processar fases do ciclo
        while (khAnalyzer.processNextPhase()) {
            delay(100);
        }

        // Obter resultado
        KH_Analyzer::MeasurementResult result = khAnalyzer.getMeasurementResult();

        if (result.is_valid) {
            Serial.printf("[Main] Medição concluída: KH=%.2f dKH\n", result.kh_value);

            // Adicionar ao histórico
            MeasurementHistory::Measurement m;
            m.kh = result.kh_value;
            m.ph_ref = result.ph_reference;
            m.ph_sample = result.ph_sample;
            m.temperature = result.temperature;
            m.timestamp = millis();
            m.is_valid = true;

            history.addMeasurement(m);

            // Publicar no MQTT
            wifiMqtt.publish(mqtt_topic_kh, String(result.kh_value, 2).c_str());
            wifiMqtt.publish(mqtt_topic_ph, String(result.ph_reference, 2).c_str());
            wifiMqtt.publish(mqtt_topic_temp, String(result.temperature, 1).c_str());
        } else {
            Serial.println("[Main] ERRO: Medição inválida");
            wifiMqtt.publish(mqtt_topic_status, "MEASUREMENT_FAILED");
        }
    } else {
        Serial.println("[Main] ERRO: Falha ao iniciar ciclo de medição");
        if (khAnalyzer.hasError()) {
            Serial.println("[Main] " + khAnalyzer.getErrorMessage());
        }
    }
}

void performPrediction() {
    Serial.println("[Main] Realizando predição de KH...");
    // Implementar predição usando KH_Predictor
}
