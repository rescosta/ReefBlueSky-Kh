// dashboard-sistema.js

const sysToken = localStorage.getItem('token');
if (!sysToken) {
  window.location.href = 'login';
}

const headersAuthSys = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${sysToken}`,
};

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

function classifyWifi(rssi) {
  if (rssi == null || Number.isNaN(rssi)) return 'health-bad';
  if (rssi >= -60) return 'health-ok';
  if (rssi >= -75) return 'health-warn';
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

    infoDeviceIdEl.textContent = dev.deviceId;
    infoDeviceNameEl.textContent =
      dev.name && dev.name.trim() ? dev.name : dev.deviceId;
    infoLocalIpEl.textContent = dev.localIp || dev.localip || '--';

    const last = dev.lastSeen || dev.lastseen;
    if (last) {
      const ts =
        typeof last === 'number' ? last : Date.parse(last);
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

async function refreshDevicesUI() {
  const devs = await DashboardCommon.loadDevicesCommon(); // já existe
  const selectedId = DashboardCommon.getSelectedDeviceId();

  // exemplo: marcar status em algum elemento de UI
  const statusEl = document.getElementById('deviceOnlineStatus');
  const dev = devs.find((d) => d.deviceId === selectedId);

  if (!dev) {
    if (statusEl) statusEl.textContent = '--';
    return;
  }

  const last = dev.lastSeen || dev.lastseen;
  const ts = last ? (typeof last === 'number' ? last : Date.parse(last)) : null;
  const online = isDeviceOnline(ts);

  if (statusEl) {
    statusEl.textContent = online ? 'ONLINE' : 'OFFLINE';
    statusEl.className = online ? 'badge-online' : 'badge-offline';
  }
}

setInterval(refreshDevicesUI, 30 * 1000);
document.addEventListener('DOMContentLoaded', refreshDevicesUI);



// Stubs de API para saúde e comandos

async function apiLoadDeviceHealth(deviceId) {
  // Futuro: GET /api/v1/user/devices/:deviceId/health
  console.log('LOAD health', deviceId);
  try {
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/health`,
      { headers: headersAuthSys },
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
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/events`,
      { headers: headersAuthSys },
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
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
      {
        method: 'POST',
        headers: headersAuthSys,
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

  const cpu = health.cpuUsage ?? health.cpu ?? null;
  const mem = health.memoryUsage ?? health.mem ?? null;
  const storage = health.storageUsage ?? health.storage ?? null;
  const wifi = health.wifiRssi ?? health.rssi ?? null;
  const uptime = health.uptimeSeconds ?? health.uptime ?? null;

  healthCpuEl.textContent =
    cpu != null ? `${cpu.toFixed(0)}%` : '--';
  healthCpuEl.className = `health-value ${classifyPercent(cpu)}`;

  healthMemEl.textContent =
    mem != null ? `${mem.toFixed(0)}%` : '--';
  healthMemEl.className = `health-value ${classifyPercent(mem)}`;

  healthStorageEl.textContent =
    storage != null ? `${storage.toFixed(0)}%` : '--';
  healthStorageEl.className = `health-value ${classifyPercent(storage)}`;

  healthWifiEl.textContent =
    wifi != null ? `${wifi} dBm` : '--';
  healthWifiEl.className = `health-value ${classifyWifi(wifi)}`;

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
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) {
    infoDeviceIdEl.textContent = '--';
    infoDeviceNameEl.textContent = '--';
    infoLocalIpEl.textContent = '--';
    infoLastSeenEl.textContent = '--';
    renderHealth(null);
    renderEvents([]);
    return;
  }

  updateDeviceInfoFromList();

  const [health, events] = await Promise.all([
    apiLoadDeviceHealth(deviceId),
    apiLoadDeviceEvents(deviceId),
  ]);

  renderHealth(health);
  renderEvents(events);
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
  const ok = await apiSendCommand(deviceId, 'reset_kh');
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
  const ok = await apiSendCommand(deviceId, 'factory_reset');
  cmdStatusEl.textContent = ok
    ? 'Comando de reset de fábrica enviado.'
    : 'Erro ao enviar comando de reset de fábrica.';
});

async function initDashboardSistema() {
  await DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    infoDeviceIdEl.textContent = '--';
    infoDeviceNameEl.textContent = 'Nenhum dispositivo associado.';
    infoLocalIpEl.textContent = '--';
    infoLastSeenEl.textContent = '--';
    renderHealth(null);
    renderEvents([]);
    return;
  }

  await loadSystemForSelected();
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardSistema().catch((err) =>
    console.error('initDashboardSistema error', err),
  );
});

window.addEventListener('deviceChanged', () => {
  loadSystemForSelected();
});
