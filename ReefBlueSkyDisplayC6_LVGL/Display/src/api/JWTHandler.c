//JWTHandler.c
#include "JWTHandler.h"
#include <string.h>
#include "esp_log.h"

static const char *TAG = "JWT";

static char s_access[512]        = {0};
static char s_user_token[1024]   = {0};
static char s_display_token[1024]= {0};
static char s_device_token[1024]  = {0};


void jwt_handler_set_user_token(const char *tok) {
    if (!tok) {
        s_user_token[0] = 0;
        ESP_LOGI(TAG, "user token clear");
        return;
    }
    strncpy(s_user_token, tok, sizeof(s_user_token) - 1);
    s_user_token[sizeof(s_user_token) - 1] = 0;
    ESP_LOGI(TAG, "user token set (%d bytes)", (int)strlen(s_user_token));
}

const char *jwt_handler_get_user_token(void) {
    ESP_LOGI(TAG, "get user token, len=%d", (int)strlen(s_user_token));
    return s_user_token;
}

void jwt_handler_set_display_token(const char *tok) {
    if (!tok) {
        s_display_token[0] = 0;
        ESP_LOGI(TAG, "display token clear");
        return;
    }
    strncpy(s_display_token, tok, sizeof(s_display_token) - 1);
    s_display_token[sizeof(s_display_token) - 1] = 0;
    ESP_LOGI(TAG, "display token set (%d bytes)", (int)strlen(s_display_token));
}

const char *jwt_handler_get_display_token(void) {
    ESP_LOGI(TAG, "get display token, len=%d", (int)strlen(s_display_token));
    return s_display_token;
}

void jwt_handler_set_device_token(const char *tok)
{
    if (!tok) {
        s_device_token[0] = 0;
        ESP_LOGI(TAG, "device token clear");
        return;
    }
    strncpy(s_device_token, tok, sizeof(s_device_token) - 1);
    s_device_token[sizeof(s_device_token) - 1] = 0;
    ESP_LOGI(TAG, "device token set (%d bytes)", (int)strlen(s_device_token));
}

const char *jwt_handler_get_device_token(void)
{
    ESP_LOGI(TAG, "get device token, len=%d", (int)strlen(s_device_token));
    return s_device_token;
}


esp_err_t jwt_handler_set_access_token(const char *token)
{
    if (!token) {
        s_access[0] = '\0';
        ESP_LOGI(TAG, "access token clear");
        return ESP_OK;
    }
    strncpy(s_access, token, sizeof(s_access) - 1);
    s_access[sizeof(s_access) - 1] = '\0';
    ESP_LOGI(TAG, "access token set (%d bytes)", (int)strlen(s_access));
    return ESP_OK;
}

const char *jwt_handler_get_access_token(void)
{
    ESP_LOGI(TAG, "get access token, len=%d", (int)strlen(s_access));
    return s_access[0] ? s_access : NULL;
}

bool jwt_handler_has_valid_token(void)
{
    return s_access[0] != '\0';
}
