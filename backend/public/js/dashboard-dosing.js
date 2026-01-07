/**
 * ReefBlueSky Dosadora Dashboard v2
 * Frontend melhorado com:
 * - Real-time polling + WebSocket-ready
 * - Fila offline-first de comandos
 * - Status visual em tempo real
 * - Sincronização automática
 */

const DOSING_API = '/api/v1/user/dosing';
const POLL_INTERVAL = 5000; // 5s (como JoyReef)
const COMMAND_QUEUE_KEY = 'dosing_command_queue';
const token = localStorage.getItem('token');
if (!token) {
  redirectToLogin();  // função definida em dashboard-common.js
}

let currentUserId = getUserFromJWT();


let currentUserId = getUserFromJWT();
let selectedDeviceId = null;
let selectedPumpId = null;
let devices = [];
let pumps = [];
let schedules = [];
let pollIntervalId = null;
let lastStatusUpdate = {};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await DashboardCommon.initTopbar(); 
  console.log('[Dosing] Iniciando dashboard...');
  await loadDevices();
  setupEventListeners();
  setupTabs();
  startPolling();
});


// ===== POLLING (como JoyReef) =====
function startPolling() {
  console.log('[Dosing] Iniciando polling de status...');
  pollIntervalId = setInterval(async () => {
    if (selectedDeviceId) {
      await loadDeviceStatus(selectedDeviceId);
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
}

// ===== TABS =====
function setupTabs() {
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(target).classList.remove('hidden');
    });
  });
}

// ===== DEVICES =====
async function loadDevices() {
  try {
    showLoading('devices-list');
    const res = await apiCall(`${DOSING_API}/devices`);
    devices = res.data || [];
    
    const container = document.getElementById('devices-list');
    container.innerHTML = '';
    
    if (devices.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info">
          📌 Nenhum device dosadora registrado
        </div>
      `;
      return;
    }
    
    devices.forEach(device => {
      const statusClass = device.online ? 'status-online' : 'status-offline';
      const statusText = device.online ? '🟢 Online' : '🔴 Offline';
      const timeSinceLastSeen = formatTime(device.last_seen);
      
      const card = document.createElement('div');
      card.className = `device-card ${statusClass}`;
      card.innerHTML = `
        <div class="device-header">
          <h3>${device.name}</h3>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        
        <div class="device-info">
          <p><strong>ESP UID:</strong> <code>${device.esp_uid}</code></p>
          <p><strong>Hardware:</strong> ${device.hw_type} | <strong>FW:</strong> ${device.firmware_version || 'N/A'}</p>
          <p><strong>Bombas:</strong> ${device.pump_count} | <strong>Alertas pendentes:</strong> ${device.alert_count}</p>
          <p><strong>Último contato:</strong> ${timeSinceLastSeen}</p>
          ${device.last_ip ? `<p><strong>IP:</strong> ${device.last_ip}</p>` : ''}
        </div>
        
        <div class="device-actions">
          <button class="btn btn-primary" onclick="selectDevice(${device.id})">
            Gerenciar
          </button>
          <button class="btn btn-secondary" onclick="deleteDevice(${device.id})">
            Remover
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    showError('devices-list', `Erro ao carregar devices: ${err.message}`);
  }
}

async function selectDevice(deviceId) {
  selectedDeviceId = deviceId;
  selectedPumpId = null;
  
  // Navegar para primeira aba visível
  const firstTab = document.querySelector('[data-tab]');
  if (firstTab) firstTab.click();
  
  // Carregar dados do device
  await loadPumps(deviceId);
  await loadDeviceStatus(deviceId);
}

async function loadDeviceStatus(deviceId) {
  try {
    const res = await apiCall(`${DOSING_API}/devices`);
    const device = res.data?.find(d => d.id === deviceId);
    
    if (device) {
      lastStatusUpdate[deviceId] = {
        online: device.online,
        lastSeen: device.last_seen,
        timestamp: Date.now()
      };
      
      // Atualizar UI de status do device selecionado
      updateDeviceStatusUI(device);
    }
  } catch (err) {
    console.error('[Dosing] Erro ao carregar status:', err);
  }
}

function updateDeviceStatusUI(device) {
  const header = document.querySelector('.device-status-header');
  if (!header) return;
  
  const statusClass = device.online ? 'status-online' : 'status-offline';
  const statusText = device.online ? '🟢 Online' : '🔴 Offline';
  
  header.innerHTML = `
    <h2>${device.name}</h2>
    <span class="status-badge ${statusClass}">${statusText}</span>
  `;
}

async function deleteDevice(deviceId) {
  if (!confirm('Tem certeza? Isso vai deletar todas as bombas e agendas.')) return;
  
  try {
    await apiCall(`${DOSING_API}/devices/${deviceId}`, 'DELETE');
    showSuccess('Dosadora removida!');
    await loadDevices();
  } catch (err) {
    showError('Erro ao remover device:', err.message);
  }
}

// ===== PUMPS =====
async function loadPumps(deviceId) {
  try {
    showLoading('pumps-list');
    const res = await apiCall(`${DOSING_API}/pumps?deviceId=${deviceId}`);
    pumps = res.data || [];
    
    const container = document.getElementById('pumps-list');
    container.innerHTML = '';
    
    if (pumps.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info">
          Nenhuma bomba configurada para este device
        </div>
      `;
      return;
    }
    
    pumps.forEach(pump => {
      const percentage = (pump.current_volume_ml / pump.container_volume_ml * 100).toFixed(1);
      const isLow = percentage < 30;
      const pumpCard = createPumpCard(pump, percentage, isLow);
      container.appendChild(pumpCard);
    });
  } catch (err) {
    showError('pumps-list', `Erro ao carregar bombas: ${err.message}`);
  }
}

function createPumpCard(pump, percentage, isLow) {
  const card = document.createElement('div');
  card.className = `pump-card ${isLow ? 'pump-low' : ''}`;
  
  const progressColor = percentage < 20 ? '#ff4444' : percentage < 50 ? '#ffaa00' : '#00cc44';
  
  card.innerHTML = `
    <div class="pump-header">
      <h4>${pump.name} (Índice: ${pump.index_on_device})</h4>
      <span class="pump-status ${pump.enabled ? 'enabled' : 'disabled'}">
        ${pump.enabled ? '✓ Ativa' : '✗ Inativa'}
      </span>
    </div>
    
    <div class="pump-volume">
      <div class="volume-bar">
        <div class="volume-fill" style="width: ${percentage}%; background: ${progressColor};"></div>
      </div>
      <p class="volume-text">${pump.current_volume_ml}mL / ${pump.container_volume_ml}mL (${percentage}%)</p>
    </div>
    
    <div class="pump-info">
      <p><strong>Taxa calibração:</strong> ${pump.calibration_rate_ml_s.toFixed(2)} mL/s</p>
      <p><strong>Máx diário:</strong> ${pump.max_daily_ml} mL</p>
    </div>
    
    <div class="pump-actions">
      <button class="btn btn-small btn-primary" onclick="openDoseDialog(${pump.id}, '${pump.name}')">
        💧 Dosar
      </button>
      <button class="btn btn-small btn-secondary" onclick="openPumpSettings(${pump.id})">
        ⚙️ Editar
      </button>
    </div>
  `;
  
  return card;
}

// ===== DOSE MANUAL (com fila offline) =====
function openDoseDialog(pumpId, pumpName) {
  const input = prompt(`Volume a dosar em ${pumpName} (mL):`);
  if (!input) return;
  
  const volumeML = parseFloat(input);
  if (isNaN(volumeML) || volumeML <= 0) {
    showError('Volume inválido');
    return;
  }
  
  queueDoseCommand(pumpId, volumeML, pumpName);
}

async function queueDoseCommand(pumpId, volumeML, pumpName) {
  const command = {
    id: `cmd_${Date.now()}`,
    pumpId,
    volumeML,
    pumpName,
    timestamp: Date.now(),
    status: 'QUEUED',
    attempts: 0
  };
  
  // Adicionar à fila local
  let queue = JSON.parse(localStorage.getItem(COMMAND_QUEUE_KEY) || '[]');
  queue.push(command);
  localStorage.setItem(COMMAND_QUEUE_KEY, JSON.stringify(queue));
  
  console.log('[Dosing] Comando enfileirado:', command);
  showSuccess(`Dose enfileirada: ${volumeML}mL em ${pumpName}`);
  
  // Se device está online, tentar executar imediatamente
  if (selectedDeviceId && lastStatusUpdate[selectedDeviceId]?.online) {
    await processCommandQueue();
  }
}

async function processCommandQueue() {
  let queue = JSON.parse(localStorage.getItem(COMMAND_QUEUE_KEY) || '[]');
  const pending = queue.filter(c => c.status === 'QUEUED');
  
  for (const cmd of pending) {
    try {
      const res = await apiCall(`${DOSING_API}/pumps/${cmd.pumpId}/dose`, 'POST', {
        volume_ml: cmd.volumeML
      });
      
      if (res.success) {
        cmd.status = 'SENT';
        cmd.timestamp = Date.now();
        console.log('[Dosing] Dose enviada:', cmd);
      }
    } catch (err) {
      cmd.attempts++;
      if (cmd.attempts > 3) {
        cmd.status = 'FAILED';
        console.error('[Dosing] Dose falhou após 3 tentativas:', cmd);
      }
    }
  }
  
  localStorage.setItem(COMMAND_QUEUE_KEY, JSON.stringify(queue));
}

// ===== AGENDAS =====
async function loadSchedules(pumpId) {
  try {
    showLoading('schedules-list');
    const res = await apiCall(`${DOSING_API}/schedules?pumpId=${pumpId}`);
    schedules = res.data || [];
    
    const container = document.getElementById('schedules-list');
    container.innerHTML = '';
    
    if (schedules.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info">
          Nenhuma agenda para esta bomba
        </div>
      `;
      return;
    }
    
    schedules.forEach(schedule => {
      const card = document.createElement('div');
      card.className = 'schedule-card';
      card.innerHTML = `
        <div class="schedule-header">
          <h4>${schedule.doses_per_day} dose(s) por dia</h4>
          <span class="schedule-status ${schedule.enabled ? 'enabled' : 'disabled'}">
            ${schedule.enabled ? '✓ Ativa' : '✗ Inativa'}
          </span>
        </div>
        
        <div class="schedule-info">
          <p><strong>Horários:</strong> ${schedule.start_time} - ${schedule.end_time}</p>
          <p><strong>Volume total:</strong> ${schedule.volume_per_day_ml} mL</p>
          <p><strong>Dias:</strong> ${formatDaysMask(schedule.days_mask)}</p>
        </div>
        
        <div class="schedule-actions">
          <button class="btn btn-small btn-secondary" onclick="editSchedule(${schedule.id})">
            ✏️ Editar
          </button>
          <button class="btn btn-small btn-danger" onclick="deleteSchedule(${schedule.id})">
            🗑️ Remover
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    showError('schedules-list', `Erro ao carregar agendas: ${err.message}`);
  }
}

// ===== HELPERS =====
function setupEventListeners() {
  // Criar bomba
  const createPumpBtn = document.getElementById('create-pump-btn');
  if (createPumpBtn) {
    createPumpBtn.addEventListener('click', async () => {
      if (!selectedDeviceId) {
        showError('Selecione um device primeiro');
        return;
      }
      await showCreatePumpDialog(selectedDeviceId);
    });
  }
  
  // Criar agenda
  const createScheduleBtn = document.getElementById('create-schedule-btn');
  if (createScheduleBtn) {
    createScheduleBtn.addEventListener('click', async () => {
      if (!selectedPumpId) {
        showError('Selecione uma bomba primeiro');
        return;
      }
      await showCreateScheduleDialog(selectedPumpId);
    });
  }
}

async function showCreatePumpDialog(deviceId) {
  const name = prompt('Nome da bomba:');
  if (!name) return;
  
  const indexStr = prompt('Índice na ESP (0-3):');
  const index = parseInt(indexStr);
  if (isNaN(index) || index < 0 || index > 3) {
    showError('Índice inválido');
    return;
  }
  
  const containerVolume = prompt('Volume do recipiente (mL):', '500');
  if (!containerVolume) return;
  
  try {
    await apiCall(`${DOSING_API}/pumps`, 'POST', {
      device_id: deviceId,
      name,
      index_on_device: index,
      container_volume_ml: parseFloat(containerVolume),
      calibration_rate_ml_s: 1.0,
      alarm_threshold_pct: 10,
      max_daily_ml: 1000
    });
    
    showSuccess('Bomba criada!');
    await loadPumps(deviceId);
  } catch (err) {
    showError('Erro ao criar bomba:', err.message);
  }
}

async function showCreateScheduleDialog(pumpId) {
  // Simplificado: usar formulário modal em HTML depois
  // Por agora, um prompt simples
  const dosesPerDay = prompt('Doses por dia:');
  if (!dosesPerDay) return;
  
  const startTime = prompt('Horário início (HH:MM):', '08:00');
  const endTime = prompt('Horário fim (HH:MM):', '20:00');
  const volumePerDay = prompt('Volume total diário (mL):', '100');
  
  try {
    await apiCall(`${DOSING_API}/schedules`, 'POST', {
      pump_id: pumpId,
      enabled: 1,
      days_mask: 127, // Todos os dias
      doses_per_day: parseInt(dosesPerDay),
      start_time: startTime,
      end_time: endTime,
      volume_per_day_ml: parseFloat(volumePerDay)
    });
    
    showSuccess('Agenda criada!');
    await loadSchedules(pumpId);
  } catch (err) {
    showError('Erro ao criar agenda:', err.message);
  }
}

async function deleteSchedule(scheduleId) {
  if (!confirm('Remover agenda?')) return;
  
  try {
    await apiCall(`${DOSING_API}/schedules/${scheduleId}`, 'DELETE');
    showSuccess('Agenda removida!');
    if (selectedPumpId) {
      await loadSchedules(selectedPumpId);
    }
  } catch (err) {
    showError('Erro ao remover agenda:', err.message);
  }
}

function formatDaysMask(mask) {
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const selected = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) {
      selected.push(days[i]);
    }
  }
  return selected.length === 7 ? 'Todos os dias' : selected.join(', ');
}

function formatTime(timestamp) {
  if (!timestamp) return 'Nunca';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = (now - date) / 1000; // segundos
  
  if (diff < 60) return 'Agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

// ===== API CALLS COM TRATAMENTO DE ERRO =====
async function apiCall(url, method = 'GET', body = null) {
  const token = localStorage.getItem('token');
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(url, options);
  
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errData.error || `HTTP ${res.status}`);
  }
  
  return res.json();
}

// ===== UI HELPERS =====
function showLoading(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = '<p>⏳ Carregando...</p>';
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = `<div class="alert alert-danger">${message}</div>`;
  } else {
    alert(`Erro: ${message}`);
  }
}

function showSuccess(message) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-success';
  toast.textContent = `✓ ${message}`;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// ===== CLEANUP =====
window.addEventListener('beforeunload', () => {
  stopPolling();
});
