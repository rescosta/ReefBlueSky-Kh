//LcdOta.h
#pragma once

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*lcd_ota_progress_cb_t)(int percent);
typedef void (*lcd_ota_event_cb_t)(const char *event, const char *details);

void lcd_ota_init(const char *base_url,
                  lcd_ota_progress_cb_t progress_cb,
                  lcd_ota_event_cb_t event_cb);

// Baixa /ota/lcd/latest.bin a partir de base_url (ex: "http://iot.reefbluesky.com.br")
bool lcd_ota_update(void);

#ifdef __cplusplus
}
#endif
