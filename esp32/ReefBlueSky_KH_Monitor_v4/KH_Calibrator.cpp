// KH_Calibrator.cpp

#include "KH_Calibrator.h"
#include <ArduinoJson.h>

KH_Calibrator::KH_Calibrator(PumpControl* pc, SensorManager* sm)
: _pc(pc), _sm(sm) {}

void KH_Calibrator::start(float kh_ref_user, bool assumeEmpty) {
    _kh_ref_user = kh_ref_user;
    _b1_mlps = _b2_mlps = _b3_mlps = 0.0f;
    _result  = Result();
    _state   = CAL_B1_FILL_A;
    _t_start = millis();

    // Opcional: garantir câmaras vazias se !assumeEmpty
    if (!assumeEmpty) {
        _pc->stopAll();
        _pc->pumpC_discharge();
        _pc->pumpB_discharge();
        _pc->pumpA_discharge();
        delay(3000); // flush simples
        _pc->stopAll();
    }

    Serial.println("[CAL] Iniciando calibração completa (B1, B2, B3)...");
}

bool KH_Calibrator::processStep() {
    switch (_state) {
        case CAL_B1_FILL_A:
        case CAL_B1_WAIT_A_FULL:
        case CAL_B1_FILL_B:
        case CAL_B1_WAIT_B_FULL:
        case CAL_B1_DONE:
            return stepCalibB1();

        case CAL_B2_PREP_EMPTY_B:
        case CAL_B2_FILL_B:
        case CAL_B2_WAIT_B_FULL:
        case CAL_B2_DONE:
            return stepCalibB2();

        case CAL_B3_PREP_EMPTY_C:
        case CAL_B3_FLUSHING:
        case CAL_B3_FILL_A:
        case CAL_B3_WAIT_A_FULL:
        case CAL_B3_FILL_B:
        case CAL_B3_WAIT_B_FULL:
        case CAL_B3_DONE:
            return stepCalibB3();

        case CAL_SAVE: {
            Serial.println("[CAL] Salvando calibração em SPIFFS...");

            // Preencher struct de resultado antes de salvar
            _result.kh_ref_user    = _kh_ref_user;
            _result.ph_ref_measured = _ph_ref_measured;
            _result.temp_ref        = _temp_ref;
            _result.mlps_b1         = _b1_mlps;
            _result.mlps_b2         = _b2_mlps;
            _result.mlps_b3         = _b3_mlps;

            if (!saveCalibrationToSPIFFS()) {
                _result.error = "Falha ao salvar calibração em SPIFFS";
                _state        = CAL_ERROR;
            } else {
                _result.success = true;
                _state          = CAL_COMPLETE;
            }
            return false;
        }


        case CAL_COMPLETE:
        case CAL_ERROR:
        case CAL_IDLE:
        default:
            return false;
    }
}

bool KH_Calibrator::hasError() const {
    return (_state == CAL_ERROR);
}

KH_Calibrator::Result KH_Calibrator::getResult() const {
    return _result;
}

// ---------- B1: calibrar bomba 1 (Aquário -> A/B) ----------
bool KH_Calibrator::stepCalibB1() {
    switch (_state) {
        case CAL_B1_FILL_A: {
            Serial.println("[CAL][B1] Enchendo A a partir do aquário...");
            _pc->pumpA_fill();
            _t_start = millis();
            _state   = CAL_B1_WAIT_A_FULL;
            return true;
        }

        case CAL_B1_WAIT_A_FULL: {
            bool a_full = (_sm->getLevelA() == 1);
            if (a_full) {
                Serial.println("[CAL][B1] A cheio, enchendo B...");
                _pc->pumpA_stop();
                _pc->pumpB_fill();
                _t_start = millis();
                _state   = CAL_B1_WAIT_B_FULL;
                return true;
            }
            if (millis() - _t_start > MAX_FILL_MS) {
                _pc->pumpA_stop();
                _state        = CAL_ERROR;
                _result.error = "Timeout enchendo A na calibração da bomba 1";
                return false;
            }
            return true;
        }

        case CAL_B1_WAIT_B_FULL: {
            bool b_full = (_sm->getLevelB() == 1);
            if (b_full) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s = dt_ms / 1000.0f;
                // Exemplo: assumindo volume 100 mL
                float volume_ml = 100.0f;
                _b1_mlps = volume_ml / dt_s;
                Serial.printf("[CAL][B1] B cheio, tempo=%.2fs, vazao=%.4f mL/s\n",
                              dt_s, _b1_mlps);
                _pc->pumpB_stop();
                _state = CAL_B1_DONE;
                return true;
            }
            if (millis() - _t_start > MAX_FILL_MS) {
                _pc->pumpB_stop();
                _state        = CAL_ERROR;
                _result.error = "Timeout enchendo B na calibração da bomba 1";
                return false;
            }
            return true;
        }

        case CAL_B1_DONE:
            Serial.println("[CAL][B1] Calibração da bomba 1 concluída.");
            _state = CAL_B2_PREP_EMPTY_B;
            return true;
        
        default:
            return false;
    }
}

// ---------- B2: calibrar bomba 2 (B -> C) ----------
bool KH_Calibrator::stepCalibB2() {
    switch (_state) {
        case CAL_B2_PREP_EMPTY_B: {
            Serial.println("[CAL][B2] Esvaziando B...");
            _pc->pumpB_discharge();
            _t_start = millis();
            _state   = CAL_B2_FILL_B;
            return true;
        }

        case CAL_B2_FILL_B: {
            if (millis() - _t_start > 5000UL) { // flush inicial
                _pc->pumpB_stop();
                Serial.println("[CAL][B2] Enchendo B de solução padrão...");
                _pc->pumpB_fill();
                _t_start = millis();
                _state   = CAL_B2_WAIT_B_FULL;
            }
            return true;
        }

        case CAL_B2_WAIT_B_FULL: {
            bool b_full = (_sm->getLevelB() == 1);
            if (b_full) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s   = dt_ms / 1000.0f;
                float volume_ml = 100.0f;
                _b2_mlps = volume_ml / dt_s;
                Serial.printf("[CAL][B2] B cheio, tempo=%.2fs, vazao=%.4f mL/s\n",
                              dt_s, _b2_mlps);
                _pc->pumpB_stop();
                _state = CAL_B2_DONE;
                return true;
            }
            if (millis() - _t_start > MAX_FILL_MS) {
                _pc->pumpB_stop();
                _state        = CAL_ERROR;
                _result.error = "Timeout enchendo B na calibração da bomba 2";
                return false;
            }
            return true;
        }

        case CAL_B2_DONE: {
            Serial.println("[CAL][B2] Calibração da bomba 2 concluída.");

            // Captura PH/Temp da solução padrão (B cheio)
            _ph_ref_measured = _sm->getPH();
            _temp_ref        = _sm->getTemperature();

            _state = CAL_B3_PREP_EMPTY_C;
            return true;
        }

        default:
            return false;
    }
}

// ---------- B3: calibrar bomba 3 (B -> C / flush C) ----------
bool KH_Calibrator::stepCalibB3() {
    switch (_state) {
        case CAL_B3_PREP_EMPTY_C: {
            Serial.println("[CAL][B3] Garantindo C vazio (flush C->B->A->aquário)");
            _t_start = millis();
            _pc->pumpC_discharge();  // C -> B
            _state   = CAL_B3_FLUSHING;
            return true;
        }

        case CAL_B3_FLUSHING: {
            if (millis() - _t_start < 5000UL) {
                return true;
            }
            Serial.println("[CAL][B3] Flush concluído, parando bombas e iniciando enchimento A");
            _pc->stopAll();
            _pc->pumpA_fill();
            _t_start = millis();
            _state   = CAL_B3_FILL_A;
            return true;
        }

        case CAL_B3_FILL_A: {
            bool a_full = (_sm->getLevelA() == 1);
            if (a_full) {
                Serial.println("[CAL][B3] A cheio, parando bomba A e enchendo B a partir de A");
                _pc->pumpA_stop();
                _pc->pumpB_fill();
                _t_start = millis();
                _state   = CAL_B3_FILL_B;
                return true;
            }
            if (millis() - _t_start > MAX_FILL_MS) {
                _pc->pumpA_stop();
                _state        = CAL_ERROR;
                _result.error = "Timeout ao encher A na calibração da bomba 3 (B->C)";
                return false;
            }
            return true;
        }

        case CAL_B3_FILL_B: {
            bool b_full = (_sm->getLevelB() == 1);
            if (b_full) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s = dt_ms / 1000.0f;
                float volume_ml = 100.0f;
                _b3_mlps = volume_ml / dt_s;
                Serial.printf("[CAL][B3] B cheio, tempo=%.2fs, vazao=%.4f mL/s\n",
                              dt_s, _b3_mlps);
                _pc->pumpB_stop();
                _state = CAL_B3_DONE;
                return true;
            }
            if (millis() - _t_start > MAX_FILL_MS) {
                _pc->pumpB_stop();
                _state        = CAL_ERROR;
                _result.error = "Timeout enchendo B na calibração da bomba 3";
                return false;
            }
            return true;
        }

        case CAL_B3_DONE:
            Serial.println("[CAL][B3] Calibração da bomba 3 concluída.");
            _state = CAL_SAVE;
            return true;

        default:
            return false;
    }
}

bool KH_Calibrator::saveCalibrationToSPIFFS() {
    if (!SPIFFS.begin(true)) {
        Serial.println("[CAL] ERRO: SPIFFS.begin falhou ao salvar calibração");
        return false;
    }

    DynamicJsonDocument doc(512);
    doc["kh_ref_user"] = _kh_ref_user;
    doc["mlps_b1"]     = _b1_mlps;
    doc["mlps_b2"]     = _b2_mlps;
    doc["mlps_b3"]     = _b3_mlps;

    File f = SPIFFS.open(CAL_FILE, "w");
    if (!f) {
        Serial.printf("[CAL] ERRO: não abriu %s para escrita\n", CAL_FILE);
        return false;
    }
    serializeJson(doc, f);
    f.close();

    Serial.println("[CAL] Calibração salva em SPIFFS com sucesso.");
    return true;
}

