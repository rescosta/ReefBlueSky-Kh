# ReefBlueSky KH Monitor - Guia Completo de Calibração

## 📋 Índice

1. [Introdução](#introdução)
2. [Calibração Inicial](#calibração-inicial)
3. [Calibração Mensal](#calibração-mensal)
4. [Calibração de Sensores](#calibração-de-sensores)
5. [Troubleshooting de Calibração](#troubleshooting-de-calibração)

---

## 🎯 Introdução

A calibração é o processo mais crítico para garantir precisão do sistema. Uma calibração incorreta pode resultar em leituras completamente erradas.

**Frequência Recomendada**:
- Calibração Inicial: Antes de usar o sistema
- Calibração Mensal: A cada 30 dias
- Calibração de Emergência: Se notar inconsistências

**Tempo Necessário**: 60-90 minutos

---

## 🔧 Calibração Inicial

### Passo 1: Preparação de Materiais

**Materiais Necessários**:
- ✅ Água destilada (1 litro)
- ✅ Água com KH conhecido (500ml)
- ✅ Termômetro de referência (±0.5°C)
- ✅ Béquer ou copo (250ml)
- ✅ Papel filtro
- ✅ Multímetro (opcional)

**Água Destilada**:
- Deve ser recém-destilada (< 1 dia)
- Armazenada em recipiente fechado
- Sem contato com ar (CO₂ pode contaminar)

**Água com KH Conhecido**:
- Opção 1: Comprar solução padrão (R$ 50-100)
- Opção 2: Usar água de aquário com KH medido por Hanna
- Opção 3: Preparar solução com bicarbonato de sódio

### Passo 2: Medição de Temperatura

```
Procedimento:
1. Meça a temperatura ambiente
2. Anote o valor (ex: 25.3°C)
3. Deixe os materiais estabilizarem (15 min)
4. Meça novamente
5. Use a temperatura estabilizada para cálculos

Temperatura Ideal: 25°C
Aceitável: 20-30°C
```

### Passo 3: Calibração do Sensor pH

```
Procedimento:
1. Acesse "Configurações" → "Calibração"
2. Clique em "Calibrar Sensor pH"
3. Prepare solução pH 7.0 (buffer)
4. Mergulhe sensor na solução
5. Aguarde 2 minutos
6. Anote o valor ADC
7. Clique em "Próximo"
8. Repita para pH 4.0 e pH 10.0
9. Sistema calcula curva de calibração
10. Clique em "Salvar"
```

**Soluções de Calibração**:

| pH | Preparação | Custo |
|----|-----------|-------|
| 4.0 | Solução comercial ou vinagre | R$ 20 |
| 7.0 | Solução comercial ou água destilada | R$ 20 |
| 10.0 | Solução comercial ou bicarbonato | R$ 20 |

### Passo 4: Calibração de KH

```
Procedimento:
1. Coloque água com KH conhecido no reservatório C
2. Acesse "Configurações" → "Calibração KH"
3. Insira o valor de KH conhecido (ex: 8.0 dKH)
4. Clique em "Iniciar Calibração"
5. Aguarde ~40 minutos
6. Sistema executa ciclo completo
7. Compara resultado com valor inserido
8. Calcula fator de correção
9. Clique em "Salvar"

Resultado Esperado:
- Diferença < 0.2 dKH
- Se > 0.2 dKH: Repita calibração
```

### Passo 5: Teste de Validação

```
Procedimento:
1. Prepare 3 amostras diferentes
2. Meça com ReefBlueSky
3. Meça com método comercial (Hanna)
4. Compare resultados

Critério de Aceitação:
- Diferença < 0.2 dKH em 80% das amostras
- Desvio padrão < 0.15 dKH
- Se não atender: Repita calibração
```

---

## 📅 Calibração Mensal

### Procedimento Simplificado

```
Tempo: 45 minutos

1. Limpeza do Sensor pH (5 min)
   - Remova sensor
   - Lave com água destilada
   - Seque com papel macio
   - Reinstale

2. Calibração de pH (15 min)
   - Use apenas pH 7.0 e pH 10.0
   - Não é necessário pH 4.0 (menos crítico)
   - Siga procedimento anterior

3. Teste com Amostra Padrão (25 min)
   - Use água com KH conhecido
   - Coloque no reservatório C
   - Execute ciclo de medição
   - Compare com valor esperado

4. Validação (5 min)
   - Se diferença < 0.1 dKH: OK
   - Se diferença > 0.1 dKH: Repita calibração pH
```

---

## 🔬 Calibração de Sensores

### Sensor pH (PH-4502C)

**Sinais de Necessidade de Calibração**:
- Leituras inconsistentes (variação > 0.5 pH)
- Leituras fora do esperado
- Sensor com mais de 1 mês sem calibração

**Procedimento Detalhado**:

```
Etapa 1: Limpeza
1. Remova o sensor
2. Lave com água destilada (não use álcool)
3. Seque com papel macio (não esfregue)
4. Deixe em solução de armazenamento por 5 min
5. Limpe novamente com água destilada

Etapa 2: Calibração em 3 Pontos
1. Prepare soluções pH 4.0, 7.0, 10.0
2. Mergulhe sensor em pH 7.0 por 2 minutos
3. Anote leitura (deve ser ~7.0)
4. Repita para pH 4.0 (deve ser ~4.0)
5. Repita para pH 10.0 (deve ser ~10.0)

Etapa 3: Ajuste (se necessário)
1. Se leitura diferir > 0.2 pH:
   - Verifique solução de calibração
   - Verifique temperatura
   - Limpe sensor novamente
   - Repita calibração

Etapa 4: Armazenamento
1. Coloque sensor em solução de armazenamento
2. Feche recipiente hermeticamente
3. Armazene em local fresco (não congelador)
```

### Sensor de Temperatura (DS18B20)

**Sinais de Necessidade de Calibração**:
- Diferença > 1°C com termômetro de referência
- Leituras oscilantes

**Procedimento**:

```
Etapa 1: Teste em Água Conhecida
1. Prepare água em diferentes temperaturas
2. Mergulhe sensor e termômetro de referência
3. Aguarde 2 minutos
4. Compare leituras

Etapa 2: Ajuste (se necessário)
1. Se diferença < 0.5°C: Aceitável
2. Se diferença > 0.5°C: Possível defeito
3. Troque o sensor se necessário

Etapa 3: Validação
1. Teste em 3 temperaturas diferentes
2. Valide em cada ponto
3. Se consistente: Sensor OK
```

### Sensores de Nível (Capacitivos)

**Sinais de Necessidade de Calibração**:
- Câmaras não enchem/esvaziam
- Sensor não detecta água

**Procedimento**:

```
Etapa 1: Teste Visual
1. Encha câmara manualmente
2. Observe se sensor detecta
3. Esvazie câmara
4. Observe se sensor desativa

Etapa 2: Ajuste de Sensibilidade
1. Acesse "Configurações" → "Sensores"
2. Clique em "Calibrar Nível"
3. Siga instruções na tela
4. Encha câmara até marca
5. Clique em "Cheio"
6. Esvazie câmara
7. Clique em "Vazio"
8. Sistema calibra automaticamente

Etapa 3: Teste
1. Encha/esvazie câmara 3 vezes
2. Verifique se sensor responde
3. Se problema persiste: Troque sensor
```

---

## 🐛 Troubleshooting de Calibração

### Problema: Calibração Falha - "pH Fora de Faixa"

**Causas Possíveis**:
- Solução de calibração contaminada
- Sensor pH defeituoso
- Temperatura muito diferente

**Solução**:
```
1. Verifique data da solução de calibração
2. Se > 6 meses: Compre nova
3. Teste sensor em água destilada
4. Se pH não muda: Sensor defeituoso
5. Troque sensor e repita calibração
```

### Problema: Calibração Inconsistente

**Causas Possíveis**:
- Temperatura variável
- Água destilada contaminada
- Sensor pH sujo

**Solução**:
```
1. Aguarde temperatura estabilizar
2. Use água destilada recém-aberta
3. Limpe sensor com água destilada
4. Repita calibração em ambiente estável
```

### Problema: KH Calculado Muito Alto/Baixo

**Causas Possíveis**:
- Sensor pH não calibrado
- Água de referência incorreta
- Temperatura não compensada

**Solução**:
```
1. Recalibre sensor pH
2. Verifique água de referência (KH conhecido)
3. Verifique se compensação de temperatura está ativa
4. Repita ciclo de medição
```

### Problema: Erro "Calibração Expirada"

**Significado**: Calibração tem mais de 30 dias

**Solução**:
```
1. Acesse "Configurações"
2. Clique em "Recalibrar"
3. Siga procedimento de calibração mensal
4. Salve nova calibração
```

---

## 📊 Tabela de Referência Rápida

### Soluções de Calibração

| pH | Preparação Caseira | Custo | Estabilidade |
|----|-------------------|-------|--------------|
| 4.0 | Vinagre (5% ácido acético) | R$ 5 | 1 semana |
| 7.0 | Água destilada + 1% NaCl | R$ 5 | 2 semanas |
| 10.0 | Bicarbonato 1% em água | R$ 5 | 1 semana |

**Nota**: Soluções comerciais são mais estáveis (3-6 meses)

### Frequência de Calibração por Tipo

| Tipo | Frequência | Razão |
|------|-----------|-------|
| Sensor pH | Mensal | Desgaste natural |
| Sensor Temperatura | Trimestral | Muito estável |
| Sensores Nível | Semestral | Raramente precisa |
| Fator KH | Mensal | Variações de pH |

---

## ✅ Checklist de Calibração

### Calibração Inicial
- [ ] Materiais preparados
- [ ] Temperatura medida e anotada
- [ ] Sensor pH calibrado (3 pontos)
- [ ] Água com KH conhecido preparada
- [ ] Ciclo de calibração executado
- [ ] Fator de correção calculado
- [ ] Teste de validação realizado
- [ ] Resultado dentro de especificação

### Calibração Mensal
- [ ] Sensor pH limpo
- [ ] Sensor pH calibrado (2 pontos)
- [ ] Amostra padrão preparada
- [ ] Ciclo de medição executado
- [ ] Resultado comparado
- [ ] Diferença < 0.1 dKH
- [ ] Calibração salva

---

## 📞 Suporte de Calibração

**Se tiver dúvidas**:
1. Consulte este guia
2. Verifique vídeo tutorial (link)
3. Abra issue no GitHub
4. Entre em contato: suporte@reefbluesky.com

---

**Versão**: 1.0  
**Data**: Novembro 2025  
**Status**: ✅ Pronto para Uso
