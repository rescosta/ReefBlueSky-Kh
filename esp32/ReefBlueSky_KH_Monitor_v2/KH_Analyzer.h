#ifndef KH_ANALYZER_H
#define KH_ANALYZER_H


#include <Arduino.h>
#include "PumpControl.h"
#include "SensorManager.h"
#include "KH_Predictor.h"
#include <SPIFFS.h>
#include "TimeProvider.h"


/**
 * @class KH_Analyzer
 * @brief Analisador de KH com ciclo de medição em 5 fases
 * 
 * MELHORIAS IMPLEMENTADAS:
 * - [PERSISTÊNCIA] KH referência salvo em SPIFFS
 * - [BOOT] Restaura KH referência ao iniciar
 * - [RESET] Função para resetar apenas KH referência
 * 
 * Fases:
 * 1. Descarte - Limpar câmaras
 * 2. Calibração - Medir referência (água de KH conhecido)
 * 3. Coleta - Coletar amostra do aquário
 * 4. Medição - Saturar com CO2 e medir pH
 * 5. Manutenção - Limpeza final
 */
class KH_Analyzer {
public:
    // Estados do ciclo
    enum MeasurementState {
        IDLE,
        PHASE1_DISCARD,
        PHASE2_CALIBRATE,
        PHASE3_COLLECT,
        PHASE4_MEASURE,
        PHASE5_MAINTENANCE,
        COMPLETE,
        ERROR_STATE
    };

    // Resultado da medição
    struct MeasurementResult {
        float kh_value;
        float ph_reference;
        float ph_sample;
        float temperature;
        float confidence;
        bool is_valid;
        String error_message;
    };

    /**
     * Construtor
     * @param pc Ponteiro para PumpControl
     * @param sm Ponteiro para SensorManager
     */
    KH_Analyzer(PumpControl* pc, SensorManager* sm);

    /**
     * Inicializar analisador
     * [BOOT] Carrega KH referência salvo do SPIFFS
     */
    void begin();

    /**
     * Iniciar ciclo de medição
     * @return true se ciclo iniciado com sucesso
     */
    bool startMeasurementCycle();

    /**
     * Processar próxima fase do ciclo
     * @return true se há próxima fase
     */
    bool processNextPhase();

    /**
     * Obter resultado da medição
     * @return MeasurementResult com dados da medição
     */
    MeasurementResult getMeasurementResult();

    /**
     * Obter estado atual do ciclo
     * @return Estado atual (MeasurementState)
     */
    MeasurementState getCurrentState();

    /**
     * Calibrar com água de KH conhecido
     * [PERSISTÊNCIA] Salva automaticamente em SPIFFS
     * @param reference_kh Valor de KH da água de referência
     */
    void setReferenceKH(float reference_kh);

    /**
     * Obter KH de referência salvo
     * [BOOT] Restaura automaticamente ao iniciar
     * @return Valor de KH de referência
     */
    float getReferenceKH();

    /**
     * Verificar se KH de referência foi configurado
     * [BOOT] Detecta se é primeira inicialização
     * @return true se KH de referência foi configurado
     */
    bool isReferenceKHConfigured();

    /**
     * Salvar KH de referência em SPIFFS
     * [PERSISTÊNCIA] Chamado automaticamente por setReferenceKH
     * @return true se salvo com sucesso
     */
    bool saveReferenceKHToSPIFFS();

    /**
     * Carregar KH de referência de SPIFFS
     * [BOOT] Chamado automaticamente em begin()
     * @return true se carregado com sucesso
     */
    bool loadReferenceKHFromSPIFFS();

    /**
     * Parar ciclo de medição
     */
    void stopMeasurement();

    /**
     * Verificar se há erro
     * @return true se há erro
     */
    bool hasError();

    /**
     * Obter mensagem de erro
     * @return String com mensagem de erro
     */
    String getErrorMessage();

    /**
     * Resetar estado
     */
    void reset();

    /**
     * Resetar apenas KH de referência
     * [RESET] Remove valor salvo, mantém histórico
     * @return true se reset bem-sucedido
     */
    bool resetReferenceKHOnly();

        /**
     * Obter ponteiro para o preditor de KH
     * Usado para adicionar medições ao histórico preditivo
     * @return Ponteiro para KHPredictor
     */
    KHPredictor* getPredictor() {
        return _predictor;
    }


private:
    // Ponteiros para componentes
    PumpControl* _pc;
    SensorManager* _sm;
    KHPredictor* _predictor;

    // Estado do ciclo
    MeasurementState _current_state;
    MeasurementResult _result;
    String _error_message;

    // Dados da medição
    float _ph_ref;
    float _ph_sample;
    float _temperature;
    float _reference_kh;  // [PERSISTÊNCIA] Salvo em SPIFFS
    bool _reference_kh_configured;  // [BOOT] Indica se foi configurado

    // Configurações de tempo (em milissegundos)
    static constexpr unsigned long FILL_TIME = 5000;      // 5 segundos
    static constexpr unsigned long DISCHARGE_TIME = 3000; // 3 segundos
    static constexpr unsigned long SATURATION_TIME = 10000; // 10 segundos
    static constexpr unsigned long STABILIZE_TIME = 2000;  // 2 segundos
    
    // [PERSISTÊNCIA] Arquivo de configuração
    static constexpr const char* CONFIG_FILE = "/kh_config.json";
    static constexpr float DEFAULT_REFERENCE_KH = 8.0f;

    // Métodos privados para cada fase
    bool phase1_discard(int level_a, int level_b);
    bool phase2_calibrate_reference(int level_c, int level_a);
    bool phase3_collect_sample(int level_a, int level_b);
    bool phase4_measure_saturation(int level_a, int level_b);
    bool phase5_maintenance(int level_a, int level_b);

    // Métodos auxiliares
    float calculateKH();
    bool validateMeasurement();
    void logPhaseInfo(const char* phase_name);
    
    // [PERSISTÊNCIA] Métodos de serialização
    String configToJSON();
    bool configFromJSON(const String& json);
};

#endif // KH_ANALYZER_H
