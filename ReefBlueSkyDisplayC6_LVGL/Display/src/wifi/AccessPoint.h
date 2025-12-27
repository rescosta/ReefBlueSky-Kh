#ifndef ACCESS_POINT_H
#define ACCESS_POINT_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t ap_start(const char *ssid, const char *password);
esp_err_t ap_stop(void);

#ifdef __cplusplus
}
#endif

#endif // ACCESS_POINT_H
