#include "NVSStorage.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_log.h"
#define WIFI_NAMESPACE    "wifi"
#define WIFI_KEY_SSID     "ssid"
#define WIFI_KEY_PASSWORD "password"

#define AUTH_NAMESPACE    "auth"
#define AUTH_KEY_EMAIL    "email"
#define AUTH_KEY_PASSWORD "password"


static const char *TAG = "NVS";




esp_err_t nvs_storage_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "Erasing NVS due to error %d", err);
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_flash_init failed: %d", err);
    } else {
        ESP_LOGI(TAG, "NVS initialized");
    }
    return err;
}

esp_err_t nvs_storage_set_boot_count(uint32_t count)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open("sys", NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_set_u32(handle, "boot_count", count);
    if (err == ESP_OK) err = nvs_commit(handle);

    nvs_close(handle);
    return err;
}

esp_err_t nvs_storage_get_boot_count(uint32_t *out_count, bool *exists)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open("sys", NVS_READONLY, &handle);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        *exists = false;
        return ESP_OK;
    }
    if (err != ESP_OK) return err;

    uint32_t value = 0;
    err = nvs_get_u32(handle, "boot_count", &value);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        *exists = false;
        nvs_close(handle);
        return ESP_OK;
    }

    nvs_close(handle);
    if (err == ESP_OK) {
        *exists   = true;
        *out_count = value;
    }
    return err;
}

bool nvs_storage_save_wifi_credentials(const char *ssid, const char *password)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open wifi RW failed: %d", err);
        return false;
    }

    err = nvs_set_str(handle, WIFI_KEY_SSID, ssid);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str ssid failed: %d", err);
        nvs_close(handle);
        return false;
    }

    err = nvs_set_str(handle, WIFI_KEY_PASSWORD, password);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str password failed: %d", err);
        nvs_close(handle);
        return false;
    }

    err = nvs_commit(handle);
    nvs_close(handle);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_commit wifi failed: %d", err);
        return false;
    }

    ESP_LOGI(TAG, "WiFi credentials saved to NVS");
    return true;
}

bool nvs_storage_load_wifi_credentials(char *ssid_out, size_t ssid_max,
                                       char *pass_out, size_t pass_max)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open wifi RO failed: %d", err);
        return false;
    }

    size_t ssid_len = ssid_max;
    size_t pass_len = pass_max;

    err = nvs_get_str(handle, WIFI_KEY_SSID, ssid_out, &ssid_len);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_get_str ssid failed: %d", err);
        nvs_close(handle);
        return false;
    }

    err = nvs_get_str(handle, WIFI_KEY_PASSWORD, pass_out, &pass_len);
    nvs_close(handle);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_get_str password failed: %d", err);
        return false;
    }

    ESP_LOGI(TAG, "WiFi credentials loaded from NVS (SSID=%s)", ssid_out);
    return true;
}


bool nvs_storage_save_auth_credentials(const char *email, const char *password)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(AUTH_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open auth RW failed: %d", err);
        return false;
    }

    err = nvs_set_str(handle, AUTH_KEY_EMAIL, email);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str email failed: %d", err);
        nvs_close(handle);
        return false;
    }

    err = nvs_set_str(handle, AUTH_KEY_PASSWORD, password);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str password failed: %d", err);
        nvs_close(handle);
        return false;
    }

    err = nvs_commit(handle);
    nvs_close(handle);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_commit auth failed: %d", err);
        return false;
    }

    ESP_LOGI(TAG, "Auth credentials saved to NVS");
    return true;
}


bool nvs_storage_clear_wifi(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open wifi RW failed (clear): %d", err);
        return false;
    }

    nvs_erase_all(handle);
    err = nvs_commit(handle);
    nvs_close(handle);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_commit wifi clear failed: %d", err);
        return false;
    }

    ESP_LOGI(TAG, "WiFi credentials cleared from NVS");
    return true;
}

// Em NVSStorage.c, substitui a função do final por esta:

bool nvs_storage_load_auth_credentials(char *email_out, size_t email_max,
                                       char *pass_out, size_t pass_max)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(AUTH_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open auth RO failed: %d", err);
        return false;
    }

    size_t email_len = email_max;
    size_t pass_len  = pass_max;

    err = nvs_get_str(handle, AUTH_KEY_EMAIL, email_out, &email_len);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_get_str email failed: %d", err);
        nvs_close(handle);
        return false;
    }

    err = nvs_get_str(handle, AUTH_KEY_PASSWORD, pass_out, &pass_len);
    nvs_close(handle);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_get_str password failed: %d", err);
        return false;
    }

    ESP_LOGI(TAG, "Auth credentials loaded from NVS (email=%s)", email_out);
    return true;
}

