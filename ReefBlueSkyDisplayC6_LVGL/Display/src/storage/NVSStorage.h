#ifndef NVS_STORAGE_H
#define NVS_STORAGE_H

#include "esp_err.h"
#include <stdbool.h>
#include <stddef.h>

#define WIFI_MAX_NETWORKS 10

typedef struct {
    char ssid[33];
    char password[65];
} wifi_network_t;

bool nvs_storage_add_wifi_network(const char *ssid, const char *password);
bool nvs_storage_load_wifi_networks(wifi_network_t *out, uint32_t max, uint32_t *out_count);


esp_err_t nvs_storage_init(void);

esp_err_t nvs_storage_set_boot_count(uint32_t count);
esp_err_t nvs_storage_get_boot_count(uint32_t *out_count, bool *exists);

bool nvs_storage_clear_wifi(void);

// WiFi
bool nvs_storage_save_wifi_credentials(const char *ssid, const char *password);
bool nvs_storage_load_wifi_credentials(char *ssid_out, size_t ssid_max,
                                       char *pass_out, size_t pass_max);

// Auth (servidor)
bool nvs_storage_save_auth_credentials(const char *email, const char *password);
bool nvs_storage_load_auth_credentials(char *email_out, size_t email_max,
                                       char *pass_out, size_t pass_max);

#endif // NVS_STORAGE_H
