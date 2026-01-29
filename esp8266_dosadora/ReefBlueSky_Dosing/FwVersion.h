// FwVersion.h
#pragma once
#include <Arduino.h>

extern const char* FW_VERSION;
extern const char* FW_DEVICE_TYPE;

const char* getFirmwareVersion();
const char* getFirmwareDeviceType();

// apiBase: ex. "http://iot.reefbluesky.com.br"
// deviceToken: JWT do device
void reportFirmwareVersion(const String& apiBase, const String& deviceToken);
