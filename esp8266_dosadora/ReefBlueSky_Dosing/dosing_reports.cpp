#include "dosing_reports.h"
#include <time.h>

DosingReports::DosingReports() {
    ramBufferIndex = 0;
    ramBufferCount = 0;

    // Inicializar arrays
    for (int i = 0; i < 4; i++) {
        costPerLiter[i] = 0;
        containerCapacity[i] = 1.0;  // 1L padrão
        containerRemaining[i] = 1.0;
        pumpNames[i] = "Bomba " + String(i + 1);
    }
}

void DosingReports::begin() {
    // Inicializar SPIFFS se ainda não foi
    if (!SPIFFS.begin()) {
        Serial.println("[Reports] Erro ao montar SPIFFS");
        return;
    }

    loadFromSPIFFS();
    Serial.println("[Reports] Sistema de relatórios inicializado");
}

void DosingReports::setPumpName(int pumpIndex, String name) {
    if (pumpIndex >= 0 && pumpIndex < 4) {
        pumpNames[pumpIndex] = name;
        saveToSPIFFS();
    }
}

void DosingReports::setCostPerLiter(int pumpIndex, float cost) {
    if (pumpIndex >= 0 && pumpIndex < 4) {
        costPerLiter[pumpIndex] = cost;
        saveToSPIFFS();
    }
}

void DosingReports::setContainerCapacity(int pumpIndex, float liters) {
    if (pumpIndex >= 0 && pumpIndex < 4) {
        containerCapacity[pumpIndex] = liters;
        saveToSPIFFS();
    }
}

void DosingReports::setContainerRemaining(int pumpIndex, float liters) {
    if (pumpIndex >= 0 && pumpIndex < 4) {
        containerRemaining[pumpIndex] = liters;
        saveToSPIFFS();
    }
}

void DosingReports::addDoseRecord(int pumpIndex, float volumeML, unsigned long durationMS,
                                  unsigned long expectedDurationMS, bool success, String errorMsg) {
    if (pumpIndex < 0 || pumpIndex >= 4) {
        return;
    }

    // Adicionar ao buffer RAM
    ramBuffer[ramBufferIndex].timestamp = millis() / 1000;  // Converter para segundos
    ramBuffer[ramBufferIndex].pumpIndex = pumpIndex;
    ramBuffer[ramBufferIndex].pumpName = pumpNames[pumpIndex];
    ramBuffer[ramBufferIndex].volumeML = volumeML;
    ramBuffer[ramBufferIndex].durationMS = durationMS;
    ramBuffer[ramBufferIndex].expectedDurationMS = expectedDurationMS;
    ramBuffer[ramBufferIndex].success = success;
    ramBuffer[ramBufferIndex].errorMsg = errorMsg;

    ramBufferIndex = (ramBufferIndex + 1) % RAM_BUFFER_SIZE;
    if (ramBufferCount < RAM_BUFFER_SIZE) {
        ramBufferCount++;
    }

    // Atualizar volume restante
    if (success) {
        containerRemaining[pumpIndex] -= (volumeML / 1000.0);  // Converter ml para litros
        if (containerRemaining[pumpIndex] < 0) {
            containerRemaining[pumpIndex] = 0;
        }
    }

    // Salvar periodicamente (a cada 10 doses ou quando buffer encher)
    if (ramBufferCount % 10 == 0 || ramBufferCount == RAM_BUFFER_SIZE) {
        saveToSPIFFS();
    }

    Serial.println("[Reports] Dose registrada - Bomba: " + pumpNames[pumpIndex] +
                   " Volume: " + String(volumeML, 2) + "ml" +
                   " Status: " + (success ? "OK" : "FALHA"));
}

DailyPumpStats DosingReports::getDailyStats(int pumpIndex, int daysAgo) {
    DailyPumpStats stats;
    stats.pumpName = pumpNames[pumpIndex];
    stats.totalVolume = 0;
    stats.doseCount = 0;
    stats.successCount = 0;
    stats.failCount = 0;
    stats.avgDeviation = 0;

    unsigned long now = millis() / 1000;
    unsigned long targetDay = now - (daysAgo * 86400);  // 86400 = segundos em um dia
    unsigned long dayStart = targetDay - (targetDay % 86400);
    unsigned long dayEnd = dayStart + 86400;

    float totalDeviation = 0;

    // Percorrer buffer RAM
    for (int i = 0; i < ramBufferCount; i++) {
        DoseRecord& rec = ramBuffer[i];

        if (rec.pumpIndex == pumpIndex &&
            rec.timestamp >= dayStart &&
            rec.timestamp < dayEnd) {

            stats.totalVolume += rec.volumeML;
            stats.doseCount++;

            if (rec.success) {
                stats.successCount++;
            } else {
                stats.failCount++;
            }

            // Calcular desvio de duração
            if (rec.expectedDurationMS > 0) {
                float deviation = ((float)rec.durationMS / rec.expectedDurationMS - 1.0) * 100.0;
                totalDeviation += abs(deviation);
            }
        }
    }

    if (stats.doseCount > 0) {
        stats.avgDeviation = totalDeviation / stats.doseCount;
    }

    return stats;
}

MonthlyPumpStats DosingReports::getMonthlyStats(int pumpIndex) {
    MonthlyPumpStats stats;
    stats.pumpName = pumpNames[pumpIndex];
    stats.totalVolume = 0;
    stats.doseCount = 0;
    stats.costPerLiter = costPerLiter[pumpIndex];
    stats.containerCapacityL = containerCapacity[pumpIndex];
    stats.remainingL = containerRemaining[pumpIndex];

    // Calcular últimos 30 dias
    stats.totalVolume = getTotalVolumePeriod(pumpIndex, 30);

    // Contar doses
    unsigned long now = millis() / 1000;
    unsigned long monthAgo = now - (30 * 86400);

    for (int i = 0; i < ramBufferCount; i++) {
        if (ramBuffer[i].pumpIndex == pumpIndex && ramBuffer[i].timestamp >= monthAgo) {
            stats.doseCount++;
        }
    }

    // Calcular médias e previsões
    stats.avgDailyVolume = stats.totalVolume / 30.0;
    stats.totalCost = (stats.totalVolume / 1000.0) * stats.costPerLiter;

    // Dias até acabar
    if (stats.avgDailyVolume > 0) {
        float remainingML = stats.remainingL * 1000.0;
        stats.daysUntilEmpty = (int)(remainingML / stats.avgDailyVolume);
    } else {
        stats.daysUntilEmpty = -1;  // Indeterminado
    }

    return stats;
}

float DosingReports::getTotalVolumeToday(int pumpIndex) {
    return getDailyStats(pumpIndex, 0).totalVolume;
}

float DosingReports::getTotalVolumePeriod(int pumpIndex, int days) {
    float total = 0;
    unsigned long now = millis() / 1000;
    unsigned long periodStart = now - (days * 86400);

    for (int i = 0; i < ramBufferCount; i++) {
        if (ramBuffer[i].pumpIndex == pumpIndex &&
            ramBuffer[i].timestamp >= periodStart &&
            ramBuffer[i].success) {
            total += ramBuffer[i].volumeML;
        }
    }

    return total;
}

int DosingReports::getDaysUntilEmpty(int pumpIndex) {
    return getMonthlyStats(pumpIndex).daysUntilEmpty;
}

float DosingReports::getEstimatedDailyConsumption(int pumpIndex, int periodDays) {
    float total = getTotalVolumePeriod(pumpIndex, periodDays);
    return total / periodDays;
}

bool DosingReports::isContainerLow(int pumpIndex, float thresholdPercent) {
    if (pumpIndex < 0 || pumpIndex >= 4) return false;

    float percentRemaining = (containerRemaining[pumpIndex] / containerCapacity[pumpIndex]) * 100.0;
    return percentRemaining <= thresholdPercent;
}

bool DosingReports::isDailyLimitReached(int pumpIndex, float maxDailyML) {
    float todayVolume = getTotalVolumeToday(pumpIndex);
    return todayVolume >= maxDailyML;
}

int DosingReports::getRecordCount() {
    return ramBufferCount;
}

DoseRecord DosingReports::getRecord(int index) {
    if (index < 0 || index >= ramBufferCount) {
        return DoseRecord{0, -1, "", 0, 0, 0, false, "Invalid index"};
    }

    int realIndex = (ramBufferIndex - ramBufferCount + index + RAM_BUFFER_SIZE) % RAM_BUFFER_SIZE;
    return ramBuffer[realIndex];
}

void DosingReports::clearHistory() {
    ramBufferCount = 0;
    ramBufferIndex = 0;

    // Limpar arquivo SPIFFS
    if (SPIFFS.exists(DOSING_HISTORY_FILE)) {
        SPIFFS.remove(DOSING_HISTORY_FILE);
    }

    Serial.println("[Reports] Histórico limpo");
}

String DosingReports::getDailyReportJSON(int daysAgo) {
    StaticJsonDocument<2048> doc;

    doc["days_ago"] = daysAgo;
    doc["date"] = getDateString(millis() / 1000 - (daysAgo * 86400));

    JsonArray pumps = doc.createNestedArray("pumps");

    for (int i = 0; i < 4; i++) {
        DailyPumpStats stats = getDailyStats(i, daysAgo);

        if (stats.doseCount > 0) {
            JsonObject pump = pumps.createNestedObject();
            pump["index"] = i;
            pump["name"] = stats.pumpName;
            pump["total_volume_ml"] = stats.totalVolume;
            pump["dose_count"] = stats.doseCount;
            pump["success_count"] = stats.successCount;
            pump["fail_count"] = stats.failCount;
            pump["avg_deviation"] = stats.avgDeviation;
            pump["success_rate"] = (stats.doseCount > 0) ?
                                    (stats.successCount * 100.0 / stats.doseCount) : 0;
        }
    }

    String output;
    serializeJson(doc, output);
    return output;
}

String DosingReports::getMonthlyReportJSON() {
    StaticJsonDocument<2048> doc;

    doc["period_days"] = 30;
    doc["timestamp"] = millis() / 1000;

    JsonArray pumps = doc.createNestedArray("pumps");

    for (int i = 0; i < 4; i++) {
        MonthlyPumpStats stats = getMonthlyStats(i);

        JsonObject pump = pumps.createNestedObject();
        pump["index"] = i;
        pump["name"] = stats.pumpName;
        pump["total_volume_ml"] = stats.totalVolume;
        pump["dose_count"] = stats.doseCount;
        pump["avg_daily_ml"] = stats.avgDailyVolume;
        pump["cost_per_liter"] = stats.costPerLiter;
        pump["total_cost"] = stats.totalCost;
        pump["container_capacity_l"] = stats.containerCapacityL;
        pump["remaining_l"] = stats.remainingL;
        pump["remaining_percent"] = (stats.containerCapacityL > 0) ?
                                     (stats.remainingL / stats.containerCapacityL * 100.0) : 0;
        pump["days_until_empty"] = stats.daysUntilEmpty;
        pump["is_low"] = isContainerLow(i, 20.0);
    }

    String output;
    serializeJson(doc, output);
    return output;
}

String DosingReports::getAllPumpsStatusJSON() {
    StaticJsonDocument<1024> doc;

    doc["timestamp"] = millis() / 1000;

    JsonArray pumps = doc.createNestedArray("pumps");

    for (int i = 0; i < 4; i++) {
        JsonObject pump = pumps.createNestedObject();
        pump["index"] = i;
        pump["name"] = pumpNames[i];
        pump["today_ml"] = getTotalVolumeToday(i);
        pump["remaining_l"] = containerRemaining[i];
        pump["remaining_percent"] = (containerCapacity[i] > 0) ?
                                     (containerRemaining[i] / containerCapacity[i] * 100.0) : 0;
        pump["days_until_empty"] = getDaysUntilEmpty(i);
        pump["is_low"] = isContainerLow(i, 20.0);
        pump["is_critical"] = isContainerLow(i, 10.0);
    }

    String output;
    serializeJson(doc, output);
    return output;
}

String DosingReports::getHistoryCSV(int days) {
    String csv = "Timestamp,Date,Pump,Volume_ML,Duration_MS,Expected_MS,Deviation_%,Success,Error\n";

    unsigned long now = millis() / 1000;
    unsigned long periodStart = now - (days * 86400);

    for (int i = 0; i < ramBufferCount; i++) {
        DoseRecord& rec = ramBuffer[i];

        if (rec.timestamp >= periodStart) {
            float deviation = 0;
            if (rec.expectedDurationMS > 0) {
                deviation = ((float)rec.durationMS / rec.expectedDurationMS - 1.0) * 100.0;
            }

            csv += String(rec.timestamp) + ",";
            csv += getDateString(rec.timestamp) + ",";
            csv += rec.pumpName + ",";
            csv += String(rec.volumeML, 2) + ",";
            csv += String(rec.durationMS) + ",";
            csv += String(rec.expectedDurationMS) + ",";
            csv += String(deviation, 1) + ",";
            csv += String(rec.success ? "true" : "false") + ",";
            csv += rec.errorMsg + "\n";
        }
    }

    return csv;
}

void DosingReports::compactHistory() {
    // TODO: Implementar compactação
    // - Agrupar doses antigas por dia (manter apenas totais)
    // - Remover registros muito antigos
    // - Reescrever arquivo SPIFFS
    Serial.println("[Reports] Compactação de histórico não implementada ainda");
}

void DosingReports::resetPumpStats(int pumpIndex) {
    if (pumpIndex < 0 || pumpIndex >= 4) return;

    containerRemaining[pumpIndex] = containerCapacity[pumpIndex];
    saveToSPIFFS();

    Serial.println("[Reports] Estatísticas resetadas - Bomba: " + pumpNames[pumpIndex]);
}

void DosingReports::saveToSPIFFS() {
    StaticJsonDocument<2048> doc;

    // Salvar configurações
    JsonArray pumps = doc.createNestedArray("pumps");
    for (int i = 0; i < 4; i++) {
        JsonObject pump = pumps.createNestedObject();
        pump["name"] = pumpNames[i];
        pump["cost_per_liter"] = costPerLiter[i];
        pump["capacity"] = containerCapacity[i];
        pump["remaining"] = containerRemaining[i];
    }

    // Salvar registros recentes (últimos 20)
    JsonArray records = doc.createNestedArray("recent_records");
    int count = min(20, ramBufferCount);
    for (int i = ramBufferCount - count; i < ramBufferCount; i++) {
        DoseRecord rec = getRecord(i);
        JsonObject r = records.createNestedObject();
        r["ts"] = rec.timestamp;
        r["p"] = rec.pumpIndex;
        r["v"] = rec.volumeML;
        r["d"] = rec.durationMS;
        r["e"] = rec.expectedDurationMS;
        r["s"] = rec.success;
    }

    File file = SPIFFS.open(DOSING_HISTORY_FILE, "w");
    if (file) {
        serializeJson(doc, file);
        file.close();
    }
}

void DosingReports::loadFromSPIFFS() {
    if (!SPIFFS.exists(DOSING_HISTORY_FILE)) {
        Serial.println("[Reports] Nenhum histórico encontrado");
        return;
    }

    File file = SPIFFS.open(DOSING_HISTORY_FILE, "r");
    if (!file) {
        Serial.println("[Reports] Erro ao abrir arquivo de histórico");
        return;
    }

    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.println("[Reports] Erro ao parsear JSON: " + String(error.c_str()));
        return;
    }

    // Carregar configurações
    JsonArray pumps = doc["pumps"];
    int idx = 0;
    for (JsonObject pump : pumps) {
        if (idx < 4) {
            pumpNames[idx] = pump["name"].as<String>();
            costPerLiter[idx] = pump["cost_per_liter"];
            containerCapacity[idx] = pump["capacity"];
            containerRemaining[idx] = pump["remaining"];
            idx++;
        }
    }

    // Carregar registros recentes
    JsonArray records = doc["recent_records"];
    for (JsonObject r : records) {
        if (ramBufferCount < RAM_BUFFER_SIZE) {
            ramBuffer[ramBufferCount].timestamp = r["ts"];
            ramBuffer[ramBufferCount].pumpIndex = r["p"];
            ramBuffer[ramBufferCount].pumpName = pumpNames[r["p"].as<int>()];
            ramBuffer[ramBufferCount].volumeML = r["v"];
            ramBuffer[ramBufferCount].durationMS = r["d"];
            ramBuffer[ramBufferCount].expectedDurationMS = r["e"];
            ramBuffer[ramBufferCount].success = r["s"];
            ramBuffer[ramBufferCount].errorMsg = "";
            ramBufferCount++;
        }
    }

    Serial.println("[Reports] Histórico carregado - " + String(ramBufferCount) + " registros");
}

void DosingReports::pruneOldRecords() {
    // Remover registros com mais de MAX_HISTORY_DAYS
    unsigned long now = millis() / 1000;
    unsigned long cutoff = now - (MAX_HISTORY_DAYS * 86400);

    int newCount = 0;
    for (int i = 0; i < ramBufferCount; i++) {
        if (ramBuffer[i].timestamp >= cutoff) {
            if (i != newCount) {
                ramBuffer[newCount] = ramBuffer[i];
            }
            newCount++;
        }
    }

    if (newCount < ramBufferCount) {
        Serial.println("[Reports] Removidos " + String(ramBufferCount - newCount) + " registros antigos");
        ramBufferCount = newCount;
        ramBufferIndex = newCount % RAM_BUFFER_SIZE;
    }
}

String DosingReports::getDateString(unsigned long timestamp) {
    time_t rawtime = timestamp;
    struct tm* timeinfo = localtime(&rawtime);

    char buffer[20];
    strftime(buffer, 20, "%Y-%m-%d %H:%M:%S", timeinfo);
    return String(buffer);
}

int DosingReports::getDayOfYear(unsigned long timestamp) {
    time_t rawtime = timestamp;
    struct tm* timeinfo = localtime(&rawtime);
    return timeinfo->tm_yday;
}
