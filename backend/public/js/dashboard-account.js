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

    if (!devices.length) {
      container.innerHTML = '<div class="small-text">Nenhum dispositivo vinculado ainda.</div>';
      return;
    }

    const dosingTopEl = document.getElementById('dosingStatusIcon');
    const dosingClone = dosingTopEl ? dosingTopEl.cloneNode(true) : null;
    if (dosingClone) {
      dosingClone.id = ''; // evita id duplicado
      dosingClone.style.fontSize = '12px';
      dosingClone.style.marginRight = '8px';
    }

    const frag = document.createDocumentFragment();

    devices.forEach((d) => {
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


      if (type === 'DOSER' && dosingClone) {
        // clona de novo pra não reutilizar o mesmo nó
        const badge = dosingClone.cloneNode(true);
        right.appendChild(badge);
      } else {
        // fallback: badge simples baseado em online
        const online = !!d.online;
        const span = document.createElement('span');
        span.className = online ? 'badge-on' : 'badge-off';
        span.style.marginRight = '8px';
        span.textContent = online ? 'Online' : 'Offline';
        right.appendChild(span);
      }

      const btn = document.createElement('button');
      btn.className = 'btn-small';
      btn.dataset.deviceId = d.deviceId;
      btn.textContent = 'Atualizar';
      if (type === 'KH' && !d.online) {
        btn.disabled = true;
      }
      right.appendChild(btn);

      div.appendChild(left);
      div.appendChild(right);
      frag.appendChild(div);
    });


    container.innerHTML = '';
    container.appendChild(frag);

    // Botão de atualização OTA (mantido)
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
