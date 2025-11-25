#include "KH_Analyzer.h"

KH_Analyzer::KH_Analyzer(PumpControl* pc, SensorManager* sm)
    : _pc(pc), _sm(sm), _current_state(IDLE), _reference_kh(8.0),
      _ph_ref(0), _ph_sample(0), _temperature(25.0) {
    _predictor = new KHPredictor();
}

void KH_Analyzer::begin() {
    Serial.println("[KH_Analyzer] Inicializando analisador de KH...");
    _pc->begin();
    _sm->begin();
    _predictor->begin();
    _predictor->setReferenceKH(_reference_kh);
    reset();
    Serial.println("[KH_Analyzer] Analisador inicializado com sucesso");
}

bool KH_Analyzer::startMeasurementCycle() {
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

void KH_Analyzer::setReferenceKH(float reference_kh) {
    _reference_kh = reference_kh;
    _predictor->setReferenceKH(reference_kh);
    Serial.printf("[KH_Analyzer] KH de referência definido: %.2f\n", reference_kh);
}

void KH_Analyzer::stopMeasurement() {
    _pc->stopAll();
    _current_state = IDLE;
    Serial.println("[KH_Analyzer] Medição parada");
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

// ===== Fases de Medição =====

bool KH_Analyzer::phase1_discard(int level_a, int level_b) {
    logPhaseInfo("DESCARTE");

    // Descarregar câmara A
    _pc->pumpA_discharge();
    delay(DISCHARGE_TIME);
    _pc->pumpA_stop();

    // Descarregar câmara B
    _pc->pumpB_discharge();
    delay(DISCHARGE_TIME);
    _pc->pumpB_stop();

    Serial.println("[KH_Analyzer] Fase 1 (Descarte) concluída");
    return true;
}

bool KH_Analyzer::phase2_calibrate_reference(int level_c, int level_a) {
    logPhaseInfo("CALIBRAÇÃO");

    // Encher câmara C com água de referência
    _pc->pumpC_fill();
    delay(FILL_TIME);
    _pc->pumpC_stop();

    // Aguardar estabilização
    delay(STABILIZE_TIME);

    // Ler pH da referência
    _ph_ref = _sm->getPH();
    _temperature = _sm->getTemperature();

    Serial.printf("[KH_Analyzer] pH Referência: %.2f, Temp: %.1f°C\n", _ph_ref, _temperature);

    return true;
}

bool KH_Analyzer::phase3_collect_sample(int level_a, int level_b) {
    logPhaseInfo("COLETA");

    // Encher câmara A com amostra do aquário
    _pc->pumpA_fill();
    delay(FILL_TIME);
    _pc->pumpA_stop();

    // Descarregar câmara B
    _pc->pumpB_discharge();
    delay(DISCHARGE_TIME);
    _pc->pumpB_stop();

    Serial.println("[KH_Analyzer] Fase 3 (Coleta) concluída");
    return true;
}

bool KH_Analyzer::phase4_measure_saturation(int level_a, int level_b) {
    logPhaseInfo("MEDIÇÃO");

    // Ligar compressor para saturar com CO2
    _pc->pumpD_start();
    delay(SATURATION_TIME);
    _pc->pumpD_stop();

    // Aguardar estabilização
    delay(STABILIZE_TIME);

    // Ler pH da amostra
    _ph_sample = _sm->getPH();
    _temperature = _sm->getTemperature();

    // Calcular KH
    float kh = calculateKH();

    // Adicionar ao histórico de predição
    _predictor->addMeasurement(kh, millis(), _temperature);

    // Validar medição
    if (validateMeasurement()) {
        _result.kh_value = kh;
        _result.ph_reference = _ph_ref;
        _result.ph_sample = _ph_sample;
        _result.temperature = _temperature;
        _result.is_valid = true;

        Serial.printf("[KH_Analyzer] KH Medido: %.2f dKH\n", kh);
        Serial.printf("  pH Referência: %.2f\n", _ph_ref);
        Serial.printf("  pH Amostra: %.2f\n", _ph_sample);
        Serial.printf("  Diferença: %.2f\n", _ph_ref - _ph_sample);
    } else {
        _result.is_valid = false;
        _result.error_message = "Medição inválida";
    }

    return true;
}

bool KH_Analyzer::phase5_maintenance(int level_a, int level_b) {
    logPhaseInfo("MANUTENÇÃO");

    // Descarregar câmara B
    _pc->pumpB_discharge();
    delay(DISCHARGE_TIME);
    _pc->pumpB_stop();

    // Encher câmara A com água limpa
    _pc->pumpA_fill();
    delay(FILL_TIME);
    _pc->pumpA_stop();

    Serial.println("[KH_Analyzer] Fase 5 (Manutenção) concluída");
    return true;
}

// ===== Métodos Auxiliares =====

float KH_Analyzer::calculateKH() {
    // Fórmula: KH = (pH_ref - pH_sample) * 50 / 1.67
    // Baseado em: ΔpH = log10(KH * 1.67 / 50)
    
    float delta_ph = _ph_ref - _ph_sample;

    if (delta_ph <= 0) {
        return 0;  // Erro: pH da amostra não diminuiu
    }

    // Usar a fórmula inversa
    float kh = (pow(10, delta_ph) * 50.0f) / 1.67f;

    // Aplicar compensação de temperatura
    float temp_factor = 1.0f + ((_temperature - 25.0f) * 0.002f);
    kh *= temp_factor;

    return kh;
}

bool KH_Analyzer::validateMeasurement() {
    // Validar pH
    if (_ph_ref < 6.0f || _ph_ref > 8.5f) {
        _error_message = "pH de referência inválido";
        return false;
    }

    if (_ph_sample < 3.0f || _ph_sample > 8.5f) {
        _error_message = "pH da amostra inválido";
        return false;
    }

    // Validar diferença de pH
    float delta_ph = _ph_ref - _ph_sample;
    if (delta_ph < 0.1f || delta_ph > 4.0f) {
        _error_message = "Diferença de pH fora da faixa esperada";
        return false;
    }

    // Validar temperatura
    if (_temperature < 15.0f || _temperature > 35.0f) {
        _error_message = "Temperatura inválida";
        return false;
    }

    // Validar KH
    float kh = _result.kh_value;
    if (kh < 1.0f || kh > 20.0f) {
        _error_message = "KH fora da faixa esperada";
        return false;
    }

    return true;
}

void KH_Analyzer::logPhaseInfo(const char* phase_name) {
    Serial.printf("\n========================================\n");
    Serial.printf("[KH_Analyzer] FASE: %s\n", phase_name);
    Serial.printf("  Nível A: %d\n", _sm->getLevelA());
    Serial.printf("  Nível B: %d\n", _sm->getLevelB());
    Serial.printf("  Nível C: %d\n", _sm->getLevelC());
    Serial.printf("  Temperatura: %.1f°C\n", _sm->getTemperature());
    Serial.printf("========================================\n\n");
}
