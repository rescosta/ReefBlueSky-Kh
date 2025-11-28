# 🏭 Guia de Produção - ReefBlueSky Rev06

## Visão Geral

Este guia fornece instruções completas para colocar o ReefBlueSky KH Monitor em produção com alta disponibilidade, segurança e confiabilidade.

---

## 1. Checklist Pré-Produção

### 1.1 Hardware

- [ ] ESP32 com firmware compilado e testado
- [ ] Sensores calibrados (pH, temperatura)
- [ ] Bombas peristálticas testadas
- [ ] Fonte de alimentação 12V 10A testada
- [ ] WiFi com sinal forte (> -70 dBm)

### 1.2 Servidor

- [ ] Servidor com Node.js 16+ instalado
- [ ] Banco de dados MongoDB configurado
- [ ] MQTT broker configurado
- [ ] Cloudflare Tunnel instalado
- [ ] Certificado SSL válido

### 1.3 Código

- [ ] Todos os testes passando
- [ ] Sem warnings de compilação
- [ ] Variáveis de ambiente configuradas
- [ ] Logs configurados
- [ ] Backup de código em Git

### 1.4 Segurança

- [ ] Testes de penetração completos
- [ ] Senhas alteradas do padrão
- [ ] Firewall configurado
- [ ] Backups criptografados
- [ ] Plano de recuperação de desastres

---

## 2. Instalação em Produção

### 2.1 Preparar Servidor

```bash
# Atualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# Instalar dependências
sudo apt-get install -y nodejs npm git curl wget

# Criar diretório de aplicação
sudo mkdir -p /opt/reefbluesky
sudo chown ubuntu:ubuntu /opt/reefbluesky
cd /opt/reefbluesky
```

### 2.2 Clonar Repositório

```bash
# Clonar código
git clone https://github.com/seu-usuario/reefbluesky.git .

# Instalar dependências
cd backend
npm install --production
```

### 2.3 Configurar Variáveis de Ambiente

```bash
# Criar .env em produção
cat > .env << EOF
PORT=3000
NODE_ENV=production
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
ALLOWED_ORIGINS=https://seu-dominio.com
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky
MQTT_BROKER=mqtt://mqtt.seu-dominio.com:8883
MQTT_USERNAME=seu-usuario
MQTT_PASSWORD=$(openssl rand -base64 16)
LOG_LEVEL=info
EOF

# Proteger arquivo
chmod 600 .env
```

### 2.4 Inicializar Banco de Dados

```bash
# Criar índices no MongoDB
mongo "mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky" << EOF
db.measurements.createIndex({ "deviceId": 1, "timestamp": -1 });
db.measurements.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 7776000 });
db.devices.createIndex({ "deviceId": 1 }, { unique: true });
db.configs.createIndex({ "deviceId": 1 }, { unique: true });
EOF
```

---

## 3. Configurar Serviços Systemd

### 3.1 Backend Node.js

Criar `/etc/systemd/system/reefbluesky.service`:

```ini
[Unit]
Description=ReefBlueSky KH Monitor - Backend
After=network.target mongodb.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/reefbluesky/backend
ExecStart=/usr/bin/node server.js

Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

Environment="NODE_ENV=production"
EnvironmentFile=/opt/reefbluesky/backend/.env

# [SEGURANÇA] Limites de recursos
MemoryLimit=512M
CPUQuota=50%

# [SEGURANÇA] Sem acesso a /root
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/opt/reefbluesky

[Install]
WantedBy=multi-user.target
```

### 3.2 Cloudflare Tunnel

Criar `/etc/systemd/system/cloudflared.service`:

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/cloudflared tunnel run --config /opt/reefbluesky/cloudflare/config.yml reefbluesky

Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 3.3 Ativar Serviços

```bash
# Recarregar systemd
sudo systemctl daemon-reload

# Ativar serviços
sudo systemctl enable reefbluesky
sudo systemctl enable cloudflared

# Iniciar serviços
sudo systemctl start reefbluesky
sudo systemctl start cloudflared

# Verificar status
sudo systemctl status reefbluesky
sudo systemctl status cloudflared
```

---

## 4. Configurar Nginx (Reverse Proxy)

### 4.1 Instalar Nginx

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### 4.2 Configurar Nginx

Criar `/etc/nginx/sites-available/reefbluesky`:

```nginx
# [NGINX] Configuração de Reverse Proxy
upstream reefbluesky_backend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name seu-dominio.com;
    
    # [NGINX] Redirecionar HTTP para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name seu-dominio.com;
    
    # [SEGURANÇA] Certificado SSL
    ssl_certificate /etc/letsencrypt/live/seu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com/privkey.pem;
    
    # [SEGURANÇA] Configurações SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # [NGINX] Compressão
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    
    # [NGINX] Proxy para backend
    location /api/ {
        proxy_pass http://reefbluesky_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # [SEGURANÇA] Headers de segurança
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # [NGINX] Servir frontend
    location / {
        root /opt/reefbluesky/frontend/build;
        try_files $uri $uri/ /index.html;
    }
}
```

### 4.3 Ativar Nginx

```bash
# Criar link simbólico
sudo ln -s /etc/nginx/sites-available/reefbluesky /etc/nginx/sites-enabled/

# Testar configuração
sudo nginx -t

# Iniciar Nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 4.4 Certificado SSL com Let's Encrypt

```bash
# Obter certificado
sudo certbot certonly --nginx -d seu-dominio.com

# Renovação automática
sudo systemctl enable certbot.timer
```

---

## 5. Monitoramento e Alertas

### 5.1 Configurar Logs Centralizados

```bash
# Instalar rsyslog (já vem com Ubuntu)
sudo systemctl enable rsyslog
sudo systemctl start rsyslog

# Configurar rotação de logs
sudo tee /etc/logrotate.d/reefbluesky > /dev/null << EOF
/var/log/reefbluesky/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
    postrotate
        systemctl reload reefbluesky > /dev/null 2>&1 || true
    endscript
}
EOF
```

### 5.2 Monitoramento com Prometheus (Opcional)

```bash
# Instalar Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz
tar -xzf prometheus-2.40.0.linux-amd64.tar.gz
sudo mv prometheus-2.40.0.linux-amd64 /opt/prometheus
```

### 5.3 Alertas com Alertmanager (Opcional)

```bash
# Instalar Alertmanager
wget https://github.com/prometheus/alertmanager/releases/download/v0.25.0/alertmanager-0.25.0.linux-amd64.tar.gz
tar -xzf alertmanager-0.25.0.linux-amd64.tar.gz
sudo mv alertmanager-0.25.0.linux-amd64 /opt/alertmanager
```

---

## 6. Backup e Recuperação

### 6.1 Backup Automático

Criar `/opt/reefbluesky/backup.sh`:

```bash
#!/bin/bash
# [BACKUP] Script de backup automático

BACKUP_DIR="/backup/reefbluesky"
DATE=$(date +%Y%m%d_%H%M%S)

# Criar diretório de backup
mkdir -p $BACKUP_DIR

# [BACKUP] Banco de dados MongoDB
mongodump \
    --uri "mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky" \
    --out "$BACKUP_DIR/mongodb_$DATE"

# [BACKUP] Configurações
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    /opt/reefbluesky/backend/.env \
    /opt/reefbluesky/cloudflare/config.yml

# [BACKUP] Código
tar -czf "$BACKUP_DIR/code_$DATE.tar.gz" \
    /opt/reefbluesky/backend \
    /opt/reefbluesky/frontend

# [BACKUP] Limpar backups antigos (> 30 dias)
find $BACKUP_DIR -type f -mtime +30 -delete

echo "[BACKUP] Backup concluído: $BACKUP_DIR"
```

### 6.2 Agendar Backup

```bash
# Adicionar ao crontab
sudo crontab -e

# Adicionar linha:
0 2 * * * /opt/reefbluesky/backup.sh >> /var/log/reefbluesky/backup.log 2>&1
```

### 6.3 Testar Recuperação

```bash
# Restaurar banco de dados
mongorestore \
    --uri "mongodb+srv://usuario:senha@cluster.mongodb.net/reefbluesky" \
    /backup/reefbluesky/mongodb_20240115_020000

# Restaurar configurações
tar -xzf /backup/reefbluesky/config_20240115_020000.tar.gz -C /
```

---

## 7. Escalabilidade

### 7.1 Load Balancing

```nginx
# Usar múltiplas instâncias do Node.js
upstream reefbluesky_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
```

### 7.2 Clustering

```javascript
// [CLUSTERING] Usar cluster do Node.js
const cluster = require('cluster');
const os = require('os');

if (cluster.isMaster) {
    const numCPUs = os.cpus().length;
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
} else {
    // Iniciar servidor
    app.listen(3000);
}
```

---

## 8. Plano de Recuperação de Desastres

### 8.1 RTO e RPO

| Cenário | RTO | RPO |
|---------|-----|-----|
| Falha de aplicação | 5 min | 1 min |
| Falha de banco de dados | 15 min | 5 min |
| Falha de servidor | 30 min | 1 hora |
| Falha de data center | 2 horas | 1 hora |

### 8.2 Procedimento de Recuperação

```bash
# 1. Verificar status
sudo systemctl status reefbluesky

# 2. Se falhou, reiniciar
sudo systemctl restart reefbluesky

# 3. Se ainda falhar, restaurar backup
/opt/reefbluesky/restore.sh

# 4. Se data center falhou, failover para outro servidor
# [TODO] Implementar failover automático
```

---

## 9. Performance e Otimização

### 9.1 Otimizações Node.js

```javascript
// [PERFORMANCE] Usar clustering
// [PERFORMANCE] Implementar cache com Redis
// [PERFORMANCE] Usar compression middleware
// [PERFORMANCE] Implementar rate limiting
```

### 9.2 Otimizações Banco de Dados

```javascript
// [PERFORMANCE] Criar índices apropriados
db.measurements.createIndex({ "deviceId": 1, "timestamp": -1 });

// [PERFORMANCE] Usar agregação para relatórios
db.measurements.aggregate([
    { $match: { timestamp: { $gte: startDate } } },
    { $group: { _id: "$deviceId", avg_kh: { $avg: "$kh" } } }
]);
```

### 9.3 Otimizações Frontend

```javascript
// [PERFORMANCE] Lazy loading de componentes
// [PERFORMANCE] Code splitting
// [PERFORMANCE] Service workers para cache
// [PERFORMANCE] Compressão de imagens
```

---

## 10. Conformidade e Regulamentações

### 10.1 GDPR

- [ ] Consentimento do usuário para coleta de dados
- [ ] Direito ao esquecimento (deletar dados)
- [ ] Portabilidade de dados
- [ ] Notificação de violação de dados

### 10.2 Segurança

- [ ] Criptografia em trânsito (HTTPS)
- [ ] Criptografia em repouso (dados sensíveis)
- [ ] Autenticação forte (JWT)
- [ ] Auditoria de acesso

---

## 11. Métricas de Sucesso

| Métrica | Alvo | Atual |
|---------|------|-------|
| Uptime | 99.9% | - |
| Latência P95 | < 200ms | - |
| Taxa de erro | < 0.1% | - |
| Tempo de resposta | < 500ms | - |

---

## 12. Contato e Suporte

- **Email:** support@reefbluesky.com
- **Documentação:** https://docs.reefbluesky.com
- **GitHub Issues:** https://github.com/seu-usuario/reefbluesky/issues

---

**Status:** ✅ PRONTO PARA PRODUÇÃO

Última atualização: 2024-01-15
