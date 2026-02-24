# Versão do Arduino ESP32 Core - IMPORTANTE

## ⚠️ Versão Requerida

**Use ESP32 Arduino Core versão `3.3.5` ou inferior**

**NÃO use versão `3.3.6`** - contém bug no WiFi PHY

## 🐛 Bug da Versão 3.3.6

### Sintoma:
```
E (xxxx) phy_comm: gpio[0] number: 2 is reserved
```

### Comportamento:
- Erro aparece durante múltiplas chamadas `WiFi.disconnect()` + `WiFi.begin()` em sequência
- Em código simples (teste mínimo), o erro aparece mas WiFi conecta normalmente
- Em código complexo (projeto completo), o erro impede conexão WiFi STA
- Modo AP funciona normalmente

### Causa:
Bug no módulo PHY do ESP32 na versão 3.3.6 que corrompe estado do WiFi após múltiplas operações de disconnect/reconnect.

## 🔧 Como Configurar Versão Correta

### No Arduino IDE:

1. **Ferramentas → Placa → Gerenciador de Placas**
2. Procure por **"esp32"**
3. Selecione **"esp32 by Espressif Systems"**
4. Na lista de versões, escolha **`3.3.5`** (ou `2.0.17` para máxima estabilidade)
5. Clique em **Instalar** e aguarde
6. Recompile o projeto

### Versões Testadas e Recomendadas:

- ✅ **3.3.5** - Funciona perfeitamente (RECOMENDADA)
- ✅ **3.0.7** - Funciona (última da série 3.0.x)
- ✅ **2.0.17** - Funciona (última da série 2.x, mais estável)
- ❌ **3.3.6** - BUG no WiFi PHY - NÃO USAR

## 📝 Histórico

- **05/02/2026**: Identificado bug na versão 3.3.6
- Atualização automática do Arduino IDE instalou 3.3.6
- Código que funcionava por dias começou a falhar
- Downgrade para 3.3.5 resolveu completamente

## 🔗 Referências

- [ESP32 Arduino Core Releases](https://github.com/espressif/arduino-esp32/releases)
- Issue reportado: (aguardando correção da Espressif)
