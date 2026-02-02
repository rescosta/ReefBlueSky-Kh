//PumpControl.cpp

#include "PumpControl.h"
#include "HardwarePins.h"


PumpControl::PumpControl() {
    // Bomba A (aquário ↔ R1)
    pump1.PWM     = 14;
    pump1.DIR1    = 12;
    pump1.DIR2    = 13;
    pump1.channel = 0;
    pump1.running = false;

    // Bomba B (R1 ↔ R2)
    pump2.PWM     = 27;
    pump2.DIR1    = 25;
    pump2.DIR2    = 26;
    pump2.channel = 1;
    pump2.running = false;

    // Bomba C (R2 ↔ R3)
    pump3.PWM     = 21;
    pump3.DIR1    = 18;
    pump3.DIR2    = 19;
    pump3.channel = 2;
    pump3.running = false;

    // [FIX] Bomba D (Compressor) - Corrigido para usar COMPRESSOR_PIN (GPIO15)
    pump4.PWM     = COMPRESSOR_PIN;  // GPIO15, não GPIO5!
    pump4.DIR1    = COMPRESSOR_PIN;
    pump4.DIR2    = COMPRESSOR_PIN;
    pump4.channel = 3;
    pump4.running = false;
}

void PumpControl::begin() {
    Serial.println("[PumpControl] Inicializando controle de bombas...");

    // DIR1/DIR2 como saída
    pinMode(pump1.DIR1, OUTPUT);
    pinMode(pump1.DIR2, OUTPUT);
    pinMode(pump2.DIR1, OUTPUT);
    pinMode(pump2.DIR2, OUTPUT);
    pinMode(pump3.DIR1, OUTPUT);
    pinMode(pump3.DIR2, OUTPUT);
    pinMode(pump4.DIR1, OUTPUT);  // ULN2003 (GPIO5)

    // PWM
    ledcAttach(pump1.PWM, PWM_FREQ, PWM_RESOLUTION);
    ledcAttach(pump2.PWM, PWM_FREQ, PWM_RESOLUTION);
    ledcAttach(pump3.PWM, PWM_FREQ, PWM_RESOLUTION);
    ledcAttach(pump4.PWM, PWM_FREQ, PWM_RESOLUTION);

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
    setPumpPWM(4, PUMP_SPEED);   // PWM em GPIO5
    pump4.running = true;
}

void PumpControl::pumpD_stop() {
    Serial.println("[PumpControl] Compressor: Desligando");
    setPumpPWM(4, 0);            // 0 = desligado
    pump4.running = false;
}

void PumpControl::pump4_fill() {
  digitalWrite(PUMP4_IN1, HIGH);
  digitalWrite(PUMP4_IN2, LOW);
  analogWrite(PUMP4_PWM, 180);  
}

void PumpControl::pump4_stop() {
  digitalWrite(PUMP4_IN1, LOW);
  digitalWrite(PUMP4_IN2, LOW);
  analogWrite(PUMP4_PWM, 0);
}


// ===== Métodos Gerais =====

// ===== Métodos Gerais =====

void PumpControl::setPumpDirection(int pump_id, bool forward) {
    PumpData* pump = nullptr;
    switch (pump_id) {
        case 1: pump = &pump1; break;
        case 2: pump = &pump2; break;
        case 3: pump = &pump3; break;
        case 4: pump = &pump4; break;
        default: return;
    }

    if (pump_id == 4) {
        // ULN2003: só um sentido (GPIO5 sempre HIGH quando ligado)
        digitalWrite(pump->DIR1, HIGH);
        return;
    }

    // TB6612: IN1/IN2 = DIR1/DIR2
    if (forward) {
        digitalWrite(pump->DIR1, HIGH);
        digitalWrite(pump->DIR2, LOW);
    } else {
        digitalWrite(pump->DIR1, LOW);
        digitalWrite(pump->DIR2, HIGH);
    }
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

void PumpControl::setPumpPWM(int pump_id, int speed) {
    PumpData* pump = nullptr;
    switch (pump_id) {
        case 1: pump = &pump1; break;
        case 2: pump = &pump2; break;
        case 3: pump = &pump3; break;
        case 4: pump = &pump4; break;
        default: return;
    }
    ledcWrite(pump->PWM, speed);
}
