#include "PumpControl.h"

PumpControl::PumpControl() {
    // Configurar pinos das bombas (ajuste conforme seu hardware)
    pump1 = {25, 26, 0, false};  // Bomba A
    pump2 = {27, 14, 1, false};  // Bomba B
    pump3 = {32, 33, 2, false};  // Bomba C
    pump4 = {12, 13, 3, false};  // Bomba D (Compressor)
}

void PumpControl::begin() {
    Serial.println("[PumpControl] Inicializando controle de bombas...");

    // Configurar pinos de direção como saída
    pinMode(pump1.DIR, OUTPUT);
    pinMode(pump2.DIR, OUTPUT);
    pinMode(pump3.DIR, OUTPUT);
    pinMode(pump4.DIR, OUTPUT);

    // Configurar PWM usando a nova API do ESP32 v3.0+
    // ledcAttach(pin, frequency, resolution)
    ledcAttach(pump1.PWM, PWM_FREQ, PWM_RESOLUTION);
    ledcAttach(pump2.PWM, PWM_FREQ, PWM_RESOLUTION);
    ledcAttach(pump3.PWM, PWM_FREQ, PWM_RESOLUTION);
    ledcAttach(pump4.PWM, PWM_FREQ, PWM_RESOLUTION);

    // Parar todas as bombas
    stopAll();

    Serial.println("[PumpControl] Bombas inicializadas com sucesso");
}

// ===== BOMBA A (Coleta) =====

void PumpControl::pumpA_fill() {
    Serial.println("[PumpControl] Bomba A: Enchendo");
    setPumpDirection(1, true);
    setPumpPWM(1, PUMP_SPEED);
    pump1.running = true;
}

void PumpControl::pumpA_discharge() {
    Serial.println("[PumpControl] Bomba A: Descarregando");
    setPumpDirection(1, false);
    setPumpPWM(1, PUMP_SPEED);
    pump1.running = true;
}

void PumpControl::pumpA_stop() {
    Serial.println("[PumpControl] Bomba A: Parando");
    setPumpPWM(1, 0);
    pump1.running = false;
}

// ===== BOMBA B (Descarte) =====

void PumpControl::pumpB_fill() {
    Serial.println("[PumpControl] Bomba B: Enchendo");
    setPumpDirection(2, true);
    setPumpPWM(2, PUMP_SPEED);
    pump2.running = true;
}

void PumpControl::pumpB_discharge() {
    Serial.println("[PumpControl] Bomba B: Descarregando");
    setPumpDirection(2, false);
    setPumpPWM(2, PUMP_SPEED);
    pump2.running = true;
}

void PumpControl::pumpB_stop() {
    Serial.println("[PumpControl] Bomba B: Parando");
    setPumpPWM(2, 0);
    pump2.running = false;
}

// ===== BOMBA C (Referência) =====

void PumpControl::pumpC_fill() {
    Serial.println("[PumpControl] Bomba C: Enchendo (Referência)");
    setPumpDirection(3, true);
    setPumpPWM(3, PUMP_SPEED);
    pump3.running = true;
}

void PumpControl::pumpC_discharge() {
    Serial.println("[PumpControl] Bomba C: Descarregando (Referência)");
    setPumpDirection(3, false);
    setPumpPWM(3, PUMP_SPEED);
    pump3.running = true;
}

void PumpControl::pumpC_stop() {
    Serial.println("[PumpControl] Bomba C: Parando");
    setPumpPWM(3, 0);
    pump3.running = false;
}

// ===== BOMBA D (Compressor) =====

void PumpControl::pumpD_start() {
    Serial.println("[PumpControl] Compressor: Ligando");
    digitalWrite(pump4.DIR, HIGH);
    setPumpPWM(4, PUMP_SPEED);
    pump4.running = true;
}

void PumpControl::pumpD_stop() {
    Serial.println("[PumpControl] Compressor: Desligando");
    setPumpPWM(4, 0);
    pump4.running = false;
}

// ===== Métodos Gerais =====

void PumpControl::setPumpSpeed(int pump_id, int speed) {
    if (pump_id < 1 || pump_id > 4) {
        Serial.printf("[PumpControl] ID de bomba inválido: %d\n", pump_id);
        return;
    }

    speed = constrain(speed, 0, 255);
    setPumpPWM(pump_id, speed);

    Serial.printf("[PumpControl] Bomba %d: Velocidade = %d\n", pump_id, speed);
}

void PumpControl::stopAll() {
    Serial.println("[PumpControl] Parando todas as bombas");
    pumpA_stop();
    pumpB_stop();
    pumpC_stop();
    pumpD_stop();
}

bool PumpControl::isPumpRunning(int pump_id) {
    switch (pump_id) {
        case 1: return pump1.running;
        case 2: return pump2.running;
        case 3: return pump3.running;
        case 4: return pump4.running;
        default: return false;
    }
}

// ===== Métodos Privados =====

void PumpControl::setPumpDirection(int pump_id, bool forward) {
    PumpData* pump = nullptr;

    switch (pump_id) {
        case 1: pump = &pump1; break;
        case 2: pump = &pump2; break;
        case 3: pump = &pump3; break;
        case 4: pump = &pump4; break;
        default: return;
    }

    digitalWrite(pump->DIR, forward ? HIGH : LOW);
}

void PumpControl::setPumpPWM(int pump_id, int speed) {
    PumpData* pump = nullptr;

    switch (pump_id) {
        case 1: pump = &pump1; break;
        case 2: pump = &pump2; break;
        case 3: pump = &pump3; break;
        case 4: pump = &pump4; break;
        default: return;
    }

    // Usar a nova API do ESP32 v3.0+
    // ledcWrite(pin, value)
    ledcWrite(pump->PWM, speed);
}
