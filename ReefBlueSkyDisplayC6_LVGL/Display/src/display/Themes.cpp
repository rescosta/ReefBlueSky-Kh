#include "display/Themes.h"
#include "lvgl.h"


#define COLOR_BG       0x0F172A
#define COLOR_PRIMARY  0x0284C7
#define COLOR_SECONDARY 0x7C3AED
#define COLOR_GREEN    0x10B981
#define COLOR_YELLOW   0xF59E0B
#define COLOR_RED      0xB91C1C

//void Theme::init()
//{
//    lv_theme_t *th = lv_theme_default_init(
//        nullptr,
//        lv_color_hex(COLOR_PRIMARY),
//        lv_color_hex(COLOR_SECONDARY),
//        false,
//        &lv_font_montserrat_14
//    );
//    lv_disp_set_theme(nullptr, th);
//}

lv_color_t Theme::getKHColor(float kh, float target, float tolerance)
{
    float minTarget = target - tolerance;
    float maxTarget = target + tolerance;

    if (kh >= minTarget && kh <= maxTarget)
        return lv_color_hex(COLOR_GREEN);
    else if (kh < minTarget)
        return lv_color_hex(COLOR_RED);
    else
        return lv_color_hex(COLOR_YELLOW);
}

void Theme::applyDarkMode()
{
    lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(COLOR_BG), 0);
}

void Theme::applyLightMode()
{
    // opcional: outro esquema de cores
}
