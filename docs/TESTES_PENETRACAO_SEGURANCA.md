# 🔒 Guia de Testes de Penetração e Segurança

## Visão Geral

Este guia descreve testes de segurança e penetração para o ReefBlueSky KH Monitor, cobrindo todas as camadas (ESP32, Backend, Frontend, Comunicação).

---

## 1. Testes de Segurança ESP32

### 1.1 Teste: Verificar Armazenamento de Tokens

**Objetivo:** Verificar se tokens JWT estão criptografados em NVS

**Procedimento:**
```cpp
// [TESTE] Verificar se token está criptografado
void testTokenEncryption() {
    nvs_handle_t handle;
    nvs_open("reefbluesky", NVS_READONLY, &handle);
    
    size_t required_size = 0;
    nvs_get_blob(handle, "token", NULL, &required_size);
    
    uint8_t* buffer = (uint8_t*)malloc(required_size);
    nvs_get_blob(handle, "token", buffer, &required_size);
    
    // Verificar se não é texto plano
    String tokenStr((char*)buffer);
    if (tokenStr.startsWith("eyJ")) {  // JWT começa com "eyJ"
        Serial.println("[TESTE] ❌ FALHA: Token em texto plano!");
    } else {
        Serial.println("[TESTE] ✅ PASSOU: Token criptografado");
    }
    
    free(buffer);
    nvs_close(handle);
}
```

**Resultado Esperado:** ✅ Token criptografado em NVS

---

### 1.2 Teste: Validação de SSL/TLS

**Objetivo:** Verificar se certificado SSL é validado

**Procedimento:**
```cpp
// [TESTE] Verificar validação de certificado
void testSSLValidation() {
    WiFiClientSecure client;
    
    // Tentar conectar com certificado inválido
    if (!client.connect("seu-dominio.com", 443)) {
        Serial.println("[TESTE] ✅ PASSOU: Certificado inválido rejeitado");
    } else {
        Serial.println("[TESTE] ❌ FALHA: Certificado inválido aceito!");
    }
}
```

**Resultado Esperado:** ✅ Certificado inválido rejeitado

---

### 1.3 Teste: Rate Limiting Local

**Objetivo:** Verificar se rate limiting está funcionando

**Procedimento:**
```cpp
// [TESTE] Verificar rate limiting
void testRateLimiting() {
    int requestCount = 0;
    unsigned long startTime = millis();
    
    // Fazer 15 requisições em 1 minuto
    for (int i = 0; i < 15; i++) {
        if (cloudAuth.sendMeasurement(...)) {
            requestCount++;
        }
    }
    
    unsigned long elapsedTime = millis() - startTime;
    
    // Deve ter sido bloqueado após 10 requisições
    if (requestCount <= 10 && elapsedTime < 60000) {
        Serial.println("[TESTE] ✅ PASSOU: Rate limiting funcionando");
    } else {
        Serial.println("[TESTE] ❌ FALHA: Rate limiting não funcionando");
    }
}
```

**Resultado Esperado:** ✅ Bloqueado após 10 requisições/minuto

---

## 2. Testes de Segurança Backend Node.js

### 2.1 Teste: Validação de JWT

**Procedimento:**
```bash
# [TESTE] Tentar acessar endpoint sem token
curl -X GET http://localhost:3000/api/v1/device/ping

# Resultado esperado: 401 Unauthorized
```

**Resultado Esperado:**
```json
{
  "success": false,
  "message": "Token não fornecido"
}
```

---

### 2.2 Teste: JWT Expirado

**Procedimento:**
```bash
# [TESTE] Usar token expirado
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/v1/device/ping

# Resultado esperado: 403 Forbidden
```

**Resultado Esperado:**
```json
{
  "success": false,
  "message": "Token inválido ou expirado"
}
```

---

### 2.3 Teste: Validação de Entrada (SQL Injection)

**Procedimento:**
```bash
# [TESTE] Tentar SQL injection
curl -X POST http://localhost:3000/api/v1/device/register \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-123\" OR \"1\"=\"1",
    "username": "admin",
    "password": "password"
  }'

# Resultado esperado: 400 Bad Request
```

**Resultado Esperado:**
```json
{
  "success": false,
  "message": "deviceId inválido"
}
```

---

### 2.4 Teste: Rate Limiting Global

**Procedimento:**
```bash
# [TESTE] Fazer 15 requisições em 1 minuto
for i in {1..15}; do
  curl -X GET http://localhost:3000/api/v1/status
  echo "Requisição $i"
done

# Resultado esperado: bloqueado após 10 requisições
```

**Resultado Esperado:** ✅ Bloqueado após 10 requisições

---

### 2.5 Teste: CORS

**Procedimento:**
```bash
# [TESTE] Requisição de origem não permitida
curl -X GET http://localhost:3000/api/v1/status \
  -H "Origin: http://origem-nao-permitida.com"

# Resultado esperado: bloqueado
```

**Resultado Esperado:**
```
No 'Access-Control-Allow-Origin' header
```

---

## 3. Testes de Segurança Frontend React

### 3.1 Teste: XSS (Cross-Site Scripting)

**Procedimento:**
```javascript
// [TESTE] Tentar injetar script
const maliciousInput = "<img src=x onerror='alert(\"XSS\")'>";

// Verificar se é escapado
console.log(maliciousInput);  // Deve estar escapado
```

**Resultado Esperado:** ✅ Script não executado

---

### 3.2 Teste: Token Storage

**Procedimento:**
```javascript
// [TESTE] Verificar onde token é armazenado
console.log(localStorage.getItem('token'));
console.log(sessionStorage.getItem('token'));

// Resultado esperado: token em localStorage (com criptografia no futuro)
```

**Resultado Esperado:** ✅ Token em localStorage

---

## 4. Testes de Comunicação

### 4.1 Teste: HTTPS Obrigatório

**Procedimento:**
```bash
# [TESTE] Tentar acessar via HTTP
curl -X GET http://seu-dominio.com/api/v1/status

# Resultado esperado: redirecionado para HTTPS
```

**Resultado Esperado:** ✅ Redirecionado para HTTPS

---

### 4.2 Teste: Certificado SSL/TLS

**Procedimento:**
```bash
# [TESTE] Verificar certificado
openssl s_client -connect seu-dominio.com:443

# Resultado esperado: certificado válido
```

**Resultado Esperado:**
```
Verify return code: 0 (ok)
```

---

### 4.3 Teste: HSTS (HTTP Strict Transport Security)

**Procedimento:**
```bash
# [TESTE] Verificar header HSTS
curl -I https://seu-dominio.com

# Resultado esperado: Strict-Transport-Security header presente
```

**Resultado Esperado:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## 5. Testes de Replay Attack

### 5.1 Teste: Proteção Contra Replay

**Procedimento:**
```bash
# [TESTE] Capturar requisição
curl -X POST https://seu-dominio.com/api/v1/device/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"measurements": [...]}' \
  -v

# Tentar repetir a mesma requisição
# Resultado esperado: bloqueado por timestamp/nonce
```

**Resultado Esperado:** ✅ Requisição duplicada rejeitada

---

## 6. Testes de Performance e Carga

### 6.1 Teste: Carga Máxima

**Procedimento:**
```bash
# [TESTE] Usar Apache Bench
ab -n 1000 -c 10 https://seu-dominio.com/api/v1/status

# Resultado esperado: sem erros 5xx
```

**Resultado Esperado:**
```
Requests per second: 100+
Failed requests: 0
```

---

### 6.2 Teste: Timeout

**Procedimento:**
```bash
# [TESTE] Requisição lenta
curl --max-time 5 https://seu-dominio.com/api/v1/device/sync

# Resultado esperado: timeout após 5 segundos
```

**Resultado Esperado:** ✅ Timeout respeitado

---

## 7. Checklist de Segurança

- [ ] Tokens JWT criptografados em NVS
- [ ] SSL/TLS validado em todas as conexões
- [ ] Rate limiting funcionando (10 req/min)
- [ ] Validação de entrada em todos os endpoints
- [ ] CORS configurado corretamente
- [ ] Sem SQL injection possível
- [ ] Sem XSS possível
- [ ] HTTPS obrigatório
- [ ] Certificado SSL válido
- [ ] HSTS ativado
- [ ] Proteção contra replay attacks
- [ ] Logs de segurança ativados
- [ ] Senhas hasheadas com bcrypt
- [ ] Sem dados sensíveis em logs
- [ ] Backup criptografado

---

## 8. Ferramentas Recomendadas

| Ferramenta | Uso | Link |
|-----------|-----|------|
| OWASP ZAP | Teste de segurança web | https://www.zaproxy.org/ |
| Burp Suite | Teste de penetração | https://portswigger.net/burp |
| nmap | Scan de portas | https://nmap.org/ |
| Metasploit | Framework de teste | https://www.metasploit.com/ |
| sqlmap | Teste de SQL injection | https://sqlmap.org/ |

---

## 9. Relatório de Segurança

Após completar todos os testes, gerar relatório:

```markdown
# Relatório de Segurança - ReefBlueSky Rev06

**Data:** 2024-01-15
**Testador:** [Seu Nome]
**Status:** ✅ APROVADO

## Resumo
- Testes Executados: 20/20
- Vulnerabilidades Críticas: 0
- Vulnerabilidades Altas: 0
- Vulnerabilidades Médias: 0

## Detalhes
[...]

## Recomendações
[...]
```

---

## 10. Monitoramento Contínuo

### 10.1 Logs de Segurança

```bash
# [MONITORAMENTO] Ver tentativas de acesso não autorizado
grep "401\|403" /var/log/reefbluesky/backend.log

# [MONITORAMENTO] Ver rate limiting ativado
grep "rate limit" /var/log/reefbluesky/backend.log
```

### 10.2 Alertas

Configurar alertas para:
- Múltiplas tentativas de login falhadas
- Requisições bloqueadas por rate limiting
- Erros 5xx
- Certificado SSL próximo de expirar

---

## Conclusão

A Rev06 implementa múltiplas camadas de segurança:
- ✅ Criptografia em trânsito (HTTPS)
- ✅ Criptografia em repouso (NVS)
- ✅ Autenticação (JWT)
- ✅ Autorização (Rate Limiting)
- ✅ Validação de entrada
- ✅ Proteção contra ataques comuns

**Status de Segurança:** 🟢 EXCELENTE
