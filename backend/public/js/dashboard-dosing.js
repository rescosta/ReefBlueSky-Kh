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
let manualDoseTimer = null;
let _overlayMode = 'calibration'; // 'calibration' | 'manual'

// Abre o overlay com título e botão corretos para o modo indicado
function _openOverlay(mode) {
  const overlay  = document.getElementById('calibrationOverlay');
  const titleEl  = document.getElementById('calibrationOverlayTitle');
  const abortBtn = document.getElementById('abortCalibrationBtn');
  if (!overlay) return;
  _overlayMode = mode;
  if (mode === 'manual') {
    if (titleEl)  titleEl.textContent  = '💧 Dose Manual em andamento';
    if (abortBtn) abortBtn.textContent = '✖ Abortar Dose';
  } else {
    if (titleEl)  titleEl.textContent  = '⚙️ Calibração em andamento';
    if (abortBtn) abortBtn.textContent = '✖ Abortar Calibração';
  }
  overlay.style.display = 'flex';
}

function _closeOverlay() {
  const overlay = document.getElementById('calibrationOverlay');
  if (overlay) overlay.style.display = 'none';
}


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

// ===== CONSUMPTION REPORT =====
async function loadConsumptionReport() {
  const token = getToken();
  const reportContainer = document.getElementById('consumptionReport');

  if (!reportContainer) return;

  try {
    const res = await fetch('/api/v1/user/dosing/consumption-report', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      reportContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Erro ao carregar relatório</div>';
      return;
    }

    const data = json.data || [];

    if (data.length === 0) {
      reportContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #6b7280;">Nenhuma bomba configurada</div>';
      return;
    }

    reportContainer.innerHTML = data.map(pump => {
      const alertColors = {
        'OK':       { bg: '#22c55e', text: '#fff', label: 'OK' },
        'WARNING':  { bg: '#f59e0b', text: '#fff', label: 'ATENÇÃO' },
        'CRITICAL': { bg: '#ef4444', text: '#fff', label: 'CRÍTICO' }
      };

      const alertColor = alertColors[pump.alert_status] || alertColors.OK;
      const volumePct = Math.round(pump.volume_pct || 0);
      const barColor = alertColor.bg;
      const isOn = pump.enabled == 1;

      return `
        <div style="background: #020617; border: 1px solid #1f2937; border-radius: 8px; padding: 16px;">
          <!-- Header: toggle ON/OFF + nome + badge status -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; gap: 10px; align-items: center;">
              <button
                class="btn-status ${isOn ? 'btn-on' : 'btn-off'}"
                onclick="togglePumpFromReport(${pump.pump_index}, ${isOn})"
              >${isOn ? 'ON' : 'OFF'}</button>
              <h3 style="margin: 0; font-size: 16px; color: #e5e7eb;">${pump.pump_name}</h3>
              <button
                onclick="renamePumpFromReport(${pump.pump_index}, '${pump.pump_name}')"
                title="Renomear bomba"
                style="background: none; border: none; color: #6b7280; cursor: pointer; padding: 2px 4px; line-height: 1; display: flex; align-items: center;"
              ><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            </div>
            <span style="background: ${alertColor.bg}; color: ${alertColor.text}; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
              ${alertColor.label}
            </span>
          </div>

          <!-- Barra de progresso + % -->
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <div style="flex: 1; background: #1f2937; border-radius: 4px; height: 8px; overflow: hidden;">
              <div style="background: ${barColor}; height: 100%; width: ${Math.max(2, volumePct)}%; transition: width 0.3s;"></div>
            </div>
            <span style="color: ${barColor}; font-size: 12px; font-weight: 600; min-width: 36px; text-align: right;">${volumePct}%</span>
          </div>

          <!-- Informações -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
            <div>
              <div style="color: #9ca3af; font-size: 11px;">Volume Restante</div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #e5e7eb; font-weight: 600;">${pump.current_volume_ml} / ${pump.container_volume_ml} mL</span>
                <button
                  onclick="refillReservoirFromReport(${pump.pump_index}, ${pump.container_volume_ml})"
                  title="Reabastecer reservatório"
                  style="background: #16a34a; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 13px; line-height: 1; flex-shrink: 0;"
                >↻</button>
              </div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 11px;">Dias Restantes</div>
              <div style="color: #e5e7eb; font-weight: 600;">${pump.days_remaining !== null ? pump.days_remaining + ' dias' : 'N/A'}</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 11px;">Consumo Diário</div>
              <div style="color: #e5e7eb; font-weight: 600;">${pump.avg_daily_consumption_ml} mL/dia</div>
            </div>
            <div> 
              <div style="color: #9ca3af; font-size: 11px;">Previsão de Fim</div>
              <div style="color: #e5e7eb; font-weight: 600;">${pump.estimated_end_date ? new Date(pump.estimated_end_date).toLocaleDateString('pt-BR') : 'N/A'}</div>  
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 11px;">Consumo Mensal</div>
              <div style="color: #e5e7eb; font-weight: 600;">${pump.volume_consumed_month_ml} mL</div>
            </div>
            <div>
              <div style="color: #9ca3af; font-size: 11px;">Custo Mensal</div>
              <div style="color: #e5e7eb; font-weight: 600;">R$ ${pump.cost_month.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar relatório de consumo:', err);
    reportContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">Erro ao carregar relatório</div>';
  }
}

function showRenamePumpModal(currentName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('renamePumpModal');
    const cancelBtn = document.getElementById('renameCancelBtn');
    const confirmBtn = document.getElementById('renameConfirmBtn');
    const input = document.getElementById('renamePumpInput');

    input.value = currentName;
    modal.classList.add('show');
    setTimeout(() => { input.focus(); input.select(); }, 100);

    const close = (value) => {
      modal.classList.remove('show');
      cancelBtn.removeEventListener('click', handleCancel);
      confirmBtn.removeEventListener('click', handleConfirm);
      input.removeEventListener('keydown', handleKey);
      resolve(value);
    };

    const handleCancel = () => close(null);
    const handleConfirm = () => {
      const name = input.value.trim();
      if (name) close(name);
    };
    const handleKey = (e) => {
      if (e.key === 'Enter') handleConfirm();
      if (e.key === 'Escape') handleCancel();
    };

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);
    input.addEventListener('keydown', handleKey);
  });
}

async function renamePumpFromReport(pumpIndex, currentName) {
  const newName = await showRenamePumpModal(currentName);
  if (!newName || newName === currentName) return;

  const pump = pumps[pumpIndex];
  if (!pump) return;

  const data = {
    name: newName,
    active: pump.enabled == 1,
    container_size: pump.container_volume_ml,
    current_volume: pump.current_volume_ml,
    alarm_percent: pump.alarm_threshold_pct,
    reagent_cost_per_liter: pump.reagent_cost_per_liter,
    alert_before_days: pump.alert_before_days,
  };

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}`,
    'PUT',
    data
  );

  if (result) {
    pump.name = newName;
    showSuccess('Bomba renomeada!');
    renderConfigTable();
    renderDashboard();
    loadConsumptionReport();
  }
}

async function togglePumpFromReport(pumpIndex, currentEnabled) {
  const pump = pumps[pumpIndex];
  if (!pump) return;

  const newActive = !currentEnabled;
  const data = {
    name: pump.name,
    active: newActive,
    container_size: pump.container_volume_ml,
    current_volume: pump.current_volume_ml,
    alarm_percent: pump.alarm_threshold_pct,
    reagent_cost_per_liter: pump.reagent_cost_per_liter,
    alert_before_days: pump.alert_before_days,
  };

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}`,
    'PUT',
    data
  );

  if (result) {
    pump.enabled = newActive ? 1 : 0;
    renderConfigTable();
    renderDashboard();
    loadConsumptionReport();
  }
}

function showRefillConfirmModal(pumpName, containerVolume) {
  return new Promise((resolve) => {
    const modal = document.getElementById('refillConfirmModal');
    const cancelBtn = document.getElementById('refillCancelBtn');
    const confirmBtn = document.getElementById('refillConfirmBtn');
    const message = document.getElementById('refillConfirmMessage');

    message.textContent = `Marcar reservatório de ${pumpName} como cheio (${containerVolume} mL)?`;
    modal.classList.add('show');

    const handleCancel = () => {
      modal.classList.remove('show');
      cancelBtn.removeEventListener('click', handleCancel);
      confirmBtn.removeEventListener('click', handleConfirm);
      resolve(false);
    };

    const handleConfirm = () => {
      modal.classList.remove('show');
      cancelBtn.removeEventListener('click', handleCancel);
      confirmBtn.removeEventListener('click', handleConfirm);
      resolve(true);
    };

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);
  });
}

async function refillReservoirFromReport(pumpIndex, containerVolume) {
  const pump = pumps[pumpIndex];
  if (!pump) return;

  const confirmed = await showRefillConfirmModal(pump.name, containerVolume);
  if (!confirmed) return;

  const data = {
    name: pump.name,
    active: pump.enabled == 1,
    container_size: pump.container_volume_ml,
    current_volume: containerVolume,
    alarm_percent: pump.alarm_threshold_pct,
    reagent_cost_per_liter: pump.reagent_cost_per_liter,
    alert_before_days: pump.alert_before_days,
  };

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}`,
    'PUT',
    data
  );

  if (result) {
    pump.current_volume_ml = containerVolume;
    showSuccess('Reservatório reabastecido!');
    loadConsumptionReport();
    renderDashboard();
  }
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
    renderCalibrationCards();
    updateCalibrationRateLabel();
    renderAllPumpsRateList();
    renderDashboard();
    renderManualCards();
    loadConsumptionReport();

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
    const container = document.getElementById('configCards');
    if (!container) return;

    if (!Array.isArray(pumps) || pumps.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Nenhuma bomba configurada</div>';
        return;
    }

    container.innerHTML = pumps.map((pump, index) => {
        if (!pump) return '';

        const pumpName = pump.name || `Bomba ${index + 1}`;
        const pumpEnabled = pump.enabled;
        const containerSize = pump.container_volume_ml || pump.container_size || 0;
        const currentVolume = pump.current_volume_ml || pump.current_volume || 0;
        const alarmPercent = pump.alarm_threshold_pct || pump.alarm_percent || 0;
        const volumePct = containerSize > 0 ? (currentVolume / containerSize) * 100 : 0;

        return `
          <div class="dosing-card config-pump-card">
            <div class="schedule-card-header" style="padding:14px 16px;">
              <button class="btn-status ${pumpEnabled ? 'btn-on' : 'btn-off'}" onclick="togglePump(${index})">${pumpEnabled ? 'ON' : 'OFF'}</button>
              <span class="pump-card-name">${pumpName}</span>
            </div>
            <div style="padding:14px 16px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px;">
              <div>
                <div style="color:#94a3b8;margin-bottom:2px;">Vol. Recipiente</div>
                <div style="color:#e2e8f0;font-weight:600;">${formatMl(containerSize)}</div>
              </div>
              <div>
                <div style="color:#94a3b8;margin-bottom:2px;">Vol. Atual</div>
                <div style="color:#e2e8f0;font-weight:600;">${formatMl(currentVolume)} <span style="color:#94a3b8;font-weight:400;">(${volumePct.toFixed(0)}%)</span></div>
              </div>
              <div>
                <div style="color:#94a3b8;margin-bottom:2px;">Alarme</div>
                <div style="color:#e2e8f0;font-weight:600;">${alarmPercent}%</div>
              </div>
              <div>
                <div style="color:#94a3b8;margin-bottom:2px;">Taxa Calibrada</div>
                <div style="color:#e2e8f0;font-weight:600;">${pump.calibration_rate_ml_s > 0 ? formatNumberBr(pump.calibration_rate_ml_s, 2) + ' mL/s' : '--'}</div>
              </div>
            </div>
            <div style="padding:10px 16px; border-top:1px solid rgba(255,255,255,0.08);">
              <button class="btn-edit" style="width:100%;" onclick="openEditModal(${index})">✏ Editar Configurações</button>
            </div>
          </div>`;
    }).join('');
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
          <button
            class="btn-status ${statusClass}"
            onclick="togglePump(${idx})"
          >
            ${statusText}
          </button>
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
    document.getElementById('editReagentCost').value = pump.reagent_cost_per_liter || 0;
    document.getElementById('editAlertBeforeDays').value = pump.alert_before_days || 7;

    document.getElementById('editModal').classList.add('show');
}

// [NOVO] Preencher volume atual = capacidade do reservatório
function fillToMaxVolume() {
    const containerSize = parseInt(document.getElementById('editContainerSize').value) || 0;
    document.getElementById('editCurrentVolume').value = containerSize;
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

async function saveEditModal() {
  const index = parseInt(document.getElementById('editPumpIndex').value);

  const data = {
    name: document.getElementById('editName').value,
    active: true,
    container_size: parseInt(document.getElementById('editContainerSize').value) || 0,
    current_volume: parseInt(document.getElementById('editCurrentVolume').value) || 0,
    alarm_percent: parseInt(document.getElementById('editAlarmPercent').value) || 0,
    reagent_cost_per_liter: parseFloat(document.getElementById('editReagentCost').value) || 0,
    alert_before_days: parseInt(document.getElementById('editAlertBeforeDays').value) || 7,
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
  document.getElementById('editVolumePerDay').value = formatMl(schedule.volume_per_day_ml || schedule.volume_per_day || 0);

  // notificações
  document.getElementById('editNotifyTelegram').checked = !!schedule.notify_telegram;
  document.getElementById('editNotifyEmail').checked = !!schedule.notify_email;

  const modal = document.getElementById('editScheduleModal');
  modal.classList.add('show');
}




function closeEditScheduleModal() {
  const modal = document.getElementById('editScheduleModal');
  modal.classList.remove('show');
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

    const dosesPerDay = parseInt(document.getElementById('editDosesPerDay').value, 10) || 0;

    const volumeEditStr = document.getElementById('editVolumePerDay').value.trim();
    const volumeEdit = parseMl(volumeEditStr);   // usa o mesmo helper

    if (!Number.isFinite(volumeEdit) || volumeEdit <= 0) {
      showError('Informe um Volume Diário (ml) válido na edição.');
      return;
    }

    if (!Number.isFinite(dosesPerDay) || dosesPerDay <= 0) {
      showError('Informe Doses por Dia maior que zero na edição.');
      return;
    }

    const minGapMinutes = parseInt(document.getElementById('editMinGapMinutes').value, 10) || 30;

    const data = {
      enabled: true,
      days_of_week: activeDays,
      doses_per_day: dosesPerDay,
      start_time: document.getElementById('editStartTime').value,
      end_time: document.getElementById('editEndTime').value,
      volume_per_day: volumeEdit,
      volume_per_day_ml: volumeEdit,
      min_gap_minutes: minGapMinutes,
      notify_telegram: document.getElementById('editNotifyTelegram').checked,
      notify_email: document.getElementById('editNotifyEmail').checked
    };

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
    .reduce((sum, s) => sum + (s.volume_per_day_ml || s.volume_per_day || 0),0);
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
    renderConfigTable();
    renderDashboard();
    renderManualCards();
    renderScheduleTableAll();
  }
}

function renderScheduleTableAll() {
  const container = document.getElementById('scheduleCards');
  if (!container) return;

  if (!Array.isArray(schedules) || schedules.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Nenhuma agenda cadastrada</div>';
    return;
  }

  const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'];

  // Agrupa schedules por pump_index
  const grouped = {};
  schedules.forEach(s => {
    const idx = s.pump_index != null ? s.pump_index : 0;
    if (!grouped[idx]) grouped[idx] = [];
    grouped[idx].push(s);
  });

  const sortedIndexes = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  container.innerHTML = sortedIndexes.map(pumpIdx => {
    const pumpSchedules = grouped[pumpIdx];
    const pumpName = (pumps[pumpIdx] && pumps[pumpIdx].name) || pumpSchedules[0].pump_name || `Bomba ${pumpIdx + 1}`;
    const pumpEnabled = pumps[pumpIdx] ? pumps[pumpIdx].enabled : true;

    const totalDaily = pumpSchedules
      .filter(s => s.enabled)
      .reduce((sum, s) => sum + (s.volume_per_day_ml || s.volume_per_day || 0), 0);

    const rows = pumpSchedules.map(s => {
      const activeDays = Array(7).fill(false);
      (s.days_of_week || []).forEach(i => { if (i >= 0 && i < 7) activeDays[i] = true; });
      const daysText = activeDays.map((a, i) => a ? `<span class="day-chip${a ? ' active' : ''}">${days[i]}</span>` : `<span class="day-chip">${days[i]}</span>`).join('');
      const startTime = s.start_time || '--';
      const endTime = s.end_time || '--';

      return `
        <div class="schedule-row ${s.enabled ? '' : 'schedule-row-disabled'}">
          <div class="schedule-row-left">
            <button class="btn-status ${s.enabled ? 'btn-on' : 'btn-off'}" onclick="toggleSchedule(${s.id})">${s.enabled ? 'ON' : 'OFF'}</button>
            <div class="schedule-row-info">
              <div class="schedule-days">${daysText}</div>
              <div class="schedule-details">
                <span>⏱ ${startTime} – ${endTime}</span>
                <span>💧 ${s.doses_per_day || 0}×/dia</span>
                <span>💉 ${((s.volume_per_day_ml || s.volume_per_day || 0) / (s.doses_per_day || 1)).toFixed(2).replace('.', ',')} mL/dose</span>
                ${s.notify_email ? '<span title="Notificação por Email ativa">📧</span>' : ''}
                ${s.notify_telegram ? '<span title="Notificação por Telegram ativa" style="display:inline-flex;align-items:center;margin-left:2px;"><svg width="16" height="16" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="120" r="120" fill="#0088cc"/><path fill="#fff" d="M81.229 128.772l14.237 39.406s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6z"/><path fill="#d2e5f1" d="M100.106 138.878l-2.733 29.046s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763"/><path fill="#b5cfe4" d="M81.486 130.178l-17.8-5.467s-2.131-.835-1.424-2.73c.147-.388.403-.753.958-1.223 5.349-4.553 100.11-37.533 100.11-37.533s1.977-.415 3.13-.128c.385.098.754.288.987.642.132.2.211.44.232.686.032.383-.012.803-.046 1.257-.13 1.725-8.017 74.785-8.017 74.785s-.528 5.935-4.894 6.163c-1.157.06-2.556-.365-5.153-1.647-5.768-2.853-24.173-15.43-28.405-17.878-.655-.38-1.25-.817-1.565-1.538-.373-.855-.06-1.84.407-2.417 4.05-5.01 17.91-16.853 27.01-25.675.914-.888.818-1.126-.139-.847-6.298 1.838-29.952 18.72-34.02 21.263-.973.608-1.79.938-2.64 1.056-1.87.26-3.684-.167-5.59-.826-2.372-.82-11.728-3.868-11.728-3.868z"/></svg></span>' : ''}
              </div>
            </div>
          </div>
          <div class="schedule-row-actions">
            <button class="btn-edit" onclick="openEditScheduleModal(${s.id})">✏ Editar</button>
            <button class="btn-delete" onclick="deleteSchedule(${s.id})">🗑</button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="dosing-card schedule-pump-card">
        <div class="schedule-card-header">
          <span class="pump-card-name">${pumpName}</span>
          <span class="pump-daily-total">Total: ${totalDaily.toFixed(2).replace('.', ',')} mL/dia</span>
        </div>
        <div class="schedule-rows">${rows}</div>
        <div class="schedule-card-footer">
          <button class="btn-new-agenda" style="width:100%;" onclick="openAgendaModal(${pumpIdx})">+ Nova Agenda para ${pumpName}</button>
        </div>
      </div>`;
  }).join('');
}

function openAgendaModal(pumpIdx) {
    const idx = pumpIdx != null ? pumpIdx : currentPumpIndex;
    document.getElementById('pumpSelectAgenda').value = idx;
    document.getElementById('agendaModal').classList.add('show');
}

function closeAgendaModal() {
    document.getElementById('agendaModal').classList.remove('show');
}

async function createSchedule() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectAgenda').value, 10);

  const dayCheckboxes = document.querySelectorAll('.day-checkbox');
  const activeDays = [];
  dayCheckboxes.forEach((cb, idx) => {
    if (cb.checked) activeDays.push(idx);
  });

  const dosesPerDay = parseInt(document.getElementById('dosesPerDay').value, 10) || 0;

  const volumeStr = document.getElementById('volumePerDay').value.trim();
  const volumePerDay = parseMl(volumeStr);

  if (!Number.isFinite(volumePerDay) || volumePerDay <= 0) {
    showError('Informe um Volume Diário (ml) válido e maior que zero.');
    return;
  }

  if (!Number.isFinite(dosesPerDay) || dosesPerDay <= 0) {
    showError('Informe Doses por Dia maior que zero.');
    return;
  }

  const minGapMinutes = parseInt(document.getElementById('minGapMinutes').value, 10) || 30;

  const data = {
    enabled: true,
    days_of_week: activeDays,
    doses_per_day: dosesPerDay,
    start_time: document.getElementById('startTime').value,
    end_time: document.getElementById('endTime').value,
    volume_per_day: volumePerDay,      // para validação do POST
    volume_per_day_ml: volumePerDay,   // para qualquer handler que use _ml
    min_gap_minutes: minGapMinutes,
    notify_telegram: document.getElementById('notifyTelegram').checked,
    notify_email: document.getElementById('notifyEmail').checked
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



// Modal de confirmação customizado para deletar
function showDeleteConfirmModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('deleteConfirmModal');
    const cancelBtn = document.getElementById('deleteCancelBtn');
    const confirmBtn = document.getElementById('deleteConfirmBtn');

    modal.classList.add('show');

    const handleCancel = () => {
      modal.classList.remove('show');
      cancelBtn.removeEventListener('click', handleCancel);
      confirmBtn.removeEventListener('click', handleConfirm);
      resolve(false);
    };

    const handleConfirm = () => {
      modal.classList.remove('show');
      cancelBtn.removeEventListener('click', handleCancel);
      confirmBtn.removeEventListener('click', handleConfirm);
      resolve(true);
    };

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);
  });
}

async function deleteSchedule(scheduleId) {
  const confirmed = await showDeleteConfirmModal();
  if (!confirmed) return;

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
function renderManualCards() {
  const container = document.getElementById('manualCards');
  if (!container) return;

  if (!Array.isArray(pumps) || pumps.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Nenhuma bomba configurada</div>';
    return;
  }

  container.innerHTML = pumps.map((pump, idx) => {
    if (!pump) return '';
    const pumpName = pump.name || `Bomba ${idx + 1}`;
    const pumpEnabled = pump.enabled;
    return `
      <div class="dosing-card manual-pump-card">
        <div class="schedule-card-header">
          <span class="pump-card-name">${pumpName}</span>
        </div>
        <div style="padding:14px 16px;">
          <label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:6px;">Volume (mL)</label>
          <input type="number" id="manualVolume_${idx}" min="0" value="0"
                 style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:8px 12px;font-size:14px;">
          <button class="btn-primary" style="width:100%;margin-top:10px;" onclick="applyManualDoseFor(${idx})">💧 Aplicar Dose</button>
        </div>
      </div>`;
  }).join('');
}

async function applyManualDoseFor(pumpIndex) {
  const input = document.getElementById(`manualVolume_${pumpIndex}`);
  const volume = input ? parseMl(input.value) : 0;

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
  const pumpName = pump.name || `Bomba ${pumpIndex + 1}`;
  startManualProgress(doseSeconds, pumpName);

  try {
    const result = await apiCall(
      `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/manual`,
      'POST',
      { volume }
    );
    if (result) {
      if (input) input.value = '0';
    }
  } catch (err) {
    // Se falhou, fecha o overlay e cancela o timer
    if (manualDoseTimer) { clearInterval(manualDoseTimer); manualDoseTimer = null; }
    _closeOverlay();
    showError('Erro ao aplicar dose: ' + (err.message || err));
  }
}

async function applyManualDose() {
  const pumpIndex = parseInt(document.getElementById('pumpSelectManual').value, 10);
  const volume = parseMl(document.getElementById('manualVolume') ? document.getElementById('manualVolume').value : '0');



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
function renderCalibrationCards() {
  const container = document.getElementById('calibrationCards');
  if (!container) return;

  if (!Array.isArray(pumps) || pumps.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280;">Nenhuma bomba configurada</div>';
    return;
  }

  container.innerHTML = pumps.map((pump, idx) => {
    if (!pump) return '';
    const pumpName = pump.name || `Bomba ${idx + 1}`;
    const rate = pump.calibration_rate_ml_s > 0 ? formatNumberBr(pump.calibration_rate_ml_s, 3) : '--';
    const rateMin = pump.calibration_rate_ml_s > 0 ? formatNumberBr(pump.calibration_rate_ml_s * 60, 1) : '--';

    return `
      <div class="dosing-card">
        <div class="schedule-card-header" style="padding:14px 16px;">
          <span class="pump-card-name">${pumpName}</span>
        </div>
        <div style="padding:14px 16px;">
          <div style="margin-bottom:12px; font-size:13px; color:#cbd5e1;">
            <div style="color:#94a3b8;margin-bottom:4px;">Taxa Atual:</div>
            <div style="display:flex; align-items:center; gap:8px;">
              <div>
                <div style="font-size:18px;font-weight:600;color:#63b3ed;">${rate} mL/s</div>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px;">(${rateMin} mL/min)</div>
              </div>
              <svg onclick="editCalibrationRate(${idx})" style="width:18px;height:18px;cursor:pointer;fill:#94a3b8;transition:fill 0.2s;flex-shrink:0;" onmouseover="this.style.fill='#63b3ed'" onmouseout="this.style.fill='#94a3b8'" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </div>
          </div>
          <button class="btn-primary" style="width:100%;" onclick="showCalibrationConfirm(${idx})">⚙️ Calibrar Bomba</button>
        </div>
      </div>`;
  }).join('');
}

let currentCalibrationPumpIndex = null;

function showCalibrationConfirm(pumpIndex) {
  const pump = pumps[pumpIndex];
  if (!pump) return;

  currentCalibrationPumpIndex = pumpIndex;
  const pumpName = pump.name || `Bomba ${pumpIndex + 1}`;

  document.getElementById('calibrationPumpName').textContent = pumpName;

  const modal = document.getElementById('calibrationConfirmModal');
  const cancelBtn = document.getElementById('calibrationCancelBtn');
  const confirmBtn = document.getElementById('calibrationConfirmBtn');

  modal.classList.add('show');

  const handleCancel = () => {
    modal.classList.remove('show');
    cancelBtn.removeEventListener('click', handleCancel);
    confirmBtn.removeEventListener('click', handleConfirm);
    currentCalibrationPumpIndex = null;
  };

  const handleConfirm = () => {
    modal.classList.remove('show');
    cancelBtn.removeEventListener('click', handleCancel);
    confirmBtn.removeEventListener('click', handleConfirm);
    startCalibrationCountdown(pumpIndex);
  };

  cancelBtn.addEventListener('click', handleCancel);
  confirmBtn.addEventListener('click', handleConfirm);
}

async function startCalibrationCountdown(pumpIndex) {
  currentCalibrationPumpIndex = pumpIndex;

  const overlay = document.getElementById('calibrationOverlay');
  const textEl = document.getElementById('calibrationCountdownText');
  const barEl = document.getElementById('calibrationProgressFill');

  if (!overlay || !textEl || !barEl) return;

  // Fase 1: Contagem regressiva de 5 segundos
  _openOverlay('calibration');
  barEl.style.width = '0%';

  let countdown = 5;
  textEl.textContent = `Iniciando em ${countdown} segundos...`;

  const countdownInterval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      textEl.textContent = `Iniciando em ${countdown} segundos...`;
    } else {
      clearInterval(countdownInterval);
      startCalibration60s(pumpIndex);
    }
  }, 1000);
}

async function startCalibration60s(pumpIndex) {
  console.log('⚙️ Iniciando calibração (60s):', pumpIndex);

  const overlay = document.getElementById('calibrationOverlay');
  const textEl = document.getElementById('calibrationCountdownText');
  const barEl = document.getElementById('calibrationProgressFill');

  calibrationSecondsTotal = 60;
  calibrationSecondsLeft = 60;

  textEl.textContent = `Calibração em andamento... Restam ${calibrationSecondsLeft} segundos`;
  barEl.style.width = '0%';

  if (calibrationTimer) clearInterval(calibrationTimer);
  calibrationTimer = setInterval(() => {
    calibrationSecondsLeft--;

    const pct = ((calibrationSecondsTotal - calibrationSecondsLeft) / calibrationSecondsTotal) * 100;
    barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    const s = calibrationSecondsLeft <= 0 ? 0 : calibrationSecondsLeft;
    textEl.textContent = `Calibração em andamento... Restam ${s} segundos`;

    if (calibrationSecondsLeft <= 0) {
      clearInterval(calibrationTimer);
      calibrationTimer = null;
      textEl.textContent = '✓ Calibração concluída! Meça o volume...';
      barEl.style.width = '100%';
      setTimeout(() => {
        _closeOverlay();
        const targetPump = pumpIndex;
        currentCalibrationPumpIndex = null;
        showMeasuredVolumeInput(targetPump);
      }, 800);
    }
  }, 1000);
}

function showMeasuredVolumeInput(pumpIndex) {
  const pump = pumps[pumpIndex];
  const pumpName = pump ? (pump.name || `Bomba ${pumpIndex + 1}`) : `Bomba ${pumpIndex + 1}`;

  const volume = prompt(`✅ Calibração concluída para ${pumpName}!\n\nDigite o volume medido (em mL):`);

  if (volume !== null && volume.trim() !== '') {
    const measuredVol = parseMl(volume.trim());
    if (measuredVol > 0) {
      saveCalibrationFor(pumpIndex, measuredVol);
    } else {
      showError('Volume inválido. Tente novamente.');
    }
  }
}

async function saveCalibrationFor(pumpIndex, measuredVolume) {
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
    showSuccess(`Calibração salva! Taxa: ${formatNumberBr(rateNum, 3)} mL/s`);

    if (pumps[pumpIndex]) {
      pumps[pumpIndex].calibration_rate_ml_s = Number(rateNum);
    }

    renderCalibrationCards();
  }
}

function editCalibrationRate(pumpIndex) {
  const pump = pumps[pumpIndex];
  if (!pump) return;

  const pumpName = pump.name || `Bomba ${pumpIndex + 1}`;
  const currentRate = pump.calibration_rate_ml_s > 0 ? pump.calibration_rate_ml_s : 0;
  const currentVolume60s = currentRate > 0 ? (currentRate * 60).toFixed(1) : '';

  document.getElementById('editCalibrationPumpName').textContent = pumpName;
  document.getElementById('editCalibrationCurrentRate').textContent = `${formatNumberBr(currentRate, 3)} mL/s`;
  document.getElementById('editCalibrationVolumeInput').value = currentVolume60s;

  const modal = document.getElementById('editCalibrationModal');
  const input = document.getElementById('editCalibrationVolumeInput');
  const cancelBtn = document.getElementById('editCalibrationCancelBtn');
  const confirmBtn = document.getElementById('editCalibrationConfirmBtn');

  modal.classList.add('show');
  setTimeout(() => input.focus(), 100);

  const handleCancel = () => {
    modal.classList.remove('show');
    cancelBtn.removeEventListener('click', handleCancel);
    confirmBtn.removeEventListener('click', handleConfirm);
  };

  const handleConfirm = () => {
    const newVolumeStr = input.value.trim();
    if (newVolumeStr !== '') {
      const newVolume = parseFloat(newVolumeStr.replace(',', '.'));
      if (newVolume > 0 && !isNaN(newVolume)) {
        modal.classList.remove('show');
        cancelBtn.removeEventListener('click', handleCancel);
        confirmBtn.removeEventListener('click', handleConfirm);
        saveManualCalibrationRate(pumpIndex, newVolume);
      } else {
        showError('Volume inválido. Digite um número positivo.');
      }
    }
  };

  cancelBtn.addEventListener('click', handleCancel);
  confirmBtn.addEventListener('click', handleConfirm);
}

async function saveManualCalibrationRate(pumpIndex, measuredVolume) {
  if (!currentDevice) {
    showError('Device inválido');
    return;
  }

  console.log('✏️ Salvando calibração manual:', pumpIndex, measuredVolume, 'mL em 60s');

  const result = await apiCall(
    `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/save`,
    'POST',
    { measured_volume: measuredVolume }
  );

  if (result && result.data && typeof result.data.ml_per_second === 'number') {
    const rateNum = result.data.ml_per_second;
    showSuccess(`Calibração atualizada! Taxa: ${formatNumberBr(rateNum, 3)} mL/s`);

    if (pumps[pumpIndex]) {
      pumps[pumpIndex].calibration_rate_ml_s = Number(rateNum);
    }

    renderCalibrationCards();
  }
}


async function abortCalibration() {
  const operacao = _overlayMode === 'manual' ? 'dose manual' : 'calibração';
  if (!confirm(`Abortar a ${operacao} em andamento?\n\nA bomba será parada imediatamente.`)) return;

  // Para todos os timers ativos
  if (calibrationTimer) { clearInterval(calibrationTimer); calibrationTimer = null; }
  if (manualDoseTimer)  { clearInterval(manualDoseTimer);  manualDoseTimer  = null; }

  _closeOverlay();

  try {
    const pumpIndex = currentCalibrationPumpIndex != null
      ? currentCalibrationPumpIndex
      : parseInt(document.getElementById('pumpSelectCalibration').value, 10);
    const pump = pumps[pumpIndex];
    if (pump && pump.id) {
      await apiCall(`/api/v1/user/dosing/pumps/${pump.id}/calibrate/abort`, 'POST');
      await apiCall(`/api/v1/user/dosing/pumps/${pump.id}/manual/abort`, 'POST');
      console.log('✅ Bomba parada:', pumpIndex);
    }
  } catch (e) {
    console.warn('Falha ao chamar abort no device', e);
  }

  currentCalibrationPumpIndex = null;
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


function startManualProgress(totalSeconds, pumpName) {
  const textEl = document.getElementById('calibrationCountdownText');
  const barEl  = document.getElementById('calibrationProgressFill');
  if (!textEl || !barEl) return;

  if (manualDoseTimer) { clearInterval(manualDoseTimer); manualDoseTimer = null; }

  let left  = Math.max(1, Math.round(totalSeconds));
  let total = left;

  _openOverlay('manual');
  barEl.style.width = '0%';
  const bombaLabel = pumpName ? ` — ${pumpName}` : '';
  textEl.textContent = `Bomba ligada${bombaLabel}. Dosando... (${left}s restantes)`;

  manualDoseTimer = setInterval(() => {
    left--;
    const pct = ((total - left) / total) * 100;
    barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    textEl.textContent = `Bomba ligada${bombaLabel}. Dosando... (${Math.max(0, left)}s restantes)`;

    if (left <= 0) {
      clearInterval(manualDoseTimer);
      manualDoseTimer = null;
      textEl.textContent = `✓ Dose aplicada${bombaLabel}!`;
      barEl.style.width = '100%';
      setTimeout(() => _closeOverlay(), 1200);
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
    volume_per_day_ml: sched.volume_per_day_ml || sched.volume_per_day || 0
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


function generateTimersForToday() {
  if (!Array.isArray(schedules) || !Array.isArray(pumps)) {
    const listEl = document.getElementById('timersList');
    if (listEl) listEl.innerHTML = '<div class="no-timers">Carregando dados...</div>';
    return;
  }

  const listEl = document.getElementById('timersList');
  if (!listEl) return;

  const today   = new Date();
  const weekday = today.getDay(); // 0=Dom..6=Sab
  const tomorrow = (weekday + 1) % 7; // dia seguinte

  const timers = [];

  schedules.forEach(s => {
    if (!s.enabled) return;

    const pump = pumps.find(p => p.index_on_device === s.pump_index);
    if (!pump) return;

    const dosesPerDay = s.doses_per_day || 1;
    const volDay = s.volume_per_day_ml || s.volume_per_day || 0;

    // Verificar se agenda cruza meia-noite
    const start = s.start_time || '00:00';
    const end   = s.end_time   || '23:59';
    const [sh] = start.split(':').map(Number);
    const [eh] = end.split(':').map(Number);
    const crossesMidnight = eh < sh || (eh === sh && end < start);

    // Usar adjusted_times se disponível (horários ajustados pelo backend)
    let adjustedTimes = [];
    if (s.adjusted_times && typeof s.adjusted_times === 'string') {
      try {
        adjustedTimes = JSON.parse(s.adjusted_times);
      } catch (e) {
        console.warn('Erro ao parsear adjusted_times:', e);
      }
    } else if (Array.isArray(s.adjusted_times)) {
      adjustedTimes = s.adjusted_times;
    }

    if (adjustedTimes && adjustedTimes.length > 0) {
      // com horários ajustados - detectar se cruza meia-noite
      const firstTime = adjustedTimes[0];
      const [fh, fm] = firstTime.split(':').map(Number);
      const firstSec = fh * 3600 + fm * 60;

      adjustedTimes.forEach((timeStr, idx) => {
        if (!timeStr) return;

        const [h, m] = timeStr.split(':').map(v => Math.round(parseFloat(v)));
        let sec = h * 3600 + m * 60;

        // Detectar se é "amanhã" (cruzou meia-noite)
        let isTomorrow = false;
        let sortKey = sec;
        let displayTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

        if (crossesMidnight && sec < firstSec && (firstSec - sec) > 12 * 3600) {
          isTomorrow = true;
          sortKey = sec + 24 * 3600;
          displayTime += ' <span style="color:#9ca3af; font-size:11px;">(amanhã)</span>';
        }

        // Verificar se o dia (hoje ou amanhã) está nos days_of_week
        const relevantDay = isTomorrow ? tomorrow : weekday;
        if (!Array.isArray(s.days_of_week) || !s.days_of_week.includes(relevantDay)) {
          return; // pular esta dose
        }

        let volDose;
        if (Array.isArray(s.dose_volumes) && s.dose_volumes.length > 0) {
          volDose = s.dose_volumes[idx] ?? s.dose_volumes[s.dose_volumes.length - 1];
        } else {
          volDose = dosesPerDay > 0 ? volDay / dosesPerDay : 0;
        }

        timers.push({
          sortKey: sortKey,
          time: displayTime,
          pumpName: pump.name || `Bomba ${s.pump_index + 1}`,
          volume: volDose,
          doseNumber: idx + 1,
          totalDoses: dosesPerDay,
          scheduleId: s.id
        });
      });
    } else {
      // fallback: calcular horários uniformemente
      const start = s.start_time || '00:00';
      const end   = s.end_time   || '23:59';

      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);

      let startSec = sh * 3600 + sm * 60;
      let endSec   = eh * 3600 + em * 60;

      if (dosesPerDay <= 0) return;

      // Se horário cruza meia-noite (ex: 21:50 - 03:00), ajustar endSec
      if (endSec <= startSec) {
        endSec += 24 * 3600; // adiciona 24h ao horário final
      }

      const rangeSec = endSec - startSec;
      const interval = rangeSec / dosesPerDay;

      for (let i = 0; i < dosesPerDay; i++) {
        let sec = Math.round(startSec + i * interval);

        // Se passou da meia-noite, normalizar APENAS para exibição
        const normalizedSec = sec % (24 * 3600);
        const h   = Math.floor(normalizedSec / 3600);
        const m   = Math.floor((normalizedSec % 3600) / 60);

        // Detectar se é "amanhã"
        const isTomorrow = sec >= 24 * 3600;
        let displayTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        if (isTomorrow) {
          displayTime += ' <span style="color:#9ca3af; font-size:11px;">(amanhã)</span>';
        }

        // Verificar se o dia (hoje ou amanhã) está nos days_of_week
        const relevantDay = isTomorrow ? tomorrow : weekday;
        if (!Array.isArray(s.days_of_week) || !s.days_of_week.includes(relevantDay)) {
          continue; // pular esta dose
        }

        let volDose;
        if (Array.isArray(s.dose_volumes) && s.dose_volumes.length > 0) {
          volDose = s.dose_volumes[i] ?? s.dose_volumes[s.dose_volumes.length - 1];
        } else {
          volDose = dosesPerDay > 0 ? volDay / dosesPerDay : 0;
        }

        timers.push({
          sortKey: sec, // USA o valor SEM normalizar para manter ordem correta
          time: displayTime,
          pumpName: pump.name || `Bomba ${s.pump_index + 1}`,
          volume: volDose,
          doseNumber: i + 1,
          totalDoses: dosesPerDay,
          scheduleId: s.id
        });
      }
    }
  });

  timers.sort((a, b) => a.sortKey - b.sortKey);

  if (!timers.length) {
    listEl.innerHTML = '<div class="no-timers">Nenhuma dose programada para hoje.</div>';
    return;
  }

  listEl.innerHTML = `
    <div class="timers-grid">
      ${timers.map(t => {
        const volStr = t.volume.toFixed(2).replace('.', ',');
        const doseInfo = t.doseNumber && t.totalDoses ? `Dose ${t.doseNumber}/${t.totalDoses}` : '';
        return `
          <div class="timer-card">
            <div>
              <div class="timer-time">${t.time}</div>
              <div class="timer-pump">${t.pumpName}</div>
              ${doseInfo ? `<div class="timer-dose-number" style="font-size:11px; color:#9ca3af; margin-top:2px;">${doseInfo}</div>` : ''}
            </div>
            <div class="timer-volume">${volStr} ml</div>
          </div>
        `;
      }).join('')}
    </div>
  `;


  // opçao vertical de timers
  /*
  listEl.innerHTML = `
    <div class="timers-grid">
      ${timers.map(t => `
        <div class="timer-card">
          <div class="timer-time">${t.time}</div>
          <div class="timer-pump">${t.pumpName}</div>
          <div class="timer-volume">${t.volume.toFixed(2)} ml</div>
        </div>
      `).join('')}
    </div>
  `;*/
}


function openTimersModal() {
  generateTimersForToday();
  const modal = document.getElementById('timersModal');
  if (modal) modal.classList.add('active');
}

function closeTimersModal() {
  const modal = document.getElementById('timersModal');
  if (modal) modal.classList.remove('active');
}

// listeners globais
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'timersBtn') {
    openTimersModal();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('timersClose');
  if (closeBtn) closeBtn.addEventListener('click', closeTimersModal);

  const modal = document.getElementById('timersModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeTimersModal();
    });
  }
});


// ===== MODAL CLOSE =====
window.addEventListener('click', (e) => {
  const editModal         = document.getElementById('editModal');
  const agendaModal       = document.getElementById('agendaModal');
  const editScheduleModal = document.getElementById('editScheduleModal');

  if (e.target === editModal)         editModal.classList.remove('show');
  if (e.target === agendaModal)       agendaModal.classList.remove('show');
  if (e.target === editScheduleModal) editScheduleModal.classList.remove('show');
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
