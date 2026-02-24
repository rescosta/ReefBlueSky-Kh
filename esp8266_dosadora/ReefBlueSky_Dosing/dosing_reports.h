#ifndef DOSING_REPORTS_H
#define DOSING_REPORTS_H

#include <Arduino.h>
#ifdef ESP8266
  #include <LittleFS.h>
  #define SPIFFS LittleFS
#else
  #include <SPIFFS.h>
#endif
#include <ArduinoJson.h>

// Arquivo de armazenamento de histórico
#define DOSING_HISTORY_FILE "/dosing_history.json"

// Limites de armazenamento
#define MAX_HISTORY_DAYS 90          // Manter histórico de 90 dias
#define MAX_DAILY_RECORDS 100        // Máximo de doses por dia para armazenar

// Estrutura de uma dose executada
struct DoseRecord {
    unsigned long timestamp;         // Timestamp Unix
    int pumpIndex;                   // Índice da bomba (0-3)
    String pumpName;                 // Nome da bomba (ex: "KH", "Ca", "Mg")
    float volumeML;                  // Volume dosado em ml
    unsigned long durationMS;        // Duração real da dosagem em ms
    unsigned long expectedDurationMS;// Duração esperada em ms
    bool success;                    // Se a dose foi bem sucedida
    String errorMsg;                 // Mensagem de erro (se houver)
};

// Estatísticas diárias de uma bomba
struct DailyPumpStats {
    String pumpName;
    float totalVolume;               // Volume total dosado no dia (ml)
    int doseCount;                   // Número de doses no dia
    int successCount;                // Doses bem sucedidas
    int failCount;                   // Doses com falha
    float avgDeviation;              // Desvio médio de duração (%)
};

// Estatísticas mensais de uma bomba
struct MonthlyPumpStats {
    String pumpName;
    float totalVolume;               // Volume total dosado no mês (ml)
    int doseCount;                   // Número de doses no mês
    float avgDailyVolume;            // Média diária
    float costPerLiter;              // Custo por litro (configurável)
    float totalCost;                 // Custo total no mês
    int daysUntilEmpty;              // Dias até acabar reagente (baseado em consumo)
    float containerCapacityL;        // Capacidade do recipiente (L)
    float remainingL;                // Volume restante estimado (L)
};

class DosingReports {
private:
    // Array circular para armazenar doses recentes (RAM)
    static const int RAM_BUFFER_SIZE = 50;
    DoseRecord ramBuffer[RAM_BUFFER_SIZE];
    int ramBufferIndex;
    int ramBufferCount;

    // Configurações de custo por bomba (armazenado em SPIFFS)
    float costPerLiter[4];           // Custo por litro de cada reagente
    float containerCapacity[4];      // Capacidade do recipiente em litros
    float containerRemaining[4];     // Volume restante estimado em litros
    String pumpNames[4];             // Nomes das bombas

    // Funções privadas
    void saveToSPIFFS();
    void loadFromSPIFFS();
    void pruneOldRecords();          // Remove registros muito antigos
    String getDateString(unsigned long timestamp);
    int getDayOfYear(unsigned long timestamp);

public:
    DosingReports();

    // Inicialização
    void begin();

    // Configuração de bombas
    void setPumpName(int pumpIndex, String name);
    void setCostPerLiter(int pumpIndex, float cost);
    void setContainerCapacity(int pumpIndex, float liters);
    void setContainerRemaining(int pumpIndex, float liters);

    // Registrar dose
    void addDoseRecord(int pumpIndex, float volumeML, unsigned long durationMS,
                      unsigned long expectedDurationMS, bool success, String errorMsg = "");

    // Estatísticas
    DailyPumpStats getDailyStats(int pumpIndex, int daysAgo = 0);
    MonthlyPumpStats getMonthlyStats(int pumpIndex);
    float getTotalVolumeToday(int pumpIndex);
    float getTotalVolumePeriod(int pumpIndex, int days);

    // Previsões
    int getDaysUntilEmpty(int pumpIndex);
    float getEstimatedDailyConsumption(int pumpIndex, int periodDays = 7);

    // Alertas
    bool isContainerLow(int pumpIndex, float thresholdPercent = 20.0);
    bool isDailyLimitReached(int pumpIndex, float maxDailyML);

    // Histórico
    int getRecordCount();
    DoseRecord getRecord(int index);
    void clearHistory();

    // Export
    String getDailyReportJSON(int daysAgo = 0);
    String getMonthlyReportJSON();
    String getAllPumpsStatusJSON();
    String getHistoryCSV(int days = 30);

    // Manutenção
    void compactHistory();           // Compactar histórico (remover duplicatas, etc)
    void resetPumpStats(int pumpIndex);
};

#endif
