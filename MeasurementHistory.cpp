#include "MeasurementHistory.h"
#include <cmath>

MeasurementHistory::MeasurementHistory()
    : _measurement_interval_minutes(60), _last_measurement_time(0) {
}

void MeasurementHistory::begin() {
    Serial.println("[MeasurementHistory] Inicializando histórico de medições");
    clearHistory();
    _last_measurement_time = millis();
}

void MeasurementHistory::addMeasurement(const Measurement& measurement) {
    if (_measurements.size() >= MAX_MEASUREMENTS) {
        // Remover medição mais antiga
        _measurements.erase(_measurements.begin());
    }

    _measurements.push_back(measurement);
    _last_measurement_time = millis();

    Serial.printf("[MeasurementHistory] Medição adicionada: KH=%.2f dKH (Total: %d)\n",
                  measurement.kh, _measurements.size());
}

MeasurementHistory::Measurement MeasurementHistory::getMeasurement(int index) {
    if (index < 0 || index >= (int)_measurements.size()) {
        return {0, 0, 0, 0, 0, false};
    }

    // Retornar em ordem reversa (0 = mais recente)
    return _measurements[_measurements.size() - 1 - index];
}

int MeasurementHistory::getCount() {
    return _measurements.size();
}

std::vector<MeasurementHistory::Measurement> MeasurementHistory::getFilteredMeasurements(TimeFilter filter) {
    std::vector<Measurement> filtered;

    for (const auto& m : _measurements) {
        if (isWithinTimeFilter(m.timestamp, filter)) {
            filtered.push_back(m);
        }
    }

    return filtered;
}

MeasurementHistory::Measurement MeasurementHistory::getLastMeasurement() {
    if (_measurements.empty()) {
        return {0, 0, 0, 0, 0, false};
    }

    return _measurements.back();
}

void MeasurementHistory::clearHistory() {
    _measurements.clear();
    Serial.println("[MeasurementHistory] Histórico limpo");
}

void MeasurementHistory::setMeasurementInterval(int minutes) {
    minutes = constrain(minutes, 60, 1440);  // 1h a 24h
    _measurement_interval_minutes = minutes;
    Serial.printf("[MeasurementHistory] Intervalo de medição definido: %d minutos\n", minutes);
}

int MeasurementHistory::getMeasurementInterval() {
    return _measurement_interval_minutes;
}

bool MeasurementHistory::shouldMeasure() {
    unsigned long now = millis();
    unsigned long interval_ms = _measurement_interval_minutes * 60UL * 1000UL;

    return (now - _last_measurement_time) >= interval_ms;
}

String MeasurementHistory::exportAsJSON() {
    String json = "{\"measurements\":[";

    for (size_t i = 0; i < _measurements.size(); i++) {
        const auto& m = _measurements[i];
        json += "{\"kh\":" + String(m.kh, 2);
        json += ",\"ph_ref\":" + String(m.ph_ref, 2);
        json += ",\"ph_sample\":" + String(m.ph_sample, 2);
        json += ",\"temperature\":" + String(m.temperature, 1);
        json += ",\"timestamp\":" + String(m.timestamp);
        json += ",\"valid\":" + String(m.is_valid ? "true" : "false") + "}";

        if (i < _measurements.size() - 1) {
            json += ",";
        }
    }

    json += "]}";
    return json;
}

String MeasurementHistory::exportAsCSV() {
    String csv = "Timestamp,KH,pH_Ref,pH_Sample,Temperature,Valid\n";

    for (const auto& m : _measurements) {
        csv += String(m.timestamp) + ",";
        csv += String(m.kh, 2) + ",";
        csv += String(m.ph_ref, 2) + ",";
        csv += String(m.ph_sample, 2) + ",";
        csv += String(m.temperature, 1) + ",";
        csv += String(m.is_valid ? "true" : "false") + "\n";
    }

    return csv;
}

String MeasurementHistory::getStatistics(TimeFilter filter) {
    auto filtered = getFilteredMeasurements(filter);

    if (filtered.empty()) {
        return "Sem dados";
    }

    // Extrair valores de KH
    std::vector<float> kh_values;
    for (const auto& m : filtered) {
        if (m.is_valid) {
            kh_values.push_back(m.kh);
        }
    }

    if (kh_values.empty()) {
        return "Sem dados válidos";
    }

    float mean = calculateMean(filtered);
    float std_dev = calculateStdDev(filtered, mean);
    float min_kh = *std::min_element(kh_values.begin(), kh_values.end());
    float max_kh = *std::max_element(kh_values.begin(), kh_values.end());

    String stats = "Estatísticas:\n";
    stats += "  Média: " + String(mean, 2) + " dKH\n";
    stats += "  Desvio Padrão: " + String(std_dev, 2) + "\n";
    stats += "  Mínimo: " + String(min_kh, 2) + " dKH\n";
    stats += "  Máximo: " + String(max_kh, 2) + " dKH\n";
    stats += "  Medições: " + String(kh_values.size());

    return stats;
}

bool MeasurementHistory::saveToSPIFFS(const char* filename) {
    // Implementação simplificada
    // Em produção, usar SPIFFS.open() e escrever JSON
    Serial.printf("[MeasurementHistory] Salvando em %s\n", filename);
    return true;
}

bool MeasurementHistory::loadFromSPIFFS(const char* filename) {
    // Implementação simplificada
    // Em produção, usar SPIFFS.open() e ler JSON
    Serial.printf("[MeasurementHistory] Carregando de %s\n", filename);
    return true;
}

// ===== Métodos Privados =====

bool MeasurementHistory::isWithinTimeFilter(unsigned long timestamp, TimeFilter filter) {
    unsigned long now = millis();
    unsigned long time_diff = now - timestamp;

    switch (filter) {
        case LAST_HOUR:
            return time_diff < (60UL * 60UL * 1000UL);
        case LAST_24_HOURS:
            return time_diff < (24UL * 60UL * 60UL * 1000UL);
        case LAST_WEEK:
            return time_diff < (7UL * 24UL * 60UL * 60UL * 1000UL);
        case ALL_DATA:
        default:
            return true;
    }
}

float MeasurementHistory::calculateMean(const std::vector<Measurement>& data) {
    if (data.empty()) {
        return 0;
    }

    float sum = 0;
    int count = 0;

    for (const auto& m : data) {
        if (m.is_valid) {
            sum += m.kh;
            count++;
        }
    }

    return count > 0 ? sum / count : 0;
}

float MeasurementHistory::calculateStdDev(const std::vector<Measurement>& data, float mean) {
    if (data.empty()) {
        return 0;
    }

    float variance = 0;
    int count = 0;

    for (const auto& m : data) {
        if (m.is_valid) {
            variance += pow(m.kh - mean, 2);
            count++;
        }
    }

    return count > 0 ? sqrt(variance / count) : 0;
}
