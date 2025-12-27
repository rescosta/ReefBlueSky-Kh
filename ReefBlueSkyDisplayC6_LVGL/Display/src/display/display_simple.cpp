#include "display_simple.h"
#include "display/LVGLSetup.h"

extern "C" bool g_wifi_status;

extern "C" {
    #include "ui.h"
    #include "ui_Screen1.h"
    #include "freertos/FreeRTOS.h"
    #include "freertos/task.h"
}




static void format_float(char *buf, size_t len, float value, int decimals)
{
    char fmt[8];
    snprintf(fmt, sizeof(fmt), "%%.%df", decimals);
    snprintf(buf, len, fmt, value);
}

void display_simple_init(void)
{
    LVGLSetup::init();

    // Texto inicial de splash no header
    if (ui_Label1) lv_label_set_text(ui_Label1, "ReefBlueSky KH");
    if (ui_dhkValue)   lv_label_set_text(ui_dhkValue, "0,00");
    if (ui_KhminDay)   lv_label_set_text(ui_KhminDay, "0,00");
    if (ui_KhmaxDay)   lv_label_set_text(ui_KhmaxDay, "0,00");
    if (ui_KhVarDay)   lv_label_set_text(ui_KhVarDay, "0,00");

    // Spinner inicialmente OFF
    if (ui_loading) {
        lv_obj_add_flag(ui_loading, LV_OBJ_FLAG_HIDDEN);
    }

    // Bolinha vermelha inicial (sem texto)
    if (ui_status) {
        lv_label_set_text(ui_status, "");
        lv_obj_set_size(ui_status, 10, 10);
        lv_obj_set_style_radius(ui_status, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_bg_color(ui_status, lv_color_hex(0xFF0000), 0);
    }
}

void display_simple_show_cached_summary(float kh, float health, const char *name)
{
    kh_summary_t s = {};
    s.kh = kh;
    s.health = health;
    s.has_data = true;
    display_simple_show_summary(&s, name);
}

void display_simple_set_loading(bool on, const char *label)
{
    if (!ui_loading) return;

    if (on) {
        lv_obj_clear_flag(ui_loading, LV_OBJ_FLAG_HIDDEN);
        if (label && ui_Label1) {
            lv_label_set_text(ui_Label1, label);
        }
    } else {
        lv_obj_add_flag(ui_loading, LV_OBJ_FLAG_HIDDEN);
    }
}

void display_simple_show_summary(const kh_summary_t *summary,
                                 const char *device_name)
{
    if (!summary || !summary->has_data) {
        if (ui_dhkValue) {
            lv_label_set_text(ui_dhkValue, "");
        }
        return;
    }

    if (ui_status) {
        lv_color_t c = g_wifi_status ? lv_color_hex(0x00FF00)
                                        : lv_color_hex(0xFF0000);
        lv_obj_set_style_bg_color(ui_status, c, 0);
    }

    // dKH atual (número grande)
    if (ui_dhkValue) {
        char buf[16];
        format_float(buf, sizeof(buf), summary->kh, 2);
        lv_label_set_text(ui_dhkValue, buf);
    }

    // MIN / MAX / VAR 24h
    if (ui_KhminDay) {
        char buf[16];
        format_float(buf, sizeof(buf), summary->kh_min_24h, 2);
        lv_label_set_text(ui_KhminDay, buf);
    }

    if (ui_KhmaxDay) {
        char buf[16];
        format_float(buf, sizeof(buf), summary->kh_max_24h, 2);
        lv_label_set_text(ui_KhmaxDay, buf);
    }

    if (ui_KhVarDay) {
        char buf[16];
        snprintf(buf, sizeof(buf), "%+.2f", summary->kh_var_24h);
        lv_label_set_text(ui_KhVarDay, buf);
    }

    // Bar2: saúde
    if (ui_Bar2) {
        float h = summary->health;
        if (h < 0.0f) h = 0.0f;
        if (h > 1.0f) h = 1.0f;

        int bar_val = (int)(h * 100.0f);
        lv_bar_set_range(ui_Bar2, 0, 100);
        lv_bar_set_value(ui_Bar2, bar_val, LV_ANIM_OFF);

        float gMin = summary->health_green_max_dev;
        float yMin = summary->health_yellow_max_dev;

        lv_color_t color;
        if (h >= gMin) {
            color = lv_color_hex(0x00FF00);
        } else if (h >= yMin) {
            color = lv_color_hex(0xFFFF00);
        } else {
            color = lv_color_hex(0xFF0000);
        }
        lv_obj_set_style_bg_color(ui_Bar1,
                                  color,
                                  LV_PART_INDICATOR | LV_STATE_DEFAULT);
    }

    // Barra principal dKH
    if (ui_Bar1) {
        float kh     = summary->kh;
        float kh_min = summary->kh_min_24h;
        float kh_max = summary->kh_max_24h;

        lv_bar_set_range(ui_Bar1, 0, 100);

        int bar_val = 0;
        if (kh_max > kh_min) {
            float p = (kh - kh_min) * 100.0f / (kh_max - kh_min);
            if (p < 0.0f)   p = 0.0f;
            if (p > 100.0f) p = 100.0f;
            bar_val = (int)p;
        }
        lv_bar_set_value(ui_Bar1, bar_val, LV_ANIM_OFF);
    }

    // Rótulos min/max
    if (ui_khMin) {
        char buf[16];
        format_float(buf, sizeof(buf), summary->kh_min_24h, 2);
        lv_label_set_text(ui_khMin, buf);
    }

    if (ui_khMax) {
        char buf[16];
        format_float(buf, sizeof(buf), summary->kh_max_24h, 2);
        lv_label_set_text(ui_khMax, buf);
    }

    // Header fixo + bolinha de status
    if (ui_Label1) {
        lv_label_set_text(ui_Label1, "ReefBlueSky KH");
    }

    if (ui_status) {
        lv_label_set_text(ui_status, "");                  // sem texto
        lv_obj_set_size(ui_status, 10, 10);                // quadradinho
        lv_obj_set_style_radius(ui_status, LV_RADIUS_CIRCLE, 0);  // vira círculo
    }

}
