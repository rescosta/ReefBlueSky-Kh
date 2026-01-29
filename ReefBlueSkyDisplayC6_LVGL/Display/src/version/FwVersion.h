// FwVersion.h
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

// Tipos de device e versão do firmware para este binário
extern const char FW_DEVICE_TYPE[];  
extern const char FW_VERSION[];      

// apiBase: ex. "https://iot.reefbluesky.com.br/api/v1"
// deviceToken: JWT do display
void reportFirmwareVersion_c(const char *apiBase, const char *deviceToken);

#ifdef __cplusplus
}
#endif
