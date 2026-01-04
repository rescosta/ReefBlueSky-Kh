// dashboard-logs.js


async function loadServerConsole() {
  try {
    const res = await apiFetch('/api/v1/dev/server-console');
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

function clearServerConsoleUI() {
  const el = document.getElementById('serverConsole');
  if (el) {
    el.textContent = '';
    el.scrollTop = 0;
  }
}


async function loadDeviceConsole() {
  try {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const res = await apiFetch(`/api/v1/dev/device-console/${encodeURIComponent(deviceId)}`);
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

let logsPollHandle = null;

async function startLogsPolling() {
  // evita múltiplos timers
  if (logsPollHandle) clearInterval(logsPollHandle);

  // primeira carga imediata
  await loadServerConsole();
  await loadDeviceConsole();

  // depois fica atualizando
  logsPollHandle = setInterval(async () => {
    await loadServerConsole();
    await loadDeviceConsole();
  }, 5000); // 5s; ajusta como quiser
}


async function initDashboardLogs() {
  await DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    const devEl = document.getElementById('deviceConsole');
    if (devEl) devEl.textContent = 'Nenhum dispositivo associado.';
    return;
  }

  const currentId = DashboardCommon.getSelectedDeviceId();
  if (currentId) {
    try {
      const resp = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(currentId)}/kh-config`,
      );
      const json = await resp.json();
      if (
        resp.ok &&
        json.success &&
        json.data &&
        typeof DashboardCommon.setLcdStatus === 'function'
      ) {
        const st = json.data.lcdStatus;
        if (st === 'online' || st === 'offline') {
          DashboardCommon.setLcdStatus(st);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar lcdStatus na aba Logs', e);
    }
  }

  await startLogsPolling();

}

async function sendDeviceCommand() {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) return;

  const input = document.getElementById('deviceCommandInput');
  if (!input) return;
  const cmd = input.value.trim();
  if (!cmd) return;

  try {
    const res = await apiFetch(
      `/api/v1/dev/device-command/${encodeURIComponent(deviceId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ command: cmd }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao enviar comando');
      return;
    }
    input.value = '';
    // força recarregar log pra ver a resposta
    await loadDeviceConsole();
  } catch (err) {
    console.error('sendDeviceCommand error', err);
  }
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

  // NOVO: limpar console do servidor
  const btnClearSrv = document.getElementById('clearServerConsole');
  if (btnClearSrv) btnClearSrv.addEventListener('click', (e) => {
    e.preventDefault();
    clearServerConsoleUI();
  });

  const sendBtn = document.getElementById('sendDeviceCommand');
  if (sendBtn) sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendDeviceCommand();
  });

  const cmdInput = document.getElementById('deviceCommandInput');
  if (cmdInput) cmdInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendDeviceCommand();
    }
  });

  window.addEventListener('deviceChanged', () => {
    loadDeviceConsole();
  });
});

