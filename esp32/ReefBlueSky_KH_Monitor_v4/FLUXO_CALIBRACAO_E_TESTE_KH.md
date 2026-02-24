# Fluxo de Calibração e Teste de KH — ReefBlueSky KH Monitor

> Documento de referência técnica — atualizado em 2026-02-17.
> Descreve exatamente o que ocorre em cada etapa do firmware ESP32,
> em relação a sensores de nível, bombas, sensor de pH, sensor de
> temperatura e compressor.

---

## Convenções de hardware

| Identificador | Descrição |
|---|---|
| **Bomba 1** | Aquário ↔ Câmara A (`pumpA_fill` = aquário→A / `pumpA_discharge` = A→aquário) |
| **Bomba 2** | Câmara A ↔ Câmara B (`pumpB_fill` = A→B / `pumpB_discharge` = B→A) |
| **Bomba 3** | Câmara B ↔ Câmara C (`pumpC_fill` = B→C / `pumpC_discharge` = C→B) |
| **Compressor** | Injeção de CO₂ / ar na câmara B (`pumpD_start` / `pumpD_stop`) |
| **Sensor A** | Nível máximo câmara A (1 = cheia, 0 = vazia/não detectada) |
| **Sensor B** | Nível máximo câmara B |
| **Sensor C** | Nível máximo câmara C |
| **Sensor pH** | Sonda submersa na câmara B |
| **Sensor Temp** | Sonda de temperatura (DS18B20) |

> ⚠️ Só existem sensores de nível **máximo** (sem mínimo).
> O firmware detecta apenas quando a câmara está **cheia**, não quando está vazia.

---

## Arquivos relevantes

| Arquivo | Responsabilidade |
|---|---|
| `KH_Calibrator.h/.cpp` | FSM de calibração |
| `KH_Analyzer.h/.cpp` | FSM de medição de KH (4 fases, múltiplos sub-estados) |
| `PumpControl.cpp` | Controle de direção e PWM das bombas |
| `SensorManager.cpp` | Leitura de pH, temperatura e sensores de nível |
| `/kh_calib.json` | Resultado da calibração (SPIFFS) |
| `/kh_config.json` | KH de referência simples (SPIFFS) |

---

## PARTE 1 — CALIBRAÇÃO (`KH_Calibrator`)

Acionada pelo comando cloud `khcalibrate` com parâmetros:
- `kh_ref_user` — KH da solução de referência usada (ex: `8.0` dKH)
- `assume_empty` — `true` se câmaras já estão vazias (pula o Passo 1)

---

### PASSO 1 — Flush (limpeza das câmaras)

*Apenas se `assume_empty = false`.*

| Estado FSM | O que acontece | Hardware ativo |
|---|---|---|
| `CAL_FLUSH_START` | Liga as 3 bombas em reversa simultaneamente | Bombas 1+2+3 ON reversas |
| `CAL_FLUSH_WAIT` | Sensor A ativo → pausa bomba 2 (evita overflow em A) | Sensor A monitorado |
| | Sensor B ativo → pausa bomba 3 (evita overflow em B) | Sensor B monitorado |
| | Aguarda 5 s sem nenhum sensor ativo **ou** timeout 60 s | — |
| — | Todas as bombas OFF | Bombas 1+2+3 OFF |

> Resultado: câmaras A, B e C **todas vazias**.

---

### PASSO 2 — Calibrar Bomba 2 (A → B, volume = 50 mL)

Objetivo: medir a vazão real da bomba 2 em mL/s (`mlps_b2`).

| Estado FSM | O que acontece | Hardware ativo |
|---|---|---|
| `CAL_B2_FILL_A` | Liga bomba 1 (aquário → A) | Bomba 1 ON |
| `CAL_B2_WAIT_A_FULL` | Aguarda sensor A ou timeout 30 s | Sensor A |
| — | Sensor A ativo → para bomba 1 | Bomba 1 OFF |
| `CAL_B2_TIMED_START` | Zera cronômetro. Liga bomba 2 (A→B) + bomba 1 reposição | Bombas 1+2 ON |
| `CAL_B2_WAIT_B_FULL` | Aguarda sensor B ou timeout 30 s | Sensor B |
| — | Sensor B ativo → para bombas. **`mlps_b2 = 50 ÷ t(s)`** | Bombas 1+2 OFF |

> Resultado: B cheia. A parcialmente cheia. C vazia.

---

### PASSO 3 — Calibrar Bomba 3 (B → C, volume = 150 mL)

Objetivo: medir a vazão real da bomba 3 em mL/s (`mlps_b3`).

> C (150 mL) > A + B juntas (100 mL) → reposição contínua obrigatória.
> Flush de C **removido** — Passo 1 já esvaziou tudo.
> Sensores A e B são **verificados** antes de iniciar: se já ativos, pula enchimento.

| Estado FSM | O que acontece | Hardware ativo |
|---|---|---|
| `CAL_B3_FILL_A` | Sensor A ativo? → pula para `CAL_B3_FILL_B`. Senão → liga bomba 1 | Bomba 1 ON se necessário |
| `CAL_B3_WAIT_A_FULL` | Aguarda sensor A ou timeout 30 s | Sensor A |
| — | Sensor A ativo → para bomba 1 | Bomba 1 OFF |
| `CAL_B3_FILL_B` | Sensor B ativo? → pula para `CAL_B3_TIMED_START`. Senão → liga bomba 2 | Bomba 2 ON se necessário |
| `CAL_B3_WAIT_B_FULL` | Aguarda sensor B ou timeout 30 s. Repõe A em paralelo | Sensor B, Bomba 1 em reposição |
| — | Sensor B ativo → para bombas 1 e 2 | Bombas 1+2 OFF |
| `CAL_B3_TIMED_START` | Zera cronômetro. Liga bomba 3 (B→C) + bombas 1 e 2 em reposição contínua | Bombas 1+2+3 ON |
| `CAL_B3_WAIT_C_FULL` | Aguarda sensor C ou timeout 90 s. Proteção: pausa bomba 1 se A cheia, pausa bomba 2 se B cheia | Sensor C |
| — | Sensor C ativo → para todas. **`mlps_b3 = 150 ÷ t(s)`** | Bombas 1+2+3 OFF |

> Resultado: C cheia. A e B parcialmente vazias (usadas como fonte para C).

---

### PASSO 4 — Calibrar Bomba 1 (aquário → A, volume = 60,6 mL)

Objetivo: medir a vazão real da bomba 1 em mL/s (`mlps_b1`).
Volume inclui **10,6 mL da mangueira** (3 mm × ~1,5 m).

| Estado FSM | O que acontece | Hardware ativo |
|---|---|---|
| `CAL_B1_FLUSH_START` | Liga bomba 1 reversa por `T_flush = 2 × (50 ÷ mlps_b2)` ms — esvazia mangueira | Bomba 1 ON reversa |
| `CAL_B1_FLUSHING` | Aguarda T_flush ms | — |
| — | Para bomba 1 | Bomba 1 OFF |
| `CAL_B1_TIMED_START` | Zera cronômetro. Liga bomba 1 (aquário → A) | Bomba 1 ON |
| `CAL_B1_WAIT_A_FULL` | Aguarda sensor A ou timeout 30 s | Sensor A |
| — | Sensor A ativo → para bomba 1. **`mlps_b1 = 60,6 ÷ t(s)`** | Bomba 1 OFF |

> Resultado: A cheia. C cheia (não foi tocada). B pode estar vazia ou parcial.

---

### PASSO 4.5 — Confirmar todos os reservatórios cheios

Garante sensores A, B e C ativos antes de iniciar o ciclo de medição.
Se o sensor estiver ativo, o estado é pulado sem ligar a bomba.

| Estado FSM | O que acontece | Hardware ativo |
|---|---|---|
| `CAL_ENSURE_A_FULL` | Sensor A ativo? → pula para B. Senão → liga bomba 1 | Bomba 1 ON se necessário |
| `CAL_ENSURE_A_WAIT` | Aguarda sensor A ou timeout 30 s | Sensor A |
| `CAL_ENSURE_B_FULL` | Sensor B ativo? → pula para C. Senão → liga bomba 2 | Bomba 2 ON se necessário |
| `CAL_ENSURE_B_WAIT` | Aguarda sensor B ou timeout 30 s | Sensor B |
| `CAL_ENSURE_C_FULL` | Sensor C ativo? → pula para Passo 5. Senão → liga bomba 3 | Bomba 3 ON se necessário |
| `CAL_ENSURE_C_WAIT` | Aguarda sensor C ou timeout 90 s | Sensor C |
| — | Todos os sensores ativos → avança para Passo 5 | Todas OFF |

> Resultado: A, B e C **todas cheias** com sensores ativos.

---

### PASSO 5 — Ciclo completo de teste de KH (MODO CALIBRAÇÃO)

O calibrador sinaliza o `.ino` via `needsKhTestCycle()`. O `.ino` inicia o
`KH_Analyzer` **em modo calibração** e o calibrador aguarda em `CAL_KH_TEST_WAIT`.
Quando o ciclo termina, o `.ino` chama `khCalibrator.onKhTestComplete(ph_ref, temp)`.

| Estado FSM | O que acontece | Hardware ativo |
|---|---|---|
| `CAL_KH_TEST_START` | Sinaliza `.ino` (`needsKhTestCycle() = true`). Avança para WAIT | — |
| `CAL_KH_TEST_WAIT` | Aguarda `.ino` chamar `onKhTestComplete(ph_ref, temp_ref)` | Gerenciado pelo KH_Analyzer |

**🔑 MODO CALIBRAÇÃO vs. MODO TESTE NORMAL:**

Durante a calibração (Passo 5), as câmaras **já estão preparadas** (A cheio de aquário, B cheio de referência).
Portanto, o `KH_Analyzer` é iniciado com `startMeasurementCycle(true)` que **pula** as etapas de preparação:

| Modo | Fases Executadas | Início |
|---|---|---|
| **CALIBRAÇÃO** (`calibration_mode = true`) | Apenas Fase 2 (compressor) → Fase 4 → Fase 5 | F2_AIR_REF_EQUILIBRIUM |
| **TESTE NORMAL** (`calibration_mode = false`) | Fase 1 → Fase 2 completa → Fase 4 → Fase 5 | PHASE1_CLEAN |

**Durante calibração**, o `KH_Analyzer` executa:

| Sub-estado | O que acontece | Hardware | Duração |
|---|---|---|---|
| `F2_AIR_REF_EQUILIBRIUM` | Liga compressor | Compressor ON | 60 s |
| `F2_AIR_REF_WAIT_STABLE` | Aguarda estabilização | Compressor OFF | 15 s |
| — | Lê **`pH_ref`** e **`temperatura`** | Sensor pH, Temp | <1 s |
| `F2_RETURN_B_TO_C` | Retorna B para C (referência) | Bomba 3 ON | ~tempo_B × 1.3 |
| `F4_TRANSFER_A_TO_B` | Transfere amostra A→B | Bomba 2 ON | ~tempo_B × 1.3 |
| `F4_AIR_SAMPLE_EQUILIBRIUM` | Liga compressor | Compressor ON | 60 s |
| `F4_AIR_SAMPLE_WAIT_STABLE` | Aguarda estabilização | Compressor OFF | 15 s |
| `F4_MEASURE_AND_COMPUTE` | Lê pH amostra, calcula KH | Sensor pH | <1 s |
| `F5_DRAIN_A` | Drena A | Bomba 1 reversa | ~10 s |
| `F5_DRAIN_B` | Drena B (via A) | Bombas 1+2 reversas | ~tempo_B × 1.3 |
| `F5_FILL_B_FROM_C` | Enche B (ref para próximo ciclo) | Bomba 3 reversa | ~tempo_B × 1.3 |

O `ph_ref` lido em `F2_AIR_REF_WAIT_STABLE` é usado como `ph_ref_measured` na calibração.

**Duração total (modo calibração)**: ~3-4 minutos (vs. 4-5 minutos no modo normal)

---

### PASSO 6 — Salvar calibração

Salva em `/kh_calib.json` no SPIFFS:

```json
{
  "kh_ref_user":     8.0,
  "ph_ref_measured": 7.82,
  "temp_ref":        25.3,
  "mlps_b1":         1.01,
  "mlps_b2":         1.32,
  "mlps_b3":         0.87
}
```

Carregado automaticamente em `KH_Analyzer::begin()` para uso na fórmula de KH.

> ✅ `mlps_b1`, `mlps_b2` e `mlps_b3` calculados nos Passos 2, 3 e 4 — todos persistidos.

---

## Coordenação `.ino` — Passo 5

```
Seção 9 (loop calibrador):
  se needsKhTestCycle() && !khAnalyzerRunning
    → inicia KH_Analyzer
    → khAnalyzerRunning = true

Seção 10 (loop analyzer) — ao completar:
  se khCalibRunning
    → khCalibrator.onKhTestComplete(khAnalyzer.getPhRef(), khAnalyzer.getTemperature())
    → khCalibRunning permanece true; FSM do calibrador continua (CAL_SAVE → CAL_COMPLETE)
  senão
    → handleMeasurementResult()  ← ciclo normal de KH
```

---

## PARTE 2 — TESTE DE KH (`KH_Analyzer`) — MODO NORMAL

> **📝 IMPORTANTE**: Esta seção descreve o **MODO TESTE NORMAL** (ciclo completo).
> Durante a **CALIBRAÇÃO** (Passo 5), o `KH_Analyzer` executa em **MODO CALIBRAÇÃO**,
> que **pula Fase 1 e F2_FILL** (ver Passo 5 acima).

Acionado por:
- Comando cloud `testnow` → **modo normal**
- Botão "Iniciar Teste" no dashboard → **modo normal**
- Agendamento automático (`checkScheduledTest`) → **modo normal**
- Passo 5 da calibração (via `KH_Calibrator`) → **⚠️ modo calibração** (diferente!)

---

### FASE 1 — Limpeza das câmaras (`PHASE1_CLEAN`)

Garante que as câmaras A e B estão vazias antes da medição.

| Sub-estado | O que acontece | Hardware ativo |
|---|---|---|
| `F1_DRAIN_A_TO_TANK_1` | Liga bomba 1 reversa (A → aquário) por até 10 s | Bomba 1 ON reversa |
| `F1_TRANSFER_B_TO_A` | Liga bomba 2 reversa (B → A) + bomba 1 reversa (A → aquário) em paralelo. Sensor A ativo → pausa bomba 2, aguarda esvaziar, retoma. Timeout 10 s | Bombas 1+2 reversas, Sensor A |
| `F1_DRAIN_A_TO_TANK_2` | Liga bomba 1 reversa novamente — limpeza final (A → aquário) por até 10 s | Bomba 1 ON reversa |
| `F1_DONE` | Todas as bombas OFF. Transição para Fase 2 | Todas OFF |

> Resultado: A e B **vazias**. C intacta com solução de referência.
> A sonda de pH fica brevemente sem líquido — a Fase 2 preenche B rapidamente.

---

### FASE 2 — Medição de referência (`PHASE2_REF`)

Enche B com a solução de referência (vinda de C) e A com amostra do aquário.
Equilibra o CO₂, lê pH de referência, e **devolve B para C antes de iniciar Fase 3**.

| Sub-estado | O que acontece | Hardware ativo |
|---|---|---|
| `F2_FILL_B_FROM_C_AND_A_FROM_TANK` | Liga bomba 3 reversa (C→B) **e** bomba 1 (aquário→A) em paralelo. Para quando sensores A **e** B ativarem ou timeout 30 s | Bombas 1+3 ON, Sensores A e B |
| `F2_AIR_REF_EQUILIBRIUM` | Liga compressor. Aguarda **60 s** não-bloqueante | Compressor ON |
| `F2_AIR_REF_WAIT_STABLE` | Para compressor. Aguarda **15 s** para estabilizar o pH | Compressor OFF |
| — | **Lê `pH_ref`** e **`temperatura`** | Sensor pH, Sensor Temp |
| `F2_RETURN_B_TO_C` | Liga bomba 3 (B→C). Para quando sensor C ativar ou timeout 30 s | Bomba 3 ON, Sensor C |
| `F2_DONE` | Bomba 3 OFF. Transição para Fase 3 | Bomba 3 OFF |

> Resultado: A cheia (água do aquário). B **vazia** (referência devolvida a C). C cheia (referência).
> A sonda fica brevemente sem líquido — Fase 3 preenche B imediatamente.

---

### FASE 3 — Medição da amostra (`PHASE4_MEASURE_KH`)

Transfere a amostra do aquário (que estava em A) para B e mede o pH após equilibrar com CO₂.

| Sub-estado | O que acontece | Hardware ativo |
|---|---|---|
| `F4_TRANSFER_A_TO_B` | Liga bomba 2 (A→B). Para quando sensor B ativar ou timeout 30 s | Bomba 2 ON, Sensor B |
| `F4_AIR_SAMPLE_EQUILIBRIUM` | Liga compressor. Aguarda **60 s** não-bloqueante | Compressor ON |
| `F4_AIR_SAMPLE_WAIT_STABLE` | Para compressor. Aguarda **15 s** para estabilizar o pH | Compressor OFF |
| `F4_MEASURE_AND_COMPUTE` | **Lê `pH_amostra`** e temperatura. Calcula KH | Sensor pH, Sensor Temp |
| `F4_DONE` | Transição para Fase 4 | — |

> Resultado: A vazia. B cheia com água do aquário — **sonda submersa e protegida**. C cheia (referência).

#### Fórmula de cálculo de KH

**Com calibração carregada de `/kh_calib.json`:**

```
correção_temp  = 0,0085 × (T_amostra − T_ref_cal)
pH_amostra_adj = pH_amostra + correção_temp
KH             = KH_ref × 10^(pH_amostra_adj − pH_ref_medido)
KH             = constrain(KH, 1,0; 20,0)
```

**Fallback (sem calibração disponível):**

```
KH = KH_ref + (pH_ref − pH_amostra) × 50
```

---

### FASE 4 — Finalização (`PHASE5_FINALIZE`)

Drena **apenas A**. B e C são mantidos intactos.

| Sub-estado | O que acontece | Hardware ativo |
|---|---|---|
| `F5_DRAIN_A` | Liga bomba 1 reversa (A → aquário) por até 10 s | Bomba 1 ON reversa |
| `F5_DONE` | Para bomba 1. Compressor OFF (precaução). Ciclo encerrado | Todas OFF |

> **B: mantém líquido** (água do aquário) — sonda de pH submersa e protegida.
> **C: mantém líquido** (solução de referência) — pronta para o próximo ciclo.
> **A: vazia** — aguarda próxima medição.

---

### Estado de repouso (entre ciclos)

| Câmara | Conteúdo | Sensor |
|---|---|---|
| A | Vazia | Inativo |
| B | Água do aquário (protege sonda pH) | Ativo |
| C | Solução de referência | Ativo |

---

### Pós-ciclo

| Ação | Onde |
|---|---|
| Resultado salvo no histórico local | `MeasurementHistory` |
| Medição enfileirada para sync com backend | `cloudAuth.queueMeasurement()` |
| Se teste agendado: reporta resultado ao backend | `cloudAuth.reportTestResult()` |
| `systemState` → `PREDICTING` → `IDLE` | FSM principal do `.ino` |

---

## Temporizações de referência

| Parâmetro | Valor | Onde |
|---|---|---|
| Compressor (referência) | 60 s | `_phase2_stab_ms` |
| Compressor (amostra) | 60 s | `_phase4_air_time_ms` |
| Espera pós-compressor (ambos) | **15 s** | `_phase2_wait_ms` / `_phase4_wait_ms` |
| Timeout enchimento A ou B | 30 s (fallback) | `_phase2_fill_max_ms` / `_phase4_fill_ab_max_ms` |
| Timeout drenagem (cada etapa Fase 1) | tempo_calibrado × 1.3 | `_phase1_r1_max_ms` / `_phase1_r2_max_ms` |
| Timeout drenagem A (Fase 5) | tempo_calibrado × 1.3 | `_phase5_drain_max_ms` |
| Timeout flush geral (calibração) | 240 s (4 min) | `KH_Calibrator::FLUSH_TIMEOUT_MS` |
| Timeout encher A (calibração) | 240 s (4 min) | `KH_Calibrator::MAX_FILL_A_MS` |
| Timeout encher B (calibração) | 240 s (4 min) | `KH_Calibrator::MAX_FILL_B_MS` |
| Timeout encher C (calibração) | 240 s (4 min) | `KH_Calibrator::MAX_FILL_C_MS` |
| Volume câmara A | 50 mL | `KH_Calibrator::VOLUME_A_ML` |
| Volume câmara B | 50 mL | `KH_Calibrator::VOLUME_B_ML` |
| Volume câmara C | 150 mL | `KH_Calibrator::VOLUME_C_ML` |
| Volume mangueira bomba 1 | 10,6 mL | `KH_Calibrator::HOSE_ML` |

---

## Comparação: Modo Calibração vs. Modo Teste Normal

| Aspecto | MODO CALIBRAÇÃO | MODO TESTE NORMAL |
|---|---|---|
| **Como iniciar** | `startMeasurementCycle(true)` | `startMeasurementCycle(false)` ou `startMeasurementCycle()` |
| **Estado inicial** | `PHASE2_REF` → `F2_AIR_REF_EQUILIBRIUM` | `PHASE1_CLEAN` → `F1_IDLE` |
| **Fase 1 (limpeza)** | ❌ PULADA | ✅ Executada |
| **F2_FILL (enchimento)** | ❌ PULADO | ✅ Executado |
| **F2_AIR (compressor ref)** | ✅ Executado (início) | ✅ Executado |
| **Fase 4 (medição)** | ✅ Executada | ✅ Executada |
| **Fase 5 (finalização)** | ✅ Executada | ✅ Executada |
| **Pré-requisito** | A cheio (aquário), B cheio (ref) | Qualquer estado |
| **Duração total** | ~3-4 min | ~4-5 min |
| **Quando usar** | Durante Passo 5 da calibração | Testes normais agendados/manuais |
| **Log distintivo** | `[KH_Analyzer] MODO CALIBRACAO: Pulando FASE 1 e enchimento` | `[KH_Analyzer] MODO TESTE: Ciclo completo desde FASE 1` |

---

## Notas de desenvolvimento

- **Sem sensores de nível mínimo**: o firmware detecta apenas câmara **cheia**.
  Esvaziamentos usam timeout fixo ou lógica de debounce com flag `_f1_b_paused`.
- **Arquitetura não-bloqueante**: todas as fases usam FSM com retorno imediato;
  o loop avança o estado a cada 100 ms (seções 9 e 10 do `loop()`).
- **Sonda de pH protegida**: ao final de cada ciclo, B mantém líquido (amostra
  da última medição). A sonda só fica exposta ao ar brevemente durante:
  - Fase 1 (drenagem de B) → coberta novamente no início da Fase 2
  - Fase 2, retorno B→C → coberta novamente no início da Fase 3
- **Simulação de pH**: em desenvolvimento, `sensorManager.setSimulatePH(true, 8.2f, 8.0f)`
  está ativo no `setup()`. **Desabilitar ao usar sonda real.**
- **Progresso em tempo real**: durante qualquer ciclo ativo, o ESP32 envia
  status a cada 1 s para `POST /api/v1/device/kh-status`; frontend faz polling
  via `GET /api/v1/user/devices/:id/kh-status`.
- **Persistência das vazões**: `mlps_b1`, `mlps_b2` e `mlps_b3` são calculados
  durante a calibração e salvos em `/kh_calib.json`. São carregados
  automaticamente em `KH_Analyzer::begin()`.
- **Calibração Passo 5**: durante a calibração, o `KH_Analyzer` é executado
  **em modo calibração** (`calibration_mode = true`), pulando Fase 1 e F2_FILL,
  pois as câmaras já estão preparadas (A = aquário, B = referência). O `ph_ref`
  capturado em `F2_AIR_REF_WAIT_STABLE` é salvo como `ph_ref_measured` em `/kh_calib.json`.
- **Otimização de tempo**: O modo calibração economiza ~1 minuto ao pular etapas
  de preparação desnecessárias, já que o calibrador prepara as câmaras antes de
  chamar o `KH_Analyzer`.
- **Carregamento automático de tempos calibrados**: Após calibração bem-sucedida,
  o `KH_Analyzer` carrega `time_fill_a_ms`, `time_fill_b_ms` e `time_fill_c_ms`
  de `/kh_calib.json` e ajusta todos os timeouts de fase para `tempo_calibrado × 1.3`,
  substituindo os valores padrão de 10000 ms (10 s).
