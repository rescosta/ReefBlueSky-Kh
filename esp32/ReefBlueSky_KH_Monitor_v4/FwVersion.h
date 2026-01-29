// FwVersion.h
#pragma once
#include <Arduino.h>

// Definidos no .ino de cada projeto
extern const char* FW_DEVICE_TYPE;  // "KH", "LCD", "DOSER"
extern const char* FW_VERSION;      // "RBS_KH_xxxxxxx.bin"

const char* getFirmwareVersion();
const char* getFirmwareDeviceType();

// apiBase: ex. "http://iot.reefbluesky.com.br"
// deviceToken: JWT do device
void reportFirmwareVersion(const String& apiBase, const String& deviceToken);
