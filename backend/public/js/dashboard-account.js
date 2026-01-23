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

async function checkFirmwareStatusForDevice(deviceId, statusSpan, btn) {
  try {
    const res  = await apiFetch(`/api/v1/dev/device-firmware-status/${deviceId}`, {
      method: 'GET',
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      statusSpan.textContent = 'Erro';
      statusSpan.className   = 'device-status-badge status-error';
      btn.disabled = true;
      btn.classList.add('btn-disabled');
      return;
    }

    const { currentVersion, latestVersion, upToDate } = data.data || {};

    const curNoBin  = (currentVersion || '').replace(/\.bin$/i, '');
    const latestNoBin = (latestVersion || '').replace(/\.bin$/i, '');

    // Sem firmware novo
    if (upToDate || !latestVersion || currentVersion === latestVersion) {
      statusSpan.textContent = '';
      statusSpan.className   = 'device-status-badge';

      btn.disabled = true;
      btn.classList.add('btn-disabled');
      btn.textContent = 'Atualizado';
      return;
    }

    // Há firmware mais novo → mostra à esquerda qual é e habilita botão
    statusSpan.textContent = `Novo: ${latestNoBin}`;
    statusSpan.className   = 'device-status-badge status-update';

    btn.disabled = false;
    btn.classList.remove('btn-disabled');
    btn.textContent = 'Atualizar';
  } catch (err) {
    console.error('Erro ao consultar firmware (auto):', err);
    statusSpan.textContent = 'Erro';
    statusSpan.className   = 'device-status-badge status-error';
    btn.disabled = true;
    btn.classList.add('btn-disabled');
  }
}

async function autoCheckConnectionForDevice(device) {
  try {
    const url = `/api/v1/user/devices/${device.deviceId}/test-connection`;
    const res = await apiFetch(url, { method: 'GET' });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) return;

    const d = body.data || {};

    // bolinha
    const dot = document.querySelector(
      `.device-status-dot[data-device-id="${device.deviceId}"]`
    );
    if (dot) {
      dot.classList.remove('online', 'offline');
      dot.classList.add(d.online ? 'online' : 'offline');
    }

    const fwBtn = document.querySelector(
      `.btn-fw-update[data-device-id="${device.deviceId}"]`
    );
    if (!fwBtn) return;

    // Regra 1: offline sempre vence
    if (!d.online) {
      fwBtn.disabled = true;
      fwBtn.classList.add('btn-disabled');
      fwBtn.textContent = 'Offline';
      return;
    }

    // Se voltou a ficar online, só reabilita se NÃO estiver marcado como Atualizado
    if (fwBtn.textContent === 'Offline') {
      fwBtn.disabled = false;
      fwBtn.classList.remove('btn-disabled');
      // aqui NÃO força texto, deixa o que checkFirmwareStatus colocou
    }
  } catch (err) {
    console.error('Erro no autoCheckConnectionForDevice:', err);
  }
}


function initPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}


// ===== Modal de Teste de Conexão =====
let connectionModalEl = null;

function ensureConnectionModal() {
  if (connectionModalEl) return connectionModalEl;

  connectionModalEl = document.createElement('div');
  connectionModalEl.id = 'connectionTestModal';
  

  const content = document.createElement('div');
  content.id = 'connectionTestContent';
  content.style.background = 'white';
  content.style.padding = '24px';
  content.style.borderRadius = '12px';
  content.style.maxWidth = '90%';
  content.style.maxHeight = '80%';
  content.style.overflow = 'auto';
  content.style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
  content.textContent = 'Carregando...';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'connectionTestCloseBtn';
  closeBtn.className = 'btn-small';
  closeBtn.textContent = 'OK';
  closeBtn.style.marginTop = '16px';
  closeBtn.onclick = () => {
    connectionModalEl.classList.remove('show');
    setTimeout(() => connectionModalEl.style.display = 'none', 200);  // transição suave
  };

  connectionModalEl.appendChild(content);
  connectionModalEl.appendChild(closeBtn);
  document.body.appendChild(connectionModalEl);  // ← CRUCIAL: root level

  return connectionModalEl;
}


async function openConnectionTestModal(device) {
  const modal   = ensureConnectionModal();
  const content = document.getElementById('connectionTestContent');

  modal.style.display = 'flex'; // ou 'block', conforme seu CSS
  content.textContent = 'Carregando informações de conexão...';

  try {
    const url = `/api/v1/user/devices/${device.deviceId}/test-connection`;

    const res  = await apiFetch(url, { method: 'GET' });
    const body = await res.json().catch(() => null);

    if (!res.ok || !body?.success) {
      content.textContent = body?.message || 'Falha ao testar conexão.';
      return;
    }

    const d    = body.data || {};
    const wifi = d.wifi || {};
    const cloud = d.cloud || {};
    const last = d.lastSeen || {};

    content.innerHTML = `
      <p><strong>Dispositivo:</strong> ${d.deviceId || device.deviceId}</p>
      <p><strong>Tipo:</strong> ${d.deviceType || device.type}</p>
      <p><strong>Online:</strong> ${d.online ? 'Sim' : 'Não'}</p>
      <p><strong>Wi‑Fi:</strong> ${wifi.status || 'desconhecido'}${
        wifi.rssi != null ? ` (RSSI ${wifi.rssi} dBm)` : ''
      }</p>
      <p><strong>Cloud:</strong> ${cloud.status || 'desconhecido'}</p>
      <p><strong>Último contato:</strong> ${
        last.ago || '-'
      }${last.iso ? ` (${last.iso})` : ''}</p>
    `;

    // Atualiza bolinha de status na lista
    const dot = document.querySelector(
      `.device-status-dot[data-device-id="${device.deviceId}"]`
    );
    if (dot) {
      dot.classList.remove('online', 'offline');
      dot.classList.add(d.online ? 'online' : 'offline');
    }

    // Bloqueia Atualizar se offline
    const fwBtn = document.querySelector(
      `.btn-fw-update[data-device-id="${device.deviceId}"]`
    );
    if (fwBtn) {
      if (!d.online) {
        fwBtn.disabled = true;
        fwBtn.classList.add('btn-disabled');
        fwBtn.textContent = 'Offline';
      } else {
        // se só estava Offline, reabilita; não mexe em "Atualizado"
        if (fwBtn.textContent === 'Offline') {
          fwBtn.disabled = false;
          fwBtn.classList.remove('btn-disabled');
        }
      }
    }

  } catch (err) {
    console.error('Erro ao testar conexão:', err);
    content.textContent = 'Erro ao testar conexão.';
  }
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

    console.log('ACCOUNT /user/devices RAW:', devices);

    if (!devices.length) {
      container.innerHTML = '<div class="small-text">Nenhum dispositivo vinculado ainda.</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    devices.forEach((d) => {
      console.log('device item:', d);
      const div = document.createElement('div');
      div.className = 'device-item';

      const type = d.type || 'KH';
      let name;

      if (d.deviceId) {
        const parts = d.deviceId.split('-'); // ['RBS','LCD','7C2C...']

        if (parts.length >= 2) {
          // KH → "RBS-KH", LCD → "RBS-LCD", DOSER → "RBS-DOSER"
          name = `${parts[0]}-${parts[1]}`;
        } else {
          name = d.deviceId;
        }
      } else {
        name = d.name || 'Device';
      }

      const rawFw = d.firmwareVersion || 'N/A';
      const fw    = rawFw.replace(/\.bin$/i, '');

      let iconHtml = '';
      if (type === 'KH') {
        iconHtml = '<span class="icon-kh"></span>';
      } else if (type === 'DOSER') {
        iconHtml = '<span class="icon-doser"></span>';
      } else if (type === 'LCD') {
        iconHtml = '<span class="icon-lcd"></span>';
      }

      const left = document.createElement('div');
      left.innerHTML = `
        <strong>
          ${iconHtml} ${name}
          <span class="device-status-dot offline"
                data-device-id="${d.deviceId}"></span>
        </strong><br>
        <span class="small-text">FW ${fw}</span>
      `;


      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '8px';

      // span de status para firmware
      const statusSpan = document.createElement('span');
      statusSpan.className = 'device-status-badge';
      statusSpan.setAttribute('data-device-id', d.deviceId);
      statusSpan.textContent = 'Verificando...';
      right.appendChild(statusSpan);

      const fwBtn = document.createElement('button');
      fwBtn.className = 'btn-small btn-fw-update';
      fwBtn.dataset.deviceId = d.deviceId;
      fwBtn.textContent = 'Atualizar';
      fwBtn.disabled = true;
      fwBtn.classList.add('btn-disabled');
      right.appendChild(fwBtn);

      // 🔹 Botão Testar conexão
      const testBtn = document.createElement('button');
      testBtn.className = 'btn-small';
      testBtn.textContent = 'Testar conexão';
      testBtn.addEventListener('click', () => {
        openConnectionTestModal({
          deviceId: d.deviceId,
          type: d.type,
          name: d.name,
        });
      });
      right.appendChild(testBtn);

      // dispara checagem automática ao carregar a lista
      checkFirmwareStatusForDevice(d.deviceId, statusSpan, fwBtn);
      autoCheckConnectionForDevice(d);


      div.appendChild(left);
      div.appendChild(right);
      frag.appendChild(div);
    });


    container.innerHTML = '';
    container.appendChild(frag);

    // Botão de atualização OTA (mesmo código que você já tinha)
      container.querySelectorAll('.btn-fw-update[data-device-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const deviceId = btn.getAttribute('data-device-id');
        if (!deviceId) return;


        // Se texto indicar Offline, não segue
        if (btn.textContent === 'Offline') {
          alert('Este dispositivo está offline. Conecte-o antes de iniciar a atualização.');
          return;
        }


        const statusSpan = container.querySelector(
          `.device-status-badge[data-device-id="${deviceId}"]`
        );


        if (statusSpan) {
          statusSpan.innerHTML = '<span class="spinner"></span> Verificando...';
        }

        try {
          const res = await apiFetch(`/api/v1/dev/device-firmware-status/${deviceId}`, {
            method: 'GET',
          });
          const data = await res.json().catch(() => null);

          if (!res.ok || !data?.success) {
            alert(data?.message || 'Erro ao consultar firmware.');
            if (statusSpan) statusSpan.textContent = 'Erro';
            return;
          }

          const { currentVersion, latestVersion, upToDate } = data.data;

          const curNoBin    = (currentVersion || '').replace(/\.bin$/i, '');
          const latestNoBin = (latestVersion  || '').replace(/\.bin$/i, '');

          if (!upToDate) {
            if (statusSpan) {
              statusSpan.textContent = `Atualização: ${curNoBin || 'desconhecida'} → ${latestNoBin}`;
              statusSpan.className   = 'device-status-badge status-update';
            }

            const wantUpdate = confirm(
              `Nova versão disponível para este dispositivo.\n\n` +
              `Versão atual: ${curNoBin || 'desconhecida'}\n` +
              `Versão nova:  ${latestNoBin}\n\n` +
              `Deseja iniciar a atualização agora?`
            );

            if (wantUpdate) {
              try {
                if (statusSpan) {
                  statusSpan.innerHTML = '<span class="spinner"></span> Atualizando...';
                  statusSpan.className = 'device-status-badge status-update';
                }

                const resUpdate = await apiFetch(`/api/v1/user/devices/${deviceId}/commands`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'otaupdate',
                    payload: null,
                  }),
                });

                const dataUpdate = await resUpdate.json().catch(() => null);

                if (!resUpdate.ok || !dataUpdate?.success) {
                  alert(dataUpdate?.message || 'Erro ao iniciar atualização.');
                  if (statusSpan) {
                    statusSpan.textContent = 'Erro';
                    statusSpan.className = 'device-status-badge status-error';
                  }
                  return;
                }

                alert('Atualização iniciada. O dispositivo pode reiniciar durante o processo.');

                // opcional: reconsultar status depois de alguns segundos
                setTimeout(() => {
                  checkFirmwareStatusForDevice(deviceId, statusSpan, btn);
                }, 8000);
              } catch (err) {
                console.error('Erro ao iniciar atualização', err);
                alert('Erro ao iniciar atualização.');
                if (statusSpan) {
                  statusSpan.textContent = 'Erro';
                  statusSpan.className = 'device-status-badge status-error';
                }
              }
            }
          } else {
            if (statusSpan) {
              statusSpan.textContent = '';
              statusSpan.className   = 'device-status-badge';
            }
            btn.disabled = true;
            btn.classList.add('btn-disabled');
            btn.textContent = 'Atualizado'; 

          }

        } catch (err) {
          console.error('Erro ao consultar firmware:', err);
          if (statusSpan) {
            statusSpan.textContent = 'Erro';
            statusSpan.className = 'device-status-badge status-error';
          }
          alert('Erro ao consultar firmware.');
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

document.addEventListener('DOMContentLoaded', () => {
  initTopbar();            // monta topbar padrão
  initAccountTopbar();     // marca menu Minha conta (se ainda quiser)
  populateTimezoneSelect();
  loadAccountProfile();
  loadDevices();
  initPasswordToggles(); 

  document.getElementById('btnSaveProfile')
    ?.addEventListener('click', (e) => { e.preventDefault(); saveProfile(); });
  document.getElementById('btnChangePassword')
    ?.addEventListener('click', (e) => { e.preventDefault(); changePassword(); });
  document.getElementById('btnExportData')
    ?.addEventListener('click', (e) => { e.preventDefault(); exportData(); });
  document.getElementById('btnDeleteAccount')
    ?.addEventListener('click', (e) => { e.preventDefault(); deleteAccount(); });

});

