# ReefBlueSky KH Monitor - Guia Completo de Fiação e Fonte de Alimentação

## 📊 Cálculo de Consumo de Energia

### Componentes e Consumo Individual

| Componente | Tensão | Corrente | Potência | Observações |
|-----------|--------|----------|----------|------------|
| ESP32 | 3.3V | 80-160 mA | 0.26-0.53 W | WiFi ativo |
| Bomba Kamoer 1 (Peristáltica) | 12V | 0.5-1.0 A | 6-12 W | Funcionando |
| Bomba Kamoer 2 (Peristáltica) | 12V | 0.5-1.0 A | 6-12 W | Funcionando |
| Bomba Kamoer 3 (Peristáltica) | 12V | 0.5-1.0 A | 6-12 W | Funcionando |
| Bomba Kamoer 4 (Peristáltica) | 12V | 0.5-1.0 A | 6-12 W | Funcionando |
| Sensor pH PH-4502C | 5V | 10-20 mA | 0.05-0.1 W | Contínuo |
| Sensor Temperatura DS18B20 | 5V | 1 mA | 0.005 W | Contínuo |
| Driver TB6612FNG (2x) | 5V | 50-100 mA | 0.25-0.5 W | Controlando bombas |
| Driver ULN2003 (2x) | 5V | 50-100 mA | 0.25-0.5 W | Controlando bombas |
| LED Indicador | 5V | 20 mA | 0.1 W | Status |

### Consumo Total

**Cenário 1: Repouso (Standby)**
- ESP32 + Sensores + Drivers: ~0.5 W
- Total: **0.5 W**

**Cenário 2: Medição Ativa (Todas as 4 bombas funcionando)**
- ESP32 + Sensores + Drivers: ~1.0 W
- 4 Bombas: 24-48 W
- Total: **25-49 W** (pico)

**Cenário 3: Operação Normal (1-2 bombas funcionando)**
- ESP32 + Sensores + Drivers: ~1.0 W
- 1-2 Bombas: 6-24 W
- Total: **7-25 W** (típico)

## 🔌 Fonte de Alimentação Recomendada

### Opção 1: Fonte Única 12V (RECOMENDADA)
**Especificações:**
- Tensão: 12V DC
- Corrente: 5A mínimo (recomendado 10A para margem de segurança)
- Potência: 60W mínimo (recomendado 120W)
- Tipo: Fonte chaveada com regulação
- Conector: 5.5mm x 2.1mm (padrão)

**Vantagens:**
- Simples e econômica
- Fácil de encontrar
- Regulador LDO 12V→5V para sensores
- Regulador LDO 5V→3.3V para ESP32

**Desvantagens:**
- Requer reguladores adicionais
- Maior dissipação de calor nos reguladores

**Modelos Recomendados:**
- Meanwell RSP-60-12 (60W, industrial)
- Meanwell RSP-120-12 (120W, industrial)
- Fonte genérica 12V 10A (uso hobista)

### Opção 2: Fonte Dupla (12V + 5V)
**Especificações:**
- Saída 1: 12V DC, 5A (para bombas)
- Saída 2: 5V DC, 3A (para sensores e drivers)
- Potência Total: 80W mínimo

**Vantagens:**
- Melhor eficiência energética
- Menos dissipação de calor
- Mais profissional

**Desvantagens:**
- Mais cara
- Mais complexa de encontrar

### Opção 3: Fonte 12V + Reguladores Separados (MAIS ECONÔMICA)
**Especificações:**
- Fonte 12V DC, 5A
- Regulador LDO 12V→5V, 3A (LM7805 ou similar)
- Regulador LDO 5V→3.3V, 1A (AMS1117 ou similar)

**Vantagens:**
- Muito econômica
- Fácil de encontrar componentes
- Flexível

**Desvantagens:**
- Requer montagem adicional
- Mais dissipação de calor

## 🔗 Esquema de Fiação Detalhado

### Distribuição de Tensões

```
Fonte 12V DC
    |
    +---- 12V para Bombas Kamoer (4x)
    |
    +---- Regulador LDO 12V→5V (3A)
            |
            +---- 5V para Sensores (pH, Temperatura)
            |
            +---- 5V para Drivers (TB6612FNG, ULN2003)
            |
            +---- Regulador LDO 5V→3.3V (1A)
                    |
                    +---- 3.3V para ESP32
                    |
                    +---- 3.3V para LED Indicador
```

### Pinagem Detalhada do ESP32

#### Alimentação
- **3.3V**: Pino 3.3V (saída do regulador 5V→3.3V)
- **GND**: Pino GND (comum com todas as massas)
- **5V**: Pino 5V (entrada do regulador 5V→3.3V)

#### Bombas (via Drivers)
- **GPIO 12**: Bomba 1 - Entrada PWM TB6612FNG (AIN1)
- **GPIO 13**: Bomba 1 - Controle Direção TB6612FNG (AIN2)
- **GPIO 14**: Bomba 2 - Entrada PWM TB6612FNG (BIN1)
- **GPIO 15**: Bomba 2 - Controle Direção TB6612FNG (BIN2)
- **GPIO 16**: Bomba 3 - Entrada ULN2003 (IN1)
- **GPIO 17**: Bomba 3 - Entrada ULN2003 (IN2)
- **GPIO 18**: Bomba 4 - Entrada ULN2003 (IN3)
- **GPIO 19**: Bomba 4 - Entrada ULN2003 (IN4)

#### Sensores
- **GPIO 32**: Sensor pH (Entrada Analógica ADC)
- **GPIO 33**: Sensor Temperatura DS18B20 (OneWire)
- **GPIO 34**: Sensor Nível Câmara A (Entrada Analógica ADC)
- **GPIO 35**: Sensor Nível Câmara B (Entrada Analógica ADC)

#### Comunicação
- **GPIO 1**: TX (UART para Debug/Logs)
- **GPIO 3**: RX (UART para Debug/Logs)

#### Indicadores
- **GPIO 2**: LED Indicador Status (PWM)

## 🔌 Especificações de Fiação

### Calibre de Fio (AWG)

| Circuito | Corrente | Calibre Recomendado | Calibre Mínimo | Comprimento Máximo |
|----------|----------|-------------------|-----------------|-------------------|
| Alimentação 12V Principal | 5A | 0.75 mm² (18 AWG) | 0.50 mm² (20 AWG) | 10m |
| Alimentação 12V Bombas | 4A | 0.75 mm² (18 AWG) | 0.50 mm² (20 AWG) | 5m |
| Alimentação 5V | 3A | 0.50 mm² (20 AWG) | 0.35 mm² (22 AWG) | 3m |
| Alimentação 3.3V | 1A | 0.35 mm² (22 AWG) | 0.25 mm² (24 AWG) | 1m |
| Sensores | 20-100 mA | 0.25 mm² (24 AWG) | 0.14 mm² (26 AWG) | 2m |
| Massa (GND) | 5A | 0.75 mm² (18 AWG) | 0.50 mm² (20 AWG) | 10m |

### Conectores Recomendados

| Conexão | Tipo | Especificação |
|---------|------|---------------|
| Fonte 12V | Conector DC | 5.5mm x 2.1mm (positivo central) |
| Bombas | Conector JST | 2.54mm pitch, 2 pinos |
| Sensores | Conector JST | 2.54mm pitch, 2-3 pinos |
| Drivers | Conector JST | 2.54mm pitch, 4 pinos |
| ESP32 | Header | 2.54mm pitch (padrão) |

## ⚡ Reguladores de Tensão

### Regulador 12V → 5V (LM7805)

**Especificações:**
- Entrada: 12V DC
- Saída: 5V DC, até 1.5A
- Corrente de repouso: 5mA
- Temperatura máxima: 125°C

**Esquema de Conexão:**
```
Entrada 12V ----[10µF Cap]---- LM7805 ----[10µF Cap]---- Saída 5V
                                  |
                                 GND
```

**Capacitores:**
- Entrada: 10µF (eletrolítico)
- Saída: 10µF (eletrolítico)

### Regulador 5V → 3.3V (AMS1117)

**Especificações:**
- Entrada: 5V DC
- Saída: 3.3V DC, até 1A
- Corrente de repouso: 5mA
- Temperatura máxima: 125°C

**Esquema de Conexão:**
```
Entrada 5V ----[10µF Cap]---- AMS1117 ----[10µF Cap]---- Saída 3.3V
                                  |
                                 GND
```

**Capacitores:**
- Entrada: 10µF (eletrolítico)
- Saída: 10µF (eletrolítico)

## 🛡️ Proteção e Segurança

### Fusíveis Recomendados

| Circuito | Corrente Nominal | Tipo | Localização |
|----------|-----------------|------|------------|
| Alimentação Principal 12V | 5A | Fusível Rápido | Próximo à fonte |
| Alimentação Bombas | 4A | Fusível Rápido | Antes do driver |
| Alimentação Sensores 5V | 3A | Fusível Rápido | Após regulador |

### Diodos de Proteção

**Diodo de Proteção de Polaridade (1N4007):**
- Localização: Entre fonte 12V e circuito principal
- Função: Protege contra inversão de polaridade

**Diodos de Proteção de Bomba (1N4007):**
- Localização: Em paralelo com cada bobina de bomba
- Função: Protege contra picos de tensão indutivos

## 📋 Lista de Componentes de Fiação

| Item | Quantidade | Especificação | Preço Estimado |
|------|-----------|---------------|-----------------|
| Fonte 12V 5A | 1 | Chaveada, 60W | R$ 50-100 |
| Regulador LM7805 | 1 | 12V→5V, 1.5A | R$ 5-10 |
| Regulador AMS1117 | 1 | 5V→3.3V, 1A | R$ 5-10 |
| Capacitor 10µF | 4 | Eletrolítico, 16V | R$ 2-5 |
| Diodo 1N4007 | 5 | Proteção | R$ 1-2 |
| Fusível 5A | 2 | Rápido | R$ 2-5 |
| Fio 0.75 mm² (18 AWG) | 5m | Vermelho/Preto | R$ 5-10 |
| Fio 0.50 mm² (20 AWG) | 10m | Vermelho/Preto | R$ 5-10 |
| Fio 0.25 mm² (24 AWG) | 20m | Colorido | R$ 5-10 |
| Conectores JST | 20 | 2.54mm pitch | R$ 5-10 |
| Conector DC 5.5mm | 2 | Macho/Fêmea | R$ 5-10 |

**Custo Total de Fiação: R$ 100-200**

## 🔧 Montagem Passo-a-Passo

### 1. Preparação da Fonte
1. Conecte a fonte 12V à tomada
2. Verifique a tensão com multímetro (deve ser 12V)
3. Instale o fusível de proteção (5A)

### 2. Instalação dos Reguladores
1. Monte o regulador LM7805 em um dissipador de calor
2. Conecte os capacitores conforme esquema
3. Teste a saída (deve ser 5V)
4. Monte o regulador AMS1117
5. Teste a saída (deve ser 3.3V)

### 3. Fiação do ESP32
1. Conecte 3.3V ao pino 3.3V do ESP32
2. Conecte GND ao pino GND do ESP32
3. Conecte os pinos de GPIO conforme mapeamento

### 4. Fiação das Bombas
1. Conecte 12V aos drivers de bomba
2. Conecte os pinos GPIO do ESP32 aos drivers
3. Conecte as bombas aos drivers
4. Instale diodos de proteção em paralelo

### 5. Fiação dos Sensores
1. Conecte 5V ao sensor pH
2. Conecte o pino analógico do ESP32 ao sensor
3. Conecte o sensor de temperatura (OneWire)
4. Instale resistor pull-up de 4.7kΩ no OneWire

## ⚠️ Precauções Importantes

1. **Sempre desconecte a fonte antes de fazer alterações**
2. **Use fio com bitola adequada para evitar aquecimento**
3. **Instale fusíveis em todos os circuitos críticos**
4. **Use diodos de proteção nas bobinas das bombas**
5. **Verifique polaridade antes de conectar**
6. **Use dissipadores de calor nos reguladores**
7. **Mantenha distância de água e umidade**
8. **Teste com multímetro antes de ligar**

## 📞 Troubleshooting

| Problema | Causa Provável | Solução |
|----------|-----------------|---------|
| ESP32 não liga | Sem alimentação 3.3V | Verificar regulador AMS1117 |
| Bombas não funcionam | Sem 12V | Verificar fonte e fusível |
| Sensores não leem | Sem 5V | Verificar regulador LM7805 |
| Aquecimento excessivo | Regulador sobrecarregado | Usar dissipador maior |
| Picos de tensão | Sem diodos de proteção | Instalar diodos 1N4007 |

---

**Versão**: 1.0
**Data**: Novembro 2025
**Autor**: Manus AI
