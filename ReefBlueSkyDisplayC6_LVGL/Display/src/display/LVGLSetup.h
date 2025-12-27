// LVGLSetup.h
#pragma once

extern "C" {
    #include "lvgl.h"
}

class LVGLSetup {
public:
    static void init();
    static void setupDisplay();
    static void setupInput();
    static void setupTheme();
    static lv_disp_t *getDisplay();
};
