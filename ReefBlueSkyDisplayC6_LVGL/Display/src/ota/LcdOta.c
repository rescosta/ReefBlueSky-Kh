//LcdOta.c
#include "LcdOta.h"
#include "esp_http_client.h"
#include "esp_ota_ops.h"
#include "esp_log.h"
#include "esp_system.h"

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include <string.h>


static const char *TAG = "LCD_OTA";

static char g_base_url[128] = "http://iot.reefbluesky.com.br";
static lcd_ota_progress_cb_t g_prog_cb = NULL;
static lcd_ota_event_cb_t g_event_cb = NULL;

void lcd_ota_init(const char *base_url,
                  lcd_ota_progress_cb_t progress_cb,
                  lcd_ota_event_cb_t event_cb)
{
    if (base_url && base_url[0]) {
        strncpy(g_base_url, base_url, sizeof(g_base_url) - 1);
        g_base_url[sizeof(g_base_url) - 1] = '\0';
    }
    g_prog_cb = progress_cb;
    g_event_cb = event_cb;
    ESP_LOGI(TAG, "Init OTA base_url=%s", g_base_url);
}

static void evt(const char *ev, const char *details)
{
    if (g_event_cb) g_event_cb(ev, details ? details : "");
    ESP_LOGI(TAG, "[%s] %s", ev, details ? details : "");
}

bool lcd_ota_update(void)
{
    esp_err_t err;
    char url[256];
    snprintf(url, sizeof(url), "%s/ota/lcd/latest.bin", g_base_url);

    evt("started", url);

    esp_http_client_config_t cfg = {
        .url = url,
        .timeout_ms = 30000,
        // HTTPS: aqui você adicionaria .cert_pem se for https
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        evt("failed", "http_client_init");
        return false;
    }

    err = esp_http_client_open(client, 0);
    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        evt("failed", "http_open");
        return false;
    }

    int content_length = esp_http_client_fetch_headers(client);
    if (content_length <= 0) {
        ESP_LOGW(TAG, "Content-Length <= 0 (%d)", content_length);
    }

    const esp_partition_t *running = esp_ota_get_running_partition();
    ESP_LOGI("PART", "Running partition: type=%d, subtype=%d, addr=0x%08x, size=0x%x",
            running->type, running->subtype, running->address, running->size);

    const esp_partition_t *update_part = esp_ota_get_next_update_partition(NULL);
    if (!update_part) {
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        evt("failed", "no_update_partition");
        return false;
    }

    ESP_LOGI("PART", "Update partition: type=%d, subtype=%d, addr=0x%08x, size=0x%x",
            update_part->type, update_part->subtype, update_part->address, update_part->size);


    esp_ota_handle_t ota_handle = 0;
    err = esp_ota_begin(update_part,
                        (content_length > 0) ? content_length : OTA_SIZE_UNKNOWN,
                        &ota_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "ota_begin failed: %s (0x%x)", esp_err_to_name(err), err);
        esp_http_client_close(client);
        esp_http_client_cleanup(client);
        evt("failed", "ota_begin");
        return false;
    }


    uint8_t buf[1024];
    int total_read = 0;
    while (1) {
        int read = esp_http_client_read(client, (char *)buf, sizeof(buf));
        if (read < 0) {
            evt("failed", "http_read");
            esp_ota_end(ota_handle);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        } else if (read == 0) {
            break; // fim
        }

        err = esp_ota_write(ota_handle, buf, read);
        if (err != ESP_OK) {
            evt("failed", "ota_write");
            esp_ota_end(ota_handle);
            esp_http_client_close(client);
            esp_http_client_cleanup(client);
            return false;
        }

        total_read += read;
        if (content_length > 0 && g_prog_cb) {
            int percent = (total_read * 100) / content_length;
            g_prog_cb(percent);
        }
    }

    esp_http_client_close(client);
    esp_http_client_cleanup(client);

    err = esp_ota_end(ota_handle);
    if (err != ESP_OK) {
        evt("failed", "ota_end");
        return false;
    }

    err = esp_ota_set_boot_partition(update_part);
    if (err != ESP_OK) {
        evt("failed", "set_boot_partition");
        return false;
    }

    evt("success", "rebooting");
    vTaskDelay(pdMS_TO_TICKS(2000));
    esp_restart();
    return true;
}
