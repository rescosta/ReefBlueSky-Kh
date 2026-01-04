
#include "MultiDeviceAuth.h"
#include "TimeProvider.h"
#include "AiPumpControl.h"


// ============================================================================
// Definições reais das variáveis globais
// ============================================================================
String deviceToken = "";   // token específico do device
String deviceId;
String jwtToken = "";
String userEmail = "";
String userPassword = "";
String serverUrl = "http://iot.reefbluesky.com.br/api/v1";
Preferences preferences;
unsigned long lastSerialPromptTime = 0;
bool menuShown = false;

// ============================================================================
// Função auxiliar: gerar deviceId único a partir do MAC do ESP32
// Formato: RBS-KH-XXXXXXXXXXXX
// ============================================================================
String generateDeviceId() {
  uint64_t chipid = ESP.getEfuseMac();
  uint16_t chipHigh = (uint16_t)(chipid >> 32);
  uint32_t chipLow  = (uint32_t)chipid;

  char buffer[20];
  sprintf(buffer, "RBS-KH-%04X%08X", chipHigh, chipLow);
  return String(buffer);
}

String getDeviceToken() {
  return deviceToken;
}


// ============================================================================
// NVS: carregar credenciais
// ============================================================================
bool loadCredentialsFromNVS() {
  preferences.begin("auth", true); // read-only
  String email = preferences.getString("email", "");
  String pass  = preferences.getString("password", "");
  preferences.end();

  if (email.length() > 0 && pass.length() > 0) {
    userEmail = email;
    userPassword = pass;
    Serial.println("[Auth] Credenciais carregadas da NVS");
    Serial.print("[Auth] Email: ");
    Serial.println(userEmail);
    return true;
  } else {
    Serial.println("[Auth] Nenhuma credencial salva na NVS");
    return false;
  }
}

// ============================================================================
// NVS: salvar credenciais
// ============================================================================
bool saveCredentialsToNVS(String email, String password) {
  preferences.begin("auth", false); // read-write
  preferences.putString("email", email);
  preferences.putString("password", password);
  preferences.end();

  userEmail = email;
  userPassword = password;

  Serial.println("✓ Credenciais salvas na memória (NVS)!");
  return true;
}


// ============================================================================
// NVS: limpar credenciais
// ============================================================================
void clearCredentialsFromNVS() {
  preferences.begin("auth", false);
  preferences.remove("email");
  preferences.remove("password");
  preferences.end();

  userEmail = "";
  userPassword = "";
  jwtToken = "";

  Serial.println("✓ Credenciais apagadas da NVS!");
}

// ============================================================================
// Validação simples de email
// ============================================================================
bool isValidEmail(const String& email) {
  if (email.length() < 5) return false;
  int atIndex = email.indexOf('@');
  int dotIndex = email.lastIndexOf('.');

  if (atIndex < 1) return false;
  if (dotIndex < atIndex + 2) return false;
  if (dotIndex >= (int)email.length() - 1) return false;
  return true;
}

// ============================================================================
// Obter credenciais via Serial: "email@example.com:senha"
// Timeout de 30 segundos
// ============================================================================
bool getCredentialsFromSerial() {
  Serial.println();
  Serial.println("=== CONFIGURAÇÃO DE CREDENCIAIS ===");
  Serial.println("Digite o email e senha separados por ':', ex:");
  Serial.println("user@email.com:senha123");
  Serial.println("Aguardando entrada (30s)...");

  String input = "";
  unsigned long start = millis();

  while (millis() - start < 30000) { // 30 segundos
    if (Serial.available()) {
      char c = Serial.read();
      if (c == '\n' || c == '\r') {
        if (input.length() > 0) break;
      } else {
        input += c;
      }
    }
    delay(10);
  }

  if (input.length() == 0) {
    Serial.println("Nenhuma entrada recebida (timeout).");
    return false;
  }

  input.trim();
  int sepIndex = input.indexOf(':');
  if (sepIndex <= 0 || sepIndex >= (int)input.length() - 1) {
    Serial.println("Erro: Use o formato 'email@example.com:senha'");
    return false;
  }

  String email = input.substring(0, sepIndex);
  String password = input.substring(sepIndex + 1);

  email.trim();
  password.trim();

  if (email.length() == 0 || password.length() == 0) {
    Serial.println("Erro: Email ou senha vazios");
    return false;
  }

  if (!isValidEmail(email)) {
    Serial.println("Erro: Email inválido");
    return false;
  }

  if (password.length() < 3) {
    Serial.println("Erro: Senha muito curta (mínimo 3 caracteres)");
    return false;
  }

  Serial.println("✓ Credenciais recebidas!");
  Serial.print("Email: ");
  Serial.println(email);

  Serial.println("Deseja salvar estas credenciais na NVS? (S/N)");
  unsigned long askStart = millis();
  bool decided = false;
  bool shouldSave = false;

  while (millis() - askStart < 15000 && !decided) { // 15s p/ resposta
    if (Serial.available()) {
      char c = Serial.read();
      if (c == 'S' || c == 's') {
        shouldSave = true;
        decided = true;
      } else if (c == 'N' || c == 'n') {
        shouldSave = false;
        decided = true;
      }
    }
    delay(10);
  }

  if (!decided) {
    Serial.println("Nenhuma resposta, não salvando credenciais.");
  } else if (shouldSave) {
    saveCredentialsToNVS(email, password);
  }

  userEmail = email;
  userPassword = password;

  return true;
}

// ============================================================================
// Login HTTP: POST /api/v1/auth/login
// ============================================================================
bool performLogin(String email, String password) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Erro: WiFi não conectado");
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = serverUrl + "/auth/login";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  DynamicJsonDocument doc(256);
  doc["email"] = email;
  doc["password"] = password;

  String payload;
  serializeJson(doc, payload);
  
  Serial.printf("[Auth] URL login: %s\n", url.c_str());
  //Serial.printf("[Auth] Payload login: %s\n", payload.c_str());

  Serial.println("[Auth] Fazendo login no servidor...");

  int httpCode = http.POST(payload);
  Serial.printf("[Auth] httpCode login = %d\n", httpCode); 

  if (httpCode == 200) {
    String response = http.getString();
    DynamicJsonDocument responseDoc(2048);
    Serial.printf("[Auth] Resposta login: %s\n", response.c_str());
    DeserializationError err = deserializeJson(responseDoc, response);
    if (err) {
      Serial.print("Erro ao parsear resposta de login: ");
      Serial.println(err.c_str());
      http.end();
      return false;
    }

    if (!responseDoc.containsKey("data") || !responseDoc["data"].containsKey("token")) {
      Serial.println("Erro: Resposta de login sem token");
      http.end();
      return false;
    }

    jwtToken = responseDoc["data"]["token"].as<String>();
    Serial.println("✓ Login bem-sucedido! Token recebido.");
    http.end();
    return true;
  } else {
    Serial.printf("Erro ao fazer login: %d\n", httpCode);
    String resp = http.getString();
    Serial.printf("[Auth] Corpo erro login: %s\n", resp.c_str());
    http.end();
    return false;
  }
}

// ============================================================================
// Registrar device: POST /api/v1/device/register
// ============================================================================

bool registerDevice() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Erro: WiFi não conectado (registerDevice)");
    return false;
  }

  if (userEmail.length() == 0 || userPassword.length() == 0) {
    Serial.println("Erro: Credenciais de usuário não configuradas");
    return false;
  }

  WiFiClient client;
  HTTPClient http;
  String url = serverUrl + "/device/register";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  DynamicJsonDocument doc(256);
  doc["deviceId"] = deviceId;
  doc["username"] = userEmail;
  doc["password"] = userPassword;
  doc["local_ip"] = WiFi.localIP().toString();
  doc["type"]      = "KH";   

  String payload;
  serializeJson(doc, payload);

  Serial.printf("[DeviceRegister] URL: %s\n", url.c_str());
  //Serial.printf("[DeviceRegister] Payload: %s\n", payload.c_str());

  int httpCode = http.POST(payload);
  Serial.printf("[DeviceRegister] httpCode = %d\n", httpCode);

  if (httpCode == 201 || httpCode == 200) {
    String response = http.getString();
    Serial.printf("[DeviceRegister] Resposta: %s\n", response.c_str());

    DynamicJsonDocument respDoc(2048);
    DeserializationError err = deserializeJson(respDoc, response);
    if (err) {
      Serial.print("Erro ao parsear resposta de registro: ");
      Serial.println(err.c_str());
      http.end();
      return false;
    }

    if (!respDoc.containsKey("data") || !respDoc["data"].containsKey("token")) {
      Serial.println("Erro: Resposta de registro sem token");
      http.end();
      return false;
    }

    deviceToken = respDoc["data"]["token"].as<String>();
    Serial.println("✓ Device registrado! Device token recebido.");
    http.end();
    return true;
  } else {
    Serial.printf("Erro ao registrar device: %d\n", httpCode);
    String resp = http.getString();
    Serial.printf("[DeviceRegister] Corpo erro: %s\n", resp.c_str());
    http.end();
    return false;
  }
}


// ============================================================================
// Enviar medições: POST /api/v1/device/sync
// ============================================================================
bool sendMeasurements(float kh, float phRef, float phSample, float temp) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Erro: WiFi não conectado");
    return false;
  }

  if (deviceToken.length() == 0) {
    Serial.println("Erro: Device token não disponível");
    return false;
  }

  HTTPClient http;
  String url = serverUrl + "/device/sync";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  DynamicJsonDocument doc(512);
  String localIp = WiFi.localIP().toString();
  doc["local_ip"] = localIp; 
  //doc["deviceId"] = deviceId;

  JsonArray measurements = doc.createNestedArray("measurements");
  JsonObject meas = measurements.createNestedObject();
  meas["timestamp"] = getCurrentEpochMs();   // ideal: Unix time real, se tiver RTC/NTP
  meas["kh"]          = kh;
  meas["phref"]       = phRef;
  meas["phsample"]    = phSample;
  meas["temperature"] = temp;
  meas["status"]      = "ok";
  meas["confidence"]  = 0.95f;

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("✓ Medições enviadas com sucesso.");
    // opcional: parsear resposta se precisar
    http.end();
    return true;
  } else {
    Serial.printf("Erro ao enviar medições: %d\n", httpCode);
    http.end();
    return false;
  }
}

// ============================================================================
// Menu de configuração
// ============================================================================
void printConfigMenu() {
  Serial.println();
  Serial.println("=== MENU DE CONFIGURAÇÃO ===");
  Serial.println("1 - Definir novas credenciais");
  Serial.println("2 - Limpar credenciais salvas");
  Serial.println("3 - Fazer login novamente");
  Serial.println("4 - Ver credenciais atuais e status do token");
  Serial.println("Digite a opção desejada e pressione Enter:");
  menuShown = true;
}

// ============================================================================
// Processar entrada serial (menu)
// ============================================================================
void handleSerialInput() {
  if (!menuShown) {
    printConfigMenu();
  }

  if (!Serial.available()) {
    return;
  }

  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  char option = line.charAt(0);

  switch (option) {
    case '1':
      Serial.println("[Menu] Definir novas credenciais");
      if (getCredentialsFromSerial()) {
        if (performLogin(userEmail, userPassword)) {
          Serial.println("✓ Login bem-sucedido! Token atualizado.");
        } else {
          Serial.println("Erro ao fazer login com as novas credenciais.");
        }
      }
      break;

    case '2':
      Serial.println("[Menu] Limpando credenciais salvas + Wi‑Fi...");
      clearCredentialsFromNVS();
      wifiFactoryReset(); 
      break;

    case '3':
      Serial.println("[Menu] Fazendo login novamente...");
      if (userEmail.length() == 0 || userPassword.length() == 0) {
        Serial.println("Erro: Não há credenciais em memória. Use a opção 1.");
      } else {
        if (performLogin(userEmail, userPassword)) {
          Serial.println("✓ Login bem-sucedido! Token atualizado.");
        } else {
          Serial.println("Erro ao fazer login.");
        }
      }
      break;

    case '4':
      Serial.println("[Menu] Credenciais atuais:");
      if (userEmail.length() == 0) {
        Serial.println("  Email: (não configurado)");
      } else {
        Serial.print("  Email: ");
        Serial.println(userEmail);
      }
      if (jwtToken.length() > 0) {
        Serial.println("  Token: presente");
      } else {
        Serial.println("  Token: NÃO disponível");
      }

      if (jwtToken.length() > 0) {
        Serial.println("  Token usuário: presente");
      } else {
        Serial.println("  Token usuário: NÃO disponível");
      }
      if (deviceToken.length() > 0) {
        Serial.println("  Token device: presente");
      } else {
        Serial.println("  Token device: NÃO disponível");
      }
      break;

      case '5':
        calibrateAiSensors();
        break;

    default:
      Serial.println("Opção inválida.");
      break;
  }

  // Após tratar, mostrar o menu novamente
  printConfigMenu();
}

// ============================================================================
// Inicialização geral do Multi-Device Auth
// ============================================================================
bool initMultiDeviceAuth() {
  Serial.println();
  Serial.println("=== INICIALIZANDO MULTI-DEVICE AUTH ===");

  // Gerar deviceId
  deviceId = generateDeviceId();
  Serial.print("Device ID: ");
  Serial.println(deviceId);

  // Verificar WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Erro: WiFi não conectado. Não é possível autenticar.");
    return false;
  } else {
    Serial.println("✓ WiFi conectado!");
  }

  Serial.println("Procurando credenciais salvas...");
  bool hasCreds = loadCredentialsFromNVS();

  if (!hasCreds) {
    Serial.println("Nenhuma credencial salva encontrada.");
    if (!getCredentialsFromSerial()) {
      Serial.println("Erro ao obter credenciais via Serial.");
      return false;
    }
  }

  Serial.println("Tentando fazer login...");
  if (!performLogin(userEmail, userPassword)) {
    Serial.println("Erro ao fazer login. Verifique email/senha.");
    return false;
  }

    Serial.println("✓ Login de usuário OK. Registrando device...");
  if (!registerDevice()) {
    Serial.println("Erro ao registrar device. Verifique usuário/senha e backend.");
    return false;
  }

  Serial.println("✓ Pronto para sincronizar medições!");
  printConfigMenu();
  return true;
}
