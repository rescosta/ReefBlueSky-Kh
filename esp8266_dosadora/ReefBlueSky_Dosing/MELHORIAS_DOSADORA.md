# Melhorias Sistema de Dosagem ReefBlueSky KH

## 1. SEGURANÇA E MONITORAMENTO (PRIORIDADE ALTA)

### Hardware já planejado:
- ✅ Sensor de corrente na linha 12V
- ✅ Fusível blade 1A
- ✅ MOSFET para controle/proteção

### Software necessário para suportar hardware acima:
- [ ] **Monitoramento de corrente em tempo real**
  - Detectar motor travado (corrente acima do normal)
  - Detectar motor não girando (corrente zero quando deveria estar dosando)
  - Detectar ULN2003 em curto (corrente contínua fora do ciclo de dosagem)
  - Alarmes via notificação push/email quando corrente anormal

- [ ] **Watchdog de dosagem**
  - Se motor roda mais que tempo previsto + margem (ex: 20%), cortar MOSFET
  - Log de tempo real vs tempo esperado de cada dose
  - Histórico de anomalias (motor demorou mais, travou, etc)

- [ ] **Detecção de falhas críticas**
  - Fusível queimado (sem corrente quando deveria ter)
  - Bomba desconectada (sem corrente)
  - Vazamento de produto (dosagem muito rápida = resistência baixa)

### Outros itens de segurança:
- [ ] **Limite de volume diário por bomba**
  - Configurar volume máximo que cada bomba pode dosar por dia
  - Bloquear dosagens se ultrapassar limite (proteção contra overdose)
  - Alarme se atingir 80% do limite

- [ ] **Detecção de recipiente vazio**
  - Opcional: sensor de nível nos recipientes de reagentes
  - Avisar quando está acabando produto
  - Bloquear dosagem se recipiente vazio (evitar ar no sistema)

- [ ] **Modo de manutenção**
  - Desabilitar todas as dosagens temporariamente
  - Útil para manutenção do aquário, trocas de água, etc
  - Timer para reativar automaticamente após X horas

- [ ] **Backup de configuração**
  - Export/import de todas as agendas e configurações
  - Backup automático na nuvem
  - Restaurar configuração após falha/troca de dispositivo


## 2. CALIBRAÇÃO E PRECISÃO

- [ ] **Calibração inteligente**
  - Wizard de calibração guiado passo a passo
  - Testar múltiplas dosagens (ex: 3x 10ml) e calcular média
  - Detectar variação/inconsistência na calibração
  - Recalibração automática periódica (mensal)

- [ ] **Compensação de temperatura**
  - Viscosidade muda com temperatura
  - Ajustar ml/segundo baseado em temperatura ambiente
  - Integrar com sensor de temperatura do sistema

- [ ] **Compensação de bolhas de ar**
  - Detectar quando há ar no tubo (dosagem muito rápida)
  - Sugerir purgar sistema antes de iniciar dosagens

- [ ] **Curva de calibração não-linear**
  - Algumas bombas não dosam linearmente em volumes muito pequenos ou grandes
  - Calibrar múltiplos pontos (1ml, 5ml, 10ml, 50ml, 100ml)
  - Interpolar para volumes intermediários


## 3. FUNCIONALIDADES AVANÇADAS DE DOSAGEM

- [ ] **Dosagem baseada em testes**
  - Integrar com teste de KH/Ca/Mg
  - Ajustar automaticamente volume de dosagem baseado no resultado
  - Ex: Se KH está baixo, aumentar dosagem; se alto, diminuir
  - Machine learning para prever consumo e antecipar ajustes

- [x] **Rampas de dosagem**
  - Aumentar/diminuir gradualmente volume ao longo de semanas
  - Útil ao adicionar novo coral ou mudar sistema
  - Ex: "Aumentar de 50ml para 100ml ao longo de 14 dias"

- [ ] **Dosagem condicional**
  - Dosar apenas se parâmetro estiver em range específico
  - Ex: "Dosar Ca apenas se KH > 7.0"
  - Evitar desbalancear parâmetros

- [ ] **Perfis sazonais**
  - Diferentes configurações para períodos do ano
  - Ex: Verão (mais crescimento coral) vs Inverno
  - Trocar perfil automaticamente por data

- [x] **Receitas predefinidas**
  - Templates para sistemas populares:
    - Método Balling 2-part
    - Método All-For-Reef
    - Método Triton
    - Método Red Sea
  - Calcular volumes automaticamente baseado em litros do aquário


## 4. INTERFACE E UX

- [x] **Dashboard mais visual**
  - Gráficos de dosagem ao longo do tempo <<
  - Comparar volume dosado vs esperado
  - Timeline visual das doses do dia/semana <<
  - Indicadores visuais de saúde (verde/amarelo/vermelho)

- [x] **Modo escuro/claro**
  - Toggle entre temas
  - Lembrar preferência do usuário

- [x] **App mobile nativo**
  - iOS/Android
  - Notificações push
  - Mais responsivo que web

- [ ] **Widget para dashboard principal**
  - Ver status de dosagem direto na tela principal do aquário
  - Resumo: próxima dose, volume hoje, alertas

- [x] **Histórico detalhado**
  - Ver todas as doses executadas nos últimos 30/60/90 dias
  - Filtrar por bomba, data, sucesso/falha
  - Export CSV/Excel para análise

- [x] **Visualização de conflitos**
  - Mostrar visualmente quando há conflito de horário
  - Sugerir ajustes automáticos
  - Preview de como ficará após resolver conflitos


## 5. INTEGRAÇÃO E AUTOMAÇÃO

- [x] **API REST completa**
  - Permitir integração com Home Assistant, Node-RED, etc
  - Controlar dosagem via API externa
  - Webhook para eventos (dose executada, falha, etc)

- [ ] **MQTT**
  - Publicar eventos e status via MQTT
  - Permitir controle via MQTT
  - Integração mais fácil com sistemas IoT

- [x] **Alexa/Google Home**
  - Comandos de voz: "Alexa, dosar 5ml de Ca agora"
  - Consultar: "Alexa, quando foi a última dose de KH?"

- [ ] **IFTTT/Zapier**
  - Criar automações complexas
  - Ex: "Se pH baixar abaixo de 8.0, dosar buffer"

- [ ] **Integração com controladores existentes**
  - Apex, GHL ProfiLux, ReefKeeper
  - Sincronizar parâmetros e ajustar dosagem


## 6. RELATÓRIOS E ANÁLISE

- [x] **Relatório de consumo**
  - Volume total dosado por reagente no mês
  - Custo estimado (configurar preço por litro)
  - Previsão de quando vai acabar o reagente
  - Alerta para comprar antes de acabar

- [x] **Análise de tendências**
  - Gráfico de consumo ao longo do tempo
  - Detectar mudanças (ex: consumo de Ca aumentou 20% no último mês)
  - Correlacionar com eventos (adição de corais, trocas de água)

- [x] **Relatório de saúde do sistema**
  - Uptime das bombas
  - Taxa de falhas
  - Precisão (dose real vs esperada)
  - Sugestão de manutenção preventiva

- [x] **Export para Excel/PDF**
  - Relatórios completos
  - Útil para documentação ou compartilhar com aquaristas


## 7. MANUTENÇÃO E DIAGNÓSTICO

- [x] **Teste de bombas**
  - Botão "Testar bomba" para dosar pequeno volume
  - Verificar se motor gira suavemente
  - Medir tempo real vs esperado

- [x] **Diagnóstico automático**
  - Ao conectar, sistema testa:
    - Comunicação com bombas
    - Sensor de corrente funcionando
    - MOSFET respondendo
    - WiFi estável
  - Gera relatório de saúde

- [x] **Log detalhado**
  - Todos os eventos com timestamp
  - Níveis: INFO, WARNING, ERROR, CRITICAL
  - Download de logs para análise offline
  - Envio automático de logs em caso de erro crítico

- [x] **Firmware OTA melhorado**
  - Verificar automaticamente se há atualização
  - Notificar usuário
  - Changelog do que mudou
  - Rollback automático se atualização falhar

- [x] **Contador de ciclos**
  - Quantas vezes cada bomba foi acionada (vida útil)
  - Alertar quando atingir vida útil esperada (ex: 50.000 ciclos)
  - Sugerir substituição preventiva


## 8. RECURSOS COMUNITÁRIOS

- [x] **Compartilhar configurações**
  - Upload de "receita" de dosagem
  - Outros usuários podem importar
  - Comentários e avaliações
  - "Top receitas" da comunidade

- [ ] **Fórum integrado**
  - Usuários ajudam usuários
  - Compartilhar experiências
  - Troubleshooting colaborativo

- [ ] **Banco de dados de reagentes**
  - Info sobre reagentes populares
  - Composição, concentração
  - Preço médio
  - Onde comprar


## 9. RECURSOS PREMIUM (Monetização)

- [ ] **Backup em nuvem**
  - Backup automático diário
  - Acesso de qualquer lugar
  - Histórico ilimitado

- [x] **Notificações avançadas**
  - Email, SMS, WhatsApp
  - Alertas customizados
  - Prioridade (crítico/médio/baixo)

- [ ] **Suporte prioritário**
  - Resposta em até 24h
  - Acesso a beta features
  - Consultoria de configuração

- [ ] **Multi-dispositivos**
  - Controlar múltiplas dosadoras
  - Dashboard unificado
  - Útil para lojas ou múltiplos aquários


## 10. COMPARAÇÃO COM MERCADO

### O que sistemas comerciais têm e ainda não temos:

#### GHL Doser 2.1:
- Detecção de recipiente vazio (sensor capacitivo)
- Calibração em 2 pontos (ml/min e ml/segundo)
- Controle via Profilux (integração total)

#### Kamoer X4 Pro:
- Tela LCD no próprio dispositivo
- Controle manual direto (sem precisar app)
- 4 bombas peristálticas de alta precisão
- Detecção de obstrução

#### Neptune DOS:
- Calibração automática com balança
- Modo "mantenedor" (monitora parâmetro e ajusta)
- Integração total com Apex (controle baseado em sensores)

#### Red Sea ReefDose:
- Dosagem baseada em resultado de testes ICP
- App muito polido e intuitivo
- Sugestões automáticas de ajuste

### O que temos e mercado não tem (diferenciais):
- ✅ Detecção de conflitos entre agendas
- ✅ Resolução automática de conflitos
- ✅ Suporte a horários que cruzam meia-noite
- ✅ Open source / customizável
- ✅ Custo muito inferior
- ✅ OTA updates fácil
- ✅ Integração com sistema completo de monitoramento


## PRIORIZAÇÃO SUGERIDA

### Fase 1 - Segurança (URGENTE):
1. Implementar leitura de sensor de corrente
2. Watchdog de dosagem (cortar MOSFET se exceder tempo)
3. Alarmes de corrente anormal
4. Limite de volume diário

### Fase 2 - Calibração e Precisão:
1. Wizard de calibração melhorado
2. Log de dosagem real vs esperada
3. Detecção de bolhas de ar

### Fase 3 - UX:
1. Dashboard com gráficos
2. Histórico detalhado
3. Modo escuro
4. Visualização de conflitos

### Fase 4 - Funcionalidades Avançadas:
1. Dosagem baseada em testes
2. Rampas de dosagem
3. Receitas predefinidas
4. Perfis sazonais

### Fase 5 - Integração:
1. API REST completa
2. MQTT
3. Webhook para eventos
4. Home Assistant integration

### Fase 6 - Análise:
1. Relatório de consumo
2. Análise de tendências
3. Previsão de fim de reagente
4. Export Excel/PDF
