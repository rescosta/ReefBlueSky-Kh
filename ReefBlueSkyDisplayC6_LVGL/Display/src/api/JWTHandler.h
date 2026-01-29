// JWTHandler.h
#pragma once
#include "esp_err.h"
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t jwt_handler_set_access_token(const char *token);
const char *jwt_handler_get_access_token(void);
bool jwt_handler_has_valid_token(void);

void jwt_handler_set_user_token(const char *tok);
const char *jwt_handler_get_user_token(void);

void jwt_handler_set_display_token(const char *tok);
const char *jwt_handler_get_display_token(void);

void jwt_handler_set_device_token(const char *tok);
const char *jwt_handler_get_device_token(void);

#ifdef __cplusplus
}
#endif
