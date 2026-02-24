//HardwarePinsDoser.h
#ifndef HARDWARE_PINS_DOSER_H
#define HARDWARE_PINS_DOSER_H

#include <Arduino.h>

/*
================================================================================
   REEFBLUESKY DOSING SYSTEM - DOCUMENTAÇÃO DE HARDWARE
================================================================================

## 📋 VISÃO GERAL DO PROJETO

Sistema de dosagem automática com **ESP8266 NodeMCU** para aquários marinhos:
- Controle de até **6 bombas peristálticas** independentes
- Agendamento de doses via interface web (local e cloud)
- Calibração individual de cada bomba (mL/s)
- Conexão WiFi com servidor cloud (iot.reefbluesky.com.br)
- Notificações por Email e Telegram
- OTA (Over-The-Air) firmware updates

## 🔧 COMPONENTES NECESSÁRIOS

1. **NodeMCU ESP8266** (versão CP2102 ou CH340)
2. **Driver ULN2003** (Darlington array) ou **Relés 5V** (módulo 6 canais)
3. **6x Bombas Peristálticas Kamoer** (12V DC, 0.5-3 mL/min)
4. **Fonte 12V / 2A** (para alimentar bombas)
5. **Fonte 5V / 1A** (USB para NodeMCU)
6. **Botão de configuração** (opcional, pode usar botão FLASH interno)

## 📌 PINOUT COMPLETO - NodeMCU ESP8266

┌─────────────────────────────────────────────────────────────────────┐
│  FUNÇÃO          │ GPIO │ LABEL NodeMCU │ COMPONENTE/CONEXÃO        │
├─────────────────────────────────────────────────────────────────────┤
│ BOMBAS PERISTÁLTICAS (ULN2003 ou Relés)                             │
├─────────────────────────────────────────────────────────────────────┤
│  Bomba 1 (KH)    │  5   │      D1       │ ULN2003 IN1 / Relé CH1    │
│  Bomba 2 (CA)    │  4   │      D2       │ ULN2003 IN2 / Relé CH2    │
│  Bomba 3 (MG)    │  14  │      D5       │ ULN2003 IN3 / Relé CH3    │
│  Bomba 4 (P04)   │  12  │      D6       │ ULN2003 IN4 / Relé CH4    │
│  Bomba 5 (P05)   │  13  │      D7       │ ULN2003 IN5 / Relé CH5    │
│  Bomba 6 (P06)   │  15  │      D8       │ ULN2003 IN6 / Relé CH6    │
├─────────────────────────────────────────────────────────────────────┤
│ CONTROLE                                                            │
├─────────────────────────────────────────────────────────────────────┤
│  Botão Config    │  0   │    FLASH/D3   │ Botão interno (GPIO0)     │
├─────────────────────────────────────────────────────────────────────┤
│ RESERVADOS / NÃO USAR                                               │
├─────────────────────────────────────────────────────────────────────┤
│  TX (Serial)     │  1   │      TX       │ USB Serial (não usar!)    │
│  RX (Serial)     │  3   │      RX       │ USB Serial (não usar!)    │
│  D3 (boot)       │  0   │      D3       │ Usado para config WiFi    │
│  D4 (LED)        │  2   │      D4       │ LED interno (livre)       │
└─────────────────────────────────────────────────────────────────────┘

## 🔌 DIAGRAMA DE CONEXÕES

### OPÇÃO 1: Driver ULN2003 (Recomendado para 12V)

```
┌──────────────────────────────────────────────────────────────┐
│                         ULN2003                              │
│                      Darlington Array                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  NodeMCU          ULN2003             Bombas 12V            │
│  ┌─────┐         ┌──────┐            ┌──────┐              │
│  │     │         │      │            │      │              │
│  │  D1 ├────────→│ IN1  │────OUT1───→│ B1 + │              │
│  │  D2 ├────────→│ IN2  │────OUT2───→│ B2 + │              │
│  │  D5 ├────────→│ IN3  │────OUT3───→│ B3 + │              │
│  │  D6 ├────────→│ IN4  │────OUT4───→│ B4 + │              │
│  │  D7 ├────────→│ IN5  │────OUT5───→│ B5 + │              │
│  │  D8 ├────────→│ IN6  │────OUT6───→│ B6 + │              │
│  │     │         │      │            │      │              │
│  │ GND ├─────┬──→│ GND  │            │ GND  │←─┐           │
│  └─────┘     │   └──────┘            └──────┘  │           │
│              │      ↑                           │           │
│              │      │ COM (common)              │           │
│              │      └───────────────────────────┘           │
│              │                                              │
│              └────→ Fonte 12V GND                           │
│                                                              │
│  Fonte 12V (+) ────→ Todas as bombas (fio +)               │
└──────────────────────────────────────────────────────────────┘

Notas:
- ULN2003 inverte sinal: GPIO HIGH = bomba OFF, GPIO LOW = bomba ON
- COM conecta ao GND da fonte 12V
- Corrente máxima: 500mA por canal (suficiente para bombas peristálticas)
```

### OPÇÃO 2: Módulo Relé 6 Canais

```
┌──────────────────────────────────────────────────────────────┐
│                    Módulo Relé 6CH                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  NodeMCU          Relé 6CH            Bombas 12V            │
│  ┌─────┐         ┌──────┐            ┌──────┐              │
│  │     │         │      │            │      │              │
│  │  D1 ├────────→│ IN1  │─┐  NO1 ───→│ B1 + │              │
│  │  D2 ├────────→│ IN2  │ │  NO2 ───→│ B2 + │              │
│  │  D5 ├────────→│ IN3  │ │  NO3 ───→│ B3 + │              │
│  │  D6 ├────────→│ IN4  │─┤  NO4 ───→│ B4 + │              │
│  │  D7 ├────────→│ IN5  │ │  NO5 ───→│ B5 + │              │
│  │  D8 ├────────→│ IN6  │ │  NO6 ───→│ B6 + │              │
│  │     │         │      │ │          │      │              │
│  │ GND ├────────→│ GND  │ │          │ GND  │←─┐           │
│  │ 3V3 ├────────→│ VCC  │ │          └──────┘  │           │
│  └─────┘         └──────┘ │                    │           │
│                           COM ← Fonte 12V (+)  │           │
│                                                 │           │
│                    Fonte 12V GND ──────────────┘           │
└──────────────────────────────────────────────────────────────┘

Notas:
- Use relés com trigger em LOW (ativa em 0V, desativa em 3.3V)
- Jumper JD-VCC: remova para isolar ótica (recomendado)
- Alimentação: VCC do módulo = 3.3V NodeMCU, JD-VCC = 5V externo
- NO (Normalmente Aberto): usa este terminal para bombas
```

## ⚡ ALIMENTAÇÃO

```
┌──────────────────────────────────────────┐
│  Sistema de Alimentação                  │
├──────────────────────────────────────────┤
│                                          │
│  Fonte 12V/2A ────┬──→ Bombas (+)       │
│                   │                      │
│                   └──→ COM (ULN2003)    │
│                      ou COM (Relés)     │
│                                          │
│  Fonte 5V/1A USB ────→ NodeMCU (micro USB)│
│                                          │
│  ⚠️ IMPORTANTE:                          │
│  - Compartilhe GND entre todas as fontes │
│  - NodeMCU: 5V via USB (não Vin!)       │
│  - Bombas: 12V (não exceder 15V)        │
└──────────────────────────────────────────┘
```

## ⚠️ AVISOS IMPORTANTES

1. **GPIO0 (D3/FLASH)**:
   - Usado para entrar em modo configuração WiFi
   - Segure pressionado durante boot para modo AP
   - Não conecte cargas pesadas neste pino

2. **GPIO1/3 (TX/RX)**:
   - Reservados para comunicação serial USB
   - **NUNCA** use para bombas (interfere no upload)

3. **GPIO2 (D4)**:
   - LED interno do NodeMCU
   - Pode usar para status visual (livre no código atual)

4. **GPIO15 (D8)**:
   - Bomba 6
   - Deve estar em LOW durante boot (já tratado no código)

5. **Tensões**:
   - Lógica NodeMCU: **3.3V** (não tolera 5V!)
   - Se usar módulo relé 5V, verifique compatibilidade de trigger

6. **Corrente máxima por GPIO**: 12mA
   - ULN2003: OK (entrada de alta impedância)
   - Relé 5V: use com opto-isolador integrado

## 🧪 CALIBRAÇÃO DAS BOMBAS

1. **Acesse a interface web**: http://[IP_DO_ESP8266]
2. **Aba Calibração**: Selecione bomba
3. **Teste 60 segundos**: Clique "Iniciar Calibração"
4. **Meça o volume**: Use proveta graduada
5. **Digite o volume medido**: Sistema calcula mL/s automaticamente
6. **Salve**: Taxa armazenada na memória flash

**Exemplo**: Se 60 segundos = 95mL → Taxa = 1.583 mL/s

## 📡 MODOS DE OPERAÇÃO

### Modo Normal (WiFi Conectado)
- LED pisca rápido durante boot
- Conecta à rede WiFi configurada
- Autentica no servidor cloud
- Aguarda comandos de dosagem
- Envia status a cada 30 segundos

### Modo Configuração (Access Point)
- Segure GPIO0 durante boot (ou pressione 3× em 10s)
- Cria rede WiFi: **ReefBlueSky-DOSER-XXXXXX**
- Acesse: http://192.168.4.1
- Configure SSID/senha do WiFi principal
- Reinicia automaticamente após salvar

## 🔄 FLUXO DE DOSAGEM

```
┌─────────────────────────────────────────────┐
│  1. Cloud/Dashboard envia comando          │
│     POST /api/iot/doser/pump/X/dose        │
│     { "volume_ml": 10.5 }                  │
│                                             │
│  2. ESP8266 recebe e valida                │
│     - Bomba calibrada? (taxa > 0)          │
│     - Volume válido? (> 0 mL)              │
│                                             │
│  3. Calcula tempo: tempo_ms = volume / taxa│
│     Ex: 10.5 mL / 1.583 mL/s = 6.632 s     │
│                                             │
│  4. Ativa GPIO (bomba liga)                │
│     - ULN2003: LOW = ON                    │
│     - Relé: LOW = ON (trigger baixo)       │
│                                             │
│  5. Aguarda tempo calculado                │
│                                             │
│  6. Desativa GPIO (bomba desliga)          │
│     - ULN2003: HIGH = OFF                  │
│     - Relé: HIGH = OFF                     │
│                                             │
│  7. Envia confirmação ao servidor          │
│     - Dose concluída com sucesso           │
│     - Email/Telegram (se configurado)      │
└─────────────────────────────────────────────┘
```

## 🛠️ TROUBLESHOOTING

### Bomba não liga
- ✓ Verifique conexão GPIO ↔ ULN2003/Relé
- ✓ Teste tensão no GPIO: 0V = ON, 3.3V = OFF
- ✓ Bomba calibrada? (taxa mL/s > 0)
- ✓ Fonte 12V ligada e chegando na bomba?

### WiFi não conecta
- ✓ SSID/senha corretos em /doser_wifi_config.json?
- ✓ Sinal WiFi forte? (mín. -70 dBm)
- ✓ Roteador aceita ESP8266? (canais 1-11)

### Upload falha
- ✓ Porta COM correta selecionada?
- ✓ Driver CP2102/CH340 instalado?
- ✓ Nada conectado em TX/RX (GPIO1/3)?

### OTA não funciona
- ✓ ESP8266 conectado ao WiFi?
- ✓ Firmware novo compatível (.bin correto)?
- ✓ Espaço livre na flash? (mín. 200KB)

================================================================================
*/

#if defined(ESP8266)
// NodeMCU - 6 canais ULN2003 Kamoer 12V
static constexpr int DOSER_PUMP_PINS[6] = { 5, 4, 14, 12, 13, 15 }; // D1,D2,D5,D6,D7,D8
static constexpr int DOSER_BTN_CONFIG   = 0;   

// D3/D4 livres agora para futuro

#else // ESP32
// Mantenha seus 6 pinos ou expanda
static constexpr int DOSER_PUMP_PINS[6] = { 25, 26, 27, 14, 12, 13 };
static constexpr int DOSER_BTN_CONFIG   = 33;

#endif

#endif // HARDWARE_PINS_DOSER_H

