// DisplayManager.h

#ifndef DISPLAYMANAGER_H
#define DISPLAYMANAGER_H

#include "LVGLSetup.h"
#include "UI.h"
#include "api/APIStructs.h"

class DisplayManager {
private:
    UI ui;
    KHData currentData;
    uint64_t lastUpdateTime;   // mesmo tipo usado com esp_timer_get_time()

public:
    DisplayManager();

    void init();
    void update();
    void updateData(const KHData& data);
    void showSyncing();
    void showError(const char* message);
    void showOffline();
};

#endif
