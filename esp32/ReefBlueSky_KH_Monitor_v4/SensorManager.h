//SensorManager.h

#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#define LEVEL_THRESHOLD  2500  // Central 1.8V seco/cheio

#include <Arduino.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/**
 * @class SensorManager
 * @brief Gerenciador de sensores (pH, Temperatura, Nível)
 */
class SensorManager {
public:
    void setSimulatePH(bool enabled, float refValue, float sampleValue);
    /**
     * Construtor
     * @param ph_pin Pino analógico do sensor de pH
     * @param temp_pin Pino OneWire do sensor de temperatura
     */
    SensorManager(int ph_pin, int temp_pin);

    /**
     * Inicializar sensores
     */
    void begin();

    /**
     * Ler valor de pH
     * @return Valor de pH (0-14)
     */
    float getPH();

    /**
     * Ler temperatura
     * @return Temperatura em Celsius
     */
    float getTemperature();

    /**
     * Ler nível da câmara A
     * @return Nível (0-1)
     */
    int getLevelA();

    /**
     * Ler nível da câmara B
     * @return Nível (0-1)
     */
    int getLevelB();

    /**
     * Ler nível da câmara C
     * @return Nível (0-1)
     */
    int getLevelC();

    /**
     * Calibrar sensor de pH
     * @param ph_neutral pH em pH 7.0
     * @param ph_acidic pH em pH 4.0
     */
    void calibratePH(float ph_neutral, float ph_acidic);

    /**
     * Obter última leitura de pH
     * @return Último valor de pH
     */
    float getLastPH() const;

    /**
     * Obter última leitura de temperatura
     * @return Última temperatura
     */
    float getLastTemperature() const;

    /**
     * Verificar se sensor de pH está funcionando
     * @return true se sensor está OK
     */
    bool isPHSensorOK();

    /**
     * Verificar se sensor de temperatura está funcionando
     * @return true se sensor está OK
     */
    bool isTemperatureSensorOK();

    void setLevelAEnabled(bool enabled);
    void setLevelBEnabled(bool enabled);
    void setLevelCEnabled(bool enabled);

    bool isLevelAEnabled() const;
    bool isLevelBEnabled() const;
    bool isLevelCEnabled() const;

private:
    // Pinos
    int _ph_pin;
    int _temp_pin;
    

    // Sensores
    OneWire* _oneWire;
    DallasTemperature* _sensors;

    // Calibração de pH
    float _ph_neutral_voltage;
    float _ph_acidic_voltage;

    // Últimas leituras
    float _last_ph;
    float _last_temperature;

    // Configurações
    static constexpr int PH_SAMPLES = 8;
    static constexpr int TEMP_SAMPLES = 5;
    static constexpr float VOLTAGE_REF = 3.3f;
    static constexpr int ADC_RESOLUTION = 4096;  // 12-bit para ESP32

    // Métodos privados
    float readPHRaw();
    float readTemperatureRaw();
    float voltageToPhValue(float voltage);
    float averageAnalogRead(int pin, int samples);

    // sensor PH fake
    bool  _simulatePH = false;
    float _simPHRef   = 8.2f;
    float _simPHSample= 8.0f;

    bool _levelAEnabled = true;
    bool _levelBEnabled = true;
    bool _levelCEnabled = true;

    bool _tempSensorOk = true;

};

#endif // SENSOR_MANAGER_H
