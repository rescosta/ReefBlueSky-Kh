//AiPumpControl.h

#ifndef AI_PUMP_CONTROL_H
#define AI_PUMP_CONTROL_H

#include <Arduino.h>
#include <Preferences.h> 
#include "HardwarePins.h" 

// Funções IA (SÓ DECLARAÇÕES)
void initAiPumpControl();
int getFuzzyDecision();
void calibrateAiSensors();
float getLevel(int reservoir);  // 0=R01, 1=R02, 2=R03
bool isAiActive();


extern Preferences aiPrefs;

#endif
