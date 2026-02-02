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

    Serial.println("\n========================================");
    Serial.println("[CAL] INICIANDO CALIBRAÇÃO COMPLETA");
    Serial.println("========================================");
    Serial.printf("[CAL] KH de referência configurado: %.2f dKH\n", kh_ref_user);
    Serial.printf("[CAL] Assume câmaras vazias: %s\n", assumeEmpty ? "SIM" : "NÃO");

    // Opcional: garantir câmaras vazias se !assumeEmpty
    if (!assumeEmpty) {
        Serial.println("[CAL] Realizando flush das câmaras A, B e C...");
        _pc->stopAll();
        _pc->pumpC_discharge();  // C -> B
        _pc->pumpB_discharge();  // B -> A
        _pc->pumpA_discharge();  // A -> aquário
        delay(3000); // flush simples
        _pc->stopAll();
        Serial.println("[CAL] Flush concluído, câmaras esvaziadas.");
    }

    Serial.println("[CAL] Iniciando Fase B1: Calibração bomba A->B (50mL)...");
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
        case CAL_B3_ENSURE_B_FULL:  // [FIX] Novo estado
        case CAL_B3_WAIT_B_FULL:    // [FIX] Atualizado
        case CAL_B3_FILL_C:         // [FIX] Renomeado
        case CAL_B3_WAIT_C_FULL:    // [FIX] Renomeado
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
                // [FIX] Volume correto de B: 50 mL
                float volume_ml = 50.0f;
                _b1_mlps = volume_ml / dt_s;
                Serial.printf("[CAL][B1] B cheio (50mL), tempo=%.2fs, vazao=%.4f mL/s (Bomba A->B)\n",
                              dt_s, _b1_mlps);
                _pc->pumpB_stop();

                // [FIX] Validação de vazão B1
                if (!validateFlowRate(_b1_mlps, "Bomba 2 (A->B)")) {
                    _state = CAL_ERROR;
                    return false;
                }

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
                // [FIX] Volume correto de B: 50 mL (solução padrão para referência)
                float volume_ml = 50.0f;
                _b2_mlps = volume_ml / dt_s;
                Serial.printf("[CAL][B2] B cheio (50mL) com solução padrão, tempo=%.2fs, vazao=%.4f mL/s\n",
                              dt_s, _b2_mlps);
                _pc->pumpB_stop();

                // [FIX] Validação de vazão B2
                if (!validateFlowRate(_b2_mlps, "Enchimento B (solução padrão)")) {
                    _state = CAL_ERROR;
                    return false;
                }

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
            Serial.println("[CAL][B2] Ativando compressor para equilibrar pH...");

            // [FIX] Ativar compressor (bomba D) para equilibrar CO2 antes de ler pH
            _pc->pumpD_start();
            delay(5000);  // Aguarda 5 segundos para equilibrar
            Serial.println("[CAL][B2] Equilibração concluída, lendo pH e temperatura de referência...");

            // Captura PH/Temp da solução padrão (B cheio)
            _ph_ref_measured = _sm->getPH();
            _temp_ref        = _sm->getTemperature();

            Serial.printf("[CAL][B2] pH ref=%.2f, temp ref=%.2f°C\n", _ph_ref_measured, _temp_ref);

            // [FIX] Desligar compressor
            _pc->pumpD_stop();
            Serial.println("[CAL][B2] Compressor desligado.");

            // [FIX] Validações de pH e temperatura
            if (!validatePHReference(_ph_ref_measured)) {
                _state = CAL_ERROR;
                return false;
            }

            if (!validateTemperature(_temp_ref)) {
                _state = CAL_ERROR;
                return false;
            }

            _state = CAL_B3_PREP_EMPTY_C;
            return true;
        }

        default:
            return false;
    }
}

// ---------- B3: calibrar bomba 3 (B -> C, 150mL) ----------
bool KH_Calibrator::stepCalibB3() {
    switch (_state) {
        case CAL_B3_PREP_EMPTY_C: {
            Serial.println("[CAL][B3] === INICIANDO CALIBRAÇÃO BOMBA C (B->C, 150mL) ===");
            Serial.println("[CAL][B3] Esvaziando câmara C (flush C->B->A->aquário)...");
            _t_start = millis();
            _pc->pumpC_discharge();  // C -> B
            _pc->pumpB_discharge();  // B -> A (paralelo para drenar o que vier de C)
            _pc->pumpA_discharge();  // A -> aquário
            _state   = CAL_B3_FLUSHING;
            return true;
        }

        case CAL_B3_FLUSHING: {
            if (millis() - _t_start < 5000UL) {
                return true;
            }
            Serial.println("[CAL][B3] Flush de C concluído.");
            _pc->stopAll();
            Serial.println("[CAL][B3] Garantindo que B está cheio com solução padrão...");
            _pc->pumpB_fill();  // Enche B a partir de A (solução padrão deve estar em A)
            _t_start = millis();
            _state   = CAL_B3_ENSURE_B_FULL;
            return true;
        }

        case CAL_B3_ENSURE_B_FULL: {
            // Enche B para garantir que há volume suficiente
            bool b_full = (_sm->getLevelB() == 1);
            if (b_full) {
                Serial.println("[CAL][B3] B está cheio (50mL). Preparando para calibrar B->C...");
                _pc->pumpB_stop();
                // Pequena pausa antes de iniciar transferência
                delay(1000);
                _state = CAL_B3_WAIT_B_FULL;
                return true;
            }
            if (millis() - _t_start > MAX_FILL_MS) {
                _pc->pumpB_stop();
                _state        = CAL_ERROR;
                _result.error = "Timeout ao garantir B cheio na calibração B3";
                return false;
            }
            return true;
        }

        case CAL_B3_WAIT_B_FULL: {
            // Estado intermediário para garantir que B está pronto
            Serial.println("[CAL][B3] === INICIANDO TRANSFERÊNCIA B->C COM REABASTECIMENTO ===");
            Serial.println("[CAL][B3] ATENÇÃO: B tem 50mL mas C precisa de 150mL");
            Serial.println("[CAL][B3] Sistema irá:");
            Serial.println("[CAL][B3]   - Transferir B->C (bomba C)");
            Serial.println("[CAL][B3]   - Reabastecer B com A->B (bomba 2)");
            Serial.println("[CAL][B3]   - Reabastecer A com aquário->A (bomba 1)");
            Serial.println("[CAL][B3]   - Respeitar limites de sensores A e B");

            // Liga todas as bombas em paralelo
            _pc->pumpC_fill();  // B -> C
            _pc->pumpB_fill();  // A -> B (reabastece B)
            _pc->pumpA_fill();  // Aquário -> A (reabastece A)

            _t_start = millis();
            _state   = CAL_B3_FILL_C;

            Serial.println("[CAL][B3] Bombas C, 2 e 1 ligadas, monitorando sensores...");
            return true;
        }

        case CAL_B3_FILL_C: {
            // [FIX] Monitora enchimento de C com reabastecimento contínuo de B e A

            // Verifica se C está cheio (objetivo final)
            bool c_full = (_sm->getLevelC() == 1);
            if (c_full) {
                unsigned long dt_ms = millis() - _t_start;
                float dt_s = dt_ms / 1000.0f;
                // [FIX] Volume correto de C: 150 mL
                float volume_ml = 150.0f;
                _b3_mlps = volume_ml / dt_s;

                // Para todas as bombas
                _pc->pumpC_stop();
                _pc->pumpB_stop();
                _pc->pumpA_stop();

                Serial.println("[CAL][B3] ========================================");
                Serial.printf("[CAL][B3] ✓ C CHEIO (150mL)!\n");
                Serial.printf("[CAL][B3] Tempo de enchimento: %.2f segundos\n", dt_s);
                Serial.printf("[CAL][B3] Vazão bomba C (B->C): %.4f mL/s\n", _b3_mlps);
                Serial.println("[CAL][B3] ========================================");

                // [FIX] Validação de vazão B3
                if (!validateFlowRate(_b3_mlps, "Bomba 3 (B->C)")) {
                    _state = CAL_ERROR;
                    return false;
                }

                _state = CAL_B3_WAIT_C_FULL;
                return true;
            }

            // [FIX] PROTEÇÃO: Se A atingir nível máximo, para bomba 1 temporariamente
            bool a_full = (_sm->getLevelA() == 1);
            if (a_full && _pc->isPumpRunning(1)) {
                Serial.println("[CAL][B3][PROTEÇÃO] A atingiu nível máximo! Parando bomba 1 temporariamente.");
                _pc->pumpA_stop();
            }
            // Retoma bomba 1 se A não estiver mais cheio
            else if (!a_full && !_pc->isPumpRunning(1)) {
                Serial.println("[CAL][B3][PROTEÇÃO] A tem espaço, retomando bomba 1 (aquário->A).");
                _pc->pumpA_fill();
            }

            // [FIX] PROTEÇÃO: Se B atingir nível máximo, para bomba 2 temporariamente
            bool b_full = (_sm->getLevelB() == 1);
            if (b_full && _pc->isPumpRunning(2)) {
                Serial.println("[CAL][B3][PROTEÇÃO] B atingiu nível máximo! Parando bomba 2 temporariamente.");
                _pc->pumpB_stop();
            }
            // Retoma bomba 2 se B não estiver mais cheio (consumido pela bomba C)
            else if (!b_full && !_pc->isPumpRunning(2)) {
                Serial.println("[CAL][B3][PROTEÇÃO] B tem espaço, retomando bomba 2 (A->B).");
                _pc->pumpB_fill();
            }

            // Timeout estendido (C precisa de 150mL, pode levar mais tempo)
            if (millis() - _t_start > 90000UL) {  // 90s timeout
                _pc->stopAll();
                _state        = CAL_ERROR;
                _result.error = "Timeout enchendo C na calibração da bomba 3 (B->C)";
                Serial.println("[CAL][B3][ERRO] Timeout ao encher C! Sensor C não detectou nível cheio após 90s.");
                return false;
            }

            return true;
        }

        case CAL_B3_WAIT_C_FULL: {
            // Estado final de confirmação
            Serial.println("[CAL][B3] Calibração da bomba 3 (B->C) concluída com sucesso!");
            _state = CAL_B3_DONE;
            return true;
        }

        case CAL_B3_DONE:
            Serial.println("[CAL][B3] === FIM DA CALIBRAÇÃO B3 ===\n");
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

    // [FIX] Salvar pH e temperatura de referência
    doc["ph_ref_measured"] = _ph_ref_measured;
    doc["temp_ref"]        = _temp_ref;

    Serial.printf("[CAL] Salvando calibração: KH_ref=%.2f, pH_ref=%.2f, temp_ref=%.2f°C\n",
                  _kh_ref_user, _ph_ref_measured, _temp_ref);
    Serial.printf("[CAL] Vazões: B1=%.4f, B2=%.4f, B3=%.4f mL/s\n",
                  _b1_mlps, _b2_mlps, _b3_mlps);

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

// ========================================
// [FIX] SANITY CHECKS - Validações
// ========================================

bool KH_Calibrator::validateFlowRate(float mlps, const char* pump_name) {
    Serial.printf("[CAL][VALIDAÇÃO] Checando vazão %s: %.4f mL/s\n", pump_name, mlps);

    if (mlps < MIN_FLOW_RATE) {
        String msg = String("[CAL][ERRO] Vazão ") + pump_name + " muito baixa: " +
                     String(mlps, 4) + " mL/s (mín: " + String(MIN_FLOW_RATE) + ")";
        Serial.println(msg);
        Serial.println("[CAL][DIAGNÓSTICO] Possíveis causas:");
        Serial.println("  - Bomba travada ou com problema mecânico");
        Serial.println("  - Mangueira obstruída ou dobrada");
        Serial.println("  - Líquido muito viscoso");
        Serial.println("  - Sensor de nível defeituoso (falso positivo)");

        _result.error = msg;
        sendCalibrationAlert(msg);
        return false;
    }

    if (mlps > MAX_FLOW_RATE) {
        String msg = String("[CAL][ERRO] Vazão ") + pump_name + " muito alta: " +
                     String(mlps, 4) + " mL/s (máx: " + String(MAX_FLOW_RATE) + ")";
        Serial.println(msg);
        Serial.println("[CAL][DIAGNÓSTICO] Possíveis causas:");
        Serial.println("  - Sensor de nível defeituoso (não detectou cheio)");
        Serial.println("  - Vazamento na câmara");
        Serial.println("  - Volume da câmara menor que esperado");

        _result.error = msg;
        sendCalibrationAlert(msg);
        return false;
    }

    Serial.printf("[CAL][VALIDAÇÃO] ✓ Vazão %s OK (%.4f mL/s está entre %.2f e %.2f)\n",
                  pump_name, mlps, MIN_FLOW_RATE, MAX_FLOW_RATE);
    return true;
}

bool KH_Calibrator::validatePHReference(float ph) {
    Serial.printf("[CAL][VALIDAÇÃO] Checando pH de referência: %.2f\n", ph);

    if (ph < MIN_PH_REF || ph > MAX_PH_REF) {
        String msg = String("[CAL][ERRO] pH de referência fora do esperado: ") +
                     String(ph, 2) + " (esperado: " + String(MIN_PH_REF) +
                     "-" + String(MAX_PH_REF) + ")";
        Serial.println(msg);
        Serial.println("[CAL][DIAGNÓSTICO] Possíveis causas:");
        Serial.println("  - Sonda de pH descalibrada");
        Serial.println("  - Solução padrão vencida ou contaminada");
        Serial.println("  - Sonda com bolhas de ar");
        Serial.println("  - Sonda seca ou danificada");

        _result.error = msg;
        sendCalibrationAlert(msg);
        return false;
    }

    Serial.printf("[CAL][VALIDAÇÃO] ✓ pH de referência OK (%.2f está entre %.2f e %.2f)\n",
                  ph, MIN_PH_REF, MAX_PH_REF);
    return true;
}

bool KH_Calibrator::validateTemperature(float temp) {
    Serial.printf("[CAL][VALIDAÇÃO] Checando temperatura: %.2f°C\n", temp);

    if (temp < MIN_TEMP || temp > MAX_TEMP) {
        String msg = String("[CAL][ERRO] Temperatura fora do esperado: ") +
                     String(temp, 2) + "°C (esperado: " + String(MIN_TEMP) +
                     "-" + String(MAX_TEMP) + "°C)";
        Serial.println(msg);
        Serial.println("[CAL][DIAGNÓSTICO] Possíveis causas:");
        Serial.println("  - Sensor de temperatura defeituoso");
        Serial.println("  - Sensor mal posicionado");
        Serial.println("  - Temperatura ambiente fora do normal");

        _result.error = msg;
        sendCalibrationAlert(msg);
        return false;
    }

    Serial.printf("[CAL][VALIDAÇÃO] ✓ Temperatura OK (%.2f°C está entre %.2f e %.2f)\n",
                  temp, MIN_TEMP, MAX_TEMP);
    return true;
}

void KH_Calibrator::sendCalibrationAlert(const String& message) {
    Serial.println("[CAL][ALERTA] Preparando alerta de calibração...");
    Serial.printf("[CAL][ALERTA] Mensagem: %s\n", message.c_str());

    // [FIX] Envia alerta via sistema existente do servidor
    // O ESP32 enviará uma medição especial com status="calibration_error"
    // O servidor detectará e enviará alerta via Telegram/Email

    // Esta função será chamada pelo arquivo .ino principal
    // que tem acesso ao cloudAuth para enviar ao servidor
    Serial.println("[CAL][ALERTA] ⚠️ Calibração falhou! Verifique os logs acima.");
    Serial.println("[CAL][ALERTA] O sistema tentará notificar o usuário via servidor.");
}

