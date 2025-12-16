// dashboard-graficos.js

const chartsToken = localStorage.getItem('token');
if (!chartsToken) {
  window.location.href = 'login';
}

const periodSelect = document.getElementById('periodSelect');
const fromInput = document.getElementById('fromInput');
const toInput = document.getElementById('toInput');
const loadChartBtn = document.getElementById('loadChartBtn');
const chartInfo = document.getElementById('chartInfo');
const chartPlaceholder = document.getElementById('chartPlaceholder');

let khChart = null;


function formatDateTime(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function dateTimeLocalToMs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

// Define from/to com base no período rápido
function applyQuickPeriod() {
  const now = new Date();
  let from = new Date(now.getTime());

  const value = periodSelect.value;
  if (value === '1h') {
    from.setHours(now.getHours() - 1);
  } else if (value === '24h') {
    from.setDate(now.getDate() - 1);
  } else if (value === '7d') {
    from.setDate(now.getDate() - 7);
  }

  const toLocal = now.toISOString().slice(0, 16);
  const fromLocal = from.toISOString().slice(0, 16);
  toInput.value = toLocal;
  fromInput.value = fromLocal;
}

function renderSeries(measures) {
  const canvas = document.getElementById('khChart');
  if (!canvas) {
    console.error('khChart canvas não encontrado');
    return;
  }
  const ctx = canvas.getContext('2d');

  if (!measures || !measures.length) {
    chartInfo.textContent = 'Nenhum dado encontrado para o período.';
    chartPlaceholder.textContent =
      'Nenhum ponto no intervalo selecionado.\n\n' +
      'Ajuste o período ou aguarde novas medições.';

    if (khChart) {
      khChart.destroy();
      khChart = null;
    }
    return;
  }

  chartInfo.textContent = `${measures.length} medições no intervalo.`;

  const points = measures
    .filter((m) => typeof m.kh === 'number' && m.timestamp)
    .map((m) => ({
      x: new Date(m.timestamp),
      y: m.kh,
    }))
    .sort((a, b) => a.x - b.x);  // ordena do mais antigo para o mais novo



  chartPlaceholder.textContent =
    'Primeiros pontos de KH (x=Data/hora, y=KH):\n\n' +
    points
      .slice(0, 10)
      .map((p) => `${formatDateTime(p.x.getTime())}  →  ${p.y.toFixed(2)} dKH`)
      .join('\n');

  if (khChart) {
    khChart.destroy();
    khChart = null;
  }

  khChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'KH (dKH)',
          data: points,
          borderColor: '#60a5fa',
          backgroundColor: '#60a5fa',
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 4,
          borderWidth: 2,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: {
          type: 'time',
          time: { unit: 'hour' },
          ticks: { color: '#9ca3af' },
          grid: { color: '#1f2937' },
        },
        y: {
          type: 'linear',     // <-- garante escala linear
          min: 4,
          max: 14,
          title: {
            display: true,
            text: 'dKH',
          },
          ticks: {
            color: '#9ca3af',
            stepSize: 1,      // opcional: marcações 4,5,6,7...
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
        tooltip: {
          callbacks: {
            title: (items) => {
              const v = items[0].parsed.x;
              return formatDateTime(v);
            },
            label: (ctx) => {
              const v = ctx.parsed.y;
              return `KH: ${v.toFixed(2)} dKH`;
            },
          },
        },
      },
    },
  });
}

async function loadSeriesForSelected() {
  const deviceId = DashboardCommon.getSelectedDeviceIdOrAlert();
  if (!deviceId) {
    chartInfo.textContent = 'Nenhum dispositivo associado.';
    chartPlaceholder.textContent =
      'Nenhum dispositivo selecionado.\nSelecione um device no topo para ver o gráfico.';
    return;
  }

  const fromMs = dateTimeLocalToMs(fromInput.value);
  const toMs = dateTimeLocalToMs(toInput.value);

  const params = new URLSearchParams();
  if (fromMs) params.append('from', String(fromMs));
  if (toMs) params.append('to', String(toMs));

  const qs = params.toString();
  const url = qs
    ? `/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements?${qs}`
    : `/api/v1/user/devices/${encodeURIComponent(deviceId)}/measurements`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${chartsToken}` },
    });
    const json = await res.json();
    if (!json.success) {
      console.error(json.message || 'Erro ao buscar dados de gráfico');
      chartInfo.textContent = 'Erro ao carregar dados.';
      chartPlaceholder.textContent =
        'Erro ao carregar dados de gráfico.\nVerifique a API ou tente novamente.';
      return;
    }

    const measures = json.data || [];
    renderSeries(measures);
  } catch (err) {
    console.error('loadSeriesForSelected error', err);
    chartInfo.textContent = 'Erro de comunicação ao carregar dados.';
    chartPlaceholder.textContent =
      'Erro de comunicação com o servidor.\nVerifique conexão e API.';
  }
}

async function initDashboardGraficos() {
  await DashboardCommon.initTopbar();

  const devs = await DashboardCommon.loadDevicesCommon();
  if (!devs.length) {
    chartInfo.textContent = 'Nenhum dispositivo associado.';
    chartPlaceholder.textContent =
      'Nenhum dispositivo associado à sua conta.\nRegistre um device para ver os gráficos.';
    return;
  }

  applyQuickPeriod();
  await loadSeriesForSelected();
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardGraficos().catch((err) =>
    console.error('initDashboardGraficos error', err),
  );

  periodSelect.addEventListener('change', () => {
    applyQuickPeriod();
  });

  loadChartBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loadSeriesForSelected();
  });
});

window.addEventListener('deviceChanged', () => {
  loadSeriesForSelected();
});
