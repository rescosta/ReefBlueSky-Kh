#pragma once

#include "api/DisplayClient.h" // kh_summary_t

#ifdef __cplusplus
extern "C" {
#endif

// Inicializa LVGL + display + UI do SquareLine
void display_simple_init(void);

// Mostra o resumo de KH na tela
void display_simple_show_summary(const kh_summary_t *summary,
                                 const char *device_name);

// Mostra usando valores em cache (boot offline)
void display_simple_show_cached_summary(float kh, float health,
                                        const char *name);

void display_simple_set_loading(bool on, const char *label);

#ifdef __cplusplus
}
#endif
