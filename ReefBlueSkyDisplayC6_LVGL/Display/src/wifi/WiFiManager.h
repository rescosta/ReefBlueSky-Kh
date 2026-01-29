//WiFiManager.h


#ifndef WIFI_MANAGER_H
#define WIFI_MANAGER_H

#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    WIFI_STATE_IDLE = 0,
    WIFI_STATE_CONNECTING,
    WIFI_STATE_CONNECTED,
    WIFI_STATE_FAILED
} wifi_state_t;

esp_err_t   wifi_manager_init(void);
esp_err_t   wifi_manager_connect_sta(const char *ssid, const char *password);
esp_err_t   wifi_manager_connect_auto(void);
wifi_state_t wifi_manager_get_state(void);
bool        wifi_manager_is_connected(void);

// NOVO: chamada periódica no main para retry/backoff
void        wifi_manager_poll(void);

// Desliga AP (mantém só STA)
void        wifi_manager_stop_ap(void);


#ifdef __cplusplus
}
#endif

#endif // WIFI_MANAGER_H
