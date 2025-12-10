#pragma once
#include <Arduino.h>

// Por enquanto, só converte millis() para um "epoch fake" em ms.
// Depois você pode trocar por NTP/RTC mantendo a mesma API.
inline unsigned long long getCurrentEpochMs() {
  // Exemplo: base em 1 Jan 2025 00:00:00 UTC ~= 1735689600 s
  const unsigned long long BASE_EPOCH_SEC = 1735689600ULL;
  unsigned long long nowMs = millis();
  return BASE_EPOCH_SEC * 1000ULL + nowMs;
}
