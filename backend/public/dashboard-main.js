// dashboard-main.js

// Garante que existe token mínimo; redireciona cedo se não houver
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'login';
}

const headersAuth = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
};

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
  const diff = prev !== null ? last - prev : 0;

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

// Score simples de “saúde do KH” baseado no último valor
function updateStatusFromKh(kh) {
  if (typeof kh !== 'number') {
    statusPhEl.textContent = '--';
    statusPhEl.className = 'status-badge off';
    return;
  }

  // 100 entre 7.5 e 8.5, cai linearmente fora
  let score = 100 - Math.abs(kh - 8.0) * 40;
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  statusPhEl.textContent = Math.round(score);
  statusPhEl.className = 'status-badge';
}

// Popular tabela de medições e campos de horário
function updateMeasurementsView(measures) {
  measurementsBody.innerHTML = '';

  if (!measures || !measures.length) {
    lastCountInfo.textContent = 'Nenhum dado de medição';
    lastMeasureTimeEl.textContent = 'Nenhum teste realizado ainda';
    nextMeasureTimeEl.textContent = '--';
    updateKhCard([]);
    updateStatusFromKh(undefined);
    return;
  }

  lastCountInfo.textContent = `${measures.length} registros recentes`;

  measures.slice(0, 30).forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDateTime(m.timestamp)}</td>
      <td>${typeof m.kh === 'number' ? m.kh.toFixed(2) : (m.kh ?? '--')}</td>
      <td>${m.phref ?? '--'}</td>
      <td>${m.phsample ?? '--'}</td>
      <td>${m.temperature ?? '--'}</td>
      <td>${m.status ?? '--'}</td>
    `;
    measurementsBody.appendChild(tr);
  });

  // Estatísticas e horários
  updateKhCard(measures);

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

  const stats = computeStats(measures);
  if (stats && typeof stats.last === 'number') {
    updateStatusFromKh(stats.last);
  } else {
    updateStatusFromKh(undefined);
  }
}

// Carrega medições para o device atualmente selecionado no topo
async function loadMeasurementsForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    lastCountInfo.textContent = 'Nenhum dispositivo associado';
    updateMeasurementsView([]);
    return;
  }

  try {
    const res = await fetch(`/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements`, {
      headers: { Authorization: `Bearer ${token}` },
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

// Inicialização da página principal
async function initDashboardMain() {
  await DashboardCommon.initTopbar();

  // Se não houver devices, já para por aqui
  const devs = await DashboardCommon.loadDevicesCommon();
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
