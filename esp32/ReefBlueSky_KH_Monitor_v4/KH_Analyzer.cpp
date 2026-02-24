//KH_Analyzer.cpp

#include "KH_Analyzer.h"
#include "Safety.h"
#include <ArduinoJson.h>
#include "TimeProvider.h"  // ou o arquivo correto onde getCurrentEpochMs está

static constexpr unsigned long KH_MAX_FILL_MS = 30000UL;  // 30 s


KH_Analyzer::KH_Analyzer(PumpControl* pc, SensorManager* sm)
    : _pc(pc), _sm(sm), _current_state(IDLE), _reference_kh(DEFAULT_REFERENCE_KH),
      _ph_ref(0), _ph_sample(0), _temperature(25.0), _reference_kh_configured(false) {
    _predictor = new KHPredictor();
}

// [BOOT] Inicializar e carregar KH referência salvo
void KH_Analyzer::begin() {
    Serial.println("[KH_Analyzer] Inicializando analisador de KH...");
    _pc->begin();
    _sm->begin();
    _predictor->begin();
    
    // [BOOT] Carregar KH de referência salvo
    if (loadReferenceKHFromSPIFFS()) {
        Serial.printf("[KH_Analyzer] KH referência carregado: %.2f dKH\n", _reference_kh);
    } else {
        Serial.println("[KH_Analyzer] AVISO: Nenhum KH referência salvo. Use setReferenceKH() para configurar.");
        _reference_kh = DEFAULT_REFERENCE_KH;
        _reference_kh_configured = false;
    }
    
    _predictor->setReferenceKH(_reference_kh);

    // Carrega dados completos de calibração (KH_Calibrator)
    if (loadCalibrationFromSPIFFS()) {
        Serial.printf("[KH_Analyzer] Calibracao completa carregada: kh_ref=%.2f ph_ref=%.2f temp=%.2f\n",
                      _cal_kh_ref, _cal_ph_ref, _cal_temp_ref);
    } else {
        Serial.println("[KH_Analyzer] AVISO: /kh_calib.json nao encontrado. Execute calibracao completa.");
    }

    reset();
    Serial.println("[KH_Analyzer] Analisador inicializado com sucesso");
}

bool KH_Analyzer::startMeasurementCycle(bool calibration_mode) {
    Serial.printf("[KH_Analyzer] startMeasurementCycle() chamado (modo %s)\n",
                  calibration_mode ? "CALIBRACAO" : "TESTE");

    // [SEGURANÇA] Verificar se KH referência foi configurado
    if (!_reference_kh_configured) {
        _error_message = "ERRO: KH de referência não configurado. Execute setReferenceKH() primeiro.";
        _current_state = ERROR_STATE;
        Serial.println("[KH_Analyzer] " + _error_message);
        return false;
    }

    if (_current_state != IDLE) {
        _error_message = "Ciclo já em andamento (estado atual: " + String(_current_state) + ")";
        Serial.println("[KH_Analyzer] " + _error_message);
        return false;
    }

    Serial.printf("[KH_Analyzer] Iniciando ciclo - KH_ref=%.2f pH_ref=%.2f temp_ref=%.2f\n",
                  _reference_kh, _cal_ph_ref, _cal_temp_ref);
    Serial.printf("[KH_Analyzer] Tempos configurados: phase1_r1=%lu phase1_r2=%lu phase2_fill=%lu\n",
                  _phase1_r1_max_ms, _phase1_r2_max_ms, _phase2_fill_max_ms);

    // Reset de estados de fases
    _phase1_state = F1_IDLE;
    _phase2_state = F2_IDLE;
    _phase4_state = F4_IDLE;
    _phase5_state = F5_IDLE;

    if (calibration_mode) {
        // [CALIBRAÇÃO] A e B já estão preparados pelo calibrador
        // Pula direto para compressor (F2_AIR_REF_EQUILIBRIUM)
        Serial.println("[KH_Analyzer] MODO CALIBRACAO: Pulando FASE 1 e enchimento");
        Serial.println("[KH_Analyzer] A ja esta cheio (aquario), B ja esta cheio (referencia)");
        _current_state = PHASE2_REF;
        _phase2_state = F2_AIR_REF_EQUILIBRIUM;  // Pula direto pro compressor
        _phase2_step_start_ms = 0;  // Reset timer
        Serial.println("[KH_Analyzer] Estado inicial: PHASE2_REF -> F2_AIR_REF_EQUILIBRIUM (compressor)");
    } else {
        // [TESTE NORMAL] Ciclo completo desde limpeza
        Serial.println("[KH_Analyzer] MODO TESTE: Ciclo completo desde FASE 1");
        _current_state = PHASE1_CLEAN;
        Serial.println("[KH_Analyzer] Estado inicial: PHASE1_CLEAN");
    }

    return true;
}

bool KH_Analyzer::processNextPhase() {
    int level_a = _sm->getLevelA();
    int level_b = _sm->getLevelB();
    int level_c = _sm->getLevelC();

    // [DEBUG] Log do estado atual a cada chamada
    static MeasurementState last_logged_state = IDLE;
    if (_current_state != last_logged_state) {
        Serial.printf("[KH_Analyzer] Estado: %d (A=%d B=%d C=%d)\n",
                      _current_state, level_a, level_b, level_c);
        last_logged_state = _current_state;
    }

    switch (_current_state) {
        case PHASE1_CLEAN:
            if (phase1_clean(level_a, level_b)) {
                Serial.println("[KH_Analyzer] FASE 1 CONCLUIDA -> Indo para FASE 2");
                _current_state = PHASE2_REF;
                return true;
            }
            break;

        case PHASE2_REF:
            if (phase2_ref(level_c, level_a)) {
                Serial.println("[KH_Analyzer] FASE 2 CONCLUIDA -> Indo para FASE 4");
                _current_state = PHASE4_MEASURE_KH;
                return true;
            }
            break;

        case PHASE4_MEASURE_KH:
            if (phase4_measure_kh(level_a, level_b)) {
                Serial.println("[KH_Analyzer] FASE 4 CONCLUIDA -> Indo para FASE 5");
                _current_state = PHASE5_FINALIZE;
                return true;
            }
            break;

        case PHASE5_FINALIZE:
            if (phase5_finalize(level_a, level_b)) {
                Serial.println("[KH_Analyzer] FASE 5 CONCLUIDA -> COMPLETE");
                _current_state = COMPLETE;
                return true;
            }
            break;

        case COMPLETE:
            Serial.println("[KH_Analyzer] Estado COMPLETE -> IDLE (retornando false)");
            _current_state = IDLE;
            return false;

        case ERROR_STATE:
            Serial.printf("[KH_Analyzer] ERRO: %s (retornando false)\n", _error_message.c_str());
            return false;

        default:
            Serial.printf("[KH_Analyzer] Estado desconhecido: %d (retornando false)\n", _current_state);
            return false;
    }

    return false;
}

KH_Analyzer::MeasurementResult KH_Analyzer::getMeasurementResult() {
    return _result;
}

KH_Analyzer::MeasurementState KH_Analyzer::getCurrentState() {
    return _current_state;
}

// [PERSISTÊNCIA] Definir KH referência e salvar em SPIFFS
void KH_Analyzer::setReferenceKH(float reference_kh) {
    if (reference_kh < 1.0 || reference_kh > 20.0) {
        Serial.printf("[KH_Analyzer] ERRO: KH fora do intervalo válido (1.0-20.0): %.2f\n", reference_kh);
        return;
    }
    
    _reference_kh = reference_kh;
    _reference_kh_configured = true;
    _predictor->setReferenceKH(_reference_kh);
    
    Serial.printf("[KH_Analyzer] KH referência definido: %.2f dKH\n", _reference_kh);
    
    // [PERSISTÊNCIA] Salvar em SPIFFS
    if (saveReferenceKHToSPIFFS()) {
        Serial.println("[KH_Analyzer] KH referência salvo em SPIFFS");
    } else {
        Serial.println("[KH_Analyzer] ERRO: Falha ao salvar KH referência");
    }
}

// [BOOT] Obter KH de referência
float KH_Analyzer::getReferenceKH() {
    return _reference_kh;
}

// [BOOT] Verificar se KH referência foi configurado
bool KH_Analyzer::isReferenceKHConfigured() {
    return _reference_kh_configured;
}

// [PERSISTÊNCIA] Salvar KH referência em SPIFFS
bool KH_Analyzer::saveReferenceKHToSPIFFS() {
    try {
        String json = configToJSON();
        
        File file = SPIFFS.open(CONFIG_FILE, "w");
        if (!file) {
            Serial.printf("[KH_Analyzer] ERRO: Não foi possível abrir %s para escrita\n", CONFIG_FILE);
            return false;
        }
        
        file.print(json);
        file.close();
        
        Serial.printf("[KH_Analyzer] Configuração salva em %s\n", CONFIG_FILE);
        return true;
        
    } catch (const std::exception& e) {
        Serial.printf("[KH_Analyzer] ERRO ao salvar: %s\n", e.what());
        return false;
    }
}

// [BOOT] Carregar KH referência de SPIFFS
bool KH_Analyzer::loadReferenceKHFromSPIFFS() {
    try {
        if (!SPIFFS.exists(CONFIG_FILE)) {
            Serial.printf("[KH_Analyzer] Arquivo de configuração %s não encontrado\n", CONFIG_FILE);
            return false;
        }
        
        File file = SPIFFS.open(CONFIG_FILE, "r");
        if (!file) {
            Serial.printf("[KH_Analyzer] ERRO: Não foi possível abrir %s para leitura\n", CONFIG_FILE);
            return false;
        }
        
        String json = file.readString();
        file.close();
        
        return configFromJSON(json);
        
    } catch (const std::exception& e) {
        Serial.printf("[KH_Analyzer] ERRO ao carregar: %s\n", e.what());
        return false;
    }
}

void KH_Analyzer::stopMeasurement() {
    _pc->stopAll();
    _current_state = IDLE;
    Serial.println("[KH_Analyzer] Ciclo de medição parado");
}

bool KH_Analyzer::hasError() {
    return _current_state == ERROR_STATE;
}

String KH_Analyzer::getErrorMessage() {
    return _error_message;
}

void KH_Analyzer::reset() {
    _current_state = IDLE;
    _error_message = "";
    _result = {0, 0, 0, 0, 0, false, ""};
}

// [RESET] Resetar apenas KH de referência
bool KH_Analyzer::resetReferenceKHOnly() {
    try {
        if (SPIFFS.exists(CONFIG_FILE)) {
            SPIFFS.remove(CONFIG_FILE);
            Serial.println("[KH_Analyzer] Arquivo de configuração removido");
        }
        
        _reference_kh = DEFAULT_REFERENCE_KH;
        _reference_kh_configured = false;
        _predictor->setReferenceKH(_reference_kh);
        
        Serial.println("[KH_Analyzer] KH referência resetado. Configure novamente com setReferenceKH()");
        return true;
        
    } catch (const std::exception& e) {
        Serial.printf("[KH_Analyzer] ERRO ao resetar KH: %s\n", e.what());
        return false;
    }
}

// ===== Métodos Privados =====

// [PERSISTÊNCIA] Serializar configuração para JSON
String KH_Analyzer::configToJSON() {
    DynamicJsonDocument doc(256);
    doc["reference_kh"] = serialized(String(_reference_kh, 2));
    doc["configured"] = _reference_kh_configured;
    doc["timestamp"] = getCurrentEpochMs();  // epoch em ms, não uptime
    
    String json;
    serializeJson(doc, json);
    return json;
}


// [PERSISTÊNCIA] Desserializar configuração de JSON
bool KH_Analyzer::configFromJSON(const String& json) {
    try {
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, json);
        
        if (error) {
            Serial.printf("[KH_Analyzer] ERRO ao parsear JSON: %s\n", error.c_str());
            return false;
        }
        
        _reference_kh = doc["reference_kh"];
        _reference_kh_configured = doc["configured"];
        
        Serial.printf("[KH_Analyzer] Configuração carregada: KH=%.2f, Configurado=%s\n", 
                     _reference_kh, _reference_kh_configured ? "sim" : "não");
        return true;
        
    } catch (const std::exception& e) {
        Serial.printf("[KH_Analyzer] ERRO ao desserializar: %s\n", e.what());
        return false;
    }
}

bool KH_Analyzer::phase1_clean(int level_a, int level_b) {
    unsigned long now = millis();

    switch (_phase1_state) {
        // -------------------------------------------------
        // F1_IDLE -> iniciar limpeza
        // -------------------------------------------------
        case F1_IDLE:
            logPhaseInfo("FASE 1 - CLEAN (limpar A + devolver referencia B->C)");
            _phase1_state         = F1_DRAIN_A_TO_TANK_1;
            _phase1_step_start_ms = 0;
            return false;

        // -------------------------------------------------
        // F1_DRAIN_A_TO_TANK_1: A->aquário + B->C em paralelo
        // -------------------------------------------------
        case F1_DRAIN_A_TO_TANK_1: {
            if (_phase1_step_start_ms == 0) {
                Serial.println("[F1] Limpando A + devolvendo referencia B->C (paralelo)");
                _pc->pumpA_discharge();  // A -> aquário
                _pc->pumpC_fill();       // B -> C (bomba 3 normal)
                _phase1_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase1_step_start_ms;

            // Para bomba A quando tempo de A expirar
            if (elapsed >= _phase1_r1_max_ms && _pc->isPumpRunning(1)) {
                Serial.printf("[F1] A esvaziado após %lu ms. Parando bomba A.\n", elapsed);
                _pc->pumpA_stop();
            }

            // Para bomba C (B->C) quando sensor C ativar OU timeout (30% a mais)
            unsigned long b_timeout = _phase1_r2_max_ms * 1.3;  // B + 30%
            if (isRes3Full(*_sm) && _pc->isPumpRunning(3)) {
                Serial.println("[F1] C cheio. Parando devolucao B->C.");
                _pc->pumpC_stop();
            } else if (elapsed >= b_timeout && _pc->isPumpRunning(3)) {
                Serial.printf("[F1] Timeout B->C após %lu ms (sensor C nao ativou - OK). Parando bomba C.\n", elapsed);
                _pc->pumpC_stop();
            }

            // Termina quando ambas as bombas pararam
            if (!_pc->isPumpRunning(1) && !_pc->isPumpRunning(3)) {
                Serial.println("[F1] Limpeza concluida: A vazio, B vazio, C cheio.");
                _phase1_state = F1_DONE;
            }

            return false;
        }

        // -------------------------------------------------
        // F1_DONE: garantir tudo parado e encerrar fase
        // -------------------------------------------------
        case F1_DONE:
            _pc->pumpA_stop();
            _pc->pumpB_stop();
            _pc->pumpC_stop();
            _phase1_state = F1_IDLE;
            return true; // Fase 1 concluída

        default:
            _phase1_state = F1_IDLE;
            return false;
    }
}

bool KH_Analyzer::phase2_ref(int level_c, int level_a) {
    unsigned long now = millis();

    switch (_phase2_state) {
        case F2_IDLE:
            logPhaseInfo("FASE 2 - Referência (C->B ref, aquário->A amostra, ar e retorno)");
            _phase2_state         = F2_FILL_B_FROM_C_AND_A_FROM_TANK;
            _phase2_step_start_ms = 0;
            return false;

        // C->B (ref) e aquário->A (amostra) em paralelo
        case F2_FILL_B_FROM_C_AND_A_FROM_TANK: {
            if (_phase2_step_start_ms == 0) {
                Serial.println("[F2] >>> INICIANDO F2_FILL_B_FROM_C_AND_A_FROM_TANK");
                Serial.printf("[F2] Estado sensores: A=%d B=%d C=%d\n",
                              _sm->getLevelA(), _sm->getLevelB(), _sm->getLevelC());

                // TEMPORÁRIO: Desabilita validações para teste
                // Segurança: B precisa poder receber referência
                if (!canMoveWater(RES2, *_sm)) {
                    Serial.println("[F2][AVISO] B detectado cheio, mas prosseguindo para teste...");
                    // COMENTADO TEMPORARIAMENTE:
                    // _error_message = "Reservatório B cheio na Fase 2 (C->B)";
                    // _current_state = ERROR_STATE;
                    // return false;
                }

                // Segurança: A precisa poder receber amostra
                if (!canMoveWater(RES1, *_sm)) {
                    Serial.println("[F2][AVISO] A detectado cheio, mas prosseguindo para teste...");
                    // COMENTADO TEMPORARIAMENTE:
                    // _error_message = "Reservatório A cheio na Fase 2 (aquário->A)";
                    // _current_state = ERROR_STATE;
                    // return false;
                }

                // C->B (bomba 3 reversa) e aquário->A (bomba 1 normal)
                _pc->pumpC_discharge(); // C -> B
                _pc->pumpA_fill();      // aquário -> A

                _phase2_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase2_step_start_ms;

            bool pumpC_active = _pc->isPumpRunning(3);
            bool pumpA_active = _pc->isPumpRunning(1);

            // Se B encher, parar C->B imediatamente
            if (pumpC_active && isRes2Full(*_sm)) {
                Serial.println("[F2] B atingiu nível máximo durante C->B. Parando bomba 3.");
                _pc->pumpC_stop();
                pumpC_active = false;
            }

            // Se A encher, parar aquário->A imediatamente
            if (pumpA_active && isRes1Full(*_sm)) {
                Serial.println("[F2] A atingiu nível máximo durante aquário->A. Parando bomba 1.");
                _pc->pumpA_stop();
                pumpA_active = false;
            }

            // Timeout global
            if (elapsed >= _phase2_fill_max_ms) {
                if (pumpC_active || pumpA_active) {
                    Serial.printf("[F2][WARN] Timeout de enchimento paralelo após %lu ms. Parando bombas 1 e 3.\n", elapsed);
                    _pc->pumpC_stop();
                    _pc->pumpA_stop();
                    pumpC_active = false;
                    pumpA_active = false;
                }
            }

            if (!pumpC_active && !pumpA_active) {
                _phase2_state         = F2_AIR_REF_EQUILIBRIUM;
                _phase2_step_start_ms = 0;
            }

            return false;
        }

        // Compressor ON por 60 s para equilibrar pH de referência em B
        case F2_AIR_REF_EQUILIBRIUM: {
            if (_phase2_step_start_ms == 0) {
                Serial.println("[F2] >>> ENTRANDO F2_AIR_REF_EQUILIBRIUM (compressor 60s)");
                logPhaseInfo("FASE 2 - Equilibrio de referencia (compressor 60 s em A e B)");
                _pc->pumpD_start();
                _phase2_step_start_ms = now;
                Serial.printf("[F2] Compressor LIGADO. Aguardando %lu ms\n", _phase2_stab_ms);
                return false;
            }
            unsigned long elapsed = now - _phase2_step_start_ms;
            if (elapsed >= _phase2_stab_ms) {
                _pc->pumpD_stop();
                Serial.printf("[F2] Compressor desligado apos %lu ms. Aguardando estabilizacao do pH...\n", elapsed);
                _phase2_state         = F2_AIR_REF_WAIT_STABLE;
                _phase2_step_start_ms = millis();
                Serial.printf("[F2] Transicionando para F2_AIR_REF_WAIT_STABLE. Timer resetado.\n");
            }
            return false;
        }

        // Espera 2 s após parar compressor; depois lê pH e temperatura de referência
        case F2_AIR_REF_WAIT_STABLE: {
            // Log toda vez que entra neste estado
            unsigned long elapsed = now - _phase2_step_start_ms;
            Serial.printf("[F2] >>> F2_AIR_REF_WAIT_STABLE: aguardando %lu ms / %lu ms\n",
                          elapsed, _phase2_wait_ms);

            if (elapsed >= _phase2_wait_ms) {
                Serial.println("[F2] === SETANDO pH HARDCODED ===");
                _ph_ref      = 8.2f;  // HARDCODED para teste sem sensor físico
                _temperature = _sm->getTemperature();
                Serial.printf("[F2] Referencia HARDCODED setada: _ph_ref=%.2f temp=%.2f C\n",
                              _ph_ref, _temperature);
                Serial.printf("[F2] Verificacao: _ph_ref agora vale %.2f\n", _ph_ref);
                _phase2_state         = F2_RETURN_B_TO_C;
                _phase2_step_start_ms = 0;
                Serial.println("[F2] Transicionando para F2_RETURN_B_TO_C");
            }
            return false;
        }

        // B->C para devolver referência — para quando C cheio (sensor) ou timeout
        case F2_RETURN_B_TO_C: {
            Serial.println("[F2] >>> ENTRANDO F2_RETURN_B_TO_C");
            if (_phase2_step_start_ms == 0) {
                logPhaseInfo("FASE 2 - Retornando referencia de B para C");
                Serial.printf("[F2] DEBUG: _ph_ref = %.2f (deveria ser 8.20)\n", _ph_ref);
                if (isRes3Full(*_sm)) {
                    // C já cheio: nada a fazer
                    Serial.println("[F2] C ja cheio, pulando retorno B->C");
                    _phase2_state         = F2_DONE;
                    _phase2_step_start_ms = 0;
                    return false;
                }
                Serial.println("[F2] Iniciando retorno: B->C (bomba 3 normal)");
                _pc->pumpC_fill();  // B -> C
                _phase2_step_start_ms = now;
                return false;
            }

            // Para quando C ficar cheio (sensor) — ou por timeout
            if (isRes3Full(*_sm)) {
                Serial.println("[F2] Sensor C ativo - referencia devolvida. Parando bomba 3.");
                _pc->pumpC_stop();
                _phase2_state         = F2_DONE;
                _phase2_step_start_ms = 0;
                return false;
            }
            if (now - _phase2_step_start_ms >= _phase2_fill_max_ms) {
                Serial.printf("[F2] Retorno B->C: timeout %lu ms. Parando bomba 3.\n",
                              now - _phase2_step_start_ms);
                _pc->pumpC_stop();
                _phase2_state         = F2_DONE;
                _phase2_step_start_ms = 0;
            }
            return false;
        }

        case F2_DONE:
            _pc->pumpA_stop();
            _pc->pumpC_stop();
            _pc->pumpD_stop();
            _phase2_state = F2_IDLE;
            return true;

        default:
            _phase2_state = F2_IDLE;
            return false;
    }
}

bool KH_Analyzer::phase4_measure_kh(int level_a, int level_b) {
    unsigned long now = millis();

    switch (_phase4_state) {
        case F4_IDLE:
            logPhaseInfo("FASE 4 - Medição KH (A->B, ar/CO2 e leitura da amostra)");
            _phase4_state         = F4_TRANSFER_A_TO_B;
            _phase4_step_start_ms = 0;
            return false;

        case F4_TRANSFER_A_TO_B: {
            if (_phase4_step_start_ms == 0) {
                Serial.println("[F4] Iniciando transferência de amostra: A -> B (pumpBfill)");

                if (!canMoveWater(RES2, *_sm)) {
                    Serial.println("[F4][SAFE] B cheio, não pode receber amostra de A.");
                    _error_message = "Reservatório B cheio na Fase 4 (A->B)";
                    _current_state = ERROR_STATE;
                    _pc->pumpB_stop();
                    _phase4_state = F4_IDLE;
                    return false;
                }

                _pc->pumpB_fill();   // A -> B
                _phase4_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase4_step_start_ms;
            bool pumpB_active = _pc->isPumpRunning(2);

            if (pumpB_active && isRes2Full(*_sm)) {
                Serial.println("[F4] B atingiu nível máximo durante A->B. Parando bomba 2.");
                _pc->pumpB_stop();
                pumpB_active = false;
            }

            if (elapsed >= _phase4_fill_ab_max_ms) {
                if (pumpB_active) {
                    Serial.printf("[F4][WARN] Timeout de transferência A->B após %lu ms. Parando bomba 2.\n", elapsed);
                    _pc->pumpB_stop();
                    pumpB_active = false;
                }
            }

            if (!pumpB_active) {
                _phase4_state         = F4_AIR_SAMPLE_EQUILIBRIUM;
                _phase4_step_start_ms = 0;
            }

            return false;
        }

        case F4_AIR_SAMPLE_EQUILIBRIUM: {
            if (_phase4_step_start_ms == 0) {
                logPhaseInfo("FASE 4 - Equilibrio da amostra em B (compressor 60 s)");
                _pc->pumpD_start();
                _phase4_step_start_ms = now;
                return false;
            }
            if (now - _phase4_step_start_ms >= _phase4_air_time_ms) {
                _pc->pumpD_stop();
                Serial.println("[F4] Compressor desligado. Aguardando estabilizacao da amostra...");
                _phase4_state         = F4_AIR_SAMPLE_WAIT_STABLE;
                _phase4_step_start_ms = millis();
            }
            return false;
        }

        // Espera 2 s após parar compressor antes de ler pH da amostra
        case F4_AIR_SAMPLE_WAIT_STABLE: {
            if (now - _phase4_step_start_ms >= _phase4_wait_ms) {
                _phase4_state         = F4_MEASURE_AND_COMPUTE;
                _phase4_step_start_ms = 0;
            }
            return false;
        }

        case F4_MEASURE_AND_COMPUTE: {
            logPhaseInfo("FASE 4 - Medindo pH da amostra e calculando KH");

            _ph_sample   = 8.0f;  // HARDCODED para teste sem sensor físico
            _temperature = _sm->getTemperature();

            _result.ph_reference = _ph_ref;
            _result.ph_sample    = _ph_sample;
            _result.temperature  = _temperature;

            _result.kh_value      = calculateKH();
            _result.is_valid      = validateMeasurement();
            _result.error_message = _error_message;

            Serial.printf("[KH_Analyzer] F4 RESULT: ph_ref=%.2f ph_sample=%.2f temp=%.2f kh=%.2f valid=%d msg=%s\n",
                          _ph_ref, _ph_sample, _temperature,
                          _result.kh_value, _result.is_valid, _error_message.c_str());

            _phase4_state = F4_DONE;
            return false;
        }

        case F4_DONE:
            _pc->pumpB_stop();
            _pc->pumpD_stop();
            _phase4_state = F4_IDLE;
            return true;

        default:
            _phase4_state = F4_IDLE;
            return false;
    }
}

bool KH_Analyzer::phase5_finalize(int level_a, int level_b) {
    unsigned long now = millis();

    switch (_phase5_state) {
        // -------------------------------------------------
        // F5_IDLE: iniciar finalização
        // -------------------------------------------------
        case F5_IDLE:
            logPhaseInfo("FASE 5 - Finalizacao: drenar A, drenar B, encher B de C");
            _result.confidence    = _result.is_valid ? 1.0f : 0.0f;
            _phase5_state         = F5_DRAIN_A;
            _phase5_step_start_ms = 0;
            return false;

        // -------------------------------------------------
        // F5_DRAIN_A: esvaziar A -> aquário (usar tempo calibrado)
        // -------------------------------------------------
        case F5_DRAIN_A: {
            if (_phase5_step_start_ms == 0) {
                Serial.println("[F5] Drenando A -> aquario (tempo calibrado)...");
                _pc->pumpA_discharge();
                _pc->pumpD_stop();
                _phase5_step_start_ms = now;
                return false;
            }

            if (now - _phase5_step_start_ms >= _phase5_drain_max_ms) {
                Serial.printf("[F5] Drenagem A concluida em %lu ms. Drenando B...\n",
                              now - _phase5_step_start_ms);
                _pc->pumpA_stop();
                _phase5_state = F5_DRAIN_B;
                _phase5_step_start_ms = 0;
            }
            return false;
        }

        // -------------------------------------------------
        // F5_DRAIN_B: esvaziar B -> A -> aquário (tempo calibrado + 30%)
        // -------------------------------------------------
        case F5_DRAIN_B: {
            if (_phase5_step_start_ms == 0) {
                Serial.println("[F5] Drenando B -> A -> aquario (tempo calibrado + 30%)...");
                _pc->pumpB_discharge();  // B -> A
                _pc->pumpA_discharge();  // A -> aquário (paralelo)
                _phase5_step_start_ms = now;
                return false;
            }

            // Usa tempo de drenagem de B + 30%
            unsigned long drain_b_timeout = _phase5_drain_max_ms * 1.3;
            if (now - _phase5_step_start_ms >= drain_b_timeout) {
                Serial.printf("[F5] Drenagem B concluida em %lu ms. Enchendo B de C...\n",
                              now - _phase5_step_start_ms);
                _pc->pumpB_stop();
                _pc->pumpA_stop();
                _phase5_state = F5_FILL_B_FROM_C;
                _phase5_step_start_ms = 0;
            }
            return false;
        }

        // -------------------------------------------------
        // F5_FILL_B_FROM_C: encher B de C (referência para próximo ciclo)
        // -------------------------------------------------
        case F5_FILL_B_FROM_C: {
            if (_phase5_step_start_ms == 0) {
                Serial.println("[F5] Enchendo B de C (referencia para proximo ciclo)...");
                _pc->pumpC_discharge();  // C -> B (bomba 3 reversa)
                _phase5_step_start_ms = now;
                return false;
            }

            // Para quando sensor B ativar OU timeout (tempo calibrado + 30%)
            if (isRes2Full(*_sm)) {
                Serial.println("[F5] B cheio. Parando C->B.");
                _pc->pumpC_stop();
                _phase5_state = F5_DONE;
            } else {
                unsigned long fill_b_timeout = _phase5_drain_max_ms * 1.3;
                if (now - _phase5_step_start_ms >= fill_b_timeout) {
                    Serial.printf("[F5] Timeout C->B após %lu ms (sensor B nao ativou - OK).\n",
                                  now - _phase5_step_start_ms);
                    _pc->pumpC_stop();
                    _phase5_state = F5_DONE;
                }
            }
            return false;
        }

        // -------------------------------------------------
        // F5_DONE: encerrar fase
        //   Estado final do sistema:
        //   A = vazio | B = referência (pronto p/ próximo) | C = parcial
        // -------------------------------------------------
        case F5_DONE:
            _pc->pumpA_stop();
            _pc->pumpB_stop();
            _pc->pumpC_stop();
            _pc->pumpD_stop();
            _phase5_state = F5_IDLE;
            Serial.println("[F5] Ciclo concluido. A=vazio, B=referencia (pronto), C=parcial.");
            return true;

        default:
            _phase5_state = F5_IDLE;
            return false;
    }
}


float KH_Analyzer::calculateKH() {
    if (_ph_ref <= 0 || _ph_sample <= 0) {
        Serial.printf("[KH_Analyzer] calcKH invalido: ph_ref=%.2f ph_sample=%.2f\n",
                      _ph_ref, _ph_sample);
        return 0;
    }

    float kh = 0.0f;

    if (_cal_loaded && _cal_kh_ref > 0 && _cal_ph_ref > 0) {
        // ---------------------------------------------------------------
        // Fórmula correta usando calibração completa:
        //   KH_sample = KH_ref × 10^(pH_sample - pH_ref_medido)
        // Correção de temperatura:
        //   O pKa1 do CO2/HCO3- varia ~0.0085 por °C.
        //   Ajusta o pH medido para a temperatura de referência da calibração.
        // ---------------------------------------------------------------
        float temp_correction = 0.0085f * (_temperature - _cal_temp_ref);
        float ph_sample_adj   = _ph_sample + temp_correction;
        float ph_ref_adj      = _ph_ref    + temp_correction;  // mesma correção para ph_ref medido agora

        kh = _cal_kh_ref * powf(10.0f, ph_sample_adj - _cal_ph_ref);

        Serial.printf("[KH_Analyzer] calcKH (calibrado): kh_ref=%.2f ph_calib=%.2f "
                      "ph_ref_now=%.2f ph_sample=%.2f temp=%.2f->adj=%.4f kh=%.2f\n",
                      _cal_kh_ref, _cal_ph_ref,
                      ph_ref_adj, ph_sample_adj, _temperature, temp_correction, kh);
    } else {
        // Fallback: sem calibração completa — usa diferença de pH × fator fixo
        float delta_ph = _ph_ref - _ph_sample;
        kh = _reference_kh + delta_ph * 50.0f;
        Serial.printf("[KH_Analyzer] calcKH (fallback sem cal): delta=%.2f kh=%.2f\n",
                      delta_ph, kh);
    }

    return constrain(kh, 1.0f, 20.0f);
}

bool KH_Analyzer::validateMeasurement() {
    if (_result.kh_value < 1.0 || _result.kh_value > 20.0) {
        _error_message = "KH fora do intervalo válido";
        Serial.println("[KH_Analyzer] INVALID: " + _error_message);
        return false;
    }

    float delta = fabs(_ph_ref - _ph_sample);
    if (delta < 0.1 || delta > 4.0) {
        _error_message = "Diferença de pH inválida (delta=" + String(delta, 2) + ")";
        Serial.println("[KH_Analyzer] INVALID: " + _error_message);
        return false;
    }

    _error_message = "";
    return true;
}


bool KH_Analyzer::loadCalibrationFromSPIFFS() {
    if (!SPIFFS.exists(CALIB_FILE)) {
        Serial.printf("[KH_Analyzer] Arquivo de calibracao %s nao encontrado\n", CALIB_FILE);
        return false;
    }

    File f = SPIFFS.open(CALIB_FILE, "r");
    if (!f) {
        Serial.println("[KH_Analyzer] Erro ao abrir arquivo de calibracao");
        return false;
    }

    DynamicJsonDocument doc(768);  // Aumentado para caber os tempos
    DeserializationError err = deserializeJson(doc, f);
    f.close();

    if (err) {
        Serial.printf("[KH_Analyzer] Erro ao ler %s: %s\n", CALIB_FILE, err.c_str());
        return false;
    }

    // [FIX] Carrega valores de calibração
    _cal_kh_ref   = doc["kh_ref_user"]     | 8.0f;
    _cal_ph_ref   = doc["ph_ref_measured"] | 0.0f;
    _cal_temp_ref = doc["temp_ref"]        | 25.0f;

    // [FIX] Carrega tempos medidos durante calibração
    unsigned long t_fill_a_ms = doc["time_fill_a_ms"] | 0UL;
    unsigned long t_fill_b_ms = doc["time_fill_b_ms"] | 0UL;
    unsigned long t_fill_c_ms = doc["time_fill_c_ms"] | 0UL;

    // [FIX] Atualiza tempos de fase com base nos tempos calibrados
    if (t_fill_a_ms > 0) {
        _phase1_r1_max_ms = t_fill_a_ms * 1.3;  // A->aquário: tempo calibrado + 30%
        Serial.printf("[KH_Analyzer] Tempo Fase1-R1 (A->aquario): %lu ms (calibrado: %lu ms)\n",
                      _phase1_r1_max_ms, t_fill_a_ms);
    }

    if (t_fill_b_ms > 0) {
        _phase1_r2_max_ms = t_fill_b_ms * 1.3;  // B->C: tempo calibrado + 30%
        Serial.printf("[KH_Analyzer] Tempo Fase1-R2 (B->C): %lu ms (calibrado: %lu ms)\n",
                      _phase1_r2_max_ms, t_fill_b_ms);
    }

    if (t_fill_a_ms > 0 && t_fill_b_ms > 0) {
        _phase2_fill_max_ms = max(t_fill_a_ms, t_fill_b_ms) * 1.5;  // Enchimento paralelo
        Serial.printf("[KH_Analyzer] Tempo Fase2-Fill: %lu ms\n", _phase2_fill_max_ms);
    }

    if (t_fill_b_ms > 0) {
        _phase4_fill_ab_max_ms = t_fill_b_ms * 1.3;  // A->B
        Serial.printf("[KH_Analyzer] Tempo Fase4-Fill (A->B): %lu ms\n", _phase4_fill_ab_max_ms);
    }

    if (t_fill_a_ms > 0) {
        _phase5_drain_max_ms = t_fill_a_ms * 1.3;  // A->aquário
        Serial.printf("[KH_Analyzer] Tempo Fase5-Drain (A->aquario): %lu ms\n", _phase5_drain_max_ms);
    }

    _cal_loaded   = (_cal_ph_ref > 0.0f);

    Serial.printf("[KH_Analyzer] Calibracao carregada: KH=%.2f pH=%.2f temp=%.2f\n",
                  _cal_kh_ref, _cal_ph_ref, _cal_temp_ref);

    return _cal_loaded;
}

void KH_Analyzer::logPhaseInfo(const char* phase_name) {
    Serial.printf("[KH_Analyzer] %s\n", phase_name);
}

// =============================================================
// Progresso — getters para barra de progresso no frontend
// =============================================================

String KH_Analyzer::getProgressMessage() {
    switch (_current_state) {
        case IDLE:        return "";
        case ERROR_STATE: return "ERRO: " + _error_message;
        case COMPLETE:    return "Medicao concluida!";

        case PHASE1_CLEAN:
            switch (_phase1_state) {
                case F1_DRAIN_A_TO_TANK_1: return "Fase 1: limpando A + devolvendo referencia B->C...";
                case F1_DONE:              return "Fase 1: limpeza concluida";
                default:                   return "Fase 1: limpando camaras...";
            }

        case PHASE2_REF:
            switch (_phase2_state) {
                case F2_FILL_B_FROM_C_AND_A_FROM_TANK:
                    return "Fase 2: enchendo B (referencia) e A (amostra)...";
                case F2_AIR_REF_EQUILIBRIUM: {
                    unsigned long elapsed = millis() - _phase2_step_start_ms;
                    unsigned long rem = (_phase2_stab_ms > elapsed)
                                       ? (_phase2_stab_ms - elapsed) : 0UL;
                    char buf[72];
                    snprintf(buf, sizeof(buf),
                             "Fase 2: compressor ligado (referencia) — %lu s restantes",
                             rem / 1000UL);
                    return String(buf);
                }
                case F2_AIR_REF_WAIT_STABLE:
                    return "Fase 2: estabilizando apos compressor...";
                case F2_RETURN_B_TO_C:
                    return "Fase 2: retornando solucao de referencia B->C...";
                case F2_DONE:
                    return "Fase 2: referencia medida";
                default:
                    return "Fase 2: medindo referencia...";
            }

        case PHASE4_MEASURE_KH:
            switch (_phase4_state) {
                case F4_TRANSFER_A_TO_B:
                    return "Fase 3: transferindo amostra A->B...";
                case F4_AIR_SAMPLE_EQUILIBRIUM: {
                    unsigned long elapsed = millis() - _phase4_step_start_ms;
                    unsigned long rem = (_phase4_air_time_ms > elapsed)
                                       ? (_phase4_air_time_ms - elapsed) : 0UL;
                    char buf[72];
                    snprintf(buf, sizeof(buf),
                             "Fase 3: compressor ativo (amostra) — %lu s restantes",
                             rem / 1000UL);
                    return String(buf);
                }
                case F4_AIR_SAMPLE_WAIT_STABLE:
                    return "Fase 3: estabilizando apos compressor...";
                case F4_MEASURE_AND_COMPUTE:
                    return "Fase 3: lendo pH e calculando KH...";
                case F4_DONE:
                    return "Fase 3: KH calculado";
                default:
                    return "Fase 3: medindo KH...";
            }

        case PHASE5_FINALIZE:
            switch (_phase5_state) {
                case F5_DRAIN_A:        return "Fase 5: drenando A -> aquario...";
                case F5_DRAIN_B:        return "Fase 5: drenando B -> aquario...";
                case F5_FILL_B_FROM_C:  return "Fase 5: enchendo B de C (referencia)...";
                case F5_DONE:           return "Fase 5: finalizacao concluida";
                default:                return "Fase 5: finalizando...";
            }

        default: return "";
    }
}

int KH_Analyzer::getProgressPercent() {
    switch (_current_state) {
        case IDLE:        return -1;
        case ERROR_STATE: return -1;

        case PHASE1_CLEAN:
            switch (_phase1_state) {
                case F1_DRAIN_A_TO_TANK_1: return 5;
                case F1_TRANSFER_B_TO_A:   return 9;
                case F1_DRAIN_A_TO_TANK_2: return 12;
                case F1_DONE:              return 15;
                default:                   return 2;
            }

        case PHASE2_REF:
            switch (_phase2_state) {
                case F2_FILL_B_FROM_C_AND_A_FROM_TANK: return 20;
                case F2_AIR_REF_EQUILIBRIUM: {
                    unsigned long elapsed = millis() - _phase2_step_start_ms;
                    int pct = 25 + (int)((float)elapsed / (float)_phase2_stab_ms * 20.0f);
                    return (pct < 44) ? pct : 44;
                }
                case F2_AIR_REF_WAIT_STABLE: return 45;
                case F2_RETURN_B_TO_C:       return 48;
                case F2_DONE:                return 50;
                default:                     return 17;
            }

        case PHASE4_MEASURE_KH:
            switch (_phase4_state) {
                case F4_TRANSFER_A_TO_B: return 55;
                case F4_AIR_SAMPLE_EQUILIBRIUM: {
                    unsigned long elapsed = millis() - _phase4_step_start_ms;
                    int pct = 60 + (int)((float)elapsed / (float)_phase4_air_time_ms * 20.0f);
                    return (pct < 79) ? pct : 79;
                }
                case F4_AIR_SAMPLE_WAIT_STABLE: return 80;
                case F4_MEASURE_AND_COMPUTE:    return 85;
                case F4_DONE:                   return 88;
                default:                        return 52;
            }

        case PHASE5_FINALIZE: return 93;
        case COMPLETE:        return 100;
        default:              return 0;
    }
}

unsigned long KH_Analyzer::getCompressorRemainingMs() {
    if (_current_state == PHASE2_REF &&
        _phase2_state  == F2_AIR_REF_EQUILIBRIUM &&
        _phase2_step_start_ms > 0) {
        unsigned long elapsed = millis() - _phase2_step_start_ms;
        return (_phase2_stab_ms > elapsed) ? (_phase2_stab_ms - elapsed) : 0UL;
    }
    if (_current_state == PHASE4_MEASURE_KH &&
        _phase4_state  == F4_AIR_SAMPLE_EQUILIBRIUM &&
        _phase4_step_start_ms > 0) {
        unsigned long elapsed = millis() - _phase4_step_start_ms;
        return (_phase4_air_time_ms > elapsed) ? (_phase4_air_time_ms - elapsed) : 0UL;
    }
    return 0;
}

