// dashboard-account.js

// Inicialização da topbar e menu
function initTopbar() {
  const topbarRoot = document.getElementById('topbar-root');
  if (topbarRoot && typeof getTopbarHtml === 'function') {
    topbarRoot.innerHTML = getTopbarHtml();

    // Marca aba "Minha conta" como ativa no menu superior
    const accountLink = document.getElementById('menu-account');
    if (accountLink) accountLink.classList.add('active');

    // Relógio e info de usuário
    startTopbarClock?.();
    if (typeof initUserInfo === 'function') {
      initUserInfo();
    }

    // Menu lateral (hambúrguer)
    if (typeof initSideMenu === 'function') {
      initSideMenu();
    }
  }
}

// Preencher campos do perfil com /auth/me
async function loadAccountProfile() {
  try {
    const res = await apiFetch('/api/v1/auth/me', { method: 'GET' });
    if (!res.ok) {
      if (res.status === 401) redirectToLogin();
      return;
    }
    const data = await res.json();
    // Esperado: { success, data: { email, name, timezone, ... } }
    if (!data || !data.data) return;

    const user = data.data;

    const emailInput = document.getElementById('accountEmail');
    const nameInput = document.getElementById('accountName');
    const tzInput = document.getElementById('accountTimezone');

    if (emailInput) emailInput.value = user.email || '';
    if (nameInput) nameInput.value = user.name || '';
    if (tzInput) tzInput.value = user.timezone || '';
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
  }
}

// Salvar perfil (nome, timezone, futuramente outras prefs)
async function saveProfile() {
  const nameInput = document.getElementById('accountName');
  const tzInput = document.getElementById('accountTimezone');

  const body = {
    name: nameInput?.value || '',
    timezone: tzInput?.value || '',
  };

  try {
    const res = await apiFetch('/api/v1/account/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      alert(errBody?.message || 'Erro ao salvar perfil');
      return;
    }

    alert('Perfil atualizado com sucesso.');
  } catch (err) {
    console.error('Erro ao salvar perfil:', err);
    alert('Erro ao salvar perfil.');
  }
}

// Alterar senha
async function changePassword() {
  const currentPassword = document.getElementById('currentPassword')?.value || '';
  const newPassword = document.getElementById('newPassword')?.value || '';
  const confirmPassword = document.getElementById('confirmPassword')?.value || '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    alert('Preencha todos os campos de senha.');
    return;
  }
  if (newPassword !== confirmPassword) {
    alert('A nova senha e a confirmação não coincidem.');
    return;
  }

  try {
    const res = await apiFetch('/api/v1/account/change-password', {
      method: 'POST',
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      alert(data?.message || 'Erro ao alterar senha.');
      return;
    }

    alert('Senha alterada com sucesso.');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    alert('Erro ao alterar senha.');
  }
}

// Carregar lista de dispositivos vinculados
async function loadDevices() {
  const container = document.getElementById('deviceList');
  if (!container) return;

  container.innerHTML = '<div class="small-text">Carregando dispositivos...</div>';

  try {
    const res = await apiFetch('/api/v1/devices/my-devices', { method: 'GET' });
    if (!res.ok) {
      container.innerHTML = '<div class="small-text">Erro ao carregar dispositivos.</div>';
      return;
    }

    const data = await res.json();
    const devices = data?.data || [];

    if (!devices.length) {
      container.innerHTML = '<div class="small-text">Nenhum dispositivo vinculado ainda.</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    devices.forEach((d) => {
      const div = document.createElement('div');
      div.className = 'device-item';

      // Esperado algo como: { id, name, type, lastSeenAt, firmwareVersion, online }
      const name = d.name || d.id || 'Device';
      const type = d.type || '';
      const fw = d.firmwareVersion || '';
      const online = !!d.online;

      const left = document.createElement('div');
      left.innerHTML = `<strong>${name}</strong><br/><span class="small-text">${type} — FW ${fw || 'N/A'}</span>`;

      const right = document.createElement('div');
      right.innerHTML = online
        ? '<span class="badge-on">Online</span>'
        : '<span class="badge-off">Offline</span>';

      div.appendChild(left);
      div.appendChild(right);
      frag.appendChild(div);
    });

    container.innerHTML = '';
    container.appendChild(frag);
  } catch (err) {
    console.error('Erro ao carregar devices:', err);
    container.innerHTML = '<div class="small-text">Erro ao carregar dispositivos.</div>';
  }
}

// Exportar dados
async function exportData() {
  try {
    const res = await apiFetch('/api/v1/account/export', { method: 'GET' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.message || 'Erro ao exportar dados.');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reefbluesky-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao exportar dados:', err);
    alert('Erro ao exportar dados.');
  }
}

// Excluir conta
async function deleteAccount() {
  const confirm1 = confirm('Tem certeza que deseja excluir sua conta e todos os dados? Esta ação é irreversível.');
  if (!confirm1) return;

  try {
    const res = await apiFetch('/api/v1/account/delete', {
      method: 'DELETE',
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      alert(data?.message || 'Erro ao excluir conta.');
      return;
    }

    alert('Conta excluída. Você será desconectado.');
    redirectToLogin();
  } catch (err) {
    console.error('Erro ao excluir conta:', err);
    alert('Erro ao excluir conta.');
  }
}

function initAccountTopbar() {
  if (window.DashboardCommon && typeof DashboardCommon.initTopbar === 'function') {
    DashboardCommon.initTopbar(); // monta o mesmo topo de todas as telas
  }

  const accountLink = document.getElementById('menu-account');
  if (accountLink) accountLink.classList.add('active');
}


const TIMEZONES = [
  // Brasil / América do Sul
  { name: 'America/Sao_Paulo',    offset: 'UTC-03:00' },
  { name: 'America/Bahia',        offset: 'UTC-03:00' },
  { name: 'America/Fortaleza',    offset: 'UTC-03:00' },
  { name: 'America/Recife',       offset: 'UTC-03:00' },
  { name: 'America/Manaus',       offset: 'UTC-04:00' },
  { name: 'America/Cuiaba',       offset: 'UTC-04:00' },
  { name: 'America/Porto_Velho',  offset: 'UTC-04:00' },
  { name: 'America/Rio_Branco',   offset: 'UTC-05:00' },
  { name: 'America/Noronha',      offset: 'UTC-02:00' },

  { name: 'America/Argentina/Buenos_Aires', offset: 'UTC-03:00' },
  { name: 'America/Montevideo',  offset: 'UTC-03:00' },
  { name: 'America/Santiago',    offset: 'UTC-03:00' },
  { name: 'America/Bogota',      offset: 'UTC-05:00' },
  { name: 'America/Lima',        offset: 'UTC-05:00' },
  { name: 'America/Mexico_City', offset: 'UTC-06:00' },

  // América do Norte
  { name: 'America/New_York',    offset: 'UTC-05:00' },
  { name: 'America/Chicago',     offset: 'UTC-06:00' },
  { name: 'America/Denver',      offset: 'UTC-07:00' },
  { name: 'America/Los_Angeles', offset: 'UTC-08:00' },
  { name: 'America/Toronto',     offset: 'UTC-05:00' },
  { name: 'America/Vancouver',   offset: 'UTC-08:00' },

  // Europa
  { name: 'Europe/London',   offset: 'UTC+00:00' },
  { name: 'Europe/Lisbon',   offset: 'UTC+00:00' },
  { name: 'Europe/Madrid',   offset: 'UTC+01:00' },
  { name: 'Europe/Paris',    offset: 'UTC+01:00' },
  { name: 'Europe/Berlin',   offset: 'UTC+01:00' },
  { name: 'Europe/Rome',     offset: 'UTC+01:00' },
  { name: 'Europe/Amsterdam',offset: 'UTC+01:00' },
  { name: 'Europe/Brussels', offset: 'UTC+01:00' },
  { name: 'Europe/Zurich',   offset: 'UTC+01:00' },
  { name: 'Europe/Athens',   offset: 'UTC+02:00' },
  { name: 'Europe/Moscow',   offset: 'UTC+03:00' },

  // África / Oriente Médio
  { name: 'Africa/Johannesburg', offset: 'UTC+02:00' },
  { name: 'Africa/Cairo',        offset: 'UTC+02:00' },
  { name: 'Asia/Jerusalem',      offset: 'UTC+02:00' },
  { name: 'Asia/Riyadh',         offset: 'UTC+03:00' },
  { name: 'Asia/Dubai',          offset: 'UTC+04:00' },

  // Ásia / Oceania
  { name: 'Asia/Kolkata',   offset: 'UTC+05:30' },
  { name: 'Asia/Bangkok',   offset: 'UTC+07:00' },
  { name: 'Asia/Singapore', offset: 'UTC+08:00' },
  { name: 'Asia/Hong_Kong', offset: 'UTC+08:00' },
  { name: 'Asia/Shanghai',  offset: 'UTC+08:00' },
  { name: 'Asia/Tokyo',     offset: 'UTC+09:00' },
  { name: 'Australia/Sydney',   offset: 'UTC+11:00' },
  { name: 'Australia/Brisbane', offset: 'UTC+10:00' },
  { name: 'Pacific/Auckland',  offset: 'UTC+13:00' },

  // Genéricos
  { name: 'UTC', offset: 'UTC+00:00' },
];


function populateTimezoneSelect() {
  const select = document.getElementById('accountTimezone');
  if (!select) return;

  const sorted = [...TIMEZONES].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  sorted.forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz.name;
    opt.textContent = `${tz.name} (${tz.offset})`;
    select.appendChild(opt);
  });
}



function initAccountPage() {
  initAccountTopbar();   

  document.getElementById('btnSaveProfile')?.addEventListener('click', (e) => {
    e.preventDefault();
    saveProfile();
  });

  document.getElementById('btnChangePassword')?.addEventListener('click', (e) => {
    e.preventDefault();
    changePassword();
  });

  document.getElementById('btnExportData')?.addEventListener('click', (e) => {
    e.preventDefault();
    exportData();
  });

  document.getElementById('btnDeleteAccount')?.addEventListener('click', (e) => {
    e.preventDefault();
    deleteAccount();
  });

  populateTimezoneSelect(); 
  loadAccountProfile();
  loadDevices();
}


// Entrada
document.addEventListener('DOMContentLoaded', initAccountPage);
