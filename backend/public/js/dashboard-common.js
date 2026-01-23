// dashboard-common.js


function getAccessToken() {
  return localStorage.getItem('token');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

let refreshPromise = null;  // Lock global pra refresh

function decodeJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp : 0;
  } catch {
    return 0;
  }
}

async function ensureFreshToken() {
  const token = getAccessToken();
  if (!token) return false;
  
  const exp = decodeJwt(token);
  const now = Math.floor(Date.now() / 1000);
  if (exp - now > 300) return true;  // +5min OK
  
  // Lock: se já tiver refresh rodando, espera
  if (refreshPromise) return refreshPromise;
  
  refreshPromise = tryRefreshToken();
  const result = await refreshPromise;
  refreshPromise = null;
  return result;
}

async function tryRefreshToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  
  try {
    const res = await fetch('/api/v1/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    
    if (!res.ok) return false;
    
    const data = await res.json();
    saveTokens(data.token, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function saveTokens(token, refreshToken) {
  if (token) localStorage.setItem('token', token);
  if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
}

async function apiFetch(url, options = {}) {
  await ensureFreshToken();  // Pré-refresh!
  
  const token = getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers
  };
  
  const res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed && token) {
      // Retry com novo token
      const retryHeaders = { ...headers, Authorization: `Bearer ${getAccessToken()}` };
      return fetch(url, { ...options, headers: retryHeaders });
    }
  }
  
  return res;
}

let currentDevices = [];
let currentUser = null;

function redirectToLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('userId');
  window.location.href = 'login';
}


// Relógio simples no topo (HH:MM, dois pontos piscando)
function startTopbarClock() {
  const el = document.getElementById('currentTime');
  if (!el) return;

  let showColon = true;

  const update = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');

    const sep = showColon ? ':' : ' ';
    el.textContent = `${hours}${sep}${minutes}`;

    showColon = !showColon;
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
            <a href="dashboard-graficos.html" id="nav-graficos">Gráficos</a>
            <a href="dashboard-config.html" id="nav-config">Configurações</a>
            <a href="dashboard-sistema.html" id="nav-sistema">Sistema</a>
            <div class="nav-dropdown">
              <button type="button" class="nav-dropbtn">Dosadora ▾</button>
              <div class="nav-dropdown-content">
                <a href="dashboard-dosing.html?tab=dashboard">Dashboard</a>
                <a href="dashboard-dosing.html?tab=agenda">Agenda</a>
                <a href="dashboard-dosing.html?tab=manual">Manual</a>
                <a href="dashboard-dosing.html?tab=config">Configuração</a>
                <a href="dashboard-dosing.html?tab=calibration">Calibrar</a>
              </div>
            </div>            
            <a href="dashboard-logs.html" id="nav-dev" style="display:none;">Dev</a>
            <a href="dashboard-account.html" id="menu-account">Minha conta</a>
          </nav>
      </div>
      <div class="topbar-right">
        <div class="device-selector">
          <span>Device:</span>
          <select id="deviceSelect"></select>
          <span id="deviceStatusBadge" class="badge badge-off">Desconhecido</span>
        </div>

        <span id="lcdStatusIcon" class="badge-off" style="display:none; font-size:12px;">
          LCD OFF
        </span>

        <span id="dosingStatusIcon" class="badge-off" style="display:none; font-size:12px;">
          DOS OFF
        </span>

        <div id="currentTime" class="topbar-clock">--:--</div>

        <button id="logoutBtn" class="btn-small">Sair</button>

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
    { id: 'nav-dosing',  match: 'dashboard-dosing.html' },
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
    const res = await apiFetch('/api/v1/auth/me');
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

let devicesCache = null;
let devicesCacheTime = 0;
const DEVICES_CACHE_MAX_AGE = 15000; // 15s

// Carregar lista de devices
async function loadDevicesCommon() {
  const now = Date.now();
  if (devicesCache && (now - devicesCacheTime) < DEVICES_CACHE_MAX_AGE) {
    return devicesCache;
  }
  try {
    const res = await apiFetch('/api/v1/user/devices');
    const json = await res.json();
    if (!json.success) {
      console.error(json.message || 'Erro ao buscar devices');
      return [];
    }

    const allDevices  = json.data || [];
    
    currentDevices = allDevices.filter((d) => d.type === 'KH');

    devicesCache = currentDevices;
    devicesCacheTime = now;

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
  } 

  if (cur && typeof cur.dosingStatus !== 'undefined') {
    DashboardCommon.setDosingStatus(cur.dosingStatus);
  }

  /*else {
    DashboardCommon.setLcdStatus('never');
  }*/

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

async function hasDosingDevices() {
  try {
    const res = await apiFetch('/api/v1/user/dosing/devices');
    const json = await res.json();
    if (!res.ok || !json.success) return false;
    const list = json.data || [];
    return list.length > 0;
  } catch (err) {
    console.error('hasDosingDevices error', err);
    return false;
  }
}

async function applyRoleMenuVisibility() {
  const role =
    (window.DashboardCommon && DashboardCommon.currentUserRole) || 'user';

  const navLogs   = document.getElementById('nav-logs');
  const navDev    = document.getElementById('nav-dev');
  //const navDosing = document.getElementById('nav-dosing');

  // Logs some sempre
  if (navLogs) navLogs.style.display = 'none';

  // Dev só aparece para role=dev
  if (navDev) {
    navDev.style.display = role === 'dev' ? 'inline-block' : 'none';
  }

  // Dosadora só aparece se o usuário tiver pelo menos um dosing_device
  /*if (navDosing) {
    const hasDoser = await hasDosingDevices();
    navDosing.style.display = hasDoser ? 'inline-block' : 'none';
  }*/
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


  // Submenus colapsáveis dentro do sideMenu (RBS KH, Dosadora, etc.)
  const subToggles = document.querySelectorAll('.side-submenu-toggle');

  subToggles.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();  // impede que o clique suba pro sideMenu

      const submenu = btn.nextElementSibling;
      if (!submenu || !submenu.classList.contains('side-submenu')) return;

      submenu.classList.toggle('open');
      btn.classList.toggle('open');
    });
  });



  const menuLogout = document.getElementById('menuLogout');
  if (menuLogout) {
    menuLogout.addEventListener('click', (e) => {
      e.preventDefault();
      redirectToLogin();
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
      } 

      if (cur && typeof cur.dosingStatus !== 'undefined') {
        DashboardCommon.setDosingStatus(cur.dosingStatus);
      }

      /*else {
        DashboardCommon.setLcdStatus('never');
      }*/

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
  await ensureFreshToken(); 

  await applyRoleMenuVisibility();

 initFooter();  

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

    try {
      const resp = await apiFetch(
        `/api/v1/user/devices/${encodeURIComponent(currentId)}/kh-config`
      );
      const json = await resp.json();
      if (resp.ok && json.success && json.data) {
        if (typeof DashboardCommon.setLcdStatus === 'function') {
          DashboardCommon.setLcdStatus(json.data.lcdStatus);
        }
        if (typeof DashboardCommon.setDosingStatus === 'function') {
          DashboardCommon.setDosingStatus(json.data.dosingStatus);
        }
      }
    } catch (e) {
      console.error('Erro ao atualizar lcd/dosing status periodicamente', e);
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

function getFooterHtml() {
  return `
    <div class="footer">
      <div class="footer-user">
        Usuário: <span id="footerUser">-----</span>
      </div>
      <div class="footer-copy">
        @ReefBlueSky 2026 — todos os direitos reservados
      </div>
    </div>
  `;
}


function initFooter() {
  const root = document.getElementById('footer-root');
  if (!root) return;

  root.innerHTML = getFooterHtml();

  const span = document.getElementById('footerUser');
  if (span && currentUser && currentUser.email) {
    span.textContent = currentUser.email;
  }
}



function setDosingStatus(status) {
  const el = document.getElementById('dosingStatusIcon');
  if (!el) return;

  if (status !== 'online' && el.textContent === 'DOS ON') {
    return;
  }


  if (status === undefined || status === null) return;

  if (status === 'never') {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'inline-block';

  if (status === 'online') {
    el.textContent = 'DOS ON';
    el.className = 'badge-on';
    el.title = 'Dosadora conectada';
  } else {
    el.textContent = 'DOS OFF';
    el.className = 'badge-off';
    el.title = 'Dosadora desconectada';
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
  setDosingStatus,
  initFooter,          
  currentUserRole: 'user',
};



