// dashboard-config.js

const khRefInput = document.getElementById('khRefInput');
const khRefStatus = document.getElementById('khRefStatus');
const khTargetInput = document.getElementById('khTargetInput');
const khTargetStatus = document.getElementById('khTargetStatus');
const saveKhRefBtn    = document.getElementById('saveKhRefBtn');
const saveKhTargetBtn = document.getElementById('saveKhTargetBtn');

const levelAEl = document.getElementById('levelA');
const levelBEl = document.getElementById('levelB');
const levelCEl = document.getElementById('levelC');

const pumpStatusEls = {
  1: document.getElementById('pumpStatus1'),
  2: document.getElementById('pumpStatus2'),
  3: document.getElementById('pumpStatus3'),
};
const pumpDirEls = {
  1: document.getElementById('pumpDirSelect1'),
  2: document.getElementById('pumpDirSelect2'),
  3: document.getElementById('pumpDirSelect3'),
};
const pumpProgEls = {
  1: document.getElementById('pumpProg1'),
  2: document.getElementById('pumpProg2'),
  3: document.getElementById('pumpProg3'),
};

const pump4RunCalibBtn       = document.getElementById('pump4RunCalibBtn');
const pump4CalibVolumeInput  = document.getElementById('pump4CalibVolume');
const pump4SaveCalibBtn      = document.getElementById('pump4SaveCalibBtn');
const pump4CalibStatusEl     = document.getElementById('pump4CalibStatus');


const pump4CalibProgressFill    = document.getElementById('pump4CalibProgressFill');
const pump4CalibProgressLabel   = document.getElementById('pump4CalibProgressLabel');

let pump4CalibRunning = false;
let pump4CalibTimerId = null;
const PUMP4_CALIB_SECONDS = 60;

const khCorrectionVolumeInput = document.getElementById('khCorrectionVolume');
const khCorrectionStatus = document.getElementById('khCorrectionStatus');
const startCalibrationBtn = document.getElementById('startCalibrationBtn');
const calibrationStatus = document.getElementById('calibrationStatus');
const abortBtn = document.getElementById('abortBtn');
let isRunningCycle = false;

const deviceNameInput  = document.getElementById('deviceNameInput');
const saveDeviceNameBtn = document.getElementById('saveDeviceNameBtn');
const deviceNameStatus  = document.getElementById('deviceNameStatus');

const khHealthGreenMaxDevInput = document.getElementById('khHealthGreenMaxDev');
const khHealthYellowMaxDevInput = document.getElementById('khHealthYellowMaxDev');

const telegramChatIdInput   = document.getElementById('telegramChatIdInput');
const telegramEnabledInput  = document.getElementById('telegramEnabledInput');
const saveTelegramConfigBtn = document.getElementById('saveTelegramConfigBtn');
const telegramConfigStatus  = document.getElementById('telegramConfigStatus');
const telegramBotTokenInput = document.getElementById('telegramBotTokenInput');
const testTelegramBtn       = document.getElementById('testTelegramBtn');
const toggleTokenBtn = document.getElementById('toggleTelegramTokenBtn');

if (telegramBotTokenInput && toggleTokenBtn) {
  toggleTokenBtn.addEventListener('click', () => {
    const isHidden = telegramBotTokenInput.type === 'password';
    telegramBotTokenInput.type = isHidden ? 'text' : 'password';
    toggleTokenBtn.textContent = isHidden ? 'Ocultar' : 'Mostrar';
  });
}

// Modo Manutenção - elementos DOM (bombas com barra de progresso)
const maintPumpStatusEls = {
  1: document.getElementById('maintPumpStatus1'),
  2: document.getElementById('maintPumpStatus2'),
  3: document.getElementById('maintPumpStatus3'),
  4: document.getElementById('maintPumpStatus4'),
};
const maintPumpProgEls = {
  1: document.getElementById('maintPumpProg1'),
  2: document.getElementById('maintPumpProg2'),
  3: document.getElementById('maintPumpProg3'),
  4: document.getElementById('maintPumpProg4'),
};

const sensorLevelA = document.getElementById('sensorLevelA');
const sensorLevelB = document.getElementById('sensorLevelB');
const sensorLevelC = document.getElementById('sensorLevelC');
const sensorTemp = document.getElementById('sensorTemp');
const sensorPH = document.getElementById('sensorPH');
const refreshSensorsBtn = document.getElementById('refreshSensorsBtn');
const sensorReadStatus = document.getElementById('sensorReadStatus');

const fillChamberABtn = document.getElementById('fillChamberABtn');
const fillChamberBBtn = document.getElementById('fillChamberBBtn');
const fillChamberCBtn = document.getElementById('fillChamberCBtn');
const chamberTestStatus = document.getElementById('chamberTestStatus');

const systemFlushBtn = document.getElementById('systemFlushBtn');
const flushStatus = document.getElementById('flushStatus');


function fillTelegramConfigFromApi(user) {
  telegramBotTokenInput.value  = user.telegramBotToken || '';
  telegramChatIdInput.value    = user.telegramChatId || '';
  telegramEnabledInput.checked = !!user.telegramEnabled;
}


if (testTelegramBtn) {
  testTelegramBtn.addEventListener('click', async () => {
    telegramConfigStatus.textContent = 'Enviando teste...';

    const res = await apiFetch('/api/user/telegram/test', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Mensagem de teste do ReefBlueSky KH Monitor.',
      }),
    });

    telegramConfigStatus.textContent = res.ok
      ? 'Mensagem de teste enviada.'
      : 'Erro ao enviar teste.';
  });
}



async function sendDeviceCommand(deviceId, type, value = null) {
  const payload = value != null ? { type, value } : { type };

  const res = await apiFetch(
    `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
    {
      method: 'POST',
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

// Helpers visuais
function updateLevelBadge(el, on) {
  el.className = 'badge-level ' + (on ? 'badge-level-on' : 'badge-level-off');
  el.textContent = on ? 'ON' : 'OFF';
}

function updatePumpStatus(pumpId, running, direction) {
  const statusEl = pumpStatusEls[pumpId];
  const dirEl    = pumpDirEls[pumpId];
  if (!statusEl) return;

  statusEl.className =
    'badge-level ' + (running ? 'badge-level-on' : 'badge-level-off');
  statusEl.textContent = running ? 'RODANDO' : 'PARADA';

  // Se quiser refletir sentido no select:
  if (dirEl) {
    dirEl.value = direction || 'forward';
  }
}


function updateLevelsFromDevice(device) {
  if (!device) return;

  const a = device.levelA;
  const b = device.levelB;
  const c = device.levelC;

  if (levelAEl) {
    levelAEl.textContent = a ? 'Ativo' : 'Baixo';
    levelAEl.className = a ? 'badge badge-green' : 'badge badge-gray';
  }

  if (levelBEl) {
    levelBEl.textContent = b ? 'Ativo' : 'Baixo';
    levelBEl.className = b ? 'badge badge-green' : 'badge badge-gray';
  }

  if (levelCEl) {
    levelCEl.textContent = c ? 'Ativo' : 'Baixo';
    levelCEl.className = c ? 'badge badge-green' : 'badge badge-gray';
  }
}


// Stubs de API (para você ligar no server.js depois)

async function apiLoadDeviceConfig(deviceId) {
  try {
    const [khRes, statusRes] = await Promise.all([
      apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`, {
      }),
      apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/status`, {
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
      khHealthGreenMaxDev: d.khHealthGreenMaxDev,
      khHealthYellowMaxDev: d.khHealthYellowMaxDev,
      khAutoEnabled: d.khAutoEnabled,
      intervalHours: s.intervalHours,
      levels: s.levels || {},
      pumps: s.pumps || {},

    };
  } catch (err) {
    console.error('apiLoadDeviceConfig error', err);
    return null;
  }
}

async function apiManualPump(deviceId, pumpId, direction, seconds) {
  // Futuro: POST /api/v1/user/devices/:deviceId/command/pump
  console.log('MANUAL pump', deviceId, pumpId, direction, seconds);
  try {
    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command/pump`,
      {
        method: 'POST',
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

async function apiFakeMeasurement(deviceId, khValue) {
  try {
    // manda como "value" para o backend
    await sendDeviceCommand(deviceId, 'fake_measurement', khValue);
    return true;
  } catch (err) {
    console.error('apiFakeMeasurement error', err);
    return false;
  }
}

async function apiLoadTelegramConfig() {
  try {
    const res = await apiFetch('/api/v1/user/telegram-config', {
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      console.error('Erro ao carregar config Telegram', json.message || json.error);
      return null;
    }
    return json.data || null; // precisa conter telegramBotToken, telegramChatId, telegramEnabled
  } catch (err) {
    console.error('apiLoadTelegramConfig error', err);
    return null;
  }
}

async function apiSaveTelegramConfig(botToken, enabled) {
  try {
    const res = await apiFetch('/api/v1/user/telegram-config', {
      method: 'PUT',
      body: JSON.stringify({
        telegramBotToken: botToken,
        telegramEnabled: enabled,
      }),
    });
    const json = await res.json();
    if (!res.ok || json.success === false) {
      console.error(json.message || 'Erro ao salvar config Telegram');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiSaveTelegramConfig error', err);
    return false;
  }
}





const btnFakeMeasurement = document.getElementById('btnFakeMeasurement');
const fakeMeasurementStatus = document.getElementById('fakeMeasurementStatus');

if (btnFakeMeasurement) {
  btnFakeMeasurement.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    // pede o KH fake
    const khStr = prompt('Informe o KH da medição fake (ex: 7.8):');
    if (khStr === null) return; // cancelou

    const kh = parseFloat(khStr.replace(',', '.'));
    if (!Number.isFinite(kh) || kh <= 0 || kh >= 25) {
      alert('KH inválido. Use um valor entre 0 e 25.');
      return;
    }

    btnFakeMeasurement.disabled = true;
    fakeMeasurementStatus.textContent =
      `Enviando medição fake com KH=${kh.toFixed(2)}...`;

    const ok = await apiFakeMeasurement(deviceId, kh);
    fakeMeasurementStatus.textContent = ok
      ? 'Comando enviado. Aguarde a medição aparecer no histórico.'
      : 'Erro ao enviar comando de medição fake.';

    btnFakeMeasurement.disabled = false;
  });
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
      startPump4CalibProgress();
      pump4CalibStatusEl.textContent = 'Calibração em andamento...';
      isRunningCycle = true;
      updateAbortVisibility();


      // Iniciar barra regressiva de 60s
      startPump4CalibProgress();
      pump4CalibStatusEl.textContent =
        'Calibração em andamento...';
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

  if (!pump4CalibProgressFill || !pump4CalibProgressLabel) return;

  pump4CalibProgressFill.style.width = '0%';
  pump4CalibProgressLabel.textContent =
    `Calibrando... ${secondsRemaining}s restantes`;

  if (pump4CalibTimerId) clearInterval(pump4CalibTimerId);

  pump4CalibTimerId = setInterval(() => {
    secondsRemaining -= 1;

    if (secondsRemaining <= 0) {
      clearInterval(pump4CalibTimerId);
      pump4CalibRunning = false;

      pump4CalibProgressFill.style.width = '100%';
      pump4CalibProgressLabel.textContent = 'Calibração concluída!';
      pump4CalibStatusEl.textContent =
        'Informe o volume medido e clique "Salvar calibração".';
      pump4RunCalibBtn.disabled = false;
    } else {
      const percent =
        ((PUMP4_CALIB_SECONDS - secondsRemaining) / PUMP4_CALIB_SECONDS) * 100;
      pump4CalibProgressFill.style.width = `${percent}%`;
      pump4CalibProgressLabel.textContent =
        `Calibrando... ${secondsRemaining}s restantes`;
    }
  }, 1000);
}


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

  let khRef = null;
  if (typeof cfg.khReference === 'number') {
    khRef = cfg.khReference;
  } else if (cfg.khReference != null) {
    const v = parseFloat(cfg.khReference);
    khRef = Number.isNaN(v) ? null : v;
  }

  if (khRef != null) {
    // se o input existir (no futuro), mantém sincronizado, mas é opcional
    if (khRefInput) {
      khRefInput.value = khRef.toFixed(2);
    }
    khRefStatus.textContent = `Referência atual: ${khRef.toFixed(2)} dKH`;
  } else {
    khRefStatus.textContent = 'Referência atual --';
    if (khRefInput) {
      khRefInput.value = '';
    }
  }

  // --- KH alvo do aquário: converte número ou string do backend ---
  let khTarget = null;
  if (typeof cfg.khTarget === 'number') {
    khTarget = cfg.khTarget;
  } else if (cfg.khTarget != null) {
    const v = parseFloat(cfg.khTarget);
    khTarget = Number.isNaN(v) ? null : v;
  }

  if (khTarget != null) {
    if (khTargetInput) {
      khTargetInput.value = khTarget.toFixed(2);
    }
    khTargetStatus.textContent = `Alvo atual: ${khTarget.toFixed(2)} dKH`;
  } else {
    khTargetStatus.textContent = 'Alvo atual --';
    if (khTargetInput) {
      khTargetInput.value = '';
    }
  }

  if (typeof cfg.khHealthGreenMaxDev === 'number') {
    khHealthGreenMaxDevInput.value = cfg.khHealthGreenMaxDev.toFixed(2);
  }
  if (typeof cfg.khHealthYellowMaxDev === 'number') {
    khHealthYellowMaxDevInput.value = cfg.khHealthYellowMaxDev.toFixed(2);
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


async function apiSetDeviceName(deviceId, name) {
  try {
    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/name`,
      {
        method: 'PUT',
        body: JSON.stringify({ name }),
      }
    );
    const json = await res.json();
    if (!res.ok || json.success === false) {
      console.error(json.message || 'Erro ao salvar nome do device');
      return false;
    }
    return true;
  } catch (err) {
    console.error('apiSetDeviceName error', err);
    return false;
  }
}

if (saveDeviceNameBtn) {
  saveDeviceNameBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const name = (deviceNameInput.value || '').trim();
    if (!name) {
      alert('Informe um nome para o dispositivo.');
      return;
    }

    const ok = await apiSetDeviceName(deviceId, name);
    if (ok) {
      deviceNameStatus.textContent = 'Nome atualizado.';
      // dispara refresh da lista/topbar
      window.dispatchEvent(new CustomEvent('deviceChanged'));
    } else {
      deviceNameStatus.textContent = 'Erro ao atualizar nome.';
    }
  });
}


async function apiSetKhConfig(deviceId, khReference, khTarget) {
  try {
    const body = { khReference, khTarget};

    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
      {
        method: 'PUT',
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

const saveKhHealthBtn = document.getElementById('btnSaveKhHealthRanges');

if (saveKhHealthBtn) {
  saveKhHealthBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const green = khHealthGreenMaxDevInput.value
      ? Number(khHealthGreenMaxDevInput.value.replace(',', '.'))
      : null;
    const yellow = khHealthYellowMaxDevInput.value
      ? Number(khHealthYellowMaxDevInput.value.replace(',', '.'))
      : null;

    if (green != null && Number.isNaN(green)) {
      alert('Valor de desvio verde inválido. Use números como 0,3 ou 0.3');
      return;
    }
    if (yellow != null && Number.isNaN(yellow)) {
      alert('Valor de desvio amarelo inválido. Use números como 0,5 ou 0.5');
      return;
    }

    try {
      const res = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
        {
          method: 'PUT',
          body: JSON.stringify({
            khHealthGreenMaxDev: green,
            khHealthYellowMaxDev: yellow,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(json.message || 'Erro ao salvar desvios de KH.');
        return;
      }
      // inputs já ficam com os valores digitados (número “fixo”)
    } catch (err) {
      console.error('saveKhHealth error', err);
      alert('Erro de comunicação ao salvar desvios de KH.');
    }
  });
}




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


if (saveTelegramConfigBtn) {
  saveTelegramConfigBtn.addEventListener('click', async () => {
    const botToken = (telegramBotTokenInput.value || '').trim();
    const enabled = telegramEnabledInput.checked;

    telegramConfigStatus.textContent = 'Salvando config Telegram...';

    const ok = await apiSaveTelegramConfig(botToken, enabled);
    telegramConfigStatus.textContent = ok
      ? 'Config Telegram salva. Envie uma mensagem para o bot e depois use o teste.'
      : 'Erro ao salvar config Telegram.';
  });
}

async function initDashboardConfig() {
  DashboardCommon.initTopbar();

  const teleCfg = await apiLoadTelegramConfig();
    if (teleCfg) {
      // não preenche o token de volta
      if (telegramChatIdInput) {
        telegramChatIdInput.value =
          teleCfg.telegramChatId != null ? String(teleCfg.telegramChatId) : '';
      }
      if (telegramEnabledInput) {
        telegramEnabledInput.checked = !!teleCfg.telegramEnabled;
      }
      if (teleCfg.telegramChatId) {
        telegramChatIdInput.placeholder = '';
      }
    }

  const dosingBtn = document.getElementById('dosingBtn');
  if (dosingBtn) {
    dosingBtn.addEventListener('click', () => {
      window.location.href = 'dashboard-dosing.html';
    });
  }

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    khRefStatus.textContent = 'Nenhum dispositivo associado.';
    return;
  }

  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (deviceId) {
    try {
      const resp = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
      );
      const json = await resp.json();
      if (resp.ok && json.success && json.data &&
          typeof DashboardCommon.setLcdStatus === 'function') {
        DashboardCommon.setLcdStatus(json.data.lcdStatus);
      }
    } catch (e) {
      console.error('Erro ao carregar lcdStatus na tela Config', e);
    }
  }

  await loadConfigForSelected();
}

// === Modal de Calibração de KH (assistente) ===
const khCalibModal        = document.getElementById('khCalibModal');
const openKhCalibModalBtn = document.getElementById('openKhCalibModalBtn');
const khCalibStep1        = document.getElementById('khCalibStep1');
const khCalibStep2        = document.getElementById('khCalibStep2');
const khCalibStep1Yes     = document.getElementById('khCalibStep1Yes');
const khCalibStep1No      = document.getElementById('khCalibStep1No');
const khCalibRefInput     = document.getElementById('khCalibRefInput');
const khCalibSaveBtn      = document.getElementById('khCalibSaveBtn');
const khCalibCancelBtn    = document.getElementById('khCalibCancelBtn');
const khCalibModalStatus  = document.getElementById('khCalibModalStatus');

// flag que depois vamos mandar para o backend (assumeEmpty)
let khCalibAssumeEmpty = true;

function showKhCalibModal() {
  if (!khCalibModal) return;
  khCalibAssumeEmpty = true;          // default = câmaras vazias
  khCalibStep1.classList.remove('hidden');
  khCalibStep2.classList.add('hidden');
  khCalibModalStatus.textContent = '';
  // sugere o valor atual se existir
  if (khRefInput && khRefInput.value) {
    khCalibRefInput.value = khRefInput.value;
  } else {
    khCalibRefInput.value = '';
  }
  khCalibModal.classList.remove('hidden');
}

function closeKhCalibModal() {
  if (!khCalibModal) return;
  khCalibModal.classList.add('hidden');
}

if (openKhCalibModalBtn && khCalibModal) {
  openKhCalibModalBtn.addEventListener('click', () => {
    showKhCalibModal();
  });
}

if (khCalibStep1Yes) {
  khCalibStep1Yes.addEventListener('click', () => {
    // usuário disse que câmaras estão vazias
    khCalibAssumeEmpty = true;
    khCalibStep1.classList.add('hidden');
    khCalibStep2.classList.remove('hidden');
    khCalibRefInput.focus();
  });
}

if (khCalibStep1No) {
  khCalibStep1No.addEventListener('click', () => {
    // usuário disse que NÃO estão vazias -> no futuro assumeEmpty=false
    khCalibAssumeEmpty = false;
    khCalibStep1.classList.add('hidden');
    khCalibStep2.classList.remove('hidden');
    khCalibRefInput.focus();
  });
}

if (khCalibCancelBtn) {
  khCalibCancelBtn.addEventListener('click', () => {
    closeKhCalibModal();
  });
}

if (khCalibSaveBtn) {
  khCalibSaveBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const raw = (khCalibRefInput.value || '').trim();
    const val = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0 || val > 25) {
      khCalibModalStatus.textContent =
        'Informe um KH de referência válido (0–25).';
      return;
    }

    khCalibSaveBtn.disabled = true;
    khCalibModalStatus.textContent = 'Salvando KH de referência...';

    // 1) salva KH ref na API (como já fazia)
    const ok = await apiSetKhConfig(deviceId, val, null);

    if (!ok) {
      khCalibModalStatus.textContent =
        'Erro ao salvar KH de referência.';
      khCalibSaveBtn.disabled = false;
      return;
    }

    // 2) sincroniza UI local
    if (khRefInput) {
      khRefInput.value = val.toFixed(2);
    }
    if (khRefStatus) {
      khRefStatus.textContent =
        `Referência atual: ${val.toFixed(2)} dKH`;
    }
    window.dispatchEvent(new CustomEvent('deviceChanged'));

    // 3) dispara a calibração de KH no device
    khCalibModalStatus.textContent =
      'Referência salva. Iniciando calibração no dispositivo...';

    try {
      await sendDeviceCommand(deviceId, 'khcalibrate', {
        assumeEmpty: khCalibAssumeEmpty, // true se usuário respondeu "Sim", false se "Não"
        khRefUser: val,
      });

      khCalibModalStatus.textContent =
        'Calibração iniciada. Acompanhe o ciclo no dispositivo.';
      isRunningCycle = true;
      updateAbortVisibility();

      setTimeout(() => closeKhCalibModal(), 1000);
    } catch (err) {
      console.error('khcalibrate error', err);
      khCalibModalStatus.textContent =
        'Erro ao iniciar calibração no dispositivo.';
    } finally {
      khCalibSaveBtn.disabled = false;
    }
  });
}

// === Modal para ALTERAR KH de referência manualmente ===
const khRefEditModal     = document.getElementById('khRefEditModal');
const khRefCurrentSpan   = document.getElementById('khRefCurrentSpan');
const khRefEditInput     = document.getElementById('khRefEditInput');
const khRefEditStatus    = document.getElementById('khRefEditStatus');
const khRefEditSaveBtn   = document.getElementById('khRefEditSaveBtn');
const khRefEditCancelBtn = document.getElementById('khRefEditCancelBtn');


function showKhRefEditModal() {
  if (!khRefEditModal) return;

  // ler valor atual do texto "Referência atual: X.XX dKH"
  let current = null;
  const txt = khRefStatus?.textContent || '';
  const m = txt.match(/([0-9]+[.,][0-9]+)/);
  if (m) current = parseFloat(m[1].replace(',', '.'));

  khRefCurrentSpan.textContent =
    current != null && Number.isFinite(current)
      ? current.toFixed(2)
      : '--';

  khRefEditInput.value =
    current != null && Number.isFinite(current)
      ? current.toFixed(2)
      : '';

  khRefEditStatus.textContent = '';
  khRefEditModal.classList.remove('hidden');
}

function closeKhRefEditModal() {
  if (!khRefEditModal) return;
  khRefEditModal.classList.add('hidden');
}

// botão "Alterar KH de Referência" abre o modal
if (saveKhRefBtn) {
  saveKhRefBtn.addEventListener('click', () => {
    showKhRefEditModal();
  });
}

if (khRefEditCancelBtn) {
  khRefEditCancelBtn.addEventListener('click', () => {
    closeKhRefEditModal();
  });
}

if (khRefEditSaveBtn) {
  khRefEditSaveBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const raw = (khRefEditInput.value || '').trim();
    const val = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0 || val > 25) {
      khRefEditStatus.textContent =
        'Informe um KH de referência válido (0–25).';
      return;
    }

    khRefEditSaveBtn.disabled = true;
    khRefEditStatus.textContent = 'Salvando KH de referência...';

    const ok = await apiSetKhConfig(deviceId, val, null);
    if (!ok) {
      khRefEditStatus.textContent = 'Erro ao salvar KH de referência.';
      khRefEditSaveBtn.disabled = false;
      return;
    }

    khRefStatus.textContent = `Referência atual: ${val.toFixed(2)} dKH`;
    window.dispatchEvent(new CustomEvent('deviceChanged'));

    khRefEditStatus.textContent = 'Referência atualizada.';
    setTimeout(() => {
      khRefEditSaveBtn.disabled = false;
      closeKhRefEditModal();
    }, 400);
  });
}


// === Modal para ALTERAR KH alvo do aquário ===
const khTargetEditModal     = document.getElementById('khTargetEditModal');
const khTargetCurrentSpan   = document.getElementById('khTargetCurrentSpan');
const khTargetEditInput     = document.getElementById('khTargetEditInput');
const khTargetEditStatus    = document.getElementById('khTargetEditStatus');
const khTargetEditSaveBtn   = document.getElementById('khTargetEditSaveBtn');
const khTargetEditCancelBtn = document.getElementById('khTargetEditCancelBtn');

function showKhTargetEditModal() {
  if (!khTargetEditModal) return;

  // ler valor atual do texto "Alvo atual: X.XX dKH"
  let current = null;
  const txt = khTargetStatus?.textContent || '';
  const m = txt.match(/([0-9]+[.,][0-9]+)/);
  if (m) current = parseFloat(m[1].replace(',', '.'));

  khTargetCurrentSpan.textContent =
    current != null && Number.isFinite(current)
      ? current.toFixed(2)
      : '--';

  khTargetEditInput.value =
    current != null && Number.isFinite(current)
      ? current.toFixed(2)
      : '';

  khTargetEditStatus.textContent = '';
  khTargetEditModal.classList.remove('hidden');
}

function closeKhTargetEditModal() {
  if (!khTargetEditModal) return;
  khTargetEditModal.classList.add('hidden');
}

// botão "Alterar KH alvo" abre o modal
if (saveKhTargetBtn) {
  saveKhTargetBtn.addEventListener('click', () => {
    showKhTargetEditModal();
  });
}

if (khTargetEditCancelBtn) {
  khTargetEditCancelBtn.addEventListener('click', () => {
    closeKhTargetEditModal();
  });
}

if (khTargetEditSaveBtn) {
  khTargetEditSaveBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const raw = (khTargetEditInput.value || '').trim();
    const val = parseFloat(raw.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0 || val > 25) {
      khTargetEditStatus.textContent =
        'Informe um KH alvo válido (0–25).';
      return;
    }

    khTargetEditSaveBtn.disabled = true;
    khTargetEditStatus.textContent = 'Salvando KH alvo...';

    const ok = await apiSetKhConfig(deviceId, null, val);
    if (!ok) {
      khTargetEditStatus.textContent = 'Erro ao salvar KH alvo.';
      khTargetEditSaveBtn.disabled = false;
      return;
    }

    khTargetStatus.textContent = `Alvo atual: ${val.toFixed(2)} dKH`;
    if (khTargetInput) {
      khTargetInput.value = val.toFixed(2); // se continuar usando o input
    }
    window.dispatchEvent(new CustomEvent('deviceChanged'));

    khTargetEditStatus.textContent = 'KH alvo atualizado.';
    setTimeout(() => {
      khTargetEditSaveBtn.disabled = false;
      closeKhTargetEditModal();
    }, 400);
  });
}


// ============================================================================
// MODO MANUTENÇÃO - Testes individuais de bombas, sensores e câmaras
// ============================================================================

// Função auxiliar para enviar comando genérico ao device
async function sendMaintenanceCommand(deviceId, type, params = {}) {
  try {
    const res = await apiFetch(`/api/v1/user/devices/${deviceId}/command`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        ...params,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('sendMaintenanceCommand error', err);
    return false;
  }
}

// Controle manual bombas modo manutenção (1-4) com barra regressiva e sentido
const maintPumpStartButtons = document.querySelectorAll('.maintPumpStartBtn');
const maintActiveTimers = {};

maintPumpStartButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const pumpId = parseInt(btn.dataset.pump, 10);
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId || !pumpId) return;

    const dirSelect = document.getElementById(`maintPumpDirSelect${pumpId}`);
    const timeInput = document.getElementById(`maintPumpTime${pumpId}`);

    const seconds = parseInt(timeInput.value, 10);
    const direction = dirSelect.value;

    if (Number.isNaN(seconds) || seconds <= 0) return;

    const ok = await apiManualPump(deviceId, pumpId, direction, seconds);
    if (!ok) return;

    updateMaintPumpStatus(pumpId, true, direction);
    const progEl = maintPumpProgEls[pumpId];
    let remaining = seconds;
    progEl.style.width = '100%';

    if (maintActiveTimers[pumpId]) clearInterval(maintActiveTimers[pumpId]);

    maintActiveTimers[pumpId] = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(maintActiveTimers[pumpId]);
        delete maintActiveTimers[pumpId];
        progEl.style.width = '0';
        updateMaintPumpStatus(pumpId, false);
      } else {
        const pct = (remaining / seconds) * 100;
        progEl.style.width = `${pct}%`;
      }
    }, 1000);
  });
});

function updateMaintPumpStatus(pumpId, running, direction) {
  const badgeEl = maintPumpStatusEls[pumpId];
  if (!badgeEl) return;
  if (running) {
    badgeEl.textContent = direction === 'reverse' ? 'REVERSO' : 'ACIONADA';
    badgeEl.classList.remove('badge-level-off');
    badgeEl.classList.add('badge-level-on');
  } else {
    badgeEl.textContent = 'PARADA';
    badgeEl.classList.remove('badge-level-on');
    badgeEl.classList.add('badge-level-off');
  }
}

// ============================================================================
// [FIX] Atualização automática de sensores em tempo real
// ============================================================================

let sensorUpdateInterval = null;
let temperatureCounter = 0;  // Contador para atualizar temperatura a cada 5s

// Função para atualizar leituras dos sensores
async function updateSensorReadings() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) return;

  try {
    const res = await apiFetch(`/api/v1/devices/${deviceId}/sensors`);
    if (res.ok) {
      const data = await res.json();

      // Atualizar níveis e pH a cada 1 segundo
      sensorLevelA.textContent = data.levelA != null ? (data.levelA ? 'Ativo' : 'Baixo') : '--';
      sensorLevelA.style.color = data.levelA ? '#4ade80' : '#f97373';

      sensorLevelB.textContent = data.levelB != null ? (data.levelB ? 'Ativo' : 'Baixo') : '--';
      sensorLevelB.style.color = data.levelB ? '#4ade80' : '#f97373';

      sensorLevelC.textContent = data.levelC != null ? (data.levelC ? 'Ativo' : 'Baixo') : '--';
      sensorLevelC.style.color = data.levelC ? '#4ade80' : '#f97373';

      sensorPH.textContent = data.ph != null
        ? data.ph.toFixed(2)
        : '--';

      // Atualizar temperatura apenas a cada 5 segundos
      temperatureCounter++;
      if (temperatureCounter >= 5) {
        sensorTemp.textContent = data.temperature != null
          ? `${data.temperature.toFixed(1)}°C`
          : '--';
        temperatureCounter = 0;
      }

      sensorReadStatus.textContent = `Atualizado: ${new Date().toLocaleTimeString('pt-BR')}`;
    } else {
      sensorReadStatus.textContent = 'Erro ao buscar leituras dos sensores.';
    }
  } catch (err) {
    console.error('Erro ao buscar sensores:', err);
    sensorReadStatus.textContent = 'Erro de conexão.';
  }
}

// Iniciar atualizações automáticas
function startSensorAutoUpdate() {
  // Parar intervalo anterior se existir
  if (sensorUpdateInterval) clearInterval(sensorUpdateInterval);

  // Resetar contador de temperatura
  temperatureCounter = 0;

  // Atualizar sensores a cada 1 segundo
  // (níveis e pH sempre, temperatura a cada 5 iterações)
  sensorUpdateInterval = setInterval(updateSensorReadings, 1000);

  // Atualização imediata
  updateSensorReadings();

  console.log('[Sensores] Atualização automática iniciada (Níveis/pH: 1s, Temperatura: 5s)');
}

// Parar atualizações automáticas
function stopSensorAutoUpdate() {
  if (sensorUpdateInterval) {
    clearInterval(sensorUpdateInterval);
    sensorUpdateInterval = null;
  }
  console.log('[Sensores] Atualização automática parada');
}

// Botão manual de atualização
if (refreshSensorsBtn) {
  refreshSensorsBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    refreshSensorsBtn.disabled = true;
    sensorReadStatus.textContent = 'Solicitando leituras atualizadas...';

    await updateSensorReadings();

    refreshSensorsBtn.disabled = false;
  });

  // [FIX] Iniciar atualização automática quando a página carregar
  startSensorAutoUpdate();
}

// Testes de enchimento de câmaras
if (fillChamberABtn) {
  fillChamberABtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    fillChamberABtn.disabled = true;
    chamberTestStatus.textContent = 'Enchendo câmara A...';

    const ok = await sendMaintenanceCommand(deviceId, 'fill_chamber', { chamber: 'A' });
    chamberTestStatus.textContent = ok
      ? 'Câmara A sendo enchida. Monitore o nível do sensor A.'
      : 'Erro ao acionar enchimento da câmara A.';

    setTimeout(() => { fillChamberABtn.disabled = false; }, 2000);
  });
}

if (fillChamberBBtn) {
  fillChamberBBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    fillChamberBBtn.disabled = true;
    chamberTestStatus.textContent = 'Enchendo câmara B...';

    const ok = await sendMaintenanceCommand(deviceId, 'fill_chamber', { chamber: 'B' });
    chamberTestStatus.textContent = ok
      ? 'Câmara B sendo enchida. Monitore o nível do sensor B.'
      : 'Erro ao acionar enchimento da câmara B.';

    setTimeout(() => { fillChamberBBtn.disabled = false; }, 2000);
  });
}

if (fillChamberCBtn) {
  fillChamberCBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    fillChamberCBtn.disabled = true;
    chamberTestStatus.textContent = 'Enchendo câmara C...';

    const ok = await sendMaintenanceCommand(deviceId, 'fill_chamber', { chamber: 'C' });
    chamberTestStatus.textContent = ok
      ? 'Câmara C sendo enchida. Monitore o nível do sensor C.'
      : 'Erro ao acionar enchimento da câmara C.';

    setTimeout(() => { fillChamberCBtn.disabled = false; }, 2000);
  });
}

// Ciclo de limpeza completo do sistema
if (systemFlushBtn) {
  systemFlushBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
    if (!deviceId) return;

    const confirm = window.confirm(
      'Executar ciclo completo de limpeza?\n\n' +
      'Isso vai acionar todas as bombas e válvulas para limpar o sistema.\n' +
      'Duração aproximada: 2 minutos.'
    );

    if (!confirm) return;

    systemFlushBtn.disabled = true;
    flushStatus.textContent = 'Executando ciclo de limpeza... Aguarde 2 minutos.';

    const ok = await sendMaintenanceCommand(deviceId, 'system_flush');
    flushStatus.textContent = ok
      ? 'Ciclo de limpeza iniciado. Aguarde a conclusão (~2 min).'
      : 'Erro ao iniciar ciclo de limpeza.';

    // Habilitar botão novamente após 2 minutos
    setTimeout(() => {
      systemFlushBtn.disabled = false;
      if (ok) {
        flushStatus.textContent = 'Ciclo de limpeza concluído.';
      }
    }, 120000);
  });
}

// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initDashboardConfig().catch((err) =>
    console.error('initDashboardConfig error', err),
  );
});

if (startCalibrationBtn) {
  startCalibrationBtn.addEventListener('click', () => {
    showKhCalibModal();
  });
}


