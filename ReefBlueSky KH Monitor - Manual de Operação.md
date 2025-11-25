# ReefBlueSky KH Monitor - Manual de Operação

## 📋 Índice

1. [Primeiros Passos](#primeiros-passos)
2. [Interface Web](#interface-web)
3. [Configuração do Sistema](#configuração-do-sistema)
4. [Operação Diária](#operação-diária)
5. [Interpretação de Dados](#interpretação-de-dados)
6. [Manutenção](#manutenção)
7. [Troubleshooting](#troubleshooting)

---

## 🚀 Primeiros Passos

### Inicialização do Sistema

```
Procedimento:
1. Verifique se o reservatório está cheio
2. Ligue a fonte CFTV 120W
3. Aguarde 10 segundos (inicialização do ESP32)
4. Verifique se o LED indicador acendeu
5. Abra o navegador e acesse http://seu-ip:3000
6. Faça login com suas credenciais
7. Vá para "Configurações"
8. Verifique as tensões (12V, 5V, 3.3V)
```

### Primeira Execução

```
Procedimento:
1. Acesse "Configurações"
2. Insira o valor de KH conhecido (ex: 8 dKH)
3. Defina a frequência de testes (ex: 4 horas)
4. Ative "Compensação de Temperatura"
5. Clique em "Iniciar Calibração"
6. Aguarde ~40 minutos
7. Verifique o resultado na página "Dashboard"
```

---

## 🌐 Interface Web

### Página Home

```
Exibe:
- Status do sistema (Online/Offline)
- Última medição de KH
- Temperatura atual
- Próximo teste agendado
- Botões de ação rápida

Ações:
- Iniciar teste manual
- Acessar configurações
- Ver histórico
- Exportar dados
```

### Página Dashboard

```
Exibe:
- Gráfico de KH ao longo do tempo
- Estatísticas (Média, Mín, Máx)
- Tabela de histórico completo
- Filtros temporais (1h, 24h, 7d, Tudo)

Ações:
- Exportar em CSV
- Exportar em JSON
- Imprimir gráfico
- Compartilhar dados
```

### Página Configurações

```
Opções:
- Frequência de testes (1h a 24h)
- Valor de KH conhecido
- Compensação de temperatura
- Calibração automática
- Limpar histórico
- Reiniciar sistema

Botões:
- Salvar configurações
- Testar agora
- Resetar para padrão
- Exportar configurações
```

### Página Galeria

```
Exibe:
- Imagens do protótipo
- Slideshow do ciclo de medição
- Descrições técnicas
- Links para documentação

Funcionalidades:
- Zoom em imagens
- Fullscreen
- Download de imagens
```

### Página Documentação

```
Inclui:
- Guia de calibração
- Guia de troubleshooting
- FAQ
- Links para manuais
- Contato de suporte
```

---

## ⚙️ Configuração do Sistema

### Configuração Inicial

```
Passo 1: Acesso ao Sistema
1. Abra http://seu-ip:3000
2. Clique em "Login"
3. Use suas credenciais
4. Clique em "Entrar"

Passo 2: Configuração Básica
1. Vá para "Configurações"
2. Insira o nome do aquário (ex: "Meu Recife")
3. Insira a temperatura média (ex: 25°C)
4. Insira o volume do aquário (ex: 100L)

Passo 3: Configuração de Testes
1. Defina a frequência (ex: 4 horas)
2. Defina a hora de início (ex: 08:00)
3. Ative "Compensação de Temperatura"
4. Ative "Detecção de Erros"

Passo 4: Calibração
1. Coloque água com KH conhecido no reservatório C
2. Insira o valor de KH (ex: 8 dKH)
3. Clique em "Calibrar"
4. Aguarde ~40 minutos
5. Verifique o resultado
```

### Frequência de Testes

```
Recomendações:

Aquários Pequenos (< 50L):
- Frequência: 1-2 horas
- Razão: Mudanças rápidas de KH

Aquários Médios (50-200L):
- Frequência: 2-4 horas
- Razão: Mudanças moderadas

Aquários Grandes (> 200L):
- Frequência: 4-8 horas
- Razão: Mudanças lentas

Aquários Muito Grandes (> 500L):
- Frequência: 8-24 horas
- Razão: Mudanças muito lentas
```

### Compensação de Temperatura

```
Como Funciona:
- Sistema mede temperatura atual
- Compara com temperatura de referência (25°C)
- Ajusta KH calculado com fator de correção
- Fator: 1 + 0.002 × (T - 25)

Exemplo:
- Temperatura: 28°C
- KH calculado: 8.0 dKH
- Fator: 1 + 0.002 × (28 - 25) = 1.006
- KH corrigido: 8.0 × 1.006 = 8.048 dKH

Quando Ativar:
- Sempre que possível
- Especialmente em aquários com variação de temperatura
```

---

## 📅 Operação Diária

### Rotina Matinal

```
1. Verifique o status do sistema (LED verde)
2. Verifique o nível do reservatório
3. Verifique a última medição de KH
4. Verifique se há alertas no dashboard
5. Anote qualquer anomalia
```

### Rotina Semanal

```
1. Limpe os sensores com água destilada
2. Verifique se há vazamentos
3. Verifique o funcionamento das bombas
4. Exporte o histórico de dados
5. Analise as tendências de KH
```

### Rotina Mensal

```
1. Faça uma recalibração completa
2. Limpe o filtro do compressor
3. Verifique a integridade das mangueiras
4. Atualize o firmware (se disponível)
5. Faça backup dos dados
```

### Teste Manual

```
Procedimento:
1. Acesse "Configurações"
2. Clique em "Testar Agora"
3. Aguarde ~40 minutos
4. Verifique o resultado no "Dashboard"
5. Anote qualquer anomalia

Resultado Esperado:
- KH entre 1.0 e 20.0 dKH
- Sem mensagens de erro
- Histórico atualizado
```

---

## 📊 Interpretação de Dados

### Leitura de KH

```
Faixa Ideal para Aquários Marinhos:
- Mínimo: 7.0 dKH
- Ideal: 8.0 - 10.0 dKH
- Máximo: 12.0 dKH

Interpretação:
- < 7.0 dKH: Alcalinidade baixa (risco para corais)
- 7.0 - 10.0 dKH: Ideal (manter nesta faixa)
- 10.0 - 12.0 dKH: Alcalinidade alta (possível acúmulo)
- > 12.0 dKH: Muito alta (possível precipitação)
```

### Análise de Tendências

```
Gráfico Estável (Ideal):
- KH varia < 0.5 dKH/dia
- Indica sistema bem equilibrado
- Ação: Continuar monitorando

Gráfico Decrescente:
- KH diminui > 1.0 dKH/dia
- Indica consumo de alcalinidade
- Ação: Aumentar dosagem de alcalinidade

Gráfico Crescente:
- KH aumenta > 1.0 dKH/dia
- Indica excesso de alcalinidade
- Ação: Reduzir dosagem ou fazer trocas de água

Gráfico Instável:
- KH varia muito (> 2.0 dKH/dia)
- Indica possível erro de medição
- Ação: Recalibrar o sistema
```

### Alertas Automáticos

```
Alerta Vermelho (Crítico):
- KH < 6.0 dKH
- Ação: Aumentar dosagem imediatamente
- Frequência: A cada 30 minutos

Alerta Amarelo (Atenção):
- KH < 7.0 dKH ou > 12.0 dKH
- Ação: Verificar e ajustar
- Frequência: A cada 2 horas

Alerta Azul (Informativo):
- Próximo teste agendado
- Ação: Preparar para teste
- Frequência: 15 minutos antes
```

---

## 🧹 Manutenção

### Limpeza dos Sensores

```
Frequência: Semanal

Procedimento:
1. Desligue o sistema
2. Remova o sensor pH
3. Lave com água destilada
4. Seque com papel macio
5. Coloque em solução de armazenamento
6. Reinstale o sensor
7. Ligue o sistema

Solução de Armazenamento:
- Água destilada + 1% KCl
- Ou: Solução comercial de pH
```

### Limpeza das Câmaras

```
Frequência: Mensal

Procedimento:
1. Desligue o sistema
2. Remova as câmaras
3. Despeje a água
4. Lave com água destilada
5. Use escova macia para remover resíduos
6. Seque completamente
7. Reinstale as câmaras
8. Ligue o sistema
```

### Limpeza do Compressor

```
Frequência: Trimestral

Procedimento:
1. Desligue o sistema
2. Remova o tubo de ar
3. Limpe o filtro do compressor
4. Verifique se há obstruções
5. Reinstale o tubo
6. Teste o compressor
7. Ligue o sistema
```

### Substituição de Componentes

```
Sensor pH:
- Vida útil: 1-2 anos
- Sinais de desgaste: Leituras inconsistentes
- Substituição: Remova e instale novo

Bombas:
- Vida útil: 2-3 anos
- Sinais de desgaste: Vazão reduzida
- Substituição: Desconecte mangueiras e instale nova

Compressor:
- Vida útil: 2-3 anos
- Sinais de desgaste: Ruído excessivo
- Substituição: Desconecte tubo de ar e instale novo

Sensores de Temperatura:
- Vida útil: 5+ anos
- Sinais de desgaste: Leituras incorretas
- Substituição: Dessolde e solde novo
```

---

## 🐛 Troubleshooting

### Problema: Sistema Não Liga

**Causas Possíveis:**
- Fonte não ligada
- Fusível queimado
- Cabo desconectado

**Solução:**
1. Verifique se a fonte está ligada na tomada
2. Teste o fusível com multímetro
3. Verifique conexão do conector DC
4. Reinicie o sistema

### Problema: Leitura de KH Inconsistente

**Causas Possíveis:**
- Sensor pH sujo
- Calibração incorreta
- Temperatura variável

**Solução:**
1. Limpe o sensor pH com água destilada
2. Recalibre com água de KH conhecido
3. Ative compensação de temperatura
4. Aguarde 3 ciclos antes de analisar

### Problema: Bomba Não Funciona

**Causas Possíveis:**
- Bomba entupida
- Sem alimentação
- Driver defeituoso

**Solução:**
1. Desligue o sistema
2. Verifique se há obstruções
3. Teste a tensão na bomba
4. Teste o GPIO com LED
5. Troque o driver se necessário

### Problema: Compressor Não Funciona

**Causas Possíveis:**
- Tubo entupido
- Sem alimentação
- Fotoacoplador defeituoso

**Solução:**
1. Verifique se o tubo de ar está desobstruído
2. Teste a tensão no compressor
3. Teste o GPIO do fotoacoplador
4. Troque o fotoacoplador se necessário

### Problema: Website Não Acessível

**Causas Possíveis:**
- WiFi desconectado
- IP incorreto
- Servidor não respondendo

**Solução:**
1. Verifique conexão WiFi (LED WiFi piscando)
2. Verifique o IP no monitor serial
3. Reinicie o ESP32
4. Verifique o banco de dados

### Problema: Histórico Não Salva

**Causas Possíveis:**
- Memória cheia
- Banco de dados offline
- Erro de escrita

**Solução:**
1. Exporte o histórico (libera espaço)
2. Verifique conexão com banco de dados
3. Reinicie o sistema
4. Limpe o histórico se necessário

---

## 📞 Suporte

### Contato

- **Email**: suporte@reefbluesky.com
- **GitHub Issues**: https://github.com/seu-usuario/ReefBlueSky-KH-Monitor/issues
- **Forum**: https://forum.reefbluesky.com

### FAQ

**P: Com que frequência devo testar?**
R: Recomendamos 4 horas para aquários médios. Ajuste conforme necessário.

**P: Qual é a precisão do sistema?**
R: ±0.1 dKH após calibração correta.

**P: Quanto tempo dura um teste?**
R: Aproximadamente 40 minutos (5 fases de 8 minutos cada).

**P: Posso usar água da torneira?**
R: Não. Use água destilada ou deionizada.

**P: Com que frequência devo recalibrar?**
R: Mensalmente ou quando notar inconsistências.

---

## 📈 Otimização do Sistema

### Dicas para Melhor Precisão

1. **Mantenha temperatura estável** (±2°C)
2. **Use água de calibração fresca** (< 1 mês)
3. **Limpe sensores regularmente** (semanal)
4. **Calibre mensalmente** (ou quando necessário)
5. **Aguarde 3 ciclos** antes de analisar tendências

### Dicas para Melhor Confiabilidade

1. **Mantenha o reservatório cheio** (verifique diariamente)
2. **Verifique vazamentos** (semanal)
3. **Teste bombas individualmente** (mensal)
4. **Faça backup de dados** (semanal)
5. **Atualize firmware** (quando disponível)

---

## 🎓 Educação e Aprendizado

### Conceitos Importantes

**KH (Alcalinidade):**
- Medida da capacidade de tamponamento de pH
- Expressa em dKH (graus de dureza alemã)
- Essencial para a saúde de corais

**CO₂ Atmosférico:**
- Usado como referência para saturação
- Cria pH previsível em água destilada
- Permite cálculo de KH por diferença de pH

**Compensação de Temperatura:**
- KH varia com temperatura
- Sistema ajusta automaticamente
- Melhora precisão em ambientes variáveis

### Recursos Adicionais

- [Artigo Científico](docs/ARTIGO_CIENTIFICO.pdf)
- [Documentação Técnica](docs/DOCUMENTACAO_TECNICA.md)
- [Vídeos Tutoriais](https://youtube.com/seu-canal)
- [Comunidade](https://forum.reefbluesky.com)

---

**Versão**: 1.0
**Data**: Novembro 2025
**Autor**: Manus AI

**Última Atualização**: Novembro 2025
**Status**: ✅ Pronto para Uso
