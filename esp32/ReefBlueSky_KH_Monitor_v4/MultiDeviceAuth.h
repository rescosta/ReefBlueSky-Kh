//MultiDeviceAuth.h
#ifndef MULTI_DEVICE_AUTH_H
#define MULTI_DEVICE_AUTH_H

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// Globais (só declaração)
extern String deviceId;
extern String jwtToken;
extern String userEmail;
extern String userPassword;
extern String serverUrl;
extern Preferences preferences; 
extern unsigned long lastSerialPromptTime;
extern bool menuShown;
extern String deviceToken;     

#ifndef RESET_BUTTON_PIN
#define RESET_BUTTON_PIN 35
#endif

// Protótipos
String generateDeviceId();
bool loadCredentialsFromNVS();
bool saveCredentialsToNVS(String email, String password);
void clearCredentialsFromNVS();
bool isValidEmail(const String& email);
bool getCredentialsFromSerial();
bool performLogin(String email, String password);
bool sendMeasurements(float kh, float phRef, float phSample, float temp);
void printConfigMenu();
void handleSerialInput();
bool initMultiDeviceAuth();
String getDeviceToken();

void wifiFactoryReset();  

#endif
