const { ipcRenderer } = require('electron');

const profilesList = document.getElementById('profiles-list');
const modalTitle = document.getElementById('modal-title');
const nameInput = document.getElementById('profile-name-input');
const proxyInput = document.getElementById('profile-proxy-input');
const platformInput = document.getElementById('profile-platform-input');
const avatarPreview = document.getElementById('avatar-preview');
const avatarImg = document.getElementById('avatar-img');
const avatarLetter = document.getElementById('avatar-letter');
const avatarInput = document.getElementById('avatar-input');

const overlayIds = [  'workspace-overlay',  'quick-replies-overlay',
  'modal-overlay',
  'update-overlay',
  'downloads-overlay',
];

const defaultState = {
  profiles: [],
  quickReplies: [],
  analyticsEvents: [],
};

let workspaceState = ipcRenderer.sendSync('workspace-get-state') || { currentId: 'default', workspaces: [], data: defaultState };
let workspaceData = normalizeWorkspaceData(workspaceState.data);
let profiles = normalizeProfiles(workspaceData.profiles);
let activeProfileId = profiles[0]?.id || null;
let downloads = [];
let updateState = { status: 'idle', progress: 0, message: '' };
let appLocked = false;
let hasLockPassword = false;
let isDarkMode = true;
let editingProfile = null;
let tempAvatarPath = null;

function normalizeWorkspaceData(data = {}) {
  return {
    profiles: Array.isArray(data.profiles) ? data.profiles : [],
    quickReplies: Array.isArray(data.quickReplies) ? data.quickReplies : [],
    analyticsEvents: Array.isArray(data.analyticsEvents) ? data.analyticsEvents : [],
  };
}
function normalizeProfiles(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) {
    return [{ id: String(Date.now()), name: 'Nick 1', partition: `persist:nick_${Date.now()}`, platform: 'zalo' }];
  }
  return arr.map((p) => ({ ...p, platform: p.platform || 'zalo', partition: p.partition || `persist:nick_${p.id}` }));
}
function persistWorkspace() {
  workspaceData.profiles = profiles;
  workspaceData = normalizeWorkspaceData(workspaceData);
  workspaceState = ipcRenderer.sendSync('workspace-save-data', workspaceData);
  workspaceData = normalizeWorkspaceData(workspaceState.data);
  profiles = normalizeProfiles(workspaceData.profiles);
  if (!profiles.some((p) => p.id === activeProfileId)) activeProfileId = profiles[0]?.id || null;
}
function trackEvent(type, payload = {}) {
  workspaceData.analyticsEvents.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, type, payload, createdAt: Date.now() });
  workspaceData.analyticsEvents = workspaceData.analyticsEvents.slice(0, 120);
  persistWorkspace();
}
function openOverlay(id) {
  const el = document.getElementById(id);
  if (el) {
    ipcRenderer.send('set-browserview-visibility', false);
    el.style.display = 'flex';
  }
}

function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
  
  // Kiểm tra thật kỹ xem còn overlay nào đang mở thật sự không
  const stillOpen = overlayIds.some((overlayId) => {
    const target = document.getElementById(overlayId);
    return target && target.style.display === 'flex';
  });
  
  // Nếu không còn overlay nào che chắn, PHẢI mở lại quyền thao tác và hiển thị cho Zalo
  if (!stillOpen) {
    ipcRenderer.send('set-browserview-visibility', true);
  }
}
function escapeHtml(s) { return String(s || '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function platformIcon(platform) { return { zalo: 'Z', telegram: '✈', messenger: 'M', fanpage: '🚩', whatsapp: 'W', teams: 'T', gmail: 'G', tiktok: '🎵' }[platform || 'zalo'] || 'A'; }function formatDate(ts) { return new Date(ts || Date.now()).toLocaleString('vi-VN'); }
function getActiveProfile() { return profiles.find((p) => p.id === activeProfileId) || profiles[0] || null; }
function getCurrentWorkspaceName() { return workspaceState.workspaces.find((w) => w.id === workspaceState.currentId)?.name || 'Workspace'; }
function migrateLegacyProfiles() {
  if (workspaceData.profiles.length) return;
  try {
    const saved = localStorage.getItem('mp_profiles');
    if (saved) {
      const legacyProfiles = JSON.parse(saved);
      if (Array.isArray(legacyProfiles) && legacyProfiles.length) {
        profiles = normalizeProfiles(legacyProfiles);
        workspaceData.profiles = profiles;
      }
    }
  } catch (e) { }
  if (!workspaceData.quickReplies.length) {
    try {
      const settings = ipcRenderer.sendSync('get-settings');
      workspaceData.quickReplies = settings.quickReplies || [];
    } catch (e) { }
  }
  persistWorkspace();
}

function renderSidebar() {
  profilesList.innerHTML = '';
  profiles.forEach((p) => {
    const btn = document.createElement('div');
    btn.className = `profile-btn ${p.id === activeProfileId ? 'active' : ''}`;
    btn.title = `${p.name} (${p.platform || 'zalo'})`;
    const span = document.createElement('span');
    span.innerText = p.avatar ? '' : platformIcon(p.platform);
    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar.startsWith('http') ? p.avatar : `file://${String(p.avatar).replace(/\\/g, '/')}`;
      img.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover;position:absolute;inset:0;';
      btn.appendChild(img);
    } else btn.appendChild(span);
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.id = `badge-${p.id}`;
    badge.innerText = '0';
    btn.appendChild(badge);
    btn.onclick = () => !appLocked && switchProfile(p.id);
    btn.oncontextmenu = (e) => { e.preventDefault(); if (!appLocked) openModal(p); };
    profilesList.appendChild(btn);
  });
}
function switchProfile(id) {
  activeProfileId = id;
  renderSidebar();
  const profile = getActiveProfile();
  if (profile) ipcRenderer.send('switch-profile', profile);
}
function openModal(profileToEdit = null) {
  editingProfile = profileToEdit;
  tempAvatarPath = profileToEdit ? profileToEdit.avatar : null;
  modalTitle.innerText = profileToEdit ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản';
  nameInput.value = profileToEdit ? profileToEdit.name : '';
  proxyInput.value = profileToEdit?.proxy || '';
  platformInput.value = profileToEdit?.platform || 'zalo';
  document.getElementById('modal-delete').style.display = profileToEdit ? 'inline-flex' : 'none';
  updateAvatarPreview();
  openOverlay('modal-overlay');
  nameInput.focus();
}
function updateAvatarPreview() {
  if (tempAvatarPath) {
    avatarImg.src = tempAvatarPath.startsWith('http') ? tempAvatarPath : `file://${String(tempAvatarPath).replace(/\\/g, '/')}`;
    avatarImg.style.display = 'block';
    avatarLetter.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarLetter.style.display = 'block';
    avatarLetter.innerText = platformIcon(platformInput.value || 'zalo');
  }
}

function renderWorkspaces() {
  const list = document.getElementById('workspace-list');
  if (!workspaceState.workspaces.length) {
    list.innerHTML = '<div class="empty-state">Chưa có workspace.</div>';
    return;
  }
  list.innerHTML = workspaceState.workspaces.map((workspace) => `
    <div class="workspace-item">
      <div class="row"><div><div class="title-lg">${escapeHtml(workspace.name)}</div><div class="muted">${workspace.id} • ${formatDate(workspace.createdAt)}</div></div><button class="modal-btn ${workspace.id === workspaceState.currentId ? 'save' : 'cancel'}" data-workspace="${workspace.id}">${workspace.id === workspaceState.currentId ? 'Đang dùng' : 'Chuyển'}</button></div>
    </div>`).join('');
  list.querySelectorAll('[data-workspace]').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-workspace');
      if (id === workspaceState.currentId) return;
      workspaceState = ipcRenderer.sendSync('workspace-switch', id);
      workspaceData = normalizeWorkspaceData(workspaceState.data);
      profiles = normalizeProfiles(workspaceData.profiles);
      activeProfileId = profiles[0]?.id || null;
      renderAll();
      if (activeProfileId) switchProfile(activeProfileId);
      trackEvent('workspace_switch', { workspaceId: id });
    };
  });
}

function renderQuickReplies() {
  const quickReplies = workspaceData.quickReplies || [];
  const list = document.getElementById('quick-replies-list');
  if (!quickReplies.length) {
    list.innerHTML = '<div class="empty-state">Chưa có tin nhắn mẫu nào.</div>';
    return;
  }
  list.innerHTML = quickReplies.map((reply, index) => `
    <div class="download-item">
      <div class="row"><div class="title-sm">/${index + 1}</div><div><button class="modal-btn cancel" data-edit="${index}">Sửa</button><button class="modal-btn warn" data-delete="${index}">Xóa</button></div></div>
      <div class="muted mt-12">${escapeHtml(reply.message)}</div>
    </div>`).join('');
  list.querySelectorAll('[data-edit]').forEach((button) => {
    button.onclick = () => {
      const index = Number(button.getAttribute('data-edit'));
      const next = prompt('Sửa quick reply', workspaceData.quickReplies[index].message);
      if (next && next.trim()) {
        workspaceData.quickReplies[index].message = next.trim();
        persistWorkspace();
        trackEvent('quick_reply_updated', { index });
        renderQuickReplies();
      }
    };
  });
  list.querySelectorAll('[data-delete]').forEach((button) => {
    button.onclick = () => {
      const index = Number(button.getAttribute('data-delete'));
      workspaceData.quickReplies.splice(index, 1);
      persistWorkspace();
      trackEvent('quick_reply_deleted', { index });
      renderQuickReplies();
    };
  });
}
function addQuickReplyFromInput() {
  const input = document.getElementById('quick-reply-input');
  const message = input.value.trim();
  if (!message) return;
  workspaceData.quickReplies.push({ message });
  persistWorkspace();
  trackEvent('quick_reply_created', { length: workspaceData.quickReplies.length });
  input.value = '';
  renderQuickReplies();
}

function renderDownloads() {
  const list = document.getElementById('downloads-list');
  if (!list) return;
  if (!downloads.length) {
    list.innerHTML = '<p class="download-meta">Chưa có file tải xuống.</p>';
    return;
  }
  list.innerHTML = downloads.slice().reverse().map((d) => {
    const pct = d.totalBytes ? Math.round((d.receivedBytes / d.totalBytes) * 100) : (d.status === 'completed' ? 100 : 0);
    return `<div class="download-item"><div class="title-sm">${escapeHtml(d.filename || 'download')}</div><div class="download-meta">${escapeHtml(d.statusText || d.status || '')} ${pct ? `• ${pct}%` : ''}</div><div class="progress mt-12"><span style="width:${pct}%"></span></div><div class="row mt-12"><button class="modal-btn cancel" data-folder="${d.id}">Thư mục</button><div><button class="modal-btn cancel" data-open="${d.id}">Mở</button><button class="modal-btn warn" data-remove="${d.id}">Xóa</button></div></div></div>`;
  }).join('');
  list.querySelectorAll('[data-open]').forEach((btn) => btn.onclick = () => ipcRenderer.send('open-download', btn.getAttribute('data-open')));
  list.querySelectorAll('[data-folder]').forEach((btn) => btn.onclick = () => ipcRenderer.send('show-download-in-folder', btn.getAttribute('data-folder')));
  list.querySelectorAll('[data-remove]').forEach((btn) => btn.onclick = () => {
    ipcRenderer.send('remove-download', btn.getAttribute('data-remove'));
    downloads = downloads.filter((item) => item.id !== btn.getAttribute('data-remove'));
    renderDownloads();
  });
}
function renderUpdate() {
  document.getElementById('update-status').innerText = updateState.message || 'Sẵn sàng kiểm tra cập nhật.';
  document.getElementById('update-progress').style.width = `${updateState.progress || 0}%`;
  document.getElementById('update-download').style.display = updateState.status === 'available' ? 'inline-flex' : 'none';
  document.getElementById('update-install').style.display = updateState.status === 'downloaded' ? 'inline-flex' : 'none';
}

function renderAll() {
  renderSidebar();
  renderWorkspaces();
  renderQuickReplies();
  renderDownloads();
  renderUpdate();
}

avatarPreview.onclick = () => avatarInput.click();
avatarInput.onchange = (e) => { if (e.target.files && e.target.files[0]) { tempAvatarPath = e.target.files[0].path; updateAvatarPreview(); } };
platformInput.addEventListener('change', updateAvatarPreview);
nameInput.addEventListener('input', updateAvatarPreview);

document.querySelectorAll('[data-close]').forEach((button) => { button.onclick = () => closeOverlay(button.getAttribute('data-close')); });
document.getElementById('btn-add-profile').onclick = () => openModal();
document.getElementById('modal-cancel').onclick = () => closeOverlay('modal-overlay');
document.getElementById('modal-delete').onclick = () => {
  if (!editingProfile) return;
  if (profiles.length <= 1) return alert('Phải có ít nhất 1 tài khoản.');
  if (!confirm(`Xóa tài khoản ${editingProfile.name}?`)) return;
  profiles = profiles.filter((profile) => profile.id !== editingProfile.id);
  ipcRenderer.send('delete-profile', editingProfile.id);
  activeProfileId = profiles[0]?.id || null;
  persistWorkspace();
  trackEvent('profile_deleted', { id: editingProfile.id });
  closeOverlay('modal-overlay');
  renderAll();
  if (activeProfileId) switchProfile(activeProfileId);
};
document.getElementById('modal-save').onclick = () => {
  const name = nameInput.value.trim() || `Tài khoản ${profiles.length + 1}`;
  if (editingProfile) {
    editingProfile.name = name;
    editingProfile.proxy = proxyInput.value.trim();
    editingProfile.platform = platformInput.value;
    editingProfile.avatar = tempAvatarPath;
    ipcRenderer.send('update-profile-settings', editingProfile);
    trackEvent('profile_updated', { id: editingProfile.id });
  } else {
    const id = String(Date.now());
    profiles.push({ id, name, avatar: tempAvatarPath, partition: `persist:nick_${id}`, platform: platformInput.value, proxy: proxyInput.value.trim() });
    activeProfileId = id;
    trackEvent('profile_created', { id });
  }
  persistWorkspace();
  closeOverlay('modal-overlay');
  renderAll();
  if (activeProfileId) switchProfile(activeProfileId);
};

const btnSidebarBack = document.getElementById('btn-sidebar-back');
if (btnSidebarBack) {
  btnSidebarBack.onclick = (e) => {
    e.preventDefault();
        btnSidebarBack.style.transform = 'translateX(-4px)';
    setTimeout(() => btnSidebarBack.style.transform = 'translateX(0)', 150);
        ipcRenderer.send('go-back-page');
  };
}
const btnSidebarReload = document.getElementById('btn-sidebar-reload');
if (btnSidebarReload) {
  btnSidebarReload.onclick = () => {
    // Tạo hiệu ứng xoay 180 độ cho mượt mắt khi click
    btnSidebarReload.style.transform = 'rotate(180deg)';
    setTimeout(() => btnSidebarReload.style.transform = 'rotate(0deg)', 300);
    
    // Bắn tín hiệu sang main process để reload BrowserView đang active
    ipcRenderer.send('reload-page');
  };
}
document.getElementById('workspace-create-btn').onclick = () => {
  const input = document.getElementById('workspace-name-input');
  const name = input.value.trim() || 'Workspace mới';
  workspaceState = ipcRenderer.sendSync('workspace-create', name);
  workspaceData = normalizeWorkspaceData(workspaceState.data);
  profiles = normalizeProfiles(workspaceData.profiles);
  activeProfileId = profiles[0]?.id || null;
  input.value = '';
  trackEvent('workspace_created', { name });
  renderAll();
  if (activeProfileId) switchProfile(activeProfileId);
};

document.getElementById('quick-reply-add').onclick = addQuickReplyFromInput;
document.getElementById('quick-reply-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    addQuickReplyFromInput();
  }
});

document.getElementById('update-check').onclick = () => ipcRenderer.send('check-for-updates');
document.getElementById('update-download').onclick = () => ipcRenderer.send('download-update');
document.getElementById('update-install').onclick = () => ipcRenderer.send('install-update');

function showLockOverlay(setupMode = false) {
  appLocked = true;
  openOverlay('lock-overlay');
  document.getElementById('lock-password-confirm').style.display = setupMode ? 'block' : 'none';
  document.getElementById('lock-hint').innerText = setupMode ? 'Tạo mật khẩu khóa ứng dụng.' : 'Nhập mật khẩu để mở khóa.';
  document.getElementById('lock-submit').innerText = setupMode ? 'Tạo khóa' : 'Mở khóa';
  document.getElementById('lock-password').value = '';
  document.getElementById('lock-password-confirm').value = '';
}
function hideLockOverlay() {
  appLocked = false;
  closeOverlay('lock-overlay');
}
document.getElementById('lock-submit').onclick = () => {
  const password = document.getElementById('lock-password').value;
  const confirmPassword = document.getElementById('lock-password-confirm').value;
  if (!hasLockPassword) {
    if (!password || password !== confirmPassword) return alert('Mật khẩu không khớp.');
    ipcRenderer.send('set-lock-password', password);
  } else ipcRenderer.send('unlock-app', password);
};
document.getElementById('lock-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('lock-submit').click(); });
document.getElementById('lock-password-confirm').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('lock-submit').click(); });

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
    e.preventDefault();
    ipcRenderer.send('lock-app');
  }
});

ipcRenderer.on('downloads-list', (_, list) => { downloads = list || []; renderDownloads(); });
ipcRenderer.on('download-updated', (_, item) => { downloads = downloads.filter((entry) => entry.id !== item.id).concat(item); renderDownloads(); });
ipcRenderer.on('update-state', (_, state) => { updateState = state; renderUpdate(); if (state.status === 'available' || state.status === 'downloaded') openOverlay('update-overlay'); });
ipcRenderer.on('lock-state', (_, state) => {
  hasLockPassword = !!state.hasPassword;
  const shieldButton = document.getElementById('btn-shield');
  if (shieldButton) shieldButton.classList.toggle('active', !!state.zadarkShield);
  if (state.locked) showLockOverlay(!hasLockPassword);
});
ipcRenderer.on('unlock-result', (_, result) => { if (result.ok) { hasLockPassword = true; hideLockOverlay(); } else alert(result.message || 'Sai mật khẩu.'); });
ipcRenderer.on('update-profile-badge', (_, { id, count }) => {
  const badge = document.getElementById(`badge-${id}`);
  if (badge) {
    badge.innerText = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
});
ipcRenderer.on('update-profile-info', (_, payload) => {
  const profile = profiles.find((entry) => entry.id === payload.id);
  if (!profile) return;
  let changed = false;
  if (payload.name && profile.name.startsWith('Tài khoản')) { profile.name = payload.name; changed = true; }
  if (payload.avatarUrl && !profile.avatar) { profile.avatar = payload.avatarUrl; changed = true; }
  if (changed) {
    persistWorkspace();
    renderSidebar();
  }
});

const settings = ipcRenderer.sendSync('get-settings');
isDarkMode = settings.isDarkMode;
hasLockPassword = !!settings.hasLockPassword;
document.body.className = isDarkMode ? 'dark-mode' : 'light-mode';
const sunIcon = document.getElementById('icon-sun');
const moonIcon = document.getElementById('icon-moon');
if (sunIcon) sunIcon.style.display = isDarkMode ? 'none' : 'block';
if (moonIcon) moonIcon.style.display = isDarkMode ? 'block' : 'none';
const pinButton = document.getElementById('btn-pin');
if (pinButton) pinButton.classList.toggle('active', !!settings.alwaysOnTop);
const shieldButton = document.getElementById('btn-shield');
if (shieldButton) shieldButton.classList.toggle('active', !!settings.zadarkShield);

migrateLegacyProfiles();
renderAll();
if (activeProfileId) switchProfile(activeProfileId);
ipcRenderer.send('renderer-ready');
ipcRenderer.send('get-downloads');
if (settings.lockOnStartup) showLockOverlay(!hasLockPassword);
if (!settings.lockOnStartup) {
  unlockAppFromAuth(); 
}
