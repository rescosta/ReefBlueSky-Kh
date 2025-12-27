#include "WiFiManager.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"

static const char *TAG = "WiFiMgr";

static wifi_state_t s_state = WIFI_STATE_IDLE;

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        ESP_LOGI(TAG, "WiFi STA started");
        s_state = WIFI_STATE_IDLE;   // ainda não conectando, espera connect_sta()
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGW(TAG, "WiFi disconnected");
        s_state = WIFI_STATE_FAILED;
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ESP_LOGI(TAG, "WiFi got IP");
        s_state = WIFI_STATE_CONNECTED;
    }
}

esp_err_t wifi_manager_init(void)
{
    esp_err_t err;

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    // Criar default STA e AP (AP será usado pelo AccessPoint.c)
    esp_netif_create_default_wifi_sta();
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&cfg);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_init failed: %d", err);
        return err;
    }

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                               &wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                               &wifi_event_handler, NULL));

    // AP + STA para poder manter o AP de setup e escanear redes
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "WiFiManager initialized");
    return ESP_OK;
}


esp_err_t wifi_manager_connect_sta(const char *ssid, const char *password)
{
    wifi_config_t wifi_cfg = { 0 };
    snprintf((char *)wifi_cfg.sta.ssid,     sizeof(wifi_cfg.sta.ssid),     "%s", ssid);
    snprintf((char *)wifi_cfg.sta.password, sizeof(wifi_cfg.sta.password), "%s", password);
    wifi_cfg.sta.threshold.authmode = WIFI_AUTH_WPA2_PSK;

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));

    s_state = WIFI_STATE_CONNECTING;
    esp_err_t err = esp_wifi_connect();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_wifi_connect failed: %d", err);
        s_state = WIFI_STATE_FAILED;
    }
    return err;
}

wifi_state_t wifi_manager_get_state(void)
{
    return s_state;
}

bool wifi_manager_is_connected(void)
{
    return s_state == WIFI_STATE_CONNECTED;
}
