// KH_Calibrator.cpp

#include "KH_Calibrator.h"
#include <ArduinoJson.h>

KH_Calibrator::KH_Calibrator(PumpControl* pc, SensorManager* sm)
    : _pc(pc), _sm(sm) {}

// =============================================================
// start()
// =============================================================
void KH_Calibrator::start(float kh_ref_user, bool assumeEmpty) {
    _kh_ref_user = kh_ref_user;
    _b1_mlps = _b2_mlps = _b3_mlps = 0.0f;
    _t_fill_a_ms = _t_fill_b_ms = _t_fill_c_ms = 0;
    _ph_ref_measured = _temp_ref = 0.0f;
    _result  = Result();
    _t_start = _t_stable = 0;

    // Carrega calibração prévia (se existir) para usar tempos como fallback
    loadPreviousCalibration();

    _pc->stopAll();

    Serial.println("\n========================================");
    Serial.println("[CAL] INICIANDO CALIBRACAO COMPLETA");
    Serial.println("========================================");
    Serial.printf("[CAL] KH de referencia: %.2f dKH\n", kh_ref_user);
    Serial.printf("[CAL] Camaras vazias assumidas: %s\n", assumeEmpty ? "SIM" : "NAO");

    if (assumeEmpty) {
        Serial.println("[CAL] Pulando flush - iniciando Passo 2: calibrar bomba A (aquario->A)");
        _state = CAL_B1_TIMED_START;
    } else {
        Serial.println("[CAL] Passo 1: flush das camaras A/B/C...");
        _state = CAL_FLUSH_START;
    }
}

// =============================================================
// processStep()  — despachador principal
// =============================================================
bool KH_Calibrator::processStep() {
    switch (_state) {
        case CAL_FLUSH_START:
        case CAL_FLUSH_WAIT:
            return stepFlush();

        case CAL_B1_TIMED_START:
        case CAL_B1_WAIT_A_FULL:
            return stepCalibB1();

        case CAL_B2_TIMED_START:
        case CAL_B2_WAIT_B_FULL:
            return stepCalibB2();

        case CAL_B3_TIMED_START:
        case CAL_B3_WAIT_C_FULL:
            return stepCalibB3();

        case CAL_DRAIN_B_START:
        case CAL_DRAIN_B_WAIT:
        case CAL_ENSURE_A_FULL:
        case CAL_ENSURE_A_WAIT:
            return stepDrainB();

        case CAL_FILL_B_FROM_C_START:
        case CAL_FILL_B_FROM_C_WAIT:
            return stepFillBFromC();

        case CAL_KH_TEST_START:
        case CAL_KH_TEST_WAIT:
            return stepKhTestTrigger();

        case CAL_SAVE: {
            _result.kh_ref_user     = _kh_ref_user;
            _result.ph_ref_measured = _ph_ref_measured;
            _result.temp_ref        = _temp_ref;
            _result.mlps_b1         = _b1_mlps;
            _result.mlps_b2         = _b2_mlps;
            _result.mlps_b3         = _b3_mlps;
            _result.time_fill_a_ms  = _t_fill_a_ms;
            _result.time_fill_b_ms  = _t_fill_b_ms;
            _result.time_fill_c_ms  = _t_fill_c_ms;

            if (!saveCalibrationToSPIFFS()) {
                setError("Falha ao salvar calibracao em SPIFFS");
            } else {
                _result.success = true;
                _state = CAL_COMPLETE;
                Serial.println("[CAL] === CALIBRACAO CONCLUIDA COM SUCESSO ===");
                Serial.printf("[CAL] mlps_b1=%.4f  mlps_b2=%.4f  mlps_b3=%.4f\n",
                              _b1_mlps, _b2_mlps, _b3_mlps);
                Serial.printf("[CAL] tempos: A=%lu ms  B=%lu ms  C=%lu ms\n",
                              _t_fill_a_ms, _t_fill_b_ms, _t_fill_c_ms);
                Serial.printf("[CAL] KH_ref=%.2f  pH_ref=%.2f  temp=%.2f C\n",
                              _kh_ref_user, _ph_ref_measured, _temp_ref);
            }
            return false;  // FSM encerrada
        }

        case CAL_COMPLETE:
        case CAL_ERROR:
        case CAL_IDLE:
        default:
            return false;
    }
}

bool KH_Calibrator::hasError()  const { return (_state == CAL_ERROR); }
KH_Calibrator::Result KH_Calibrator::getResult() const { return _result; }

// =============================================================
// Passo 1: Flush A/B/C
//   Fluxo: C->B->A->aquario com protecao de overflow por sensor.
//   Termina quando nenhum sensor estiver em "cheio" por FLUSH_STABLE_MS,
//   ou por timeout FLUSH_TIMEOUT_MS.
// =============================================================
bool KH_Calibrator::stepFlush() {
    unsigned long now = millis();
    static bool logged_wait = false;  // Flag para log de debug

    if (_state == CAL_FLUSH_START) {
        logged_wait = false;  // Reset para novo ciclo
        _pc->pumpC_discharge();  // C -> B (esvazia C para B)
        _pc->pumpB_discharge();  // B -> A (esvazia B para A)
        _pc->pumpA_discharge();  // A -> aquario (esvazia A para aquario)
        _t_start  = now;

        // Flush inteligente: tempo calibrado + 30% ou 5 min fixo
        if (_t_fill_a_ms > 0 && _t_fill_b_ms > 0 && _t_fill_c_ms > 0) {
            unsigned long calculated_flush = (_t_fill_a_ms + _t_fill_b_ms + _t_fill_c_ms) * 1.3;
            // [FIX] Limita timeout inteligente ao máximo de 5 min
            if (calculated_flush > FLUSH_TIMEOUT_MS) {
                _t_stable = FLUSH_TIMEOUT_MS;
                Serial.printf("[CAL][FLUSH] Timeout inteligente muito alto (%.1f s), usando fixo: %.1f s\n",
                              calculated_flush / 1000.0f, FLUSH_TIMEOUT_MS / 1000.0f);
            } else {
                _t_stable = calculated_flush;
                Serial.printf("[CAL][FLUSH] Timeout inteligente: %.1f s (baseado em calibracao previa)\n",
                              calculated_flush / 1000.0f);
            }
        } else {
            _t_stable = FLUSH_TIMEOUT_MS;  // 5 min fixo
            Serial.printf("[CAL][FLUSH] Timeout fixo: %.1f s\n", FLUSH_TIMEOUT_MS / 1000.0f);
        }

        _state = CAL_FLUSH_WAIT;
        Serial.println("[CAL][FLUSH] Bombas ativas: C->B, B->A, A->aquario (flush camaras)");
        return true;
    }

    // CAL_FLUSH_WAIT
    // [DEBUG] Confirma que está em CAL_FLUSH_WAIT
    if (!logged_wait) {
        Serial.printf("[CAL][FLUSH] Entrou em CAL_FLUSH_WAIT. Timeout configurado: %.1f s\n", _t_stable / 1000.0f);
        logged_wait = true;
    }

    bool a = (_sm->getLevelA() == 1);
    bool b = (_sm->getLevelB() == 1);
    bool c = (_sm->getLevelC() == 1);

    // Protecao A: se A estiver cheio, B esta enchendo A mais rapido que A drena.
    // Para bomba B temporariamente.
    if (a && _pc->isPumpRunning(2)) {
        _pc->pumpB_stop();
        Serial.println("[CAL][FLUSH] Sensor A ativo (A cheio) - pausando bomba B");
    } else if (!a && !_pc->isPumpRunning(2)) {
        _pc->pumpB_discharge();
        Serial.println("[CAL][FLUSH] Sensor A inativo - retomando bomba B (B->A)");
    }

    // Protecao B: se B estiver cheio, C esta enchendo B mais rapido que B drena.
    // Para bomba C temporariamente.
    if (b && _pc->isPumpRunning(3)) {
        _pc->pumpC_stop();
        Serial.println("[CAL][FLUSH] Sensor B ativo (B cheio) - pausando bomba C");
    } else if (!b && !_pc->isPumpRunning(3)) {
        _pc->pumpC_discharge();
        Serial.println("[CAL][FLUSH] Sensor B inativo - retomando bomba C (C->B)");
    }

    // [DEBUG] Log de progresso do flush a cada 10 segundos
    static unsigned long last_debug_ms = 0;
    if (now - last_debug_ms >= 10000) {
        last_debug_ms = now;
        unsigned long elapsed_ms = now - _t_start;
        Serial.printf("[CAL][FLUSH] Progresso: %.1f s / %.1f s (%.1f%%)\n",
                      elapsed_ms / 1000.0f, _t_stable / 1000.0f,
                      (elapsed_ms * 100.0f) / _t_stable);
    }

    // Timeout: tempo calibrado + 30% ou 5 min fixo
    if (now - _t_start >= _t_stable) {
        _pc->stopAll();
        Serial.printf("[CAL][FLUSH] Flush concluido (%.1f s). Iniciando calibracao bomba A.\n",
                      (now - _t_start) / 1000.0f);
        _state = CAL_B1_TIMED_START;
        return true;
    }

    return true;
}

// =============================================================
// Passo 3: Calibrar bomba 2 (A->B, 50 mL)
//   - A já está cheio (veio do stepCalibB1)
//   - Zera timer; liga bomba 2 (A->B) + bomba 1 reposição paralela
//   - Quando B cheia: mlps_b2 = 50 / t
// =============================================================
bool KH_Calibrator::stepCalibB2() {
    unsigned long now = millis();

    switch (_state) {
        case CAL_B2_TIMED_START: {
            Serial.println("[CAL][B2] Passo 3 - Calibrar bomba B (A->B, 50 mL)");
            _t_start = millis();
            _pc->pumpB_fill();    // A -> B (mede esta bomba)
            _pc->pumpA_fill();    // aquario -> A (reposicao paralela)
            Serial.println("[CAL][B2] Timer zerado. Bombas B (A->B) e A (aquario->A) ligadas.");
            _state = CAL_B2_WAIT_B_FULL;
            return true;
        }

        case CAL_B2_WAIT_B_FULL: {
            // Gerencia reposicao de A: pausa se A cheio, retoma se A nao cheio
            bool a_full = (_sm->getLevelA() == 1);
            if (a_full && _pc->isPumpRunning(1)) {
                _pc->pumpA_stop();
            } else if (!a_full && !_pc->isPumpRunning(1)) {
                _pc->pumpA_fill();
            }

            if (_sm->getLevelB() == 1) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s = dt_ms / 1000.0f;
                _b2_mlps = VOLUME_B_ML / dt_s;
                _t_fill_b_ms = dt_ms;  // REGISTRA TEMPO
                _pc->pumpB_stop();
                _pc->pumpA_stop();
                Serial.printf("[CAL][B2] B cheio (50 mL). Tempo=%.2f s (%.0f ms), vazao=%.4f mL/s\n",
                              dt_s, (float)dt_ms, _b2_mlps);

                if (!validateFlowRate(_b2_mlps, "Bomba 2 (A->B)")) return false;

                Serial.println("[CAL][B2] Bomba B calibrada. Iniciando calibracao bomba C...");
                _state = CAL_B3_TIMED_START;
                return true;
            }

            if (now - _t_start > MAX_FILL_B_MS) {
                _pc->stopAll();
                setError("Timeout enchendo B (bomba 2)");
                return false;
            }
            return true;
        }

        default: return false;
    }
}

// =============================================================
// Passo 4.5: ESVAZIAR B e garantir A cheio (preparar para ciclo KH)
//   Após calibrar C, esvazia B e garante A cheio.
//   - Esvazia B->A (bomba 2 reversa)
//   - Se A encher, drena A->aquário (bomba 1 reversa)
//   - Usa tempo calibrado de B + 30%, ou timeout
//   - Garante que A está cheio antes de prosseguir
//   Estado final: A CHEIO + B VAZIO + C CHEIO
// =============================================================
bool KH_Calibrator::stepDrainB() {
    unsigned long now = millis();

    switch (_state) {
        case CAL_DRAIN_B_START: {
            Serial.println("[CAL][DRAIN_B] Passo 4.5 - Esvaziando B após calibrar bomba C");
            _t_start = millis();
            _pc->pumpB_discharge();  // B -> A

            // Calcula timeout: tempo calibrado de B + 30%, ou 10 min se não calibrado
            unsigned long drain_timeout;
            if (_t_fill_b_ms > 0) {
                drain_timeout = _t_fill_b_ms * 1.3;
                Serial.printf("[CAL][DRAIN_B] Usando tempo inteligente: %.1f s (baseado em %.1f s + 30%%)\n",
                              drain_timeout / 1000.0f, _t_fill_b_ms / 1000.0f);
            } else {
                drain_timeout = MAX_FILL_B_MS;
                Serial.println("[CAL][DRAIN_B] Usando timeout fixo: 10 min");
            }
            _t_stable = drain_timeout;  // reutiliza _t_stable para guardar timeout

            Serial.println("[CAL][DRAIN_B] Bomba B (B->A) ligada para esvaziar B");
            _state = CAL_DRAIN_B_WAIT;
            return true;
        }

        case CAL_DRAIN_B_WAIT: {
            // Proteção: se A encher, drena A para aquário
            bool a_full = (_sm->getLevelA() == 1);
            if (a_full && !_pc->isPumpRunning(1)) {
                Serial.println("[CAL][DRAIN_B] A cheio durante drenagem B - iniciando drenagem A->aquário");
                _pc->pumpA_discharge();  // A -> aquário
            } else if (!a_full && _pc->isPumpRunning(1)) {
                Serial.println("[CAL][DRAIN_B] A abaixo do máximo - parando drenagem A->aquário");
                _pc->pumpA_stop();
            }

            // Verifica timeout
            if (now - _t_start >= _t_stable) {
                _pc->pumpB_stop();
                _pc->pumpA_stop();
                Serial.printf("[CAL][DRAIN_B] B esvaziado após %lu ms. Verificando se A está cheio...\n",
                              now - _t_start);
                _state = CAL_ENSURE_A_FULL;
                return true;
            }
            return true;
        }

        case CAL_ENSURE_A_FULL: {
            if (_sm->getLevelA() == 1) {
                Serial.println("[CAL][DRAIN_B] A já está cheio. Enchendo B de C (referência)...");
                _state = CAL_FILL_B_FROM_C_START;
                return true;
            }

            Serial.println("[CAL][DRAIN_B] A não está cheio. Enchendo A do aquário...");
            _pc->pumpA_fill();  // aquário -> A
            _t_start = millis();
            _state = CAL_ENSURE_A_WAIT;
            return true;
        }

        case CAL_ENSURE_A_WAIT: {
            if (_sm->getLevelA() == 1) {
                _pc->pumpA_stop();
                Serial.printf("[CAL][DRAIN_B] A cheio após %lu ms. Enchendo B de C...\n",
                              now - _t_start);
                _state = CAL_FILL_B_FROM_C_START;
                return true;
            }

            if (now - _t_start > MAX_FILL_A_MS) {
                _pc->stopAll();
                setError("Timeout enchendo A antes de encher B");
                return false;
            }
            return true;
        }

        default: return false;
    }
}

// =============================================================
// Passo 4: Calibrar bomba 3 (B->C, 150 mL)
//   - B agora está VAZIA (esvaziada em stepPrepB3)
//   - A está cheia
//   - Zera timer; liga bombas C+B+A em paralelo (reposição contínua)
//   - C (150 mL) > A+B (100 mL): reposição contínua obrigatória
//   - Quando C cheia: mlps_b3 = 150 / t
// =============================================================
bool KH_Calibrator::stepCalibB3() {
    unsigned long now = millis();

    switch (_state) {
        case CAL_B3_TIMED_START: {
            Serial.println("[CAL][B3] Passo 4 - Calibrar bomba C (B->C, 150 mL)");
            _t_start = millis();
            _pc->pumpC_fill();  // B -> C  (mede esta bomba)
            _pc->pumpB_fill();  // A -> B  (reposicao de B)
            _pc->pumpA_fill();  // aquario -> A  (reposicao de A)
            Serial.println("[CAL][B3] Timer zerado. Bombas C(B->C), B(A->B), A(aquario->A) ligadas.");
            _state = CAL_B3_WAIT_C_FULL;
            return true;
        }

        case CAL_B3_WAIT_C_FULL: {
            // Protecao A: se cheio, pausa bomba 1; retoma quando nao cheio
            bool a_full = (_sm->getLevelA() == 1);
            if (a_full && _pc->isPumpRunning(1)) {
                _pc->pumpA_stop();
            } else if (!a_full && !_pc->isPumpRunning(1)) {
                _pc->pumpA_fill();
            }

            // Protecao B: se cheio, pausa bomba 2; retoma quando nao cheio
            bool b_full = (_sm->getLevelB() == 1);
            if (b_full && _pc->isPumpRunning(2)) {
                _pc->pumpB_stop();
            } else if (!b_full && !_pc->isPumpRunning(2)) {
                _pc->pumpB_fill();
            }

            if (_sm->getLevelC() == 1) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s = dt_ms / 1000.0f;
                _b3_mlps = VOLUME_C_ML / dt_s;
                _t_fill_c_ms = dt_ms;  // REGISTRA TEMPO
                _pc->stopAll();
                Serial.printf("[CAL][B3] C cheio (150 mL). Tempo=%.2f s (%.0f ms), vazao=%.4f mL/s\n",
                              dt_s, (float)dt_ms, _b3_mlps);

                if (!validateFlowRate(_b3_mlps, "Bomba 3 (B->C)")) return false;

                Serial.println("[CAL][B3] Bomba C calibrada. Esvaziando B para preparar ciclo KH...");
                _state = CAL_DRAIN_B_START;
                return true;
            }

            if (now - _t_start > MAX_FILL_C_MS) {
                _pc->stopAll();
                setError("Timeout enchendo C (bomba 3)");
                return false;
            }
            return true;
        }

        default: return false;
    }
}

// =============================================================
// Passo 2: Calibrar bomba 1 PRIMEIRO (aquario->A, 60.6 mL)
//   - Após flush, enche A diretamente
//   - Zera timer; liga bomba 1 (aquario->A)
//   - Quando A cheia: mlps_b1 = (50 + 10.6) / t
// =============================================================
bool KH_Calibrator::stepCalibB1() {
    unsigned long now = millis();

    switch (_state) {
        case CAL_B1_TIMED_START: {
            Serial.println("[CAL][B1] Passo 2 - Calibrar bomba A (aquario->A, 60.6 mL)");
            _t_start = millis();
            _pc->pumpA_fill();  // aquario -> A
            Serial.println("[CAL][B1] Timer zerado. Bomba A (aquario->A) ligada.");
            _state = CAL_B1_WAIT_A_FULL;
            return true;
        }

        case CAL_B1_WAIT_A_FULL: {
            if (_sm->getLevelA() == 1) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s = dt_ms / 1000.0f;
                _b1_mlps = (VOLUME_A_ML + HOSE_ML) / dt_s;
                _t_fill_a_ms = dt_ms;  // REGISTRA TEMPO
                _pc->pumpA_stop();
                Serial.printf("[CAL][B1] A cheio (60.6 mL). Tempo=%.2f s (%.0f ms), vazao=%.4f mL/s\n",
                              dt_s, (float)dt_ms, _b1_mlps);

                if (!validateFlowRate(_b1_mlps, "Bomba 1 (aquario->A)")) return false;

                Serial.println("[CAL][B1] Bomba A calibrada. Iniciando calibracao bomba B...");
                _state = CAL_B2_TIMED_START;
                return true;
            }
            if (now - _t_start > MAX_FILL_A_MS) {
                _pc->stopAll();
                setError("Timeout enchendo A (bomba 1)");
                return false;
            }
            return true;
        }

        default: return false;
    }
}

// =============================================================
// Passo 5: Encher B de C (solução de referência)
//   Após esvaziar B e garantir A cheio, enche B de C.
//   - Liga bomba 3 reversa (C->B)
//   - Tempo: calibrado de B + 30% (por perdas/evaporação)
//   - NÃO dá erro se sensor B não ativar (perdas esperadas)
//   Estado final: A CHEIO + B CHEIO (ref) + C PARCIAL
// =============================================================
bool KH_Calibrator::stepFillBFromC() {
    unsigned long now = millis();

    switch (_state) {
        case CAL_FILL_B_FROM_C_START: {
            Serial.println("[CAL][FILL_B] Passo 5 - Enchendo B de C (solucao de referencia)...");
            _pc->pumpC_discharge();  // C -> B (bomba 3 reversa)
            _t_start = now;
            _state = CAL_FILL_B_FROM_C_WAIT;
            return true;
        }

        case CAL_FILL_B_FROM_C_WAIT: {
            // Para quando sensor B ativar
            if (_sm->getLevelB() == 1) {
                _pc->pumpC_stop();
                Serial.printf("[CAL][FILL_B] B cheio após %lu ms. Iniciando ciclo de teste KH...\n",
                              now - _t_start);
                _state = CAL_KH_TEST_START;
                return true;
            }

            // Timeout baseado em tempo calibrado + 30%
            unsigned long fill_timeout;
            if (_t_fill_b_ms > 0) {
                fill_timeout = _t_fill_b_ms * 1.3;
            } else {
                fill_timeout = MAX_FILL_B_MS;
            }

            if (now - _t_start > fill_timeout) {
                _pc->pumpC_stop();
                // NÃO dá erro - perdas/evaporação são esperadas
                Serial.printf("[CAL][FILL_B] Timeout após %lu ms (sensor B nao ativou). Prosseguindo...\n",
                              now - _t_start);
                _state = CAL_KH_TEST_START;
                return true;
            }
            return true;
        }

        default: return false;
    }
}

// =============================================================
// Passo 5: Ciclo de teste de KH via KH_Analyzer
//   CAL_KH_TEST_START: sinaliza .ino via needsKhTestCycle().
//     O .ino detecta e inicia KH_Analyzer. Calibrador vai para WAIT.
//   CAL_KH_TEST_WAIT: aguarda o .ino chamar onKhTestComplete().
//     onKhTestComplete() armazena ph_ref e temp e avanca para CAL_SAVE.
// =============================================================
bool KH_Calibrator::stepKhTestTrigger() {
    switch (_state) {
        case CAL_KH_TEST_START:
            // O .ino consulta needsKhTestCycle() e inicia o KH_Analyzer.
            // Aqui apenas avancamos para WAIT - a transicao ocorre na proxima
            // iteracao do loop apos o .ino ter iniciado o analyzer.
            _state = CAL_KH_TEST_WAIT;
            Serial.println("[CAL][KH_TEST] Aguardando ciclo de KH_Analyzer...");
            return true;

        case CAL_KH_TEST_WAIT:
            // Aguarda onKhTestComplete() ser chamado pelo .ino.
            return true;

        default: return false;
    }
}

// Chamado pelo .ino quando KH_Analyzer.isComplete() == true durante calibracao.
void KH_Calibrator::onKhTestComplete(float ph_ref_measured, float temp_ref) {
    _ph_ref_measured = ph_ref_measured;
    _temp_ref        = temp_ref;

    Serial.printf("[CAL][KH_TEST] Ciclo KH concluido: pH_ref=%.2f temp=%.2f C\n",
                  _ph_ref_measured, _temp_ref);

    if (!validatePHReference(_ph_ref_measured)) return;
    if (!validateTemperature(_temp_ref))        return;

    Serial.println("[CAL][KH_TEST] pH e temperatura validos. Salvando calibracao...");
    _state = CAL_SAVE;
}

// =============================================================
// Persistencia
// =============================================================
bool KH_Calibrator::saveCalibrationToSPIFFS() {
    if (!SPIFFS.begin(true)) {
        Serial.println("[CAL] ERRO: SPIFFS.begin falhou");
        return false;
    }

    DynamicJsonDocument doc(768);  // Aumentado para caber tempos
    doc["kh_ref_user"]     = _kh_ref_user;
    doc["ph_ref_measured"] = _ph_ref_measured;
    doc["temp_ref"]        = _temp_ref;
    doc["mlps_b1"]         = _b1_mlps;
    doc["mlps_b2"]         = _b2_mlps;
    doc["mlps_b3"]         = _b3_mlps;
    doc["time_fill_a_ms"]  = _t_fill_a_ms;
    doc["time_fill_b_ms"]  = _t_fill_b_ms;
    doc["time_fill_c_ms"]  = _t_fill_c_ms;

    File f = SPIFFS.open(CAL_FILE, "w");
    if (!f) {
        Serial.printf("[CAL] ERRO: nao abriu %s\n", CAL_FILE);
        return false;
    }
    serializeJson(doc, f);
    f.close();

    Serial.printf("[CAL] Salvo em SPIFFS: kh=%.2f pH=%.2f temp=%.2f\n",
                  _kh_ref_user, _ph_ref_measured, _temp_ref);
    Serial.printf("[CAL]   mlps: b1=%.4f b2=%.4f b3=%.4f\n",
                  _b1_mlps, _b2_mlps, _b3_mlps);
    Serial.printf("[CAL]   tempos: A=%lu ms  B=%lu ms  C=%lu ms\n",
                  _t_fill_a_ms, _t_fill_b_ms, _t_fill_c_ms);
    return true;
}

// =============================================================
// Validacoes (sanity checks)
// =============================================================
bool KH_Calibrator::validateFlowRate(float mlps, const char* name) {
    if (mlps < MIN_FLOW_RATE || mlps > MAX_FLOW_RATE) {
        String msg = String("[CAL] Vazao ") + name + " fora do esperado: " +
                     String(mlps, 4) + " mL/s (esperado " +
                     String(MIN_FLOW_RATE) + " - " + String(MAX_FLOW_RATE) + ")";
        setError(msg);
        return false;
    }
    Serial.printf("[CAL][OK] Vazao %s: %.4f mL/s\n", name, mlps);
    return true;
}

bool KH_Calibrator::validatePHReference(float ph) {
    if (ph < MIN_PH_REF || ph > MAX_PH_REF) {
        String msg = String("[CAL] pH de referencia fora do esperado: ") +
                     String(ph, 2) + " (esperado " +
                     String(MIN_PH_REF) + " - " + String(MAX_PH_REF) + ")";
        setError(msg);
        return false;
    }
    Serial.printf("[CAL][OK] pH referencia: %.2f\n", ph);
    return true;
}

bool KH_Calibrator::validateTemperature(float temp) {
    if (temp < MIN_TEMP || temp > MAX_TEMP) {
        String msg = String("[CAL] Temperatura fora do esperado: ") +
                     String(temp, 2) + " C (esperado " +
                     String(MIN_TEMP) + " - " + String(MAX_TEMP) + " C)";
        setError(msg);
        return false;
    }
    Serial.printf("[CAL][OK] Temperatura: %.2f C\n", temp);
    return true;
}

void KH_Calibrator::setError(const String& msg) {
    _pc->stopAll();
    _result.error = msg;
    _state = CAL_ERROR;
    Serial.println(msg);
    Serial.println("[CAL] !!! CALIBRACAO ABORTADA !!!");
}

// =============================================================
// Progresso — getters para barra de progresso no frontend
// =============================================================

String KH_Calibrator::getProgressMessage() {
    switch (_state) {
        case CAL_IDLE:           return "";
        case CAL_FLUSH_START:    return "Limpeza: iniciando descarga das câmaras...";
        case CAL_FLUSH_WAIT:     return "Limpeza: aguardando câmaras estabilizarem...";
        case CAL_B1_TIMED_START: return "Bomba A (aquário→A): enchendo reservatório A (cronometrado)...";
        case CAL_B1_WAIT_A_FULL: return "Bomba A (aquário→A): aguardando sensor A ativar...";
        case CAL_B2_TIMED_START: return "Bomba B (A→B): transferência A→B iniciada (cronometrada)...";
        case CAL_B2_WAIT_B_FULL: return "Bomba B (A→B): aguardando sensor B ativar...";
        case CAL_B3_TIMED_START: return "Bomba C (B→C): transferência B→C iniciada (cronometrada)...";
        case CAL_B3_WAIT_C_FULL: return "Bomba C (B→C): aguardando sensor C ativar...";
        case CAL_DRAIN_B_START:
        case CAL_DRAIN_B_WAIT:   return "Pós-calibração: esvaziando câmara B...";
        case CAL_ENSURE_A_FULL:
        case CAL_ENSURE_A_WAIT:  return "Pós-calibração: garantindo A cheio...";
        case CAL_FILL_B_FROM_C_START:
        case CAL_FILL_B_FROM_C_WAIT:  return "Preparação ciclo KH: enchendo B de C (referência)...";
        case CAL_KH_TEST_START:
        case CAL_KH_TEST_WAIT:   return "Executando ciclo de teste de KH (Fases 1-5)...";
        case CAL_SAVE:       return "Salvando calibracao no SPIFFS...";
        case CAL_COMPLETE:   return "Calibracao concluida!";
        case CAL_ERROR:      return "ERRO: " + _result.error;
        default:             return "";
    }
}

int KH_Calibrator::getProgressPercent() {
    switch (_state) {
        case CAL_IDLE:           return -1;
        case CAL_FLUSH_START:    return 2;
        case CAL_FLUSH_WAIT:     return 8;
        case CAL_B1_TIMED_START: return 15;
        case CAL_B1_WAIT_A_FULL: return 20;
        case CAL_B2_TIMED_START: return 30;
        case CAL_B2_WAIT_B_FULL: return 35;
        case CAL_B3_TIMED_START: return 45;
        case CAL_B3_WAIT_C_FULL: return 55;
        case CAL_DRAIN_B_START:
        case CAL_DRAIN_B_WAIT:   return 60;
        case CAL_ENSURE_A_FULL:
        case CAL_ENSURE_A_WAIT:  return 65;
        case CAL_FILL_B_FROM_C_START:
        case CAL_FILL_B_FROM_C_WAIT:  return 70;
        case CAL_KH_TEST_START:  return 75;
        case CAL_KH_TEST_WAIT:   return 85;
        case CAL_SAVE:       return 98;
        case CAL_COMPLETE:   return 100;
        case CAL_ERROR:      return -1;
        default:             return 0;
    }
}

unsigned long KH_Calibrator::getCompressorRemainingMs() {
    // O compressor no Passo 5 e gerenciado pelo KH_Analyzer.
    // O frontend deve consultar KH_Analyzer::getCompressorRemainingMs()
    // durante CAL_KH_TEST_WAIT.
    return 0;
}

// =============================================================
// Carrega calibração prévia do SPIFFS
//   Usado para flush inteligente e fallback de sensores
// =============================================================
bool KH_Calibrator::loadPreviousCalibration() {
    if (!SPIFFS.begin(true)) {
        Serial.println("[CAL] SPIFFS.begin falhou - sem calibracao previa");
        return false;
    }

    if (!SPIFFS.exists(CAL_FILE)) {
        Serial.println("[CAL] Nenhuma calibracao previa encontrada");
        return false;
    }

    File f = SPIFFS.open(CAL_FILE, "r");
    if (!f) {
        Serial.println("[CAL] ERRO: nao conseguiu abrir calibracao previa");
        return false;
    }

    DynamicJsonDocument doc(768);
    DeserializationError error = deserializeJson(doc, f);
    f.close();

    if (error) {
        Serial.printf("[CAL] ERRO ao ler JSON: %s\n", error.c_str());
        return false;
    }

    // Carrega tempos para flush inteligente e fallback
    _t_fill_a_ms = doc["time_fill_a_ms"] | 0;
    _t_fill_b_ms = doc["time_fill_b_ms"] | 0;
    _t_fill_c_ms = doc["time_fill_c_ms"] | 0;

    if (_t_fill_a_ms > 0 && _t_fill_b_ms > 0 && _t_fill_c_ms > 0) {
        Serial.printf("[CAL] Calibracao previa carregada: A=%lu ms, B=%lu ms, C=%lu ms\n",
                      _t_fill_a_ms, _t_fill_b_ms, _t_fill_c_ms);
        return true;
    } else {
        Serial.println("[CAL] Calibracao previa incompleta - usando tempos fixos");
        _t_fill_a_ms = _t_fill_b_ms = _t_fill_c_ms = 0;
        return false;
    }
}
