//KH_Analyzer.cpp

#include "KH_Analyzer.h"
#include "Safety.h"
#include <ArduinoJson.h>
#include "TimeProvider.h"  // ou o arquivo correto onde getCurrentEpochMs está

// [SIMULAÇÃO] Declarações externas para modo teste
extern void registerPumpActivation(int pumpIndex, bool forward);
extern void registerPumpDeactivation(int pumpIndex);
extern bool testModeEnabled;

// [SIMULAÇÃO] Macros helper para registro de bombas (apenas em modo teste)
#define SIM_PUMP_A_FILL() if(testModeEnabled) registerPumpActivation(0, true)
#define SIM_PUMP_A_DISCHARGE() if(testModeEnabled) registerPumpActivation(0, false)
#define SIM_PUMP_A_STOP() if(testModeEnabled) registerPumpDeactivation(0)
#define SIM_PUMP_B_FILL() if(testModeEnabled) registerPumpActivation(1, true)
#define SIM_PUMP_B_DISCHARGE() if(testModeEnabled) registerPumpActivation(1, false)
#define SIM_PUMP_B_STOP() if(testModeEnabled) registerPumpDeactivation(1)
#define SIM_PUMP_C_FILL() if(testModeEnabled) registerPumpActivation(2, true)
#define SIM_PUMP_C_DISCHARGE() if(testModeEnabled) registerPumpActivation(2, false)
#define SIM_PUMP_C_STOP() if(testModeEnabled) registerPumpDeactivation(2)

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
    reset();
    Serial.println("[KH_Analyzer] Analisador inicializado com sucesso");
}

bool KH_Analyzer::startMeasurementCycle() {
    // [SEGURANÇA] Verificar se KH referência foi configurado
    if (!_reference_kh_configured) {
        _error_message = "ERRO: KH de referência não configurado. Execute setReferenceKH() primeiro.";
        _current_state = ERROR_STATE;
        Serial.println("[KH_Analyzer] " + _error_message);
        return false;
    }
    
    if (_current_state != IDLE) {
        _error_message = "Ciclo já em andamento";
        return false;
    }

    Serial.println("[KH_Analyzer] Iniciando ciclo de medição");
    _current_state = PHASE1_CLEAN;
    return true;
}

bool KH_Analyzer::processNextPhase() {
    int level_a = _sm->getLevelA();
    int level_b = _sm->getLevelB();
    int level_c = _sm->getLevelC();

    switch (_current_state) {
        case PHASE1_CLEAN:
            if (phase1_clean(level_a, level_b)) {
                _current_state = PHASE2_REF;
                return true;
            }
            break;

        case PHASE2_REF:
            if (phase2_ref(level_c, level_a)) {
                _current_state = PHASE4_MEASURE_KH;
                return true;
            }
            break;

        case PHASE4_MEASURE_KH:
            if (phase4_measure_kh(level_a, level_b)) {
                _current_state = PHASE5_FINALIZE;
                return true;
            }
            break;

        case PHASE5_FINALIZE:
            if (phase5_finalize(level_a, level_b)) {
                _current_state = COMPLETE;
                return true;
            }
            break;

        case COMPLETE:
            _current_state = IDLE;
            return false;

        default:
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
            logPhaseInfo("FASE 1 - CLEAN (limpeza inicial A/B)");
            _phase1_state         = F1_DRAIN_A_TO_TANK_1;
            _phase1_step_start_ms = 0;
            return false; // fase ainda em andamento

        // -------------------------------------------------
        // F1_DRAIN_A_TO_TANK_1: esvaziar A -> aquário (primeira limpeza)
        // -------------------------------------------------
        case F1_DRAIN_A_TO_TANK_1: {
            if (_phase1_step_start_ms == 0) {
                Serial.println("[F1] Iniciando descarte inicial: A -> aquário (pumpA_discharge)");
                _pc->pumpA_discharge();         // A -> aquário
                SIM_PUMP_A_DISCHARGE();         // [SIMULAÇÃO]
                _phase1_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase1_step_start_ms;

            // Aqui não precisamos checar "A cheio", estamos esvaziando
            if (elapsed >= _phase1_r1_max_ms) {
                Serial.printf("[F1] Descarte inicial A->aquário concluído após %lu ms. Parando bomba A.\n", elapsed);
                _pc->pumpA_stop();
                SIM_PUMP_A_STOP();  // [SIMULAÇÃO]
                _phase1_state         = F1_TRANSFER_B_TO_A;
                _phase1_step_start_ms = 0;
            }

            return false;
        }

        // -------------------------------------------------
        // F1_TRANSFER_B_TO_A: B -> A com A drenando para aquário
        // -------------------------------------------------
        case F1_TRANSFER_B_TO_A: {
            if (_phase1_step_start_ms == 0) {
                Serial.println("[F1] Iniciando transferência: B -> A (pumpB_discharge) com A drenando para aquário (pumpA_discharge)");

                // Segurança: A precisa poder receber (não estar em nível máximo "travado")
                if (!canMoveWater(RES1, *_sm)) {
                    Serial.println("[F1][SAFE] A cheio, não pode receber de B.");
                    _error_message = "Reservatório A cheio na Fase 1 (B->A)";
                    _current_state = ERROR_STATE;
                    _pc->pumpA_stop();
                    _pc->pumpB_stop();
                    _phase1_state = F1_IDLE;
                    return false;
                }

                // Liga B -> A e A -> aquário em paralelo
                _pc->pumpB_discharge();
                _pc->pumpA_discharge();

                _phase1_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase1_step_start_ms;

            // Se A atingir nível máximo, alivia A parando B e deixando A escoar
            if (isRes1Full(*_sm)) {
                Serial.println("[F1][ALERT] A atingiu nível máximo durante B->A. Parando bomba B para aliviar em A.");
                _pc->pumpB_stop();

                // Mantém A drenando até sair do máximo ou até um pequeno timeout extra
                static const unsigned long RELIEF_TIMEOUT_MS = 3000; // ajuste fino depois
                unsigned long reliefStart = millis();
                while (isRes1Full(*_sm) && (millis() - reliefStart) < RELIEF_TIMEOUT_MS) {
                    // só espera drenagem, sem bloqueios longos no futuro (pode ser refatorado para não-blocking)
                    delay(10);
                }

                if (isRes1Full(*_sm)) {
                    // Mesmo após alívio, ainda cheio -> erro de segurança
                    Serial.println("[F1][ERROR] A permanece em nível máximo após tentativa de alívio. Abortando Fase 1.");
                    _pc->pumpA_stop();
                    _error_message = "A permaneceu cheio na Fase 1 (B->A), possível falha de drenagem.";
                    _current_state = ERROR_STATE;
                    _phase1_state  = F1_IDLE;
                    return false;
                }

                Serial.println("[F1] A abaixo do nível máximo, retomando B->A.");
                _pc->pumpB_discharge();
            }

            // Se tempo máximo de transferência B->A for atingido, consideramos B esvaziado
            if (elapsed >= _phase1_r2_max_ms) {
                Serial.printf("[F1] Transferência B->A concluída após %lu ms. Parando bomba B.\n", elapsed);
                _pc->pumpB_stop();

                // Mantém A drenando mais um pouco se quiser (opcional)
                // Aqui vamos simplesmente avançar para a drenagem final de A
                _phase1_state         = F1_DRAIN_A_TO_TANK_2;
                _phase1_step_start_ms = 0;
            }

            return false;
        }

        // -------------------------------------------------
        // F1_DRAIN_A_TO_TANK_2: limpeza final A -> aquário
        // -------------------------------------------------
        case F1_DRAIN_A_TO_TANK_2: {
            if (_phase1_step_start_ms == 0) {
                Serial.println("[F1] Limpeza final: A -> aquário (pumpA_discharge)");
                _pc->pumpA_discharge();
                _phase1_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase1_step_start_ms;

            if (elapsed >= _phase1_r1_max_ms) {
                Serial.printf("[F1] Limpeza final A->aquário concluída após %lu ms. Parando bomba A.\n", elapsed);
                _pc->pumpA_stop();
                _phase1_state = F1_DONE;
                return false; // deixa cair em F1_DONE no próximo ciclo
            }

            return false;
        }

        // -------------------------------------------------
        // F1_DONE: garantir tudo parado e encerrar fase
        // -------------------------------------------------
        case F1_DONE:
            _pc->pumpA_stop();
            _pc->pumpB_stop();
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
                Serial.println("[F2] Iniciando enchimento paralelo: C->B (ref) e aquário->A (amostra)");

                // Segurança: B precisa poder receber referência
                if (!canMoveWater(RES2, *_sm)) {
                    Serial.println("[F2][SAFE] B cheio, não pode receber referência de C.");
                    _error_message = "Reservatório B cheio na Fase 2 (C->B)";
                    _current_state = ERROR_STATE;
                    _pc->pumpC_stop();
                    _pc->pumpA_stop();
                    _phase2_state = F2_IDLE;
                    return false;
                }

                // Segurança: A precisa poder receber amostra
                if (!canMoveWater(RES1, *_sm)) {
                    Serial.println("[F2][SAFE] A cheio, não pode receber amostra do aquário.");
                    _error_message = "Reservatório A cheio na Fase 2 (aquário->A)";
                    _current_state = ERROR_STATE;
                    _pc->pumpC_stop();
                    _pc->pumpA_stop();
                    _phase2_state = F2_IDLE;
                    return false;
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

        // Ar em A/B, medir ph_ref e temperatura em B
        case F2_AIR_REF_EQUILIBRIUM: {
            if (_phase2_step_start_ms == 0) {
                logPhaseInfo("FASE 2 - Equilíbrio de referência (ar em A e B)");
                Serial.println("[F2] Ligando compressor para equilibrar pH de referência em B.");
                _pc->pumpD_start();
                _phase2_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase2_step_start_ms;

            if (elapsed >= _phase2_stab_ms) {
                _pc->pumpD_stop();

                _ph_ref      = _sm->getPH();
                _temperature = _sm->getTemperature();

                Serial.printf("[F2] Referência equilibrada. ph_ref=%.2f temp=%.2f\n",
                              _ph_ref, _temperature);

                _phase2_state         = F2_RETURN_B_TO_C;
                _phase2_step_start_ms = 0;
            }

            return false;
        }

        // B->C para devolver referência
        case F2_RETURN_B_TO_C: {
            if (_phase2_step_start_ms == 0) {
                logPhaseInfo("FASE 2 - Retornando referência de B para C");
                Serial.println("[F2] Iniciando retorno: B -> C (pumpCfill)");

                if (!canMoveWater(RES3, *_sm)) {
                    Serial.println("[F2][SAFE] C cheio, não pode receber de B.");
                    _error_message = "Reservatório C cheio na Fase 2 (B->C)";
                    _current_state = ERROR_STATE;
                    _pc->pumpC_stop();
                    _phase2_state = F2_IDLE;
                    return false;
                }

                _pc->pumpC_fill(); // B -> C
                _phase2_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase2_step_start_ms;

            // Por enquanto, só timeout para esvaziar B o suficiente
            if (elapsed >= _phase2_fill_max_ms) {
                Serial.printf("[F2] Retorno B->C concluído por timeout após %lu ms. Parando bomba 3.\n", elapsed);
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
                logPhaseInfo("FASE 4 - Equilíbrio da amostra em B (ar/CO2)");
                Serial.println("[F4] Ligando compressor para equilibrar pH da amostra em B.");
                _pc->pumpD_start();
                _phase4_step_start_ms = now;
                return false;
            }

            unsigned long elapsed = now - _phase4_step_start_ms;

            if (elapsed >= _phase4_air_time_ms) {
                _pc->pumpD_stop();
                Serial.printf("[F4] Equilíbrio da amostra concluído após %lu ms. Desligando compressor.\n", elapsed);

                _phase4_state         = F4_MEASURE_AND_COMPUTE;
                _phase4_step_start_ms = 0;
            }

            return false;
        }

        case F4_MEASURE_AND_COMPUTE: {
            logPhaseInfo("FASE 4 - Medindo pH da amostra e calculando KH");

            _ph_sample   = _sm->getPH();         // sensor em B
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
    logPhaseInfo("FASE 5 - Finalização do ciclo (shutdown + bookkeeping)");
    _pc->pumpA_stop();
    _pc->pumpB_stop();
    _pc->pumpC_stop();
    _pc->pumpD_stop();

    _result.confidence = _result.is_valid ? 1.0f : 0.0f;

    Serial.println("[KH_Analyzer] Fase 5 concluída. Bombas desligadas, resultado pronto.");
    return true;
}


float KH_Analyzer::calculateKH() {
    if (_ph_ref <= 0 || _ph_sample <= 0) {
        Serial.printf("[KH_Analyzer] calcKH inválido: ph_ref=%.2f ph_sample=%.2f\n", _ph_ref, _ph_sample);
        return 0;
    }
    float delta_ph = _ph_ref - _ph_sample;
    float kh = delta_ph * 50.0;
    Serial.printf("[KH_Analyzer] calcKH: ph_ref=%.2f ph_sample=%.2f delta=%.2f kh_raw=%.2f\n",
                  _ph_ref, _ph_sample, delta_ph, kh);
    return constrain(kh, 1.0, 20.0);
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


void KH_Analyzer::logPhaseInfo(const char* phase_name) {
    Serial.printf("[KH_Analyzer] %s\n", phase_name);
}

