// DisplayManager.cpp

#include "DisplayManager.h"
#include "Themes.h"
#include "esp_timer.h"

DisplayManager::DisplayManager()
    : lastUpdateTime(0) {
    currentData = {};

    // se quiser já inicializar com o tempo atual:
    lastUpdateTime = esp_timer_get_time() / 1000ULL;
}

void DisplayManager::init() {
    LVGLSetup::init();
    ui.init();
    showSyncing();
}

void DisplayManager::update() {
    // Chamado a cada loop; aqui só roda lv_timer_handler()
    lv_timer_handler();
}

void DisplayManager::updateData(const KHData& data) {
    currentData = data;
    lastUpdateTime = esp_timer_get_time() / 1000ULL;

    // Se quiser cor dinâmica:
    lv_color_t c = Theme::getKHColor(data.kh, 7.8f, 0.3f);
    ui.setColor(c);

    ui.updateKHValue(data.kh); 
}

void DisplayManager::showSyncing() {
    ui.showSyncing();
}

void DisplayManager::showError(const char* message) {
    ui.showError(message);
}

void DisplayManager::showOffline() {
    ui.showError("Offline");
}
