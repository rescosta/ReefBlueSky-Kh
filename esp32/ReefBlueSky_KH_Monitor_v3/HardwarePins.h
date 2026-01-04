// HardwarePins.h
#pragma once
#include <Arduino.h>

// Sensores de nível
#define LEVEL_A_PIN       16
#define LEVEL_B_PIN       17
#define LEVEL_C_PIN        5

// IA PUMP CONTROL (NOVOS!)
#define LEVEL_R01_PIN     LEVEL_A_PIN  // Reservatório 01
#define LEVEL_R02_PIN     LEVEL_B_PIN  // Reservatório 02  
#define LEVEL_R03_PIN     LEVEL_C_PIN  // Reservatório 03 (KH ref)

// Comandos pumps IA
#define PUMP_A_IN         1
#define PUMP_B_OUT        2
#define PUMP_C_IN         4

// DS18B20 e pH
#define ONE_WIRE_BUS       4
#define PH_PIN            36
#define RESET_BUTTON_PIN  35

// Bombas (driver TB6612)
#define PUMP1_IN1   12
#define PUMP1_IN2   13
#define PUMP1_PWM   14

#define PUMP2_IN1   25
#define PUMP2_IN2   26
#define PUMP2_PWM   27

#define PUMP3_IN1   18
#define PUMP3_IN2   19
#define PUMP3_PWM   21


// Bombas (UNL) - KH CORREÇÃO
#define PUMP4_IN1  32  // Bomba 4 KH (forward)
#define PUMP4_IN2  33  // Bomba 4 KH (reverse) 
#define PUMP4_PWM  2   // Bomba 4 PWM (70%)

#define COMPRESSOR_PIN 15  // Pino compressor

// Comandos IA expandidos
#define PUMP4_KH_CORRECT 8  // bit 3
#define COMPRESSOR_ON    16

// Botão BOOT
static const gpio_num_t WIFI_RESET_BTN_GPIO = GPIO_NUM_32;
