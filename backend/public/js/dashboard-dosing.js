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

async function initDashboardDosing() {
  await DashboardCommon.initTopbar();
  await DashboardCommon.loadDevicesCommon(); // só pro seletor do topo, se quiser
  await loadDosingDevices();
}

document.addEventListener('DOMContentLoaded', initDashboardDosing);


window.addEventListener('deviceChanged', async () => {
  await loadDosingDevices();
});
