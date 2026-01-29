//HardwarePinsDoser.h
#ifndef HARDWARE_PINS_DOSER_H
#define HARDWARE_PINS_DOSER_H

#include <Arduino.h>

#if defined(ESP8266)
// NodeMCU - 6 canais ULN2003 Kamoer 12V
static constexpr int DOSER_PUMP_PINS[6] = { 5, 4, 14, 12, 13, 15 }; // D1,D2,D5,D6,D7,D8
static constexpr int DOSER_BTN_CONFIG   = 0;   

// D3/D4 livres agora para futuro

#else // ESP32
// Mantenha seus 6 pinos ou expanda
static constexpr int DOSER_PUMP_PINS[6] = { 25, 26, 27, 14, 12, 13 };
static constexpr int DOSER_BTN_CONFIG   = 33;

#endif

#endif // HARDWARE_PINS_DOSER_H

