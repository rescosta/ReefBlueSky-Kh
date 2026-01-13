#ifndef WIFISETUP_DOSER_H
#define WIFISETUP_DOSER_H

#include <Arduino.h>
#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  #include <LittleFS.h>
  #define SPIFFS LittleFS
  typedef ESP8266WebServer WebServerType;
#else
  #include <WiFi.h>
  #include <WebServer.h>
  #include <SPIFFS.h>
  typedef WebServer WebServerType;
#endif

#include <DNSServer.h>
#include <ArduinoJson.h>

class WiFiSetupDoser {
private:
  WebServerType server;
  DNSServer dnsServer;
  static constexpr byte DNS_PORT = 53;

  // Multi-SSID support
  struct WiFiCred { String ssid; String password; };
  WiFiCred* networks = nullptr;
  int numNetworks = 0;
  int currentNetworkIndex = 0;

  String ssid;
  String password;

  String serverUsername;
  String serverPassword;
  bool configured = false;
  bool portalActive = false;

  static constexpr const char* FIXED_SERVER_URL = "http://iot.reefbluesky.com.br/api/v1";
  static constexpr const char* CONFIG_FILE = "/doser_wifi_config.json";
  static constexpr const char* AP_SSID = "ReefBlueSkyDoser-Setup";
  static constexpr const char* AP_PASSWORD = "12345678";

  static constexpr unsigned long RECONNECT_INTERVAL = 60000;  // 60s
  static constexpr int CONNECT_TIMEOUT = 15000;               // 15s
  unsigned long lastReconnectTry = 0;

  String getConfigHTML();
  bool saveConfigToSPIFFS(const DynamicJsonDocument& config);
  bool loadConfigFromSPIFFS();
  void handleConfigSubmit();
  void handleStatus();
  void handleScan();
  void tryReconnect();

public:
  WiFiSetupDoser() : server(80) {}

  bool begin();
  bool createAccessPoint();
  bool connectToWiFi();
  void handleClient();
  void loopReconnect();

  bool isConfigured() const { return configured; }
  bool isPortalActive() const { return portalActive; }
  String getSSID() const { return ssid; }
  String getServerUsername() const { return serverUsername; }
  String getServerPassword() const { return serverPassword; }
  String getServerUrl() const { return FIXED_SERVER_URL; }

  void closePortalIfActive() {
    if (!portalActive) return;

    dnsServer.stop();
  #ifdef ESP8266
    WiFi.softAPdisconnect(true);   // só desliga o AP
  #else
    WiFi.softAPdisconnect(true);   // idem ESP32
  #endif
    portalActive = false;
    Serial.println("[WiFiSetupDoser] Portal fechado (auto, detectado pelo main).");
  }

};

#endif
