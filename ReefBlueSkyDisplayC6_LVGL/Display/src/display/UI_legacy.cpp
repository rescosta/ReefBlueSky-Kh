#include "display/UI.h"
#include "display/Themes.h"
#include <stdio.h>

UI::UI()
    : screen(nullptr),
      khLabel(nullptr),
      khValue(nullptr),
      khBar(nullptr),
      khMinLabel(nullptr),
      khMaxLabel(nullptr),
      detailsPanel(nullptr),
      detTitleLabel(nullptr),
      min24Label(nullptr),
      max24Label(nullptr),
      var24Label(nullptr),
      healthBar(nullptr) {}

void UI::init() {
    screen = lv_scr_act();
    createLayout();
}

void UI::createLayout() {
    screen = lv_scr_act();

    // fundo TOTAL preto
    lv_obj_set_style_bg_color(screen, lv_color_hex(0x000000), 0);
    lv_obj_set_scrollbar_mode(screen, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_scroll_dir(screen, LV_DIR_NONE);
    lv_obj_set_style_pad_all(screen, 0, 0);

    // viewport útil (começa abaixo da parte quebrada)
    lv_obj_t *root = lv_obj_create(screen);
    lv_obj_set_size(root, 172, 320 - 60);
    lv_obj_align(root, LV_ALIGN_TOP_LEFT, 0, 60);
    lv_obj_set_style_bg_color(root, lv_color_hex(0x1E0D3A), 0);
    lv_obj_set_scrollbar_mode(root, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_scroll_dir(root, LV_DIR_NONE);
    lv_obj_set_style_pad_all(root, 4, 0);

    // ---------------- Painel esquerdo: dKH ----------------
    lv_obj_t *panel_left = lv_obj_create(root);
    lv_obj_set_size(panel_left, 80, 180);
    lv_obj_align(panel_left, LV_ALIGN_LEFT_MID, 0, 0);
    lv_obj_set_style_bg_color(panel_left, lv_color_hex(0x1536C2), 0);
    lv_obj_set_style_radius(panel_left, 8, 0);
    lv_obj_set_scrollbar_mode(panel_left, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_scroll_dir(panel_left, LV_DIR_NONE);
    lv_obj_set_style_pad_all(panel_left, 4, 0);

    // título "dKH"
    khLabel = lv_label_create(panel_left);
    lv_label_set_text(khLabel, "dKH");
    lv_obj_set_style_text_color(khLabel, lv_color_hex(0xE5E7EB), 0);
    lv_obj_align(khLabel, LV_ALIGN_TOP_MID, 0, 2);

    // valor grande
    khValue = lv_label_create(panel_left);
    lv_obj_set_style_text_font(khValue, &lv_font_montserrat_14, 0);
    lv_label_set_text(khValue, "--.--");
    lv_obj_set_style_text_color(khValue, lv_color_hex(0xF9FAFB), 0);
    lv_obj_align(khValue, LV_ALIGN_CENTER, 0, -4);

    // barra KH embaixo
    khBar = lv_bar_create(panel_left);
    lv_obj_set_size(khBar, 70, 8);
    lv_bar_set_range(khBar, 0, 180);
    lv_bar_set_value(khBar, 0, LV_ANIM_OFF);
    lv_obj_align(khBar, LV_ALIGN_BOTTOM_MID, 0, -30);
    lv_obj_set_style_bg_color(khBar, lv_color_hex(0x1E3A8A), 0);
    lv_obj_set_style_bg_color(khBar, lv_color_hex(0x38BDF8), LV_PART_INDICATOR);

    // min/max pequenos sob a barra
    khMinLabel = lv_label_create(panel_left);
    lv_obj_set_style_text_font(khMinLabel, &lv_font_montserrat_14, 0);
    lv_label_set_text(khMinLabel, "--.--");
    lv_obj_set_style_text_color(khMinLabel, lv_color_hex(0x93C5FD), 0);
    lv_obj_align_to(khMinLabel, khBar, LV_ALIGN_OUT_BOTTOM_LEFT, 0, -10);

    khMaxLabel = lv_label_create(panel_left);
    lv_obj_set_style_text_font(khMaxLabel, &lv_font_montserrat_14, 0);
    lv_label_set_text(khMaxLabel, "--.--");
    lv_obj_set_style_text_color(khMaxLabel, lv_color_hex(0x93C5FD), 0);
    lv_obj_align_to(khMaxLabel, khBar, LV_ALIGN_OUT_BOTTOM_RIGHT, 0, -10);

    // ---------------- Painel direito: Detalhes ----------------
    detailsPanel = lv_obj_create(root);
    lv_obj_set_size(detailsPanel, 80, 180);
    lv_obj_align(detailsPanel, LV_ALIGN_RIGHT_MID, 0, 0);
    lv_obj_set_style_bg_color(detailsPanel, lv_color_hex(0x6D28D9), 0);
    lv_obj_set_style_radius(detailsPanel, 8, 0);
    lv_obj_set_scrollbar_mode(detailsPanel, LV_SCROLLBAR_MODE_OFF);
    lv_obj_set_scroll_dir(detailsPanel, LV_DIR_NONE);
    lv_obj_set_style_pad_all(detailsPanel, 4, 0);

    // título "Detalhes"
    detTitleLabel = lv_label_create(detailsPanel);
    lv_obj_set_style_text_font(detTitleLabel, &lv_font_montserrat_14, 0);
    lv_label_set_text(detTitleLabel, "Detalhes");
    lv_obj_set_style_text_color(detTitleLabel, lv_color_hex(0xE5E7EB), 0);
    lv_obj_align(detTitleLabel, LV_ALIGN_TOP_MID, 0, 2);

    // MIN / MAX
    min24Label = lv_label_create(detailsPanel);
    lv_obj_set_style_text_font(min24Label, &lv_font_montserrat_14, 0);
    lv_label_set_text(min24Label, "MIN: --.--");
    lv_obj_set_style_text_color(min24Label, lv_color_hex(0xF9FAFB), 0);
    lv_obj_align(min24Label, LV_ALIGN_TOP_LEFT, 2, 20);

    max24Label = lv_label_create(detailsPanel);
    lv_obj_set_style_text_font(max24Label, &lv_font_montserrat_14, 0);
    lv_label_set_text(max24Label, "MAX: --.--");
    lv_obj_set_style_text_color(max24Label, lv_color_hex(0xF9FAFB), 0);
    lv_obj_align(max24Label, LV_ALIGN_TOP_LEFT, 2, 34);

    // VAR
    var24Label = lv_label_create(detailsPanel);
    lv_obj_set_style_text_font(var24Label, &lv_font_montserrat_14, 0);
    lv_label_set_text(var24Label, "VAR: --.--");
    lv_obj_set_style_text_color(var24Label, lv_color_hex(0x22C55E), 0);
    lv_obj_align(var24Label, LV_ALIGN_TOP_LEFT, 2, 48);

    // barra de VAR / saúde embaixo
    healthBar = lv_bar_create(detailsPanel);
    lv_obj_set_size(healthBar, 70, 8);
    lv_bar_set_range(healthBar, 0, 100);
    lv_bar_set_value(healthBar, 0, LV_ANIM_OFF);
    lv_obj_align(healthBar, LV_ALIGN_BOTTOM_MID, 0, -25);
    lv_obj_set_style_bg_color(healthBar, lv_color_hex(0x14532D), 0);
    lv_obj_set_style_bg_color(healthBar, lv_color_hex(0x22C55E), LV_PART_INDICATOR);
}

void UI::updateKHValue(float kh) {
    if (!khValue) return;
    char buf[16];
    snprintf(buf, sizeof(buf), "%.2f", kh);
    lv_label_set_text(khValue, buf);
}

void UI::updateDetails(float kh,
                       float khMin24h,
                       float khMax24h,
                       float khVar24h,
                       float health)
{
    if (!khBar || !khMinLabel || !khMaxLabel ||
        !min24Label || !max24Label || !var24Label || !healthBar) {
        return;
    }

    updateKHValue(kh);

    float minv = khMin24h;
    float maxv = khMax24h;
    if (maxv <= minv) maxv = minv + 0.01f;

    float pos = (kh - minv) / (maxv - minv);
    if (pos < 0.0f) pos = 0.0f;
    if (pos > 1.0f) pos = 1.0f;
    lv_bar_set_value(khBar, (int)(pos * 100.0f), LV_ANIM_OFF);

    char buf[32];
    snprintf(buf, sizeof(buf), "%.2f", khMin24h);
    lv_label_set_text(khMinLabel, buf);
    snprintf(buf, sizeof(buf), "%.2f", khMax24h);
    lv_label_set_text(khMaxLabel, buf);

    snprintf(buf, sizeof(buf), "MIN: %.2f", khMin24h);
    lv_label_set_text(min24Label, buf);
    snprintf(buf, sizeof(buf), "MAX: %.2f", khMax24h);
    lv_label_set_text(max24Label, buf);

    const char *sign = (khVar24h >= 0.0f) ? "+" : "";
    snprintf(buf, sizeof(buf), "VAR: %s%.2f", sign, khVar24h);
    lv_label_set_text(var24Label, buf);

    if (health < 0.0f) health = 0.0f;
    if (health > 1.0f) health = 1.0f;
    int pct = (int)(health * 100.0f + 0.5f);
    lv_bar_set_value(healthBar, pct, LV_ANIM_OFF);

    lv_color_t c = lv_color_hex(0x22C55E);
    lv_obj_set_style_bg_color(healthBar, c, LV_PART_INDICATOR);
}

void UI::setColor(lv_color_t color) {
    if (khValue)
        lv_obj_set_style_text_color(khValue, color, 0);
    if (khBar)
        lv_obj_set_style_bg_color((lv_obj_t*)khBar, color, 0);
}

void UI::showSyncing() {
    // futuro: label de status
}

void UI::showError(const char* message) {
    if (khValue && message)
        lv_label_set_text(khValue, message);
}
