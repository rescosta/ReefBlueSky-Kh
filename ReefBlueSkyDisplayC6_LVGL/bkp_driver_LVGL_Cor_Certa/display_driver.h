//display_driver.h
#pragma once

#include <stdint.h>


#define LCD_LEDC_MODE       LEDC_LOW_SPEED_MODE
#define LCD_LEDC_CHANNEL    LEDC_CHANNEL_0
#define LCD_LEDC_TIMER      LEDC_TIMER_0
#define LCD_LEDC_DUTY_RES   LEDC_TIMER_10_BIT
#define LCD_LEDC_MAX_DUTY   ((1 << LCD_LEDC_DUTY_RES) - 1)

//------------------------------------------------------
// Resolução lógica usada pelo projeto
//------------------------------------------------------
#define LCD_WIDTH   320   // LCD width (H)
#define LCD_HEIGHT  172  // LCD height (V)

//------------------------------------------------------
// Pinos do display (iguais aos que você já usava)
//------------------------------------------------------
#define EXAMPLE_PIN_NUM_MISO           5
#define EXAMPLE_PIN_NUM_MOSI           6
#define EXAMPLE_PIN_NUM_SCLK           7
#define EXAMPLE_PIN_NUM_LCD_CS         14
#define EXAMPLE_PIN_NUM_LCD_DC         15
#define EXAMPLE_PIN_NUM_LCD_RST        21
#define EXAMPLE_PIN_NUM_BK_LIGHT       22

//------------------------------------------------------
// Parâmetros de backlight (usados no .cpp)
//------------------------------------------------------
#define Frequency       1000      // Hz para PWM
#define Resolution      LEDC_TIMER_10_BIT        // usado antes; no .cpp mapeamos para 12 bits

//------------------------------------------------------
// Orientação e offsets lógicos (se o resto do código usar)
// Agora o offset real é aplicado via esp_lcd_panel_set_gap,
// mas manter esses defines evita quebrar includes antigos.
//------------------------------------------------------
#define VERTICAL   0
#define HORIZONTAL 1

#define Offset_X 0
#define Offset_Y 34

#ifdef __cplusplus
extern "C" {
#endif

//------------------------------------------------------
// API pública do display (usada pelo resto do projeto)
//------------------------------------------------------

// Inicializa o painel ST7789/JD9853 e o backlight
void LCD_Init(void);

// Desenha um retângulo de (Xstart,Ystart) até (Xend,Yend) inclusive,
// usando o buffer de cores em formato RGB565 (uint16_t*).
void LCD_addWindow(uint16_t Xstart, uint16_t Ystart,
                   uint16_t Xend,   uint16_t Yend,
                   uint16_t *color);

// Inicializa PWM de backlight (chamada dentro de LCD_Init)
void Backlight_Init(void);

// Ajusta o brilho em 0–100%
void Set_Backlight(uint8_t Light);

#ifdef __cplusplus
}
#endif
