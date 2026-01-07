// dashboard-dosing.js
// ReefBlueSky Dosadora Dashboard - Frontend JS
// Baseado no HTML file:337 + APIs file:180 + schema file:234

const currentUserId = getUserFromJWT(); // de dashboard-common.js
let selectedDeviceId = null;
let pumpsData = [];
let schedulesData = [];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadDevices();
  setupEventListeners();
  setupTabs();
});

// ===== NAVEGAÇÃO ABAS =====
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
    const res = await fetch(`/api/v1/user/dosing/devices`);
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('devices-list');
      container.innerHTML = '';
      
      if (data.data.length === 0) {
        container.innerHTML = '<p>Nenhum device dosadora registrado.</p>';
        return;
      }

      data.data.forEach(device => {
        const div = document.createElement('div');
        div.className = 'device-card';
        div.innerHTML = `
          <div class="device-header">
            <h3>${escapeHtml(device.name)}</h3>
            <span class="status ${device.online ? 'online' : 'offline'}">
              ${device.online ? '🟢 ONLINE' : '🔴 OFFLINE'}
            </span>
          </div>
          <p><strong>ESP UID:</strong> ${device.esp_uid}</p>
          <p><strong>HW:</strong> ${device.hw_type} | <strong>FW:</strong> ${device.firmware_version}</p>
          <p><strong>Bombas:</strong> ${device.pump_count} | <strong>Alertas:</strong> ${device.alert_count}</p>
          <div class="device-actions">
            <button onclick="selectDevice(${device.id})" class="btn-primary">Configurar</button>
            <button onclick="editDevice(${device.id})" class="btn-secondary">Editar</button>
            <button onclick="deleteDevice(${device.id})" class="btn-danger">Remover</button>
          </div>
        `;
        container.appendChild(div);
      });
    }
  } catch (err) {
    showToast('Erro ao carregar devices', 'error');
  }
}

function selectDevice(deviceId) {
  selectedDeviceId = deviceId;
  document.getElementById('device-selector').value = deviceId;
  loadPumps(deviceId);
  loadSchedules(deviceId);
  showToast('Device selecionado');
}

// ===== PUMPS =====
async function loadPumps(deviceId) {
  if (!deviceId) return;
  
  try {
    const res = await fetch(`/api/v1/user/dosing/pumps?deviceId=${deviceId}`);
    const data = await res.json();
    
    if (data.success) {
      pumpsData = data.data;
      const container = document.getElementById('pumps-list');
      container.innerHTML = '';

      pumpsData.forEach(pump => {
        const div = document.createElement('div');
        div.className = `pump-card ${!pump.enabled ? 'disabled' : ''}`;
        div.innerHTML = `
          <div class="pump-header">
            <h4>${escapeHtml(pump.name)} (Índice ${pump.index_on_device})</h4>
            <label class="switch">
              <input type="checkbox" ${pump.enabled ? 'checked' : ''} onchange="togglePump(${pump.id}, this.checked)">
              <span class="slider"></span>
            </label>
          </div>
          <div class="pump-stats">
            <div class="stat">
              <span>Volume Atual</span>
              <strong>${pump.current_volume_ml}/${pump.container_volume_ml} mL</strong>
              <div class="progress" style="width: 100%; height: 8px;">
                <div class="progress-bar" style="width: ${(pump.current_volume_ml/pump.container_volume_ml)*100}%"></div>
              </div>
            </div>
            <div class="stats-row">
              <span>Calibração: ${pump.calibration_rate_ml_s} mL/s</span>
              <span>Alarme: ${pump.alarm_threshold_pct}%</span>
              <span>Máx Diário: ${pump.max_daily_ml} mL</span>
            </div>
          </div>
          <div class="pump-actions">
            <button onclick="editPump(${pump.id})" class="btn-small">Editar</button>
            <button onclick="doseManual(${pump.id})" class="btn-primary">Dose Manual</button>
            <button onclick="calibratePump(${pump.id})" class="btn-secondary">Calibrar</button>
          </div>
        `;
        container.appendChild(div);
      });
    }
  } catch (err) {
    showToast('Erro ao carregar bombas', 'error');
  }
}

async function togglePump(pumpId, enabled) {
  try {
    const res = await fetch(`/api/v1/user/dosing/pumps/${pumpId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    const data = await res.json();
    if (data.success) {
      loadPumps(selectedDeviceId);
      showToast(`Bomba ${enabled ? 'ativada' : 'desativada'}`);
    }
  } catch (err) {
    showToast('Erro ao atualizar bomba', 'error');
  }
}

async function doseManual(pumpId) {
  const volume = prompt('Volume da dose manual (mL):');
  if (!volume || isNaN(volume) || volume <= 0) return;

  try {
    const res = await fetch(`/api/v1/user/dosing/pumps/${pumpId}/dose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume_ml: parseFloat(volume) })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Dose manual ${volume}mL enfileirada`);
    }
  } catch (err) {
    showToast('Erro ao disparar dose', 'error');
  }
}

// ===== SCHEDULES =====
async function loadSchedules(deviceId) {
  if (!deviceId) return;
  
  try {
    pumpsData.forEach(async pump => {
      const res = await fetch(`/api/v1/user/dosing/schedules?pumpId=${pump.id}`);
      const data = await res.json();
      
      if (data.success) {
        schedulesData[pump.id] = data.data || [];
        // Renderizar agendas da bomba no HTML
        renderPumpSchedules(pump.id);
      }
    });
  } catch (err) {
    console.error('Erro ao carregar agendas');
  }
}

function renderPumpSchedules(pumpId) {
  const schedules = schedulesData[pumpId] || [];
  const container = document.querySelector(`#pump-${pumpId}-schedules`);
  if (!container) return;

  container.innerHTML = schedules.map(s => `
    <div class="schedule-item">
      <span>${s.doses_per_day} doses/dia: ${s.start_time} → ${s.end_time} (${s.volume_per_day_ml}mL)</span>
      <span class="days">${decodeDaysMask(s.days_mask)}</span>
      <button onclick="toggleSchedule(${s.id}, ${s.enabled})">Toggle</button>
    </div>
  `).join('');
}

function decodeDaysMask(mask) {
  const days = ['Dom', 'Sáb', 'Sex', 'Qui', 'Qua', 'Ter', 'Seg'];
  let decoded = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) decoded.push(days[i]);
  }
  return decoded.join(', ');
}

// ===== CRUD FORMS =====
document.getElementById('add-device-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);

  try {
    const res = await fetch('/api/v1/user/dosing/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      loadDevices();
      e.target.reset();
      showToast('Device criado!');
    }
  } catch (err) {
    showToast('Erro ao criar device', 'error');
  }
});

document.getElementById('add-pump-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  formData.append('device_id', selectedDeviceId);
  const data = Object.fromEntries(formData);

  try {
    const res = await fetch('/api/v1/user/dosing/pumps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      loadPumps(selectedDeviceId);
      e.target.reset();
      showToast('Bomba adicionada!');
    }
  } catch (err) {
    showToast('Erro ao adicionar bomba', 'error');
  }
});

// ===== UTILITários =====
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function showToast(message, type = 'success') {
  // Implementar toast usando dashboard-common.js
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  document.getElementById('device-selector')?.addEventListener('change', (e) => {
    selectedDeviceId = e.target.value;
    if (selectedDeviceId) {
      loadPumps(selectedDeviceId);
      loadSchedules(selectedDeviceId);
    }
  });

  // Refresh automático a cada 30s
  setInterval(() => {
    if (selectedDeviceId) {
      loadPumps(selectedDeviceId);
    }
    loadDevices();
  }, 30000);
}

console.log('Dashboard-Dosing.js carregado!');
