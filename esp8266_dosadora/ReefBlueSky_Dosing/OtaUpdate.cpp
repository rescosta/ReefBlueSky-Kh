#include "OtaUpdate.h"

#ifdef ESP8266
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <ESP8266WebServer.h>
  #include <Updater.h>
#else
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <WebServer.h>
  #include <Update.h>
#endif

#include <WiFiClient.h>


extern const char* CLOUD_BASE_URL;
extern const char* FW_DEVICE_TYPE;
extern const char* FW_VERSION;
extern String deviceToken;

static void logOtaSuccessToCloud() {
  Serial.println("[OTA-LOG] logOtaSuccessToCloud() ENTER");
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[OTA-LOG] WiFi não conectado, pulando log OTA.");
    return;
  }
  if (deviceToken.length() == 0) {
    Serial.println("[OTA-LOG] Sem deviceToken, pulando log OTA.");
    return;
  }

  WiFiClient client;
  HTTPClient http;
  String url = "http://iot.reefbluesky.com.br/api/device/ota-log";


  String body = "{";
  body += "\"device_type\":\"" + String(FW_DEVICE_TYPE) + "\",";
  body += "\"event\":\"success\",";
  body += "\"firmware_version\":\"" + String(FW_VERSION) + "\",";
  body += "\"error\":null";
  body += "}";

  Serial.printf("[OTA-LOG] POST %s\n", url.c_str());
  Serial.println("[OTA-LOG] Body: " + body);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", "Bearer " + deviceToken);

  int code = http.POST(body);
  Serial.printf("[OTA-LOG] code=%d\n", code);
  if (code > 0) {
    String resp = http.getString();
    Serial.println("[OTA-LOG] resp=" + resp);
  }
  http.end();
}


// ======== VARIÁVEIS GLOBAIS ========
static String g_baseUrl;
static OtaProgressCallback g_progressCallback = nullptr;
static OtaEventCallback g_eventCallback = nullptr;
static String g_lastError;
static bool g_otaInProgress = false;

// ======== CALLBACKS ========

void otaInit(
  const String& baseUrl,
  OtaProgressCallback progressCallback,
  OtaEventCallback eventCallback
) {
  g_baseUrl = baseUrl;
  g_progressCallback = progressCallback;
  g_eventCallback = eventCallback;
  Serial.println("[OTA] Init com base URL: " + baseUrl);
}

static void callEventCallback(const String& event, const String& details = "") {
  if (g_eventCallback) {
    g_eventCallback(event, details);
  }
  Serial.printf("[OTA] Event: %s - %s\n", event.c_str(), details.c_str());
}

static void callProgressCallback(int written, int total) {
  if (g_progressCallback && total > 0) {
    int percent = (written * 100) / total;
    g_progressCallback(percent, written, total);
  }
}

// ======== OTA VIA HTTP ========

/**
 * Download + Update internal
 * Usa yield() em vez de delay() pra não bloquear OTA
 */
static bool otaInternal(const String& url) {
  if (WiFi.status() != WL_CONNECTED) {
    g_lastError = "WiFi not connected";
    Serial.println("[OTA] WiFi desconectado.");
    callEventCallback("failed", "WiFi not connected");
    return false;
  }

  g_otaInProgress = true;
  g_lastError = "";

  WiFiClient client;
  HTTPClient http;

  Serial.println("[OTA] Baixando: " + url);
  callEventCallback("started", url);

  // Timeout na requisição
  http.setTimeout(30000);

  if (!http.begin(client, url)) {
    g_lastError = "HTTP begin failed";
    Serial.println("[OTA] HTTP begin falhou.");
    callEventCallback("failed", g_lastError);
    g_otaInProgress = false;
    return false;
  }

  int httpCode = http.GET();
  Serial.printf("[OTA] HTTP code=%d\n", httpCode);

  if (httpCode != HTTP_CODE_OK) {
    g_lastError = "HTTP " + String(httpCode);
    Serial.printf("[OTA] erro HTTP: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    callEventCallback("failed", g_lastError);
    g_otaInProgress = false;
    return false;
  }

  int contentLen = http.getSize();
  Serial.printf("[OTA] Content-Length: %d bytes\n", contentLen);

  WiFiClient* stream = http.getStreamPtr();

  // Usar contentLen se disponível; em ESP8266 não existe UPDATE_SIZE_UNKNOWN
  #ifdef ESP8266
    size_t total = (contentLen > 0) ? (size_t)contentLen : 0;
  #else
    size_t total = (contentLen > 0) ? (size_t)contentLen : (size_t)UPDATE_SIZE_UNKNOWN;
  #endif

  if (!Update.begin(total)) {
  #ifdef ESP8266
    g_lastError = "Update.begin failed";
    Serial.print("[OTA] Update.begin falhou: ");
    Update.printError(Serial);
  #else
    g_lastError = "Update.begin failed: " + String(Update.errorString());
    Serial.printf("[OTA] Update.begin falhou: %s\n", Update.errorString());
  #endif
    http.end();
    callEventCallback("failed", g_lastError);
    g_otaInProgress = false;
    return false;
  }

  callEventCallback("downloading", "0%");

  size_t written = 0;
  uint8_t buff[512];
  unsigned long lastYield = millis();

  unsigned long lastDataMs = millis();

  while (g_otaInProgress) {
    size_t available = stream->available();

    if (available) {
      size_t len = stream->readBytes(buff,
        (available > sizeof(buff)) ? sizeof(buff) : available);

      if (len == 0) {
        // fim do stream
        break;
      }

      size_t writeRes = Update.write(buff, len);
      if (writeRes != len) {
        g_lastError = String("Write error: ") + String(writeRes) + "/" + String(len) +
                      " code=" + String(Update.getError());
        Serial.printf("[OTA] write falhou %u/%u, error=%d\n",
          writeRes, len, Update.getError());
        http.end();

        #ifdef ESP8266
          Update.end();
        #else
          Update.abort();
        #endif
        
        callEventCallback("failed", g_lastError);
        g_otaInProgress = false;
        return false;
      }

      written += len;
      lastDataMs = millis();

      // Log de progresso
      if (contentLen > 0) {
        int prog = (written * 100) / (size_t)contentLen;
        if (prog % 10 == 0 || written == (size_t)contentLen) {
          Serial.printf("[OTA] %d%% (%u/%d)\n", prog, written, contentLen);
          callProgressCallback(written, contentLen);
        }
      } else {
        if (written % 10240 == 0) {
          Serial.printf("[OTA] %u bytes...\n", written);
          callProgressCallback(written, written);
        }
      }

      unsigned long now = millis();
      if (now - lastYield > 100) {
        yield();
        lastYield = now;
      }

    } else {
      // já baixou tudo e não vem mais nada há 5s → sai do loop
      if (contentLen > 0 &&
          written >= (size_t)contentLen &&
          millis() - lastDataMs > 5000) {
        Serial.println("[OTA] Timeout pós-download, saindo do loop");
        break;
      }
      yield();
      delay(1);
    }
  }

  http.end();

  Serial.printf("\n[OTA] pós-http.end, written=%u, total=%d\n", written, contentLen);

  Serial.println("\n[OTA] Download concluído, finalizando...");

  if (!Update.end(true)) {  // true = setSize() com bytes escritos
  #ifdef ESP8266
    g_lastError = "Update.end failed";
    Serial.print("[OTA] Erro: ");
    Update.printError(Serial);
  #else
    g_lastError = "Update.end failed: " + String(Update.errorString());
    Serial.printf("[OTA] Erro: %s\n", Update.errorString());
  #endif
    callEventCallback("failed", g_lastError);
    g_otaInProgress = false;
    return false;
  }


  if (!Update.isFinished()) {
    g_lastError = "Update incomplete";
    Serial.println("[OTA] Update não finalizou corretamente");
    callEventCallback("failed", g_lastError);
    g_otaInProgress = false;
    return false;
  }


  // 🔹 Log de sucesso no backend antes de reiniciar
  logOtaSuccessToCloud();

  Serial.println("[OTA] 100% OK - Reboot em 2s!");
  callEventCallback("success", "Rebooting...");
  g_otaInProgress = false;

  delay(2000);
  Serial.println("[OTA] chamando ESP.restart()");
  ESP.restart();
  return true;
}

bool otaFromUrl(const String& url) {
  return otaInternal(url);
}

bool otaUpdateKh() {
  return otaInternal(g_baseUrl + "/ota/kh/latest.bin");
}

bool otaUpdateDoser() {
  return otaInternal(g_baseUrl + "/ota/doser/latest.bin");
}

bool otaUpdateLcd() {
  return otaInternal(g_baseUrl + "/ota/lcd/latest.bin");
}

// ======== WEB OTA (SERVIDOR LOCAL) ========

static bool g_webOtaInProgress = false;
static String g_webOtaError;

static const char* WEB_OTA_HTML PROGMEM = R"HTML(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReefBlueSky OTA Update</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #020617 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f1f5f9;
      padding: 20px;
    }
    .container {
      background: #1e293b;
      border-radius: 12px;
      padding: 40px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    h1 {
      font-size: 28px;
      margin-bottom: 10px;
      color: #38bdf8;
      text-align: center;
    }
    .subtitle {
      text-align: center;
      color: #cbd5e1;
      margin-bottom: 30px;
      font-size: 14px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #cbd5e1;
    }
    input[type="file"] {
      display: block;
      width: 100%;
      padding: 12px;
      background: #0f172a;
      border: 2px dashed #38bdf8;
      border-radius: 8px;
      color: #f1f5f9;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    input[type="file"]:hover {
      background: #334155;
      border-color: #0284c7;
    }
    .btn {
      width: 100%;
      padding: 12px;
      background: #38bdf8;
      color: #0f172a;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    .btn:hover {
      background: #0284c7;
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(56, 189, 248, 0.3);
    }
    .btn:disabled {
      background: #64748b;
      cursor: not-allowed;
      opacity: 0.6;
    }
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 8px;
      display: none;
      font-size: 14px;
    }
    .status.info {
      background: rgba(56, 189, 248, 0.1);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      display: block;
    }
    .status.success {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.3);
      display: block;
    }
    .status.error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.3);
      display: block;
    }
    .progress-bar {
      width: 100%;
      height: 6px;
      background: #334155;
      border-radius: 3px;
      margin-top: 10px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #38bdf8;
      width: 0%;
      transition: width 0.2s ease;
    }
    .filename {
      color: #94a3b8;
      font-size: 12px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🌊 ReefBlueSky OTA</h1>
    <p class="subtitle">Atualização de Firmware via Web</p>
    
    <form id="otaForm" enctype="multipart/form-data">
      <div class="form-group">
        <label for="firmware">Selecione o arquivo .bin:</label>
        <input type="file" id="firmware" name="firmware" accept=".bin" required>
        <div class="filename" id="filename"></div>
      </div>
      
      <button type="submit" class="btn" id="submitBtn">Iniciar Atualização</button>
      
      <div id="status" class="status"></div>
      <div class="progress-bar" id="progressBar" style="display: none;">
        <div class="progress-fill" id="progressFill"></div>
      </div>
    </form>
  </div>

  <script>
    const form = document.getElementById('otaForm');
    const fileInput = document.getElementById('firmware');
    const submitBtn = document.getElementById('submitBtn');
    const statusDiv = document.getElementById('status');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const filenameDiv = document.getElementById('filename');

    fileInput.addEventListener('change', (e) => {
      const filename = e.target.files[0]?.name || '';
      if (filename) {
        filenameDiv.textContent = '📄 ' + filename;
      } else {
        filenameDiv.textContent = '';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const file = fileInput.files[0];
      if (!file) {
        showStatus('Selecione um arquivo .bin', 'error');
        return;
      }

      if (!file.name.endsWith('.bin')) {
        showStatus('Arquivo deve ter extensão .bin', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('firmware', file);

      submitBtn.disabled = true;
      progressBar.style.display = 'block';
      progressFill.style.width = '0%';
      showStatus('Enviando firmware... ' + formatBytes(file.size), 'info');

      try {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressFill.style.width = percent + '%';
            showStatus('Progresso: ' + percent + '% (' + formatBytes(e.loaded) + '/' + formatBytes(e.total) + ')', 'info');
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            showStatus('✅ Firmware atualizado! Reiniciando...', 'success');
            progressFill.style.width = '100%';
            setTimeout(() => {
              showStatus('Dispositivo reiniciando... (aguarde 30s)', 'info');
            }, 2000);
          } else {
            const errorText = xhr.responseText || 'Erro desconhecido';
            showStatus('❌ Erro: ' + errorText, 'error');
            submitBtn.disabled = false;
          }
        });

        xhr.addEventListener('error', () => {
          showStatus('❌ Erro de conexão (dispositivo pode estar reiniciando)', 'error');
          submitBtn.disabled = false;
        });

        xhr.open('POST', '/webota');
        xhr.send(formData);

      } catch (error) {
        showStatus('❌ Erro: ' + error.message, 'error');
        submitBtn.disabled = false;
      }
    });

    function showStatus(msg, type) {
      statusDiv.textContent = msg;
      statusDiv.className = 'status ' + type;
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
  </script>
</body>
</html>
)HTML";

void setupWebOtaRoutes(WebServerType& server) {
  server.on("/webota", HTTP_GET, [&server]() {
    server.sendHeader("Content-Type", "text/html; charset=UTF-8");
    server.send(200, "text/html", (const __FlashStringHelper*)WEB_OTA_HTML);
  });

  server.on("/webota", HTTP_POST,
    [&server]() {
      if (!g_webOtaInProgress && g_webOtaError.length() == 0) {
        server.send(200, "text/plain", "OK");
      } else {
        server.send(
          500,
          "text/plain",
          g_webOtaError.length() > 0 ? g_webOtaError : "OTA failed"
        );
      }
    },
    [&server]() {
      HTTPUpload& upload = server.upload();

    if (upload.status == UPLOAD_FILE_START) {
      g_webOtaError = "";
      g_webOtaInProgress = false;

      Serial.printf("[WebOTA] Upload start: %s, size=%d\n",
        upload.filename.c_str(), upload.totalSize);

    #ifdef ESP8266
          if (!Update.begin(0)) {
            g_webOtaError = "Update.begin failed";
            Serial.print("[WebOTA] ");
            Update.printError(Serial);
    #else
          if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
            g_webOtaError = "Update.begin failed: " + String(Update.errorString());
            Serial.println("[WebOTA] " + g_webOtaError);
    #endif
            callEventCallback("webota_failed", g_webOtaError);
            return;
          }


      g_webOtaInProgress = true;
      callEventCallback("webota_started", upload.filename);

    } else if (upload.status == UPLOAD_FILE_WRITE) {
      if (g_webOtaInProgress) {
        size_t writeRes = Update.write(upload.buf, upload.currentSize);

      if (writeRes != upload.currentSize) {
        g_webOtaError = String("Write error: ") + String(writeRes) + "/" + String(upload.currentSize);
        g_webOtaInProgress = false;
        Serial.println("[WebOTA] " + g_webOtaError);
      #ifdef ESP8266
        Update.end();
      #else
        Update.abort();
      #endif
        callEventCallback("webota_failed", g_webOtaError);
        return;
      }


        // Progress callback
        callProgressCallback(upload.totalSize, upload.totalSize);

        if (upload.totalSize % 100000 == 0) {
          Serial.printf("[WebOTA] Progress: %u bytes\n", upload.totalSize);
          yield();
        }
      }

    } else if (upload.status == UPLOAD_FILE_END) {
      if (g_webOtaInProgress) {
        if (Update.end(true)) {
          Serial.printf("[WebOTA] Success! %u bytes written\n", upload.totalSize);
          callEventCallback("webota_success", String(upload.totalSize) + " bytes");
        } else {
        #ifdef ESP8266
          g_webOtaError = "Update.end failed";
          g_webOtaInProgress = false;
          Serial.print("[WebOTA] ");
          Update.printError(Serial);
        #else
          g_webOtaError = "Update.end failed: " + String(Update.errorString());
          g_webOtaInProgress = false;
          Serial.println("[WebOTA] " + g_webOtaError);
        #endif
          callEventCallback("webota_failed", g_webOtaError);
        }

      }

    } else if (upload.status == UPLOAD_FILE_ABORTED) {
      g_webOtaError = "Upload aborted";
      g_webOtaInProgress = false;

      #ifdef ESP8266
          Update.end();
      #else
          Update.abort();
      #endif

      Serial.println("[WebOTA] Upload aborted");
      callEventCallback("webota_failed", g_webOtaError);
    }
  });

  Serial.println("[WebOTA] Routes registered: GET/POST /webota");
}

// ======== UTILS ========

bool otaIsInProgress() {
  return g_otaInProgress || g_webOtaInProgress;
}

void otaCancel() {
  if (g_otaInProgress || g_webOtaInProgress) {

  #ifdef ESP8266
      Update.end();
  #else
      Update.abort();
  #endif

    g_otaInProgress = false;
    g_webOtaInProgress = false;
    g_lastError = "Cancelled";
    Serial.println("[OTA] OTA cancelado");
    callEventCallback("cancelled", "User requested cancel");
  }
}

String otaGetLastError() {
  return g_lastError;
}
