# ReefBlueSky KH Monitor - Manual de Montagem Completo

## 📋 Índice

1. [Introdução](#introdução)
2. [Ferramentas Necessárias](#ferramentas-necessárias)
3. [Componentes e Materiais](#componentes-e-materiais)
4. [Preparação do Espaço de Trabalho](#preparação-do-espaço-de-trabalho)
5. [Montagem da Eletrônica](#montagem-da-eletrônica)
6. [Montagem Hidráulica](#montagem-hidráulica)
7. [Integração de Componentes](#integração-de-componentes)
8. [Testes Iniciais](#testes-iniciais)
9. [Calibração](#calibração)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 Introdução

Este manual guia você passo-a-passo na montagem do ReefBlueSky KH Monitor. O projeto é modular, permitindo que você construa em etapas e teste cada componente antes de prosseguir.

**Tempo Estimado de Montagem**: 8-12 horas (primeira vez)
**Nível de Dificuldade**: Intermediário
**Conhecimentos Necessários**: Eletrônica básica, soldagem, hidráulica simples

---

## 🔧 Ferramentas Necessárias

### Ferramentas Eletrônicas
- ✅ Ferro de solda (25-40W)
- ✅ Multímetro digital
- ✅ Alicate de corte
- ✅ Alicate de bico
- ✅ Chave de fenda (Phillips e plana)
- ✅ Chave inglesa ou chave de boca
- ✅ Testador de continuidade (ou multímetro)

### Ferramentas Hidráulicas
- ✅ Tesoura ou faca para cortar mangueira
- ✅ Furador de mangueira (opcional, para conectores)
- ✅ Fita de vedação (PTFE/Teflon)

### Materiais de Consumo
- ✅ Solda (60/40 ou 63/37)
- ✅ Pasta de solda
- ✅ Álcool isopropílico
- ✅ Fita isolante
- ✅ Canaleta para fios
- ✅ Velcro industrial
- ✅ Pasta térmica

### Equipamentos de Segurança
- ✅ Óculos de proteção
- ✅ Luvas de trabalho
- ✅ Avental
- ✅ Extintor de incêndio (próximo ao ferro de solda)

---

## 📦 Componentes e Materiais

### Eletrônica (Custo Total: ~R$ 400)

| Item | Quantidade | Especificação | Custo |
|------|-----------|---------------|-------|
| ESP32 WROOM-32 | 1 | Microcontrolador | R$ 50 |
| Fonte CFTV 12V 10A | 1 | 120W, Conector DC | R$ 60 |
| Stepdown LM2596 12V→5V | 1 | 3A, Pré-montado | R$ 20 |
| Stepdown LM2596 5V→3.3V | 1 | 3A, Pré-montado | R$ 20 |
| Sensor pH PH-4502C | 1 | Eletrodo de pH | R$ 80 |
| Sensor DS18B20 | 1 | Temperatura digital | R$ 5 |
| Sensores Capacitivos | 2 | Nível de água | R$ 30 |
| Driver TB6612FNG | 2 | Controle motor | R$ 10 |
| Driver ULN2003 | 2 | Controle motor | R$ 10 |
| Fotoacoplador PC817 | 1 | Isolamento | R$ 3 |
| Resistor 1kΩ 0.25W | 1 | Limitador corrente | R$ 1 |
| Capacitor 10µF | 4 | Eletrolítico 16V | R$ 2 |
| Diodo 1N4007 | 5 | Proteção | R$ 1 |
| Fusível 5A | 2 | Rápido | R$ 2 |
| Conectores JST | 20 | 2.54mm pitch | R$ 5 |
| Conector DC 5.5mm | 2 | Macho/Fêmea | R$ 5 |
| Fios (0.25-0.75mm²) | 50m | Coloridos | R$ 30 |
| **TOTAL ELETRÔNICA** | | | **R$ 334** |

### Hidráulica (Custo Total: ~R$ 350)

| Item | Quantidade | Especificação | Custo |
|------|-----------|---------------|-------|
| Bomba Kamoer 1 | 4 | 12V Peristáltica | R$ 120 |
| Câmaras de Medição | 3 | 50ml, 50ml, 200ml | R$ 60 |
| Mangueira Silicone | 10m | 6mm OD, 4mm ID | R$ 40 |
| Conectores Rápidos | 20 | 6mm | R$ 30 |
| Válvulas de Retenção | 4 | Unidirecional | R$ 20 |
| Compressor 5V | 1 | Injeção de ar | R$ 50 |
| Tubo de Ar | 5m | 4mm OD | R$ 10 |
| Difusor de Ar | 2 | Pedra porosa | R$ 10 |
| Suportes e Abraçadeiras | - | Diversos | R$ 10 |
| **TOTAL HIDRÁULICA** | | | **R$ 350** |

### Mecânica (Custo Total: ~R$ 150)

| Item | Quantidade | Especificação | Custo |
|------|-----------|---------------|-------|
| Gabinete Plástico | 1 | 300x200x150mm | R$ 50 |
| Dissipador Alumínio | 1 | 40x40x20mm | R$ 10 |
| Parafusos M3 | 20 | Aço inox | R$ 5 |
| Porcas M3 | 20 | Aço inox | R$ 5 |
| Espaçadores | 10 | Plástico | R$ 5 |
| Velcro Industrial | 2 | Rolo | R$ 20 |
| Canaleta | 5m | Plástica | R$ 15 |
| Etiquetas | 1 | Impressas | R$ 10 |
| Pasta Térmica | 1 | 10g | R$ 5 |
| Isolante Térmico | 1 | Espuma | R$ 10 |
| **TOTAL MECÂNICA** | | | **R$ 135** |

**CUSTO TOTAL DO PROJETO: ~R$ 819**

---

## 🏗️ Preparação do Espaço de Trabalho

### Setup Recomendado

```
┌─────────────────────────────────────────────────────┐
│              BANCADA DE TRABALHO                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ Ferro Solda  │  │ Multímetro   │               │
│  │ + Esponja    │  │ + Testador   │               │
│  └──────────────┘  └──────────────┘               │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Componentes Organizados por Categoria       │  │
│  │  - Eletrônica                                │  │
│  │  - Hidráulica                                │  │
│  │  - Mecânica                                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ Gabinete     │  │ Placa ESP32  │               │
│  │ Aberto       │  │ + Drivers    │               │
│  └──────────────┘  └──────────────┘               │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Área de Testes (Multímetro, Fonte)          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Organização de Componentes

1. **Separar por categoria** em pequenos potes
2. **Etiquetar tudo** com nome e quantidade
3. **Manter ferramentas acessíveis** no centro
4. **Deixar espaço para testes** à direita
5. **Manter extintor próximo** ao ferro de solda

---

## 🔌 Montagem da Eletrônica

### Etapa 1: Preparação da Placa Base

```
Tempo: 30 minutos
Dificuldade: Fácil

Passos:
1. Limpe a placa com álcool isopropílico
2. Deixe secar completamente (5 min)
3. Verifique se não há pistas soltas
4. Inspecione com lupa (se disponível)
```

### Etapa 2: Soldagem dos Reguladores

```
Tempo: 45 minutos
Dificuldade: Intermediária

Componentes:
- Stepdown LM2596 12V→5V
- Stepdown LM2596 5V→3.3V
- Capacitores 10µF (4x)
- Diodos 1N4007 (5x)

Procedimento:
1. Coloque o stepdown 12V→5V na placa
2. Solde os 4 pinos (use pasta de solda)
3. Verifique continuidade com multímetro
4. Repita para stepdown 5V→3.3V
5. Solde os capacitores de entrada/saída
6. Solde os diodos de proteção
7. Teste cada regulador (12V, 5V, 3.3V)
```

### Etapa 3: Soldagem dos Drivers

```
Tempo: 1 hora
Dificuldade: Intermediária

Componentes:
- Driver TB6612FNG (2x)
- Driver ULN2003 (2x)
- Resistores pull-up (conforme necessário)

Procedimento:
1. Solde o TB6612FNG na placa
2. Solde o ULN2003 na placa
3. Conecte os pinos de controle ao ESP32
4. Verifique continuidade de todos os pinos
5. Teste com multímetro (sem energia)
```

### Etapa 4: Integração do ESP32

```
Tempo: 30 minutos
Dificuldade: Fácil

Procedimento:
1. Coloque o ESP32 em headers (não solde diretamente)
2. Conecte 3.3V ao pino 3.3V
3. Conecte GND ao pino GND
4. Verifique polaridade com multímetro
5. Conecte os pinos de GPIO conforme mapeamento
6. Deixe espaço para programação (USB)
```

### Etapa 5: Integração de Sensores

```
Tempo: 1 hora
Dificuldade: Intermediária

Sensores:
- Sensor pH PH-4502C
- Sensor Temperatura DS18B20
- Sensores Capacitivos (Nível)

Procedimento:
1. Solde conectores JST nos sensores
2. Conecte sensor pH ao GPIO 32 (ADC)
3. Conecte sensor temperatura ao GPIO 33 (OneWire)
4. Conecte sensores de nível aos GPIO 34/35 (ADC)
5. Instale resistor pull-up 4.7kΩ no OneWire
6. Teste cada sensor com multímetro
```

### Etapa 6: Integração do Fotoacoplador

```
Tempo: 20 minutos
Dificuldade: Fácil

Procedimento:
1. Solde o fotoacoplador PC817 na placa
2. Solde o resistor 1kΩ em série com o LED
3. Conecte ao GPIO 20 do ESP32
4. Conecte a saída ao compressor 5V
5. Teste com multímetro (sem energia)
```

---

## 💧 Montagem Hidráulica

### Etapa 1: Preparação das Câmaras

```
Tempo: 45 minutos
Dificuldade: Intermediária

Materiais:
- 3 Câmaras (50ml, 50ml, 200ml)
- Conectores rápidos
- Mangueira silicone 6mm
- Fita PTFE

Procedimento:
1. Limpe as câmaras com água destilada
2. Deixe secar completamente
3. Instale os conectores rápidos nas câmaras
4. Verifique se não há vazamentos
5. Teste com água (sem pressão)
```

### Etapa 2: Instalação das Bombas

```
Tempo: 1 hora
Dificuldade: Intermediária

Materiais:
- 4 Bombas Kamoer 12V
- Conectores rápidos
- Mangueira silicone 6mm
- Válvulas de retenção

Procedimento:
1. Coloque as bombas em suportes
2. Conecte a entrada da bomba 1 ao reservatório
3. Conecte a saída da bomba 1 à câmara A
4. Instale válvula de retenção na saída
5. Repita para bombas 2, 3 e 4
6. Teste cada bomba individualmente (com água)
```

### Etapa 3: Instalação do Sistema de Ar

```
Tempo: 30 minutos
Dificuldade: Fácil

Materiais:
- Compressor 5V
- Tubo de ar 4mm
- Difusores (pedra porosa)
- Conectores de ar

Procedimento:
1. Coloque o compressor em suporte
2. Conecte o tubo de ar à saída do compressor
3. Instale difusores nas câmaras B e C
4. Teste o compressor (com energia)
5. Verifique fluxo de ar
```

### Etapa 4: Teste Hidráulico Completo

```
Tempo: 1 hora
Dificuldade: Intermediária

Procedimento:
1. Encha o reservatório com água destilada
2. Ligue cada bomba individualmente
3. Verifique se há vazamentos
4. Teste o fluxo de cada câmara
5. Verifique a pressão com manômetro (se disponível)
6. Corrija qualquer vazamento com fita PTFE
```

---

## 🔗 Integração de Componentes

### Etapa 1: Montagem no Gabinete

```
Tempo: 1 hora
Dificuldade: Fácil

Procedimento:
1. Coloque a fonte CFTV no fundo do gabinete
2. Fixe com parafusos M3 (deixe espaço para ventilação)
3. Coloque os reguladores próximos à fonte
4. Fixe a placa ESP32 com espaçadores
5. Organize os fios com canaleta
6. Deixe espaço para dissipador de calor
```

### Etapa 2: Conexão de Energia

```
Tempo: 30 minutos
Dificuldade: Intermediária

Procedimento:
1. Conecte o conector DC da fonte aos reguladores
2. Instale o fusível de proteção (5A)
3. Verifique polaridade com multímetro
4. Teste cada tensão (12V, 5V, 3.3V)
5. Corrija qualquer problema antes de prosseguir
```

### Etapa 3: Conexão de Sensores e Bombas

```
Tempo: 1 hora
Dificuldade: Intermediária

Procedimento:
1. Conecte sensor pH ao GPIO 32
2. Conecte sensor temperatura ao GPIO 33
3. Conecte sensores de nível aos GPIO 34/35
4. Conecte drivers de bomba aos GPIO 12-19
5. Conecte compressor ao fotoacoplador (GPIO 20)
6. Verifique todas as conexões
```

### Etapa 4: Teste de Integração

```
Tempo: 1 hora
Dificuldade: Intermediária

Procedimento:
1. Ligue a fonte (sem ESP32 programado)
2. Verifique tensões em todos os pontos
3. Teste cada sensor com multímetro
4. Teste cada bomba individualmente
5. Teste o compressor com GPIO
6. Corrija qualquer problema
```

---

## ✅ Testes Iniciais

### Teste 1: Verificação de Tensões

```
Procedimento:
1. Desligue tudo
2. Ligue a fonte
3. Meça 12V na saída da fonte
4. Meça 5V na saída do regulador 1
5. Meça 3.3V na saída do regulador 2
6. Verifique GND em todos os pontos

Valores Esperados:
- 12V: 11.5V - 12.5V ✅
- 5V: 4.9V - 5.1V ✅
- 3.3V: 3.2V - 3.4V ✅
```

### Teste 2: Teste de Sensores

```
Procedimento:
1. Conecte sensor pH à entrada ADC
2. Leia valor no monitor serial
3. Coloque sensor em água com pH conhecido
4. Verifique se a leitura muda
5. Repita para sensor de temperatura

Valores Esperados:
- pH: 0-4095 (ADC 12-bit)
- Temperatura: -10°C a +85°C
```

### Teste 3: Teste de Bombas

```
Procedimento:
1. Encha o reservatório com água
2. Ligue a bomba 1 com PWM 50%
3. Verifique se a bomba funciona
4. Teste velocidade variando PWM
5. Repita para todas as 4 bombas

Valores Esperados:
- Bomba liga/desliga com GPIO
- Velocidade varia com PWM
- Sem ruídos anormais
```

### Teste 4: Teste do Compressor

```
Procedimento:
1. Ligue o compressor com GPIO 20
2. Verifique se há fluxo de ar
3. Teste injeção de ar nas câmaras
4. Verifique pressão do ar

Valores Esperados:
- Compressor liga/desliga com GPIO
- Fluxo de ar visível
- Sem vazamentos
```

---

## 🔧 Calibração

### Calibração do Sensor pH

```
Procedimento:
1. Prepare 3 soluções de calibração (pH 4, 7, 10)
2. Mergulhe o sensor na solução pH 7
3. Aguarde 2 minutos
4. Anote o valor ADC
5. Repita para pH 4 e 10
6. Calcule a curva de calibração
7. Atualize o código com os valores
```

### Calibração do Sensor de Temperatura

```
Procedimento:
1. Prepare água em diferentes temperaturas
2. Mergulhe o sensor em cada temperatura
3. Aguarde 1 minuto
4. Anote o valor lido
5. Compare com termômetro de referência
6. Corrija se necessário
```

### Calibração de KH

```
Procedimento:
1. Prepare água com KH conhecido (ex: 8 dKH)
2. Coloque no reservatório C
3. Execute o ciclo de calibração
4. Insira o valor de KH conhecido no sistema
5. O sistema ajustará o fator de calibração
6. Teste com 3 amostras diferentes
7. Verifique precisão (±0.1 dKH)
```

---

## 🐛 Troubleshooting

### Problema: Sem Tensão de Saída

**Causas Possíveis:**
- Fonte não ligada
- Fusível queimado
- Cabo desconectado
- Regulador defeituoso

**Solução:**
1. Verifique se a fonte está ligada
2. Teste o fusível com multímetro
3. Verifique conexões
4. Troque o regulador

### Problema: Tensão Baixa

**Causas Possíveis:**
- Sobrecarga
- Fio fino demais
- Conexão solta
- Regulador com problema

**Solução:**
1. Reduza a carga
2. Use fio mais grosso
3. Aperte as conexões
4. Teste com multímetro

### Problema: Bomba Não Funciona

**Causas Possíveis:**
- Sem alimentação
- GPIO não funciona
- Bomba entupida
- Driver defeituoso

**Solução:**
1. Verifique tensão na bomba
2. Teste GPIO com LED
3. Limpe a bomba
4. Troque o driver

### Problema: Sensor Não Lê

**Causas Possíveis:**
- Sem alimentação
- Cabo desconectado
- Sensor defeituoso
- GPIO configurado errado

**Solução:**
1. Verifique tensão no sensor
2. Verifique conexão
3. Troque o sensor
4. Verifique código

---

## 📊 Checklist Final

- [ ] Todas as tensões verificadas
- [ ] Todos os sensores testados
- [ ] Todas as bombas testadas
- [ ] Compressor testado
- [ ] Sem vazamentos hidráulicos
- [ ] Sem aquecimento excessivo
- [ ] Código carregado no ESP32
- [ ] WiFi conectado
- [ ] Website acessível
- [ ] Calibração concluída
- [ ] Primeira medição realizada
- [ ] Histórico armazenado

---

**Parabéns! Seu ReefBlueSky KH Monitor está montado e funcionando! 🎉**

Para próximas etapas, consulte o Manual de Operação.

---

**Versão**: 1.0
**Data**: Novembro 2025
**Autor**: Manus AI
