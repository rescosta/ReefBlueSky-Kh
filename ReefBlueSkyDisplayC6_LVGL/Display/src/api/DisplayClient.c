// DisplayClient.c
#include "DisplayClient.h"
#include "JWTHandler.h"
#include "storage/NVSStorage.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include <string.h>
#include "esp_crt_bundle.h"
#include "esp_system.h"
#include "esp_netif.h"
#include "esp_mac.h"
#include "cJSON.h"

#define FIXED_SERVER_URL "https://iot.reefbluesky.com.br/api/v1"
#define DISPLAY_PING_URL "https://iot.reefbluesky.com.br/api/display/ping"

static const char *TAG = "DisplayClient";

static char http_body_buf[1024];
static int  http_body_len = 0;

typedef struct {
    char device_id[32];
    char name[64];
} kh_device_info_t;

static kh_device_info_t g_kh_devices[8];
static int g_kh_device_count = 0;

static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    switch (evt->event_id) {
    case HTTP_EVENT_ON_DATA:
        if (!esp_http_client_is_chunked_response(evt->client)) {
            int copy_len = evt->data_len;
            if (http_body_len + copy_len >= (int)sizeof(http_body_buf)) {
                copy_len = sizeof(http_body_buf) - 1 - http_body_len;
            }
            if (copy_len > 0) {
                memcpy(http_body_buf + http_body_len, evt->data, copy_len);
                http_body_len += copy_len;
            }
        }
        break;
    case HTTP_EVENT_ON_FINISH:
        if (http_body_len < (int)sizeof(http_body_buf)) {
            http_body_buf[http_body_len] = '\0';
        } else {
            http_body_buf[sizeof(http_body_buf) - 1] = '\0';
        }
        break;
    default:
        break;
    }
    return ESP_OK;
}

    esp_err_t display_client_ping_lcd(const char *main_device_id)
    {
        if (!main_device_id || !main_device_id[0]) {
            ESP_LOGE(TAG, "display_client_ping_lcd: main_device_id vazio");
            return ESP_ERR_INVALID_ARG;
        }

        const char *token = jwt_handler_get_display_token();
        if (!token || !token[0]) {
            ESP_LOGE(TAG, "display_client_ping_lcd: sem display token");
            return ESP_FAIL;
        }

        ESP_LOGI(TAG, "display token = '%s'", token);

        char url[256];
        snprintf(url, sizeof(url), "%s", DISPLAY_PING_URL);
       


        // corpo JSON
        char body[128];
        snprintf(body, sizeof(body),
                "{\"mainDeviceId\":\"%s\"}", main_device_id);

        esp_http_client_config_t cfg = {
            .url = url,
            .method = HTTP_METHOD_POST,
            .timeout_ms = 5000,
            .crt_bundle_attach = esp_crt_bundle_attach,
            .event_handler = http_event_handler,
        };

        esp_http_client_handle_t client = esp_http_client_init(&cfg);
        if (!client) {
            ESP_LOGE(TAG, "display_client_ping_lcd: falha ao init http client");
            return ESP_FAIL;
        }

        char auth_hdr[512];
        snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", token);
        esp_http_client_set_header(client, "Authorization", auth_hdr);
        esp_http_client_set_header(client, "Content-Type", "application/json");

        http_body_len = 0;
        http_body_buf[0] = '\0';

        esp_http_client_set_post_field(client, body, strlen(body));

        esp_err_t err = esp_http_client_perform(client);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "display_client_ping_lcd: HTTP error %s", esp_err_to_name(err));
            esp_http_client_cleanup(client);
            return err;
        }

        int status = esp_http_client_get_status_code(client);
        ESP_LOGI(TAG, "display_client_ping_lcd: status=%d", status);

        esp_http_client_cleanup(client);
        return (status == 200) ? ESP_OK : ESP_FAIL;
    }


static void generate_device_id(char *out, size_t out_len)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);  // MAC da STA

    // Formato: RBS-LCDXXXXXXXXXXXX (igual ao ESP32)
    snprintf(out, out_len, "RBS-LCD-%02X%02X%02X%02X%02X%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static esp_err_t http_post_json(const char *url, const char *body, char *out, size_t out_len)
{
    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG, "Failed to init HTTP client");
        return ESP_FAIL;
    }

    ESP_ERROR_CHECK(esp_http_client_set_header(client, "Accept-Encoding", "identity"));
    ESP_ERROR_CHECK(esp_http_client_set_header(client, "Content-Type", "application/json"));
    if (body) {
        ESP_ERROR_CHECK(esp_http_client_set_post_field(client, body, strlen(body)));
    }

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP POST failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    int len    = esp_http_client_get_content_length(client);
    ESP_LOGI(TAG, "HTTP %s -> %d, len=%d", url, status, len);


    if (out && out_len > 0) {
        int to_copy = http_body_len;
        if (to_copy >= (int)out_len) {
            to_copy = out_len - 1;
        }
        memcpy(out, http_body_buf, to_copy);
        out[to_copy] = '\0';
        ESP_LOGI(TAG, "HTTP body (%d/%d): '%.120s...'", http_body_len, len, out);
    }


    esp_http_client_cleanup(client);
    return ESP_OK;
}

static esp_err_t display_client_register_display(const char *email,
                                                 const char *pass,
                                                 const char *display_id,
                                                 const char *main_device_id)
{
    char url[256];
    snprintf(url, sizeof(url), "https://iot.reefbluesky.com.br/api/display/register");

    char json[512];
    snprintf(json, sizeof(json),
        "{"
          "\"email\":\"%s\","
          "\"password\":\"%s\","
          "\"displayId\":\"%s\","
          "\"deviceType\":\"display\","
          "\"mainDeviceId\":\"%s\""
        "}",
        email, pass, display_id, main_device_id
    );

    char resp[1024];
    esp_err_t err = http_post_json(url, json, resp, sizeof(resp));
    if (err != ESP_OK) return err;

    ESP_LOGI(TAG, "display register resp: %s", resp);

    // resp tem 2 JSON colados: {...}{"success":true,"displayToken":...}
    char *sep = strstr(resp, "}{");
    const char *json_start = sep ? sep + 1 : resp;

    cJSON *root = cJSON_Parse(json_start);
    if (!root) {
        ESP_LOGE(TAG, "display register: JSON parse error");
        return ESP_FAIL;
    }

    cJSON *success      = cJSON_GetObjectItem(root, "success");
    cJSON *displayToken = cJSON_GetObjectItem(root, "displayToken");
    if (!cJSON_IsBool(success) || !cJSON_IsTrue(success) ||
        !displayToken || !cJSON_IsString(displayToken)) {
        ESP_LOGE(TAG, "display register: JSON sem success/displayToken");
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    jwt_handler_set_display_token(displayToken->valuestring);
    ESP_LOGI(TAG, "display token salvo (%d bytes)", (int)strlen(displayToken->valuestring));

    cJSON_Delete(root);
    return ESP_OK;
}


esp_err_t display_client_login_and_register(void)
{
    char email[128] = {0};
    char pass[128]  = {0};

    if (!nvs_storage_load_auth_credentials(email, sizeof(email),
                                           pass, sizeof(pass))) {
        ESP_LOGE(TAG, "No auth credentials in NVS");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Using credentials %s at %s", email, FIXED_SERVER_URL);

    // 1) LOGIN /auth/login
    http_body_len = 0;
    http_body_buf[0] = '\0';

    char url[256];
    snprintf(url, sizeof(url), "%s/auth/login", FIXED_SERVER_URL);

    char json[512];
    snprintf(json, sizeof(json),
             "{\"email\":\"%s\",\"password\":\"%s\"}", email, pass);

    char resp[1024];
    esp_err_t err = http_post_json(url, json, resp, sizeof(resp));
    if (err != ESP_OK) return err;


    cJSON *root = cJSON_Parse(resp);
    if (!root) return ESP_FAIL;

    cJSON *success = cJSON_GetObjectItem(root, "success");
    cJSON *data    = cJSON_GetObjectItem(root, "data");
    if (!cJSON_IsBool(success) || !cJSON_IsTrue(success) ||
        !data || !cJSON_IsObject(data)) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    cJSON *accessTok = cJSON_GetObjectItem(data, "token");
    if (!accessTok || !cJSON_IsString(accessTok) || !accessTok->valuestring) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    jwt_handler_set_user_token(accessTok->valuestring);
    cJSON_Delete(root);

    // 2) Carregar devices KH para descobrir o mainDeviceId
    err = display_client_load_kh_devices();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "display_client_load_kh_devices falhou");
        return err;
    }

    if (display_client_get_kh_device_count() <= 0) {
        ESP_LOGE(TAG, "Nenhum KH disponível para associar ao display");
        return ESP_FAIL;
    }

    const char *main_device_id = display_client_get_kh_device_id(0);
    ESP_LOGI(TAG, "Usando mainDeviceId = %s", main_device_id);

    // 3) Gerar ID único do display
    char display_id[32];
    generate_device_id(display_id, sizeof(display_id));
    ESP_LOGI(TAG, "Registering display %s", display_id);

    // 4) Registrar display (gera displayToken)
    err = display_client_register_display(email, pass, display_id, main_device_id);
    if (err != ESP_OK) return err;

    return ESP_OK;
}

esp_err_t display_client_load_kh_devices(void)
{
    const char *token = jwt_handler_get_user_token();
    if (!token || !token[0]) {
        ESP_LOGE(TAG, "No JWT token for list devices");
        return ESP_FAIL;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/user/devices?type=KH", FIXED_SERVER_URL);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    char auth_hdr[512];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", token);
    esp_http_client_set_header(client, "Authorization", auth_hdr);

    http_body_len = 0;
    http_body_buf[0] = '\0';


    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "GET devices failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    esp_http_client_cleanup(client);

    char resp[1024];
    int to_copy = http_body_len > (int)sizeof(resp) - 1 ? (int)sizeof(resp) - 1 : http_body_len;
    memcpy(resp, http_body_buf, to_copy);
    resp[to_copy] = '\0';
    ESP_LOGI(TAG, "Devices resp: %s", resp);


    cJSON *root = cJSON_Parse(resp);
    if (!root) {
        ESP_LOGE(TAG, "Devices JSON parse error");
        return ESP_FAIL;
    }

    cJSON *success = cJSON_GetObjectItem(root, "success");
    cJSON *data    = cJSON_GetObjectItem(root, "data");
    if (!cJSON_IsBool(success) || !cJSON_IsTrue(success) || !cJSON_IsArray(data)) {
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    g_kh_device_count = 0;
    int max = sizeof(g_kh_devices) / sizeof(g_kh_devices[0]);

    cJSON *item = NULL;
    cJSON_ArrayForEach(item, data) {
        if (g_kh_device_count >= max) break;
        cJSON *j_id   = cJSON_GetObjectItem(item, "deviceId");
        cJSON *j_name = cJSON_GetObjectItem(item, "name");
        if (!cJSON_IsString(j_id)) continue;

        kh_device_info_t *dst = &g_kh_devices[g_kh_device_count++];
        strncpy(dst->device_id, j_id->valuestring, sizeof(dst->device_id) - 1);
        dst->device_id[sizeof(dst->device_id) - 1] = 0;

        const char *nm = (j_name && cJSON_IsString(j_name)) ? j_name->valuestring : j_id->valuestring;
        strncpy(dst->name, nm, sizeof(dst->name) - 1);
        dst->name[sizeof(dst->name) - 1] = 0;
    }

    cJSON_Delete(root);
    ESP_LOGI(TAG, "Loaded %d KH devices", g_kh_device_count);
    return (g_kh_device_count > 0) ? ESP_OK : ESP_FAIL;
}

esp_err_t display_client_fetch_kh_summary_for(const char *device_id,
                                              kh_summary_t *out)
{
    if (!out || !device_id || !device_id[0]) return ESP_ERR_INVALID_ARG;
    memset(out, 0, sizeof(*out));

    const char *token = jwt_handler_get_user_token();
    if (!token || !token[0]) {
        ESP_LOGE(TAG, "No JWT token available");
        return ESP_FAIL;
    }

    char url[256];
    snprintf(url, sizeof(url),
             "%s/user/devices/%s/display/kh-summary",
             FIXED_SERVER_URL, device_id);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG, "Failed to init HTTP client");
        return ESP_FAIL;
    }

    char auth_hdr[512];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", token);
    esp_http_client_set_header(client, "Authorization", auth_hdr);

    http_body_len = 0;
    http_body_buf[0] = '\0';

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP GET failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    int len    = esp_http_client_get_content_length(client);
    ESP_LOGI(TAG, "KH summary GET %s -> %d, len=%d", url, status, len);

    esp_http_client_cleanup(client);

    char resp[1024];
    int to_copy = http_body_len > (int)sizeof(resp) - 1 ? (int)sizeof(resp) - 1 : http_body_len;
    memcpy(resp, http_body_buf, to_copy);
    resp[to_copy] = '\0';
    ESP_LOGI(TAG, "KH summary resp: %s", resp);

    cJSON *root = cJSON_Parse(resp);
    if (!root) {
        ESP_LOGE(TAG, "JSON parse error");
        return ESP_FAIL;
    }

    cJSON *success = cJSON_GetObjectItem(root, "success");
    cJSON *data    = cJSON_GetObjectItem(root, "data");

    if (!cJSON_IsBool(success) || !cJSON_IsTrue(success) ||
        !data || !cJSON_IsObject(data)) {
        ESP_LOGW(TAG, "KH summary without data");
        out->has_data = false;
        cJSON_Delete(root);
        return ESP_OK;
    }

    cJSON *kh       = cJSON_GetObjectItem(data, "kh");
    cJSON *khMin24h = cJSON_GetObjectItem(data, "khMin24h");
    cJSON *khMax24h = cJSON_GetObjectItem(data, "khMax24h");
    cJSON *khVar24h = cJSON_GetObjectItem(data, "khVar24h");
    cJSON *health   = cJSON_GetObjectItem(data, "health");
    cJSON *hGreen   = cJSON_GetObjectItem(data, "khHealthGreenMaxDev");
    cJSON *hYellow  = cJSON_GetObjectItem(data, "khHealthYellowMaxDev");

    out->kh         = (kh       && cJSON_IsNumber(kh))       ? (float)kh->valuedouble       : 0.0f;
    out->kh_min_24h = (khMin24h && cJSON_IsNumber(khMin24h)) ? (float)khMin24h->valuedouble : out->kh;
    out->kh_max_24h = (khMax24h && cJSON_IsNumber(khMax24h)) ? (float)khMax24h->valuedouble : out->kh;
    out->kh_var_24h = (khVar24h && cJSON_IsNumber(khVar24h)) ? (float)khVar24h->valuedouble : 0.0f;
    out->health     = (health   && cJSON_IsNumber(health))   ? (float)health->valuedouble   : 0.0f;
    out->health_green_max_dev  = (hGreen  && cJSON_IsNumber(hGreen))  ? (float)hGreen->valuedouble  : 0.2f;
    out->health_yellow_max_dev = (hYellow && cJSON_IsNumber(hYellow)) ? (float)hYellow->valuedouble : 0.5f;

    out->ts       = 0;
    out->has_data = true;

    cJSON_Delete(root);
    return ESP_OK;
}


int display_client_get_kh_device_count(void)
{
    return g_kh_device_count;
}

const char *display_client_get_kh_device_id(int index)
{
    if (index < 0 || index >= g_kh_device_count) return NULL;
    return g_kh_devices[index].device_id;
}

const char *display_client_get_kh_device_name(int index)
{
    if (index < 0 || index >= g_kh_device_count) return NULL;
    return g_kh_devices[index].name;
}
