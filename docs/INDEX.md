# 📚 Índice de Documentação - ReefBlueSky Rev06

## 🎯 Comece Aqui

1. **[README.md](../README.md)** - Visão geral e início rápido
2. **[MANUAL_TECNICO.md](MANUAL_TECNICO.md)** - Instruções de montagem e calibração
3. **[BOM_COMPLETO.md](BOM_COMPLETO.md)** - Lista de materiais com fornecedores

---

## 🔧 Desenvolvimento

### Firmware ESP32
- **[MANUAL_TECNICO.md](MANUAL_TECNICO.md)** - Guia de compilação e upload
- **Arquivos principais:**
  - `esp32/ReefBlueSky_KH_Monitor_v2.ino` - Firmware principal
  - `esp32/CloudAuth.h/cpp` - Autenticação em nuvem
  - `esp32/WiFiSetup.h/cpp` - Configuração WiFi via AP
  - `esp32/MQTT_Integration.h` - Integração MQTT com fallback
  - `esp32/KH_Analyzer.h/cpp` - Análise de alcalinidade
  - `esp32/SensorManager.h/cpp` - Gerenciamento de sensores
  - `esp32/PumpControl.h/cpp` - Controle de bombas

### Backend Node.js
- **[DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)** - Deploy em produção
- **Arquivos principais:**
  - `backend/server.js` - Servidor Express com JWT
  - `backend/package.json` - Dependências
  - `backend/.env.example` - Variáveis de ambiente

### Frontend React
- **[DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)** - Deploy em produção
- **Arquivos principais:**
  - `frontend/src/App.jsx` - Aplicação React
  - `frontend/package.json` - Dependências

---

## 🔒 Segurança

### Análise de Segurança
- **[SEGURANCA_REV06.md](SEGURANCA_REV06.md)** - Análise completa de segurança
- **[MELHORIAS_REV06.md](MELHORIAS_REV06.md)** - 10 melhorias críticas implementadas

### Testes de Segurança
- **[TESTES_PENETRACAO_SEGURANCA.md](TESTES_PENETRACAO_SEGURANCA.md)** - Guia de testes
  - Testes ESP32 (armazenamento, SSL/TLS, rate limiting)
  - Testes Backend (JWT, SQL injection, CORS)
  - Testes Frontend (XSS, token storage)
  - Testes de comunicação (HTTPS, certificados)
  - Testes de replay attacks
  - Testes de performance

---

## 🚀 Deploy e Produção

### Deploy
- **[DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)** - Deploy com Cloudflare Tunnel
  - Instalação do cloudflared
  - Configuração de tunnel
  - Systemd services
  - Nginx reverse proxy
  - SSL/TLS com Let's Encrypt

### Produção
- **[GUIA_PRODUCAO.md](GUIA_PRODUCAO.md)** - Guia completo de produção
  - Checklist pré-produção
  - Instalação em produção
  - Configuração de serviços
  - Monitoramento e alertas
  - Backup e recuperação
  - Escalabilidade
  - Plano de recuperação de desastres
  - Performance e otimização
  - Conformidade e regulamentações

---

## 📊 Referência Técnica

### Hardware
- **[BOM_COMPLETO.md](BOM_COMPLETO.md)** - Lista de materiais
  - Componentes eletrônicos
  - Sensores
  - Bombas e acessórios
  - Fornecedores brasileiros
  - Preços e links

### Firmware
- **[MANUAL_TECNICO.md](MANUAL_TECNICO.md)** - Manual técnico
  - Especificações de hardware
  - Pinagem ESP32
  - Calibração de sensores
  - Configuração de WiFi
  - Troubleshooting

### API Backend
- **[MANUAL_TECNICO.md](MANUAL_TECNICO.md)** - Endpoints da API
  - Autenticação (POST /api/v1/auth/login)
  - Dispositivos (GET/POST /api/v1/device)
  - Medições (GET /api/v1/measurements)
  - Configurações (GET/PUT /api/v1/config)
  - Sincronização (POST /api/v1/device/sync)

---

## 📖 Artigos e Análises

- **[ARTIGO_CIENTIFICO.md](ARTIGO_CIENTIFICO.md)** - Artigo científico
  - Introdução
  - Metodologia
  - Resultados
  - Discussão
  - Conclusões
  - Referências

---

## 🗂️ Estrutura de Arquivos

```
ReefBlueSky_Rev06/
├── README.md                           # Visão geral
├── esp32/                              # Firmware ESP32
│   ├── ReefBlueSky_KH_Monitor_v2.ino
│   ├── CloudAuth.h/cpp
│   ├── WiFiSetup.h/cpp
│   ├── MQTT_Integration.h
│   ├── KH_Analyzer.h/cpp
│   ├── SensorManager.h/cpp
│   ├── PumpControl.h/cpp
│   ├── MeasurementHistory.h/cpp
│   └── ...
├── backend/                            # Backend Node.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/                           # Frontend React
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   └── package.json
└── docs/                               # Documentação
    ├── INDEX.md                        # Este arquivo
    ├── SEGURANCA_REV06.md
    ├── MELHORIAS_REV06.md
    ├── DEPLOY_CLOUDFLARE_TUNNEL.md
    ├── TESTES_PENETRACAO_SEGURANCA.md
    ├── GUIA_PRODUCAO.md
    ├── BOM_COMPLETO.md
    ├── MANUAL_TECNICO.md
    ├── ARTIGO_CIENTIFICO.md
    └── ...
```

---

## 🔍 Buscar por Tópico

### Começando
- Como instalar? → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)
- Quais componentes preciso? → [BOM_COMPLETO.md](BOM_COMPLETO.md)
- Como compilar o firmware? → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)

### Usando
- Como fazer login? → [README.md](../README.md)
- Como calibrar sensores? → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)
- Como exportar dados? → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)

### Desenvolvendo
- Como modificar o firmware? → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)
- Como adicionar novos sensores? → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)
- Como estender a API? → [DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)

### Segurança
- Quais melhorias de segurança foram implementadas? → [SEGURANCA_REV06.md](SEGURANCA_REV06.md)
- Como testar a segurança? → [TESTES_PENETRACAO_SEGURANCA.md](TESTES_PENETRACAO_SEGURANCA.md)
- Como proteger minha instalação? → [GUIA_PRODUCAO.md](GUIA_PRODUCAO.md)

### Deploy
- Como fazer deploy em produção? → [DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)
- Como configurar Cloudflare Tunnel? → [DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)
- Como fazer backup? → [GUIA_PRODUCAO.md](GUIA_PRODUCAO.md)

### Troubleshooting
- ESP32 não conecta ao WiFi → [MANUAL_TECNICO.md](MANUAL_TECNICO.md)
- Backend não inicia → [DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md)
- Frontend não carrega → [README.md](../README.md)

---

## 📞 Suporte

- **Documentação:** Este índice
- **GitHub Issues:** https://github.com/seu-usuario/reefbluesky/issues
- **Email:** support@reefbluesky.com

---

## 📋 Checklist de Leitura

Leia os documentos nesta ordem:

- [ ] [README.md](../README.md) - 5 min
- [ ] [MANUAL_TECNICO.md](MANUAL_TECNICO.md) - 15 min
- [ ] [BOM_COMPLETO.md](BOM_COMPLETO.md) - 10 min
- [ ] [SEGURANCA_REV06.md](SEGURANCA_REV06.md) - 10 min
- [ ] [DEPLOY_CLOUDFLARE_TUNNEL.md](DEPLOY_CLOUDFLARE_TUNNEL.md) - 15 min
- [ ] [GUIA_PRODUCAO.md](GUIA_PRODUCAO.md) - 20 min
- [ ] [TESTES_PENETRACAO_SEGURANCA.md](TESTES_PENETRACAO_SEGURANCA.md) - 15 min

**Total:** ~90 minutos

---

**Última atualização:** 2024-01-15  
**Versão:** Rev06  
**Status:** ✅ COMPLETO
