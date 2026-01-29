// dashboard-logs.js

const serverHealthStatusEl = document.getElementById('serverHealthStatus');

async function loadServerHealth() {
  if (!serverHealthStatusEl) return;

  try {
    const res = await apiFetch('/api/v1/dev/server-health');
    const json = await res.json();

    if (!res.ok || !json.success) {
      serverHealthStatusEl.textContent =
        'Saúde do servidor: erro ao carregar.';
      serverHealthStatusEl.style.color = '#f97373';
      return;
    }

    const {
      cpuPct,
      memPct,
      diskPct,
      uptimeSeconds,
      netType,
      wifiRssi,
      pendingCommands,
      version,
    } = json.data || {};

    let label = 'OK';
    let color = '#4ade80';

    if (cpuPct > 90 || memPct > 90 || diskPct > 90) {
      label = 'Crítico';
      color = '#f97373';
    } else if (cpuPct > 70 || memPct > 70 || diskPct > 70) {
      label = 'Atenção';
      color = '#facc15';
    }

    // Base
    let text = `Saúde do servidor: ${label} — CPU ${cpuPct}% / MEM ${memPct}% / DISK ${diskPct}%`;

    // Rede
    if (netType === 'lan') {
      text += ' / Rede: LAN';
    } else if (netType === 'wifi') {
      if (typeof wifiRssi === 'number') {
        const clamped = Math.max(-90, Math.min(-30, wifiRssi));
        const wifiPct = Math.round(((clamped + 90) / 60) * 100);
        text += ` / Rede: Wi‑Fi ${wifiPct}% (${wifiRssi} dBm)`;
      } else {
        text += ' / Rede: Wi‑Fi';
      }
    } else if (netType === 'both') {
      text += ' / Rede: LAN+Wi‑Fi';
    }



    // Uptime
    if (typeof uptimeSeconds === 'number') {
      const s = Math.floor(uptimeSeconds);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      text += ` — Uptime ${d}d ${h}h ${m}m`;
    }

    // Comandos pendentes
    if (typeof pendingCommands === 'number' && pendingCommands > 0) {
      text += ` — ${pendingCommands} cmds pendentes`;
    }

    // Versão
    if (version) {
      text += ` (v${version})`;
    }

    serverHealthStatusEl.textContent = text;
    serverHealthStatusEl.style.color = color;
  } catch (err) {
    console.error('loadServerHealth error', err);
    serverHealthStatusEl.textContent =
      'Saúde do servidor: erro ao carregar.';
    serverHealthStatusEl.style.color = '#f97373';
  }
}


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
  if (logsPollHandle) clearInterval(logsPollHandle);

  // primeira carga imediata
  await loadServerHealth(); 
  await loadServerConsole();
  await loadDeviceConsole();

  // depois fica atualizando
  logsPollHandle = setInterval(async () => {
    await loadServerHealth();
    await loadServerConsole();
    await loadDeviceConsole();
  }, 5000); // 5s
}


async function initDashboardLogs() {
  await DashboardCommon.initTopbar();

  const dosingBtn = document.getElementById('dosingBtn');
  if (dosingBtn) {
    dosingBtn.addEventListener('click', () => {
      window.location.href = 'dashboard-dosing.html';
    });
  }

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    const devEl = document.getElementById('deviceConsole');
    if (devEl) devEl.textContent = 'Nenhum dispositivo associado.';
    return;
  }

  // NOVO: espelha comportamento das outras abas
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
        window.DashboardCommon &&
        typeof DashboardCommon.setLcdStatus === 'function'
      ) {
        const st = json.data.lcdStatus;
        // mesmo filtro da aba Sistema
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

