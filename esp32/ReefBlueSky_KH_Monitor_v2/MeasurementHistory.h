#ifndef MEASUREMENT_HISTORY_H
#define MEASUREMENT_HISTORY_H

#include <Arduino.h>
#include <vector>
#include <SPIFFS.h>

/**
 * @class MeasurementHistory
 * @brief Gerenciador de histórico de medições com persistência em SPIFFS
 * 
 * MELHORIAS IMPLEMENTADAS:
 * - [PERSISTÊNCIA] Salva automaticamente cada medição em SPIFFS
 * - [BOOT] Carrega histórico ao iniciar o sistema
 * - [RESET] Função para limpar histórico completo
 * - [SEGURANÇA] Validação de dados antes de salvar
 */
class MeasurementHistory {
public:
    // Estrutura para uma medição
    struct Measurement {
        float kh;
        float ph_ref;
        float ph_sample;
        float temperature;
        unsigned long timestamp;
        bool is_valid;
    };

    // Filtros de tempo
    enum TimeFilter {
        LAST_HOUR,
        LAST_24_HOURS,
        LAST_WEEK,
        ALL_DATA
    };

    /**
     * Construtor
     */
    MeasurementHistory();

    /**
     * Inicializar histórico
     * [BOOT] Carrega automaticamente histórico salvo do SPIFFS
     */
    void begin();

    /**
     * Adicionar medição ao histórico
     * [PERSISTÊNCIA] Salva automaticamente em SPIFFS após adicionar
     * @param measurement Estrutura com dados da medição
     */
    void addMeasurement(const Measurement& measurement);

    /**
     * Obter medição por índice
     * @param index Índice (0 = mais recente)
     * @return Medição
     */
    Measurement getMeasurement(int index);

    /**
     * Obter número de medições
     * @return Quantidade de medições armazenadas
     */
    int getCount();

    /**
     * Obter medições filtradas por tempo
     * @param filter Filtro de tempo
     * @return Vector com medições filtradas
     */
    std::vector<Measurement> getFilteredMeasurements(TimeFilter filter);

    /**
     * Obter última medição
     * @return Última medição
     */
    Measurement getLastMeasurement();

    /**
     * Limpar histórico
     * [RESET] Remove todos os dados do histórico e SPIFFS
     */
    void clearHistory();

    /**
     * Definir intervalo de medição
     * @param minutes Intervalo em minutos (60-1440)
     */
    void setMeasurementInterval(int minutes);

    /**
     * Obter intervalo de medição
     * @return Intervalo em minutos
     */
    int getMeasurementInterval();

    /**
     * Verificar se é hora de fazer nova medição
     * @return true se deve fazer medição
     */
    bool shouldMeasure();

    /**
     * Exportar histórico como JSON
     * @return String com dados em formato JSON
     */
    String exportAsJSON();

    /**
     * Exportar histórico como CSV
     * @return String com dados em formato CSV
     */
    String exportAsCSV();

    /**
     * Obter estatísticas
     * @param filter Filtro de tempo
     * @return String com estatísticas
     */
    String getStatistics(TimeFilter filter = ALL_DATA);

    /**
     * Salvar histórico em SPIFFS
     * [PERSISTÊNCIA] Salva todas as medições em arquivo JSON
     * @param filename Nome do arquivo (padrão: /history.json)
     * @return true se salvo com sucesso
     */
    bool saveToSPIFFS(const char* filename = "/history.json");

    /**
     * Carregar histórico de SPIFFS
     * [BOOT] Carrega medições salvas previamente
     * @param filename Nome do arquivo (padrão: /history.json)
     * @return true se carregado com sucesso
     */
    bool loadFromSPIFFS(const char* filename = "/history.json");

    /**
     * Verificar se histórico existe
     * [BOOT] Usado para detectar se é primeira inicialização
     * @return true se histórico existe em SPIFFS
     */
    bool historyExists();

    /**
     * Obter tamanho do arquivo de histórico
     * @return Tamanho em bytes
     */
    size_t getHistoryFileSize();


/**
     * Normalizar timestamps antigos em segundos para milissegundos
     * [MIGRAÇÃO] Usa heurística simples (timestamp pequeno => segundos)
     */
    void normalizeTimestampsIfNeeded();

private:
    // Histórico
    std::vector<Measurement> _measurements;

    // Configurações
    int _measurement_interval_minutes;
    unsigned long _last_measurement_time;

    // Constantes
    static constexpr int MAX_MEASUREMENTS = 1000;
    static constexpr const char* HISTORY_FILE = "/history.json";

    // Métodos privados
    bool isWithinTimeFilter(unsigned long timestamp, TimeFilter filter);
    float calculateMean(const std::vector<Measurement>& data);
    float calculateStdDev(const std::vector<Measurement>& data, float mean);
    
    // [PERSISTÊNCIA] Métodos de serialização
    String measurementToJSON(const Measurement& m);
    Measurement jsonToMeasurement(const String& json);
};

#endif // MEASUREMENT_HISTORY_H
