// Dashboard Dosadora .js
// ================================================


let currentDevice = null;
let currentPumpIndex = 0;
let devices = [];
let pumps = [];
let schedules = [];
let editingScheduleId = null; 
let editingScheduleData = {}; 

let calibrationTimer = null;
let calibrationSecondsTotal = 60;
let calibrationSecondsLeft = 0;


function showTabFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || 'dashboard';

  let targetId;
  switch (tab) {
    case 'dashboard':
      targetId = 'tab-dashboard';
      break;
    case 'agenda':
      targetId = 'agendaTab';
      break;
    case 'manual':
      targetId = 'manualTab';
      break;
    case 'config':
      targetId = 'configTab';
      break;
    case 'calibration':
      targetId = 'calibrationTab';
      break;
    default:
      targetId = 'tab-dashboard';
  }

  // Desativa todas
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
  });

  const target = document.getElementById(targetId);
  if (target) {
    target.classList.add('active');
  }
}


function parseMl(valueStr) {
  if (!valueStr) return NaN;
  return parseFloat(String(valueStr).trim().replace(',', '.'));
}

function formatMl(valueNum) {
  if (valueNum == null || Number.isNaN(valueNum)) return '';
  return Number(valueNum).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatNumberBr(valueNum, decimals = 1) {
  if (valueNum == null || Number.isNaN(valueNum)) return '--';
  return Number(valueNum)
    .toFixed(decimals)
    .replace('.', ',');
}


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

      if (devices.length > 0) {
          currentDevice = devices[0];        // sempre primeiro device do usuário
          console.log('✅ Device inicial selecionado:', currentDevice);
          updateDeviceInfo();
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


function formatLastSeenText(lastSeenIso) {
  if (!lastSeenIso) return 'Nunca conectado';

  const last = new Date(lastSeenIso);
  const now  = new Date();
  const diffSec = Math.floor((now - last) / 1000);

  if (diffSec < 60) return `há ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  return `há ${diffH} h`;
}

function updateDeviceInfo() {
  if (!currentDevice) return;

  const info = document.getElementById('deviceInfo');
  if (!info) return;

  const online = currentDevice.online;
  const statusText   = online ? '🟢 Online' : '🔴 Offline';
  const lastSeenText = formatLastSeenText(currentDevice.last_seen);

  info.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:4px;">
      <div>
        <span class="device-status-dot ${!online ? 'offline' : ''}"></span>
        <span><strong>${currentDevice.name}</strong> • ${currentDevice.hw_type || 'N/A'} • ${currentDevice.pump_count || 6} bombas</span>
      </div>
      <div style="font-size:13px; color:#9ca3af;">
        ${statusText} • Último contato: ${lastSeenText}
      </div>
    </div>
  `;
}

// ===== PUMPS =====
async function loadPumps(deviceId) {
  if (!deviceId) {
    console.error('❌ deviceId não fornecido');
    return;
  }

  console.log('💧 Carregando bombas para device:', deviceId);

  const token = getToken();
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
    updateCalibrationRateLabel(); 
    renderAllPumpsRateList();
    renderDashboard();

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

    if (selectorId === 'pumpSelectCalibration') {
      select.addEventListener('change', updateCalibrationRateLabel);
    }
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
        
          row.innerHTML = `
            <td>${index + 1}</td>
            <td>${pump.name || `P${index + 1}`}</td>
            <td>
              <button
                class="btn-status ${pump.enabled ? 'btn-on' : 'btn-off'}"
                onclick="togglePump(${index})"
              >
                ${pump.enabled ? 'ON' : 'OFF'}
              </button>
            </td>
            <td>${containerSize}</td>
            <td>${currentVolume}</td>
            <td>${alarmPercent}%</td>
            <td><button class="btn-edit" onclick="openEditModal(${index})">Editar</button></td>
        `;
        tbody.appendChild(row);
    });
}

function updateCalibrationRateLabel() {
  const label = document.getElementById('calibrationRateLabel');
  if (!label) return;

  const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value, 10) || 0;
  const pump = pumps[pumpIndex];
  if (!pump) {
    label.textContent = 'Taxa: -- ml/s';
    return;
  }

  let r = pump.calibration_rate_ml_s;
  r = r != null ? Number(r) : 0;   // força número

  if (r > 0 && !Number.isNaN(r)) {
    const perMin = r * 60;
    label.textContent =
      `Taxa atual desta bomba: ${formatNumberBr(r, 3)} ml/s (${formatNumberBr(perMin, 1)} ml/min)`;
  } else {
    label.textContent = 'Taxa ainda não calibrada para esta bomba.';
  }
}

function renderAllPumpsRateList() {
  const container = document.getElementById('allPumpsRateList');
  if (!container) return;

  if (!pumps || pumps.length === 0) {
    container.textContent = 'Nenhuma bomba encontrada.';
    return;
  }

  const lines = pumps.map((pump, idx) => {
    let r = pump.calibration_rate_ml_s;
    // garante número
    r = r != null ? Number(r) : 0;

    const name = pump.name || 'Bomba ' + (idx + 1);

  if (r > 0 && !Number.isNaN(r)) {
    const perMin = r * 60;
    return `${idx + 1} - ${name}: ${formatNumberBr(r, 3)} ml/s (${formatNumberBr(perMin, 1)} ml/min)`;
  }
    return `${idx + 1} - ${name}: -- (ainda não calibrada)`;
  });

  container.innerHTML = lines.join('<br>');
}


function renderDashboard() {
  const container = document.getElementById('dashboardPumpsCharts');
  if (!container) return;

  if (!pumps || pumps.length === 0) {
    container.innerHTML = '<div class="small-text">Nenhuma bomba encontrada.</div>';
    return;
  }

  const rows = pumps.map((pump, idx) => {
    const name = pump.name || `Bomba ${idx + 1}`;
    const total = pump.container_volume_ml || pump.container_size || 0;
    const current = pump.current_volume_ml || pump.current_volume || 0;
    const pct = total > 0 ? Math.max(0, Math.min(100, (current * 100) / total)) : 0;

    const daily = getDailyVolumeForPump(idx)
    const on = pump.enabled;
    const statusClass = on ? 'btn-on' : 'btn-off';
    const statusText = on ? 'ON' : 'OFF';

    return `
      <div class="dashboard-row">
        <div>${idx + 1}</div>
        <div>${name}</div>
        <div>
          <span class="btn-status ${statusClass}">${statusText}</span>
        </div>
        <div class="dashboard-reservoir">
          <div class="dashboard-reservoir-bar">
            <div class="dashboard-reservoir-fill" style="width:${pct}%;"></div>
          </div>
          <div class="dashboard-reservoir-text">
            ${formatMl(current)} / ${formatMl(total)} ml (${pct.toFixed(0)}%)
          </div>
        </div>
        <div>${formatMl(daily)} ml/dia</div>
      </div>
    `;
  });

  container.innerHTML = `
    <div class="dashboard-header">
      <div>Bomba</div>
      <div>Nome</div>
      <div>Status</div>
      <div>% Reservatório</div>
      <div>Vol. agendado</div>
    </div>
    ${rows.join('')}
  `;
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
  const idNum = Number(scheduleId);

  const schedule = Array.isArray(schedules)
    ? schedules.find(s => Number(s.id) === idNum)
    : null;

  if (!schedule) {
    showError('Agenda não encontrada para edição');
    return;
  }

  editingScheduleId = idNum;
  editingScheduleData = { ...schedule };

  // mostrar nome da bomba
  const pump = pumps.find(p => p.index_on_device === schedule.pump_index);
  const pumpNameEl = document.getElementById('editPumpName');
  if (pumpNameEl) {
    pumpNameEl.textContent = pump ? pump.name : `Bomba ${schedule.pump_index + 1}`;
  }

  // guardar pump_index em hidden
  const pumpIndexInput = document.getElementById('editPumpIndex');
  if (pumpIndexInput) {
    pumpIndexInput.value = schedule.pump_index;
  }

  // dias da semana
  const dayCheckboxes = document.querySelectorAll('.edit-day-checkbox');
  dayCheckboxes.forEach(cb => {
    const day = parseInt(cb.dataset.day, 10);
    cb.checked = Array.isArray(schedule.days_of_week)
      ? schedule.days_of_week.includes(day)
      : false;
  });

  // intervalo mínimo entre bombas
  const editMinGap = document.getElementById('editMinGapMinutes');
  if (editMinGap) {
    editMinGap.value = schedule.min_gap_minutes || 30;
  }

  // demais campos
  document.getElementById('editDosesPerDay').value = schedule.doses_per_day || 0;
  document.getElementById('editStartTime').value   = schedule.start_time || '';
  document.getElementById('editEndTime').value     = schedule.end_time || '';
  document.getElementById('editVolumePerDay').value = formatMl(schedule.volume_per_day_ml || 0);

  // abre modal
  document.getElementById('editScheduleModal').style.display = 'flex';
}




function closeEditScheduleModal() {
  document.getElementById('editScheduleModal').style.display = 'none';
  editingScheduleId = null;
}

async function saveEditScheduleModal() {
  try {
    const pumpIndex = parseInt(document.getElementById('editPumpIndex').value, 10);

    const dayCheckboxes = document.querySelectorAll('.edit-day-checkbox');
    const activeDays = [];
    dayCheckboxes.forEach(cb => {
      const day = parseInt(cb.dataset.day, 10);
      if (cb.checked) activeDays.push(day);
    });

    const data = {
      enabled: true, 
      days_of_week: activeDays,
      doses_per_day: parseInt(document.getElementById('dosesPerDay').value, 10) || 0,
      start_time: document.getElementById('startTime').value,
      end_time: document.getElementById('endTime').value,
      volume_per_day: parseMl(document.getElementById('volumePerDay').value) || 0
    };


    console.log('PUT data =>', data);

    const result = await apiCall(
      `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules/${editingScheduleId}`,
      'PUT',
      data
    );

    showSuccess('Agenda atualizada!');
    closeEditScheduleModal();
    await loadAllSchedules(currentDevice.id);
  } catch (err) {
    console.error('saveEditScheduleModal erro:', err);
    showError(err.message || 'Erro ao atualizar agenda');
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
  renderDashboard();  
}

function getDailyVolumeForPump(index) {
  if (!Array.isArray(schedules)) return 0;
  return schedules
    .filter(s => s.pump_index === index && s.enabled)
    .reduce((sum, s) => sum + (s.volume_per_day_ml || 0), 0);
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;">Nenhuma agenda</td></tr>';
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

    const startTime = schedule.start_time || '--';
    const endTime   = schedule.end_time   || '--';


    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <button class="btn-status ${schedule.enabled ? 'btn-on' : 'btn-off'}"
                onclick="toggleSchedule(${schedule.id})">
          ${schedule.enabled ? 'ON' : 'OFF'}
        </button>
      </td>
      <td>${schedule.pump_name || ('Bomba ' + (schedule.pump_index + 1))}</td>
      <td>${daysText || '---'}</td>
      <td>${schedule.doses_per_day || 0}</td>
      <td>${startTime} - ${endTime}</td>
      <td>${formatMl(schedule.volume_per_day_ml || 0)}</td>
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
    enabled: true, 
    days_of_week: activeDays,
    doses_per_day: parseInt(document.getElementById('dosesPerDay').value, 10) || 0,
    start_time: document.getElementById('startTime').value,
    end_time: document.getElementById('endTime').value,
    volume_per_day_ml: parseMl(document.getElementById('volumePerDay').value) || 0 // <-- nome novo
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

  // normaliza id para número
  const idNum = Number(scheduleId);

  // garante que schedules é array
  if (!Array.isArray(schedules)) {
    showError('Lista de agendas não carregada');
    return;
  }

  // procura pela id convertendo ambos para número
  const sched = schedules.find(s => Number(s.id) === idNum);
  if (!sched) {
    console.log('DEBUG deleteSchedule - scheduleId:', scheduleId, 'schedules:', schedules);
    showError('Agenda não encontrada na lista atual');
    return;
  }

  const pumpIndex = sched.pump_index != null ? Number(sched.pump_index) : 0;

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
  const pumpIndex = parseInt(document.getElementById('pumpSelectManual').value, 10);
  const volume = parseMl(document.getElementById('manualVolume').value);



  if (!volume || volume <= 0) {
    showError('Digite um volume válido');
    return;
  }

  const pump = pumps[pumpIndex];
  const rate = pump && pump.calibration_rate_ml_s != null ? Number(pump.calibration_rate_ml_s) : 0;
  if (!rate || Number.isNaN(rate) || rate <= 0) {
    showError('Bomba sem taxa calibrada; calibre antes de usar dose manual.');
    return;
  }

  const doseSeconds = volume / rate;
  startManualProgress(doseSeconds);


  console.log('💧 Aplicando dose manual:', pumpIndex, volume, '=>', doseSeconds, 's');

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/manual`,
    'POST',
    { volume }
  );

  if (result) {
    showSuccess(`Dose de ${volume}ml aplicada!`);
    document.getElementById('manualVolume').value = '0';
  }
}

// ===== CALIBRATION =====
async function startCalibration() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value, 10);
  const btn = event.target;

  console.log('⚙️ Iniciando calibração (60s):', pumpIndex);

  // Nenhuma chamada de API aqui; só animação de 60s
  btn.disabled = true;

  const overlay = document.getElementById('calibrationOverlay');
  const textEl  = document.getElementById('calibrationCountdownText');
  const barEl   = document.getElementById('calibrationProgressFill');

  calibrationSecondsTotal = 60;
  calibrationSecondsLeft  = 60;


  if (overlay) overlay.style.display = 'flex';
  if (barEl) barEl.style.width = '0%';
  if (textEl) textEl.textContent = `Restam ${calibrationSecondsLeft} segundos...`;

  if (calibrationTimer) clearInterval(calibrationTimer);
  calibrationTimer = setInterval(() => {
    calibrationSecondsLeft--;

    const pct = ((calibrationSecondsTotal - calibrationSecondsLeft) / calibrationSecondsTotal) * 100;
    if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    const s = calibrationSecondsLeft <= 0 ? 0 : calibrationSecondsLeft;
    if (textEl) textEl.textContent = `Restam ${s} segundos...`;

    if (calibrationSecondsLeft <= 0) {
      clearInterval(calibrationTimer);
      calibrationTimer = null;
      if (overlay) overlay.style.display = 'none';
      btn.disabled = false;
      btn.textContent = '🔴 Iniciar Calibração';
    }
  }, 1000);
}


async function abortCalibration() {
  const overlay = document.getElementById('calibrationOverlay');
  const btn = document.getElementById('goBtn');

  if (calibrationTimer) {
    clearInterval(calibrationTimer);
    calibrationTimer = null;
  }

  if (overlay) overlay.style.display = 'none';

  try {
    const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value, 10);
    const pump = pumps[pumpIndex];
    if (pump && pump.id) {
      // aborta calibração se estiver rolando
      await apiCall(`/api/v1/user/dosing/pumps/${pump.id}/calibrate/abort`, 'POST');
      // e aborta dose manual se houver
      await apiCall(`/api/v1/user/dosing/pumps/${pump.id}/manual/abort`, 'POST');
    }
  } catch (e) {
    console.warn('Falha ao chamar abort no device', e);
  }

  if (btn) {
    btn.disabled = false;
    btn.textContent = '🔴 Iniciar Calibração';
  }

  showError('Operação abortada pelo usuário');
}


async function saveCalibration() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value, 10);
  const measuredVolume = parseMl(document.getElementById('measuredVolume').value);


  if (!measuredVolume || measuredVolume <= 0) {
    showError('Digite um volume válido');
    return;
  }

  if (!currentDevice) {
    showError('Device inválido');
    return;
  }

  console.log('⚙️ Salvando calibração (60s):', pumpIndex, measuredVolume);

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/save`,
    'POST',
    { measured_volume: measuredVolume }
  );

  if (result && result.data && typeof result.data.ml_per_second === 'number') {
    const rateNum = result.data.ml_per_second;
    showSuccess(`Calibração salva! Taxa: ${formatNumberBr(rateNum, 3)} ml/s`);
    document.getElementById('measuredVolume').value = '';

    if (pumps[pumpIndex]) {
      pumps[pumpIndex].calibration_rate_ml_s = Number(rateNum);
    }

    updateCalibrationRateLabel();
    renderAllPumpsRateList();
  }
}


function startManualProgress(totalSeconds) {
  const overlay = document.getElementById('calibrationOverlay');
  const textEl  = document.getElementById('calibrationCountdownText');
  const barEl   = document.getElementById('calibrationProgressFill');
  if (!overlay || !textEl || !barEl) return;

  let left = Math.max(1, Math.round(totalSeconds));
  let total = left;

  overlay.style.display = 'flex';
  barEl.style.width = '0%';
  textEl.textContent = `Dose em andamento (${left}s restantes)...`;

  const timer = setInterval(() => {
    left--;
    const used = total - left;
    const pct = (used / total) * 100;
    barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    textEl.textContent = `Dose em andamento (${Math.max(0,left)}s restantes)...`;

    if (left <= 0) {
      clearInterval(timer);
      overlay.style.display = 'none';
    }
  }, 1000);
}


async function toggleSchedule(scheduleId) {
  const idNum = Number(scheduleId);

  const sched = Array.isArray(schedules)
    ? schedules.find(s => Number(s.id) === idNum)
    : null;
  if (!sched) {
    showError('Agenda não encontrada para alternar');
    return;
  }

  const pumpIndex = sched.pump_index != null ? Number(sched.pump_index) : 0;
  const newEnabled = !sched.enabled;

  const data = {
    enabled: newEnabled,
    days_of_week: Array.isArray(sched.days_of_week) ? sched.days_of_week : [],
    doses_per_day: sched.doses_per_day || 0,
    start_time: sched.start_time || '',
    end_time: sched.end_time || '',
    volume_per_day_ml: sched.volume_per_day_ml || 0
  };

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules/${idNum}`,
    'PUT',
    data
  );

  if (result) {
    sched.enabled = newEnabled;
    renderScheduleTableAll();
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
// ===== INIT =====
window.addEventListener('load', async () => {
  await initDashboard();    // carrega device, bombas, agendas, etc.
  showTabFromQuery();       
});
