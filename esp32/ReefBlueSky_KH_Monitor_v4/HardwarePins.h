// HardwarePins.h
#pragma once
#include <Arduino.h>

/*
================================================================================
   REEFBLUESKY KH MONITOR - DOCUMENTAÇÃO DE HARDWARE
================================================================================

## 📋 VISÃO GERAL DO PROJETO

Este projeto utiliza um **ESP32 DevKit V1** para monitorar e controlar
automaticamente o KH (alcalinidade) de aquários marinhos através de:
- Medição de pH e temperatura
- Controle de bombas peristálticas para dosagem
- Sensores de nível de reagentes
- Comunicação WiFi com servidor cloud
- Interface web local e remota

## 🔧 COMPONENTES NECESSÁRIOS

1. **ESP32 DevKit V1** (30 pinos)
2. **Driver de motor TB6612FNG** (para 4 bombas peristálticas)
3. **4x Bombas Peristálticas** (6V DC)
4. **3x Sensores de Nível Capacitivos** (analógicos)
5. **Sensor de pH** (analógico, 0-14 pH)
6. **Sensor de Temperatura DS18B20** (OneWire)
7. **Compressor de ar** (para agitação)
8. **Botão de Reset** (opcional)
9. **Fonte de alimentação 5-6V** (para bombas)
10. **Resistor 4.7kΩ** (pull-up para DS18B20)

## 📌 PINOUT COMPLETO - ESP32 DevKit V1

┌─────────────────────────────────────────────────────────────────────┐
│  FUNÇÃO              │ GPIO │ PINO ESP32 │ COMPONENTE/CONEXÃO       │
├─────────────────────────────────────────────────────────────────────┤
│ SENSORES DE NÍVEL                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  Nível Reserv. 01    │  16  │   GPIO16   │ Sensor Capacitivo A      │
│  Nível Reserv. 02    │  17  │   GPIO17   │ Sensor Capacitivo B      │
│  Nível Reserv. 03    │   5  │   GPIO5    │ Sensor Capacitivo C      │
├─────────────────────────────────────────────────────────────────────┤
│ SENSORES ANALÓGICOS                                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Sensor pH           │  36  │   VP/36    │ Saída analógica pH       │
│  Temperatura DS18B20 │   4  │   GPIO4    │ OneWire (+ 4.7kΩ pullup) │
├─────────────────────────────────────────────────────────────────────┤
│ BOMBA 1 - TB6612 (Motor A)                                          │
├─────────────────────────────────────────────────────────────────────┤
│  IN1 (Direção 1)     │  12  │   GPIO12   │ TB6612 AIN1              │
│  IN2 (Direção 2)     │  13  │   GPIO13   │ TB6612 AIN2              │
│  PWM (Velocidade)    │  14  │   GPIO14   │ TB6612 PWMA              │
├─────────────────────────────────────────────────────────────────────┤
│ BOMBA 2 - TB6612 (Motor B)                                          │
├─────────────────────────────────────────────────────────────────────┤
│  IN1 (Direção 1)     │  25  │   GPIO25   │ TB6612 BIN1              │
│  IN2 (Direção 2)     │  26  │   GPIO26   │ TB6612 BIN2              │
│  PWM (Velocidade)    │  27  │   GPIO27   │ TB6612 PWMB              │
├─────────────────────────────────────────────────────────────────────┤
│ BOMBA 3 - TB6612                                                    │
├─────────────────────────────────────────────────────────────────────┤
│  IN1 (Direção 1)     │  18  │   GPIO18   │ TB6612 AIN1 (2º driver)  │
│  IN2 (Direção 2)     │  19  │   GPIO19   │ TB6612 AIN2 (2º driver)  │
│  PWM (Velocidade)    │  21  │   GPIO21   │ TB6612 PWMA (2º driver)  │
├─────────────────────────────────────────────────────────────────────┤
│ BOMBA 4 - Correção KH                                               │
├─────────────────────────────────────────────────────────────────────┤
│  IN1 (Forward)       │  32  │   GPIO32   │ TB6612 BIN1 (2º driver)  │
│  IN2 (Reverse)       │  33  │   GPIO33   │ TB6612 BIN2 (2º driver)  │
│  PWM (Velocidade)    │  22  │   GPIO22   │ TB6612 PWMB (2º driver)  │
├─────────────────────────────────────────────────────────────────────┤
│ PERIFÉRICOS                                                         │
├─────────────────────────────────────────────────────────────────────┤
│  Compressor          │  15  │   GPIO15   │ Relé/Transistor (ativa ar)│
│  Botão Reset         │  35  │   GPIO35   │ Pushbutton (pull-down)   │
│  WiFi Reset (BOOT)   │   0  │   GPIO0    │ Botão BOOT interno       │
└─────────────────────────────────────────────────────────────────────┘

## 🔌 DIAGRAMA DE CONEXÕES

### 1️⃣ DRIVER TB6612FNG (2 unidades necessárias)

```
Driver 1 (Bombas 1 e 2):
┌──────────────┐
│   TB6612     │
│   DRIVER 1   │
├──────────────┤
│ VM   ← 6V    │ ← Alimentação motores
│ VCC  ← 3.3V  │ ← Alimentação lógica (do ESP32)
│ GND  ← GND   │ ← Terra comum
│              │
│ AIN1 ← GPIO12│ ← Bomba 1 direção 1
│ AIN2 ← GPIO13│ ← Bomba 1 direção 2
│ PWMA ← GPIO14│ ← Bomba 1 velocidade
│ AO1  → Motor1+│ → Bomba 1 fio +
│ AO2  → Motor1-│ → Bomba 1 fio -
│              │
│ BIN1 ← GPIO25│ ← Bomba 2 direção 1
│ BIN2 ← GPIO26│ ← Bomba 2 direção 2
│ PWMB ← GPIO27│ ← Bomba 2 velocidade
│ BO1  → Motor2+│ → Bomba 2 fio +
│ BO2  → Motor2-│ → Bomba 2 fio -
│              │
│ STBY ← 3.3V  │ ← Sempre HIGH (ativo)
└──────────────┘

Driver 2 (Bombas 3 e 4):
┌──────────────┐
│   TB6612     │
│   DRIVER 2   │
├──────────────┤
│ VM   ← 6V    │ ← Alimentação motores
│ VCC  ← 3.3V  │ ← Alimentação lógica
│ GND  ← GND   │ ← Terra comum
│              │
│ AIN1 ← GPIO18│ ← Bomba 3 direção 1
│ AIN2 ← GPIO19│ ← Bomba 3 direção 2
│ PWMA ← GPIO21│ ← Bomba 3 velocidade
│ AO1  → Motor3+│ → Bomba 3 fio +
│ AO2  → Motor3-│ → Bomba 3 fio -
│              │
│ BIN1 ← GPIO32│ ← Bomba 4 direção 1
│ BIN2 ← GPIO33│ ← Bomba 4 direção 2
│ PWMB ← GPIO22│ ← Bomba 4 velocidade
│ BO1  → Motor4+│ → Bomba 4 fio +
│ BO2  → Motor4-│ → Bomba 4 fio -
│              │
│ STBY ← 3.3V  │ ← Sempre HIGH (ativo)
└──────────────┘
```

### 2️⃣ SENSOR DS18B20 (Temperatura)

```
DS18B20 (TO-92)
┌─────────────┐
│   ┌───┐     │
│   │ ∩ │     │  Vista frontal (face plana)
│   └───┘     │
│   │ │ │     │
│   1 2 3     │
├─────────────┤
│ 1. GND      │ → GND do ESP32
│ 2. Data     │ → GPIO4 + resistor 4.7kΩ para 3.3V
│ 3. VCC      │ → 3.3V do ESP32
└─────────────┘
```

### 3️⃣ SENSORES DE NÍVEL CAPACITIVOS

```
Cada sensor capacitivo tem 3 fios:
┌─────────────────┐
│ Sensor Nível    │
├─────────────────┤
│ VCC → 3.3V      │
│ GND → GND       │
│ OUT → GPIO      │ GPIO16 (Reserv.01), GPIO17 (Reserv.02), GPIO5 (Reserv.03)
└─────────────────┘

Threshold analógico: 2500 (0-4095 range ADC)
```

### 4️⃣ SENSOR DE pH

```
Módulo Sensor pH
┌─────────────────┐
│  pH Sensor      │
├─────────────────┤
│ VCC → 5V        │ ← Alimentação (pode ser do Vin ESP32)
│ GND → GND       │
│ OUT → GPIO36(VP)│ ← Entrada analógica (VP)
└─────────────────┘
```

### 5️⃣ COMPRESSOR (Relé)

```
Módulo Relé
┌─────────────────┐
│   RELÉ 5V       │
├─────────────────┤
│ VCC → 5V        │
│ GND → GND       │
│ IN  → GPIO15    │ ← Sinal de controle
└─────────────────┘
     │
     └─→ Compressor 127V/220V (lado NA - Normalmente Aberto)
```

## ⚠️ AVISOS IMPORTANTES

1. **GPIO2 NÃO USADO**: Este pino interfere com o WiFi PHY do ESP32. Evite usar.

2. **GPIO0 (BOOT)**: Usado apenas para reset de WiFi (segure 3s na inicialização).

3. **Alimentação**:
   - ESP32: 5V via USB ou Vin
   - Bombas: 6V externa (TB6612 VM)
   - Lógica TB6612: 3.3V do ESP32
   - **IMPORTANTE**: Compartilhe GND entre ESP32 e drivers!

4. **Pull-up DS18B20**: Obrigatório resistor 4.7kΩ entre Data e 3.3V.

5. **Sensores analógicos**:
   - GPIO36 e GPIO35: Somente INPUT (sem pull-up/down)
   - ADC range: 0-4095 (12 bits)

6. **PWM**: Todos os pinos PWM usam 5kHz, 8 bits (0-255).

7. **Tensão máxima GPIO**: 3.3V (nunca conecte 5V diretamente!)

## 🧪 CALIBRAÇÃO INICIAL

1. **pH**: Calibrar com soluções buffer 4.0, 7.0 e 10.0
2. **Temperatura**: Verificar com termômetro de referência
3. **Nível**: Ajustar threshold conforme sensibilidade dos sensores
4. **Bombas**: Calibrar taxa mL/s com teste de 60 segundos

## 📡 COMUNICAÇÃO

- **WiFi**: Conecta automaticamente à rede configurada
- **Servidor Cloud**: iot.reefbluesky.com.br
- **Interface Web Local**: http://[IP_DO_ESP32]
- **OTA Updates**: Suportado via web

## 🔄 FLUXO OPERACIONAL

1. Boot → Conecta WiFi → Autentica no servidor
2. Inicia medição de pH e temperatura
3. Executa análise KH periódica (comando remoto)
4. Bombas dosam reagentes conforme programação
5. Envia dados (health) ao servidor a cada 30s
6. Recebe comandos remotos via HTTP

## 🧮 FUNCIONAMENTO LÓGICO - CALIBRAÇÃO DE BOMBAS

### Objetivo
Determinar a taxa de dosagem (mL/s) de cada bomba peristáltica para
garantir precisão nas dosagens automáticas.

### Processo Passo a Passo

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE 1: PREPARAÇÃO                                             │
├─────────────────────────────────────────────────────────────────┤
│  1. Usuário acessa interface web (Dashboard)                    │
│  2. Seleciona bomba a calibrar (1-4)                            │
│  3. Posiciona recipiente graduado sob a mangueira               │
│  4. Clica "Iniciar Calibração"                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 2: CONFIRMAÇÃO (Modal Web)                                │
├─────────────────────────────────────────────────────────────────┤
│  Modal exibe:                                                    │
│  • Nome da bomba selecionada                                    │
│  • Instruções do procedimento                                   │
│  • Aviso: posicionar recipiente                                 │
│                                                                  │
│  Usuário: [Cancelar] ou [OK, Iniciar]                          │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (Se OK)
┌─────────────────────────────────────────────────────────────────┐
│  FASE 3: CONTAGEM REGRESSIVA (5 segundos)                       │
├─────────────────────────────────────────────────────────────────┤
│  Overlay exibe:                                                  │
│  "Iniciando em 5 segundos..."                                   │
│  "Iniciando em 4 segundos..."                                   │
│  ...                                                             │
│  "Iniciando em 1 segundo..."                                    │
│                                                                  │
│  → Dá tempo ao usuário para ajustes finais                      │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 4: COMANDO HTTP → ESP32                                   │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard envia:                                                │
│  POST /api/iot/kh/devices/{id}/pumps/{index}/calibrate/start   │
│  (sem body - comando simples)                                   │
│                                                                  │
│  ESP32 recebe e executa:                                        │
│  void PumpControl::startCalibration(int pumpIndex) {            │
│    // Valida bomba existe                                       │
│    if (pumpIndex < 0 || pumpIndex >= 4) return;                │
│                                                                  │
│    // Ativa bomba em velocidade total (PWM 255)                │
│    digitalWrite(pump[i].in1, HIGH);                             │
│    digitalWrite(pump[i].in2, LOW);                              │
│    analogWrite(pump[i].pwm, 255);                               │
│                                                                  │
│    // Marca tempo inicial                                       │
│    calibrationStartTime = millis();                             │
│    calibrationRunning = true;                                   │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 5: DOSAGEM DE TESTE (60 segundos)                         │
├─────────────────────────────────────────────────────────────────┤
│  Overlay exibe progresso:                                        │
│  "Calibração em andamento... Restam 60 segundos"               │
│  [████████░░░░░░░░░░░░] 33%                                      │
│  "Calibração em andamento... Restam 40 segundos"               │
│  [████████████░░░░░░░░] 66%                                      │
│  ...                                                             │
│                                                                  │
│  ESP32 (loop contínuo):                                         │
│  void loop() {                                                   │
│    if (calibrationRunning) {                                    │
│      unsigned long elapsed = millis() - calibrationStartTime;  │
│      if (elapsed >= 60000) { // 60 segundos                    │
│        // Para bomba                                            │
│        digitalWrite(pump[i].in1, LOW);                          │
│        digitalWrite(pump[i].in2, LOW);                          │
│        analogWrite(pump[i].pwm, 0);                             │
│        calibrationRunning = false;                              │
│      }                                                           │
│    }                                                             │
│  }                                                               │
│                                                                  │
│  Botão disponível: [✖ Abortar Teste]                           │
│  → Se clicado: POST /calibrate/abort → para imediatamente      │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 6: MEDIÇÃO MANUAL                                         │
├─────────────────────────────────────────────────────────────────┤
│  Overlay fecha automaticamente                                   │
│  Modal escuro aparece:                                          │
│                                                                  │
│  "✅ Calibração concluída para Bomba KH!"                       │
│  "Digite o volume medido (em mL):"                              │
│  [_______] ← input numérico                                     │
│  [Cancelar] [Salvar]                                            │
│                                                                  │
│  Usuário mede volume no recipiente graduado                     │
│  Ex: 95.5 mL                                                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼ (Salvar)
┌─────────────────────────────────────────────────────────────────┐
│  FASE 7: CÁLCULO E PERSISTÊNCIA                                 │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard envia:                                                │
│  POST /api/v1/user/dosing/devices/{id}/pumps/{i}/calibrate/save│
│  { "measured_volume": 95.5 }                                    │
│                                                                  │
│  Backend (Node.js) calcula:                                     │
│  const rate_ml_s = measured_volume / 60;                        │
│  // 95.5 / 60 = 1.592 mL/s                                      │
│                                                                  │
│  Salva no banco:                                                │
│  UPDATE dosing_pumps                                            │
│  SET calibration_rate_ml_s = 1.592                              │
│  WHERE device_id = X AND index_on_device = i;                  │
│                                                                  │
│  Retorna ao frontend:                                           │
│  { "ml_per_second": 1.592 }                                     │
│                                                                  │
│  Frontend atualiza card:                                        │
│  "Taxa Atual: 1,592 mL/s (95,5 mL/min)"                        │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESULTADO FINAL                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ✅ Bomba calibrada e pronta para uso                           │
│  ✅ Taxa armazenada: 1.592 mL/s                                 │
│  ✅ Próximas dosagens usarão este valor para calcular tempo    │
└─────────────────────────────────────────────────────────────────┘
```

### Fórmulas

```cpp
// Calibração
taxa_ml_s = volume_medido_ml / 60.0;

// Exemplo
taxa_ml_s = 95.5 / 60.0 = 1.592 mL/s
```

## 🧪 FUNCIONAMENTO LÓGICO - ANÁLISE DE KH

### Objetivo
Medir automaticamente o KH (alcalinidade) do aquário através de análise de pH
antes e depois da saturação com CO2, usando água de referência com KH conhecido.

### Princípio de Funcionamento

O KH (alcalinidade) é medido comparando a variação de pH entre:
1. **Água de referência** (KH conhecido, ex: 8.0 dKH)
2. **Amostra do aquário** (KH desconhecido)

Ambas são saturadas com CO2 (compressor) e o pH é medido.
A diferença de pH indica a diferença de KH.

```
Fórmula:
KH_aquario = KH_referencia × (pH_ref_final / pH_amostra_final)
```

### As 5 Fases da Análise

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE 1: LIMPEZA (CLEAN)                                        │
├─────────────────────────────────────────────────────────────────┤
│  Objetivo: Limpar câmaras de análise e tubulações              │
│                                                                  │
│  Bombas ativadas:                                               │
│  • PUMP_A_IN (Bomba A) → Descarta líquido anterior             │
│  • PUMP_C_IN (Bomba C) → Suga água limpa                       │
│                                                                  │
│  Duração: ~30 segundos                                          │
│  Compressor: OFF                                                │
│                                                                  │
│  void KH_Analyzer::phase1_clean() {                             │
│    Serial.println("[FASE 1] Limpeza iniciada");                │
│    pumpControl->activatePumpsByFlags(PUMP_A_IN | PUMP_C_IN);   │
│    delay(30000); // 30s                                         │
│    pumpControl->stopAllPumps();                                 │
│    Serial.println("[FASE 1] Limpeza concluída");               │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 2: CALIBRAÇÃO (REFERENCE)                                 │
├─────────────────────────────────────────────────────────────────┤
│  Objetivo: Coletar água de referência (KH conhecido)           │
│                                                                  │
│  Reservatório R03: Água com KH = 8.0 dKH (ou valor configurado)│
│                                                                  │
│  Bombas ativadas:                                               │
│  • PUMP_C_IN → Suga água do reservatório R03                   │
│  • Enche câmara de medição                                      │
│                                                                  │
│  Compressor: ON (satura com CO2)                                │
│  Duração: ~60 segundos (tempo de saturação)                     │
│                                                                  │
│  Medições:                                                       │
│  • pH inicial (antes CO2): ~8.2                                 │
│  • pH final (após CO2): ~6.5 ← ESTE É O VALOR DE REFERÊNCIA   │
│  • Temperatura: 25.0°C                                          │
│                                                                  │
│  void KH_Analyzer::phase2_reference() {                         │
│    Serial.println("[FASE 2] Coletando referência");            │
│    pumpControl->activatePumpsByFlags(PUMP_C_IN);                │
│    delay(10000); // Enche câmara                                │
│    pumpControl->stopAllPumps();                                 │
│                                                                  │
│    // Ativa compressor                                          │
│    pumpControl->activatePumpsByFlags(COMPRESSOR_ON);            │
│    delay(60000); // Satura 60s                                  │
│                                                                  │
│    // Mede pH de referência                                     │
│    ph_reference = sensorManager->readPH();                      │
│    temp_reference = sensorManager->readTemp();                  │
│                                                                  │
│    pumpControl->stopAllPumps();                                 │
│    Serial.printf("[FASE 2] pH_ref=%.2f T=%.1f\n",              │
│                  ph_reference, temp_reference);                 │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 3: COLETA (SAMPLE) - REMOVIDA                             │
├─────────────────────────────────────────────────────────────────┤
│  Esta fase foi otimizada e integrada à Fase 4                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 4: MEDIÇÃO (MEASURE_KH)                                   │
├─────────────────────────────────────────────────────────────────┤
│  Objetivo: Coletar amostra do aquário e medir KH               │
│                                                                  │
│  Bombas ativadas:                                               │
│  • PUMP_A_IN → Descarta água de referência                     │
│  • PUMP_B_OUT → Coleta amostra do aquário                      │
│  • Enche câmara com água do aquário                            │
│                                                                  │
│  Compressor: ON (satura com CO2)                                │
│  Duração: ~60 segundos                                          │
│                                                                  │
│  Medições:                                                       │
│  • pH inicial (antes CO2): ~8.1                                 │
│  • pH final (após CO2): ~6.8 ← VALOR DA AMOSTRA               │
│  • Temperatura: 25.0°C                                          │
│                                                                  │
│  Cálculo do KH:                                                  │
│  KH_aquario = KH_ref × (pH_ref_final / pH_sample_final)        │
│  KH_aquario = 8.0 × (6.5 / 6.8) = 7.65 dKH                     │
│                                                                  │
│  void KH_Analyzer::phase4_measure() {                           │
│    Serial.println("[FASE 4] Coletando amostra");               │
│                                                                  │
│    // Descarta ref + coleta amostra                             │
│    pumpControl->activatePumpsByFlags(PUMP_A_IN | PUMP_B_OUT);   │
│    delay(10000);                                                │
│    pumpControl->stopAllPumps();                                 │
│                                                                  │
│    // Satura com CO2                                            │
│    pumpControl->activatePumpsByFlags(COMPRESSOR_ON);            │
│    delay(60000);                                                │
│                                                                  │
│    // Mede pH da amostra                                        │
│    ph_sample = sensorManager->readPH();                         │
│    temp_sample = sensorManager->readTemp();                     │
│                                                                  │
│    // Calcula KH                                                │
│    float kh_calculated = kh_reference * (ph_reference / ph_sample);│
│    result.kh_value = kh_calculated;                             │
│    result.is_valid = true;                                      │
│                                                                  │
│    pumpControl->stopAllPumps();                                 │
│    Serial.printf("[FASE 4] KH=%.2f dKH\n", kh_calculated);     │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  FASE 5: FINALIZAÇÃO (FINALIZE)                                 │
├─────────────────────────────────────────────────────────────────┤
│  Objetivo: Limpeza final e preparação para próxima análise     │
│                                                                  │
│  Bombas ativadas:                                               │
│  • PUMP_A_IN → Descarta amostra                                │
│  • PUMP_C_IN → Suga água limpa                                 │
│                                                                  │
│  Duração: ~20 segundos                                          │
│  Compressor: OFF                                                │
│                                                                  │
│  void KH_Analyzer::phase5_finalize() {                          │
│    Serial.println("[FASE 5] Finalizando");                      │
│    pumpControl->activatePumpsByFlags(PUMP_A_IN | PUMP_C_IN);    │
│    delay(20000);                                                │
│    pumpControl->stopAllPumps();                                 │
│    Serial.println("[FASE 5] Análise concluída");               │
│                                                                  │
│    // Envia resultado ao servidor                               │
│    sendResultToCloud(result);                                   │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  RESULTADO FINAL                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Dados enviados ao servidor:                                    │
│  {                                                               │
│    "device_id": 15,                                             │
│    "kh_value": 7.65,                                            │
│    "ph_reference": 6.50,                                        │
│    "ph_sample": 6.80,                                           │
│    "temperature": 25.0,                                         │
│    "confidence": 0.95,                                          │
│    "timestamp": "2026-02-08T15:30:00Z"                          │
│  }                                                               │
│                                                                  │
│  Backend processa e:                                            │
│  • Armazena no banco (kh_measurements)                          │
│  • Atualiza gráfico histórico                                   │
│  • Executa predição IA (KH futuro)                              │
│  • Se KH < threshold → envia alerta                             │
│  • Se dosagem corretiva ativada → aciona bomba 4 (KH+)         │
└─────────────────────────────────────────────────────────────────┘
```

### Comandos de Controle

O ESP32 recebe comandos via HTTP:

```cpp
// Iniciar análise manual
POST /api/iot/kh/devices/{id}/analyze
→ Inicia ciclo completo das 5 fases

// Abortar análise em andamento
POST /api/iot/kh/devices/{id}/analyze/abort
→ Para bombas e compressor imediatamente

// Atualizar KH de referência
POST /api/iot/kh/devices/{id}/reference
{ "kh_value": 8.0 }
→ Define novo valor de KH conhecido
```

### Fluxo de Dados

```
┌──────────────────────────────────────────────────────────────┐
│  1. Usuário no Dashboard clica "Medir KH"                    │
│                                                               │
│  2. Frontend → POST /api/v1/user/kh/devices/{id}/analyze    │
│                                                               │
│  3. Backend → POST /api/iot/kh/devices/{id}/analyze         │
│     (IoT endpoint que ESP32 está escutando)                  │
│                                                               │
│  4. ESP32 recebe comando                                     │
│     → Inicia KH_Analyzer::startMeasurementCycle()           │
│                                                               │
│  5. ESP32 executa 5 fases (total ~3-4 minutos)              │
│     Fase 1: 30s                                              │
│     Fase 2: 70s (enche + satura + mede)                     │
│     Fase 4: 70s (coleta + satura + mede)                    │
│     Fase 5: 20s                                              │
│                                                               │
│  6. ESP32 → POST /api/iot/kh/devices/{id}/measurement       │
│     { kh_value, ph_ref, ph_sample, temp, ... }              │
│                                                               │
│  7. Backend armazena resultado                               │
│     INSERT INTO kh_measurements ...                          │
│                                                               │
│  8. Frontend atualiza gráfico em tempo real (via polling)   │
│     GET /api/v1/user/kh/devices/{id}/measurements           │
└──────────────────────────────────────────────────────────────┘
```

### Fórmulas

```cpp
// Cálculo do KH
KH_aquario = KH_referencia × (pH_ref_final / pH_amostra_final)

// Exemplo real
KH_aquario = 8.0 × (6.5 / 6.8) = 7.647 dKH

// Confiança (confidence)
confidence = 1.0 - abs(pH_ref - pH_sample) / pH_ref
// Se pHs muito diferentes → baixa confiança

// Correção por temperatura (simplificado)
KH_corrigido = KH_calculado × (1 + 0.002 × (T - 25.0))
```

### Dosagem Corretiva Automática

Se o KH medido estiver abaixo do target configurado, o sistema pode
automaticamente dosar corretor de KH (Bomba 4):

```cpp
// Exemplo: KH medido = 7.0, target = 8.0
float kh_deficit = 8.0 - 7.0; // 1.0 dKH faltando

// Volume de corretor necessário (depende da concentração)
// Ex: 1 dKH de correção = 10 mL de corretor para 100L
float aquarium_volume_L = 100.0;
float correction_ml = kh_deficit × (10.0 * aquarium_volume_L / 100.0);
// 1.0 × (10.0 × 100 / 100) = 10 mL

// Aciona bomba 4 (KH+)
pumpControl->activatePumpManual(3, correction_ml); // index 3 = bomba 4
```

### Sensores de Nível

Os 3 sensores capacitivos monitoram os reservatórios:

```cpp
// R01 (GPIO16): Água limpa (limpeza)
// R02 (GPIO17): Reserva (não usado atualmente)
// R03 (GPIO5):  Água de referência (KH conhecido)

void checkLevels() {
  int level_r01 = analogRead(LEVEL_R01_PIN);
  int level_r03 = analogRead(LEVEL_R03_PIN);
  
  if (level_r01 < LEVEL_THRESHOLD) {
    Serial.println("ALERTA: Reservatório 01 vazio!");
    sendAlert("Reservatório de água limpa vazio");
  }
  
  if (level_r03 < LEVEL_THRESHOLD) {
    Serial.println("ALERTA: Reservatório 03 vazio!");
    sendAlert("Reservatório de referência vazio");
  }
}
```

### Tratamento de Erros

```cpp
// Erro 1: pH não estabiliza
if (abs(pH_current - pH_previous) > 0.1 after 60s) {
  result.error_message = "pH não estabilizou";
  result.is_valid = false;
  return ERROR_STATE;
}

// Erro 2: Temperatura fora da faixa
if (temp < 20.0 || temp > 30.0) {
  result.error_message = "Temperatura fora da faixa";
  result.confidence *= 0.5; // Reduz confiança
}

// Erro 3: Reservatório vazio
if (level_r03 < LEVEL_THRESHOLD) {
  result.error_message = "Reservatório de referência vazio";
  return ERROR_STATE;
}

// Erro 4: WiFi desconectado
// ESP32 completa medição offline
// Envia resultado quando reconectar (buffer local)
```

### Predição com IA

O backend usa TensorFlow.js para prever KH futuro:

```javascript
// Baseado em histórico de 30 dias
const prediction = await khPredictor.predict({
  measurements: last30Days,
  dosing_history: dosingLogs,
  evaporation_rate: 2.0 // L/dia
});

// Retorna:
{
  predicted_kh_7days: 7.2,
  predicted_kh_30days: 6.8,
  confidence: 0.87,
  recommendation: "Aumentar dosagem em 15%"
}
```

================================================================================

  if (level_r03 < LEVEL_THRESHOLD) {
    Serial.println("ALERTA: Reservatório 03 vazio!");
    sendAlert("Reservatório de referência vazio");
  }
}


### Tratamento de Erros


// Erro 1: pH não estabiliza
if (abs(pH_current - pH_previous) > 0.1 after 60s) {
  result.error_message = "pH não estabilizou";
  result.is_valid = false;
  return ERROR_STATE;
}

// Erro 2: Temperatura fora da faixa
if (temp < 20.0 || temp > 30.0) {
  result.error_message = "Temperatura fora da faixa";
  result.confidence *= 0.5; // Reduz confiança
}

// Erro 3: Reservatório vazio
if (level_r03 < LEVEL_THRESHOLD) {
  result.error_message = "Reservatório de referência vazio";
  return ERROR_STATE;
}

// Erro 4: WiFi desconectado
// ESP32 completa medição offline
// Envia resultado quando reconectar (buffer local)
```

### Predição com IA

O backend usa TensorFlow.js para prever KH futuro:

```javascript
// Baseado em histórico de 30 dias
const prediction = await khPredictor.predict({
  measurements: last30Days,
  dosing_history: dosingLogs,
  evaporation_rate: 2.0 // L/dia
});

// Retorna:
{
  predicted_kh_7days: 7.2,
  predicted_kh_30days: 6.8,
  confidence: 0.87,
  recommendation: "Aumentar dosagem em 15%"
}
```


================================================================================

  if (level_r03 < LEVEL_THRESHOLD) {
    Serial.println("ALERTA: Reservatório 03 vazio!");
    sendAlert("Reservatório de referência vazio");
  }
}
```

### Tratamento de Erros

```cpp
// Erro 1: pH não estabiliza
if (abs(pH_current - pH_previous) > 0.1 after 60s) {
  result.error_message = "pH não estabilizou";
  result.is_valid = false;
  return ERROR_STATE;
}

// Erro 2: Temperatura fora da faixa
if (temp < 20.0 || temp > 30.0) {
  result.error_message = "Temperatura fora da faixa";
  result.confidence *= 0.5; // Reduz confiança
}

// Erro 3: Reservatório vazio
if (level_r03 < LEVEL_THRESHOLD) {
  result.error_message = "Reservatório de referência vazio";
  return ERROR_STATE;
}

// Erro 4: WiFi desconectado
// ESP32 completa medição offline
// Envia resultado quando reconectar (buffer local)
```

### Predição com IA

O backend usa TensorFlow.js para prever KH futuro:

```javascript
// Baseado em histórico de 30 dias
const prediction = await khPredictor.predict({
  measurements: last30Days,
  dosing_history: dosingLogs,
  evaporation_rate: 2.0 // L/dia
});

// Retorna:
{
  predicted_kh_7days: 7.2,
  predicted_kh_30days: 6.8,
  confidence: 0.87,
  recommendation: "Aumentar dosagem em 15%"
}
```


================================================================================

  if (level_r03 < LEVEL_THRESHOLD) {
    Serial.println("ALERTA: Reservatório 03 vazio!");
    sendAlert("Reservatório de referência vazio");
  }
}
```

### Tratamento de Erros

```cpp
// Erro 1: pH não estabiliza
if (abs(pH_current - pH_previous) > 0.1 after 60s) {
  result.error_message = "pH não estabilizou";
  result.is_valid = false;
  return ERROR_STATE;
}

// Erro 2: Temperatura fora da faixa
if (temp < 20.0 || temp > 30.0) {
  result.error_message = "Temperatura fora da faixa";
  result.confidence *= 0.5; // Reduz confiança
}

// Erro 3: Reservatório vazio
if (level_r03 < LEVEL_THRESHOLD) {
  result.error_message = "Reservatório de referência vazio";
  return ERROR_STATE;
}

// Erro 4: WiFi desconectado
// ESP32 completa medição offline
// Envia resultado quando reconectar (buffer local)
```

### Predição com IA

O backend usa TensorFlow.js para prever KH futuro:

```javascript
// Baseado em histórico de 30 dias
const prediction = await khPredictor.predict({
  measurements: last30Days,
  dosing_history: dosingLogs,
  evaporation_rate: 2.0 // L/dia
});

// Retorna:
{
  predicted_kh_7days: 7.2,
  predicted_kh_30days: 6.8,
  confidence: 0.87,
  recommendation: "Aumentar dosagem em 15%"
}
```


================================================================================
*/

// Sensores de nível
#define LEVEL_A_PIN       16
#define LEVEL_B_PIN       17
#define LEVEL_C_PIN        5
#define LEVEL_THRESHOLD  2500  // Use nos 3 sensores


// IA PUMP CONTROL (NOVOS!)
#define LEVEL_R01_PIN     LEVEL_A_PIN  // Reservatório 01
#define LEVEL_R02_PIN     LEVEL_B_PIN  // Reservatório 02  
#define LEVEL_R03_PIN     LEVEL_C_PIN  // Reservatório 03 (KH ref)

// Comandos pumps IA (VALORES SÃO BIT FLAGS, NÃO GPIO!)
#define PUMP_A_IN         1   // bit 0
// #define PUMP_B_OUT     2   // ⚠️ REMOVIDO - conflita com GPIO 2 (WiFi PHY)
#define PUMP_B_OUT        0x02  // bit 1 (usando hex para deixar claro que é flag)
#define PUMP_C_IN         4   // bit 2

// DS18B20 e pH
#define ONE_WIRE_BUS       4
#define PH_PIN            36
#define RESET_BUTTON_PIN  35

// Bombas (driver TB6612)
#define PUMP1_IN1   12
#define PUMP1_IN2   13
#define PUMP1_PWM   14

#define PUMP2_IN1   25
#define PUMP2_IN2   26
#define PUMP2_PWM   27

#define PUMP3_IN1   18
#define PUMP3_IN2   19
#define PUMP3_PWM   21


// Bombas (UNL) - KH CORREÇÃO
#define PUMP4_IN1  32  // Bomba 4 KH (forward)
#define PUMP4_IN2  33  // Bomba 4 KH (reverse)
#define PUMP4_PWM  22  // [FIX] GPIO 2 causa erro PHY WiFi, mudado para GPIO 22

#define COMPRESSOR_PIN 15  // Pino compressor

// Comandos IA expandidos
#define PUMP4_KH_CORRECT 8  // bit 3
#define COMPRESSOR_ON    16

// Botão BOOT
static const gpio_num_t WIFI_RESET_BTN_GPIO = GPIO_NUM_0;
