#pragma once
#include <Arduino.h>
#include <time.h>

inline void printLocalTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("[NTP] Falha ao obter hora local");
    return;
  }
  Serial.printf("[NTP] Agora: %04d-%02d-%02d %02d:%02d:%02d\n",
                timeinfo.tm_year + 1900,
                timeinfo.tm_mon + 1,
                timeinfo.tm_mday,
                timeinfo.tm_hour,
                timeinfo.tm_min,
                timeinfo.tm_sec);
}

inline void forceNTPResync() {
  Serial.println("[NTP] Forçando resync (configTime será refeito no setup em próximo boot)");
  // no ESP32 padrão, normalmente reconfigura NTP chamando configTime() de novo
}

inline void checkTimeSync() {
  time_t now;
  time(&now);
  if (now < 1577836800) { // 2020-01-01
    Serial.printf("[NTP] Ainda não sincronizado, time()=%ld\n", now);
  }
}
