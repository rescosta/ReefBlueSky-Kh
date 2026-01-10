// Dashboard Dosadora
// ================================================
//06

let currentDevice = null;
let currentPumpIndex = 0;
let devices = [];
let pumps = [];
let schedules = [];
let editingScheduleId = null; 
let editingScheduleData = {}; 



// ===== AUTH =====
function getToken() {
  // se o login grava em 'authToken', usa esse
  return localStorage.getItem('authToken') || localStorage.getItem('token') || '';
}

async function apiCall(url, method = 'GET', body = null) {
  const token = getToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  let json = null;
  try {
    json = await res.json();
  } catch (_) {
    // se não tiver body JSON, ignora
  }

  if (!res.ok) {
    console.error('❌ apiCall error', res.status, json);
    throw new Error(json && json.error ? json.error : `HTTP ${res.status}`);
  }

  return json; // retorna o JSON pra quem chamou
}


// ===== INITIALIZATION =====
async function initDashboard() {
    console.log('🚀 Iniciando Dashboard Dosadora...');

    try {
        const token = getToken();
        const userId = localStorage.getItem('userId');
        
        if (!token || !userId) {
            console.error('❌ Token ou userId não encontrado');
            showError('Sessão expirada. Faça login novamente.');
            window.location.href = '/login.html';
            return;
        }

        console.log('📱 Carregando devices para user:', userId);

        // Buscar devices com Bearer token direto
        const res = await fetch('/api/v1/user/dosing/devices', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const json = await res.json();

        if (!res.ok || !json || !json.data) {
            console.error('❌ Resposta inválida da API:', json);
            showError(json && json.error ? json.error : 'Erro ao carregar devices');
            return;
        }

        devices = json.data;
        console.log('✅ Devices carregados:', devices);

        renderDeviceSelector();

        if (devices.length > 0) {
            currentDevice = devices[0];
            console.log('✅ Device inicial selecionado:', currentDevice);
            updateDeviceInfo();
            updateNavbarDeviceInfo();
            await loadPumps(currentDevice.id);
            await loadAllSchedules(currentDevice.id);

        } else {
            console.warn('⚠️ Nenhum device encontrado');
            showError('Nenhum device cadastrado');
        }

    } catch (err) {
        console.error('❌ Erro ao inicializar:', err);
        showError('Erro ao carregar dashboard');
    }
}

// ===== DEVICES =====
function renderDeviceSelector() {
    const select = document.getElementById('deviceSelect');
    if (!select) {
        console.error('❌ deviceSelect não encontrado');
        return;
    }

    select.innerHTML = '';

    if (devices.length === 0) {
        select.innerHTML = '<option value="">Nenhum device encontrado</option>';
        
        // zera o estado visual se não tiver device
        currentDevice = null;
        updateDeviceInfo();
        updateNavbarDeviceInfo();
        return;
    }


    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name || `Device ${device.id}`;
        select.appendChild(option);
    });

    select.addEventListener('change', onDeviceChange);
}

async function onDeviceChange() {
    const deviceId = parseInt(document.getElementById('deviceSelect').value);
    currentDevice = devices.find(d => d.id === deviceId);
    currentPumpIndex = 0;

    if (!currentDevice) {
        console.error('❌ Device não encontrado');
        showError('Device não encontrado');
        return;
    }

    console.log('✅ Device selecionado:', currentDevice.name);
    updateDeviceInfo();
    updateNavbarDeviceInfo();
    await loadPumps(currentDevice.id);
    await loadAllSchedules(currentDevice.id);
}

function updateDeviceInfo() {
    if (!currentDevice) return;

    const status = currentDevice.online ? '🟢 Online' : '🔴 Offline';
    const info = document.getElementById('deviceInfo');
    if (!info) return;

    info.innerHTML = `
        <span class="device-status-dot ${!currentDevice.online ? 'offline' : ''}"></span>
        <span><strong>${currentDevice.name}</strong> • ${currentDevice.hw_type || 'N/A'} • ${status} • ${currentDevice.pump_count || 6} bombas</span>
    `;
}

function updateNavbarDeviceInfo() {
    if (!currentDevice) return;

    const status = currentDevice.online ? '🟢 Online' : '🔴 Offline';
    const info = document.getElementById('navDeviceInfo');
    const dot = document.getElementById('navDeviceStatus');
    
    if (info) info.textContent = `${currentDevice.name} • ${status}`;
    if (dot) {
        dot.classList.remove('offline');
        if (!currentDevice.online) dot.classList.add('offline');
    }
}

// ===== PUMPS =====
async function loadPumps(deviceId) {
    if (!deviceId) {
        console.error('❌ deviceId não fornecido');
        return;
    }

    console.log('💧 Carregando bombas para device:', deviceId);

    const token = getToken(); // reaproveita sua função existente
    try {
        const res = await fetch(`/api/v1/user/dosing/devices/${deviceId}/pumps`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const json = await res.json();

        if (!res.ok || !json || !json.data) {
            console.error('❌ Erro ao carregar bombas:', json);
            showError(json && json.error ? json.error : 'Erro ao carregar bombas');
            return;
        }

        pumps = json.data;
        console.log('✅ Bombas carregadas:', pumps.length);

        renderPumpSelectors();
        renderConfigTable();
    } catch (err) {
        console.error('❌ Erro ao carregar bombas:', err);
        showError('Erro de comunicação ao carregar bombas');
    }
}


function renderPumpSelectors() {
    const selectors = ['pumpSelectManual', 'pumpSelectCalibration', 'pumpSelectAgenda'];

    selectors.forEach(selectorId => {
        const select = document.getElementById(selectorId);
        if (!select) return;

        select.innerHTML = '';

        pumps.forEach((pump, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${index + 1} - ${pump.name || `Bomba ${index + 1}`}`;
            select.appendChild(option);
        });

        select.value = '0';
    });
}

// ===== CONFIG TABLE =====
function renderConfigTable() {
    const tbody = document.getElementById('configTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (pumps.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhuma bomba encontrada</td></tr>';
        return;
    }

    pumps.forEach((pump, index) => {
        const row = document.createElement('tr');
        const containerSize = pump.container_volume_ml || pump.container_size || 0;
        const currentVolume = pump.current_volume_ml || pump.current_volume || 0;
        const alarmPercent = pump.alarm_threshold_pct || pump.alarm_percent || 0;
        const maxDaily = pump.max_daily_ml || pump.daily_max || 0;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${pump.name || `P${index + 1}`}</td>
            <td>
              <button
                class="btn-status ${pump.enabled ? 'btn-on' : 'btn-off'}"
                onclick="togglePump(${index})"
              >
                ${pump.enabled ? 'Ativada' : 'Desativada'}
              </button>
            </td>
            <td>${containerSize}</td>
            <td>${currentVolume}</td>
            <td>${alarmPercent}%</td>
            <td>${maxDaily}</td>
            <td><button class="btn-edit" onclick="openEditModal(${index})">Editar</button></td>
        `;
        tbody.appendChild(row);
    });
}

// ===== EDIT MODAL =====
function openEditModal(index) {
    const pump = pumps[index];
    if (!pump) return;

    document.getElementById('editPumpIndex').value = index;
    document.getElementById('editName').value = pump.name || '';
    document.getElementById('editContainerSize').value = pump.container_volume_ml || pump.container_size || 0;
    document.getElementById('editCurrentVolume').value = pump.current_volume_ml || pump.current_volume || 0;
    document.getElementById('editAlarmPercent').value = pump.alarm_threshold_pct || pump.alarm_percent || 0;
    document.getElementById('editDailyMax').value = pump.max_daily_ml || pump.daily_max || 0;

    document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

async function saveEditModal() {
  const index = parseInt(document.getElementById('editPumpIndex').value);

  const data = {
    name: document.getElementById('editName').value,
    active: true,
    container_size: parseInt(document.getElementById('editContainerSize').value) || 0,
    current_volume: parseInt(document.getElementById('editCurrentVolume').value) || 0,
    alarm_percent: parseInt(document.getElementById('editAlarmPercent').value) || 0,
    daily_max: parseInt(document.getElementById('editDailyMax').value) || 0
  };

  console.log('💾 Salvando bomba:', index, data);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${index}`,
    'PUT',
    data
  );

  if (result) {
    showSuccess('Bomba atualizada com sucesso!');
    closeEditModal();
    await loadPumps(currentDevice.id);
  }
}

// ===== EDIT SCHEDULE MODAL =====
function openEditScheduleModal(scheduleId) {
  console.log('openEditScheduleModal chamado para', scheduleId, schedules);
  editingScheduleId = scheduleId;
  const schedule = schedules.find(s => s.id === scheduleId);
  if (!schedule) return;

  editingScheduleData = { ...schedule };
  

  document.getElementById('editPumpSelectAgenda').value =
    schedule.pump_index != null ? schedule.pump_index : 0;


  const dayCheckboxes = document.querySelectorAll('.edit-day-checkbox');
  dayCheckboxes.forEach((cb, idx) => {
    cb.checked = Array.isArray(schedule.days_of_week)
      ? schedule.days_of_week.includes(idx)
      : false;
  });


  document.getElementById('editDosesPerDay').value = schedule.doses_per_day || 0;
  document.getElementById('editStartTime').value = schedule.start_time || '';
  document.getElementById('editEndTime').value = schedule.end_time || '';
  document.getElementById('editVolumePerDay').value = schedule.volume_per_day_ml || 0;
  document.getElementById('editScheduleEnabled').checked = !!schedule.enabled;

  console.log('Pré-display modal edição', scheduleId);
  document.getElementById('editScheduleModal').style.display = 'flex';
}


function closeEditScheduleModal() {
  document.getElementById('editScheduleModal').style.display = 'none';
  editingScheduleId = null;
}

async function saveEditScheduleModal() {
  const pumpIndex = parseInt(document.getElementById('editPumpSelectAgenda').value);
  
  const dayCheckboxes = document.querySelectorAll('.edit-day-checkbox');
  const activeDays = [];
  dayCheckboxes.forEach((cb, idx) => cb.checked && activeDays.push(idx));

  const data = {
    enabled: document.getElementById('editScheduleEnabled').checked,
    days_of_week: activeDays,
    doses_per_day: parseInt(document.getElementById('editDosesPerDay').value) || 0,
    start_time: document.getElementById('editStartTime').value,
    end_time: document.getElementById('editEndTime').value,
    volume_per_day_ml: parseInt(document.getElementById('editVolumePerDay').value) || 0
  };

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules/${editingScheduleId}`,
    'PUT',
    data
  );

  if (result) {
    showSuccess('Agenda atualizada!');
    closeEditScheduleModal();
    await loadAllSchedules(currentDevice.id);   // recarrega tudo
  }

}

async function loadAllSchedules(deviceId) {
  if (!deviceId) return;

  const token = getToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${deviceId}/schedules`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const json = await res.json();
    schedules = json?.data || [];
  } catch (err) {
    console.error('❌ Erro ao carregar todas as agendas:', err);
    schedules = [];
  }
  renderScheduleTableAll();
}


async function togglePump(index) {
  const pump = pumps[index];
  if (!pump) return;

  const newActive = !pump.enabled;

  const data = {
    name: pump.name,
    active: newActive,
    container_size: pump.container_volume_ml,
    current_volume: pump.current_volume_ml,
    alarm_percent: pump.alarm_threshold_pct,
    daily_max: pump.max_daily_ml
  };

  console.log('🔁 Toggling pump:', index, data);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${index}`,
    'PUT',
    data
  );

  if (result) {
    pump.enabled = newActive;
    renderConfigTable();       // atualiza texto Ativa/Inativa
    // opcional: também recarregar agendas se quiser refletir visualmente
    // await loadSchedules(currentDevice.id, currentPumpIndex);
  }
}

function renderScheduleTableAll() {
  const tbody = document.getElementById('scheduleTableBody');
  if (!tbody) return;

  if (schedules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;">Nenhuma agenda</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];

  schedules.forEach(schedule => {
    const activeDaysArray = Array(7).fill(false);
    (schedule.days_of_week || []).forEach(i => {
      if (i >= 0 && i < 7) activeDaysArray[i] = true;
    });

    const daysText = activeDaysArray
      .map((a,i) => a ? days[i] : '')
      .filter(Boolean)
      .join(', ');

    const row = document.createElement('tr');
    const startTime = schedule.start_time || '--';
    const endTime   = schedule.end_time   || '--';

    row.innerHTML = `
      <td>
        <button class="btn-secondary" onclick="toggleSchedule(${schedule.id})">
          ${schedule.enabled ? 'Ativa' : 'Inativa'}
        </button>
      </td>
      <td>${schedule.pump_name || ('Bomba ' + (schedule.pump_index + 1))}</td>
      <td>${daysText || '---'}</td>
      <td>${schedule.doses_per_day || 0}</td>
      <td>${startTime} - ${endTime}</td>
      <td>${schedule.volume_per_day_ml || 0}</td>
      <td>
        <button class="btn-edit" onclick="openEditScheduleModal(${schedule.id})">Editar</button>
      </td>
      <td>
        <button class="btn-delete" onclick="deleteSchedule(${schedule.id})">Deletar</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}


// ===== SCHEDULES =====
async function loadSchedules(deviceId, pumpIndex) {
  if (!deviceId) return;

  console.log('📅 Carregando agendas para:', deviceId, 'pump:', pumpIndex);

  const token = getToken();
  try {
    const res = await fetch(
      `/api/v1/user/dosing/devices/${deviceId}/pumps/${pumpIndex}/schedules`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const json = await res.json();

    if (!res.ok || !json || !json.data) {
      schedules = [];
      console.warn('⚠️ Nenhuma agenda encontrada ou erro ao carregar');
    } else {
      schedules = json.data;
    }
  } catch (err) {
    console.error('❌ Erro ao carregar agendas:', err);
    schedules = [];
  }

  console.log('✅ Agendas carregadas:', schedules.length);
  renderScheduleTable();
}


function renderScheduleTable() {
    const tbody = document.getElementById('scheduleTableBody');
    const warningBox = document.getElementById('agendaWarning');
    if (!tbody) return;

      // aviso de bomba inativa
      const currentPump = pumps[currentPumpIndex];
      if (warningBox) {
        if (currentPump && !currentPump.enabled) {
          warningBox.innerHTML = `
            <div class="info-box" style="background:#fee;border-left-color:#c33;color:#822;">
              ⚠️ Bomba inativa: os agendamentos desta bomba estão pausados e não serão executados até que ela seja ativada.
            </div>
          `;
        } else {
          warningBox.innerHTML = '';
        }
      }

    if (schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhuma agenda para esta bomba</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    schedules.forEach(schedule => {
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        
        // Converter days_of_week (array booleano) ou days_mask (número bitmask)
        let activeDaysArray = [];
        if (schedule.days_of_week && Array.isArray(schedule.days_of_week)) {
          // schedule.days_of_week é algo como [0,2,4]
          activeDaysArray = Array(7).fill(false);
          schedule.days_of_week.forEach(i => {
            if (i >= 0 && i < 7) activeDaysArray[i] = true;
          });
        } else if (schedule.days_mask !== undefined) {
          activeDaysArray = Array(7).fill(false);
          for (let i = 0; i < 7; i++) {
            activeDaysArray[i] = (schedule.days_mask & (1 << i)) !== 0;
          }
        }

        const daysText = activeDaysArray
          .map((active, i) => active ? days[i] : '')
          .filter(d => d)
          .join(', ');

        const row = document.createElement('tr');
        const startTime = schedule.start_time || '--';
        const endTime = schedule.end_time || '--';
        
        row.innerHTML = `
          <td>
            <button class="btn-secondary" onclick="toggleSchedule(${schedule.id})">
              ${schedule.enabled ? 'Ativa' : 'Inativa'}
            </button>
          </td>
          <td>${schedule.pump_name || `Bomba ${currentPumpIndex + 1}`}</td>
          <td>${daysText || '---'}</td>
          <td>${schedule.doses_per_day || 0}</td>
          <td>${startTime} - ${endTime}</td>
          <td>${schedule.volume_per_day_ml || 0}</td>
          <td>
            <button class="btn-edit" onclick="openEditScheduleModal(${schedule.id})">Editar</button>
          </td>
          <td>
            <button class="btn-delete" onclick="deleteSchedule(${schedule.id})">Deletar</button>
          </td>

        `;
        tbody.appendChild(row);
    });
}

function openAgendaModal() {
    document.getElementById('pumpSelectAgenda').value = currentPumpIndex;
    document.getElementById('agendaModal').style.display = 'flex';
}

function closeAgendaModal() {
    document.getElementById('agendaModal').style.display = 'none';
}

async function createSchedule() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectAgenda').value, 10);

  const dayCheckboxes = document.querySelectorAll('.day-checkbox');
  const activeDays = [];
  dayCheckboxes.forEach((cb, idx) => {
    if (cb.checked) activeDays.push(idx); // 0 = Dom, 1 = Seg, ...
  });

  const data = {
    active: true,
    days_of_week: activeDays, // <-- nome e formato que o backend usa
    doses_per_day: parseInt(document.getElementById('dosesPerDay').value, 10),
    start_time: document.getElementById('startTime').value,
    end_time: document.getElementById('endTime').value,
    volume_per_day: parseInt(document.getElementById('volumePerDay').value, 10)
  };

  console.log('📅 Criando agenda:', pumpIndex, data);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules`,
    'POST',
    data
  );

   if (result) {
    showSuccess('Agenda criada com sucesso!');
    closeAgendaModal();
    await loadAllSchedules(currentDevice.id);
  }

}


async function deleteSchedule(scheduleId) {
  if (!confirm('Tem certeza que deseja deletar esta agenda?')) return;

  const idNum = parseInt(scheduleId, 10);

  // procurar na lista atual
  const sched = schedules.find(s => parseInt(s.id, 10) === idNum);
  if (!sched) {
    showError('Agenda não encontrada na lista atual');
    return;
  }

  const pumpIndex = sched.pump_index != null ? sched.pump_index : 0;

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules/${idNum}`,
    'DELETE'
  );

  if (result) {
    showSuccess('Agenda deletada!');
    await loadAllSchedules(currentDevice.id);
  }
}



// ===== MANUAL DOSE =====
async function applyManualDose() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectManual').value);
  const volume = parseInt(document.getElementById('manualVolume').value);

  if (!volume || volume <= 0) {
    showError('Digite um volume válido');
    return;
  }

  console.log('💧 Aplicando dose manual:', pumpIndex, volume);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/manual`,
    'POST',
    { volume }
  );

  if (result) {
    showSuccess(`Dose de ${volume}mL aplicada!`);
    document.getElementById('manualVolume').value = '0';
  }
}


// ===== CALIBRATION =====
async function startCalibration() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value);
  const btn = event.target;

  console.log('⚙️ Iniciando calibração:', pumpIndex);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/start`,
    'POST'
  );

  if (result) {
    btn.disabled = true;
    let countdown = 10;

    const timer = setInterval(() => {
      btn.textContent = `🔴 Go (${countdown}s)`;
      countdown--;
      if (countdown < 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '🔴 Go (10s)';
      }
    }, 1000);
  }
}


async function saveCalibration() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value);
  const measuredVolume = parseFloat(document.getElementById('measuredVolume').value);

  if (!measuredVolume || measuredVolume <= 0) {
    showError('Digite um volume válido');
    return;
  }

  console.log('⚙️ Salvando calibração:', pumpIndex, measuredVolume);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/save`,
    'POST',
    { measured_volume: measuredVolume }
  );

  if (result) {
    const rate = (measuredVolume / 10).toFixed(2);
    showSuccess(`Calibração salva! Taxa: ${rate} mL/s`);
    document.getElementById('measuredVolume').value = '';
  }
}


async function toggleSchedule(scheduleId) {
  const sched = schedules.find(s => s.id === scheduleId);
  if (!sched) return;
  const newEnabled = !sched.enabled;

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/schedules/${scheduleId}`,
    'PUT',
    { enabled: newEnabled }
  );

  if (result) {
    sched.enabled = newEnabled;
    renderScheduleTableAll();
  }
}


// ===== TABS =====
function switchTab(tabName, btnElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    const tab = document.getElementById(tabName);
    if (tab) {
        tab.classList.add('active');
    }

    if (btnElement) {
        btnElement.classList.add('active');
    }
}

// ===== MODAL CLOSE =====
window.addEventListener('click', (e) => {
    const editModal = document.getElementById('editModal');
    const agendaModal = document.getElementById('agendaModal');
    const editScheduleModal = document.getElementById('editScheduleModal');
    
    if (e.target === editScheduleModal) editScheduleModal.style.display = 'none';

    if (e.target === editModal) editModal.style.display = 'none';
    if (e.target === agendaModal) agendaModal.style.display = 'none';
});

function showSuccess(msg) {
  console.log('SUCCESS:', msg);
  // opcional: implementar toast depois
}

function showError(msg) {
  console.error('ERROR:', msg);
}


// ===== INIT =====
window.addEventListener('load', initDashboard);