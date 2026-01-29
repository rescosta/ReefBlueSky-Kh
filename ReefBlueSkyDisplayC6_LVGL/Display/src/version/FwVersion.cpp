// src/version/FwVersion.cpp
#include "FwVersion.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_crt_bundle.h"
#include <string.h>

const char FW_DEVICE_TYPE[] = "LCD";
const char FW_VERSION[]     = "RBS_LCD_260128.bin";

static const char *TAG_FW = "FwVersion";

extern "C" void reportFirmwareVersion_c(const char *apiBase, const char *deviceToken)
{
    if (!apiBase || !apiBase[0] || !deviceToken || !deviceToken[0]) {
        ESP_LOGW(TAG_FW, "reportFirmwareVersion_c: apiBase/token inválidos");
        return;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/device/firmware", apiBase);

    char body[256];
    snprintf(body, sizeof(body),
             "{\"deviceType\":\"%s\",\"firmwareVersion\":\"%s\"}",
             FW_DEVICE_TYPE, FW_VERSION);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG_FW, "Falha ao init http client");
        return;
    }

    char auth_hdr[256];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", deviceToken);
    esp_http_client_set_header(client, "Authorization", auth_hdr);
    esp_http_client_set_header(client, "Content-Type", "application/json");

    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG_FW, "HTTP error %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return;
    }

    int status = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG_FW, "FW report -> HTTP %d", status);

    esp_http_client_cleanup(client);
}
