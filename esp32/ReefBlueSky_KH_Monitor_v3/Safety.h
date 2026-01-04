// Safety.h
#pragma once
#include "SensorManager.h"

enum Reservoir {
  AQUARIO = 0,
  RES1,
  RES2,
  RES3
};

inline bool isRes1Full(SensorManager& sm) { return sm.getLevelA() == 1; }
inline bool isRes2Full(SensorManager& sm) { return sm.getLevelB() == 1; }
inline bool isRes3Full(SensorManager& sm) { return sm.getLevelC() == 1; }

inline bool canMoveWater(Reservoir destino, SensorManager& sm) {
  switch (destino) {
    case RES1: return !isRes1Full(sm);
    case RES2: return !isRes2Full(sm);
    case RES3: return !isRes3Full(sm);
    case AQUARIO:
    default:   return true;
  }
}
