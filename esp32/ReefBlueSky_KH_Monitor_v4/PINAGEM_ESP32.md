# Pinagem ESP32 - ReefBlueSky KH Monitor v4

**Hardware:** ESP32 DevKit v1 (30 pinos)
**Última atualização:** 05/02/2026

---

## 📌 Tabela Completa de Pinagem

| GPIO | Pino Físico | Função | Componente | Tipo | Observações |
|------|-------------|--------|------------|------|-------------|
| **0** | D3 | Botão BOOT | WiFi Reset | INPUT_PULLUP | ⚠️ Boot/Flash - não usar para output |
| **1** | TX | PUMP_A_IN | Bomba A (controle IA) | - | ⚠️ TX Serial - evitar usar |
| **2** | D9 | ~~PUMP4_PWM~~ | ❌ **REMOVIDO** | - | ⚠️ **CONFLITO WiFi PHY - NÃO USAR!** |
| **3** | RX | - | Livre | - | ⚠️ RX Serial - evitar usar |
| **4** | D2 | ONE_WIRE_BUS | Sensor DS18B20 (Temp) | INPUT | Temperatura da água |
| **4** | D2 | PUMP_C_IN | Bomba C (controle IA) | - | ⚠️ Compartilhado com DS18B20 |
| **5** | D8 | LEVEL_C_PIN | Sensor nível C (KH ref) | INPUT | ADC - Reservatório 03 |
| **12** | D6 | PUMP1_IN1 | Bomba 1 - Direção 1 | OUTPUT | TB6612 Driver |
| **13** | D7 | PUMP1_IN2 | Bomba 1 - Direção 2 | OUTPUT | TB6612 Driver |
| **14** | D5 | PUMP1_PWM | Bomba 1 - PWM | OUTPUT PWM | TB6612 Driver |
| **15** | D15 | COMPRESSOR_PIN | Compressor de ar | OUTPUT | Controle on/off |
| **16** | D4 | LEVEL_A_PIN | Sensor nível A | INPUT | ADC - Reservatório 01 |
| **17** | D16 | LEVEL_B_PIN | Sensor nível B | INPUT | ADC - Reservatório 02 |
| **18** | D18 | PUMP3_IN1 | Bomba 3 - Direção 1 | OUTPUT | TB6612 Driver |
| **19** | D19 | PUMP3_IN2 | Bomba 3 - Direção 2 | OUTPUT | TB6612 Driver |
| **21** | D21 | PUMP3_PWM | Bomba 3 - PWM | OUTPUT PWM | TB6612 Driver |
| **22** | D22 | **PUMP4_PWM** | Bomba 4 - PWM (KH) | OUTPUT PWM | ✅ **NOVO** - ULN2003 |
| **23** | D23 | - | Livre | - | ✅ Disponível |
| **25** | D25 | PUMP2_IN1 | Bomba 2 - Direção 1 | OUTPUT | TB6612 Driver |
| **26** | D26 | PUMP2_IN2 | Bomba 2 - Direção 2 | OUTPUT | TB6612 Driver |
| **27** | D27 | PUMP2_PWM | Bomba 2 - PWM | OUTPUT PWM | TB6612 Driver |
| **32** | D32 | PUMP4_IN1 | Bomba 4 KH - Forward | OUTPUT | ULN2003 |
| **33** | D33 | PUMP4_IN2 | Bomba 4 KH - Reverse | OUTPUT | ULN2003 |
| **34** | D34 | - | Livre | INPUT ONLY | ⚠️ Somente input (ADC) |
| **35** | D35 | RESET_BUTTON_PIN | Botão Reset KH | INPUT | INPUT ONLY - ADC |
| **36** | VP/D36 | PH_PIN | Sensor pH | INPUT | ADC - INPUT ONLY |
| **39** | VN/D39 | - | Livre | INPUT ONLY | ⚠️ Somente input (ADC) |

---

## 🔧 Mudanças Recentes

### 05/02/2026 - Fix WiFi PHY Conflict
**Problema:** GPIO 2 causava erro `E (1798) phy_comm: gpio[0] number: 2 is reserved`

**Mudança:**
```diff
- #define PUMP4_PWM  2   // ❌ Conflito com WiFi
+ #define PUMP4_PWM  22  // ✅ GPIO seguro
```

**Ação necessária:**
- ⚠️ **Mover fio PWM da Bomba 4:** GPIO 2 → GPIO 22
- Recompilar e fazer upload do firmware

**Por que isso aconteceu:**
- GPIO 2 é usado internamente pelo módulo PHY do ESP32 (WiFi/Bluetooth)
- Usar GPIO 2 como output causa conflito intermitente
- Funciona às vezes (ordem de boot), falha outras vezes
- **Solução permanente:** NUNCA usar GPIO 2 para I/O externo

---

## ⚠️ GPIOs Especiais e Restrições

### GPIOs de Boot (não usar para output):
- **GPIO 0** - Boot mode (Flash/Run)
- **GPIO 2** - Boot strapping ⚠️ **CONFLITO WiFi PHY!**
- **GPIO 12** - Flash voltage (tolerado se não usado no boot)
- **GPIO 15** - Boot debug

### GPIOs Input-Only (ADC):
- **GPIO 34, 35, 36, 39** - Somente input, sem pullup/pulldown interno
- Ideais para: sensores analógicos, botões (com resistor externo)

### GPIOs Recomendados para PWM:
- ✅ **4, 5, 12-19, 21-23, 25-27, 32-33**
- ❌ **0, 2, 6-11, 15** - Evitar (boot strapping ou flash)

### Serial (TX/RX):
- **GPIO 1 (TX)** - Transmit serial
- **GPIO 3 (RX)** - Receive serial
- ⚠️ Podem ser usados, mas desabilita debug serial USB

---

## 🔌 Conexões por Componente

### **Sistema de Bombas (4 bombas + drivers)**

#### Bombas 1-3 (TB6612 Dual Motor Driver)
```
Bomba 1: GPIO 12 (IN1), GPIO 13 (IN2), GPIO 14 (PWM)
Bomba 2: GPIO 25 (IN1), GPIO 26 (IN2), GPIO 27 (PWM)
Bomba 3: GPIO 18 (IN1), GPIO 19 (IN2), GPIO 21 (PWM)
```

#### Bomba 4 - Correção KH (ULN2003)
```
Forward:  GPIO 32
Reverse:  GPIO 33
PWM:      GPIO 22 [MUDADO DE 2]
```

---

### **Sensores de Nível (3 sensores analógicos)**
```
Reservatório 1: GPIO 16 (LEVEL_A_PIN) - ADC
Reservatório 2: GPIO 17 (LEVEL_B_PIN) - ADC
Reservatório 3: GPIO 5  (LEVEL_C_PIN) - ADC (KH referência)

Threshold: 2500 (1.8V - seco/cheio)
```

---

### **Sensores Químicos**
```
pH:          GPIO 36 (VP) - ADC input-only
Temperatura: GPIO 4 (ONE_WIRE_BUS) - DS18B20 digital
```

---

### **Controles Adicionais**
```
Compressor:   GPIO 15 - OUTPUT on/off
Reset Button: GPIO 35 - INPUT (ADC, input-only)
WiFi Reset:   GPIO 0  - INPUT_PULLUP (BOOT button)
```

---

### **Flags de Controle IA (Software - NÃO são GPIOs!)**
```
PUMP_A_IN:  Bit 0 (0x01)
PUMP_B_OUT: Bit 1 (0x02) ⚠️ ATENÇÃO: É BIT FLAG, NÃO É GPIO 2!
PUMP_C_IN:  Bit 2 (0x04)
PUMP4_KH:   Bit 3 (0x08)
COMPRESSOR: Bit 4 (0x10)
```
**IMPORTANTE:** Estes são **bit flags** usados para comandos lógicos da IA, **NÃO são números de GPIO!**
- `PUMP_B_OUT = 0x02` significa "bit 1 ativado", não "usar GPIO 2"
- GPIO 2 NUNCA deve ser usado para I/O externo (conflita com WiFi PHY)

---

## 📊 Mapeamento de ADC (Sensores Analógicos)

| GPIO | Canal ADC | Função | Range |
|------|-----------|--------|-------|
| 36 (VP) | ADC1_CH0 | pH Sensor | 0-4095 |
| 39 (VN) | ADC1_CH3 | Livre | 0-4095 |
| 34 | ADC1_CH6 | Livre | 0-4095 |
| 35 | ADC1_CH7 | Reset Button | 0-4095 |
| 32 | ADC1_CH4 | Usado (PUMP4_IN1) | - |
| 33 | ADC1_CH5 | Usado (PUMP4_IN2) | - |
| 5 | ADC1_CH5 | Level C | 0-4095 |
| 16 | ADC2_CH5 | Level A | 0-4095 |
| 17 | ADC2_CH6 | Level B | 0-4095 |

⚠️ **ADC2 não pode ser usado quando WiFi está ativo!**
- Se usar WiFi, prefira ADC1 (GPIOs 32-39)
- GPIOs 16-17 (ADC2) podem ter leituras instáveis com WiFi

---

## 🔍 Diagnóstico de Problemas

### WiFi não conecta
**Sintoma:** Erro `phy_comm: gpio[0] number: 2 is reserved`

**Causa:** GPIO 2 sendo usado para output (PWM, digitalWrite, etc)

**Solução:**
1. Verificar se GPIO 2 está em uso
2. Mudar para GPIO seguro (22, 23, etc)
3. Recompilar firmware

---

### Leituras analógicas instáveis
**Causa possível:** Usando ADC2 (GPIO 16-17) com WiFi ativo

**Solução:**
- Preferir ADC1 (GPIO 32-39) para sensores críticos
- Desabilitar WiFi temporariamente durante leitura ADC2
- Adicionar capacitor de filtro (0.1µF) no sensor

---

### Bomba não responde
**Verificar:**
1. GPIO configurado como OUTPUT?
2. Driver conectado corretamente?
3. Alimentação externa do driver OK?
4. PWM funcionando? (usar `ledcWrite()` no ESP32)

---

## 📝 Notas de Desenvolvimento

### PWM no ESP32
- **16 canais PWM disponíveis** (LEDC)
- Resolução: 1-16 bits (comum: 8 bits = 0-255)
- Frequência: 1-40MHz (comum: 5kHz para motores)

**Exemplo de uso:**
```cpp
ledcSetup(channel, freq, resolution);
ledcAttachPin(gpio, channel);
ledcWrite(channel, duty);
```

### Interrupções
- **Todos os GPIOs** suportam interrupções (exceto 6-11)
- Use `attachInterrupt(gpio, ISR, mode)`

### I2C / SPI
- **I2C padrão:** GPIO 21 (SDA), GPIO 22 (SCL)
  - ⚠️ GPIO 22 agora usado para PUMP4_PWM!
  - Se precisar I2C, usar outros GPIOs com `Wire.begin(SDA, SCL)`
- **SPI padrão:** GPIO 18 (CLK), 19 (MISO), 23 (MOSI), 5 (CS)
  - ⚠️ Conflito com Bomba 3 e Level C!

---

## 🚀 Checklist de Hardware

Ao montar o sistema, verificar:

- [ ] PUMP4_PWM conectado no **GPIO 22** (NÃO no GPIO 2!)
- [ ] Sensores de nível em GPIOs ADC corretos (5, 16, 17)
- [ ] pH sensor em GPIO 36 (VP)
- [ ] DS18B20 em GPIO 4 com resistor pullup 4.7kΩ
- [ ] Botões com resistores pullup externos (se GPIO 34-39)
- [ ] Alimentação dos drivers separada (não alimentar motores direto do ESP!)
- [ ] GND comum entre ESP32 e todos os drivers

---

## 📚 Referências

- [ESP32 Pinout Reference](https://randomnerdtutorials.com/esp32-pinout-reference-gpios/)
- [ESP32 ADC Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/adc.html)
- [ESP32 LEDC (PWM) Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/peripherals/ledc.html)

---

**Última revisão:** 05/02/2026
**Versão do Firmware:** ReefBlueSky_KH_Monitor_v4
**Hardware:** ESP32 DevKit v1 (30 pinos)
