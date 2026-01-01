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

  let showColon = true;

  const update = () => {
    const now = new Date();
    const hours   = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');

    const sep = showColon ? ':' : ' ';  // pisca o separador
    el.textContent = `${hours}${sep}${minutes}`;

    showColon = !showColon;             // inverte a cada tick
  };

  update();
  setInterval(update, 1000);            // intervalo de 1 segundo
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
        <span id="lcdStatusIcon" class="badge-off" style="display:none; font-size:12px;">
          LCD OFF
        </span>
        <div id="currentTime">--:--</div>
        <div class="device-selector">
          <span>Device:</span>
          <select id="deviceSelect"></select>
          <span id="deviceStatusBadge" class="badge badge-off">Desconhecido</span>
        </div>
        <button id="logoutBtn" class="btn-small">Sair</button>

        <!-- botão hambúrguer -->
        <button id="menuToggle" class="menu-toggle" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
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

    const allDevices  = json.data || [];
    currentDevices = allDevices.filter((d) => d.type !== 'LCD');

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

  const currentId = getSelectedDeviceId();
  const cur = currentDevices.find((d) => d.deviceId === currentId);
  if (cur && typeof cur.lcdStatus !== 'undefined') {
    DashboardCommon.setLcdStatus(cur.lcdStatus); // online ou offline
  } else {
    DashboardCommon.setLcdStatus('never');
  }

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

  // MENU LATERAL
  const sideMenu  = document.getElementById('sideMenu');
  const menuToggle = document.getElementById('menuToggle');
  const closeBtn   = document.getElementById('closeMenu');

  if (sideMenu && menuToggle) {
    const close = () => sideMenu.classList.remove('open');

    menuToggle.addEventListener('click', () => {
      sideMenu.classList.toggle('open');
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    sideMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        close();
      }
    });
  }


  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', redirectToLogin);
  }

  const select = document.getElementById('deviceSelect');
  if (select) {
    select.addEventListener('change', () => {
      updateDeviceStatusBadge();
      const currentId = getSelectedDeviceId();
      const cur = currentDevices.find((d) => d.deviceId === currentId);
      if (cur && typeof cur.lcdStatus !== 'undefined') {
        DashboardCommon.setLcdStatus(cur.lcdStatus);
      } else {
        DashboardCommon.setLcdStatus('never');
      }

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
  setInterval(async () => {
    const devs2 = await loadDevicesCommon();
    if (!devs2.length) return;

    updateDeviceStatusBadge();

    const currentId = getSelectedDeviceId();
    if (!currentId) return;

    // Pinga o /kh-config para pegar lcdStatus atualizado
    try {
      const resp = await fetch(
        `/api/v1/user/devices/${encodeURIComponent(currentId)}/kh-config`,
        { headers: API_HEADERS() }
      );
      const json = await resp.json();
      if (resp.ok && json.success && json.data && typeof DashboardCommon.setLcdStatus === 'function') {
        DashboardCommon.setLcdStatus(json.data.lcdStatus); // online/offline/never
      }
    } catch (e) {
      console.error('Erro ao atualizar lcdStatus periodicamente', e);
      // em erro, não mexe no estado atual do badge
    }
  }, 30000);
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

function setLcdStatus(status) {
    const el = document.getElementById('lcdStatusIcon');
    if (!el) return;
    
    // Preserva estado se status não definido
    if (status === undefined || status === null) {
        return;  // Não esconde se já estava visível
    }
    
    if (status === 'never') {
        el.style.display = 'none';
        return;
    }
    
    el.style.display = 'inline-block';
    if (status === 'online') {
        el.textContent = 'LCD ON';
        el.className = 'badge-on';
        el.title = 'Display remoto conectado';
    } else if (status === 'offline') {
        el.textContent = 'LCD OFF';
        el.className = 'badge-off';
        el.title = 'Display remoto desconectado';
    }
}


window.DashboardCommon = {
  initTopbar,
  loadUserCommon,
  loadDevicesCommon,
  updateDeviceStatusBadge,
  getSelectedDeviceId,
  getSelectedDeviceIdOrAlert,
  applyRoleMenuVisibility,
  setLcdStatus,
  currentUserRole: 'user',
};



