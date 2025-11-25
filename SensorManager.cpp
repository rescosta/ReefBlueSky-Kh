#include "SensorManager.h"

SensorManager::SensorManager(int ph_pin, int temp_pin)
    : _ph_pin(ph_pin), _temp_pin(temp_pin), _last_ph(7.0), _last_temperature(25.0) {
    _oneWire = new OneWire(_temp_pin);
    _sensors = new DallasTemperature(_oneWire);
    
    // Calibração padrão (ajuste conforme seu sensor)
    _ph_neutral_voltage = 2.5f;   // ~3.3V * 0.758 para pH 7
    _ph_acidic_voltage = 1.8f;    // ~3.3V * 0.545 para pH 4
}

void SensorManager::begin() {
    Serial.println("[SensorManager] Inicializando sensores...");
    
    // Configurar pino de pH como entrada
    pinMode(_ph_pin, INPUT);
    
    // Inicializar sensor de temperatura
    _sensors->begin();
    
    // Fazer primeira leitura
    readTemperatureRaw();
    readPHRaw();
    
    Serial.println("[SensorManager] Sensores inicializados com sucesso");
}

float SensorManager::getPH() {
    _last_ph = readPHRaw();
    return _last_ph;
}

float SensorManager::getTemperature() {
    _last_temperature = readTemperatureRaw();
    return _last_temperature;
}

int SensorManager::getLevelA() {
    // Ler pino de nível A (GPIO 16)
    return analogRead(16);
}

int SensorManager::getLevelB() {
    // Ler pino de nível B (GPIO 17)
    return analogRead(17);
}

int SensorManager::getLevelC() {
    // Ler pino de nível C (GPIO 5)
    return analogRead(5);
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
    float temp = getTemperature();
    return temp >= 15.0f && temp <= 35.0f;
}

// ===== Métodos Privados =====

float SensorManager::readPHRaw() {
    float voltage = averageAnalogRead(_ph_pin, PH_SAMPLES);
    voltage = voltage * VOLTAGE_REF / ADC_RESOLUTION;
    
    return voltageToPhValue(voltage);
}

float SensorManager::readTemperatureRaw() {
    _sensors->requestTemperatures();
    float temp = _sensors->getTempCByIndex(0);
    
    // Validar leitura
    if (temp < -127.0f || temp > 85.0f) {
        return _last_temperature;  // Retornar última leitura válida
    }
    
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
