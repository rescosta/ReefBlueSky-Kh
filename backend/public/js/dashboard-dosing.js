// dashboard-dosing.js - Dosadora Balling Dashboard
// Integrado com ReefBlueSky - Versão Refatorada

let currentDeviceId = null;
let currentPumpIndex = null;
let currentDeviceName = null;
let cachedPumps = [];

// ===== DOM Elements =====
const deviceSelect = document.getElementById('deviceSelect');
const deviceInfo = document.getElementById('deviceInfo');
const pumpDropdown = document.getElementById('pumpDropdown');
const pumpsTable = document.getElementById('pumpsTable');
const pumpsTableBody = document.getElementById('pumpsTableBody');

// Tabs
const tabConfiguracoes = document.getElementById('tabConfiguracoes');
const tabAgenda = document.getElementById('tabAgenda');
const tabTimers = document.getElementById('tabTimers');
const tabManual = document.getElementById('tabManual');
const tabCalibracao = document.getElementById('tabCalibracao');

const viewConfiguracoes = document.getElementById('viewConfiguracoes');
const viewAgenda = document.getElementById('viewAgenda');
const viewTimers = document.getElementById('viewTimers');
const viewManual = document.getElementById('viewManual');
const viewCalibracao = document.getElementById('viewCalibracao');

// Modals
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const closeEditBtn = document.querySelector('.close-edit');

const agendaModal = document.getElementById('agendaModal');
const agendaForm = document.getElementById('agendaForm');
const closeAgendaBtn = document.querySelector('.close-agenda');

// ===== Utility Functions =====
function getAccessToken() {
  return localStorage.getItem('token');
}

function showError(msg) {
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.textContent = `❌ ${msg}`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

function showSuccess(msg) {
  const div = document.createElement('div');
  div.className = 'success-msg';
  div.textContent = `✅ ${msg}`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3000);
}

// ===== Device Selection =====
async function loadDevices() {
  const token = getAccessToken();
  if (!token) {
    showError('Token não encontrado');
    return;
  }

  try {
    const res = await fetch('/api/v1/user/dosing/devices', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao carregar devices');

    const devices = json.data || [];
    deviceSelect.innerHTML = '';

    if (devices.length === 0) {
      deviceSelect.innerHTML = '<option value="">Nenhum device cadastrado</option>';
      return;
    }

    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.hw_type})`;
      deviceSelect.appendChild(opt);
    }

    // Auto-select first
    if (devices.length > 0) {
      deviceSelect.value = devices[0].id;
      currentDeviceId = devices[0].id;
      currentDeviceName = devices[0].name;
      updateDeviceInfo(devices[0]);
      await loadPumps(devices[0].id);
    }
  } catch (err) {
    console.error('Erro ao carregar devices:', err);
    showError(err.message);
  }
}

function updateDeviceInfo(device) {
  deviceInfo.innerHTML = `
    <strong>${device.name}</strong> • ${device.hw_type} • 
    ${device.online ? '🟢 Online' : '🔴 Offline'} • 
    ${device.pump_count || 0} bombas
  `;
}

deviceSelect.addEventListener('change', async (e) => {
  const deviceId = e.target.value;
  if (!deviceId) return;

  const devices = document.querySelectorAll('[data-device-id]');
  for (const opt of deviceSelect.options) {
    if (opt.value === deviceId) {
      currentDeviceId = deviceId;
      currentDeviceName = opt.textContent;
      break;
    }
  }

  // Fetch device info
  const token = getAccessToken();
  try {
    const res = await fetch('/api/v1/user/dosing/devices', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await res.json();
    const device = json.data.find(d => d.id == deviceId);
    if (device) {
      updateDeviceInfo(device);
    }
  } catch (err) {
    console.error(err);
  }

  await loadPumps(deviceId);
});

// ===== Pumps =====
async function loadPumps(deviceId) {
  const token = getAccessToken();
  if (!token || !deviceId) return;

  try {
    const res = await fetch(`/api/v1/user/dosing/devices/${deviceId}/pumps`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao carregar bombas');

    cachedPumps = json.data || [];
    renderPumpDropdown();
    renderPumpsTable();

    // Load schedules for first pump
    if (cachedPumps.length > 0) {
      currentPumpIndex = cachedPumps[0].index_on_device;
      pumpDropdown.value = currentPumpIndex;
      await loadSchedules(deviceId, currentPumpIndex);
    }
  } catch (err) {
    console.error('Erro ao carregar bombas:', err);
    showError(err.message);
  }
}

function renderPumpDropdown() {
  pumpDropdown.innerHTML = '';
  for (const p of cachedPumps) {
    const opt = document.createElement('option');
    opt.value = p.index_on_device;
    opt.textContent = `${p.index_on_device + 1} - ${p.name}`;
    pumpDropdown.appendChild(opt);
  }
}

function renderPumpsTable() {
  pumpsTableBody.innerHTML = '';
  for (const p of cachedPumps) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.index_on_device + 1}</td>
      <td>${p.name}</td>
      <td>${p.enabled ? '✓ Ativa' : '✗ Inativa'}</td>
      <td>${p.container_volume_ml || '--'}</td>
      <td>${p.current_volume_ml || '--'}</td>
      <td>${p.alarm_threshold_pct || '--'}%</td>
      <td>${p.max_daily_ml || '--'}</td>
      <td>
        <button class="btn-edit" data-index="${p.index_on_device}">Editar</button>
      </td>
    `;

    const editBtn = tr.querySelector('.btn-edit');
    editBtn.addEventListener('click', () => openEditModal(p));

    pumpsTableBody.appendChild(tr);
  }
}

// ===== Edit Modal =====
function openEditModal(pump) {
  currentPumpIndex = pump.index_on_device;

  // Preencher campos do modal
  document.getElementById('editPumpName').value = pump.name;
  document.getElementById('editContainerSize').value = pump.container_volume_ml || 500;
  document.getElementById('editCurrentVolume').value = pump.current_volume_ml || 0;
  document.getElementById('editAlarmPercent').value = pump.alarm_threshold_pct || 10;
  document.getElementById('editDailyMax').value = pump.max_daily_ml || 100;

  editModal.style.display = 'flex';
}

closeEditBtn.addEventListener('click', () => {
  editModal.style.display = 'none';
});

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('editPumpName').value;
  const container_size = parseInt(document.getElementById('editContainerSize').value);
  const current_volume = parseInt(document.getElementById('editCurrentVolume').value);
  const alarm_percent = parseInt(document.getElementById('editAlarmPercent').value);
  const daily_max = parseInt(document.getElementById('editDailyMax').value);

  const token = getAccessToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${currentDeviceId}/pumps/${currentPumpIndex}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          active: true,
          container_size,
          current_volume,
          alarm_percent,
          daily_max
        })
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao atualizar bomba');

    showSuccess('Bomba atualizada com sucesso!');
    editModal.style.display = 'none';
    await loadPumps(currentDeviceId);
  } catch (err) {
    console.error('Erro ao atualizar bomba:', err);
    showError(err.message);
  }
});

// ===== Pump Selection (Dropdown) =====
pumpDropdown.addEventListener('change', async (e) => {
  currentPumpIndex = parseInt(e.target.value);
  await loadSchedules(currentDeviceId, currentPumpIndex);
});

// ===== Schedules (Agendas) =====
async function loadSchedules(deviceId, pumpIndex) {
  const token = getAccessToken();
  if (!token || deviceId == null || pumpIndex == null) return;

  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${deviceId}/pumps/${pumpIndex}/schedules`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao carregar agendas');

    renderSchedulesTable(json.data || []);
  } catch (err) {
    console.error('Erro ao carregar agendas:', err);
    showError(err.message);
  }
}

function renderSchedulesTable(schedules) {
  const tbody = document.getElementById('schedulesTableBody');
  tbody.innerHTML = '';

  if (!schedules.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" style="text-align: center;">Nenhuma agenda para esta bomba.</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const sched of schedules) {
    const days = Array.isArray(sched.days_of_week)
      ? sched.days_of_week.map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'][d]).join(', ')
      : '--';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${sched.enabled ? '✓' : '✗'}</td>
      <td>${days}</td>
      <td>${sched.doses_per_day}</td>
      <td>${sched.start_time} - ${sched.end_time}</td>
      <td>${sched.volume_per_day_ml}</td>
      <td>
        <button class="btn-delete" data-id="${sched.id}">Deletar</button>
      </td>
    `;

    const delBtn = tr.querySelector('.btn-delete');
    delBtn.addEventListener('click', async () => {
      if (confirm('Deletar esta agenda?')) {
        await deleteSchedule(sched.id);
      }
    });

    tbody.appendChild(tr);
  }
}

async function deleteSchedule(scheduleId) {
  const token = getAccessToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${currentDeviceId}/pumps/${currentPumpIndex}/schedules/${scheduleId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao deletar agenda');

    showSuccess('Agenda deletada!');
    await loadSchedules(currentDeviceId, currentPumpIndex);
  } catch (err) {
    console.error('Erro ao deletar agenda:', err);
    showError(err.message);
  }
}

// ===== Create Agenda Modal =====
closeAgendaBtn.addEventListener('click', () => {
  agendaModal.style.display = 'none';
});

agendaForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const daysOfWeek = [];
  for (let i = 0; i < 7; i++) {
    const cb = document.getElementById(`dayCheckbox${i}`);
    if (cb && cb.checked) {
      daysOfWeek.push(i);
    }
  }

  const dosesPerDay = parseInt(document.getElementById('agendaDosesPerDay').value);
  const startTime = document.getElementById('agendaStartTime').value;
  const endTime = document.getElementById('agendaEndTime').value;
  const volumePerDay = parseInt(document.getElementById('agendaVolumePerDay').value);

  if (!daysOfWeek.length || !dosesPerDay || !startTime || !endTime || !volumePerDay) {
    showError('Preencha todos os campos');
    return;
  }

  const token = getAccessToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${currentDeviceId}/pumps/${currentPumpIndex}/schedules`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          doses_per_day: dosesPerDay,
          start_time: startTime,
          end_time: endTime,
          volume_per_day: volumePerDay,
          days_of_week: daysOfWeek
        })
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao criar agenda');

    showSuccess('Agenda criada com sucesso!');
    agendaModal.style.display = 'none';
    agendaForm.reset();
    await loadSchedules(currentDeviceId, currentPumpIndex);
  } catch (err) {
    console.error('Erro ao criar agenda:', err);
    showError(err.message);
  }
});

// ===== Manual Dose =====
document.getElementById('manualDoseBtn').addEventListener('click', async () => {
  const volume = parseInt(document.getElementById('manualDoseVolume').value);
  if (!volume || volume <= 0) {
    showError('Digite um volume válido');
    return;
  }

  const token = getAccessToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${currentDeviceId}/pumps/${currentPumpIndex}/manual`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ volume })
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao aplicar dose');

    showSuccess(`Dose de ${volume}mL aplicada!`);
    document.getElementById('manualDoseVolume').value = '';
  } catch (err) {
    console.error('Erro ao aplicar dose manual:', err);
    showError(err.message);
  }
});

// ===== Calibration =====
document.getElementById('calibrateStartBtn').addEventListener('click', async () => {
  const token = getAccessToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${currentDeviceId}/pumps/${currentPumpIndex}/calibrate/start`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao iniciar calibração');

    showSuccess('Calibração iniciada! Aguarde 10 segundos...');
    document.getElementById('calibrateStartBtn').disabled = true;

    setTimeout(() => {
      document.getElementById('calibrateStartBtn').disabled = false;
    }, 10000);
  } catch (err) {
    console.error('Erro ao iniciar calibração:', err);
    showError(err.message);
  }
});

document.getElementById('calibrateSaveBtn').addEventListener('click', async () => {
  const measuredVolume = parseFloat(document.getElementById('calibrateMeasuredVolume').value);
  if (!measuredVolume || measuredVolume <= 0) {
    showError('Digite o volume medido');
    return;
  }

  const token = getAccessToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${currentDeviceId}/pumps/${currentPumpIndex}/calibrate/save`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ measured_volume: measuredVolume })
      }
    );

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao salvar calibração');

    showSuccess(`Calibração salva! Taxa: ${json.data.ml_per_second} mL/s`);
    document.getElementById('calibrateMeasuredVolume').value = '';
    await loadPumps(currentDeviceId);
  } catch (err) {
    console.error('Erro ao salvar calibração:', err);
    showError(err.message);
  }
});

// ===== Tabs Navigation =====
function initTabs() {
  const tabs = [
    { btn: tabConfiguracoes, view: viewConfiguracoes },
    { btn: tabAgenda, view: viewAgenda },
    { btn: tabTimers, view: viewTimers },
    { btn: tabManual, view: viewManual },
    { btn: tabCalibracao, view: viewCalibracao }
  ];

  tabs.forEach(({ btn, view }) => {
    if (!btn || !view) return;

    btn.addEventListener('click', () => {
      tabs.forEach(t => {
        if (t.btn) t.btn.classList.remove('active');
        if (t.view) t.view.style.display = 'none';
      });

      btn.classList.add('active');
      view.style.display = 'block';
    });
  });

  // Show first tab by default
  if (tabConfiguracoes && viewConfiguracoes) {
    tabConfiguracoes.classList.add('active');
    viewConfiguracoes.style.display = 'block';
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadDevices();

  // Button to open agenda modal
  if (document.getElementById('addScheduleBtn')) {
    document.getElementById('addScheduleBtn').addEventListener('click', () => {
      // Reset checkboxes
      for (let i = 0; i < 7; i++) {
        const cb = document.getElementById(`dayCheckbox${i}`);
        if (cb) cb.checked = i !== 0; // Default: all days except Sunday
      }
      agendaForm.reset();
      agendaModal.style.display = 'flex';
    });
  }
});