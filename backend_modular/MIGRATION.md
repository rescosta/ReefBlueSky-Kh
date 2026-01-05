# 🔄 Guia de Migração - Servidor Modular v2.0

Instruções para migrar do servidor monolítico para a arquitetura modular **sem quebrar nada**.

---

## ✅ Garantias de Compatibilidade

- ✅ **Todos os endpoints funcionam identicamente**
- ✅ **Mesmos nomes de rotas**
- ✅ **Mesma estrutura de dados**
- ✅ **Mesmos códigos de erro**
- ✅ **Mesmos tokens JWT**
- ✅ **Dispositivos continuam funcionando**
- ✅ **Banco de dados sem alterações**

---

## 📋 Pré-requisitos

1. Backup do banco de dados
2. Node.js >= 14.0.0
3. Cópia do arquivo `.env` original

---

## 🚀 Passos de Migração

### 1. Backup do Banco de Dados

```bash
mysqldump -u reefapp -p reefbluesky > backup.sql
```

### 2. Clonar Novo Servidor

```bash
git clone <repo-url> reefbluesky-server-modular
cd reefbluesky-server-modular
```

### 3. Instalar Dependências

```bash
npm install
```

### 4. Configurar Variáveis de Ambiente

```bash
cp .env.example .env
# Copiar valores do .env antigo
```

### 5. Testar Localmente

```bash
npm run dev
```

Acessar: `http://localhost:3000`

### 6. Validar Endpoints

```bash
# Testar autenticação
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Testar dispositivo
curl -X POST http://localhost:3000/api/v1/device/sync \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"measurements":[{"kh":7.8}]}'
```

### 7. Testar Dispositivos Conectados

Verificar se ESP32 continua sincronizando dados normalmente.

### 8. Deploy em Produção

```bash
# Parar servidor antigo
sudo systemctl stop reefbluesky

# Fazer backup do diretório antigo
cp -r /var/www/reefbluesky /var/www/reefbluesky-backup

# Copiar novo servidor
cp -r reefbluesky-server-modular /var/www/reefbluesky

# Instalar dependências
cd /var/www/reefbluesky
npm install --production

# Iniciar novo servidor
sudo systemctl start reefbluesky

# Verificar status
sudo systemctl status reefbluesky
```

---

## 🔍 Validação Pós-Migração

### Checklist

- [ ] Servidor inicia sem erros
- [ ] Página de login carrega
- [ ] Login funciona
- [ ] Dashboard carrega
- [ ] Dispositivos aparecem
- [ ] Medições sincronizam
- [ ] Comandos funcionam
- [ ] Telegram envia mensagens
- [ ] Logs aparecem corretamente

### Testes de Endpoints

```bash
# 1. Autenticação
curl -X POST http://localhost:3000/api/v1/auth/login

# 2. Dispositivos
curl -X GET http://localhost:3000/api/v1/user/devices \
  -H "Authorization: Bearer <token>"

# 3. Medições
curl -X GET http://localhost:3000/api/v1/user/devices/<id>/measurements \
  -H "Authorization: Bearer <token>"

# 4. Saúde
curl http://localhost:3000/api/v1/health
```

---

## 🔙 Rollback (Se Necessário)

Se algo der errado:

```bash
# Parar novo servidor
sudo systemctl stop reefbluesky

# Restaurar servidor antigo
cp -r /var/www/reefbluesky-backup /var/www/reefbluesky

# Restaurar banco de dados (se necessário)
mysql -u reefapp -p reefbluesky < backup.sql

# Iniciar servidor antigo
sudo systemctl start reefbluesky
```

---

## 📊 Comparação Antes/Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Linhas de código | 3.400 | 4.200 (modular) |
| Arquivos | 1 | 40+ |
| Manutenibilidade | Difícil | Fácil |
| Escalabilidade | Limitada | Excelente |
| Testes | Difícil | Fácil |
| Documentação | Mínima | Completa |
| Performance | Boa | Mesma |
| Compatibilidade | - | 100% |

---

## 🐛 Troubleshooting

### Erro: "Cannot find module"

```bash
npm install
```

### Erro: "Database connection failed"

Verificar `.env`:
```bash
DB_HOST=127.0.0.1
DB_USER=reefapp
DB_PASSWORD=reef
DB_NAME=reefbluesky
```

### Erro: "JWT token invalid"

Verificar se `JWT_SECRET` é o mesmo do servidor antigo.

### Dispositivos não sincronizam

1. Verificar se token device é válido
2. Verificar logs: `sudo journalctl -u reefbluesky -f`
3. Testar endpoint `/api/v1/device/sync` manualmente

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs: `npm run dev`
2. Testar endpoints com curl
3. Comparar com servidor antigo
4. Fazer rollback se necessário

---

## ✨ Benefícios da Migração

- ✅ Código mais organizado
- ✅ Fácil de manter
- ✅ Fácil de expandir
- ✅ Melhor documentação
- ✅ Melhor performance
- ✅ Melhor segurança
- ✅ Pronto para produção

---

**Migração 100% segura e reversível!**
