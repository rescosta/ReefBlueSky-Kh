// dashboard-common.js
const API_HEADERS = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

let currentDevices = [];
let currentUser = null;

function redirectToLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userId');
  window.location.href = 'login';
}

// Relógio simples no topo
function startTopbarClock() {
  const el = document.getElementById('currentTime');
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  update();
  setInterval(update, 1000);
}

// HTML padrão da topbar
function getTopbarHtml() {
  return `
    <div class="topbar">
      <div class="topbar-left">
        <div class="logo">ReefBlueSky</div>
        <nav class="nav">
          <a href="dashboard" id="nav-main">Principal</a>
          <a href="dashboard-logs.html" id="nav-logs">Logs</a>
          <a href="dashboard-graficos.html" id="nav-graficos">Gráficos</a>
          <a href="dashboard-config.html" id="nav-config">Configurações</a>
          <a href="dashboard-sistema.html" id="nav-sistema">Sistema</a>
          <a href="dashboard-logs.html" id="nav-dev" style="display:none;">Dev</a>
        </nav>
      </div>
      <div class="topbar-right">
        <div id="currentTime">--:--</div>
        <div class="device-selector">
          <span>Device:</span>
          <select id="deviceSelect"></select>
          <span id="deviceStatusBadge" class="badge badge-off">Desconhecido</span>
        </div>
        <button id="logoutBtn" class="btn-small">Sair</button>
      </div>
    </div>
  `;
}

// Destacar aba ativa
function highlightActiveNav() {
  const path = window.location.pathname || '';
  const map = [
    { id: 'nav-main', match: 'dashboard' },
    { id: 'nav-logs', match: 'dashboard-logs.html' },
    { id: 'nav-graficos', match: 'dashboard-graficos.html' },
    { id: 'nav-config', match: 'dashboard-config.html' },
    { id: 'nav-sistema', match: 'dashboard-sistema.html' },
    { id: 'nav-dev', match: 'dashboard-logs.html' },
  ];

  map.forEach(({ id, match }) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (path.endsWith(match)) el.classList.add('active');
    else el.classList.remove('active');
  });
}

// Carregar dados do usuário
async function loadUserCommon() {
  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: API_HEADERS(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      redirectToLogin();
      return null;
    }
    currentUser = json.data;

    // guardar role globalmente
    window.DashboardCommon = window.DashboardCommon || {};
    DashboardCommon.currentUserRole = currentUser.role || 'user';

    const userInfoEl = document.getElementById('userInfo');
    if (userInfoEl) {
      userInfoEl.textContent = `Usuário ${currentUser.email} · id ${currentUser.id}`;
    }

    return currentUser;
  } catch (err) {
    console.error('loadUserCommon error', err);
    redirectToLogin();
    return null;
  }
}


// Carregar lista de devices
async function loadDevicesCommon() {
  try {
    const res = await fetch('/api/v1/user/devices', {
      headers: API_HEADERS(),
    });
    const json = await res.json();
    if (!json.success) {
      console.error(json.message || 'Erro ao buscar devices');
      return [];
    }

    currentDevices = json.data || [];
    const select = document.getElementById('deviceSelect');
    if (!select) return currentDevices;

    select.innerHTML = '';
    currentDevices.forEach((dev, idx) => {
      const opt = document.createElement('option');
      opt.value = dev.deviceId;
      const label = dev.name && dev.name.trim()
        ? `${dev.name} (${dev.deviceId})`
        : dev.deviceId;
      opt.textContent = label;
      if (idx === 0) opt.selected = true;
      select.appendChild(opt);
    });

    return currentDevices;
  } catch (err) {
    console.error('loadDevicesCommon error', err);
    return [];
  }
}

// Status do device com base em lastSeen
function updateDeviceStatusBadge() {
  const badge = document.getElementById('deviceStatusBadge');
  const select = document.getElementById('deviceSelect');
  if (!badge || !select) return;

  const deviceId = select.value;
  const dev = currentDevices.find((d) => d.deviceId === deviceId);
  if (!dev || !dev.lastSeen) {
    badge.className = 'badge badge-off';
    badge.textContent = 'Desconhecido';
    return;
  }

  const last = typeof dev.lastSeen === 'number'
    ? dev.lastSeen
    : Date.parse(dev.lastSeen);

  if (!last || Number.isNaN(last)) {
    badge.className = 'badge badge-off';
    badge.textContent = 'Desconhecido';
    return;
  }

  const diffMs = Date.now() - last;
  const diffMin = diffMs / 60000;

  if (diffMin <= 5) {
    badge.className = 'badge badge-on';
    badge.textContent = 'Online';
  } else if (diffMin <= 60) {
    badge.className = 'badge badge-off';
    badge.textContent = 'Offline';
  } else {
    badge.className = 'badge badge-off';
    badge.textContent = 'Offline';
  }
}


function applyRoleMenuVisibility() {
  const role =
    (window.DashboardCommon && DashboardCommon.currentUserRole) || 'user';

  const navLogs = document.getElementById('nav-logs');
  const navDev  = document.getElementById('nav-dev');

  // Logs some sempre
  if (navLogs) navLogs.style.display = 'none';

  // Dev só aparece para role=dev
  if (navDev) {
    navDev.style.display = role === 'dev' ? 'inline-block' : 'none';
  }
}


// Inicializar topbar em qualquer página
async function initTopbar() {
  const root = document.getElementById('topbar-root');
  if (!root) {
    console.warn('initTopbar: #topbar-root não encontrado');
    return;
  }

  root.innerHTML = getTopbarHtml();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', redirectToLogin);
  }

  const select = document.getElementById('deviceSelect');
  if (select) {
    select.addEventListener('change', () => {
      updateDeviceStatusBadge();
      const evt = new CustomEvent('deviceChanged', {
        detail: { deviceId: select.value },
      });
      window.dispatchEvent(evt);
    });
  }

  highlightActiveNav();
  startTopbarClock();

  const token = localStorage.getItem('token');
  if (!token) {
    redirectToLogin();
    return;
  }

  await loadUserCommon();
  applyRoleMenuVisibility();
  const devs = await loadDevicesCommon();
  if (devs.length) {
    updateDeviceStatusBadge();
  } else {
    const badge = document.getElementById('deviceStatusBadge');
    if (badge) {
      badge.className = 'badge badge-off';
      badge.textContent = 'Sem devices';
    }
  }
}

// Helper para outras páginas usarem
function getSelectedDeviceId() {
  const select = document.getElementById('deviceSelect');
  return select ? select.value : null;
}

function getSelectedDeviceIdOrAlert() {
  const deviceId = getSelectedDeviceId();
  if (!deviceId) {
    alert('Selecione um dispositivo no topo antes de continuar.');
    return null;
  }
  return deviceId;
}

window.DashboardCommon = {
  initTopbar,
  loadUserCommon,
  loadDevicesCommon,
  updateDeviceStatusBadge,
  getSelectedDeviceId,
  getSelectedDeviceIdOrAlert,
  applyRoleMenuVisibility,
  currentUserRole: 'user',
};


