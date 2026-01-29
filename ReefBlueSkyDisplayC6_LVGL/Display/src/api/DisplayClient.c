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

#include "ota/LcdOta.h"
#include "FwVersion.h"


#define FIXED_SERVER_URL "https://iot.reefbluesky.com.br/api/v1"
#define DISPLAY_PING_URL "https://iot.reefbluesky.com.br/api/display/ping"

static const char *TAG = "DisplayClient";

static char http_body_buf[4096];
static int  http_body_len = 0;

typedef struct {
    char device_id[32];
    char name[64];
} kh_device_info_t;

static kh_device_info_t g_kh_devices[8];
static int g_kh_device_count = 0;

static char g_user_timezone[64] = "UTC";

static char g_main_device_id[32] = {0};


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

static void display_client_report_firmware(void)
{
    const char *deviceToken = jwt_handler_get_device_token();
    if (!deviceToken || !deviceToken[0]) {
        ESP_LOGW(TAG, "report_firmware: sem deviceToken");
        return;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/device/firmware", FIXED_SERVER_URL);

    char body[256];
    snprintf(body, sizeof(body),
             "{\"firmwareVersion\":\"%s\"}",
             FW_VERSION);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG, "report_firmware: falha ao init http client");
        return;
    }

    char auth_hdr[512];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", deviceToken);
    esp_http_client_set_header(client, "Authorization", auth_hdr);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Accept-Encoding", "identity");

    http_body_len = 0;
    http_body_buf[0] = '\0';

    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "report_firmware: HTTP error %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return;
    }

    int status = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG, "report_firmware: status=%d", status);

    esp_http_client_cleanup(client);
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

/*
esp_err_t display_client_check_for_ota_command(void)
{
    const char *displayToken = jwt_handler_get_display_token();
    if (!displayToken || !displayToken[0]) {
        ESP_LOGW(TAG, "check_for_ota_command: sem displayToken");
        return ESP_FAIL;
    }

    // Endpoint específico para comandos do display (ajusta depois no backend)
    char url[256];
    snprintf(url, sizeof(url), "https://iot.reefbluesky.com.br/api/display/commands");

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG, "check_for_ota_command: falha ao init http client");
        return ESP_FAIL;
    }

    char auth_hdr[512];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", displayToken);
    esp_http_client_set_header(client, "Authorization", auth_hdr);
    esp_http_client_set_header(client, "Accept-Encoding", "identity");

    http_body_len = 0;
    http_body_buf[0] = '\0';

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "check_for_ota_command: HTTP error %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    int len    = esp_http_client_get_content_length(client);
    ESP_LOGI(TAG, "check_for_ota_command: HTTP %d, len=%d", status, len);

    esp_http_client_cleanup(client);

    if (status != 200) {
        return ESP_OK; // sem comando relevante
    }

    // Copia body recebido
    char resp[512];
    int to_copy = http_body_len > (int)sizeof(resp) - 1 ? (int)sizeof(resp) - 1 : http_body_len;
    memcpy(resp, http_body_buf, to_copy);
    resp[to_copy] = '\0';
    ESP_LOGI(TAG, "check_for_ota_command resp: %s", resp);

    // Espera algo tipo: { "action": "none" } ou { "action": "otaupdate" }
    cJSON *root = cJSON_Parse(resp);
    if (!root) {
        ESP_LOGW(TAG, "check_for_ota_command: JSON parse error");
        return ESP_OK;
    }

    cJSON *action = cJSON_GetObjectItem(root, "action");
    if (!cJSON_IsString(action) || !action->valuestring) {
        cJSON_Delete(root);
        return ESP_OK;
    }

    if (strcmp(action->valuestring, "otaupdate") == 0) {
        ESP_LOGI(TAG, "Comando OTA recebido -> lcd_ota_update()");
        cJSON_Delete(root);
        // BLOQUEANTE + reboot. Ideal rodar em uma task própria se necessário.
        lcd_ota_update();
        return ESP_OK; // nunca deve chegar aqui porque vai rebootar
    }

    cJSON_Delete(root);
    return ESP_OK;
}
*/

esp_err_t display_client_complete_command(int commandId,
                                          const char *status,
                                          const char *errorMessage)
{
    const char *deviceToken = jwt_handler_get_device_token();
    if (!deviceToken || !deviceToken[0]) {
        ESP_LOGW(TAG, "complete_command: sem deviceToken");
        return ESP_FAIL;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/device/commands/complete", FIXED_SERVER_URL);

    char body[256];
    snprintf(body, sizeof(body),
             "{\"commandId\":%d,\"status\":\"%s\",\"errorMessage\":%s}",
             commandId,
             status,
             (errorMessage && errorMessage[0])
               ? "\""  // abre aspas
               : "null");

    // se tiver erro, concatena a mensagem
    if (errorMessage && errorMessage[0]) {
        size_t len = strlen(body);
        snprintf(body + len, sizeof(body) - len, "%s\"}", errorMessage);
    }

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 5000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) return ESP_FAIL;

    char auth_hdr[512];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", deviceToken);
    esp_http_client_set_header(client, "Authorization", auth_hdr);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Accept-Encoding", "identity");

    http_body_len = 0;
    http_body_buf[0] = '\0';
    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "complete_command: HTTP error %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int statusCode = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG, "complete_command: status=%d", statusCode);
    esp_http_client_cleanup(client);
    return ESP_OK;
}

esp_err_t display_client_poll_commands(void)
{
    const char *deviceToken = jwt_handler_get_device_token();
    if (!deviceToken || !deviceToken[0]) {
        ESP_LOGW(TAG, "poll_commands: sem deviceToken");
        return ESP_FAIL;
    }

    char url[256];
    snprintf(url, sizeof(url), "%s/device/commands/poll", FIXED_SERVER_URL);

    esp_http_client_config_t cfg = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG, "poll_commands: falha ao init http client");
        return ESP_FAIL;
    }

    char auth_hdr[512];
    snprintf(auth_hdr, sizeof(auth_hdr), "Bearer %s", deviceToken);
    esp_http_client_set_header(client, "Authorization", auth_hdr);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Accept-Encoding", "identity");

    http_body_len = 0;
    http_body_buf[0] = '\0';

    // POST sem body
    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "poll_commands: HTTP error %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG, "poll_commands: status=%d", status);

    esp_http_client_cleanup(client);

    if (status != 200) {
        return ESP_OK; // sem comando
    }

    char resp[512];
    int to_copy = http_body_len > (int)sizeof(resp) - 1 ? (int)sizeof(resp) - 1 : http_body_len;
    memcpy(resp, http_body_buf, to_copy);
    resp[to_copy] = '\0';
    ESP_LOGI(TAG, "poll_commands resp: %s", resp);

    cJSON *root = cJSON_Parse(resp);
    if (!root) {
        ESP_LOGW(TAG, "poll_commands: JSON parse error");
        return ESP_OK;
    }

    cJSON *success = cJSON_GetObjectItem(root, "success");
    cJSON *data    = cJSON_GetObjectItem(root, "data");
    if (!cJSON_IsBool(success) || !cJSON_IsTrue(success) || !cJSON_IsArray(data)) {
        cJSON_Delete(root);
        return ESP_OK;
    }

    cJSON *cmd = cJSON_GetArrayItem(data, 0); // backend já dá LIMIT 1
    if (!cmd) {
        cJSON_Delete(root);
        return ESP_OK;
    }

    cJSON *j_id      = cJSON_GetObjectItem(cmd, "id");
    cJSON *j_type    = cJSON_GetObjectItem(cmd, "type");
    cJSON *j_payload = cJSON_GetObjectItem(cmd, "payload");

    if (!cJSON_IsNumber(j_id)) {
        cJSON_Delete(root);
        return ESP_OK;
    }

    int commandId = j_id->valueint;
    const char *action = NULL;

    // Se algum dia vier payload.action, usa:
    if (j_payload && cJSON_IsObject(j_payload)) {
        cJSON *j_action = cJSON_GetObjectItem(j_payload, "action");
        if (cJSON_IsString(j_action) && j_action->valuestring) {
            action = j_action->valuestring;
        }
    }

    // Formato atual: usa type como action quando payload é null
    if (!action && j_type && cJSON_IsString(j_type) && j_type->valuestring) {
        action = j_type->valuestring;
    }

    if (action) {
        ESP_LOGI(TAG, "poll_commands: action=%s, cmdId=%d", action, commandId);

        if (strcmp(action, "otaupdate") == 0) {
            bool ok = true;
            if (lcd_ota_update() != ESP_OK) {
                ok = false;
            }
            display_client_complete_command(
                commandId,
                ok ? "done" : "error",
                ok ? NULL : "OTA failed"
            );
        }
    }


    cJSON_Delete(root);
    return ESP_OK;
}


void display_client_set_timezone(const char *tz)
{
    if (!tz || !tz[0]) {
        strncpy(g_user_timezone, "UTC", sizeof(g_user_timezone) - 1);
        g_user_timezone[sizeof(g_user_timezone) - 1] = 0;
        return;
    }

    strncpy(g_user_timezone, tz, sizeof(g_user_timezone) - 1);
    g_user_timezone[sizeof(g_user_timezone) - 1] = 0;

    // opcional: gravar em NVS se tiver helper
    // nvs_storage_save_string("tz", g_user_timezone);
}

const char *display_client_get_timezone(void)
{
    return g_user_timezone;
}

void display_client_set_main_device_id(const char *id)
{
    if (!id) {
        g_main_device_id[0] = '\0';
        return;
    }
    strncpy(g_main_device_id, id, sizeof(g_main_device_id) - 1);
    g_main_device_id[sizeof(g_main_device_id) - 1] = '\0';
}

const char *display_client_get_main_device_id(void)
{
    return g_main_device_id;
}


static esp_err_t display_client_register_display(const char *email,
                                                 const char *pass,
                                                 const char *display_id,
                                                 const char *main_device_id)
{
    char url[256];
    snprintf(url, sizeof(url), "https://iot.reefbluesky.com.br/api/display/register");

    char json[384];
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

    // Extrair somente o JSON que contém displayToken
 

    char *second = strstr(resp, "{\"success\":true,\"displayToken\"");
    if (!second) {
        ESP_LOGE(TAG, "display register: não achou JSON com displayToken");
        return ESP_FAIL;
    }

    char *end = strrchr(second, '}');   // último } a partir do segundo
    if (!end) {
        ESP_LOGE(TAG, "display register: não achou '}' final");
        return ESP_FAIL;
    }
    end[1] = '\0'; // fecha a string exatamente no fim do JSON

    ESP_LOGI(TAG, "display register clean JSON: %s", second);

    cJSON *root = cJSON_Parse(second);
    if (!root) {
        ESP_LOGE(TAG, "display register: JSON parse error (clean)");
        return ESP_FAIL;
    }




    cJSON *success = cJSON_GetObjectItem(root, "success");
    if (!cJSON_IsBool(success) || !cJSON_IsTrue(success)) {
        ESP_LOGE(TAG, "display register: success != true");
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    // formato atual: campos na raiz
    cJSON *displayToken = cJSON_GetObjectItem(root, "displayToken");
    cJSON *userTz       = cJSON_GetObjectItem(root, "userTimezone");

    if (!displayToken || !cJSON_IsString(displayToken) || !displayToken->valuestring) {
        ESP_LOGE(TAG, "display register: sem displayToken");
        cJSON_Delete(root);
        return ESP_FAIL;
    }

    if (userTz && cJSON_IsString(userTz) && userTz->valuestring) {
        display_client_set_timezone(userTz->valuestring);
        ESP_LOGI(TAG, "userTimezone recebido: %s", userTz->valuestring);
    } else {
        display_client_set_timezone("UTC");
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

    ESP_LOGI(TAG, "login_and_register: IN");


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

    char json[384];
    snprintf(json, sizeof(json),
             "{\"email\":\"%s\",\"password\":\"%s\"}", email, pass);

    char resp[768];
    esp_err_t err = http_post_json(url, json, resp, sizeof(resp));
    ESP_LOGI(TAG, "login_and_register: http_post_json(login) -> %d", err);

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
    ESP_LOGI(TAG, "login_and_register: login OK, carregando KH devices");
    err = display_client_load_kh_devices();
    ESP_LOGI(TAG, "login_and_register: load_kh_devices -> %d", err);

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

    display_client_set_main_device_id(main_device_id);

    // 3) Gerar ID único do display
    char display_id[32];
    generate_device_id(display_id, sizeof(display_id));
    ESP_LOGI(TAG, "Registering display %s", display_id);

    // 4) Registrar display (gera displayToken)
    ESP_LOGI(TAG, "login_and_register: registrando display %s", display_id);
    err = display_client_register_display(email, pass, display_id, main_device_id);
    ESP_LOGI(TAG, "login_and_register: register_display -> %d", err);

    if (err != ESP_OK) return err;

        // 5) Registrar device LCD e obter deviceToken
    const char *userToken = jwt_handler_get_user_token();
    if (!userToken || !userToken[0]) {
        ESP_LOGE(TAG, "Sem userToken para registrar device LCD");
        return ESP_FAIL;
    }

    char url_regdev[256];
    snprintf(url_regdev, sizeof(url_regdev),
             "https://iot.reefbluesky.com.br/api/display/register-device");

    char json_regdev[256];
    snprintf(json_regdev, sizeof(json_regdev),
             "{"
               "\"deviceId\":\"%s\","
               "\"deviceType\":\"LCD\","
               "\"mainDeviceId\":\"%s\""
             "}",
             display_id,
             main_device_id);

    // usa o helper POST genérico, mas com Authorization: Bearer <userToken>
    esp_http_client_config_t cfg = {
        .url = url_regdev,
        .method = HTTP_METHOD_POST,
        .timeout_ms = 8000,
        .crt_bundle_attach = esp_crt_bundle_attach,
        .event_handler = http_event_handler,
    };
    esp_http_client_handle_t client = esp_http_client_init(&cfg);
    if (!client) {
        ESP_LOGE(TAG, "register-device: falha ao init http client");
        return ESP_FAIL;
    }

    char auth_hdr2[512];
    snprintf(auth_hdr2, sizeof(auth_hdr2), "Bearer %s", userToken);
    esp_http_client_set_header(client, "Authorization", auth_hdr2);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Accept-Encoding", "identity");

    http_body_len = 0;
    http_body_buf[0] = '\0';
    esp_http_client_set_post_field(client, json_regdev, strlen(json_regdev));

    err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "register-device: HTTP error %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return err;
    }

    int status = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG, "register-device: status=%d", status);

    esp_http_client_cleanup(client);

    char resp_regdev[512];
    int to_copy = http_body_len > (int)sizeof(resp_regdev) - 1 ? (int)sizeof(resp_regdev) - 1 : http_body_len;
    memcpy(resp_regdev, http_body_buf, to_copy);
    resp_regdev[to_copy] = '\0';
    ESP_LOGI(TAG, "register-device resp: %s", resp_regdev);

    if (status != 200) {
        ESP_LOGW(TAG, "register-device falhou (status=%d), ignorando por enquanto", status);
        return ESP_OK;
    }

    // Parse da resposta: { "success":true, "deviceToken":"...", "refreshToken":"...", ... }
    cJSON *root_dev = cJSON_Parse(resp_regdev);
    if (!root_dev) {
        ESP_LOGE(TAG, "register-device: JSON parse error");
        return ESP_FAIL;
    }

    cJSON *success_dev = cJSON_GetObjectItem(root_dev, "success");
    cJSON *deviceToken = cJSON_GetObjectItem(root_dev, "deviceToken");
    if (!cJSON_IsBool(success_dev) || !cJSON_IsTrue(success_dev) ||
        !deviceToken || !cJSON_IsString(deviceToken) || !deviceToken->valuestring) {
        ESP_LOGE(TAG, "register-device: resposta inválida");
        cJSON_Delete(root_dev);
        return ESP_FAIL;
    }

    // Guarda o deviceToken do LCD no NVS (via JWTHandler)
    jwt_handler_set_device_token(deviceToken->valuestring);
    ESP_LOGI(TAG, "device token salvo (%d bytes)", (int)strlen(deviceToken->valuestring));

    cJSON_Delete(root_dev);

    //6) Reportar versão de firmware do LCD usando deviceToken
    display_client_report_firmware();

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

    char resp[768];
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

