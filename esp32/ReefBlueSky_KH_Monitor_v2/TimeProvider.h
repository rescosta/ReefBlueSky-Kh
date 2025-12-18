#pragma once
#include <Arduino.h>
#include <time.h> 

inline unsigned long long getCurrentEpochMs() {
  time_t nowSec;
  time(&nowSec);

  if (nowSec < 1577836800) { // 01/01/2020
    Serial.printf("[TimeProvider] NTP ainda não sincronizado, time()=%ld\n", nowSec);
    return 0ULL;
  }

  return (unsigned long long)nowSec * 1000ULL;
}
