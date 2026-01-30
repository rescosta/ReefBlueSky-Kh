// dashboard-main.js


const khCalibrationLabel = document.getElementById('khCalibrationLabel');


const khValueEl = document.getElementById('khValue');
const khDiffEl = document.getElementById('khDiff');
const khPrevEl = document.getElementById('khPrev');
const khMinEl = document.getElementById('khMin');
const khMaxEl = document.getElementById('khMax');

const lastMeasureTimeEl = document.getElementById('lastMeasureTime');
const nextMeasureTimeEl = document.getElementById('nextMeasureTime');
const calibrationDateEl = document.getElementById('calibrationDate');

const statusPhEl = document.getElementById('statusPh');
const statusBufferEl = document.getElementById('statusBuffer');
const statusReactorEl = document.getElementById('statusReactor');

const measurementsBody = document.getElementById('measurementsBody');
const lastCountInfo = document.getElementById('lastCountInfo');

// [FIX] Indicadores de Sanity Checks
const statusFlowRateEl = document.getElementById('statusFlowRate');
const statusPHRangeEl = document.getElementById('statusPHRange');
const statusTempRangeEl = document.getElementById('statusTempRange');
const lastAlertTextEl = document.getElementById('lastAlertText');

const khTargetSpan = document.getElementById('khTargetSpan');
const khRefSpan    = document.getElementById('khRefSpan');
const kh24hSpan = document.getElementById('kh24hSpan');
const kh3dSpan = document.getElementById('kh3dSpan');
const kh7dSpan = document.getElementById('kh7dSpan');
const kh15dSpan = document.getElementById('kh15dSpan');

const testModeToggle = document.getElementById('testModeToggle');
const testNowBtn     = document.getElementById('testNowBtn');

const intervalRange = document.getElementById('intervalRange');
const intervalLabel = document.getElementById('intervalLabel');
const saveIntervalBtn = document.getElementById('saveIntervalBtn');


const testNowProgressWrapper = document.getElementById('testNowProgressWrapper');
const testNowProgressFill   = document.getElementById('testNowProgressFill');
const testNowProgressLabel  = document.getElementById('testNowProgressLabel');
const abortArea             = document.getElementById('abortArea');
const abortBtn              = document.getElementById('abortBtn');
const abortStatusText       = document.getElementById('abortStatusText');



const doseVolumeInput   = document.getElementById('doseVolumeInput');
const pump4RateSpan     = document.getElementById('pump4RateSpan');
const applyDoseBtn      = document.getElementById('applyDoseBtn');

const doseProgressWrapper = document.getElementById('doseProgressWrapper');
const doseProgressFill    = document.getElementById('doseProgressFill');
const doseProgressLabel   = document.getElementById('doseProgressLabel');

const pump4CalibBtn            = document.getElementById('pump4CalibBtn');
const pump4CalibProgressWrapper = document.getElementById('pump4CalibProgressWrapper');
const pump4CalibProgressFill    = document.getElementById('pump4CalibProgressFill');
const pump4CalibProgressLabel   = document.getElementById('pump4CalibProgressLabel');

let pump4CalibTimerId = null;
let pump4CalibEndTime = null;

let pump4MlPerSec   = null;  // virá da API futuramente
let isRunningDose   = false;
let doseStartedAt   = null;
let doseTotalMs     = 0;
let doseTimerId     = null;


let isRunningTestNow = false;
let testNowStartedAt = null;
let testNowTotalMs   = 8 * 60 * 1000; // 8 minutos
let testNowStep      = 0;
let testNowTimerId   = null;

let currentKhTarget = null;

// Função para atualizar label do intervalo
function updateIntervalLabel(v) {
  const n = parseInt(v, 10) || 1;
  intervalLabel.textContent = `${n} ${n === 1 ? 'hora' : 'horas'}`;
}

// Event listener para o range de intervalo
if (intervalRange) {
  intervalRange.addEventListener('input', () => {
    updateIntervalLabel(intervalRange.value);
  });
}

// Função API para salvar intervalo de medição
async function apiSetMeasurementInterval(deviceId, hours) {
  console.log('SET interval', deviceId, hours);
  try {
    const res = await apiFetch(
      `/api/v1/user/devices/${encodeURIComponent(deviceId)}/config/interval`,
      {
        method: 'POST',
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

// Event listener para salvar intervalo
if (saveIntervalBtn) {
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
}


function updateTestNowProgress() {
  if (!isRunningTestNow || !testNowStartedAt || !testNowProgressFill) return;

  const elapsed = Date.now() - testNowStartedAt;
  const stepDuration = testNowTotalMs / 5;
  let step = Math.floor(elapsed / stepDuration) + 1;
  if (step < 1) step = 1;
  if (step > 5) step = 5;

  testNowStep = step;

  const percent = step * 20; // 5 etapas => 20% cada
  testNowProgressFill.style.width = `${percent}%`;

  if (testNowProgressLabel) {
    testNowProgressLabel.textContent = `Teste em andamento — etapa ${step} de 5`;
  }

  if (elapsed >= testNowTotalMs) {
    // terminou tempo estimado
    stopTestNowProgress(false);
  }
}

function startTestNowProgress() {
  if (!testNowProgressWrapper) return;

  isRunningTestNow = true;
  testNowStartedAt = Date.now();
  testNowStep = 1;

  testNowProgressFill.style.width = '20%';
  testNowProgressLabel.textContent = 'Teste em andamento — etapa 1 de 5';

  testNowProgressWrapper.style.display = 'block';
  abortArea.style.display = 'block';
  abortStatusText.innerHTML = '&nbsp;';

  if (testNowTimerId) clearInterval(testNowTimerId);
  testNowTimerId = setInterval(updateTestNowProgress, 1000);
}

function stopTestNowProgress(wasAborted) {
  isRunningTestNow = false;
  testNowStartedAt = null;
  testNowStep = 0;

  if (testNowTimerId) {
    clearInterval(testNowTimerId);
    testNowTimerId = null;
  }

  if (testNowProgressWrapper) {
    testNowProgressWrapper.style.display = 'none';
    testNowProgressFill.style.width = '0%';
    testNowProgressLabel.textContent = wasAborted
      ? 'Teste cancelado'
      : 'Teste concluído';
  }

  if (abortArea) {
    abortArea.style.display = 'none';
  }

  if (abortStatusText) {
    abortStatusText.textContent = wasAborted
      ? 'Cancelado pelo usuário.'
      : '';
  }
}

function updateDoseProgress() {
  if (!isRunningDose || !doseStartedAt || !doseProgressFill || doseTotalMs <= 0) return;

  const elapsed = Date.now() - doseStartedAt;
  let fraction = elapsed / doseTotalMs;
  if (fraction < 0) fraction = 0;
  if (fraction > 1) fraction = 1;

  const percent = Math.round(fraction * 100);
  doseProgressFill.style.width = `${percent}%`;

  if (doseProgressLabel) {
    doseProgressLabel.textContent = `Dose em andamento — ${percent}%`;
  }

  if (elapsed >= doseTotalMs) {
    stopDoseProgress(false);
  }
}

function startDoseProgress(totalMs) {
  if (!doseProgressWrapper || !totalMs || totalMs <= 0) return;

  isRunningDose = true;
  doseStartedAt = Date.now();
  doseTotalMs   = totalMs;

  doseProgressFill.style.width = '0%';
  doseProgressLabel.textContent = 'Dose em andamento...';

  doseProgressWrapper.style.display = 'block';
  abortArea.style.display = 'block';
  abortStatusText.innerHTML = '&nbsp;';

  if (doseTimerId) clearInterval(doseTimerId);
  doseTimerId = setInterval(updateDoseProgress, 500);
}

function stopDoseProgress(wasAborted) {
  isRunningDose = false;
  doseStartedAt = null;
  doseTotalMs   = 0;

  if (doseTimerId) {
    clearInterval(doseTimerId);
    doseTimerId = null;
  }

  if (doseProgressWrapper) {
    doseProgressWrapper.style.display = 'none';
    doseProgressFill.style.width = '0%';
    doseProgressLabel.textContent = wasAborted
      ? 'Dose cancelada'
      : 'Dose concluída';
  }
}

function updatePump4CalibProgress() {
  if (!pump4CalibEndTime || !pump4CalibProgressFill) return;

  const now = Date.now();
  const totalMs = 60 * 1000; // 60s fixos
  const remainingMs = pump4CalibEndTime - now;
  const clamped = Math.max(0, Math.min(totalMs, remainingMs));
  const fraction = 1 - clamped / totalMs;
  const percent = Math.round(fraction * 100);

  pump4CalibProgressFill.style.width = `${percent}%`;

  if (pump4CalibProgressLabel) {
    const remainingSec = Math.ceil(clamped / 1000);
    pump4CalibProgressLabel.textContent =
      remainingMs > 0
        ? `Calibração em andamento... ${remainingSec}s`
        : 'Calibração concluída. Informe o volume medido abaixo.';
  }

  if (remainingMs <= 0 && pump4CalibTimerId) {
    clearInterval(pump4CalibTimerId);
    pump4CalibTimerId = null;
  }
}

function startPump4CalibProgress() {
  if (!pump4CalibProgressWrapper) return;

  pump4CalibEndTime = Date.now() + 60 * 1000; // 60s
  pump4CalibProgressWrapper.style.display = 'block';
  pump4CalibProgressFill.style.width = '0%';
  pump4CalibProgressLabel.textContent =
    'Calibração em andamento... 60s';

  if (pump4CalibTimerId) clearInterval(pump4CalibTimerId);
  pump4CalibTimerId = setInterval(updatePump4CalibProgress, 500);
}

/*
function applyTestModeUI(testModeEnabled) {
  if (!testModeToggle || !testNowBtn) return;
  testModeToggle.checked = !!testModeEnabled;

  // respeita também o estado de calibração
  const hasRef =
    khCalibrationLabel &&
    khCalibrationLabel.textContent.startsWith('Calibração: OK');

  testNowBtn.disabled = !testModeEnabled || !hasRef;
}
*/

function applyTestModeUI(testModeEnabled) {
  if (!testModeToggle || !testNowBtn) return;

  // Atualizar botão toggle visual
  const isEnabled = !!testModeEnabled;
  testModeToggle.setAttribute('data-state', isEnabled ? 'on' : 'off');
  const label = testModeToggle.querySelector('.toggle-label');
  if (label) {
    label.textContent = isEnabled ? 'ON' : 'OFF';
  }

  // Estado agora vem do backend (salvo no banco de dados)
  // Não usa mais localStorage

  // Habilitar/desabilitar botão "Iniciar teste agora"
  testNowBtn.disabled = !testModeEnabled;
}


// Utilitário simples de data/hora
function formatDateTime(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// Estatísticas de KH
function computeStats(measures) {
  if (!measures || !measures.length) return null;

  const khs = measures
    .map((m) => m.kh)
    .filter((k) => typeof k === 'number');

  if (!khs.length) return null;

  const last = khs[0];
  const prev = khs[1] ?? null;

  // desvio em relação ao alvo
  const diff = (typeof currentKhTarget === 'number' && currentKhTarget > 0)
    ? last - currentKhTarget
    : 0;


  const min = Math.min(...khs);
  const max = Math.max(...khs);

  return { last, prev, diff, min, max };
}

// Atualiza os textos e estilos do card principal de KH
function updateKhCard(measures) {
  const stats = computeStats(measures);
  if (stats) {
    khValueEl.textContent = stats.last.toFixed(2);

    if (stats.prev !== null) {
      khPrevEl.textContent = stats.prev.toFixed(2);
      const diffText = stats.diff.toFixed(2) + ' dKH';
      khDiffEl.textContent = diffText;
      if (stats.diff > 0) {
        khDiffEl.className = 'kh-diff positive';
      } else if (stats.diff < 0) {
        khDiffEl.className = 'kh-diff negative';
      } else {
        khDiffEl.className = 'kh-diff muted';
      }
    } else {
      khPrevEl.textContent = '--';
      khDiffEl.textContent = '0.00 dKH';
      khDiffEl.className = 'kh-diff muted';
    }

    khMinEl.textContent = stats.min.toFixed(2);
    khMaxEl.textContent = stats.max.toFixed(2);
  } else {
    khValueEl.textContent = '--';
    khPrevEl.textContent = '--';
    khDiffEl.textContent = 'Sem dados';
    khDiffEl.className = 'kh-diff muted';
    khMinEl.textContent = '--';
    khMaxEl.textContent = '--';
  }
}

function formatMetricWindow(labelEl, metric, khTarget) {
  if (!metric) {
    labelEl.textContent = '--';
    labelEl.className = 'kh-window neutral';
    return;
  }

  const maxPos = metric.maxPositiveDeviation;
  const maxNeg = metric.maxNegativeDeviation;

  // maior desvio absoluto
  const worst = Math.abs(maxPos) >= Math.abs(maxNeg) ? maxPos : maxNeg;

  labelEl.textContent = `${worst >= 0 ? '+' : ''}${worst.toFixed(2)} dKH`;

  if (Math.abs(worst) <= 0.2) {
    labelEl.className = 'kh-window ok';
  } else if (Math.abs(worst) <= 0.5) {
    labelEl.className = 'kh-window warn';
  } else {
    labelEl.className = 'kh-window alert';
  }
}


function updateStatusFromKh(kh, khTarget) {
  if (typeof kh !== 'number' || typeof khTarget !== 'number' || khTarget <= 0) {
    statusPhEl.textContent = '--';
    statusPhEl.className = 'status-badge off';
    return;
  }

  const delta = Math.abs(kh - khTarget);

  const greenMax  = typeof khHealthGreenMaxDev  === 'number' && khHealthGreenMaxDev  > 0
    ? khHealthGreenMaxDev
    : 0.2;
  const yellowMax = typeof khHealthYellowMaxDev === 'number' && khHealthYellowMaxDev > 0
    ? khHealthYellowMaxDev
    : 0.5;

  // 1) Número de saúde: % do alvo, simétrico
  let pct = 100 - (Math.abs(kh - khTarget) / khTarget) * 100;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  const intPct = Math.round(pct);
  statusPhEl.textContent = `${intPct}%`;

  // 2) Cor continua baseada no desvio absoluto
  if (delta <= greenMax) {
    statusPhEl.className = 'status-badge good';
  } else if (delta <= yellowMax) {
    statusPhEl.className = 'status-badge warn';
  } else {
    statusPhEl.className = 'status-badge bad';
  }
}

const khBufferCard = document.getElementById('khBufferCard'); // div do card

if (khBufferCard) {
  khBufferCard.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    const newState = !khAutoEnabled;
    try {
      const res = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
        {
          method: 'PUT',
          body: JSON.stringify({ khAutoEnabled: newState }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) return;

      khAutoEnabled = newState;
      if (statusBufferEl) {
        statusBufferEl.textContent = khAutoEnabled ? 'ON' : 'OFF';
        statusBufferEl.className = khAutoEnabled
          ? 'status-badge on'
          : 'status-badge off';
      }
    } catch (err) {
      console.error('toggle khAutoEnabled error', err);
    }
  });
}


// Popular tabela de medições e campos de horário
function updateMeasurementsView(measures) {
  measurementsBody.innerHTML = '';

  if (!measures || !measures.length) {
    lastCountInfo.textContent = 'Nenhum dado de medição';
    lastMeasureTimeEl.textContent = 'Nenhum teste realizado ainda';
    nextMeasureTimeEl.textContent = '--';
    updateKhCard([]);
    updateStatusFromKh(undefined, currentKhTarget);
    return;
  }

  lastCountInfo.textContent = `${measures.length} registros recentes`;

  // Tabela (continua mostrando até 30 registros mais recentes)
  measures.slice(0, 30).forEach((m) => {
    const tr = document.createElement('tr');

    const tempText =
      typeof m.temperature === 'number'
        ? m.temperature.toFixed(1)
        : (m.temperature ?? '--');

    const khValue =
      typeof m.kh === 'number'
        ? m.kh
        : (m.kh != null ? Number(m.kh) : null);

    let arrow = '';
    let trendClass = 'kh-trend equal';

    if (
      khValue != null &&
      !Number.isNaN(khValue) &&
      currentKhTarget != null &&
      !Number.isNaN(currentKhTarget)
    ) {
      if (khValue > currentKhTarget + 0.01) {
        arrow = '▲';
        trendClass = 'kh-trend up';
      } else if (khValue < currentKhTarget - 0.01) {
        arrow = '▼';
        trendClass = 'kh-trend down';
      } else {
        arrow = '◆';
        trendClass = 'kh-trend equal';
      }
    }

    tr.innerHTML = `
      <td>${formatDateTime(m.timestamp)}</td>
      <td class="${trendClass}">${arrow}</td>
      <td>${
        khValue != null && !Number.isNaN(khValue)
          ? khValue.toFixed(2)
          : (m.kh ?? '--')
      }</td>
      <td>${tempText}</td>
      <td>${m.status ?? '--'}</td>
    `;

    measurementsBody.appendChild(tr);
  });

  // -------- Janela de 24h para min/máx e desvio --------
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const measures24h = measures.filter((m) => {
    const ts =
      typeof m.timestamp === 'number'
        ? m.timestamp
        : Date.parse(m.timestamp);
    return ts && (now - ts) <= DAY_MS;
  });

  // Usa 24h se tiver dado, senão cai para o conjunto completo
  const windowMeasures = measures24h.length ? measures24h : measures;

  // Atualiza card principal (valor atual, anterior, desvio, min/max)
  updateKhCard(windowMeasures);

  // Horários (última medição continua sendo a mais recente da lista completa)
  const lastTs = measures[0].timestamp;
  lastMeasureTimeEl.textContent = lastTs
    ? formatDateTime(lastTs)
    : 'Nenhum teste realizado ainda';

  // Estimativa simples: +1h a partir do último TS, se houver
  if (lastTs) {
    const nextTs = lastTs + 60 * 60 * 1000;
    nextMeasureTimeEl.textContent = formatDateTime(nextTs);
  } else {
    nextMeasureTimeEl.textContent = '--';
  }

  // Calibração ainda será plugada por API futura
  calibrationDateEl.textContent = '--';

  // Status (100%, amarelo, vermelho) também baseado na janela 24h
  const stats = computeStats(windowMeasures);
  if (
    stats &&
    typeof stats.last === 'number' &&
    typeof currentKhTarget === 'number'
  ) {
    updateStatusFromKh(stats.last, currentKhTarget);
  } else {
    updateStatusFromKh(undefined, currentKhTarget);
  }

  // [FIX] Atualizar indicadores de sanity checks
  updateSanityChecks(measures);

  // [FIX] Carregar último alerta
  loadLastAlert();
}

// [FIX] ===== FUNÇÕES DE SANITY CHECKS =====

function updateSanityChecks(measures) {
  if (!measures || measures.length === 0) {
    setStatus(statusFlowRateEl, '-- mL/s', 'neutral');
    setStatus(statusPHRangeEl, '--', 'neutral');
    setStatus(statusTempRangeEl, '--', 'neutral');
    return;
  }

  // Pegar última medição
  const last = measures[0];

  // Validar vazão (aqui seria ideal ter dados de vazão, mas vamos mostrar "OK" se houver medição recente)
  // Como não temos mlps nos measurements, vamos apenas indicar se há medições
  setStatus(statusFlowRateEl, 'N/A', 'neutral');

  // Validar pH (phref ou phsample)
  const ph = last.phref || last.phsample;
  if (typeof ph === 'number') {
    if (ph >= 6.0 && ph <= 9.0) {
      setStatus(statusPHRangeEl, `${ph.toFixed(2)} ✓`, 'ok');
    } else if (ph < 6.0) {
      setStatus(statusPHRangeEl, `${ph.toFixed(2)} ⚠️`, 'warn');
    } else {
      setStatus(statusPHRangeEl, `${ph.toFixed(2)} ⚠️`, 'warn');
    }
  } else {
    setStatus(statusPHRangeEl, '--', 'neutral');
  }

  // Validar temperatura
  const temp = last.temperature;
  if (typeof temp === 'number') {
    if (temp >= 15.0 && temp <= 35.0) {
      setStatus(statusTempRangeEl, `${temp.toFixed(1)}°C ✓`, 'ok');
    } else {
      setStatus(statusTempRangeEl, `${temp.toFixed(1)}°C ⚠️`, 'alert');
    }
  } else {
    setStatus(statusTempRangeEl, '--', 'neutral');
  }
}

function setStatus(element, text, statusClass) {
  if (!element) return;
  element.textContent = text;
  element.className = 'status-badge ' + statusClass;
}

async function loadLastAlert() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId || !lastAlertTextEl) return;

  try {
    const res = await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceId)}/alerts?limit=1`);
    const json = await res.json();
    if (!json.success || !json.data.alerts || json.data.alerts.length === 0) {
      lastAlertTextEl.textContent = 'Nenhum alerta recente';
      return;
    }

    const alert = json.data.alerts[0];
    const emoji = { low: 'ℹ️', medium: '⚠️', high: '🚨', critical: '🔴' }[alert.severity] || '⚠️';
    lastAlertTextEl.innerHTML = `${emoji} <strong>${alert.type}:</strong> ${alert.message}`;
  } catch (err) {
    console.error('loadLastAlert error', err);
  }
}

// [FIX] ===== FIM SANITY CHECKS =====



// Carrega medições para o device atualmente selecionado no topo
async function loadMeasurementsForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    lastCountInfo.textContent = 'Nenhum dispositivo associado';
    updateMeasurementsView([]);
    return;
  }

  try {

    // 1) Primeiro carrega KH target/config
    await loadKhInfo(deviceId);

    // 2) Depois metrics (se quiser manter aqui)
    await loadKhMetrics(deviceId);

    // 3) Por fim, medições (vai usar currentKhTarget já setado)
    
    const res = await apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements`, {
    });

    const json = await res.json();
    if (!json.success) {
      console.error(json.message || 'Erro ao buscar medições');
      lastCountInfo.textContent = 'Erro ao carregar medições';
      updateMeasurementsView([]);
      return;
    }

    const measures = json.data || [];
    updateMeasurementsView(measures);
  } catch (err) {
    console.error('loadMeasurementsForSelected error', err);
    lastCountInfo.textContent = 'Erro de comunicação ao carregar medições';
    updateMeasurementsView([]);
  }
}

async function loadKhMetrics(deviceId) {
  try {
    const resp = await apiFetch(`/api/v1/user/devices/${deviceId}/kh-metrics`, {
    });
    if (!resp.ok) {
      console.error('Erro ao buscar KH metrics', await resp.text());
      return;
    }
    const json = await resp.json();
    if (!json.success) {
      console.error('KH metrics falhou', json.message);
      return;
    }

    let { khTarget, metrics, avgCycleMs } = json.data || {};


    if (khTarget != null) {
      khTarget = typeof khTarget === 'number' ? khTarget : parseFloat(khTarget);
      if (Number.isNaN(khTarget)) khTarget = null;
    }

    if (khTargetSpan) {
      khTargetSpan.textContent = khTarget != null ? khTarget.toFixed(2) : '--';
    }

    if (typeof avgCycleMs === 'number' && Number.isFinite(avgCycleMs) && avgCycleMs > 0) {
      testNowTotalMs = avgCycleMs;
    } else {
      testNowTotalMs = 8 * 60 * 1000;
    }

    formatMetricWindow(kh24hSpan, metrics['24h'], khTarget);
    formatMetricWindow(kh3dSpan, metrics['3d'], khTarget);
    formatMetricWindow(kh7dSpan, metrics['7d'], khTarget);
    formatMetricWindow(kh15dSpan, metrics['15d'], khTarget);
  } catch (err) {
    console.error('loadKhMetrics error', err);
  }
}


let khHealthGreenMaxDev = null;
let khHealthYellowMaxDev = null;
let khAutoEnabled = false;


async function loadKhInfo(deviceId) {
  try {
    const [khConfigResp, statusResp] = await Promise.all([
      apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`),
      apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/status`)
    ]);

    const json = await khConfigResp.json();
    if (!khConfigResp.ok || !json.success) {
      console.error('Erro ao carregar KH config na tela principal', json.message || json.error);
      return;
    }

    const data = json.data || {};

    // Carregar intervalHours do status
    if (statusResp.ok) {
      const statusJson = await statusResp.json();
      if (statusJson.success && statusJson.data) {
        const intervalHours = statusJson.data.intervalHours;
        if (typeof intervalHours === 'number' && intervalRange) {
          intervalRange.value = intervalHours;
          updateIntervalLabel(intervalHours);
        }
      }
    }

    if (DashboardCommon && typeof DashboardCommon.setLcdStatus === 'function') {
      DashboardCommon.setLcdStatus(data.lcdStatus);
    }

    const khTarget = typeof data.khTarget === 'number'
      ? data.khTarget
      : (data.khTarget != null ? parseFloat(data.khTarget) : null);
    const khReference = typeof data.khReference === 'number'
      ? data.khReference
      : (data.khReference != null ? parseFloat(data.khReference) : null);

    khHealthGreenMaxDev = typeof data.khHealthGreenMaxDev === 'number'
      ? data.khHealthGreenMaxDev
      : (data.khHealthGreenMaxDev != null ? parseFloat(data.khHealthGreenMaxDev) : null);

    khHealthYellowMaxDev = typeof data.khHealthYellowMaxDev === 'number'
      ? data.khHealthYellowMaxDev
      : (data.khHealthYellowMaxDev != null ? parseFloat(data.khHealthYellowMaxDev) : null);

    khAutoEnabled = !!data.khAutoEnabled;

    // atualizar visual do card KH Buffer
    if (statusBufferEl) {
      statusBufferEl.textContent = khAutoEnabled ? 'ON' : 'OFF';
      statusBufferEl.className = khAutoEnabled
        ? 'status-badge on'
        : 'status-badge off';
    }

    // Aplicar estado do test_mode do backend (estado real do ESP32)
    const testModeEnabled = !!data.testMode;
    applyTestModeUI(testModeEnabled);

    if (typeof data.pump4MlPerSec === 'number') {
      pump4MlPerSec = data.pump4MlPerSec;
    } else if (data.pump4MlPerSec != null) {
      const v = parseFloat(data.pump4MlPerSec);
      pump4MlPerSec = Number.isNaN(v) ? null : v;
    } else {
      pump4MlPerSec = null;
    }

    if (pump4RateSpan) {
      pump4RateSpan.textContent =
        pump4MlPerSec != null
          ? `${pump4MlPerSec.toFixed(2)} mL/s`
          : '-- mL/s';
    }
    

    currentKhTarget = (khTarget != null && !Number.isNaN(khTarget))
      ? khTarget
      : null;

    if (khTargetSpan) {
      khTargetSpan.textContent =
        khTarget != null && !Number.isNaN(khTarget)
          ? khTarget.toFixed(2)
          : '--';
    }
    if (khRefSpan) {
      khRefSpan.textContent =
        khReference != null && !Number.isNaN(khReference)
          ? `ref: ${khReference.toFixed(2)}`
          : 'ref: --';
    }

/*  // Label de calibração + trava/libera botão Teste agora
  if (khCalibrationLabel && testNowBtn) {
    if (khReference != null && !Number.isNaN(khReference)) {
      khCalibrationLabel.textContent =
        `Calibração: OK (${khReference.toFixed(2)} dKH)`;
      testNowBtn.disabled = false;
      testNowBtn.title = '';
    } else {
      khCalibrationLabel.textContent = 'Calibração: necessária';
      testNowBtn.disabled = true;
      testNowBtn.title =
        'Calibre o KH em Configurações → Calibração de KH antes de iniciar testes.';
    }
  }
*/
    if (khCalibrationLabel && testNowBtn) {
      if (khReference != null && !Number.isNaN(khReference)) {
        khCalibrationLabel.textContent =
          `Calibração: OK (${khReference.toFixed(2)} dKH)`;
      } else {
        khCalibrationLabel.textContent = 'Calibração: --';
      }

      // botão sempre liberado
      testNowBtn.disabled = false;
      testNowBtn.title = '';
    }
      

  } catch (err) {
    console.error('loadKhInfo error', err);
  }
}

async function apiTestNow(deviceId) {
  const res = await apiFetch(
    `/api/v1/user/devices/${encodeURIComponent(deviceId)}/test-now`,
    { method: 'POST' }
  );
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Erro ao acionar testnow');
  }
  return json.data; // opcionalmente usa commandId depois
}



if (testModeToggle) {
  // Estado é carregado do backend via loadKhInfo() ao trocar device
  testModeToggle.addEventListener('click', async (e) => {
    const currentState = testModeToggle.getAttribute('data-state');
    const enabled = currentState !== 'on'; // Alterna o estado
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    try {
      await apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/test-mode`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
      applyTestModeUI(enabled);
    } catch (err) {
      console.error('test_mode error', err);
    }
  });
}

if (testNowBtn) {
  testNowBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    try {
      // 1) dispara endpoint dedicado (fila com type = 'testnow')
      await apiTestNow(deviceId);

      // 2) inicia barra de 5 etapas local
      startTestNowProgress();

      // 3) opcional: já força um refresh inicial
      await loadMeasurementsForSelected();
    } catch (err) {
      console.error('testnow command error', err);
      alert('Erro ao iniciar teste agora: ' + (err.message || 'falha desconhecida'));
    }
  });
}

if (applyDoseBtn) {
  applyDoseBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    const volumeStr = doseVolumeInput ? doseVolumeInput.value : '';
    const volume = parseFloat(volumeStr);
    if (!volume || Number.isNaN(volume) || volume <= 0) {
      alert('Informe um volume válido em mL.');
      return;
    }

    const effectivePump4 =
      pump4MlPerSec && pump4MlPerSec > 0 ? pump4MlPerSec : 0.8;
    const seconds = volume / effectivePump4;
    const totalMs = seconds * 1000;

    try {
      await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'khcorrection',
            value: volume, // <<< AQUI, não params
          }),
        }
      );

      startDoseProgress(totalMs);
    } catch (err) {
      console.error('khcorrection command error', err);
    }
  });
}



if (abortBtn) {
  abortBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    try {
      await apiFetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`, {
        method: 'POST',
        body: JSON.stringify({ type: 'abort' }),
      });

      stopTestNowProgress(true);
      stopDoseProgress(true);
    } catch (err) {
      console.error('abort command error', err);
      // em caso de erro, ainda assim paramos visualmente para não deixar a UI travada
      stopTestNowProgress(true);
      stopDoseProgress(true);
    }
  });
}

if (pump4CalibBtn) {
  pump4CalibBtn.addEventListener('click', async () => {
    const deviceId = DashboardCommon.getSelectedDeviceId();
    if (!deviceId) return;

    try {
      await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/command`,
        {
          method: 'POST',
          body: JSON.stringify({ type: 'pump4calibrate' }),
        }
      );

      // Inicia barra regressiva local de 60s
      startPump4CalibProgress();
    } catch (err) {
      console.error('pump4calibrate command error', err);
    }
  });
}


async function initDashboardMain() {
  await DashboardCommon.initTopbar();

  const dosingBtn = document.getElementById('dosingBtn');
  if (dosingBtn) {
    dosingBtn.addEventListener('click', () => {
      window.location.href = 'dashboard-dosing.html';
    });
  }

  // Inicializar label do intervalo
  if (intervalRange) {
    updateIntervalLabel(intervalRange.value);
  }

  const devs = await DashboardCommon.loadDevicesCommon(); // usa a global
  if (!devs.length) {
    lastCountInfo.textContent = 'Nenhum dispositivo associado';
    updateMeasurementsView([]);
    return;
  }

  await loadMeasurementsForSelected();
}

// Quando o DOM estiver pronto, inicializa
document.addEventListener('DOMContentLoaded', initDashboardMain);

// Reage à troca de device no topo
window.addEventListener('deviceChanged', async () => {
  await loadMeasurementsForSelected();
});

