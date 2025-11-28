#ifndef KH_PREDICTOR_H
#define KH_PREDICTOR_H

#include <Arduino.h>
#include <vector>
#include <numeric>
#include <cstdio>
#include <cmath>

/**
 * @class KHPredictor
 * @brief Sistema de IA para predição de KH e recomendação automática de dosagem
 * 
 * Implementa algoritmos de:
 * - Regressão linear adaptativa
 * - Detecção de ciclo diário
 * - Predição 4 horas
 * - Recomendação automática de dosagem
 * - Detecção de anomalias
 */
class KHPredictor {
public:
    // Estrutura para armazenar ponto de dados
    struct DataPoint {
        float kh;
        unsigned long timestamp;
        float temperature;
    };

    // Estrutura para resultado de predição
    struct PredictionResult {
        float predicted_kh;
        float confidence;        // 0-100%
        float dosage_adjustment; // -50% a +50%
        String reason;           // Motivo da recomendação
        bool is_valid;
    };

    // Estrutura para estatísticas
    struct Statistics {
        float mean_kh;
        float min_kh;
        float max_kh;
        float std_dev;
        float trend_rate;        // dKH/hora
        int data_count;
    };

    /**
     * Construtor
     */
    KHPredictor();

    /**
     * Inicializar o sistema
     */
    void begin();

    /**
     * Adicionar uma medição ao histórico
     * @param kh Valor de KH (dKH)
     * @param timestamp Timestamp em milissegundos
     * @param temperature Temperatura em Celsius
     */
    void addMeasurement(float kh, unsigned long timestamp, float temperature);

    /**
     * Obter predição de KH para N horas no futuro
     * @param hoursAhead Horas no futuro (padrão: 4)
     * @return PredictionResult com predição e confiança
     */
    PredictionResult getPrediction(int hoursAhead = 4);

    /**
     * Obter recomendação de dosagem
     * @return PredictionResult com recomendação
     */
    PredictionResult getDosageRecommendation();

    /**
     * Obter estatísticas do histórico
     * @return Statistics com média, min, max, etc
     */
    Statistics getStatistics();

    /**
     * Limpar histórico de medições
     */
    void clearHistory();

    /**
     * Obter número de medições armazenadas
     * @return Número de pontos de dados
     */
    int getDataCount() const;

    /**
     * Exportar histórico como JSON
     * @return String com dados em formato JSON
     */
    String exportAsJSON();

    /**
     * Importar histórico de JSON
     * @param json String com dados em formato JSON
     * @return true se importação bem-sucedida
     */
    bool importFromJSON(const String& json);

    /**
     * Detectar anomalias nos dados
     * @return true se anomalia detectada
     */
    bool detectAnomaly();

    /**
     * Obter taxa de mudança atual (dKH/hora)
     * @return Taxa de mudança
     */
    float getTrendRate();

    /**
     * Obter amplitude do ciclo diário
     * @return Amplitude em dKH
     */
    float getDailyCycleAmplitude();

    /**
     * Configurar KH de referência (calibração)
     * @param reference_kh Valor de KH conhecido
     */
    void setReferenceKH(float reference_kh);

    /**
     * Obter KH de referência
     * @return Valor de KH de referência
     */
    float getReferenceKH() const;

private:
    // Histórico de medições
    std::vector<DataPoint> history;
    
    // Configurações
    static constexpr int MAX_HISTORY = 100;
    static constexpr float MIN_KH = 1.0f;
    static constexpr float MAX_KH = 20.0f;
    
    // Valores de referência
    float reference_kh = 8.0;
    float last_temperature = 25.0;
    
    // Métodos privados
    float calculateLinearRegression(float& slope, float& intercept);
    float calculateConfidence();
    float calculateDosageAdjustment(float predicted_kh, float trend_rate);
    float calculateDailyCycleComponent();
    float calculateTemperatureCompensation(float temp);
    float calculateDosageEffectiveness();
    
    // Detecção de padrões
    bool detectPeaksAndValleys();
    float calculateDominantFrequency();
    
    // Validação
    bool isValidKH(float kh);
    bool isValidTemperature(float temp);
};

#endif // KH_PREDICTOR_H
