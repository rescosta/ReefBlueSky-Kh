#include "KH_Analyzer.h"
#include <ArduinoJson.h>
#include "TimeProvider.h"  // ou o arquivo correto onde getCurrentEpochMs está

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
    _current_state = PHASE1_DISCARD;
    return true;
}

bool KH_Analyzer::processNextPhase() {
    int level_a = _sm->getLevelA();
    int level_b = _sm->getLevelB();
    int level_c = _sm->getLevelC();

    switch (_current_state) {
        case PHASE1_DISCARD:
            if (phase1_discard(level_a, level_b)) {
                _current_state = PHASE2_CALIBRATE;
                return true;
            }
            break;

        case PHASE2_CALIBRATE:
            if (phase2_calibrate_reference(level_c, level_a)) {
                _current_state = PHASE3_COLLECT;
                return true;
            }
            break;

        case PHASE3_COLLECT:
            if (phase3_collect_sample(level_a, level_b)) {
                _current_state = PHASE4_MEASURE;
                return true;
            }
            break;

        case PHASE4_MEASURE:
            if (phase4_measure_saturation(level_a, level_b)) {
                _current_state = PHASE5_MAINTENANCE;
                return true;
            }
            break;

        case PHASE5_MAINTENANCE:
            if (phase5_maintenance(level_a, level_b)) {
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

bool KH_Analyzer::phase1_discard(int level_a, int level_b) {
    logPhaseInfo("FASE 1 - Descarte");
    // Implementação da fase 1
    return true;
}

bool KH_Analyzer::phase2_calibrate_reference(int level_c, int level_a) {
    logPhaseInfo("FASE 2 - Calibração");
    // Simulação: pH de referência fixo
    _ph_ref = 8.2f;
    return true;
}


bool KH_Analyzer::phase3_collect_sample(int level_a, int level_b) {
    logPhaseInfo("FASE 3 - Coleta");
    // Implementação da fase 3
    return true;
}

bool KH_Analyzer::phase4_measure_saturation(int level_a, int level_b) {
    logPhaseInfo("FASE 4 - Medição");

    // Simulação: pH da amostra levemente diferente
    _ph_sample   = 8.0f;
    _temperature = _sm->getTemperature();

    _result.ph_reference = _ph_ref;
    _result.ph_sample    = _ph_sample;
    _result.temperature  = _temperature;

    _result.kh_value     = calculateKH();
    _result.is_valid     = validateMeasurement();
    _result.error_message = _error_message;

    Serial.printf("[KH_Analyzer] DEBUG F4: ph_ref=%.2f ph_sample=%.2f temp=%.2f kh=%.2f valid=%d msg=%s\n",
                  _ph_ref, _ph_sample, _temperature,
                  _result.kh_value, _result.is_valid, _error_message.c_str());

    return true;
}

bool KH_Analyzer::phase5_maintenance(int level_a, int level_b) {
    logPhaseInfo("FASE 5 - Manutenção");
    // Implementação da fase 5
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
