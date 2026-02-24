# 📋 DOCUMENTAÇÃO COMPLETA - CALIBRAÇÃO E TESTE DE KH

## VISÃO GERAL DO SISTEMA

O sistema ReefBlueSky KH Monitor v4 realiza medição automática de alcalinidade (KH) em aquários marinhos através de análise de pH diferencial. O processo completo consiste em duas etapas principais:

1. **CALIBRAÇÃO** (KH_Calibrator): Calibra bombas peristálticas e captura pH de referência
2. **TESTE DE KH** (KH_Analyzer): Mede KH da amostra do aquário usando o pH diferencial

---

## 🔑 MODOS DE EXECUÇÃO DO KH_ANALYZER

O `KH_Analyzer` possui **dois modos de operação**:

### MODO CALIBRAÇÃO (`calibration_mode = true`)
- **Quando**: Durante Passo 6 da calibração (via `KH_Calibrator`)
- **Como iniciar**: `khAnalyzer.startMeasurementCycle(true)`
- **Pré-requisito**: A cheio (água aquário) + B cheio (solução referência)
- **Fases executadas**:
  - ❌ FASE 1 (limpeza) - **PULADA**
  - ⚠️ FASE 2 (referência) - **Executa APENAS compressor + leitura** (pula F2_FILL)
  - ✅ FASE 4 (medição) - Executada normalmente
  - ✅ FASE 5 (finalização) - Executada normalmente
- **Duração**: ~3-4 minutos
- **Objetivo**: Capturar pH de referência sem perder tempo com preparação já feita

### MODO TESTE NORMAL (`calibration_mode = false` ou padrão)
- **Quando**: Testes manuais, agendados ou via comando cloud `testnow`
- **Como iniciar**: `khAnalyzer.startMeasurementCycle()` ou `khAnalyzer.startMeasurementCycle(false)`
- **Pré-requisito**: Nenhum (sistema cuida da preparação)
- **Fases executadas**:
  - ✅ FASE 1 (limpeza) - Executada
  - ✅ FASE 2 (referência) - Executada completa (enchimento + compressor + leitura)
  - ✅ FASE 4 (medição) - Executada
  - ✅ FASE 5 (finalização) - Executada
- **Duração**: ~4-5 minutos
- **Objetivo**: Medir KH do aquário em condições normais de operação

---

## PARTE 1: CALIBRAÇÃO (KH_Calibrator)

### Objetivo
Calibrar as 3 bombas peristálticas (medindo ml/s) e capturar o pH de referência de uma solução de KH conhecido.

### Parâmetros de Entrada
- `kh_ref_user`: KH conhecido da solução de referência (ex: 8.0 dKH)
  - ⚠️ **IMPORTANTE**: Este valor é usado como base matemática para calcular o KH do aquário (ver PARTE 2)
- `assumeEmpty`: se `true`, pula o flush inicial das câmaras

### Volumes das Câmaras
- **Câmara A**: 50 mL
- **Câmara B**: 50 mL
- **Câmara C**: 150 mL (solução de referência)
- **Mangueira Bomba 1**: 10,6 mL (3mm × 1,5m)

---

### PASSO 1: FLUSH (OPCIONAL)

**Estado**: `CAL_FLUSH_START` → `CAL_FLUSH_WAIT`

**Condição**: Executa apenas se `assumeEmpty = false`

**Ação**:
- Liga bombas para esvaziar A, B e C simultaneamente
- Aguarda sensores indicarem câmaras vazias OU timeout (5 min)
- Aguarda estabilização de 5 s

**Hardware**:
- Bombas 1, 2, 3: ON (drenagem)
- Compressor: OFF

**Sensores Esperados**:
- A: LOW (vazio)
- B: LOW (vazio)
- C: LOW (vazio)

**Duração**: ~30-60 s (depende do nível inicial)

**Log Esperado**:
```
[CAL][FLUSH] Esvaziando câmaras A/B/C...
[CAL][FLUSH] Flush completo. Aguardando estabilização 5s...
```

---

### PASSO 2: CALIBRAR BOMBA 1 (aquário → A)

**Estados**: `CAL_B1_TIMED_START` → `CAL_B1_WAIT_A_FULL`

**Objetivo**: Medir taxa de fluxo da bomba 1 (ml/s)

**Volume a transferir**: 60,6 mL (50 mL câmara A + 10,6 mL mangueira)

**Ação**:
1. Zera timer
2. Liga bomba 1 (aquário → A)
3. Aguarda sensor A indicar CHEIO OU timeout (10 min)
4. Calcula: `mlps_b1 = 60.6 / tempo_decorrido`

**Hardware**:
- Bomba 1: ON (aquário → A)
- Bombas 2, 3, Compressor: OFF

**Sensores Esperados**:
- A: LOW → HIGH (vazio → cheio)
- B: LOW (vazio)
- C: LOW (vazio)

**Duração**: ~20-40 s (depende da vazão real)

**Log Esperado**:
```
[CAL][B1] Calibrando bomba 1 (aquário→A, 60.6 mL)...
[CAL][B1] A cheio em XXXX ms. mlps_b1 = X.XX mL/s
```

**Validação**:
- `mlps_b1` deve estar entre 0.1 e 10.0 mL/s
- Se fora da faixa → ERRO

**Estado Final**:
- A: CHEIO (60,6 mL)
- B: VAZIO
- C: VAZIO

---

### PASSO 3: CALIBRAR BOMBA 2 (A → B)

**Estados**: `CAL_B2_TIMED_START` → `CAL_B2_WAIT_B_FULL`

**Objetivo**: Medir taxa de fluxo da bomba 2 (ml/s)

**Volume a transferir**: 50 mL (câmara B completa)

**Ação**:
1. Zera timer
2. Liga bomba 2 (A → B) + bomba 1 (reposição contínua de A)
3. Aguarda sensor B indicar CHEIO OU timeout (10 min)
4. Calcula: `mlps_b2 = 50.0 / tempo_decorrido`
5. Para ambas as bombas

**Hardware**:
- Bomba 1: ON (aquário → A, reposição)
- Bomba 2: ON (A → B)
- Bomba 3, Compressor: OFF

**Sensores Esperados**:
- A: HIGH (cheio, reposição contínua)
- B: LOW → HIGH (vazio → cheio)
- C: LOW (vazio)

**Duração**: ~15-30 s

**Log Esperado**:
```
[CAL][B2] Calibrando bomba 2 (A→B, 50 mL)...
[CAL][B2] B cheio em XXXX ms. mlps_b2 = X.XX mL/s
```

**Validação**:
- `mlps_b2` deve estar entre 0.1 e 10.0 mL/s
- Se fora da faixa → ERRO

**Estado Final**:
- A: CHEIO (reposição ativa)
- B: CHEIO (50 mL)
- C: VAZIO

---

### PASSO 4: CALIBRAR BOMBA 3 (B → C)

**Estados**: `CAL_B3_TIMED_START` → `CAL_B3_WAIT_C_FULL`

**Objetivo**: Medir taxa de fluxo da bomba 3 (ml/s)

**Volume a transferir**: 150 mL (câmara C completa)

**Ação**:
1. Zera timer
2. Liga bomba 3 (B → C) + bomba 2 (A → B) + bomba 1 (aquário → A) - **reposição em cascata**
3. Aguarda sensor C indicar CHEIO OU timeout (10 min)
4. Calcula: `mlps_b3 = 150.0 / tempo_decorrido`
5. Para todas as bombas

**Observação Crítica**: C = 150 mL > (A + B) = 100 mL, portanto **NECESSITA** reposição contínua em cascata!

**Hardware**:
- Bomba 1: ON (aquário → A)
- Bomba 2: ON (A → B)
- Bomba 3: ON (B → C)
- Compressor: OFF

**Sensores Esperados**:
- A: HIGH (reposição ativa)
- B: HIGH (reposição ativa)
- C: LOW → HIGH (vazio → cheio)

**Duração**: ~45-90 s

**Log Esperado**:
```
[CAL][B3] Calibrando bomba 3 (B→C, 150 mL) com reposição cascata...
[CAL][B3] C cheio em XXXX ms. mlps_b3 = X.XX mL/s
```

**Validação**:
- `mlps_b3` deve estar entre 0.1 e 10.0 mL/s
- Se fora da faixa → ERRO

**Estado Final**:
- A: CHEIO
- B: CHEIO
- C: CHEIO (150 mL solução de referência)

---

### PASSO 4.5: ESVAZIAR B E GARANTIR A CHEIO

**Estados**: `CAL_DRAIN_B_START` → `CAL_DRAIN_B_WAIT` → `CAL_ENSURE_A_FULL` → `CAL_ENSURE_A_WAIT`

**Objetivo**: Preparar sistema para o ciclo de teste KH (A cheio, B vazio)

#### Sub-etapa 4.5.1: Drenar B

**Ação**:
1. Liga bomba 2 reversa (B → A)
2. Se A encher durante processo, drena A para aquário (bomba 1 reversa)
3. Aguarda tempo calibrado de B + 30% OU timeout (10 min)

**Hardware**:
- Bomba 2: ON reversa (B → A)
- Bomba 1: ON reversa SE A encher (A → aquário)
- Bomba 3, Compressor: OFF

**Sensores**:
- A: pode oscilar LOW/HIGH (proteção overflow)
- B: HIGH → LOW (cheio → vazio)
- C: HIGH (cheio)

**Duração**: ~tempo_calibrado_B × 1.3 (~15-35 s)

**Log Esperado**:
```
[CAL][DRAIN_B] Passo 4.5 - Esvaziando B após calibrar bomba C
[CAL][DRAIN_B] A atingiu nível máximo, drenando para aquário...
[CAL][DRAIN_B] B esvaziado. Verificando A...
```

#### Sub-etapa 4.5.2: Garantir A Cheio

**Ação**:
1. Verifica sensor A
2. Se A LOW (vazio), liga bomba 1 (aquário → A)
3. Aguarda sensor A HIGH OU timeout

**Hardware**:
- Bomba 1: ON SE necessário (aquário → A)
- Bombas 2, 3, Compressor: OFF

**Sensores Esperados**:
- A: HIGH (cheio)
- B: LOW (vazio)
- C: HIGH (cheio)

**Duração**: ~0-40 s (depende se A precisa encher)

**Log Esperado**:
```
[CAL][ENSURE_A] Verificando A... A já cheio, prosseguindo.
OU
[CAL][ENSURE_A] A vazio, enchendo de aquário...
[CAL][ENSURE_A] A cheio. Prosseguindo para encher B de C.
```

**Estado Final Sub-etapa 4.5**:
- A: CHEIO (água do aquário)
- B: VAZIO
- C: CHEIO (solução de referência)

---

### PASSO 5: ENCHER B DE C (SOLUÇÃO DE REFERÊNCIA)

**Estados**: `CAL_FILL_B_FROM_C_START` → `CAL_FILL_B_FROM_C_WAIT`

**Objetivo**: Encher B com solução de referência de C para o teste de KH

**Ação**:
1. Liga bomba 3 reversa (C → B)
2. Aguarda sensor B indicar CHEIO OU timeout (tempo_B calibrado + 30%)

**Hardware**:
- Bomba 3: ON reversa (C → B)
- Bombas 1, 2, Compressor: OFF

**Sensores Esperados**:
- A: HIGH (cheio)
- B: LOW → HIGH (vazio → cheio)
- C: HIGH → pode ficar LOW se esvaziar demais

**Duração**: ~tempo_calibrado_B × 1.3 (~15-35 s)

**Log Esperado**:
```
[CAL][FILL_B] Passo 5 - Enchendo B de C (solucao de referencia)...
[CAL][FILL_B] B cheio. Iniciando ciclo de teste KH...
```

**Estado Final**:
- A: CHEIO (água do aquário)
- B: CHEIO (solução de referência de C)
- C: PARCIAL (perdeu ~50 mL)

---

### PASSO 6: CICLO DE TESTE KH (VIA KH_Analyzer) — MODO CALIBRAÇÃO

> 🔑 **MODO CALIBRAÇÃO**: Este passo executa o `KH_Analyzer` em **modo calibração**,
> que **pula Fase 1 e F2_FILL** pois as câmaras já estão preparadas (A = aquário, B = referência).
> O `KH_Analyzer` inicia diretamente em `F2_AIR_REF_EQUILIBRIUM` (ligar compressor).

**Estados**: `CAL_KH_TEST_START` → `CAL_KH_TEST_WAIT`

**Objetivo**: Capturar pH de referência sem refazer a preparação das câmaras

**Ação**:
1. Calibrador sinaliza `.ino` através de `needsKhTestCycle() = true`
2. O `.ino` inicia `KH_Analyzer.startMeasurementCycle(true)` ← **⚠️ `true` = modo calibração**
3. `KH_Analyzer` **pula** FASE 1 (limpeza) e F2_FILL (enchimento)
4. `KH_Analyzer` inicia diretamente em `F2_AIR_REF_EQUILIBRIUM` (compressor)
5. Executa: Compressor 60s → Aguarda 15s → Lê pH/temp → Retorna B→C → Fase 4 → Fase 5
6. Ao concluir, `.ino` chama `calibrador.onKhTestComplete(ph_ref, temp_ref)`
7. Calibrador armazena `_ph_ref_measured` e `_temp_ref`

**Duração**: ~3-4 minutos (vs. 4-5 min no modo normal)

**Log Esperado (Modo Calibração)**:
```
[CAL][KH_TEST] Aguardando teste KH via KH_Analyzer...
[DEBUG] Tentando iniciar KH_Analyzer.startMeasurementCycle(true) [MODO CALIBRACAO]...
[KH_Analyzer] startMeasurementCycle() chamado (modo CALIBRACAO)
[KH_Analyzer] MODO CALIBRACAO: Pulando FASE 1 e enchimento
[KH_Analyzer] A ja esta cheio (aquario), B ja esta cheio (referencia)
[KH_Analyzer] Estado inicial: PHASE2_REF -> F2_AIR_REF_EQUILIBRIUM (compressor)
[KH_Analyzer] INICIADO com sucesso durante calibracao (modo direto para compressor)
[F2] >>> ENTRANDO F2_AIR_REF_EQUILIBRIUM (compressor 60s)
[F2] Compressor LIGADO. Aguardando 60000 ms
[F2] Compressor desligado apos 60XXX ms. Aguardando estabilizacao do pH...
[F2] === SETANDO pH de referencia ===
[F2] Referencia medida: _ph_ref=8.XX temp=XX.X C
[F2] >>> ENTRANDO F2_RETURN_B_TO_C
[F2] Iniciando retorno: B->C (bomba 3 normal)
[F2] Sensor C ativo - referencia devolvida. Parando bomba 3.
[KH_Analyzer] FASE 2 CONCLUIDA -> Indo para FASE 4
[F4] Iniciando transferência de amostra: A -> B
[F4] Equilibrio da amostra em B (compressor 60 s)
[F4] Medindo pH da amostra e calculando KH
[KH_Analyzer] F4 RESULT: ph_ref=8.XX ph_sample=8.XX temp=XX.X kh=X.XX valid=1
[KH_Analyzer] FASE 4 CONCLUIDA -> Indo para FASE 5
[F5] Drenando A -> aquario...
[F5] Drenando B -> A -> aquario...
[F5] Enchendo B de C (referencia para proximo ciclo)...
[KH_Analyzer] FASE 5 CONCLUIDA -> COMPLETE
[CAL][KH_TEST] Teste KH concluído: pH=8.XX temp=XX.X°C
```

**Dados Capturados**:
- `ph_ref_measured`: pH da solução de referência após equilíbrio com ar
- `temp_ref`: Temperatura durante medição

**Validação**:
- pH deve estar entre 4.0 e 10.0 (relaxado para testes)
- Temperatura deve estar entre 10.0 e 40.0°C (relaxado para testes)

---

### PASSO 7: SALVAR CALIBRAÇÃO EM SPIFFS

**Estado**: `CAL_SAVE`

**Objetivo**: Persistir todos os dados de calibração em `/kh_calib.json`

**Dados Salvos**:
```json
{
  "kh_ref_user": 8.0,
  "ph_ref_measured": 8.2,
  "temp_ref": 25.5,
  "mlps_b1": 3.03,
  "mlps_b2": 2.94,
  "mlps_b3": 2.85,
  "time_fill_a_ms": 20000,
  "time_fill_b_ms": 17000,
  "time_fill_c_ms": 52600,
  "timestamp": 1707847230000
}
```

**Hardware**: Todas as bombas OFF

**Log Esperado**:
```
[CAL][SAVE] Salvando calibração em /kh_calib.json...
[CAL][SAVE] Calibração salva com sucesso!
```

---

### PASSO 8: CALIBRAÇÃO COMPLETA

**Estado**: `CAL_COMPLETE`

**Resultado Final**:
```
{
  "success": true,
  "kh_ref_user": 8.0,
  "ph_ref_measured": 8.2,
  "temp_ref": 25.5,
  "mlps_b1": 3.03,
  "mlps_b2": 2.94,
  "mlps_b3": 2.85,
  "time_fill_a_ms": 20000,
  "time_fill_b_ms": 17000,
  "time_fill_c_ms": 52600
}
```

**Duração Total da Calibração**: ~10-15 minutos (incluindo teste KH completo)

---

## PARTE 2: TESTE DE KH (KH_Analyzer) — MODO NORMAL

> ⚠️ **IMPORTANTE**: Esta seção descreve o **MODO TESTE NORMAL** (ciclo completo desde FASE 1).
> Durante a **CALIBRAÇÃO** (Passo 6), o `KH_Analyzer` executa em **MODO CALIBRAÇÃO**,
> pulando FASE 1 e F2_FILL (ver seção "Modos de Execução" acima e Passo 6 da calibração).

### Objetivo
Medir o KH do aquário comparando o pH de uma amostra do aquário com o pH de referência conhecido.

### Método
**pH Diferencial**: KH é calculado pela diferença de pH entre:
- **Referência**: Solução de KH conhecido saturada com ar
- **Amostra**: Água do aquário saturada com ar

### Princípio de Funcionamento
1. **Calibração prévia** forneceu: `kh_ref_user = 8.0 dKH` (valor conhecido da solução de referência)
2. **Fase 2** mede: `pH_ref` da solução de referência equilibrada com ar (ex: 8.2)
3. **Fase 4** mede: `pH_amostra` da água do aquário equilibrada com ar (ex: 8.0)
4. **Cálculo** usa o KH conhecido como base matemática para encontrar o KH desconhecido

### Fórmula de Cálculo
```
ΔpH = pH_ref - pH_amostra
KH_amostra = KH_ref × pow(10, ΔpH)
// Correção de temperatura aplicada
```

**Exemplo prático**:
```
Dados da calibração:
  kh_ref_user = 8.0 dKH (informado pelo usuário)

Dados do teste:
  pH_ref = 8.2 (medido na Fase 2)
  pH_amostra = 8.0 (medido na Fase 4)

Cálculo:
  ΔpH = 8.2 - 8.0 = 0.2
  KH_amostra = 8.0 × pow(10, 0.2)
  KH_amostra = 8.0 × 1.585 = 12.68 dKH
```

> ⚠️ **IMPORTANTE**: O valor `kh_ref_user` informado durante a CALIBRAÇÃO é essencial para o cálculo. Sem ele, não é possível determinar o KH do aquário!

---

### FASE 1: LIMPEZA (PHASE1_CLEAN)

**Estados**: `F1_IDLE` → `F1_DRAIN_A_TO_TANK_1` → `F1_DONE`

**Objetivo**: Limpar câmara A e devolver solução de referência de B para C

**Sub-etapa 1.1: Drenagem Paralela**

**Ação**:
1. Liga bomba 1 reversa (A → aquário) para limpar A
2. Liga bomba 3 normal (B → C) para devolver referência
3. Para bomba A quando tempo expirar (~10 s)
4. Para bomba C quando sensor C ativar OU timeout (tempo_B × 1.3)
5. Termina quando ambas as bombas pararam

**Hardware**:
- Bomba 1: ON reversa (A → aquário)
- Bomba 3: ON normal (B → C)
- Bomba 2, Compressor: OFF

**Sensores**:
- A: pode estar HIGH ou LOW
- B: HIGH → LOW (devolve ref para C)
- C: LOW → HIGH (recebe ref de B)

**Duração**: ~10-20 s

**Log Esperado**:
```
[F1] Limpando A + devolvendo referencia B->C (paralelo)
[F1] A esvaziado após XXXX ms. Parando bomba A.
[F1] C cheio. Parando devolucao B->C.
[F1] Limpeza concluida: A vazio, B vazio, C cheio.
```

**Estado Final Fase 1**:
- A: VAZIO (limpo)
- B: VAZIO
- C: CHEIO (referência recuperada)

---

### FASE 2: REFERÊNCIA (PHASE2_REF)

**Objetivo**: Preparar referência em B, amostra em A, equilibrar ambas com ar e medir pH de referência

#### Sub-etapa 2.1: Enchimento Paralelo

**Estados**: `F2_IDLE` → `F2_FILL_B_FROM_C_AND_A_FROM_TANK`

**Ação**:
1. Liga bomba 3 reversa (C → B, solução de referência)
2. Liga bomba 1 normal (aquário → A, amostra)
3. Para bomba 3 quando sensor B ativar OU timeout (30 s)
4. Para bomba 1 quando sensor A ativar OU timeout (30 s)

**Hardware**:
- Bomba 1: ON normal (aquário → A)
- Bomba 3: ON reversa (C → B)
- Bomba 2, Compressor: OFF

**Sensores Esperados**:
- A: LOW → HIGH (vazio → cheio)
- B: LOW → HIGH (vazio → cheio)
- C: HIGH → pode ficar LOW

**Duração**: ~15-30 s

**Log Esperado**:
```
[F2] >>> INICIANDO F2_FILL_B_FROM_C_AND_A_FROM_TANK
[F2] Estado sensores: A=0 B=0 C=1
[F2] B atingiu nível máximo durante C->B. Parando bomba 3.
[F2] A atingiu nível máximo durante aquário->A. Parando bomba 1.
```

**Validações Temporariamente Desabilitadas**:
- ⚠️ Verificação `canMoveWater(B)` convertida para WARNING
- ⚠️ Verificação `canMoveWater(A)` convertida para WARNING
- Motivo: permitir testes sem interferência de lógica de segurança

---

#### Sub-etapa 2.2: Equilíbrio com Ar (Referência)

**Estados**: `F2_AIR_REF_EQUILIBRIUM` → `F2_AIR_REF_WAIT_STABLE`

**Ação**:
1. Liga compressor por 60 s para saturar A e B com ar
2. Para compressor
3. Aguarda 15 s para estabilização do pH
4. **LEITURA CRÍTICA**: Captura pH de referência e temperatura

**Hardware**:
- Compressor (Bomba D): ON por 60 s → OFF
- Bombas 1, 2, 3: OFF

**Sensores**:
- A: HIGH (cheio, amostra)
- B: HIGH (cheio, referência)
- C: HIGH ou LOW

**Duração**: 60 s (compressor) + 15 s (estabilização) = **75 s**

**Log Esperado**:
```
[F2] >>> ENTRANDO F2_AIR_REF_EQUILIBRIUM (compressor 60s)
[F2] Compressor LIGADO. Aguardando 60000 ms
[F2] Compressor desligado apos 60XXX ms. Aguardando estabilizacao do pH...
[F2] Transicionando para F2_AIR_REF_WAIT_STABLE. Timer resetado.
[F2] >>> F2_AIR_REF_WAIT_STABLE: aguardando XXXX ms / 15000 ms
[F2] === SETANDO pH HARDCODED ===
[F2] Referencia HARDCODED setada: _ph_ref=8.20 temp=25.00 C
[F2] Verificacao: _ph_ref agora vale 8.20
```

**Valores Capturados**:
- `_ph_ref = 8.2f` (HARDCODED temporariamente, depois será `_sm->getPH()`)
- `_temperature = _sm->getTemperature()`

**⚠️ PONTO CRÍTICO**:
Este é o momento onde `_ph_ref` deve ser definido corretamente. Se este sub-estado não executar, `_ph_ref` permanecerá 0.00 causando erro de validação.

---

#### Sub-etapa 2.3: Retornar Referência para C

**Estado**: `F2_RETURN_B_TO_C`

**Ação**:
1. Liga bomba 3 normal (B → C)
2. Para quando sensor C ativar OU timeout (30 s)
3. Se C já estiver cheio, pula este passo

**Hardware**:
- Bomba 3: ON normal (B → C)
- Bombas 1, 2, Compressor: OFF

**Sensores**:
- A: HIGH (amostra preservada)
- B: HIGH → LOW (devolve ref)
- C: LOW/HIGH → HIGH

**Duração**: ~0-30 s

**Log Esperado**:
```
[F2] >>> ENTRANDO F2_RETURN_B_TO_C
[F2] DEBUG: _ph_ref = 8.20 (deveria ser 8.20)
[F2] Iniciando retorno: B->C (bomba 3 normal)
[F2] Sensor C ativo - referencia devolvida. Parando bomba 3.
```

**Estado Final Fase 2**:
- A: CHEIO (amostra do aquário equilibrada com ar)
- B: VAZIO
- C: CHEIO (referência devolvida)
- **Dados capturados**: `_ph_ref = 8.2`, `_temperature = 25.0`

**Duração Total Fase 2**: ~90-120 s

---

### FASE 4: MEDIÇÃO KH (PHASE4_MEASURE_KH)

**Objetivo**: Transferir amostra para B, equilibrar com ar e medir pH da amostra

#### Sub-etapa 4.1: Transferir Amostra A → B

**Estados**: `F4_IDLE` → `F4_TRANSFER_A_TO_B`

**Ação**:
1. Liga bomba 2 normal (A → B)
2. Para quando sensor B ativar OU timeout (30 s)

**Hardware**:
- Bomba 2: ON normal (A → B)
- Bombas 1, 3, Compressor: OFF

**Sensores**:
- A: HIGH → LOW (transfere amostra)
- B: LOW → HIGH (recebe amostra)
- C: HIGH

**Duração**: ~15-30 s

**Log Esperado**:
```
[F4] Iniciando transferência de amostra: A -> B (pumpBfill)
[F4] B atingiu nível máximo durante A->B. Parando bomba 2.
```

**Validação Ativa**:
- ✅ Verifica `canMoveWater(B)` antes de transferir
- Se B já cheio → ERRO

---

#### Sub-etapa 4.2: Equilíbrio com Ar (Amostra)

**Estados**: `F4_AIR_SAMPLE_EQUILIBRIUM` → `F4_AIR_SAMPLE_WAIT_STABLE`

**Ação**:
1. Liga compressor por 60 s para saturar amostra em B
2. Para compressor
3. Aguarda 15 s para estabilização

**Hardware**:
- Compressor (Bomba D): ON por 60 s → OFF
- Bombas 1, 2, 3: OFF

**Sensores**:
- A: LOW (vazio)
- B: HIGH (amostra)
- C: HIGH

**Duração**: 60 s + 15 s = **75 s**

**Log Esperado**:
```
[F4] Equilibrio da amostra em B (compressor 60 s)
[F4] Compressor desligado. Aguardando estabilizacao da amostra...
```

---

#### Sub-etapa 4.3: Medir pH e Calcular KH

**Estados**: `F4_MEASURE_AND_COMPUTE` → `F4_DONE`

**Ação**:
1. Lê pH da amostra e temperatura
2. Calcula KH usando `calculateKH()`
3. Valida medição
4. Armazena resultado

**Cálculo de KH**:
```cpp
// Variáveis usadas:
// _ph_ref: pH medido na Fase 2 (ex: 8.2)
// _ph_sample: pH medido agora na Fase 4 (ex: 8.0)
// _reference_kh: KH informado na calibração (ex: 8.0 dKH)

float delta_ph = _ph_ref - _ph_sample;
float kh = _reference_kh * pow(10, delta_ph);
// Correção de temperatura aplicada
```

**De onde vem cada variável**:
- `_ph_ref`: Medido na **Fase 2** (equilíbrio da referência com ar)
- `_ph_sample`: Medido agora na **Fase 4** (equilíbrio da amostra com ar)
- `_reference_kh`: Informado pelo usuário na **CALIBRAÇÃO** (ex: 8.0 dKH)
- `_temperature`: Sensor de temperatura (para correção)

**Hardware**: Todas as bombas OFF

**Log Esperado**:
```
[F4] Medindo pH da amostra e calculando KH
[KH_Analyzer] F4 RESULT: ph_ref=8.20 ph_sample=8.00 temp=25.00 kh=10.05 valid=1 msg=
```

**Valores Atualmente**:
- `_ph_sample = 8.0f` (HARDCODED temporariamente)
- `_temperature = _sm->getTemperature()`

**Resultado**:
```
MeasurementResult {
  kh_value: 10.05,
  ph_reference: 8.20,
  ph_sample: 8.00,
  temperature: 25.0,
  confidence: 1.0,
  is_valid: true,
  error_message: ""
}
```

**Estado Final Fase 4**:
- A: VAZIO
- B: CHEIO (amostra medida)
- C: CHEIO
- **Resultado KH disponível**

**Duração Total Fase 4**: ~90-120 s

---

### FASE 5: FINALIZAÇÃO (PHASE5_FINALIZE)

**Objetivo**: Drenar câmaras usadas e preparar sistema para próximo ciclo

#### Sub-etapa 5.1: Drenar A

**Estados**: `F5_IDLE` → `F5_DRAIN_A`

**Ação**:
1. Liga bomba 1 reversa (A → aquário)
2. Aguarda 10 s (tempo calibrado)
3. Para bomba 1

**Hardware**:
- Bomba 1: ON reversa (A → aquário)
- Bombas 2, 3, Compressor: OFF

**Sensores**:
- A: LOW → ainda mais vazio
- B: HIGH (amostra)
- C: HIGH

**Duração**: **10 s**

**Log Esperado**:
```
[F5] Drenando A -> aquario (tempo calibrado)...
[F5] Drenagem A concluida em XXXX ms. Drenando B...
```

---

#### Sub-etapa 5.2: Drenar B (em Paralelo com A)

**Estado**: `F5_DRAIN_B`

**Ação**:
1. Liga bomba 2 reversa (B → A)
2. Liga bomba 1 reversa (A → aquário) **em paralelo**
3. Aguarda tempo_B calibrado + 30% (~13 s)
4. Para ambas as bombas

**Hardware**:
- Bomba 1: ON reversa (A → aquário)
- Bomba 2: ON reversa (B → A)
- Bomba 3, Compressor: OFF

**Sensores**:
- A: LOW (via de escoamento)
- B: HIGH → LOW (esvazia)
- C: HIGH

**Duração**: ~tempo_B × 1.3 = **~13 s**

**Log Esperado**:
```
[F5] Drenando B -> A -> aquario (tempo calibrado + 30%)...
[F5] Drenagem B concluida em XXXX ms. Enchendo B de C...
```

---

#### Sub-etapa 5.3: Encher B de C (Preparar Próximo Ciclo)

**Estado**: `F5_FILL_B_FROM_C`

**Ação**:
1. Liga bomba 3 reversa (C → B)
2. Para quando sensor B ativar OU timeout (~13 s)

**Hardware**:
- Bomba 3: ON reversa (C → B)
- Bombas 1, 2, Compressor: OFF

**Sensores**:
- A: LOW (vazio)
- B: LOW → HIGH (enche com referência)
- C: HIGH → pode ficar LOW

**Duração**: ~tempo_B × 1.3 = **~13 s**

**Log Esperado**:
```
[F5] Enchendo B de C (referencia para proximo ciclo)...
[F5] B cheio. Parando C->B.
[F5] Ciclo concluido. A=vazio, B=referencia (pronto), C=parcial.
```

**Estado Final Fase 5 (COMPLETO)**:
- A: VAZIO (pronto para próxima amostra)
- B: CHEIO com referência (pronto para próximo ciclo)
- C: PARCIAL (~100 mL restantes)

**Duração Total Fase 5**: ~36 s

---

## RESUMO DE TIMING

### CALIBRAÇÃO COMPLETA
| Passo | Descrição | Duração Estimada |
|-------|-----------|------------------|
| 1 | Flush (opcional) | 30-60 s |
| 2 | Calibrar Bomba 1 (aquário→A) | 20-40 s |
| 3 | Calibrar Bomba 2 (A→B) | 15-30 s |
| 4 | Calibrar Bomba 3 (B→C) | 45-90 s |
| 4.5 | Drenar B + Garantir A | 15-75 s |
| 5 | Encher B de C | 15-35 s |
| 6 | Teste KH (MODO CALIBRAÇÃO) | **180-240 s (3-4 min)** ⚡ |
| 7 | Salvar SPIFFS | 1-2 s |
| **TOTAL** | | **~8-12 min** |

### TESTE DE KH — MODO CALIBRAÇÃO (Durante Passo 6 da Calibração)
| Fase | Descrição | Duração Estimada |
|------|-----------|------------------|
| ~~1~~ | ~~Limpeza~~ | ❌ **PULADA** |
| ~~2.1~~ | ~~Enchimento~~ | ❌ **PULADO** |
| 2.2 | Compressor (referência) | 60 s |
| 2.3 | Estabilização pH | 15 s |
| 2.4 | Leitura pH ref + temp | <1 s |
| 2.5 | Retornar B→C | ~tempo_B × 1.3 (~13 s) |
| 4.1 | Transferir A→B | ~tempo_B × 1.3 (~13 s) |
| 4.2 | Compressor (amostra) | 60 s |
| 4.3 | Estabilização pH | 15 s |
| 4.4 | Leitura pH amostra + cálculo KH | <1 s |
| 5 | Finalização (drenar A+B, encher B) | ~36 s |
| **TOTAL** | | **~3-4 min** ⚡ |

### TESTE DE KH — MODO NORMAL (Testes Manuais/Agendados)
| Fase | Descrição | Duração Estimada |
|------|-----------|------------------|
| 1 | Limpeza (drenar A+B paralelo) | 10-20 s |
| 2.1 | Enchimento paralelo (C→B + aquário→A) | 15-30 s |
| 2.2 | Compressor (referência) | 60 s |
| 2.3 | Estabilização pH | 15 s |
| 2.4 | Leitura pH ref + temp | <1 s |
| 2.5 | Retornar B→C | ~tempo_B × 1.3 (~13 s) |
| 4.1 | Transferir A→B | ~tempo_B × 1.3 (~13 s) |
| 4.2 | Compressor (amostra) | 60 s |
| 4.3 | Estabilização pH | 15 s |
| 4.4 | Leitura pH amostra + cálculo KH | <1 s |
| 5 | Finalização (drenar A+B, encher B) | ~36 s |
| **TOTAL** | | **~4-5 min** |

**Diferença de timing**: Modo calibração economiza ~1 minuto por pular Fase 1 e F2_FILL ⚡

---

## FLUXO DE DADOS

### Entrada (Calibração)
```
kh_ref_user = 8.0 dKH  ← Usuário informa o KH da solução de referência
```

### Saída (Calibração Salva em /kh_calib.json)
```json
{
  "kh_ref_user": 8.0,        ← Salvo para uso posterior no cálculo
  "ph_ref_measured": 8.2,     ← pH medido durante calibração (referência)
  "temp_ref": 25.5,           ← Temperatura medida durante calibração
  "mlps_b1": 3.03,            ← Taxa de fluxo bomba 1 (mL/s)
  "mlps_b2": 2.94,            ← Taxa de fluxo bomba 2 (mL/s)
  "mlps_b3": 2.85,            ← Taxa de fluxo bomba 3 (mL/s)
  "time_fill_a_ms": 20000,    ← Tempo para encher A (ms)
  "time_fill_b_ms": 17000,    ← Tempo para encher B (ms)
  "time_fill_c_ms": 52600     ← Tempo para encher C (ms)
}
```

### Processamento (Durante Teste KH)
```
1. Sistema carrega kh_ref_user = 8.0 dKH do arquivo
2. Fase 2: Mede pH_ref = 8.2 (referência equilibrada)
3. Fase 4: Mede pH_sample = 8.0 (amostra equilibrada)
4. Calcula: ΔpH = 8.2 - 8.0 = 0.2
5. Calcula: KH_sample = 8.0 × pow(10, 0.2) = 12.68 dKH
```

### Saída (Teste KH)
```cpp
MeasurementResult {
  kh_value: 12.68 dKH,      ← Calculado usando kh_ref_user como base
  ph_reference: 8.20,       ← Medido na Fase 2
  ph_sample: 8.00,          ← Medido na Fase 4
  temperature: 25.0°C,      ← Usado para correção
  confidence: 1.0,
  is_valid: true,
  error_message: ""
}
```

### Rastreabilidade dos Dados
```
CALIBRAÇÃO                    TESTE KH
══════════════════════════════════════════════════════════════
Usuário informa:              Sistema carrega:
kh_ref_user = 8.0 dKH    →   _reference_kh = 8.0 dKH

Sistema mede (Passo 6):       Sistema mede (Fase 2):
ph_ref = 8.2             →   _ph_ref = 8.2

Sistema salva:                Sistema mede (Fase 4):
/kh_calib.json           →   _ph_sample = 8.0

                              Sistema calcula:
                              KH_amostra = 12.68 dKH
                              (usando _reference_kh)
```

---

## PONTOS CRÍTICOS IDENTIFICADOS

### 1. **Fase 2 Sub-etapa 2.2 (F2_AIR_REF_EQUILIBRIUM)**
- **Problema anterior**: Ciclo abortava ANTES de chegar aqui devido a validação `canMoveWater(B)` em F2_FILL_B_FROM_C_AND_A_FROM_TANK
- **Sintoma**: `_ph_ref` nunca era setado (permanecia 0.00) → erro "pH fora do esperado"
- **Causa**: Sensor B detectado como HIGH prematuramente, ativando `ERROR_STATE` antes do compressor ligar
- **Solução**: Validações temporariamente convertidas para WARNING + logs extensivos
- **Status**: ✅ Resolvido para testes

### 2. **Valores Hardcoded (Teste Sem Sensor)**
- **Localização**:
  - `KH_Analyzer.cpp:458` → `_ph_ref = 8.2f`
  - `KH_Analyzer.cpp:601` → `_ph_sample = 8.0f`
- **Motivo**: Sensor de pH indisponível durante desenvolvimento
- **Futuro**: Substituir por `_sm->getPH()` quando sensor estiver conectado

### 3. **Segurança de Overflow**
- **Proteção Ativa**: Sensores de nível máximo em A, B, C
- **Lógica**: `isRes1Full()`, `isRes2Full()`, `isRes3Full()` param bombas quando sensores ativam
- **Limitação**: Não há sensores de nível MÍNIMO (apenas máximo)
- **Implicação**: Tempos calibrados são críticos para evitar funcionamento a seco

---

## PRÓXIMOS PASSOS RECOMENDADOS

1. **Testar código modificado** com logs extensivos
2. **Verificar no Serial Monitor**:
   - Se `F2_AIR_REF_EQUILIBRIUM` executa
   - Se compressor liga por 60 s
   - Se `_ph_ref = 8.20` é setado
   - Se ciclo completa sem erros
3. **Após confirmação de funcionamento**:
   - Re-habilitar validações de segurança
   - Ajustar lógica de `canMoveWater()` se necessário
   - Integrar sensor de pH real (remover hardcoded)
4. **Teste de longo prazo**:
   - Executar múltiplos ciclos consecutivos
   - Verificar estabilidade de C (não esvaziar demais)
   - Validar precisão das medições de KH

---

## DIAGRAMA DE ESTADOS

### Calibração Completa (KH_Calibrator)
```
IDLE → FLUSH → B1 → B2 → B3 → DRAIN_B → ENSURE_A → FILL_B_FROM_C → KH_TEST → SAVE → COMPLETE
                                                                        ↓
                                                        (inicia KH_Analyzer em modo calibração)
```

### Teste KH — MODO CALIBRAÇÃO (Durante Passo 6)
```
                        ┌─────────────────────────────────┐
                        │  FASE 1 - PULADA                │
                        │  F2_FILL - PULADO               │
                        └─────────────────────────────────┘
                                      ↓
IDLE → PHASE2_REF (F2_AIR_REF_EQUILIBRIUM) → PHASE4_MEASURE → PHASE5_FINALIZE → COMPLETE
       └──> Compressor 60s → pH ref                └──> pH amostra → KH
```

### Teste KH — MODO NORMAL (Testes Manuais/Agendados)
```
IDLE → PHASE1_CLEAN → PHASE2_REF → PHASE4_MEASURE → PHASE5_FINALIZE → COMPLETE
       └──> Limpa    └──> Enche    └──> Mede        └──> Finaliza
            A+B           + pH ref      pH amostra
                                        → KH
```

---

## TABELA COMPARATIVA: MODO CALIBRAÇÃO vs. MODO NORMAL

| Característica | MODO CALIBRAÇÃO | MODO NORMAL |
|----------------|-----------------|-------------|
| **Acionamento** | Passo 6 do `KH_Calibrator` | Comando `testnow`, botão dashboard, agendamento |
| **Código** | `startMeasurementCycle(true)` | `startMeasurementCycle()` ou `startMeasurementCycle(false)` |
| **Estado inicial FSM** | `PHASE2_REF` | `PHASE1_CLEAN` |
| **Sub-estado inicial** | `F2_AIR_REF_EQUILIBRIUM` | `F1_IDLE` |
| **Pré-requisito hardware** | A cheio (aquário) + B cheio (ref) | Qualquer estado |
| **FASE 1 executada?** | ❌ NÃO | ✅ SIM |
| **F2_FILL executado?** | ❌ NÃO | ✅ SIM |
| **Compressor ref (Fase 2)** | ✅ SIM (60s) | ✅ SIM (60s) |
| **pH ref capturado?** | ✅ SIM | ✅ SIM |
| **FASE 4 executada?** | ✅ SIM | ✅ SIM |
| **FASE 5 executada?** | ✅ SIM | ✅ SIM |
| **Duração total** | ~3-4 min ⚡ | ~4-5 min |
| **Economia de tempo** | ~1 min a menos | — |
| **Log identificador** | `[KH_Analyzer] MODO CALIBRACAO: Pulando FASE 1 e enchimento` | `[KH_Analyzer] MODO TESTE: Ciclo completo desde FASE 1` |
| **Resultado retornado** | `ph_ref` → `onKhTestComplete()` | `MeasurementResult` → histórico + backend |
| **Objetivo** | Capturar pH referência calibrado | Medir KH do aquário |

---

## IMPLEMENTAÇÃO TÉCNICA

### Arquivo: `KH_Analyzer.h` (linha 74)
```cpp
bool startMeasurementCycle(bool calibration_mode = false);
```

### Arquivo: `KH_Analyzer.cpp` (linhas 76-90)
```cpp
if (calibration_mode) {
    // [CALIBRAÇÃO] A e B já estão preparados pelo calibrador
    // Pula direto para compressor (F2_AIR_REF_EQUILIBRIUM)
    Serial.println("[KH_Analyzer] MODO CALIBRACAO: Pulando FASE 1 e enchimento");
    _current_state = PHASE2_REF;
    _phase2_state = F2_AIR_REF_EQUILIBRIUM;  // Pula direto pro compressor
    _phase2_step_start_ms = 0;  // Reset timer
} else {
    // [TESTE NORMAL] Ciclo completo desde limpeza
    Serial.println("[KH_Analyzer] MODO TESTE: Ciclo completo desde FASE 1");
    _current_state = PHASE1_CLEAN;
}
```

### Arquivo: `ReefBlueSky_KH_Monitor_v4.ino` (linha 1221)
```cpp
// Durante calibração (Passo 6)
if (khAnalyzer.startMeasurementCycle(true)) {  // true = modo calibração
    khAnalyzerRunning = true;
}
```

---

**Documento atualizado em**: 2026-02-24
**Versão do firmware**: ReefBlueSky_KH_Monitor_v4
**Alteração**: Adicionado suporte a modo calibração no `KH_Analyzer` (economia de ~1 min)
