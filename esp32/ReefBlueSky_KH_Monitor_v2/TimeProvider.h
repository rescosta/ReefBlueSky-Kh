#pragma once
#include <Arduino.h>
#include <time.h> 

inline unsigned long long getCurrentEpochMs() {
  time_t nowSec;
  time(&nowSec);                     // segundos desde 1970 (já com fuso)
  return (unsigned long long)nowSec * 1000ULL;
}
