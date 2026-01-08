// dashboard-dosing.js

const dosingDevicesBody = document.getElementById('dosingDevicesBody');
const dosingDevicesError = document.getElementById('dosingDevicesError');
const addDosingDeviceBtn = document.getElementById('addDosingDeviceBtn');

const pumpsTableBody     = document.getElementById('pumpsTableBody');
const addPumpBtn         = document.getElementById('addPumpBtn');
const pumpNameInput      = document.getElementById('pumpNameInput');
const pumpIndexInput     = document.getElementById('pumpIndexInput');
const pumpVolumeInput    = document.getElementById('pumpVolumeInput');
const pumpRateInput      = document.getElementById('pumpRateInput');
const pumpAlarmInput     = document.getElementById('pumpAlarmInput');
const pumpDailyMaxInput  = document.getElementById('pumpDailyMaxInput');


function showDosingError(msg) {
  if (!dosingDevicesError) return;
  dosingDevicesError.textContent = `Erro ao carregar devices: ${msg}`;
  dosingDevicesError.style.display = 'block';
}

function renderDosingDevices(devices) {
  dosingDevicesError.style.display = 'none';
  dosingDevicesBody.innerHTML = '';

  if (!devices.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'Nenhum device dosadora cadastrado.';
    tr.appendChild(td);
    dosingDevicesBody.appendChild(tr);
    return;
  }

  for (const d of devices) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = d.name;
    tr.appendChild(nameTd);

    const hwTd = document.createElement('td');
    hwTd.textContent = d.hw_type;
    tr.appendChild(hwTd);

    const onlineTd = document.createElement('td');
    onlineTd.textContent = d.online ? 'Online' : 'Offline';
    tr.appendChild(onlineTd);

    const lastSeenTd = document.createElement('td');
    lastSeenTd.textContent = d.last_seen
      ? new Date(d.last_seen).toLocaleString()
      : '--';
    tr.appendChild(lastSeenTd);

    const pumpsTd = document.createElement('td');
    pumpsTd.textContent = d.pump_count ?? 0;
    tr.appendChild(pumpsTd);

    const actionsTd = document.createElement('td');
    actionsTd.textContent = '...'; // depois colocamos botões
    tr.appendChild(actionsTd);

    dosingDevicesBody.appendChild(tr);
  }
}

async function loadDosingDevices() {
  const token = localStorage.getItem('jwtToken');
  if (!token) {
    showDosingError('Não autenticado.');
    return;
  }

  try {
    const res = await fetch('/api/v1/user/dosing/devices', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) {
      showDosingError(data && data.error ? data.error : 'Erro ao carregar.');
      return;
    }

    renderDosingDevices(data.data || []);
  } catch (err) {
    console.error('Erro ao carregar devices dosadora:', err);
    showDosingError('Falha de comunicação com o servidor.');
  }
}


function initDosingTabs() {
  const tabs = {
    tabDashboard: 'dosingDashboardView',
    tabDevices: 'dosingDevicesView',
    tabPumps: 'dosingPumpsView',
    tabSchedules: 'dosingSchedulesView',
    tabHistory: 'dosingHistoryView',
  };

  Object.entries(tabs).forEach(([btnId, viewId]) => {
    const btn = document.getElementById(btnId);
    const view = document.getElementById(viewId);
    if (!btn || !view) return;

    btn.addEventListener('click', () => {
      // ativa/desativa botões
      Object.keys(tabs).forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.classList.toggle('active', id === btnId);
      });
      // mostra/esconde views
      Object.values(tabs).forEach((vid) => {
        const v = document.getElementById(vid);
        if (v) v.style.display = vid === viewId ? 'block' : 'none';
      });
    });
  });
}

function renderPumps(pumps) {
  if (!pumpsTableBody) return;
  pumpsTableBody.innerHTML = '';

  if (!pumps || !pumps.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Nenhuma bomba configurada para este device.';
    tr.appendChild(td);
    pumpsTableBody.appendChild(tr);
    return;
  }

  for (const p of pumps) {
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${p.name ?? '--'}</td>
      <td>${p.index ?? '--'}</td>
      <td>${p.calibration_rate_ml_s?.toFixed?.(2) ?? p.calibration_rate_ml_s ?? '--'}</td>
      <td>${p.daily_max_ml ?? '--'}</td>
      <td>${p.reservoir_volume_ml ?? '--'}</td>
      <td>${p.alarm_threshold_percent ?? '--'}</td>
      <td>
        <button class="btn-small" data-pump-id="${p.id}" data-action="delete">Remover</button>
      </td>
    `;

    pumpsTableBody.appendChild(tr);
  }

  // listeners de remover
  pumpsTableBody.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pumpId = btn.getAttribute('data-pump-id');
      if (!pumpId) return;
      if (!confirm('Remover esta bomba?')) return;

      try {
        const token = localStorage.getItem('jwtToken');
        await fetch(`/api/v1/user/dosing/pumps/${encodeURIComponent(pumpId)}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        await loadPumpsForSelected();
      } catch (err) {
        console.error('Erro ao remover bomba:', err);
      }
    });
  });
}

async function loadPumpsForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId || !pumpsTableBody) return;

  const token = localStorage.getItem('jwtToken');
  if (!token) return;

  try {
    const res = await fetch(
      `/api/v1/user/dosing/pumps?device_id=${encodeURIComponent(deviceId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('Erro ao carregar bombas:', data?.error);
      renderPumps([]);
      return;
    }
    renderPumps(data.data || []);
  } catch (err) {
    console.error('Erro ao carregar bombas:', err);
    renderPumps([]);
  }
}

if (addPumpBtn) {
  addPumpBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) {
      alert('Selecione um device de dosadora no topo.');
      return;
    }

    const name  = pumpNameInput?.value?.trim();
    const index = Number(pumpIndexInput?.value);
    const volume  = Number(pumpVolumeInput?.value);
    const rate    = Number(pumpRateInput?.value);
    const alarm   = Number(pumpAlarmInput?.value);
    const dailyMax = Number(pumpDailyMaxInput?.value);

    if (!name || Number.isNaN(index)) {
      alert('Informe ao menos Nome e Índice da bomba.');
      return;
    }

    try {
      const token = localStorage.getItem('jwtToken');
      const res = await fetch('/api/v1/user/dosing/pumps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device_id: deviceId,
          name,
          index,
          reservoir_volume_ml: Number.isNaN(volume) ? null : volume,
          calibration_rate_ml_s: Number.isNaN(rate) ? null : rate,
          alarm_threshold_percent: Number.isNaN(alarm) ? null : alarm,
          daily_max_ml: Number.isNaN(dailyMax) ? null : dailyMax,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.success === false) {
        console.error('Erro ao criar bomba:', data);
        alert(data.error || 'Erro ao criar bomba.');
        return;
      }

      // limpa nome/índice se quiser
      if (pumpNameInput) pumpNameInput.value = '';
      if (pumpIndexInput) pumpIndexInput.value = '';

      await loadPumpsForSelected();
    } catch (err) {
      console.error('Erro ao criar bomba:', err);
      alert('Falha de comunicação ao criar bomba.');
    }
  });
}


async function initDashboardDosing() {
  await DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    showDosingError('Nenhum dispositivo associado.');
    initDosingTabs();
    return;
  }

  // sincroniza LCD com o device selecionado, igual tela de gráficos
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (deviceId) {
    try {
      const resp = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
      );
      const json = await resp.json();
      if (
        resp.ok &&
        json.success &&
        json.data &&
        typeof DashboardCommon.setLcdStatus === 'function'
      ) {
        DashboardCommon.setLcdStatus(json.data.lcdStatus);
      }
    } catch (e) {
      console.error('Erro ao carregar lcdStatus na tela Dosadora', e);
    }
  }
  initDosingTabs();
  await loadDosingDevices();
  await loadPumpsForSelected();
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardDosing().catch((err) =>
    console.error('initDashboardDosing error', err),
  );
});

window.addEventListener('deviceChanged', async () => {
  await loadDosingDevices();
  await loadPumpsForSelected();
});

