#ifndef LED_CONTROLLER_H
#define LED_CONTROLLER_H

#include "esp_err.h"
#include "stdint.h"

#ifdef __cplusplus
extern "C" {
#endif

// Por enquanto usar o backlight do LCD (GPIO22) como “LED”
#define PIN_LED_RED    22
#define PIN_LED_GREEN  22
#define PIN_LED_BLUE   22

esp_err_t led_init(void);
void      led_set_rgb(uint8_t r, uint8_t g, uint8_t b);
void      led_off(void);

// Helpers de status (só para teste agora)
void led_status_ok(void);      // liga backlight
void led_status_error(void);   // podemos usar depois

#ifdef __cplusplus
}
#endif

#endif // LED_CONTROLLER_H
