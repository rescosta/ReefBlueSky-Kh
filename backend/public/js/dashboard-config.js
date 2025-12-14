// dashboard-config.js

const cfgToken = localStorage.getItem('token');
if (!cfgToken) {
  window.location.href = 'login';
}

const headersAuthCfg = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${cfgToken}`,
};


const khRefInput = document.getElementById('khRefInput');
const khRefStatus = document.getElementById('khRefStatus');
const khTargetInput = document.getElementById('khTargetInput');
const khTargetStatus = document.getElementById('khTargetStatus');
const saveKhRefBtn    = document.getElementById('saveKhRefBtn');
const saveKhTargetBtn = document.getElementById('saveKhTargetBtn');


const intervalRange = document.getElementById('intervalRange');
const intervalLabel = document.getElementById('intervalLabel');
const saveIntervalBtn = document.getElementById('saveIntervalBtn');

const levelAEl = document.getElementById('levelA');
const levelBEl = document.getElementById('levelB');
const levelCEl = document.getElementById('levelC');

const pumpStatusEls = {
  1: document.getElementById('pumpStatus1'),
  2: document.getElementById('pumpStatus2'),
  3: document.getElementById('pumpStatus3'),
};
const pumpDirEls = {
  1: document.getElementById('pumpDir1'),
  2: document.getElementById('pumpDir2'),
  3: document.getElementById('pumpDir3'),
};
const pumpProgEls = {
  1: document.getElementById('pumpProg1'),
  2: document.getElementById('pumpProg2'),
  3: document.getElementById('pumpProg3'),
};

const pump4CalibSecondsInput = document.getElementById('pump4CalibSeconds');
const pump4RunCalibBtn       = document.getElementById('pump4RunCalibBtn');
const pump4CalibVolumeInput  = document.getElementById('pump4CalibVolume');
const pump4SaveCalibBtn      = document.getElementById('pump4SaveCalibBtn');
const pump4CalibStatusEl     = document.getElementById('pump4CalibStatus');


const pump4CalibProgressWrapper = document.getElementById('pump4CalibProgressWrapper');
const pump4CalibProgressFill    = document.getElementById('pump4CalibProgressFill');
const pump4CalibProgressLabel   = document.getElementById('pump4CalibProgressLabel');

let pump4CalibRunning = false;
let pump4CalibTimerId = null;
const PUMP4_CALIB_SECONDS = 60;

const khCorrectionVolumeInput = document.getElementById('khCorrectionVolume');
const khCorrectionBtn = document.getElementById('khCorrectionBtn');
const khCorrectionStatus = document.getElementById('khCorrectionStatus');
const startCalibrationBtn = document.getElementById('startCalibrationBtn');
const calibrationStatus = document.getElementById('calibrationStatus');
const abortBtn = document.getElementById('abortBtn');
let isRunningCycle = false;



async function sendDeviceCommand(deviceId, type, value = null) {
  const payload = value != null ? { type, value } : { type };

  const res = await fetch(
    `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
    {
      method: 'POST',
      headers: headersAuthCfg,
      body: JSON.stringify(payload),
    }
  );
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || json.error || 'Erro ao enviar comando');
  }
  return json;
}



function updateAbortVisibility() {
  abortBtn.style.display = isRunningCycle ? 'flex' : 'none';
}


function updateIntervalLabel(v) {
  const n = parseInt(v, 10) || 1;
  intervalLabel.textContent = `${n} ${n === 1 ? 'hora' : 'horas'}`;
}

intervalRange.addEventListener('input', () => {
  updateIntervalLabel(intervalRange.value);
});

// Helpers visuais
function updateLevelBadge(el, on) {
  el.className = 'badge-level ' + (on ? 'badge-on' : 'badge-off');
  el.textContent = on ? 'ON' : 'OFF';
}

function updatePumpStatus(pumpId, running, direction) {
  const statusEl = pumpStatusEls[pumpId];
  const dirEl = pumpDirEls[pumpId];
  if (!statusEl || !dirEl) return;

  statusEl.className = 'badge-level ' + (running ? 'badge-on' : 'badge-off');
  statusEl.textContent = running ? 'RODANDO' : 'PARADA';
  dirEl.textContent = direction === 'reverse' ? 'Reverso' : 'Normal';
}

// Stubs de API (para você ligar no server.js depois)

async function apiLoadDeviceConfig(deviceId) {
  try {
    const [khRes, statusRes] = await Promise.all([
      fetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`, {
        headers: headersAuthCfg,
      }),
      fetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/status`, {
        headers: headersAuthCfg,
      }),
    ]);

    const khJson = await khRes.json();
    const stJson = await statusRes.json();

    if (!khRes.ok || khJson.success === false) {
      console.error('Erro ao carregar KH config', khJson.message || khJson.error);
      return null;
    }
    if (!statusRes.ok || stJson.success === false) {
      console.error('Erro ao carregar status', stJson.message || stJson.error);
      return null;
    }

    const d = khJson.data || {};
    const s = stJson.data || {};

    return {
      khReference: d.khReference,
      khTarget: d.khTarget,
      intervalHours: s.intervalHours,
      levels: s.levels || {},
      pumps: s.pumps || {},
    };
  } catch (err) {
    console.error('apiLoadDeviceConfig error', err);
    return null;
  }
}


async function apiSetMeasurementInterval(deviceId, hours) {
  // Futuro: POST /api/v1/user/devices/:deviceId/config/interval
  console.log('SET interval', deviceId, hours);
  try {
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/config/interval`,
      {
        method: 'POST',
        headers: headersAuthCfg,
        body: JSON.stringify({ intervalHours: hours }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao salvar intervalo');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiSetMeasurementInterval error', err);
    return false;
  }
}

async function apiManualPump(deviceId, pumpId, direction, seconds) {
  // Futuro: POST /api/v1/user/devices/:deviceId/command/pump
  console.log('MANUAL pump', deviceId, pumpId, direction, seconds);
  try {
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command/pump`,
      {
        method: 'POST',
        headers: headersAuthCfg,
        body: JSON.stringify({ pumpId, direction, seconds }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao acionar bomba');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiManualPump error', err);
    return false;
  }
}

async function apiKhCorrection(deviceId, volume) {
  console.log('KH CORRECTION', deviceId, volume);
  try {
    await sendDeviceCommand(deviceId, 'khcorrection', volume);
    return true;
  } catch (err) {
    console.error('apiKhCorrection error', err);
    return false;
  }
}



// Calibração bomba 4: rodar calibração por 60s com barra regressiva
if (pump4RunCalibBtn) {
  pump4RunCalibBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    pump4CalibStatusEl.textContent = 'Enviando comando de calibração por 60 segundos...';
    pump4RunCalibBtn.disabled = true;

    try {
      // sem payload extra, backend traduz para dbType 'pump4calibrate'
      await sendDeviceCommand(deviceId, 'pump4calibrate');

      // Iniciar barra regressiva de 60s
      startPump4CalibProgress();
      pump4CalibStatusEl.textContent =
        'Calibração em andamento. Meça o volume que saiu.';
    } catch (err) {
      console.error('pump4calibrate error', err);
      pump4CalibStatusEl.textContent =
        'Erro ao enviar comando de calibração da bomba 4.';
      pump4RunCalibBtn.disabled = false;
    }
  });
}


function startPump4CalibProgress() {
  pump4CalibRunning = true;
  let secondsRemaining = PUMP4_CALIB_SECONDS;

  pump4CalibProgressWrapper.style.display = 'block';
  pump4CalibProgressFill.style.width = '100%';
  pump4CalibProgressLabel.textContent = `Calibrando... ${secondsRemaining}s restantes`;

  if (pump4CalibTimerId) clearInterval(pump4CalibTimerId);

  pump4CalibTimerId = setInterval(() => {
    secondsRemaining -= 1;

    if (secondsRemaining <= 0) {
      clearInterval(pump4CalibTimerId);
      pump4CalibRunning = false;
      pump4CalibProgressWrapper.style.display = 'none';
      pump4CalibProgressFill.style.width = '0%';
      pump4CalibProgressLabel.textContent = 'Calibração concluída!';
      pump4CalibStatusEl.textContent = 'Informe o volume medido e clique "Salvar calibração".';
      pump4RunCalibBtn.disabled = false;
    } else {
      const percent = ((PUMP4_CALIB_SECONDS - secondsRemaining) / PUMP4_CALIB_SECONDS) * 100;
      pump4CalibProgressFill.style.width = `${percent}%`;
      pump4CalibProgressLabel.textContent = `Calibrando... ${secondsRemaining}s restantes`;
    }
  }, 1000);
}

// Calibração bomba 4: salvar mL/s (setpump4mlpersec)
// Calibração bomba 4: salvar mL/s (setpump4mlpersec)
if (pump4SaveCalibBtn) {
  pump4SaveCalibBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    const volStr = pump4CalibVolumeInput?.value || '';
    const volume = parseFloat(volStr);

    if (!volume || volume <= 0) {
      alert('Informe o volume medido em mL.');
      return;
    }

    const mlpersec = volume / PUMP4_CALIB_SECONDS;
    if (mlpersec <= 0 || mlpersec > 10) {
      alert('Valor mL/s inválido (0–10). Verifique o volume.');
      return;
    }

    pump4CalibStatusEl.textContent =
      `Gravando calibração: ${mlpersec.toFixed(3)} mL/s...`;

    try {
      // backend espera value; ele monta payload { ml_per_sec: value }
      await sendDeviceCommand(deviceId, 'setpump4mlpersec', mlpersec);
      pump4CalibStatusEl.textContent =
        `Calibração salva: ${mlpersec.toFixed(3)} mL/s.`;
      pump4CalibVolumeInput.value = '';
    } catch (err) {
      console.error('setpump4mlpersec error', err);
      pump4CalibStatusEl.textContent =
        'Erro ao salvar calibração da bomba 4.';
    }
  });
}

async function loadConfigForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) return;

  const cfg = await apiLoadDeviceConfig(deviceId);
  if (!cfg) return;

  if (typeof cfg.khReference === 'number') {
    khRefInput.value = cfg.khReference.toFixed(2);
    khRefStatus.textContent = `Referência atual: ${cfg.khReference.toFixed(2)} dKH`;
  } else {
    khRefStatus.textContent = 'Referência atual --';
    khRefInput.value = '';
  }

  if (typeof cfg.khTarget === 'number') {
    khTargetInput.value = cfg.khTarget.toFixed(2);
    khTargetStatus.textContent = `Alvo atual: ${cfg.khTarget.toFixed(2)} dKH`;
  } else {
    khTargetStatus.textContent = 'Alvo atual --';
    khTargetInput.value = '';
  }

  if (typeof cfg.intervalHours === 'number') {
    intervalRange.value = cfg.intervalHours;
    updateIntervalLabel(cfg.intervalHours);
  }

  if (cfg.levels) {
    updateLevelBadge(levelAEl, !!cfg.levels.A);
    updateLevelBadge(levelBEl, !!cfg.levels.B);
    updateLevelBadge(levelCEl, !!cfg.levels.C);
  }

  if (cfg.pumps) {
    Object.keys(cfg.pumps).forEach((id) => {
      const p = cfg.pumps[id];
      updatePumpStatus(parseInt(id, 10), !!p.running, p.direction);
    });
  }
}

async function apiSetKhConfig(deviceId, khReference, khTarget) {
  try {
    const body = {
      khReference,
      khTarget,
    };

    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
      {
        method: 'PUT',
        headers: headersAuthCfg,
        body: JSON.stringify(body),
      },
    );
    const json = await res.json();
    if (!res.ok || json.success === false) {
      console.error(json.message || 'Erro ao salvar config KH');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiSetKhConfig error', err);
    return false;
  }
}


saveKhRefBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) return;

  const val = parseFloat(khRefInput.value.replace(',', '.'));
  if (Number.isNaN(val)) {
    alert('Informe um KH de referência válido');
    return;
  }

  const ok = await apiSetKhConfig(deviceId, val, null);
  if (ok) {
    khRefStatus.textContent = `Referência atual: ${val.toFixed(2)} dKH`;
    window.dispatchEvent(new CustomEvent('deviceChanged'));
  }
});

saveKhTargetBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) return;

  const val = parseFloat(khTargetInput.value.replace(',', '.'));
  if (Number.isNaN(val)) {
    alert('Informe um KH alvo válido');
    return;
  }

  const ok = await apiSetKhConfig(deviceId, null, val);
  if (ok) {
    khTargetStatus.textContent = `Alvo atual: ${val.toFixed(2)} dKH`;
    window.dispatchEvent(new CustomEvent('deviceChanged'));
  }
});



saveIntervalBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  const hours = parseInt(intervalRange.value, 10);
  if (!deviceId || Number.isNaN(hours)) return;

  const ok = await apiSetMeasurementInterval(deviceId, hours);
  if (ok) {
    alert(`Intervalo atualizado para ${hours} ${hours === 1 ? 'hora' : 'horas'}.`);
  } else {
    alert('Erro ao salvar intervalo.');
  }
});

// Controle manual das bombas 1–3 com barra regressiva
const pumpStartButtons = document.querySelectorAll('.pumpStartBtn');
const activeTimers = {};

pumpStartButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const pumpId = parseInt(btn.dataset.pump, 10);
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId || !pumpId) return;

    const dirSelect = document.getElementById(`pumpDirSelect${pumpId}`);
    const timeInput = document.getElementById(`pumpTime${pumpId}`);

    const seconds = parseInt(timeInput.value, 10);
    const direction = dirSelect.value;

    if (Number.isNaN(seconds) || seconds <= 0) return;

    const ok = await apiManualPump(deviceId, pumpId, direction, seconds);
    if (!ok) return;

    updatePumpStatus(pumpId, true, direction);
    const progEl = pumpProgEls[pumpId];
    let remaining = seconds;
    progEl.style.width = '100%';

    if (activeTimers[pumpId]) clearInterval(activeTimers[pumpId]);

    activeTimers[pumpId] = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(activeTimers[pumpId]);
        progEl.style.width = '0%';
        updatePumpStatus(pumpId, false, direction);
      } else {
        const pct = (remaining / seconds) * 100;
        progEl.style.width = `${pct}%`;
      }
    }, 1000);
  });
});

// Correção de KH com bomba 4
khCorrectionBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  const volume = parseFloat(khCorrectionVolumeInput.value);
  if (!deviceId || Number.isNaN(volume) || volume <= 0) return;

  khCorrectionStatus.textContent = 'Enviando comando de correção...';
  const ok = await apiKhCorrection(deviceId, volume);
  if (ok) {
    khCorrectionStatus.textContent =
      `Correção enviada. Volume: ${volume.toFixed(1)} (aguarde execução no device).`;
  } else {
    khCorrectionStatus.textContent =
      'Erro ao enviar correção. Verifique conexão/API.';
  }
});

async function initDashboardConfig() {
  DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    khRefStatus.textContent = 'Nenhum dispositivo associado.';
    return;
  }

  updateIntervalLabel(intervalRange.value);
  await loadConfigForSelected();
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardConfig().catch((err) =>
    console.error('initDashboardConfig error', err),
  );
});

window.addEventListener('deviceChanged', () => {
  loadConfigForSelected();
});

async function apiStartCalibration(deviceId) {
  // por enquanto usa o mesmo fluxo de test_now
  const res = await fetch(
    `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
    {
      method: 'POST',
      headers: headersAuthCfg,
      body: JSON.stringify({ type: 'test_now' }),
    }
  );
  const json = await res.json();
  return res.ok && json.success;
}

async function apiAbort(deviceId) {
  const res = await fetch(
    `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
    {
      method: 'POST',
      headers: headersAuthCfg,
      body: JSON.stringify({ type: 'abort' }),
    }
  );
  const json = await res.json();
  return res.ok && json.success;
}

abortBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) return;
  if (!confirm('Deseja realmente abortar o teste/calibração em andamento?')) return;

  const ok = await apiAbort(deviceId);
  if (ok) {
    isRunningCycle = false;
    updateAbortVisibility();
    calibrationStatus.textContent = 'Ciclo abortado pelo usuário.';
  }
});


document
  .getElementById('startCalibrationBtn')
  .addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;
    calibrationStatus.textContent = 'Iniciando calibração...';
    const ok = await apiStartCalibration(deviceId);
    calibrationStatus.textContent = ok
      ? 'Calibração iniciada. Aguardando resposta do device...'
      : 'Erro ao iniciar calibração.';

    if (ok) {
    isRunningCycle = true;
    updateAbortVisibility();
    }

  });

