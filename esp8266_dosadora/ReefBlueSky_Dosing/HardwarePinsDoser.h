#ifndef HARDWARE_PINS_DOSER_H
#define HARDWARE_PINS_DOSER_H

#include <Arduino.h>

#if defined(ESP8266)

// NodeMCU
static constexpr int DOSER_PUMP_PINS[4] = { 5, 4, 0, 2 }; // D1, D2, D3, D4
static constexpr int DOSER_BTN_CONFIG   = 15;             // D8
static constexpr int DOSER_LED_STATUS   = 16;             // D0

#else // ESP32

// Placa dosadora ESP32
static constexpr int DOSER_PUMP_PINS[4] = { 25, 26, 27, 14 };
static constexpr int DOSER_BTN_CONFIG   = 33;
static constexpr int DOSER_LED_STATUS   = 32;

#endif

#endif // HARDWARE_PINS_DOSER_H
