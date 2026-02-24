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

  // ============================================================================
  // LOGS DA DOSADORA
  // ============================================================================

  let allDosingLogs = [];
  let currentFilters = {
    log_type: '',
    log_level: '',
    pump_id: ''
  };

  async function loadDosingLogs() {
    try {
      // Por enquanto, buscar todos os logs do usuário (sem filtro de device)
      // TODO: Adicionar seletor de dispositivo quando tiver múltiplos
      const queryParams = new URLSearchParams({
        limit: 200
      });

      if (currentFilters.log_type) queryParams.append('log_type', currentFilters.log_type);
      if (currentFilters.log_level) queryParams.append('log_level', currentFilters.log_level);
      if (currentFilters.pump_id) queryParams.append('pump_id', currentFilters.pump_id);

      const res = await apiFetch(`/api/dosing-logs?${queryParams}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao carregar logs');
      }

      allDosingLogs = json.data || [];
      renderDosingLogs();
      updateDosingStats();

    } catch (err) {
      console.error('[Dosing Logs] Erro:', err);
      document.getElementById('dosingLogsBody').innerHTML =
        `<tr><td colspan="6" style="padding:20px; text-align:center; color:#ef4444;">Erro: ${err.message}</td></tr>`;
    }
  }

  function renderDosingLogs() {
    const tbody = document.getElementById('dosingLogsBody');
    if (!tbody) return;

    if (allDosingLogs.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="padding:20px; text-align:center; color:#6b7280;">Nenhum log encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = allDosingLogs.map(log => {
      const date = new Date(log.created_at);
      const dateStr = date.toLocaleString('pt-BR');

      // Cores por tipo
      const typeColors = {
        EXECUTION: '#22c55e',
        NOTIFICATION: '#3b82f6',
        ALERT: '#f59e0b',
        ERROR: '#ef4444',
        INFO: '#6b7280'
      };

      // Cores por nível
      const levelColors = {
        DEBUG: '#6b7280',
        INFO: '#3b82f6',
        WARNING: '#f59e0b',
        ERROR: '#ef4444',
        CRITICAL: '#dc2626'
      };

      const typeColor = typeColors[log.log_type] || '#9ca3af';
      const levelColor = levelColors[log.log_level] || '#9ca3af';

      const detailsStr = log.details ? JSON.stringify(log.details, null, 2) : '';

      return `
        <tr style="border-bottom: 1px solid #1f2937;">
          <td style="padding:8px; color:#e5e7eb; font-size:11px;">${dateStr}</td>
          <td style="padding:8px;">
            <span style="background:${typeColor}22; color:${typeColor}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">
              ${log.log_type}
            </span>
          </td>
          <td style="padding:8px;">
            <span style="background:${levelColor}22; color:${levelColor}; padding:2px 8px; border-radius:4px; font-size:11px;">
              ${log.log_level}
            </span>
          </td>
          <td style="padding:8px; color:#e5e7eb;">${log.pump_name || '-'}</td>
          <td style="padding:8px; color:#e5e7eb;">${log.message}</td>
          <td style="padding:8px;">
            ${detailsStr ? `<button onclick="showLogDetails(${log.id})" style="padding:2px 6px; font-size:11px; border:1px solid #374151; border-radius:4px; background:#020617; color:#9ca3af; cursor:pointer;">Ver</button>` : '-'}
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateDosingStats() {
    const total = allDosingLogs.length;
    const executions = allDosingLogs.filter(l => l.log_type === 'EXECUTION').length;
    const notifications = allDosingLogs.filter(l => l.log_type === 'NOTIFICATION').length;
    const errors = allDosingLogs.filter(l => l.log_type === 'ERROR' || l.log_level === 'ERROR' || l.log_level === 'CRITICAL').length;

    document.getElementById('totalLogs').textContent = total;
    document.getElementById('totalExecutions').textContent = executions;
    document.getElementById('totalNotifications').textContent = notifications;
    document.getElementById('totalErrors').textContent = errors;
  }

  // Função global para mostrar detalhes (chamada pelo onclick)
  window.showLogDetails = function(logId) {
    const log = allDosingLogs.find(l => l.id === logId);
    if (!log || !log.details) return;

    alert(JSON.stringify(log.details, null, 2));
  };

  // Event listeners
  const reloadDosingLogsBtn = document.getElementById('reloadDosingLogs');
  if (reloadDosingLogsBtn) {
    reloadDosingLogsBtn.addEventListener('click', loadDosingLogs);
  }

  const clearDosingLogsBtn = document.getElementById('clearDosingLogs');
  if (clearDosingLogsBtn) {
    clearDosingLogsBtn.addEventListener('click', async () => {
      if (!confirm('Limpar logs com mais de 30 dias?')) return;

      try {
        const res = await apiFetch('/api/dosing-logs/cleanup?days=30', { method: 'DELETE' });
        const json = await res.json();

        if (res.ok && json.success) {
          alert(json.message);
          loadDosingLogs();
        } else {
          alert('Erro: ' + (json.error || 'Falha ao limpar logs'));
        }
      } catch (err) {
        alert('Erro: ' + err.message);
      }
    });
  }

  // Filtros
  const filterLogType = document.getElementById('filterLogType');
  if (filterLogType) {
    filterLogType.addEventListener('change', (e) => {
      currentFilters.log_type = e.target.value;
      loadDosingLogs();
    });
  }

  const filterLogLevel = document.getElementById('filterLogLevel');
  if (filterLogLevel) {
    filterLogLevel.addEventListener('change', (e) => {
      currentFilters.log_level = e.target.value;
      loadDosingLogs();
    });
  }

  const filterPump = document.getElementById('filterPump');
  if (filterPump) {
    filterPump.addEventListener('change', (e) => {
      currentFilters.pump_id = e.target.value;
      loadDosingLogs();
    });
  }

  // Carregar logs ao mudar dispositivo
  window.addEventListener('deviceChanged', () => {
    loadDosingLogs();
  });

  // Carregar logs inicial
  loadDosingLogs();
});

