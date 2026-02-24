#ifndef CURRENT_MONITOR_H
#define CURRENT_MONITOR_H

#include <Arduino.h>

// Configurações do sensor de corrente
#ifdef ESP8266
  #define CURRENT_SENSOR_PIN A0      // ESP8266 tem apenas A0 (ADC0)
#else
  #define CURRENT_SENSOR_PIN 34      // ESP32 GPIO34 (ADC1_CH6)
#endif
#define CURRENT_SENSOR_ENABLED false // Mudar para true quando instalar o sensor

// Thresholds de corrente (em mA)
#define CURRENT_NORMAL_MIN 50        // Corrente mínima esperada quando motor está rodando
#define CURRENT_NORMAL_MAX 800       // Corrente máxima esperada em operação normal
#define CURRENT_STALL_THRESHOLD 900  // Corrente acima deste valor indica motor travado
#define CURRENT_SHORT_THRESHOLD 1000 // Corrente acima deste valor indica curto

// Tempos de monitoramento
#define CURRENT_CHECK_INTERVAL 100   // Intervalo entre leituras (ms)
#define CURRENT_ALARM_DELAY 2000     // Tempo para confirmar anomalia antes de alarmar (ms)

// Estados do monitoramento
enum CurrentState {
    CURRENT_IDLE,           // Nenhuma dosagem em andamento
    CURRENT_NORMAL,         // Dosagem em andamento, corrente normal
    CURRENT_LOW,            // Corrente muito baixa (motor não girando?)
    CURRENT_HIGH,           // Corrente muito alta (motor travado?)
    CURRENT_SHORT,          // Possível curto circuito
    CURRENT_SENSOR_ERROR    // Sensor não conectado ou com erro
};

// Estrutura de dados de anomalia
struct CurrentAnomaly {
    unsigned long timestamp;
    int pumpIndex;
    CurrentState state;
    float current;
    String description;
};

class CurrentMonitor {
private:
    bool enabled;
    int sensorPin;
    CurrentState currentState;

    // Dados da dosagem em andamento
    bool isMonitoring;
    int activePump;
    unsigned long dosingStartTime;
    unsigned long dosingExpectedDuration;

    // Leitura de corrente
    float lastCurrent;
    unsigned long lastReadTime;
    unsigned long anomalyStartTime;
    CurrentState anomalyState;

    // Histórico de anomalias (circular buffer)
    static const int MAX_ANOMALIES = 50;
    CurrentAnomaly anomalies[MAX_ANOMALIES];
    int anomalyIndex;
    int anomalyCount;

    // Funções privadas
    float readCurrent();
    void addAnomaly(int pumpIndex, CurrentState state, float current, String description);
    void triggerAlarm(CurrentState state, float current);

public:
    CurrentMonitor();

    // Inicialização
    void begin();
    void setEnabled(bool enable);
    bool isEnabled();

    // Controle de monitoramento
    void startMonitoring(int pumpIndex, unsigned long expectedDuration);
    void stopMonitoring();
    void update();  // Chamar no loop principal

    // Getters
    CurrentState getState();
    float getCurrentReading();
    bool isDosingActive();

    // Histórico
    int getAnomalyCount();
    CurrentAnomaly getAnomaly(int index);
    void clearAnomalies();

    // Relatório JSON para enviar ao backend
    String getStatusJSON();
    String getAnomaliesJSON();
};

#endif
