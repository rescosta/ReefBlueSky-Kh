# 🌊 ReefBlueSky KH Monitor - Rev06

**Sistema de Monitoramento de Alcalinidade (KH) para Aquários Marinhos**

Analisador de alcalinidade de baixo custo baseado em ESP32 com integração em nuvem, interface web, segurança avançada e documentação completa.

---

## 📋 Visão Geral

O **ReefBlueSky KH Monitor** é um sistema automatizado para medir e monitorar a alcalinidade (KH) de aquários marinhos. Utiliza:

- **Hardware:** ESP32 + sensores de pH/temperatura + bombas peristálticas
- **Firmware:** C++ com WiFi, MQTT, HTTPS e armazenamento persistente
- **Backend:** Node.js com JWT, rate limiting e integração MQTT
- **Frontend:** React com dashboard em tempo real
- **Segurança:** 10 melhorias críticas implementadas
- **Deploy:** Cloudflare Tunnel para acesso remoto seguro

---

## ✨ Características Principais

### Hardware
- ✅ 4 bombas peristálticas (Kamoer) com controle PWM
- ✅ Sensores de pH (PH-4502C), temperatura (DS18B20), nível
- ✅ Sistema hidráulico de 3 câmaras (A, B, C)
- ✅ Fonte de alimentação 12V 10A com reguladores 5V/3.3V
- ✅ Consumo: ~2W em repouso, 15W durante medição

### Firmware ESP32
- ✅ Calibração com água de KH conhecido
- ✅ Compensação de temperatura automática (α = 0.002)
- ✅ Detecção de erros (sensor, bomba, temperatura)
- ✅ Histórico de até 1000 medições em SPIFFS
- ✅ Frequência configurável (1-24 horas)
- ✅ WiFi + MQTT + HTTPS com fallback
- ✅ Access Point para configuração inicial

### Backend Node.js
- ✅ Autenticação JWT com refresh tokens
- ✅ Rate limiting (10 req/min global, 5 tentativas/15min auth)
- ✅ Integração MQTT com fila offline
- ✅ Validação de entrada contra SQL injection
- ✅ CORS configurado
- ✅ Logs estruturados

### Frontend React
- ✅ Dashboard com gráficos em tempo real
- ✅ Histórico de medições com filtros
- ✅ Configurações do dispositivo
- ✅ Exportação de dados (CSV/JSON)
- ✅ Responsivo (mobile/tablet/desktop)

### Segurança
- ✅ Criptografia AES256 em NVS
- ✅ SSL/TLS com validação de certificado
- ✅ Rate limiting em múltiplas camadas
- ✅ Proteção contra replay attacks
- ✅ Command whitelist
- ✅ Sem dados sensíveis em logs

---

## 🚀 Início Rápido

### 1. Preparar Hardware

```bash
# Componentes necessários:
# - ESP32 DevKit
# - 4x Bombas Kamoer
# - Sensores (pH, temperatura, nível)
# - Fonte 12V 10A
# - Reguladores 5V/3.3V

# Ver: docs/BOM_COMPLETO.md para lista completa
```

### 2. Compilar Firmware ESP32

```bash
# Abrir Arduino IDE
# 1. Instalar ESP32 v3.0+
# 2. Abrir: esp32/ReefBlueSky_KH_Monitor_v2.ino
# 3. Configurar placa: ESP32 Dev Module
# 4. Compilar (Ctrl+R)
# 5. Upload (Ctrl+U)
```

### 3. Instalar Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env com suas credenciais
npm start
```

### 4. Instalar Frontend

```bash
cd frontend
npm install
npm run dev
# Acessar: http://localhost:5173
```

### 5. Deploy em Produção

```bash
# Ver: docs/DEPLOY_CLOUDFLARE_TUNNEL.md
# Resumo:
# 1. Instalar cloudflared
# 2. Autenticar com Cloudflare
# 3. Criar tunnel
# 4. Configurar systemd services
# 5. Ativar HTTPS
```

---

## 📁 Estrutura do Projeto

```
ReefBlueSky_Rev06/
├── esp32/                          # Firmware ESP32
│   ├── ReefBlueSky_KH_Monitor_v2.ino
│   ├── CloudAuth.h/cpp             # Autenticação em nuvem
│   ├── WiFiSetup.h/cpp             # Configuração WiFi (AP)
│   ├── MQTT_Integration.h           # Integração MQTT
│   ├── KH_Analyzer.h/cpp            # Análise de KH
│   ├── SensorManager.h/cpp          # Gerenciamento de sensores
│   ├── PumpControl.h/cpp            # Controle de bombas
│   ├── MeasurementHistory.h/cpp     # Histórico de medições
│   └── ...
├── backend/                        # Backend Node.js
│   ├── server.js                   # Servidor Express
│   ├── package.json
│   └── .env.example
├── frontend/                       # Frontend React
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   └── package.json
└── docs/                           # Documentação
    ├── README.md                   # Este arquivo
    ├── SEGURANCA_REV06.md          # Análise de segurança
    ├── MELHORIAS_REV06.md          # 10 melhorias implementadas
    ├── DEPLOY_CLOUDFLARE_TUNNEL.md # Deploy em produção
    ├── TESTES_PENETRACAO_SEGURANCA.md # Testes de segurança
    ├── GUIA_PRODUCAO.md            # Guia de produção
    ├── BOM_COMPLETO.md             # Lista de materiais
    ├── MANUAL_TECNICO.md           # Manual técnico
    ├── ARTIGO_CIENTIFICO.md        # Artigo científico
    └── ...
```

---

## 🔧 Configuração

### Variáveis de Ambiente (Backend)

```env
PORT=3000
NODE_ENV=production
JWT_SECRET=seu-secret-super-seguro
JWT_REFRESH_SECRET=seu-refresh-secret
ALLOWED_ORIGINS=https://seu-dominio.com
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky
MQTT_BROKER=mqtt://mqtt.seu-dominio.com:8883
MQTT_USERNAME=seu-usuario
MQTT_PASSWORD=sua-senha
LOG_LEVEL=info
```

### Configuração ESP32 (WiFiSetup.h)

```cpp
// WiFi
#define WIFI_SSID "seu-ssid"
#define WIFI_PASSWORD "sua-senha"

// Cloud
#define CLOUD_SERVER "seu-dominio.com"
#define CLOUD_PORT 443
#define CLOUD_ENDPOINT "/api/v1/device/sync"

// MQTT
#define MQTT_BROKER "mqtt.seu-dominio.com"
#define MQTT_PORT 8883
#define MQTT_USERNAME "seu-usuario"
#define MQTT_PASSWORD "sua-senha"
```

---

## 📊 Uso

### 1. Acessar Dashboard

```
https://seu-dominio.com
```

### 2. Fazer Login

```
Email: seu-email@exemplo.com
Senha: sua-senha
```

### 3. Visualizar Medições

- Gráficos em tempo real
- Histórico completo
- Estatísticas (média, mín, máx)
- Filtros por data/hora

### 4. Configurar Dispositivo

- Intervalo de medição (1-24 horas)
- Compensação de temperatura
- Calibração de sensores
- Reset de fábrica

---

## 🔒 Segurança

### 10 Melhorias Críticas Implementadas

1. ✅ **Criptografia NVS** - Tokens criptografados em armazenamento
2. ✅ **SSL/TLS Moderno** - setCACert() em vez de setFingerprint()
3. ✅ **Rate Limiting** - 10 req/min global, 5 tentativas/15min auth
4. ✅ **Proteção Replay** - Timestamp + nonce em cada requisição
5. ✅ **Command Whitelist** - Apenas comandos conhecidos aceitos
6. ✅ **Validação de Entrada** - Regex para todos os inputs
7. ✅ **CORS Restritivo** - Apenas origens permitidas
8. ✅ **JWT com Refresh** - Tokens curtos + refresh tokens longos
9. ✅ **Logs de Auditoria** - Sem dados sensíveis
10. ✅ **HTTPS Obrigatório** - Redirecionamento HTTP → HTTPS

Ver: `docs/SEGURANCA_REV06.md` para análise completa.

---

## 📚 Documentação

| Documento | Descrição |
|-----------|-----------|
| [SEGURANCA_REV06.md](docs/SEGURANCA_REV06.md) | Análise de 10 melhorias de segurança |
| [MELHORIAS_REV06.md](docs/MELHORIAS_REV06.md) | Detalhes técnicos de cada melhoria |
| [DEPLOY_CLOUDFLARE_TUNNEL.md](docs/DEPLOY_CLOUDFLARE_TUNNEL.md) | Deploy em produção com Cloudflare Tunnel |
| [TESTES_PENETRACAO_SEGURANCA.md](docs/TESTES_PENETRACAO_SEGURANCA.md) | Guia de testes de penetração |
| [GUIA_PRODUCAO.md](docs/GUIA_PRODUCAO.md) | Guia completo de produção |
| [BOM_COMPLETO.md](docs/BOM_COMPLETO.md) | Lista de materiais com fornecedores |
| [MANUAL_TECNICO.md](docs/MANUAL_TECNICO.md) | Manual técnico detalhado |
| [ARTIGO_CIENTIFICO.md](docs/ARTIGO_CIENTIFICO.md) | Artigo científico sobre o projeto |

---

## 🧪 Testes

### Teste de Compilação

```bash
# Arduino IDE
# Verificar: Sketch → Verify/Compile
# Resultado esperado: ✅ Sem erros
```

### Teste de Conectividade

```bash
# Verificar WiFi
# Serial Monitor deve exibir:
# [WIFI] Conectado a: seu-ssid
# [WIFI] IP: 192.168.1.100

# Verificar MQTT
# [MQTT] Conectado com sucesso!
```

### Teste de Segurança

```bash
# Ver: docs/TESTES_PENETRACAO_SEGURANCA.md
# Executar todos os testes de segurança
# Resultado esperado: ✅ Todos passando
```

---

## 🐛 Troubleshooting

### ESP32 não conecta ao WiFi

```
Solução:
1. Verificar SSID e senha em WiFiSetup.h
2. Verificar sinal WiFi (> -70 dBm)
3. Resetar ESP32: pressionar botão RESET
4. Ver logs no Serial Monitor
```

### Backend não inicia

```
Solução:
1. Verificar Node.js: node --version
2. Verificar dependências: npm install
3. Verificar .env: cp .env.example .env
4. Ver logs: npm start
```

### Frontend não carrega

```
Solução:
1. Verificar npm: npm --version
2. Limpar cache: npm cache clean --force
3. Reinstalar: rm -rf node_modules && npm install
4. Iniciar dev: npm run dev
```

---

## 📞 Suporte

- **Documentação:** Ver pasta `docs/`
- **GitHub Issues:** https://github.com/seu-usuario/reefbluesky/issues
- **Email:** support@reefbluesky.com

---

## 📄 Licença

Este projeto está licenciado sob a licença MIT. Ver `LICENSE` para detalhes.

---

## 🙏 Créditos

Desenvolvido com ❤️ para a comunidade de aquarismo marinho.

---

## 📈 Roadmap

- [ ] App mobile (iOS/Android)
- [ ] Integração com Home Assistant
- [ ] Suporte a múltiplos dispositivos
- [ ] Alertas por email/SMS
- [ ] Histórico de 1 ano
- [ ] Exportação de relatórios PDF
- [ ] API pública
- [ ] Comunidade de usuários

---

**Última atualização:** 2024-01-15  
**Versão:** Rev06  
**Status:** ✅ PRONTO PARA PRODUÇÃO
