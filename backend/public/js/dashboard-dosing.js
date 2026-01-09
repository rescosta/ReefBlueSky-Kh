// Dashboard Dosadora Balling - CORRIGIDO
let currentDevice = null;
let currentPumpIndex = 0;
let devices = [];
let pumps = [];
let schedules = [];

const API_BASE = '/api/v1/user/dosing';

// ===== LOAD PAGE =====
async function loadPage() {
    try {
        await loadDevices();
        if (devices.length > 0) {
            currentDevice = devices[0];
            await loadPumps(currentDevice.id);
            await loadSchedules(currentDevice.id, currentPumpIndex);
        }
    } catch (err) {
        console.error('Erro ao carregar página:', err);
        showError('Erro ao carregar dashboard');
    }
}

// ===== DEVICES =====
async function loadDevices() {
    try {
        const response = await fetch(`${API_BASE}/devices`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Erro ao carregar devices');
        
        devices = result.data || [];
        renderDeviceSelector();
        updateDeviceInfo();
    } catch (err) {
        console.error('Erro loadDevices:', err);
        showError('Erro ao carregar devices');
    }
}

function renderDeviceSelector() {
    const select = document.getElementById('deviceSelect');
    select.innerHTML = '';
    
    if (devices.length === 0) {
        select.innerHTML = '<option>Nenhum device encontrado</option>';
        return;
    }
    
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.id;
        option.textContent = device.name;
        select.appendChild(option);
    });
    
    select.addEventListener('change', onDeviceChange);
}

async function onDeviceChange() {
    const deviceId = document.getElementById('deviceSelect').value;
    currentDevice = devices.find(d => d.id === parseInt(deviceId));
    currentPumpIndex = 0;
    await loadPumps(currentDevice.id);
    updateDeviceInfo();
    await loadSchedules(currentDevice.id, currentPumpIndex);
}

function updateDeviceInfo() {
    if (!currentDevice) return;
    
    const status = currentDevice.online ? '🟢 Online' : '🔴 Offline';
    const info = document.getElementById('deviceInfo');
    info.innerHTML = `
        <strong>${currentDevice.name}</strong> • ${currentDevice.hw_type} • ${status} • ${currentDevice.pump_count || 6} bombas
    `;
}

// ===== PUMPS =====
async function loadPumps(deviceId) {
    try {
        const response = await fetch(`${API_BASE}/devices/${deviceId}/pumps`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Erro ao carregar bombas');
        
        pumps = result.data || [];
        renderPumpSelectors();
        renderConfigTable();
    } catch (err) {
        console.error('Erro loadPumps:', err);
        showError('Erro ao carregar bombas');
    }
}

function renderPumpSelectors() {
    const selectors = ['pumpSelect', 'pumpSelectManual', 'pumpSelectCalibration', 'pumpSelectAgenda'];
    
    selectors.forEach(selectorId => {
        const select = document.getElementById(selectorId);
        if (!select) return;
        
        select.innerHTML = '';
        pumps.forEach((pump, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${index + 1} - ${pump.name}`;
            select.appendChild(option);
        });
        
        // Definir primeira bomba como padrão
        select.value = '0';
        select.addEventListener('change', onPumpChange);
    });
}

function onPumpChange(e) {
    const newIndex = parseInt(e.target.value);
    // Só atualizar currentPumpIndex se for do seletor principal
    if (e.target.id === 'pumpSelect') {
        currentPumpIndex = newIndex;
        loadSchedules(currentDevice.id, currentPumpIndex);
        renderConfigTable();
    }
}

// ===== CONFIG TABLE =====
function renderConfigTable() {
    const tbody = document.getElementById('configTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    pumps.forEach((pump, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${pump.name}</td>
            <td>${pump.active ? '✓ Ativa' : '✗ Inativa'}</td>
            <td>${pump.container_size || 0}</td>
            <td>${pump.current_volume || 0}</td>
            <td>${pump.alarm_percent || 0}%</td>
            <td>${pump.daily_max || 0}</td>
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
    document.getElementById('editName').value = pump.name;
    document.getElementById('editContainerSize').value = pump.container_size || 0;
    document.getElementById('editCurrentVolume').value = pump.current_volume || 0;
    document.getElementById('editAlarmPercent').value = pump.alarm_percent || 0;
    document.getElementById('editDailyMax').value = pump.daily_max || 0;
    
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
        container_size: parseInt(document.getElementById('editContainerSize').value),
        current_volume: parseInt(document.getElementById('editCurrentVolume').value),
        alarm_percent: parseInt(document.getElementById('editAlarmPercent').value),
        daily_max: parseInt(document.getElementById('editDailyMax').value)
    };
    
    console.log('Enviando PUT para:', `${API_BASE}/devices/${currentDevice.id}/pumps/${index}`);
    console.log('Dados:', data);
    
    try {
        const response = await fetch(`${API_BASE}/devices/${currentDevice.id}/pumps/${index}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('Response:', result);
        
        if (!response.ok) {
            throw new Error(result.error || 'Erro ao salvar');
        }
        
        showSuccess('✅ Bomba atualizada com sucesso!');
        closeEditModal();
        await loadPumps(currentDevice.id);
    } catch (err) {
        console.error('Erro ao salvar:', err);
        showError('Erro ao salvar: ' + err.message);
    }
}

// ===== SCHEDULES =====
async function loadSchedules(deviceId, pumpIndex) {
    try {
        const response = await fetch(
            `${API_BASE}/devices/${deviceId}/pumps/${pumpIndex}/schedules`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } }
        );
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || 'Erro ao carregar agendas');
        
        schedules = result.data || [];
        renderScheduleTable();
    } catch (err) {
        console.error('Erro loadSchedules:', err);
        schedules = [];
        renderScheduleTable();
    }
}

function renderScheduleTable() {
    const tbody = document.getElementById('scheduleTableBody');
    if (!tbody) return;
    
    if (schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhuma agenda para esta bomba</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    schedules.forEach(schedule => {
        const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
        const daysText = schedule.active_days
            .map((active, i) => active ? days[i] : '')
            .filter(d => d)
            .join(', ');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" ${schedule.active ? 'checked' : ''} disabled></td>
            <td>${daysText}</td>
            <td>${schedule.doses_per_day || 0}</td>
            <td>${schedule.start_time} - ${schedule.end_time}</td>
            <td>${schedule.volume_per_day || 0}</td>
            <td><button class="btn-delete" onclick="deleteSchedule(${schedule.id})">Deletar</button></td>
        `;
        tbody.appendChild(row);
    });
}

function openAgendaModal() {
    // Definir bomba padrão
    document.getElementById('pumpSelectAgenda').value = currentPumpIndex;
    document.getElementById('agendaModal').style.display = 'flex';
}

function closeAgendaModal() {
    document.getElementById('agendaModal').style.display = 'none';
}

async function createSchedule() {
    const pumpIndex = parseInt(document.getElementById('pumpSelectAgenda').value);
    
    // Coletar dias selecionados
    const dayCheckboxes = document.querySelectorAll('.day-checkbox');
    const activeDays = Array.from(dayCheckboxes).map(cb => cb.checked);
    
    const data = {
        active: true,
        active_days: activeDays,
        doses_per_day: parseInt(document.getElementById('dosesPerDay').value),
        start_time: document.getElementById('startTime').value,
        end_time: document.getElementById('endTime').value,
        volume_per_day: parseInt(document.getElementById('volumePerDay').value)
    };
    
    console.log('Criando agenda para bomba:', pumpIndex);
    console.log('Dados:', data);
    
    try {
        const response = await fetch(
            `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            }
        );
        
        const result = await response.json();
        console.log('Response:', result);
        
        if (!response.ok) throw new Error(result.error || 'Erro ao criar agenda');
        
        showSuccess('✅ Agenda criada com sucesso!');
        closeAgendaModal();
        await loadSchedules(currentDevice.id, pumpIndex);
    } catch (err) {
        console.error('Erro ao criar agenda:', err);
        showError('Erro ao criar agenda: ' + err.message);
    }
}

async function deleteSchedule(scheduleId) {
    if (!confirm('Tem certeza que deseja deletar esta agenda?')) return;
    
    try {
        const response = await fetch(
            `${API_BASE}/devices/${currentDevice.id}/pumps/${currentPumpIndex}/schedules/${scheduleId}`,
            {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            }
        );
        
        if (!response.ok) throw new Error('Erro ao deletar');
        
        showSuccess('✅ Agenda deletada!');
        await loadSchedules(currentDevice.id, currentPumpIndex);
    } catch (err) {
        console.error('Erro ao deletar agenda:', err);
        showError('Erro ao deletar: ' + err.message);
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
    
    console.log('Aplicando dose manual na bomba:', pumpIndex, 'volume:', volume);
    
    try {
        const response = await fetch(
            `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/manual`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ volume })
            }
        );
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro ao aplicar dose');
        
        showSuccess(`✅ Dose de ${volume}mL aplicada!`);
        document.getElementById('manualVolume').value = '0';
    } catch (err) {
        console.error('Erro ao aplicar dose:', err);
        showError('Erro: ' + err.message);
    }
}

// ===== CALIBRATION =====
async function startCalibration() {
    const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value);
    const btn = event.target;
    
    console.log('Iniciando calibração na bomba:', pumpIndex);
    
    try {
        const response = await fetch(
            `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/start`,
            {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            }
        );
        
        if (!response.ok) throw new Error('Erro ao iniciar calibração');
        
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
    } catch (err) {
        console.error('Erro ao iniciar calibração:', err);
        showError('Erro: ' + err.message);
    }
}

async function saveCalibration() {
    const pumpIndex = parseInt(document.getElementById('pumpSelectCalibration').value);
    const measuredVolume = parseFloat(document.getElementById('measuredVolume').value);
    
    if (!measuredVolume || measuredVolume <= 0) {
        showError('Digite um volume válido');
        return;
    }
    
    console.log('Salvando calibração na bomba:', pumpIndex, 'volume medido:', measuredVolume);
    
    try {
        const response = await fetch(
            `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/save`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ measured_volume: measuredVolume })
            }
        );
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro ao salvar');
        
        const rate = (measuredVolume / 10).toFixed(2);
        showSuccess(`✅ Calibração salva! Taxa: ${rate} mL/s`);
        document.getElementById('measuredVolume').value = '';
    } catch (err) {
        console.error('Erro ao salvar calibração:', err);
        showError('Erro: ' + err.message);
    }
}

// ===== TABS =====
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    const tab = document.getElementById(tabName);
    if (tab) tab.style.display = 'block';
    
    event.target.classList.add('active');
}

// ===== UI HELPERS =====
function showSuccess(msg) {
    const div = document.createElement('div');
    div.className = 'success-message';
    div.textContent = msg;
    div.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: #22c55e; color: white; padding: 15px 20px;
        border-radius: 8px; z-index: 9999; animation: slideIn 0.3s;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function showError(msg) {
    const div = document.createElement('div');
    div.className = 'error-message';
    div.textContent = msg;
    div.style.cssText = `
        position: fixed; top: 20px; right: 20px; 
        background: #ef4444; color: white; padding: 15px 20px;
        border-radius: 8px; z-index: 9999; animation: slideIn 0.3s;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

function getToken() {
    return localStorage.getItem('authToken') || '';
}

// ===== INIT =====
window.addEventListener('load', loadPage);

// Fechar modais ao clicar fora
window.addEventListener('click', (e) => {
    const editModal = document.getElementById('editModal');
    const agendaModal = document.getElementById('agendaModal');
    
    if (e.target === editModal) editModal.style.display = 'none';
    if (e.target === agendaModal) agendaModal.style.display = 'none';
});