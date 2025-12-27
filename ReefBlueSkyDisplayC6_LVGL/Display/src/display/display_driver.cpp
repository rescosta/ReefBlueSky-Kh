// display_driver.cpp


#define ESP_LCD_IO_I2C_BUS 0
#include "display_driver.h"

extern "C" {
    #include "driver/spi_master.h"
    #include "driver/gpio.h"
    #include "driver/ledc.h"
    #include "esp_lcd_panel_ops.h"
    #include "esp_lcd_panel_vendor.h"
    #include "esp_lcd_io_spi.h"
    #include "esp_log.h"
    #include "freertos/FreeRTOS.h"
    #include "freertos/task.h"
}

extern "C" {
    esp_err_t esp_lcd_panel_io_tx_param(esp_lcd_panel_io_handle_t io,
                                        int lcd_cmd,
                                        const void *param,
                                        size_t param_size);
}


static const char *TAG = "Display_ST7789";


//------------------------------------------------------
// Configuração de hardware (equivalente ao Arduino)
//------------------------------------------------------

#define LCD_HOST      SPI2_HOST
#define LCD_H_RES     LCD_WIDTH    // 172 [file:110]
#define LCD_V_RES     LCD_HEIGHT   // 320 [file:110]

#define PIN_LCD_SCLK  EXAMPLE_PIN_NUM_SCLK
#define PIN_LCD_MOSI  EXAMPLE_PIN_NUM_MOSI
#define PIN_LCD_CS    EXAMPLE_PIN_NUM_LCD_CS
#define PIN_LCD_DC    EXAMPLE_PIN_NUM_LCD_DC
#define PIN_LCD_RST   EXAMPLE_PIN_NUM_LCD_RST
#define PIN_LCD_BK    EXAMPLE_PIN_NUM_BK_LIGHT

/* #define LCD_LEDC_TIMER   LEDC_TIMER_0
#define LCD_LEDC_MODE    LEDC_LOW_SPEED_MODE
#define LCD_LEDC_CHANNEL LEDC_CHANNEL_0
*/

#ifndef Frequency
#define Frequency 5000
#endif

//------------------------------------------------------
// Handles globais
//------------------------------------------------------

static esp_lcd_panel_io_handle_t s_io_handle = nullptr;
static esp_lcd_panel_handle_t    s_panel_handle = nullptr;

//------------------------------------------------------
// TESTE: preencher tela com cor sólida (debug opcional)
//------------------------------------------------------

/*static void lcd_test_solid_color(uint16_t color)
{
    if (!s_panel_handle) return;

    static uint16_t line_buf[LCD_H_RES];
    for (int x = 0; x < LCD_H_RES; x++) {
        line_buf[x] = color;
    }

    for (int y = 0; y < LCD_V_RES; y++) {
        esp_lcd_panel_draw_bitmap(
            s_panel_handle,
            0, y,
            LCD_H_RES, y + 1,
            line_buf
        );
    }
}
*/

//------------------------------------------------------
// Backlight (implementação ESP-IDF, interface igual .h)
//------------------------------------------------------

void Backlight_Init(void)
{
    ledc_timer_config_t timer_conf = {
        .speed_mode       = LCD_LEDC_MODE,
        .duty_resolution  = LCD_LEDC_DUTY_RES,
        .timer_num        = LCD_LEDC_TIMER,
        .freq_hz          = 1000,
        .clk_cfg          = LEDC_AUTO_CLK,
    };
    ledc_timer_config(&timer_conf);

    ledc_channel_config_t ch_conf = {
        .gpio_num   = EXAMPLE_PIN_NUM_BK_LIGHT,
        .speed_mode = LCD_LEDC_MODE,
        .channel    = LCD_LEDC_CHANNEL,
        .timer_sel  = LCD_LEDC_TIMER,
        .duty       = 0,
        .hpoint     = 0,
    };
    ledc_channel_config(&ch_conf);
}

void Set_Backlight(uint8_t Light)
{
    if (Light > 100) Light = 100;
    uint32_t duty = (LCD_LEDC_MAX_DUTY * Light) / 100;
    ledc_set_duty(LCD_LEDC_MODE, LCD_LEDC_CHANNEL, duty);
    ledc_update_duty(LCD_LEDC_MODE, LCD_LEDC_CHANNEL);
}


//------------------------------------------------------
// Inicialização do LCD (equivalente a LCD_Init Arduino)
// Agora: SPI + esp_lcd_new_panel_st7789
//------------------------------------------------------

void LCD_Init(void)
{
    esp_err_t err;

    // GPIO reset
    gpio_config_t io_conf = {};
    io_conf.mode         = GPIO_MODE_OUTPUT;
    io_conf.pin_bit_mask = (1ULL << PIN_LCD_RST);
    gpio_config(&io_conf);

    // Backlight primeiro (mesma interface do .h) [file:110]
    Backlight_Init();

    // 1) Bus SPI
    spi_bus_config_t buscfg = {
        .mosi_io_num           = PIN_LCD_MOSI,
        .miso_io_num           = -1,
        .sclk_io_num           = PIN_LCD_SCLK,
        .quadwp_io_num         = -1,
        .quadhd_io_num         = -1,
        .data4_io_num          = -1,
        .data5_io_num          = -1,
        .data6_io_num          = -1,
        .data7_io_num          = -1,
        .data_io_default_level = false,
        .max_transfer_sz       = LCD_H_RES * LCD_V_RES * sizeof(uint16_t),
        .flags                 = 0,
        .isr_cpu_id            = ESP_INTR_CPU_AFFINITY_AUTO,
        .intr_flags            = 0,
    };
    err = spi_bus_initialize(LCD_HOST, &buscfg, SPI_DMA_CH_AUTO);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "spi_bus_initialize failed: %d", err);
        return;
    }

    // 2) IO SPI para painel
    esp_lcd_panel_io_spi_config_t io_config = {
        .cs_gpio_num        = PIN_LCD_CS,
        .dc_gpio_num        = PIN_LCD_DC,
        .spi_mode           = 0,
        .pclk_hz            = 10 * 1000 * 1000,
        .trans_queue_depth  = 10,
        .on_color_trans_done = nullptr,
        .user_ctx           = nullptr,
        .lcd_cmd_bits       = 8,
        .lcd_param_bits     = 8,
        .cs_ena_pretrans    = 0,
        .cs_ena_posttrans   = 0,
        .flags              = {
            .dc_high_on_cmd  = 0,
            .dc_low_on_data  = 0,
            .dc_low_on_param = 0,
            .octal_mode      = 0,
            .quad_mode       = 0,
            .sio_mode        = 0,
            .lsb_first       = 0,
            .cs_high_active  = 0,
        },
    };
    err = esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)LCD_HOST,
                                   &io_config,
                                   &s_io_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_lcd_new_panel_io_spi failed: %d", err);
        return;
    }

    // 3) Painel ST7789V3 (Waveshare 1.47")
    esp_lcd_panel_dev_config_t panel_cfg = {};
    panel_cfg.reset_gpio_num = PIN_LCD_RST;
    #if ESP_IDF_VERSION < ESP_IDF_VERSION_VAL(5, 0, 0)
        panel_cfg.color_space    = ESP_LCD_COLOR_SPACE_RGB;
    #else
        panel_cfg.rgb_endian   = LCD_RGB_ENDIAN_RGB; //Teste 01
        //panel_cfg.rgb_endian = LCD_RGB_ENDIAN_BGR; //Teste 02

    #endif
    panel_cfg.bits_per_pixel = 16;
    panel_cfg.vendor_config  = nullptr;

    err = esp_lcd_new_panel_st7789(s_io_handle, &panel_cfg, &s_panel_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_lcd_new_panel_st7789 failed: %d", err);
        return;
    }

    // 4) Reset + init (equivalente a LCD_Reset + sequência) [file:114]
    gpio_set_level((gpio_num_t)PIN_LCD_RST, 0);
    vTaskDelay(pdMS_TO_TICKS(50));
    gpio_set_level((gpio_num_t)PIN_LCD_RST, 1);
    vTaskDelay(pdMS_TO_TICKS(50));

    err = esp_lcd_panel_reset(s_panel_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_lcd_panel_reset failed: %d", err);
        return;
    }

    err = esp_lcd_panel_init(s_panel_handle);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_lcd_panel_init failed: %d", err);
        return;
    }


    // Replicar init de cores do Arduino

    // 0x36 (MADCTL) -> mesmo valor do Arduino
    uint8_t madctl = HORIZONTAL ? 0x00 : 0x70;
    esp_lcd_panel_io_tx_param(s_io_handle, 0x36, &madctl, 1);

    // 0x3A (COLMOD) = 0x05 (16-bit RGB565)
    uint8_t colmod = 0x05;
    esp_lcd_panel_io_tx_param(s_io_handle, 0x3A, &colmod, 1);

    // 0xB0
    uint8_t b0[] = {0x00, 0xE8};
    esp_lcd_panel_io_tx_param(s_io_handle, 0xB0, b0, sizeof(b0));

    // 0xB2
    uint8_t b2[] = {0x0C, 0x0C, 0x00, 0x33, 0x33};
    esp_lcd_panel_io_tx_param(s_io_handle, 0xB2, b2, sizeof(b2));

    // 0xB7
    uint8_t b7 = 0x35;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xB7, &b7, 1);

    // 0xBB
    uint8_t bb = 0x35;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xBB, &bb, 1);

    // 0xC0
    uint8_t c0 = 0x2C;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xC0, &c0, 1);

    // 0xC2
    uint8_t c2 = 0x01;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xC2, &c2, 1);

    // 0xC3
    uint8_t c3 = 0x13;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xC3, &c3, 1);

    // 0xC4
    uint8_t c4 = 0x20;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xC4, &c4, 1);

    // 0xC6
    uint8_t c6 = 0x0F;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xC6, &c6, 1);

    // 0xD0
    uint8_t d0[] = {0xA4, 0xA1};
    esp_lcd_panel_io_tx_param(s_io_handle, 0xD0, d0, sizeof(d0));

    // 0xD6
    uint8_t d6 = 0xA1;
    esp_lcd_panel_io_tx_param(s_io_handle, 0xD6, &d6, 1);

    // 0xE0 (gamma +)
    uint8_t e0[] = {
        0xF0, 0x00, 0x04, 0x04, 0x04, 0x05, 0x29, 0x33,
        0x3E, 0x38, 0x12, 0x12, 0x28, 0x30
    };
    esp_lcd_panel_io_tx_param(s_io_handle, 0xE0, e0, sizeof(e0));

    // 0xE1 (gamma -)
    uint8_t e1[] = {
        0xF0, 0x07, 0x0A, 0x0D, 0x0B, 0x07, 0x28, 0x33,
        0x3E, 0x36, 0x14, 0x14, 0x29, 0x32
    };
    esp_lcd_panel_io_tx_param(s_io_handle, 0xE1, e1, sizeof(e1));

    // 0x21 (INVON)
    esp_lcd_panel_io_tx_param(s_io_handle, 0x21, NULL, 0);


    // Offset físico do ST7789 (equivalente ao setOffset do Mason)
    ESP_ERROR_CHECK(esp_lcd_panel_set_gap(s_panel_handle, Offset_X, Offset_Y));  // 34, 0

    // Landscape 90°
    ESP_ERROR_CHECK(esp_lcd_panel_swap_xy(s_panel_handle, true));
    ESP_ERROR_CHECK(esp_lcd_panel_mirror(s_panel_handle, false, true));

    // 6) Liga o display
    err = esp_lcd_panel_disp_on_off(s_panel_handle, true);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_lcd_panel_disp_on_off failed: %d", err);
        return;
    }

    // DEBUG: testar desenho direto, sem LVGL
   /* lcd_test_solid_color(0x0000);
    vTaskDelay(pdMS_TO_TICKS(1000));
    lcd_test_solid_color(0xFFFF);
    vTaskDelay(pdMS_TO_TICKS(1000));
    lcd_test_solid_color(0xF800);
    vTaskDelay(pdMS_TO_TICKS(1000));
    */ 

    ESP_LOGI(TAG, "LCD_Init done");


}

//------------------------------------------------------
// Draw em área: equivalente a LCD_addWindow Arduino
//------------------------------------------------------

void LCD_addWindow(uint16_t Xstart, uint16_t Ystart,
                   uint16_t Xend,   uint16_t Yend,
                   uint16_t *color)
{
    if (!s_panel_handle || !color) return;

    int x1 = Xstart;
    int y1 = Ystart;
    int x2 = Xend + 1;
    int y2 = Yend + 1;

    esp_lcd_panel_draw_bitmap(
        s_panel_handle,
        x1, y1,
        x2, y2,
        color
    );
}
