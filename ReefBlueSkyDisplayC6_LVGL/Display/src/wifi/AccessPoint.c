#include "AccessPoint.h"
#include "esp_wifi.h"
#include "esp_log.h"
#include <string.h>

#define AP_SSID     "ReefBlueSkyLCD-Setup"
#define AP_PASSWORD "12345678"

static const char *TAG = "AP";

esp_err_t ap_start(const char *ssid, const char *password)
{
    ssid     = AP_SSID;
    password = AP_PASSWORD;

    ESP_LOGI(TAG, "Starting Access Point: SSID=%s", ssid);

    // NÃO criar netif aqui – já foi criado em wifi_manager_init()
    // NÃO chamar esp_wifi_start() aqui – já está rodando

    // Garante modo AP+STA
    wifi_mode_t mode;
    esp_wifi_get_mode(&mode);
    if (mode != WIFI_MODE_APSTA) {
        ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    }

    wifi_config_t ap_config = { 0 };
    snprintf((char *)ap_config.ap.ssid, sizeof(ap_config.ap.ssid), "%s", ssid);
    ap_config.ap.ssid_len = strlen((char *)ap_config.ap.ssid);

    if (password && strlen(password) > 0) {
        snprintf((char *)ap_config.ap.password,
                 sizeof(ap_config.ap.password), "%s", password);
        ap_config.ap.authmode       = WIFI_AUTH_WPA_WPA2_PSK;
        ap_config.ap.max_connection = 4;
    } else {
        ap_config.ap.password[0]    = '\0';
        ap_config.ap.authmode       = WIFI_AUTH_OPEN;
        ap_config.ap.max_connection = 4;
    }

    esp_err_t err = esp_wifi_set_config(WIFI_IF_AP, &ap_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_set_config(AP) failed: %d", err);
        return err;
    }

    ESP_LOGI(TAG, "Access Point configured");
    return ESP_OK;
}

esp_err_t ap_stop(void)
{
    // se quiser só desligar o AP, pode deixar vazio ou mudar modo
    ESP_LOGI(TAG, "Stopping Access Point (no-op for now)");
    return ESP_OK;
}
