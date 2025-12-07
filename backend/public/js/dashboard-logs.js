// dashboard-logs.js

const logsToken = localStorage.getItem('token');
if (!logsToken) {
  window.location.href = 'login';
}

const logsBody = document.getElementById('logsBody');
const logsInfo = document.getElementById('logsInfo');
const loadLogsBtn = document.getElementById('loadLogsBtn');
const fromInput = document.getElementById('fromInput');
const toInput = document.getElementById('toInput');

function formatDateTime(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// Converte datetime-local para epoch ms
function dateTimeLocalToMs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function renderLogs(measures) {
  logsBody.innerHTML = '';

  if (!measures || !measures.length) {
    logsInfo.textContent = 'Nenhum log encontrado para o período.';
    return;
  }

  logsInfo.textContent = `${measures.length} registros carregados.`;

  measures.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDateTime(m.timestamp)}</td>
      <td>${typeof m.kh === 'number' ? m.kh.toFixed(2) : (m.kh ?? '--')}</td>
      <td>${m.phref ?? '--'}</td>
      <td>${m.phsample ?? '--'}</td>
      <td>${m.temperature ?? '--'}</td>
      <td>${m.status ?? '--'}</td>
    `;
    logsBody.appendChild(tr);
  });
}

async function loadLogsForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    logsInfo.textContent = 'Nenhum dispositivo associado.';
    logsBody.innerHTML = '';
    return;
  }

  const fromMs = dateTimeLocalToMs(fromInput.value);
  const toMs = dateTimeLocalToMs(toInput.value);

  const params = new URLSearchParams();
  if (fromMs) params.append('from', String(fromMs));
  if (toMs) params.append('to', String(toMs));

  const qs = params.toString();
  const url = qs
    ? `/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements?${qs}`
    : `/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${logsToken}` },
    });
    const json = await res.json();
    if (!json.success) {
      console.error(json.message || 'Erro ao buscar logs');
      logsInfo.textContent = 'Erro ao carregar logs.';
      logsBody.innerHTML = '';
      return;
    }

    const measures = json.data || [];
    renderLogs(measures);
  } catch (err) {
    console.error('loadLogsForSelected error', err);
    logsInfo.textContent = 'Erro de comunicação ao carregar logs.';
    logsBody.innerHTML = '';
  }
}

async function initDashboardLogs() {
  await DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    logsInfo.textContent = 'Nenhum dispositivo associado.';
    logsBody.innerHTML = '';
    return;
  }

  await loadLogsForSelected();
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardLogs().catch((err) =>
    console.error('initDashboardLogs error', err),
  );

  loadLogsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loadLogsForSelected();
  });
});

// Reage à troca de device no topo
window.addEventListener('deviceChanged', () => {
  loadLogsForSelected();
});
