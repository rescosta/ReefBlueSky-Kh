// ReefBlueSky KH Monitor - Código Principal com IA Preditiva
// Microcontrolador: ESP32 DevKit V1
// Framework: Arduino
// Versão: 2.0 (com IA preditiva e correções)
// =================================================================================

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>

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

// =================================================================================
// Objetos Globais
// =================================================================================

PumpControl pumpControl;
SensorManager sensorManager(PH_PIN, ONE_WIRE_BUS);
KH_Analyzer khAnalyzer(&pumpControl, &sensorManager);
WiFi_MQTT wifiMqtt(ssid, password, mqtt_server, 1883);
MeasurementHistory history;

// =================================================================================
// Estados e Variáveis Globais
// =================================================================================

enum SystemState {
    STARTUP,
    IDLE,
    MEASURING,
    PREDICTING,
    ERROR
};

SystemState systemState = STARTUP;
unsigned long lastMeasurementTime = 0;
unsigned long measurementInterval = 3600000;  // 1 hora em ms

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

    // Inicializar componentes
    pumpControl.begin();
    sensorManager.begin();
    khAnalyzer.begin();
    history.begin();

    // Conectar WiFi e MQTT
    Serial.println("[Main] Conectando à rede...");
    wifiMqtt.begin();

    // Definir KH de referência (água de calibração no reservatório C)
    khAnalyzer.setReferenceKH(8.0);  // Ajuste conforme sua água de referência

    systemState = IDLE;
    Serial.println("[Main] Sistema pronto!\n");
}

// =================================================================================
// Loop Principal
// =================================================================================

void loop() {
    // Manter conexão WiFi e MQTT
    wifiMqtt.loop();

    // Verificar se é hora de fazer medição
    unsigned long now = millis();
    if (now - lastMeasurementTime >= measurementInterval) {
        startMeasurementCycle();
        lastMeasurementTime = now;
    }

    // Processar ciclo de medição se em andamento
    if (systemState == MEASURING) {
        processMeasurementCycle();
    }

    // Publicar predição a cada 30 minutos
    static unsigned long lastPredictionTime = 0;
    if (now - lastPredictionTime >= 1800000) {  // 30 minutos
        publishPrediction();
        lastPredictionTime = now;
    }

    delay(100);  // Pequeno delay para evitar watchdog timeout
}

// =================================================================================
// Funções de Medição
// =================================================================================

void startMeasurementCycle() {
    Serial.println("\n========================================");
    Serial.println("[Main] Iniciando ciclo de medição");
    Serial.println("========================================\n");

    systemState = MEASURING;
    khAnalyzer.startMeasurementCycle();
}

void processMeasurementCycle() {
    // Processar próxima fase
    if (khAnalyzer.processNextPhase()) {
        KH_Analyzer::MeasurementState state = khAnalyzer.getCurrentState();

        if (state == KH_Analyzer::COMPLETE) {
            // Medição concluída
            completeMeasurement();
            systemState = IDLE;
        }
    } else {
        // Erro na medição
        Serial.println("[Main] Erro durante a medição!");
        systemState = ERROR;
        delay(5000);
        systemState = IDLE;
    }
}

void completeMeasurement() {
    KH_Analyzer::MeasurementResult result = khAnalyzer.getMeasurementResult();

    if (result.is_valid) {
        Serial.println("\n========================================");
        Serial.println("[Main] MEDIÇÃO CONCLUÍDA COM SUCESSO!");
        Serial.println("========================================");
        Serial.printf("KH: %.2f dKH\n", result.kh_value);
        Serial.printf("pH Referência: %.2f\n", result.ph_reference);
        Serial.printf("pH Amostra: %.2f\n", result.ph_sample);
        Serial.printf("Temperatura: %.1f°C\n", result.temperature);
        Serial.println("========================================\n");

        // Adicionar ao histórico
        MeasurementHistory::Measurement m = {
            result.kh_value,
            result.ph_reference,
            result.ph_sample,
            result.temperature,
            millis(),
            true
        };
        history.addMeasurement(m);

        // Publicar dados via MQTT
        publishMeasurement(result);

        // Publicar predição
        publishPrediction();
    } else {
        Serial.printf("[Main] Erro na medição: %s\n", result.error_message.c_str());
    }
}

// =================================================================================
// Funções de Publicação MQTT
// =================================================================================

void publishMeasurement(const KH_Analyzer::MeasurementResult& result) {
    if (!wifiMqtt.isMQTTConnected()) {
        Serial.println("[Main] MQTT não conectado, não é possível publicar");
        return;
    }

    wifiMqtt.publishFloat(mqtt_topic_kh, result.kh_value);
    wifiMqtt.publishFloat(mqtt_topic_ph, result.ph_sample);
    wifiMqtt.publishFloat(mqtt_topic_temp, result.temperature);
    wifiMqtt.publish(mqtt_topic_status, "measurement_complete");
}

void publishPrediction() {
    if (!wifiMqtt.isMQTTConnected()) {
        return;
    }

    // Obter recomendação de dosagem
    KHPredictor predictor;
    auto recommendation = predictor.getDosageRecommendation();

    if (recommendation.is_valid) {
        wifiMqtt.publishFloat(mqtt_topic_prediction, recommendation.predicted_kh);
        wifiMqtt.publishFloat(mqtt_topic_dosage, recommendation.dosage_adjustment);
        wifiMqtt.publishFloat(mqtt_topic_trend, predictor.getTrendRate());

        Serial.printf("[Main] Predição publicada: KH previsto = %.2f dKH\n", recommendation.predicted_kh);
    }
}

// =================================================================================
// Funções Auxiliares
// =================================================================================

void printSystemStatus() {
    Serial.println("\n========== Status do Sistema ==========");
    Serial.printf("Estado: %d\n", systemState);
    Serial.printf("WiFi Conectado: %s\n", wifiMqtt.isWiFiConnected() ? "Sim" : "Não");
    Serial.printf("MQTT Conectado: %s\n", wifiMqtt.isMQTTConnected() ? "Sim" : "Não");
    Serial.printf("Medições Armazenadas: %d\n", history.getCount());
    Serial.printf("Intervalo de Medição: %d minutos\n", history.getMeasurementInterval());
    Serial.println("=======================================\n");
}

// =================================================================================
// Fim do Código
// =================================================================================
