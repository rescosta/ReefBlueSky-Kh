//main.c
#include "esp_sntp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "wifi/WiFiManager.h"
#include "storage/NVSStorage.h"
#include "led/LEDController.h"
#include "wifi/AccessPoint.h"
#include "api/SetupServer.h"
#include "driver/gpio.h"
#include "captdns.h"
#include "api/DisplayClient.h"
#include "display_driver.h" 
#include "lvgl.h"
#include "display_simple.h"

#include "nvs_flash.h"
#include "nvs.h"

#define EXAMPLE_PIN_NUM_BK_LIGHT       22

#define NVS_NAMESPACE "reefbluesky"
bool g_wifi_status = false;

typedef struct {
    float kh;
    float health; 
    bool  has_data;
} cached_summary_t;

static cached_summary_t g_cached_summary;


static const char *TAG = "MAIN";

static void start_setup_mode(void);

void save_cached_summary_to_nvs(const cached_summary_t *c);
void load_cached_summary_from_nvs(cached_summary_t *c);


#define RESET_BTN_GPIO 9 // botão BOOT da placa (GPIO9)

static void time_sync_notification_cb(struct timeval *tv)
{
    ESP_LOGI("TIME", "Time synchronized");
}

void time_init(void)
{
    esp_sntp_setoperatingmode(SNTP_OPMODE_POLL);
    esp_sntp_setservername(0, "time.google.com");
    esp_sntp_set_time_sync_notification_cb(time_sync_notification_cb);
    esp_sntp_init();

    setenv("TZ", "BRT3", 1);
    tzset();
}


// futuro: #include "api/AuthClient.h"

static void login_task(void *arg)
{
    while (1) {
        // Tenta conectar em qualquer rede salva (multi‑WiFi)
        if (wifi_manager_connect_auto() != ESP_OK) {
            ESP_LOGW(TAG, "Nenhuma rede conectou, entrando em modo setup");
            start_setup_mode();                 // AP + DNS + HTTP (captive)
            vTaskDelay(pdMS_TO_TICKS(30000));   // espera 30s e tenta de novo
            continue;
        }

        ESP_LOGI(TAG, "WiFi conectado, seguindo fluxo normal");
        wifi_manager_stop_ap();   // desliga AP de setup, se estiver ligado

        // NTP
        time_init();

        // Login + registro do display
        if (display_client_login_and_register() == ESP_OK) {
            ESP_LOGI(TAG, "Display login/register OK");
            display_client_load_kh_devices();
            g_wifi_status = true;
        } else {
            ESP_LOGW(TAG, "Login falhou, voltando para setup");
            g_wifi_status = false;
            start_setup_mode();                 // volta para captive
            vTaskDelay(pdMS_TO_TICKS(30000));
            continue;
        }

        // ONLINE: fica aqui enquanto WiFi estiver ok
        while (wifi_manager_is_connected()) {
            vTaskDelay(pdMS_TO_TICKS(10000));
        }

        g_wifi_status = false;
        // Saiu do while -> perdeu Wi‑Fi, volta para o loop e tenta de novo
    }
}

static void start_setup_mode(void)
{
    ap_start(NULL, NULL);      // sobe o soft-AP 192.168.4.1
    // captdnsInit();          // deixa comentado por enquanto
    setup_server_start();      // HTTP server com SETUP_HTML e /api/*
}


static void reset_button_task(void *arg)
{
    gpio_config_t io_conf = {
        .pin_bit_mask = 1ULL << RESET_BTN_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);

    const TickType_t check_interval = pdMS_TO_TICKS(50);
    const TickType_t hold_ticks     = pdMS_TO_TICKS(5000); // 5s

    TickType_t pressed_time = 0;

    while (1) {
        int level = gpio_get_level(RESET_BTN_GPIO); // 0 = pressionado (pull-up)
        ESP_LOGD(TAG, "BTN level=%d", level);

        if (level == 0) {
            pressed_time += check_interval;
            if (pressed_time >= hold_ticks) {
                ESP_LOGW(TAG, "Reset button held 5s, clearing WiFi NVS and rebooting");
                nvs_storage_clear_wifi();
                vTaskDelay(pdMS_TO_TICKS(500));
                esp_restart();
            }
        } else {
            pressed_time = 0; // soltou
        }

        vTaskDelay(check_interval);
    }
}

static void summary_task(void *arg)
{
    vTaskDelay(pdMS_TO_TICKS(5000)); // espera 5s antes do primeiro ciclo

    display_simple_set_loading(true, "Sincronizando...");

    static uint32_t last_ping_ms = 0;

    // Loop principal (por enquanto só LED + resumo KH)
    while (1) {
        led_off();
        vTaskDelay(pdMS_TO_TICKS(19000));

        led_set_rgb(255, 255, 255);
        vTaskDelay(pdMS_TO_TICKS(1000));
        led_off();

        int count = display_client_get_kh_device_count();
        if (count > 0) {
            static int idx = 0;

            const char *kh_id   = display_client_get_kh_device_id(idx);
            const char *kh_name = display_client_get_kh_device_name(idx);

            kh_summary_t summary;
            if (kh_id &&
                display_client_fetch_kh_summary_for(kh_id, &summary) == ESP_OK &&
                summary.has_data) {
                
                // Atualiza a UI (SquareLine) via wrapper
                display_simple_show_summary(&summary, kh_name);

                // Atualiza cache simples para uso offline
                g_cached_summary.kh       = summary.kh;
                g_cached_summary.health   = summary.health;
                g_cached_summary.has_data = true;
                save_cached_summary_to_nvs(&g_cached_summary);

                // LED de saúde
                float h = summary.health;
                if (h < 0.0f) h = 0.0f;
                if (h > 1.0f) h = 1.0f;

                if (h >= 0.8f) {
                    led_set_rgb(0, 255, 0);     // verde
                } else if (h >= 0.5f) {
                    led_set_rgb(255, 255, 0);   // amarelo
                } else {
                    led_set_rgb(255, 0, 0);     // vermelho
                }

                ESP_LOGI(TAG, "Device %s (%s): KH=%.2f health=%.2f",
                        kh_name, kh_id, summary.kh, summary.health);

                // Spinner OFF após atualizar
                display_simple_set_loading(false, NULL);
            }

            // Ping do LCD para este KH (idx atual) a cada 30s
            uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
            if (kh_id && (now - last_ping_ms > 30000)) { // 30 s
                if (display_client_ping_lcd(kh_id) == ESP_OK) {
                    last_ping_ms = now;
                    ESP_LOGI(TAG, "Ping LCD OK para %s", kh_id);
                } else {
                    ESP_LOGW(TAG, "Ping LCD falhou para %s", kh_id);
                }
            }

            idx = (idx + 1) % count;
        }

    }
}

void save_cached_summary_to_nvs(const cached_summary_t *c) {
    nvs_handle_t handle;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) return;

    nvs_set_blob(handle, "summary", c, sizeof(cached_summary_t));
    nvs_commit(handle);
    nvs_close(handle);
}

void load_cached_summary_from_nvs(cached_summary_t *c) {
    size_t size = sizeof(cached_summary_t);
    nvs_handle_t handle;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        memset(c, 0, sizeof(*c));
        return;
    }

    if (nvs_get_blob(handle, "summary", c, &size) != ESP_OK) {
        memset(c, 0, sizeof(*c));
    }

    nvs_close(handle);
}



void app_main(void)
{

        // em app_main(), logo no início, antes de tudo
    gpio_config_t io_conf = {
        .pin_bit_mask = 1ULL << EXAMPLE_PIN_NUM_BK_LIGHT,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);
    gpio_set_level((gpio_num_t)EXAMPLE_PIN_NUM_BK_LIGHT, 0);


    ESP_LOGI(TAG, "ReefBlueSky Display C6 - boot");

    // NVS + LED
    ESP_ERROR_CHECK(nvs_storage_init());
    ESP_ERROR_CHECK(led_init());

    // Teste LED
    ESP_LOGI(TAG, "Testando LED RGB");
    led_set_rgb(255, 0, 0);
    vTaskDelay(pdMS_TO_TICKS(1000));
    led_set_rgb(0, 255, 0);
    vTaskDelay(pdMS_TO_TICKS(1000));
    led_set_rgb(0, 0, 255);
    vTaskDelay(pdMS_TO_TICKS(1000));
    led_off();

    // Carrega último resumo salvo (se existir)
    load_cached_summary_from_nvs(&g_cached_summary);

    // Inicializa display + LVGL + UI (SquareLine) via wrapper
    display_simple_init();

    // Se tiver cache válido, mostra algo imediatamente na tela
    /*if (g_cached_summary.has_data) {
        // Aqui você escolhe um nome default ou o último nome conhecido
        display_simple_show_cached_summary(g_cached_summary.kh,
                                           g_cached_summary.health,
                                           "Último KH");
    }*/

    // WiFi stack
    ESP_ERROR_CHECK(wifi_manager_init());

    // Task de conexão/login em background (não trava UI)
    xTaskCreate(login_task, "login", 8192, NULL, 5, NULL);

    // Task do botão de factory reset
    xTaskCreate(reset_button_task, "reset_button", 2048, NULL, 5, NULL);

    // Task de resumo / rotação dos devices
    xTaskCreate(summary_task, "summary", 8192, NULL, 5, NULL);

}

