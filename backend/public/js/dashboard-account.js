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
    const nameInput = document.getElementById('accountName');
    const tzInput = document.getElementById('accountTimezone');
    
    if (emailInput) emailInput.value = user.email || '';
    if (nameInput) nameInput.value = user.name || '';
    if (tzInput) tzInput.value = user.timezone || '';
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
  }
}

// Salvar perfil (nome, timezone)
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
      body: JSON.stringify({ currentPassword, newPassword }),
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

// Mesma regra de online/offline que o Common usa (5 min de janela)
function computeOnlineFromLastSeen(lastSeen) {
  if (!lastSeen) return false;
  const last = typeof lastSeen === 'number' ? lastSeen : Date.parse(lastSeen);
  if (!last || Number.isNaN(last)) return false;
  const diffMs = Date.now() - last;
  const diffMin = diffMs / 60000;
  return diffMin <= 5;
}

// FUNÇÃO HELPER: Renderizar badge de status sincronizado com common.js
function renderDeviceStatusBadge(device) {
  const isOnline = computeOnlineFromLastSeen(device.lastSeen);
  const statusClass = isOnline ? 'status-online' : 'status-offline';
  const statusText = isOnline ? 'Online' : 'Offline';
  
  return `<span class="device-status-badge ${statusClass}">${statusText}</span>`;
}

// Carregar lista de dispositivos vinculados (KH/LCD/DOS)
async function loadDevices() {
  const container = document.getElementById('deviceList');
  if (!container) return;
  
  container.innerHTML = '<div class="small-text">Carregando dispositivos...</div>';
  
  try {
    const res = await apiFetch('/api/v1/devices', { method: 'GET' });
    if (!res.ok) {
      container.innerHTML = '<div class="small-text error">Erro ao carregar dispositivos.</div>';
      return;
    }
    
    const data = await res.json();
    const devices = data?.data || [];
    
    if (!devices.length) {
      container.innerHTML = '<div class="small-text">Nenhum dispositivo vinculado ainda.</div>';
      return;
    }
    
    container.innerHTML = '';
    devices.forEach((device) => {
      const div = document.createElement('div');
      div.className = 'device-item';
      
      // Usar a mesma função de renderização de status badge
      const statusBadge = renderDeviceStatusBadge(device);
      
      div.innerHTML = `
        <div class="device-header">
          <div class="device-info">
            <div class="device-name">${device.name || 'N/A'}</div>
            <div class="device-id small-text">${device._id || 'N/A'}</div>
          </div>
          <div class="device-actions">
            ${statusBadge}
            <button class="btn-update" onclick="updateDevice('${device._id}')">Atualizar</button>
          </div>
        </div>
      `;
      
      container.appendChild(div);
    });
  } catch (err) {
    console.error('Erro ao carregar dispositivos:', err);
    container.innerHTML = '<div class="small-text error">Erro ao carregar dispositivos.</div>';
  }
}

// Função stub para update (será implementada conforme necessário)
function updateDevice(deviceId) {
  alert(`Atualizar dispositivo: ${deviceId}`);
}

// Inicializa tudo na página
document.addEventListener('DOMContentLoaded', () => {
  initTopbar();
  loadAccountProfile();
  loadDevices();
});