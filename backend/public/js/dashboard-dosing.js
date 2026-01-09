// Dashboard Dosadora - Script Principal
// =====================================

let currentDevice = null;
let currentPumpIndex = 0;
let devices = [];
let pumps = [];
let schedules = [];

// ===== INITIALIZATION =====
async function initDashboard() {
    console.log('🚀 Iniciando Dashboard Dosadora...');

    if (!isTokenValid()) return;

    try {
        await loadDevices();
        if (devices.length > 0) {
            currentDevice = devices[0];
            await loadPumps(currentDevice.id);
            await loadSchedules(currentDevice.id, currentPumpIndex);
            updateNavbarDeviceStatus(currentDevice);
        } else {
            showError('Nenhum device cadastrado');
        }
    } catch (err) {
        console.error('Erro ao inicializar:', err);
        showError('Erro ao carregar dashboard');
    }
}

// ===== DEVICES =====
async function loadDevices() {
    console.log('📱 Carregando devices...');

    const result = await apiCall(`${API_BASE}/devices`);
    if (!result || !result.data) {
        showError('Erro ao carregar devices');
        return;
    }

    devices = result.data;
    renderDeviceSelector();
}

function renderDeviceSelector() {
    const select = document.getElementById('deviceSelect');
    if (!select) return;

    select.innerHTML = '';

    if (devices.length === 0) {
        select.innerHTML = '<option>Nenhum device encontrado</option>';
        showError('Nenhum device cadastrado no sistema');
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
    const deviceId = parseInt(document.getElementById('deviceSelect').value);
    currentDevice = devices.find(d => d.id === deviceId);
    currentPumpIndex = 0;

    if (!currentDevice) {
        showError('Device não encontrado');
        return;
    }

    updateDeviceInfo();
    updateNavbarDeviceStatus(currentDevice);
    await loadPumps(currentDevice.id);
    await loadSchedules(currentDevice.id, currentPumpIndex);
}

function updateDeviceInfo() {
    if (!currentDevice) return;

    const status = currentDevice.online ? '🟢 Online' : '🔴 Offline';
    const info = document.getElementById('deviceInfo');
    if (!info) return;

    info.innerHTML = `
        <span class="device-status-dot ${!currentDevice.online ? 'offline' : ''}"></span>
        <span><strong>${currentDevice.name}</strong> • ${currentDevice.hw_type} • ${status} • ${currentDevice.pump_count || 6} bombas</span>
    `;
}

// ===== PUMPS =====
async function loadPumps(deviceId) {
    console.log('💧 Carregando bombas para device:', deviceId);

    const result = await apiCall(`${API_BASE}/devices/${deviceId}/pumps`);
    if (!result || !result.data) {
        showError('Erro ao carregar bombas');
        return;
    }

    pumps = result.data;
    renderPumpSelectors();
    renderConfigTable();
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

        select.value = '0';
        select.addEventListener('change', onPumpChange);
    });
}

function onPumpChange(e) {
    if (e.target.id === 'pumpSelect') {
        currentPumpIndex = parseInt(e.target.value);
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
        container_size: parseInt(document.getElementById('editContainerSize').value) || 0,
        current_volume: parseInt(document.getElementById('editCurrentVolume').value) || 0,
        alarm_percent: parseInt(document.getElementById('editAlarmPercent').value) || 0,
        daily_max: parseInt(document.getElementById('editDailyMax').value) || 0
    };

    console.log('💾 Salvando bomba:', index, data);

    const result = await apiCall(
        `${API_BASE}/devices/${currentDevice.id}/pumps/${index}`,
        'PUT',
        data
    );

    if (result) {
        showSuccess('Bomba atualizada com sucesso!');
        closeEditModal();
        await loadPumps(currentDevice.id);
    }
}

// ===== SCHEDULES =====
async function loadSchedules(deviceId, pumpIndex) {
    console.log('📅 Carregando agendas para:', deviceId, pumpIndex);

    const result = await apiCall(
        `${API_BASE}/devices/${deviceId}/pumps/${pumpIndex}/schedules`
    );

    schedules = result && result.data ? result.data : [];
    renderScheduleTable();
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
    document.getElementById('pumpSelectAgenda').value = currentPumpIndex;
    document.getElementById('agendaModal').style.display = 'flex';
}

function closeAgendaModal() {
    document.getElementById('agendaModal').style.display = 'none';
}

async function createSchedule() {
    const pumpIndex = parseInt(document.getElementById('pumpSelectAgenda').value);

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

    console.log('📅 Criando agenda:', pumpIndex, data);

    const result = await apiCall(
        `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules`,
        'POST',
        data
    );

    if (result) {
        showSuccess('Agenda criada com sucesso!');
        closeAgendaModal();
        await loadSchedules(currentDevice.id, pumpIndex);
    }
}

async function deleteSchedule(scheduleId) {
    if (!confirm('Tem certeza que deseja deletar esta agenda?')) return;

    const result = await apiCall(
        `${API_BASE}/devices/${currentDevice.id}/pumps/${currentPumpIndex}/schedules/${scheduleId}`,
        'DELETE'
    );

    if (result) {
        showSuccess('Agenda deletada!');
        await loadSchedules(currentDevice.id, currentPumpIndex);
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
        `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/manual`,
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
        `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/start`,
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
        `${API_BASE}/devices/${currentDevice.id}/pumps/${pumpIndex}/calibrate/save`,
        'POST',
        { measured_volume: measuredVolume }
    );

    if (result) {
        const rate = (measuredVolume / 10).toFixed(2);
        showSuccess(`Calibração salva! Taxa: ${rate} mL/s`);
        document.getElementById('measuredVolume').value = '';
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

    if (e.target === editModal) editModal.style.display = 'none';
    if (e.target === agendaModal) agendaModal.style.display = 'none';
});

// ===== INIT =====
window.addEventListener('load', initDashboard);