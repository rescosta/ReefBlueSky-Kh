// dashboard-graficos.js

const chartInfo = document.getElementById('chartInfo');
let khDailyChart = null;
let khWeeklyChart = null;
let khMonthlyChart = null;

// [FIX] Variáveis para gráficos de Temperatura
const tempChartInfo = document.getElementById('tempChartInfo');
let tempDailyChart = null;
let tempWeeklyChart = null;
let tempMonthlyChart = null;

function formatDate(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDateFull(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('pt-BR');
}

// ===== FUNÇÃO PARA ÚLTIMAS 24 HORAS (SEM AGRUPAR) =====
// Pega todas as medições das últimas 24 horas sem agrupar por dia
function getLast24Hours(measures) {
  const now = Date.now();
  const last24hMs = 24 * 60 * 60 * 1000;
  
  // Filtra medições das últimas 24 horas
  const filtered = measures
    .filter((m) => {
      if (typeof m.kh !== 'number' || !m.timestamp) return false;
      const ts = Number(m.timestamp);
      return ts > now - last24hMs && ts <= now;
    })
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  
  return filtered.map((m) => ({
    timestamp: Number(m.timestamp),
    kh: m.kh,
  }));
}

// Agrupa medições por dia (chave yyyy-mm-dd) pegando o último KH do dia
function groupByDay(measures) {
  const byDay = new Map();
  measures.forEach((m) => {
    if (typeof m.kh !== 'number' || !m.timestamp) return;
    const d = new Date(m.timestamp);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0, 10); // yyyy-mm-dd
    // usa sempre a última medição do dia (maior timestamp)
    const prev = byDay.get(key);
    if (!prev || m.timestamp > prev.timestamp) {
      byDay.set(key, { timestamp: m.timestamp, kh: m.kh });
    }
  });

  // ordena por data crescente
  const entries = Array.from(byDay.entries()).sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0,
  );
  return entries.map(([key, v]) => ({
    dateStr: key,
    ts: v.timestamp,
    kh: v.kh,
  }));
}

// Cria ou recria um gráfico de barras simples
function createBarChart(existingChart, ctx, label, labels, data, color) {
  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          backgroundColor: color,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          min: 4,
          max: 14,
          ticks: {
            stepSize: 0.5,
            color: '#9ca3af',
          },
          grid: {
            color: '#1f2937',
          },
        },
        x: {
          ticks: {
            color: '#9ca3af',
          },
          grid: {
            color: '#1f2937',
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#e5e7eb',
          },
        },
      },
    },
  });
}

async function loadSeriesForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) {
    if (chartInfo) {
      chartInfo.textContent = 'Nenhum dispositivo associado.';
    }
    return;
  }

  const now = Date.now();
  const from30d = now - 30 * 24 * 60 * 60 * 1000;
  const url = `/api/v1/user/devices/${encodeURIComponent(
    deviceId,
  )}/measurements?from=${from30d}&to=${now}`;

  try {
    const res = await apiFetch(url);
    const json = await res.json();
    if (!json.success) {
      console.error(json.message || 'Erro ao buscar dados de gráfico');
      if (chartInfo) {
        chartInfo.textContent = 'Erro ao carregar dados de gráfico.';
      }
      return;
    }

    const measures = json.data || [];
    if (!measures.length) {
      if (chartInfo) {
        chartInfo.textContent = 'Nenhuma medição nos últimos 30 dias.';
      }
      return;
    }

    // ===== GRÁFICO DIÁRIO: ÚLTIMAS 24 HORAS (SEM AGRUPAR) =====
    const last24h = measures
      .filter(m => typeof m.kh === 'number' && m.timestamp)
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-48)               // últimas 48 medições, por exemplo
      .map(m => ({ timestamp: Number(m.timestamp), kh: m.kh }));


    // ===== GRÁFICOS SEMANAIS E MENSAIS: AGRUPADOS POR DIA =====
    const byDay = groupByDay(measures);
    const last30 = byDay.slice(-30);
    const last7 = byDay.slice(-7);

    const dailyCtx = document.getElementById('khDailyChart')?.getContext('2d');
    const weeklyCtx = document.getElementById('khWeeklyChart')?.getContext('2d');
    const monthlyCtx = document.getElementById('khMonthlyChart')?.getContext('2d');

    // ===== GRÁFICO 1: ÚLTIMAS 24 HORAS (N MEDIÇÕES REAIS) =====
    if (dailyCtx && last24h.length) {
      // pega no máximo as últimas 24 medições reais
      const lastPoints = last24h.slice(-24);

      const labels = lastPoints.map((d) => formatDate(d.timestamp));
      const data   = lastPoints.map((d) => d.kh);

      khDailyChart = createBarChart(
        khDailyChart,
        dailyCtx,
        'KH últimas 24 horas',
        labels,
        data,
        '#60a5fa',
      );
    }


    // ===== GRÁFICO 2: ÚLTIMOS 7 DIAS (AGRUPADO) =====
    if (weeklyCtx && last7.length) {
      const labels = last7.map((d) => formatDateFull(d.ts));
      const data = last7.map((d) => d.kh);
      khWeeklyChart = createBarChart(
        khWeeklyChart,
        weeklyCtx,
        'KH semanal (últimos 7 dias)',
        labels,
        data,
        '#a855f7',
      );
    }

    // ===== GRÁFICO 3: ÚLTIMOS 30 DIAS (AGRUPADO) =====
    if (monthlyCtx && last30.length) {
      const labels = last30.map((d) => formatDateFull(d.ts));
      const data = last30.map((d) => d.kh);
      khMonthlyChart = createBarChart(
        khMonthlyChart,
        monthlyCtx,
        'KH mensal (últimos 30 dias)',
        labels,
        data,
        '#22c55e',
      );
    }

    if (chartInfo) {
      chartInfo.textContent = `Últimas 24h: ${last24h.length} medições | Últimos 7 dias: ${last7.length} dias | Últimos 30 dias: ${last30.length} dias`;
    }
  } catch (err) {
    console.error('loadSeriesForSelected error', err);
    if (chartInfo) {
      chartInfo.textContent = 'Erro de comunicação ao carregar dados.';
    }
  }
}

// [FIX] ===== FUNÇÕES PARA GRÁFICOS DE TEMPERATURA =====

function createTempChart(existingChart, ctx, label, labels, data, color) {
  if (existingChart) {
    existingChart.destroy();
  }

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label,
          data,
          borderColor: color,
          backgroundColor: `${color}33`,
          tension: 0.3,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          min: 15,
          max: 35,
          ticks: {
            stepSize: 2,
            color: '#9ca3af',
            callback: function(value) {
              return value + '°C';
            },
          },
          grid: {
            color: '#1f2937',
          },
        },
        x: {
          ticks: {
            color: '#9ca3af',
          },
          grid: {
            color: '#1f2937',
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#e5e7eb',
          },
        },
      },
    },
  });
}

async function loadTempSeriesForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (!deviceId) {
    if (tempChartInfo) tempChartInfo.textContent = 'Nenhum dispositivo associado.';
    return;
  }

  const now = Date.now();
  const from30d = now - 30 * 24 * 60 * 60 * 1000;
  const url = `/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements?from=${from30d}&to=${now}`;

  try {
    const res = await apiFetch(url);
    const json = await res.json();
    if (!json.success) {
      if (tempChartInfo) tempChartInfo.textContent = 'Erro ao carregar dados de temperatura.';
      return;
    }

    const measures = json.data || [];
    if (!measures.length) {
      if (tempChartInfo) tempChartInfo.textContent = 'Nenhuma medição de temperatura nos últimos 30 dias.';
      return;
    }

    // Filtrar medições com temperatura
    const tempMeasures = measures.filter(m => typeof m.temperature === 'number' && m.timestamp);

    // Últimas 24h
    const last24h = tempMeasures
      .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
      .slice(-48)
      .map(m => ({ timestamp: Number(m.timestamp), temperature: m.temperature }));

    // Agrupados por dia
    const byDay = new Map();
    tempMeasures.forEach(m => {
      const d = new Date(m.timestamp);
      if (Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      const prev = byDay.get(key);
      if (!prev || m.timestamp > prev.timestamp) {
        byDay.set(key, { timestamp: m.timestamp, temperature: m.temperature });
      }
    });

    const entries = Array.from(byDay.entries()).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    const byDayData = entries.map(([key, v]) => ({
      dateStr: key,
      ts: v.timestamp,
      temperature: v.temperature,
    }));

    const last30 = byDayData.slice(-30);
    const last7 = byDayData.slice(-7);

    // Gráfico Diário
    const tempDailyCtx = document.getElementById('tempDailyChart')?.getContext('2d');
    if (tempDailyCtx && last24h.length) {
      const lastPoints = last24h.slice(-24);
      const labels = lastPoints.map(d => formatDate(d.timestamp));
      const data = lastPoints.map(d => d.temperature);
      tempDailyChart = createTempChart(tempDailyChart, tempDailyCtx, 'Temperatura (24h)', labels, data, '#f59e0b');
    }

    // Gráfico Semanal
    const tempWeeklyCtx = document.getElementById('tempWeeklyChart')?.getContext('2d');
    if (tempWeeklyCtx && last7.length) {
      const labels = last7.map(d => formatDateFull(d.ts));
      const data = last7.map(d => d.temperature);
      tempWeeklyChart = createTempChart(tempWeeklyChart, tempWeeklyCtx, 'Temperatura (7 dias)', labels, data, '#f59e0b');
    }

    // Gráfico Mensal
    const tempMonthlyCtx = document.getElementById('tempMonthlyChart')?.getContext('2d');
    if (tempMonthlyCtx && last30.length) {
      const labels = last30.map(d => formatDateFull(d.ts));
      const data = last30.map(d => d.temperature);
      tempMonthlyChart = createTempChart(tempMonthlyChart, tempMonthlyCtx, 'Temperatura (30 dias)', labels, data, '#f59e0b');
    }

    if (tempChartInfo) {
      tempChartInfo.textContent = `Temperatura - Últimas 24h: ${last24h.length} medições | Últimos 7 dias: ${last7.length} dias | Últimos 30 dias: ${last30.length} dias`;
    }
  } catch (err) {
    console.error('loadTempSeriesForSelected error', err);
    if (tempChartInfo) tempChartInfo.textContent = 'Erro ao carregar dados de temperatura.';
  }
}

// [FIX] ===== FIM FUNÇÕES pH E TEMPERATURA =====

async function initDashboardGraficos() {
  await DashboardCommon.initTopbar();

  const dosingBtn = document.getElementById('dosingBtn');
  if (dosingBtn) {
    dosingBtn.addEventListener('click', () => {
      window.location.href = 'dashboard-dosing.html';
    });
  }

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    if (chartInfo) {
      chartInfo.textContent = 'Nenhum dispositivo associado.';
    }
    return;
  }

  const deviceId = DashboardCommon.getSelectedDeviceId();
  if (deviceId) {
    try {
      const resp = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(deviceId)}/kh-config`,
      );
      const json = await resp.json();
      if (
        resp.ok &&
        json.success &&
        json.data &&
        typeof DashboardCommon.setLcdStatus === 'function'
      ) {
        DashboardCommon.setLcdStatus(json.data.lcdStatus);
      }
    } catch (e) {
      console.error('Erro ao carregar lcdStatus na tela Gráficos', e);
    }
  }

  await loadSeriesForSelected();
  await loadTempSeriesForSelected();    // [FIX] Carregar gráficos de temperatura
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardGraficos().catch((err) =>
    console.error('initDashboardGraficos error', err),
  );
});

// [FIX] Atualizar todos os gráficos ao trocar de device
window.addEventListener('deviceChanged', () => {
  loadSeriesForSelected();
  loadTempSeriesForSelected();
});
