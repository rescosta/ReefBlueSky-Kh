// dashboard-dosing.js

const dosingDevicesBody = document.getElementById('dosingDevicesBody');
const dosingDevicesError = document.getElementById('dosingDevicesError');
const addDosingDeviceBtn = document.getElementById('addDosingDeviceBtn');

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
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardDosing().catch((err) =>
    console.error('initDashboardDosing error', err),
  );
});
