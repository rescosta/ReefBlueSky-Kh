// Dashboard Dosadora - Script Principal CORRIGIDO
// Usa fetch com Bearer token (sem dependência de apiCall/dashboard-common)

let currentDeviceId = null;
let currentPumpIndex = null;
let currentDeviceName = null;
let cachedPumps = [];
let cachedSchedules = [];

// ===== DOM Elements =====

const deviceSelect = document.getElementById('deviceSelect');
const deviceInfo = document.getElementById('deviceInfo');
const pumpSelectManual = document.getElementById('pumpSelectManual');
const pumpSelectCalibration = document.getElementById('pumpSelectCalibration');
const pumpSelectAgenda = document.getElementById('pumpSelectAgenda');
const configTableBody = document.getElementById('configTableBody');

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

// ===== INIT =====

async function initDashboard() {
  console.log('🚀 Iniciando Dashboard Dosadora...');
  
  const token = getAccessToken();
  if (!token) {
    console.error('❌ Token não encontrado');
    showError('Sessão expirada. Faça login novamente.');
    window.location.href = '/login.html';
    return;
  }
  
  await loadDevices();
}

// ===== Device Selection =====

async function loadDevices() {
  const token = getAccessToken();
  if (!token) {
    showError('Token não encontrado');
    return;
  }

  try {
    console.log('📱 Carregando devices...');
    
    const res = await fetch('/api/v1/user/dosing/devices', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const json = await res.json();
    
    if (!res.ok) {
      throw new Error(json.error || 'Erro ao carregar devices');
    }
    
    const devices = json.data || [];
    console.log('✅ Devices carregados:', devices.length);
    
    deviceSelect.innerHTML = '';
    
    if (devices.length === 0) {
      console.warn('⚠️ Nenhum device encontrado');
      showError('Nenhum device cadastrado');
      return;
    }
    
    // Preencher dropdown
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name} (${d.hw_type})`;
      deviceSelect.appendChild(opt);
    }
    
    // Auto-select primeiro
    if (devices.length > 0) {
      deviceSelect.value = devices[0].id;
      currentDeviceId = devices[0].id;
      currentDeviceName = devices[0].name;
      console.log('✅ Device auto-selecionado:', devices[0].name);
      
      updateDeviceInfo(devices[0]);
      await loadPumps(devices[0].id);
    }
    
  } catch (err) {
    console.error('❌ Erro ao carregar devices:', err);
    showError(err.message);
  }
}

function updateDeviceInfo(device) {
  if (!deviceInfo) return;
  
  const status = device.online ? '🟢 Online' : '🔴 Offline';
  deviceInfo.innerHTML = `
    <strong>${device.name}</strong> • ${device.hw_type} • ${status} • ${device.pump_count || 0} bombas
  `;
}

// Listener para troca de device
if (deviceSelect) {
  deviceSelect.addEventListener('change', async (e) => {
    const deviceId = parseInt(e.target.value);
    if (!deviceId) return;
    
    const token = getAccessToken();
    try {
      console.log('🔄 Buscando device:', deviceId);
      
      const res = await fetch('/api/v1/user/dosing/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const json = await res.json();
      const device = json.data.find(d => d.id == deviceId);
      
      if (device) {
        currentDeviceId = deviceId;
        currentDeviceName = device.name;
        console.log('✅ Device selecionado:', device.name);
        
        updateDeviceInfo(device);
        await loadPumps(deviceId);
      }
      
    } catch (err) {
      console.error('❌ Erro ao trocar device:', err);
      showError(err.message);
    }
  });
}

// ===== Pumps =====

async function loadPumps(deviceId) {
  const token = getAccessToken();
  if (!token || !deviceId) return;
  
  try {
    console.log('💧 Carregando bombas para device:', deviceId);
    
    const res = await fetch(`/api/v1/user/dosing/devices/${deviceId}/pumps`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const json = await res.json();
    
    if (!res.ok) {
      throw new Error(json.error || 'Erro ao carregar bombas');
    }
    
    cachedPumps = json.data || [];
    console.log('✅ Bombas carregadas:', cachedPumps.length);
    
    renderPumpSelectors();
    renderConfigTable();
    
    // Carregar agendas do primeiro pump
    if (cachedPumps.length > 0) {
      currentPumpIndex = cachedPumps[0].index_on_device;
      await loadSchedules(deviceId, currentPumpIndex);
    }
    
  } catch (err) {
    console.error('❌ Erro ao carregar bombas:', err);
    showError(err.message);
  }
}

function renderPumpSelectors() {
  const selectors = [pumpSelectManual, pumpSelectCalibration, pumpSelectAgenda];
  
  selectors.forEach(select => {
    if (!select) return;
    select.innerHTML = '';
    
    cachedPumps.forEach((pump, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${idx + 1} - ${pump.name || `Bomba ${idx + 1}`}`;
      select.appendChild(opt);
    });
    
    select.value = '0';
  });
}

function renderConfigTable() {
  if (!configTableBody) return;
  
  configTableBody.innerHTML = '';
  
  if (cachedPumps.length === 0) {
    configTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 20px;">
          Nenhuma bomba configurada
        </td>
      </tr>
    `;
    return;
  }
  
  cachedPumps.forEach((pump, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${pump.name || `Bomba ${idx + 1}`}</td>
      <td>${pump.active ? '✓ Ativa' : '✗ Inativa'}</td>
      <td>${pump.container_volume || 0} ml</td>
      <td>${pump.current_volume || 0} ml</td>
      <td>${pump.alarm_percentage || 0}%</td>
      <td>${pump.max_daily_dose || 0} ml</td>
      <td>
        <button class="btn btn-sm" onclick="editPump(${pump.id})">Editar</button>
      </td>
    `;
    configTableBody.appendChild(tr);
  });
}

// ===== Schedules =====

async function loadSchedules(deviceId, pumpIndex) {
  const token = getAccessToken();
  if (!token || !deviceId) return;
  
  try {
    console.log('📅 Carregando agendas para pump:', pumpIndex);
    
    const res = await fetch(
      `/api/v1/user/dosing/devices/${deviceId}/pumps/${pumpIndex}/schedules`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const json = await res.json();
    
    if (!res.ok) {
      console.warn('⚠️ Nenhuma agenda encontrada');
      cachedSchedules = [];
      return;
    }
    
    cachedSchedules = json.data || [];
    console.log('✅ Agendas carregadas:', cachedSchedules.length);
    
  } catch (err) {
    console.warn('⚠️ Erro ao carregar agendas:', err.message);
    cachedSchedules = [];
  }
}

// ===== Actions =====

function editPump(pumpId) {
  const pump = cachedPumps.find(p => p.id === pumpId);
  if (!pump) {
    showError('Bomba não encontrada');
    return;
  }
  
  console.log('Editando bomba:', pump);
  showSuccess(`Modo edição: ${pump.name}`);
  // TODO: Implementar modal de edição
}

// ===== Init on page load =====

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM carregado, iniciando dashboard...');
  initDashboard();
});
