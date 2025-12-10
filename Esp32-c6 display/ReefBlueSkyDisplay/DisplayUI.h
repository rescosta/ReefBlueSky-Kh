/**
 * ReefBlueSky Display - Interface Visual
 * 
 * Renderização de UI na tela 1.47" com indicadores de status
 * Cores dinâmicas baseadas no valor de KH
 */

#ifndef DISPLAY_UI_H
#define DISPLAY_UI_H

#include <Arduino.h>
#include "ui.h"
#include <lvgl.h>
#include "DisplayClient.h"

#define COLOR_GREEN   0x04E0    // Verde (#10b981)
#define COLOR_YELLOW  0xFD60    // Amarelo (#f59e0b)
#define COLOR_RED     0xB800    // Vermelho (#b91c1c)


class DisplayUI {
private:
    float currentKH = 0;
    float targetKH = 7.8f;
    float khTolerance = 0.3f;
    bool  isOnline = false;
    unsigned long lastUpdateTime = 0;

public:
    DisplayUI() {}

    void begin() {
        Serial.println("[UI] Inicializando LVGL UI...");
        ui_init();      // cria ui_Screen1 e widgets
        Serial.println("[UI] UI pronta");
    }

    void renderDashboard(const KHMeasurement& m, bool online) {
        currentKH = m.kh;
        isOnline  = online;
        lastUpdateTime = millis();

        // valor principal de KH (ex: ui_Label3)
        char khStr[10];
        snprintf(khStr, sizeof(khStr), "%.2f", m.kh);
        lv_label_set_text(ui_Label3, khStr);

        // status online/offline (ex: ui_Label14)
        lv_label_set_text(ui_Label14, online ? "Online" : "Offline");

        // barra de KH (ex: ui_Bar1 mapeada de 6.0–9.0)
        int khPercent = (int)(((m.kh - 6.0f) / (9.0f - 6.0f)) * 100.0f);
        if (khPercent < 0) khPercent = 0;
        if (khPercent > 100) khPercent = 100;
        lv_bar_set_value(ui_Bar1, khPercent, LV_ANIM_OFF);
    }

    void updateKHValue(float kh, bool online) {
        // por enquanto só chama renderDashboard
        KHMeasurement m{};
        m.kh = kh;
        renderDashboard(m, online);
    }

    void showError(const String& message) {
        lv_label_set_text(ui_Label13, message.c_str());
    }

    void showOffline() {
        isOnline = false;
        lv_label_set_text(ui_Label14, "Offline");
    }

    void setTargetKH(float target)    { targetKH = target; }
    void setKHTolerance(float tol)    { khTolerance = tol; }

private:
    uint16_t getKHColor(float kh) {
        float minTarget = targetKH - khTolerance;
        float maxTarget = targetKH + khTolerance;
        if (kh >= minTarget && kh <= maxTarget) return COLOR_GREEN;
        if (kh < minTarget)                     return COLOR_RED;
        return COLOR_YELLOW;
    }
};


#endif  // DISPLAY_UI_H
