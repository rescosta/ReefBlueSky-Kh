// dashboard-logs.js

const logsToken = localStorage.getItem('token');
if (!logsToken) {
  window.location.href = 'login';
}

async function loadServerConsole() {
  try {
    const res = await fetch('/api/v1/dev/server-console', {
      headers: API_HEADERS(),
    });
    const json = await res.json();
    const el = document.getElementById('serverConsole');
    if (!el) return;

    if (!res.ok || !json.success) {
      el.textContent = 'Erro ao carregar console do servidor.';
      return;
    }

    el.textContent = (json.data || []).join('\n');
    el.scrollTop = el.scrollHeight;
  } catch (err) {
    console.error('loadServerConsole error', err);
    const el = document.getElementById('serverConsole');
    if (el) el.textContent = 'Erro ao carregar console do servidor.';
  }
}

async function loadDeviceConsole() {
  try {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const res = await fetch(`/api/v1/dev/device-console/${encodeURIComponent(deviceId)}`, {
      headers: API_HEADERS(),
    });
    const json = await res.json();
    const el = document.getElementById('deviceConsole');
    if (!el) return;

    if (!res.ok || !json.success) {
      el.textContent = 'Erro ao carregar console do dispositivo.';
      return;
    }

    el.textContent = (json.data || []).join('\n');
    el.scrollTop = el.scrollHeight;
  } catch (err) {
    console.error('loadDeviceConsole error', err);
    const el = document.getElementById('deviceConsole');
    if (el) el.textContent = 'Erro ao carregar console do dispositivo.';
  }
}


async function initDashboardLogs() {
  await DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    const devEl = document.getElementById('deviceConsole');
    if (devEl) devEl.textContent = 'Nenhum dispositivo associado.';
    return;
  }

  await loadServerConsole();
  await loadDeviceConsole();
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardLogs().catch((err) =>
    console.error('initDashboardLogs error', err),
  );

  const btnDev = document.getElementById('reloadDeviceConsole');
  if (btnDev) btnDev.addEventListener('click', (e) => {
    e.preventDefault();
    loadDeviceConsole();
  });

  const btnSrv = document.getElementById('reloadServerConsole');
  if (btnSrv) btnSrv.addEventListener('click', (e) => {
    e.preventDefault();
    loadServerConsole();
  });

  // Reage à troca de device no topo
  window.addEventListener('deviceChanged', () => {
    loadDeviceConsole();
  });
});

