// KH_Calibrator.h
#ifndef KH_CALIBRATOR_H
#define KH_CALIBRATOR_H

#include <Arduino.h>
#include <SPIFFS.h>
#include "PumpControl.h"
#include "SensorManager.h"

/**
 * Calibrador completo de KH.
 *
 * Ordem de execução:
 *  1. Flush das câmaras A/B/C (se !assumeEmpty)   — baseado em sensor de nível máximo
 *  2. Calibrar bomba 2 A→B    (50 mL)             — mlps_b2
 *  3. Calibrar bomba 3 B→C    (150 mL)            — mlps_b3
 *  4. Calibrar bomba 1 aquário→A (60,6 mL + mangueira) — mlps_b1
 *  5. Medir pH de referência  (compressor 60 s)
 *  6. Salvar em SPIFFS
 *
 * Restrição de hardware: apenas sensores de nível MÁXIMO (sem mínimo).
 * Todos os estados são não-bloqueantes (sem delay); processStep() é chamado
 * a cada KH_CALIB_STEP_INTERVAL_MS ms pelo loop principal.
 */
class KH_Calibrator {
public:
    struct Result {
        bool   success         = false;
        String error;
        float  kh_ref_user     = 0.0f;
        float  ph_ref_measured = 0.0f;
        float  temp_ref        = 0.0f;
        float  mlps_b1         = 0.0f;  // bomba 1: aquário→A (mL/s)
        float  mlps_b2         = 0.0f;  // bomba 2: A→B (mL/s)
        float  mlps_b3         = 0.0f;  // bomba 3: B→C (mL/s)
        unsigned long time_fill_a_ms = 0;  // tempo real para encher A (ms)
        unsigned long time_fill_b_ms = 0;  // tempo real para encher B (ms)
        unsigned long time_fill_c_ms = 0;  // tempo real para encher C (ms)
    };

    KH_Calibrator(PumpControl* pc, SensorManager* sm);

    // Inicia calibração. kh_ref_user = KH conhecido da solução de referência.
    // assumeEmpty = true se câmaras já estão vazias (pula o flush).
    void start(float kh_ref_user, bool assumeEmpty);

    // Um passo da FSM, chamado do loop (retorna false quando termina ou há erro).
    bool processStep();

    bool   hasError()  const;
    Result getResult() const;

private:
    enum CalState {
        CAL_IDLE = 0,

        // Passo 1: Flush A/B/C (opcional)
        CAL_FLUSH_START,
        CAL_FLUSH_WAIT,

        // Passo 2: Calibrar bomba 1 PRIMEIRO (aquário→A, 60.6 mL) → mlps_b1
        CAL_B1_TIMED_START,     // zera timer; liga bomba 1 (aquário→A)
        CAL_B1_WAIT_A_FULL,     // aguarda A cheio; calcula mlps_b1 = 60.6/t

        // Passo 3: Calibrar bomba 2 (A→B, 50 mL) → mlps_b2
        CAL_B2_TIMED_START,     // zera timer; liga bomba 2 (A→B) + bomba 1 reposição
        CAL_B2_WAIT_B_FULL,     // aguarda B cheio; calcula mlps_b2 = 50/t

        // Passo 4: Calibrar bomba 3 (B→C, 150 mL) → mlps_b3
        // Reposição contínua A+B necessária (C=150mL > A+B=100mL).
        CAL_B3_TIMED_START,     // zera timer; liga bombas 3+2+1 em paralelo
        CAL_B3_WAIT_C_FULL,     // aguarda C cheio; calcula mlps_b3 = 150/t

        // Passo 4.5: Esvaziar B e garantir A cheio (preparar para ciclo KH)
        CAL_DRAIN_B_START,      // inicia esvaziamento B→A (+ drenagem A→aquário se necessário)
        CAL_DRAIN_B_WAIT,       // aguarda B esvaziar (tempo calibrado + 30% ou timeout)
        CAL_ENSURE_A_FULL,      // verifica se A está cheio; se não, enche do aquário
        CAL_ENSURE_A_WAIT,      // aguarda A cheio

        // Passo 5: Encher B de C (solução de referência) antes do ciclo KH
        CAL_FILL_B_FROM_C_START,  // inicia C→B (referência)
        CAL_FILL_B_FROM_C_WAIT,   // aguarda B cheio ou timeout

        // Passo 6: Ciclo completo de teste de KH (via KH_Analyzer)
        CAL_KH_TEST_START,      // sinaliza .ino para iniciar KH_Analyzer
        CAL_KH_TEST_WAIT,       // aguarda onKhTestComplete() do .ino

        CAL_SAVE,
        CAL_COMPLETE,
        CAL_ERROR
    };

    // ---- Constantes de tempo ----
    static constexpr unsigned long MAX_FILL_A_MS    = 240000UL;  // timeout encher A (4 min)
    static constexpr unsigned long MAX_FILL_B_MS    = 240000UL;  // timeout encher B (4 min)
    static constexpr unsigned long MAX_FILL_C_MS    = 240000UL;  // timeout encher C (4 min)
    static constexpr unsigned long FLUSH_TIMEOUT_MS = 240000UL;  // timeout flush geral (4 min)
    static constexpr unsigned long FLUSH_STABLE_MS  =  5000UL;  // estabilidade pós-flush
    static constexpr unsigned long COMP_TIME_MS     = 60000UL;  // compressor para equilibrar

    // ---- Volumes ----
    static constexpr float VOLUME_A_ML   =  50.0f;
    static constexpr float VOLUME_B_ML   =  50.0f;
    static constexpr float VOLUME_C_ML   = 150.0f;
    static constexpr float HOSE_ML       =  10.6f;  // mangueira bomba 1 (3 mm × 1,5 m)

    // ---- Sanity checks ----
    static constexpr float MIN_FLOW_RATE = 0.1f;
    static constexpr float MAX_FLOW_RATE = 10.0f;
    static constexpr float MIN_PH_REF    = 4.0f;  // Relaxado para testes
    static constexpr float MAX_PH_REF    = 10.0f; // Relaxado para testes
    static constexpr float MIN_TEMP      = 10.0f; // Relaxado para testes
    static constexpr float MAX_TEMP      = 40.0f; // Relaxado para testes

    static constexpr const char* CAL_FILE = "/kh_calib.json";

    // ---- Estado ----
    PumpControl*   _pc;
    SensorManager* _sm;

    CalState      _state       = CAL_IDLE;
    unsigned long _t_start     = 0;   // timer principal do estado atual
    unsigned long _t_stable    = 0;   // timer auxiliar (flush stable)
    float         _kh_ref_user = 0.0f;
    float         _b1_mlps     = 0.0f;
    float         _b2_mlps     = 0.0f;
    float         _b3_mlps     = 0.0f;
    unsigned long _t_fill_a_ms = 0;   // tempo medido para encher A
    unsigned long _t_fill_b_ms = 0;   // tempo medido para encher B
    unsigned long _t_fill_c_ms = 0;   // tempo medido para encher C
    float         _ph_ref_measured = 0.0f;
    float         _temp_ref        = 0.0f;
    Result        _result;

    // ---- Sub-steps ----
    bool stepFlush();
    bool stepCalibB1();
    bool stepCalibB2();
    bool stepCalibB3();
    bool stepDrainB();      // NOVO: esvaziar B após calibrar B3
    bool stepFillBFromC();  // NOVO: encher B de C (referência)
    bool stepEnsureFull();
    bool stepKhTestTrigger();

    // ---- Calibração prévia ----
    bool loadPreviousCalibration();  // carrega tempos e mlps salvos

    bool saveCalibrationToSPIFFS();
    bool validateFlowRate(float mlps, const char* name);
    bool validatePHReference(float ph);
    bool validateTemperature(float temp);
    void setError(const String& msg);

public:
    // ---- Progresso (para barra de progresso no frontend) ----
    String        getProgressMessage();        // Descrição legível da etapa atual
    int           getProgressPercent();        // 0-100; -1 = inativo/erro
    unsigned long getCompressorRemainingMs();  // ms restantes do compressor (0 se desligado)

    // ---- Integração com KH_Analyzer (Passo 5) ----
    // O .ino consulta needsKhTestCycle() a cada iteração do loop.
    // Quando true, inicia o KH_Analyzer e aguarda conclusão.
    // Ao terminar, chama onKhTestComplete() com os dados da Fase 2.
    bool needsKhTestCycle() const { return _state == CAL_KH_TEST_START; }
    void onKhTestComplete(float ph_ref_measured, float temp_ref);
};

#endif
