#pragma once

#include <Arduino.h>

#ifdef ESP8266
  #include <ESP8266WebServer.h>
  typedef ESP8266WebServer WebServerType;
#else
  #include <WebServer.h>
  typedef WebServer WebServerType;
#endif

// Callback opcional para notificar progresso (0-100)
typedef void (*OtaProgressCallback)(int percent, int written, int total);

// Callback opcional para eventos OTA (started, success, failed)
typedef void (*OtaEventCallback)(const String& event, const String& details);

// ======== Inicialização ========

/**
 * Inicializa OTA com URL base e callbacks opcionais
 * @param baseUrl Ex: "http://iot.reefbluesky.com.br"
 * @param progressCallback Chamado durante download com progresso
 * @param eventCallback Chamado em eventos importantes
 */
void otaInit(
  const String& baseUrl,
  OtaProgressCallback progressCallback = nullptr,
  OtaEventCallback eventCallback = nullptr
);

// ======== OTA via HTTP ========

/**
 * Baixa e atualiza firmware a partir de uma URL completa
 * @param url URL do arquivo .bin
 * @return true se sucesso (vai fazer reboot), false se erro
 */
bool otaFromUrl(const String& url);

// Helpers por tipo de device
bool otaUpdateKh();
bool otaUpdateDoser();
bool otaUpdateLcd();

// ======== Web OTA (servidor local) ========

/**
 * Registra handlers Web OTA no WebServer passado
 * Cria endpoints:
 *   GET  /webota        -> página HTML de upload
 *   POST /webota        -> recebe arquivo .bin
 * @param server Referência para WebServer ativo
 */
void setupWebOtaRoutes(WebServerType& server);

// ======== Utils ========

/**
 * Retorna true se OTA está em andamento
 */
bool otaIsInProgress();

/**
 * Cancela OTA em andamento (se possível)
 */
void otaCancel();

/**
 * Retorna última mensagem de erro
 */
String otaGetLastError();
