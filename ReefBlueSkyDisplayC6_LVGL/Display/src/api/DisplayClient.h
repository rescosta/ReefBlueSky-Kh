#pragma once
#include "esp_err.h"
#include <stdbool.h>
#include <time.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    bool   has_data;
    float  kh;
    float  kh_min_24h;
    float  kh_max_24h;
    float  kh_var_24h;
    float  health;               // 0.0 .. 1.0
    float  health_green_max_dev; 
    float  health_yellow_max_dev;
    time_t ts;
} kh_summary_t;


// login + registro do LCD
esp_err_t display_client_login_and_register(void);

// lista de devices KH
esp_err_t   display_client_load_kh_devices(void);
int         display_client_get_kh_device_count(void);
const char *display_client_get_kh_device_id(int index);
const char *display_client_get_kh_device_name(int index);

// resumo KH para um deviceId específico
esp_err_t   display_client_fetch_kh_summary_for(const char *device_id,
                                                kh_summary_t *out);


                                                
esp_err_t   display_client_ping_lcd(const char *main_device_id);                                                

#ifdef __cplusplus
}
#endif
