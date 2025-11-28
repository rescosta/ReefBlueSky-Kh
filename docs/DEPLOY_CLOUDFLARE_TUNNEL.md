# 🚀 Guia de Deploy com Cloudflare Tunnel

## Visão Geral

Este guia explica como fazer deploy do ReefBlueSky KH Monitor em produção usando **Cloudflare Tunnel** para expor o servidor Node.js com HTTPS automático, sem necessidade de abrir portas no firewall.

### Benefícios do Cloudflare Tunnel

✅ **HTTPS Automático** - Certificado SSL/TLS gratuito  
✅ **Sem Abrir Portas** - Segurança aumentada  
✅ **DNS Automático** - Integração com Cloudflare DNS  
✅ **Proteção DDoS** - Proteção integrada  
✅ **Analytics** - Monitoramento de tráfego  

---

## 1. Pré-requisitos

- Domínio registrado no Cloudflare
- Servidor com Node.js 16+
- Conta Cloudflare (gratuita)
- SSH acesso ao servidor

---

## 2. Instalação do Cloudflare Tunnel

### 2.1 Instalar Cloudflare Tunnel (cloudflared)

**Linux/macOS:**
```bash
curl -L --output cloudflared.tgz https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.tgz
tar -xzf cloudflared.tgz
sudo mv cloudflared /usr/local/bin/
sudo chmod +x /usr/local/bin/cloudflared
```

**Verificar instalação:**
```bash
cloudflared --version
```

### 2.2 Autenticar com Cloudflare

```bash
cloudflared tunnel login
```

Isso abrirá um navegador para autenticar com sua conta Cloudflare.

### 2.3 Criar Tunnel

```bash
cloudflared tunnel create reefbluesky
```

Isso criará um tunnel chamado `reefbluesky` e gerará um token.

---

## 3. Configurar Backend Node.js

### 3.1 Estrutura de Diretórios

```
/home/ubuntu/reefbluesky/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── .env
├── frontend/
│   ├── build/
│   └── ...
└── cloudflare/
    └── config.yml
```

### 3.2 Instalar Dependências

```bash
cd /home/ubuntu/reefbluesky/backend
npm install
```

### 3.3 Configurar Variáveis de Ambiente

```bash
# Criar .env baseado em .env.example
cp .env.example .env

# Editar .env com suas credenciais
nano .env
```

**Conteúdo do .env:**
```env
PORT=3000
NODE_ENV=production
JWT_SECRET=seu-secret-super-seguro-aqui
JWT_REFRESH_SECRET=seu-refresh-secret-aqui
ALLOWED_ORIGINS=https://seu-dominio.com,https://app.seu-dominio.com
MQTT_BROKER=mqtt://mqtt.seu-dominio.com:8883
MQTT_USERNAME=seu-usuario
MQTT_PASSWORD=sua-senha
```

### 3.4 Testar Backend Localmente

```bash
npm start
```

Deve exibir:
```
[SERVER] Servidor iniciado com sucesso
[SERVER] Porta: 3000
```

---

## 4. Configurar Cloudflare Tunnel

### 4.1 Criar Arquivo de Configuração

Criar `/home/ubuntu/reefbluesky/cloudflare/config.yml`:

```yaml
# [CLOUDFLARE] Configuração do Tunnel
tunnel: reefbluesky
credentials-file: /home/ubuntu/.cloudflared/reefbluesky.json

ingress:
  # [FRONTEND] Servir aplicação React
  - hostname: seu-dominio.com
    service: http://localhost:3000
    
  # [API] Endpoints da API
  - hostname: api.seu-dominio.com
    service: http://localhost:3000
    
  # [FALLBACK] Rota padrão
  - service: http_status:404
```

### 4.2 Iniciar Tunnel

```bash
cloudflared tunnel run --config /home/ubuntu/reefbluesky/cloudflare/config.yml reefbluesky
```

Deve exibir:
```
[CLOUDFLARE] Tunnel conectado com sucesso
[CLOUDFLARE] URL: https://seu-dominio.com
```

---

## 5. Configurar Systemd (Inicialização Automática)

### 5.1 Criar Serviço Node.js

Criar `/etc/systemd/system/reefbluesky-backend.service`:

```ini
[Unit]
Description=ReefBlueSky KH Monitor - Backend Node.js
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/reefbluesky/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

Environment="NODE_ENV=production"
EnvironmentFile=/home/ubuntu/reefbluesky/backend/.env

[Install]
WantedBy=multi-user.target
```

### 5.2 Criar Serviço Cloudflare Tunnel

Criar `/etc/systemd/system/cloudflared.service`:

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel run --config /home/ubuntu/reefbluesky/cloudflare/config.yml reefbluesky
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 5.3 Ativar Serviços

```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Ativar serviços
sudo systemctl enable reefbluesky-backend
sudo systemctl enable cloudflared

# Iniciar serviços
sudo systemctl start reefbluesky-backend
sudo systemctl start cloudflared

# Verificar status
sudo systemctl status reefbluesky-backend
sudo systemctl status cloudflared
```

---

## 6. Configurar Frontend React

### 6.1 Build da Aplicação

```bash
cd /home/ubuntu/reefbluesky/frontend
npm run build
```

Isso criará uma pasta `build/` com arquivos estáticos.

### 6.2 Servir Frontend com Express

Adicionar ao `backend/server.js`:

```javascript
// [FRONTEND] Servir arquivos estáticos
app.use(express.static('/home/ubuntu/reefbluesky/frontend/build'));

// [FRONTEND] Rota catch-all para React Router
app.get('*', (req, res) => {
    res.sendFile('/home/ubuntu/reefbluesky/frontend/build/index.html');
});
```

---

## 7. Configurar DNS no Cloudflare

### 7.1 Adicionar Registros DNS

1. Ir para **Cloudflare Dashboard** → **DNS**
2. Adicionar registros CNAME:

```
seu-dominio.com      → CNAME → reefbluesky.cfargotunnel.com
api.seu-dominio.com  → CNAME → reefbluesky.cfargotunnel.com
```

### 7.2 Ativar Proxy (Orange Cloud)

- Clicar no ícone de nuvem para ativar proxy Cloudflare
- Isso ativa proteção DDoS e cache

---

## 8. Configurar SSL/TLS

### 8.1 Modo SSL/TLS

1. Ir para **SSL/TLS** → **Overview**
2. Selecionar **Full (strict)**

### 8.2 Certificado de Origem

```bash
# Gerar certificado auto-assinado (para origem)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

---

## 9. Monitoramento e Logs

### 9.1 Ver Logs do Backend

```bash
sudo journalctl -u reefbluesky-backend -f
```

### 9.2 Ver Logs do Cloudflare Tunnel

```bash
sudo journalctl -u cloudflared -f
```

### 9.3 Monitoramento em Tempo Real

```bash
# Verificar status dos serviços
sudo systemctl status reefbluesky-backend
sudo systemctl status cloudflared

# Ver uso de recursos
htop
```

---

## 10. Troubleshooting

### Problema: Tunnel não conecta

**Solução:**
```bash
# Verificar token
cloudflared tunnel list

# Reautenticar
cloudflared tunnel login

# Testar conectividade
ping seu-dominio.com
```

### Problema: Backend não responde

**Solução:**
```bash
# Verificar se Node.js está rodando
ps aux | grep node

# Reiniciar serviço
sudo systemctl restart reefbluesky-backend

# Ver logs
sudo journalctl -u reefbluesky-backend -n 50
```

### Problema: CORS error

**Solução:**
Verificar `ALLOWED_ORIGINS` em `.env`:
```env
ALLOWED_ORIGINS=https://seu-dominio.com,https://app.seu-dominio.com
```

---

## 11. Segurança em Produção

### 11.1 Firewall

```bash
# Permitir apenas SSH
sudo ufw allow 22/tcp
sudo ufw enable

# Verificar status
sudo ufw status
```

### 11.2 Certificados SSL

- Cloudflare fornece certificado automático
- Renovação automática a cada 90 dias

### 11.3 Rate Limiting

Já implementado no `server.js`:
- Global: 10 requisições/minuto
- Auth: 5 tentativas/15 minutos
- Sync: 100 requisições/hora

---

## 12. Backup e Recuperação

### 12.1 Backup de Dados

```bash
# Backup do banco de dados
mongodump --uri "mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky" --out /backup/reefbluesky

# Backup de configurações
tar -czf /backup/config.tar.gz /home/ubuntu/reefbluesky/backend/.env
```

### 12.2 Restauração

```bash
# Restaurar banco de dados
mongorestore --uri "mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky" /backup/reefbluesky

# Restaurar configurações
tar -xzf /backup/config.tar.gz -C /
```

---

## 13. Próximos Passos

- [ ] Configurar MQTT broker em produção
- [ ] Implementar autoscaling
- [ ] Configurar alertas
- [ ] Implementar CI/CD com GitHub Actions
- [ ] Testes de carga

---

## Suporte

Para problemas, consulte:
- [Documentação Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- [Documentação Node.js](https://nodejs.org/docs/)
- [Documentação Express.js](https://expressjs.com/)
