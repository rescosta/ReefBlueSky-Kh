#ifndef THEMES_H
#define THEMES_H

extern "C" {
#include "lvgl.h"
}

class Theme {
public:
    // static void init();  // não usada enquanto a implementação estiver comentada
    static lv_color_t getKHColor(float kh, float target, float tolerance);
    static void applyDarkMode();
    static void applyLightMode();
};

#endif
