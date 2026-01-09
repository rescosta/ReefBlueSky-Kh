// dashboard-dosing-novo.js

const token = localStorage.getItem('token');
let currentDevice = null;
let currentPumpIndex = null;
let cachedPumps = [];
let cachedSchedules = [];

// ===== DOM Elements =====
const errorMsg = (id) => document.getElementById(id);
const successMsg = (id) => document.getElementById(id);

// Tabs
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

// Bombas
const pumpSelectorDropdown = document.getElementById('pumpSelectorDropdown');
const pumpConfigSection = document.getElementById('pumpConfigSection');
const pumpConfigTitle = document.getElementById('pumpConfigTitle');

// Pump Config
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

// Schedule
const scheduleDosesPerDay = document.getElementById('scheduleDosesPerDay');
const scheduleStartTime = document.getElementById('scheduleStartTime');
const scheduleEndTime = document.getElementById('scheduleEndTime');
const scheduleVolumePerDay = document.getElementById('scheduleVolumePerDay');
const saveScheduleBtn = document.getElementById('saveScheduleBtn');
const cancelScheduleBtn = document.getElementById('cancelScheduleBtn');
const schedulesTableBody = document.getElementById('schedulesTableBody');

// Manual
const manualDoseVolume = document.getElementById('manualDoseVolume');
const applyManualDoseBtn = document.getElementById('applyManualDoseBtn');
const cancelManualBtn = document.getElementById('cancelManualBtn');

// Calibration
const calibrationVolume = document.getElementById('calibrationVolume');
const startCalibrationBtn = document.getElementById('startCalibrationBtn');
const saveCalibrationBtn = document.getElementById('saveCalibrationBtn');
const cancelCalibrationBtn = document.getElementById('cancelCalibrationBtn');

// Tables
const devicesBody = document.getElementById('devicesBody');
const pumpsTableBody = document.getElementById('pumpsTableBody');
const dashboardBody = document.getElementById('dashboardBody');
const allSchedulesBody = document.getElementById('allSchedulesBody');
const historyBody = document.getElementById('historyBody');

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    if (!token) {
        alert('Não autenticado. Faça login.');
        return;
    }

    initTabs();
    initSubTabs();
    initPumpSelector();
    initEventListeners();
    loadDevices();
});

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
            // Remove active de todos
            tabs.forEach((t) => {
                t.btn.classList.remove('active');
                t.view.classList.remove('active');
            });
            // Adiciona active ao selecionado
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

            // Remove active de todos os botões e views
            subTabBtns.forEach((b) => b.classList.remove('active'));
            document.querySelectorAll('.sub-view').forEach((v) => v.classList.remove('active'));

            // Adiciona active ao selecionado
            btn.classList.add('active');
            document.getElementById(`${target}SubView`).classList.add('active');
        });
    });
}

// ===== Pump Selector =====
function initPumpSelector() {
    pumpSelectorDropdown.addEventListener('change', (e) => {
        const pumpId = e.target.value;
        if (pumpId) {
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

    // Atualiza title
    pumpConfigTitle.textContent = `Configuração - ${pump.name || `Bomba ${pumpIndex + 1}`}`;

    // Atualiza campos
    pumpName.value = pump.name || `Pump ${pumpIndex + 1}`;
    pumpActiveToggle.classList.toggle('active', pump.active !== false);
    pumpActiveLabel.textContent = pump.active !== false ? 'Ativa' : 'Desativa';

    pumpContainerSize.value = pump.container_size || 500;
    pumpContainerValue.textContent = pump.container_size || 500;

    pumpCurrentVolume.value = pump.current_volume || 500;
    pumpCurrentValue.textContent = pump.current_volume || 500;

    pumpAlarmPercent.value = pump.alarm_percent || 10;
    pumpDailyMax.value = pump.daily_max || 100;

    // Mostra a seção
    pumpConfigSection.style.display = 'block';

    // Carrega agendas dessa bomba
    loadSchedulesForPump(pumpIndex);
}

// ===== Event Listeners =====
function initEventListeners() {
    // Pump Config
    savePumpBtn.addEventListener('click', savePumpConfiguration);
    cancelPumpBtn.addEventListener('click', () => {
        pumpConfigSection.style.display = 'none';
        pumpSelectorDropdown.value = '';
    });

    // Range inputs
    pumpContainerSize.addEventListener('input', (e) => {
        pumpContainerValue.textContent = e.target.value;
    });
    pumpCurrentVolume.addEventListener('input', (e) => {
        pumpCurrentValue.textContent = e.target.value;
    });

    // Active toggle
    pumpActiveToggle.addEventListener('click', () => {
        pumpActiveToggle.classList.toggle('active');
        pumpActiveLabel.textContent = pumpActiveToggle.classList.contains('active') ? 'Ativa' : 'Desativa';
    });

    // Schedule
    saveScheduleBtn.addEventListener('click', saveSchedule);
    cancelScheduleBtn.addEventListener('click', () => {
        document.querySelector('.sub-tab-btn').click(); // volta para settings
    });

    // Manual
    applyManualDoseBtn.addEventListener('click', applyManualDose);
    cancelManualBtn.addEventListener('click', () => {
        manualDoseVolume.value = 0;
    });

    // Calibration
    startCalibrationBtn.addEventListener('click', startCalibration);
    saveCalibrationBtn.addEventListener('click', saveCalibration);
    cancelCalibrationBtn.addEventListener('click', () => {
        calibrationVolume.value = '';
    });
}

// ===== API Calls =====
async function loadDevices() {
    try {
        const res = await fetch('/api/v1/user/dosing/devices', {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!res.ok) {
            errorMsg('devicesError').textContent = data.error || 'Erro ao carregar devices';
            errorMsg('devicesError').style.display = 'block';
            return;
        }

        renderDevices(data.data || []);
        if (data.data && data.data.length > 0) {
            currentDevice = data.data[0];
            loadPumpsForDevice(currentDevice.id);
        }
    } catch (err) {
        console.error('Erro ao carregar devices:', err);
        errorMsg('devicesError').textContent = 'Falha de comunicação';
        errorMsg('devicesError').style.display = 'block';
    }
}

async function loadPumpsForDevice(deviceId) {
    try {
        const res = await fetch(`/api/v1/user/dosing/devices/${deviceId}/pumps`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        if (!res.ok) {
            errorMsg('bombasError').textContent = data.error || 'Erro ao carregar bombas';
            errorMsg('bombasError').style.display = 'block';
            return;
        }

        cachedPumps = data.data || [];
        renderPumpSelector();
        renderPumpsTable();
    } catch (err) {
        console.error('Erro ao carregar bombas:', err);
        errorMsg('bombasError').textContent = 'Falha de comunicação';
        errorMsg('bombasError').style.display = 'block';
    }
}

async function loadSchedulesForPump(pumpIndex) {
    try {
        const res = await fetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${pumpIndex}/schedules`,
            {
                headers: { Authorization: `Bearer ${token}` },
            }
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
        const res = await fetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            errorMsg('bombasError').textContent = data.error || 'Erro ao salvar';
            errorMsg('bombasError').style.display = 'block';
            return;
        }

        successMsg('bombasSuccess').textContent = 'Configuração salva com sucesso!';
        successMsg('bombasSuccess').style.display = 'block';
        setTimeout(() => {
            successMsg('bombasSuccess').style.display = 'none';
        }, 3000);

        loadPumpsForDevice(currentDevice.id);
    } catch (err) {
        console.error('Erro ao salvar bomba:', err);
        errorMsg('bombasError').textContent = 'Falha de comunicação';
        errorMsg('bombasError').style.display = 'block';
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
        const res = await fetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/schedules`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            errorMsg('bombasError').textContent = data.error || 'Erro ao criar agenda';
            errorMsg('bombasError').style.display = 'block';
            return;
        }

        successMsg('bombasSuccess').textContent = 'Agenda criada com sucesso!';
        successMsg('bombasSuccess').style.display = 'block';
        setTimeout(() => {
            successMsg('bombasSuccess').style.display = 'none';
        }, 3000);

        loadSchedulesForPump(currentPumpIndex);
    } catch (err) {
        console.error('Erro ao salvar agenda:', err);
        errorMsg('bombasError').textContent = 'Falha de comunicação';
        errorMsg('bombasError').style.display = 'block';
    }
}

async function applyManualDose() {
    if (currentPumpIndex === null || !currentDevice) return;

    const volume = parseInt(manualDoseVolume.value);
    if (volume <= 0) {
        errorMsg('bombasError').textContent = 'Informe um volume válido';
        errorMsg('bombasError').style.display = 'block';
        return;
    }

    try {
        const res = await fetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/manual`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ volume }),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            errorMsg('bombasError').textContent = data.error || 'Erro ao aplicar dose';
            errorMsg('bombasError').style.display = 'block';
            return;
        }

        successMsg('bombasSuccess').textContent = `Dose de ${volume}mL aplicada!`;
        successMsg('bombasSuccess').style.display = 'block';
        setTimeout(() => {
            successMsg('bombasSuccess').style.display = 'none';
        }, 3000);

        manualDoseVolume.value = 0;
    } catch (err) {
        console.error('Erro ao aplicar dose:', err);
        errorMsg('bombasError').textContent = 'Falha de comunicação';
        errorMsg('bombasError').style.display = 'block';
    }
}

async function startCalibration() {
    if (currentPumpIndex === null || !currentDevice) return;

    startCalibrationBtn.disabled = true;
    startCalibrationBtn.textContent = 'Dosando... (10s)';

    try {
        const res = await fetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/calibrate/start`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        if (!res.ok) {
            errorMsg('bombasError').textContent = 'Erro ao iniciar calibração';
            errorMsg('bombasError').style.display = 'block';
        }

        setTimeout(() => {
            startCalibrationBtn.disabled = false;
            startCalibrationBtn.textContent = 'Go (10s)';
        }, 10000);
    } catch (err) {
        console.error('Erro ao iniciar calibração:', err);
        errorMsg('bombasError').textContent = 'Falha de comunicação';
        errorMsg('bombasError').style.display = 'block';
        startCalibrationBtn.disabled = false;
        startCalibrationBtn.textContent = 'Go (10s)';
    }
}

async function saveCalibration() {
    if (currentPumpIndex === null || !currentDevice) return;

    const volume = parseInt(calibrationVolume.value);
    if (volume <= 0) {
        errorMsg('bombasError').textContent = 'Informe o volume medido';
        errorMsg('bombasError').style.display = 'block';
        return;
    }

    try {
        const res = await fetch(
            `/api/v1/user/dosing/devices/${currentDevice.id}/pumps/${currentPumpIndex}/calibrate/save`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ measured_volume: volume }),
            }
        );

        const data = await res.json();
        if (!res.ok) {
            errorMsg('bombasError').textContent = data.error || 'Erro ao salvar calibração';
            errorMsg('bombasError').style.display = 'block';
            return;
        }

        successMsg('bombasSuccess').textContent = 'Calibração salva com sucesso!';
        successMsg('bombasSuccess').style.display = 'block';
        setTimeout(() => {
            successMsg('bombasSuccess').style.display = 'none';
        }, 3000);

        calibrationVolume.value = '';
        loadPumpsForDevice(currentDevice.id);
    } catch (err) {
        console.error('Erro ao salvar calibração:', err);
        errorMsg('bombasError').textContent = 'Falha de comunicação';
        errorMsg('bombasError').style.display = 'block';
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