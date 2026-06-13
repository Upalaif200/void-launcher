'use strict';
/* ═══════════════════════════════════════════════
   VOID LAUNCHER — RENDERER v1.1
   ═══════════════════════════════════════════════ */
const { ipcRenderer, shell } = require('electron');
window.ipcRenderer = ipcRenderer;
const fs = require('fs');
const path = require('path');
let skinview3d;
try { skinview3d = require('skinview3d'); } catch (e) { console.warn('[RENDERER] skinview3d no disponible:', e.message); }
const os = require('os');

// ─────────────────────────────────────────────
// GARBAGE COLLECTION HELPER
// ─────────────────────────────────────────────
function requestGC() {
    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
    }
}

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
const icon = name => `<svg class="icon"><use href="#icon-${name}"/></svg>`;
let cfg = ipcRenderer.sendSync('get-config');
let editingProfileId = null;   // null = crear nuevo
const appVersion = ipcRenderer.sendSync('get-app-version');
document.title = `Void Launcher v${appVersion}`;
document.querySelector('.app-name').textContent = `VOID LAUNCHER v${appVersion}`;

// ─────────────────────────────────────────────
// LOGIN / SESSION STATE
// ─────────────────────────────────────────────
const loginOverlay = document.getElementById('login-overlay');
let neonSession = null;

function showLoginOverlay() {
    loginOverlay.style.display = 'flex';
}
function hideLoginOverlay() { loginOverlay.style.display = 'none'; }

// ── Tab switching inside login
document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.login-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('login-tab-' + tab.dataset.loginTab).classList.add('active');
    });
});

function setLoginError(tab, msg) {
    document.getElementById('login-' + tab + '-error').textContent = msg || '';
}

async function handleLoginResponse(result, tab) {
    if (result.success) {
        neonSession = { username: result.user.username, userId: result.user.id };
        hideLoginOverlay();
        cfg = ipcRenderer.sendSync('get-config');
        updateSocialAvatar();
        return true;
    } else {
        setLoginError(tab, result.error || 'Error desconocido');
        return false;
    }
}

// Sign In
document.getElementById('login-signin-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-signin-username').value.trim();
    const password = document.getElementById('login-signin-password').value;
    if (!username || !password) { setLoginError('signin', 'Completa todos los campos'); return; }
    setLoginError('signin', '');
    const btn = document.getElementById('login-signin-btn');
    btn.disabled = true; btn.textContent = 'Conectando...';
    const result = await ipcRenderer.invoke('social-signin', { username, password });
    btn.disabled = false; btn.textContent = 'Iniciar Sesión';
    handleLoginResponse(result, 'signin');
});

// Sign Up
document.getElementById('login-signup-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-signup-username').value.trim();
    const password = document.getElementById('login-signup-password').value;
    if (!username || !password) { setLoginError('signup', 'Completa todos los campos'); return; }
    if (password.length < 4) { setLoginError('signup', 'Mínimo 4 caracteres'); return; }
    setLoginError('signup', '');
    const btn = document.getElementById('login-signup-btn');
    btn.disabled = true; btn.textContent = 'Creando...';
    const result = await ipcRenderer.invoke('social-register', { username, password });
    btn.disabled = false; btn.textContent = 'Crear Cuenta';
    handleLoginResponse(result, 'signup');
});

// Guest
document.getElementById('login-guest-btn').addEventListener('click', async () => {
    setLoginError('guest', '');
    const btn = document.getElementById('login-guest-btn');
    btn.disabled = true; btn.textContent = 'Conectando...';
    const result = await ipcRenderer.invoke('social-create-guest');
    btn.disabled = false; btn.textContent = 'Entrar como Invitado';
    handleLoginResponse(result, 'guest');
});

// Login DB config
// DB connection is built-in — status is automatic

async function performLogout() {
    try {
        await ipcRenderer.invoke('social-signout');
    } catch (e) {
        console.error('[SOCIAL] Logout error:', e);
    }
    neonSession = null;
    showLoginOverlay();
}
window.socialLogout = performLogout;

async function deleteSocialAccount() {
    if (!confirm('¿Estás seguro? Esta acción eliminará tu cuenta y todos tus datos de la base de datos de forma permanente.')) return;
    if (!confirm('Esta acción no se puede deshacer. ¿Continuar?')) return;
    try {
        await ipcRenderer.invoke('social-signout-with-delete');
    } catch (e) {
        console.error('[SOCIAL] Delete account error:', e);
    }
    neonSession = null;
    showLoginOverlay();
    showToast('Cuenta eliminada permanentemente', 'info');
}

// Session restore on load
(async function restoreSession() {
    const saved = ipcRenderer.sendSync('social-get-session');
    if (saved) {
        const result = await ipcRenderer.invoke('social-restore-session');
        if (result) {
            neonSession = { username: result.username, userId: result.userId };
            return;
        }
    }
    showLoginOverlay();
})();

// ── Skin head avatar (3D isométrico front-left-top) ──
function renderSkinHead(canvas, img, size) {
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const scale = size / 12;
    const L = 5 * scale;
    const cx = size / 2;
    const cy = size / 2;
    const hasHat = img.height === 64;
    const a = 0.577; // tan(30°) — pitch ~30°

    // Draw order: back → front  (top → left → front)

    // Top face (skin: 8,0) — visible on top
    ctx.save();
    ctx.setTransform(1, -a, 1, a, cx - L, cy - L / 2);
    ctx.drawImage(img, 8, 0, 8, 8, 0, 0, L, L);
    ctx.restore();
    if (hasHat) {
        ctx.save();
        ctx.setTransform(1, -a, 1, a, cx - L, cy - L / 2);
        ctx.drawImage(img, 40, 0, 8, 8, 0, 0, L, L);
        ctx.restore();
    }

    // Right face (skin: 0,8) — visible on the front-left
    ctx.save();
    ctx.setTransform(1, a, 0, 1, cx - L, cy - L / 2);
    ctx.drawImage(img, 0, 8, 8, 8, 0, 0, L, L);
    ctx.restore();
    if (hasHat) {
        ctx.save();
        ctx.setTransform(1, a, 0, 1, cx - L, cy - L / 2);
        ctx.drawImage(img, 32, 8, 8, 8, 0, 0, L, L);
        ctx.restore();
    }

    // Front face (skin: 8,8) — visible on the front-right
    ctx.save();
    ctx.setTransform(1, -a, 0, 1, cx, cy);
    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, L, L);
    ctx.restore();
    if (hasHat) {
        ctx.save();
        ctx.setTransform(1, -a, 0, 1, cx, cy);
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, L, L);
        ctx.restore();
    }
}

function updateSocialAvatar() {
    const acc = cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];
    const els = [document.getElementById('social-my-avatar'), document.getElementById('main-account-avatar')].filter(Boolean);
    if (!els.length) return;
    if (!acc || !acc.skinPath || !fs.existsSync(acc.skinPath)) {
        els.forEach(el => { el.innerHTML = '<svg class="icon"><use href="#icon-user"/></svg>'; });
        return;
    }
    try {
        const img = new Image();
        img.onload = () => {
            els.forEach(el => {
                const size = 48;
                const c = document.createElement('canvas');
                renderSkinHead(c, img, size);
                el.innerHTML = '';
                el.style.background = 'none';
                el.style.border = 'none';
                el.style.borderRadius = '4px';
                el.appendChild(c);
                c.style.width = '100%';
                c.style.height = '100%';
            });
        };
        img.src = 'file://' + path.resolve(acc.skinPath);
    } catch (e) {
        els.forEach(el => { el.innerHTML = '<svg class="icon"><use href="#icon-user"/></svg>'; });
    }
}

// ─────────────────────────────────────────────
// AUTO-UPDATER — NOTIFICACIÓN EN UI
// ─────────────────────────────────────────────
const updateNotification = document.getElementById('update-notification');
const updateText = document.getElementById('update-notification-text');
const updateActionBtn = document.getElementById('update-action-btn');
const updateLaterBtn = document.getElementById('update-later-btn');
const updateProgressBar = document.getElementById('update-progress-bar');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateProgressText = document.getElementById('update-progress-text');

const UPDATE_PENDING_KEY = 'void-update-pending';

function showUpdateNotification(version) {
    updateText.textContent = `Nueva versión ${version} disponible`;
    updateNotification.style.display = 'flex';
    updateProgressBar.style.display = 'none';
}

function hideUpdateNotification() {
    updateNotification.style.display = 'none';
    updateProgressBar.style.display = 'none';
    updateProgressFill.style.width = '0%';
    updateProgressText.textContent = '';
}

function showUpdateProgress(percent, bytesPerSecond) {
    updateProgressBar.style.display = 'block';
    updateProgressFill.style.width = `${percent}%`;
    const speed = bytesPerSecond ? ` (${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s)` : '';
    updateProgressText.textContent = `Descargando... ${percent}%${speed}`;
}

ipcRenderer.removeAllListeners('update-available');
ipcRenderer.on('update-available', (_, info) => {
    showUpdateNotification(info.version);
});

ipcRenderer.removeAllListeners('update-progress');
ipcRenderer.on('update-progress', (_, prog) => {
    showUpdateProgress(Math.round(prog.percent), prog.bytesPerSecond);
});

function showModUpdateProgress(progress) {
    const percent = progress.percent || 0;
    const actionText = {
        add: 'Agregando',
        update: 'Actualizando',
        delete: 'Eliminando'
    }[progress.action] || 'Procesando';
    const fileName = progress.path.split('/').pop();
    updateNotification.style.display = 'flex';
    updateProgressBar.style.display = 'block';
    updateProgressFill.style.width = `${percent}%`;
    updateProgressText.textContent = `${actionText} ${fileName}... ${percent}%`;
}

function showModUpdateStatus(status) {
    if (!status.success) {
        showUpdateNotification(`Error: ${status.message}`);
        setTimeout(() => {
            hideUpdateNotification();
        }, 5000);
        return;
    }

    updateNotification.style.display = 'flex';
    updateProgressBar.style.display = 'none';
    updateProgressFill.style.width = '100%';
    updateProgressText.textContent = status.message;
    setTimeout(() => {
        hideUpdateNotification();
    }, 3000);
}

ipcRenderer.removeAllListeners('update-downloaded');
ipcRenderer.on('update-downloaded', () => {
    updateProgressFill.style.width = '100%';
    updateProgressText.textContent = 'Descarga completada. Instalando...';
    setTimeout(() => {
        ipcRenderer.send('install-update');
    }, 500);
});

ipcRenderer.removeAllListeners('mod-update-progress');
ipcRenderer.on('mod-update-progress', (_, progress) => {
    showModUpdateProgress(progress);
});

ipcRenderer.removeAllListeners('mod-update-status');
ipcRenderer.on('mod-update-status', (_, status) => {
    showModUpdateStatus(status);
});

ipcRenderer.removeAllListeners('update-not-available');
ipcRenderer.on('update-not-available', () => {
    localStorage.removeItem(UPDATE_PENDING_KEY);
});

updateActionBtn.addEventListener('click', () => {
    updateActionBtn.textContent = 'Descargando...';
    updateActionBtn.disabled = true;
    ipcRenderer.send('start-update');
});

updateLaterBtn.addEventListener('click', () => {
    hideUpdateNotification();
    localStorage.setItem(UPDATE_PENDING_KEY, 'true');
});

// Re-show notification if update was pending
if (localStorage.getItem(UPDATE_PENDING_KEY) === 'true') {
    showUpdateNotification('...');
    updateText.textContent = 'Hay una actualización pendiente';
}

// ─────────────────────────────────────────────
// SKIN VIEWER 3D
// ─────────────────────────────────────────────
const skinContainer = document.getElementById('skin-container');
const activeAccount = () => cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];
const activeProfile = () => cfg.profiles.find(p => p.id === cfg.activeProfileId) || cfg.profiles[0];

let skinViewer = null;
try {
    skinViewer = new skinview3d.SkinViewer({
        canvas: document.createElement('canvas'),
        width: 220, height: 340,
        skin: 'https://mineskin.org/textures/8/a/8a39f041217642ac9719e7f256247f1f.png'
    });
    skinContainer.appendChild(skinViewer.canvas);
    skinViewer.animation = new skinview3d.IdleAnimation();
    skinViewer.controls.enableZoom = false;
} catch (e) {
    console.warn('[SKIN] Visor 3D no disponible:', e.message);
}

function reloadSkin() {
    const acc = activeAccount();
    if (acc?.skinPath && fs.existsSync(acc.skinPath) && skinViewer) {
        skinViewer.loadSkin(`file://${acc.skinPath}`);
    }
}
reloadSkin();

// ─────────────────────────────────────────────
// HEAVY VIEWS — PAUSE / RESUME
// ─────────────────────────────────────────────
const HEAVY_VIEWS = ['view-social', 'view-mods', 'view-wardrobe'];

function pauseViewProcesses(viewId) {
    switch (viewId) {
        case 'view-social':
            stopFriendPresencePolling();
            break;
        case 'view-wardrobe':
            if (skinEditorActive) closeSkinEditor();
            if (skinViewer) {
                skinViewer.animation = null;
                skinViewer.dispose();
                skinViewer = null;
            }
            break;
    }
}

function resumeViewProcesses(viewId) {
    switch (viewId) {
        case 'view-social':
            if (socialState.connected) startFriendPresencePolling();
            break;
        case 'view-wardrobe':
            if (!skinViewer) {
                try {
                    skinViewer = new skinview3d.SkinViewer({
                        canvas: document.createElement('canvas'),
                        width: 220, height: 340,
                        skin: 'https://mineskin.org/textures/8/a/8a39f041217642ac9719e7f256247f1f.png'
                    });
                    skinContainer.appendChild(skinViewer.canvas);
                    skinViewer.animation = new skinview3d.IdleAnimation();
                    skinViewer.controls.enableZoom = false;
                } catch (e) {
                    console.warn('[SKIN] Visor 3D no disponible al reanudar:', e.message);
                }
            }
            reloadSkin();
            break;
    }
}

function clearHeavyDOM(viewId) {
    const heavyContainers = {
        'view-mods':       '#modpack-results-grid',
        'view-wardrobe':   '#wardrobe-grid',
        'view-social':     '#chat-area-messages'
    };
    const selector = heavyContainers[viewId];
    if (!selector) return;
    const el = document.querySelector(selector);
    if (el && el.children.length > 200) {
        while (el.children.length > 50) el.removeChild(el.firstChild);
        requestGC();
    }
}

// ─────────────────────────────────────────────
// ROUTER DE VISTAS
// ─────────────────────────────────────────────
function navigate(viewId) {
    // Pausar procesos de la vista anterior
    const currentView = document.querySelector('.view.active');
    if (currentView && HEAVY_VIEWS.includes(currentView.id)) {
        pauseViewProcesses(currentView.id);
    }
    if (currentView) clearHeavyDOM(currentView.id);

    // Cambiar vista
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Reanudar procesos de la nueva vista
    if (HEAVY_VIEWS.includes(viewId)) {
        resumeViewProcesses(viewId);
    }

    // Acciones al entrar en cada vista
    if (viewId === 'view-main') refreshMainView();
    if (viewId === 'view-accounts') renderNicknamesList();
    if (viewId === 'view-profiles') { renderProfilesList(); closeEditPanel(); }
    if (viewId === 'view-mods') refreshModsView();
    if (viewId === 'view-install') initInstallView();
    if (viewId === 'view-client') { refreshClientModules(); loadCosmeticsState(); }
    if (viewId === 'view-settings') {
        loadTheme();
        renderTypoSettings();
        renderColorSettings();
        loadBehaviorSettings();
    }
    if (viewId === 'view-wardrobe') {
        if (!skinEditorActive) renderWardrobe();
    }
    if (viewId === 'view-social') {
        cloudRenderFriendsList();
        cloudRenderPendingList();
        cloudRenderConversationsList();
    }
}

document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
});
document.querySelectorAll('.icon-action-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// Tab switching (Instalar Versión)
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(btn.dataset.tab);
        if (panel) panel.classList.add('active');
    });
});

// ─────────────────────────────────────────────
// VENTANA
// ─────────────────────────────────────────────
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
document.getElementById('minimize-btn').addEventListener('click', () => ipcRenderer.send('minimize-app'));

// ─────────────────────────────────────────────
// VISTA PRINCIPAL
// ─────────────────────────────────────────────
function refreshMainView() {
    cfg = ipcRenderer.sendSync('get-config');
    const acc = activeAccount();
    const prof = activeProfile();

    document.getElementById('main-account-name').textContent = acc?.username || 'Sin nickname';
    document.getElementById('main-profile-name').textContent = prof?.name || 'Sin perfil';
    const iconEl = document.getElementById('main-profile-icon');
    if (prof?.icon) { iconEl.textContent = prof.icon; } else { iconEl.innerHTML = icon('gamepad'); }
    document.getElementById('main-profile-version').textContent = prof?.versionId || '─';
    updateSocialAvatar();

    const ram = prof?.ram || '4';
    document.getElementById('ram-slider').value = ram;
    document.getElementById('ram-value').textContent = ram;

    document.getElementById('main-welcome').textContent = `HOLA, ${(acc?.username || 'JUGADOR').toUpperCase()}`;

    // Cargar estado de cosméticos
    loadCosmeticsState();
}

function loadCosmeticsState() {
    const c = cfg.cosmetics || { keystrokes: false, dynamicFov: true, damageTilt: true };
    document.getElementById('toggle-keystrokes').checked = c.keystrokes;
    document.getElementById('toggle-dynamic-fov').checked = c.dynamicFov;
    document.getElementById('toggle-damage-tilt').checked = c.damageTilt;
}

function saveCosmeticsState() {
    const cosmetics = {
        keystrokes: document.getElementById('toggle-keystrokes').checked,
        dynamicFov: document.getElementById('toggle-dynamic-fov').checked,
        damageTilt: document.getElementById('toggle-damage-tilt').checked
    };
    ipcRenderer.send('save-cosmetics', cosmetics);
}

document.getElementById('toggle-keystrokes').addEventListener('change', saveCosmeticsState);
document.getElementById('toggle-dynamic-fov').addEventListener('change', saveCosmeticsState);
document.getElementById('toggle-damage-tilt').addEventListener('change', saveCosmeticsState);

const ramSlider = document.getElementById('ram-slider');
const ramTrackFill = document.getElementById('ram-track-fill');
const ramMaxLabel = document.getElementById('ram-max-label');
let ramDebounce;

function updateRamFill(val) {
    const min = parseInt(ramSlider.min);
    const max = parseInt(ramSlider.max);
    const pct = ((val - min) / (max - min)) * 100;
    ramSlider.style.setProperty('--fill-pct', pct.toFixed(1) + '%');
    document.getElementById('ram-value').textContent = val;
    if (ramTrackFill) ramTrackFill.style.width = pct.toFixed(1) + '%';
}

ramSlider.addEventListener('input', (e) => {
    updateRamFill(e.target.value);
    clearTimeout(ramDebounce);
    ramDebounce = setTimeout(() => {
        const prof = cfg.profiles.find(p => p.id === cfg.activeProfileId);
        if (prof) {
            prof.ram = e.target.value;
            ipcRenderer.sendSync('update-profile', prof);
        }
    }, 150);
});

// Dynamic RAM max (total system RAM - 1GB for OS)
const totalRamGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
const maxRam = Math.max(2, totalRamGB - 1);
if (ramSlider) {
    ramSlider.max = maxRam;
    if (ramMaxLabel) ramMaxLabel.textContent = maxRam + ' GB';
    const val = Math.min(parseInt(ramSlider.value), maxRam);
    ramSlider.value = String(val);
    updateRamFill(val);
}

// Play
const playBtn = document.getElementById('play-btn');
const launchStatusBox = document.getElementById('launch-status-box');
const launchStatusText = document.getElementById('launch-status-text');
const launchProgressFill = document.getElementById('launch-progress-fill');

playBtn.addEventListener('click', () => {
    cfg = ipcRenderer.sendSync('get-config');
    const prof = activeProfile();
    if (!prof?.versionId) {
        alert('El perfil activo no tiene una versión configurada.\nVe a Versiones → edita la versión y elige una.');
        return;
    }
    playBtn.disabled = true;
    playBtn.innerHTML = `${icon('loader')} INICIANDO...`;
    launchStatusBox.style.display = 'block';
    launchStatusText.textContent = 'Preparando lanzamiento...';
    ipcRenderer.send('launch-game', { profileId: prof.id });
});

ipcRenderer.removeAllListeners('launch-status');
ipcRenderer.on('launch-status', (_, { type, data, instances }) => {
    if (type === 'progress') {
        const pct = data.total ? Math.round((data.task / data.total) * 100) : 0;
        launchStatusText.textContent = data.stage || 'Cargando...';
        launchProgressFill.style.width = `${pct}%`;
    } else if (type === 'instances') {
        updateInstanceBadge(data);
    } else if (type === 'close') {
        playBtn.disabled = false;
        playBtn.innerHTML = `${icon('play')} JUGAR`;
        launchStatusBox.style.display = 'none';
        launchProgressFill.style.width = '0%';
        updateInstanceBadge(instances || 0);
    } else if (type === 'error') {
        playBtn.disabled = false;
        playBtn.innerHTML = `${icon('play')} JUGAR`;
        launchStatusText.innerHTML = `${icon('x')} ${data}`;
    }
});

function updateInstanceBadge(count) {
    const badge = document.getElementById('instance-badge');
    const countEl = document.getElementById('instance-count');
    countEl.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

// Skin buttons
document.getElementById('skin-btn').addEventListener('click', async () => {
    const filePath = await ipcRenderer.invoke('open-skin-dialog');
    if (!filePath) return;
    skinViewer.loadSkin(`file://${filePath}`);
    const acc = activeAccount();
    if (acc) ipcRenderer.sendSync('update-account-skin', { id: acc.id, skinPath: filePath });
    cfg = ipcRenderer.sendSync('get-config');
});
document.getElementById('noveskin-btn').addEventListener('click', () => {
    shell.openExternal('https://minecraft.novaskin.me/skins');
});

// ─────────────────────────────────────────────
// VISTA: NICKNAMES
// ─────────────────────────────────────────────
function renderNicknamesList() {
    cfg = ipcRenderer.sendSync('get-config');
    const grid = document.getElementById('accounts-list');
    grid.innerHTML = '';

    cfg.accounts.forEach(acc => {
        const isActive = acc.id === cfg.activeAccountId;
        const card = document.createElement('div');
        card.className = `acct-card${isActive ? ' is-active' : ''}`;
        card.innerHTML = `
            <div class="acct-card-top">
                <span class="acct-emoji">${icon('user')}</span>
                <span class="acct-name">${escHtml(acc.username)}</span>
                ${isActive ? '<span class="acct-badge">ACTIVO</span>' : ''}
            </div>
            <div class="acct-actions">
                ${!isActive ? `<button class="secondary-btn" onclick="selectNickname('${acc.id}')">Activar</button>` : ''}
                <button class="secondary-btn uninstall-btn" onclick="removeNickname('${acc.id}')">${icon('trash')}</button>
            </div>`;
        grid.appendChild(card);
    });
}

document.getElementById('add-account-btn').addEventListener('click', () => {
    const input = document.getElementById('new-account-input');
    const name = input.value.trim();
    if (!name) return;
    ipcRenderer.sendSync('add-account', { username: name });
    input.value = '';
    cfg = ipcRenderer.sendSync('get-config');
    renderNicknamesList();
    refreshMainView();
});

window.selectNickname = (id) => {
    ipcRenderer.sendSync('set-active-account', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderNicknamesList();
    refreshMainView();
    reloadSkin();
    updateSocialAvatar();
};
window.removeNickname = (id) => {
    if (cfg.accounts.length <= 1) { alert('Debes tener al menos un nickname.'); return; }
    if (!confirm('¿Eliminar este nickname?')) return;
    ipcRenderer.sendSync('remove-account', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderNicknamesList();
    refreshMainView();
};

// ─────────────────────────────────────────────
// VISTA: PERFILES
// ─────────────────────────────────────────────
function renderProfilesList() {
    cfg = ipcRenderer.sendSync('get-config');
    const grid = document.getElementById('profiles-list');
    grid.innerHTML = '';

    cfg.profiles.forEach(prof => {
        const isActive = prof.id === cfg.activeProfileId;
        const card = document.createElement('div');
        card.className = `profile-card${isActive ? ' is-active' : ''}`;
        card.innerHTML = `
            <div class="profile-card-icon">${prof.icon || '⛏️'}</div>
            <div class="profile-card-name">${escHtml(prof.name)}</div>
            <div class="profile-card-version">${escHtml(prof.versionId || 'Sin versión')}</div>
            <div class="profile-card-actions" style="margin-top:6px;">
                ${!isActive ? `<button class="secondary-btn" onclick="selectProfile('${prof.id}')">Activar</button>` : '<span style="font-size:10px;color:var(--accent);">' + icon('check') + ' Activo</span>'}
                <button class="secondary-btn" onclick="openEditProfile('${prof.id}')">${icon('edit')}</button>
                <button class="secondary-btn uninstall-btn" onclick="removeProfile('${prof.id}')">${icon('trash')}</button>
            </div>`;
        grid.appendChild(card);
    });
}

document.getElementById('new-profile-btn').addEventListener('click', () => openEditProfile(null));

function openEditProfile(profileId) {
    editingProfileId = profileId;
    const panel = document.getElementById('profile-edit-panel');
    const title = document.getElementById('profile-edit-title');

    // Cargar versiones instaladas
    const versions = ipcRenderer.sendSync('get-installed-versions');
    const vsel = document.getElementById('edit-version');
    vsel.innerHTML = '<option value="">─ Sin versión ─</option>';
    versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        vsel.appendChild(opt);
    });

    if (profileId) {
        const prof = cfg.profiles.find(p => p.id === profileId);
        title.textContent = 'Editar Versión';
        document.getElementById('edit-icon').value = prof.icon || '⛏️';
        document.getElementById('edit-name').value = prof.name || '';
        document.getElementById('edit-ram').value = prof.ram || '4';
        document.getElementById('edit-gamedir').value = prof.gameDirectory || '';
        document.getElementById('edit-jvmargs').value = prof.jvmArgs || '';
        vsel.value = prof.versionId || '';
    } else {
        title.textContent = 'Nueva Versión';
        document.getElementById('edit-icon').value = '⛏️';
        document.getElementById('edit-name').value = '';
        document.getElementById('edit-ram').value = '4';
        document.getElementById('edit-gamedir').value = '';
        document.getElementById('edit-jvmargs').value = '';
        vsel.value = '';
    }

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
}

function closeEditPanel() {
    document.getElementById('profile-edit-panel').style.display = 'none';
    editingProfileId = null;
}

document.getElementById('cancel-edit-btn').addEventListener('click', closeEditPanel);

document.getElementById('save-profile-btn').addEventListener('click', () => {
    const data = {
        icon: document.getElementById('edit-icon').value || '⛏️',
        name: document.getElementById('edit-name').value.trim() || 'Versión',
        versionId: document.getElementById('edit-version').value,
        ram: document.getElementById('edit-ram').value,
        gameDirectory: document.getElementById('edit-gamedir').value,
        jvmArgs: document.getElementById('edit-jvmargs').value.trim()
    };

    if (editingProfileId) {
        ipcRenderer.sendSync('update-profile', { id: editingProfileId, ...data });
    } else {
        ipcRenderer.sendSync('add-profile', data);
    }
    cfg = ipcRenderer.sendSync('get-config');
    renderProfilesList();
    closeEditPanel();
    refreshMainView();
});

document.getElementById('browse-gamedir-btn').addEventListener('click', async () => {
    const dir = await ipcRenderer.invoke('open-dir-dialog');
    if (dir) document.getElementById('edit-gamedir').value = dir;
});

// Emoji presets
document.querySelectorAll('.emoji-opt').forEach(el => {
    el.addEventListener('click', () => {
        document.getElementById('edit-icon').value = el.dataset.emoji;
    });
});

window.selectProfile = (id) => {
    ipcRenderer.sendSync('set-active-profile', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderProfilesList();
    refreshMainView();
};
window.openEditProfile = openEditProfile;
window.removeProfile = (id) => {
    if (cfg.profiles.length <= 1) { alert('Debes tener al menos una versión.'); return; }
    if (!confirm('¿Eliminar esta versión?')) return;
    ipcRenderer.sendSync('remove-profile', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderProfilesList();
    refreshMainView();
};

// ─────────────────────────────────────────────
// CURSEFORGE — WEBVIEW
// ─────────────────────────────────────────────
let cfWebview = null;
let cfWebviewReady = false;

const cfCategoryUrls = {
    6: 'https://www.curseforge.com/minecraft/mc-mods',
    4471: 'https://www.curseforge.com/minecraft/modpacks',
    6552: 'https://www.curseforge.com/minecraft/shaders',
    4472: 'https://www.curseforge.com/minecraft/bukkit-plugins',
    4559: 'https://www.curseforge.com/minecraft/addons',
    1: 'https://www.curseforge.com/minecraft/worlds',
    12: 'https://www.curseforge.com/minecraft/texture-packs',
    4546: 'https://www.curseforge.com/minecraft/customization',
    4980: 'https://www.curseforge.com/minecraft/data-packs',
};

function refreshModsView() {
    cfg = ipcRenderer.sendSync('get-config');
    const prof = activeProfile();
    const label = document.getElementById('mods-profile-label');
    if (label) label.textContent = prof?.name || '─';
    initWebview();
    loadFolderSettings();
}

function initWebview() {
    const el = document.getElementById('cf-webview');
    if (!el) return;
    cfWebview = el;
    if (cfWebviewReady) return;
    cfWebviewReady = true;

    cfWebview.addEventListener('did-finish-load', () => {
        setupDownloadInterceptor();
    });
}

function setupDownloadInterceptor() {
    try {
        const wc = cfWebview.getWebContents();
        if (!wc || !wc.session) return;
        wc.session.removeAllListeners('will-download');
        wc.session.on('will-download', (event, item) => {
            const categoryId = parseInt(document.getElementById('cf-browse-by')?.value || '6');
            const folder = getCategoryFolder(categoryId);
            const filename = item.getFilename();
            const savePath = path.join(folder, filename);
            item.setSavePath(savePath);
            console.log('[CF] Download ->', savePath);

            item.on('done', (event, state) => {
                if (state === 'completed') {
                    console.log('[CF] Download complete:', filename);
                    shell.showItemInFolder(savePath);
                } else {
                    console.error('[CF] Download failed:', state);
                }
            });
        });
    } catch (e) {
        console.error('[CF] Download interceptor error:', e);
    }
}

function navigateCf() {
    const categoryId = parseInt(document.getElementById('cf-browse-by')?.value || '6');
    const baseUrl = cfCategoryUrls[categoryId] || cfCategoryUrls[6];

    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('pageSize', '20');

    const sortMap = { '1': 'relevancy', '2': 'popularity', '3': 'updated', '4': 'name', '5': 'total+downloads' };
    const sortField = document.getElementById('cf-sort-by')?.value || '1';
    params.set('sortBy', sortMap[sortField] || 'relevancy');

    const gameVersion = document.getElementById('cf-game-version')?.value;
    if (gameVersion) params.set('gameVersion', gameVersion);

    const checkedLoaders = document.querySelectorAll('.cf-loader-check:checked');
    if (checkedLoaders.length > 0) {
        const loaderVals = Array.from(checkedLoaders).map(cb => cb.value).join(',');
        params.set('modLoaderType', loaderVals);
    }

    const url = baseUrl + '?' + params.toString();
    if (cfWebview) cfWebview.src = url;
}

// ── Folder settings ──
function loadFolderSettings() {
    ['mods', 'resourcepacks', 'saves'].forEach(key => {
        const input = document.getElementById(`cf-folder-${key}`);
        if (!input) return;
        const folderConfig = cfg.cfFolders || {};
        input.value = folderConfig[key] || getDefaultFolder(key);
    });
}

function getDefaultFolder(key) {
    const base = ipcRenderer.sendSync('get-userdata-path');
    const map = { mods: 'mods', resourcepacks: 'resourcepacks', saves: 'saves' };
    return path.join(base, map[key] || key);
}

function getCategoryFolder(categoryId) {
    const folderConfig = cfg.cfFolders || {};
    const keyMap = {
        6: 'mods', 4471: 'modpacks', 6552: 'shaderpacks',
        4472: 'plugins', 4559: 'addons', 1: 'saves',
        12: 'resourcepacks', 4546: 'customization', 4980: 'datapacks',
    };
    const key = keyMap[categoryId] || 'mods';
    return folderConfig[key] || getDefaultFolder(key);
}

window.browseFolder = async (key) => {
    const folder = await ipcRenderer.invoke('select-folder');
    if (!folder) return;
    cfg.cfFolders = cfg.cfFolders || {};
    cfg.cfFolders[key] = folder;
    ipcRenderer.sendSync('save-config', cfg);
    cfg = ipcRenderer.sendSync('get-config');
    const input = document.getElementById(`cf-folder-${key}`);
    if (input) input.value = folder;
};

// ── Event listeners for CF navigation ──
document.getElementById('cf-browse-by')?.addEventListener('change', navigateCf);
document.getElementById('cf-game-version')?.addEventListener('change', navigateCf);
document.getElementById('cf-sort-by')?.addEventListener('change', navigateCf);
document.querySelectorAll('.cf-loader-check').forEach(cb => cb.addEventListener('change', navigateCf));

// ─────────────────────────────────────────────
// MODPACKS — BÚSQUEDA E INSTALACIÓN
// ─────────────────────────────────────────────
let modpackSearchOffset = 0;
let modpackSearchTotal = 0;

{
    const el = document.getElementById('modpack-search-btn');
    if (el) el.addEventListener('click', () => doModpackSearch(true));
}
{
    const el = document.getElementById('modpack-search-input');
    if (el) el.addEventListener('keydown', e => {
        if (e.key === 'Enter') doModpackSearch(true);
    });
}
{
    const el = document.getElementById('modpack-load-more-btn');
    if (el) el.addEventListener('click', () => doModpackSearch(false));
}

async function doModpackSearch(reset = false) {
    if (reset) modpackSearchOffset = 0;
    const query = document.getElementById('modpack-search-input')?.value?.trim() ?? '';
    const btn = document.getElementById('modpack-search-btn');
    if (!btn) return;
    btn.innerHTML = `${icon('loader')}`; btn.disabled = true;

    const result = await ipcRenderer.invoke('search-modpacks', { query, offset: modpackSearchOffset });
    btn.innerHTML = `${icon('search')} Buscar`; btn.disabled = false;

    modpackSearchTotal = result.total;
    const grid = document.getElementById('modpack-results-grid');
    if (reset) grid.innerHTML = '';

    if (!result.hits?.length) {
        if (reset) grid.innerHTML = '<div class="empty-state">Sin modpacks en CurseForge</div>';
        document.getElementById('modpack-load-more-row').style.display = 'none';
        return;
    }

    result.hits.forEach(pack => {
        const card = buildModpackCard(pack);
        grid.appendChild(card);
    });

    modpackSearchOffset += result.hits.length;
    document.getElementById('modpack-load-more-row').style.display =
        modpackSearchOffset < modpackSearchTotal ? 'block' : 'none';
}

function buildModpackCard(pack) {
    const card = document.createElement('div');
    card.className = 'mod-card';
    const categories = (pack.categories || []).slice(0, 2);
    const tagsHtml = [
        '<span class="mod-tag modpack">CurseForge Pack</span>',
        ...categories.map(c => `<span class="mod-tag">${escHtml(c.name)}</span>`)
    ].join('');

    const iconUrl = pack.logo?.thumbnailUrl || pack.logo?.url;
    const iconHtml = iconUrl
        ? `<img src="${iconUrl}" alt="" onerror="this.parentElement.textContent='📦'">`
        : '📦';

    const author = pack.authors?.[0]?.name || '─';
    const downloads = pack.downloadCount ? `${icon('download')} ${formatNum(pack.downloadCount)}` : '';

    card.innerHTML = `
        <div class="mod-icon">${iconHtml}</div>
        <div class="mod-info">
            <div class="mod-name">${escHtml(pack.name)}</div>
            <div class="mod-author">por ${escHtml(author)} ${downloads}</div>
            <div class="mod-desc">${escHtml(pack.summary || '')}</div>
            <div class="mod-meta">${tagsHtml}</div>
            <div class="mod-actions">
                <button class="secondary-btn install-btn"
                    onclick="openModpackVersions('${pack.id}','${escAttr(pack.name)}')">
                    ${icon('package')} Ver versiones
                </button>
            </div>
        </div>`;
    return card;
}

async function openModpackVersions(projectId, modpackName) {
    const modal = document.getElementById('modpack-version-modal');
    document.getElementById('modal-modpack-name').innerHTML = `${icon('package')} ${modpackName}`;
    const list = document.getElementById('modal-modpack-versions-list');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:10px;">Buscando packs en CurseForge...</div>';
    modal.style.display = 'flex';

    const versions = await ipcRenderer.invoke('get-modpack-versions', { projectId });
    list.innerHTML = '';

    if (!versions.length) {
        list.innerHTML = '<div style="color:var(--text2);padding:10px;">Sin versiones disponibles en CurseForge</div>';
        return;
    }

    // Solo ZIPs
    const valid = versions.filter(v => v.fileName?.endsWith('.zip'));

    valid.forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'modal-version-btn';
        const mcVers = (v.gameVersions || []).slice(0, 3).join(', ');
        const date = new Date(v.fileDate).toLocaleDateString();
        btn.innerHTML = `
            <strong>${escHtml(v.displayName || v.fileName)}</strong>
            <span style="font-size:10px;color:var(--text2);margin-left:8px;">MC ${mcVers} · ${date}</span>`;
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        btn.addEventListener('click', () => {
            modal.style.display = 'none';
            doInstallModpack(modpackName, v);
        });
        list.appendChild(btn);
    });
}
window.openModpackVersions = openModpackVersions;

document.getElementById('modpack-modal-close-btn').addEventListener('click', () => {
    document.getElementById('modpack-version-modal').style.display = 'none';
});

async function doInstallModpack(modpackName, versionData) {
    const prof = activeProfile();
    if (!prof) { alert('No hay perfil activo'); return; }

    const progressBox = document.getElementById('modpack-progress-box');
    const progressText = document.getElementById('modpack-progress-text');
    const progressFill = document.getElementById('modpack-progress-fill');
    const stepDetail = document.getElementById('modpack-step-detail');

    progressBox.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Iniciando instalación del modpack...';
    stepDetail.textContent = '';

    ipcRenderer.removeAllListeners('modpack-progress');
    ipcRenderer.on('modpack-progress', (_, { msg, percent }) => {
        progressText.textContent = msg;
        progressFill.style.width = `${percent}%`;
        stepDetail.textContent = msg.length > 60 ? msg.substring(0, 60) + '…' : '';
    });

    const result = await ipcRenderer.invoke('install-modpack', {
        profileId: prof.id,
        modpackName,
        versionData
    });

    if (result.success) {
        cfg = ipcRenderer.sendSync('get-config');
        progressText.innerHTML = `${icon('check')} ${modpackName} instalado — ${result.modsInstalled} mods, MC ${result.mcVersion}, loader: ${result.loaderType || 'vanilla'}`;
        progressFill.style.width = '100%';
        refreshMainView();
        alert(`✓ Modpack "${modpackName}" instalado con éxito.\n\n• ${result.modsInstalled} mods descargados\n• MC ${result.mcVersion}\n• Loader: ${result.loaderType || 'vanilla'}\n\nLa versión del perfil activo fue actualizada automáticamente.`);
    } else {
        progressText.innerHTML = `${icon('x')} Error: ${result.error}`;
    }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function extractMcVersion(id) {
    if (!id) return '';
    const match = id.match(/(\d+\.\d+(\.\d+)?)/);
    return match ? match[1] : '';
}
function formatNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
}
function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
try { navigate('view-main'); } catch (e) { console.error('[INIT] Error en navegación inicial:', e); }


let allVanillaVersions = [];
let allFabricVersions = [];

function initInstallView() {
    console.log('[INSTALL] initInstallView called');
    loadInstallVersions().catch(err => console.error('[INSTALL] Error:', err));
}

async function loadInstallVersions() {
    const sel = document.getElementById('vanilla-select');
    const forgeSel = document.getElementById('forge-mc-select');
    console.log('[INSTALL] loadInstallVersions, cached vanilla:', allVanillaVersions.length, 'fabric:', allFabricVersions.length);

    if (allVanillaVersions.length === 0) {
        sel.innerHTML = '<option value="">Cargando...</option>';
        console.log('[INSTALL] Fetching vanilla versions...');
        try {
            allVanillaVersions = await ipcRenderer.invoke('get-vanilla-versions');
            console.log('[INSTALL] Vanilla versions loaded:', allVanillaVersions ? allVanillaVersions.length : 'null');
            if (!allVanillaVersions || !allVanillaVersions.length) {
                throw new Error('API de Mojang devolvió lista vacía');
            }
            fillVanillaSelect();
            forgeSel.innerHTML = '';
            allVanillaVersions.filter(v => v.type === 'release').forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id; opt.textContent = v.id;
                forgeSel.appendChild(opt);
            });
        } catch (err) {
            console.error('[INSTALL] Vanilla error:', err);
            sel.innerHTML = '<option value="">Error: ' + (err.message || 'desconocido') + '</option>';
        }
    }

    if (allFabricVersions.length === 0) {
        const fsel = document.getElementById('fabric-select');
        try {
            console.log('[INSTALL] Fetching Fabric versions...');
            const raw = await ipcRenderer.invoke('get-fabric-versions');
            console.log('[INSTALL] Fabric versions received:', raw ? raw.length : 'null');
            allFabricVersions = Array.isArray(raw) ? raw : [];
            fsel.innerHTML = '';
            if (allFabricVersions.length === 0) {
                fsel.innerHTML = '<option value="">Sin versiones de Fabric</option>';
            } else {
                allFabricVersions.slice(0, 20).forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v; opt.textContent = 'Fabric Loader ' + v;
                    fsel.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('[INSTALL] Fabric error:', err);
            fsel.innerHTML = '<option value="">Error al cargar Fabric</option>';
        }
    }
    console.log('[INSTALL] loadInstallVersions complete');
}

document.getElementById('install-type').addEventListener('change', fillVanillaSelect);
function fillVanillaSelect() {
    const sel = document.getElementById('vanilla-select');
    if (!allVanillaVersions || !allVanillaVersions.length) {
        sel.innerHTML = '<option value="">Cargando...</option>';
        return;
    }
    const tipo = document.getElementById('install-type').value;
    const filtered = tipo === 'release'
        ? allVanillaVersions.filter(v => v.type === 'release')
        : allVanillaVersions;
    sel.innerHTML = '';
    filtered.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.id + (v.type !== 'release' ? ' (' + v.type + ')' : '');
        sel.appendChild(opt);
    });
}

document.getElementById('fabric-toggle').addEventListener('change', e => {
    document.getElementById('fabric-group').style.display = e.target.checked ? 'block' : 'none';
});

const installStatusBox = document.getElementById('install-status-box');
const installStatusText = document.getElementById('install-status-text');
const installProgressFill = document.getElementById('install-progress-fill');

document.getElementById('do-install-btn').addEventListener('click', async () => {
    const vanillaId = document.getElementById('vanilla-select').value;
    if (!vanillaId) { alert('Selecciona una versión de Minecraft'); return; }
    const fabricToggle = document.getElementById('fabric-toggle');
    const fabricVersion = fabricToggle.checked ? document.getElementById('fabric-select').value : null;

    const btn = document.getElementById('do-install-btn');
    btn.disabled = true; btn.innerHTML = `${icon('loader')} Instalando...`;
    installStatusBox.style.display = 'block';

    const result = await ipcRenderer.invoke('install-version', { vanillaId, fabricVersion });
    btn.disabled = false; btn.innerHTML = `${icon('download')} INSTALAR`;

    if (result.success) {
        installStatusText.innerHTML = `${icon('check')} Instalado: ${result.versionId}`;
        installProgressFill.style.width = '100%';
    } else {
        installStatusText.innerHTML = `${icon('x')} Error: ${result.error}`;
    }
});

ipcRenderer.removeAllListeners('install-progress');
ipcRenderer.on('install-progress', (_, { msg, percent }) => {
    installStatusText.textContent = msg;
    installProgressFill.style.width = `${percent}%`;
    // También para Forge
    const gt = document.getElementById('forge-status-text');
    const gf = document.getElementById('forge-progress-fill');
    if (gt) gt.textContent = msg;
    if (gf) gf.style.width = `${percent}%`;
});

// ── Forge ──
async function loadForgeVanillaVersions() {
    // Ya se puebla en loadVanillaVersionsIfNeeded
}

document.getElementById('forge-mc-select').addEventListener('change', async function () {
    const mcVer = this.value;
    if (!mcVer) return;
    const fvsel = document.getElementById('forge-version-select');
    fvsel.innerHTML = '<option value="">Cargando versiones de Forge...</option>';
    const versions = await ipcRenderer.invoke('get-forge-versions', { mcVersion: mcVer });
    fvsel.innerHTML = '';
    if (!versions.length) {
        fvsel.innerHTML = '<option value="">Sin versiones de Forge disponibles</option>';
        return;
    }
    versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = `Forge ${v}`;
        fvsel.appendChild(opt);
    });
});

const forgeStatusBox = document.getElementById('forge-status-box');
const forgeStatusText = document.getElementById('forge-status-text');
const forgeProgressFill = document.getElementById('forge-progress-fill');

document.getElementById('do-forge-install-btn').addEventListener('click', async () => {
    const mcVersion = document.getElementById('forge-mc-select').value;
    const forgeVersion = document.getElementById('forge-version-select').value;
    if (!mcVersion) { alert('Selecciona una versión de Minecraft'); return; }
    if (!forgeVersion) { alert('Selecciona una versión de Forge'); return; }

    const btn = document.getElementById('do-forge-install-btn');
    btn.disabled = true; btn.innerHTML = `${icon('loader')} Instalando Forge...`;
    forgeStatusBox.style.display = 'block';
    forgeProgressFill.style.width = '0%';

    const result = await ipcRenderer.invoke('install-forge', { mcVersion, forgeVersion });
    btn.disabled = false; btn.innerHTML = `${icon('hammer')} INSTALAR FORGE`;

    if (result.success) {
        forgeStatusText.innerHTML = `${icon('check')} Forge instalado: ${result.versionId}`;
        forgeProgressFill.style.width = '100%';
        alert(`✓ Forge instalado correctamente.\nVersionId: ${result.versionId}\n\nAhora puedes asignarlo a un perfil.`);
    } else {
        forgeStatusText.innerHTML = `${icon('x')} Error: ${result.error}`;
    }
});

// ─────────────────────────────────────────────
// CONTROL DE SCROLL Y "VOLVER ARRIBA"
// ─────────────────────────────────────────────
const cfScrollContainer = document.querySelector('.cf-layout > .cf-main');
const cfBackToTop = document.getElementById('cf-back-to-top');

if (cfScrollContainer) {
    let ticking = false;
    cfScrollContainer.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                if (cfBackToTop) cfBackToTop.style.display = cfScrollContainer.scrollTop > 300 ? 'flex' : 'none';
                ticking = false;
            });
            ticking = true;
        }
    });
}

if (cfBackToTop) {
    cfBackToTop.addEventListener('click', () => {
        cfScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// [VOID-CLIENT ADDITION] Client tab - Module Manager
const clientModulesContainer = document.getElementById('client-modules-list');

function refreshClientModules() {
    if (!clientModulesContainer) return;
    const hudCfg = ipcRenderer.sendSync('get-hud-config');
    clientModulesContainer.innerHTML = '';
    if (!hudCfg || !hudCfg.modules) return;
    for (const [name, data] of Object.entries(hudCfg.modules)) {
        const card = document.createElement('div');
        card.className = 'client-module-card';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = data.visible !== false;
        toggle.dataset.name = name;
        const label = document.createElement('span');
        label.className = 'mod-name';
        label.textContent = name.replace('Module', '');
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        const c = data.color || 0xFFFFFFFF;
        swatch.style.background = '#' + (c & 0x00FFFFFF).toString(16).padStart(6, '0');
        swatch.title = 'Color: 0x' + c.toString(16).toUpperCase();
        card.appendChild(toggle);
        card.appendChild(label);
        card.appendChild(swatch);
        clientModulesContainer.appendChild(card);
    }
}

document.getElementById('client-save-modules')?.addEventListener('click', () => {
    const cards = clientModulesContainer.querySelectorAll('.client-module-card');
    const modules = {};
    cards.forEach(card => {
        const toggle = card.querySelector('input[type="checkbox"]');
        const name = toggle.dataset.name;
        modules[name] = { visible: toggle.checked };
    });
    ipcRenderer.send('save-hud-config', { modules });
});

document.getElementById('client-open-editor')?.addEventListener('click', () => {
    ipcRenderer.send('launch-module-editor');
});

// [VOID-CLIENT ADDITION] Client tab - Performance Tweaks
function setupTweak(id, key, getVal) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
        const val = getVal ? getVal(el) : el.checked;
        ipcRenderer.send('write-options', { key, value: val });
    });
    el.addEventListener('input', () => {
        if (id === 'tweak-render-distance') document.getElementById('tweak-rd-value').textContent = el.value;
        if (id === 'tweak-max-fps') document.getElementById('tweak-fps-value').textContent = el.value;
    });
}

setupTweak('tweak-smooth-lighting', 'smoothLighting');
setupTweak('tweak-vsync', 'enableVsync');
setupTweak('tweak-fullscreen', 'fullscreen');
setupTweak('tweak-entity-shadows', 'entityShadows');
setupTweak('tweak-gui-scale', 'guiScale', el => parseInt(el.value));
setupTweak('tweak-render-distance', 'renderDistance', el => parseInt(el.value));
setupTweak('tweak-max-fps', 'maxFps', el => parseInt(el.value));

// (navigate consolidado en ROUTER DE VISTAS — ver arriba)

// ─────────────────────────────────────────────
// THEME / SETTINGS ENGINE
// ─────────────────────────────────────────────

// ---- Default theme ----
const DEFAULT_THEME = {
    typography: {
        title:   { family: "'Rajdhani', sans-serif", size: 24 },
        subtitle:{ family: "'DM Sans', sans-serif",  size: 13 },
        body:    { family: "'DM Sans', sans-serif",  size: 13 },
        button:  { family: "'Rajdhani', sans-serif", size: 14 }
    },
    colors: {
        background: {
            colors: ['#010005', '#050015', '#0a0030', '#150060', '#200080'],
            hasBorder: false, borderColor: '#8844ee',
            animationColor: '#8844ee', useGradient: true,
            gradientDirection: 'to bottom', gradientStops: 5
        },
        cards: {
            colors: ['rgba(8,4,25,0.65)'], hasBorder: true, borderColor: 'rgba(120,80,200,0.18)',
            animationColor: '#8844ee', useGradient: false,
            gradientDirection: 'to bottom', gradientStops: 2
        },
        menu: {
            colors: ['rgba(8,4,25,0.75)'], hasBorder: true, borderColor: 'rgba(120,80,200,0.15)',
            animationColor: '#8844ee', useGradient: false,
            gradientDirection: 'to bottom', gradientStops: 2
        },
        buttons: {
            play: {
                colors: ['#7c3aed'], hasBorder: false, borderColor: '#a78bfa',
                animationColor: '#a78bfa', useGradient: false,
                gradientDirection: 'to right', gradientStops: 2
            },
            activation: {
                colors: ['#7c3aed'], hasBorder: false, borderColor: '#a78bfa',
                animationColor: '#a78bfa', useGradient: false,
                gradientDirection: 'to right', gradientStops: 2
            },
            edit: {
                colors: ['rgba(110,60,220,0.25)'], hasBorder: true, borderColor: 'rgba(130,80,240,0.3)',
                animationColor: '#8844ee', useGradient: false,
                gradientDirection: 'to right', gradientStops: 2
            },
            config: {
                colors: ['rgba(8,4,25,0.4)'], hasBorder: true, borderColor: 'rgba(120,80,200,0.2)',
                animationColor: '#8844ee', useGradient: false,
                gradientDirection: 'to right', gradientStops: 2
            }
        }
    }
};

const FONT_OPTIONS = [
    { label: 'Rajdhani', value: "'Rajdhani', sans-serif" },
    { label: 'DM Sans', value: "'DM Sans', sans-serif" },
    { label: 'Inter', value: "'Inter', sans-serif" },
    { label: 'Segoe UI', value: "'Segoe UI', sans-serif" },
    { label: 'Arial', value: "Arial, sans-serif" },
    { label: 'Helvetica', value: "Helvetica, sans-serif" },
    { label: 'System UI', value: "system-ui, sans-serif" },
    { label: 'Monospace', value: "'Courier New', monospace" }
];

const DIRECTION_OPTIONS = [
    'to bottom', 'to top', 'to right', 'to left',
    'to bottom right', 'to bottom left', 'to top right', 'to top left'
];

let theme = JSON.parse(JSON.stringify(DEFAULT_THEME));

function resolveColor(cat, defaultVal) {
    return cat || defaultVal;
}

function buildGradient(cat) {
    if (!cat.useGradient || cat.colors.length < 2) return cat.colors[0] || '#07040f';
    const stops = cat.colors.slice(0, cat.gradientStops || 2);
    return `linear-gradient(${cat.gradientDirection}, ${stops.join(', ')})`;
}

// ---- Typography controls ----
function renderTypoSettings() {
    const grid = document.getElementById('settings-typo-grid');
    if (!grid) return;
    const items = [
        { key: 'title', label: 'Títulos' },
        { key: 'subtitle', label: 'Subtítulos' },
        { key: 'body', label: 'Textos' },
        { key: 'button', label: 'Botones' }
    ];
    grid.innerHTML = items.map(({ key, label }) => {
        const t = theme.typography[key];
        const fontOpts = FONT_OPTIONS.map(f =>
            `<option value="${f.value}"${f.value === t.family ? ' selected' : ''}>${f.label}</option>`
        ).join('');
        return `
            <div class="settings-typo-row" data-typo-key="${key}">
                <span class="settings-typo-label">${label}</span>
                <select onchange="onTypoChange('${key}','family',this.value)">${fontOpts}</select>
                <input type="number" min="10" max="48" value="${t.size}" onchange="onTypoChange('${key}','size',Number(this.value))">
            </div>`;
    }).join('');
}

function onTypoChange(key, prop, val) {
    if (!theme.typography[key]) theme.typography[key] = {};
    theme.typography[key][prop] = val;
}

// ---- Color controls ----
function renderColorSettings() {
    const container = document.getElementById('settings-colors-container');
    if (!container) return;

    const parts = [];

    // Top-level categories
    const topCats = ['background', 'cards', 'menu'];
    topCats.forEach(key => {
        parts.push(buildColorCategoryHTML(`colors.${key}`, getCatLabel(key), theme.colors[key]));
    });

    // Button sub-categories
    parts.push(`<div class="settings-subcat-header">Botones</div>`);
    const btnKeys = ['play', 'activation', 'edit', 'config'];
    parts.push(`<div class="settings-btn-subgrid">`);
    btnKeys.forEach(key => {
        const cat = theme.colors.buttons[key];
        if (cat) parts.push(buildColorCategoryHTML(`colors.buttons.${key}`, getBtnLabel(key), cat));
    });
    parts.push(`</div>`);
    container.innerHTML = parts.join('');
}

function getCatLabel(key) {
    const map = { background: 'Fondo', cards: 'Tarjetas', menu: 'Menú lateral' };
    return map[key] || key;
}

function getBtnLabel(key) {
    const map = { play: 'Jugar', activation: 'Activación', edit: 'Edición', config: 'Configuración' };
    return map[key] || key;
}

function buildColorCategoryHTML(path, label, cat) {
    const id = path.replace(/\./g, '-');
    const colorInputs = [];
    for (let i = 0; i < 5; i++) {
        const val = cat.colors[i] || '#000000';
        colorInputs.push(`
            <input type="color" value="${toHex(val)}" data-index="${i}"
                onchange="onColorChange('${path}',${i},this.value)"
                ${i >= (cat.gradientStops || 1) ? ' style="display:none"' : ''}>`);
    }
    return `
        <div class="settings-color-category">
            <button class="settings-color-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'flex':'none'">
                ${label} <svg class="icon"><use href="#icon-chevron-down"/></svg>
            </button>
            <div class="settings-color-body" style="display:none">
                <div class="settings-color-row">
                    <label>Colores</label>
                    ${colorInputs.join('')}
                    <select onchange="onColorStopsChange('${path}',Number(this.value))" style="width:60px;">
                        ${[1,2,3,4,5].map(n => `<option value="${n}"${(cat.gradientStops||1)===n?' selected':''}>${n}</option>`).join('')}
                    </select>
                </div>
                <div class="settings-color-row">
                    <label>Degradado</label>
                    <label class="settings-toggle">
                        <input type="checkbox" ${cat.useGradient ? 'checked' : ''} onchange="onColorToggle('${path}','useGradient',this.checked)">
                        Activo
                    </label>
                    <select ${!cat.useGradient ? 'style="display:none"' : ''} onchange="onColorChange('${path}','gradientDirection',this.value)" class="gradient-dir">
                        ${DIRECTION_OPTIONS.map(d => `<option value="${d}"${cat.gradientDirection===d?' selected':''}>${d}</option>`).join('')}
                    </select>
                </div>
                <div class="settings-color-row">
                    <label>Bordes</label>
                    <label class="settings-toggle">
                        <input type="checkbox" ${cat.hasBorder ? 'checked' : ''} onchange="onColorToggle('${path}','hasBorder',this.checked)">
                        Visible
                    </label>
                    <input type="color" value="${toHex(cat.borderColor)}" onchange="onColorChange('${path}','borderColor',this.value)">
                </div>
                <div class="settings-color-row">
                    <label>Animación</label>
                    <input type="color" value="${toHex(cat.animationColor)}" onchange="onColorChange('${path}','animationColor',this.value)">
                </div>
            </div>
        </div>`;
}

const _toHexCtx = document.createElement('canvas').getContext('2d');
function toHex(color) {
    if (color.startsWith('#')) return color;
    _toHexCtx.fillStyle = color;
    const c = _toHexCtx.fillStyle;
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
    return '#7c3aed';
}

function onColorChange(path, indexOrProp, val) {
    const cat = getCatByPath(path);
    if (typeof indexOrProp === 'number') {
        cat.colors[indexOrProp] = val;
    } else {
        cat[indexOrProp] = val;
    }
}

function onColorToggle(path, prop, val) {
    const cat = getCatByPath(path);
    cat[prop] = val;
    setTimeout(renderColorSettings, 0);
}

function onColorStopsChange(path, n) {
    const cat = getCatByPath(path);
    cat.gradientStops = n;
    renderColorSettings();
}

function getCatByPath(path) {
    const parts = path.split('.');
    let cur = theme;
    for (const p of parts) cur = cur[p];
    return cur;
}

// ---- Apply theme ----
function applyTheme() {
    const root = document.documentElement;
    const t = theme.typography;
    const c = theme.colors;

    root.style.setProperty('--font-title', t.title.family);
    root.style.setProperty('--font-body', t.body.family);
    root.style.setProperty('--title-size', t.title.size + 'px');
    root.style.setProperty('--subtitle-size', t.subtitle.size + 'px');
    root.style.setProperty('--body-size', t.body.size + 'px');
    root.style.setProperty('--btn-size', t.button.size + 'px');

    const bgGrad = buildGradient(c.background);
    root.style.setProperty('--bg', bgGrad);
    root.style.setProperty('--surface', buildGradient(c.cards));
    root.style.setProperty('--surface2', c.cards.colors[0] || 'rgba(8,4,25,0.55)');
    root.style.setProperty('--surface3', c.cards.colors[0] ? c.cards.colors[0].replace('0.65','0.4') : 'rgba(20,10,45,0.50)');

    const menuBg = buildGradient(c.menu);
    document.querySelector('.sidebar').style.background = menuBg;
    if (c.menu.hasBorder) {
        document.querySelector('.sidebar').style.borderRight = '1px solid ' + c.menu.borderColor;
    } else {
        document.querySelector('.sidebar').style.borderRight = 'none';
    }

    const pb = c.buttons.play;
    const playBtn = document.getElementById('play-btn');
    if (playBtn) playBtn.style.background = buildGradient(pb);

    const ab = c.buttons.activation;
    root.style.setProperty('--accent', ab.colors[0] || '#7c3aed');
    root.style.setProperty('--accent2', ab.colors[1] ? ab.colors[1] : '#5b21b6');
    root.style.setProperty('--accent-glow', ab.animationColor ? ab.animationColor.replace(')', ',0.35)').replace('rgb','rgba') : 'rgba(124,58,237,0.35)');

    // Border control for cards
    const borderVal = c.cards.hasBorder ? `1px solid ${c.cards.borderColor}` : 'none';
    root.style.setProperty('--card-border', borderVal);

    // Animation glow color
    root.style.setProperty('--anim-glow', c.background.animationColor || '#8844ee');

    // Update Three.js background scene
    if (window.__updateBgTheme) {
        window.__updateBgTheme(c);
    }
}

// ---- Save / Load ----
function saveTheme() {
    ipcRenderer.sendSync('set-config-key', { key: 'theme', value: theme });
    cfg = ipcRenderer.sendSync('get-config');
    applyTheme();
    renderTypoSettings();
    renderColorSettings();
}

function loadTheme() {
    const saved = cfg?.theme;
    if (saved) {
        theme = deepMerge(JSON.parse(JSON.stringify(DEFAULT_THEME)), saved);
    }
}

function deepMerge(base, override) {
    const result = JSON.parse(JSON.stringify(base));
    for (const key of Object.keys(override)) {
        if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key]) && result[key]) {
            result[key] = deepMerge(result[key], override[key]);
        } else {
            result[key] = override[key];
        }
    }
    return result;
}

// ---- Init ----
function initSettings() {
    loadTheme();

    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById(tab.dataset.settingsTab);
            if (panel) panel.classList.add('active');
        });
    });

    // Reset
    document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
        theme = JSON.parse(JSON.stringify(DEFAULT_THEME));
        applyTheme();
        renderTypoSettings();
        renderColorSettings();
    });

    // Save
    document.getElementById('settings-save-btn')?.addEventListener('click', saveTheme);

    renderTypoSettings();
    renderColorSettings();
    applyTheme();
}

initSettings();

// ─────────────────────────────────────────────
// WARDROBE — SKIN LIBRARY
// ─────────────────────────────────────────────
function renderWardrobe() {
    const grid = document.getElementById('wardrobe-grid');
    if (!grid) return;
    const library = ipcRenderer.sendSync('get-skin-library');
    if (!library || !library.length) {
        grid.innerHTML = '<div class="empty-state">Aún no hay skins en tu armario. ¡Añade una!</div>';
        return;
    }
    grid.innerHTML = '';
    library.forEach(skin => {
        const card = document.createElement('div');
        card.className = 'wardrobe-card';
        card.innerHTML = `
            <div class="wardrobe-thumb" data-skin-path="${escAttr(skin.path)}">
                <canvas width="64" height="64"></canvas>
            </div>
            <div class="wardrobe-name">${escHtml(skin.name)}</div>
            <div class="wardrobe-actions">
                <button class="wardrobe-apply-btn" data-skin-id="${skin.id}" title="Aplicar skin">${icon('check')}</button>
                <button class="wardrobe-delete-btn" data-skin-id="${skin.id}" title="Eliminar">${icon('trash')}</button>
            </div>`;
        grid.appendChild(card);

        // Render mini 2D preview (sin WebGL)
        const canvas = card.querySelector('canvas');
        if (canvas && fs.existsSync(skin.path)) {
            try {
                const img = new Image();
                img.onload = () => renderSkinHead(canvas, img, 64);
                img.onerror = () => { canvas.getContext('2d').fillStyle = '#2a1040'; canvas.getContext('2d').fillRect(0, 0, 64, 64); };
                img.src = 'file://' + path.resolve(skin.path);
            } catch (e) {
                console.error('[WARDROBE] Mini preview error:', e);
            }
        }
    });
    requestGC();
}

document.getElementById('wardrobe-add-btn')?.addEventListener('click', async () => {
    const filePath = await ipcRenderer.invoke('open-skin-dialog');
    if (!filePath) return;
    const name = path.basename(filePath, '.png');
    ipcRenderer.sendSync('add-skin-to-library', { name, source: 'local', skinPath: filePath });
    renderWardrobe();
});

document.getElementById('wardrobe-nova-btn')?.addEventListener('click', () => {
    shell.openExternal('https://minecraft.novaskin.me/skins');
});

document.addEventListener('click', (e) => {
    const applyBtn = e.target.closest('.wardrobe-apply-btn');
    if (applyBtn) {
        const skinId = applyBtn.dataset.skinId;
        const acc = activeAccount();
        if (!acc) { showToast('No hay nickname activo', 'error'); return; }
        ipcRenderer.sendSync('apply-skin-from-library', { skinId, accountId: acc.id });
        cfg = ipcRenderer.sendSync('get-config');
        reloadSkin();
        showToast('Skin aplicada a ' + acc.username, 'success');
        return;
    }
    const deleteBtn = e.target.closest('.wardrobe-delete-btn');
    if (deleteBtn) {
        const skinId = deleteBtn.dataset.skinId;
        if (!confirm('Eliminar esta skin del armario?')) return;
        ipcRenderer.sendSync('remove-skin-from-library', { id: skinId });
        renderWardrobe();
        showToast('Skin eliminada', 'success');
    }
});

// ─────────────────────────────────────────────
// SOCIAL — CLOUD (Neon)
// ─────────────────────────────────────────────
const socialState = {
    friends: [],
    presence: {},
    pending: [],
    unreadCounts: {},
    conversations: [],
    selectedChatUser: null,
    connected: false
};

function getCloudStatusLabel(status, version) {
    if (status === 'playing_singleplayer') {
        return version ? `${version} - Singleplayer` : 'Jugando';
    }
    if (status === 'playing_multiplayer') {
        return version ? `${version} - Multiplayer` : 'En servidor';
    }
    switch (status) {
        case 'online': return 'En línea';
        case 'offline': return 'Desconectado';
        default: return status || 'Desconocido';
    }
}

function getCloudStatusDotClass(status) {
    switch (status) {
        case 'online': case 'playing_singleplayer': case 'playing_multiplayer': return 'online';
        default: return 'offline';
    }
}

// ── Render functions ──
function cloudRenderFriendsList() {
    const list = document.getElementById('social-friends-list');
    if (!list) return;
    const friends = socialState.friends;
    const presence = socialState.presence;
    const unread = socialState.unreadCounts || {};

    if (!friends.length) {
        list.innerHTML = '<div class="empty-state">Conéctate a una base de datos Neon para ver tus amigos.</div>';
        return;
    }

    const online = friends.filter(f => {
        const p = presence[f];
        return p && p.status !== 'offline';
    });
    const offline = friends.filter(f => {
        const p = presence[f];
        return !p || p.status === 'offline';
    });

    let html = '';
    if (online.length > 0) {
        html += '<div class="friend-group-label">En línea (' + online.length + ')</div>';
        online.forEach(f => { html += cloudRenderFriendCard(f, presence[f], unread[f] || 0); });
    }
    if (offline.length > 0) {
        html += '<div class="friend-group-label" style="margin-top:8px;">Desconectados (' + offline.length + ')</div>';
        offline.forEach(f => { html += cloudRenderFriendCard(f, presence[f], unread[f] || 0); });
    }

    list.innerHTML = html;
    const badge = document.getElementById('friends-count-badge');
    if (badge) { badge.textContent = online.length; badge.style.display = online.length > 0 ? 'flex' : 'none'; }
}

function cloudRenderFriendCard(username, presenceData, unread) {
    const isOnline = presenceData && presenceData.status !== 'offline';
    const statusLabel = getCloudStatusLabel(presenceData?.status, presenceData?.version);
    const statusDot = getCloudStatusDotClass(presenceData?.status);

    return `<div class="friend-card ${isOnline ? 'online' : 'offline'}" data-username="${escAttr(username)}">
        <div class="friend-avatar">
            <svg class="icon"><use href="#icon-user"/></svg>
            <span class="friend-status-dot ${statusDot}"></span>
        </div>
        <div class="friend-info">
            <div class="friend-name">${escHtml(username)}${unread > 0 ? ' <span class="friend-unread">' + unread + '</span>' : ''}</div>
            <div class="friend-status-text">${statusLabel}</div>
        </div>
        <div class="friend-actions">
            <button class="friend-action-btn chat" onclick="cloudOpenChat('${escAttr(username)}')" title="Chat"><svg class="icon"><use href="#icon-message"/></svg></button>
        </div>
    </div>`;
}

function cloudRenderConversationsList() {
    const list = document.getElementById('chat-conv-list');
    if (!list) return;
    const conversations = socialState.conversations || [];
    const presence = socialState.presence || {};
    const unread = socialState.unreadCounts || {};

    if (!conversations.length) {
        list.innerHTML = '<div class="empty-state" style="padding:12px;font-size:11px;">Aún no tienes conversaciones.</div>';
        return;
    }

    list.innerHTML = conversations.map(c => {
        const p = presence[c.username] || {};
        const isOnline = p.status && p.status !== 'offline';
        const dotClass = isOnline ? 'online' : 'offline';
        const preview = c.last_message ? escHtml(c.last_message.substring(0, 50)) : 'Sin mensajes';
        const time = c.last_message_at ? new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const unreadCount = unread[c.username] || 0;

        return `<div class="chat-conv-item ${unreadCount > 0 ? 'has-unread' : ''}" data-username="${escAttr(c.username)}">
            <div class="friend-avatar" style="width:28px;height:28px;flex-shrink:0;">
                <svg class="icon"><use href="#icon-user"/></svg>
                <span class="friend-status-dot ${dotClass}" style="width:7px;height:7px;"></span>
            </div>
            <div class="chat-conv-info">
                <div class="chat-conv-name">${escHtml(c.username)}${unreadCount > 0 ? ' <span class="conv-unread-badge">' + unreadCount + '</span>' : ''}</div>
                <div class="chat-conv-preview">${preview}</div>
            </div>
            <div style="font-size:9px;color:var(--text3);flex-shrink:0;align-self:flex-start;margin-top:4px;">${time}</div>
        </div>`;
    }).join('');
}

function cloudRenderPendingList() {
    const list = document.getElementById('social-invitations-list');
    if (!list) return;
    const pending = socialState.pending;
    if (!pending.length) {
        list.innerHTML = '<div class="empty-state">No tienes solicitudes pendientes.</div>';
        return;
    }
    list.innerHTML = pending.map(p => {
        if (p.type === 'game-invite') {
            return `<div class="friend-card request" data-from="${escAttr(p.from)}" data-invite-id="${escAttr(p.id)}">
                <div class="friend-avatar" style="background:#2d1b69;"><svg class="icon"><use href="#icon-game"/></svg></div>
                <div class="friend-info">
                    <div class="friend-name">${escHtml(p.from)}</div>
                    <div class="friend-status-text">Te invitó a ${escHtml(p.worldName || 'jugar')}</div>
                </div>
                <div class="friend-actions">
                    <button class="friend-action-btn accept" onclick="cloudAcceptGameInvite('${escAttr(p.id)}')" title="Aceptar"><svg class="icon"><use href="#icon-check"/></svg></button>
                </div>
            </div>`;
        }
        return `<div class="friend-card request" data-from="${escAttr(p.from)}">
            <div class="friend-avatar"><svg class="icon"><use href="#icon-user"/></svg></div>
            <div class="friend-info">
                <div class="friend-name">${escHtml(p.from)}</div>
                <div class="friend-status-text">Quiere ser tu amigo</div>
            </div>
            <div class="friend-actions">
                <button class="friend-action-btn accept" onclick="cloudAcceptFriend('${escAttr(p.from)}')" title="Aceptar"><svg class="icon"><use href="#icon-check"/></svg></button>
            </div>
        </div>`;
    }).join('');
}

window.cloudAcceptGameInvite = async function(inviteId) {
    const inv = socialState.pending.find(p => String(p.id) === String(inviteId));
    const result = await ipcRenderer.invoke('social-accept-game-invite', { inviteId });
    if (!result.success) return;
    socialState.pending = socialState.pending.filter(p => String(p.id) !== String(inviteId));
    cloudRenderPendingList();

    if (inv?.p2p_session_id) {
        showToast('Conectando vía P2P...', 'success', 5000);
        const cfg = ipcRenderer.sendSync('get-config');
        const account = cfg.accounts?.find(a => a.id === cfg.activeAccountId) || cfg.accounts?.[0];
        const jarPath = inv.jarPath || '';
        ipcRenderer.invoke('p2p-join-session', {
            sessionId: inv.p2p_session_id,
            userId: account?.id || '',
            jarPath,
            username: account?.username || 'Jugador'
        });
    } else if (inv?.serverIp) {
        showToast(`Conectando a ${inv.serverIp}...`, 'success', 5000);
        const cfg = ipcRenderer.sendSync('get-config');
        const profile = cfg.profiles?.find(p => p.id === cfg.activeProfileId) || cfg.profiles?.[0];
        const account = cfg.accounts?.find(a => a.id === cfg.activeAccountId) || cfg.accounts?.[0];
        ipcRenderer.invoke('launch-minecraft-with-server', {
            jarPath: null,
            ip: inv.serverIp,
            version: profile?.versionId || null,
            username: account?.username || 'Jugador'
        });
    } else {
        showToast('Tu amigo no está en un servidor público', 'error', 4000);
    }
};

function cloudRenderChatMessages(username) {
    const area = document.getElementById('chat-area');
    const messages = document.getElementById('chat-area-messages');
    const name = document.getElementById('chat-area-name');
    const statusDot = document.getElementById('chat-area-status-dot');
    const input = document.getElementById('chat-area-input-field');
    const sendBtn = document.getElementById('chat-area-send-btn');

    if (!username) {
        area.style.display = 'none';
        return;
    }

    area.style.display = 'flex';
    name.textContent = username;
    const p = socialState.presence[username];
    statusDot.className = 'status-dot ' + (p ? getCloudStatusDotClass(p.status) : 'offline');

    ipcRenderer.invoke('social-get-messages', { withUser: username }).then(msgs => {
        if (!msgs || !msgs.length) {
            messages.innerHTML = '<div class="empty-state" style="padding:20px;font-size:12px;">Inicia la conversación con ' + escHtml(username) + '</div>';
        } else {
            messages.innerHTML = msgs.map(m => {
                const isMine = m.from_user === neonSession?.username;
                const t = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}">
                    <div class="chat-msg-text">${escHtml(m.content)}</div>
                    <div class="chat-msg-meta">${t}</div>
                </div>`;
            }).join('');
            messages.scrollTop = messages.scrollHeight;
        }
    });

    input.disabled = false;
    sendBtn.disabled = false;
    input.placeholder = 'Escribe un mensaje...';
}

// ── Cloud social event handlers ──
window.cloudOpenChat = function(username) {
    socialState.selectedChatUser = username;
    socialState.unreadCounts[username] = 0;
    cloudRenderChatMessages(username);
    updateCloudUnreadBadges();

    document.querySelectorAll('.social-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-panel="chat"]')?.classList.add('active');
    document.querySelectorAll('.social-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-chat')?.classList.add('active');

    updateSocialBadge();
};

window.cloudSendMessage = async function() {
    const input = document.getElementById('chat-area-input-field');
    const text = input.value.trim();
    if (!text || !socialState.selectedChatUser) return;
    try {
        await ipcRenderer.invoke('social-send-message', {
            toUser: socialState.selectedChatUser,
            content: text
        });
    } catch (e) {
        console.error('[CHAT] send error:', e);
    }
    input.value = '';
    cloudRenderChatMessages(socialState.selectedChatUser);
};

window.cloudAddFriend = async function() {
    const input = document.getElementById('social-friend-search');
    const username = input.value.trim();
    if (!username) return;
    const result = await ipcRenderer.invoke('social-send-friend-request', { toUser: username });
    if (result.success) {
        input.value = '';
        showToast('Solicitud enviada a ' + username, 'success');
    } else {
        showToast(result.error || 'Error al enviar solicitud', 'error');
    }
};

window.cloudAcceptFriend = async function(fromUser) {
    await ipcRenderer.invoke('social-accept-friend', { fromUser });
    cloudRenderFriendsList();
    cloudRenderPendingList();
    showToast(fromUser + ' añadido a tus amigos', 'success');
};

window.cloudRejectFriend = async function(fromUser) {
    await ipcRenderer.invoke('social-reject-friend', { fromUser });
    cloudRenderPendingList();
    showToast('Solicitud rechazada', 'info');
};

window.cloudRemoveFriend = async function(friendUser) {
    if (!confirm('¿Eliminar a ' + friendUser + ' de tus amigos?')) return;
    await ipcRenderer.invoke('social-remove-friend', { friendUser });
    showToast(friendUser + ' eliminado', 'success');
};

function updateSocialConnectionStatus() {
    const status = document.getElementById('social-connection-status');
    if (!status) return;
    const connected = socialState.connected;
    status.innerHTML = connected
        ? '<span style="color:#22c55e;">🟢 Conectado</span>'
        : '<span style="color:#6b7280;">🔴 Desconectado</span>';

    // Update sidebar bridge info
    const cloudDot = document.getElementById('cloud-status-dot');
    const cloudText = document.getElementById('cloud-status-text');
    if (cloudDot && cloudText) {
        cloudDot.className = 'bridge-dot ' + (connected ? 'online' : 'offline');
        cloudText.textContent = connected ? 'Conectado a Neon' : 'Neon DB: Desconectado';
    }
}

function updateCloudUnreadBadges() {
    const total = Object.values(socialState.unreadCounts || {}).reduce((a, b) => a + b, 0);
    const chatBadge = document.getElementById('chat-unread-badge');
    if (chatBadge) {
        chatBadge.textContent = total;
        chatBadge.style.display = total > 0 ? 'flex' : 'none';
    }
    updateSocialBadge(total);
}

function updateSocialBadge(peerCount) {
    const total = peerCount !== undefined ? peerCount : Object.values(socialState.unreadCounts || {}).reduce((a, b) => a + b, 0);
    const badge = document.getElementById('social-badge');
    if (!badge) return;
    const finalCount = total + (socialState.pending?.length || 0);
    if (finalCount > 0) {
        badge.textContent = finalCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ── Message notification state ──
const lastSeenMsg = {};
const msgTimestamps = {};

function showMessageNotification(username, text) {
    const now = Date.now();
    if (!msgTimestamps[username]) msgTimestamps[username] = [];
    msgTimestamps[username] = msgTimestamps[username].filter(t => now - t < 10000);
    msgTimestamps[username].push(now);

    if (msgTimestamps[username].length > 5) {
        ipcRenderer.invoke('show-notification', {
            type: 'message:new',
            data: { from: username, text: 'Enviando muchos mensajes...' }
        });
    } else {
        ipcRenderer.invoke('show-notification', {
            type: 'message:new',
            data: { fromUsername: username, from: username, text }
        });
    }
}

function checkNewMessagesFor(username) {
    ipcRenderer.invoke('social-get-messages', { withUser: username }).then(msgs => {
        if (!msgs || !msgs.length) return;
        const latest = msgs[msgs.length - 1];
        if (!latest || latest.from_user === neonSession?.username) return;
        if (lastSeenMsg[username] && latest.id === lastSeenMsg[username]) return;
        lastSeenMsg[username] = latest.id;
        showMessageNotification(username, latest.content);
    }).catch(() => {});
}

process.on('unhandledRejection', (reason) => {
    console.error('[RENDERER] Unhandled rejection:', reason);
});

// ── Cloud IPC listeners ──
ipcRenderer.removeAllListeners('social-update');
ipcRenderer.on('social-update', (_, data) => {
    socialState.friends = data.friends || [];
    socialState.presence = data.presence || {};
    socialState.pending = data.pending || [];
    socialState.unreadCounts = data.unread || {};
    socialState.conversations = data.conversations || [];

    cloudRenderFriendsList();
    cloudRenderPendingList();
    cloudRenderConversationsList();

    const totalUnread = Object.values(socialState.unreadCounts).reduce((a, b) => a + b, 0);
    updateSocialBadge(totalUnread);

    const reqBadge = document.getElementById('invitations-badge');
    if (reqBadge) {
        reqBadge.textContent = socialState.pending.length;
        reqBadge.style.display = socialState.pending.length > 0 ? 'flex' : 'none';
    }

    const chatArea = document.getElementById('chat-area');
    const chatOpen = socialState.selectedChatUser && chatArea && chatArea.style.display !== 'none';
    if (chatOpen) {
        cloudRenderChatMessages(socialState.selectedChatUser);
    }

    // Check for new messages from any friend
    for (const friend of socialState.friends) {
        const hasUnread = (socialState.unreadCounts[friend] || 0) > 0;
        if (!hasUnread) continue;
        if (friend === socialState.selectedChatUser && chatOpen) continue;
        checkNewMessagesFor(friend);
    }
});

ipcRenderer.removeAllListeners('social-error');
ipcRenderer.on('social-error', () => {
    const status = document.getElementById('social-connection-status');
    if (status) {
        status.innerHTML = '<span style="color:#ef4444;">🔴 Error de conexión — <button class="retry-btn" onclick="retrySocialConnection()">Volver a Intentar</button></span>';
    }
    showToast('Error de conexión social', 'error');
    socialState.connected = false;
    updateSocialConnectionStatus();
});

ipcRenderer.removeAllListeners('overlay-open-chat');
ipcRenderer.on('overlay-open-chat', (_, username) => {
    if (typeof username !== 'string') return;
    document.querySelector('[data-panel="social"]')?.click();
    setTimeout(() => cloudOpenChat(username), 100);
});

// ── P2P Status ──
ipcRenderer.removeAllListeners('p2p-status');
ipcRenderer.on('p2p-status', (_, data) => {
    const stages = {
        SIGNALING: 'Conectando... intercambiando señales',
        ICE_CONNECT: 'Estableciendo ruta de red...',
        CONNECTED: data.proxyPort
            ? `¡Conectado! Entrando al mundo (puerto ${data.proxyPort})...`
            : '¡Conectado!',
        TIMEOUT: 'No se pudo conectar en 60 segundos',
        DISCONNECTED: 'Conexión P2P perdida'
    };
    const msg = stages[data.stage] || data.stage;
    if (data.stage === 'TIMEOUT' || data.stage === 'DISCONNECTED') {
        showToast(msg, 'error', 5000);
    } else if (data.stage === 'CONNECTED') {
        showToast(msg, 'success', 5000);
    } else {
        console.log('[P2P]', msg);
    }
});

ipcRenderer.removeAllListeners('p2p-auto-join');
ipcRenderer.on('p2p-auto-join', (_, data) => {
    ipcRenderer.invoke('p2p-join-session', data).catch(e => {
        console.error('[P2P] auto-join error:', e);
        showToast('Error al unirse a la sesión P2P', 'error', 5000);
    });
});

// ── Friend presence polling (System B) ──
const friendPresenceCache = {};
const FRIEND_CACHE_MAX = 200;
let presencePollInterval = null;

function stopFriendPresencePolling() {
    if (presencePollInterval) {
        clearInterval(presencePollInterval);
        presencePollInterval = null;
    }
}

function startFriendPresencePolling() {
    if (presencePollInterval) return;
    presencePollInterval = setInterval(async () => {
        if (!socialState.friends.length) return;
        const friendIds = [];
        for (const f of socialState.friends) {
            const data = await ipcRenderer.invoke('social-get-friend-status', { friendUsername: f })
                .catch(() => null);
            if (data?.id) friendIds.push(data.id);
        }
        if (!friendIds.length) return;
        const rows = await ipcRenderer.invoke('get-friends-presence', { friendIds }).catch(() => []);
        for (const row of rows) {
            const prev = friendPresenceCache[row.username];
            if (prev !== row.status &&
                (row.status === 'MULTIPLAYER' || row.status === 'SINGLEPLAYER')) {
                ipcRenderer.invoke('show-notification', {
                    type: 'friend:in-game',
                    data: {
                        username: row.username,
                        text: row.status === 'MULTIPLAYER'
                            ? `Conectado a ${row.server_ip || 'un servidor'}`
                            : `Jugando ${row.version || 'Minecraft'}`
                    }
                });
            }
            friendPresenceCache[row.username] = row.status;
        }
        // Trim cache to prevent unbounded growth
        const cacheKeys = Object.keys(friendPresenceCache);
        if (cacheKeys.length > FRIEND_CACHE_MAX) {
            const toDelete = cacheKeys.slice(0, cacheKeys.length - FRIEND_CACHE_MAX);
            for (const key of toDelete) delete friendPresenceCache[key];
        }
    }, 15000);
}

ipcRenderer.removeAllListeners('minecraft-state-change');
ipcRenderer.on('minecraft-state-change', (_, { userId, status, ip, version }) => {
    const statusEl = document.getElementById('social-my-status');
    if (statusEl) {
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');
        if (status === 'OFFLINE') {
            if (dot) dot.className = 'status-dot online';
            if (text) text.textContent = 'Conectado';
        } else if (status === 'MULTIPLAYER') {
            if (dot) dot.className = 'status-dot playing_multiplayer';
            if (text) text.textContent = getCloudStatusLabel('playing_multiplayer', version);
        } else if (status === 'SINGLEPLAYER') {
            if (dot) dot.className = 'status-dot playing_singleplayer';
            if (text) text.textContent = getCloudStatusLabel('playing_singleplayer', version);
        }
    }
});

ipcRenderer.removeAllListeners('social-connected');
ipcRenderer.on('social-connected', () => {
    socialState.connected = true;
    updateSocialConnectionStatus();
    startFriendPresencePolling();
    cfg = ipcRenderer.sendSync('get-config');
    updateSocialAvatar();
    // Request current user info to update sidebar profile
    ipcRenderer.invoke('social-get-account').then(account => {
        if (account) {
            const nameEl = document.getElementById('social-my-name');
            if (nameEl) nameEl.textContent = account.username;
            const statusBadge = document.getElementById('social-my-status');
            if (statusBadge) {
                const dot = statusBadge.querySelector('.status-dot');
                const text = statusBadge.querySelector('.status-text');
                if (dot) dot.className = 'status-dot online';
                if (text) text.textContent = 'Conectado';
            }
            // Update neonSession if not set
            if (!neonSession) {
                neonSession = { username: account.username, userId: account.id };
            }
        }
    }).catch(() => {});
});

window.retrySocialConnection = function() {
    ipcRenderer.send('social-retry');
    document.getElementById('social-connection-status').innerHTML = '<span style="color:#f59e0b;">🟡 Reconectando...</span>';
};

ipcRenderer.removeAllListeners('session-restored');
ipcRenderer.on('session-restored', (_, { username }) => {
    neonSession = { username, userId: null };
    cfg = ipcRenderer.sendSync('get-config');
    updateSocialAvatar();
    hideLoginOverlay();
});

// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────────
function showToast(message, type = 'success', duration = 2500) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    const iconName = type === 'success' ? 'toast-success' : 'toast-error';
    toast.innerHTML = `<svg class="icon"><use href="#icon-${iconName}"/></svg> ${escHtml(message)}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-fade'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ─────────────────────────────────────────────
// SETTINGS — BEHAVIOR TOGGLES
// ─────────────────────────────────────────────
function loadBehaviorSettings() {
    const cfgState = ipcRenderer.sendSync('get-config');
    document.getElementById('toggle-minimize-tray').checked = cfgState.minimizeToTray !== false;
    document.getElementById('toggle-suppress-updates').checked = cfgState.suppressUpdateNotifications === true;
}

document.getElementById('toggle-minimize-tray')?.addEventListener('change', (e) => {
    ipcRenderer.send('set-minimize-to-tray', { value: e.target.checked });
});

document.getElementById('toggle-suppress-updates')?.addEventListener('change', (e) => {
    ipcRenderer.send('set-suppress-updates', { value: e.target.checked });
});

// ── Search autocomplete ──
let searchDebounce = null;

function setupSearchAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    input.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        const val = input.value.trim();
        if (val.length < 1) { list.innerHTML = ''; list.style.display = 'none'; return; }
        searchDebounce = setTimeout(async () => {
            const users = await ipcRenderer.invoke('social-search-users', { query: val });
            if (users.length === 0) { list.innerHTML = ''; list.style.display = 'none'; return; }
            list.innerHTML = users.map(u =>
                `<div class="search-suggestion" data-username="${escAttr(u.username)}">${escHtml(u.username)}</div>`
            ).join('');
            list.style.display = 'block';
        }, 200);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { list.innerHTML = ''; list.style.display = 'none'; }, 150);
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.search-suggestion');
        if (item) {
            input.value = item.dataset.username;
            list.innerHTML = '';
            list.style.display = 'none';
        }
    });
}

setupSearchAutocomplete('social-friend-search', 'social-search-results');

// ── Social navigation: panel switching ──
document.querySelectorAll('.social-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        document.querySelectorAll('.social-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.social-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById('panel-' + panel);
        if (target) target.classList.add('active');
    });
});

// ── Social chat: send on Enter / button click ──
document.getElementById('chat-area-input-field')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') cloudSendMessage();
});
document.getElementById('chat-area-send-btn')?.addEventListener('click', cloudSendMessage);

// ── Social conversations list: click to open chat ──
document.getElementById('chat-conv-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-conv-item');
    if (item) {
        cloudOpenChat(item.dataset.username);
        // Switch to the chat panel
        document.querySelector('[data-panel="chat"]')?.click();
    }
});

// ── Social friend search: Enter key ──
document.getElementById('social-friend-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') cloudAddFriend();
});

// ─────────────────────────────────────────────
// EDITOR DE SKIN 3D (Nova-Style)
// ─────────────────────────────────────────────
let skinEditorActive = false;
let skinEditorInstance = null;

const EDITOR_TOOLS = ['pencil', 'brush', 'bucket', 'eyedropper', 'eraser'];

function openSkinEditor() {
    skinEditorActive = true;
    const container = document.getElementById('wardrobe-grid');
    const actions = document.querySelector('.wardrobe-actions');
    if (container) container.style.display = 'none';
    if (actions) actions.style.display = 'none';

    let editorEl = document.getElementById('skin-editor-root');
    if (editorEl) { editorEl.style.display = 'flex'; return; }

    editorEl = document.createElement('div');
    editorEl.id = 'skin-editor-root';
    editorEl.className = 'skin-editor-root';
    editorEl.innerHTML = `
        <div class="editor-toolbar">
            <button class="editor-btn" onclick="closeSkinEditor()" title="Volver al armario"><svg class="icon"><use href="#icon-arrow-up"/></svg></button>
            <span class="editor-title">EDITOR DE SKIN</span>
            <div style="flex:1"></div>
            <button class="editor-btn" onclick="editorUndo()" title="Deshacer"><svg class="icon"><use href="#icon-refresh"/></svg></button>
            <button class="editor-btn" onclick="editorRedo()" title="Rehacer"><svg class="icon"><use href="#icon-refresh"/></svg></button>
            <button id="editor-import-btn" class="editor-btn" title="Importar PNG"><svg class="icon"><use href="#icon-folder"/></svg></button>
            <button id="editor-save-btn" class="primary-btn" style="padding:6px 14px;font-size:11px;"><svg class="icon"><use href="#icon-save"/></svg> Guardar</button>
        </div>
        <div class="editor-body">
            <div class="editor-sidebar-left">
                <div class="editor-tools-group">
                    <label>HERRAMIENTAS</label>
                    <div class="editor-tools-grid">
                        <button class="editor-tool active" data-tool="pencil" title="Lápiz">✏️</button>
                        <button class="editor-tool" data-tool="brush" title="Pincel">🖌️</button>
                        <button class="editor-tool" data-tool="bucket" title="Cubo de pintura">💉</button>
                        <button class="editor-tool" data-tool="eyedropper" title="Cuentagotas">💧</button>
                        <button class="editor-tool" data-tool="eraser" title="Borrador">🧹</button>
                    </div>
                </div>
                <div class="editor-colors-group">
                    <label>COLOR</label>
                    <div class="editor-color-picker-row">
                        <input type="color" id="editor-color-picker" value="#ff6600">
                        <input type="text" id="editor-color-hex" value="#ff6600" maxlength="7">
                    </div>
                    <div class="editor-swatches" id="editor-swatches">
                        ${['#ff0000','#ff6600','#ffdd00','#00cc44','#0066ff','#8800ff','#ffffff','#888888','#000000'].map(c => `<div class="editor-swatch" style="background:${c}" data-color="${c}"></div>`).join('')}
                    </div>
                </div>
                <div class="editor-brush-size-group">
                    <label>TAMAÑO: <span id="editor-brush-size-label">1</span></label>
                    <input type="range" id="editor-brush-size" min="1" max="8" value="1" step="1">
                </div>
                <div class="editor-layers-group">
                    <label>CAPAS <span style="font-size:9px;color:var(--text2);font-weight:400;">(doble clic para activar)</span></label>
                    <label class="editor-layer-row active-layer" data-layer="inner"><input type="checkbox" id="editor-layer-inner" checked> <span>Inner Layer</span></label>
                    <label class="editor-layer-row" data-layer="outer"><input type="checkbox" id="editor-layer-outer" checked> <span>Outer Layer</span></label>
                </div>
                <div class="editor-isolate-group">
                    <label>AISLAR PARTE</label>
                    <button class="editor-isolate-btn active" data-part="all">Todo</button>
                    <button class="editor-isolate-btn" data-part="head">Cabeza</button>
                    <button class="editor-isolate-btn" data-part="body">Torso</button>
                    <button class="editor-isolate-btn" data-part="leftArm">Brazo I</button>
                    <button class="editor-isolate-btn" data-part="rightArm">Brazo D</button>
                    <button class="editor-isolate-btn" data-part="leftLeg">Pierna I</button>
                    <button class="editor-isolate-btn" data-part="rightLeg">Pierna D</button>
                </div>
            </div>
            <div id="editor-canvas-wrap" class="editor-canvas-wrap"></div>
        </div>`;

    document.getElementById('view-wardrobe').appendChild(editorEl);

    document.querySelectorAll('.editor-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.editor-tool').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (skinEditorInstance) skinEditorInstance.setTool(btn.dataset.tool);
        });
    });

    document.querySelectorAll('.editor-swatch').forEach(el => {
        el.addEventListener('click', () => {
            const color = el.dataset.color;
            document.getElementById('editor-color-picker').value = color;
            document.getElementById('editor-color-hex').value = color;
            if (skinEditorInstance) skinEditorInstance.setColor(color);
        });
    });

    document.getElementById('editor-color-picker').addEventListener('input', (e) => {
        document.getElementById('editor-color-hex').value = e.target.value;
        if (skinEditorInstance) skinEditorInstance.setColor(e.target.value);
    });

    document.getElementById('editor-color-hex').addEventListener('change', (e) => {
        let v = e.target.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(v)) {
            document.getElementById('editor-color-picker').value = v;
            if (skinEditorInstance) skinEditorInstance.setColor(v);
        }
    });

    document.getElementById('editor-brush-size').addEventListener('input', (e) => {
        document.getElementById('editor-brush-size-label').textContent = e.target.value;
        if (skinEditorInstance) skinEditorInstance.setBrushSize(parseInt(e.target.value));
    });

    document.querySelectorAll('.editor-isolate-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.editor-isolate-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (skinEditorInstance) skinEditorInstance.isolatePart(btn.dataset.part);
        });
    });

    document.querySelectorAll('.editor-layer-row').forEach(row => {
        const cb = row.querySelector('input[type="checkbox"]');
        cb.addEventListener('change', (e) => {
            if (skinEditorInstance) skinEditorInstance.toggleLayer(row.dataset.layer, e.target.checked);
        });
        row.addEventListener('dblclick', () => {
            document.querySelectorAll('.editor-layer-row').forEach(r => r.classList.remove('active-layer'));
            row.classList.add('active-layer');
            if (skinEditorInstance) skinEditorInstance.setActiveLayer(row.dataset.layer);
        });
    });

    document.getElementById('editor-import-btn').addEventListener('click', async () => {
        const filePath = await ipcRenderer.invoke('open-skin-dialog');
        if (!filePath) return;
        if (skinEditorInstance) skinEditorInstance.importSkin(filePath);
    });

    document.getElementById('editor-save-btn').addEventListener('click', async () => {
        if (!skinEditorInstance) return;
        await skinEditorInstance.exportSkin();
        renderWardrobe();
    });

    requestAnimationFrame(() => {
        const canvasWrap = document.getElementById('editor-canvas-wrap');
        if (!canvasWrap) return;
        const cfgLocal = ipcRenderer.sendSync('get-config');
        const acc = cfgLocal.accounts.find(a => a.id === cfgLocal.activeAccountId) || cfgLocal.accounts[0];
        const skinPath = acc?.skinPath || null;
        skinEditorInstance = createSkinEditor(canvasWrap, skinPath);
    });
}

window.closeSkinEditor = function() {
    skinEditorActive = false;
    if (skinEditorInstance) { skinEditorInstance.destroy(); skinEditorInstance = null; }
    const editorEl = document.getElementById('skin-editor-root');
    if (editorEl) editorEl.remove();
    const container = document.getElementById('wardrobe-grid');
    const actions = document.querySelector('.wardrobe-actions');
    if (container) container.style.display = 'grid';
    if (actions) actions.style.display = 'flex';
    renderWardrobe();
    requestGC();
};

window.editorUndo = () => { if (skinEditorInstance) skinEditorInstance.undo(); };
window.editorRedo = () => { if (skinEditorInstance) skinEditorInstance.redo(); };

// Initialize unread badge on load
const initialUnread = Object.values(socialState.unreadCounts || {}).reduce((a, b) => a + b, 0);
updateSocialBadge(initialUnread);
