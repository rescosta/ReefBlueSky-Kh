#include "KH_Predictor.h"
#include <Arduino.h>
#include <vector>
#include <numeric>
#include <cstdio>
#include <cmath>
#include <stdint.h>

KHPredictor::KHPredictor() {
    history.reserve(MAX_HISTORY);
}

void KHPredictor::begin() {
    Serial.println("[KH_Predictor] Sistema de predição inicializado");
    clearHistory();
}

void KHPredictor::addMeasurement(float kh, uint64_t timestamp, float temperature) {
    // Validar entrada
    if (!isValidKH(kh)) {
        Serial.println("[KH_Predictor] Valor de KH fora de faixa!");
        return;
    }
    
    if (!isValidTemperature(temperature)) {
        Serial.println("[KH_Predictor] Temperatura inválida!");
        return;
    }
    
    // Aplicar compensação de temperatura
    float compensated_kh = kh + calculateTemperatureCompensation(temperature);
    
    // Adicionar ao histórico
    DataPoint point = {compensated_kh, timestamp, temperature};
    history.push_back(point);
    
    // Manter limite máximo
    if (history.size() > MAX_HISTORY) {
        history.erase(history.begin());
    }
    
    last_temperature = temperature;
    
    Serial.printf("[KH_Predictor] Medição adicionada: KH=%.2f dKH, Temp=%.1f°C\n", 
                  compensated_kh, temperature);
}

KHPredictor::PredictionResult KHPredictor::getPrediction(int hoursAhead) {
    PredictionResult result = {0, 0, 0, "", false};
    
    // Verificar se há dados suficientes
    if (history.size() < 3) {
        result.reason = "Dados insuficientes";
        return result;
    }
    
    // Calcular regressão linear
    float slope, intercept;
    float r_squared = calculateLinearRegression(slope, intercept);
    
    // Predição linear
    float time_diff = hoursAhead * 3600000.0f; // converter horas para ms
    float predicted_kh = intercept + slope * time_diff;
    
    // Adicionar componente de ciclo diário
    float cycle_component = calculateDailyCycleComponent();
    predicted_kh += cycle_component;
    
    // Validar predição
    if (!isValidKH(predicted_kh)) {
        predicted_kh = constrain(predicted_kh, MIN_KH, MAX_KH);
    }
    
    // Calcular confiança
    float confidence = r_squared * 100.0f;
    
    result.predicted_kh = predicted_kh;
    result.confidence = confidence;
    result.is_valid = true;
    
    return result;
}

KHPredictor::PredictionResult KHPredictor::getDosageRecommendation() {
    PredictionResult result = {0, 0, 0, "", false};
    
    if (history.size() < 3) {
        result.reason = "Dados insuficientes";
        return result;
    }
    
    // Obter predição
    PredictionResult pred = getPrediction(4);
    if (!pred.is_valid) {
        result.reason = "Predição inválida";
        return result;
    }
    
    // Calcular taxa de mudança
    float trend_rate = getTrendRate();
    
    // Calcular ajuste de dosagem
    float dosage_adjustment = calculateDosageAdjustment(pred.predicted_kh, trend_rate);
    
    result.predicted_kh = pred.predicted_kh;
    result.confidence = pred.confidence;
    result.dosage_adjustment = dosage_adjustment;
    result.is_valid = true;
    
    // Gerar mensagem de recomendação
    if (fabs(dosage_adjustment) < 5.0f) {
        result.reason = "Sistema estável. Sem ajuste necessário.";
    } else {
        char buffer[128];
        if (dosage_adjustment > 0) {
            snprintf(buffer, sizeof(buffer),
                    "Aumentar dosagem em %.1f%%. KH previsto: %.2f dKH",
                    dosage_adjustment, pred.predicted_kh);
        } else {
            snprintf(buffer, sizeof(buffer),
                    "Reduzir dosagem em %.1f%%. KH previsto: %.2f dKH",
                    fabs(dosage_adjustment), pred.predicted_kh);
        }
        result.reason = String(buffer);
    }
    
    return result;
}

KHPredictor::Statistics KHPredictor::getStatistics() {
    Statistics stats = {0, 0, 0, 0, 0, 0};
    
    if (history.empty()) {
        return stats;
    }
    
    // Extrair valores de KH
    std::vector<float> kh_values;
    for (const auto& point : history) {
        kh_values.push_back(point.kh);
    }
    
    // Calcular média
    stats.mean_kh = std::accumulate(kh_values.begin(), kh_values.end(), 0.0f) / kh_values.size();
    
    // Calcular min/max
    stats.min_kh = *std::min_element(kh_values.begin(), kh_values.end());
    stats.max_kh = *std::max_element(kh_values.begin(), kh_values.end());
    
    // Calcular desvio padrão
    float variance = 0;
    for (float kh : kh_values) {
        variance += pow(kh - stats.mean_kh, 2);
    }
    stats.std_dev = sqrt(variance / kh_values.size());
    
    // Calcular taxa de mudança
    stats.trend_rate = getTrendRate();
    
    stats.data_count = history.size();
    
    return stats;
}

void KHPredictor::clearHistory() {
    history.clear();
    Serial.println("[KH_Predictor] Histórico limpo");
}

int KHPredictor::getDataCount() const {
    return history.size();
}

String KHPredictor::exportAsJSON() {
    String json = "{\"data\":[";
    
    for (size_t i = 0; i < history.size(); i++) {
        json += "{\"kh\":" + String(history[i].kh, 2);
        json += ",\"timestamp\":" + String(history[i].timestamp);
        json += ",\"temperature\":" + String(history[i].temperature, 1) + "}";
        
        if (i < history.size() - 1) {
            json += ",";
        }
    }
    
    json += "]}";
    return json;
}

bool KHPredictor::importFromJSON(const String& json) {
    // Implementação simplificada
    // Em produção, usar ArduinoJson
    clearHistory();
    return true;
}

bool KHPredictor::detectAnomaly() {
    if (history.size() < 5) {
        return false;
    }
    
    // Calcular desvio padrão
    Statistics stats = getStatistics();
    
    // Verificar último ponto
    float last_kh = history.back().kh;
    float z_score = fabs(last_kh - stats.mean_kh) / (stats.std_dev + 0.1f);
    
    // Anomalia se z-score > 3
    return z_score > 3.0f;
}

float KHPredictor::getTrendRate() {
    if (history.size() < 2) {
        return 0;
    }
    
    float slope, intercept;
    calculateLinearRegression(slope, intercept);
    
    // Converter de dKH/ms para dKH/hora
    return slope * 3600000.0f;
}

float KHPredictor::getDailyCycleAmplitude() {
    return calculateDailyCycleComponent() * 2.0f;
}

void KHPredictor::setReferenceKH(float ref_kh) {
    if (isValidKH(ref_kh)) {
        reference_kh = ref_kh;
        Serial.printf("[KH_Predictor] KH de referência definido: %.2f\n", ref_kh);
    }
}

float KHPredictor::getReferenceKH() const {
    return reference_kh;
}

// Métodos privados

float KHPredictor::calculateLinearRegression(float& slope, float& intercept) {
    if (history.size() < 2) {
        slope = 0;
        intercept = 0;
        return 0;
    }

    int n = history.size();
    float sum_x = 0, sum_y = 0, sum_xy = 0, sum_x2 = 0;

    uint64_t first_time = history[0].timestamp;

    for (const auto& point : history) {
        float x = float(point.timestamp - first_time);  // delta em ms
        float y = point.kh;
        sum_x  += x;
        sum_y  += y;
        sum_xy += x * y;
        sum_x2 += x * x;
    }

    float denominator = (n * sum_x2 - sum_x * sum_x);
    if (fabs(denominator) < 0.0001f) {
        slope     = 0;
        intercept = sum_y / n;
        return 0;
    }

    slope     = (n * sum_xy - sum_x * sum_y) / denominator;
    intercept = (sum_y - slope * sum_x) / n;

    float ss_res = 0, ss_tot = 0;
    float mean_y = sum_y / n;

    for (const auto& point : history) {
        float x      = float(point.timestamp - first_time);
        float y_pred = intercept + slope * x;
        ss_res += pow(point.kh - y_pred, 2);
        ss_tot += pow(point.kh - mean_y, 2);
    }

    float r_squared = (ss_tot > 0) ? (1.0f - ss_res / ss_tot) : 0;
    return constrain(r_squared, 0.0f, 1.0f);
}


float KHPredictor::calculateConfidence() {
    if (history.size() < 5) {
        return 50.0f;
    }
    
    float slope, intercept;
    return calculateLinearRegression(slope, intercept) * 100.0f;
}

float KHPredictor::calculateDosageAdjustment(float predicted_kh, float trend_rate) {
    float target_kh = reference_kh;
    float error = target_kh - predicted_kh;
    
    // Ajuste proporcional ao erro
    float adjustment = error * 10.0f;
    
    // Considerar taxa de mudança
    if (trend_rate < -0.1f) {
        adjustment += 20.0f; // Aumentar se KH está caindo rápido
    } else if (trend_rate > 0.1f) {
        adjustment -= 10.0f; // Reduzir se KH está subindo
    }
    
    // Limitar ajuste
    return constrain(adjustment, -50.0f, 50.0f);
}

float KHPredictor::calculateDailyCycleComponent() {
    if (history.size() < 24) {
        return 0;
    }
    
    // Simplificado: retornar 10% da amplitude
    Statistics stats = getStatistics();
    return (stats.max_kh - stats.min_kh) * 0.05f;
}

float KHPredictor::calculateTemperatureCompensation(float temp) {
    // Compensação: α = 0.002 dKH/°C
    // Referência: 25°C
    float alpha = 0.002f;
    return (temp - 25.0f) * alpha;
}

float KHPredictor::calculateDosageEffectiveness() {
    if (history.size() < 10) {
        return 0.5f;
    }
    
    // Calcular variância das últimas medições
    Statistics stats = getStatistics();
    
    // Efetividade inversamente proporcional à variância
    return 1.0f / (1.0f + stats.std_dev);
}

bool KHPredictor::detectPeaksAndValleys() {
    if (history.size() < 3) {
        return false;
    }
    
    int peaks = 0;
    for (size_t i = 1; i < history.size() - 1; i++) {
        if (history[i].kh > history[i-1].kh && history[i].kh > history[i+1].kh) {
            peaks++;
        }
    }
    
    return peaks > 0;
}

float KHPredictor::calculateDominantFrequency() {
    // FFT simplificada: retornar 0 (sem ciclo dominante)
    // Em produção, implementar FFT real
    return 0;
}

bool KHPredictor::isValidKH(float kh) {
    return kh >= MIN_KH && kh <= MAX_KH;
}

bool KHPredictor::isValidTemperature(float temp) {
    return temp >= 15.0f && temp <= 35.0f;
}
