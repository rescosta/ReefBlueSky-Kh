// KH_Calibrator.h
#ifndef KH_CALIBRATOR_H
#define KH_CALIBRATOR_H

#include <Arduino.h>
#include <SPIFFS.h>
#include "PumpControl.h"
#include "SensorManager.h"

class KH_Calibrator {
public:
    struct Result {
        bool   success = false;
        String error;
        float  kh_ref_user      = 0.0f;
        float  ph_ref_measured  = 0.0f;
        float  temp_ref         = 0.0f;
        float  mlps_b1          = 0.0f;
        float  mlps_b2          = 0.0f;
        float  mlps_b3          = 0.0f;
    };

    KH_Calibrator(PumpControl* pc, SensorManager* sm);

    // Inicia calibração completa
    void start(float kh_ref_user, bool assumeEmpty);

    // Um passo da FSM, chamado do loop (retorna false quando termina)
    bool processStep();

    // Acessores de resultado/erro
    bool   hasError()        const;
    Result getResult()       const;

private:
    enum CalState {
        CAL_IDLE = 0,
        CAL_B1_FILL_A,
        CAL_B1_WAIT_A_FULL,
        CAL_B1_FILL_B,
        CAL_B1_WAIT_B_FULL,
        CAL_B1_DONE,

        CAL_B2_PREP_EMPTY_B,
        CAL_B2_FILL_B,
        CAL_B2_WAIT_B_FULL,
        CAL_B2_DONE,

        CAL_B3_PREP_EMPTY_C,
        CAL_B3_FLUSHING,
        CAL_B3_ENSURE_B_FULL,      // [FIX] Novo: Garantir B cheio antes de calibrar C
        CAL_B3_WAIT_B_FULL,        // [FIX] Novo: Aguardar B ficar cheio
        CAL_B3_FILL_C,             // [FIX] Renomeado: Encher C a partir de B
        CAL_B3_WAIT_C_FULL,        // [FIX] Renomeado: Aguardar C ficar cheio (150mL)
        CAL_B3_DONE,

        CAL_SAVE,
        CAL_COMPLETE,
        CAL_ERROR
    };

    static constexpr unsigned long MAX_FILL_MS  = 30000UL;
    static constexpr const char*   CAL_FILE     = "/kh_calib.json";

    // [FIX] Ranges esperados de vazão para sanity checks (mL/s)
    static constexpr float MIN_FLOW_RATE = 0.1f;   // mínimo 0.1 mL/s (bomba muito lenta)
    static constexpr float MAX_FLOW_RATE = 10.0f;  // máximo 10 mL/s (vazão muito alta suspeita)
    static constexpr float MIN_PH_REF    = 6.0f;   // pH mínimo esperado
    static constexpr float MAX_PH_REF    = 9.0f;   // pH máximo esperado
    static constexpr float MIN_TEMP      = 15.0f;  // Temperatura mínima (°C)
    static constexpr float MAX_TEMP      = 35.0f;  // Temperatura máxima (°C)

    PumpControl*   _pc;
    SensorManager* _sm;

    CalState       _state        = CAL_IDLE;
    unsigned long  _t_start      = 0;
    float          _kh_ref_user  = 0.0f;
    float          _b1_mlps      = 0.0f;
    float          _b2_mlps      = 0.0f;
    float          _b3_mlps      = 0.0f;
    float          _ph_ref_measured = 0.0f;
    float          _temp_ref        = 0.0f;
    Result         _result;

    // Sub‑steps
    bool stepCalibB1();
    bool stepCalibB2();
    bool stepCalibB3();

    bool saveCalibrationToSPIFFS();

    // [FIX] Validações (sanity checks)
    bool validateFlowRate(float mlps, const char* pump_name);
    bool validatePHReference(float ph);
    bool validateTemperature(float temp);
    void sendCalibrationAlert(const String& message);
};

#endif
