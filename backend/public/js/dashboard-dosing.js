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


const schedulePumpSelect   = document.getElementById('schedulePumpSelect');
const scheduleDosesPerDay  = document.getElementById('scheduleDosesPerDay');
const scheduleStartTime    = document.getElementById('scheduleStartTime');
const scheduleEndTime      = document.getElementById('scheduleEndTime');
const scheduleVolumePerDay = document.getElementById('scheduleVolumePerDay');
const addScheduleBtn       = document.getElementById('addScheduleBtn');
const schedulesTableBody   = document.getElementById('schedulesTableBody');

let cachedPumps = [];



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
  const token = localStorage.getItem('token');
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
    <td>${p.index_on_device ?? '--'}</td>
    <td>${p.calibration_rate_ml_s?.toFixed?.(2) ?? p.calibration_rate_ml_s ?? '--'}</td>
    <td>${p.max_daily_ml ?? '--'}</td>
    <td>${p.container_volume_ml ?? '--'}</td>
    <td>${p.alarm_threshold_pct ?? '--'}</td>
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
        const token = localStorage.getItem('token');
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

  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(
      `/api/v1/user/dosing/pumps?deviceId=${encodeURIComponent(deviceId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('Erro ao carregar bombas:', data?.error);
      cachedPumps = [];
      renderPumps([]);
      updateSchedulePumpSelect();
      return;
    }

    cachedPumps = data.data || [];
    renderPumps(cachedPumps);
    updateSchedulePumpSelect();
    await loadSchedulesForSelectedPump(); // assim a aba Agendas já reflete a 1ª bomba selecionada
  } catch (err) {
    console.error('Erro ao carregar bombas:', err);
    cachedPumps = [];
    renderPumps([]);
    updateSchedulePumpSelect();
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
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/user/dosing/pumps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          device_id: deviceId,
          name,
          index_on_device: Number.isNaN(index) ? 0 : index,
          container_volume_ml: Number.isNaN(volume) ? undefined : volume,
          alarm_threshold_pct: Number.isNaN(alarm) ? undefined : alarm,
          calibration_rate_ml_s: Number.isNaN(rate) ? undefined : rate,
          max_daily_ml: Number.isNaN(dailyMax) ? undefined : dailyMax,
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

function updateSchedulePumpSelect() {
  if (!schedulePumpSelect) return;
  schedulePumpSelect.innerHTML = '<option value="">-- Selecione uma bomba --</option>';
  for (const p of cachedPumps) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (idx ${p.index_on_device})`;
    schedulePumpSelect.appendChild(opt);
  }
}

function daysMaskFromCheckboxes() {
  const boxes = document.querySelectorAll('.schedule-day');
  let mask = 0;
  boxes.forEach((b) => {
    if (b.checked) mask |= Number(b.value);
  });
  return mask;
}

function daysMaskToHuman(mask) {
  const map = [
    { bit: 1, label: 'Seg' },
    { bit: 2, label: 'Ter' },
    { bit: 4, label: 'Qua' },
    { bit: 8, label: 'Qui' },
    { bit: 16, label: 'Sex' },
    { bit: 32, label: 'Sáb' },
    { bit: 64, label: 'Dom' },
  ];
  return map.filter(d => (mask & d.bit) !== 0).map(d => d.label).join(', ') || '--';
}

function renderSchedules(schedules, pumpId) {
  if (!schedulesTableBody) return;
  schedulesTableBody.innerHTML = '';

  if (!schedules || !schedules.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Nenhuma agenda para esta bomba.';
    tr.appendChild(td);
    schedulesTableBody.appendChild(tr);
    return;
  }

  const pump = cachedPumps.find(p => p.id === pumpId);

  for (const s of schedules) {
    const tr = document.createElement('tr');
    const dias = daysMaskToHuman(s.days_mask);

    tr.innerHTML = `
      <td>${pump ? pump.name : '--'}</td>
      <td>${s.enabled ? 'Sim' : 'Não'}</td>
      <td>${dias}</td>
      <td>${s.doses_per_day}</td>
      <td>${s.start_time?.slice(0,5) || '--'} - ${s.end_time?.slice(0,5) || '--'}</td>
      <td>${s.volume_per_day_ml}</td>
      <td>
        <button class="btn-small" data-sched-id="${s.id}" data-action="delete">Remover</button>
      </td>
    `;

    schedulesTableBody.appendChild(tr);
  }

  schedulesTableBody.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-sched-id');
      if (!id) return;
      if (!confirm('Remover esta agenda?')) return;

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/v1/user/dosing/schedules/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.error('Erro ao remover schedule');
        }
        await loadSchedulesForSelectedPump();
      } catch (err) {
        console.error('Erro ao remover schedule:', err);
      }
    });
  });
}

async function loadSchedulesForSelectedPump() {
  if (!schedulePumpSelect) return;
  const pumpId = Number(schedulePumpSelect.value);
  if (!pumpId) {
    renderSchedules([], null);
    return;
  }

  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`/api/v1/user/dosing/schedules?pumpId=${encodeURIComponent(pumpId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Erro ao carregar schedules:', data?.error);
      renderSchedules([], pumpId);
      return;
    }
    renderSchedules(data.data || [], pumpId);
  } catch (err) {
    console.error('Erro ao carregar schedules:', err);
    renderSchedules([], pumpId);
  }
}


if (schedulePumpSelect) {
  schedulePumpSelect.addEventListener('change', loadSchedulesForSelectedPump);
}

if (addScheduleBtn) {
  addScheduleBtn.addEventListener('click', async () => {
    const pumpId = Number(schedulePumpSelect?.value);
    if (!pumpId) {
      alert('Selecione uma bomba.');
      return;
    }

    const dosesPerDay = Number(scheduleDosesPerDay?.value || 0);
    const startTime = scheduleStartTime?.value || '12:00';
    const endTime = scheduleEndTime?.value || startTime;
    const volumePerDay = Number(scheduleVolumePerDay?.value || 0);
    const daysMask = daysMaskFromCheckboxes();

    if (!dosesPerDay || !volumePerDay) {
      alert('Informe doses por dia e volume diário.');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch('/api/v1/user/dosing/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pump_id: pumpId,
          enabled: 1,
          days_mask: daysMask,
          doses_per_day: dosesPerDay,
          start_time: startTime,
          end_time: endTime,
          volume_per_day_ml: volumePerDay,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        console.error('Erro ao criar schedule:', data);
        alert(data.error || 'Erro ao criar agenda.');
        return;
      }
      await loadSchedulesForSelectedPump();
    } catch (err) {
      console.error('Erro ao criar schedule:', err);
      alert('Falha de comunicação ao criar agenda.');
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

  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (deviceId) {
    try {
      const resp = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
      );
      const json = await resp.json();
      if (resp.ok && json.success && json.data) {
        if (typeof DashboardCommon.setLcdStatus === 'function') {
          DashboardCommon.setLcdStatus(json.data.lcdStatus);
        }
        if (typeof DashboardCommon.setDosingStatus === 'function') {
          DashboardCommon.setDosingStatus(json.data.dosingStatus);
        }
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

