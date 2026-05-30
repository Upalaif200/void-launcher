'use strict';
/* ═══════════════════════════════════════════════
   VOID LAUNCHER — RENDERER v1.1
   ═══════════════════════════════════════════════ */
const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
let skinview3d;
try { skinview3d = require('skinview3d'); } catch (e) { console.warn('[RENDERER] skinview3d no disponible:', e.message); }
const os = require('os');

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

ipcRenderer.on('update-available', (_, info) => {
    showUpdateNotification(info.version);
});

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

ipcRenderer.on('update-downloaded', () => {
    updateProgressFill.style.width = '100%';
    updateProgressText.textContent = 'Descarga completada. Instalando...';
    setTimeout(() => {
        ipcRenderer.send('install-update');
    }, 500);
});

ipcRenderer.on('mod-update-progress', (_, progress) => {
    showModUpdateProgress(progress);
});

ipcRenderer.on('mod-update-status', (_, status) => {
    showModUpdateStatus(status);
});

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
// ROUTER DE VISTAS
// ─────────────────────────────────────────────
function navigate(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Acciones al entrar en cada vista
    if (viewId === 'view-main') refreshMainView();
    if (viewId === 'view-accounts') renderAccountsList();
    if (viewId === 'view-profiles') { renderProfilesList(); closeEditPanel(); }
    if (viewId === 'view-mods') refreshModsView();
    if (viewId === 'view-install') initInstallView();
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

    document.getElementById('main-account-name').textContent = acc?.username || 'Sin cuenta';
    document.getElementById('main-profile-name').textContent = prof?.name || 'Sin perfil';
    const iconEl = document.getElementById('main-profile-icon');
    if (prof?.icon) { iconEl.textContent = prof.icon; } else { iconEl.innerHTML = icon('gamepad'); }
    document.getElementById('main-profile-version').textContent = prof?.versionId || '─';

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
// VISTA: CUENTAS
// ─────────────────────────────────────────────
function renderAccountsList() {
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
                ${isActive ? '<span class="acct-badge">ACTIVA</span>' : ''}
            </div>
            <div class="acct-actions">
                ${!isActive ? `<button class="secondary-btn" onclick="selectAccount('${acc.id}')">Activar</button>` : ''}
                <button class="secondary-btn uninstall-btn" onclick="removeAccount('${acc.id}')">${icon('trash')}</button>
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
    renderAccountsList();
    refreshMainView();
});

window.selectAccount = (id) => {
    ipcRenderer.sendSync('set-active-account', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderAccountsList();
    refreshMainView();
    reloadSkin();
};
window.removeAccount = (id) => {
    if (cfg.accounts.length <= 1) { alert('Debes tener al menos una cuenta.'); return; }
    if (!confirm('¿Eliminar esta cuenta?')) return;
    ipcRenderer.sendSync('remove-account', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderAccountsList();
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

// Navigate to client view - refresh modules + cosmetics on enter
const origNavigate = navigate;
navigate = function(viewId) {
    origNavigate(viewId);
    if (viewId === 'view-client') {
        refreshClientModules();
        loadCosmeticsState();
    }
};

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

// ── Auto-init when settings view is shown ──
const origNavigate2 = navigate;
navigate = function(viewId) {
    origNavigate2(viewId);
    if (viewId === 'view-settings') {
        loadTheme();
        renderTypoSettings();
        renderColorSettings();
    }
};

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

        // Render mini skin preview
        const canvas = card.querySelector('canvas');
        if (canvas && fs.existsSync(skin.path)) {
            try {
                const miniViewer = new skinview3d.SkinViewer({
                    canvas,
                    width: 64, height: 64,
                    skin: `file://${skin.path}`
                });
                miniViewer.animation = new skinview3d.IdleAnimation();
                miniViewer.controls.enableZoom = false;
                miniViewer.controls.enableRotate = false;
                // Store reference for cleanup
                card._miniViewer = miniViewer;
            } catch (e) {
                console.error('[WARDROBE] Mini preview error:', e);
            }
        }
    });
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
        if (!acc) { showToast('No hay cuenta activa', 'error'); return; }
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
// SOCIAL — LAN DISCOVERY
// ─────────────────────────────────────────────
function renderSocialPeers(peers) {
    const list = document.getElementById('social-peer-list');
    if (!list) return;
    if (!peers || !peers.length) {
        list.innerHTML = '<div class="empty-state">No se encontraron jugadores en la red local.</div>';
        updateSocialBadge(0);
        return;
    }
    list.innerHTML = '';
    peers.forEach(peer => {
        const card = document.createElement('div');
        card.className = 'social-peer-card';
        const timeAgo = Math.floor((Date.now() - peer.timestamp) / 1000);
        const timeStr = timeAgo < 60 ? 'ahora' : `${Math.floor(timeAgo / 60)}m`;
        card.innerHTML = `
            <div class="social-peer-avatar">${icon('user')}</div>
            <div class="social-peer-info">
                <div class="social-peer-name">${escHtml(peer.username)}</div>
                <div class="social-peer-meta">${escHtml(peer.version)} · ${peer.address}</div>
            </div>
            <div class="social-peer-time">${timeStr}</div>`;
        list.appendChild(card);
    });
    updateSocialBadge(peers.length);
}

function updateSocialBadge(count) {
    const badge = document.getElementById('social-badge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

ipcRenderer.on('social-peers', (_, peers) => {
    renderSocialPeers(peers);
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

// ─────────────────────────────────────────────
// OVERRIDE NAVIGATE FOR NEW VIEWS
// ─────────────────────────────────────────────
const origNavigate3 = navigate;
navigate = function(viewId) {
    origNavigate3(viewId);
    if (viewId === 'view-wardrobe') renderWardrobe();
    if (viewId === 'view-social') {
        renderSocialPeers(ipcRenderer.sendSync('get-social-peers'));
    }
    if (viewId === 'view-settings') {
        loadBehaviorSettings();
    }
};
