// dashboard-graficos.js

const chartInfo = document.getElementById('chartInfo');
let khDailyChart = null;
let khWeeklyChart = null;
let khMonthlyChart = null;

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

    // ===== GRÁFICO 1: ÚLTIMAS 24 HORAS COM TIMESTAMP =====
    if (dailyCtx && last24h.length) {
      const labels = last24h.map((d) => formatDate(d.timestamp));
      const data = last24h.map((d) => d.kh);
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

async function initDashboardGraficos() {
  await DashboardCommon.initTopbar();
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
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardGraficos().catch((err) =>
    console.error('initDashboardGraficos error', err),
  );
});

// Se quiser atualizar ao trocar de device, descomente:
/*
window.addEventListener('deviceChanged', () => {
  loadSeriesForSelected();
});
*/
