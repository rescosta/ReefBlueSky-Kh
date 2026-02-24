//SensorManager.cpp

#include "SensorManager.h"
#include "HardwarePins.h"


SensorManager::SensorManager(int ph_pin, int temp_pin)
    : _ph_pin(ph_pin), _temp_pin(temp_pin), _last_ph(7.0), _last_temperature(-127.0f) {
    _oneWire = new OneWire(_temp_pin);
    _sensors = new DallasTemperature(_oneWire);
    
    // Calibração padrão (ajuste conforme seu sensor)
    _ph_neutral_voltage = 2.5f;   // ~3.3V * 0.758 para pH 7
    _ph_acidic_voltage = 1.8f;    // ~3.3V * 0.545 para pH 4
}

void SensorManager::begin() {
    Serial.println("[SensorManager] Inicializando sensores...");

    pinMode(_ph_pin, INPUT);

    // Sensores de nível (saída digital open-drain — requer pull-up interno)
    pinMode(LEVEL_A_PIN, INPUT_PULLUP);
    pinMode(LEVEL_B_PIN, INPUT_PULLUP);
    pinMode(LEVEL_C_PIN, INPUT_PULLUP);

    _sensors->begin();

    readPHRaw();

    Serial.println("[SensorManager] Sensores inicializados com sucesso");
}


float SensorManager::getPH() {
    if (_simulatePH) {
        // por enquanto, retorna sempre o valor "ref" simulado
        return _simPHRef;
    }
    _last_ph = readPHRaw();
    return _last_ph;
}

float SensorManager::getTemperature() {
    _sensors->requestTemperatures();   // usa o objeto certo
    delay(200);                        // tempo para conversão
    _last_temperature = readTemperatureRaw();
    return _last_temperature;
}

int SensorManager::getLevelA() {
    if (!_levelAEnabled) return 0;

    // Debounce baseado em tempo: exige sinal estável por DEBOUNCE_MS
    // Imune a glitches elétricos causados por outros sensores no mesmo barramento
    static int           stableA  = -1;   // -1 = não inicializado ainda
    static int           pendingA = -1;
    static unsigned long tPendA   = 0;
    const unsigned long  DEBOUNCE_MS = 80;

    int raw     = digitalRead(LEVEL_A_PIN);
    int logical = (raw == LOW) ? 1 : 0;   // HIGH=seco(0), LOW=molhado(1)

    if (stableA < 0) {
        stableA = logical;                 // inicializa imediatamente no boot
        return stableA;
    }

    if (logical == stableA) {
        pendingA = -1;                     // voltou ao estado estável: cancela transição
        return stableA;
    }

    // Valor diferente do estável: só aceita após DEBOUNCE_MS contínuos
    if (pendingA != logical) {
        pendingA = logical;
        tPendA   = millis();
    } else if (millis() - tPendA >= DEBOUNCE_MS) {
        stableA  = logical;
        pendingA = -1;
        Serial.printf("[LEVEL A] -> %d\n", stableA);
    }

    return stableA;
}

int SensorManager::getLevelB() {
    if (!_levelBEnabled) return 0;

    static int           stableB  = -1;
    static int           pendingB = -1;
    static unsigned long tPendB   = 0;
    const unsigned long  DEBOUNCE_MS = 80;

    int raw     = digitalRead(LEVEL_B_PIN);
    int logical = (raw == LOW) ? 1 : 0;

    if (stableB < 0) {
        stableB = logical;
        return stableB;
    }

    if (logical == stableB) {
        pendingB = -1;
        return stableB;
    }

    if (pendingB != logical) {
        pendingB = logical;
        tPendB   = millis();
    } else if (millis() - tPendB >= DEBOUNCE_MS) {
        stableB  = logical;
        pendingB = -1;
        Serial.printf("[LEVEL B] -> %d\n", stableB);
    }

    return stableB;
}

int SensorManager::getLevelC() {
    if (!_levelCEnabled) return 0;

    static int           stableC  = -1;
    static int           pendingC = -1;
    static unsigned long tPendC   = 0;
    const unsigned long  DEBOUNCE_MS = 80;

    int raw     = digitalRead(LEVEL_C_PIN);
    int logical = (raw == LOW) ? 1 : 0;

    if (stableC < 0) {
        stableC = logical;
        return stableC;
    }

    if (logical == stableC) {
        pendingC = -1;
        return stableC;
    }

    if (pendingC != logical) {
        pendingC = logical;
        tPendC   = millis();
    } else if (millis() - tPendC >= DEBOUNCE_MS) {
        stableC  = logical;
        pendingC = -1;
        Serial.printf("[LEVEL C] -> %d\n", stableC);
    }

    return stableC;
}




void SensorManager::calibratePH(float ph_neutral, float ph_acidic) {
    // Ler tensões de calibração
    float v_neutral = averageAnalogRead(_ph_pin, PH_SAMPLES);
    float v_acidic = averageAnalogRead(_ph_pin, PH_SAMPLES);
    
    // Converter para voltagem
    _ph_neutral_voltage = v_neutral * VOLTAGE_REF / ADC_RESOLUTION;
    _ph_acidic_voltage = v_acidic * VOLTAGE_REF / ADC_RESOLUTION;
    
    Serial.printf("[SensorManager] Calibração de pH concluída\n");
    Serial.printf("  Neutral (pH 7): %.2f V\n", _ph_neutral_voltage);
    Serial.printf("  Acidic (pH 4): %.2f V\n", _ph_acidic_voltage);
}


void SensorManager::setSimulatePH(bool enabled, float refValue, float sampleValue) {
    _simulatePH  = enabled;
    _simPHRef    = refValue;
    _simPHSample = sampleValue;
}


float SensorManager::getLastPH() const {
    return _last_ph;
}

float SensorManager::getLastTemperature() const {
    return _last_temperature;
}

bool SensorManager::isPHSensorOK() {
    float ph = getPH();
    return ph >= 0 && ph <= 14;
}

bool SensorManager::isTemperatureSensorOK() {
    return _tempSensorOk;
}

// ===== Métodos Privados =====

float SensorManager::readPHRaw() {
    float raw = averageAnalogRead(_ph_pin, PH_SAMPLES);
    float voltage = raw * VOLTAGE_REF / ADC_RESOLUTION;
    float ph = voltageToPhValue(voltage);

    Serial.printf("[SensorManager] PH raw=%.1f voltage=%.3fV ph=%.2f\n", raw, voltage, ph);

    return ph;
}

float SensorManager::readTemperatureRaw() {
    float temp = _sensors->getTempCByIndex(0);

    // DS18B20 erro típico = -127.0
    if (temp <= -100.0f || temp > 85.0f) {
        _tempSensorOk = false;          // novo membro bool
        Serial.println("[SensorManager] ERRO: leitura inválida do DS18B20");
        return _last_temperature;       // mantém último valor bom
    }

    _tempSensorOk = true;
    return temp;
}


float SensorManager::voltageToPhValue(float voltage) {
    // Usar calibração para converter voltagem em pH
    // Fórmula linear: pH = pH_neutral + (voltage - V_neutral) * (pH_acidic - pH_neutral) / (V_acidic - V_neutral)
    
    float ph_range = 7.0f - 4.0f;  // pH 7 a pH 4
    float voltage_range = _ph_neutral_voltage - _ph_acidic_voltage;
    
    if (fabs(voltage_range) < 0.01f) {
        return 7.0f;  // Evitar divisão por zero
    }
    
    float ph = 7.0f + (voltage - _ph_neutral_voltage) * ph_range / voltage_range;
    
    // Limitar a faixa de pH válida
    ph = constrain(ph, 0.0f, 14.0f);
    
    return ph;
}

float SensorManager::averageAnalogRead(int pin, int samples) {
    long sum = 0;
    
    for (int i = 0; i < samples; i++) {
        sum += analogRead(pin);
        delay(10);
    }
    
    return sum / (float)samples;
}

void SensorManager::setLevelAEnabled(bool enabled) {
    _levelAEnabled = enabled;
}

void SensorManager::setLevelBEnabled(bool enabled) {
    _levelBEnabled = enabled;
}

void SensorManager::setLevelCEnabled(bool enabled) {
    _levelCEnabled = enabled;
}

bool SensorManager::isLevelAEnabled() const { return _levelAEnabled; }
bool SensorManager::isLevelBEnabled() const { return _levelBEnabled; }
bool SensorManager::isLevelCEnabled() const { return _levelCEnabled; }

