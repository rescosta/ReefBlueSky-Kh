// dashboard-dosing.js - Integrado com dashboard-common.js
// Não precisa de fetch manual - usa apiFetch() do common.js

const token = getAccessToken();
let currentDevice = null;
let currentPumpIndex = null;
let cachedPumps = [];
let cachedSchedules = [];

// ===== DOM Elements =====
const tabDashboard = document.getElementById('tabDashboard');
const tabDevices = document.getElementById('tabDevices');
const tabBombas = document.getElementById('tabBombas');
const tabAgendas = document.getElementById('tabAgendas');
const tabHistorico = document.getElementById('tabHistorico');

const dashboardView = document.getElementById('dashboardView');
const devicesView = document.getElementById('devicesView');
const bombasView = document.getElementById('bombasView');
const agendasView = document.getElementById('agendasView');
const historicoView = document.getElementById('historicoView');

const pumpSelectorDropdown = document.getElementById('pumpSelectorDropdown');
const pumpConfigSection = document.getElementById('pumpConfigSection');
const pumpConfigTitle = document.getElementById('pumpConfigTitle');

const pumpName = document.getElementById('pumpName');
const pumpActiveToggle = document.getElementById('pumpActiveToggle');
const pumpActiveLabel = document.getElementById('pumpActiveLabel');
const pumpContainerSize = document.getElementById('pumpContainerSize');
const pumpContainerValue = document.getElementById('pumpContainerValue');
const pumpCurrentVolume = document.getElementById('pumpCurrentVolume');
const pumpCurrentValue = document.getElementById('pumpCurrentValue');
const pumpAlarmPercent = document.getElementById('pumpAlarmPercent');
const pumpDailyMax = document.getElementById('pumpDailyMax');
const savePumpBtn = document.getElementById('savePumpBtn');
const cancelPumpBtn = document.getElementById('cancelPumpBtn');

const scheduleDosesPerDay = document.getElementById('scheduleDosesPerDay');
const scheduleStartTime = document.getElementById('scheduleStartTime');
const scheduleEndTime = document.getElementById('scheduleEndTime');
const scheduleVolumePerDay = document.getElementById('scheduleVolumePerDay');
const saveScheduleBtn = document.getElementById('saveScheduleBtn');
const cancelScheduleBtn = document.getElementById('cancelScheduleBtn');
const schedulesTableBody = document.getElementById('schedulesTableBody');

const manualDoseVolume = document.getElementById('manualDoseVolume');
const applyManualDoseBtn = document.getElementById('applyManualDoseBtn');
const cancelManualBtn = document.getElementById('cancelManualBtn');

const calibrationVolume = document.getElementById('calibrationVolume');
const startCalibrationBtn = document.getElementById('startCalibrationBtn');
const saveCalibrationBtn = document.getElementById('saveCalibrationBtn');
const cancelCalibrationBtn = document.getElementById('cancelCalibrationBtn');

const devicesBody = document.getElementById('devicesBody');
const pumpsTableBody = document.getElementById('pumpsTableBody');
const dashboardBody = document.getElementById('dashboardBody');
const allSchedulesBody = document.getElementById('allSchedulesBody');
const historyBody = document.getElementById('historyBody');

const logoutBtn = document.getElementById('logoutBtn');
const userMenu = document.getElementById('userMenu');

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        redirectToLogin();
        return;
    }

    initTabs();
    initSubTabs();
    initPumpSelector();
    initEventListeners();
    startTopbarClock();
    
    loadDevices();
    setupLogout();
});

// ===== Setup Logout =====
function setupLogout() {
    logoutBtn.addEventListener('click', () => {
        redirectToLogin();
    });
    
    userMenu.addEventListener('click', () => {
        alert('Usuário: ' + (localStorage.getItem('userId') || 'Anônimo'));
    });
}

// ===== Tab Navigation =====
function initTabs() {
    const tabs = [
        { btn: tabDashboard, view: dashboardView },
        { btn: tabDevices, view: devicesView },
        { btn: tabBombas, view: bombasView },
        { btn: tabAgendas, view: agendasView },
        { btn: tabHistorico, view: historicoView },
    ];

    tabs.forEach((tab) => {
        tab.btn.addEventListener('click', () => {
            tabs.forEach((t) => {
                t.btn.classList.remove('active');
                t.view.classList.remove('active');
            });
            tab.btn.classList.add('active');
            tab.view.classList.add('active');
        });
    });
}

function initSubTabs() {
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    subTabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-subtab');
            subTabBtns.forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.sub-view').forEach((v) => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${target}SubView`).classList.add('active');
        });
    });
}

// ===== Pump Selector =====
function initPumpSelector() {
    pumpSelectorDropdown.addEventListener('change', (e) => {
        const pumpId = e.target.value;
        if (pumpId !== '') {
            loadPumpConfig(parseInt(pumpId));
        } else {
            pumpConfigSection.style.display = 'none';
        }
    });
}

function loadPumpConfig(pumpIndex) {
    currentPumpIndex = pumpIndex;
    const pump = cachedPumps.find((p) => p.index === pumpIndex);

    if (!pump) {
        pumpConfigSection.style.display = 'none';
        return;
    }

    pumpConfigTitle.textContent = `Configuração - ${pump.name || `Bomba ${pumpIndex + 1}`}`;

    pumpName.value = pump.name || `Pump ${pumpIndex + 1}`;
    pumpActiveToggle.classList.toggle('active', pump.active !== false);
    pumpActiveLabel.textContent = pump.active !== false ? 'Ativa' : 'Desativa';

    pumpContainerSize.value = pump.container_size || 500;
    pumpContainerValue.textContent = pump.container_size || 500;

    pumpCurrentVolume.value = pump.current_volume || 500;
    pumpCurrentValue.textContent = pump.current_volume || 500;

    pumpAlarmPercent.value = pump.alarm_percent || 10;
    pumpDailyMax.value = pump.daily_max || 100;

    pumpConfigSection.style.display = 'block';
    loadSchedulesForPump(pumpIndex);
}

// ===== Event Listeners =====
function initEventListeners() {
    savePumpBtn.addEventListener('click', savePumpConfiguration);
    cancelPumpBtn.addEventListener('click', () => {
        pumpConfigSection.style.display = 'none';
        pumpSelectorDropdown.value = '';
    });

    pumpContainerSize.addEventListener('input', (e) => {
        pumpContainerValue.textContent = e.target.value;
    });
    pumpCurrentVolume.addEventListener('input', (e) => {
        pumpCurrentValue.textContent = e.target.value;
    });

    pumpActiveToggle.addEventListener('click', () => {
        pumpActiveToggle.classList.toggle('active');
        pumpActiveLabel.textContent = pumpActiveToggle.classList.contains('active') ? 'Ativa' : 'Desativa';
    });

    saveScheduleBtn.addEventListener('click', saveSchedule);
    cancelScheduleBtn.addEventListener('click', () => {
        document.querySelector('.sub-tab-btn').click();
    });

    applyManualDoseBtn.addEventListener('click', applyManualDose);
    cancelManualBtn.addEventListener('click', () => {
        manualDoseVolume.value = 0;
    });

    startCalibrationBtn.addEventListener('click', startCalibration);
    saveCalibrationBtn.addEventListener('click', saveCalibration);
    cancelCalibrationBtn.addEventListener('click', () => {
        calibrationVolume.value = '';
    });
}

// ===== API Calls (usando apiFetch do common.js) =====
async function loadDevices() {
    try {
        const res = await apiFetch('/api/v1/user/dosing/devices');
        const data = await res.json();

        if (!res.ok) {
            showError('devicesError', data.error || 'Erro ao carregar devices');
            return;
        }

        renderDevices(data.data || []);
        if (data.data && data.data.length > 0) {
            currentDevice = data.data[0];
            loadPumpsForDevice(currentDevice.id);
        }
    } catch (err) {
        console.error('Erro ao carregar devices:', err);
        showError('devicesError', 'Falha de comunicação');
    }
}

async function loadPumpsForDevice(deviceId) {
    try {
        const res = await apiFetch(`/api/v1/user/dosing/devices/${deviceId}/pumps`);
        const data = await res.json();

        if (!res.ok) {
            showError('bombasError', data.error || 'Erro ao carregar bombas');
            return;
        }

        cachedPumps = data.data || [];
        renderPumpSelector();
        renderPumpsTable();
    } catch (err) {
        console.error('Erro ao carregar bombas:', err);
        showError('bombasError', 'Falha de comunicação');
    }
}

async function loadSchedulesForPump(pumpIndex) {
    try {
        const res = await apiFetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules`
        );
        const data = await res.json();

        if (res.ok) {
            cachedSchedules = data.data || [];
            renderSchedulesTable();
        }
    } catch (err) {
        console.error('Erro ao carregar agendas:', err);
    }
}

async function savePumpConfiguration() {
    if (currentPumpIndex === null || !currentDevice) return;

    const payload = {
        name: pumpName.value,
        active: pumpActiveToggle.classList.contains('active'),
        container_size: parseInt(pumpContainerSize.value),
        current_volume: parseInt(pumpCurrentVolume.value),
        alarm_percent: parseInt(pumpAlarmPercent.value),
        daily_max: parseInt(pumpDailyMax.value),
    };

    try {
        const res = await apiFetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}`,
            {
                method: 'PUT',
                body: JSON.stringify(payload),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            showError('bombasError', data.error || 'Erro ao salvar');
            return;
        }

        showSuccess('bombasSuccess', 'Configuração salva com sucesso!');
        setTimeout(() => {
            document.getElementById('bombasSuccess').style.display = 'none';
        }, 3000);

        loadPumpsForDevice(currentDevice.id);
    } catch (err) {
        console.error('Erro ao salvar bomba:', err);
        showError('bombasError', 'Falha de comunicação');
    }
}

async function saveSchedule() {
    if (currentPumpIndex === null || !currentDevice) return;

    const days = Array.from(document.querySelectorAll('.schedule-day:checked')).map((c) =>
        parseInt(c.value)
    );

    const payload = {
        doses_per_day: parseInt(scheduleDosesPerDay.value),
        start_time: scheduleStartTime.value,
        end_time: scheduleEndTime.value,
        volume_per_day: parseInt(scheduleVolumePerDay.value),
        days_of_week: days,
    };

    try {
        const res = await apiFetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/schedules`,
            {
                method: 'POST',
                body: JSON.stringify(payload),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            showError('bombasError', data.error || 'Erro ao criar agenda');
            return;
        }

        showSuccess('bombasSuccess', 'Agenda criada com sucesso!');
        setTimeout(() => {
            document.getElementById('bombasSuccess').style.display = 'none';
        }, 3000);

        loadSchedulesForPump(currentPumpIndex);
    } catch (err) {
        console.error('Erro ao salvar agenda:', err);
        showError('bombasError', 'Falha de comunicação');
    }
}

async function applyManualDose() {
    if (currentPumpIndex === null || !currentDevice) return;

    const volume = parseInt(manualDoseVolume.value);
    if (volume <= 0) {
        showError('bombasError', 'Informe um volume válido');
        return;
    }

    try {
        const res = await apiFetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/manual`,
            {
                method: 'POST',
                body: JSON.stringify({ volume }),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            showError('bombasError', data.error || 'Erro ao aplicar dose');
            return;
        }

        showSuccess('bombasSuccess', `Dose de ${volume}mL aplicada!`);
        setTimeout(() => {
            document.getElementById('bombasSuccess').style.display = 'none';
        }, 3000);

        manualDoseVolume.value = 0;
    } catch (err) {
        console.error('Erro ao aplicar dose:', err);
        showError('bombasError', 'Falha de comunicação');
    }
}

async function startCalibration() {
    if (currentPumpIndex === null || !currentDevice) return;

    startCalibrationBtn.disabled = true;
    startCalibrationBtn.textContent = 'Dosando... (10s)';

    try {
        const res = await apiFetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/calibrate/start`,
            {
                method: 'POST',
            }
        );

        if (!res.ok) {
            showError('bombasError', 'Erro ao iniciar calibração');
        }

        setTimeout(() => {
            startCalibrationBtn.disabled = false;
            startCalibrationBtn.textContent = 'Go (10s)';
        }, 10000);
    } catch (err) {
        console.error('Erro ao iniciar calibração:', err);
        showError('bombasError', 'Falha de comunicação');
        startCalibrationBtn.disabled = false;
        startCalibrationBtn.textContent = 'Go (10s)';
    }
}

async function saveCalibration() {
    if (currentPumpIndex === null || !currentDevice) return;

    const volume = parseInt(calibrationVolume.value);
    if (volume <= 0) {
        showError('bombasError', 'Informe o volume medido');
        return;
    }

    try {
        const res = await apiFetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/calibrate/save`,
            {
                method: 'POST',
                body: JSON.stringify({ measured_volume: volume }),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            showError('bombasError', data.error || 'Erro ao salvar calibração');
            return;
        }

        showSuccess('bombasSuccess', 'Calibração salva com sucesso!');
        setTimeout(() => {
            document.getElementById('bombasSuccess').style.display = 'none';
        }, 3000);

        calibrationVolume.value = '';
        loadPumpsForDevice(currentDevice.id);
    } catch (err) {
        console.error('Erro ao salvar calibração:', err);
        showError('bombasError', 'Falha de comunicação');
    }
}

// ===== Render Functions =====
function renderDevices(devices) {
    devicesBody.innerHTML = '';

    if (!devices || devices.length === 0) {
        devicesBody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum device cadastrado.</td></tr>';
        return;
    }

    devices.forEach((d) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.name}</td>
            <td>${d.hw_type}</td>
            <td>${d.online ? '✓ Online' : '✗ Offline'}</td>
            <td>${d.last_seen ? new Date(d.last_seen).toLocaleString('pt-BR') : '--'}</td>
            <td>${d.pump_count || 0}</td>
            <td>...</td>
        `;
        devicesBody.appendChild(tr);
    });
}

function renderPumpSelector() {
    pumpSelectorDropdown.innerHTML = '<option value="">-- Escolha uma bomba --</option>';

    for (let i = 0; i < 6; i++) {
        const pump = cachedPumps.find((p) => p.index === i);
        const name = pump?.name || `Pump ${i + 1}`;

        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i + 1} - ${name}`;
        pumpSelectorDropdown.appendChild(opt);
    }
}

function renderPumpsTable() {
    pumpsTableBody.innerHTML = '';

    for (let i = 0; i < 6; i++) {
        const pump = cachedPumps.find((p) => p.index === i) || {};

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${i + 1}</td>
            <td>${pump.name || `Pump ${i + 1}`}</td>
            <td>${pump.active !== false ? '✓ Ativa' : '✗ Inativa'}</td>
            <td>${pump.container_size || '--'}</td>
            <td>${pump.current_volume || '--'}</td>
            <td>${pump.alarm_percent || '--'}%</td>
            <td>${pump.daily_max || '--'}</td>
            <td><button class="btn" onclick="document.getElementById('pumpSelectorDropdown').value = ${i}; document.getElementById('pumpSelectorDropdown').dispatchEvent(new Event('change'));">Editar</button></td>
        `;
        pumpsTableBody.appendChild(tr);
    }
}

function renderSchedulesTable() {
    schedulesTableBody.innerHTML = '';

    if (!cachedSchedules || cachedSchedules.length === 0) {
        schedulesTableBody.innerHTML = '<tr><td colspan="7" class="empty-state" style="border:none;padding:20px;">Nenhuma agenda para esta bomba.</td></tr>';
        return;
    }

    cachedSchedules.forEach((s) => {
        const daysLabel = s.days_of_week ? s.days_of_week.join(', ') : '--';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${s.pump_name || 'N/A'}</td>
            <td>${s.active !== false ? '✓ Sim' : '✗ Não'}</td>
            <td>${daysLabel}</td>
            <td>${s.doses_per_day || '--'}</td>
            <td>${s.start_time} - ${s.end_time}</td>
            <td>${s.volume_per_day || '--'}</td>
            <td>...</td>
        `;
        schedulesTableBody.appendChild(tr);
    });
}

// ===== Utility Functions =====
function showError(elementId, msg) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}

function showSuccess(elementId, msg) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    }
}