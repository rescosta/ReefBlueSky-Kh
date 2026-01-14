#include "SetupServer.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "cJSON.h"
#include "storage/NVSStorage.h"
#include "esp_wifi.h"
#include <stdlib.h>

static const char *TAG = "SetupServer";
static httpd_handle_t s_server = NULL;

// HTML completo (copiado do getConfigHTML do WiFiSetup)
static const char *SETUP_HTML =
"<!DOCTYPE html>"
"<html lang=\"pt-BR\">"
"<head>"
"    <meta charset=\"UTF-8\">"
"    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
"    <title>ReefBlueSky KH Monitor - Configuração Inicial</title>"
"    <style>"
"        * { margin:0; padding:0; box-sizing:border-box; }"
"        body { font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;"
"               background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);"
"               min-height:100vh; display:flex; justify-content:center;"
"               align-items:center; padding:20px; }"
"        .container { background:white; border-radius:10px;"
"               box-shadow:0 10px 40px rgba(0,0,0,0.2); max-width:500px;"
"               width:100%; padding:40px; }"
"        .logo { text-align:center; margin-bottom:30px; }"
"        .logo h1 { color:#333; font-size:28px; margin-bottom:10px; }"
"        .logo p { color:#666; font-size:14px; }"
"        .form-group { margin-bottom:20px; }"
"        label { display:block; margin-bottom:8px; color:#333;"
"                font-weight:500; font-size:14px; }"
"        input[type=\"text\"],input[type=\"password\"],input[type=\"url\"]{"
"            width:100%; padding:12px; border:1px solid #ddd;"
"            border-radius:5px; font-size:14px; transition:border-color .3s;}"
"        input[type=\"text\"]:focus,input[type=\"password\"]:focus,"
"        input[type=\"url\"]:focus{ outline:none; border-color:#667eea;"
"            box-shadow:0 0 0 3px rgba(102,126,234,0.1);} "
"        .section-title { font-size:16px; font-weight:600; color:#333;"
"            margin-top:25px; margin-bottom:15px; padding-bottom:10px;"
"            border-bottom:2px solid #667eea; }"
"        button { width:100%; padding:12px;"
"            background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);"
"            color:white; border:none; border-radius:5px; font-size:16px;"
"            font-weight:600; cursor:pointer; transition:transform .2s,"
"            box-shadow .2s; margin-top:30px; }"
"        button:hover { transform:translateY(-2px);"
"            box-shadow:0 5px 20px rgba(102,126,234,0.4);} "
"        button:active { transform:translateY(0); }"
"        .status { margin-top:20px; padding:15px; border-radius:5px;"
"            text-align:center; font-size:14px; display:none; }"
"        .status.success { background:#d4edda; color:#155724;"
"            border:1px solid #c3e6cb; display:block; }"
"        .status.error { background:#f8d7da; color:#721c24;"
"            border:1px solid #f5c6cb; display:block; }"
"        .loading { display:none; text-align:center; margin-top:20px; }"
"        .spinner { border:4px solid #f3f3f3; border-top:4px solid #667eea;"
"            border-radius:50%; width:40px; height:40px;"
"            animation:spin 1s linear infinite; margin:0 auto; }"
"        @keyframes spin { 0%{transform:rotate(0deg);} "
"                          100%{transform:rotate(360deg);} }"
"        .help-text { font-size:12px; color:#666; margin-top:5px; }"
"    </style>"
"</head>"
"<body>"
"  <div class=\"container\">"
"    <div class=\"logo\">"
"      <h1>🐠 ReefBlueSky</h1>"
"      <p>KH Monitor - Configuração Inicial</p>"
"    </div>"
"    <form id=\"configForm\">"
"      <div class=\"section-title\">📡 WiFi da Casa</div>"
"      <div class=\"form-group\">"
"        <label for=\"ssidSelect\">Redes WiFi disponíveis</label>"
"        <select id=\"ssidSelect\"></select>"
"        <label for=\"ssid\">Nome da Rede WiFi (SSID)</label>"
"        <input type=\"text\" id=\"ssid\" name=\"ssid\" required "
"               placeholder=\"Ex: Meu-WiFi\">"
"        <div class=\"help-text\">Nome exato da sua rede WiFi</div>"
"      </div>"
"      <div class=\"form-group\">"
"        <label for=\"password\">Senha do WiFi</label>"
"        <input type=\"password\" id=\"password\" name=\"password\" required "
"               placeholder=\"Sua senha WiFi\">"
"        <label><input type=\"checkbox\" id=\"showPassWifi\"> Mostrar senha</label>"
"        <div class=\"help-text\">Senha da sua rede WiFi (não será exibida)</div>"
"      </div>"
"      <div class=\"form-group\">"
"        <label for=\"serverUsername\">Usuário/Email</label>"
"        <input type=\"text\" id=\"serverUsername\" name=\"serverUsername\" "
"               required placeholder=\"seu@email.com\">"
"        <div class=\"help-text\">Usuário ou email registrado no servidor</div>"
"      </div>"
"      <div class=\"form-group\">"
"        <label for=\"serverPassword\">Senha do Servidor</label>"
"        <input type=\"password\" id=\"serverPassword\" name=\"serverPassword\" "
"               required placeholder=\"Sua senha\">"
"        <label><input type=\"checkbox\" id=\"showPassServer\"> Mostrar senha</label>"
"        <div class=\"help-text\">Senha da sua conta no servidor</div>"
"      </div>"
"      <button type=\"submit\">✓ Conectar e Registrar</button>"
"      <div id=\"status\" class=\"status\"></div>"
"      <div id=\"loading\" class=\"loading\">"
"        <div class=\"spinner\"></div>"
"        <p>Conectando ao WiFi e registrando no servidor...</p>"
"      </div>"
"    </form>"
"  </div>"
"<script>"
"document.getElementById('configForm').addEventListener('submit', async (e)=>{"
" e.preventDefault();"
" const statusDiv=document.getElementById('status');"
" const loadingDiv=document.getElementById('loading');"
" const button=document.querySelector('button');"
" const config={"
"  ssid:document.getElementById('ssid').value,"
"  password:document.getElementById('password').value,"
"  serverUsername:document.getElementById('serverUsername').value,"
"  serverPassword:document.getElementById('serverPassword').value"
" };"
" loadingDiv.style.display='block';"
" button.disabled=true; statusDiv.style.display='none';"
" try{"
"  const response=await fetch('/api/setup',{"
"    method:'POST', headers:{'Content-Type':'application/json'},"
"    body:JSON.stringify(config)});"
"  const result=await response.json();"
"  loadingDiv.style.display='none';"
"  if(response.ok && result.success){"
"    statusDiv.className='status success';"
"    statusDiv.innerHTML='✓ Configuração salva! Reiniciando em 5 segundos...';"
"    statusDiv.style.display='block';"
"    setTimeout(()=>{window.location.href='/'},5000);"
"  }else{"
"    statusDiv.className='status error';"
"    statusDiv.innerHTML='✗ Erro: '+(result.message||'Falha na configuração');"
"    statusDiv.style.display='block';"
"    button.disabled=false;"
"  }"
" }catch(error){"
"  loadingDiv.style.display='none';"
"  statusDiv.className='status error';"
"  statusDiv.innerHTML='✗ Erro de conexão: '+error.message;"
"  statusDiv.style.display='block';"
"  button.disabled=false;"
" }});"
"document.addEventListener('DOMContentLoaded',()=>{"
" const passWifi=document.getElementById('password');"
" const passServer=document.getElementById('serverPassword');"
" document.getElementById('showPassWifi').addEventListener('change',(e)=>{"
"   passWifi.type=e.target.checked?'text':'password';});"
" document.getElementById('showPassServer').addEventListener('change',(e)=>{"
"   passServer.type=e.target.checked?'text':'password';});"
" loadNetworks();"
"});"
"async function loadNetworks(){"
" try{"
"  const res=await fetch('/api/scan');"
"  const data=await res.json();"
"  const select=document.getElementById('ssidSelect');"
"  select.innerHTML='';"
"  data.networks.forEach(ssid=>{"
"    const opt=document.createElement('option');"
"    opt.value=ssid; opt.textContent=ssid; select.appendChild(opt);"
"  });"
"  select.addEventListener('change',()=>{"
"    document.getElementById('ssid').value=select.value;});"
" }catch(e){console.error(e);}"
"}"
"</script>"
"</body></html>";

static esp_err_t root_get_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html; charset=utf-8");
    httpd_resp_send(req, SETUP_HTML, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

// POST /api/setup
static esp_err_t api_setup_post_handler(httpd_req_t *req)
{
    char buf[512];
    int total = req->content_len;
    if (total >= (int)sizeof(buf)) total = sizeof(buf) - 1;

    int received = httpd_req_recv(req, buf, total);
    if (received <= 0) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "No body");
        return ESP_FAIL;
    }
    buf[received] = '\0';

    cJSON *root = cJSON_Parse(buf);
    if (!root) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
        return ESP_FAIL;
    }

    const cJSON *j_ssid  = cJSON_GetObjectItem(root, "ssid");
    const cJSON *j_pass  = cJSON_GetObjectItem(root, "password");
    const cJSON *j_user  = cJSON_GetObjectItem(root, "serverUsername");
    const cJSON *j_pwd   = cJSON_GetObjectItem(root, "serverPassword");

    if (!cJSON_IsString(j_ssid) || !cJSON_IsString(j_pass) ||
        !cJSON_IsString(j_user) || !cJSON_IsString(j_pwd)) {
        cJSON_Delete(root);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing fields");
        return ESP_FAIL;
    }

  
    nvs_storage_save_wifi_credentials(j_ssid->valuestring, j_pass->valuestring);
    nvs_storage_add_wifi_network(j_ssid->valuestring, j_pass->valuestring);
    nvs_storage_save_auth_credentials(j_user->valuestring, j_pwd->valuestring);


    cJSON_Delete(root);

    const char *resp = "{\"success\":true,\"message\":\"Config salva, reiniciando\"}";
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, resp, HTTPD_RESP_USE_STRLEN);

    vTaskDelay(pdMS_TO_TICKS(2000));
    esp_restart();
    return ESP_OK;
}

// GET /api/scan
static esp_err_t api_scan_get_handler(httpd_req_t *req)
{
    wifi_scan_config_t scan_cfg = { 0 };
    esp_wifi_scan_stop();
    esp_wifi_scan_start(&scan_cfg, true);  // bloqueante

    uint16_t num = 0;
    esp_wifi_scan_get_ap_num(&num);

    wifi_ap_record_t *aps = calloc(num, sizeof(wifi_ap_record_t));
    if (!aps) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "no mem");
        return ESP_FAIL;
    }
    esp_wifi_scan_get_ap_records(&num, aps);

    cJSON *root = cJSON_CreateObject();
    cJSON *arr  = cJSON_CreateArray();
    cJSON_AddItemToObject(root, "networks", arr);

    for (int i = 0; i < num; i++) {
        cJSON_AddItemToArray(arr, cJSON_CreateString((char *)aps[i].ssid));
    }
    free(aps);

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, out, HTTPD_RESP_USE_STRLEN);
    free(out);
    return ESP_OK;
}

// GET /api/status (simples por enquanto)
static esp_err_t api_status_get_handler(httpd_req_t *req)
{
    cJSON *root = cJSON_CreateObject();
    cJSON_AddBoolToObject(root, "configured", false);

    char *out = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, out, HTTPD_RESP_USE_STRLEN);
    free(out);
    return ESP_OK;
}


static esp_err_t captive_redirect_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "/");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}


esp_err_t setup_server_start(void)
{
    if (s_server) {
        ESP_LOGW(TAG, "Server already running");
        return ESP_OK;
    }

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;

    ESP_LOGI(TAG, "Starting setup HTTP server on port %d", config.server_port);
    esp_err_t err = httpd_start(&s_server, &config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "httpd_start failed: %d", err);
        return err;
    }

    httpd_uri_t root = {
        .uri      = "/",
        .method   = HTTP_GET,
        .handler  = root_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &root);

    httpd_uri_t api_setup = {
        .uri      = "/api/setup",
        .method   = HTTP_POST,
        .handler  = api_setup_post_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &api_setup);

    httpd_uri_t api_scan = {
        .uri      = "/api/scan",
        .method   = HTTP_GET,
        .handler  = api_scan_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &api_scan);

    httpd_uri_t api_status = {
        .uri      = "/api/status",
        .method   = HTTP_GET,
        .handler  = api_status_get_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &api_status);

        httpd_uri_t gen204 = {
        .uri      = "/generate_204",
        .method   = HTTP_GET,
        .handler  = captive_redirect_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &gen204);

    httpd_uri_t apple = {
        .uri      = "/hotspot-detect.html",
        .method   = HTTP_GET,
        .handler  = captive_redirect_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &apple);

    httpd_uri_t win_ncsi = {
        .uri      = "/ncsi.txt",
        .method   = HTTP_GET,
        .handler  = captive_redirect_handler,
        .user_ctx = NULL
    };
    httpd_register_uri_handler(s_server, &win_ncsi);

    return ESP_OK;
}

void setup_server_stop(void)
{
    if (s_server) {
        httpd_stop(s_server);
        s_server = NULL;
        ESP_LOGI(TAG, "Setup HTTP server stopped");
    }
}
