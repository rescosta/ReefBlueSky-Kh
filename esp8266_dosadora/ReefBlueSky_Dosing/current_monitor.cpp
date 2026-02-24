#include "current_monitor.h"

CurrentMonitor::CurrentMonitor() {
    enabled = CURRENT_SENSOR_ENABLED;
    sensorPin = CURRENT_SENSOR_PIN;
    currentState = CURRENT_IDLE;
    isMonitoring = false;
    activePump = -1;
    lastCurrent = 0;
    lastReadTime = 0;
    anomalyStartTime = 0;
    anomalyState = CURRENT_IDLE;
    anomalyIndex = 0;
    anomalyCount = 0;
}

void CurrentMonitor::begin() {
    if (enabled) {
        pinMode(sensorPin, INPUT);
        Serial.println("[Current] Sensor de corrente inicializado no pino " + String(sensorPin));
    } else {
        Serial.println("[Current] Sensor de corrente DESABILITADO (hardware não instalado)");
    }
}

void CurrentMonitor::setEnabled(bool enable) {
    enabled = enable;
    if (enable) {
        Serial.println("[Current] Sensor de corrente HABILITADO");
    } else {
        Serial.println("[Current] Sensor de corrente DESABILITADO");
    }
}

bool CurrentMonitor::isEnabled() {
    return enabled;
}

void CurrentMonitor::startMonitoring(int pumpIndex, unsigned long expectedDuration) {
    isMonitoring = true;
    activePump = pumpIndex;
    dosingStartTime = millis();
    dosingExpectedDuration = expectedDuration;
    anomalyStartTime = 0;
    anomalyState = CURRENT_IDLE;

    if (enabled) {
        Serial.println("[Current] Iniciando monitoramento - Bomba: " + String(pumpIndex) +
                       " Duração esperada: " + String(expectedDuration) + "ms");
    }
}

void CurrentMonitor::stopMonitoring() {
    if (isMonitoring && enabled) {
        unsigned long actualDuration = millis() - dosingStartTime;
        float deviation = ((float)actualDuration / dosingExpectedDuration - 1.0) * 100;

        Serial.println("[Current] Monitoramento finalizado - Bomba: " + String(activePump));
        Serial.println("[Current] Duração: " + String(actualDuration) + "ms (esperado: " +
                       String(dosingExpectedDuration) + "ms, desvio: " + String(deviation, 1) + "%)");

        // Se demorou muito mais que o esperado, registrar anomalia
        if (deviation > 20) {
            addAnomaly(activePump, CURRENT_HIGH, lastCurrent,
                      "Dosagem demorou " + String(deviation, 1) + "% mais que esperado");
        }
    }

    isMonitoring = false;
    activePump = -1;
    currentState = CURRENT_IDLE;
}

void CurrentMonitor::update() {
    if (!enabled || !isMonitoring) {
        return;
    }

    unsigned long now = millis();

    // Ler corrente no intervalo configurado
    if (now - lastReadTime >= CURRENT_CHECK_INTERVAL) {
        lastReadTime = now;
        lastCurrent = readCurrent();

        // Analisar corrente
        CurrentState newState = CURRENT_NORMAL;

        if (lastCurrent < CURRENT_NORMAL_MIN) {
            newState = CURRENT_LOW;
        } else if (lastCurrent >= CURRENT_SHORT_THRESHOLD) {
            newState = CURRENT_SHORT;
        } else if (lastCurrent >= CURRENT_STALL_THRESHOLD) {
            newState = CURRENT_HIGH;
        }

        // Se estado mudou para anormal, iniciar contagem
        if (newState != CURRENT_NORMAL && newState != currentState) {
            if (anomalyStartTime == 0) {
                anomalyStartTime = now;
                anomalyState = newState;
            }
        }

        // Se estado voltou ao normal, resetar contagem
        if (newState == CURRENT_NORMAL) {
            anomalyStartTime = 0;
            anomalyState = CURRENT_IDLE;
        }

        // Se anomalia persistir por tempo suficiente, alarmar
        if (anomalyStartTime > 0 && (now - anomalyStartTime >= CURRENT_ALARM_DELAY)) {
            triggerAlarm(anomalyState, lastCurrent);
            anomalyStartTime = 0;  // Resetar para não alarmar continuamente
        }

        currentState = newState;
    }

    // Watchdog: Se dosagem demorar mais que esperado + margem, alarmar
    unsigned long elapsed = now - dosingStartTime;
    unsigned long maxDuration = dosingExpectedDuration + (dosingExpectedDuration * 20 / 100);  // +20%

    if (elapsed > maxDuration) {
        Serial.println("[Current] WATCHDOG: Dosagem excedeu tempo máximo!");
        addAnomaly(activePump, CURRENT_HIGH, lastCurrent,
                  "Watchdog: Dosagem excedeu " + String(elapsed - dosingExpectedDuration) + "ms");
        triggerAlarm(CURRENT_HIGH, lastCurrent);

        // TODO: Aqui deve cortar o MOSFET para parar o motor
        // digitalWrite(MOSFET_PIN, LOW);

        stopMonitoring();
    }
}

float CurrentMonitor::readCurrent() {
    if (!enabled) {
        return 0;
    }

    // Ler ADC
    int adcValue = analogRead(sensorPin);

    // Converter para corrente (mA)
    // Assumindo sensor ACS712 5A (185mV/A) com Vcc=3.3V
    // Sensibilidade = 185mV/A

    #ifdef ESP8266
        // ESP8266: ADC 10 bits (0-1023) = 0-1.0V
        float voltage = (adcValue / 1023.0) * 1000.0;  // mV (0-1000mV)
        float offsetVoltage = 500.0;  // Meio da escala
    #else
        // ESP32: ADC 12 bits (0-4095) = 0-3.3V
        float voltage = (adcValue / 4095.0) * 3300.0;  // mV
        float offsetVoltage = 1650.0;  // Vcc/2 para 3.3V
    #endif

    float sensitivity = 185.0;  // mV/A para ACS712 5A
    float currentA = (voltage - offsetVoltage) / sensitivity;
    float currentMA = abs(currentA * 1000.0);  // Converter para mA e pegar valor absoluto

    return currentMA;
}

void CurrentMonitor::addAnomaly(int pumpIndex, CurrentState state, float current, String description) {
    anomalies[anomalyIndex].timestamp = millis();
    anomalies[anomalyIndex].pumpIndex = pumpIndex;
    anomalies[anomalyIndex].state = state;
    anomalies[anomalyIndex].current = current;
    anomalies[anomalyIndex].description = description;

    anomalyIndex = (anomalyIndex + 1) % MAX_ANOMALIES;
    if (anomalyCount < MAX_ANOMALIES) {
        anomalyCount++;
    }
}

void CurrentMonitor::triggerAlarm(CurrentState state, float current) {
    String stateStr;
    String action = "";

    switch(state) {
        case CURRENT_LOW:
            stateStr = "CORRENTE BAIXA";
            action = "Motor não está girando? Verificar conexões.";
            break;
        case CURRENT_HIGH:
            stateStr = "CORRENTE ALTA";
            action = "Motor pode estar travado. Verificar bomba.";
            break;
        case CURRENT_SHORT:
            stateStr = "CURTO CIRCUITO";
            action = "URGENTE! Possível curto no ULN2003 ou fiação.";
            break;
        default:
            stateStr = "DESCONHECIDO";
    }

    Serial.println("╔════════════════════════════════════════╗");
    Serial.println("║   ⚠️  ALARME DE CORRENTE ANORMAL  ⚠️   ║");
    Serial.println("╠════════════════════════════════════════╣");
    Serial.println("║ Estado: " + stateStr);
    Serial.println("║ Bomba: " + String(activePump));
    Serial.println("║ Corrente: " + String(current, 1) + " mA");
    Serial.println("║ Ação: " + action);
    Serial.println("╚════════════════════════════════════════╝");

    addAnomaly(activePump, state, current, stateStr + ": " + action);

    // TODO: Enviar notificação push/email para o usuário
    // TODO: Se for curto, cortar MOSFET imediatamente
}

CurrentState CurrentMonitor::getState() {
    return currentState;
}

float CurrentMonitor::getCurrentReading() {
    return lastCurrent;
}

bool CurrentMonitor::isDosingActive() {
    return isMonitoring;
}

int CurrentMonitor::getAnomalyCount() {
    return anomalyCount;
}

CurrentAnomaly CurrentMonitor::getAnomaly(int index) {
    if (index < 0 || index >= anomalyCount) {
        return CurrentAnomaly{0, -1, CURRENT_IDLE, 0, "Invalid index"};
    }

    // Circular buffer: calcular índice real
    int realIndex = (anomalyIndex - anomalyCount + index + MAX_ANOMALIES) % MAX_ANOMALIES;
    return anomalies[realIndex];
}

void CurrentMonitor::clearAnomalies() {
    anomalyCount = 0;
    anomalyIndex = 0;
    Serial.println("[Current] Histórico de anomalias limpo");
}

String CurrentMonitor::getStatusJSON() {
    String json = "{";
    json += "\"enabled\":" + String(enabled ? "true" : "false") + ",";
    json += "\"monitoring\":" + String(isMonitoring ? "true" : "false") + ",";
    json += "\"pump\":" + String(activePump) + ",";
    json += "\"state\":\"";

    switch(currentState) {
        case CURRENT_IDLE: json += "idle"; break;
        case CURRENT_NORMAL: json += "normal"; break;
        case CURRENT_LOW: json += "low"; break;
        case CURRENT_HIGH: json += "high"; break;
        case CURRENT_SHORT: json += "short"; break;
        case CURRENT_SENSOR_ERROR: json += "error"; break;
    }

    json += "\",";
    json += "\"current\":" + String(lastCurrent, 2) + ",";
    json += "\"anomaly_count\":" + String(anomalyCount);
    json += "}";

    return json;
}

String CurrentMonitor::getAnomaliesJSON() {
    String json = "[";

    for (int i = 0; i < anomalyCount; i++) {
        CurrentAnomaly a = getAnomaly(i);

        if (i > 0) json += ",";
        json += "{";
        json += "\"timestamp\":" + String(a.timestamp) + ",";
        json += "\"pump\":" + String(a.pumpIndex) + ",";
        json += "\"state\":\"";

        switch(a.state) {
            case CURRENT_LOW: json += "low"; break;
            case CURRENT_HIGH: json += "high"; break;
            case CURRENT_SHORT: json += "short"; break;
            default: json += "unknown";
        }

        json += "\",";
        json += "\"current\":" + String(a.current, 2) + ",";
        json += "\"description\":\"" + a.description + "\"";
        json += "}";
    }

    json += "]";
    return json;
}
