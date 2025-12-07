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
const saveKhBtn = document.getElementById('saveKhBtn');

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

const khCorrectionVolumeInput = document.getElementById('khCorrectionVolume');
const khCorrectionBtn = document.getElementById('khCorrectionBtn');
const khCorrectionStatus = document.getElementById('khCorrectionStatus');

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
  // Futuro: GET /api/v1/user/devices/:deviceId/config
  console.log('LOAD config', deviceId);
  // Mock inicial
  return {
    khReference: 8.0,
    intervalHours: 1,
    levels: { A: true, B: true, C: false },
    pumps: {
      1: { running: false, direction: 'forward' },
      2: { running: false, direction: 'forward' },
      3: { running: false, direction: 'forward' },
    },
  };
}

async function apiSetReferenceKH(deviceId, kh) {
  // Futuro: POST /api/v1/user/devices/:deviceId/config/kh
  console.log('SET KH ref', deviceId, kh);
  try {
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/config/kh`,
      {
        method: 'POST',
        headers: headersAuthCfg,
        body: JSON.stringify({ khReference: kh }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao salvar KH');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiSetReferenceKH error', err);
    return false;
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
  // Futuro: POST /api/v1/user/devices/:deviceId/command/kh-correction
  console.log('KH CORRECTION', deviceId, volume);
  try {
    const res = await fetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command/kh-correction`,
      {
        method: 'POST',
        headers: headersAuthCfg,
        body: JSON.stringify({ volume }),
      },
    );
    const json = await res.json();
    if (!res.ok || !json.success) {
      console.error(json.message || 'Erro ao aplicar correção de KH');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiKhCorrection error', err);
    return false;
  }
}

async function loadConfigForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) return;

  const cfg = await apiLoadDeviceConfig(deviceId);
  if (!cfg) return;

  if (typeof cfg.khReference === 'number') {
    khRefInput.value = cfg.khReference.toFixed(2);
    khRefStatus.textContent = `Valor atual: ${cfg.khReference.toFixed(2)} dKH`;
  } else {
    khRefStatus.textContent = 'Valor atual --';
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

// Eventos de salvar KH e intervalo
saveKhBtn.addEventListener('click', async () => {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  const kh = parseFloat(khRefInput.value);
  if (!deviceId || Number.isNaN(kh)) return;

  const ok = await apiSetReferenceKH(deviceId, kh);
  if (ok) {
    khRefStatus.textContent = `Valor atual: ${kh.toFixed(2)} dKH (atualizado)`;
  } else {
    khRefStatus.textContent = 'Erro ao salvar KH de referência.';
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
  await DashboardCommon.initTopbar();

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
