#include "LEDController.h"
#include "driver/gpio.h"

esp_err_t led_init(void)
{
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << PIN_LED_RED) |
                        (1ULL << PIN_LED_GREEN) |
                        (1ULL << PIN_LED_BLUE),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    esp_err_t err = gpio_config(&io_conf);
    if (err != ESP_OK) return err;

    led_off();
    return ESP_OK;
}

void led_set_rgb(uint8_t r, uint8_t g, uint8_t b)
{
    gpio_set_level(PIN_LED_RED,   r ? 1 : 0);
    gpio_set_level(PIN_LED_GREEN, g ? 1 : 0);
    gpio_set_level(PIN_LED_BLUE,  b ? 1 : 0);
}

void led_off(void)
{
    gpio_set_level(PIN_LED_RED,   0);
    gpio_set_level(PIN_LED_GREEN, 0);
    gpio_set_level(PIN_LED_BLUE,  0);
}

void led_status_ok(void)
{
    led_set_rgb(0, 255, 0);
}

void led_status_error(void)
{
    led_set_rgb(255, 0, 0);
}
