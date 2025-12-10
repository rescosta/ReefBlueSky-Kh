/**
 * ReefBlueSky Display Monitor - Firmware Principal
 * 
 * ESP32-C6-LCD-1.47" como display remoto do ReefBlueSky KH Monitor
 * - Autenticação JWT
 * - Conexão WiFi com AP setup
 * - Dashboard visual com indicadores de status
 * - LED RGB com cores dinâmicas
 */


#include "idf_compat.h"

#include <Arduino.h>
#include <WiFi.h>
#include <nvs_flash.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Adafruit_NeoPixel.h>

#include "Display_ST7789.h"
#include "LVGL_Driver.h"
#include "DisplayClient.h"
#include "DisplayUI.h"
#include "DisplaySetup.h"


//#include "ui/ui.h"   // quando gerar o UI do SquareLine

#define LED_PIN    8
#define LED_COUNT  1

Adafruit_NeoPixel rgb(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

void setupLED() {
  rgb.begin();
  rgb.setBrightness(50);
  rgb.clear();
  rgb.show();
}


void setLEDColor(uint8_t r, uint8_t g, uint8_t b) {
  rgb.setPixelColor(0, rgb.Color(r, g, b));
  rgb.show();
}


// protótipo do helper LAN
bool fetchFromMainDevice(KHMeasurement &measurement);

// [CONFIG] Geral
#define SERIAL_BAUD 115200
#define SYNC_INTERVAL 10000  // 10 segundos
#define RECONNECT_INTERVAL 30000  // 30 segundos


// [STATE] Estados da máquina
enum State {
    STATE_SETUP,
    STATE_CONNECTING,
    STATE_RUNNING,
    STATE_ERROR
};

// [GLOBAL] Variáveis globais
State currentState = STATE_SETUP;
DisplayClient displayClient;
DisplayUI displayUI;
DisplaySetup displaySetup;

unsigned long lastSyncTime = 0;
unsigned long lastReconnectTime = 0;
bool setupComplete = false;


/**
 * [SETUP] Inicialização
 */
void setup() {
    // [SERIAL] Inicializar serial
    Serial.begin(SERIAL_BAUD);
    delay(1000);
    
    Serial.println("\n\n");
    Serial.println("╔════════════════════════════════════════╗");
    Serial.println("║  ReefBlueSky Display Monitor - Rev01   ║");
    Serial.println("║  ESP32-C6-LCD-1.47\"                   ║");
    Serial.println("╚════════════════════════════════════════╝");
    Serial.println();
    
    // [NVS] Inicializar NVS
    nvs_flash_init();
    
    // [LED] Configurar LED RGB
    setupLED();
    setLEDColor(255, 0, 0);  // Vermelho inicial
    
    // [DISPLAY] Inicializar display
    LCD_Init();      // novo
    Lvgl_Init();     // novo
    // ui_init();       // quando tiver UI gerada
    displayUI.begin();   //inicializa a tela LVGL do SquareLine

    // [CHECK] Verificar se já foi configurado
    if (displaySetup.loadCredentials()) {
        Serial.println("[MAIN] ✅ Credenciais encontradas em NVS");
        setupComplete = true;
        currentState = STATE_CONNECTING;
    } else {
        Serial.println("[MAIN] ⚠️ Nenhuma credencial encontrada");
        Serial.println("[MAIN] Iniciando modo Setup...");
        currentState = STATE_SETUP;
        displaySetup.beginSetup();
    }
}


bool fetchFromMainDevice(KHMeasurement &measurement) {
  String ip = displayClient.getMainDeviceIp();
  if (ip.length() == 0) {
    Serial.println("[LCD] IP do dispositivo principal nao configurado");
    return false;
  }

  String url = "http://" + ip + "/lcd_state";
  HTTPClient http;
  http.setTimeout(5000);
  http.begin(url);

  int code = http.GET();
  if (code != 200) {
    Serial.printf("[LCD] Erro HTTP ao buscar lcd_state: %d\n", code);
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[LCD] Erro ao parsear JSON lcd_state: %s\n", err.c_str());
    return false;
  }

  measurement.kh         = doc["kh"] | 0.0f;
  measurement.temperature = doc["temperature"] | 0.0f;
  measurement.ph_ref     = doc["ph_ref"] | 0.0f;
  measurement.ph_sample  = doc["ph_sample"] | 0.0f;
  measurement.timestamp  = doc["timestamp"] | 0UL;
  measurement.status     = doc["state"].as<String>();
  measurement.confidence = 0.0f;   // pode preencher depois com predictor

  return true;
}

/**
 * [LOOP] Loop principal
 */
void loop() {
    Timer_Loop();  // mantém LVGL rodando

    // [STATE] Máquina de estados
    switch (currentState) {
        case STATE_SETUP:
            handleSetup();
            break;
            
        case STATE_CONNECTING:
            handleConnecting();
            break;
            
        case STATE_RUNNING:
            handleRunning();
            break;
            
        case STATE_ERROR:
            handleError();
            break;
    }

    delay(5);
}


/**
 * [HANDLER] Estado: Setup
 */
void handleSetup() {
    // [WEB] Processar requisições do servidor web
    displaySetup.handleClient();
    
    // [CHECK] Verificar se setup foi concluído
    if (displaySetup.isSetupComplete()) {
        Serial.println("[SETUP] ✅ Setup concluído!");
        
        // [CREDENTIALS] Obter credenciais
        DisplayCredentials creds = displaySetup.getCredentials();
        
        // [WIFI] Conectar ao WiFi
        displaySetup.endSetup();
        connectToWiFi(creds.ssid, creds.password);
        
        // [AUTH] Registrar display no servidor
        String displayId = "esp32-c6-display-" + String(ESP.getEfuseMac(), HEX);
        if (displayClient.registerDisplay(creds.email, creds.password_account, 
                                         displayId, creds.mainDeviceId)) {
            Serial.println("[MAIN] ✅ Display registrado!");
            currentState = STATE_RUNNING;
            setLEDColor(0, 255, 0);  // Verde
        } else {
            Serial.println("[MAIN] ❌ Falha ao registrar display");
            currentState = STATE_ERROR;
            setLEDColor(255, 0, 0);  // Vermelho
        }
    }
    
    delay(100);
}

/**
 * [HANDLER] Estado: Conectando
 */
void handleConnecting() {
    // [WIFI] Verificar conexão
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("[MAIN] ✅ WiFi conectado!");
        
        // [CLIENT] Inicializar cliente
        displayClient.begin();
        
        currentState = STATE_RUNNING;
        setLEDColor(0, 255, 0);  // Verde
    } else {
        // [RETRY] Tentar reconectar
        if (millis() - lastReconnectTime > RECONNECT_INTERVAL) {
            Serial.println("[MAIN] Tentando reconectar ao WiFi...");
            WiFi.reconnect();
            lastReconnectTime = millis();
        }
        
        setLEDColor(255, 165, 0);  // Amarelo (conectando)
    }
    
    delay(100);
}

/**
 * [HANDLER] Estado: Executando
 */
void handleRunning() {
    // [WIFI] Verificar conexão WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[MAIN] ⚠️ WiFi desconectado!");
        displayUI.showOffline();
        setLEDColor(255, 0, 0);  // Vermelho
        
        // [RETRY] Tentar reconectar
        if (millis() - lastReconnectTime > RECONNECT_INTERVAL) {
            WiFi.reconnect();
            lastReconnectTime = millis();
        }
        
        delay(100);
        return;
    }

    static unsigned long lastUpdate = 0;
    const unsigned long UPDATE_INTERVAL_MS = 10000;
  
    if (millis() - lastUpdate >= UPDATE_INTERVAL_MS) {
      lastUpdate = millis();
  
      KHMeasurement m;
      bool ok = false;
  
      // 1) tenta direto no KH Monitor pela LAN
      if (displayClient.isConnected()) {
        ok = fetchFromMainDevice(m);
      }
  
      // 2) fallback: servidor
      if (!ok) {
        Serial.println("[LCD] Fallback: buscando do servidor");
        ok = displayClient.getLatestKH(m);
      }
  
      if (ok) {
          // true = dados online/atuais
          displayUI.renderDashboard(m, true);
          updateLEDColor(m.kh);
      } else {
          displayUI.showError("Sem dados KH");
          setLEDColor(255, 0, 0);
      }
    }
    
    delay(100);
}

/**
 * [HANDLER] Estado: Erro
 */
void handleError() {
    // [DISPLAY] Mostrar erro na tela
    displayUI.showError("ERRO");
    setLEDColor(255, 0, 0);  // Vermelho
    
    // [RETRY] Tentar recuperar
    if (millis() - lastReconnectTime > 10000) {
        Serial.println("[MAIN] Tentando recuperar do erro...");
        currentState = STATE_CONNECTING;
        lastReconnectTime = millis();
    }
    
    delay(100);
}

/**
 * [WIFI] Conectar ao WiFi
 */
void connectToWiFi(const String& ssid, const String& password) {
    Serial.printf("[WIFI] Conectando a: %s\n", ssid.c_str());
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), password.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WIFI] ✅ Conectado!\n");
        Serial.printf("[WIFI] IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WIFI] RSSI: %d dBm\n", WiFi.RSSI());
    } else {
        Serial.println("\n[WIFI] ❌ Falha na conexão");
    }
}


/**
 * [LED] Atualizar cor baseado no valor de KH
 */
void updateLEDColor(float kh) {
    float targetKH = 7.8;
    float tolerance = 0.3;
    
    float minTarget = targetKH - tolerance;
    float maxTarget = targetKH + tolerance;
    
    if (kh >= minTarget && kh <= maxTarget) {
        // [OK] Verde
        setLEDColor(0, 255, 0);
        Serial.println("[LED] 🟢 Verde - KH OK");
    } else if (kh < minTarget) {
        // [LOW] Vermelho
        setLEDColor(255, 0, 0);
        Serial.println("[LED] 🔴 Vermelho - KH Baixo");
    } else {
        // [HIGH] Amarelo
        setLEDColor(255, 255, 0);
        Serial.println("[LED] 🟡 Amarelo - KH Alto");
    }
}
