#ifndef UI_H
#define UI_H

#include "lvgl.h"
#include "api/APIStructs.h"

class UI {
private:
    lv_obj_t *screen;

    // painel esquerdo
    lv_obj_t *khLabel;
    lv_obj_t *khValue;
    lv_obj_t *khBar;
    lv_obj_t *khMinLabel;
    lv_obj_t *khMaxLabel;

    // painel direito (detalhes)
    lv_obj_t *detailsPanel;
    lv_obj_t *detTitleLabel;
    lv_obj_t *min24Label;
    lv_obj_t *max24Label;
    lv_obj_t *var24Label;
    lv_obj_t *healthBar;

public:
    UI();

    void init();
    void createLayout();

    void updateKHValue(float kh);

    // usado pelo display_simple_show_summary
    void updateDetails(float kh,
                       float khMin24h,
                       float khMax24h,
                       float khVar24h,
                       float health);

    void setColor(lv_color_t color);
    void showSyncing();
    void showError(const char *message);
};

#endif
