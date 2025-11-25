# ReefBlueSky KH Monitor - Guia de Instalação

## 📦 Arquivos Disponíveis

Este pacote contém todo o código necessário para o ReefBlueSky KH Monitor:

### 1. **ReefBlueSky_KH_Monitor_ESP32.zip** (583 KB)
Código completo para o microcontrolador ESP32

**Conteúdo:**
- `ReefBlueSky_KH_Monitor.ino` - Arquivo principal
- `src/PumpControl.h/cpp` - Controle das bombas peristálticas
- `src/SensorManager.h/cpp` - Leitura de sensores (pH, temperatura)
- `src/KH_Analyzer.h/cpp` - Análise de KH com calibração e compensação
- `src/WiFi_MQTT.h/cpp` - Comunicação WiFi e MQTT
- `src/MeasurementHistory.h/cpp` - Gerenciamento de histórico
- Documentação técnica completa (PDF e Markdown)
- Lista de materiais (BOM)
- Análise crítica do projeto

**Como Instalar:**
1. Extraia o arquivo ZIP
2. Abra `ReefBlueSky_KH_Monitor.ino` na Arduino IDE
3. Instale as bibliotecas necessárias:
   - ArduinoJson
   - PubSubClient (para MQTT)
   - DHT sensor library
4. Configure as credenciais WiFi no código
5. Faça upload para o ESP32

### 2. **ReefBlueSky_Website.zip** (1.8 MB)
Site web completo com React + Express + Banco de Dados

**Conteúdo:**
- Frontend React com 8 páginas
- Backend Express com tRPC
- Schema Drizzle ORM para MySQL
- Componentes UI com Tailwind CSS
- Autenticação OAuth integrada

**Como Instalar:**
1. Extraia o arquivo ZIP
2. Navegue até a pasta do projeto:
   ```bash
   cd reefbluesky_kh_monitor_website
   ```
3. Instale as dependências:
   ```bash
   pnpm install
   ```
4. Configure as variáveis de ambiente (arquivo `.env`)
5. Configure o banco de dados MySQL
6. Execute as migrações:
   ```bash
   pnpm db:push
   ```
7. Inicie o servidor de desenvolvimento:
   ```bash
   pnpm dev
   ```

## 🔧 Configuração do Banco de Dados

O site usa MySQL com Drizzle ORM. Tabelas criadas:

### `users`
- Armazena dados de usuários
- Integração com OAuth

### `kh_measurements`
- Histórico de medições de KH
- Campos: khValue, temperature, phReference, phSample, isValid, errorMessage

### `system_configs`
- Configurações do sistema por usuário
- Campos: testIntervalMinutes, tempCompensationFactor, autoCalibration, referenceKH

## 📊 Funcionalidades Implementadas

### ESP32
✅ Calibração com água de KH conhecido (reservatório C)
✅ Compensação de temperatura automática
✅ Detecção de erros (sensor, bomba, temperatura)
✅ Frequência configurável (1h a 24h)
✅ Histórico de medições (até 1000 registros)
✅ Validação de dados

### Website
✅ 8 páginas completas (Home, Galeria, Documentação, BOM, Análise, Código, Dashboard, Configurações)
✅ Dashboard com estatísticas e filtros temporais
✅ Página de Configurações com controles de sistema
✅ Galeria com 10 imagens profissionais
✅ Exportação de dados (CSV/JSON)
✅ Autenticação de usuários
✅ Integração com banco de dados

## 🚀 Próximos Passos

1. **Sincronização ESP32 ↔ Website**
   - Implementar API tRPC para receber medições do ESP32
   - Enviar configurações atualizadas para o dispositivo

2. **Gráficos Interativos**
   - Adicionar Chart.js para visualizar tendências de KH

3. **Alertas e Notificações**
   - Notificar quando KH sai do intervalo ideal
   - Alertas de erros detectados

4. **Integração MQTT**
   - Conectar ESP32 ao broker MQTT
   - Sincronizar dados em tempo real

## 📝 Documentação

Todos os arquivos incluem documentação completa:
- Manual técnico (PDF)
- Artigo científico (PDF)
- Lista de materiais com links de fornecedores
- Análise crítica e sugestões de melhoria
- Código comentado

## 🔗 Recursos

- **GitHub**: [Link do repositório]
- **Documentação Técnica**: Ver arquivo `manual_tecnico.pdf`
- **Artigo Científico**: Ver arquivo `artigo_cientifico.pdf`

## ⚠️ Requisitos

### Hardware
- ESP32 (WROOM-32 ou similar)
- 4 Bombas peristálticas Kamoer
- Sensor de pH PH-4502C
- Sensor de temperatura DS18B20
- Drivers de motor (TB6612FNG, ULN2003)
- 3 Câmaras de medição (50ml, 50ml, 200ml)

### Software
- Arduino IDE 1.8.0+
- Python 3.8+ (para o website)
- Node.js 16+ (para o website)
- MySQL 5.7+ (para o website)

## 📞 Suporte

Para dúvidas ou problemas:
1. Consulte a documentação técnica
2. Verifique a análise crítica para limitações conhecidas
3. Revise o código comentado

---

**Versão**: 1.0
**Data**: Novembro 2025
**Autor**: Manus AI
