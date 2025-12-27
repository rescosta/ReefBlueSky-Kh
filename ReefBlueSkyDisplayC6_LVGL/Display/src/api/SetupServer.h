#ifndef SETUP_SERVER_H
#define SETUP_SERVER_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

esp_err_t setup_server_start(void);
void      setup_server_stop(void);

#ifdef __cplusplus
}
#endif

#endif // SETUP_SERVER_H
