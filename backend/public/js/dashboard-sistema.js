// dashboard-sistema.js

const infoDeviceIdEl = document.getElementById('infoDeviceId');
const infoDeviceNameEl = document.getElementById('infoDeviceName');
const infoLocalIpEl = document.getElementById('infoLocalIp');
const infoLastSeenEl = document.getElementById('infoLastSeen');

const healthCpuEl = document.getElementById('healthCpu');
const healthMemEl = document.getElementById('healthMem');
const healthStorageEl = document.getElementById('healthStorage');
const healthWifiEl = document.getElementById('healthWifi');
const healthUptimeEl = document.getElementById('healthUptime');
const healthStatusTextEl = document.getElementById('healthStatusText');

const cmdRestartBtn = document.getElementById('cmdRestart');
const cmdResetKhBtn = document.getElementById('cmdResetKh');
const cmdFactoryResetBtn = document.getElementById('cmdFactoryReset');
const cmdStatusEl = document.getElementById('cmdStatus');

const eventsListEl = document.getElementById('eventsList');
const alertsListEl = document.getElementById('alertsList'); // [FIX]

// [FIX] Backup/Export
const exportMeasurementsBtn = document.getElementById('exportMeasurementsBtn');
const backupConfigBtn = document.getElementById('backupConfigBtn');
const importConfigFile = document.getElementById('importConfigFile');
const backupStatusEl = document.getElementById('backupStatus');

function formatDateTime(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatUptime(seconds) {
  if (!seconds || seconds <= 0) return '--';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${Math.floor(seconds)}s`);
  return parts.join(' ');
}

function classifyPercent(v) {
  if (v == null || Number.isNaN(v)) return 'health-bad';
  if (v < 70) return 'health-ok';
  if (v < 90) return 'health-warn';
  return 'health-bad';
}

function rssiToPercent(rssi) {
  // Converte RSSI (dBm) para porcentagem
  // -50 dBm ou melhor = 100%
  // -100 dBm ou pior = 0%
  if (rssi == null || Number.isNaN(rssi)) return null;
  if (rssi >= -50) return 100;
  if (rssi <= -100) return 0;
  return Math.round(2 * (rssi + 100));
}

function classifyWifi(rssiPercent) {
  if (rssiPercent == null || Number.isNaN(rssiPercent)) return 'health-bad';
  if (rssiPercent >= 70) return 'health-ok';
  if (rssiPercent >= 40) return 'health-warn';
  return 'health-bad';
}

// Usa lista de devices já carregada pelo DashboardCommon
function updateDeviceInfoFromList() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    infoDeviceIdEl.textContent = '--';
    infoDeviceNameEl.textContent = '--';
    infoLocalIpEl.textContent = '--';
    infoLastSeenEl.textContent = '--';
    return;
  }

  // currentDevices está fechado em dashboard-common; vamos recarregar
  DashboardCommon.loadDevicesCommon().then((devs) => {
    const dev = devs.find((d) => d.deviceId === deviceId);
    if (!dev) {
      infoDeviceIdEl.textContent = deviceId;
      infoDeviceNameEl.textContent = '--';
      infoLocalIpEl.textContent = '--';
      infoLastSeenEl.textContent = '--';
      return;
    }

    console.log('[Sistema] Device data:', {
      deviceId: dev.deviceId,
      lastSeenMs: dev.lastSeenMs,
      lastSeenEpoch: dev.lastSeenEpoch,
      online: dev.online,
      localIp: dev.localIp
    });

    infoDeviceIdEl.textContent = dev.deviceId;
    infoDeviceNameEl.textContent =
      dev.name && dev.name.trim() ? dev.name : dev.deviceId;
    infoLocalIpEl.textContent = dev.localIp || dev.localip || '--';

    // Backend retorna lastSeenMs (timestamp em milissegundos)
    const lastSeenMs = dev.lastSeenMs || dev.lastSeen || dev.lastseen;
    if (lastSeenMs) {
      const ts = typeof lastSeenMs === 'number' ? lastSeenMs : Date.parse(lastSeenMs);
      infoLastSeenEl.textContent = ts ? formatDateTime(ts) : '--';
    } else {
      infoLastSeenEl.textContent = '--';
    }
  });
}

function isDeviceOnline(lastSeenMs) {
  if (!lastSeenMs) return false;
  const diff = Date.now() - lastSeenMs;
  return diff <= 5 * 60 * 1000; // mesmo limiar de 5 min
}

function updateOnlineUI(dev) {
  const badgeEl = document.getElementById('deviceOnlineStatus');
  const statusCardEl = document.getElementById('onlineStatusText');

  if (!dev) {
    if (badgeEl) {
      badgeEl.textContent = '--';
      badgeEl.className = '';
    }
    if (statusCardEl) {
      statusCardEl.textContent = 'Nenhum dispositivo selecionado.';
      statusCardEl.classList.remove('online-status-online', 'online-status-offline');
    }
    return;
  }

  // Backend retorna lastSeenMs (timestamp em milissegundos)
  const lastSeenMs = dev.lastSeenMs || dev.lastSeen || dev.lastseen;
  const ts = lastSeenMs ? (typeof lastSeenMs === 'number' ? lastSeenMs : Date.parse(lastSeenMs)) : null;
  const online = isDeviceOnline(ts);

  console.log('[Sistema] Online status:', {
    deviceId: dev.deviceId,
    lastSeenMs,
    timestamp: ts,
    online,
    now: Date.now(),
    diff: ts ? (Date.now() - ts) : null
  });

  // Badge existente
  if (badgeEl) {
    badgeEl.textContent = online ? 'ONLINE' : 'OFFLINE';
    badgeEl.className = online ? 'badge-online' : 'badge-offline';
  }

  // Card novo
  if (statusCardEl) {
    if (ts) {
      const diffMs = Date.now() - ts;
      const diffSec = Math.floor(diffMs / 1000);
      let human;
      if (diffSec < 60) {
        human = `${diffSec} seconds ago`;
      } else {
        const mins = Math.floor(diffSec / 60);
        human = mins === 1 ? '1 minute ago' : `${mins} minutes ago`;
      }

      statusCardEl.textContent = online
        ? `Last time your device was seen online: ${human}.`
        : `Device is offline. Last time it was seen online: ${human}.`;
    } else {
      statusCardEl.textContent =
        'Ainda não há registro de lastSeen para este device.';
    }

    statusCardEl.classList.toggle('online-status-online', online);
    statusCardEl.classList.toggle('online-status-offline', !online);
  }
}


async function refreshDevicesUI() {
  const selectedId = DashboardCommon.getSelectedDeviceId();
  if (!selectedId) {
    updateOnlineUI(null);
    return;
  }

  // Usa lista já carregada pelo common
  const devs = await DashboardCommon.loadDevicesCommon();
  const dev = devs.find((d) => d.deviceId === selectedId);
  updateOnlineUI(dev);
}


// Stubs de API para saúde e comandos

async function apiLoadDeviceHealth(deviceId) {
  // Futuro: GET /api/v1/user/devices/:deviceId/health
  console.log('LOAD health', deviceId);
  try {
    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/health`,
    );
    if (res.status === 404) {
      return null; // ainda não implementado ou sem dados
    }
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao carregar saúde');
      return null;
    }
    return json.data;
  } catch (err) {
    console.error('apiLoadDeviceHealth error', err);
    return null;
  }
}

async function apiLoadDeviceEvents(deviceId) {
  // Futuro: GET /api/v1/user/devices/:deviceId/events
  console.log('LOAD events', deviceId);
  try {
    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/events`,
    );
    if (res.status === 404) {
      return [];
    }
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao carregar eventos');
      return [];
    }
    return json.data || [];
  } catch (err) {
    console.error('apiLoadDeviceEvents error', err);
    return [];
  }
}

async function apiSendCommand(deviceId, type) {
  // Futuro: POST /api/v1/user/devices/:deviceId/command
  console.log('SEND command', deviceId, type);
  try {
    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
      {
        method: 'POST',
        body: JSON.stringify({ type }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao enviar comando');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiSendCommand error', err);
    return false;
  }
}

function renderHealth(health) {
  if (!health) {
    healthCpuEl.textContent = '--';
    healthMemEl.textContent = '--';
    healthStorageEl.textContent = '--';
    healthWifiEl.textContent = '--';
    healthUptimeEl.textContent = '--';
    healthStatusTextEl.textContent =
      'Nenhuma métrica de saúde disponível ainda.';
    return;
  }

  const cpuRaw = health.cpuUsage ?? health.cpu ?? null;
  const memRaw = health.memoryUsage ?? health.mem ?? null;
  const storageRaw = health.storageUsage ?? health.storage ?? null;

  const wifiRaw = health.wifiRssi ?? health.rssi ?? null;
  const wifiRssi = Number.isFinite(wifiRaw) ? wifiRaw : Number(wifiRaw);
  const wifiPercent = rssiToPercent(wifiRssi);
  healthWifiEl.textContent =
    Number.isFinite(wifiPercent) ? `${wifiPercent}%` : '--';
  healthWifiEl.className = `health-value ${classifyWifi(wifiPercent)}`;


  const uptime = health.uptimeSeconds ?? health.uptime ?? null;

  const cpu = Number.isFinite(cpuRaw) ? cpuRaw : Number(cpuRaw);
  const mem = Number.isFinite(memRaw) ? memRaw : Number(memRaw);
  const storage = Number.isFinite(storageRaw) ? storageRaw : Number(storageRaw);

  healthCpuEl.textContent =
    Number.isFinite(cpu) ? `${cpu.toFixed(0)}%` : '--';
  healthCpuEl.className = `health-value ${classifyPercent(cpu)}`;

  healthMemEl.textContent =
    Number.isFinite(mem) ? `${mem.toFixed(0)}%` : '--';
  healthMemEl.className = `health-value ${classifyPercent(mem)}`;

  healthStorageEl.textContent =
    Number.isFinite(storage) ? `${storage.toFixed(0)}%` : '--';
  healthStorageEl.className = `health-value ${classifyPercent(storage)}`;


  healthUptimeEl.textContent = formatUptime(uptime);

  healthStatusTextEl.textContent =
    'Métricas carregadas. Valores altos de CPU/memória/armazenamento ou sinal Wi-Fi fraco podem indicar problemas.';
}



function renderEvents(events) {
  eventsListEl.innerHTML = '';
  if (!events || !events.length) {
    const div = document.createElement('div');
    div.className = 'muted';
    div.textContent = 'Nenhum evento registrado ainda.';
    eventsListEl.appendChild(div);
    return;
  }

  events.slice(0, 50).forEach((ev) => {
    const item = document.createElement('div');
    item.className = 'event-item';

    const timeSpan = document.createElement('span');
    timeSpan.className = 'event-time';
    timeSpan.textContent = ev.timestamp
      ? formatDateTime(ev.timestamp)
      : '--';

    const msgSpan = document.createElement('span');
    msgSpan.className = 'event-msg';
    msgSpan.textContent = ev.message || ev.type || JSON.stringify(ev);

    item.appendChild(timeSpan);
    item.appendChild(msgSpan);
    eventsListEl.appendChild(item);
  });
}

async function loadSystemForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    infoDeviceIdEl.textContent = '--';
    infoDeviceNameEl.textContent = '--';
    infoLocalIpEl.textContent = '--';
    infoLastSeenEl.textContent = '--';
    renderHealth(null);
    renderEvents([]);
    return;              // ← importantíssimo
  }

  updateDeviceInfoFromList();

  // 1) Atualiza status online
  const devs = await DashboardCommon.loadDevicesCommon();
  const dev = devs.find((d) => d.deviceId === deviceId);
  updateOnlineUI(dev);

  // 2) Health/events
  const [health, events] = await Promise.all([
    apiLoadDeviceHealth(deviceId),
    apiLoadDeviceEvents(deviceId),
  ]);
  renderHealth(health);
  renderEvents(events);

// 3) LCD status
  try {
    const resp = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
    );
    const json = await resp.json();
    if (
      resp.ok &&
      json.success &&
      json.data &&
      window.DashboardCommon &&
      typeof DashboardCommon.setLcdStatus === 'function'
    ) {
      const st = json.data.lcdStatus;
      // Só aplica se vier 'online' ou 'offline'
      if (st === 'online' || st === 'offline') {
        DashboardCommon.setLcdStatus(st);
      }
      // se vier 'never' ou undefined, não mexe no ícone
    }
  } catch (e) {
    console.error('Erro ao carregar lcdStatus na tela Sistema', e);
  }

}



// Eventos de comandos
cmdRestartBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) return;
  cmdStatusEl.textContent = 'Enviando comando de restart...';
  const ok = await apiSendCommand(deviceId, 'restart');
  cmdStatusEl.textContent = ok
    ? 'Comando de restart enviado.'
    : 'Erro ao enviar comando de restart.';
});

cmdResetKhBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) return;
  cmdStatusEl.textContent = 'Enviando comando de reset de KH...';
  const ok = await apiSendCommand(deviceId, 'resetkh');
  cmdStatusEl.textContent = ok
    ? 'Comando de reset de KH enviado.'
    : 'Erro ao enviar comando de reset de KH.';
});

cmdFactoryResetBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) return;
  const confirmReset = window.confirm(
    'ATENÇÃO: Reset de fábrica apagará histórico e configurações. Confirmar?',
  );
  if (!confirmReset) return;
  cmdStatusEl.textContent = 'Enviando comando de reset de fábrica...';
  const ok = await apiSendCommand(deviceId, 'factoryreset');
  cmdStatusEl.textContent = ok
    ? 'Comando de reset de fábrica enviado.'
    : 'Erro ao enviar comando de reset de fábrica.';
});

// [FIX] ===== FUNÇÕES DE ALERTAS =====

async function loadDeviceAlerts(deviceId) {
  try {
    const limit = 20; // Últimos 20 alertas
    const res = await apiFetch(
      `/api/v1/devices/${encodeURIComponent(deviceId)}/alerts?limit=${limit}`,
      { method: 'GET' }
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error('Erro ao carregar alertas:', json.message);
      return [];
    }
    return json.data.alerts || [];
  } catch (err) {
    console.error('loadDeviceAlerts error', err);
    return [];
  }
}

function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    alertsListEl.innerHTML = '<div class="muted">Nenhum alerta registrado ainda.</div>';
    return;
  }

  const severityEmoji = {
    low: 'ℹ️',
    medium: '⚠️',
    high: '🚨',
    critical: '🔴'
  };

  const html = alerts.map(alert => {
    const emoji = severityEmoji[alert.severity] || '⚠️';
    const timestamp = alert.created_at
      ? new Date(alert.created_at).toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      : '--';

    return `
      <div class="alert-item alert-item-${alert.severity}">
        <div class="alert-header">
          <div class="alert-type">${emoji} ${alert.type}</div>
          <span class="alert-severity alert-severity-${alert.severity}">${alert.severity}</span>
        </div>
        <div class="alert-message">${alert.message}</div>
        <div class="alert-timestamp">📅 ${timestamp}</div>
      </div>
    `;
  }).join('');

  alertsListEl.innerHTML = html;
}

async function loadAlertsForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    renderAlerts([]);
    return;
  }

  const alerts = await loadDeviceAlerts(deviceId);
  renderAlerts(alerts);
}

// [FIX] ===== FIM FUNÇÕES DE ALERTAS =====

// [FIX] ===== FUNÇÕES DE BACKUP/EXPORT =====

if (exportMeasurementsBtn) {
  exportMeasurementsBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    backupStatusEl.textContent = 'Exportando medições...';
    exportMeasurementsBtn.disabled = true;

    try {
      const url = `/api/v1/devices/${encodeURIComponent(deviceId)}/export/measurements`;
      const res = await apiFetch(url);

      if (!res.ok) {
        backupStatusEl.textContent = 'Erro ao exportar medições.';
        return;
      }

      // Fazer download do CSV
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `reefbluesky_${deviceId}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      backupStatusEl.textContent = '✓ Medições exportadas com sucesso!';
    } catch (err) {
      console.error('exportMeasurements error', err);
      backupStatusEl.textContent = 'Erro ao exportar medições.';
    } finally {
      exportMeasurementsBtn.disabled = false;
    }
  });
}

if (backupConfigBtn) {
  backupConfigBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    backupStatusEl.textContent = 'Gerando backup...';
    backupConfigBtn.disabled = true;

    try {
      // Buscar config do device
      const res = await apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/config`);
      const json = await res.json();

      if (!json.success) {
        backupStatusEl.textContent = 'Erro ao buscar configurações.';
        return;
      }

      // Gerar JSON com timestamp
      const backup = {
        timestamp: new Date().toISOString(),
        deviceId: deviceId,
        config: json.data
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `reefbluesky_config_${deviceId}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      backupStatusEl.textContent = '✓ Backup gerado com sucesso!';
    } catch (err) {
      console.error('backupConfig error', err);
      backupStatusEl.textContent = 'Erro ao gerar backup.';
    } finally {
      backupConfigBtn.disabled = false;
    }
  });
}

if (importConfigFile) {
  importConfigFile.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) {
      importConfigFile.value = '';
      return;
    }

    backupStatusEl.textContent = 'Importando configurações...';

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.config) {
        backupStatusEl.textContent = 'Arquivo inválido: sem campo "config".';
        return;
      }

      // Aplicar configurações (enviar comandos para o device)
      // Por enquanto, apenas mostrar sucesso - implementação completa requer endpoints específicos
      backupStatusEl.textContent = '✓ Configurações carregadas! (Funcionalidade parcial - necessário implementar aplicação)';

      console.log('Backup importado:', backup);
      // TODO: Implementar aplicação das configs ao device

    } catch (err) {
      console.error('importConfig error', err);
      backupStatusEl.textContent = 'Erro ao importar: arquivo inválido.';
    } finally {
      importConfigFile.value = '';
    }
  });
}

// [FIX] ===== FIM BACKUP/EXPORT =====

async function initDashboardSistema() {
  // monta topbar, side-menu, footer, carrega usuário, devices, etc.
  await DashboardCommon.initTopbar();

  // botão de atalho da Dosadora (se existir na página)
  const dosingBtn = document.getElementById('dosingBtn');
  if (dosingBtn) {
    dosingBtn.addEventListener('click', () => {
      window.location.href = 'dashboard-dosing.html';
    });
  }

  // primeira carga da lista de devices + UI
  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs || !devs.length) {
    infoDeviceIdEl.textContent = '--';
    infoDeviceNameEl.textContent = 'Nenhum dispositivo associado.';
    infoLocalIpEl.textContent = '--';
    infoLastSeenEl.textContent = '--';
    renderHealth(null);
    renderEvents([]);
    renderAlerts([]); // [FIX]
    updateOnlineUI(null);
    return;
  }

  await loadSystemForSelected();
  await loadAlertsForSelected(); // [FIX] Carregar alertas na inicialização

  // primeira atualização do card de online + agendar refresh periódico
  await refreshDevicesUI();
  setInterval(refreshDevicesUI, 30 * 1000);

  // [FIX] Refresh periódico de alertas (a cada 30s)
  setInterval(loadAlertsForSelected, 30 * 1000);

  // reagir à troca de device disparada pelo select global
  window.addEventListener('deviceChanged', () => {
    loadSystemForSelected();
    loadAlertsForSelected(); // [FIX] Atualizar alertas ao trocar device
  });
}



document.addEventListener('DOMContentLoaded', () => {
  initDashboardSistema().catch((err) =>
    console.error('initDashboardSistema error', err),
  );
});



