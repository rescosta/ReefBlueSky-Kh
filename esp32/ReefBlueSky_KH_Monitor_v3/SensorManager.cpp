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

    // Sensores ópticos de nível (saída digital)
    pinMode(LEVEL_A_PIN, INPUT);
    pinMode(LEVEL_B_PIN, INPUT);
    pinMode(LEVEL_C_PIN, INPUT);

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
    if (!_levelAEnabled) { Serial.println("[SensorManager] Level A DESATIVADO"); return 0; }
    int adc = analogRead(LEVEL_A_PIN);
    int status = (adc < LEVEL_THRESHOLD) ? 1 : 0;
    Serial.printf("[LEVEL A] ADC=%d V=%.2fV -> %d\n", adc, adc*3.3/4095, status);
    return status;  // ← ÚNICO return
}

// Igual para B e C:
int SensorManager::getLevelB() {
    if (!_levelBEnabled) { Serial.println("[SensorManager] Level B DESATIVADO"); return 0; }
    int adc = analogRead(LEVEL_B_PIN);
    int status = (adc < LEVEL_THRESHOLD) ? 1 : 0;
    Serial.printf("[LEVEL B] ADC=%d V=%.2fV -> %d\n", adc, adc*3.3/4095, status);
    return status;
}

int SensorManager::getLevelC() {
    if (!_levelCEnabled) { Serial.println("[SensorManager] Level C DESATIVADO"); return 0; }
    int adc = analogRead(LEVEL_C_PIN);
    int status = (adc < LEVEL_THRESHOLD) ? 1 : 0;
    Serial.printf("[LEVEL C] ADC=%d V=%.2fV -> %d\n", adc, adc*3.3/4095, status);
    return status;
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
