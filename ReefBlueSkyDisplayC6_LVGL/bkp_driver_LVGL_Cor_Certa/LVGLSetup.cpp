// LVGLSetup.cpp

#include "display/LVGLSetup.h"
#include "display/Themes.h"
#include "driver/ledc.h"

extern "C" {
    #include "lvgl.h"
    #include "freertos/FreeRTOS.h"
    #include "freertos/task.h"
    #include "display_driver.h"   // LCD_Init, LCD_addWindow, defines de resolução
    #include "esp_timer.h"
    #include "esp_log.h"
    #include "ui.h"               // UI gerada pelo SquareLine
}

static const char *TAG = "LVGLSetup";

//-------------------- Configuração básica --------------------

// Reaproveita os mesmos defines usados no Arduino (via LVGL_Driver.h)
#define LVGL_WIDTH   (LCD_WIDTH)    // 172 [file:110]
#define LVGL_HEIGHT  (LCD_HEIGHT)   // 320 [file:110]

// Mesmo esquema do Arduino: buffer fracionário com LVGL_BUF_LEN [file:109]
#define LVGL_BUF_LEN (LVGL_WIDTH * LVGL_HEIGHT / 20)

// Período de tick em ms (mesmo EXAMPLE_LVGL_TICK_PERIOD_MS do exemplo) [file:109]
#define LVGL_TICK_PERIOD_MS 5

//-------------------- Buffers e handle de display --------------------

static lv_disp_draw_buf_t s_draw_buf;
static lv_color_t s_buf1[LVGL_BUF_LEN];
static lv_color_t s_buf2[LVGL_BUF_LEN];

static lv_disp_t *s_disp = nullptr;
static esp_timer_handle_t s_lvgl_tick_timer = nullptr;

//-------------------- Funções internas --------------------

// Flush: LVGL -> LCD usando LCD_addWindow
/* static void lvgl_flush_cb(lv_disp_drv_t *disp_drv,
                          const lv_area_t *area,
                          lv_color_t *color_p)
{
    int32_t w = area->x2 - area->x1 + 1;
    int32_t h = area->y2 - area->y1 + 1;
    int32_t px_count = w * h;

    // buffer de 16 bits que o LCD espera
    uint16_t *buf = (uint16_t *)&color_p[0].full;

    // swap simples de canais R e B em RGB565
    for (int i = 0; i < px_count; i++) {
        uint16_t c = buf[i];

        uint16_t r = (c & 0xF800) >> 11; // 5 bits
        uint16_t g = (c & 0x07E0) >> 5;  // 6 bits
        uint16_t b = (c & 0x001F);       // 5 bits

        uint16_t c2 = (b << 11) | (g << 5) | (r);

        buf[i] = c2;
    }

    LCD_addWindow(
        area->x1,
        area->y1,
        area->x2,
        area->y2,
        buf
    );

    lv_disp_flush_ready(disp_drv);
} */

static void lvgl_flush_cb(lv_disp_drv_t *disp_drv,
                          const lv_area_t *area,
                          lv_color_t *color_p)
{
    LCD_addWindow(
        area->x1,
        area->y1,
        area->x2,
        area->y2,
        (uint16_t *)&color_p[0].full
    );
    lv_disp_flush_ready(disp_drv);
}


// Touch dummy (equivalente a Lvgl_Touchpad_Read “// NULL”) [file:109]
static void lvgl_touchpad_read(lv_indev_drv_t *indev_drv,
                               lv_indev_data_t *data)
{
    (void)indev_drv;
    data->state   = LV_INDEV_STATE_REL;
    data->point.x = 0;
    data->point.y = 0;
}

// Timer de tick para LVGL (equivalente a example_increase_lvgl_tick) [file:109]
static void lvgl_tick_cb(void *arg)
{
    (void)arg;
    lv_tick_inc(LVGL_TICK_PERIOD_MS);
}

// (Opcional) Task FreeRTOS para chamar lv_timer_handler se quiser fora do loop principal
extern "C" void lvgl_task(void *pvParameter)
{
    (void)pvParameter;

    while (1) {
        uint32_t delay = lv_timer_handler();
        if (delay < 5) {
            delay = 5; // mínimo pra não travar
        }
        vTaskDelay(pdMS_TO_TICKS(delay));
    }
}

//-------------------- API pública --------------------

void LVGLSetup::init()
{
    ESP_LOGI(TAG, "LVGLSetup::init() start");

    LCD_Init();

    ESP_LOGI(TAG, "LVGLSetup::init() done");

    // 1) Inicializa LVGL (equivalente a Lvgl_Init começo) [file:109]
    ESP_LOGI(TAG, "lv_init()");

    lv_init();

    // 2) Configura display + driver LVGL + tick timer
    setupDisplay();

    // 3) Tema (seu código atual)
    setupTheme();

    // 4) UI do SquareLine (substitui o label “Hello Arduino and LVGL!”) [file:109]
    ui_init();

    ESP_LOGI(TAG, "LVGLSetup::init() done");
}

void LVGLSetup::setupDisplay()
{
    ESP_LOGI(TAG, "LCD_Init() + LVGL driver");

    // 1) Inicializa o LCD físico (SPI + painel + backlight) [file:108][file:110]
    LCD_Init();        // Display_ST7789 / display_driver.cpp
    Backlight_Init();  // Se não estiver dentro de LCD_Init()
    Set_Backlight(10);   // aqui você força 10%

    // 2) Inicializa o buffer de draw do LVGL (mesma lógica do Arduino) [file:109]
    lv_disp_draw_buf_init(&s_draw_buf, s_buf1, s_buf2, LVGL_BUF_LEN);

    // 3) Configura driver de display do LVGL v8.x [file:109]
    static lv_disp_drv_t disp_drv;
    lv_disp_drv_init(&disp_drv);

    disp_drv.hor_res = LVGL_WIDTH;
    disp_drv.ver_res = LVGL_HEIGHT;
    disp_drv.flush_cb = lvgl_flush_cb;
    disp_drv.draw_buf = &s_draw_buf;
    disp_drv.full_refresh = 1;   // Igual ao exemplo Arduino: sempre redesenha [file:109]

    s_disp = lv_disp_drv_register(&disp_drv);

    // 4) Input device dummy (pointer) igual ao exemplo Arduino [file:109]
    static lv_indev_drv_t indev_drv;
    lv_indev_drv_init(&indev_drv);
    indev_drv.type = LV_INDEV_TYPE_POINTER;
    indev_drv.read_cb = lvgl_touchpad_read;
    lv_indev_drv_register(&indev_drv);

    // 5) Timer de tick LVGL periódico (equivalente ao esp_timer do Arduino) [file:109]
    esp_timer_create_args_t lvgl_tick_timer_args = {};
    lvgl_tick_timer_args.callback = &lvgl_tick_cb;
    lvgl_tick_timer_args.arg = nullptr;
    lvgl_tick_timer_args.dispatch_method = ESP_TIMER_TASK;
    lvgl_tick_timer_args.name = "lvgl_tick";

    esp_err_t err = esp_timer_create(&lvgl_tick_timer_args, &s_lvgl_tick_timer);
    if (err == ESP_OK) {
        esp_timer_start_periodic(s_lvgl_tick_timer, LVGL_TICK_PERIOD_MS * 1000);
        ESP_LOGI(TAG, "LVGL tick timer started (%d ms)", LVGL_TICK_PERIOD_MS);
    } else {
        ESP_LOGE(TAG, "Failed to create LVGL tick timer: %s", esp_err_to_name(err));
    }

    // 6) (Opcional) se quiser uma task dedicada ao lv_timer_handler em vez de chamar no loop principal:
    
    TaskHandle_t lvglTaskHandle = nullptr;
    xTaskCreate(
        lvgl_task,
        "lvgl_task",
        4096,
        nullptr,
        5,
        &lvglTaskHandle
    );
    
}

void LVGLSetup::setupInput()
{
    // Sem touch/botões por enquanto
}

void LVGLSetup::setupTheme()
{
    // Mantém seu sistema de temas atual [file:108]
    //Theme::init();
    //Theme::applyDarkMode();
}

lv_disp_t *LVGLSetup::getDisplay()
{
    return s_disp;
}
