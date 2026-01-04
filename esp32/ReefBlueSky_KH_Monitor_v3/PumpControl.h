#ifndef PUMP_CONTROL_H
#define PUMP_CONTROL_H

#include <Arduino.h>
#include "HardwarePins.h"



/**
 * @class PumpControl
 * @brief Controle de 4 bombas peristálticas com PWM
 * 
 * Controla:
 * - Bomba A: Coleta de amostra
 * - Bomba B: Descarte
 * - Bomba C: Referência (água de KH conhecido)
 * - Bomba D: Compressor de ar (5V)
 */
class PumpControl {
public:
    /**
     * Construtor
     */
    PumpControl();

    /**
     * Inicializar pinos e PWM
     */
    void begin();

    // ===== BOMBA A (Coleta) =====
    /**
     * Bomba A: Encher câmara A
     */
    void pumpA_fill();

    /**
     * Bomba A: Descarregar câmara A
     */
    void pumpA_discharge();

    /**
     * Bomba A: Parar
     */
    void pumpA_stop();

    // ===== BOMBA B (Descarte) =====
    /**
     * Bomba B: Encher câmara B
     */
    void pumpB_fill();

    /**
     * Bomba B: Descarregar câmara B
     */
    void pumpB_discharge();

    /**
     * Bomba B: Parar
     */
    void pumpB_stop();

    // ===== BOMBA C (Referência) =====
    /**
     * Bomba C: Encher câmara C (água de referência)
     */
    void pumpC_fill();

    /**
     * Bomba C: Descarregar câmara C (água de referência)
     */
    void pumpC_discharge();

    /**
     * Bomba C: Parar
     */
    void pumpC_stop();

    // ===== BOMBA D (Compressor) =====
    /**
     * Bomba D: Ligar compressor de ar
     */
    void pumpD_start();

    /**
     * Bomba D: Desligar compressor
     */
    void pumpD_stop();

    void pump4_fill();      // Bomba 4 → SENTIDO DIRETO
    void pump4_stop();      // Bomba 4 → PARA

    /**
     * Definir velocidade de uma bomba (0-255)
     * @param pump_id ID da bomba (1-4)
     * @param speed Velocidade (0-255)
     */
    void setPumpSpeed(int pump_id, int speed);

    /**
     * Parar todas as bombas
     */
    void stopAll();

    /**
     * Obter status de uma bomba
     * @param pump_id ID da bomba (1-4)
     * @return true se bomba está ligada
     */
    bool isPumpRunning(int pump_id);

    void pump4_correctKH(int seconds) {
    pump4_fill();    // ✅ BOMBA 4 REAL
    delay(seconds * 1000);
    pump4_stop();    // ✅ BOMBA 4 REAL
    }


private:
    // Estrutura para dados da bomba
    struct PumpData {
        int PWM;        // Pino PWM
        int DIR1;       // Direção 1
        int DIR2;       // Direção 2
        int channel;    // Canal LEDC
        bool running;
    };

    // Definições de bombas
    PumpData pump1;  // Bomba A
    PumpData pump2;  // Bomba B
    PumpData pump3;  // Bomba C
    PumpData pump4;  // Bomba D (Compressor)

    // Configurações
    static const int PWM_FREQ = 5000;      // Frequência PWM em Hz
    static const int PWM_RESOLUTION = 8;   // Resolução em bits (0-255)
    static const int PUMP_SPEED = 200;     // Velocidade padrão (0-255)

    // Métodos privados
    void setPumpDirection(int pump_id, bool forward);
    void setPumpPWM(int pump_id, int speed);
};

#endif // PUMP_CONTROL_H
