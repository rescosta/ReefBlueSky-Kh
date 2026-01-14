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

#define WIFI_KEY_COUNT       "count"    
#define WIFI_KEY_NEXT_INDEX  "next_idx"  

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

bool nvs_storage_add_wifi_network(const char *ssid, const char *password)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open wifi RW failed: %d", err);
        return false;
    }

    uint32_t count = 0, next_idx = 0;
    nvs_get_u32(handle, WIFI_KEY_COUNT, &count);      // se não existir, fica 0
    nvs_get_u32(handle, WIFI_KEY_NEXT_INDEX, &next_idx);

    // Ver se SSID já existe -> atualiza ao invés de criar slot novo
    char key_ssid[16], key_pass[16], buf_ssid[33];
    for (uint32_t i = 0; i < count && i < WIFI_MAX_NETWORKS; i++) {
        snprintf(key_ssid, sizeof(key_ssid), "ssid_%lu", (unsigned long)i);
        size_t len = sizeof(buf_ssid);
        err = nvs_get_str(handle, key_ssid, buf_ssid, &len);
        if (err == ESP_OK && strcmp(buf_ssid, ssid) == 0) {
            // Atualiza senha do slot existente
            snprintf(key_pass, sizeof(key_pass), "pass_%lu", (unsigned long)i);
            ESP_LOGI(TAG, "Updating WiFi slot %u (SSID=%s)", i, ssid);
            nvs_set_str(handle, key_ssid, ssid);
            nvs_set_str(handle, key_pass, password);
            nvs_commit(handle);
            nvs_close(handle);
            return true;
        }
    }

    // Se não existe, grava no next_idx (array circular)
    uint32_t slot = next_idx % WIFI_MAX_NETWORKS;
    snprintf(key_ssid, sizeof(key_ssid), "ssid_%lu", (unsigned long)slot);
    snprintf(key_pass, sizeof(key_pass), "pass_%lu", (unsigned long)slot);

    ESP_LOGI(TAG, "Saving WiFi to slot %u (SSID=%s)", slot, ssid);
    err = nvs_set_str(handle, key_ssid, ssid);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str ssid_%u failed: %d", slot, err);
        nvs_close(handle);
        return false;
    }
    err = nvs_set_str(handle, key_pass, password);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_set_str pass_%u failed: %d", slot, err);
        nvs_close(handle);
        return false;
    }

    // Atualiza count (máx 10) e next_idx
    if (count < WIFI_MAX_NETWORKS) {
        count++;
        nvs_set_u32(handle, WIFI_KEY_COUNT, count);
    }
    next_idx = (slot + 1) % WIFI_MAX_NETWORKS;
    nvs_set_u32(handle, WIFI_KEY_NEXT_INDEX, next_idx);

    err = nvs_commit(handle);
    nvs_close(handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_commit wifi failed: %d", err);
        return false;
    }

    ESP_LOGI(TAG, "WiFi network saved to NVS (slot=%u, count=%u, next=%u)", slot, count, next_idx);
    return true;
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

bool nvs_storage_load_wifi_networks(wifi_network_t *out, uint32_t max, uint32_t *out_count)
{
    *out_count = 0;

    nvs_handle_t handle;
    esp_err_t err = nvs_open(WIFI_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open wifi RO failed: %d", err);
        return false;
    }

    uint32_t count = 0, next_idx = 0;
    nvs_get_u32(handle, WIFI_KEY_COUNT, &count);
    nvs_get_u32(handle, WIFI_KEY_NEXT_INDEX, &next_idx);

    if (count == 0) {
        nvs_close(handle);
        return false;
    }

    if (count > WIFI_MAX_NETWORKS) count = WIFI_MAX_NETWORKS;
    if (count > max) count = max;

    // Percorre em ordem "mais recente primeiro"
    char key_ssid[24], key_pass[24];
    uint32_t filled = 0;
    for (uint32_t i = 0; i < count; i++) {
        // índice circular: último gravado é (next_idx - 1 + 10) % 10
        int32_t idx = (int32_t)next_idx - 1 - (int32_t)i;
        if (idx < 0) idx += WIFI_MAX_NETWORKS;

        snprintf(key_ssid, sizeof(key_ssid), "ssid_%ld", (long)idx);
        snprintf(key_pass, sizeof(key_pass), "pass_%ld", (long)idx);

        size_t ssid_len = sizeof(out[filled].ssid);
        size_t pass_len = sizeof(out[filled].password);

        err = nvs_get_str(handle, key_ssid, out[filled].ssid, &ssid_len);
        if (err != ESP_OK) continue;

        err = nvs_get_str(handle, key_pass, out[filled].password, &pass_len);
        if (err != ESP_OK) continue;

        filled++;
        if (filled >= count) break;
    }

    nvs_close(handle);
    *out_count = filled;

    ESP_LOGI(TAG, "Loaded %u WiFi network(s) from NVS", filled);
    return filled > 0;
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

