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

const timezones = [
  { value: 'Pacific/Auckland',            label: 'UTC+12:00 — Pacific/Auckland' },
  { value: 'Australia/Sydney',           label: 'UTC+10:00 — Australia/Sydney' },
  { value: 'Australia/Brisbane',         label: 'UTC+10:00 — Australia/Brisbane' },
  { value: 'Australia/Perth',            label: 'UTC+08:00 — Australia/Perth' },
  { value: 'Asia/Tokyo',                 label: 'UTC+09:00 — Asia/Tokyo' },
  { value: 'Asia/Seoul',                 label: 'UTC+09:00 — Asia/Seoul' },
  { value: 'Asia/Shanghai',              label: 'UTC+08:00 — Asia/Shanghai' },
  { value: 'Asia/Hong_Kong',             label: 'UTC+08:00 — Asia/Hong_Kong' },
  { value: 'Asia/Singapore',             label: 'UTC+08:00 — Asia/Singapore' },
  { value: 'Asia/Bangkok',               label: 'UTC+07:00 — Asia/Bangkok' },
  { value: 'Asia/Jakarta',               label: 'UTC+07:00 — Asia/Jakarta' },
  { value: 'Asia/Kolkata',               label: 'UTC+05:30 — Asia/Kolkata' },
  { value: 'Asia/Dubai',                 label: 'UTC+04:00 — Asia/Dubai' },

  { value: 'Europe/Moscow',              label: 'UTC+03:00 — Europe/Moscow' },
  { value: 'Africa/Nairobi',             label: 'UTC+03:00 — Africa/Nairobi' },
  { value: 'Africa/Johannesburg',        label: 'UTC+02:00 — Africa/Johannesburg' },
  { value: 'Africa/Cairo',               label: 'UTC+02:00 — Africa/Cairo' },
  { value: 'Europe/Athens',              label: 'UTC+02:00 — Europe/Athens' },
  { value: 'Europe/Berlin',              label: 'UTC+01:00 — Europe/Berlin' },
  { value: 'Europe/Paris',               label: 'UTC+01:00 — Europe/Paris' },
  { value: 'Europe/Madrid',              label: 'UTC+01:00 — Europe/Madrid' },
  { value: 'Europe/Amsterdam',           label: 'UTC+01:00 — Europe/Amsterdam' },
  { value: 'Europe/Brussels',            label: 'UTC+01:00 — Europe/Brussels' },
  { value: 'Europe/Zurich',              label: 'UTC+01:00 — Europe/Zurich' },
  { value: 'Europe/Lisbon',              label: 'UTC+00:00 — Europe/Lisbon' },
  { value: 'Europe/London',              label: 'UTC+00:00 — Europe/London' },
  { value: 'UTC',                        label: 'UTC+00:00 — UTC' },

  { value: 'America/Sao_Paulo',          label: 'UTC-03:00 — America/Sao_Paulo' },
  { value: 'America/Bahia',              label: 'UTC-03:00 — America/Bahia' },
  { value: 'America/Fortaleza',          label: 'UTC-03:00 — America/Fortaleza' },
  { value: 'America/Recife',             label: 'UTC-03:00 — America/Recife' },
  { value: 'America/Belem',              label: 'UTC-03:00 — America/Belem' },
  { value: 'America/Maceio',             label: 'UTC-03:00 — America/Maceio' },
  { value: 'America/Manaus',             label: 'UTC-04:00 — America/Manaus' },
  { value: 'America/Campo_Grande',       label: 'UTC-04:00 — America/Campo_Grande' },
  { value: 'America/Cuiaba',             label: 'UTC-04:00 — America/Cuiaba' },
  { value: 'America/Boa_Vista',          label: 'UTC-04:00 — America/Boa_Vista' },
  { value: 'America/Argentina/Buenos_Aires', label: 'UTC-03:00 — America/Argentina/Buenos_Aires' },
  { value: 'America/Santiago',           label: 'UTC-03:00 — America/Santiago' },
  { value: 'America/Montevideo',         label: 'UTC-03:00 — America/Montevideo' },
  { value: 'America/Lima',               label: 'UTC-05:00 — America/Lima' },
  { value: 'America/Bogota',             label: 'UTC-05:00 — America/Bogota' },
  { value: 'America/La_Paz',             label: 'UTC-04:00 — America/La_Paz' },
  { value: 'America/Asuncion',           label: 'UTC-04:00 — America/Asuncion' },

  { value: 'America/St_Johns',           label: 'UTC-03:30 — America/St_Johns' },
  { value: 'America/Halifax',            label: 'UTC-04:00 — America/Halifax' },
  { value: 'America/New_York',           label: 'UTC-05:00 — America/New_York' },
  { value: 'America/Chicago',            label: 'UTC-06:00 — America/Chicago' },
  { value: 'America/Denver',             label: 'UTC-07:00 — America/Denver' },
  { value: 'America/Phoenix',            label: 'UTC-07:00 — America/Phoenix' },
  { value: 'America/Los_Angeles',        label: 'UTC-08:00 — America/Los_Angeles' },
  { value: 'America/Vancouver',          label: 'UTC-08:00 — America/Vancouver' },
  { value: 'America/Mexico_City',        label: 'UTC-06:00 — America/Mexico_City' },
];


function populateTimezoneSelect() {
  const select = document.getElementById('accountTimezone');
  if (!select) return;

  select.innerHTML = '<option value="">Selecione o fuso…</option>';

  for (const tz of timezones) {
    const opt = document.createElement('option');
    opt.value = tz.value;
    opt.textContent = tz.label;
    select.appendChild(opt);
  }
}



function getDevicesStatusBadgesHtml() {
  return `
    <span id="deviceStatusBadgeDevices" class="badge badge-off">Desconhecido</span>
    <span id="lcdStatusIconDevices" class="badge-off" style="display:none; font-size:12px;">
      LCD OFF
    </span>
    <span id="dosingStatusIconDevices" class="badge-off" style="display:none; font-size:12px;">
      DOS OFF
    </span>
  `;
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
    if (!data || !data.data) return;

    const user = data.data;

    const emailInput = document.getElementById('accountEmail');
    const nameInput  = document.getElementById('accountName');
    const tzInput    = document.getElementById('accountTimezone');

    if (emailInput) emailInput.value = user.email || '';
    if (nameInput)  nameInput.value  = user.name  || '';
    if (tzInput)    tzInput.value    = user.timezone || '';
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
  }
}

// Salvar perfil (nome, timezone)
async function saveProfile() {
  const nameInput = document.getElementById('accountName');
  const tzInput   = document.getElementById('accountTimezone');

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
  const newPassword     = document.getElementById('newPassword')?.value || '';
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
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      alert(data?.message || 'Erro ao alterar senha.');
      return;
    }

    alert('Senha alterada com sucesso.');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value     = '';
    document.getElementById('confirmPassword').value = '';
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    alert('Erro ao alterar senha.');
  }
}

function setLcdStatusInDevices(status) {
  const el = document.getElementById('lcdStatusIconDevices');
  if (!el) return;

  // mesma lógica de setLcdStatus, só mudando o id
  if (status === undefined || status === null) return;
  if (status === 'never') {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'inline-block';
  if (status === 'online') {
    el.textContent = 'LCD ON';
    el.className = 'badge-on';
    el.title = 'Display remoto conectado';
  } else {
    el.textContent = 'LCD OFF';
    el.className = 'badge-off';
    el.title = 'Display remoto desconectado';
  }
}

function setDosingStatusInDevices(status) {
  const el = document.getElementById('dosingStatusIconDevices');
  if (!el) return;

  if (status !== 'online' && el.textContent === 'DOS ON') return;
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


// Mesma regra de online/offline que o Common usa (5 min de janela)
function computeOnlineFromLastSeen(lastSeen) {
  if (!lastSeen) return false;

  const last = typeof lastSeen === 'number'
    ? lastSeen
    : Date.parse(lastSeen);

  if (!last || Number.isNaN(last)) return false;

  const diffMs  = Date.now() - last;
  const diffMin = diffMs / 60000;

  return diffMin <= 5;
}

// Gera os mesmos botões de status da barra superior
/*function buildTopbarStatusButtons(devices) {
  const kh  = devices.find(d => d.type === 'KH');
  const dos = devices.find(d => d.type === 'DOSER');
  const lcd = devices.find(d => d.type === 'LCD');

  const khOnline  = kh  ? computeOnlineFromLastSeen(kh.lastSeen || kh.last_seen)   : false;
  const dosOnline = dos ? computeOnlineFromLastSeen(dos.lastSeen || dos.last_seen) : false;
  const lcdOnline = lcd ? computeOnlineFromLastSeen(lcd.lastSeen || lcd.last_seen) : false;

  setLcdStatusInDevices(lcd ? (lcdOnline ? 'online' : 'offline') : 'never');
  setDosingStatusInDevices(dos ? (dosOnline ? 'online' : 'offline') : 'never');

  const anyOnline = khOnline || dosOnline || lcdOnline;

  const globalHtml =
    `<button class="top-pill ${anyOnline ? 'on' : 'off'}">
       ${anyOnline ? 'Online' : 'Offline'}
     </button>`;

  const dosHtml =
    `<button class="top-pill ${dosOnline ? 'on' : 'off'}">
       DOS ${dosOnline ? 'ON' : 'OFF'}
     </button>`;

  const lcdHtml =
    `<button class="top-pill ${lcdOnline ? 'on' : 'off'}">
       LCD ${lcdOnline ? 'ON' : 'OFF'}
     </button>`;

  const khHtml =
    `<button class="top-pill ${khOnline ? 'on' : 'off'}">
       KH ${khOnline ? 'ON' : 'OFF'}
     </button>`;

  return { khHtml, dosHtml, lcdHtml, globalHtml };
}*/


// Carregar lista de dispositivos vinculados (KH/LCD/DOS)
async function loadDevices() {
  const container = document.getElementById('deviceList');
  if (!container) return;

  container.innerHTML = '<div class="small-text">Carregando dispositivos...</div>';

  try {
    const res = await apiFetch('/api/v1/user/devices', { method: 'GET' });
    if (!res.ok) {
      container.innerHTML = '<div class="small-text">Erro ao carregar dispositivos.</div>';
      return;
    }

    const data    = await res.json();
    const devices = data?.data || [];

    console.log('ACCOUNT /user/devices RAW:', devices);

    if (!devices.length) {
      container.innerHTML = '<div class="small-text">Nenhum dispositivo vinculado ainda.</div>';
      return;
    }

    // pega o KH/DOS/LCD principais
    const kh  = devices.find(d => d.type === 'KH');
    const dos = devices.find(d => d.type === 'DOSER');
    const lcd = devices.find(d => d.type === 'LCD');

    console.log('ACCOUNT LCD OBJECT:', lcd);


    // KH sempre via lastSeen mesmo
    const khOnline = kh ? computeOnlineFromLastSeen(kh.lastSeen || kh.last_seen) : false;

    // DOS: usa dosingStatus se vier, senão lastSeen
    const dosStatusFromApi = dos?.dosingStatus ?? dos?.dosing_status ?? null;
    const dosOnline = dosStatusFromApi
      ? (dosStatusFromApi === 'online')
      : (dos ? computeOnlineFromLastSeen(dos.lastSeen || dos.last_seen) : false);

    // LCD: usa lcdStatus se vier, senão lastSeen
    const lcdStatusFromApi = lcd?.lcdStatus ?? lcd?.lcd_status ?? null;
    const lcdOnline = lcdStatusFromApi
      ? (lcdStatusFromApi === 'online')
      : (lcd ? computeOnlineFromLastSeen(lcd.lastSeen || lcd.last_seen) : false);

    // status final que vai para os spans globais da account
    const finalDosStatus = !dos ? 'never' : (dosOnline ? 'online' : 'offline');
    const finalLcdStatus = !lcd ? 'never' : (lcdOnline ? 'online' : 'offline');

    setDosingStatusInDevices(finalDosStatus);
    setLcdStatusInDevices(finalLcdStatus);

    // badge global “Desconhecido / Online / Offline”
    const badge = document.getElementById('deviceStatusBadgeDevices');
    if (badge) {
      if (!kh && !dos && !lcd) {
        badge.className = 'badge badge-off';
        badge.textContent = 'Desconhecido';
      } else if (khOnline || dosOnline || lcdOnline) {
        badge.className = 'badge badge-on';
        badge.textContent = 'Online';
      } else {
        badge.className = 'badge badge-off';
        badge.textContent = 'Offline';
      }
    }


    const frag = document.createDocumentFragment();

    devices.forEach((d) => {
      console.log('device item:', d);
      const div = document.createElement('div');
      div.className = 'device-item';

      const name = d.name || d.id || 'Device';
      const type = d.type || 'KH';
      const fw   = d.firmwareVersion || 'N/A';

      let iconHtml = '';
      if (type === 'KH') {
        iconHtml = '<span class="icon-kh">KH</span>';
      } else if (type === 'DOSER') {
        iconHtml = '<span class="icon-doser">DOS</span>';
      } else if (type === 'LCD') {
        iconHtml = '<span class="icon-lcd">LCD</span>';
      }

      const left = document.createElement('div');
      left.innerHTML = `
        <strong>${iconHtml} ${name}</strong><br>
        <span class="small-text">FW ${fw}</span>
      `;

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '8px';

      // >>> AQUI passa a ser exatamente a mesma lógica da topbar
      const isOnline = computeOnlineFromLastSeen(d.lastSeen ?? d.last_seen);
      const statusSpan = document.createElement('span');
      statusSpan.className = 'device-status-badge ' + (isOnline ? 'status-online' : 'status-offline');
      statusSpan.textContent = isOnline ? 'Online' : 'Offline';
      right.appendChild(statusSpan);

      const btn = document.createElement('button');
      btn.className = 'btn-small';
      btn.dataset.deviceId = d.deviceId;
      btn.textContent = 'Atualizar';
      if (type === 'KH' && !isOnline) {
        btn.disabled = true;
      }
      right.appendChild(btn);

      div.appendChild(left);
      div.appendChild(right);
      frag.appendChild(div);
    });


    container.innerHTML = '';
    container.appendChild(frag);

    // Botão de atualização OTA (mesmo código que você já tinha)
    container.querySelectorAll('.btn-small[data-device-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const deviceId = btn.getAttribute('data-device-id');
        if (!deviceId) return;
        if (!confirm(`Enviar comando de atualização para ${deviceId}?`)) return;

        try {
          const res = await apiFetch(`/api/v1/dev/device-command/${deviceId}`, {
            method: 'POST',
            body: JSON.stringify({ command: 'ota_update' }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.success) {
            alert(data?.message || 'Erro ao enviar comando de atualização.');
            return;
          }
          alert('Comando de atualização enviado. O dispositivo deve reiniciar em instantes.');
        } catch (err) {
          console.error('Erro ao enviar comando OTA:', err);
          alert('Erro ao enviar comando de atualização.');
        }
      });
    });

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
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
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
    const res  = await apiFetch('/api/v1/account/delete', { method: 'DELETE' });
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

const TIMEZONES = [ /* ... mantém igual ... */ ];

function populateTimezoneSelect() {
  const select = document.getElementById('accountTimezone');
  if (!select) return;

  const sorted = [...TIMEZONES].sort((a, b) => a.name.localeCompare(b.name));

  sorted.forEach((tz) => {
    const opt = document.createElement('option');
    opt.value = tz.name;
    opt.textContent = `${tz.name} (${tz.offset})`;
    select.appendChild(opt);
  });
}

function getDeviceItemHtml(dev) {
  const baseName = dev.name?.trim() || dev.deviceId;

  // ids únicos por deviceId
  const lcdId   = `lcdStatusIcon-${dev.deviceId}`;
  const dosId   = `dosingStatusIcon-${dev.deviceId}`;
  const badgeId = `deviceStatusBadge-${dev.deviceId}`;

  return `
    <div class="device-item">
      <div>
        <div>${baseName}</div>
        <div class="small-text">${dev.type}</div>
      </div>

      <div style="display:flex; gap:6px; align-items:center; font-size:12px;">
        <span id="${badgeId}" class="badge badge-off">Desconhecido</span>

        <span id="${lcdId}" class="badge-off" style="display:none; font-size:12px;">
          LCD OFF
        </span>

        <span id="${dosId}" class="badge-off" style="display:none; font-size:12px;">
          DOS OFF
        </span>
      </div>
    </div>
  `;
}


function renderDevices(devices) {
  const list = document.getElementById('deviceList');
  if (!list) return;

  if (!devices.length) {
    list.innerHTML = '<div class="small-text">Nenhum dispositivo vinculado.</div>';
    return;
  }

  list.innerHTML = devices.map(getDeviceItemHtml).join('');
}


function updatePerDeviceBadges(dev) {
  const badge = document.getElementById(`deviceStatusBadge-${dev.deviceId}`);
  const lcdEl = document.getElementById(`lcdStatusIcon-${dev.deviceId}`);
  const dosEl = document.getElementById(`dosingStatusIcon-${dev.deviceId}`);

  // status geral (lastSeen)
  if (badge) {
    const last = typeof dev.lastSeen === 'number'
      ? dev.lastSeen
      : Date.parse(dev.lastSeen);
    if (!last || Number.isNaN(last)) {
      badge.className = 'badge badge-off';
      badge.textContent = 'Desconhecido';
    } else {
      const diffMin = (Date.now() - last) / 60000;
      if (diffMin < 5) {
        badge.className = 'badge badge-on';
        badge.textContent = 'Online';
      } else {
        badge.className = 'badge badge-off';
        badge.textContent = 'Offline';
      }
    }
  }

  // LCD
  if (lcdEl) {
    const status = dev.lcdStatus; // mesmo campo que você já usa na topbar
    if (status === undefined || status === null) {
      lcdEl.style.display = 'none';
    } else {
      lcdEl.style.display = 'inline-block';
      if (status === 'online') {
        lcdEl.textContent = 'LCD ON';
        lcdEl.className = 'badge-on';
        lcdEl.title = 'Display remoto conectado';
      } else {
        lcdEl.textContent = 'LCD OFF';
        lcdEl.className = 'badge-off';
        lcdEl.title = 'Display remoto desconectado';
      }
    }
  }

  // DOS
  if (dosEl) {
    const status = dev.dosingStatus;
    if (status === undefined || status === null) {
      dosEl.style.display = 'none';
    } else {
      dosEl.style.display = 'inline-block';
      if (status === 'online') {
        dosEl.textContent = 'DOS ON';
        dosEl.className = 'badge-on';
        dosEl.title = 'Dosadora conectada';
      } else {
        dosEl.textContent = 'DOS OFF';
        dosEl.className = 'badge-off';
        dosEl.title = 'Dosadora desconectada';
      }
    }
  }
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

  const mirror = document.querySelector('.devices-topbar-mirror');
  if (mirror) {
    mirror.innerHTML = getDevicesStatusBadgesHtml();
  }

  loadAccountProfile();
  loadDevices();
}

document.addEventListener('DOMContentLoaded', () => {
  initTopbar();
  populateTimezoneSelect();
  loadAccountProfile();
});


// Entrada
document.addEventListener('DOMContentLoaded', initAccountPage);
