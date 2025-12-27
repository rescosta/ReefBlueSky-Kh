#ifndef LV_CONF_H
#define LV_CONF_H

#include <stdint.h>

/* Dizer ao LVGL para procurar headers de forma simples */
#define LV_CONF_INCLUDE_SIMPLE 1

/* Profundidade de cor */
#define LV_COLOR_DEPTH 16

/* SquareLine exige SWAP = 0 */
#define LV_COLOR_16_SWAP 1

/* Opcional: desativa logs do LVGL */
#define LV_USE_LOG 0

#endif /* LV_CONF_H */
